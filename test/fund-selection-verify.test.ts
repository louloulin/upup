import { describe, test, expect } from 'bun:test';
import { searchFunds, getFundHoldings, getFundBasic } from '../src/tools/fund/fund-api';

describe('基金选择方法验证', () => {
  test('按类型筛选 - 股票型基金', async () => {
    const results = await searchFunds('股票型');
    console.log('股票型基金数量:', results.length);
    expect(results.length).toBeGreaterThan(0);
  });

  test('按类型筛选 - 混合型基金', async () => {
    const results = await searchFunds('混合型');
    console.log('混合型基金数量:', results.length);
    expect(results.length).toBeGreaterThan(0);
  });

  test('按类型筛选 - 指数型基金', async () => {
    const results = await searchFunds('指数型');
    console.log('指数型基金数量:', results.length);
    expect(results.length).toBeGreaterThan(0);
  });

  test('热门基金搜索', async () => {
    const results = await searchFunds('易方达');
    console.log('易方达基金:', results.slice(0, 5));
    expect(results.length).toBeGreaterThan(0);
  });

  test('分析基金持仓股票', async () => {
    // 易方达消费行业基金重仓股
    const holdings = await getFundHoldings('110022');
    console.log('易方达消费持仓:', holdings?.holdings?.slice(0, 5));
    expect(holdings).not.toBeNull();
  });

  test('分析白酒基金持仓', async () => {
    // 招商中证白酒指数基金
    const holdings = await getFundHoldings('161725');
    console.log('招商白酒持仓:', holdings?.holdings?.slice(0, 5));
    expect(holdings).not.toBeNull();
  });

  test('蓝筹基金分析', async () => {
    // 易方达蓝筹精选
    const fund = await getFundBasic('005827');
    console.log('易方达蓝筹:', {
      code: fund?.code,
      name: fund?.name,
      manager: fund?.manager
    });
    expect(fund).not.toBeNull();
  });
});
