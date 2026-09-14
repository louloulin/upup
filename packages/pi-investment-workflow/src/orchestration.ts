/**
 * Pi-backed investment workflow orchestration.
 *
 * The workflow owns deterministic phase state and uses a Pi AgentSession as
 * the durable event tree. Financial implementations are injected by callers;
 * this module deliberately has no dependency on finance tools.
 */

import { buildResearchPlan, detectPhases, extractTicker } from '@upup/pi-planning';
import { advancePhase, auditLog, listPlans, loadPlan, persistPlan, planFilePath } from '@upup/pi-planning';
import type { ResearchMarket, ResearchPhase, ResearchPlan, ResearchPlanState } from '@upup/pi-planning';
import { calculateProgress, updateStepStatus } from '@upup/pi-planning';
import { PLANS_DIR } from '@upup/utils';
import { createHash } from 'node:crypto';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createInvestmentDossier, loadInvestmentDossier, persistInvestmentDossier, type InvestmentDossier } from './investment-dossier.js';
// Factory bridge: import root Factory via dynamic bridge
// getInvestmentAgentSpec: same bridge
import type { UpUpAgentSession } from '@upup/pi-runtime';

export type PhaseStatus = 'completed' | 'failed' | 'skipped' | 'pending';

export interface PhaseResult {
  phase: ResearchPhase;
  status: PhaseStatus;
  output: string;
  durationMs: number;
  error?: string;
  stepIds: string[];
  evidence?: readonly { source: string; phase: ResearchPhase; retrievedAt?: string; asOf?: string; auditId?: string; provider?: string; dataFreshness?: string; retryAttempts?: number; retryMaxAttempts?: number; retryRecovered?: boolean }[];
}

export interface WorkflowResult {
  planId: string;
  ticker?: string;
  market?: ResearchMarket;
  intent: string;
  phases: PhaseResult[];
  totalDurationMs: number;
  success: boolean;
  finalPlanState: ResearchPlanState;
  progress: number;
  sessionId?: string;
  sessionFile?: string;
  paused?: boolean;
  dossierFile?: string;
  dossier?: InvestmentDossier;
}

export const WORKFLOW_PHASES: ReadonlyArray<ResearchPhase> = [
  'detect', 'plan', 'execute', 'verify', 'report',
] as const;

const WORKFLOW_ENTRY = 'upup-investment-workflow';
const IDEMPOTENCY_LOCK_MAX_WAIT_MS = 15 * 60 * 1000;
const IDEMPOTENCY_LOCK_STALE_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_LOCK_POLL_MS = 50;

export type InvestmentSessionFactory = (sessionPath: string) => Promise<UpUpAgentSession>;

export interface InvestmentWorkflowOptions {
  ticker?: string;
  market?: ResearchMarket;
  phases?: ResearchPhase[];
  mode?: 'fast' | 'full';
  pauseAfterPhase?: ResearchPhase;
  idempotencyKey?: string;
  /** Model and data timestamps are persisted into every dossier phase. */
  modelVersion?: string;
  dataAsOf?: string;
  assumptions?: readonly string[];
  /** Optional pi AgentSession factory — injected by the root runtime bridge. */
  sessionFactory?: InvestmentSessionFactory;
}

function workflowSessionPath(planId: string): string {
  return `${planFilePath(planId)}.pi.jsonl`;
}

async function openWorkflowSession(planId: string, sessionFactory: InvestmentSessionFactory): Promise<UpUpAgentSession> {
  if (!sessionFactory) {
    throw new Error('InvestmentWorkflowOptions.sessionFactory is required to open a workflow session');
  }
  return sessionFactory(workflowSessionPath(planId));
}

function appendWorkflowEntry(session: UpUpAgentSession, event: Record<string, unknown>): void {
  session.appendEntry(WORKFLOW_ENTRY, {
    schema: 1,
    recordedAt: new Date().toISOString(),
    ...event,
  });
}

