/**
 * Pi-backed investment workflow orchestration.
 *
 * The workflow owns deterministic phase state and uses a Pi AgentSession as
 * the durable event tree. Financial implementations are injected by callers;
 * this module deliberately has no dependency on finance tools.
 */

import { buildResearchPlan, detectPhases, extractTicker } from '../../plan/plan-builder.js';
import { advancePhase, auditLog, listPlans, loadPlan, persistPlan, planFilePath } from '../../plan/plan-executor.js';
import type { ResearchPhase, ResearchPlan, ResearchPlanState } from '../../plan/research-plan.js';
import { calculateProgress, updateStepStatus } from '../../plan/plan-context.js';
import { createPiAgentRuntime } from './agent-session-factory.js';
import { getInvestmentAgentSpec } from './agent-spec.js';
import type { UpUpAgentSession } from './types.js';

export type PhaseStatus = 'completed' | 'failed' | 'skipped' | 'pending';

export interface PhaseResult {
  phase: ResearchPhase;
  status: PhaseStatus;
  output: string;
  durationMs: number;
  error?: string;
  stepIds: string[];
}

export interface WorkflowResult {
  planId: string;
  ticker?: string;
  intent: string;
  phases: PhaseResult[];
  totalDurationMs: number;
  success: boolean;
  finalPlanState: ResearchPlanState;
  progress: number;
  sessionId?: string;
  sessionFile?: string;
  paused?: boolean;
}

export const WORKFLOW_PHASES: ReadonlyArray<ResearchPhase> = [
  'research', 'valuation', 'backtest', 'trade', 'review',
] as const;

const WORKFLOW_ENTRY = 'upup-investment-workflow';

export interface InvestmentWorkflowOptions {
  ticker?: string;
  phases?: ResearchPhase[];
  mode?: 'fast' | 'full';
  pauseAfterPhase?: ResearchPhase;
  idempotencyKey?: string;
}

function workflowSessionPath(planId: string): string {
  return `${planFilePath(planId)}.pi.jsonl`;
}

async function openWorkflowSession(planId: string): Promise<UpUpAgentSession> {
  return createPiAgentRuntime().createSession(getInvestmentAgentSpec('invest-plan'), {
    cwd: process.cwd(),
    sessionPath: workflowSessionPath(planId),
  });
}

function appendWorkflowEntry(session: UpUpAgentSession, event: Record<string, unknown>): void {
  session.appendEntry(WORKFLOW_ENTRY, {
    schema: 1,
    recordedAt: new Date().toISOString(),
    ...event,
  });
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
  const start = Date.now();
  const session = await openWorkflowSession(plan.id);
  appendWorkflowEntry(session, {
    action: resumed ? 'resume' : 'start',
    planId: plan.id,
    ticker: plan.ticker ?? null,
    phases,
    idempotencyKey: options.idempotencyKey ?? null,
  });

  plan.phase = 'execute';
  plan.status = 'active';
  persistPlan(plan);
  const phaseResults: PhaseResult[] = [];

  for (const phase of phases) {
    const phaseStart = Date.now();
    const stepIds = phaseStepIds(plan, phase);
    let result: PhaseResult;
    try {
      const toolResult = await session.executeTool('invest_workflow_phase', `${session.id}:${plan.id}:${phase}`, {
        phase,
        ...(plan.ticker === undefined ? {} : { ticker: plan.ticker }),
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
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { phase, status: 'failed', output: '', durationMs: Date.now() - phaseStart, error: message, stepIds };
    }
    phaseResults.push(result);
    appendWorkflowEntry(session, { action: 'phase', planId: plan.id, ...result });
    auditLog({
      planId: plan.id,
      action: result.status === 'completed' ? 'phase_advanced' : 'step_failed',
      phase,
      details: { durationMs: result.durationMs, error: result.error ?? null, sessionId: session.id },
    });
    if (result.status === 'completed') {
      for (const stepId of stepIds) updateStepStatus(plan, stepId, 'completed', result.output.slice(0, 200));
      advancePhase(plan, phase === phases[phases.length - 1] ? 'done' : 'execute');
    } else {
      advancePhase(plan, 'execute');
    }

    if (options.pauseAfterPhase === phase && phase !== phases[phases.length - 1]) {
      plan.phase = 'review';
      plan.status = 'paused';
      persistPlan(plan);
      appendWorkflowEntry(session, { action: 'pause', planId: plan.id, phase, progress: calculateProgress(plan) });
      const pausedResult: WorkflowResult = {
        planId: plan.id,
        ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}),
        intent: plan.goal,
        phases: phaseResults,
        totalDurationMs: Date.now() - start,
        success: phaseResults.some((item) => item.status === 'completed'),
        finalPlanState: plan.phase,
        progress: calculateProgress(plan),
        sessionId: session.id,
        sessionFile: session.getSessionFile(),
        paused: true,
      };
      session.dispose();
      return pausedResult;
    }
  }

  const allFailed = phaseResults.length > 0 && phaseResults.every((item) => item.status === 'failed');
  plan.phase = 'done';
  plan.status = allFailed ? 'failed' : 'completed';
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
    intent: plan.goal,
    phases: phaseResults,
    totalDurationMs: Date.now() - start,
    success: phaseResults.some((item) => item.status === 'completed'),
    finalPlanState: plan.phase,
    progress: calculateProgress(plan),
    sessionId: session.id,
    sessionFile: session.getSessionFile(),
  };
  session.dispose();
  return result;
}

