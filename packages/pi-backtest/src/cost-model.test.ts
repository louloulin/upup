import { describe, expect, test } from 'bun:test';
import { calculateTransactionCosts } from './cost-model.js';

describe('Pi backtest transaction costs', () => {
  test('applies commission, single-side A-share stamp duty, and symmetric slippage', () => {
    const result = calculateTransactionCosts(100, 110, 100, {
      commissionBps: 10,
      minimumCommission: 5,
      stampDuty: { regime: 'cn_a_share' },
      slippageBps: 10,
    });
    expect(result.entryFillPrice).toBe(100.1);
    expect(result.exitFillPrice).toBe(109.89);
    expect(result.entryCommission).toBe(10.01);
    expect(result.exitCommission).toBe(10.989);
    expect(result.stampDuty).toMatchObject({ regime: 'cn_a_share', buyBps: 0, sellBps: 5 });
    expect(result.entryStampDuty).toBe(0);
    expect(result.exitStampDuty).toBeCloseTo(5.4945, 4);
    expect(result.netPnl).toBeLessThan(result.grossPnl);
    expect(result.netReturnPct).toBeLessThan(result.grossReturnPct);
  });

  test('applies double-sided HK stamp duty on entry and exit', () => {
    const result = calculateTransactionCosts(100, 110, 100, {
      commissionBps: 0,
      stampDuty: { regime: 'hk' },
      slippageBps: 0,
    });
    expect(result.entryStampDuty).toBeCloseTo(13, 4);
    expect(result.exitStampDuty).toBeCloseTo(14.3, 4);
    expect(result.stampDuty).toMatchObject({ regime: 'hk', buyBps: 13, sellBps: 13 });
  });

  test('disable regime applies no stamp duty', () => {
    const result = calculateTransactionCosts(100, 110, 100, { stampDuty: { regime: 'none' } });
    expect(result.entryStampDuty).toBe(0);
    expect(result.exitStampDuty).toBe(0);
  });

  test('supports a no-cost model and rejects invalid inputs', () => {
    expect(calculateTransactionCosts(10, 12, 2, {})).toMatchObject({ totalCost: 0, grossPnl: 4, netPnl: 4 });
    expect(() => calculateTransactionCosts(0, 1, 1, {})).toThrow('entryPrice');
    expect(() => calculateTransactionCosts(1, 1, 0, {})).toThrow('quantity');
  });
});
