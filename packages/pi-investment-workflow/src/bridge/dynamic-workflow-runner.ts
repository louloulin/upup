/**
 * UpUp SOP → `@quintinshaw/pi-dynamic-workflows` runner.
 *
 * Companion to `dynamic-workflow-bridge.ts` (which only translates a SOP
 * into a JS orchestration script). This module actually executes that
 * script through `runWorkflow(script, options)` so an UpUp SOP gains:
 *
 *   - real parallel fan-out across 16 concurrent / 1000 total subagents
 *   - per-agent model routing (`tier: small|medium|big`)
 *   - journaled resume (a paused run replays completed agents from cache)
 *   - token/cost accounting returned on the run result
 *   - live progress callbacks for the TUI / gateway
 *
 * Why the split:
 *   The translator is pure and unit-testable without Pi;
 *   the runner needs a live Pi session (via `WorkflowAgentRunner` or the
 *   default `WorkflowAgent`) and therefore only runs inside a Pi host.
 *   Keeping them separate means the CLI can `--dry-run` a SOP without
 *   spawning subagents.
 *
 * Failure isolation:
 *   A missing `@quintinshaw/pi-dynamic-workflows` import is surfaced
 *   through the sink; the caller falls back to the legacy
 *   `executeSop` path. The runner never imports the package at module
 *   scope, so a host without it still boots.
 */

import type { SopSpec } from '../sop-spec';
import { sopToDynamicWorkflowScript, type SopScriptBridgeOptions } from './dynamic-workflow-bridge';

/** Minimal shape of `@quintinshaw/pi-dynamic-workflows` we depend on. */
interface WorkflowRunResultShape {
  readonly meta: { readonly name: string; readonly description: string; readonly phases?: readonly { readonly title: string }[] };
  readonly result: unknown;
  readonly logs: readonly string[];
  readonly phases: readonly string[];
  readonly agentCount: number;
  readonly durationMs: number;
  readonly runId?: string;
  readonly tokenUsage?: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
    readonly cost: number;
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
  };
}

type RunWorkflowFn = (script: string, options?: Record<string, unknown>) => Promise<WorkflowRunResultShape>;

export interface SopDynamicRunOptions extends SopScriptBridgeOptions {
  /** Sink for failure isolation; optional. */
  readonly sink?: { readonly onError?: (where: string, error: unknown) => void };
  /** Live phase progress (`phase('<id>')` in the script). */
  readonly onPhase?: (phase: string) => void;
  /** Live log lines emitted by the workflow runtime. */
  readonly onLog?: (message: string) => void;
  /** One event per agent start / end for TUI + audit trails. */
  readonly onAgentStart?: (event: { readonly id: string; readonly label: string; readonly phase?: string }) => void;
  readonly onAgentEnd?: (event: { readonly id: string; readonly label: string; readonly phase?: string; readonly error?: string }) => void;
  /** Token cap for the run (null = unlimited). */
  readonly tokenBudget?: number | null;
  /** Max concurrent subagents. Default 16. */
  readonly concurrency?: number;
  /** Abort signal for the whole run. */
  readonly signal?: AbortSignal;
  /** Override the dynamic-workflow module (tests inject a fake). */
  readonly importer?: (specifier: string) => Promise<unknown>;
  /** Run id for resume; auto-generated when omitted. */
  readonly runId?: string;
}

export interface SopDynamicRunResult {
  readonly sopId: string;
  readonly script: string;
  readonly runId?: string;
  readonly agentCount: number;
  readonly durationMs: number;
  readonly phases: readonly string[];
  readonly logs: readonly string[];
  readonly result: unknown;
  readonly tokenUsage?: WorkflowRunResultShape['tokenUsage'];
}

const WORKFLOW_PACKAGE = '@quintinshaw/pi-dynamic-workflows';

/** Lazily reach the shared dual-scope importer without a static workspace edge. */
async function createUpUpEcosystemImporter(): Promise<(specifier: string) => Promise<unknown>> {
  const runtime = (await import('@upup/pi-runtime')) as {
    createEcosystemImporter?: () => (specifier: string) => Promise<unknown>;
  };
  if (typeof runtime.createEcosystemImporter === 'function') return runtime.createEcosystemImporter();
  return (specifier: string) => import(specifier);
}

