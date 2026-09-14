import type { FactorScore } from './types.js';
import { mean, stddev, rankDesc } from './normalize.js';

export interface FactorWeight {
  readonly factorId: string;
  readonly weight: number;
}

export function combineFactors(
  factorValues: ReadonlyMap<string, number>,
  weights: readonly FactorWeight[],
  direction: ReadonlyMap<string, 'long_high' | 'long_low'> = new Map(),
): { rawScore: number; factorContribs: Map<string, number> } {
  const contribs = new Map<string, number>();
  let score = 0;
  for (const w of weights) {
    const v = factorValues.get(w.factorId);
    if (v === undefined || !Number.isFinite(v)) continue;
    const dir = direction.get(w.factorId) ?? 'long_high';
    const signed = dir === 'long_high' ? v : -v;
    const contribution = w.weight * signed;
    contribs.set(w.factorId, contribution);
    score += contribution;
  }
  return { rawScore: score, factorContribs: contribs };
}

export function scoreUniverse(
  symbols: readonly string[],
  factorMatrix: ReadonlyMap<string, ReadonlyMap<string, number>>,
  weights: readonly FactorWeight[],
  date: string,
  direction?: ReadonlyMap<string, 'long_high' | 'long_low'>,
): readonly FactorScore[] {
  if (symbols.length === 0) return [];
  const perFactorStats = computeFactorStats(factorMatrix, symbols);

  const scores: FactorScore[] = [];
  const rawScores: number[] = [];
  for (const sym of symbols) {
    const symFactors = factorMatrix.get(sym);
    if (!symFactors) continue;
    const zFactors = new Map<string, number>();
    for (const [fid, val] of symFactors.entries()) {
      const stat = perFactorStats.get(fid);
      if (!stat || stat.std === 0) {
        zFactors.set(fid, 0);
      } else {
        zFactors.set(fid, (val - stat.mean) / stat.std);
      }
    }
    const dirMap = direction ?? inferDirectionMap(weights);
    const combined = combineFactors(zFactors, weights, dirMap);
    scores.push({
      symbol: sym,
      date,
      rawScore: combined.rawScore,
      zScore: 0,
      rank: 0,
      factorContribs: combined.factorContribs,
    });
    rawScores.push(combined.rawScore);
  }

  const ranks = rankDesc(rawScores);
  const z = zscoreArray(rawScores);
  return scores.map((s, i) => ({
    ...s,
    rank: ranks[i] ?? 0,
    zScore: z[i] ?? 0,
  }));
}

function zscoreArray(values: readonly number[]): readonly number[] {
  if (values.length === 0) return [];
  const m = mean(values);
  const s = stddev(values, m);
  if (s === 0) return values.map(() => 0);
  return values.map((v) => (v - m) / s);
}

interface Stat { mean: number; std: number; }

function computeFactorStats(
  factorMatrix: ReadonlyMap<string, ReadonlyMap<string, number>>,
  symbols: readonly string[],
): Map<string, Stat> {
  const stats = new Map<string, Stat>();
  const allFactorIds = new Set<string>();
  for (const sym of symbols) {
    const facs = factorMatrix.get(sym);
    if (!facs) continue;
    for (const fid of facs.keys()) allFactorIds.add(fid);
  }
  for (const fid of allFactorIds) {
    const values: number[] = [];
    for (const sym of symbols) {
      const v = factorMatrix.get(sym)?.get(fid);
      if (v !== undefined && Number.isFinite(v)) values.push(v);
    }
    stats.set(fid, { mean: mean(values), std: stddev(values) });
  }
  return stats;
}

function inferDirectionMap(weights: readonly FactorWeight[]): Map<string, 'long_high' | 'long_low'> {
  // default all weights are long_high unless weight is negative
  const out = new Map<string, 'long_high' | 'long_low'>();
  for (const w of weights) {
    out.set(w.factorId, w.weight < 0 ? 'long_low' : 'long_high');
  }
  return out;
}

export function equalWeightWeights(factorIds: readonly string[]): readonly FactorWeight[] {
  if (factorIds.length === 0) return [];
  const w = 1 / factorIds.length;
  return factorIds.map((id) => ({ factorId: id, weight: w }));
}
