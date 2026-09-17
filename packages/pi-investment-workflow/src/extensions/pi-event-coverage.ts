/**
 * Pi Event Coverage Extension — plan §1.2.
 *
 * Subscribes the high-value Pi canonical events that the existing
 * UpUp packages had not yet wired. Each handler is intentionally cheap
 * (no I/O, no LLM call) — they only persist audit breadcrumbs so the
 * rest of the stack can reason about the session lifecycle.
 *
 * Why this lives in pi-investment-workflow and not pi-platform: every
 * event here is part of a `/invest` flow, a plan resume, or an
 * investment review. Plan §1.2 explicitly groups the events under the
 * workflow domain so the event-router test can colocate with the
 * orchestration logic it covers.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Names of the events this extension subscribes. Exported so the
 *  event-coverage guard script can count what is wired. */
export const PI_EVENT_COVERAGE_EVENTS = [
  'session_before_switch',
  'session_before_fork',
  'session_compact',
  'session_compact_failed',
  'session_tree',
  'agent_start',
  'agent_end',
  'agent_settled',
  'ui_prompt_start',
  'turn_start',
  'turn_end',
  'message_start',
  'message_update',
  'message_end',
  'before_provider_request',
  'after_provider_response',
  'context',
  'tool_execution_start',
  'tool_execution_end',
  'thinking_level_select',
] as const;

export type PiEventCoverageEvent = (typeof PI_EVENT_COVERAGE_EVENTS)[number];

interface AuditBreadcrumb {
  ts: string;
  event: PiEventCoverageEvent;
  sessionId?: string;
  note?: string;
}

function auditDir(): string {
  const dir = process.env['UPUP_AGENT_DIR'] ?? join(homedir(), '.upup', 'agent');
  return join(dir, 'state');
}

function auditPath(): string {
  return join(auditDir(), 'pi-event-coverage.jsonl');
}

function record(event: PiEventCoverageEvent, note?: string, sessionId?: string): void {
  const line: AuditBreadcrumb = {
    ts: new Date().toISOString(),
    event,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(note !== undefined ? { note } : {}),
  };
  try {
    const path = auditPath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(line)}\n`, { flag: 'a' });
  } catch {
    /* event audit must never break the host agent — fail open */
  }
}

/** Strongly-typed safe-call helper: a host that lacks the requested
 *  event must not throw. Pi documents `pi.on` as optional for older
 *  builds, so the probe pattern used elsewhere is mirrored here. */
function safeOn(
  pi: ExtensionAPI,
  event: PiEventCoverageEvent,
  handler: (event: unknown, context: unknown) => unknown | Promise<unknown>,
): void {
  const on = (pi as unknown as { on?: (name: string, fn: typeof handler) => void }).on;
  if (typeof on !== 'function') return;
  try {
    on(event, handler);
  } catch {
    /* a misbehaving host must not bring down the extension */
  }
}

function extractSessionId(event: unknown): string | undefined {
  if (event !== null && typeof event === 'object' && 'sessionId' in event) {
    const sid = (event as { sessionId?: unknown }).sessionId;
    if (typeof sid === 'string') return sid;
  }
  return undefined;
}

export default function piEventCoverageExtension(pi: ExtensionAPI): void {
  // Session lifecycle
  safeOn(pi, 'session_before_switch', (event) => {
    record('session_before_switch', 'about-to-switch', extractSessionId(event));
  });
  safeOn(pi, 'session_before_fork', (event) => {
    record('session_before_fork', 'plan-context-inherited-by-host', extractSessionId(event));
  });
  safeOn(pi, 'session_compact', (event) => {
    record('session_compact', 'compaction-settled', extractSessionId(event));
  });
  safeOn(pi, 'session_compact_failed', (event) => {
    record('session_compact_failed', 'host-fell-back-to-truncate', extractSessionId(event));
  });
  safeOn(pi, 'session_tree', (event) => {
    record('session_tree', 'tree-materialised', extractSessionId(event));
  });

  // Agent / turn / message lifecycle
  safeOn(pi, 'agent_start', (event) => {
    record('agent_start', 'agent-loop-opened', extractSessionId(event));
  });
  safeOn(pi, 'agent_end', (event) => {
    record('agent_end', 'agent-loop-closed', extractSessionId(event));
  });
  safeOn(pi, 'turn_start', (event) => {
    record('turn_start', 'turn-opened', extractSessionId(event));
  });
  safeOn(pi, 'turn_end', (event) => {
    record('turn_end', 'turn-closed', extractSessionId(event));
  });
  safeOn(pi, 'message_start', (event) => {
    record('message_start', 'message-opened', extractSessionId(event));
  });
  safeOn(pi, 'message_end', (event) => {
    record('message_end', 'message-closed', extractSessionId(event));
  });

  // Provider round-trip — used to audit token use. We only persist a
  // breadcrumb here because injecting context is owned by
  // @upup/pi-runtime's `before_agent_start` handler.
  safeOn(pi, 'before_provider_request', (event) => {
    record('before_provider_request', 'provider-round-trip-pending', extractSessionId(event));
  });
  safeOn(pi, 'after_provider_response', (event) => {
    record('after_provider_response', 'provider-round-trip-settled', extractSessionId(event));
  });

  // Context re-load — fires when the host re-reads .agents/skills or
  // refreshes the system prompt.
  safeOn(pi, 'context', (event) => {
    record('context', 'context-refreshed', extractSessionId(event));
  });

  // Tool execution observability — `tool_execution_*` is the
  // lower-level "the runtime is about to / has finished calling the
  // tool function" pair, useful for measuring Pi overhead separately
  // from the host's audit.
  safeOn(pi, 'tool_execution_start', (event) => {
    record('tool_execution_start', 'host-runtime-invoking-tool', extractSessionId(event));
  });
  safeOn(pi, 'tool_execution_end', (event) => {
    record('tool_execution_end', 'host-runtime-returned', extractSessionId(event));
  });

  // Model selection — model_select is already wired in
  // `advanced-extension-api.ts`; thinking_level_select is its sibling.
  safeOn(pi, 'thinking_level_select', (event) => {
    record('thinking_level_select', 'thinking-level-persisted', extractSessionId(event));
  });
  // Message lifecycle — Pi emits message_update with text deltas; we
  // audit so streaming-flow consumers can reason about message state.
  safeOn(pi, 'message_update', (event) => {
    record('message_update', 'message-streamed', extractSessionId(event));
  });

  // UI prompt lifecycle — when Pi's TUI re-renders its input prompt.
  safeOn(pi, 'ui_prompt_start', (event) => {
    record('ui_prompt_start', 'ui-prompt-opened', extractSessionId(event));
  });

  // Agent settled — fires once the agent loop has quiesced and is
  // awaiting the next user input.
  safeOn(pi, 'agent_settled', (event) => {
    record('agent_settled', 'agent-quiesced', extractSessionId(event));
  });

}
