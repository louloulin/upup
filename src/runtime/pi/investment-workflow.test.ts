import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { fauxProvider } from '@earendil-works/pi-ai';
import { forkWorkflowSession, getInvestmentAgentSpec, resumeWorkflow, runInvestmentWorkflow, type InvestmentSessionFactory } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';

const root = join(tmpdir(), `upup-pi-workflow-${Date.now()}`);
process.env.UPUP_PLANS_DIR = join(root, 'plans');

const packageDirectories = ['pi-investment-workflow', 'pi-backtest', 'pi-investment-analysis', 'pi-portfolio', 'pi-market-data', 'pi-research', 'pi-finance-sdk', 'pi-risk'];
const fixtureModel = 'workflow-fixture-model';

/** Provider payload shapes the live research clients answer with. */
function fixtureResearchResponse(input: RequestInfo | URL): Response {
  const pathname = new URL(String(input)).pathname;
  const body = pathname.includes('prices')
    ? { snapshot: { ticker: 'AAPL', price: 100, currency: 'USD', as_of: '2026-09-15' } }
    : { snapshot: { ticker: 'AAPL', name: 'Apple Inc.', report_date: '2026-06-30', period: '2026 中报', eps: 5, roe_pct: 12.5, gross_margin_pct: 60, book_value_per_share: 40, operating_cashflow_per_share: 6, revenue: 1_000_000_000, net_income: 200_000_000 } };
  return new Response(JSON.stringify(body), { status: 200 });
}

function fixtureHistoryResponse(): Response {
  const timestamps = [Date.parse('2026-01-02T00:00:00Z') / 1000, Date.parse('2026-01-05T00:00:00Z') / 1000];
  return new Response(JSON.stringify({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }] } }] } }), { status: 200 });
}

/**
 * Fixture session: the phases read real provider payloads, so a workflow run
 * without credentials needs a session whose research/history clients answer
 * with the same envelopes the live providers use.
 */
