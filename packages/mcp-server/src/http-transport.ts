/**
 * UpUp MCP server — HTTP / SSE / streamable-HTTP transport wrappers.
 *
 * The MCP SDK ships three transports:
 *   - stdio (`StdioServerTransport`)        — local subprocess, used by `upup-mcp serve`
 *   - SSE (`SSEServerTransport`)            — deprecated but still functional
 *   - streamable HTTP (`StreamableHTTPServerTransport`) — preferred modern transport
 *
 * UpUp exposes all three so the same `UpUpMcpServer` instance can serve
 * TradingAgents / Claude Code / Codex / a remote MCP client / a browser
 * extension without changing the tool surface.
 *
 * Why wrap rather than re-implement:
 *   The MCP SDK already handles JSON-RPC framing, session id allocation,
 *   protocol version negotiation, and DNS-rebinding protection. UpUp's
 *   HTTP transport is a thin `createNodeHttpRequestHandler` wrapper that
 *   dispatches every incoming POST to the SDK transport and pipes the
 *   response back to the HTTP response object.
 *
 * Auth:
 *   `UPUP_MCP_TOKEN` (when set) requires every request to carry the same
 *   token in `Authorization: Bearer <token>`. Missing tokens yield 401.
 *   When unset, the server accepts anonymous connections (read-only
 *   tools only, no credential exposure — the contract is unchanged from
 *   stdio mode).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface HttpTransportOptions {
  /** Optional auth token. When set, every request must carry `Authorization: Bearer <token>`. */
  readonly authToken?: string;
  /** Optional list of allowed origins (defaults to `*`). */
  readonly allowedOrigins?: readonly string[];
}

/** Build a simple auth gate that reads `Authorization: Bearer <token>` from the request headers. */
export function buildAuthGate(token: string | undefined): (req: IncomingMessage, res: ServerResponse) => boolean {
  if (!token) return () => true;
  return (req, res): boolean => {
    const header = req.headers.authorization;
    if (header === `Bearer ${token}`) return true;
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized', hint: 'set Authorization: Bearer <UPUP_MCP_TOKEN>' }));
    return false;
  };
}

/**
 * Connect the wrapped MCP server to a single SSE request/response pair.
 * Returns the transport so the caller can `await transport.close()` on
 * session end. CORS preflight (OPTIONS) is handled with a permissive
 * default; tighten via `HttpTransportOptions.allowedOrigins` if needed.
 */
export async function connectSseTransport(
  server: Server,
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpTransportOptions = {},
): Promise<SSEServerTransport> {
  const allowed = options.allowedOrigins ?? ['*'];
  res.setHeader('access-control-allow-origin', allowed.join(','));
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return Promise.reject(new Error('OPTIONS preflight handled; no transport created.'));
  }
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport as unknown as Transport);
  return transport;
}

/**
 * Handle one streamable-HTTP request. The MCP SDK's stateless transport
 * pattern is used: each request gets its own transport + server, the
 * request is served, then both are torn down on response close. No
 * session id is allocated (the SDK's `sessionIdGenerator: undefined`
 * keeps it stateless) which is the recommended pattern for MCP servers
 * that expose a fixed tool catalog and don't need per-session state.
 */
export async function handleStatelessStreamableHttp(
  serverFactory: () => Server,
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpTransportOptions = {},
): Promise<void> {
  const allowed = options.allowedOrigins ?? ['*'];
  res.setHeader('access-control-allow-origin', allowed.join(','));
  res.setHeader('access-control-allow-headers', 'content-type, authorization, mcp-session-id');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'GET' || req.method === 'DELETE') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (stateless mode uses POST only).' },
      id: null,
    }));
    return;
  }
  const server = serverFactory();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  try {
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, (req as unknown as { body?: unknown }).body);
  } finally {
    res.on('close', () => {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    });
  }
}
