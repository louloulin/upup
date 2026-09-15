import { describe, expect, test } from 'bun:test';
import {
  aggregateActions,
  annualizedDividendYield,
  computeTotalReturn,
  createDryRunClient,
  dryRunEvidence,
  filterDividends,
  totalDividends,
} from './src/index';

describe('pi-corporate-actions smoke', () => {
  test('dry-run dividends for 600519.SH', async () => {
    const client = createDryRunClient();
    const ds = await client.listDividends('600519.SH');
    expect(ds.length).toBe(2);
    expect(ds[0].amountPerShare).toBe(30.88);
    expect(ds[0].currency).toBe('CNY');
  });

  test('dry-run splits for AAPL', async () => {
    const client = createDryRunClient();
    const splits = await client.listSplits('AAPL');
    expect(splits.length).toBe(2);
  });

  test('dry-run rights for 0700.HK', async () => {
    const client = createDryRunClient();
    const rights = await client.listRightsIssues('0700.HK');
    expect(rights.length).toBe(1);
  });

  test('total return includes dividend + price', () => {
    const breakdown = computeTotalReturn({
      symbol: 'X',
      startDate: '2023-01-01',
      endDate: '2023-12-31',
      startPrice: 100,
      endPrice: 110,
      dividends: [{ symbol: 'X', exDate: '2023-06-01', amountPerShare: 2.0, currency: 'CNY' }],
      splits: [],
      rightsIssues: [],
    });
    expect(breakdown.priceReturn).toBeCloseTo(0.1, 5);
    expect(breakdown.dividendReturn).toBeCloseTo(0.02, 5);
    expect(breakdown.totalReturn).toBeCloseTo(0.12, 5);
  });

  test('aggregateActions splits dividends vs splits vs rights', () => {
    const out = aggregateActions([
      { symbol: 'X', type: 'dividend', exDate: '2024-01-01', amountPerShare: 1.0, currency: 'CNY' },
      { symbol: 'X', type: 'split', exDate: '2023-01-01', ratioFrom: 1, ratioTo: 2 },
    ]);
    expect(out.dividends.length).toBe(1);
    expect(out.splits.length).toBe(1);
    expect(out.rightsIssues.length).toBe(0);
  });

  test('annualized dividend yield on AAPL with no dividends', () => {
    expect(annualizedDividendYield([], 100, 365)).toBe(0);
  });

  test('filterDividends + totalDividends round-trip', () => {
    const ds = [
      { symbol: 'X', exDate: '2024-01-01', amountPerShare: 1, currency: 'CNY' as const },
      { symbol: 'X', exDate: '2024-06-01', amountPerShare: 2, currency: 'CNY' as const },
    ];
    const filtered = filterDividends(ds, { startDate: '2024-03-01' });
    expect(filtered.length).toBe(1);
    expect(totalDividends(filtered)).toBe(2);
  });

  test('dryRunEvidence reports dry-run source', () => {
    expect(dryRunEvidence().source).toBe('dry-run://pi-corporate-actions');
    expect(dryRunEvidence().dataFreshness).toBe('offline');
  });
});
