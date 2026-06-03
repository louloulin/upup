import { describe, expect, test } from 'bun:test';
import { styleAttribution } from './style-attribution.js';

describe('styleAttribution', () => {
  test('overweight Value + underweight Momentum returns signed contributions', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0.1, Value: 0.4, Momentum: -0.2, Volatility: 0.0 },
      benchmarkExposures: { Size: 0.0, Value: 0.0, Momentum: 0.0, Volatility: 0.0 },
      factorReturns: { Size: 0.02, Value: 0.05, Momentum: 0.03, Volatility: -0.01 },
      activeReturn: 0.018,
    });
    const value = r.factors.find((f) => f.name === 'Value');
    const momentum = r.factors.find((f) => f.name === 'Momentum');
    expect(value?.contribution).toBeCloseTo(0.4 * 0.05, 9);
    expect(momentum?.contribution).toBeCloseTo(-0.2 * 0.03, 9);
  });

  test('sum of contributions + residual equals active return', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0.5, Value: 0.2, Momentum: 0.1, Volatility: -0.3 },
      benchmarkExposures: { Size: 0.0, Value: 0.0, Momentum: 0.0, Volatility: 0.0 },
      factorReturns: { Size: 0.01, Value: 0.02, Momentum: 0.03, Volatility: 0.04 },
      activeReturn: 0.05,
    });
    const sum = r.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(Math.abs(sum + r.residual - r.activeReturn)).toBeLessThan(1e-9);
  });

  test('identical exposures yield all-zero contributions', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0.1, Value: 0.2, Momentum: 0.3, Volatility: 0.4 },
      benchmarkExposures: { Size: 0.1, Value: 0.2, Momentum: 0.3, Volatility: 0.4 },
      factorReturns: { Size: 0.01, Value: 0.02, Momentum: 0.03, Volatility: 0.04 },
      activeReturn: 0.0,
    });
    for (const f of r.factors) expect(f.contribution).toBe(0);
    expect(r.residual).toBe(0);
  });

  test('always emits exactly 4 factors in declared order', () => {
    const r = styleAttribution({
      portfolioExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
      benchmarkExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
      factorReturns: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
      activeReturn: 0,
    });
    expect(r.factors.map((f) => f.name)).toEqual(['Size', 'Value', 'Momentum', 'Volatility']);
  });
});
