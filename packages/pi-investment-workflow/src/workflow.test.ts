import { describe, expect, test } from 'bun:test';
import { CANONICAL_INVESTMENT_PHASES, createInvestmentWorkflowArtifact, executeInvestmentPhase, INVESTMENT_AGENT_PROFILES, type InvestmentWorkflowServices } from './workflow';
import { createInvestmentDossier, validateInvestmentDossier } from './investment-dossier';

const services: InvestmentWorkflowServices = {
  getResearchData: async () => ({ price: '100', ratios: 'PE 10', estimates: 'stable', earnings: 'positive', filings: '10-K' }),
  getFundHistory: async () => [{ date: '2026-01-01', nav: 1 }, { date: '2026-06-01', nav: 1.1 }],
  getMarketHistory: async () => ({ bars: [{ date: '2026-01-01', open: 100, high: 102, low: 99, close: 100, volume: 1000 }, { date: '2026-06-01', open: 110, high: 112, low: 109, close: 110, volume: 1200 }], evidence: { source: 'test://market-history', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: '2026-06-01', query: 'AAPL', dataFreshness: 'historical', auditId: 'workflow-test' } }),
  getSandboxState: async () => ({ positions: [{ symbol: 'AAPL', quantity: 10, avgCost: 100 }], balance: { cash: 1000, marketValue: 1100, totalEquity: 2100, currency: 'USD' }, getQuote: async (symbol) => ({ symbol, bid: 109, ask: 111, last: 110 }) }),
  placePaperOrder: async ({ quantity }) => ({ id: 'order-1', status: 'filled', quantity, filledQuantity: quantity, avgFillPrice: 110, commission: 1 }),
};

