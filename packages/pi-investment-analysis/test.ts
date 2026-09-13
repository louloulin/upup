import { describe, expect, test } from 'bun:test';
import { calculateDcf, calculateTechnicalSignal } from './src/index.js';

describe('pi-investment-analysis', () => {
  test('calculates DCF with explicit assumptions', () => {
    const result = calculateDcf({ currentFcf: 100, growthRate: 0.08, discountRate: 0.1, terminalGrowthRate: 0.03, projectionYears: 5, sharesOutstanding: 10 });
    expect(result.fairValuePerShare).toBeGreaterThan(0);
    expect(result.projectedCashFlows).toHaveLength(5);
    expect(result.assumptions.discountRate).toBe(0.1);
  });

  test('classifies moving-average distance deterministically', () => {
    expect(calculateTechnicalSignal([{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 10 }, { date: '2026-09-03', close: 11 }]).trend).toBe('bullish');
  });

  test('rejects an unsafe terminal growth assumption', () => {
    expect(() => calculateDcf({ currentFcf: 100, growthRate: 0.08, discountRate: 0.03, terminalGrowthRate: 0.04, projectionYears: 5, sharesOutstanding: 10 })).toThrow('discountRate');
  });
});
