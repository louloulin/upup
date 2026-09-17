/**
 * UpUp SOP Executor.
 *
 * Runs a `SopSpec` by dispatching each phase to a caller-injected
 * `SopPhaseRunner`. The runner is expected to be a thin wrapper over the Pi
 * subagent primitive (`@upup/pi-session` -> Pi `AgentSession`), so this module
 * stays free of any Pi/runtime dependency and can be unit-tested with mocks.
 *
 * Execution model:
 *   1. Topological sort of `phase.requires` (already validated acyclic).
 *   2. Sequential phase execution; each phase receives the results of the
 *      phases it depends on.
 *   3. `parallelGroups` run after all linear phases complete: every agent in
 *      `group.agents` runs concurrently, then `group.synthesizer` consumes all
 *      their outputs (reduce = majority | weighted | llm-arbiter).
 *
 * Approval gates (`spec.approval.beforePhases`) pause the run before the
 * listed phases and surface an `approval_required` status to the caller.
 */
import type { UpUpAgentSpec } from '@upup/pi-runtime';
import type { SopParallelGroup, SopPhase, SopSpec } from './sop-spec';

export interface SopPhaseRequest {
  readonly sop: SopSpec;
  readonly phase: SopPhase;
  readonly agent: UpUpAgentSpec | undefined;
  /** Natural-language intent for the phase (already interpolated). */
  readonly intent: string;
  readonly ticker?: string;
  /** Results of the phases this phase depends on. */
  readonly dependencies: readonly SopPhaseResult[];
  readonly signal?: AbortSignal;
}

export interface SopSynthesisRequest {
  readonly sop: SopSpec;
  readonly group: SopParallelGroup;
  readonly synthesizer: UpUpAgentSpec | undefined;
  readonly ticker?: string;
  readonly inputs: readonly SopPhaseResult[];
  readonly signal?: AbortSignal;
}

export type SopPhaseRunner = (request: SopPhaseRequest) => Promise<{ output: string; evidence?: readonly unknown[]; sessionId?: string }>;
export type SopSynthesizerRunner = (request: SopSynthesisRequest) => Promise<{ output: string; evidence?: readonly unknown[]; sessionId?: string }>;

export type SopPhaseStatus = 'completed' | 'failed' | 'skipped' | 'pending' | 'approval_required';

export interface SopPhaseResult {
  readonly phaseId: string;
  readonly agent: string;
  readonly status: SopPhaseStatus;
  readonly output: string;
  readonly durationMs: number;
  readonly evidence: readonly unknown[];
  readonly error?: string;
  readonly sessionId?: string;
}

export interface SopResult {
  readonly sopId: string;
  readonly ticker?: string;
  readonly phases: readonly SopPhaseResult[];
  readonly syntheses: readonly SopPhaseResult[];
  readonly success: boolean;
  readonly totalDurationMs: number;
  /** Set when the run paused on an approval gate. */
  readonly pendingApproval?: { readonly phaseId: string };
}

export interface SopExecutorOptions {
  readonly ticker?: string;
  /** Agent catalog override (defaults to a resolver-provided map). */
  readonly agents?: ReadonlyMap<string, UpUpAgentSpec>;
  readonly runner?: SopPhaseRunner;
  readonly synthesizerRunner?: SopSynthesizerRunner;
  readonly signal?: AbortSignal;
  /** Phases declared here (spec.approval.beforePhases) are always treated as gates. */
  readonly approvalGates?: readonly string[];
  /** Resume from a prior run: phase ids already completed are skipped. */
  readonly completedPhaseIds?: readonly string[];
  readonly now?: () => number;
}

function topoSort(phases: readonly SopPhase[]): readonly SopPhase[] {
  const byId = new Map(phases.map((p) => [p.id, p] as const));
  const visited = new Set<string>();
  const out: SopPhase[] = [];
  const visit = (p: SopPhase): void => {
    if (visited.has(p.id)) return;
    for (const dep of p.requires ?? []) {
      const depPhase = byId.get(dep);
      if (depPhase) visit(depPhase);
    }
    visited.add(p.id);
    out.push(p);
  };
  for (const p of phases) visit(p);
  return out;
}

function interpolate(intent: string, ticker: string | undefined): string {
  if (!ticker) return intent;
  return intent
    .replace(/\{ticker\}/g, ticker)
    .replace(/\{\{ticker\}\}/g, ticker);
}

