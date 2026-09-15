import { describe, expect, test } from 'bun:test';
import {
  FACTOR_LIBRARY,
  computeAllFactors,
  computeFactor,
  computeMomentum,
  computeInversePE,
  computeRealizedVol,
  getFactorDef,
  listFactorIds,
} from './factors';
import type { FactorBar } from './types';

function makeBar(date: string, close: number, extras?: Partial<FactorBar>): FactorBar {
  return { date, close, volume: 1000, ...extras };
}

function makeSeries(values: number[], startDate: string = '2023-01-01'): FactorBar[] {
  return values.map((v, i) => {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return makeBar(d.toISOString().slice(0, 10), v);
  });
}

describe('FACTOR_LIBRARY', () => {
  test('has 20 entries', () => {
    expect(FACTOR_LIBRARY.length).toBeGreaterThanOrEqual(20);
  });
  test('all ids are unique', () => {
    const ids = new Set(FACTOR_LIBRARY.map((f) => f.id));
    expect(ids.size).toBe(FACTOR_LIBRARY.length);
  });
  test('each factor has valid category', () => {
    const validCats = new Set(['momentum', 'value', 'quality', 'volatility', 'size', 'growth', 'liquidity']);
    for (const f of FACTOR_LIBRARY) expect(validCats.has(f.category)).toBe(true);
  });
});

describe('getFactorDef', () => {
  test('returns def for known id', () => {
    const def = getFactorDef('mom_3m');
    expect(def).toBeDefined();
    expect(def?.category).toBe('momentum');
  });
  test('returns undefined for unknown id', () => {
    expect(getFactorDef('nope')).toBeUndefined();
  });
});

describe('listFactorIds', () => {
  test('filters by category', () => {
    const value = listFactorIds('value');
    expect(value.length).toBeGreaterThan(0);
    expect(value.every((id) => FACTOR_LIBRARY.find((f) => f.id === id)?.category === 'value')).toBe(true);
  });
});

describe('computeMomentum', () => {
  test('returns null when not enough bars', () => {
    expect(computeMomentum([], 10)).toBeNull();
    expect(computeMomentum(makeSeries([100, 101, 102]), 10)).toBeNull();
  });
  test('returns ratio - 1', () => {
    const bars = makeSeries(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(computeMomentum(bars, 20, 0)).toBeCloseTo((129 - 109) / 109, 4);
  });
});

describe('computeInversePE', () => {
  test('returns 1/PE', () => {
    const bars = [
      makeBar('2023-01-01', 100, { fundamental: { pe: 10 } }),
      makeBar('2023-01-02', 101, { fundamental: { pe: 12 } }),
    ];
    expect(computeInversePE(bars)).toBeCloseTo(1 / 12, 5);
  });
  test('skips zeros and undefined', () => {
    const bars = [
      makeBar('2023-01-01', 100, { fundamental: { pe: 0 } }),
      makeBar('2023-01-02', 101, { fundamental: { pe: 20 } }),
    ];
    expect(computeInversePE(bars)).toBeCloseTo(1 / 20, 5);
  });
  test('returns null when no PE data', () => {
    expect(computeInversePE(makeSeries([100, 101]))).toBeNull();
  });
});

describe('computeRealizedVol', () => {
  test('returns null when not enough bars', () => {
    expect(computeRealizedVol(makeSeries([100, 101, 102]), 20)).toBeNull();
  });
  test('returns positive annualized vol', () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const v = computeRealizedVol(makeSeries(values), 20);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });
});

describe('computeFactor', () => {
  test('dispatches by id', () => {
    const bars = makeSeries(Array.from({ length: 250 }, (_, i) => 100 + i * 0.5));
    const mom3m = computeFactor('mom_3m', bars);
    expect(mom3m).not.toBeNull();
  });
  test('returns null for unknown id', () => {
    const bars = makeSeries([100, 101, 102]);
    expect(computeFactor('does_not_exist', bars)).toBeNull();
  });
});

describe('computeAllFactors', () => {
  test('returns factor map for all computable factors', () => {
    const bars = makeSeries(Array.from({ length: 300 }, (_, i) => 100 + i));
    const facs = computeAllFactors(bars);
    expect(facs.size).toBeGreaterThan(0);
    expect(facs.has('mom_3m')).toBe(true);
  });
  test('respects factorIds filter', () => {
    const bars = makeSeries(Array.from({ length: 300 }, (_, i) => 100 + i));
    const facs = computeAllFactors(bars, ['mom_3m']);
    expect(facs.size).toBe(1);
    expect(facs.has('mom_3m')).toBe(true);
  });
});
