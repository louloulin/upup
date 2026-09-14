/**
 * Root bridge for investment workflow orchestration.
 *
 * The orchestration logic lives in `@upup/pi-investment-workflow`'s
 * `orchestration` module. This file:
 *   1. Re-exports the orchestration types and public API so existing
 *      `from './investment-workflow.js'` callers continue to work.
 *   2. Wires the root AgentSession factory into the orchestration via
 *      {@link createInvestmentSessionFactory}, so production callers don't
 *      need to construct the factory themselves.
 *
 * The root runtime factory is dynamically imported to avoid a hard
 * `src/runtime/pi/*` dependency from the package layer (the package
 * accepts the factory as an option, never imports root src/*).
 */

import type { UpUpAgentSession } from '@upup/pi-runtime';
import {
  WORKFLOW_PHASES,
  forkWorkflowSession as packageForkWorkflowSession,
  resumeInvestmentWorkflow as packageResumeInvestmentWorkflow,
  resumeWorkflow as packageResumeWorkflow,
  runInvestmentWorkflow as packageRunInvestmentWorkflow,
  type InvestmentSessionFactory,
  type InvestmentWorkflowOptions,
  type PhaseResult,
  type PhaseStatus,
  type WorkflowResult,
} from '@upup/pi-investment-workflow';

export type {
  InvestmentSessionFactory,
  InvestmentWorkflowOptions,
  PhaseResult,
  PhaseStatus,
  WorkflowResult,
};
export { WORKFLOW_PHASES };

/**
 * Build a production {@link InvestmentSessionFactory} that opens a workflow
 * session via the root AgentSession factory. The factory is dynamically
 * imported so the package layer stays free of root src/* dependencies.
 */
export async function createInvestmentSessionFactory(): Promise<InvestmentSessionFactory> {
  const [{ createPiAgentRuntime }, { getInvestmentAgentSpec }] = await Promise.all([
    import('./agent-session-factory.js'),
    import('./agent-spec.js'),
  ]);
  return async (sessionPath: string): Promise<UpUpAgentSession> =>
    createPiAgentRuntime().createSession(getInvestmentAgentSpec('invest-plan'), {
      cwd: process.cwd(),
      sessionPath,
    });
}

export async function runInvestmentWorkflow(
  intent: string,
  options: InvestmentWorkflowOptions = {},
): Promise<WorkflowResult> {
  const factory = options.sessionFactory ?? (await createInvestmentSessionFactory());
  return packageRunInvestmentWorkflow(intent, { ...options, sessionFactory: factory });
}

export async function resumeInvestmentWorkflow(
  planId: string,
  options: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'> = {},
): Promise<WorkflowResult> {
  const factory = options.sessionFactory ?? (await createInvestmentSessionFactory());
  return packageResumeInvestmentWorkflow(planId, { ...options, sessionFactory: factory });
}

export async function resumeWorkflow(
  planId: string,
  options: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'> = {},
): Promise<WorkflowResult> {
  const factory = options.sessionFactory ?? (await createInvestmentSessionFactory());
  return packageResumeWorkflow(planId, { ...options, sessionFactory: factory });
}

export async function forkWorkflowSession(
  planId: string,
  entryId?: string,
): Promise<string | undefined> {
  const factory = await createInvestmentSessionFactory();
  return packageForkWorkflowSession(planId, entryId, { sessionFactory: factory });
}
