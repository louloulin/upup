/**
 * UpUp MCP server — the stdio transport wrapper around `UPUP_MCP_TOOLS`.
 *
 * Why stdio first:
 *   TradingAgents / Claude Code / Codex all consume MCP servers over stdio
 *   (`npx upup-mcp serve` is the typical invocation). SSE and streamable-HTTP
 *   transports are trivially added later by wrapping the same `Server` with
 *   `SSEServerTransport` / `StreamableHTTPServerTransport`; the tool surface
 *   is identical.
 *
 * Why a single class:
 *   The MCP SDK's `Server` class already separates `tools/list` from
 *   `tools/call`. Wrapping it in `UpUpMcpServer` only adds the UpUp-specific
 *   bits: namespace in `serverInfo`, capability advertisement, and `runStdio`
 *   which is what `upup mcp serve` actually calls.
 *
 * Read-only by default:
 *   The tool list intentionally excludes financial write operations
 *   (`place_trade_order`, `config_set`, …). MCP clients that want those
 *   have to talk to Pi through the RPC / SDK paths, where Pi's policy
 *   layer can apply approval. This is the same posture as TradingAgents.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport, type StdioServerTransport as StdioServerTransportType } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import {
  UPUP_MCP_TOOLS,
  findUpUpMcpTool,
  type UpUpMcpToolSpec,
} from './tools';
import {
  buildAuthGate,
  connectSseTransport,
  handleStatelessStreamableHttp,
  type HttpTransportOptions,
} from './http-transport';

export interface UpUpMcpServerOptions {
  /** Override the server name advertised in `initialize`. */
  readonly name?: string;
  /** Override the version advertised in `initialize`. */
  readonly version?: string;
}

const DEFAULT_NAME = 'upup-finance-mcp';
const DEFAULT_VERSION = '0.1.0';

/**
 * Wraps an `@modelcontextprotocol/sdk` Server with UpUp's tool surface.
 * Construction is side-effect-free; the host calls `runStdio()` to start
 * serving on stdin/stdout.
 */
export class UpUpMcpServer {
  private readonly server: Server;
  private readonly toolByName: Map<string, UpUpMcpToolSpec>;
  private transport: { close(): Promise<void> } | null = null;

  constructor(options: UpUpMcpServerOptions = {}) {
    this.server = new Server(
      { name: options.name ?? DEFAULT_NAME, version: options.version ?? DEFAULT_VERSION },
      {
        capabilities: {
          tools: {},
        },
        instructions: [
          'UpUp finance MCP server — exposes a curated, read-only subset of',
          'UpUp finance / market-data / research tools under the',
          '`upup_finance__<tool>` namespace.',
          '',
          'Every tool wraps an existing UpUp function (no business logic is',
          're-implemented here). For write operations (orders, config, file',
          'writes) use the Pi RPC / SDK paths so the Pi policy layer can apply',
          'approval.',
        ].join('\n'),
      },
    );

    this.toolByName = new Map(UPUP_MCP_TOOLS.map((tool) => [tool.name, tool]));

    // `tools/list` — return the registered tool descriptors. The MCP SDK
    // expects `inputSchema` to be a JSON-Schema-shaped object; that is what
    // `UpUpMcpToolSpec.inputSchema` already is.
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: UPUP_MCP_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }));

    // `tools/call` — look up the tool by name and execute it. Unknown tools
    // produce an MCP `MethodNotFound`-style error response (returned as
    // `{ isError: true }`) rather than throwing, because MCP clients prefer
    // structured errors over connection drops.
    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const params = request.params as { name?: string; arguments?: Record<string, unknown> };
      const name = typeof params.name === 'string' ? params.name : '';
      const tool = findUpUpMcpTool(name);
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        } satisfies CallToolResult;
      }
      return tool.execute(params.arguments ?? {}, extra.signal);
    });
  }

  /** Get the wrapped SDK Server (useful for tests that mock the SDK layer). */
  rawServer(): Server {
    return this.server;
  }

  /** Number of tools currently registered (used by tests + report). */
  toolCount(): number {
    return this.toolByName.size;
  }

  /** Connect to stdio and run forever until stdin closes / `close()` is called. */
  async runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    this.transport = transport as unknown as { close(): Promise<void> };
    await this.server.connect(transport);
  }

  /**
   * Handle a single HTTP request as an MCP transport.
   *
   * UpUp runs the MCP surface in **stateless mode** (each request gets
   * its own transport + server instance, torn down on response close).
   * That avoids the bookkeeping cost of session ids when the tool
   * surface is read-only and identical for every client. Stateful mode
   * (per-session transports) is easy to add later by switching
   * `handleStatelessStreamableHttp` for a session-id routing layer.
   */
  async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    options: HttpTransportOptions = {},
  ): Promise<void> {
    const gate = buildAuthGate(options.authToken);
    if (!gate(req, res)) return;
    await handleStatelessStreamableHttp(() => this.server, req, res, options);
  }

  /**
   * Bind the wrapped server to a long-lived HTTP listener. Returns the
   * Node http.Server so callers can wire it into their own lifecycle
   * (signal handling, custom port mapping, …).
   */
  async runHttpServer(
    port: number,
    host: string = '127.0.0.1',
    options: HttpTransportOptions & { readonly signal?: AbortSignal } = {},
  ): Promise<{ close(): Promise<void>; port: number }> {
    const http = await import('node:http');
    const httpServer = http.createServer((req, res) => {
      void this.handleHttpRequest(req, res, options).catch((error: unknown) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'internal', detail: String(error) }));
          return;
        }
        // If headers are already flushed we cannot write a structured error;
        // close the socket so the client sees a clean failure.
        res.destroy(error instanceof Error ? error : undefined);
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
    const actualPort = (httpServer.address() as { port: number } | null)?.port ?? port;
    process.stderr.write(`[upup-mcp] listening on http://${host}:${actualPort}/ (streamable-http)\n`);
    options.signal?.addEventListener('abort', () => { void close(); });
    const close = async (): Promise<void> => {
      await this.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    };
    return { close, port: actualPort };
  }

  /** Tear down the transport and server (used by the CLI on SIGINT / SIGTERM). */
  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    await this.server.close();
  }
}

/** Convenience factory — `new UpUpMcpServer()` is also fine. */
export function createUpUpMcpServer(options: UpUpMcpServerOptions = {}): UpUpMcpServer {
  return new UpUpMcpServer(options);
}

export {
  UPUP_MCP_TOOLS,
  UPUP_MCP_TOOL_NAMES,
  findUpUpMcpTool,
  type UpUpMcpToolSpec,
} from './tools';
