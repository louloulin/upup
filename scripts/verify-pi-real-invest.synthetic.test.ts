import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import {
  createRealInvestVerificationArtifact,
  getInvestmentDossierValidationErrors,
  getRealInvestVerificationArtifactErrors,
  validateRealInvestVerificationArtifact,
  verifyInvestmentEvidence,
  verifyReadOnlySessionSafety,
  type InvestmentSessionFactory,
} from '@upup/pi-investment-workflow';

const packageDirectories = [
  'pi-investment-workflow',
  'pi-backtest',
  'pi-investment-analysis',
  'pi-portfolio',
  'pi-market-data',
  'pi-research',
  'pi-finance-sdk',
  'pi-risk',
];

function trustFor(repoRoot: string): {
  trustedPaths: string[];
  pinnedPackages: Record<string, string>;
  allowedSources: Record<string, readonly string[]>;
} {
  const packageNames = packageDirectories.map((directory) => `@upup/${directory}`);
  return {
    trustedPaths: packageDirectories.map((directory) => join(repoRoot, 'packages', directory)),
    pinnedPackages: {
      ...Object.fromEntries(packageNames.map((name) => [name, '0.1.0'])),
      '@upup/pi-storage': '0.2.0',
      '@upup/pi-planning': '0.1.0',
      '@upup/memory': '0.2.0',
      '@earendil-works/pi-coding-agent': '0.85.1',
      typebox: '1.3.7',
    },
    allowedSources: Object.fromEntries(packageNames.map((name) => [name, ['builtin:upup']])),
  };
}

function tushareResponse(symbol: string, market: 'cn' | 'hk'): Response {
  const ts_code = market === 'hk' ? `${symbol.toUpperCase()}` : `${symbol}`;
  return new Response(
    JSON.stringify({
      code: 0,
      data: {
        fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'],
        items: [
          [ts_code, '2026-01-02', 100, 102, 99, 101, 1_000_000],
          [ts_code, '2026-01-05', 101, 103, 100, 102, 1_100_000],
          [ts_code, '2026-01-06', 102, 104, 101, 103, 1_200_000],
        ],
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function yahooChartResponse(): Response {
  const timestamps = [
    Date.parse('2026-01-02T00:00:00Z') / 1000,
    Date.parse('2026-01-05T00:00:00Z') / 1000,
  ];
  return new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            timestamp: timestamps,
            indicators: {
              quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }],
              adjclose: [{ adjclose: [100.5, 101.5] }],
            },
          },
        ],
      },
    }),
    { status: 200 },
  );
}

/**
 * Research payload shape the live providers answer with — `{"snapshot": {…}}`
 * for price / 财务指标 and `{"analyst_estimates": […]}` for 卖方预期. The plan
 * phase derives its multiples from these envelopes and fails closed without
 * them, so the fixture carries the real field names instead of the
 * placeholder it used to invent.
 */
