import { describe, test, expect } from 'bun:test';
import { backtestDCA } from '../src/tools/fund/fund-backtest';
import { getFundEstimatedValue } from '../src/tools/fund/fund-api';

describe('基金回测真实验证', () => {
  test('DCA定投回测 - 110022', async () => {
    // backtestDCA 签名: fundCode, months, monthlyAmount
    const result = await backtestDCA('110022', 3, 1000);

    expect(result).not.toBeNull();
    console.log('DCA回测结果:', {
      fundCode: result?.fundCode,
      totalInvested: result?.totalInvested,
      finalValue: result?.finalValue,
      totalReturn: result?.totalReturn,
      totalReturnPercent: result?.totalReturnPercent
    });
  }, 30000);

  test('获取基金估算净值', async () => {
    const est = await getFundEstimatedValue('110022');
    console.log('估算净值:', est);
    // Skip test if network unavailable
    if (est === null) {
      console.log('网络不可用，跳过测试');
      return;
    }
    expect(est.estimatedUnit).toBeGreaterThan(0);
  }, 30000);
});
