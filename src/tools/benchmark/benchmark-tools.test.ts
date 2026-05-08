/**
 * Benchmark Tools Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableBenchmarks,
  calculateAlpha,
  calculateTrackingError,
  calculateInformationRatio,
  compareToBenchmarks,
} from './benchmark-tools.js';

describe('getAvailableBenchmarks', () => {
  it('returns available benchmarks with names', () => {
    const benchmarks = getAvailableBenchmarks();
    expect(benchmarks.length).toBeGreaterThan(0);
    expect(benchmarks.some(b => b.symbol === '^GSPC')).toBe(true);
    expect(benchmarks.some(b => b.symbol === '000300')).toBe(true);
    expect(benchmarks.some(b => b.symbol === '^IXIC')).toBe(true);
  });
});

describe('calculateAlpha', () => {
  it('calculates positive alpha', () => {
    expect(calculateAlpha(15, 10)).toBe(5);
  });

  it('calculates negative alpha', () => {
    expect(calculateAlpha(5, 10)).toBe(-5);
  });

  it('calculates zero alpha', () => {
    expect(calculateAlpha(10, 10)).toBe(0);
  });
});

describe('calculateTrackingError', () => {
  it('returns zero for empty arrays', () => {
    expect(calculateTrackingError([], [])).toBe(0);
  });

  it('calculates tracking error for equal returns', () => {
    const portfolio = [0.10, 0.05, 0.08];
    const benchmark = [0.10, 0.05, 0.08];
    const te = calculateTrackingError(portfolio, benchmark);
    expect(te).toBe(0);
  });

  it('calculates non-zero tracking error for different returns', () => {
    const portfolio = [0.15, 0.08, 0.12];
    const benchmark = [0.10, 0.10, 0.10];
    const te = calculateTrackingError(portfolio, benchmark);
    expect(te).toBeGreaterThan(0);
  });

  it('returns zero for mismatched array lengths', () => {
    expect(calculateTrackingError([0.10], [0.10, 0.05])).toBe(0);
  });
});

describe('calculateInformationRatio', () => {
  it('returns zero when tracking error is zero', () => {
    expect(calculateInformationRatio(5, 0)).toBe(0);
  });

  it('calculates information ratio', () => {
    const ir = calculateInformationRatio(0.05, 0.10);
    expect(ir).toBe(0.5);
  });
});

describe('compareToBenchmarks', () => {
  it('compares portfolio vs SPX', () => {
    const result = compareToBenchmarks(15, ['^GSPC']);
    expect(result.portfolioPnlPercent).toBe(15);
    expect(result.benchmarks.length).toBe(1);
    expect(result.benchmarks[0].symbol).toBe('^GSPC');
    expect(result.benchmarks[0].alpha).toBeCloseTo(5, 1);
  });

  it('compares portfolio vs multiple benchmarks', () => {
    const result = compareToBenchmarks(12, ['^GSPC', '^IXIC', '000300']);
    expect(result.benchmarks.length).toBe(3);
    expect(result.winner).toContain('outperformed');
  });

  it('sorts benchmarks by alpha descending', () => {
    const result = compareToBenchmarks(5, ['^GSPC', '^IXIC', '000300']);
    // NDX should have highest return, so portfolio underperforms it most
    const alphas = result.benchmarks.map(b => b.alpha);
    // Should be sorted descending (highest alpha first)
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i - 1]).toBeGreaterThanOrEqual(alphas[i]);
    }
  });

  it('handles unknown benchmark symbol gracefully', () => {
    const result = compareToBenchmarks(10, ['^UNKNOWN', '^GSPC']);
    expect(result.benchmarks.length).toBe(1);
    expect(result.benchmarks[0].symbol).toBe('^GSPC');
  });

  it('returns correct winner message for underperformance', () => {
    const result = compareToBenchmarks(-5, ['^GSPC']);
    expect(result.winner).toContain('underperformed');
  });

  it('returns correct winner message for outperformance', () => {
    const result = compareToBenchmarks(20, ['^GSPC']);
    expect(result.winner).toContain('outperformed');
  });
});
