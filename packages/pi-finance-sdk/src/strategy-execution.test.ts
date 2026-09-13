import { describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { NativeSandboxBroker } from './sandbox-trading.js';
import { listNativeExecutionStrategies, runNativeStrategyBacktest, runNativeStrategyPaper } from './strategy-execution.js';

describe('native execution strategies', () => {
  test('lists all four strategies and returns a deterministic backtest', () => {
    expect(listNativeExecutionStrategies()).toHaveLength(4);
    const report = runNativeStrategyBacktest({ algo: 'pov', symbol: '600519.SH', side: 'buy', quantity: 1000, startDate: '2026-05-01', endDate: '2026-05-31', participationRate: 0.2 });
    expect(report._stub).toBe(true);
    expect(report.filledQuantity).toBeGreaterThan(0);
    expect(report.slippageBps).toBeGreaterThan(0);
  });

  test('runs paper execution through the native sandbox broker', async () => {
    const broker = new NativeSandboxBroker({ stateFile: '/tmp/upup-strategy-execution-test.json', quoteProvider: async (symbol) => ({ symbol, bid: 99.9, ask: 100.1, last: 100, timestamp: Date.now() }) });
    await unlink('/tmp/upup-strategy-execution-test.json').catch(() => undefined);
    const report = await runNativeStrategyPaper({ algo: 'twap', symbol: '600519.SH', side: 'buy', quantity: 100, durationMinutes: 1 }, broker, () => 1_700_000_000_000);
    expect(report.state).toBe('completed');
    expect(report.filledQuantity).toBe(100);
    expect(report.childCount).toBe(5);
    expect(report.children.length).toBe(5);
  });
});
