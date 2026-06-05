import type { BrinsonResult, Holding, Portfolio, Benchmark } from './types.js';

export function brinsonAttribution(input: { portfolio: Portfolio; benchmark: Benchmark }): BrinsonResult {
  const { portfolio, benchmark } = input;
  const sectors = uniqueSectors(portfolio.holdings, benchmark.holdings);

  const pBy = indexBy(portfolio.holdings, (h) => h.sector);
  const bBy = indexBy(benchmark.holdings, (h) => h.sector);

  let allocation = 0;
  let selection = 0;
  let interaction = 0;
  const bySector: BrinsonResult['bySector'] = [];

  for (const sector of sectors) {
    const wp = pBy.get(sector)?.weight ?? 0;
    const wb = bBy.get(sector)?.weight ?? 0;
    const rp = pBy.get(sector)?.return ?? 0;
    const rb = bBy.get(sector)?.return ?? 0;
    const a = (wp - wb) * rb;
    const s = wb * (rp - rb);
    const i = (wp - wb) * (rp - rb);
    allocation += a;
    selection += s;
    interaction += i;
    bySector.push({ sector, allocation: a, selection: s, interaction: i });
  }

  // Recompute active return from the weighted holdings so the Brinson
  // additive identity (allocation + selection + interaction = active) holds
  // exactly, even when portfolio.totalReturn is inconsistent with the sum
  // of (weight * return) (e.g. cash drag, missing sleeves, partial data).
  const activeReturn =
    portfolio.holdings.reduce((s, h) => s + h.weight * h.return, 0) -
    benchmark.holdings.reduce((s, h) => s + h.weight * h.return, 0);
  return { allocation, selection, interaction, activeReturn, bySector };
}

function uniqueSectors(a: Holding[], b: Holding[]): string[] {
  const set = new Set<string>();
  for (const h of a) set.add(h.sector);
  for (const h of b) set.add(h.sector);
  return [...set].sort();
}

function indexBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T> {
  const m = new Map<K, T>();
  for (const x of arr) m.set(key(x), x);
  return m;
}
