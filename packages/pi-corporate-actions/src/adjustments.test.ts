import { describe, expect, test } from 'bun:test';
import {
  adjustBars,
  backAdjust,
  computeAdjustmentFactors,
  forwardAdjust,
  summarizeAdjustment,
} from './adjustments';
import type { CorporateAction, RawBar } from './adjustments';
import type { PriceAdjustmentOptions } from './types';

const splits: CorporateAction[] = [
  { symbol: 'X', type: 'split', exDate: '2022-01-01', ratioFrom: 1, ratioTo: 2 },
  { symbol: 'X', type: 'split', exDate: '2023-01-01', ratioFrom: 1, ratioTo: 3 },
];

const bars: RawBar[] = [
  { date: '2021-06-01', close: 100 },
  { date: '2021-12-31', close: 110 },
  { date: '2022-06-30', close: 60 },
  { date: '2022-12-31', close: 70 },
  { date: '2023-06-30', close: 25 },
  { date: '2023-12-31', close: 30 },
];

const opts: PriceAdjustmentOptions = { symbol: 'X', method: 'back-adjust', actions: splits };

describe('computeAdjustmentFactors', () => {
  test('cumulative factor at each split date', () => {
    const factors = computeAdjustmentFactors(splits);
    expect(factors.get('2022-01-01')).toBe(2);
    expect(factors.get('2023-01-01')).toBe(6);
  });
});

describe('backAdjust', () => {
  test('most recent bars are multiplied by latest factor', () => {
    const out = backAdjust(opts, bars);
    expect(out[out.length - 1].adjustedClose).toBeCloseTo(30 * 6, 5);
  });
  test('earliest bars are unadjusted', () => {
    const out = backAdjust(opts, bars);
    expect(out[0].adjustedClose).toBe(100);
  });
});

describe('forwardAdjust', () => {
  test('earliest bars are multiplied by latest cumulative factor (前复权)', () => {
    const out = forwardAdjust({ ...opts, method: 'forward-adjust' }, bars);
    expect(out[0].adjustedClose).toBeCloseTo(100 * 6, 5);
  });
  test('most recent bars remain at unadjusted close (前复权)', () => {
    const out = forwardAdjust({ ...opts, method: 'forward-adjust' }, bars);
    expect(out[out.length - 1].adjustedClose).toBeCloseTo(30, 5);
  });
  test('mid-range bars use factor = latestFactor / cumulativeBack', () => {
    const out = forwardAdjust({ ...opts, method: 'forward-adjust' }, bars);
    // 2022-06-30 (cumulativeBack=2): factor=3
    expect(out[2].adjustedClose).toBeCloseTo(60 * 3, 5);
  });
});

describe('adjustBars', () => {
  test('routes to backAdjust for back-adjust', () => {
    const out = adjustBars(opts, bars);
    expect(out[0].adjustedClose).toBe(100);
  });
  test('routes to forwardAdjust for forward-adjust', () => {
    const out = adjustBars({ ...opts, method: 'forward-adjust' }, bars);
    expect(out[0].adjustedClose).toBeCloseTo(100 * 6, 5);
  });
  test('throws on unknown method', () => {
    expect(() => adjustBars({ ...opts, method: 'foo' as 'back-adjust' }, bars)).toThrow();
  });
  test('returns empty array for empty bars', () => {
    expect(adjustBars(opts, [])).toEqual([]);
  });
});

describe('summarizeAdjustment', () => {
  test('counts factor transitions', () => {
    const out = backAdjust(opts, bars);
    const summary = summarizeAdjustment(out);
    expect(summary.adjustmentEvents).toBe(2);
  });
  test('handles empty input', () => {
    const s = summarizeAdjustment([]);
    expect(s.adjustmentEvents).toBe(0);
    expect(s.minFactor).toBe(1);
    expect(s.maxFactor).toBe(1);
  });
});
