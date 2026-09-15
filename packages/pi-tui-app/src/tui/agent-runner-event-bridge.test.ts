/**
 * Lockdown tests for the Pi canonical event → UI event bridge.
 *
 * `toUiEvent` is the single source of truth for translating `UpUpAgentEvent`s
 * produced by the Pi runtime into the discriminated `UiEvent` union consumed
 * by the TUI. A regression here breaks every agent session, so we cover the
 * full switch exhaustively.
 */

import { describe, expect, test } from 'bun:test';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import { DEFAULT_APPROVED_TOOL_SEED, toUiEvent } from './agent-runner-event-bridge';

describe('agent-runner-event-bridge', () => {
  test('default approved tool seed covers the side-effecting trio', () => {
    expect(DEFAULT_APPROVED_TOOL_SEED).toEqual(['write_file', 'edit_file', 'bash']);
  });

  test('thinking: text wrapped into UiEvent.thinking', () => {
    const out = toUiEvent({ type: 'thinking', text: 'reasoning' } as UpUpAgentEvent);
    expect(out).toEqual({ type: 'thinking', message: 'reasoning' });
  });

  test('text_delta with empty payload is dropped (not synthesised)', () => {
    const out = toUiEvent({ type: 'text_delta', delta: '' } as UpUpAgentEvent);
    expect(out).toBeUndefined();
  });

  test('text_delta with content becomes stream_progress', () => {
    const out = toUiEvent({ type: 'text_delta', delta: 'hi' } as UpUpAgentEvent);
    expect(out).toEqual({ type: 'stream_progress', charDelta: 2, mode: 'responding', textContent: 'hi' });
  });

  test('tool_start propagates name + args + toolCallId', () => {
    const out = toUiEvent({
      type: 'tool_start',
      toolName: 'web_search',
      input: { q: 'aapl' },
      toolCallId: 'tc-1',
    } as unknown as UpUpAgentEvent);
    expect(out).toEqual({ type: 'tool_start', tool: 'web_search', args: { q: 'aapl' }, toolCallId: 'tc-1' });
  });

  test('tool_end with error becomes tool_error', () => {
    const out = toUiEvent({
      type: 'tool_end',
      toolName: 'bash',
      error: 'boom',
      toolCallId: 'tc-1',
    } as unknown as UpUpAgentEvent);
    expect(out).toEqual({ type: 'tool_error', tool: 'bash', error: 'boom', toolCallId: 'tc-1' });
  });

  test('tool_end without error becomes tool_end with empty result', () => {
    const out = toUiEvent({ type: 'tool_end', toolName: 'bash', toolCallId: 'tc-1' } as unknown as UpUpAgentEvent);
    expect(out).toEqual({ type: 'tool_end', tool: 'bash', args: {}, result: '', duration: 0, toolCallId: 'tc-1' });
  });

  test('compaction_start/end round-trip into compaction phase', () => {
    expect(toUiEvent({ type: 'compaction_start' } as UpUpAgentEvent)).toEqual({ type: 'compaction', phase: 'start' });
    expect(toUiEvent({ type: 'compaction_end', success: true } as UpUpAgentEvent)).toEqual({ type: 'compaction', phase: 'end', success: true });
  });

  test('run_end becomes done with the full payload', () => {
    const out = toUiEvent({
      type: 'run_end',
      answer: '42',
      iterations: 3,
      totalTime: 100,
      tokenUsage: { input: 1, output: 2 },
    } as unknown as UpUpAgentEvent);
    expect(out).toEqual({
      type: 'done',
      answer: '42',
      toolCalls: [],
      iterations: 3,
      totalTime: 100,
      tokenUsage: { input: 1, output: 2 },
    });
  });

  test('unknown event types are dropped silently', () => {
    const out = toUiEvent({ type: 'mystery' } as unknown as UpUpAgentEvent);
    expect(out).toBeUndefined();
  });
});
