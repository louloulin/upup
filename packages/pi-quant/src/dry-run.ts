import type { FactorBar } from './types';

export interface DryRunUniverse {
  readonly symbols: readonly string[];
  readonly bars: ReadonlyMap<string, readonly FactorBar[]>;
}

function makeBars(seed: number, days: number = 400): readonly FactorBar[] {
  const bars: FactorBar[] = [];
  let price = 10 + seed * 0.5;
  const start = new Date('2023-01-03T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    // skip weekends
    if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
    const trend = 1 + (seed - 5) * 0.0003;
    const noise = 1 + Math.sin(i * 0.13 + seed) * 0.015 + (Math.random() - 0.5) * 0.02;
    price = price * trend * noise;
    const high = price * (1 + Math.abs(Math.sin(i * 0.07 + seed)) * 0.01);
    const low = price * (1 - Math.abs(Math.cos(i * 0.05 + seed)) * 0.01);
    const open = price * 0.995;
    const vol = 100000 + Math.round(Math.abs(Math.sin(i * 0.1 + seed)) * 500000);
    bars.push({
      date: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close: price,
      volume: vol,
      fundamental: {
        pe: 8 + seed * 1.5 + Math.sin(i * 0.01 + seed) * 2,
        pb: 1 + seed * 0.2 + Math.sin(i * 0.005 + seed) * 0.4,
        ps: 2 + seed * 0.3 + Math.sin(i * 0.008 + seed) * 0.5,
        roe: 0.05 + seed * 0.012 + Math.sin(i * 0.004 + seed) * 0.02,
        earningsYield: 0.05 + (10 - seed) * 0.005 + Math.sin(i * 0.01 + seed) * 0.01,
        marketCap: 5e9 + seed * 1.2e9 + i * 1e7,
        revenueGrowth: 0.05 + seed * 0.01,
        earningsGrowth: 0.04 + (seed - 5) * 0.012,
        grossMargin: 0.3 + seed * 0.02,
        debtToEquity: 0.5 - seed * 0.05,
        currentRatio: 1.2 + seed * 0.1,
      },
    });
  }
  return bars;
}

const SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

const DEFAULT_UNIVERSE: DryRunUniverse = (() => {
  const bars = new Map<string, readonly FactorBar[]>();
  SYMBOLS.forEach((sym, i) => {
    bars.set(sym, makeBars(i + 1, 400));
  });
  return { symbols: SYMBOLS, bars };
})();

export function createDryRunUniverse(): DryRunUniverse {
  return DEFAULT_UNIVERSE;
}

export function dryRunEvidence(): { source: string; dataFreshness: 'offline' } {
  return { source: 'dry-run://pi-quant', dataFreshness: 'offline' };
}