export async function runInvestmentWorkflow(intent: string, options: InvestmentWorkflowOptions = {}): Promise<WorkflowResult> {
  const ticker = options.ticker ?? extractTicker(intent);
  const mode = options.mode ?? 'full';
  const phases = options.phases ?? (mode === 'full' ? [...WORKFLOW_PHASES] : detectPhases(intent));
  if (options.idempotencyKey) {
    const existing = listPlans()
      .map((planId) => loadPlan(planId))
      .find((plan): plan is ResearchPlan => plan?.metadata?.piWorkflowIdempotencyKey === options.idempotencyKey);
    if (existing) return resumeWorkflow(existing.id, options);
  }
  const plan = buildResearchPlan(intent, {
    ...(ticker !== undefined ? { ticker } : {}),
    phases,
    description: `5 步研究闭环: ${phases.join(' → ')}`,
  });
  plan.phase = 'execute';
  plan.status = 'active';
  plan.metadata = {
    ...(plan.metadata ?? {}),
    piWorkflow: true,
    piWorkflowIdempotencyKey: options.idempotencyKey,
  };
  persistPlan(plan);
  auditLog({ planId: plan.id, action: 'phase_advanced', details: { workflow: 'investment-5step', ticker: ticker ?? null, phases, mode } });
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
    return { planId: plan.id, ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}), intent: plan.goal, phases: [], totalDurationMs: 0, success: plan.status === 'completed', finalPlanState: 'done', progress: 100 };
  }
  const remaining = plan.phases.filter((phase) => phaseStepIds(plan, phase).some((stepId) => plan.steps.find((step) => step.id === stepId)?.status !== 'completed'));
  if (remaining.length === 0) {
    plan.phase = 'done';
    plan.status = 'completed';
    plan.completedAt = new Date();
    persistPlan(plan);
    return { planId: plan.id, ...(plan.ticker !== undefined ? { ticker: plan.ticker } : {}), intent: plan.goal, phases: [], totalDurationMs: 0, success: true, finalPlanState: 'done', progress: 100 };
  }
  return executeWorkflow(plan, remaining, options, true);
}

/** Create a durable Pi branch for a paused or completed investment workflow. */
export async function forkWorkflowSession(planId: string, entryId?: string): Promise<string | undefined> {
  const session = await openWorkflowSession(planId);
  const branch = session.fork(entryId);
  if (branch) appendWorkflowEntry(session, { action: 'fork', planId, branchId: branch });
  session.dispose();
  return branch;
}
