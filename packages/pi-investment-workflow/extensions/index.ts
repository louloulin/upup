import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolvePiCapabilityHost } from '@upup/pi-capability-registry';
import { CANONICAL_INVESTMENT_PHASES, executeInvestmentPhase, type InvestmentAgentProfileId, type InvestmentWorkflowServices } from '../src/index.js';

const PACKAGE = '@upup/pi-investment-workflow';
const VERSION = '0.1.0';
const parameters = Type.Object({
  phase: Type.Union([Type.Literal('research'), Type.Literal('valuation'), Type.Literal('backtest'), Type.Literal('trade'), Type.Literal('review')]),
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  goal: Type.Optional(Type.String({ maxLength: 2_000 })),
});
const canonicalParameters = Type.Object({
  phase: Type.Union(CANONICAL_INVESTMENT_PHASES.map((phase) => Type.Literal(phase))),
  profile: Type.Union([Type.Literal('researcher'), Type.Literal('analyst'), Type.Literal('risk-manager'), Type.Literal('portfolio-manager'), Type.Literal('backtest-engineer'), Type.Literal('monitor'), Type.Literal('reviewer')]),
  workflowId: Type.String({ minLength: 1, maxLength: 128 }),
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  goal: Type.Optional(Type.String({ maxLength: 2_000 })),
});

function host(): { services?: () => InvestmentWorkflowServices } | undefined {
  const value = resolvePiCapabilityHost<{ packageName: string; packageVersion: string; capabilities: readonly string[]; getInvestmentWorkflowServices?: () => InvestmentWorkflowServices }>(PACKAGE, undefined);
  if (!value || value.packageName !== PACKAGE || value.packageVersion !== VERSION || !value.capabilities.includes('investment-workflow') || !value.getInvestmentWorkflowServices) return undefined;
  return { services: value.getInvestmentWorkflowServices };
}

export default function investmentWorkflowExtension(pi: ExtensionAPI): void {
  const services = host()?.services;
  pi.registerTool({
    name: 'invest_workflow_phase',
    label: 'Investment Workflow Phase',
    description: 'Execute one auditable phase of the five-step investment workflow through the trusted Pi host.',
    parameters,
    async execute(toolCallId, params, signal) {
    if (!services) return { content: [{ type: 'text', text: 'investment-workflow capability is unavailable; execution is fail-closed' }], isError: true, details: { auditId: toolCallId, capability: 'investment-workflow', policy: 'fail-closed' } };
    try {
      const result = await executeInvestmentPhase(params.phase, { ...(params.ticker === undefined ? {} : { ticker: params.ticker }), ...(params.goal === undefined ? {} : { goal: params.goal }) }, services(), signal);
      return { content: [{ type: 'text', text: result.output }], ...(result.error ? { isError: true } : {}), details: { auditId: toolCallId, evidence: result.evidence, dataFreshness: params.phase === 'backtest' ? 'historical' : 'live', ...(result.error ? { error: result.error } : {}) } };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
        details: { auditId: toolCallId, capability: 'investment-workflow', policy: 'execution-error' },
      };
    }
    },
  });
  pi.registerTool({
    name: 'invest_workflow',
    label: 'Investment Workflow',
    description: 'Run one canonical, auditable Pi investment workflow phase: detect, plan, execute, verify, or report.',
    parameters: canonicalParameters,
    async execute(toolCallId, params, signal) {
      if (!services) return { content: [{ type: 'text', text: 'investment-workflow capability is unavailable; execution is fail-closed' }], isError: true, details: { auditId: toolCallId, policy: 'fail-closed' } };
      const legacyPhase = params.phase === 'detect' || params.phase === 'plan' ? 'research' : params.phase === 'execute' ? 'backtest' : params.phase === 'verify' ? 'review' : 'review';
      const result = await executeInvestmentPhase(legacyPhase, { ...(params.ticker === undefined ? {} : { ticker: params.ticker }), ...(params.goal === undefined ? {} : { goal: params.goal }) }, services(), signal);
      return { content: [{ type: 'text', text: result.output }], ...(result.error ? { isError: true } : {}), details: { auditId: toolCallId, workflowId: params.workflowId, phase: params.phase, profile: params.profile as InvestmentAgentProfileId, evidence: result.evidence } };
    },
  });
}
