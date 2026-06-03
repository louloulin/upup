import { describe, expect, test } from 'bun:test';
import { sectorAttribution } from './sector-attribution.js';
import type { Portfolio, Benchmark } from './types.js';

describe('sectorAttribution', () => {
  test('contributions sum to active return', () => {
    const portfolio: Portfolio = {
      totalReturn: 0.12,
      holdings: [
        { sector: '食品饮料', weight: 0.30, return: 0.20 },
        { sector: '银行', weight: 0.30, return: 0.10 },
        { sector: '医药生物', weight: 0.20, return: 0.05 },
        { sector: '科技', weight: 0.20, return: 0.10 },
      ],
    };
    const benchmark: Benchmark = {
      totalReturn: 0.08,
      holdings: [
        { sector: '食品饮料', weight: 0.20, return: 0.18 },
        { sector: '银行', weight: 0.30, return: 0.07 },
        { sector: '医药生物', weight: 0.30, return: 0.06 },
        { sector: '科技', weight: 0.20, return: 0.05 },
      ],
    };
    const r = sectorAttribution({ portfolio, benchmark, classification: 'shenwan-l1' });
    const sum = r.sectors.reduce((acc, s) => acc + s.contribution, 0);
    expect(Math.abs(sum - r.activeReturn)).toBeLessThan(1e-9);
  });

  test('classification toggle returns classification field', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [{ sector: 'A', weight: 1, return: 0.1 }] };
    const b: Benchmark = { totalReturn: 0.05, holdings: [{ sector: 'A', weight: 1, return: 0.05 }] };
    expect(sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' }).classification).toBe('shenwan-l1');
    expect(sectorAttribution({ portfolio: p, benchmark: b, classification: 'gics-l2' }).classification).toBe('gics-l2');
  });

  test('weightDiff equals portfolio.weight - benchmark.weight', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [{ sector: 'X', weight: 0.6, return: 0.1 }] };
    const b: Benchmark = { totalReturn: 0.05, holdings: [{ sector: 'X', weight: 0.3, return: 0.05 }] };
    const r = sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' });
    const x = r.sectors.find((s) => s.sector === 'X');
    expect(x?.weightDiff).toBeCloseTo(0.3, 9);
  });

  test('contribution equals w_p * r_p - w_b * r_b per sector', () => {
    const p: Portfolio = { totalReturn: 0.1, holdings: [{ sector: 'X', weight: 0.5, return: 0.2 }] };
    const b: Benchmark = { totalReturn: 0.05, holdings: [{ sector: 'X', weight: 0.5, return: 0.1 }] };
    const r = sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' });
    const x = r.sectors.find((s) => s.sector === 'X');
    expect(x?.contribution).toBeCloseTo(0.5 * 0.2 - 0.5 * 0.1, 9);
  });

  test('handles sectors present in only one of portfolio/benchmark', () => {
    const p: Portfolio = {
      totalReturn: 0.1,
      holdings: [
        { sector: 'A', weight: 0.5, return: 0.1 },
        { sector: 'B', weight: 0.5, return: 0.1 },
      ],
    };
    const b: Benchmark = {
      totalReturn: 0.05,
      holdings: [
        { sector: 'A', weight: 0.5, return: 0.05 },
        { sector: 'C', weight: 0.5, return: 0.05 },
      ],
    };
    const r = sectorAttribution({ portfolio: p, benchmark: b, classification: 'shenwan-l1' });
    expect(r.sectors.length).toBe(3);
    expect(r.sectors.find((s) => s.sector === 'B')).toBeDefined();
    expect(r.sectors.find((s) => s.sector === 'C')).toBeDefined();
  });
});
