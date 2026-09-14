/**
 * @upup/pi-event-adapter contract tests.
 *
 * These tests pin:
 *   - Every Pi canonical event type has a deterministic legacy/server
 *     mapping (or an explicit decision that it has none).
 *   - The mapping functions preserve the same field semantics as the four
 *     pre-Phase-2 inline adapters in `src/runtime/pi/event-stream.ts`,
 *     `src/gateway/agent-runner.ts`, and `src/stdio/server.ts`.
 *   - The async adapter streams consume both sync and async iterables.
 *   - The contract version matches `@upup/pi-runtime`.
 */

import { describe, expect, test } from 'bun:test';
import { PI_EVENTS_CONTRACT } from '@upup/pi-runtime';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import {
  PI_EVENT_ADAPTER_CONTRACT,
  adaptPiEventsToLegacy,
  adaptPiEventsToServer,
  buildLegacyDoneEvent,
  hasLegacyMapping,
  hasServerMapping,
  mapPiEventToLegacy,
  mapPiEventToServer,
  type LegacyAgentEvent,
} from './src/index';

describe('@upup/pi-event-adapter', () => {
  test('contract version matches @upup/pi-runtime', () => {
    expect(PI_EVENT_ADAPTER_CONTRACT).toBe(PI_EVENTS_CONTRACT);
  });

  test('thinking event maps to legacy & server thinking', () => {
    const event: UpUpAgentEvent = { type: 'thinking', sessionId: 's', text: 'considering' };
    expect(mapPiEventToLegacy(event)).toEqual({ type: 'thinking', message: 'considering' });
    expect(mapPiEventToServer(event)).toEqual({ type: 'thinking', message: 'considering' });
  });

  test('text_delta maps to stream_progress with textContent/content', () => {
    const event: UpUpAgentEvent = { type: 'text_delta', sessionId: 's', delta: 'hello' };
    const legacy = mapPiEventToLegacy(event) as Extract<LegacyAgentEvent, { type: 'stream_progress' }>;
    expect(legacy.type).toBe('stream_progress');
    expect(legacy.charDelta).toBe(5);
    expect(legacy.mode).toBe('responding');
    expect(legacy.textContent).toBe('hello');

    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('stream_progress');
    expect((server as Record<string, unknown>).content).toBe('hello');
    expect((server as Record<string, unknown>).charDelta).toBe(5);
  });

  test('empty text_delta is dropped from legacy but still yields server event', () => {
    const event: UpUpAgentEvent = { type: 'text_delta', sessionId: 's', delta: '' };
    expect(mapPiEventToLegacy(event)).toBeUndefined();
    expect(mapPiEventToServer(event)).not.toBeNull();
  });

  test('text_delta honours ctx.defaultMode', () => {
    const event: UpUpAgentEvent = { type: 'text_delta', sessionId: 's', delta: 'x' };
    const legacy = mapPiEventToLegacy(event, { defaultMode: 'thinking' }) as Extract<
      LegacyAgentEvent,
      { type: 'stream_progress' }
    >;
    expect(legacy.mode).toBe('thinking');
  });

  test('tool_start maps to tool_start with normalized args', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_start',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: { command: 'ls' },
    };
    const legacy = mapPiEventToLegacy(event) as Extract<LegacyAgentEvent, { type: 'tool_start' }>;
    expect(legacy.type).toBe('tool_start');
    expect(legacy.tool).toBe('bash');
    expect(legacy.args).toEqual({ command: 'ls' });
    expect(legacy.toolCallId).toBe('tc-1');

    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('tool_start');
    expect((server as Record<string, unknown>).tool).toBe('bash');
  });

  test('tool_start with null/undefined input maps to empty args object', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_start',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-2',
      input: null as unknown,
    };
    const legacy = mapPiEventToLegacy(event) as Extract<LegacyAgentEvent, { type: 'tool_start' }>;
    expect(legacy.args).toEqual({});
  });

  test('tool_update maps to tool_progress', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_update',
      sessionId: 's',
      toolName: 'bash',
      text: 'working',
    };
    const legacy = mapPiEventToLegacy(event) as Extract<LegacyAgentEvent, { type: 'tool_progress' }>;
    expect(legacy.type).toBe('tool_progress');
    expect(legacy.message).toBe('working');
  });

  test('tool_end success maps to tool_end', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
    };
    const legacy = mapPiEventToLegacy(event) as Extract<LegacyAgentEvent, { type: 'tool_end' }>;
    expect(legacy.type).toBe('tool_end');
    expect(legacy.tool).toBe('bash');
    expect(legacy.toolCallId).toBe('tc-1');
    expect(legacy.duration).toBe(0);

    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('tool_end');
  });

  test('tool_end with error maps to tool_error (both legacy and server)', () => {
    const event: UpUpAgentEvent = {
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      error: 'boom',
    };
    const legacy = mapPiEventToLegacy(event) as Extract<LegacyAgentEvent, { type: 'tool_error' }>;
    expect(legacy.type).toBe('tool_error');
    expect(legacy.error).toBe('boom');

    const server = mapPiEventToServer(event)!;
    expect(server.type).toBe('tool_error');
    expect((server as Record<string, unknown>).error).toBe('boom');
  });

  test('compaction_start/end maps to compaction phase events', () => {
    const start: UpUpAgentEvent = { type: 'compaction_start', sessionId: 's', reason: 'token-limit' };
    const end: UpUpAgentEvent = { type: 'compaction_end', sessionId: 's', success: true };
    expect(mapPiEventToLegacy(start)).toEqual({ type: 'compaction', phase: 'start' });
    expect(mapPiEventToLegacy(end)).toEqual({ type: 'compaction', phase: 'end', success: true });
    expect(mapPiEventToServer(start)).toEqual({ type: 'compaction', phase: 'start' });
    expect(mapPiEventToServer(end)).toEqual({ type: 'compaction', phase: 'end', success: true });
  });

  test('lifecycle-only Pi events are dropped (undefined/null)', () => {
    const lifecycles: UpUpAgentEvent[] = [
      { type: 'session_start', sessionId: 's', agentId: 'a' },
      { type: 'agent_start', sessionId: 's' },
      { type: 'turn_start', sessionId: 's' },
      { type: 'message_end', sessionId: 's', role: 'assistant', text: '' },
      { type: 'turn_end', sessionId: 's' },
      { type: 'agent_end', sessionId: 's' },
      { type: 'session_error', sessionId: 's', error: 'x' },
    ];
    for (const event of lifecycles) {
      expect(hasLegacyMapping(event)).toBe(false);
      expect(hasServerMapping(event)).toBe(false);
    }
  });

  test('buildLegacyDoneEvent produces a complete done event', () => {
    const done = buildLegacyDoneEvent({
      answer: 'final',
      toolCalls: [{ tool: 'bash', args: {}, result: 'ok' }],
      iterations: 3,
      totalTime: 1234,
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      tokensPerSecond: 12.5,
    });
    expect(done.type).toBe('done');
    expect(done.answer).toBe('final');
    expect(done.iterations).toBe(3);
    expect(done.totalTime).toBe(1234);
    expect(done.tokenUsage?.totalTokens).toBe(30);
    expect(done.tokensPerSecond).toBe(12.5);
  });

  test('buildLegacyDoneEvent omits optional fields when absent', () => {
    const done = buildLegacyDoneEvent({ answer: 'x', totalTime: 1 });
    expect(done.toolCalls).toEqual([]);
    expect(done.iterations).toBe(0);
    expect(done.tokenUsage).toBeUndefined();
    expect(done.tokensPerSecond).toBeUndefined();
  });

  test('adaptPiEventsToLegacy consumes sync iterable and drops un-mapped events', async () => {
    const events: UpUpAgentEvent[] = [
      { type: 'session_start', sessionId: 's', agentId: 'a' },
      { type: 'thinking', sessionId: 's', text: 't' },
      { type: 'text_delta', sessionId: 's', delta: 'a' },
      { type: 'text_delta', sessionId: 's', delta: '' },
      { type: 'tool_start', sessionId: 's', toolName: 'bash', toolCallId: '1', input: {} },
      { type: 'tool_end', sessionId: 's', toolName: 'bash', toolCallId: '1' },
    ];
    const out: LegacyAgentEvent[] = [];
    for await (const ev of adaptPiEventsToLegacy(events)) out.push(ev);
    expect(out.map((e) => e.type)).toEqual([
      'thinking',
      'stream_progress',
      'tool_start',
      'tool_end',
    ]);
  });

  test('adaptPiEventsToServer consumes async iterable', async () => {
    async function* gen(): AsyncGenerator<UpUpAgentEvent> {
      yield { type: 'text_delta', sessionId: 's', delta: 'a' };
      yield { type: 'tool_start', sessionId: 's', toolName: 'bash', toolCallId: '1', input: {} };
    }
    const out: unknown[] = [];
    for await (const ev of adaptPiEventsToServer(gen())) out.push(ev);
    expect(out.length).toBe(2);
    expect((out[0] as { type: string }).type).toBe('stream_progress');
    expect((out[1] as { type: string }).type).toBe('tool_start');
  });

  test('every mapable Pi event type maps to a non-null legacy event', () => {
    const mapable: UpUpAgentEvent[] = [
      { type: 'thinking', sessionId: 's', text: 'x' },
      { type: 'text_delta', sessionId: 's', delta: 'x' },
      { type: 'tool_start', sessionId: 's', toolName: 't', toolCallId: '1', input: {} },
      { type: 'tool_update', sessionId: 's', toolName: 't', text: 'x' },
      { type: 'tool_end', sessionId: 's', toolName: 't', toolCallId: '1' },
      { type: 'compaction_start', sessionId: 's', reason: 'r' },
      { type: 'compaction_end', sessionId: 's', success: true },
    ];
    for (const event of mapable) {
      expect(hasLegacyMapping(event)).toBe(true);
      expect(hasServerMapping(event)).toBe(true);
    }
  });
});

