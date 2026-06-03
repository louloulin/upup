import type { Benchmark, Holding, Portfolio, SectorClassification, SectorContribution, SectorResult } from './types.js';

export interface SectorAttributionInput {
  portfolio: Portfolio;
  benchmark: Benchmark;
  classification: SectorClassification;
}

export function sectorAttribution(input: SectorAttributionInput): SectorResult {
  const { portfolio, benchmark, classification } = input;
  const sectors = uniqueSectors(portfolio.holdings, benchmark.holdings);
  const pBy = indexBy(portfolio.holdings, (h) => h.sector);
  const bBy = indexBy(benchmark.holdings, (h) => h.sector);

  const sectorsOut: SectorContribution[] = sectors.map((sector) => {
    const wp = pBy.get(sector)?.weight ?? 0;
    const wb = bBy.get(sector)?.weight ?? 0;
    const rp = pBy.get(sector)?.return ?? 0;
    const rb = bBy.get(sector)?.return ?? 0;
    return {
      sector,
      weightDiff: wp - wb,
      sectorReturn: rp,
      benchmarkReturn: rb,
      contribution: wp * rp - wb * rb,
    };
  });

  // See brinson.ts for the rationale on computing from weighted holdings.
  const activeReturn =
    portfolio.holdings.reduce((s, h) => s + h.weight * h.return, 0) -
    benchmark.holdings.reduce((s, h) => s + h.weight * h.return, 0);
  return { classification, sectors: sectorsOut, activeReturn };
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
