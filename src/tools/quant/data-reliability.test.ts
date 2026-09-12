/**
 * Data Reliability Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  calculateReliabilityScore,
  calculatePearsonCorrelation,
  createScoreDataSourceTool,
  createCompareDataSourcesTool,
  createCorrelationMatrixTool,
  createCalculateCorrelationTool,
} from './data-reliability.js';

describe('calculateReliabilityScore', () => {
  it('returns A grade for excellent reliability', () => {
    const result = calculateReliabilityScore({
      source: 'test',
      latency: 50,
      freshness: 0.5,
      coverage: 95,
      accuracy: 99,
      priceDeviation: 0.1,
    });
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThan(80);
  });

  it('returns B grade for good reliability', () => {
    const result = calculateReliabilityScore({
      source: 'test',
      latency: 500,
      freshness: 2,
      coverage: 80,
      accuracy: 90,
      priceDeviation: 0.5,
    });
    expect(['A', 'B', 'C']).toContain(result.grade);
  });

  it('returns lower grade for poor metrics', () => {
    const result = calculateReliabilityScore({
      source: 'test',
      latency: 10000,
      freshness: 100,
      coverage: 30,
      accuracy: 50,
      priceDeviation: 5,
    });
    expect(['D', 'F']).toContain(result.grade);
    expect(result.score).toBeLessThan(60);
  });

  it('includes factors in result', () => {
    const result = calculateReliabilityScore({
      source: 'test',
      latency: 100,
      freshness: 1,
      coverage: 90,
      accuracy: 95,
      priceDeviation: 0.2,
    });
    expect(result.factors).toBeDefined();
    expect(result.factors.latency).toBeDefined();
    expect(result.factors.freshness).toBeDefined();
    expect(result.factors.coverage).toBeDefined();
    expect(result.factors.accuracy).toBeDefined();
    expect(result.factors.priceDeviation).toBeDefined();
  });

  it('includes recommendation in result', () => {
    const result = calculateReliabilityScore({
      source: 'test',
      latency: 100,
      freshness: 1,
      coverage: 90,
      accuracy: 95,
      priceDeviation: 0.2,
    });
    expect(result.recommendation).toBeDefined();
    expect(typeof result.recommendation).toBe('string');
  });
});

describe('calculatePearsonCorrelation', () => {
  it('returns 1 for perfectly correlated assets', () => {
    const returns1 = [0.01, 0.02, 0.03, 0.04, 0.05];
    const returns2 = [0.01, 0.02, 0.03, 0.04, 0.05];
    const result = calculatePearsonCorrelation(returns1, returns2);
    expect(result.correlation).toBeCloseTo(1, 2);
    expect(result.strength).toBe('very-strong');
  });

  it('returns -1 for perfectly negatively correlated', () => {
    const returns1 = [0.01, 0.02, 0.03, 0.04, 0.05];
    const returns2 = [-0.01, -0.02, -0.03, -0.04, -0.05];
    const result = calculatePearsonCorrelation(returns1, returns2);
    expect(result.correlation).toBeCloseTo(-1, 2);
    expect(result.strength).toBe('very-strong');
  });

  it('handles insufficient data', () => {
    const result = calculatePearsonCorrelation([0.01], [0.02]);
    expect(result.error).toBeDefined();
  });

  it('handles constant series', () => {
    const result = calculatePearsonCorrelation([0.01, 0.01, 0.01], [0.02, 0.02, 0.02]);
    expect(result.error).toBeDefined();
  });

  it('returns correlation with strength for valid data', () => {
    const returns1 = [0.01, 0.015, 0.02, 0.025, 0.03];
    const returns2 = [0.012, 0.017, 0.022, 0.027, 0.032];
    const result = calculatePearsonCorrelation(returns1, returns2);
    expect(result.correlation).toBeGreaterThan(0.9);
    expect(['very-strong', 'strong', 'moderate', 'weak']).toContain(result.strength);
  });
});

describe('Tool Creation', () => {
  const scoreTool = createScoreDataSourceTool();
  const compareTool = createCompareDataSourcesTool();
  const matrixTool = createCorrelationMatrixTool();
  const correlationTool = createCalculateCorrelationTool();

  it('createScoreDataSourceTool has correct name', () => {
    expect(scoreTool.name).toBe('score_data_source');
  });

  it('createCompareDataSourcesTool has correct name', () => {
    expect(compareTool.name).toBe('compare_data_sources');
  });

  it('createCorrelationMatrixTool has correct name', () => {
    expect(matrixTool.name).toBe('calculate_correlation_matrix');
  });

  it('createCalculateCorrelationTool has correct name', () => {
    expect(correlationTool.name).toBe('calculate_correlation');
  });

  it('score_data_source tool accepts required parameters', async () => {
    const result = await scoreTool.invoke({
      source: 'yahoo_finance',
      latency: 100,
      freshness: 0.95,
      coverage: 90,
      accuracy: 98,
      priceDeviation: 0.1,
    });
    expect(result).toBeDefined();
    expect(result).toContain('yahoo_finance');
  });

  it('calculate_correlation tool accepts required parameters', async () => {
    const result = await correlationTool.invoke({
      asset1Returns: [0.01, 0.02, 0.03, 0.04, 0.05],
      asset2Returns: [0.015, 0.025, 0.028, 0.038, 0.048],
      asset1Symbol: 'AAPL',
      asset2Symbol: 'MSFT',
    });
    expect(result).toBeDefined();
    expect(result).toContain('AAPL');
    expect(result).toContain('MSFT');
  });

  it('calculate_correlation_matrix tool accepts required parameters', async () => {
    const result = await matrixTool.invoke({
      returns: {
        AAPL: [0.01, 0.02, 0.03, 0.04, 0.05],
        MSFT: [0.015, 0.025, 0.028, 0.038, 0.048],
        GOOGL: [0.008, 0.018, 0.025, 0.035, 0.045],
      },
      symbols: ['AAPL', 'MSFT', 'GOOGL'],
    });
    expect(result).toBeDefined();
    expect(result).toContain('AAPL');
  });

  it('compare_data_sources tool accepts required parameters', async () => {
    const result = await compareTool.invoke({
      sources: [
        { source: 'yahoo', latency: 100, freshness: 1, coverage: 90, accuracy: 95, priceDeviation: 0.2 },
        { source: 'bloomberg', latency: 200, freshness: 0.5, coverage: 95, accuracy: 98, priceDeviation: 0.1 },
      ],
      preferLowLatency: true,
      preferAccurate: true,
    });
    expect(result).toBeDefined();
    expect(result).toContain('yahoo');
    expect(result).toContain('bloomberg');
  });
});
