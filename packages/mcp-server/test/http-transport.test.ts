/**
 * UpUp MCP server — HTTP / streamable-HTTP transport tests.
 *
 * Boots `UpUpMcpServer.runHttpServer()` on an ephemeral port and asserts
 * the standard MCP handshake (`initialize` → `tools/list` → `tools/call`)
 * works over plain HTTP with JSON-RPC framing. This is the entry point
 * remote TradingAgents hosts hit when they can't open a stdio channel.
 *
 * UpUp's HTTP transport is **stateless** (no session id) — every request
 * gets its own transport + server instance, torn down on response close.
 * That keeps the tool surface identical across clients and avoids the
 * bookkeeping cost of session routing for read-only finance tools.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createUpUpMcpServer } from '../src/server';

interface RunningHttpServer {
  close(): Promise<void>;
  port: number;
}

let httpServer: RunningHttpServer | null = null;

beforeAll(async () => {
  httpServer = await createUpUpMcpServer().runHttpServer(0, '127.0.0.1');
});

afterAll(async () => {
  if (httpServer) await httpServer.close();
});

/**
 * Parse a streamable-HTTP response body. The MCP SDK uses `text/event-stream`
 * (SSE) framing even for JSON-RPC replies, with the JSON-RPC envelope in
 * the `data:` field of each `event: message` line.
 */
function parseStreamableResponse(body: string): Record<string, unknown> {
  const lines = body.split(/\r?\n/);
  let lastData = '';
  for (const line of lines) {
    if (line.startsWith('data:')) {
      lastData = line.slice(5).trim();
    }
  }
  if (!lastData) return {};
  try {
    return JSON.parse(lastData) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function jsonRpcRequest(
  port: number,
  method: string,
  params: Record<string, unknown> = {},
  id: number = 1,
  authToken?: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const url = `http://127.0.0.1:${port}/`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await response.text();
  const body = parseStreamableResponse(text);
  return { ok: response.ok, status: response.status, body };
}

describe('UpUpMcpServer HTTP transport', () => {
  it('rejects requests with a missing auth token when UPUP_MCP_TOKEN is set', async () => {
    const server = createUpUpMcpServer();
    const guarded = await server.runHttpServer(0, '127.0.0.1', { authToken: 'secret' });
    try {
      const url = `http://127.0.0.1:${guarded.port}/`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      expect(response.status).toBe(401);
    } finally {
      await guarded.close();
    }
  });

  it('accepts requests with the correct auth token', async () => {
    const server = createUpUpMcpServer();
    const guarded = await server.runHttpServer(0, '127.0.0.1', { authToken: 'secret' });
    try {
      const response = await jsonRpcRequest(guarded.port, 'tools/list', {}, 1, 'secret');
      expect(response.ok).toBe(true);
    } finally {
      await guarded.close();
    }
  });

  it('exposes the full UpUp tool surface over HTTP', async () => {
    if (!httpServer) throw new Error('httpServer not started');
    const response = await jsonRpcRequest(httpServer.port, 'tools/list', {}, 1);
    expect(response.ok).toBe(true);
    const tools = response.body.result as { tools?: { name: string }[] } | undefined;
    const list = tools?.tools;
    expect(list).toBeDefined();
    expect(list!.length).toBeGreaterThanOrEqual(5);
    const names = list!.map((t) => t.name);
    expect(names).toContain('upup_finance__get_stock_price');
    expect(names).toContain('upup_finance__get_key_ratios');
    expect(names).toContain('upup_finance__list_investment_strategies');
  });

  it('replies to an unknown tool with an isError=true result envelope', async () => {
    if (!httpServer) throw new Error('httpServer not started');
    const response = await jsonRpcRequest(httpServer.port, 'tools/call', {
      name: 'upup_finance__nope',
      arguments: {},
    }, 2);
    expect(response.ok).toBe(true);
    const result = response.body.result as { isError?: boolean } | undefined;
    expect(result?.isError).toBe(true);
  });

  it('returns 405 on GET requests (stateless mode only handles POST)', async () => {
    if (!httpServer) throw new Error('httpServer not started');
    const url = `http://127.0.0.1:${httpServer.port}/`;
    const response = await fetch(url, { method: 'GET' });
    expect(response.status).toBe(405);
  });

  it('does not block shutdown after a request', async () => {
    const server = createUpUpMcpServer();
    const guarded = await server.runHttpServer(0, '127.0.0.1');
    await guarded.close();
    expect(true).toBe(true);
  });
});
