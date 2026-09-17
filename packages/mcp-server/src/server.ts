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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
  private transport: StdioServerTransport | null = null;

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
    this.transport = transport;
    await this.server.connect(transport);
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
