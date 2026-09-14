import { describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { NativeSandboxBroker } from './sandbox-trading.js';
import { listNativeExecutionStrategies, runNativeStrategyBacktest, runNativeStrategyPaper } from './strategy-execution.js';

describe('native execution strategies', () => {
  test('lists all four strategies and runs only on explicit historical bars', () => {
    expect(listNativeExecutionStrategies()).toHaveLength(4);
    const report = runNativeStrategyBacktest({ algo: 'pov', symbol: '600519.SH', side: 'buy', quantity: 1000, startDate: '2026-05-01', endDate: '2026-05-31', participationRate: 0.2, bars: [{ date: '2026-05-01', close: 100, volume: 2_000 }, { date: '2026-05-04', close: 101, volume: 3_000 }, { date: '2026-05-05', close: 99, volume: 2_000 }] });
    expect(report.status).toBe('completed');
    expect(report.dataSource).toBe('caller-provided-historical-bars');
    expect(report.filledQuantity).toBeGreaterThan(0);
    expect(Number.isFinite(report.slippageBps)).toBe(true);
    expect(() => runNativeStrategyBacktest({ algo: 'twap', symbol: 'AAPL', side: 'buy', quantity: 10, startDate: '2026-05-01', endDate: '2026-05-31', bars: [] })).toThrow('historical bars');
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
