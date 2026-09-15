import { describe, expect, test } from 'bun:test';
import {
  computeAllIndicators,
  computeATR,
  computeBOLL,
  computeCCI,
  computeKDJ,
  computeMACD,
  computeOBV,
  computeRSI,
  detectMACross,
  detectMAAlignment,
  detectSupportResistance,
  listPatternKinds,
  recognizePatterns,
  summarizeTrend,
  type IndicatorBar,
} from './src/index';

const fixtureBars: IndicatorBar[] = [
  { date: '2026-09-01', open: 100, high: 105, low: 99, close: 104, volume: 1000 },
  { date: '2026-09-02', open: 104, high: 108, low: 103, close: 107, volume: 1200 },
  { date: '2026-09-03', open: 107, high: 110, low: 106, close: 109, volume: 1100 },
  { date: '2026-09-04', open: 109, high: 112, low: 108, close: 111, volume: 1300 },
  { date: '2026-09-05', open: 111, high: 115, low: 110, close: 114, volume: 1500 },
  { date: '2026-09-06', open: 114, high: 116, low: 112, close: 113, volume: 1400 },
  { date: '2026-09-07', open: 113, high: 115, low: 111, close: 112, volume: 1200 },
  { date: '2026-09-08', open: 112, high: 114, low: 110, close: 111, volume: 1100 },
  { date: '2026-09-09', open: 111, high: 113, low: 109, close: 110, volume: 1000 },
  { date: '2026-09-10', open: 110, high: 112, low: 108, close: 109, volume: 950 },
];

describe('pi-technical', () => {
  test('computeAllIndicators returns a complete suite', () => {
    const suite = computeAllIndicators(fixtureBars);
    expect(suite.macd.dif.length).toBe(fixtureBars.length);
    expect(suite.kdj.k.length).toBe(fixtureBars.length);
    expect(suite.boll.upper.length).toBe(fixtureBars.length);
    expect(suite.atr.length).toBe(fixtureBars.length);
    expect(suite.rsi.length).toBe(fixtureBars.length);
    expect(suite.obv.length).toBe(fixtureBars.length);
    expect(suite.cci.cci.length).toBe(fixtureBars.length);
  });

  test('computeMACD / computeKDJ / computeBOLL / computeATR / computeRSI / computeOBV / computeCCI all return aligned arrays', () => {
    const closes = fixtureBars.map((b) => b.close);
    expect(computeMACD(closes).dif.length).toBe(closes.length);
    expect(computeKDJ(fixtureBars).k.length).toBe(fixtureBars.length);
    expect(computeBOLL(closes).upper.length).toBe(closes.length);
    expect(computeATR(fixtureBars).length).toBe(fixtureBars.length);
    expect(computeRSI(closes).length).toBe(closes.length);
    expect(computeOBV(fixtureBars).length).toBe(fixtureBars.length);
    expect(computeCCI(fixtureBars).cci.length).toBe(fixtureBars.length);
  });

  test('detectMACross emits an event on a V-shape recovery', () => {
    const bars: IndicatorBar[] = [];
    for (let i = 0; i < 20; i += 1) bars.push({ date: `d${i}`, open: 200 - i * 5, high: 205 - i * 5, low: 195 - i * 5, close: 200 - i * 5, volume: 1000 });
    for (let i = 0; i < 20; i += 1) bars.push({ date: `d${20 + i}`, open: 100 + i * 5, high: 105 + i * 5, low: 95 + i * 5, close: 100 + i * 5, volume: 1000 });
    const events = detectMACross(bars.map((b) => b.close), bars.map((b) => b.date), 5, 10);
    expect(events.some((e) => e.type === 'golden-cross')).toBe(true);
  });

  test('detectMAAlignment produces uptrend for strictly rising bars', () => {
    const bars: IndicatorBar[] = Array.from({ length: 80 }, (_, i) => ({ date: `d${i}`, open: 100, high: 100 + i + 1, low: 100 + i - 1, close: 100 + i + 1, volume: 1000 }));
    const alignment = detectMAAlignment(bars.map((b) => b.close));
    expect(alignment.direction).toBe('uptrend');
  });

  test('detectSupportResistance returns levels for repetitive pivots', () => {
    const bars: IndicatorBar[] = [];
    for (let wave = 0; wave < 3; wave += 1) {
      for (let i = 0; i < 8; i += 1) {
        const v = 95 + i * 2 + wave;
        bars.push({ date: `d${wave * 8 + i}`, open: v, high: i === 7 ? 110 : v + 1, low: v - 1, close: v, volume: 1000 });
      }
    }
    const levels = detectSupportResistance(bars, { windowSize: 3, tolerancePct: 2, minTouches: 2 });
    expect(levels.length).toBeGreaterThan(0);
  });

  test('recognizePatterns detects bullish engulfing on a clear pair', () => {
    const bars: IndicatorBar[] = [
      { date: 'd1', open: 100, high: 101, low: 95, close: 96, volume: 1000 },
      { date: 'd2', open: 95, high: 102, low: 94, close: 101, volume: 1000 },
    ];
    const patterns = recognizePatterns(bars);
    expect(patterns.some((p) => p.kind === 'bullish-engulfing')).toBe(true);
  });

  test('listPatternKinds returns at least 10 patterns', () => {
    expect(listPatternKinds().length).toBeGreaterThanOrEqual(10);
  });

  test('summarizeTrend reports uptrend for strictly rising series', () => {
    const bars: IndicatorBar[] = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, open: 100, high: 100 + i + 0.5, low: 100 + i - 0.5, close: 100 + i + 1, volume: 1000 }));
    const summary = summarizeTrend(bars);
    expect(summary.direction).toBe('uptrend');
    expect(summary.strength).toBeGreaterThan(0);
  });
});
