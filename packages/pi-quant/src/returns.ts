import type { FactorReturnsResult } from './types';

export function factorReturns(
  topQuintileReturns: readonly (readonly number[])[],
  bottomQuintileReturns: readonly (readonly number[])[],
  dates: readonly string[],
): { long: FactorReturnsResult; short: FactorReturnsResult; longShort: FactorReturnsResult } {
  if (topQuintileReturns.length !== dates.length) {
    throw new Error('length mismatch between quintile returns and dates');
  }
  const longReturns = averageAcross(topQuintileReturns);
  const shortReturns = averageAcross(bottomQuintileReturns);
  const lsReturns = longReturns.map((r, i) => r - shortReturns[i]);

  return {
    long: summarizeReturns('long', longReturns, dates),
    short: summarizeReturns('short', shortReturns, dates),
    longShort: summarizeReturns('long-short', lsReturns, dates),
  };
}

function averageAcross(matrix: readonly (readonly number[])[]): readonly number[] {
  return matrix.map((row) => {
    if (row.length === 0) return 0;
    return row.reduce((s, v) => s + v, 0) / row.length;
  });
}

function summarizeReturns(
  factorId: string,
  returns: readonly number[],
  dates: readonly string[],
): FactorReturnsResult {
  if (returns.length === 0) {
    return { factorId, meanReturn: 0, volatility: 0, sharpe: 0, cumulativeReturn: 0, periods: [] };
  }
  const m = mean(returns);
  const s = stddev(returns, m);
  const sharpe = s === 0 ? 0 : (m / s) * Math.sqrt(252);
  let cumulative = 1;
  const periods: { date: string; return: number; cumulative: number }[] = [];
  for (let i = 0; i < returns.length; i++) {
    cumulative *= 1 + returns[i];
    periods.push({ date: dates[i] ?? '', return: returns[i], cumulative });
  }
  return { factorId, meanReturn: m, volatility: s, sharpe, cumulativeReturn: cumulative - 1, periods };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: readonly number[], sampleMean?: number): number {
  if (values.length === 0) return 0;
  const m = sampleMean ?? mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function compoundReturn(returns: readonly number[]): number {
  let c = 1;
  for (const r of returns) c *= 1 + r;
  return c - 1;
}

export function maxDrawdown(equity: readonly number[]): number {
  if (equity.length === 0) return 0;
  let peak = equity[0];
  let mdd = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) {
      const dd = (peak - e) / peak;
      if (dd > mdd) mdd = dd;
    }
  }
  return mdd;
}

export function annualizedSharpe(returns: readonly number[], rf: number = 0): number {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const s = stddev(returns, m);
  if (s === 0) return 0;
  return ((m - rf) / s) * Math.sqrt(252);
}

export function annualizedReturn(returns: readonly number[], periodsPerYear: number = 252): number {
  const total = compoundReturn(returns);
  if (returns.length === 0) return 0;
  return Math.pow(1 + total, periodsPerYear / returns.length) - 1;
}

export function quintileAssignment(values: readonly number[]): readonly number[] {
  const ranks = rankAsc(values);
  const n = ranks.length;
  return ranks.map((r) => Math.min(5, Math.ceil((r / n) * 5)));
}

function rankAsc(values: readonly number[]): readonly number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < indexed.length; i++) ranks[indexed[i].i] = i + 1;
  return ranks;
}
