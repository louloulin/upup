import { describe, expect, test } from 'bun:test';
import { fauxProvider } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createRealInvestVerificationArtifact,
  getInvestmentDossierValidationErrors,
  validateRealInvestVerificationArtifact,
  verifyInvestmentEvidence,
  getInvestmentAgentSpec,
  runInvestmentWorkflow,
  resumeWorkflow,
} from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';

const packageNames = [
  '@upup/pi-investment-workflow',
  '@upup/pi-backtest',
  '@upup/pi-investment-analysis',
  '@upup/pi-portfolio',
  '@upup/pi-market-data',
  '@upup/pi-research',
  '@upup/pi-finance-sdk',
  '@upup/pi-risk',
] as const;
const packageDirectories = ['pi-investment-workflow', 'pi-backtest', 'pi-investment-analysis', 'pi-portfolio', 'pi-market-data', 'pi-research', 'pi-finance-sdk', 'pi-risk'] as const;

function trustFor(root: string) {
  return {
    trustedPaths: packageDirectories.map((directory) => join(root, 'packages', directory)),
    pinnedPackages: {
      ...Object.fromEntries(packageNames.map((name) => [name, '0.1.0'])),
      '@upup/pi-storage': '0.2.0',
      '@upup/pi-planning': '0.1.0',
      '@upup/memory': '0.2.0',
      '@earendil-works/pi-coding-agent': '0.85.1',
      typebox: '1.3.7',
    } as Record<string, string>,
    allowedSources: Object.fromEntries(packageNames.map((name) => [name, ['builtin:upup']])) as Record<string, readonly string[]>,
  };
}

function researchResponse(input: RequestInfo | URL): Response {
  return new Response(JSON.stringify({ ticker: 'AAPL', endpoint: new URL(String(input)).pathname, value: 100 }), { status: 200 });
}

function historyResponse(): Response {
  const timestamps = [Date.parse('2026-01-02T00:00:00Z') / 1000, Date.parse('2026-01-05T00:00:00Z') / 1000];
  return new Response(JSON.stringify({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }] } }] } }), { status: 200 });
}

describe('Pi investment evidence product contract', () => {
  test('runs and resumes a complete five-phase fixture with auditable evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-evidence-'));
    const plansDirectory = join(root, 'plans');
    const previousPlansDirectory = process.env.UPUP_PLANS_DIR;
    const previousResearchApiKey = process.env.FINANCIAL_DATASETS_API_KEY;
    process.env.UPUP_PLANS_DIR = plansDirectory;
    process.env.FINANCIAL_DATASETS_API_KEY = 'fixture-only-not-a-real-credential';
    const faux = fauxProvider({ provider: 'upup-investment-evidence-fixture', models: [{ id: 'evidence-fixture-model', reasoning: false }] });
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const factory = new PiAgentSessionFactory();
    const sessionFactory = async (sessionPath: string) => factory.createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      packages: [...packageNames],
      skills: [],
      tools: ['invest_workflow_phase'],
      model: 'evidence-fixture-model',
    }, {
      cwd: root,
      sessionPath,
      model: faux.getModel(),
      modelRuntime,
      piPackagePaths: trustFor(process.cwd()).trustedPaths,
      piPackageTrust: trustFor(process.cwd()),
      researchDataFetcher: researchResponse as unknown as typeof fetch,
      marketHistoryFetcher: async () => historyResponse(),
    });
    try {
      const result = await runInvestmentWorkflow('分析 AAPL', { ticker: 'AAPL', market: 'us', sessionFactory, modelVersion: 'evidence-fixture-model', dataAsOf: '2026-09-15T00:00:00.000Z' });
      if (!result.success) throw new Error(JSON.stringify({ phases: result.phases, dossier: result.dossier }, null, 2));
      expect(result.dossier).toBeDefined();
      expect(getInvestmentDossierValidationErrors(result.dossier)).toEqual([]);
      expect(result.dossier!.phases.every((phase) => phase.status === 'completed')).toBe(true);
      expect(result.dossier!.phases.every((phase) => phase.modelVersion === 'evidence-fixture-model')).toBe(true);
      expect(result.dossier!.phases[0]?.evidence.some((evidence) => evidence.retryAttempts === 1 && evidence.retryMaxAttempts === 3 && evidence.retryRecovered === false)).toBe(true);
      const sessionText = await readFile(result.sessionFile!, 'utf8');
      const evidence = verifyInvestmentEvidence({ dossier: result.dossier, sessionText, expectedPlanId: result.planId, expectedSessionId: result.sessionId!, requireConcreteModel: true });
      expect(evidence.valid).toBe(true);
      expect(evidence.phaseNames).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
      expect(evidence.eventActions).toContain('complete');
      expect(evidence.evidenceSources.some((source) => source.startsWith('https://'))).toBe(true);
      const resumed = await resumeWorkflow(result.planId, { sessionFactory });
      expect(resumed.dossier?.artifactHash).toBe(result.dossier?.artifactHash);
      const artifact = createRealInvestVerificationArtifact({
        status: 'completed', fixtureSeparate: true, readOnly: true, provider: 'fixture-provider', model: 'evidence-fixture-model', tickers: ['AAPL'],
        startedAt: '2026-09-15T00:00:00.000Z', completedAt: '2026-09-15T00:01:00.000Z',
        results: [{ ticker: 'AAPL', market: 'us', planId: result.planId, sessionId: result.sessionId!, sessionFile: result.sessionFile!, forkSessionFile: result.sessionFile!, dossierFile: result.dossierFile!, dossierHash: result.dossier!.artifactHash, resumedHash: resumed.dossier!.artifactHash, provider: 'fixture-provider', phases: result.dossier!.phases.map((phase) => ({ phase: phase.phase, status: phase.status })), eventActions: evidence.eventActions, evidenceSources: evidence.evidenceSources, historyEvidence: { provider: 'fixture-provider', source: 'https://fixture.test/history', asOf: '2026-09-14', retrievedAt: '2026-09-15T00:00:00.000Z' }, providerRetry: { totalAttempts: 5, maxAttempts: 15, recovered: false, evidenceCount: 5 }, policyAudit: { auditCount: 0, deniedCount: 0, approvalRequiredCount: 0, approvalDeniedCount: 0 } }],
        policy: { decision: 'read_only', approval: 'READ_ONLY', trading: 'denied', outboundNotifications: 'denied', credentialExport: 'denied' },
      });
      expect(validateRealInvestVerificationArtifact(artifact)).toBe(true);
    } finally {
      if (previousPlansDirectory === undefined) delete process.env.UPUP_PLANS_DIR;
      else process.env.UPUP_PLANS_DIR = previousPlansDirectory;
      if (previousResearchApiKey === undefined) delete process.env.FINANCIAL_DATASETS_API_KEY;
      else process.env.FINANCIAL_DATASETS_API_KEY = previousResearchApiKey;
    }
  });
});