function plansDirectory(): string {
  return process.env.UPUP_PLANS_DIR ?? PLANS_DIR;
}

function idempotencyLockPath(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return join(plansDirectory(), `.idempotency-${digest}.lock`);
}

function waitForIdempotencyLock(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, IDEMPOTENCY_LOCK_POLL_MS));
}

async function acquireIdempotencyLock(key: string): Promise<() => Promise<void>> {
  await mkdir(plansDirectory(), { recursive: true });
  const lockPath = idempotencyLockPath(key);
  const startedAt = Date.now();
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ key, pid: process.pid, createdAt: new Date().toISOString() }));
      await handle.close();
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          await unlink(lockPath);
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      };
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      try {
        const lockAge = Date.now() - (await stat(lockPath)).mtimeMs;
        if (lockAge > IDEMPOTENCY_LOCK_STALE_MS) {
          await unlink(lockPath);
          continue;
        }
      } catch (statError) {
        if (statError instanceof Error && 'code' in statError && statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() - startedAt >= IDEMPOTENCY_LOCK_MAX_WAIT_MS) {
        throw new Error(`investment workflow idempotency lock timeout: ${key}`);
      }
      await waitForIdempotencyLock();
    }
  }
}

function persistDossierCheckpoint(plan: ResearchPlan, intent: string, session: UpUpAgentSession, phaseResults: readonly PhaseResult[], status: 'running' | 'paused' | 'completed' | 'failed'): { dossier: InvestmentDossier; file: string } {
  const dossier = createInvestmentDossier({
    workflowId: plan.id,
    plan,
    sessionId: session.id,
    intent,
    status,
    currentPhase: plan.currentPhase,
    phaseResults: phaseResults.map((result) => ({
      phase: result.phase,
      status: result.status,
      output: result.output,
      ...(result.error ? { error: result.error } : {}),
      ...(result.evidence ? { evidence: result.evidence.map((evidence) => ({
        source: evidence.source,
        retrievedAt: evidence.retrievedAt ?? new Date().toISOString(),
        ...(evidence.asOf ? { asOf: evidence.asOf } : {}),
        ...(evidence.auditId ? { auditId: evidence.auditId } : {}),
        ...(evidence.provider ? { provider: evidence.provider } : {}),
        ...(evidence.dataFreshness ? { dataFreshness: evidence.dataFreshness } : {}),
        ...(evidence.retryAttempts !== undefined ? { retryAttempts: evidence.retryAttempts } : {}),
        ...(evidence.retryMaxAttempts !== undefined ? { retryMaxAttempts: evidence.retryMaxAttempts } : {}),
        ...(evidence.retryRecovered !== undefined ? { retryRecovered: evidence.retryRecovered } : {}),
      })) } : {}),
    })),
    options: {
      modelVersion: typeof plan.metadata?.modelVersion === 'string' ? plan.metadata.modelVersion : undefined,
      dataAsOf: typeof plan.metadata?.dataAsOf === 'string' ? plan.metadata.dataAsOf : undefined,
      assumptions: Array.isArray(plan.metadata?.assumptions) ? plan.metadata.assumptions.filter((value): value is string => typeof value === 'string') : undefined,
    },
  });
  const file = persistInvestmentDossier(dossier, plansDirectory());
  session.appendEntry('upup-investment-dossier', dossier);
  return { dossier, file };
}

function phaseStepIds(plan: ResearchPlan, phase: ResearchPhase): string[] {
  return plan.steps
    .filter((step) => step.description.startsWith(`[${phase}]`))
    .map((step) => step.id);
}

