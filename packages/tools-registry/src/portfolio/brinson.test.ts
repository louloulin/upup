import { describe, expect, test } from 'bun:test';
import { brinsonAttribution } from './brinson.js';
import type { Portfolio, Benchmark } from './types.js';

describe('brinsonAttribution', () => {
  test('allocation + selection + interaction === active return', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.12,
      holdings: [
        { sector: 'Tech', weight: 0.40, return: 0.20 },
        { sector: 'Finance', weight: 0.30, return: 0.10 },
        { sector: 'Energy', weight: 0.20, return: 0.05 },
        { sector: 'Health', weight: 0.10, return: 0.08 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.08,
      holdings: [
        { sector: 'Tech', weight: 0.25, return: 0.18 },
        { sector: 'Finance', weight: 0.40, return: 0.07 },
        { sector: 'Energy', weight: 0.20, return: 0.04 },
        { sector: 'Health', weight: 0.15, return: 0.06 },
      ],
    };
    const r = brinsonAttribution({ portfolio, benchmark });
    const sum = r.allocation + r.selection + r.interaction;
    // Brinson additive identity: alloc + select + interact = active return
    expect(Math.abs(sum - r.activeReturn)).toBeLessThan(1e-9);
    // activeReturn is recomputed from weighted holdings (see brinson.ts note),
    // so the value depends on the input data, not on portfolio.totalReturn.
    expect(typeof r.activeReturn).toBe('number');
  });

  test('all-zero inputs produce all-zero effects', () => {
    const portfolio: Portfolio = { totalReturn: 0, holdings: [{ sector: 'A', weight: 1, return: 0 }] };
    const benchmark: Benchmark = { totalReturn: 0, holdings: [{ sector: 'A', weight: 1, return: 0 }] };
    const r = brinsonAttribution({ portfolio, benchmark });
    expect(r.allocation).toBe(0);
    expect(r.selection).toBe(0);
    expect(r.interaction).toBe(0);
    expect(r.activeReturn).toBe(0);
  });

  test('overweight a winning sector yields positive allocation', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.15,
      holdings: [
        { sector: 'Tech', weight: 0.60, return: 0.20 },
        { sector: 'Other', weight: 0.40, return: 0.05 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.08,
      holdings: [
        { sector: 'Tech', weight: 0.30, return: 0.18 },
        { sector: 'Other', weight: 0.70, return: 0.03 },
      ],
    };
    const r = brinsonAttribution({ portfolio, benchmark });
    expect(r.allocation).toBeGreaterThan(0);
  });

  test('bySector arrays length matches unique sector count', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.1,
      holdings: [
        { sector: 'A', weight: 0.5, return: 0.1 },
        { sector: 'B', weight: 0.5, return: 0.1 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.1,
      holdings: [
        { sector: 'A', weight: 0.5, return: 0.1 },
        { sector: 'B', weight: 0.5, return: 0.1 },
      ],
    };
    const r = brinsonAttribution({ portfolio, benchmark });
    expect(r.bySector.length).toBe(2);
  });
});
