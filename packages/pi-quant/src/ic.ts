import type { ICResult } from './types.js';

export function pearsonIC(x: readonly number[], y: readonly number[]): number {
  return correlation(x, y, 'pearson');
}

export function spearmanIC(x: readonly number[], y: readonly number[]): number {
  return correlation(x, y, 'spearman');
}

export function correlation(x: readonly number[], y: readonly number[], method: 'pearson' | 'spearman' = 'pearson'): number {
  if (x.length !== y.length) {
    throw new Error(`length mismatch: x=${x.length}, y=${y.length}`);
  }
  if (x.length < 2) return 0;
  let xs = x;
  let ys = y;
  if (method === 'spearman') {
    xs = rank(x);
    ys = rank(y);
  }
  const meanX = xs.reduce((s, v) => s + v, 0) / xs.length;
  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return 0;
  return num / denom;
}

function rank(values: readonly number[]): readonly number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return out;
}

export function computeICSeries(
  factorValues: readonly (readonly number[])[],
  forwardReturns: readonly (readonly number[])[],
  dates: readonly string[],
  method: 'pearson' | 'spearman' = 'spearman',
): ICResult {
  if (factorValues.length !== forwardReturns.length) {
    throw new Error(`length mismatch: factor=${factorValues.length}, returns=${forwardReturns.length}`);
  }
  const icSeries: number[] = [];
  for (let i = 0; i < factorValues.length; i++) {
    const f = factorValues[i];
    const r = forwardReturns[i];
    if (f.length === 0 || r.length === 0 || f.length !== r.length) {
      icSeries.push(0);
    } else {
      icSeries.push(correlation(f, r, method));
    }
  }
  const m = mean(icSeries);
  const s = stddev(icSeries, m);
  const ir = s === 0 ? 0 : m / s;
  return {
    factorId: '',
    icMean: m,
    icStd: s,
    icIR: ir,
    icSeries,
    dates,
  };
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

export function icDecay(icSeries: readonly number[], maxLag: number = 12): readonly number[] {
  const out: number[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    if (lag >= icSeries.length) {
      out.push(0);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let i = lag; i < icSeries.length; i++) {
      sum += icSeries[i - lag] * icSeries[i];
      count++;
    }
    out.push(count === 0 ? 0 : sum / count);
  }
  return out;
}
