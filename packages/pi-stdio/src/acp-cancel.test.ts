import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createStdioServer, type StdioRuntimePort } from './server';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

/**
 * Drives the real stdio server against in-memory streams so we can assert the
 * exact JSON-RPC shape that ACP clients see vs UpUp-native clients for the
 * `cancel` request. Phase D.2 reconcile: ACP `session/cancel` must answer
 * `{ acknowledged: boolean }` (Zed / Neovim-plugin shape), not the legacy
 * `{ cancelled: boolean, runId }` UpUp-native shape.
 */

function stubRuntime(): StdioRuntimePort {
  // Cancellation has no LLM dependency — the runtime just needs to exist.
  return {
    streamPiEvents: async function* (): AsyncGenerator<UpUpAgentEvent> {
      // Yield nothing; we never call this in cancel tests.
      if (false as boolean) yield { type: 'noop' } as unknown as UpUpAgentEvent;
    },
    sessionService: {
      list: async () => [],
      get: async () => undefined,
      create: async () => ({ id: 's1' }),
      remove: async () => undefined,
      resume: async () => ({ id: 's1' }),
    } as unknown as PiSessionService,
  } as StdioRuntimePort;
}

type JsonRpc = { jsonrpc: '2.0'; id?: number; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string } };

async function withServer<T>(
  run: (send: (msg: JsonRpc) => void) => Promise<T>,
  options: { acp?: boolean } = {},
): Promise<{ result: T; lines: JsonRpc[] }> {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: JsonRpc[] = [];
  let buffer = '';
  output.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim().length === 0) continue;
      try { lines.push(JSON.parse(line)); } catch { /* ignore */ }
    }
  });

  const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
  const originalWrite = process.stdout.write.bind(process.stdout);
  Object.defineProperty(process, 'stdin', { value: input, configurable: true, writable: true });
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    const server = createStdioServer(stubRuntime(), options);
    server.start();
    const result = await run((msg) => input.write(`${JSON.stringify(msg)}\n`));
    // Give the readline handler a tick to process the last line.
    await new Promise((r) => setTimeout(r, 30));
    server.stop();
    await new Promise((r) => setTimeout(r, 10));
    return { result, lines };
  } finally {
    process.stdout.write = originalWrite;
    if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin);
  }
}

import type { PiSessionService } from '@upup/pi-session';

describe('@upup/pi-stdio — cancel wire shape', () => {
  test('ACP mode: cancel without active run returns { acknowledged: false }', async () => {
    const { lines } = await withServer(async (send) => {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } });
      send({ jsonrpc: '2.0', id: 2, method: 'session/cancel', params: {} });
    }, { acp: true });
    const cancel = lines.find((l) => l.id === 2);
    expect(cancel).toBeDefined();
    expect(cancel?.result).toBeDefined();
    expect(cancel?.result).toEqual({ acknowledged: false });
    expect((cancel?.result as Record<string, unknown>).cancelled).toBeUndefined();
  });

  test('UpUp-native mode: cancel without active run returns { cancelled: false }', async () => {
    const { lines } = await withServer(async (send) => {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
      send({ jsonrpc: '2.0', id: 2, method: 'cancel', params: {} });
    }, { acp: false });
    const cancel = lines.find((l) => l.id === 2);
    expect(cancel).toBeDefined();
    expect(cancel?.result).toBeDefined();
    expect(cancel?.result).toEqual({ cancelled: false });
    expect((cancel?.result as Record<string, unknown>).acknowledged).toBeUndefined();
  });
});
