/**
 * Strategy tools integration tests.
 *
 * Verifies the 3 LLM-facing tools (strategy_run_paper / strategy_list /
 * strategy_backtest) instantiate, validate input, and produce sensible
 * output without spinning up a full agent loop. Uses very short durations
 * (1 minute) to keep the runUntilDone wall time low.
 *
 * NOTE: formatToolResult wraps in { data: ... }, so every JSON.parse call
 * must drill into .data to read the actual payload.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
  createStrategyRunPaperTool,
  createStrategyListTool,
  createStrategyBacktestTool,
} from './strategy-tools.js';

const runPaper = createStrategyRunPaperTool();
const list = createStrategyListTool();
const backtest = createStrategyBacktestTool();

// PiTool.func may return string | AsyncGenerator, but our
// strategy tools always return a JSON string via formatToolResult. Coerce
// defensively so this remains stable across Pi tool signature changes.
// Returns `any` deliberately — tests drill into the payload with property
// accessors; precise typing here would force casts at every assertion site.
const unwrap = async (raw: string | AsyncGenerator<unknown, string, unknown>): Promise<any> => {
  const str = typeof raw === 'string' ? raw : await (async () => {
    let acc = '';
    for await (const chunk of raw) acc += String(chunk);
    return acc;
  })();
  const parsed = JSON.parse(str);
  return parsed.data ?? parsed;
};

afterAll(async () => {
  // Strategy tools share a module-level paperTradeHistory; nothing to clean up
  // but allow a moment for any pending async ops (none expected).
  await new Promise(r => setTimeout(r, 10));
});

describe('strategy_list', () => {
  test('returns 4 algos with metadata', async () => {
    const inner = await unwrap(await list.func({ limit: 5 }));
    expect(Array.isArray(inner)).toBe(true);
    expect(inner.length).toBe(4);
    const kinds = inner.map((a: { kind: string }) => a.kind).sort();
    expect(kinds).toEqual(['is', 'pov', 'twap', 'vwap']);
    for (const algo of inner) {
      expect(algo.name).toBeTruthy();
      expect(algo.description).toBeTruthy();
      expect(algo.bestFor).toBeTruthy();
      expect(Array.isArray(algo.parameters)).toBe(true);
      expect(Array.isArray(algo.recentPaperTrades)).toBe(true);
    }
  });
});

describe('strategy_backtest', () => {
  test('returns a deterministic stub with the expected shape', async () => {
    const inner = await unwrap(await backtest.func({
      algo: 'twap',
      symbol: '600519.SH',
      side: 'buy',
      quantity: 10_000,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    }));
    expect(inner._stub).toBe(true);
    expect(inner.algo).toBe('twap');
    expect(inner.symbol).toBe('600519.SH');
    expect(inner.side).toBe('buy');
    expect(inner.requestedQuantity).toBe(10_000);
    expect(inner.filledQuantity).toBeGreaterThan(0);
    expect(inner.fillRate).toBeGreaterThan(0);
    expect(inner.fillRate).toBeLessThanOrEqual(1);
    expect(inner.slippageBps).toBeGreaterThan(0);
    expect(inner.averageFillPrice).toBeGreaterThan(0);
    expect(inner.tradingDays).toBeGreaterThan(0);
  });

  test('POV participationRate raises slippage', async () => {
    const noPov = await unwrap(await backtest.func({
      algo: 'twap', symbol: 'AAPL', side: 'buy', quantity: 1000,
      startDate: '2026-01-01', endDate: '2026-01-31',
    }));
    const pov = await unwrap(await backtest.func({
      algo: 'pov', symbol: 'AAPL', side: 'buy', quantity: 1000,
      startDate: '2026-01-01', endDate: '2026-01-31',
      participationRate: 0.20,
    }));
    expect(pov.slippageBps).toBeGreaterThanOrEqual(noPov.slippageBps);
  });
});

describe('strategy_run_paper', () => {
  test('TWAP 1-minute paper trade produces a complete report', async () => {
    const inner = await unwrap(await runPaper.func({
      sessionId: 'test-1',
      algo: 'twap',
      symbol: '600519.SH',
      side: 'buy',
      quantity: 100,
      durationMinutes: 1,
      // Omit referencePrice so slippageBps defaults to 0. The sandbox's mock
      // quote provider hashes the symbol to a synthetic price, so any
      // hand-picked reference would produce an artificial slippage delta
      // unrelated to TWAP behavior.
      childOrderType: 'market',
      pollMs: 50,
    }));
    expect(inner.algo).toBe('twap');
    expect(['completed', 'cancelled']).toContain(inner.state);
    // For a 1-minute TWAP with 100 shares, we expect a small but
    // non-zero number of fills (deterministic from the sandbox).
    if (inner.state === 'completed') {
      expect(inner.filledQuantity).toBe(100);
      expect(inner.averageFillPrice).toBeGreaterThan(0);
      expect(typeof inner.slippageBps).toBe('number');
    }
  }, { timeout: 90_000 });

  test('appears in strategy_list after running', async () => {
    const inner = await unwrap(await list.func({ limit: 5 }));
    const twap = inner.find((a: { kind: string }) => a.kind === 'twap');
    expect(twap).toBeDefined();
    expect(twap.recentPaperTrades.length).toBeGreaterThan(0);
    const first = twap.recentPaperTrades[0];
    expect(first.algo).toBe('twap');
    expect(first.symbol).toBe('600519.SH');
  }, { timeout: 90_000 });
});
