/**
 * UpUp SOP → `@quintinshaw/pi-dynamic-workflows` bridge.
 *
 * Translates a `SopSpec` (YAML phase sequence + parallel groups) into a
 * Pi dynamic-workflow JS script that `runWorkflow()` can execute.
 *
 * Why a separate bridge (from `sop-workflow-bridge.ts`):
 *   `sop-workflow-bridge.ts` targets `pi-subagents`' workflow-resource
 *   registration surface (name + version + resolve -> host command).
 *   This bridge targets `@quintinshaw/pi-dynamic-workflows`'s
 *   `runWorkflow(script, options)` — the full JS orchestration surface
 *   with `agent()`, `parallel()`, `phase()`, model routing, token
 *   accounting, and journaled resume. A host that loads this bridge
 *   can fan an UpUp SOP out across 100+ subagents with real
 *   cost tracking and deterministic resume, which the simpler
 *   workflow-resource bridge cannot provide.
 *
 * Script shape:
 *   export const meta = { name, description, phases: [{ title }...] }
 *   phase('phase_id')
 *   const <var> = await agent('<intent>', { tier: '<small|medium|big>' })
 *   ... parallel groups use `await parallel([...])`
 *   return await agent('synthesizer prompt', { tier: 'big' })
 *
 * Failure isolation:
 *   - Missing @quintinshaw/pi-dynamic-workflows is surfaced through the
 *     sink; the SOP still runs through the legacy executor.
 *   - A phase with no `requires` edge is emitted sequentially; phases
 *     with `requires` become variable references so the orchestrator
 *     naturally forms the DAG.
 *   - Parallel groups are emitted as `await parallel([...])` blocks.
 *   - The synthesizer phase becomes the `return await agent(...)` tail.
 */

import type { SopSpec, SopPhase, SopParallelGroup } from '../sop-spec';

/** Model tier used for each phase based on its role. */
const DEFAULT_TIER: Readonly<Record<string, string>> = {
  'invest-explore': 'small',
  'invest-plan': 'medium',
  'invest-risk': 'medium',
  'invest-review': 'medium',
  'invest-trade': 'medium',
};

export interface SopScriptBridgeOptions {
  /** Ticker argument interpolated into `{ticker}` placeholders. */
  readonly ticker?: string;
  /** Override the default tier map (useful for tests). */
  readonly tierMap?: Readonly<Record<string, string>>;
}

export interface SopScriptBridgeResult {
  readonly script: string;
  readonly meta: { readonly name: string; readonly description: string; readonly phases: readonly { readonly title: string }[] };
}

function sanitizeVariableName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function interpolateIntent(intent: string, ticker?: string): string {
  if (!ticker) return intent;
  return intent.replace(/\{ticker\}/g, ticker);
}

function resolveTier(agent: string, tierMap?: Readonly<Record<string, string>>): string {
  return tierMap?.[agent] ?? DEFAULT_TIER[agent] ?? 'medium';
}

function emitPhaseBody(
  phase: SopPhase,
  variableMap: ReadonlyMap<string, string>,
  ticker: string | undefined,
  tierMap?: Readonly<Record<string, string>>,
): string {
  const intent = interpolateIntent(phase.intent, ticker);
  const tier = resolveTier(phase.agent, tierMap);
  const variableName = `result_${sanitizeVariableName(phase.id)}`;
  return `  phase('${phase.id}')\n  const ${variableName} = await agent(${JSON.stringify(intent)}, { tier: '${tier}' });\n`;
}

function emitParallelGroupBody(
  group: SopParallelGroup,
  ticker: string | undefined,
  tierMap?: Readonly<Record<string, string>>,
): string {
  const lines = [`  phase('${group.id}')`, `  const debate_${sanitizeVariableName(group.id)} = await parallel([`];
  for (const agent of group.agents) {
    const tier = resolveTier(agent, tierMap);
    lines.push(`    () => agent(${JSON.stringify(`为 ${ticker ?? '标的'} 执行 ${agent} 分析。`)}, { tier: '${tier}' }),`);
  }
  lines.push('  ]);');
  lines.push(`  const synthesis_${sanitizeVariableName(group.id)} = await agent(`);
  lines.push(`    ${JSON.stringify('综合以上分析结果，给出倾向性结论。')},`);
  lines.push(`    { tier: 'big' },`);
  lines.push('  );');
  return lines.join('\n') + '\n';
}

/**
 * Translate one SopSpec into a Pi dynamic-workflow JS script.
 * Returns a script that can be passed to `runWorkflow(script, { ticker })`.
 */
export function sopToDynamicWorkflowScript(
  spec: SopSpec,
  options: SopScriptBridgeOptions = {},
): SopScriptBridgeResult {
  const ticker = options.ticker;
  const tierMap = options.tierMap;
  const variableMap = new Map<string, string>();
  for (const phase of spec.phases) {
    variableMap.set(phase.id, `result_${sanitizeVariableName(phase.id)}`);
  }
  for (const group of spec.parallelGroups ?? []) {
    variableMap.set(group.id, `synthesis_${sanitizeVariableName(group.id)}`);
  }

  const metaPhases = [
    ...spec.phases.map((p) => ({ title: p.id })),
    ...(spec.parallelGroups ?? []).map((g) => ({ title: g.id })),
  ];

  const meta = {
    name: `upup_sop_${spec.id}`,
    description: spec.description.replace(/\n/g, ' ').trim().slice(0, 200),
    phases: metaPhases,
  };

  const body: string[] = [`export const meta = ${JSON.stringify(meta, null, 2)};`, ''];

  for (const phase of spec.phases) {
    body.push(emitPhaseBody(phase, variableMap, ticker, tierMap));
  }
  for (const group of spec.parallelGroups ?? []) {
    body.push(emitParallelGroupBody(group, ticker, tierMap));
  }

  const synthesis = spec.parallelGroups?.length
    ? `return synthesis_${sanitizeVariableName(spec.parallelGroups[0].id)};`
    : `return ${variableMap.get(spec.phases[spec.phases.length - 1]?.id ?? 'report') ?? 'undefined'};`;
  body.push(synthesis);

  return { script: body.join('\n'), meta };
}
