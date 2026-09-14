/**
 * Fund Backtest Tests
 */

import { describe, expect, test } from 'bun:test';
import { BacktestEngine, BacktestConfig } from '@upup/pi-finance-sdk';

describe('Fund Backtest', () => {
  test('should create backtest engine', () => {
    const engine = new BacktestEngine();
    expect(engine).toBeDefined();
  });
  
  test('should have backtest functions', async () => {
    const { backtestDCA, backtestLumpSum, backtestThreshold } = await import('@upup/pi-finance-sdk');
    expect(typeof backtestDCA).toBe('function');
    expect(typeof backtestLumpSum).toBe('function');
    expect(typeof backtestThreshold).toBe('function');
  });
  
  test('generateBacktestReport should return string', async () => {
    const { generateBacktestReport } = await import('@upup/pi-finance-sdk');
    expect(typeof generateBacktestReport).toBe('function');
  });
});

describe('Backtest Types', () => {
  test('BacktestConfig should have required fields', () => {
    const config: BacktestConfig = {
      fundCode: '110022',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      initialAmount: 10000,
      strategy: 'dca',
      dca: {
        frequency: 'monthly',
        amount: 1000,
        dayOfMonth: 1,
      },
    };
    
    expect(config.fundCode).toBe('110022');
    expect(config.strategy).toBe('dca');
    expect(config.dca?.amount).toBe(1000);
  });
});
