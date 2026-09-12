import { describe, expect, test } from 'bun:test';
import { calculateDDM, createDDMTool } from './ddm.js';

describe('Dividend Discount Model', () => {
  test('calculates explicit dividends and terminal value deterministically', () => {
    const result = calculateDDM({
      symbol: 'KO',
      current_dividend: 2,
      growth_rate: 0.05,
      required_return: 0.1,
      terminal_growth_rate: 0.03,
      projection_years: 5,
      current_price: 50,
    });
    expect(result.projected_dividends).toHaveLength(5);
    expect(result.projected_dividends[0]).toBe(2.1);
    expect(result.target_price).toBeGreaterThan(0);
    expect(result.upside_percent).toBeDefined();
  });

  test('rejects an invalid Gordon-growth denominator', () => {
    expect(() => calculateDDM({
      symbol: 'KO',
      current_dividend: 2,
      growth_rate: 0.05,
      required_return: 0.03,
      terminal_growth_rate: 0.03,
      projection_years: 5,
    })).toThrow('required_return must be greater than terminal_growth_rate');
  });

  test('is callable as a PiTool', async () => {
    const result = await createDDMTool().invoke({
      symbol: '0700.HK',
      current_dividend: 1,
      growth_rate: 0.02,
      required_return: 0.08,
      terminal_growth_rate: 0.03,
      projection_years: 3,
    });
    expect(result).toContain('0700.HK');
    expect(result).toContain('target_price');
  });
});
