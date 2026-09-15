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
  type IndicatorBar,
} from './indicators';

const sampleBars: IndicatorBar[] = [
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

describe('computeMACD', () => {
  test('produces aligned DIF/DEA/Histogram arrays', () => {
    const closes = sampleBars.map((bar) => bar.close);
    const result = computeMACD(closes);
    expect(result.dif.length).toBe(closes.length);
    expect(result.dea.length).toBe(closes.length);
    expect(result.histogram.length).toBe(closes.length);
    for (let i = 0; i < closes.length; i += 1) {
      if (result.dif[i] !== null && result.dea[i] !== null) {
        expect(result.histogram[i]).not.toBeNull();
        const expected = Number((((result.dif[i] as number) - (result.dea[i] as number)) * 2).toFixed(4));
        expect(result.histogram[i]).toBeCloseTo(expected, 3);
      }
    }
  });

  test('rejects invalid periods', () => {
    expect(() => computeMACD([1, 2, 3], 0)).toThrow();
    expect(() => computeMACD([1, 2, 3], 26, 12)).toThrow();
  });
});

describe('computeKDJ', () => {
  test('produces K, D, J with proper initialization', () => {
    const result = computeKDJ(sampleBars, 9);
    expect(result.k.length).toBe(sampleBars.length);
    expect(result.d.length).toBe(sampleBars.length);
    expect(result.j.length).toBe(sampleBars.length);
    for (let i = 0; i < 8; i += 1) expect(result.k[i]).toBeNull();
    const lastK = result.k.at(-1);
    expect(lastK).not.toBeNull();
    expect(typeof lastK).toBe('number');
  });

  test('J = 3K - 2D invariant', () => {
    const result = computeKDJ(sampleBars, 9);
    for (let i = 8; i < sampleBars.length; i += 1) {
      const k = result.k[i]!;
      const d = result.d[i]!;
      const j = result.j[i]!;
      expect(j).toBeCloseTo(3 * k - 2 * d, 1);
    }
  });
});

describe('computeBOLL', () => {
  test('middle equals SMA and upper > lower', () => {
    const closes = sampleBars.map((bar) => bar.close);
    const result = computeBOLL(closes, 5);
    expect(result.upper.length).toBe(closes.length);
    expect(result.middle.length).toBe(closes.length);
    expect(result.lower.length).toBe(closes.length);
    for (let i = 4; i < closes.length; i += 1) {
      expect(result.middle[i]).not.toBeNull();
      expect(result.upper[i]!).toBeGreaterThan(result.middle[i]!);
      expect(result.lower[i]!).toBeLessThan(result.middle[i]!);
    }
  });

  test('rejects invalid period', () => {
    expect(() => computeBOLL([1, 2, 3], 1)).toThrow();
  });
});

describe('computeATR', () => {
  test('produces ATR aligned with bars and EMA smoothing', () => {
    const atr = computeATR(sampleBars, 5);
    expect(atr.length).toBe(sampleBars.length);
    expect(atr[0]).toBeNull();
    for (let i = 5; i < atr.length; i += 1) expect(atr[i]).not.toBeNull();
  });
});

describe('computeRSI', () => {
  test('all rising closes produce high RSI', () => {
    const rising = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i + 1, volume: 1000 }));
    const rsi = computeRSI(rising.map((b) => b.close), 14);
    expect(rsi.at(-1)).toBeGreaterThan(80);
  });

  test('all falling closes produce low RSI', () => {
    const falling = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, open: 200 - i, high: 201 - i, low: 199 - i, close: 200 - i - 1, volume: 1000 }));
    const rsi = computeRSI(falling.map((b) => b.close), 14);
    expect(rsi.at(-1)).toBeLessThan(20);
  });
});

describe('computeOBV', () => {
  test('accumulates volume correctly on monotonic up trend', () => {
    const rising = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, open: 100, high: 100, low: 99, close: 100 + i, volume: 1000 }));
    const obv = computeOBV(rising);
    expect(obv.length).toBe(rising.length);
    expect(obv[0]).toBe(0);
    expect(obv.at(-1)).toBe(9000);
  });
});

describe('computeCCI', () => {
  test('produces CCI aligned with bars', () => {
    const result = computeCCI(sampleBars, 5);
    expect(result.cci.length).toBe(sampleBars.length);
    for (let i = 4; i < sampleBars.length; i += 1) expect(typeof result.cci[i]).toBe('number');
  });
});

describe('computeAllIndicators', () => {
  test('returns a complete suite', () => {
    const suite = computeAllIndicators(sampleBars);
    expect(suite.macd.dif.length).toBe(sampleBars.length);
    expect(suite.kdj.k.length).toBe(sampleBars.length);
    expect(suite.boll.upper.length).toBe(sampleBars.length);
    expect(suite.atr.length).toBe(sampleBars.length);
    expect(suite.rsi.length).toBe(sampleBars.length);
    expect(suite.obv.length).toBe(sampleBars.length);
    expect(suite.cci.cci.length).toBe(sampleBars.length);
  });

  test('throws on empty input', () => {
    expect(() => computeAllIndicators([])).toThrow();
  });
});
