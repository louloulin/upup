/**
 * Data Reliability & Correlation Matrix Tools
 *
 * Implements:
 * - Data source reliability scoring
 * - Multi-asset correlation matrix
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Data Source Reliability Scoring
// ============================================================================

interface SourceMetrics {
  source: string;
  latency: number;        // ms
  freshness: number;     // hours since update
  coverage: number;       // 0-100
  accuracy: number;        // historical accuracy %
  priceDeviation: number; // % deviation from reference
}

export function calculateReliabilityScore(metrics: SourceMetrics): {
  score: number;
  grade: string;
  factors: Record<string, number>;
  recommendation: string;
} {
  const factors: Record<string, number> = {};
  
  // Latency score (faster = better)
  if (metrics.latency < 100) factors.latency = 100;
  else if (metrics.latency < 500) factors.latency = 80;
  else if (metrics.latency < 1000) factors.latency = 60;
  else if (metrics.latency < 5000) factors.latency = 40;
  else factors.latency = 20;
  
  // Freshness score (newer = better)
  if (metrics.freshness < 1) factors.freshness = 100;
  else if (metrics.freshness < 4) factors.freshness = 90;
  else if (metrics.freshness < 24) factors.freshness = 70;
  else if (metrics.freshness < 72) factors.freshness = 50;
  else factors.freshness = 20;
  
  // Coverage score
  factors.coverage = metrics.coverage;
  
  // Accuracy score
  factors.accuracy = metrics.accuracy;
  
  // Price deviation (lower = better)
  if (metrics.priceDeviation < 0.1) factors.priceDeviation = 100;
  else if (metrics.priceDeviation < 0.5) factors.priceDeviation = 90;
  else if (metrics.priceDeviation < 1) factors.priceDeviation = 70;
  else if (metrics.priceDeviation < 2) factors.priceDeviation = 50;
  else factors.priceDeviation = 20;
  
  // Weighted total
  const weights = { latency: 0.15, freshness: 0.20, coverage: 0.20, accuracy: 0.25, priceDeviation: 0.20 };
  const score = Object.entries(factors).reduce((sum, [k, v]) => sum + v * weights[k as keyof typeof weights], 0);
  const finalScore = Math.round(score);
  
  let grade = 'F';
  if (finalScore >= 90) grade = 'A';
  else if (finalScore >= 80) grade = 'B';
  else if (finalScore >= 70) grade = 'C';
  else if (finalScore >= 60) grade = 'D';
  
  let recommendation = 'Use for all analysis';
  if (finalScore < 60) recommendation = 'Use with caution - cross-reference with other sources';
  if (finalScore < 40) recommendation = 'Avoid for critical decisions - data may be stale or inaccurate';
  
  return { score: finalScore, grade, factors, recommendation };
}

// ============================================================================
// Correlation Matrix
// ============================================================================

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);
  
  const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
  const meanY = ySlice.reduce((a, b) => a + b, 0) / n;
  
  let covariance = 0;
  let varX = 0;
  let varY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    covariance += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  
  const stdX = Math.sqrt(varX);
  const stdY = Math.sqrt(varY);
  
  if (stdX === 0 || stdY === 0) return 0;
  return covariance / (stdX * stdY);
}

export function calculatePearsonCorrelation(x: number[], y: number[]): { correlation: number; strength: string; error?: string } {
  const correlation = calculateCorrelation(x, y);

  if (x.length < 3) {
    return { correlation, strength: 'unknown', error: 'Insufficient data points (minimum 3 required)' };
  }

  if (Math.abs(correlation) < 0.01) {
    return { correlation, strength: 'negligible', error: 'Series appears constant (zero variance)' };
  }

  let strength: string;
  const absCorr = Math.abs(correlation);
  if (absCorr > 0.7) strength = 'very-strong';
  else if (absCorr > 0.5) strength = 'strong';
  else if (absCorr > 0.3) strength = 'moderate';
  else strength = 'weak';

  return { correlation, strength };
}

function buildCorrelationMatrix(
  returns: Record<string, number[]>,
  symbols: string[]
): { matrix: number[][]; eigenvalues: number[]; interpretation: string } {
  const n = symbols.length;
  const matrix: number[][] = [];
  
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (matrix[j]?.[i] !== undefined) {
        matrix[i][j] = matrix[j][i];
      } else {
        const corr = calculateCorrelation(returns[symbols[i]] || [], returns[symbols[j]] || []);
        matrix[i][j] = Math.round(corr * 1000) / 1000;
      }
    }
  }
  
  // Simple eigenvalue approximation (largest)
  // For diversification, we want eigenvalues spread across assets
  const trace = matrix.reduce((sum, row, i) => sum + row[i], 0);
  const eigenvalues = [trace / n, ...Array(n - 1).fill(0)];
  
  let interpretation = 'Portfolio diversification: ';
  if (eigenvalues[0] > n * 0.5) {
    interpretation += 'HIGH correlation detected - limited diversification benefit';
  } else if (eigenvalues[0] > n * 0.3) {
    interpretation += 'MODERATE correlation - some diversification benefit';
  } else {
    interpretation += 'LOW correlation - strong diversification benefit';
  }
  
  return { matrix, eigenvalues, interpretation };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const scoreDataSourceSchema = z.object({
  source: z.string().describe('Data source name (e.g., Bloomberg, Yahoo Finance, Tushare)'),
  latency: z.number().min(0).describe('Response latency in milliseconds'),
  freshness: z.number().min(0).describe('Hours since last data update'),
  coverage: z.number().min(0).max(100).describe('Data coverage percentage (0-100)'),
  accuracy: z.number().min(0).max(100).describe('Historical accuracy percentage (0-100)'),
  priceDeviation: z.number().min(0).describe('Price deviation from reference in percent'),
});

const scoreMultipleSourcesSchema = z.object({
  sources: z.array(z.object({
    source: z.string().describe('Source name'),
    latency: z.number().min(0).describe('Latency in ms'),
    freshness: z.number().min(0).describe('Hours since update'),
    coverage: z.number().min(0).max(100).describe('Coverage 0-100'),
    accuracy: z.number().min(0).max(100).describe('Accuracy 0-100'),
    priceDeviation: z.number().min(0).describe('Price deviation %'),
  })).min(1).max(10).describe('Sources to score'),
  preferLowLatency: z.boolean().default(true).describe('Prefer low latency sources'),
  preferAccurate: z.boolean().default(true).describe('Prefer historically accurate sources'),
});

const correlationMatrixSchema = z.object({
  returns: z.record(z.string(), z.array(z.number())).describe('Asset returns by symbol'),
  symbols: z.array(z.string()).describe('Symbols to include in matrix'),
});

const correlationForPairSchema = z.object({
  asset1Returns: z.array(z.number()).describe('Historical returns for asset 1'),
  asset2Returns: z.array(z.number()).describe('Historical returns for asset 2'),
  asset1Symbol: z.string().describe('Symbol for asset 1'),
  asset2Symbol: z.string().describe('Symbol for asset 2'),
});

// ============================================================================
// Tools
// ============================================================================

export function createScoreDataSourceTool() {
  return new DynamicStructuredTool({
    name: 'score_data_source',
    description: 'Calculate reliability score for a market data source. Returns A-F grade with factor breakdown.',
    schema: scoreDataSourceSchema,
    func: async ({ source, latency, freshness, coverage, accuracy, priceDeviation }) => {
      const metrics: SourceMetrics = { source, latency, freshness, coverage, accuracy, priceDeviation };
      const result = calculateReliabilityScore(metrics);
      
      return formatToolResult({
        type: 'Data Source Reliability',
        source,
        grade: result.grade,
        score: result.score,
        factors: result.factors,
        recommendation: result.recommendation,
        interpretation: `Grade ${result.grade} (${result.score}/100) - ${result.recommendation}`,
      });
    },
  });
}

export function createCompareDataSourcesTool() {
  return new DynamicStructuredTool({
    name: 'compare_data_sources',
    description: 'Compare multiple data sources and recommend the best for different use cases.',
    schema: scoreMultipleSourcesSchema,
    func: async ({ sources, preferLowLatency, preferAccurate }) => {
      const scored = sources.map(s => {
        const metrics: SourceMetrics = {
          source: s.source, latency: s.latency, freshness: s.freshness,
          coverage: s.coverage, accuracy: s.accuracy, priceDeviation: s.priceDeviation
        };
        const result = calculateReliabilityScore(metrics);
        return { ...s, ...result };
      });
      
      scored.sort((a, b) => {
        if (preferAccurate) return b.factors.accuracy - a.factors.accuracy;
        if (preferLowLatency) return a.factors.latency - b.factors.latency;
        return b.score - a.score;
      });
      
      const best = scored[0];
      const worst = scored[scored.length - 1];
      
      return formatToolResult({
        type: 'Data Source Comparison',
        rankedSources: scored.map((s, i) => ({
          rank: i + 1,
          source: s.source,
          grade: s.grade,
          score: s.score,
        })),
        bestForAccuracy: scored.sort((a, b) => b.factors.accuracy - a.factors.accuracy)[0]?.source,
        bestForLatency: scored.sort((a, b) => a.factors.latency - b.factors.latency)[0]?.source,
        bestOverall: best.source,
        worstOverall: worst.source,
        recommendation: `Use ${best.source} for primary data. ${worst.source} should be cross-referenced.`,
      });
    },
  });
}

export function createCorrelationMatrixTool() {
  return new DynamicStructuredTool({
    name: 'calculate_correlation_matrix',
    description: 'Calculate correlation matrix for multiple assets from historical returns.',
    schema: correlationMatrixSchema,
    func: async ({ returns, symbols }) => {
      const result = buildCorrelationMatrix(returns, symbols);
      
      // Format matrix for display
      const formattedMatrix: Record<string, unknown>[] = [];
      for (let i = 0; i < symbols.length; i++) {
        const row: Record<string, unknown> = { symbol: symbols[i] };
        for (let j = 0; j < symbols.length; j++) {
          row[symbols[j]] = result.matrix[i][j].toFixed(3);
        }
        formattedMatrix.push(row);
      }
      
      return formatToolResult({
        type: 'Correlation Matrix',
        symbols,
        matrix: formattedMatrix,
        eigenvalues: result.eigenvalues.map(e => Math.round(e * 100) / 100),
        interpretation: result.interpretation,
        diversificationTip: result.eigenvalues[0] > symbols.length * 0.5
          ? 'Consider removing highly correlated assets for better diversification'
          : 'Good diversification - assets have varied correlations',
      });
    },
  });
}

export function createCalculateCorrelationTool() {
  return new DynamicStructuredTool({
    name: 'calculate_correlation',
    description: 'Calculate Pearson correlation between two asset return series.',
    schema: correlationForPairSchema,
    func: async ({ asset1Returns, asset2Returns, asset1Symbol, asset2Symbol }) => {
      const correlation = calculateCorrelation(asset1Returns, asset2Returns);
      
      let interpretation: string;
      let diversification: string;
      
      if (correlation > 0.7) {
        interpretation = 'STRONG POSITIVE - assets move together';
        diversification = 'POOR - limited risk reduction when combined';
      } else if (correlation > 0.3) {
        interpretation = 'MODERATE POSITIVE - some co-movement';
        diversification = 'PARTIAL - some risk reduction benefit';
      } else if (correlation > -0.3) {
        interpretation = 'LOW/NEGLIGIBLE - assets largely independent';
        diversification = 'GOOD - effective risk reduction';
      } else if (correlation > -0.7) {
        interpretation = 'MODERATE NEGATIVE - assets move opposite';
        diversification = 'EXCELLENT - strong hedge potential';
      } else {
        interpretation = 'STRONG NEGATIVE - strong inverse relationship';
        diversification = 'EXCEPTIONAL - near-perfect hedge';
      }
      
      return formatToolResult({
        type: 'Asset Correlation',
        pair: `${asset1Symbol}/${asset2Symbol}`,
        correlation: Math.round(correlation * 1000) / 1000,
        interpretation,
        diversificationBenefit: diversification,
        tradingSignal: correlation > 0.7
          ? 'Consider not holding both - redundant risk'
          : correlation < -0.3
            ? 'Consider pairing - natural hedge'
            : 'Neutral - can hold both independently',
      });
    },
  });
}

export const reliabilityTools = [
  createScoreDataSourceTool(),
  createCompareDataSourcesTool(),
  createCorrelationMatrixTool(),
  createCalculateCorrelationTool(),
];

export const SCORE_DATA_SOURCE_DESCRIPTION = `
Score a data source's reliability with A-F grade.

## Factors
- Latency: Response time (ms)
- Freshness: Hours since last update
- Coverage: Market coverage %
- Accuracy: Historical accuracy %

## Grade Scale
- A (85-100): Excellent reliability
- B (70-84): Good reliability
- C (55-69): Average reliability
- D (40-54): Below average
- F (0-39): Poor reliability

## When to Use
- Choosing between data providers
- Quality assessment
- Alert threshold configuration
`.trim();

export const COMPARE_DATA_SOURCES_DESCRIPTION = `
Compare multiple data sources side-by-side.

## Features
- Scores each source independently
- Ranks by overall score, latency, or accuracy
- Recommends best source for different use cases

## When to Use
- Data source selection
- Provider comparison
- Redundancy planning
`.trim();

export const CALCULATE_CORRELATION_MATRIX_DESCRIPTION = `
Calculate Pearson correlation matrix for multiple assets.

## Features
- Computes correlation between all asset pairs
- Shows correlation strength (-1 to +1)
- Includes eigenvalue analysis for diversification

## When to Use
- Portfolio diversification analysis
- Multi-asset strategy development
- Risk assessment
`.trim();

export const CALCULATE_CORRELATION_DESCRIPTION = `
Calculate Pearson correlation between two asset return series.

## Interpretation
- > 0.7: Strong positive (move together)
- 0.3-0.7: Moderate positive
- -0.3-0.3: Low/negligible
- -0.7 to -0.3: Moderate negative
- < -0.7: Strong negative (move opposite)

## When to Use
- Pair trading analysis
- Hedge ratio calculation
- Diversification assessment
`.trim();
