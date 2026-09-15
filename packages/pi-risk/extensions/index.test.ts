import { describe, expect, test } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import riskExtension from './index';

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

function makeHost() {
  const tools = new Map<string, RegisteredTool>();
  const host = { events: createEventBus(), registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool) } as never;
  return { host, tools };
}

describe('Pi risk extension', () => {
  test('registers auditable risk tools', () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    expect([...tools.keys()].sort()).toEqual(['calculate_correlation', 'calculate_correlation_matrix', 'calculate_kelly', 'calculate_max_drawdown', 'calculate_mean_variance', 'calculate_risk_parity', 'calculate_sharpe', 'calculate_short_interest_ratio', 'calculate_sortino', 'calculate_var', 'compare_data_sources', 'detect_short_squeeze', 'get_short_interest', 'score_data_source', 'track_risk']);
  });

  test('tracks risks in the current Pi session with native evidence', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const signal = new AbortController().signal;
    const first = await tools.get('track_risk')!.execute('risk-track-1', { ticker: 'aapl', type: 'company', severity: 'high', title: 'Margin pressure', description: 'Input costs may compress operating margin.', probability: 0.4, impact: 0.8, mitigation: 'Monitor quarterly gross margin.' }, signal);
    const second = await tools.get('track_risk')!.execute('risk-track-2', { type: 'market', severity: 'medium', title: 'Rate volatility', description: 'Rates may increase discount rates.', probability: 0.3, impact: 0.5 }, signal);
    expect(JSON.parse(first.content[0].text)).toMatchObject({ success: true, risk: { id: 'risk-1', ticker: 'AAPL', severity: 'high' }, trackedCount: 1 });
    expect(JSON.parse(second.content[0].text)).toMatchObject({ success: true, risk: { id: 'risk-2' }, trackedCount: 2 });
    expect(first.details).toMatchObject({ auditId: 'risk-track-1', dataFreshness: 'historical', journal: 'pi-session', evidence: [{ source: 'upup-pi://risk/risk-tracker' }] });
  });

  test('runs native short-interest tools with evidence and honors abort', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const shortInterest = await tools.get('get_short_interest')!.execute('short-1', { symbol: 'AAPL' }, new AbortController().signal);
    expect(JSON.parse(shortInterest.content[0].text)).toMatchObject({ symbol: 'AAPL', shortInterest: expect.any(Number) });
    expect(shortInterest.details).toMatchObject({ auditId: 'short-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://risk/short-interest' }] });
    const ratio = await tools.get('calculate_short_interest_ratio')!.execute('ratio-1', { symbol: 'TSLA', quantity: 10, avg_cost: 100 }, new AbortController().signal);
    expect(JSON.parse(ratio.content[0].text).positionAnalysis).toMatchObject({ sharesHeld: 10, positionValue: 1000 });
    const squeeze = await tools.get('detect_short_squeeze')!.execute('squeeze-1', { symbols: ['AAPL', 'TSLA'], min_short_interest_ratio: 1, min_short_percent_float: 1 }, new AbortController().signal);
    expect(JSON.parse(squeeze.content[0].text).screeningCriteria.symbolsScreened).toBe(2);
    const controller = new AbortController();
    controller.abort();
    expect((await tools.get('detect_short_squeeze')!.execute('squeeze-abort', { symbols: ['AAPL'] }, controller.signal)).isError).toBe(true);
  });

  test('calculate_var returns historical VaR with native evidence metadata', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const result = await tools.get('calculate_var')!.execute('var-1', { returns: [0.01, -0.02, 0.03, -0.05, 0.02, -0.04, 0.015], confidence: 0.9 }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ method: 'historical', confidence: 0.9, observations: 7 });
    expect(result.details).toMatchObject({ auditId: 'var-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://risk/var' }] });
  });

  test('calculate_sharpe classifies a deterministic fixture', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const result = await tools.get('calculate_sharpe')!.execute('sharpe-1', { returns: Array.from({ length: 30 }, (_, i) => (i % 6) * 0.001 - 0.002), riskFreeRate: 0.0 }, new AbortController().signal);
    const parsed = JSON.parse(result.content[0].text);
    expect(['negative', 'low', 'good', 'excellent']).toContain(parsed.rating);
    expect(result.details).toMatchObject({ auditId: 'sharpe-1', rating: parsed.rating });
  });

  test('calculate_sortino exposes downside deviation metadata', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const result = await tools.get('calculate_sortino')!.execute('sortino-1', { returns: [0.01, -0.04, 0.02, -0.02, 0.03, -0.01] }, new AbortController().signal);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.downsideDeviation).toBeGreaterThan(0);
    expect(result.details).toMatchObject({ auditId: 'sortino-1', dataFreshness: 'historical' });
  });

  test('calculate_max_drawdown finds the worst decline and exposes indices', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const result = await tools.get('calculate_max_drawdown')!.execute('dd-1', { prices: [100, 110, 120, 90, 95, 80, 85, 130, 125] }, new AbortController().signal);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.peakIndex).toBe(2);
    expect(parsed.troughIndex).toBe(5);
    expect(parsed.maxDrawdownPercent).toBeCloseTo(33.3333, 3);
    expect(result.details).toMatchObject({ auditId: 'dd-1', peakIndex: 2, troughIndex: 5 });
  });

  test('honors abort signals before any calculation', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const controller = new AbortController();
    controller.abort();
    const result = await tools.get('calculate_var')!.execute('var-abort', { returns: [0.01, -0.02] }, controller.signal);
    expect(result.isError).toBe(true);
  });
  test('runs native optimization tools with evidence', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const kelly = await tools.get('calculate_kelly')!.execute('kelly-1', { winRate: 0.6, avgWin: 0.15, avgLoss: 0.1, capital: 100000 }, new AbortController().signal);
    expect(JSON.parse(kelly.content[0].text)).toMatchObject({ optimalSize: 33.33, positionSizing: { halfKelly: 16666.67 } });
    expect(kelly.details).toMatchObject({ evidence: [{ source: 'upup-pi://risk/kelly' }] });
    const parity = await tools.get('calculate_risk_parity')!.execute('parity-1', { assets: [{ symbol: 'A', volatility: 0.2, expectedReturn: 0.1 }, { symbol: 'B', volatility: 0.1, expectedReturn: 0.08 }] }, new AbortController().signal);
    expect(JSON.parse(parity.content[0].text).totalWeight).toBe(100);
    const meanVariance = await tools.get('calculate_mean_variance')!.execute('mvo-1', { assets: [{ symbol: 'A', volatility: 0.2, expectedReturn: 0.1 }, { symbol: 'B', volatility: 0.1, expectedReturn: 0.08 }], riskFreeRate: 0.02 }, new AbortController().signal);
    expect(JSON.parse(meanVariance.content[0].text).tangencyWeights).toHaveLength(2);
    expect(meanVariance.details).toMatchObject({ evidence: [{ source: 'upup-pi://risk/mean-variance' }] });
  });
  test('runs native reliability and correlation tools with evidence', async () => {
    const { host, tools } = makeHost();
    riskExtension(host);
    const score = await tools.get('score_data_source')!.execute('score-1', { source: 'A', latency: 50, freshness: 0.5, coverage: 95, accuracy: 99, priceDeviation: 0.1 }, new AbortController().signal);
    expect(JSON.parse(score.content[0].text)).toMatchObject({ grade: 'A' });
    const comparison = await tools.get('compare_data_sources')!.execute('compare-1', { sources: [{ source: 'A', latency: 50, freshness: 0.5, coverage: 95, accuracy: 99, priceDeviation: 0.1 }, { source: 'B', latency: 10000, freshness: 100, coverage: 30, accuracy: 50, priceDeviation: 5 }], preferAccurate: true }, new AbortController().signal);
    expect(JSON.parse(comparison.content[0].text).bestOverall).toBe('A');
    const matrix = await tools.get('calculate_correlation_matrix')!.execute('matrix-1', { returns: { A: [1, 2, 3], B: [3, 2, 1] }, symbols: ['A', 'B'] }, new AbortController().signal);
    expect(JSON.parse(matrix.content[0].text).matrix[0][1]).toBe(-1);
    const correlation = await tools.get('calculate_correlation')!.execute('corr-1', { asset1Returns: [1, 2, 3], asset2Returns: [1, 2, 3], asset1Symbol: 'A', asset2Symbol: 'B' }, new AbortController().signal);
    expect(JSON.parse(correlation.content[0].text)).toMatchObject({ correlation: 1, strength: 'very-strong' });
    expect(correlation.details).toMatchObject({ evidence: [{ source: 'upup-pi://risk/correlation' }] });
  });
});
