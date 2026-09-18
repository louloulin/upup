/**
 * End-to-end ACP protocol tests against an in-memory transport.
 *
 * These drive the real server over `PassThrough` streams and a fake session,
 * so the full request → notification → response sequence is asserted without
 * spawning a process, needing credentials, or touching the network.
 */
import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'bun:test';

import { createAcpServer, type AcpSessionFactoryPort, type AcpSessionPort } from './server';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

/** A session whose prompt emits a scripted event sequence. */
function fakeSession(options: {
  readonly id: string;
  readonly onPrompt?: (emit: (event: UpUpAgentEvent) => void) => void;
}): AcpSessionPort & { readonly emitted: UpUpAgentEvent[]; readonly aborted: () => boolean; readonly disposed: () => boolean } {
  const listeners = new Set<(event: UpUpAgentEvent) => void>();
  const emitted: UpUpAgentEvent[] = [];
  let aborted = false;
  let disposed = false;
  return {
    id: options.id,
    emitted,
    aborted: () => aborted,
    disposed: () => disposed,
    async prompt() {
      const emit = (event: UpUpAgentEvent): void => {
        emitted.push(event);
        for (const listener of listeners) listener(event);
      };
      options.onPrompt?.(emit);
    },
    async abort() { aborted = true; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}

interface Harness {
  readonly lines: unknown[];
  /** Send a raw line (used for malformed-JSON coverage). */
  write(line: string): void;
  /** Send a JSON-RPC frame. */
  send(frame: unknown): void;
  /** Wait until a frame matching `predicate` has been received. */
  waitFor(predicate: (frame: Record<string, unknown>) => boolean, label: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

async function withServer(
  factory: AcpSessionFactoryPort,
  run: (harness: Harness) => Promise<void>,
): Promise<void> {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: unknown[] = [];
  let buffer = '';
  output.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        lines.push({ unparseable: line });
      }
    }
  });

  const server = createAcpServer({ input, output, sessionFactory: factory });
  const harness: Harness = {
    lines,
    write(line) { input.write(`${line}\n`); },
    send(frame) { input.write(`${JSON.stringify(frame)}\n`); },
    async waitFor(predicate, label) {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const found = lines.find((line) => line && typeof line === 'object' && predicate(line as Record<string, unknown>));
        if (found) return found as Record<string, unknown>;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`timed out waiting for ${label}; got ${JSON.stringify(lines)}`);
    },
    async close() {
      input.end();
      await server.done;
    },
  };

  try {
    await run(harness);
  } finally {
    input.end();
    await server.done;
  }
}

