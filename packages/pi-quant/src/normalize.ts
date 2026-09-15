import type { NormalizationMethod } from './types';

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stddev(values: readonly number[], sampleMean?: number): number {
  if (values.length === 0) return 0;
  const m = sampleMean ?? mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function zscore(values: readonly number[]): readonly number[] {
  if (values.length === 0) return [];
  const m = mean(values);
  const s = stddev(values, m);
  if (s === 0) return values.map(() => 0);
  return values.map((v) => (v - m) / s);
}

export function rankAsc(values: readonly number[]): readonly number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < indexed.length; i++) ranks[indexed[i].i] = i + 1;
  return ranks;
}

export function rankDesc(values: readonly number[]): readonly number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < indexed.length; i++) ranks[indexed[i].i] = i + 1;
  return ranks;
}

export function winsorize(values: readonly number[], lowerPct: number = 0.025, upperPct: number = 0.975): readonly number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const loIdx = Math.floor(sorted.length * lowerPct);
  const hiIdx = Math.min(sorted.length - 1, Math.ceil(sorted.length * upperPct) - 1);
  const lo = sorted[Math.max(0, loIdx)];
  const hi = sorted[Math.max(0, hiIdx)];
  return values.map((v) => Math.min(hi, Math.max(lo, v)));
}

export function minmax(values: readonly number[]): readonly number[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}

export function normalize(values: readonly number[], method: NormalizationMethod): readonly number[] {
  switch (method) {
    case 'zscore':
      return zscore(values);
    case 'rank': {
      const ranks = rankAsc(values);
      const n = ranks.length;
      if (n === 0) return [];
      return ranks.map((r) => (r - 0.5) / n);
    }
    case 'winsorize-zscore':
      return zscore(winsorize(values));
    case 'minmax':
      return minmax(values);
  }
}

export function standardizeWithRef(values: readonly number[], refMean: number, refStd: number): readonly number[] {
  if (refStd === 0) return values.map(() => 0);
  return values.map((v) => (v - refMean) / refStd);
}