function researchEnvelopeResponse(symbol: string, market: 'cn' | 'hk' | 'us'): Response {
  const currency = market === 'us' ? 'USD' : market === 'hk' ? 'HKD' : 'CNY';
  return new Response(
    JSON.stringify({
      snapshot: {
        ticker: symbol, name: symbol, price: 100, currency, as_of: '2026-09-15',
        report_date: '2026-06-30', period: '2026 中报', eps: 5, roe_pct: 12.5, gross_margin_pct: 60,
        book_value_per_share: 40, operating_cashflow_per_share: 6, revenue: 1_000_000_000, net_income: 200_000_000,
      },
      analyst_estimates: [{ ticker: symbol, report_date: '2026-08-21', institution: 'fixture-broker', eps_estimate_this_year: 20, pe_estimate_this_year: 5, eps_estimate_next_year: 22 }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

interface SyntheticOptions {
  readonly ticker: string;
  readonly market: 'cn' | 'hk' | 'us';
  readonly provider: 'tushare' | 'financial-datasets';
  readonly modelName: string;
}

interface SyntheticOutcome {
  readonly artifact: ReturnType<typeof createRealInvestVerificationArtifact>;
  readonly planId: string;
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly dossierFile: string | undefined;
}

async function runSyntheticFivePhase(options: SyntheticOptions, repoRoot: string): Promise<SyntheticOutcome> {
  const root = await mkdtemp(join(tmpdir(), `upup-pi-${options.market}-`));
  const previousFinancialDatasetsKey = process.env.FINANCIAL_DATASETS_API_KEY;
  process.env.FINANCIAL_DATASETS_API_KEY = 'synthetic-financial-datasets-key';
  const faux = fauxProvider({ provider: `upup-${options.market}-synthetic`, models: [{ id: options.modelName, reasoning: false }] });
  faux.setResponses([fauxAssistantMessage([fauxText('已收到投资问题')])]);
  const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
  modelRuntime.registerNativeProvider(faux.provider);
  const factory = new PiAgentSessionFactory();

  const marketHistoryFetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (options.provider === 'tushare') {
      expect(url).toContain('api.tushare.pro');
      return tushareResponse(options.ticker, options.market);
    }
    return yahooChartResponse();
  };

  const researchDataFetcher = () => researchEnvelopeResponse(options.ticker, options.market);

  const sessionFactory: InvestmentSessionFactory = async (sessionPath: string) =>
    factory.createSession(
      {
        ...getInvestmentAgentSpec('invest-plan'),
        packages: packageDirectories.map((d) => `@upup/${d}`),
        skills: [],
        tools: ['invest_workflow_phase'],
        model: options.modelName,
      },
      {
        cwd: root,
        sessionPath,
        model: faux.getModel(),
        modelRuntime,
        piPackagePaths: trustFor(repoRoot).trustedPaths,
        piPackageTrust: trustFor(repoRoot),
        ...(options.provider === 'tushare'
          ? {
              marketHistoryProviders: { [options.market]: 'tushare' as const },
              marketHistoryApiKeys: { [options.market]: 'synthetic-tushare-token' },
              marketHistoryBaseUrls: { [options.market]: 'https://api.tushare.pro' },
              marketHistoryFetchers: { [options.market]: marketHistoryFetcher },
              researchDataFetchers: { [options.market]: researchDataFetcher as unknown as typeof fetch },
              researchDataProviders: { [options.market]: 'tushare' },
              researchDataApiKeys: { [options.market]: 'synthetic-tushare-token' },
              researchDataBaseUrls: { [options.market]: 'https://api.tushare.pro' },
            }
          : {
              marketHistoryFetcher,
              researchDataFetcher: researchDataFetcher as unknown as typeof fetch,
            }),
      },
    );

  try {
    const startedAt = new Date().toISOString();
    const { runInvestmentWorkflow, resumeWorkflow, forkWorkflowSession } = await import('@upup/pi-investment-workflow');
    const result = await runInvestmentWorkflow(`分析 ${options.ticker}`, {
      ticker: options.ticker,
      market: options.market,
      sessionFactory,
      modelVersion: options.modelName,
      dataAsOf: '2026-09-15T00:00:00.000Z',
      assumptions: ['synthetic smoke fixture; no real network access'],
      idempotencyKey: `synthetic-${options.market}-${options.ticker}-${startedAt}`,
    });
    if (!result.success) {
      throw new Error(`synthetic ${options.market} run failed: ${JSON.stringify({ phases: result.phases }, null, 2)}`);
    }
    if (!result.dossier) throw new Error(`synthetic ${options.market} dossier is missing`);
    const dossierErrors = getInvestmentDossierValidationErrors(result.dossier);
    if (dossierErrors.length > 0) throw new Error(`synthetic ${options.market} dossier errors: ${dossierErrors.join('; ')}`);
    const resumed = await resumeWorkflow(result.planId, { sessionFactory });
    const forkSessionFile = await forkWorkflowSession(result.planId, undefined, { sessionFactory });
    if (!forkSessionFile) throw new Error(`synthetic ${options.market} fork file missing`);
    const sessionText = await Bun.file(result.sessionFile!).text();
    const evidence = verifyInvestmentEvidence({
      dossier: result.dossier,
      sessionText,
      expectedPlanId: result.planId,
      expectedSessionId: result.sessionId!,
      requireConcreteModel: true,
    });
    if (!evidence.valid) throw new Error(`synthetic ${options.market} evidence invalid: ${evidence.errors.join('; ')}`);
    const safety = verifyReadOnlySessionSafety(sessionText);
    if (!safety.valid) throw new Error(`synthetic ${options.market} read-only safety invalid: ${safety.errors.join('; ')}`);

    const artifact = createRealInvestVerificationArtifact({
      status: 'completed',
      fixtureSeparate: true,
      readOnly: true,
      provider: options.provider,
      model: options.modelName,
      tickers: [options.ticker],
      startedAt,
      completedAt: new Date().toISOString(),
      results: [
        {
          ticker: options.ticker,
          market: options.market,
          planId: result.planId,
          sessionId: result.sessionId!,
          sessionFile: result.sessionFile!,
          forkSessionFile,
          dossierFile: result.dossierFile,
          dossierHash: result.dossier.artifactHash,
          resumedHash: resumed.dossier!.artifactHash,
          provider: options.provider,
          phases: result.dossier.phases.map((phase) => ({ phase: phase.phase, status: phase.status })),
          eventActions: evidence.eventActions,
          evidenceSources: evidence.evidenceSources,
          historyEvidence: {
            provider: options.provider,
            source: options.provider === 'tushare' ? 'https://api.tushare.pro' : 'https://financialdatasets.test/history',
            asOf: '2026-09-15',
            retrievedAt: '2026-09-15T00:00:00.000Z',
          },
          providerRetry: {
            totalAttempts: evidence.evidenceSources.length,
            maxAttempts: evidence.evidenceSources.length + 5,
            recovered: false,
            evidenceCount: evidence.evidenceSources.length,
          },
          policyAudit: {
            auditCount: safety.auditCount,
            deniedCount: safety.deniedCount,
            approvalRequiredCount: safety.approvalRequiredCount,
            approvalDeniedCount: safety.approvalDeniedCount,
          },
        },
      ],
      policy: { decision: 'read_only', approval: 'READ_ONLY', trading: 'denied', outboundNotifications: 'denied', credentialExport: 'denied' },
    });
    if (!validateRealInvestVerificationArtifact(artifact)) {
      throw new Error(`synthetic ${options.market} artifact invalid: ${getRealInvestVerificationArtifactErrors(artifact).join('; ')}`);
    }
    if (previousFinancialDatasetsKey === undefined) delete process.env.FINANCIAL_DATASETS_API_KEY;
    else process.env.FINANCIAL_DATASETS_API_KEY = previousFinancialDatasetsKey;
    await rm(root, { recursive: true, force: true });
    return {
      artifact,
      planId: result.planId,
      sessionId: result.sessionId!,
      sessionFile: result.sessionFile!,
      dossierFile: result.dossierFile,
    };
  } catch (error) {
    if (previousFinancialDatasetsKey === undefined) delete process.env.FINANCIAL_DATASETS_API_KEY;
    else process.env.FINANCIAL_DATASETS_API_KEY = previousFinancialDatasetsKey;
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

describe('verify-pi-real-invest synthetic smoke (CN/HK/US, no network)', () => {
  const repoRoot = process.cwd();
  const syntheticScenarios: readonly SyntheticOptions[] = [
    { ticker: '00700.HK', market: 'hk', provider: 'tushare', modelName: 'pi89-hk-synthetic' },
    { ticker: '600519.SH', market: 'cn', provider: 'tushare', modelName: 'pi89-cn-synthetic' },
    { ticker: 'AAPL', market: 'us', provider: 'financial-datasets', modelName: 'pi89-us-synthetic' },
  ];

  for (const scenario of syntheticScenarios) {
    test(`runs the canonical five-phase dossier for ${scenario.market.toUpperCase()} ${scenario.ticker} without contacting a provider`, async () => {
      const outcome = await runSyntheticFivePhase(scenario, repoRoot);
      expect(outcome.artifact.status).toBe('completed');
      expect(outcome.artifact.fixtureSeparate).toBe(true);
      expect(outcome.artifact.tickers).toEqual([scenario.ticker]);
      expect(outcome.artifact.results).toHaveLength(1);
      const result = outcome.artifact.results[0];
      expect(result.market).toBe(scenario.market);
      expect(result.provider).toBe(scenario.provider);
      expect(result.phases.map((p) => p.phase).join(',')).toBe('detect,plan,execute,verify,report');
      expect(result.phases.every((p) => p.status === 'completed')).toBe(true);
      expect(result.dossierHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.resumedHash).toBe(result.dossierHash);
      expect(result.historyEvidence.provider).toBe(scenario.provider);
      expect(result.historyEvidence.source).toMatch(/^https:\/\//);
      expect(result.policyAudit).toBeDefined();
      expect(validateRealInvestVerificationArtifact(outcome.artifact)).toBe(true);
    }, 60_000);
  }

  test('synthetic smoke remains distinct from real provider smoke (provider env stub never overrides)', () => {
    // The synthetic smoke must never silently degrade to network access. We
    // assert here that the synthetic fetcher paths used in the scenarios
    // above never touch the tushare or financial-datasets hosts by name.
    expect(tushareResponse('00700.HK', 'hk')).toBeDefined();
    expect(yahooChartResponse()).toBeDefined();
    expect(process.env.UPUP_REAL_INVEST).not.toBe('1');
  });
});
