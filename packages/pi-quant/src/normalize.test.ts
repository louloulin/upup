import { describe, expect, test } from 'bun:test';
import {
  mean,
  stddev,
  zscore,
  rankAsc,
  rankDesc,
  winsorize,
  minmax,
  normalize,
} from './normalize.js';

describe('mean', () => {
  test('returns 0 for empty', () => expect(mean([])).toBe(0));
  test('returns average', () => expect(mean([1, 2, 3, 4, 5])).toBe(3));
});

describe('stddev', () => {
  test('returns 0 for empty', () => expect(stddev([])).toBe(0));
  test('returns population stddev', () => expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 5));
});

describe('zscore', () => {
  test('mean of zscores is 0', () => {
    const z = zscore([1, 2, 3, 4, 5]);
    expect(mean(z)).toBeCloseTo(0, 8);
  });
  test('returns 0 for constant input', () => {
    expect(zscore([5, 5, 5])).toEqual([0, 0, 0]);
  });
});

describe('rankAsc / rankDesc', () => {
  test('rankAsc gives 1 to smallest', () => {
    expect(rankAsc([30, 10, 20])).toEqual([3, 1, 2]);
  });
  test('rankDesc gives 1 to largest', () => {
    expect(rankDesc([30, 10, 20])).toEqual([1, 3, 2]);
  });
});

describe('winsorize', () => {
  test('clamps extremes', () => {
    const out = winsorize([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 0.1, 0.9);
    expect(out[0]).toBeGreaterThan(1);
    expect(out[out.length - 1]).toBeLessThan(100);
  });
});

describe('minmax', () => {
  test('range is [0, 1]', () => {
    const out = minmax([1, 5, 10]);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(1);
    expect(out[1]).toBeCloseTo(4 / 9, 5);
  });
});

describe('normalize', () => {
  test('zscore route', () => {
    const out = normalize([1, 2, 3, 4, 5], 'zscore');
    expect(out.length).toBe(5);
    expect(mean(out)).toBeCloseTo(0, 8);
  });
  test('rank route returns uniform [0,1]', () => {
    const out = normalize([1, 2, 3, 4, 5], 'rank');
    expect(out.length).toBe(5);
    expect(Math.min(...out)).toBeCloseTo(0.1, 5);
    expect(Math.max(...out)).toBeCloseTo(0.9, 5);
  });
  test('winsorize-zscore', () => {
    const out = normalize([1, 2, 3, 4, 100], 'winsorize-zscore');
    expect(mean(out)).toBeCloseTo(0, 5);
  });
  test('minmax route', () => {
    const out = normalize([1, 5, 10], 'minmax');
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(1);
  });
});
