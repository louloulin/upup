/**
 * UpUp SDK — typed event stream.
 *
 * Wraps the host's `onEvent` callback in a tiny dispatcher that flattens
 * UpUp's granular `UpUpAgentEvent` types into the 9 SDK-level event types
 * defined in `./types`.
 *
 * Hosts that prefer raw UpUp events (every typed `UpUpAgentEvent`) should
 * listen for `{ type: 'agent_event' }` — that envelope preserves the full
 * payload so downstream consumers can render their own UI without losing
 * data.
 */

import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { UpUpSessionEvent } from './types';

type UpUpEventListener = (event: UpUpSessionEvent) => void | Promise<void>;

export class UpUpEventStream {
  private readonly listeners = new Set<UpUpEventListener>();

  addListener(listener: UpUpEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeListener(listener: UpUpEventListener): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Map a Pi event into one or more SDK events. Most UpUp events map 1:1;
   * tool events emit two SDK events (`tool_call` + `tool_result`) so hosts
   * don't have to match the call/result pair themselves.
   */
  async emitFromAgentEvent(event: UpUpAgentEvent): Promise<void> {
    const sdk = this.fromAgentEvent(event);
    if (sdk === null) return;
    await this.emit(sdk);
  }

  async emit(event: UpUpSessionEvent): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch {
        // Listener errors are silently dropped: the SDK promise is fire-and-forget.
        // Hosts that need error telemetry should add their own try/catch inside
        // the listener and emit a follow-up `{ type: 'error' }` event.
      }
    }
  }

  /** Translate one UpUp event into a SDK-level event (or null when irrelevant). */
  fromAgentEvent(event: UpUpAgentEvent): UpUpSessionEvent | null {
    switch (event.type) {
      case 'tool_start':
        return { type: 'tool_call', tool: event.toolName, input: event.input };
      case 'tool_end': {
        // UpUp's tool_end carries an optional error string; we surface it as
        // isError on the result event so hosts can render failure distinctly.
        const isError = typeof event.error === 'string' && event.error.length > 0;
        return { type: 'tool_result', tool: event.toolName, output: isError ? { error: event.error } : { ok: true }, isError };
      }
      case 'text_delta':
        // Streaming text: emit as message event so hosts with custom UIs can
        // append deltas without parsing Pi's session_id wrapper.
        return { type: 'message', message: { role: 'assistant', content: event.delta } as never };
      case 'thinking':
        return { type: 'thinking', text: event.text };
      case 'message_end':
        return { type: 'message', message: { role: event.role, content: event.text } as never };
      case 'turn_end':
        return { type: 'done', reason: 'finished' };
      case 'run_end':
        return { type: 'done', reason: 'finished' };
      case 'session_error':
        return { type: 'error', error: new Error(event.error) };
      case 'session_start':
      case 'agent_start':
      case 'turn_start':
      case 'tool_update':
      case 'compaction_start':
      case 'compaction_end':
      case 'agent_end':
        // Forward as envelope so hosts with custom event matchers can still see them.
        return { type: 'agent_event', event };
      default:
        // Exhaustiveness check: if a new event type is added upstream, forward it.
        return { type: 'agent_event', event: event as never };
    }
  }
}
