/**
 * Quantitative Analysis Tools - Risk Metrics
 *
 * Implements key risk metrics for portfolio analysis:
 * - VaR (Value at Risk)
 * - Sharpe Ratio
 * - Sortino Ratio
 * - Maximum Drawdown
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

/**
 * Calculate Value at Risk (VaR)
 */
export function calculateVaR(
  returns: number[],
  confidence: number = 0.95,
  method: 'historical' | 'parametric' = 'historical'
): number {
  if (returns.length === 0) {
    throw new Error('No returns data provided');
  }

  if (method === 'historical') {
    // Historical VaR: percentile-based
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return sorted[Math.max(0, index)];
  } else {
    // Parametric VaR: assume normal distribution
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    );
    const zScore = normInv(1 - confidence);
    return mean - zScore * std;
  }
}

/**
 * Calculate Sharpe Ratio
 */
export function calculateSharpe(
  returns: number[],
  riskFreeRate: number = 0.03,
  periodsPerYear: number = 252
): number {
  if (returns.length === 0) {
    throw new Error('No returns data provided');
  }

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const excessReturn = meanReturn - riskFreeRate / periodsPerYear;

  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdReturn = Math.sqrt(variance);

  if (stdReturn === 0) {
    return 0;
  }

  return (excessReturn / stdReturn) * Math.sqrt(periodsPerYear);
}

/**
 * Calculate Sortino Ratio
 */
export function calculateSortino(
  returns: number[],
  targetReturn: number = 0,
  periodsPerYear: number = 252
): number {
  if (returns.length === 0) {
    throw new Error('No returns data provided');
  }

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const excessReturn = meanReturn - targetReturn;

  // Downside deviation (only negative returns)
  const downsideReturns = returns.filter(r => r < targetReturn);
  if (downsideReturns.length === 0) {
    return excessReturn > 0 ? Infinity : 0;
  }

  const downsideVariance = downsideReturns.reduce(
    (sum, r) => sum + Math.pow(r - targetReturn, 2), 0
  ) / returns.length;

  const downsideDeviation = Math.sqrt(downsideVariance);

  if (downsideDeviation === 0) {
    return 0;
  }

  return (excessReturn / downsideDeviation) * Math.sqrt(periodsPerYear);
}

/**
 * Calculate Maximum Drawdown
 */
export function calculateMaxDrawdown(prices: number[]): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  peakIndex: number;
  troughIndex: number;
} {
  if (prices.length === 0) {
    throw new Error('No price data provided');
  }

  let peak = prices[0];
  let peakIndex = 0;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let troughIndex = 0;

  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i];
      peakIndex = i;
    }

    const drawdown = peak - prices[i];
    const drawdownPercent = (drawdown / peak) * 100;

    if (drawdownPercent > maxDrawdownPercent) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
      troughIndex = i;
    }
  }

  return { maxDrawdown, maxDrawdownPercent, peakIndex, troughIndex };
}

/**
 * Inverse normal distribution (approximation)
 */
function normInv(p: number): number {
  // Abramowitz and Stegun approximation
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q /
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
            ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }
}

// Tool schemas
const calculateVarSchema = z.object({
  returns: z.array(z.number()).describe('Array of historical returns (e.g., [0.01, -0.02, 0.03])'),
  confidence: z.number().min(0.5).max(0.99).default(0.95).describe('Confidence level (e.g., 0.95 for 95%)'),
  method: z.enum(['historical', 'parametric']).default('historical').describe('Calculation method'),
});

const calculateSharpeSchema = z.object({
  returns: z.array(z.number()).describe('Array of historical returns'),
  riskFreeRate: z.number().default(0.03).describe('Annual risk-free rate (e.g., 0.03 for 3%)'),
  periodsPerYear: z.number().default(252).describe('Number of periods per year (252 for daily)'),
});

const calculateSortinoSchema = z.object({
  returns: z.array(z.number()).describe('Array of historical returns'),
  targetReturn: z.number().default(0).describe('Target return threshold'),
  periodsPerYear: z.number().default(252).describe('Number of periods per year'),
});

