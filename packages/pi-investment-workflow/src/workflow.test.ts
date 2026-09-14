import { describe, expect, test } from 'bun:test';
import { CANONICAL_INVESTMENT_PHASES, createInvestmentWorkflowArtifact, executeInvestmentPhase, INVESTMENT_AGENT_PROFILES, type InvestmentWorkflowServices } from './workflow.js';

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
    for (const phase of ['research', 'valuation', 'backtest', 'trade', 'review'] as const) {
      const result = await executeInvestmentPhase(phase, { ticker: 'AAPL', goal: '分析' }, services, new AbortController().signal);
      expect(result.output).toContain('##');
      expect(result.evidence[0]?.phase).toBe(phase);
    }
  });

  test('fails closed on missing ticker without invoking data services', async () => {
    let invoked = false;
    const result = await executeInvestmentPhase('research', {}, { ...services, getResearchData: async () => { invoked = true; return {}; } }, new AbortController().signal);
    expect(result.error).toBe('no_ticker');
    expect(invoked).toBe(false);
  });

  test('routes market and fund backtests to distinct host services', async () => {
    const calls: string[] = [];
    const routed = {
      ...services,
      getFundHistory: async () => { calls.push('fund'); return [{ date: '2026-01-01', nav: 1 }, { date: '2026-06-01', nav: 1.1 }]; },
      getMarketHistory: async () => { calls.push('market'); return { bars: [{ date: '2026-01-01', open: 100, high: 102, low: 99, close: 100, volume: 1000 }, { date: '2026-06-01', open: 110, high: 112, low: 109, close: 110, volume: 1200 }], evidence: { source: 'test://market-history', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: '2026-06-01', query: 'AAPL', dataFreshness: 'historical', auditId: 'workflow-test' } }; },
    };
    const stock = await executeInvestmentPhase('backtest', { ticker: 'AAPL', goal: '回测策略' }, routed, new AbortController().signal);
    const fund = await executeInvestmentPhase('backtest', { ticker: '110022.SH', goal: '基金定投回测' }, routed, new AbortController().signal);
    expect(stock.output).toContain('Market Backtest');
    expect(fund.output).toContain('Fund Backtest');
    expect(calls).toEqual(['market', 'fund']);
  });

  test('propagates market history evidence into the backtest result', async () => {
    const result = await executeInvestmentPhase('backtest', { ticker: 'AAPL', goal: '回测策略' }, services, new AbortController().signal);
    expect(result.evidence[0]).toMatchObject({ source: 'test://market-history', asOf: '2026-06-01', auditId: 'workflow-test', phase: 'backtest' });
  });
});
