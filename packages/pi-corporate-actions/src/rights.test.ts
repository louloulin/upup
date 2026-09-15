import { describe, expect, test } from 'bun:test';
import {
  rightsIssueCost,
  rightsSubscriptionRatio,
  rightsTheoreticalExPrice,
  sortRightsChronologically,
  totalRightsCost,
} from './rights';
import type { RightsIssueEvent } from './types';

const rights: RightsIssueEvent[] = [
  { symbol: 'X', exDate: '2024-01-01', ratioFrom: 10, ratioTo: 3, pricePerShare: 50, currency: 'CNY' },
  { symbol: 'X', exDate: '2024-06-01', ratioFrom: 5, ratioTo: 1, pricePerShare: 80, currency: 'CNY' },
];

describe('rightsSubscriptionRatio', () => {
  test('returns ratioTo / ratioFrom', () => {
    expect(rightsSubscriptionRatio(rights[0])).toBeCloseTo(0.3, 5);
  });
  test('returns 0 when ratioFrom is 0', () => {
    expect(rightsSubscriptionRatio({ symbol: 'X', exDate: 'x', ratioFrom: 0, ratioTo: 1, pricePerShare: 1, currency: 'CNY' })).toBe(0);
  });
});

describe('rightsTheoreticalExPrice', () => {
  test('TP = (lastClose + ratio * price) / (1 + ratio)', () => {
    const tp = rightsTheoreticalExPrice(rights[0], 100);
    expect(tp).toBeCloseTo((100 + 0.3 * 50) / 1.3, 5);
  });
  test('returns lastClose when ratio is 0', () => {
    expect(rightsTheoreticalExPrice({ ...rights[0], ratioFrom: 0 }, 100)).toBe(100);
  });
});

describe('rightsIssueCost', () => {
  test('cost = shares * ratio * pricePerShare', () => {
    expect(rightsIssueCost(1000, rights[0])).toBeCloseTo(1000 * 0.3 * 50, 5);
  });
});

describe('sortRightsChronologically', () => {
  test('sorts by exDate', () => {
    const out = sortRightsChronologically([rights[1], rights[0]]);
    expect(out[0].exDate).toBe('2024-01-01');
  });
});

describe('totalRightsCost', () => {
  test('sums all rights issue costs', () => {
    expect(totalRightsCost(1000, rights)).toBeCloseTo(1000 * 0.3 * 50 + 1000 * 0.2 * 80, 5);
  });
  test('returns 0 for empty', () => {
    expect(totalRightsCost(1000, [])).toBe(0);
  });
});