describe('Pi investment workflow package', () => {
  test('exposes canonical Pi workflow phases and constrained agent profiles', () => {
    expect(CANONICAL_INVESTMENT_PHASES).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
    expect(Object.keys(INVESTMENT_AGENT_PROFILES)).toHaveLength(7);
    expect(INVESTMENT_AGENT_PROFILES['portfolio-manager'].requiresApprovalFor).toContain('dangerous');
    expect(createInvestmentWorkflowArtifact({ workflowId: 'w1', phase: 'report', status: 'completed', profile: 'reviewer', output: 'ok', evidence: [] }).createdAt).toBeString();
  });
  test('executes all five phases through package-owned logic', async () => {
    for (const phase of ['detect', 'plan', 'execute', 'verify', 'report'] as const) {
      const result = await executeInvestmentPhase(phase, { ticker: 'AAPL', goal: '分析' }, services, new AbortController().signal);
      expect(result.output).toContain('##');
      expect(result.evidence[0]?.phase).toBe(phase);
    }
  });

  test('builds the plan from the provider report-period data instead of a fixed fixture', async () => {
    const research: InvestmentWorkflowServices = {
      ...services,
      getResearchData: async () => ({
        price: JSON.stringify({ data: { snapshot: { ticker: '600519.SH', price: 1258, currency: 'CNY', as_of: '2026-09-16' } } }),
        ratios: JSON.stringify({ data: { snapshot: { name: '贵州茅台', period: '2026年 半年报', report_date: '2026-06-30', eps: 35.57, roe_pct: 16.75, gross_margin_pct: 89.55, revenue: 92_278_072_083.21, net_income: 44_516_880_421.86, book_value_per_share: 200.99, operating_cashflow_per_share: 56.55, net_income_yoy_pct: -1.95 } } }),
        estimates: JSON.stringify({ data: { analyst_estimates: [{ institution: '西南证券', report_date: '2026-08-21', eps_estimate_this_year: 69.83, pe_estimate_this_year: 18.59, eps_estimate_next_year: 75.82 }] } }),
      }),
    };
    const result = await executeInvestmentPhase('plan', { ticker: '600519.SH', market: 'cn', goal: '分析' }, research);
    expect(result.error).toBeUndefined();
    expect(result.evidence[0]?.phase).toBe('plan');
    expect(result.output).toContain('贵州茅台');
    expect(result.output).toContain('PB 6.26');
    expect(result.output).toContain('PE 35.37');
    expect(result.output).toContain('西南证券');
    expect(result.output).toContain('每股内在价值');
    expect(result.output).not.toContain('price":100');
  });

  test('fails the plan closed when the provider cannot answer a real price or EPS', async () => {
    const result = await executeInvestmentPhase('plan', { ticker: 'AAPL', market: 'us' }, { ...services, getResearchData: async () => ({ price: '100', ratios: 'PE 10' }) });
    expect(result.error).toBe('insufficient_research_data');
    expect(result.evidence[0]?.phase).toBe('plan');
    expect(result.output).toContain('未生成估值');
  });

  test('creates a hash-validated five-state dossier with evidence, policy, risk, and model metadata', async () => {
    const phaseResult = await executeInvestmentPhase('execute', { ticker: 'AAPL', goal: '回测' }, services, new AbortController().signal);
    const dossier = createInvestmentDossier({
      workflowId: 'dossier-fixture',
      plan: { ticker: 'AAPL', goal: '回测' },
      sessionId: 'session-dossier-fixture',
      intent: '分析 AAPL',
      phaseResults: [{ ...phaseResult, phase: 'execute', status: 'completed' }],
      status: 'completed',
      options: { modelVersion: 'fixture-model-1', dataAsOf: '2026-09-15T00:00:00.000Z' },
    });
    expect(dossier.schema).toBe('upup.pi.investment-dossier.v1');
    expect(dossier.phases).toHaveLength(5);
    expect(dossier.phases.map((phase) => phase.phase)).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
    expect(dossier.phases[2]?.evidence[0]).toMatchObject({ source: 'test://market-history', auditId: 'workflow-test' });
    expect(dossier.phases[2]?.policy.decision).toBe('sandbox_allow');
    expect(dossier.phases[2]?.modelVersion).toBe('fixture-model-1');
    expect(validateInvestmentDossier(dossier)).toBe(true);
    expect(validateInvestmentDossier({ ...dossier, artifactHash: 'tampered' })).toBe(false);
  });

  test('fails closed on missing ticker without invoking data services', async () => {
    let invoked = false;
    const result = await executeInvestmentPhase('detect', {}, { ...services, getResearchData: async () => { invoked = true; return {}; } }, new AbortController().signal);
    expect(result.error).toBe('no_ticker');
    expect(invoked).toBe(false);
  });

  test('propagates explicit market and rejects a ticker/market mismatch', async () => {
    const markets: Array<string | undefined> = [];
    const routed = {
      ...services,
      getResearchData: async (_ticker: string, _signal?: AbortSignal, market?: 'cn' | 'hk' | 'us' | 'fund' | 'crypto') => { markets.push(market); return {}; },
    };
    const result = await executeInvestmentPhase('detect', { ticker: 'AAPL', market: 'us' }, routed, new AbortController().signal);
    expect(result.error).toBeUndefined();
    expect(markets).toEqual(['us']);
    await expect(executeInvestmentPhase('detect', { ticker: 'AAPL', market: 'cn' }, routed, new AbortController().signal)).rejects.toThrow('does not match ticker');
  });

  test('keeps CN, HK, and US market selections isolated in the provider contract', async () => {
    const seen: string[] = [];
    const routed = {
      ...services,
      getResearchData: async (ticker: string, _signal?: AbortSignal, market?: 'cn' | 'hk' | 'us' | 'fund' | 'crypto') => {
        seen.push(`${ticker}:${market}`);
        return {};
      },
    };
    for (const selection of [['600519.SH', 'cn'], ['00700.HK', 'hk'], ['AAPL', 'us']] as const) {
      await executeInvestmentPhase('detect', { ticker: selection[0], market: selection[1] }, routed, new AbortController().signal);
    }
    expect(seen).toEqual(['600519.SH:cn', '00700.HK:hk', 'AAPL:us']);
  });

  test('routes market and fund backtests to distinct host services', async () => {
    const calls: string[] = [];
    const routed = {
      ...services,
      getFundHistory: async () => { calls.push('fund'); return [{ date: '2026-01-01', nav: 1 }, { date: '2026-06-01', nav: 1.1 }]; },
      getMarketHistory: async () => { calls.push('market'); return { bars: [{ date: '2026-01-01', open: 100, high: 102, low: 99, close: 100, volume: 1000 }, { date: '2026-06-01', open: 110, high: 112, low: 109, close: 110, volume: 1200 }], evidence: { source: 'test://market-history', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: '2026-06-01', query: 'AAPL', dataFreshness: 'historical', auditId: 'workflow-test' } }; },
    };
    const stock = await executeInvestmentPhase('execute', { ticker: 'AAPL', goal: '回测策略' }, routed, new AbortController().signal);
    const fund = await executeInvestmentPhase('execute', { ticker: '110022.SH', goal: '基金定投回测' }, routed, new AbortController().signal);
    expect(stock.output).toContain('Market Analysis');
    expect(fund.output).toContain('Fund Backtest');
    expect(calls).toEqual(['market', 'fund']);
  });

  test('propagates market history evidence into the backtest result', async () => {
    const result = await executeInvestmentPhase('execute', { ticker: 'AAPL', goal: '回测策略' }, services, new AbortController().signal);
    expect(result.evidence[0]).toMatchObject({ source: 'test://market-history', asOf: '2026-06-01', auditId: 'workflow-test', phase: 'execute' });
  });
});