describe('@upup/pi-event-adapter — legacy → server', () => {
  test('legacy thinking maps to server thinking', async () => {
    const { mapLegacyAgentEventToServer } = await import('./src/index');
    const out = mapLegacyAgentEventToServer({ type: 'thinking', message: 't' });
    expect(out).toEqual({ type: 'thinking', message: 't' });
  });

  test('legacy tool_end maps to server tool_end', async () => {
    const { mapLegacyAgentEventToServer } = await import('./src/index');
    const out = mapLegacyAgentEventToServer({
      type: 'tool_end',
      tool: 'bash',
      args: {},
      result: 'ok',
      duration: 5,
      toolCallId: 'tc',
    });
    expect(out).toEqual({
      type: 'tool_end',
      tool: 'bash',
      args: {},
      result: 'ok',
      duration: 5,
      toolCallId: 'tc',
    });
  });

  test('legacy stream_progress with textContent maps to server content', async () => {
    const { mapLegacyAgentEventToServer } = await import('./src/index');
    const out = mapLegacyAgentEventToServer({
      type: 'stream_progress',
      charDelta: 3,
      mode: 'responding',
      textContent: 'foo',
    });
    expect(out).not.toBeNull();
    expect((out as Record<string, unknown>).type).toBe('stream_progress');
    expect((out as Record<string, unknown>).content).toBe('foo');
  });

  test('legacy done maps to server done preserving token usage', async () => {
    const { mapLegacyAgentEventToServer } = await import('./src/index');
    const out = mapLegacyAgentEventToServer({
      type: 'done',
      answer: 'a',
      toolCalls: [{ tool: 'bash', args: {}, result: '' }],
      iterations: 2,
      totalTime: 100,
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      tokensPerSecond: 5,
    });
    expect(out).toEqual({
      type: 'done',
      answer: 'a',
      toolCalls: [{ tool: 'bash', args: {}, result: '' }],
      iterations: 2,
      totalTime: 100,
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      tokensPerSecond: 5,
    });
  });

  test('legacy compaction with all fields maps to server', async () => {
    const { mapLegacyAgentEventToServer } = await import('./src/index');
    const out = mapLegacyAgentEventToServer({
      type: 'compaction',
      phase: 'end',
      success: true,
      preCompactTokens: 100,
      postCompactTokens: 50,
      compactionModel: 'gpt-5.4',
    });
    expect(out).toEqual({
      type: 'compaction',
      phase: 'end',
      success: true,
      preCompactTokens: 100,
      postCompactTokens: 50,
      compactionModel: 'gpt-5.4',
    });
  });
});

