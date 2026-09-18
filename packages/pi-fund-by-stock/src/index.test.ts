import { test, expect, describe } from 'bun:test';
import { searchFundsByStockCore } from './index';

describe('searchFundsByStockCore', () => {
  test('正常查询：贵州茅台', async () => {
    const result = await searchFundsByStockCore({ query: '贵州茅台', limit: 10 });
    expect(result.query).toBe('贵州茅台');
    expect(result.funds).toBeDefined();
    expect(Array.isArray(result.funds)).toBe(true);
  }, { timeout: 30_000 });

  test('A 股代码查询', async () => {
    const result = await searchFundsByStockCore({ query: '600519.SH', limit: 5 });
    expect(result.funds).toBeDefined();
  }, { timeout: 30_000 });

  test('空查询应安全降级', async () => {
    const result = await searchFundsByStockCore({ query: '' });
    expect(result.found).toBe(false);
    expect(result.totalFunds).toBe(0);
  });

  test('limit 边界', async () => {
    const result = await searchFundsByStockCore({ query: '腾讯', limit: 3 });
    expect(result.funds.length).toBeLessThanOrEqual(3);
  }, { timeout: 30_000 });
});