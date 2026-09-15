import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createStdioServer, type StdioRuntimePort } from './server';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

/**
 * Drives the real stdio server against in-memory streams so we can assert on
 * the exact JSON-RPC wire format for both the ACP and UpUp-native paths.
 */
async function withServer<T>(
  run: (feed: (msg: unknown) => void, lines: unknown[]) => Promise<T>,
  options?: { acp?: boolean },
): Promise<{ result: T; lines: unknown[] }> {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: unknown[] = [];
  let buffer = '';
  output.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim().length === 0) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        lines.push({ unparseable: line });
      }
    }
  });

  const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
  const originalStdout = Object.getOwnPropertyDescriptor(process, 'stdout');
  const originalWrite = process.stdout.write.bind(process.stdout);
  Object.defineProperty(process, 'stdin', { value: input, configurable: true, writable: true });
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    const server = createStdioServer(runtime, options);
    server.start();
    const result = await run(
      (msg) => input.write(`${JSON.stringify(msg)}\n`),
      lines,
    );
    server.stop();
    await new Promise((r) => setTimeout(r, 5));
    return { result, lines };
  } finally {
    process.stdout.write = originalWrite;
    if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin);
    if (originalStdout) Object.defineProperty(process, 'stdout', originalStdout);
  }
}

const runtime: StdioRuntimePort = {
  streamPiEvents: async function* () {
    yield { type: 'text_delta', delta: 'hel' } as unknown as UpUpAgentEvent;
    yield { type: 'text_delta', delta: 'lo' } as unknown as UpUpAgentEvent;
    yield { type: 'run_end', iterations: 1, totalTime: 4, answer: 'hello' } as unknown as UpUpAgentEvent;
  },
  sessionService: {
    create: async () => ({ id: 'sess-1', state: 'idle', createdAt: new Date().toISOString() }),
    resume: async () => ({ summary: { id: 'sess-1', state: 'idle' } }),
    messages: async () => [],
    run: async (_sessionId: string, _prompt: string, options?: { onEvent?: (event: unknown) => void }) => {
      options?.onEvent?.({ type: 'text_delta', delta: 'hi' });
      options?.onEvent?.({ type: 'run_end', iterations: 1, totalTime: 1, answer: 'hi' });
      return 'hi';
    },
  } as unknown as StdioRuntimePort['sessionService'],
};

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function notifications(lines: unknown[], method: string): Array<Record<string, unknown>> {
  return lines
    .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object')
    .filter((line) => (line as { method?: string }).method === method)
    .map((line) => (line as { params: Record<string, unknown> }).params);
}

function response(lines: unknown[], id: number): Record<string, unknown> | undefined {
  const hit = lines
    .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object')
    .find((line) => (line as { id?: number }).id === id);
  return hit ? ((hit as { result?: Record<string, unknown> }).result ?? hit) : undefined;
}

describe('@upup/pi-stdio — ACP server integration', () => {
  test('ACP initialize returns protocolVersion + agentCapabilities', async () => {
    const { lines } = await withServer(
      async (feed) => {
        feed({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        await settle(20);
      },
      { acp: true },
    );
    const result = response(lines, 1) as { protocolVersion?: number; agentCapabilities?: { loadSession?: boolean } } | undefined;
    expect(result?.protocolVersion).toBe(1);
    expect(result?.agentCapabilities?.loadSession).toBe(true);
  });

  test('ACP session/prompt emits session/update notifications + stopReason', async () => {
    const { lines } = await withServer(
      async (feed) => {
        feed({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        feed({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { sessionId: 'sess-1', prompt: [{ type: 'text', text: 'hi' }] } });
        await settle(60);
      },
      { acp: true },
    );
    const updates = notifications(lines, 'session/update');
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      expect(typeof (update as { sessionUpdate?: unknown }).sessionUpdate).toBe('string');
    }
    const result = response(lines, 2) as { stopReason?: string } | undefined;
    expect(result?.stopReason).toBe('end_turn');
  });

  test('ACP mode does not leak UpUp-native "event" notifications', async () => {
    const { lines } = await withServer(
      async (feed) => {
        feed({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        feed({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { prompt: 'hi' } });
        await settle(60);
      },
      { acp: true },
    );
    expect(notifications(lines, 'event').length).toBe(0);
  });

  test('ACP session/new returns ACP-shaped sessionId + modes', async () => {
    const { lines } = await withServer(
      async (feed) => {
        feed({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        feed({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: '/tmp' } });
        await settle(30);
      },
      { acp: true },
    );
    const result = response(lines, 2) as { sessionId?: string; modes?: unknown } | undefined;
    expect(result?.sessionId).toBe('sess-1');
    expect(result?.modes).toBeDefined();
  });

  test('auto-detects ACP from the first method name (no --acp flag)', async () => {
    const { lines } = await withServer(async (feed) => {
      feed({ jsonrpc: '2.0', id: 1, method: 'session/new', params: { cwd: '/tmp' } });
      await settle(30);
    });
    const result = response(lines, 1) as { sessionId?: string } | undefined;
    expect(result?.sessionId).toBe('sess-1');
  });

  test('UpUp-native mode keeps the "event" notification channel', async () => {
    const { lines } = await withServer(async (feed) => {
      feed({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
      feed({ jsonrpc: '2.0', id: 2, method: 'stream', params: { prompt: 'hi' } });
      await settle(60);
    });
    expect(notifications(lines, 'event').length).toBeGreaterThan(0);
    expect(notifications(lines, 'session/update').length).toBe(0);
  });
});