describe('@upup/pi-event-adapter — coverage audit', () => {
  test('auditAdapterCoverage classifies every Pi event type', async () => {
    const { auditAdapterCoverage } = await import('./src/index');
    const fixtures: UpUpAgentEvent[] = [
      { type: 'session_start', sessionId: 's', agentId: 'a' },
      { type: 'agent_start', sessionId: 's' },
      { type: 'turn_start', sessionId: 's' },
      { type: 'text_delta', sessionId: 's', delta: 'x' },
      { type: 'tool_start', sessionId: 's', toolName: 't', toolCallId: '1', input: {} },
      { type: 'tool_update', sessionId: 's', toolName: 't', text: 'x' },
      { type: 'tool_end', sessionId: 's', toolName: 't', toolCallId: '1' },
      { type: 'message_end', sessionId: 's', role: 'assistant', text: '' },
      { type: 'thinking', sessionId: 's', text: 'x' },
      { type: 'compaction_start', sessionId: 's', reason: 'r' },
      { type: 'compaction_end', sessionId: 's', success: true },
      { type: 'turn_end', sessionId: 's' },
      { type: 'agent_end', sessionId: 's' },
      { type: 'session_error', sessionId: 's', error: 'e' },
    ];
    const report = auditAdapterCoverage(fixtures);
    // Lifecycle-only events (no UI representation) should be in dropped lists
    expect(report.droppedFromLegacy).toContain('session_start');
    expect(report.droppedFromLegacy).toContain('agent_start');
    expect(report.droppedFromLegacy).toContain('turn_start');
    expect(report.droppedFromLegacy).toContain('message_end');
    expect(report.droppedFromLegacy).toContain('turn_end');
    expect(report.droppedFromLegacy).toContain('agent_end');
    expect(report.droppedFromLegacy).toContain('session_error');
    // Tool/text/thinking events should be in mapped lists
    expect(report.mappedToLegacy).toContain('text_delta');
    expect(report.mappedToLegacy).toContain('tool_start');
    expect(report.mappedToLegacy).toContain('tool_update');
    expect(report.mappedToLegacy).toContain('tool_end');
    expect(report.mappedToLegacy).toContain('thinking');
    expect(report.mappedToLegacy).toContain('compaction_start');
    expect(report.mappedToLegacy).toContain('compaction_end');
    // Server mapping should match legacy for the same set
    expect(report.mappedToServer.sort()).toEqual(report.mappedToLegacy.sort());
    expect(report.droppedFromServer.sort()).toEqual(report.droppedFromLegacy.sort());
    expect(report.hasAnyLegacyMapping).toBe(true);
    expect(report.hasAnyServerMapping).toBe(true);
  });
});

