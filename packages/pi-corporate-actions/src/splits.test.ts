import { describe, expect, test } from 'bun:test';
import {
  adjustPriceForSplit,
  cumulativeSplitFactor,
  isReverseSplit,
  sortSplitsChronologically,
  splitEventsBetween,
  splitRatio,
} from './splits';
import type { SplitEvent } from './types';

const splits: SplitEvent[] = [
  { symbol: 'X', exDate: '2022-01-01', ratioFrom: 1, ratioTo: 2 },
  { symbol: 'X', exDate: '2023-01-01', ratioFrom: 1, ratioTo: 3 },
  { symbol: 'X', exDate: '2024-01-01', ratioFrom: 2, ratioTo: 1 },
];

describe('splitRatio', () => {
  test('returns ratioTo / ratioFrom', () => {
    expect(splitRatio({ symbol: 'X', exDate: '2022', ratioFrom: 1, ratioTo: 4 })).toBe(4);
  });
  test('returns 1 when ratioFrom is 0', () => {
    expect(splitRatio({ symbol: 'X', exDate: '2022', ratioFrom: 0, ratioTo: 4 })).toBe(1);
  });
});

describe('isReverseSplit', () => {
  test('detects reverse split', () => {
    expect(isReverseSplit({ symbol: 'X', exDate: '2022', ratioFrom: 2, ratioTo: 1 })).toBe(true);
  });
  test('detects forward split', () => {
    expect(isReverseSplit({ symbol: 'X', exDate: '2022', ratioFrom: 1, ratioTo: 2 })).toBe(false);
  });
});

describe('sortSplitsChronologically', () => {
  test('sorts by exDate', () => {
    const sorted = sortSplitsChronologically([splits[2], splits[0], splits[1]]);
    expect(sorted[0].exDate).toBe('2022-01-01');
    expect(sorted[1].exDate).toBe('2023-01-01');
    expect(sorted[2].exDate).toBe('2024-01-01');
  });
});

describe('cumulativeSplitFactor', () => {
  test('multiplies all split ratios in order', () => {
    expect(cumulativeSplitFactor(splits)).toBeCloseTo(2 * 3 * 0.5, 5);
  });
  test('returns 1 for empty', () => {
    expect(cumulativeSplitFactor([])).toBe(1);
  });
});

describe('splitEventsBetween', () => {
  test('returns splits within range', () => {
    const out = splitEventsBetween(splits, '2022-06-01', '2023-06-01');
    expect(out.length).toBe(1);
    expect(out[0].exDate).toBe('2023-01-01');
  });
  test('returns empty when none in range', () => {
    expect(splitEventsBetween(splits, '2025-01-01', '2025-12-31')).toEqual([]);
  });
});

describe('adjustPriceForSplit', () => {
  test('applies cumulative factor', () => {
    expect(adjustPriceForSplit(100, [splits[0], splits[1]])).toBeCloseTo(600, 5);
  });
});