async function loadRunWorkflow(importer?: (specifier: string) => Promise<unknown>): Promise<RunWorkflowFn | undefined> {
  try {
    // Resolve through the dual-scope roots so a copy the user downloaded into
    // `~/.upup/agent/npm` wins over the bundled one.
    const fallback = await createUpUpEcosystemImporter();
    const mod = (await (importer ?? fallback)(WORKFLOW_PACKAGE)) as { runWorkflow?: RunWorkflowFn };
    return typeof mod.runWorkflow === 'function' ? mod.runWorkflow : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Execute a SOP through Pi dynamic workflows.
 *
 * Returns `undefined` when the ecosystem package is unavailable; the
 * caller is expected to fall back to the legacy `executeSop` path.
 */
export async function runSopAsDynamicWorkflow(
  spec: SopSpec,
  options: SopDynamicRunOptions = {},
): Promise<SopDynamicRunResult | undefined> {
  const { script } = sopToDynamicWorkflowScript(spec, options);
  const runWorkflow = await loadRunWorkflow(options.importer);
  if (!runWorkflow) {
    options.sink?.onError?.(WORKFLOW_PACKAGE, new Error(`${WORKFLOW_PACKAGE} is not installed or does not export runWorkflow`));
    return undefined;
  }

  const runOptions: Record<string, unknown> = {
    args: options.ticker ? { ticker: options.ticker } : {},
    persistLogs: true,
    ...(options.tokenBudget !== undefined ? { tokenBudget: options.tokenBudget } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.runId ? { runId: options.runId } : {}),
    ...(options.onPhase ? { onPhase: options.onPhase } : {}),
    ...(options.onLog ? { onLog: options.onLog } : {}),
    ...(options.onAgentStart
      ? { onAgentStart: (event: { id: string; label: string; phase?: string }) => options.onAgentStart?.({ id: event.id, label: event.label, ...(event.phase ? { phase: event.phase } : {}) }) }
      : {}),
    ...(options.onAgentEnd
      ? { onAgentEnd: (event: { id: string; label: string; phase?: string; error?: string }) => options.onAgentEnd?.({ id: event.id, label: event.label, ...(event.phase ? { phase: event.phase } : {}), ...(event.error ? { error: event.error } : {}) }) }
      : {}),
  };

  try {
    const result = await runWorkflow(script, runOptions);
    return {
      sopId: spec.id,
      script,
      ...(result.runId ? { runId: result.runId } : {}),
      agentCount: result.agentCount,
      durationMs: result.durationMs,
      phases: result.phases,
      logs: result.logs,
      result: result.result,
      ...(result.tokenUsage ? { tokenUsage: result.tokenUsage } : {}),
    };
  } catch (error) {
    options.sink?.onError?.(`runWorkflow(${spec.id})`, error);
    return undefined;
  }
}

/** Format the run result for TUI / `/invest` rendering. */
export function renderSopDynamicRunResult(result: SopDynamicRunResult, spec: SopSpec): string {
  const lines = [
    '',
    '═══════════════════════════════════════',
    `  SOP 运行完成 (dynamic workflow): ${spec.name}`,
    '═══════════════════════════════════════',
    '',
    `  SOP:        ${result.sopId}`,
    `  Run ID:     ${result.runId ?? '(inline)'}`,
    `  阶段:       ${result.phases.join(' → ') || '(none)'}`,
    `  子代理数:   ${result.agentCount}`,
    `  耗时:       ${(result.durationMs / 1000).toFixed(1)}s`,
  ];
  if (result.tokenUsage) {
    lines.push(`  Token:      in=${result.tokenUsage.input} out=${result.tokenUsage.output} total=${result.tokenUsage.total}`);
    lines.push(`  成本:       $${result.tokenUsage.cost.toFixed(4)}`);
  }
  lines.push('');
  lines.push('  结果摘要:');
  const text = typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2);
  lines.push(...text.split('\n').slice(0, 40).map((line) => `    ${line}`));
  lines.push('');
  return lines.join('\n');
}