describe('@upup/pi-event-adapter — AgentSessionEvent → UpUpAgentEvent', () => {
  test('agent_start maps to UpUp agent_start', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'agent_start' } as never);
    expect(out).toEqual({ type: 'agent_start', sessionId: 's' });
  });

  test('turn_start maps to UpUp turn_start', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'turn_start' } as never);
    expect(out).toEqual({ type: 'turn_start', sessionId: 's' });
  });

  test('message_update text_delta maps to UpUp text_delta', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hello' },
    } as never);
    expect(out).toEqual({ type: 'text_delta', sessionId: 's', delta: 'hello' });
  });

  test('message_update thinking_delta maps to UpUp thinking', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: 'considering' },
    } as never);
    expect(out).toEqual({ type: 'thinking', sessionId: 's', text: 'considering' });
  });

  test('message_update unhandled sub-type returns undefined', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_update',
      assistantMessageEvent: { type: 'unknown_subtype' },
    } as never);
    expect(out).toBeUndefined();
  });

  test('message_end extracts text from content array', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hello ' },
          { type: 'text', text: 'world' },
        ],
        stopReason: 'end_turn',
      },
    } as never);
    expect(out).toEqual({
      type: 'message_end',
      sessionId: 's',
      role: 'assistant',
      text: 'hello \nworld',
      stopReason: 'end_turn',
    });
  });

  test('message_end with missing role defaults to "unknown"', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'message_end',
      message: { content: [] },
    } as never);
    expect((out as { role: string }).role).toBe('unknown');
  });

  test('tool_execution_start maps to UpUp tool_start', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_start',
      toolName: 'bash',
      toolCallId: 'tc-1',
      args: { command: 'ls' },
    } as never);
    expect(out).toEqual({
      type: 'tool_start',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      input: { command: 'ls' },
    });
  });

  test('tool_execution_update extracts text from partial result', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_update',
      toolName: 'bash',
      partialResult: { content: [{ type: 'text', text: 'partial' }] },
    } as never);
    expect(out).toEqual({
      type: 'tool_update',
      sessionId: 's',
      toolName: 'bash',
      text: 'partial',
    });
  });

  test('tool_execution_end with no error maps to UpUp tool_end without error', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_end',
      toolName: 'bash',
      toolCallId: 'tc-1',
      isError: false,
      result: { content: [] },
    } as never);
    expect(out).toEqual({
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      error: undefined,
    });
  });

  test('tool_execution_end with error maps to UpUp tool_end with error text', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'tool_execution_end',
      toolName: 'bash',
      toolCallId: 'tc-1',
      isError: true,
      result: { content: [{ type: 'text', text: 'boom' }] },
    } as never);
    expect(out).toEqual({
      type: 'tool_end',
      sessionId: 's',
      toolName: 'bash',
      toolCallId: 'tc-1',
      error: 'boom',
    });
  });

  test('compaction_start and compaction_end map with success flag', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const start = mapAgentSessionEventToUpUp('s', { type: 'compaction_start', reason: 'token-limit' } as never);
    const end = mapAgentSessionEventToUpUp('s', { type: 'compaction_end', errorMessage: undefined, aborted: false } as never);
    expect(start).toEqual({ type: 'compaction_start', sessionId: 's', reason: 'token-limit' });
    expect(end).toEqual({ type: 'compaction_end', sessionId: 's', success: true, error: undefined });
  });

  test('compaction_end with errorMessage maps to success:false', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'compaction_end', errorMessage: 'oops', aborted: false } as never);
    expect(out).toEqual({ type: 'compaction_end', sessionId: 's', success: false, error: 'oops' });
  });

  test('agent_end with failed assistant message maps to UpUp session_error', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'agent_end',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', stopReason: 'error', errorMessage: 'something failed' },
      ],
    } as never);
    expect(out).toEqual({ type: 'session_error', sessionId: 's', error: 'something failed' });
  });

  test('agent_end with aborted assistant message maps to UpUp session_error', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'agent_end',
      messages: [
        { role: 'assistant', stopReason: 'aborted', errorMessage: 'user aborted' },
      ],
    } as never);
    expect(out).toEqual({ type: 'session_error', sessionId: 's', error: 'user aborted' });
  });

  test('agent_end with clean assistant message maps to UpUp agent_end', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', {
      type: 'agent_end',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', stopReason: 'end_turn', content: [] },
      ],
    } as never);
    expect(out).toEqual({ type: 'agent_end', sessionId: 's' });
  });

  test('turn_end maps to UpUp turn_end', async () => {
    const { mapAgentSessionEventToUpUp } = await import('./src/index');
    const out = mapAgentSessionEventToUpUp('s', { type: 'turn_end' } as never);
    expect(out).toEqual({ type: 'turn_end', sessionId: 's' });
  });

  test('extractTextFromPiMessage returns empty string for non-message values', async () => {
    const { extractTextFromPiMessage } = await import('./src/index');
    expect(extractTextFromPiMessage(null)).toBe('');
    expect(extractTextFromPiMessage(undefined)).toBe('');
    expect(extractTextFromPiMessage({ content: 'not-array' })).toBe('');
    expect(extractTextFromPiMessage({})).toBe('');
    expect(extractTextFromPiMessage({ content: [] })).toBe('');
  });

  test('extractTextFromPiMessage joins multiple text parts', async () => {
    const { extractTextFromPiMessage } = await import('./src/index');
    const out = extractTextFromPiMessage({
      content: [
        { type: 'text', text: 'a' },
        { type: 'image' },
        { type: 'text', text: 'b' },
        { type: 'text', text: 42 },
      ],
    });
    expect(out).toBe('a\nb');
  });
});
