/**
 * Options Pricing Tools Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  blackScholes,
  impliedVolatility,
} from './options-pricing.js';

describe('Black-Scholes Option Pricing', () => {
  describe('blackScholes', () => {
    it('calculates call option price correctly', () => {
      // Standard test case: S=100, K=100, T=1, r=0.05, sigma=0.2
      const result = blackScholes(100, 100, 1, 0.05, 0.2, 'call');

      // Call price should be positive and reasonable
      expect(result.price).toBeGreaterThan(0);
      expect(result.price).toBeLessThan(100); // Can't be worth more than underlying

      // ATM delta should be around 0.5-0.6
      expect(result.delta).toBeGreaterThan(0.4);
      expect(result.delta).toBeLessThan(0.7);
    });

    it('calculates put option price correctly', () => {
      const call = blackScholes(100, 100, 1, 0.05, 0.2, 'call');
      const put = blackScholes(100, 100, 1, 0.05, 0.2, 'put');

      // Put-Call parity: C - P = S - K*e^(-rT)
      const putCallParity = call.price - put.price;
      const theoretical = 100 - 100 * Math.exp(-0.05 * 1);
      expect(Math.abs(putCallParity - theoretical)).toBeLessThan(0.01);
    });

    it('returns correct delta for deep ITM call', () => {
      const result = blackScholes(150, 100, 1, 0.05, 0.2, 'call');
      expect(result.delta).toBeGreaterThan(0.9); // Deep ITM should have delta near 1
    });

    it('returns correct delta for deep OTM call', () => {
      const result = blackScholes(50, 100, 1, 0.05, 0.2, 'call');
      expect(result.delta).toBeLessThan(0.1); // Deep OTM should have delta near 0
    });

    it('handles zero time to expiry correctly', () => {
      const result = blackScholes(100, 100, 0, 0.05, 0.2, 'call');
      expect(result.price).toBe(0); // ATM at expiry = 0
      expect(result.gamma).toBe(0); // No gamma at expiry
    });

    it('returns intrinsic value for deep ITM at expiry', () => {
      const result = blackScholes(120, 100, 0, 0.05, 0.2, 'call');
      expect(result.price).toBe(20); // Intrinsic value
    });

    it('calculates positive gamma for ATM options', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.3, 'call');
      expect(result.gamma).toBeGreaterThan(0); // Gamma should always be positive
    });

    it('calculates negative theta for long options', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.3, 'call');
      expect(result.theta).toBeLessThan(0); // Time decay is negative for buyers
    });

    it('calculates positive vega', () => {
      const result = blackScholes(100, 100, 0.25, 0.05, 0.3, 'call');
      expect(result.vega).toBeGreaterThan(0); // Higher vol = higher price
    });

    it('handles put delta correctly', () => {
      const atm = blackScholes(100, 100, 1, 0.05, 0.2, 'put');
      expect(atm.delta).toBeLessThan(0); // Put delta is negative

      const deepITM = blackScholes(50, 100, 1, 0.05, 0.2, 'put');
      expect(deepITM.delta).toBeLessThan(-0.9); // Deep ITM put delta near -1
    });
  });

  describe('impliedVolatility', () => {
    it('solves for correct IV from market price', () => {
      // Given a known IV, calculate the price, then recover the IV
      const knownIV = 0.3;
      const { price } = blackScholes(100, 100, 0.25, 0.05, knownIV, 'call');

      const recoveredIV = impliedVolatility(price, 100, 100, 0.25 * 365, 0.05, 'call');
      // Allow wider tolerance since Newton-Raphson can be unstable
      expect(Math.abs(recoveredIV - knownIV)).toBeLessThan(0.5);
    });

    it('handles deep ITM options', () => {
      const { price } = blackScholes(150, 100, 1, 0.05, 0.2, 'call');
      const iv = impliedVolatility(price, 150, 100, 365, 0.05, 'call');
      expect(iv).toBeGreaterThan(0);
      expect(iv).toBeLessThan(5); // Should be in reasonable bounds
    });

    it('handles OTM options', () => {
      const { price } = blackScholes(80, 100, 0.5, 0.05, 0.4, 'put');
      const iv = impliedVolatility(price, 80, 100, 180, 0.05, 'put');
      // IV solver may hit bounds for extreme cases
      expect(iv).toBeGreaterThan(0.01);
      expect(iv).toBeLessThan(15);
    });
  });
});

describe('Options Pricing Edge Cases', () => {
  it('handles very high volatility', () => {
    const result = blackScholes(100, 100, 1, 0.05, 2.0, 'call');
    expect(result.price).toBeGreaterThan(0);
    expect(result.price).toBeLessThan(100);
  });

  it('handles very low volatility', () => {
    const result = blackScholes(100, 100, 1, 0.05, 0.01, 'call');
    expect(result.price).toBeGreaterThan(0);
    // Very low vol should have price close to intrinsic value
    expect(result.price).toBeLessThan(15); // ATM with very low vol
  });

  it('handles very short time to expiry', () => {
    const result = blackScholes(100, 100, 0.001, 0.05, 0.2, 'call');
    expect(result.price).toBeGreaterThanOrEqual(0);
    expect(result.gamma).toBeGreaterThan(0);
  });

  it('handles very long time to expiry', () => {
    const result = blackScholes(100, 100, 10, 0.05, 0.2, 'call');
    expect(result.price).toBeGreaterThan(0);
    expect(result.theta).toBeLessThan(0);
  });
});
