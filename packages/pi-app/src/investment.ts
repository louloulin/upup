import {
  forkWorkflowSession,
  getInvestmentAgentSpec,
  resumeInvestmentWorkflow,
  resumeWorkflow,
  runInvest,
  runInvestmentWorkflow,
  type InvestmentWorkflowOptions,
  type InvestmentSessionFactory,
} from '@upup/pi-investment-workflow';
import type { PiSessionServiceFactory } from '@upup/pi-session';
import type { UpUpAgentSpec, UpUpCreateSessionOptions } from '@upup/pi-runtime';
import { getConfiguredModelId } from '@upup/utils';
import type { PiInvestmentWorkflow } from './app-factory';

export function createPiInvestmentWorkflow(options: {
  readonly sessionRuntimeFactory: PiSessionServiceFactory;
  readonly cwd?: string;
  readonly sessionOptionsFactory?: (sessionPath: string) => Omit<UpUpCreateSessionOptions, 'sessionPath' | 'cwd'>;
}): PiInvestmentWorkflow {
  const cwd = options.cwd ?? process.cwd();
  // Pi resolves the session's `spec.model` through its own catalog, and falls
  // back to Pi's built-in default (deepseek/deepseek-v4-flash) when it is
  // missing — a provider most UpUp installs have no credential for. The
  // deterministic five-phase workflow never calls the LLM (it drives
  // `invest_workflow_phase`), so the gap went unnoticed; LLM-driven paths such
  // as `/invest --sop <id>` fail with "No API key found for deepseek" without
  // it. Bind the user's configured model so every session created here
  // inherits it.
  const baseSpec = getInvestmentAgentSpec('invest-plan');
  const workflowSpec: UpUpAgentSpec = {
    ...baseSpec,
    model: baseSpec.model ?? process.env.DEFAULT_MODEL ?? getConfiguredModelId(),
  };
  const sessionFactory: InvestmentSessionFactory = async (sessionPath) =>
    options.sessionRuntimeFactory().createSession(workflowSpec, {
      cwd,
      sessionPath,
      ...(options.sessionOptionsFactory ? options.sessionOptionsFactory(sessionPath) : {}),
    });
  const run = (intent: string, workflowOptions: InvestmentWorkflowOptions = {}) =>
    runInvestmentWorkflow(intent, { ...workflowOptions, sessionFactory });
  const resumeInvestment = (planId: string, workflowOptions: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'> = {}) =>
    resumeInvestmentWorkflow(planId, { ...workflowOptions, sessionFactory });
  const resume = (planId: string, workflowOptions: Omit<InvestmentWorkflowOptions, 'ticker' | 'phases'> = {}) =>
    resumeWorkflow(planId, { ...workflowOptions, sessionFactory });
  const fork = (planId: string, entryId?: string) => forkWorkflowSession(planId, entryId, { sessionFactory });
  const executeInvest = (args: string) => runInvest(args, { sessionFactory });
  return {
    sessionFactory,
    runInvestmentWorkflow: run,
    resumeInvestmentWorkflow: resumeInvestment,
    resumeWorkflow: resume,
    forkWorkflowSession: fork,
    runInvest: executeInvest,
    commandHandler: executeInvest,
  };
}