async function executeWorkflow(
  plan: ResearchPlan,
  phases: ResearchPhase[],
  options: InvestmentWorkflowOptions,
  resumed: boolean,
): Promise<WorkflowResult> {
  const sessionFactory = options.sessionFactory;
  if (!sessionFactory) {
    throw new Error('InvestmentWorkflowOptions.sessionFactory is required to run an investment workflow');
  }

  const start = Date.now();
  const session = await openWorkflowSession(plan.id, sessionFactory);
  appendWorkflowEntry(session, {
    action: resumed ? 'resume' : 'start',
    planId: plan.id,
    ticker: plan.ticker ?? null,
    market: plan.market ?? null,
    phases,
    idempotencyKey: options.idempotencyKey ?? null,
  });

  plan.phase = 'execute';
  plan.status = 'active';
  persistPlan(plan);
  const previousDossier = resumed ? loadInvestmentDossier(plan.id, plansDirectory()) : null;
  const phaseResults: PhaseResult[] = previousDossier?.phases
    .filter((phase) => phase.status === 'completed')
    .map((phase) => ({
      phase: phase.phase,
      status: 'completed' as const,
      output: phase.output,
      durationMs: 0,
      stepIds: phaseStepIds(plan, phase.phase),
      evidence: phase.evidence.map((evidence) => ({ ...evidence, phase: phase.phase })),
    })) ?? [];
  let dossierCheckpoint = persistDossierCheckpoint(plan, plan.goal, session, phaseResults, 'running');

  for (const phase of phases) {
    plan.currentPhase = phase;
    persistPlan(plan);
    appendWorkflowEntry(session, { action: 'phase_start', planId: plan.id, phase, progress: calculateProgress(plan) });
    const phaseStart = Date.now();
    const stepIds = phaseStepIds(plan, phase);
    let result: PhaseResult;
    try {
      const toolResult = await session.executeTool('invest_workflow_phase', `${session.id}:${plan.id}:${phase}`, {
        phase,
        ...(plan.ticker === undefined ? {} : { ticker: plan.ticker }),
        ...(plan.market === undefined ? {} : { market: plan.market }),
        goal: plan.goal,
      });
      const output = {
        output: toolResult.content
          .filter((part): part is { type: 'text'; text: string } => Boolean(part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string'))
          .map((part) => part.text)
          .join('\n'),
        ...((toolResult as { isError?: boolean }).isError ? { error: 'investment_workflow_phase_failed' } : {}),
      };
      result = {
        phase,
        status: output.error ? 'failed' : 'completed',
        output: output.output,
        durationMs: Date.now() - phaseStart,
        ...(output.error ? { error: output.error } : {}),
        stepIds,
        evidence: Array.isArray((toolResult as { details?: { evidence?: unknown } }).details?.evidence)
          ? (toolResult as { details: { evidence: PhaseResult['evidence'] } }).details.evidence
          : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { phase, status: 'failed', output: '', durationMs: Date.now() - phaseStart, error: message, stepIds };
    }
    phaseResults.push(result);
    dossierCheckpoint = persistDossierCheckpoint(plan, plan.goal, session, phaseResults, result.status === 'failed' ? 'failed' : 'running');
    appendWorkflowEntry(session, { action: 'phase', planId: plan.id, ...result });
    auditLog({
      planId: plan.id,
      action: result.status === 'completed' ? 'phase_advanced' : 'step_failed',
      phase,
      details: { durationMs: result.durationMs, error: result.error ?? null, sessionId: session.id },
    });
    if (result.status === 'completed') {
      for (const stepId of stepIds) updateStepStatus(plan, stepId, 'completed', result.output.slice(0, 200));
      plan.currentPhase = phases[phases.indexOf(phase) + 1] ?? phase;
      advancePhase(plan, phase === phases[phases.length - 1] ? 'done' : 'execute');
    } else {
      plan.currentPhase = phase;
      advancePhase(plan, 'execute');
    }

    if (options.pauseAfterPhase === phase && phase !== phases[phases.length - 1]) {
      plan.phase = 'review';
      plan.status = 'paused';
      persistPlan(plan);
      dossierCheckpoint = persistDossierCheckpoint(plan, plan.goal, session, phaseResults, 'paused');
      appendWorkflowEntry(session, { action: 'pause', planId: plan.id, phase, nextPhase: phases[phases.indexOf(phase) + 1] ?? null, progress: calculateProgress(plan) });
      const pausedResult: WorkflowResult = {
        planId: plan.id,
        ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}),
        ...(plan.market !== undefined ? { market: plan.market } : {}),
        intent: plan.goal,
        phases: phaseResults,
        totalDurationMs: Date.now() - start,
        success: phaseResults.some((item) => item.status === 'completed'),
        finalPlanState: plan.phase,
        progress: calculateProgress(plan),
        sessionId: session.id,
        sessionFile: session.getSessionFile(),
        paused: true,
        dossierFile: dossierCheckpoint.file,
        dossier: dossierCheckpoint.dossier,
      };
      session.dispose();
      return pausedResult;
    }
  }

  const hasFailure = phaseResults.some((item) => item.status === 'failed');
  plan.phase = 'done';
  plan.status = hasFailure ? 'failed' : 'completed';
  plan.completedAt = new Date();
  persistPlan(plan);
  auditLog({
    planId: plan.id,
    action: 'completed',
    details: { phases: phaseResults.length, completed: phaseResults.filter((item) => item.status === 'completed').length, failed: phaseResults.filter((item) => item.status === 'failed').length, sessionId: session.id },
  });
  appendWorkflowEntry(session, { action: 'complete', planId: plan.id, status: plan.status, progress: calculateProgress(plan) });
  const result: WorkflowResult = {
    planId: plan.id,
    ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}),
    ...(plan.market !== undefined ? { market: plan.market } : {}),
    intent: plan.goal,
    phases: phaseResults,
    totalDurationMs: Date.now() - start,
    success: phaseResults.length > 0 && phaseResults.every((item) => item.status === 'completed'),
    finalPlanState: plan.phase,
    progress: calculateProgress(plan),
    sessionId: session.id,
    sessionFile: session.getSessionFile(),
    dossierFile: (dossierCheckpoint = persistDossierCheckpoint(plan, plan.goal, session, phaseResults, hasFailure ? 'failed' : 'completed')).file,
    dossier: dossierCheckpoint.dossier,
  };
  session.dispose();
  return result;
}

