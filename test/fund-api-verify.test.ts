import { describe, test, expect } from 'bun:test';
import { searchFunds, getFundBasic, getFundPerformance } from '@upup/pi-finance-sdk';

describe('基金API真实验证', () => {
  test('基金搜索 - 易方达消费', async () => {
    const results = await searchFunds('易方达消费');
    expect(results.length).toBeGreaterThan(0);
    console.log('搜索结果:', results.slice(0, 3));
  });

  test('基金详情 - 110022', async () => {
    const fund = await getFundBasic('110022');
    expect(fund).not.toBeNull();
    expect(fund?.code).toBe('110022');
    console.log('基金详情:', {
      code: fund?.code,
      name: fund?.name,
      type: fund?.type,
      manager: fund?.manager
    });
  });

  test('基金业绩 - 110022', async () => {
    const perf = await getFundPerformance('110022');
    expect(perf).not.toBeNull();
    console.log('业绩数据:', {
      code: perf?.code,
      name: perf?.name,
      performance: perf?.performance
    });
  });
});
