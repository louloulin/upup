import { describe, expect, test } from 'bun:test';
import { computeMACD, computeRSI, type IndicatorBar } from './indicators';
import {
  detectMACross,
  detectMAAlignment,
  detectSupportResistance,
  summarizeTrend,
} from './trend';

function makeRisingBars(count: number, start = 100, step = 1): IndicatorBar[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-09-${(i + 1).toString().padStart(2, '0')}`,
    open: start + i * step,
    high: start + (i + 0.5) * step,
    low: start + (i - 0.5) * step,
    close: start + (i + 1) * step,
    volume: 1000,
  }));
}

function makeFallingBars(count: number, start = 200, step = 1): IndicatorBar[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-09-${(i + 1).toString().padStart(2, '0')}`,
    open: start - i * step,
    high: start - (i - 0.5) * step,
    low: start - (i + 0.5) * step,
    close: start - (i + 1) * step,
    volume: 1000,
  }));
}

describe('detectMACross', () => {
  test('detects golden cross after V-shape recovery', () => {
    const bars: IndicatorBar[] = [];
    // First 20 bars fall (200 → 100), then 20 bars rise (100 → 200)
    for (let i = 0; i < 20; i += 1) bars.push({ date: `d${i}`, open: 200 - i * 5, high: 205 - i * 5, low: 195 - i * 5, close: 200 - i * 5, volume: 1000 });
    for (let i = 0; i < 20; i += 1) bars.push({ date: `d${20 + i}`, open: 100 + i * 5, high: 105 + i * 5, low: 95 + i * 5, close: 100 + i * 5, volume: 1000 });
    const closes = bars.map((b) => b.close);
    const dates = bars.map((b) => b.date);
    const events = detectMACross(closes, dates, 5, 10);
    expect(events.some((e) => e.type === 'golden-cross')).toBe(true);
  });

  test('detects death cross after inverted V-shape', () => {
    const bars: IndicatorBar[] = [];
    for (let i = 0; i < 20; i += 1) bars.push({ date: `d${i}`, open: 100 + i * 5, high: 105 + i * 5, low: 95 + i * 5, close: 100 + i * 5, volume: 1000 });
    for (let i = 0; i < 20; i += 1) bars.push({ date: `d${20 + i}`, open: 200 - i * 5, high: 205 - i * 5, low: 195 - i * 5, close: 200 - i * 5, volume: 1000 });
    const closes = bars.map((b) => b.close);
    const dates = bars.map((b) => b.date);
    const events = detectMACross(closes, dates, 5, 10);
    expect(events.some((e) => e.type === 'death-cross')).toBe(true);
  });

  test('rejects invalid periods', () => {
    const bars = makeRisingBars(20);
    const closes = bars.map((b) => b.close);
    const dates = bars.map((b) => b.date);
    expect(() => detectMACross(closes, dates, 10, 5)).toThrow();
  });

  test('rejects mismatched lengths', () => {
    expect(() => detectMACross([1, 2, 3], ['a'], 5, 10)).toThrow();
  });
});

describe('detectMAAlignment', () => {
  test('strictly rising bars produce uptrend alignment', () => {
    const bars = makeRisingBars(80, 100, 1);
    const closes = bars.map((b) => b.close);
    const alignment = detectMAAlignment(closes);
    expect(alignment.aligned).toBe(true);
    expect(alignment.direction).toBe('uptrend');
    expect(alignment.ma5).toBeDefined();
    expect(alignment.ma20).toBeDefined();
  });

  test('strictly falling bars produce downtrend alignment', () => {
    const bars = makeFallingBars(80, 200, 1);
    const closes = bars.map((b) => b.close);
    const alignment = detectMAAlignment(closes);
    expect(alignment.aligned).toBe(true);
    expect(alignment.direction).toBe('downtrend');
  });
});

describe('detectSupportResistance', () => {
  test('detects resistance at repeated highs', () => {
    const bars: IndicatorBar[] = [];
    // Three clear waves hitting same resistance at 110 with small valleys
    for (let wave = 0; wave < 3; wave += 1) {
      for (let i = 0; i < 8; i += 1) {
        const v = 95 + (i * 2) + (wave * 1);
        bars.push({ date: `d${wave * 8 + i}`, open: v, high: i === 7 ? 110 : v + 1, low: v - 1, close: v, volume: 1000 });
      }
    }
    const levels = detectSupportResistance(bars, { windowSize: 3, tolerancePct: 2, minTouches: 2 });
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.some((l) => l.type === 'resistance' && Math.abs(l.price - 110) < 3)).toBe(true);
  });

  test('returns empty for too-few bars', () => {
    const bars = makeRisingBars(5);
    expect(detectSupportResistance(bars)).toEqual([]);
  });
});

describe('summarizeTrend', () => {
  test('rising bars produce uptrend with positive strength', () => {
    const bars = makeRisingBars(40);
    const closes = bars.map((b) => b.close);
    const macd = computeMACD(closes);
    const rsi = computeRSI(closes);
    const summary = summarizeTrend(bars, { rsi, macdHistogram: macd.histogram });
    expect(summary.direction).toBe('uptrend');
    expect(summary.strength).toBeGreaterThan(0);
    expect(summary.latestClose).toBe(140);
  });

  test('falling bars produce downtrend', () => {
    const bars = makeFallingBars(40);
    const summary = summarizeTrend(bars);
    expect(summary.direction).toBe('downtrend');
  });
});
