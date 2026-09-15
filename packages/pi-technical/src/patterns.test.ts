import { describe, expect, test } from 'bun:test';
import { describePattern, listPatternKinds, recognizePatterns, type IndicatorBar } from './patterns';

function makeDoji(date: string, price = 100): IndicatorBar {
  return { date, open: price, high: price + 0.5, low: price - 0.5, close: price + 0.05, volume: 1000 };
}

function makeBullish(date: string, open: number, close: number, high = close + 1, low = open - 1): IndicatorBar {
  return { date, open, high, low, close, volume: 1000 };
}

function makeBearish(date: string, open: number, close: number, high = open + 1, low = close - 1): IndicatorBar {
  return { date, open, high, low, close, volume: 1000 };
}

describe('recognizePatterns', () => {
  test('detects doji when body is tiny', () => {
    const patterns = recognizePatterns([makeDoji('2026-09-01')], { minStrength: 0 });
    expect(patterns.some((p) => p.kind === 'doji')).toBe(true);
  });

  test('detects bullish engulfing', () => {
    const bars = [makeBearish('d1', 100, 95), makeBullish('d2', 94, 101)];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'bullish-engulfing')).toBe(true);
  });

  test('detects bearish engulfing', () => {
    const bars = [makeBullish('d1', 95, 100), makeBearish('d2', 101, 94)];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'bearish-engulfing')).toBe(true);
  });

  test('detects morning star', () => {
    const bars = [
      makeBearish('d1', 100, 95),
      { date: 'd2', open: 94, high: 94.5, low: 92, close: 93.5, volume: 1000 },
      makeBullish('d3', 94, 102),
    ];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'morning-star')).toBe(true);
  });

  test('detects evening star', () => {
    // Middle bar: open=100, close=100.6, high=102, low=99.4, range=2.6, body=0.6, bodyPct~0.23 (small), middle.high=102 > first.close=100 ✓ and > bar.open=102? Need bar.open < middle.high
    const bars = [
      makeBullish('d1', 95, 100),
      { date: 'd2', open: 100, high: 102, low: 99.4, close: 100.6, volume: 1000 },
      makeBearish('d3', 101, 94),
    ];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'evening-star')).toBe(true);
  });

  test('detects three white soldiers', () => {
    const bars = [makeBullish('d1', 100, 102), makeBullish('d2', 103, 105), makeBullish('d3', 106, 108)];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'three-white-soldiers')).toBe(true);
  });

  test('detects three black crows', () => {
    const bars = [makeBearish('d1', 100, 98), makeBearish('d2', 97, 95), makeBearish('d3', 94, 92)];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'three-black-crows')).toBe(true);
  });

  test('detects hammer', () => {
    // body 1 (close 99 - open 98), range 9.5 (high 99.5, low 90), bodyPct ~0.105, lower shadow ~8, upper shadow ~0.5
    const bars = [{ date: 'd1', open: 98, high: 99.5, low: 90, close: 99, volume: 1000 }];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'hammer')).toBe(true);
  });

  test('detects shooting star after uptrend bar', () => {
    // First bar bullish, second bar: open=100, close=101.5, high=110, low=100
    // body=1.5, range=10, bodyPct=0.15 (in 0.1-0.4), upperShadow=8.5 (us/r=0.85), lowerShadow=0
    const bars = [makeBullish('d1', 95, 100), { date: 'd2', open: 100, high: 110, low: 100, close: 101.5, volume: 1000 }];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'shooting-star')).toBe(true);
  });

  test('filters by minStrength', () => {
    const patterns = recognizePatterns([makeDoji('d1')], { minStrength: 0.99 });
    expect(patterns).toEqual([]);
  });
});

describe('pattern helpers', () => {
  test('listPatternKinds returns all kinds', () => {
    const kinds = listPatternKinds();
    expect(kinds.length).toBeGreaterThanOrEqual(10);
    expect(kinds).toContain('doji');
    expect(kinds).toContain('hammer');
  });

  test('describePattern returns a non-empty description', () => {
    expect(describePattern('doji').length).toBeGreaterThan(0);
    expect(describePattern('morning-star').length).toBeGreaterThan(0);
  });
});
