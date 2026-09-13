import { describe, expect, test } from 'bun:test';
import {
  applyPriceLimits,
  evaluateDelisting,
  inferMarketMicrostructure,
  resolveStampDutyExemption,
  summarizeClipping,
  type DailyBar,
} from './microstructure.js';

const sampleBars: DailyBar[] = [
  { date: '2026-09-01', high: 110, low: 95, close: 100 },
  { date: '2026-09-02', high: 121, low: 99, close: 105 },
  { date: '2026-09-03', high: 90, low: 85, close: 92 },
  { date: '2026-09-04', high: 95, low: 88, close: 94 },
];

describe('inferMarketMicrostructure', () => {
  test('classifies A-share main board and sub-boards', () => {
    expect(inferMarketMicrostructure('600519')).toBe('cn_main');
    expect(inferMarketMicrostructure('000001')).toBe('cn_main');
    expect(inferMarketMicrostructure('300750')).toBe('cn_chinext');
    expect(inferMarketMicrostructure('688981')).toBe('cn_star');
    expect(inferMarketMicrostructure('830799')).toBe('cn_bj');
  });

  test('classifies ST stocks and ETFs', () => {
    expect(inferMarketMicrostructure('ST')).toBe('cn_st');
    expect(inferMarketMicrostructure('510050')).toBe('cn_etf');
    expect(inferMarketMicrostructure('159915')).toBe('cn_etf');
  });

  test('classifies Hong Kong and US symbols', () => {
    expect(inferMarketMicrostructure('0700.HK')).toBe('hk');
    expect(inferMarketMicrostructure('00700.HK')).toBe('hk_etf');
    expect(inferMarketMicrostructure('AAPL')).toBe('us');
  });

  test('hint overrides inference', () => {
    expect(inferMarketMicrostructure('600519.SH', 'cn_st')).toBe('cn_st');
  });
});

describe('applyPriceLimits', () => {
  test('cn_main clips ±10% per day using previous close', () => {
    const result = applyPriceLimits(sampleBars, 'cn_main');
    expect(result).toHaveLength(4);
    expect(result[0]!.previousClose).toBeCloseTo(100, 6);
    expect(result[0]!.effectiveLimitHigh).toBeCloseTo(110, 6);
    expect(result[0]!.effectiveLimitLow).toBeCloseTo(90, 6);
    expect(result[1]!.previousClose).toBeCloseTo(100, 6);
    expect(result[1]!.effectiveLimitHigh).toBeCloseTo(110, 6);
    expect(result[1]!.effectiveLimitLow).toBeCloseTo(90, 6);
    expect(result[1]!.wasHighClipped).toBe(true);
    expect(result[1]!.high).toBeCloseTo(110, 6);
    expect(result[2]!.previousClose).toBeCloseTo(105, 6);
    expect(result[2]!.effectiveLimitHigh).toBeCloseTo(115.5, 6);
    expect(result[2]!.effectiveLimitLow).toBeCloseTo(94.5, 6);
    expect(result[2]!.wasLowClipped).toBe(true);
    expect(result[2]!.low).toBeCloseTo(94.5, 6);
  });

  test('cn_chinext clips ±20% and excludes first 5 days', () => {
    const sixBars: DailyBar[] = [
      { date: '2026-09-01', high: 100, low: 100, close: 100 },
      { date: '2026-09-02', high: 200, low: 0, close: 100 },
      { date: '2026-09-03', high: 200, low: 0, close: 100 },
      { date: '2026-09-04', high: 200, low: 0, close: 100 },
      { date: '2026-09-05', high: 200, low: 0, close: 100 },
      { date: '2026-09-06', high: 130, low: 70, close: 100 },
    ];
    const result = applyPriceLimits(sixBars, 'cn_chinext');
    expect(result).toHaveLength(6);
    for (let i = 0; i < 5; i += 1) {
      expect(result[i]!.limitActive).toBe(false);
      expect(result[i]!.wasHighClipped).toBe(false);
      expect(result[i]!.wasLowClipped).toBe(false);
    }
    for (let i = 1; i < 5; i += 1) {
      expect(result[i]!.high).toBe(200);
      expect(result[i]!.low).toBe(0);
    }
    expect(result[0]!.high).toBe(100);
    expect(result[0]!.low).toBe(100);
    expect(result[5]!.limitActive).toBe(true);
    expect(result[5]!.effectiveLimitHigh).toBeCloseTo(120, 6);
    expect(result[5]!.effectiveLimitLow).toBeCloseTo(80, 6);
    expect(result[5]!.high).toBeCloseTo(120, 6);
    expect(result[5]!.low).toBeCloseTo(80, 6);
    expect(result[5]!.wasHighClipped).toBe(true);
    expect(result[5]!.wasLowClipped).toBe(true);
  });

  test('cn_st clips ±5%', () => {
    const result = applyPriceLimits([{ date: '2026-09-01', high: 110, low: 90, close: 100 }], 'cn_st');
    expect(result[0]!.effectiveLimitHigh).toBeCloseTo(105, 6);
    expect(result[0]!.effectiveLimitLow).toBeCloseTo(95, 6);
    expect(result[0]!.high).toBeCloseTo(105, 6);
    expect(result[0]!.low).toBeCloseTo(95, 6);
  });

  test('hk and us do not clip', () => {
    const hk = applyPriceLimits([{ date: '2026-09-01', high: 200, low: 50, close: 100 }], 'hk');
    expect(hk[0]!.wasHighClipped).toBe(false);
    expect(hk[0]!.wasLowClipped).toBe(false);
    const us = applyPriceLimits([{ date: '2026-09-01', high: 200, low: 50, close: 100 }], 'us');
    expect(us[0]!.wasHighClipped).toBe(false);
  });

  test('entryPrice override sets the first previousClose', () => {
    const result = applyPriceLimits(sampleBars, 'cn_main', { entryPrice: 100 });
    expect(result[0]!.previousClose).toBeCloseTo(100, 6);
  });

  test('customLimitPct overrides default', () => {
    const result = applyPriceLimits([{ date: '2026-09-01', high: 115, low: 85, close: 100 }], 'cn_main', { customLimitPct: 7 });
    expect(result[0]!.effectiveLimitHigh).toBeCloseTo(107, 6);
    expect(result[0]!.effectiveLimitLow).toBeCloseTo(93, 6);
    expect(result[0]!.high).toBeCloseTo(107, 6);
    expect(result[0]!.low).toBeCloseTo(93, 6);
  });

  test('empty bars returns empty', () => {
    expect(applyPriceLimits([], 'cn_main')).toEqual([]);
  });
});