describe('ACP server protocol', () => {
  test('initialize returns protocol version and capabilities', async () => {
    await withServer({ createSession: async () => fakeSession({ id: 'unused' }) }, async (harness) => {
      harness.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
      const frame = await harness.waitFor((f) => f.id === 1, 'initialize response');
      const result = frame.result as { protocolVersion: number; agentCapabilities: { loadSession: boolean } };
      expect(result.protocolVersion).toBe(1);
      expect(result.agentCapabilities.loadSession).toBe(true);
    });
  });

  test('session/new returns a sessionId and a prompt streams session/update then stopReason', async () => {
    const session = fakeSession({
      id: 'acp-session-1',
      onPrompt: (emit) => {
        emit({ type: 'thinking', sessionId: 'acp-session-1', text: 'reading filings' });
        emit({ type: 'tool_start', sessionId: 'acp-session-1', toolName: 'financial_search', toolCallId: 't1', input: {} });
        emit({ type: 'tool_end', sessionId: 'acp-session-1', toolName: 'financial_search', toolCallId: 't1' });
        emit({ type: 'text_delta', sessionId: 'acp-session-1', delta: '贵州茅台' });
        emit({ type: 'turn_end', sessionId: 'acp-session-1' });
      },
    });

    await withServer({ createSession: async () => session }, async (harness) => {
      harness.send({ jsonrpc: '2.0', id: 1, method: 'session/new', params: { cwd: '/repo' } });
      const created = await harness.waitFor((f) => f.id === 1, 'session/new response');
      expect((created.result as { sessionId: string }).sessionId).toBe('acp-session-1');

      harness.send({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { sessionId: 'acp-session-1', prompt: '分析 600519.SH' } });
      const prompt = await harness.waitFor((f) => f.id === 2, 'session/prompt response');
      expect(prompt.result).toEqual({ stopReason: 'end_turn' });

      // Notifications must be emitted as `session/update`, scoped to the
      // session, with ACP payload shapes.
      const updates = harness.lines
        .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object' && (line as { method?: string }).method === 'session/update')
        .map((line) => (line.params as { sessionId: string; update: Record<string, unknown> }));
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.every((u) => u.sessionId === 'acp-session-1')).toBe(true);
      expect(updates.map((u) => u.update.sessionUpdate)).toEqual([
        'agent_thought_chunk', 'tool_call', 'tool_call_update', 'agent_message_chunk',
      ]);
    });
  });

  test('session/prompt rejects an unknown session', async () => {
    await withServer({ createSession: async () => fakeSession({ id: 's' }) }, async (harness) => {
      harness.send({ jsonrpc: '2.0', id: 7, method: 'session/prompt', params: { sessionId: 'nope', prompt: 'hi' } });
      const frame = await harness.waitFor((f) => f.id === 7, 'error response');
      expect((frame.error as { code: number }).code).toBe(-32001);
    });
  });

  test('session/prompt rejects an empty prompt', async () => {
    await withServer({ createSession: async () => fakeSession({ id: 's1' }) }, async (harness) => {
      harness.send({ jsonrpc: '2.0', id: 1, method: 'session/new', params: {} });
      await harness.waitFor((f) => f.id === 1, 'session/new');
      harness.send({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { sessionId: 's1', prompt: '' } });
      const frame = await harness.waitFor((f) => f.id === 2, 'empty prompt error');
      expect((frame.error as { code: number }).code).toBe(-32602);
    });
  });

  test('unknown methods get JSON-RPC method-not-found', async () => {
    await withServer({ createSession: async () => fakeSession({ id: 's' }) }, async (harness) => {
      harness.send({ jsonrpc: '2.0', id: 3, method: 'session/teleport', params: {} });
      const frame = await harness.waitFor((f) => f.id === 3, 'method not found');
      expect((frame.error as { code: number }).code).toBe(-32601);
    });
  });

  test('malformed JSON yields a parse error and the server keeps serving', async () => {
    await withServer({ createSession: async () => fakeSession({ id: 's' }) }, async (harness) => {
      harness.write('not json {{{');
      const parseError = await harness.waitFor((f) => (f.error as { code?: number })?.code === -32700, 'parse error');
      expect(parseError.id).toBeNull();
      // Still alive: a following request is answered normally.
      harness.send({ jsonrpc: '2.0', id: 9, method: 'initialize', params: {} });
      await harness.waitFor((f) => f.id === 9, 'post-error response');
    });
  });

  test('session/cancel aborts the in-flight prompt and reports "cancelled"', async () => {
    const listeners = new Set<(event: UpUpAgentEvent) => void>();
    let releasePrompt: () => void = () => {};
    const session: AcpSessionPort = {
      id: 'slow',
      // Never resolves until aborted, mimicking a long provider turn.
      prompt: (_input, options) => new Promise<void>((resolve) => {
        releasePrompt = resolve;
        options?.signal?.addEventListener('abort', () => resolve(), { once: true });
      }),
      abort: async () => {},
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      dispose: () => listeners.clear(),
    };

    await withServer({ createSession: async () => session }, async (harness) => {
      harness.send({ jsonrpc: '2.0', id: 1, method: 'session/new', params: {} });
      await harness.waitFor((f) => f.id === 1, 'session/new');

      harness.send({ jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { sessionId: 'slow', prompt: 'long task' } });
      harness.send({ jsonrpc: '2.0', id: 3, method: 'session/cancel', params: { sessionId: 'slow' } });

      const prompt = await harness.waitFor((f) => f.id === 2, 'cancelled prompt');
      expect(prompt.result).toEqual({ stopReason: 'cancelled' });
      const cancel = await harness.waitFor((f) => f.id === 3, 'cancel response');
      expect(cancel.error).toBeUndefined();
      releasePrompt();
    });
  });

  test('closing the input disposes every session', async () => {
    const session = fakeSession({ id: 'dispose-me' });
    const input = new PassThrough();
    const output = new PassThrough();
    const server = createAcpServer({ input, output, sessionFactory: { createSession: async () => session } });
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session/new', params: {} })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    input.end();
    await server.done;
    expect(session.disposed()).toBe(true);
  });
});
