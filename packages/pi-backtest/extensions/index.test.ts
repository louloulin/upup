import { describe, expect, test } from 'bun:test';
import backtestExtension from './index.js';
type Tool = { name: string; execute: (...args: any[]) => Promise<any> };
function tools() { const map = new Map<string, Tool>(); backtestExtension({ registerTool: (tool: Tool) => map.set(tool.name, tool) } as never); return map; }
const bars = [{ date: '2026-01-05', high: 105, low: 99, close: 104 }, { date: '2026-01-06', high: 110, low: 103, close: 108 }, { date: '2026-01-07', high: 112, low: 106, close: 110 }];
describe('Pi backtest extension', () => {
  test('registers production and compatibility backtest tools', () => { expect([...tools().keys()].sort()).toEqual(['backtest_dca', 'backtest_evaluate_trade', 'backtest_lumpsum', 'backtest_run', 'backtest_threshold', 'backtest_win_rate', 'calculate_win_rate', 'evaluate_trade', 'get_backtest_summary', 'run_backtest']); });
  test('evaluates one trade with evidence', async () => { const result = await tools().get('backtest_evaluate_trade')!.execute('eval-1', { symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 1, forwardBars: bars, evalWindowDays: 3, neutralBandPct: 2 }, new AbortController().signal); expect(JSON.parse(result.content[0].text)).toMatchObject({ evalStatus: 'completed', outcome: 'win' }); expect(result.details).toMatchObject({ auditId: 'eval-1', dataFreshness: 'historical' }); });
  test('runs batch and win-rate tools', async () => { const map = tools(); const batch = await map.get('backtest_run')!.execute('batch-1', { trades: [{ symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 1 }], forwardPriceData: { A: bars }, evalWindowDays: 3, neutralBandPct: 2 }, new AbortController().signal); const rate = await map.get('backtest_win_rate')!.execute('rate-1', { outcomes: ['win', 'loss', 'neutral'], includeNeutral: false }, new AbortController().signal); expect(JSON.parse(batch.content[0].text).summary.completedCount).toBe(1); expect(JSON.parse(rate.content[0].text).winRatePct).toBe(50); });
  test('runs production backtest with native evidence', async () => { const result = await tools().get('run_backtest')!.execute('run-1', { trades: [{ symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 1 }], forwardPriceData: { A: bars }, evalWindowDays: 3, neutralBandPct: 2 }, new AbortController().signal); expect(JSON.parse(result.content[0].text).summary.completedCount).toBe(1); expect(result.details).toMatchObject({ auditId: 'run-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://backtest/run' }] }); });
  test('enforces strict trading-day quality and exposes net cost metrics', async () => {
    const result = await tools().get('run_backtest')!.execute('run-cost-1', { trades: [{ symbol: 'A', analysisDate: '2026-01-02', operationAdvice: '买入', entryPrice: 100, quantity: 100 }], forwardPriceData: { A: bars }, evalWindowDays: 3, neutralBandPct: 2, costModel: { commissionBps: 10, minimumCommission: 5, stampDutyBps: 5, slippageBps: 10 } }, new AbortController().signal);
    const output = JSON.parse(result.content[0].text);
    expect(output.summary.dataQualityFailedCount).toBe(0);
    expect(output.summary.totalTransactionCost).toBeGreaterThan(0);
    expect(output.results[0].simulatedReturnPct).toBeLessThan(output.results[0].grossSimulatedReturnPct);
    const rejected = await tools().get('run_backtest')!.execute('run-quality-1', { trades: [{ symbol: 'A', analysisDate: '2026-01-02', operationAdvice: '买入', entryPrice: 100, quantity: 1 }], forwardPriceData: { A: [{ date: '2026-01-03', high: 101, low: 99, close: 100 }] }, evalWindowDays: 1, neutralBandPct: 2 }, new AbortController().signal);
    expect(JSON.parse(rejected.content[0].text).results[0]).toMatchObject({ evalStatus: 'error', dataQuality: { status: 'failed' } });
  });
  test('runs fund backtest tools only from explicit historical NAV input', async () => {
    const history = [{ date: '2026-01-01', nav: 1 }, { date: '2026-01-02', nav: 1.1 }, { date: '2026-01-03', nav: 1.2 }];
    const result = await tools().get('backtest_lumpsum')!.execute('fund-1', { fundCode: '000300', startDate: '2026-01-01', endDate: '2026-01-03', initialAmount: 1000, history }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ fundName: '000300', buyTrades: 1, totalInvested: 1000 });
    expect(result.details).toMatchObject({ auditId: 'fund-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://backtest/fund-lump-sum' }] });
    expect(result.details.report).toContain('一次性投资');
  });
  test('honors abort before evaluation', async () => { const controller = new AbortController(); controller.abort(); const result = await tools().get('backtest_run')!.execute('abort-1', { trades: [], forwardPriceData: {}, evalWindowDays: 1, neutralBandPct: 2 }, controller.signal); expect(result.isError).toBe(true); });
});