export async function runInvestmentWorkflow(intent: string, options: InvestmentWorkflowOptions = {}): Promise<WorkflowResult> {
  const ticker = options.ticker ?? extractTicker(intent);
  const mode = options.mode ?? 'full';
  const phases = options.phases ?? (mode === 'full' ? [...WORKFLOW_PHASES] : detectPhases(intent));
  if (options.idempotencyKey) {
    const releaseLock = await acquireIdempotencyLock(options.idempotencyKey);
    try {
      const existing = listPlans()
        .map((planId) => loadPlan(planId))
        .find((plan): plan is ResearchPlan => plan?.metadata?.piWorkflowIdempotencyKey === options.idempotencyKey);
      if (existing) return resumeWorkflow(existing.id, options);
      const plan = buildResearchPlan(intent, {
        ...(ticker !== undefined ? { ticker } : {}),
        ...(options.market !== undefined ? { market: options.market } : {}),
        phases,
        description: `Pi Native 五阶段投研闭环: ${phases.join(' → ')}`,
      });
      plan.phase = 'execute';
      plan.currentPhase = phases[0] ?? 'detect';
      plan.status = 'active';
      plan.metadata = {
        ...(plan.metadata ?? {}),
        piWorkflow: true,
        piWorkflowIdempotencyKey: options.idempotencyKey,
        ...(options.modelVersion ? { modelVersion: options.modelVersion } : {}),
        ...(options.dataAsOf ? { dataAsOf: options.dataAsOf } : {}),
        ...(options.assumptions ? { assumptions: [...options.assumptions] } : {}),
      };
      persistPlan(plan);
      auditLog({ planId: plan.id, action: 'phase_advanced', details: { workflow: 'pi-invest-detect-plan-execute-verify-report', ticker: ticker ?? null, market: options.market ?? null, phases, mode } });
      return await executeWorkflow(plan, phases, options, false);
    } finally {
      await releaseLock();
    }
  }
  const plan = buildResearchPlan(intent, {
    ...(ticker !== undefined ? { ticker } : {}),
    ...(options.market !== undefined ? { market: options.market } : {}),
    phases,
    description: `Pi Native 五阶段投研闭环: ${phases.join(' → ')}`,
  });
  plan.phase = 'execute';
  plan.currentPhase = phases[0] ?? 'detect';
  plan.status = 'active';
  plan.metadata = {
    ...(plan.metadata ?? {}),
    piWorkflow: true,
    piWorkflowIdempotencyKey: options.idempotencyKey,
    ...(options.modelVersion ? { modelVersion: options.modelVersion } : {}),
    ...(options.dataAsOf ? { dataAsOf: options.dataAsOf } : {}),
    ...(options.assumptions ? { assumptions: [...options.assumptions] } : {}),
  };
  persistPlan(plan);
  auditLog({ planId: plan.id, action: 'phase_advanced', details: { workflow: 'pi-invest-detect-plan-execute-verify-report', ticker: ticker ?? null, market: options.market ?? null, phases, mode } });
  return executeWorkflow(plan, phases, options, false);
}