const calculateMaxDrawdownSchema = z.object({
  prices: z.array(z.number()).describe('Array of historical prices'),
});

/**
 * Create VaR calculation tool
 */
export function createCalculateVaRTool() {
  return new PiTool({
    name: 'calculate_var',
    description: 'Calculate Value at Risk (VaR) for a portfolio. Measures potential loss at a given confidence level.',
    schema: calculateVarSchema,
    func: async ({ returns, confidence, method }) => {
      const varValue = calculateVaR(returns, confidence, method);
      const varPercent = (varValue * 100).toFixed(2);

      return formatToolResult({
        type: 'VaR Calculation',
        method,
        confidence: `${(confidence * 100).toFixed(0)}%`,
        varValue: varValue.toFixed(6),
        varPercent: `${varPercent}%`,
        interpretation: `With ${(confidence * 100).toFixed(0)}% confidence, the portfolio will not lose more than ${varPercent}% on a single period`,
        dataPoints: returns.length,
      });
    },
  });
}

/**
 * Create Sharpe Ratio tool
 */
export function createCalculateSharpeTool() {
  return new PiTool({
    name: 'calculate_sharpe',
    description: 'Calculate Sharpe Ratio - risk-adjusted return metric. Higher is better (>1 is good, >2 is excellent).',
    schema: calculateSharpeSchema,
    func: async ({ returns, riskFreeRate, periodsPerYear }) => {
      const sharpe = calculateSharpe(returns, riskFreeRate, periodsPerYear);

      let rating: string;
      if (sharpe < 0) {
        rating = 'Negative - returns below risk-free rate';
      } else if (sharpe < 1) {
        rating = 'Low - insufficient compensation for risk';
      } else if (sharpe < 2) {
        rating = 'Good - acceptable risk-adjusted returns';
      } else {
        rating = 'Excellent - superior risk-adjusted returns';
      }

      return formatToolResult({
        type: 'Sharpe Ratio',
        sharpe: sharpe.toFixed(3),
        riskFreeRate: `${(riskFreeRate * 100).toFixed(1)}%`,
        periodsPerYear,
        rating,
        dataPoints: returns.length,
      });
    },
  });
}

/**
 * Create Sortino Ratio tool
 */
export function createCalculateSortinoTool() {
  return new PiTool({
    name: 'calculate_sortino',
    description: 'Calculate Sortino Ratio - focuses only on downside risk. Better for asymmetric return distributions.',
    schema: calculateSortinoSchema,
    func: async ({ returns, targetReturn, periodsPerYear }) => {
      const sortino = calculateSortino(returns, targetReturn, periodsPerYear);

      return formatToolResult({
        type: 'Sortino Ratio',
        sortino: isFinite(sortino) ? sortino.toFixed(3) : 'Infinity',
        targetReturn: `${(targetReturn * 100).toFixed(2)}%`,
        periodsPerYear,
        dataPoints: returns.length,
      });
    },
  });
}

/**
 * Create Max Drawdown tool
 */
export function createCalculateMaxDrawdownTool() {
  return new PiTool({
    name: 'calculate_max_drawdown',
    description: 'Calculate Maximum Drawdown - largest peak-to-trough decline. Measures worst-case historical loss.',
    schema: calculateMaxDrawdownSchema,
    func: async ({ prices }) => {
      const result = calculateMaxDrawdown(prices);

      return formatToolResult({
        type: 'Maximum Drawdown',
        maxDrawdown: result.maxDrawdown.toFixed(4),
        maxDrawdownPercent: `${result.maxDrawdownPercent.toFixed(2)}%`,
        peakPrice: prices[result.peakIndex].toFixed(2),
        troughPrice: prices[result.troughIndex].toFixed(2),
        peakIndex: result.peakIndex,
        troughIndex: result.troughIndex,
        dataPoints: prices.length,
      });
    },
  });
}

export const quantTools = [
  createCalculateVaRTool(),
  createCalculateSharpeTool(),
  createCalculateSortinoTool(),
  createCalculateMaxDrawdownTool(),
];
