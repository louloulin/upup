/**
 * FX Currency Tools Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  convertCurrency,
  getSupportedCurrencies,
} from './fx-tools.js';

// Use fallback rates (no network needed for tests)
const FALLBACK_RATES = {
  USD: 1,
  CNY: 7.24,
  HKD: 7.82,
  JPY: 149.5,
  EUR: 0.92,
  GBP: 0.79,
  KRW: 1320,
  SGD: 1.34,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.88,
};

describe('convertCurrency', () => {
  it('converts USD to CNY', () => {
    const result = convertCurrency(100, 'USD', 'CNY', FALLBACK_RATES);
    expect(result).toBeCloseTo(724, 0);
  });

  it('converts CNY to USD', () => {
    const result = convertCurrency(724, 'CNY', 'USD', FALLBACK_RATES);
    expect(result).toBeCloseTo(100, 1);
  });

  it('converts USD to HKD', () => {
    const result = convertCurrency(100, 'USD', 'HKD', FALLBACK_RATES);
    expect(result).toBeCloseTo(782, 0);
  });

  it('converts HKD to CNY', () => {
    const result = convertCurrency(100, 'HKD', 'CNY', FALLBACK_RATES);
    // HKD→USD: 100/7.82 = 12.79, then USD→CNY: 12.79 * 7.24 = 92.6
    expect(result).toBeCloseTo(92.6, 0);
  });

  it('converts same currency returns same amount', () => {
    const result = convertCurrency(500, 'EUR', 'EUR', FALLBACK_RATES);
    expect(result).toBe(500);
  });

  it('converts USD to JPY', () => {
    const result = convertCurrency(100, 'USD', 'JPY', FALLBACK_RATES);
    expect(result).toBeCloseTo(14950, 0);
  });

  it('converts USD to EUR', () => {
    const result = convertCurrency(100, 'USD', 'EUR', FALLBACK_RATES);
    expect(result).toBeCloseTo(92, 0);
  });

  it('converts EUR to GBP', () => {
    const result = convertCurrency(100, 'EUR', 'GBP', FALLBACK_RATES);
    // EUR→USD: 100/0.92 = 108.7, then USD→GBP: 108.7 * 0.79 = 85.9
    expect(result).toBeCloseTo(86, 0);
  });

  it('returns null for unknown currency', () => {
    const result = convertCurrency(100, 'USD', 'XYZ', FALLBACK_RATES);
    expect(result).toBeNull();
  });

  it('handles case insensitivity', () => {
    const result = convertCurrency(100, 'usd', 'cny', FALLBACK_RATES);
    expect(result).toBeCloseTo(724, 0);
  });

  it('converts KRW (large numbers)', () => {
    const result = convertCurrency(1, 'USD', 'KRW', FALLBACK_RATES);
    expect(result).toBeCloseTo(1320, 0);
  });
});

describe('getSupportedCurrencies', () => {
  it('returns list of currencies with metadata', () => {
    const currencies = getSupportedCurrencies();
    expect(currencies.length).toBeGreaterThan(0);
    const usd = currencies.find(c => c.code === 'USD');
    expect(usd).toBeDefined();
    expect(usd?.name).toBe('US Dollar');
  });

  it('includes CNY for A-share analysis', () => {
    const currencies = getSupportedCurrencies();
    expect(currencies.some(c => c.code === 'CNY')).toBe(true);
  });

  it('includes HKD for HK stocks', () => {
    const currencies = getSupportedCurrencies();
    expect(currencies.some(c => c.code === 'HKD')).toBe(true);
  });

  it('includes major currencies (EUR, GBP, JPY)', () => {
    const currencies = getSupportedCurrencies();
    const codes = currencies.map(c => c.code);
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
    expect(codes).toContain('JPY');
  });
});