export async function resumeInvestmentWorkflow(
  planId: string,
  options: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'> = {},
): Promise<WorkflowResult> {
  return resumeWorkflow(planId, options);
}

export async function resumeWorkflow(planId: string, options: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'> = {}): Promise<WorkflowResult> {
  const plan = loadPlan(planId);
  if (!plan) throw new Error(`Plan ${planId} 不存在(路径: ${planFilePath(planId)})`);
  if (plan.phase === 'done') {
    const dossierFile = join(plansDirectory(), `${plan.id}.dossier.json`);
    const dossier = loadInvestmentDossier(plan.id, plansDirectory()) ?? undefined;
    return { planId: plan.id, ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}), ...(plan.market !== undefined ? { market: plan.market } : {}), intent: plan.goal, phases: [], totalDurationMs: 0, success: plan.status === 'completed', finalPlanState: 'done', progress: 100, sessionFile: workflowSessionPath(plan.id), dossierFile, ...(dossier ? { dossier } : {}) };
  }
  const remaining = plan.phases.filter((phase) => phaseStepIds(plan, phase).some((stepId) => plan.steps.find((step) => step.id === stepId)?.status !== 'completed'));
  if (remaining.length === 0) {
    plan.phase = 'done';
    plan.currentPhase = plan.phases.at(-1) ?? plan.currentPhase;
    plan.status = 'completed';
    plan.completedAt = new Date();
    persistPlan(plan);
    const dossierFile = join(plansDirectory(), `${plan.id}.dossier.json`);
    const dossier = loadInvestmentDossier(plan.id, plansDirectory()) ?? undefined;
    return { planId: plan.id, ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}), ...(plan.market !== undefined ? { market: plan.market } : {}), intent: plan.goal, phases: [], totalDurationMs: 0, success: true, finalPlanState: 'done', progress: 100, sessionFile: workflowSessionPath(plan.id), dossierFile, ...(dossier ? { dossier } : {}) };
  }
  return executeWorkflow(plan, remaining, options, true);
}

/** Create a durable Pi branch for a paused or completed investment workflow. */
/** Create a durable pi branch for a paused or completed investment workflow. */
export async function forkWorkflowSession(planId: string, entryId?: string, options: Pick<InvestmentWorkflowOptions, 'sessionFactory'> = {}): Promise<string | undefined> {
  const sessionFactory = options.sessionFactory;
  if (!sessionFactory) {
    throw new Error('InvestmentWorkflowOptions.sessionFactory is required to fork a workflow session');
  }
  const session = await openWorkflowSession(planId, sessionFactory);
  const branch = session.fork(entryId);
  if (branch) appendWorkflowEntry(session, { action: 'fork', planId, branchId: branch });
  session.dispose();
  return branch;
}