describe('Pi investment workflow risk/audit/evidence integration', () => {
  test('emits canonical or propagated evidence URIs across all five phases with phase alignment', async () => {
    const phaseSources: Record<string, string> = {};
    for (const phase of ['detect', 'plan', 'execute', 'verify', 'report'] as const) {
      const result = await executeInvestmentPhase(phase, { ticker: 'NVDA', goal: '分析投资机会' }, services, new AbortController().signal);
      expect(result.evidence.length).toBeGreaterThanOrEqual(1);
      const ev = result.evidence[0]!;
      expect(ev.phase).toBe(phase);
      // backtest propagates the data source evidence URI (intentional: traceability)
      // other phases emit the canonical upup-pi:// URI
      if (phase !== 'execute') {
        expect(ev.source).toMatch(/^upup-pi:\/\//);
      }
      phaseSources[phase] = ev.source;
    }
    expect(Object.keys(phaseSources)).toHaveLength(5);
    expect(phaseSources['detect']).toMatch(/detect/);
    expect(phaseSources['plan']).toMatch(/plan/);
    expect(phaseSources['execute']).toMatch(/market-history/);
    expect(phaseSources['verify']).toMatch(/verify/);
    expect(phaseSources['report']).toMatch(/report/);
  });

  test('propagates auditId from data source evidence into backtest phase result', async () => {
    const auditId = 'audit-trace-12345';
    const tracedServices = {
      ...services,
      getMarketHistory: async () => ({
        bars: [{ date: '2026-01-01', open: 100, high: 102, low: 99, close: 100, volume: 1000 }, { date: '2026-06-01', open: 110, high: 112, low: 109, close: 110, volume: 1200 }],
        evidence: { source: 'test://market-history', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: '2026-06-01', query: 'AAPL', dataFreshness: 'historical', auditId },
      }),
    };
    const result = await executeInvestmentPhase('execute', { ticker: 'AAPL', goal: '回测' }, tracedServices, new AbortController().signal);
    expect(result.evidence[0]).toMatchObject({ auditId, phase: 'execute' });
  });

  test('verify phase is read-only and returns no unauthorized side effects', async () => {
    let placeOrderCalled = false;
    const safeServices = {
      ...services,
      getSandboxState: async () => ({
        positions: [{ symbol: 'AAPL', quantity: 10, avgCost: 100 }],
        balance: { cash: 1000, marketValue: 1100, totalEquity: 2100, currency: 'USD' },
        getQuote: async (symbol) => ({ symbol, bid: 109, ask: 111, last: 110 }),
      }),
      placePaperOrder: async () => { placeOrderCalled = true; return { id: 'never', status: 'rejected', quantity: 0, filledQuantity: 0 }; },
    };
    const result = await executeInvestmentPhase('verify', { ticker: 'AAPL', goal: '持有观望' }, safeServices, new AbortController().signal);
    expect(result.output).toContain('Brinson');
    expect(placeOrderCalled).toBe(false);
    expect(result.evidence[0]).toMatchObject({ phase: 'verify' });
  });

  test('verify phase produces Brinson attribution when positions exist', async () => {
    const result = await executeInvestmentPhase('verify', { ticker: 'AAPL', goal: '组合复盘' }, services, new AbortController().signal);
    expect(result.output).toContain('Brinson');
    expect(result.output).toMatch(/配置效应.*\d+\.\d{2}%/);
    expect(result.output).toMatch(/选择效应.*\d+\.\d{2}%/);
    expect(result.evidence[0]).toMatchObject({ phase: 'verify' });
  });

  test('verify phase returns empty dossier when portfolio is flat', async () => {
    const flatServices = {
      ...services,
      getSandboxState: async () => ({
        positions: [],
        balance: { cash: 5000, marketValue: 0, totalEquity: 5000, currency: 'USD' },
        getQuote: async (symbol) => ({ symbol, bid: 100, ask: 102, last: 101 }),
      }),
    };
    const result = await executeInvestmentPhase('verify', { ticker: 'AAPL', goal: '组合复盘' }, flatServices, new AbortController().signal);
    expect(result.output).toContain('空组合');
    expect(result.evidence[0]).toMatchObject({ phase: 'verify' });
  });

  test('full pipeline: all 5 phases produce auditable, evidence-traceable results', async () => {
    const auditTrace: { phase: string; source: string; hasEvidence: boolean; outputNonEmpty: boolean }[] = [];
    for (const phase of ['detect', 'plan', 'execute', 'verify', 'report'] as const) {
      const result = await executeInvestmentPhase(phase, { ticker: 'AAPL', goal: '完整 5 步投研闭环' }, services, new AbortController().signal);
      auditTrace.push({
        phase,
        source: result.evidence[0]?.source ?? '(none)',
        hasEvidence: result.evidence.length >= 1,
        outputNonEmpty: result.output.length > 0,
      });
    }
    expect(auditTrace).toHaveLength(5);
    for (const trace of auditTrace) {
      expect(trace.hasEvidence).toBe(true);
      expect(trace.outputNonEmpty).toBe(true);
      // execute propagates data source evidence; all others use canonical upup-pi://
      if (trace.phase !== 'execute') {
        expect(trace.source).toMatch(/^upup-pi:\/\//);
      }
    }
    const phasesCovered = new Set(auditTrace.map((t) => t.phase));
    expect(phasesCovered).toEqual(new Set(['detect', 'plan', 'execute', 'verify', 'report']));
  });
});
