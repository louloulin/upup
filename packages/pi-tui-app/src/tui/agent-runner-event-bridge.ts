/**
 * Event bridge between Pi canonical agent events and the TUI's UiEvent stream.
 *
 * `toUiEvent` is the single source of truth for how `UpUpAgentEvent`s produced
 * by `@upup/pi-runtime`'s `AgentSession` are translated into the discriminated
 * `UiEvent` union consumed by the TUI renderer. Keeping this translation in
 * one place means the runner controller can stay focused on state management
 * and the TUI can stay focused on rendering.
 *
 * `DEFAULT_APPROVED_TOOL_SEED` is the cross-run baseline for tools whose
 * approval state is restored from `SessionTracker`; callers can extend it via
 * the `AgentRunnerController` constructor's `additionalApprovedToolNames` hook.
 */

import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { UiEvent } from './agent-runner-types';

/**
 * Default set of tools whose approval state is restored from the SessionTracker
 * across runs. New tools added to the agent (extensions, plugins, finance tools)
 * can be merged in via the `additionalApprovedToolNames` constructor option.
 *
 * Mirrors Pi's built-in side-effecting tools. We do NOT attempt to enumerate
 * the full tool registry here — the registry is only materialised once a
 * session is running, which is too late to seed the approval set. Instead
 * we expose a hook so the runner's owner can plug in any extra tools they
 * expect to see (see {@link AgentRunnerController.constructor}).
 */
export const DEFAULT_APPROVED_TOOL_SEED: readonly string[] = ['write_file', 'edit_file', 'bash'];

export function toUiEvent(event: UpUpAgentEvent): UiEvent | undefined {
  switch (event.type) {
    case 'thinking':
      return { type: 'thinking', message: event.text };
    case 'text_delta':
      return event.delta.length === 0
        ? undefined
        : { type: 'stream_progress', charDelta: event.delta.length, mode: 'responding', textContent: event.delta };
    case 'tool_start':
      return {
        type: 'tool_start',
        tool: event.toolName,
        args: (event.input ?? {}) as Record<string, unknown>,
        toolCallId: event.toolCallId,
      };
    case 'tool_update':
      return { type: 'tool_progress', tool: event.toolName, message: event.text };
    case 'tool_end':
      return event.error
        ? { type: 'tool_error', tool: event.toolName, error: event.error, toolCallId: event.toolCallId }
        : {
            type: 'tool_end',
            tool: event.toolName,
            args: {},
            result: '',
            duration: 0,
            toolCallId: event.toolCallId,
          };
    case 'compaction_start':
      return { type: 'compaction', phase: 'start' };
    case 'compaction_end':
      return { type: 'compaction', phase: 'end', success: event.success };
    case 'run_end':
      return {
        type: 'done',
        answer: event.answer,
        toolCalls: [],
        iterations: event.iterations,
        totalTime: event.totalTime,
        tokenUsage: event.tokenUsage,
      };
    default:
      return undefined;
  }
}