export async function executeSop(
  sop: SopSpec,
  runner: SopPhaseRunner | undefined,
  options: SopExecutorOptions = {},
): Promise<SopResult> {
  if (!runner) throw new Error(`SOP "${sop.id}" cannot run: no phase runner was provided (fail-closed)`);
  const now = options.now ?? Date.now;
  const started = now();
  const ordered = topoSort(sop.phases);
  const results = new Map<string, SopPhaseResult>();
  const alreadyDone = new Set(options.completedPhaseIds ?? []);
  const gates = new Set(options.approvalGates ?? sop.approval?.beforePhases ?? []);
  const orderedResults: SopPhaseResult[] = [];

  for (const phase of ordered) {
    if (options.signal?.aborted) {
      const aborted: SopPhaseResult = { phaseId: phase.id, agent: phase.agent, status: 'skipped', output: '', durationMs: 0, evidence: [], error: 'aborted' };
      results.set(phase.id, aborted);
      orderedResults.push(aborted);
      continue;
    }
    if (alreadyDone.has(phase.id)) {
      const resumed: SopPhaseResult = { phaseId: phase.id, agent: phase.agent, status: 'completed', output: '(resumed)', durationMs: 0, evidence: [] };
      results.set(phase.id, resumed);
      orderedResults.push(resumed);
      continue;
    }
    if (gates.has(phase.id)) {
      const pending: SopPhaseResult = { phaseId: phase.id, agent: phase.agent, status: 'approval_required', output: '', durationMs: 0, evidence: [] };
      results.set(phase.id, pending);
      orderedResults.push(pending);
      return {
        sopId: sop.id,
        ...(options.ticker !== undefined ? { ticker: options.ticker } : {}),
        phases: orderedResults,
        syntheses: [],
        success: false,
        totalDurationMs: now() - started,
        pendingApproval: { phaseId: phase.id },
      };
    }

    const phaseStarted = now();
    const dependencies = (phase.requires ?? []).map((id) => results.get(id)).filter((r): r is SopPhaseResult => Boolean(r));
    try {
      const res = await runner({
        sop,
        phase,
        agent: options.agents?.get(phase.agent),
        intent: interpolate(phase.intent, options.ticker),
        ...(options.ticker !== undefined ? { ticker: options.ticker } : {}),
        dependencies,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
      const result: SopPhaseResult = {
        phaseId: phase.id,
        agent: phase.agent,
        status: 'completed',
        output: res.output,
        durationMs: now() - phaseStarted,
        evidence: [...(res.evidence ?? [])],
        ...(res.sessionId !== undefined ? { sessionId: res.sessionId } : {}),
      };
      results.set(phase.id, result);
      orderedResults.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: SopPhaseResult = { phaseId: phase.id, agent: phase.agent, status: 'failed', output: '', durationMs: now() - phaseStarted, evidence: [], error: message };
      results.set(phase.id, result);
      orderedResults.push(result);
    }
  }

  // Parallel groups run after linear phases complete.
  const syntheses: SopPhaseResult[] = [];
  for (const group of sop.parallelGroups ?? []) {
    if (!options.synthesizerRunner) {
      syntheses.push({ phaseId: group.id, agent: group.synthesizer, status: 'failed', output: '', durationMs: 0, evidence: [], error: 'no synthesizer runner provided' });
      continue;
    }
    const groupStarted = now();
    const branchResults = await Promise.all(group.agents.map(async (agentId): Promise<SopPhaseResult> => {
      const branchStarted = now();
      try {
        const res = await runner({
          sop,
          phase: { id: `${group.id}:${agentId}`, agent: agentId, intent: `Parallel branch ${group.id}` },
          agent: options.agents?.get(agentId),
          intent: `${sop.name} / ${group.id}`,
          ...(options.ticker !== undefined ? { ticker: options.ticker } : {}),
          dependencies: orderedResults,
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
        });
        return { phaseId: `${group.id}:${agentId}`, agent: agentId, status: 'completed', output: res.output, durationMs: now() - branchStarted, evidence: [...(res.evidence ?? [])], ...(res.sessionId !== undefined ? { sessionId: res.sessionId } : {}) };
      } catch (error) {
        return { phaseId: `${group.id}:${agentId}`, agent: agentId, status: 'failed', output: '', durationMs: now() - branchStarted, evidence: [], error: error instanceof Error ? error.message : String(error) };
      }
    }));
    orderedResults.push(...branchResults);
    try {
      const synth = await options.synthesizerRunner({
        sop,
        group,
        synthesizer: options.agents?.get(group.synthesizer),
        ...(options.ticker !== undefined ? { ticker: options.ticker } : {}),
        inputs: branchResults,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
      syntheses.push({ phaseId: group.id, agent: group.synthesizer, status: 'completed', output: synth.output, durationMs: now() - groupStarted, evidence: [...(synth.evidence ?? [])], ...(synth.sessionId !== undefined ? { sessionId: synth.sessionId } : {}) });
    } catch (error) {
      syntheses.push({ phaseId: group.id, agent: group.synthesizer, status: 'failed', output: '', durationMs: now() - groupStarted, evidence: [], error: error instanceof Error ? error.message : String(error) });
    }
  }

  // A SOP only counts as successful when every phase and synthesis completed —
  // failed / skipped / approval_required branches make it unsuccessful.
  const phasesOk = orderedResults.every((r) => r.status === 'completed');
  const synthOk = syntheses.every((s) => s.status === 'completed');
  return {
    sopId: sop.id,
    ...(options.ticker !== undefined ? { ticker: options.ticker } : {}),
    phases: orderedResults,
    syntheses,
    success: phasesOk && synthOk,
    totalDurationMs: now() - started,
  };
}

/**
 * Extract the phase-id sequence for a SOP (topologically ordered), for
 * resumption bookkeeping.
 */
export function sopPhaseOrder(sop: SopSpec): readonly string[] {
  return topoSort(sop.phases).map((p) => p.id);
}
