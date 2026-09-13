import { describe, expect, test } from 'bun:test';
import { calculateWinRate, computeSummary, evaluateTrade, fundSubscriptionFee, inferDirection, inferPosition, renderFundBacktestReport, runFundBacktest } from './src/index.js';

const bars = [
  { date: '2026-01-02', high: 105, low: 99, close: 104 },
  { date: '2026-01-03', high: 110, low: 103, close: 108 },
  { date: '2026-01-04', high: 112, low: 106, close: 110 },
];
const config = { evalWindowDays: 3, neutralBandPct: 2, engineVersion: 'v1' };

describe('pi-backtest', () => {
  test('runs a deterministic lump-sum fund NAV backtest without a data source', () => {
    const result = runFundBacktest({ fundCode: '000300', startDate: '2026-01-01', endDate: '2026-01-04', initialAmount: 10_000, strategy: 'lump_sum' }, [
      { date: '2026-01-01', nav: 1 }, { date: '2026-01-02', nav: 1.1 }, { date: '2026-01-03', nav: 1.05 }, { date: '2026-01-04', nav: 1.2 },
    ]);
    expect(result.totalInvested).toBe(10_000);
    expect(result.finalValue).toBe(11_988);
    expect(result.totalReturnPercent).toBeCloseTo(19.88, 2);
    expect(result.buyTrades).toBe(1);
    expect(renderFundBacktestReport(result)).toContain('一次性投资');
  });

  test('applies fund-type fees and rejects insufficient historical data', () => {
    expect(fundSubscriptionFee(10_000, '货币型')).toBe(0);
    expect(fundSubscriptionFee(10_000, '债券型')).toBe(8);
    expect(() => runFundBacktest({ fundCode: 'A', startDate: '2026-01-01', endDate: '2026-01-02', initialAmount: 100, strategy: 'lump_sum' }, [{ date: '2026-01-01', nav: 1 }])).toThrow();
  });

  test('keeps DCA investments and snapshots chronological', () => {
    const result = runFundBacktest({ fundCode: 'A', startDate: '2026-01-01', endDate: '2026-01-05', initialAmount: 100, strategy: 'dca', dca: { frequency: 'monthly', dayOfMonth: 2, amount: 50 } }, [
      { date: '2026-01-01', nav: 1 }, { date: '2026-01-02', nav: 1 }, { date: '2026-01-03', nav: 1 }, { date: '2026-01-04', nav: 1 }, { date: '2026-01-05', nav: 1 },
    ]);
    expect(result.timeline.map((point) => point.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
    expect(result.totalInvested).toBe(150);
  });
  test('infers directions with negation guard', () => {
    expect(inferDirection('买入')).toBe('up');
    expect(inferDirection('不要买入')).toBe('flat');
    expect(inferDirection('卖出')).toBe('down');
    expect(inferDirection('持有')).toBe('not_down');
    expect(inferPosition('观望')).toBe('cash');
  });
  test('evaluates long trade and take-profit target', () => {
    const result = evaluateTrade({ symbol: '600519.SH', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, takeProfit: 109, quantity: 100 }, bars, config);
    expect(result.evalStatus).toBe('completed');
    expect(result.outcome).toBe('win');
    expect(result.firstHit).toBe('take_profit');
    expect(result.simulatedExitPrice).toBe(109);
    expect(result.simulatedReturnPct).toBeCloseTo(9, 8);
  });
  test('marks insufficient data and cash position deterministically', () => {
    const insufficient = evaluateTrade({ symbol: 'AAPL', analysisDate: '2026-01-01', operationAdvice: '观望', entryPrice: 100, quantity: 1 }, bars.slice(0, 2), config);
    expect(insufficient.evalStatus).toBe('insufficient_data');
    expect(insufficient.positionRecommendation).toBe('cash');
  });
  test('computes summary and win rate without hidden data', () => {
    const results = [evaluateTrade({ symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 1 }, bars, config), evaluateTrade({ symbol: 'B', analysisDate: '2026-01-01', operationAdvice: '观望', entryPrice: 100, quantity: 1 }, bars.slice(0, 2), config)];
    const summary = computeSummary(results, 'batch', 3, 'v1');
    expect(summary.totalEvaluations).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.insufficientCount).toBe(1);
    expect(calculateWinRate(['win', 'loss', 'neutral'])).toMatchObject({ wins: 1, losses: 1, total: 2, winRatePct: 50 });
  });
  test('fails invalid entry price closed', () => {
    expect(evaluateTrade({ symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 0, quantity: 1 }, bars, config).evalStatus).toBe('error');
  });
});
