import { describe, expect, test } from 'bun:test';
import {
  aggregateActions,
  computeTotalReturn,
} from './aggregate.js';
import type { CorporateAction, DividendEvent, RightsIssueEvent, SplitEvent } from './types.js';

const dividends: DividendEvent[] = [
  { symbol: 'X', exDate: '2023-06-10', amountPerShare: 1.0, currency: 'CNY' },
  { symbol: 'X', exDate: '2024-06-10', amountPerShare: 1.2, currency: 'CNY' },
];

const splits: SplitEvent[] = [
  { symbol: 'X', exDate: '2023-01-01', ratioFrom: 1, ratioTo: 2 },
];

const rights: RightsIssueEvent[] = [
  { symbol: 'X', exDate: '2024-03-01', ratioFrom: 10, ratioTo: 1, pricePerShare: 40, currency: 'CNY' },
];

describe('computeTotalReturn', () => {
  test('combines price, dividend, split and rights contributions', () => {
    const breakdown = computeTotalReturn({
      symbol: 'X',
      startDate: '2023-01-01',
      endDate: '2024-12-31',
      startPrice: 100,
      endPrice: 130,
      dividends,
      splits,
      rightsIssues: rights,
    });
    expect(breakdown.priceReturn).toBeCloseTo(0.3, 5);
    expect(breakdown.dividendReturn).toBeCloseTo(0.022, 5);
    expect(breakdown.splitContribution).toBeCloseTo(1.0, 5);
    expect(breakdown.rightsContribution).toBeCloseTo(0.1 * (40 / 130 - 1), 5);
    expect(breakdown.totalDividends).toBeCloseTo(2.2, 5);
    expect(breakdown.splitsApplied).toBe(1);
    expect(breakdown.rightsApplied).toBe(1);
  });

  test('returns 0 for empty inputs', () => {
    const breakdown = computeTotalReturn({
      symbol: 'X',
      startDate: '2023-01-01',
      endDate: '2024-12-31',
      startPrice: 100,
      endPrice: 100,
      dividends: [],
      splits: [],
      rightsIssues: [],
    });
    expect(breakdown.totalReturn).toBeCloseTo(0, 5);
    expect(breakdown.totalDividends).toBe(0);
  });

  test('throws when startPrice <= 0', () => {
    expect(() => computeTotalReturn({
      symbol: 'X',
      startDate: '2023-01-01',
      endDate: '2024-12-31',
      startPrice: 0,
      endPrice: 100,
      dividends: [],
      splits: [],
      rightsIssues: [],
    })).toThrow();
  });
});

describe('aggregateActions', () => {
  test('partitions actions by type', () => {
    const actions: CorporateAction[] = [
      { symbol: 'X', type: 'dividend', exDate: '2024-01-01', amountPerShare: 1.0, currency: 'CNY' },
      { symbol: 'X', type: 'split', exDate: '2023-01-01', ratioFrom: 1, ratioTo: 2 },
      { symbol: 'X', type: 'rights_issue', exDate: '2024-06-01', ratioFrom: 10, ratioTo: 1, pricePerShare: 50, currency: 'CNY' },
    ];
    const out = aggregateActions(actions);
    expect(out.dividends.length).toBe(1);
    expect(out.splits.length).toBe(1);
    expect(out.rightsIssues.length).toBe(1);
  });

  test('ignores entries with missing required fields', () => {
    const actions: CorporateAction[] = [
      { symbol: 'X', type: 'dividend', exDate: '2024-01-01' },
      { symbol: 'X', type: 'split', exDate: '2023-01-01', ratioFrom: 1 },
    ];
    const out = aggregateActions(actions);
    expect(out.dividends.length).toBe(0);
    expect(out.splits.length).toBe(0);
    expect(out.rightsIssues.length).toBe(0);
  });

  test('returns empty arrays for empty input', () => {
    const out = aggregateActions([]);
    expect(out.dividends).toEqual([]);
    expect(out.splits).toEqual([]);
    expect(out.rightsIssues).toEqual([]);
  });
});