describe('summarizeClipping', () => {
  test('counts clipped bars and peak deviations', () => {
    const limited = applyPriceLimits(sampleBars, 'cn_main');
    const summary = summarizeClipping(limited, 'cn_main');
    expect(summary.totalBars).toBe(4);
    expect(summary.highClippedBars).toBeGreaterThanOrEqual(1);
    expect(summary.lowClippedBars).toBeGreaterThanOrEqual(1);
    expect(summary.dailyLimitPct).toBe(10);
    expect(summary.maxClippedUpwardPct).toBeGreaterThan(0);
    expect(summary.maxClippedDownwardPct).toBeGreaterThan(0);
  });
});

describe('evaluateDelisting', () => {
  test('trading phase passes through', () => {
    const result = evaluateDelisting({ phase: 'trading' }, 100);
    expect(result.delisted).toBe(false);
    expect(result.exitReason).toBe('trading');
  });

  test('suspended phase blocks exit', () => {
    const result = evaluateDelisting({ phase: 'suspended' }, 100);
    expect(result.delisted).toBe(false);
    expect(result.exitReason).toBe('suspended');
    expect(result.effectiveExitPrice).toBeUndefined();
    expect(result.warning).toMatch(/suspended/);
  });

  test('delisting-period applies default 10% liquidity discount', () => {
    const result = evaluateDelisting({ phase: 'delisting-period' }, 100);
    expect(result.delisted).toBe(false);
    expect(result.exitReason).toBe('delisting-period');
    expect(result.effectiveExitPrice).toBeCloseTo(90, 6);
    expect(result.liquidityDiscountPct).toBe(10);
  });

  test('delisting-period honors custom liquidityDiscountPct', () => {
    const result = evaluateDelisting({ phase: 'delisting-period', liquidityDiscountPct: 25 }, 100);
    expect(result.effectiveExitPrice).toBeCloseTo(75, 6);
    expect(result.liquidityDiscountPct).toBe(25);
  });

  test('delisted phase forces exit price to 0', () => {
    const result = evaluateDelisting({ phase: 'delisted' }, 100);
    expect(result.delisted).toBe(true);
    expect(result.effectiveExitPrice).toBe(0);
    expect(result.exitReason).toBe('delisted');
  });
});

describe('resolveStampDutyExemption', () => {
  test('A-share ETF is exempt on both sides', () => {
    const result = resolveStampDutyExemption('510050.SH', 'cn_etf');
    expect(result.exempt).toBe(true);
    expect(result.kind).toBe('etf');
    expect(result.effectiveBuyBps).toBe(0);
    expect(result.effectiveSellBps).toBe(0);
    expect(result.reason).toMatch(/ETF/);
  });

  test('Hong Kong ETF is exempt', () => {
    const result = resolveStampDutyExemption('00700.HK', 'hk_etf');
    expect(result.exempt).toBe(true);
    expect(result.kind).toBe('hk-etf');
  });

  test('non-ETF symbol returns not-exempt', () => {
    expect(resolveStampDutyExemption('600519.SH', 'cn_main').exempt).toBe(false);
    expect(resolveStampDutyExemption('0700.HK', 'hk').exempt).toBe(false);
    expect(resolveStampDutyExemption('AAPL', 'us').exempt).toBe(false);
  });
});
