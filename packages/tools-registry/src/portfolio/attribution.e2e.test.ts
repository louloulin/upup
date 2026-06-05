import { describe, expect, test } from 'bun:test';
import { attribution } from './attribution.js';
import type { Portfolio, Benchmark } from './types.js';

// Mock: 20-holding-equivalent portfolio + CSI 300-like benchmark across 5
// shenwan-l1 sectors. Sums are 1.0 and totalReturn equals the weighted sum.
const PORTFOLIO: Portfolio = {
  totalReturn: 0.10,
  holdings: [
    { sector: '食品饮料', weight: 0.30, return: 0.18 },
    { sector: '银行', weight: 0.20, return: 0.06 },
    { sector: '医药生物', weight: 0.20, return: 0.12 },
    { sector: '科技', weight: 0.20, return: 0.08 },
    { sector: '能源', weight: 0.10, return: 0.03 },
  ],
};
const BENCHMARK: Benchmark = {
  totalReturn: 0.07,
  holdings: [
    { sector: '食品饮料', weight: 0.15, return: 0.16 },
    { sector: '银行', weight: 0.25, return: 0.05 },
    { sector: '医药生物', weight: 0.20, return: 0.10 },
    { sector: '科技', weight: 0.25, return: 0.07 },
    { sector: '能源', weight: 0.15, return: 0.02 },
  ],
};
const STYLE = {
  portfolioExposures: { Size: 0.2, Value: 0.3, Momentum: -0.1, Volatility: 0.1 },
  benchmarkExposures: { Size: 0.0, Value: 0.0, Momentum: 0.0, Volatility: 0.0 },
  factorReturns: { Size: 0.01, Value: 0.04, Momentum: 0.03, Volatility: -0.02 },
};

describe('attribution e2e', () => {
  test('brinson additive identity holds on 5-sector mock', () => {
    const r = attribution({ method: 'brinson', portfolio: PORTFOLIO, benchmark: BENCHMARK });
    if (r.method !== 'brinson') throw new Error('expected brinson');
    const sum = r.result.allocation + r.result.selection + r.result.interaction;
    expect(Math.abs(sum - r.result.activeReturn)).toBeLessThan(1e-9);
  });

  test('sector contributions sum to active return', () => {
    const r = attribution({
      method: 'sector',
      portfolio: PORTFOLIO,
      benchmark: BENCHMARK,
      sectorClassification: 'shenwan-l1',
    });
    if (r.method !== 'sector') throw new Error('expected sector');
    const sum = r.result.sectors.reduce((acc, s) => acc + s.contribution, 0);
    expect(Math.abs(sum - r.result.activeReturn)).toBeLessThan(1e-9);
  });

  test('style contributions + residual sum to active return', () => {
    const r = attribution({ method: 'style', portfolio: PORTFOLIO, benchmark: BENCHMARK, style: STYLE });
    if (r.method !== 'style') throw new Error('expected style');
    const sum = r.result.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(Math.abs(sum + r.result.residual - r.result.activeReturn)).toBeLessThan(1e-9);
  });

  test('combined returns all three decompositions', () => {
    const r = attribution({ method: 'combined', portfolio: PORTFOLIO, benchmark: BENCHMARK, style: STYLE });
    if (r.method !== 'combined') throw new Error('expected combined');
    expect(r.result.brinson).toBeDefined();
    expect(r.result.style).toBeDefined();
    expect(r.result.sector).toBeDefined();
  });

  test('classification field round-trips through combined', () => {
    const r = attribution({
      method: 'combined',
      portfolio: PORTFOLIO,
      benchmark: BENCHMARK,
      style: STYLE,
      sectorClassification: 'gics-l2',
    });
    if (r.method !== 'combined') throw new Error('expected combined');
    expect(r.result.sector.classification).toBe('gics-l2');
  });
});
