import { describe, expect, test } from 'bun:test';
import {
  annualizedDividendYield,
  dividendYieldOnDate,
  filterDividends,
  groupDividendsByYear,
  totalDividends,
} from './dividends.js';
import type { DividendEvent } from './types.js';

const sample: DividendEvent[] = [
  { symbol: 'X', exDate: '2022-06-10', amountPerShare: 1.0, currency: 'CNY' },
  { symbol: 'X', exDate: '2023-06-10', amountPerShare: 1.2, currency: 'CNY' },
  { symbol: 'X', exDate: '2024-06-10', amountPerShare: 1.5, currency: 'CNY' },
  { symbol: 'X', exDate: '2024-12-10', amountPerShare: 0.5, currency: 'USD' },
];

describe('filterDividends', () => {
  test('filters by startDate and endDate', () => {
    const out = filterDividends(sample, { startDate: '2023-01-01', endDate: '2023-12-31' });
    expect(out.length).toBe(1);
    expect(out[0].exDate).toBe('2023-06-10');
  });
  test('filters by minAmount', () => {
    const out = filterDividends(sample, { minAmount: 1.2 });
    expect(out.every((d) => d.amountPerShare >= 1.2)).toBe(true);
    expect(out.length).toBe(2);
  });
  test('filters by currency', () => {
    const out = filterDividends(sample, { currency: 'USD' });
    expect(out.length).toBe(1);
    expect(out[0].currency).toBe('USD');
  });
  test('returns empty when no match', () => {
    expect(filterDividends(sample, { currency: 'EUR' })).toEqual([]);
  });
});

describe('totalDividends', () => {
  test('sums amountPerShare across all', () => {
    expect(totalDividends(sample)).toBeCloseTo(4.2, 5);
  });
  test('returns 0 for empty input', () => {
    expect(totalDividends([])).toBe(0);
  });
});

describe('dividendYieldOnDate', () => {
  test('returns ratio on ex-date', () => {
    expect(dividendYieldOnDate(sample, '2024-06-10', 100)).toBeCloseTo(0.015, 5);
  });
  test('returns 0 when no match', () => {
    expect(dividendYieldOnDate(sample, '2024-06-11', 100)).toBe(0);
  });
  test('returns 0 when price <= 0', () => {
    expect(dividendYieldOnDate(sample, '2024-06-10', 0)).toBe(0);
  });
});

describe('annualizedDividendYield', () => {
  test('returns trailing 365-day yield', () => {
    const y = annualizedDividendYield(sample, 100, 365);
    expect(y).toBeCloseTo(0.02, 5);
  });
  test('returns 0 when price <= 0', () => {
    expect(annualizedDividendYield(sample, 0, 365)).toBe(0);
  });
  test('returns 0 when no dividends', () => {
    expect(annualizedDividendYield([], 100, 365)).toBe(0);
  });
});

describe('groupDividendsByYear', () => {
  test('groups by year', () => {
    const grouped = groupDividendsByYear(sample);
    expect(grouped.get(2022)?.length).toBe(1);
    expect(grouped.get(2024)?.length).toBe(2);
    expect(grouped.get(2023)?.length).toBe(1);
  });
});
