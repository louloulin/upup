import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {createPiCapabilityHostResolver, definePiCapabilityHost} from '@upup/pi-capability-registry';
import { CANONICAL_INVESTMENT_PHASES, executeInvestmentPhase, type InvestmentAgentProfileId, type InvestmentWorkflowServices } from '../src/index';

const PACKAGE = '@upup/pi-investment-workflow';
const VERSION = '0.1.0';
const parameters = Type.Object({
  phase: Type.Union(CANONICAL_INVESTMENT_PHASES.map((phase) => Type.Literal(phase))),
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  market: Type.Optional(Type.Union([Type.Literal('cn'), Type.Literal('hk'), Type.Literal('us'), Type.Literal('fund'), Type.Literal('crypto')])),
  goal: Type.Optional(Type.String({ maxLength: 2_000 })),
});
const canonicalParameters = Type.Object({
  phase: Type.Union(CANONICAL_INVESTMENT_PHASES.map((phase) => Type.Literal(phase))),
  profile: Type.Union([Type.Literal('researcher'), Type.Literal('analyst'), Type.Literal('risk-manager'), Type.Literal('portfolio-manager'), Type.Literal('backtest-engineer'), Type.Literal('monitor'), Type.Literal('reviewer')]),
  workflowId: Type.String({ minLength: 1, maxLength: 128 }),
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  market: Type.Optional(Type.Union([Type.Literal('cn'), Type.Literal('hk'), Type.Literal('us'), Type.Literal('fund'), Type.Literal('crypto')])),
  goal: Type.Optional(Type.String({ maxLength: 2_000 })),
});

interface InvestmentWorkflowHost {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly capabilities: readonly string[];
  readonly providers: { workflow?: { getInvestmentWorkflowServices?: () => InvestmentWorkflowServices } };
}

/** Reject the metadata-only self-publish so it is not memoized as the answer. */
function isUsableHost(host: InvestmentWorkflowHost | undefined): boolean {
  return Boolean(
    host
    && host.packageName === PACKAGE
    && host.packageVersion === VERSION
    && host.capabilities.includes('investment-workflow')
    && host.providers.workflow?.getInvestmentWorkflowServices,
  );
}

export default function investmentWorkflowExtension(pi: ExtensionAPI): void {
  // Sprint D: self-publish the capability host so the extension is
  // self-contained (resolvable via `resolvePiCapabilityHost` without the
  // agent-session-factory side-channel). Session-level providers still flow
  // through the orchestrator's later publish — both publishers coexist and
  // last-write-wins. The host we publish here is metadata-only.
  definePiCapabilityHost(pi, {
    packageName: PACKAGE,
    packageVersion: VERSION,
        capabilities: ['investment-workflow', 'tool-definitions'] as readonly string[],
    providers: {},
    register: () => undefined,
  });

  // Resolve per tool call: Pi loads extensions before the session publishes its
  // provider tree, so a load-time snapshot would be empty for the whole session.
  const resolveHost = createPiCapabilityHostResolver<InvestmentWorkflowHost>(pi.events, PACKAGE, isUsableHost);
  const resolveServices = () => resolveHost()?.providers.workflow?.getInvestmentWorkflowServices;
  pi.registerTool({
    name: 'invest_workflow_phase',
    label: 'Investment Workflow Phase',
    description: 'Execute one auditable phase of the five-step investment workflow through the trusted Pi host.',
    parameters,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    const services = resolveServices();
    if (!services) return { content: [{ type: 'text', text: 'investment-workflow capability is unavailable; execution is fail-closed' }], isError: true, details: { auditId: toolCallId, capability: 'investment-workflow', policy: 'fail-closed' } };
    try {
      const result = await executeInvestmentPhase(params.phase, { ...(params.ticker === undefined ? {} : { ticker: params.ticker }), ...(params.market === undefined ? {} : { market: params.market }), ...(params.goal === undefined ? {} : { goal: params.goal }) }, services(), signal);
      return { content: [{ type: 'text', text: result.output }], ...(result.error ? { isError: true, details: undefined } : {}), details: { auditId: toolCallId, evidence: result.evidence, dataFreshness: params.phase === 'execute' ? 'historical' : 'live', ...(result.error ? { error: result.error } : {}) } };
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
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      const services = resolveServices();
      if (!services) return { content: [{ type: 'text', text: 'investment-workflow capability is unavailable; execution is fail-closed' }], isError: true, details: { auditId: toolCallId, policy: 'fail-closed' } };
      const result = await executeInvestmentPhase(params.phase, { ...(params.ticker === undefined ? {} : { ticker: params.ticker }), ...(params.market === undefined ? {} : { market: params.market }), ...(params.goal === undefined ? {} : { goal: params.goal }) }, services(), signal);
      return { content: [{ type: 'text', text: result.output }], ...(result.error ? { isError: true, details: undefined } : {}), details: { auditId: toolCallId, workflowId: params.workflowId, phase: params.phase, profile: params.profile as InvestmentAgentProfileId, evidence: result.evidence } };
    },
  });
}
