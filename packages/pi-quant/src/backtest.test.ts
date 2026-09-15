import { describe, expect, test } from 'bun:test';
import { rebalanceDates, runFactorBacktest, topBottomSymbols } from './backtest';
import type { FactorSignalSeries, UniverseBarSeries } from './backtest';

describe('rebalanceDates', () => {
  test('returns empty when end before start', () => {
    expect(rebalanceDates('2024-12-01', '2024-01-01', 'daily')).toEqual([]);
  });
  test('daily schedule has expected count', () => {
    const dates = rebalanceDates('2024-01-01', '2024-01-10', 'daily');
    expect(dates.length).toBe(10);
  });
  test('weekly schedule', () => {
    const dates = rebalanceDates('2024-01-01', '2024-01-29', 'weekly');
    expect(dates.length).toBe(5);
  });
  test('monthly schedule', () => {
    const dates = rebalanceDates('2024-01-01', '2024-04-30', 'monthly');
    expect(dates.length).toBe(4);
  });
});

describe('topBottomSymbols', () => {
  test('selects top N and bottom N', () => {
    const m = new Map([['A', 0.5], ['B', 0.4], ['C', 0.3], ['D', 0.2]]);
    const out = topBottomSymbols(m, 2, 1);
    expect(out.top).toEqual(['A', 'B']);
    expect(out.bottom).toEqual(['D']);
  });
});

describe('runFactorBacktest', () => {
  test('runs a long-only backtest over dry-run data', () => {
    const signals: FactorSignalSeries[] = [
      { date: '2024-01-01', factorValues: new Map([['A', 0.5], ['B', 0.4], ['C', 0.3]]) },
      { date: '2024-01-02', factorValues: new Map([['A', 0.4], ['B', 0.5], ['C', 0.3]]) },
    ];
    const prices: UniverseBarSeries[] = [
      { date: '2024-01-01', symbolPrices: new Map([['A', 100], ['B', 50], ['C', 20]]) },
      { date: '2024-01-02', symbolPrices: new Map([['A', 110], ['B', 55], ['C', 22]]) },
      { date: '2024-01-03', symbolPrices: new Map([['A', 120], ['B', 60], ['C', 24]]) },
    ];
    const result = runFactorBacktest('mom', signals, prices, {
      startDate: '2024-01-01',
      endDate: '2024-01-03',
      rebalanceFreq: 'daily',
      topN: 2,
      bottomN: 1,
      longShort: false,
    });
    expect(result.factorId).toBe('mom');
    expect(result.equity.length).toBeGreaterThan(0);
  });

  test('runs long-short backtest', () => {
    const signals: FactorSignalSeries[] = [
      { date: '2024-01-01', factorValues: new Map([['A', 0.5], ['B', 0.4], ['C', 0.3]]) },
    ];
    const prices: UniverseBarSeries[] = [
      { date: '2024-01-01', symbolPrices: new Map([['A', 100], ['B', 50], ['C', 20]]) },
      { date: '2024-01-02', symbolPrices: new Map([['A', 110], ['B', 55], ['C', 22]]) },
    ];
    const result = runFactorBacktest('mom', signals, prices, {
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      rebalanceFreq: 'daily',
      topN: 2,
      bottomN: 1,
      longShort: true,
    });
    expect(result.factorId).toBe('mom');
    expect(result.equity.length).toBeGreaterThan(0);
  });

  test('handles empty price series', () => {
    const result = runFactorBacktest('mom', [], [], {
      startDate: '2024-01-01',
      endDate: '2024-01-02',
      rebalanceFreq: 'daily',
      topN: 2,
      bottomN: 1,
      longShort: true,
    });
    expect(result.equity.length).toBe(0);
    expect(result.longReturn).toBe(0);
  });
});
