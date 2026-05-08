/**
 * Quantitative Analysis Tools - Options Pricing
 *
 * Implements Black-Scholes option pricing and Greeks calculation:
 * - Black-Scholes call/put price
 * - Delta, Gamma, Theta, Vega, Rho
 * - Implied volatility solver
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Mathematics
// ============================================================================

/**
 * Standard normal cumulative distribution function
 */
function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const y = 1.0 - (((((a5 * t5) + (a4 * t4)) + (a3 * t3)) + (a2 * t2)) + (a1 * t)) * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal probability density function
 */
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Inverse standard normal CDF ( Abramowitz and Stegun approximation)
 */
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// ============================================================================
// Black-Scholes Core
// ============================================================================

export interface BlackScholesResult {
  callPrice: number;
  putPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/**
 * Black-Scholes option pricing formula
 */
export function blackScholes(
  S: number,    // Spot price
  K: number,    // Strike price
  T: number,    // Time to expiration (years)
  r: number,    // Risk-free rate (annual)
  sigma: number, // Volatility (annual)
  type: 'call' | 'put' = 'call'
): { price: number; delta: number; gamma: number; theta: number; vega: number; rho: number } {
  if (T <= 0) {
    // At expiration
    if (type === 'call') {
      return { price: Math.max(0, S - K), delta: S > K ? 1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    } else {
      return { price: Math.max(0, K - S), delta: S < K ? -1 : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
  }

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);
  const nd1 = normPDF(d1);

  // Option prices
  const callPrice = S * Nd1 - K * Math.exp(-r * T) * normCDF(d2);
  const putPrice = K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);

  // Greeks
  const delta = type === 'call' ? Nd1 : Nd1 - 1;
  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const theta = (-S * nd1 * sigma / (2 * Math.sqrt(T))
    - r * K * Math.exp(-r * T) * (type === 'call' ? normCDF(d2) : normCDF(-d2))) / 365;
  const vega = S * nd1 * Math.sqrt(T) / 100; // Per 1% change
  const rho = K * T * Math.exp(-r * T) * (type === 'call' ? normCDF(d2) : -normCDF(-d2)) / 100;

  return {
    price: type === 'call' ? callPrice : putPrice,
    delta,
    gamma,
    theta,
    vega,
    rho,
  };
}

/**
 * Calculate implied volatility using Newton-Raphson
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  type: 'call' | 'put' = 'call',
  tolerance: number = 0.001,
  maxIterations: number = 200
): number {
  // Use bisection for better stability
  let low = 0.001;
  let high = 10.0;

  // Initial guess based on moneyness
  const moneyness = Math.log(S / K) / Math.sqrt(T);
  let sigma = Math.abs(moneyness) + 0.3; // ATM vol approximation
  sigma = Math.max(0.05, Math.min(2, sigma));

  // Try Newton-Raphson first with better initial guess
  for (let i = 0; i < maxIterations; i++) {
    const { price, vega } = blackScholes(S, K, T, r, sigma, type);

    const diff = marketPrice - price;

    if (Math.abs(diff) < tolerance) {
      return sigma;
    }

    // Bisection fallback if vega is too small
    if (Math.abs(vega) < 1e-8) {
      // Use bisection
      for (let j = 0; j < 100; j++) {
        const mid = (low + high) / 2;
        const midPrice = blackScholes(S, K, T, r, mid, type).price;
        if (Math.abs(midPrice - marketPrice) < tolerance) {
          return mid;
        }
        if (midPrice > marketPrice) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return (low + high) / 2;
    }

    sigma = sigma + diff / vega;

    // Keep sigma in reasonable bounds
    if (sigma <= 0.001) sigma = 0.001;
    if (sigma >= 5) sigma = 5;
  }

  return sigma; // Return best guess
}

// ============================================================================
// Zod Schemas
// ============================================================================

const calculateOptionPriceSchema = z.object({
  spotPrice: z.number().positive().describe('Current stock price'),
  strikePrice: z.number().positive().describe('Option strike price'),
  timeToExpiry: z.number().positive().describe('Time to expiration in days'),
  riskFreeRate: z.number().default(0.05).describe('Annual risk-free interest rate (e.g., 0.05 for 5%)'),
  volatility: z.number().positive().describe('Annual implied volatility (e.g., 0.25 for 25%)'),
  optionType: z.enum(['call', 'put']).default('call').describe('Option type'),
});

const calculateGreeksSchema = z.object({
  spotPrice: z.number().positive().describe('Current stock price'),
  strikePrice: z.number().positive().describe('Option strike price'),
  timeToExpiry: z.number().positive().describe('Time to expiration in days'),
  riskFreeRate: z.number().default(0.05).describe('Annual risk-free interest rate'),
  volatility: z.number().positive().describe('Annual implied volatility'),
  optionType: z.enum(['call', 'put']).default('call').describe('Option type'),
});

const calculateImpliedVolSchema = z.object({
  marketPrice: z.number().positive().describe('Current option market price'),
  spotPrice: z.number().positive().describe('Current stock price'),
  strikePrice: z.number().positive().describe('Option strike price'),
  timeToExpiry: z.number().positive().describe('Time to expiration in days'),
  riskFreeRate: z.number().default(0.05).describe('Annual risk-free interest rate'),
  optionType: z.enum(['call', 'put']).default('call').describe('Option type'),
});

// ============================================================================
// Tools
// ============================================================================

/**
 * Create Black-Scholes option pricing tool
 */
export function createCalculateOptionPriceTool() {
  return new DynamicStructuredTool({
    name: 'calculate_option_price',
    description: 'Calculate Black-Scholes option price for calls and puts. Uses standard Black-Scholes formula with continuous dividends.',
    schema: calculateOptionPriceSchema,
    func: async ({ spotPrice, strikePrice, timeToExpiry, riskFreeRate, volatility, optionType }) => {
      const T = timeToExpiry / 365; // Convert days to years
      const result = blackScholes(spotPrice, strikePrice, T, riskFreeRate, volatility, optionType);

      const moneyness = spotPrice / strikePrice;
      let position: string;
      if (optionType === 'call') {
        position = moneyness > 1.05 ? 'In-the-money' : moneyness < 0.95 ? 'Out-of-the-money' : 'At-the-money';
      } else {
        position = moneyness < 0.95 ? 'In-the-money' : moneyness > 1.05 ? 'Out-of-the-money' : 'At-the-money';
      }

      return formatToolResult({
        type: 'Black-Scholes Option Price',
        optionType,
        spotPrice: spotPrice.toFixed(2),
        strikePrice: strikePrice.toFixed(2),
        timeToExpiry: `${timeToExpiry} days`,
        riskFreeRate: `${(riskFreeRate * 100).toFixed(2)}%`,
        volatility: `${(volatility * 100).toFixed(2)}%`,
        price: result.price.toFixed(4),
        delta: result.delta.toFixed(4),
        gamma: result.gamma.toFixed(6),
        theta: result.theta.toFixed(4),
        vega: result.vega.toFixed(4),
        rho: result.rho.toFixed(4),
        moneyness: moneyness.toFixed(4),
        position,
      });
    },
  });
}

/**
 * Create Greeks calculation tool
 */
export function createCalculateGreeksTool() {
  return new DynamicStructuredTool({
    name: 'calculate_option_greeks',
    description: 'Calculate option Greeks (Delta, Gamma, Theta, Vega, Rho). Measure sensitivity to various factors.',
    schema: calculateGreeksSchema,
    func: async ({ spotPrice, strikePrice, timeToExpiry, riskFreeRate, volatility, optionType }) => {
      const T = timeToExpiry / 365;
      const result = blackScholes(spotPrice, strikePrice, T, riskFreeRate, volatility, optionType);

      return formatToolResult({
        type: 'Option Greeks',
        optionType,
        spotPrice: spotPrice.toFixed(2),
        strikePrice: strikePrice.toFixed(2),
        timeToExpiry: `${timeToExpiry} days`,
        riskFreeRate: `${(riskFreeRate * 100).toFixed(2)}%`,
        volatility: `${(volatility * 100).toFixed(2)}%`,
        greeks: {
          delta: {
            value: result.delta.toFixed(4),
            interpretation: optionType === 'call'
              ? `$${result.delta.toFixed(2)} per $1 move in underlying`
              : `-$${Math.abs(result.delta).toFixed(2)} per $1 move in underlying`,
          },
          gamma: {
            value: result.gamma.toFixed(6),
            interpretation: `${result.gamma.toFixed(4)} delta change per $1 move in underlying`,
          },
          theta: {
            value: result.theta.toFixed(4),
            interpretation: `$${Math.abs(result.theta).toFixed(2)} time decay per day`,
          },
          vega: {
            value: result.vega.toFixed(4),
            interpretation: `$${result.vega.toFixed(2)} per 1% change in IV`,
          },
          rho: {
            value: result.rho.toFixed(4),
            interpretation: `$${result.rho.toFixed(2)} per 1% change in rate`,
          },
        },
      });
    },
  });
}

/**
 * Create implied volatility tool
 */
export function createCalculateImpliedVolTool() {
  return new DynamicStructuredTool({
    name: 'calculate_implied_volatility',
    description: 'Calculate implied volatility from market option price using Newton-Raphson method. Essential for options analysis.',
    schema: calculateImpliedVolSchema,
    func: async ({ marketPrice, spotPrice, strikePrice, timeToExpiry, riskFreeRate, optionType }) => {
      const T = timeToExpiry / 365;
      const iv = impliedVolatility(marketPrice, spotPrice, strikePrice, T, riskFreeRate, optionType);

      // Also calculate theoretical price at this IV
      const theoretical = blackScholes(spotPrice, strikePrice, T, riskFreeRate, iv, optionType);

      return formatToolResult({
        type: 'Implied Volatility',
        optionType,
        marketPrice: marketPrice.toFixed(4),
        spotPrice: spotPrice.toFixed(2),
        strikePrice: strikePrice.toFixed(2),
        timeToExpiry: `${timeToExpiry} days`,
        riskFreeRate: `${(riskFreeRate * 100).toFixed(2)}%`,
        impliedVolatility: `${(iv * 100).toFixed(2)}%`,
        theoreticalPrice: theoretical.price.toFixed(4),
        priceDifference: (marketPrice - theoretical.price).toFixed(4),
        interpretation: iv > 0.5 ? 'High IV - expensive option' : iv > 0.3 ? 'Normal IV' : 'Low IV - cheap option',
      });
    },
  });
}

export const optionsTools = [
  createCalculateOptionPriceTool(),
  createCalculateGreeksTool(),
  createCalculateImpliedVolTool(),
];
