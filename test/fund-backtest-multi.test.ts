import { describe, test, expect } from 'bun:test';
import { backtestDCA } from '../src/tools/fund/fund-backtest';

describe('多基金回测验证', () => {
  test('易方达消费DCA回测', async () => {
    const result = await backtestDCA('110022', 3, 1000);
    console.log('易方达消费回测:', {
      fundCode: result?.fundCode,
      totalReturn: result?.totalReturnPercent?.toFixed(2) + '%'
    });
    expect(result).not.toBeNull();
  });

  test('招商白酒DCA回测', async () => {
    const result = await backtestDCA('161725', 3, 1000);
    console.log('招商白酒回测:', {
      fundCode: result?.fundCode,
      totalReturn: result?.totalReturnPercent?.toFixed(2) + '%'
    });
    expect(result).not.toBeNull();
  });

  test('沪深300指数DCA回测', async () => {
    const result = await backtestDCA('000311', 3, 1000);
    console.log('沪深300回测:', {
      fundCode: result?.fundCode,
      totalReturn: result?.totalReturnPercent?.toFixed(2) + '%'
    });
    expect(result).not.toBeNull();
  });
});