let fixtureSessionFactoryPromise: Promise<InvestmentSessionFactory> | undefined;
function fixtureSessionFactory(): Promise<InvestmentSessionFactory> {
  fixtureSessionFactoryPromise ??= (async () => {
    const faux = fauxProvider({ provider: 'upup-workflow-fixture', models: [{ id: fixtureModel, reasoning: false }] });
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const factory = new PiAgentSessionFactory();
    const packageNames = packageDirectories.map((directory) => `@upup/${directory}`);
    const piPackagePaths = packageDirectories.map((directory) => join(process.cwd(), 'packages', directory));
    return async (sessionPath: string) => factory.createSession(
      { ...getInvestmentAgentSpec('invest-plan'), packages: packageNames, skills: [], tools: ['invest_workflow_phase'], model: fixtureModel },
      {
        cwd: root,
        sessionPath,
        model: faux.getModel(),
        modelRuntime,
        piPackagePaths,
        piPackageTrust: {
          trustedPaths: piPackagePaths,
          pinnedPackages: {
            ...Object.fromEntries(packageNames.map((name) => [name, '0.1.0'])),
            '@upup/pi-storage': '0.2.0',
            '@upup/pi-planning': '0.1.0',
            '@upup/memory': '0.2.0',
            '@earendil-works/pi-coding-agent': '0.85.1',
            typebox: '1.3.7',
          },
          allowedSources: Object.fromEntries(packageNames.map((name) => [name, ['builtin:upup']])),
        },
        researchDataFetcher: fixtureResearchResponse as unknown as typeof fetch,
        researchDataApiKeys: { us: 'fixture-only-not-a-real-credential' },
        researchDataProviders: { us: 'financial-datasets' },
        researchDataBaseUrls: { us: 'https://fixture.test' },
        marketHistoryFetcher: async () => fixtureHistoryResponse(),
      },
    );
  })();
  return fixtureSessionFactoryPromise;
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('Pi investment workflow', () => {
  test('persists phase checkpoints as Pi custom entries and pauses', async () => {
    const sessionFactory = await fixtureSessionFactory();
    const result = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['plan', 'report'],
      pauseAfterPhase: 'plan',
      sessionFactory,
    });

    expect(result.paused).toBe(true);
    expect(result.finalPlanState).toBe('review');
    expect(result.sessionFile).toBeDefined();
    expect(result.dossierFile).toBeDefined();
    expect(result.dossier?.schema).toBe('upup.pi.investment-dossier.v1');
    expect(result.dossier?.status).toBe('paused');
    expect(result.dossier?.currentPhase).toBe('report');
    expect(result.dossier?.phases.map((phase) => phase.phase)).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
    expect(result.dossier?.phases[1]?.status).toBe('completed');
    expect(result.dossier?.phases[4]?.status).toBe('pending');
    expect(readFileSync(result.dossierFile!, 'utf8')).toContain('"artifactHash"');
    const sessionText = readFileSync(result.sessionFile!, 'utf8');
    expect(sessionText).toContain('upup-investment-workflow');
    expect(sessionText).toContain('"action":"pause"');
  });

  test('resumes a paused plan and records completion in the same Pi session', async () => {
    const sessionFactory = await fixtureSessionFactory();
    const paused = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['plan', 'report'],
      pauseAfterPhase: 'plan',
      sessionFactory,
    });
    const resumed = await resumeWorkflow(paused.planId, { sessionFactory });

    expect(resumed.paused).not.toBe(true);
    expect(resumed.finalPlanState).toBe('done');
    expect(resumed.sessionFile).toBe(paused.sessionFile);
    expect(resumed.dossierFile).toBeDefined();
    expect(resumed.dossier?.status).toBe('completed');
    expect(resumed.dossier?.currentPhase).toBe('report');
    expect(resumed.dossier?.phases[0]?.status).toBe('pending');
    expect(resumed.dossier?.phases[1]?.status).toBe('completed');
    expect(resumed.dossier?.phases[0]?.status).toBe('pending');
    expect(resumed.dossier?.phases[2]?.status).toBe('pending');
    expect(resumed.dossier?.phases[3]?.status).toBe('pending');
    expect(resumed.dossier?.phases[4]?.status).toBe('completed');
    const reopened = await resumeWorkflow(resumed.planId, { sessionFactory });
    expect(reopened.dossier?.artifactHash).toBe(resumed.dossier?.artifactHash);
    expect(reopened.sessionFile).toBe(resumed.sessionFile);
    expect(readFileSync(resumed.sessionFile!, 'utf8')).toContain('"action":"complete"');
  });

  test('forks a Pi workflow session without changing the source plan', async () => {
    const sessionFactory = await fixtureSessionFactory();
    const result = await runInvestmentWorkflow('分析 NVDA', { phases: ['detect', 'plan'], sessionFactory });
    const branchId = await forkWorkflowSession(result.planId, undefined, { sessionFactory });

    expect(branchId).toBeString();
    expect(existsSync(result.sessionFile!)).toBe(true);
  });

  test('reuses an existing plan for the same idempotency key', async () => {
    const sessionFactory = await fixtureSessionFactory();
    const first = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['detect'],
      idempotencyKey: 'workflow-test-1',
      sessionFactory,
    });
    const second = await runInvestmentWorkflow('分析 AAPL', {
      phases: ['detect'],
      idempotencyKey: 'workflow-test-1',
      sessionFactory,
    });
    expect(second.planId).toBe(first.planId);
    expect(second.finalPlanState).toBe('done');
  });

  test('serializes concurrent runs for the same idempotency key', async () => {
    const key = `workflow-concurrent-${Date.now()}`;
    const sessionFactory = await fixtureSessionFactory();
    const [first, second] = await Promise.all([
      runInvestmentWorkflow('分析 AAPL', { phases: ['plan'], idempotencyKey: key, sessionFactory }),
      runInvestmentWorkflow('分析 AAPL', { phases: ['plan'], idempotencyKey: key, sessionFactory }),
    ]);

    expect(second.planId).toBe(first.planId);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.dossier?.artifactHash).toBe(first.dossier?.artifactHash);
  });
});
