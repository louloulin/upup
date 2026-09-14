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
import type { UpUpCreateSessionOptions } from '@upup/pi-runtime';
import type { PiInvestmentWorkflow } from './index.js';

export function createPiInvestmentWorkflow(options: {
  readonly sessionRuntimeFactory: PiSessionServiceFactory;
  readonly cwd?: string;
  readonly sessionOptionsFactory?: (sessionPath: string) => Omit<UpUpCreateSessionOptions, 'sessionPath' | 'cwd'>;
}): PiInvestmentWorkflow {
  const cwd = options.cwd ?? process.cwd();
  const sessionFactory: InvestmentSessionFactory = async (sessionPath) =>
    options.sessionRuntimeFactory().createSession(getInvestmentAgentSpec('invest-plan'), {
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
