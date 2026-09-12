/**
 * `daemon_stats` — the canonical TypeBox-migrated Pi tool in upup.
 *
 * This tool is the prototype for migrating all upup tools from the loose
 * `{ name, description, execute }` shape to pi-coding-agent's strict
 * `ToolDefinition<TSchema, TDetails, TState>`. It is:
 *
 *   1. Built with `defineTool()` so its parameter schema is preserved
 *      (otherwise contextual typing widens `parameters: TSchema` to `unknown`).
 *   2. Strictly typed: `execute(toolCallId, params, signal, onUpdate, ctx)`
 *      with `Static<typeof schema>` for params and `SupervisorStats` for
 *      details — exactly what pi's runtime expects.
 *   3. Registered through the **same** `pi.registerTool(...)` call site that
 *      the historic loose shape used. The fake api in `src/pi-main.ts`
 *      accepts both shapes via duck typing on `name` + `execute`.
 *
 * Migration cost per tool (one-time):
 *   - Add a TypeBox schema (or `Type.Object({})` for arg-less tools)
 *   - Convert `execute() → execute(toolCallId, params, signal, onUpdate, ctx)`
 *   - Return `{ content: [...], details: <TDetails> }` instead of just `{ content: [...] }`
 *   - Wrap with `defineTool(...)` so the parameter type isn't widened
 */
import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Supervisor } from './supervisor.js';

/**
 * Shape of the supervisor stats returned as `details` from the tool execute.
 * Mirrors the inline return type of `Supervisor.getStats()` so call sites
 * outside `supervisor.ts` don't have to reach into the supervisor module.
 */
export interface SupervisorStats {
  queueSize: number;
  activeTasks: number;
  workers: number;
}

/**
 * `daemon_stats` takes no arguments. We still declare an explicit empty
 * schema so `Static<typeof daemonStatsParams>` resolves to `{}` instead of
 * `unknown` — the pi runtime will validate LLM tool calls against this.
 */
export const daemonStatsParams = Type.Object({});
export type DaemonStatsParams = Static<typeof daemonStatsParams>;

/**
 * The real Pi tool definition. `defineTool()` returns a `ToolDefinition`
 * whose parameter type is preserved when the value is assigned through
 * arrays or passed as a generic argument.
 */
export const daemonStatsTool = defineTool({
  name: 'daemon_stats',
  label: 'Daemon Stats',
  description:
    'Return a snapshot of the daemon supervisor (queue size, active tasks, workers, totals).',
  parameters: daemonStatsParams,
  async execute(
    _toolCallId,
    _params: DaemonStatsParams,
    _signal,
    _onUpdate,
    _ctx,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: SupervisorStats }> {
    const stats = new Supervisor().getStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats) }],
      details: stats,
    };
  },
});
