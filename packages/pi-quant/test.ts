import { describe, expect, test } from 'bun:test';
import {
  createDryRunUniverse,
  computeFactor,
  computeAllFactors,
  dryRunEvidence,
  normalize,
  zscore,
  pearsonIC,
  spearmanIC,
  regress,
  orthogonalize,
  compoundReturn,
  maxDrawdown,
  rebalanceDates,
  topBottomSymbols,
  equalWeightWeights,
  scoreUniverse,
  FACTOR_LIBRARY,
} from './src/index';

describe('pi-quant smoke', () => {
  test('factor library has 20+ entries', () => {
    expect(FACTOR_LIBRARY.length).toBeGreaterThanOrEqual(20);
  });

  test('dry-run universe has 10 symbols with bars', () => {
    const u = createDryRunUniverse();
    expect(u.symbols.length).toBe(10);
    for (const s of u.symbols) expect(u.bars.get(s)?.length ?? 0).toBeGreaterThan(0);
  });

  test('compute momentum factor from dry-run bars', () => {
    const u = createDryRunUniverse();
    const bars = u.bars.get('A')!;
    const v = computeFactor('mom_3m', bars);
    expect(v).not.toBeNull();
  });

  test('compute all factors for a dry-run symbol', () => {
    const u = createDryRunUniverse();
    const facs = computeAllFactors(u.bars.get('B')!);
    expect(facs.size).toBeGreaterThan(0);
  });

  test('normalize zscore makes mean zero', () => {
    const z = zscore([1, 2, 3, 4, 5]);
    expect(z.reduce((s, v) => s + v, 0) / z.length).toBeCloseTo(0, 8);
  });

  test('normalize route works', () => {
    const z = normalize([1, 5, 10], 'minmax');
    expect(z[0]).toBe(0);
    expect(z[2]).toBe(1);
  });

  test('pearsonIC of perfectly correlated series', () => {
    expect(pearsonIC([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 8);
  });

  test('spearmanIC of monotonic series', () => {
    expect(spearmanIC([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 8);
  });

  test('regress recovers known slope + intercept', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [3, 5, 7, 9, 11];
    const r = regress(y, [x]);
    expect(r.intercept).toBeCloseTo(1, 5);
    expect(r.coefficients[0]).toBeCloseTo(2, 5);
  });

  test('orthogonalize removes linear dependence', () => {
    const x = [1, 2, 3, 4, 5];
    const target = x.map((v) => 2 * v);
    const res = orthogonalize(target, [x]);
    const m = res.reduce((s, v) => s + v, 0) / res.length;
    expect(Math.abs(m)).toBeLessThan(1e-6);
  });

  test('compoundReturn and maxDrawdown agree with manual computation', () => {
    expect(compoundReturn([0.1, -0.05])).toBeCloseTo(1.1 * 0.95 - 1, 6);
    expect(maxDrawdown([100, 80, 120, 60])).toBeCloseTo(0.5, 5);
  });

  test('rebalanceDates generates daily / weekly / monthly schedules', () => {
    expect(rebalanceDates('2024-01-01', '2024-01-05', 'daily').length).toBe(5);
    expect(rebalanceDates('2024-01-01', '2024-01-29', 'weekly').length).toBe(5);
    expect(rebalanceDates('2024-01-01', '2024-04-01', 'monthly').length).toBe(4);
  });

  test('topBottomSymbols picks extremes', () => {
    const m = new Map([['A', 0.6], ['B', 0.4], ['C', 0.2]]);
    const out = topBottomSymbols(m, 1, 1);
    expect(out.top).toEqual(['A']);
    expect(out.bottom).toEqual(['C']);
  });

  test('equalWeightWeights divides uniformly', () => {
    const w = equalWeightWeights(['a', 'b', 'c']);
    expect(w.length).toBe(3);
    expect(w[0].weight).toBeCloseTo(1 / 3, 8);
  });

  test('scoreUniverse produces ranks for dry-run universe', () => {
    const u = createDryRunUniverse();
    const matrix = new Map<string, ReadonlyMap<string, number>>();
    for (const sym of u.symbols) {
      const bars = u.bars.get(sym)!;
      const facs = computeAllFactors(bars, ['mom_3m']);
      matrix.set(sym, facs);
    }
    const scores = scoreUniverse(u.symbols, matrix, equalWeightWeights(['mom_3m']), '2024-01-01');
    expect(scores.length).toBe(u.symbols.length);
    const ranks = scores.map((s) => s.rank).sort((a, b) => a - b);
    expect(ranks[0]).toBe(1);
    expect(ranks[ranks.length - 1]).toBe(scores.length);
  });

  test('dry-run evidence reports offline data', () => {
    expect(dryRunEvidence().dataFreshness).toBe('offline');
    expect(dryRunEvidence().source).toBe('dry-run://pi-quant');
  });
});
