import { describe, expect, test } from 'bun:test';
import {
  calculateValueAtRisk,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaxDrawdown,
  calculateKellyCriterion,
  calculateRiskParity,
  calculateMeanVariance,
  calculatePearsonCorrelation,
  calculateReliabilityScore,
  compareDataSources,
  buildCorrelationMatrix,
  getNativeShortInterest,
  calculateNativeShortInterestRatio,
  detectNativeShortSqueeze,
} from './src/index';

describe('pi-risk', () => {
  test('calculates deterministic short-interest and squeeze snapshots', () => {
    const data = getNativeShortInterest('aapl');
    expect(data).toMatchObject({ symbol: 'AAPL', totalFloat: expect.any(Number), shortInterestRatio: expect.any(Number), squeezeRisk: expect.any(String) });
    expect(calculateNativeShortInterestRatio({ symbol: 'AAPL', quantity: 10, avgCost: 150 }).positionAnalysis).toMatchObject({ sharesHeld: 10, avgCost: 150, positionValue: 1500 });
    expect(detectNativeShortSqueeze({ symbols: ['AAPL', 'TSLA', 'GME'], minShortInterestRatio: 1, minShortPercentFloat: 1 }).screeningCriteria.symbolsScreened).toBe(3);
    expect(() => getNativeShortInterest('')).toThrow('symbol');
  });
  test('historical VaR reports the requested percentile loss', () => {
    const returns = [0.01, 0.02, -0.05, 0.03, -0.02, 0.04, -0.08, 0.015, -0.01, 0.025];
    const result = calculateValueAtRisk({ returns, confidence: 0.9, method: 'historical' });
    expect(result.method).toBe('historical');
    expect(result.confidence).toBeCloseTo(0.9);
    expect(result.observations).toBe(10);
    expect(result.valueAtRisk).toBeLessThan(0);
  });

  test('parametric VaR uses the normal distribution approximation', () => {
    const returns = Array.from({ length: 50 }, (_, index) => 0.001 + (index % 5) * 0.002 - 0.005);
    const historical = calculateValueAtRisk({ returns, confidence: 0.95, method: 'historical' });
    const parametric = calculateValueAtRisk({ returns, confidence: 0.95, method: 'parametric' });
    expect(parametric.method).toBe('parametric');
    expect(Number.isFinite(parametric.valueAtRisk)).toBe(true);
    expect(Math.abs(parametric.valueAtRisk - historical.valueAtRisk)).toBeLessThan(0.05);
  });

  test('Sharpe ratio classifies deterministic fixtures', () => {
    const steady = Array.from({ length: 60 }, () => 0.0008);
    const result = calculateSharpeRatio({ returns: steady, riskFreeRate: 0.02, periodsPerYear: 252 });
    expect(result.rating).toBe('zero-volatility');
    expect(result.sharpe).toBe(0);

    const mixedUp = Array.from({ length: 60 }, (_, index) => (index % 6) * 0.001 - 0.002);
    const rated = calculateSharpeRatio({ returns: mixedUp, riskFreeRate: 0.0 });
    expect(['negative', 'low', 'good', 'excellent']).toContain(rated.rating);
    expect(rated.rating).not.toBe('zero-volatility');

    const strong = Array.from({ length: 60 }, (_, index) => (index % 5) * 0.004 - 0.004);
    const strongRated = calculateSharpeRatio({ returns: strong, riskFreeRate: 0.0 });
    expect(strongRated.rating).not.toBe('zero-volatility');

    const declining = [0.04, 0.02, 0.0, -0.02, -0.04, -0.06, -0.08, -0.10];
    const negative = calculateSharpeRatio({ returns: declining, riskFreeRate: 0.02 });
    expect(negative.rating).toBe('negative');
    expect(negative.sharpe).toBeLessThan(0);
  });

  test('Sortino ratio uses downside deviation and rewards zero downside with infinity', () => {
    const onlyUpside = [0.01, 0.02, 0.015, 0.005];
    const positive = calculateSortinoRatio({ returns: onlyUpside });
    expect(positive.rating).toBe('positive-no-downside');
    expect(positive.sortino).toBe(Number.POSITIVE_INFINITY);

    const flat = [0.01, 0.01, 0.01, 0.01];
    const flatRating = calculateSortinoRatio({ returns: flat });
    expect(flatRating.rating).toBe('positive-no-downside');

    const allZero = [0, 0, 0, 0];
    const zero = calculateSortinoRatio({ returns: allZero });
    expect(zero.rating).toBe('zero-or-negative');
    expect(zero.sortino).toBe(0);

    const mixed = [0.01, -0.05, 0.02, -0.02, 0.015];
    const result = calculateSortinoRatio({ returns: mixed, targetReturn: 0 });
    expect(result.downsideDeviation).toBeGreaterThan(0);
    expect(Number.isFinite(result.sortino)).toBe(true);
  });

  test('Maximum drawdown finds the worst peak-to-trough decline', () => {
    const prices = [100, 110, 120, 90, 95, 80, 85, 130, 125];
    const result = calculateMaxDrawdown({ prices });
    expect(result.peakIndex).toBe(2);
    expect(result.troughIndex).toBe(5);
    expect(result.maxDrawdownPercent).toBeCloseTo(33.3333, 3);
    expect(result.maxDrawdown).toBeCloseTo(40, 3);
    expect(result.observations).toBe(9);
  });

  test('rejects empty inputs', () => {
    expect(() => calculateValueAtRisk({ returns: [] })).toThrow('returns');
    expect(() => calculateSharpeRatio({ returns: [] })).toThrow('returns');
    expect(() => calculateSortinoRatio({ returns: [] })).toThrow('returns');
    expect(() => calculateMaxDrawdown({ prices: [] })).toThrow('prices');
  });

  test('rejects invalid confidence for VaR', () => {
    const returns = [0.01, -0.02, 0.03];
    expect(() => calculateValueAtRisk({ returns, confidence: 0.4 })).toThrow('confidence');
    expect(() => calculateValueAtRisk({ returns, confidence: 1.5 })).toThrow('confidence');
  });
  test('calculates Kelly sizing with optional capital amounts', () => {
    expect(calculateKellyCriterion({ winRate: 0.6, avgWin: 0.15, avgLoss: 0.1, capital: 100000 })).toMatchObject({ kellyFraction: 33.33, optimalSize: 33.33, safeFraction: 16.67, positionSizing: { halfKelly: 16666.67 } });
  });
  test('calculates inverse-volatility risk parity weights', () => {
    const result = calculateRiskParity([{ symbol: 'A', volatility: 0.2, expectedReturn: 0.1 }, { symbol: 'B', volatility: 0.1, expectedReturn: 0.08 }]);
    expect(result.totalWeight).toBe(100);
    expect(result.assets[1].weight).toBeGreaterThan(result.assets[0].weight);
  });
  test('calculates deterministic mean-variance allocation', () => {
    const result = calculateMeanVariance({ assets: [{ symbol: 'A', volatility: 0.2, expectedReturn: 0.1 }, { symbol: 'B', volatility: 0.1, expectedReturn: 0.08 }], riskFreeRate: 0.02 });
    expect(result.tangencyWeights).toHaveLength(2);
    expect(result.expectedVolatility).toBeGreaterThan(0);
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
  });
  test('scores and ranks data sources deterministically', () => {
    const score = calculateReliabilityScore({ source: 'A', latency: 50, freshness: 0.5, coverage: 95, accuracy: 99, priceDeviation: 0.1 });
    expect(score.grade).toBe('A');
    const comparison = compareDataSources({ sources: [{ source: 'A', latency: 50, freshness: 0.5, coverage: 95, accuracy: 99, priceDeviation: 0.1 }, { source: 'B', latency: 10000, freshness: 100, coverage: 30, accuracy: 50, priceDeviation: 5 }], preferAccurate: true });
    expect(comparison.bestOverall).toBe('A');
    expect(comparison.rankedSources).toHaveLength(2);
  });
  test('calculates pair and matrix correlations', () => {
    expect(calculatePearsonCorrelation([1, 2, 3], [1, 2, 3]).strength).toBe('very-strong');
    const matrix = buildCorrelationMatrix({ A: [1, 2, 3], B: [3, 2, 1] }, ['A', 'B']);
    expect(matrix.matrix[0][1]).toBe(-1);
    expect(matrix.eigenvalues).toHaveLength(2);
  });
});
