import { describe, expect, test } from 'bun:test';
import { calculateTransactionCosts } from './cost-model.js';

describe('Pi backtest transaction costs', () => {
  test('applies commission, sell stamp duty, and symmetric slippage', () => {
    const result = calculateTransactionCosts(100, 110, 100, {
      commissionBps: 10,
      minimumCommission: 5,
      stampDutyBps: 5,
      slippageBps: 10,
    });
    expect(result.entryFillPrice).toBe(100.1);
    expect(result.exitFillPrice).toBe(109.89);
    expect(result.entryCommission).toBe(10.01);
    expect(result.exitCommission).toBe(10.989);
    expect(result.stampDuty).toBe(5.4945);
    expect(result.netPnl).toBeLessThan(result.grossPnl);
    expect(result.netReturnPct).toBeLessThan(result.grossReturnPct);
  });

  test('supports a no-cost model and rejects invalid inputs', () => {
    expect(calculateTransactionCosts(10, 12, 2, {})).toMatchObject({ totalCost: 0, grossPnl: 4, netPnl: 4 });
    expect(() => calculateTransactionCosts(0, 1, 1, {})).toThrow('entryPrice');
    expect(() => calculateTransactionCosts(1, 1, 0, {})).toThrow('quantity');
  });
});

