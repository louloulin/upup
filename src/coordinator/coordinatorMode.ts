/**
 * Coordinator Mode — main Agent tool-whitelist + feature gate.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D2)
 *      + analysis-comprehensive.md (Sprint 2.1)
 *
 * When `isCoordinatorMode()` is true, the main Agent is restricted to a
 * hard whitelist: it can ONLY dispatch to / read from / stop Workers, and
 * manipulate the shared task list. It MUST NOT call file_edit, bash,
 * web_search, browser, financial_search, trading, or any "leaf" tool.
 *
 * Why: in the loucode pattern, the Coordinator is a pure dispatcher. If it
 * could also do leaf work, the Worker boundaries (research / synthesis /
 * implementation / verification) collapse into a single agent doing
 * everything sequentially. The whitelist is the structural guarantee.
 *
 * Three-layer activation (matches the existing feature-gates.ts pattern):
 *   1. Compile-time:  BUN_CONFIG_FEATURE_COORDINATOR_MODE=0  excludes
 *                     this module's enforcement from Bun.build bundles.
 *   2. Startup:      FEATURE_COORDINATOR_MODE=false  disables at boot.
 *   3. Runtime:      featureGates.set('COORDINATOR_MODE', { ratio, userId })
 *                    for A/B rollout using deterministic hashing.
 *
 * Plus:  CLAUDE_COORDINATOR_MODE=1 (or =true) is the per-session override
 *        so users can opt-in even when the global gate is off (mirrors the
 *        loucode CLAUDE_CODE_COORDINATOR_MODE pattern).
 */

import { featureGates } from '../agent/feature-gates.js';

export const COORDINATOR_MODE_GATE = 'COORDINATOR_MODE' as const;

/** Override env: 1 / true / yes / on. */
function readOverrideEnv(): boolean | null {
  const raw = process.env['CLAUDE_COORDINATOR_MODE'];
  if (raw === undefined) return null;
  const v = raw.toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

export interface CoordinatorModeContext {
  /** Stable user id for deterministic bucketing. */
  userId?: string;
}

export function isCoordinatorMode(ctx: CoordinatorModeContext = {}): boolean {
  const override = readOverrideEnv();
  if (override !== null) return override;
  return featureGates.isEnabled(COORDINATOR_MODE_GATE, { userId: ctx.userId });
}

/**
 * Hard whitelist: tools the main Agent may call while in coordinator mode.
 * Kept intentionally small — every entry should be justifiable as "coordination
 * plumbing" (spawning / messaging / stopping workers) or "task-list
 * bookkeeping" (create / list / read tasks).
 *
 * Anything not in this list MUST be unreachable from the main Agent in
 * coordinator mode. Tests in coordinator-mode.test.ts assert this.
 */
export const COORDINATOR_WHITELIST: ReadonlySet<string> = new Set([
  // Worker dispatch (the only "do something" tools allowed).
  'agent_spawn_worker',
  'send_message_to_worker',
  'stop_worker',
  // Shared task-list bookkeeping.
  'coordinator_create_task',
  'coordinator_list_tasks',
  'coordinator_get_task',
  'coordinator_update_task',
  // Read-only visibility into a finished Worker's deliverable.
  'coordinator_read_artifact',
]);

/**
 * Convenience: tools we want to be VERY explicit are off-limits in
 * coordinator mode. The agent.ts integration MUST block these; this list
 * is the single source of truth for the integration test.
 */
export const COORDINATOR_FORBIDDEN: ReadonlySet<string> = new Set([
  // Direct code / shell access — Coordinator must not edit code.
  'bash',
  'file_edit',
  'file_read',
  // Leaf research tools — these belong INSIDE Workers, not in the dispatcher.
  'web_search',
  'browser',
  'financial_search',
  'get_financial_metrics',
  'read_filings',
  'skill',
  // Trading — Coordinator must not place or cancel orders.
  'place_trade',
  'cancel_trade',
  'strategy_run_paper',
  'strategy_backtest',
]);

/**
 * Filter a list of tool names down to those allowed for a main Agent in
 * coordinator mode. Tools not in the whitelist AND not in the forbidden
 * set are passed through (they may be coordinator-internal helpers that
 * aren't "leaf" tools); explicit denials always win.
 */
export function filterToolsForMainAgent(
  tools: readonly string[],
  mode: CoordinatorModeContext = {},
): string[] {
  if (!isCoordinatorMode(mode)) return [...tools];
  return tools.filter((t) => {
    if (COORDINATOR_FORBIDDEN.has(t)) return false;
    if (COORDINATOR_WHITELIST.size === 0) return false;
    return COORDINATOR_WHITELIST.has(t);
  });
}

/**
 * Assert a tool is callable in coordinator mode. Throws with a stable
 * error code so the agent.ts integration can distinguish "wrong tool
 * shape" from "tool not allowed in this mode".
 */
export function assertCoordinatorToolAccess(
  toolName: string,
  mode: CoordinatorModeContext = {},
): void {
  if (!isCoordinatorMode(mode)) return;
  if (COORDINATOR_WHITELIST.has(toolName)) return;
  const code = COORDINATOR_FORBIDDEN.has(toolName)
    ? 'COORDINATOR_TOOL_FORBIDDEN'
    : 'COORDINATOR_TOOL_NOT_WHITELISTED';
  const err = new Error(
    `coordinator-mode: tool "${toolName}" is not callable in coordinator mode ` +
      `(only ${COORDINATOR_WHITELIST.size} whitelisted coordination tools are allowed)`,
  );
  (err as Error & { code?: string }).code = code;
  throw err;
}

/**
 * System-prompt fragment injected into the main Agent when in coordinator
 * mode. Tells the LLM that it is a dispatcher, not a worker, and lists
 * the only tools it can call. Returned as a const string (not a function
 * of ctx) so callers can cache the substring.
 */
export const COORDINATOR_SYSTEM_PROMPT: string = [
  'You are running in COORDINATOR MODE.',
  'You are a pure dispatcher — you do not perform research, write code, or place trades yourself.',
  'You can ONLY call these coordination tools:',
  ...[...COORDINATOR_WHITELIST].map((t) => `  - ${t}`),
  '',
  'To do anything else, you must:',
  '  1. Use `coordinator_create_task` to add a task to the shared list.',
  '  2. Use `agent_spawn_worker` to dispatch a Worker.',
  '  3. Use `coordinator_list_tasks` / `coordinator_get_task` to read results.',
  '  4. Use `send_message_to_worker` for follow-up directives to the same Worker.',
  '  5. Use `stop_worker` to cancel a misbehaving Worker.',
  '',
  'Worker results arrive in the conversation as <task-notification> XML blocks.',
  'You must NOT call bash, file_edit, web_search, browser, financial_search,',
  'or any trading tool — those are Worker-only. If you need data, spawn a Worker.',
].join('\n');
