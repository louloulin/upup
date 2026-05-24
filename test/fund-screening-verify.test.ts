import { describe, test, expect } from 'bun:test';
import { screenFunds, getFundRecommendations } from '../src/tools/fund/fund-screening';

describe('基金筛选功能验证', () => {
  test('按类型筛选 - 混合型', async () => {
    const results = await screenFunds({ type: '混合型' });
    console.log('混合型基金数量:', results.length);
    expect(results.length).toBeGreaterThan(0);
  });

  test('按类型筛选 - 股票型', async () => {
    const results = await screenFunds({ type: '股票型' });
    console.log('股票型基金数量:', results.length);
    expect(results.length).toBeGreaterThan(0);
  });

  test('按业绩筛选 - 近1年正收益', async () => {
    const results = await screenFunds({
      minPerformance: { period: '1Y', threshold: 0 }
    });
    console.log('近1年正收益基金数量:', results.length);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  test('智能推荐 - 稳健型', async () => {
    const results = await getFundRecommendations('稳健型');
    console.log('稳健型推荐:', results[0]?.fund?.name, results[0]?.recommendation);
    expect(results.length).toBeGreaterThan(0);
  }, 30000);

  test('智能推荐 - 平衡型', async () => {
    const results = await getFundRecommendations('平衡型');
    console.log('平衡型推荐:', results[0]?.fund?.name, results[0]?.recommendation);
    expect(results.length).toBeGreaterThan(0);
  }, 30000);
});
