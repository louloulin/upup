import type { StyleFactor, StyleResult } from './types.js';

const FACTOR_NAMES = ['Size', 'Value', 'Momentum', 'Volatility'] as const;
type FactorName = (typeof FACTOR_NAMES)[number];

export interface StyleAttributionInput {
  portfolioExposures: Record<FactorName, number>;
  benchmarkExposures: Record<FactorName, number>;
  factorReturns: Record<FactorName, number>;
  activeReturn: number;
}

export function styleAttribution(input: StyleAttributionInput): StyleResult {
  const factors: StyleFactor[] = FACTOR_NAMES.map((name) => {
    const p = input.portfolioExposures[name] ?? 0;
    const b = input.benchmarkExposures[name] ?? 0;
    const f = input.factorReturns[name] ?? 0;
    return {
      name,
      portfolioExposure: p,
      benchmarkExposure: b,
      factorReturn: f,
      contribution: (p - b) * f,
    };
  });
  const explained = factors.reduce((acc, x) => acc + x.contribution, 0);
  return {
    factors,
    activeReturn: input.activeReturn,
    residual: input.activeReturn - explained,
  };
}
