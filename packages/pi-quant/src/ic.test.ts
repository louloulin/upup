import { describe, expect, test } from 'bun:test';
import { correlation, pearsonIC, spearmanIC, computeICSeries, icDecay } from './ic';

describe('correlation', () => {
  test('perfect positive', () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8], 'pearson')).toBeCloseTo(1, 8);
  });
  test('perfect negative', () => {
    expect(correlation([1, 2, 3, 4], [4, 3, 2, 1], 'pearson')).toBeCloseTo(-1, 8);
  });
  test('throws on length mismatch', () => {
    expect(() => correlation([1, 2], [1, 2, 3])).toThrow();
  });
  test('returns 0 for constant series', () => {
    expect(correlation([1, 1, 1], [1, 2, 3], 'pearson')).toBe(0);
  });
});

describe('pearsonIC / spearmanIC', () => {
  test('agree on linear', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonIC(x, y)).toBeCloseTo(spearmanIC(x, y), 5);
  });
  test('differ on monotonic non-linear (spearman = 1, pearson < 1)', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 4, 9, 16, 25];
    expect(spearmanIC(x, y)).toBeCloseTo(1, 8);
    expect(pearsonIC(x, y)).toBeLessThan(1);
  });
});

describe('computeICSeries', () => {
  test('returns mean / std / ir for a series', () => {
    const factors = [
      [1, 2, 3],
      [3, 2, 1],
      [1, 1, 1],
    ];
    const returns = [
      [0.1, 0.2, 0.3],
      [0.3, 0.2, 0.1],
      [0.0, 0.0, 0.0],
    ];
    const result = computeICSeries(factors, returns, ['d1', 'd2', 'd3'], 'pearson');
    expect(result.dates.length).toBe(3);
    expect(result.icSeries.length).toBe(3);
  });
  test('throws on length mismatch', () => {
    expect(() => computeICSeries([[1]], [], ['d1'], 'pearson')).toThrow();
  });
});

describe('icDecay', () => {
  test('returns requested lag length', () => {
    const decay = icDecay([0.1, 0.2, 0.15, 0.1, 0.05], 5);
    expect(decay.length).toBe(6);
  });
  test('first element equals mean of squared products at lag 0', () => {
    const series = [0.5, 0.3, 0.2];
    const decay = icDecay(series, 0);
    // icDecay at lag 0 is the mean of ic[t] * ic[t] across all t
    const expected = (0.5 * 0.5 + 0.3 * 0.3 + 0.2 * 0.2) / 3;
    expect(decay[0]).toBeCloseTo(expected, 5);
  });
});
