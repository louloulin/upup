import { describe, expect, test } from 'bun:test';
import {
  factorReturns,
  compoundReturn,
  maxDrawdown,
  annualizedSharpe,
  annualizedReturn,
  quintileAssignment,
} from './returns';

describe('compoundReturn', () => {
  test('returns 0 for empty', () => expect(compoundReturn([])).toBe(0));
  test('compounds correctly', () => {
    expect(compoundReturn([0.1, -0.05, 0.2])).toBeCloseTo(1.1 * 0.95 * 1.2 - 1, 6);
  });
});

describe('maxDrawdown', () => {
  test('returns 0 for empty', () => expect(maxDrawdown([])).toBe(0));
  test('detects 50% drawdown', () => {
    expect(maxDrawdown([100, 120, 60, 80])).toBeCloseTo(0.5, 5);
  });
});

describe('annualizedSharpe', () => {
  test('returns 0 for insufficient data', () => {
    expect(annualizedSharpe([0.01])).toBe(0);
  });
  test('positive for positive mean', () => {
    const rets = Array.from({ length: 100 }, () => 0.001 + (Math.random() - 0.5) * 0.005);
    expect(annualizedSharpe(rets)).toBeGreaterThan(0);
  });
});

describe('annualizedReturn', () => {
  test('returns 0 for empty', () => expect(annualizedReturn([])).toBe(0));
});

describe('quintileAssignment', () => {
  test('assigns quintiles 1..5', () => {
    const q = quintileAssignment([10, 30, 20, 50, 40]);
    expect(q.length).toBe(5);
    expect(Math.min(...q)).toBe(1);
    expect(Math.max(...q)).toBe(5);
  });
});

describe('factorReturns', () => {
  test('returns long / short / longShort summaries', () => {
    const long = [[0.01], [0.02], [-0.01]];
    const short = [[-0.01], [-0.02], [0.005]];
    const dates = ['d1', 'd2', 'd3'];
    const out = factorReturns(long, short, dates);
    expect(out.long.factorId).toBe('long');
    expect(out.short.factorId).toBe('short');
    expect(out.longShort.factorId).toBe('long-short');
    expect(out.longShort.periods.length).toBe(3);
  });
  test('throws on date length mismatch', () => {
    expect(() => factorReturns([[0.1]], [[-0.1]], [])).toThrow();
  });
});
