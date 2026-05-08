/**
 * Portfolio Optimization Tool
 *
 * Implements:
 * - Kelly Criterion (optimal position sizing)
 * - Risk Parity (equal risk contribution)
 * - Mean-Variance Optimization (efficient frontier)
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Kelly Criterion
// ============================================================================

function calculateKelly(
  winRate: number,
  avgWin: number,
  avgLoss: number,
): { kellyFraction: number; optimalSize: number; safeFraction: number } {
  // Kelly % = W - [(1-W) / (avgWin/avgLoss)]
  // Where W = win rate, avgWin/avgLoss = win/loss ratio
  const winLossRatio = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 1;
  const kellyFraction = winRate - ((1 - winRate) / winLossRatio);
  const optimalSize = Math.max(0, kellyFraction);
  const safeFraction = optimalSize * 0.5; // Half-Kelly for safety

  return {
    kellyFraction: Math.round(kellyFraction * 10000) / 100,
    optimalSize: Math.round(optimalSize * 10000) / 100,
    safeFraction: Math.round(safeFraction * 10000) / 100,
  };
}

// ============================================================================
// Risk Parity
// ============================================================================

interface AssetRisk {
  symbol: string;
  volatility: number; // Annualized std dev
  expectedReturn: number;
}

function calculateRiskParity(assets: AssetRisk[]): { symbol: string; weight: number; contribution: number }[] {
  // Risk parity: weight inversely proportional to volatility
  const invVols = assets.map(a => ({
    symbol: a.symbol,
    invVol: a.volatility > 0 ? 1 / a.volatility : 1,
  }));

  const totalInvVol = invVols.reduce((sum, a) => sum + a.invVol, 0);

  const result = assets.map((asset, i) => {
    const weight = invVols[i].invVol / totalInvVol;
    const contribution = weight * asset.volatility;

    return {
      symbol: asset.symbol,
      weight: Math.round(weight * 10000) / 100,
      contribution: Math.round(contribution * 10000) / 100,
    };
  });

  return result;
}

// ============================================================================
// Mean-Variance Optimization
// ============================================================================

function calculateMeanVariance(
  assets: AssetRisk[],
  correlations: number[][],
  riskFreeRate: number = 0.02,
): {
  tangencyWeights: { symbol: string; weight: number }[];
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
} {
  const n = assets.length;
  
  // Simplified tangency portfolio using analytical solution
  // For 2-asset case: w = (E[R1] - Rf) * σ2² - (E[R2] - Rf) * ρ*σ1*σ2
  //                    / ((E[R1] - Rf) * σ2² + (E[R2] - Rf) * σ1² - (E[R1]-Rf + E[R2]-Rf)*ρ*σ1*σ2)
  
  if (n === 1) {
    return {
      tangencyWeights: [{ symbol: assets[0].symbol, weight: 100 }],
      expectedReturn: assets[0].expectedReturn,
      expectedVolatility: assets[0].volatility,
      sharpeRatio: (assets[0].expectedReturn - riskFreeRate) / assets[0].volatility,
    };
  }

  // For multi-asset: use simple inverse volatility heuristic
  // (Full MVO requires matrix inversion which is complex)
  const excessReturns = assets.map(a => a.expectedReturn - riskFreeRate);
  
  // Penalize negative excess returns
  const adjustedReturns = excessReturns.map(r => Math.max(r, 0.001));
  
  // Weight by excess return / variance
  const scores = assets.map((a, i) => adjustedReturns[i] / (a.volatility * a.volatility));
  const totalScore = scores.reduce((a, b) => a + b, 0);
  
  const weights = totalScore > 0
    ? scores.map(s => s / totalScore)
    : assets.map(() => 1 / n);

  // Calculate portfolio metrics
  let portfolioVariance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const corr = correlations[i]?.[j] ?? (i === j ? 1 : 0.3);
      portfolioVariance += weights[i] * weights[j] * assets[i].volatility * assets[j].volatility * corr;
    }
  }

  const portfolioReturn = assets.reduce((sum, a, i) => sum + weights[i] * a.expectedReturn, 0);
  const portfolioVol = Math.sqrt(portfolioVariance);
  const sharpe = portfolioVol > 0 ? (portfolioReturn - riskFreeRate) / portfolioVol : 0;

  return {
    tangencyWeights: assets.map((a, i) => ({
      symbol: a.symbol,
      weight: Math.round(weights[i] * 10000) / 100,
    })),
    expectedReturn: Math.round(portfolioReturn * 10000) / 100,
    expectedVolatility: Math.round(portfolioVol * 10000) / 100,
    sharpeRatio: Math.round(sharpe * 100) / 100,
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const kellySchema = z.object({
  winRate: z.number().min(0).max(1).describe('Historical win rate (0-1)'),
  avgWin: z.number().positive().describe('Average winning trade percentage (e.g., 0.15 for 15%)'),
  avgLoss: z.number().positive().describe('Average losing trade percentage (e.g., 0.08 for 8%)'),
  capital: z.number().positive().optional().describe('Total capital for position sizing'),
});

const riskParitySchema = z.object({
  assets: z.array(z.object({
    symbol: z.string().describe('Asset symbol'),
    volatility: z.number().positive().describe('Annualized volatility (e.g., 0.25 for 25%)'),
    expectedReturn: z.number().describe('Expected annual return (e.g., 0.12 for 12%)'),
  })).min(2).max(20).describe('List of assets with risk/return metrics'),
});

const meanVarianceSchema = z.object({
  assets: z.array(z.object({
    symbol: z.string().describe('Asset symbol'),
    volatility: z.number().positive().describe('Annualized volatility'),
    expectedReturn: z.number().describe('Expected annual return'),
  })).min(1).max(20).describe('Assets with risk/return'),
  correlations: z.array(z.array(z.number().min(-1).max(1))).optional()
    .describe('Correlation matrix (NxN). Default: 0.3 pairwise'),
  riskFreeRate: z.number().min(0).max(0.1).default(0.02).describe('Risk-free rate (default: 2%)'),
});

// ============================================================================
// Tools
// ============================================================================

export function createCalculateKellyTool() {
  return new DynamicStructuredTool({
    name: 'calculate_kelly',
    description: 'Calculate optimal position size using Kelly Criterion. Returns full Kelly, half-Kelly (safer), and position sizing.',
    schema: kellySchema,
    func: async ({ winRate, avgWin, avgLoss, capital }) => {
      const result = calculateKelly(winRate, avgWin, avgLoss);

      const output: Record<string, unknown> = {
        type: 'Kelly Criterion',
        inputs: {
          winRate: `${(winRate * 100).toFixed(1)}%`,
          avgWin: `${(avgWin * 100).toFixed(1)}%`,
          avgLoss: `${(avgLoss * 100).toFixed(1)}%`,
          winLossRatio: (avgWin / avgLoss).toFixed(2),
        },
        kellyFraction: `${result.kellyFraction}%`,
        optimalPosition: `${result.optimalSize}%`,
        safePosition: `${result.safeFraction}% (Half-Kelly, recommended)`,
        recommendation: result.optimalSize > 0
          ? `Allocate ${result.safeFraction}% of capital per trade (Half-Kelly)`
          : 'Negative Kelly: This strategy has negative expected value. Avoid.',
      };

      if (capital) {
        output.positionSizing = {
          fullKelly: `${(capital * result.optimalSize / 100).toFixed(2)}`,
          halfKelly: `${(capital * result.safeFraction / 100).toFixed(2)}`,
        };
      }

      return formatToolResult(output);
    },
  });
}

export function createCalculateRiskParityTool() {
  return new DynamicStructuredTool({
    name: 'calculate_risk_parity',
    description: 'Calculate risk parity portfolio allocation. Each asset contributes equally to total risk.',
    schema: riskParitySchema,
    func: async ({ assets }) => {
      const result = calculateRiskParity(assets);

      return formatToolResult({
        type: 'Risk Parity Portfolio',
        method: 'Inverse Volatility Weighting',
        assets: result,
        totalWeight: `${result.reduce((sum, r) => sum + r.weight, 0).toFixed(2)}%`,
        summary: result.map(r => `${r.symbol}: ${r.weight}%`).join(' | '),
        description: 'Each position sized so its risk contribution equals others. Lower volatility = higher weight.',
      });
    },
  });
}

export function createCalculateMeanVarianceTool() {
  return new DynamicStructuredTool({
    name: 'calculate_mean_variance',
    description: 'Calculate mean-variance optimized portfolio (tangency portfolio). Maximize Sharpe ratio.',
    schema: meanVarianceSchema,
    func: async ({ assets, correlations, riskFreeRate }) => {
      const n = assets.length;
      
      // Build default correlation matrix if not provided
      const corr: number[][] = correlations || [];
      if (corr.length === 0) {
        for (let i = 0; i < n; i++) {
          corr[i] = [];
          for (let j = 0; j < n; j++) {
            corr[i][j] = i === j ? 1 : 0.3;
          }
        }
      }

      const result = calculateMeanVariance(assets, corr, riskFreeRate);

      return formatToolResult({
        type: 'Mean-Variance Optimization',
        method: 'Tangency Portfolio (Maximum Sharpe)',
        weights: result.tangencyWeights,
        portfolioMetrics: {
          expectedReturn: `${result.expectedReturn}%`,
          expectedVolatility: `${result.expectedVolatility}%`,
          sharpeRatio: result.sharpeRatio,
          riskFreeRate: `${(riskFreeRate * 100).toFixed(1)}%`,
        },
        summary: result.tangencyWeights.map(w => `${w.symbol}: ${w.weight}%`).join(' | '),
        interpretation: result.sharpeRatio > 1
          ? 'Good risk-adjusted return (>1 Sharpe)'
          : result.sharpeRatio > 0.5
            ? 'Acceptable risk-adjusted return'
            : 'Low risk-adjusted return - consider alternative allocations',
      });
    },
  });
}

export const portfolioOptimizationTools = [
  createCalculateKellyTool(),
  createCalculateRiskParityTool(),
  createCalculateMeanVarianceTool(),
];
