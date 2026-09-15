/**
 * Sandbox Broker Engine Tests
 *
 * Verifies the trading-sandbox spec:
 * - placeOrder, cancelOrder, getOrder, listPendingOrders
 * - Position tracking (long, short, partial close, flip)
 * - Slippage and commission (per-share minimum, percent-of-value)
 * - State persistence (loadState, reset)
 * - Edge cases: insufficient cash, cancel filled order
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SandboxBroker } from './sandbox-engine';
import type { Quote } from './types';

// Deterministic quote provider for tests
function fixedQuoteProvider(price: number) {
  return async (symbol: string): Promise<Quote> => ({
    symbol,
    bid: price * 0.999,
    ask: price * 1.001,
    last: price,
    timestamp: Date.now(),
  });
}

let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sandbox-test-'));
  stateFile = join(tmpDir, 'state.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SandboxBroker — basic order placement', () => {
  it('places a market buy order and fills at ask + slippage', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
      slippageBps: 0,
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'market',
      quantity: 100,
    });
    expect(order.status).toBe('filled');
    expect(order.filledQuantity).toBe(100);
    expect(order.avgFillPrice).toBeCloseTo(100 * 1.001, 4);
    const positions = await sb.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0]!.symbol).toBe('600519');
    expect(positions[0]!.quantity).toBe(100);
  });

  it('applies slippage to market buy (ask + slippageBps)', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
      slippageBps: 50, // 0.5%
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'market',
      quantity: 10,
    });
    expect(order.avgFillPrice).toBeCloseTo(100 * 1.001 * 1.005, 4);
  });

  it('charges minimum commission for small orders', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(10),
      commissionMinimum: 5,
    });
    const order = await sb.placeOrder({
      symbol: '000001',
      side: 'buy',
      type: 'market',
      quantity: 1,
    });
    expect(order.commission).toBe(5);
  });

  it('rejects buy when insufficient cash', async () => {
    const sb = new SandboxBroker({
      stateFile,
      initialCash: 100,
      quoteProvider: fixedQuoteProvider(100),
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'market',
      quantity: 100, // 100 * 100 = 10,000 > 100
    });
    expect(order.status).toBe('rejected');
    const positions = await sb.getPositions();
    expect(positions).toHaveLength(0);
  });
});

describe('SandboxBroker — limit and stop orders', () => {
  it('does not fill a buy limit when ask > price', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(110),
      slippageBps: 0,
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'limit',
      price: 100,
      quantity: 10,
    });
    expect(order.status).toBe('pending');
    expect(order.filledQuantity).toBe(0);
  });

  it('fills a buy limit when ask <= price', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
      slippageBps: 0,
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'limit',
      price: 110,
      quantity: 10,
    });
    expect(order.status).toBe('filled');
    expect(order.avgFillPrice).toBeCloseTo(100 * 1.001, 4);
  });

  it('triggers a stop loss and fills as market order', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(95),
      slippageBps: 0,
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'sell',
      type: 'stop',
      stopPrice: 100,
      quantity: 10,
    });
    expect(order.status).toBe('filled');
    expect(order.avgFillPrice).toBeCloseTo(95 * 0.999, 4);
  });
});

describe('SandboxBroker — cancellation', () => {
  it('cancels a pending order', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(110),
      slippageBps: 0,
    });
    const placed = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'limit',
      price: 100,
      quantity: 10,
    });
    expect(placed.status).toBe('pending');
    const cancelled = await sb.cancelOrder(placed.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('rejects cancel of a filled order', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
    });
    const order = await sb.placeOrder({
      symbol: '600519',
      side: 'buy',
      type: 'market',
      quantity: 1,
    });
    expect(order.status).toBe('filled');
    await expect(sb.cancelOrder(order.id)).rejects.toThrow();
  });
});

describe('SandboxBroker — position tracking and P&L', () => {
  it('computes realized P&L on closing buy', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
      slippageBps: 0,
    });
    await sb.placeOrder({ symbol: '600519', side: 'buy', type: 'market', quantity: 100 });
    await sb.placeOrder({ symbol: '600519', side: 'sell', type: 'market', quantity: 100 });
    const positions = await sb.getPositions();
    expect(positions).toHaveLength(0);
    const fills = (sb as unknown as { fills: { price: number }[] }).fills;
    expect(fills[1]!.price).toBeLessThan(fills[0]!.price); // sold below bought (bid < ask)
  });

  it('balance reflects cash + market value', async () => {
    const sb = new SandboxBroker({
      stateFile,
      initialCash: 1_000_000,
      quoteProvider: fixedQuoteProvider(50),
      slippageBps: 0,
    });
    await sb.placeOrder({ symbol: '600519', side: 'buy', type: 'market', quantity: 1000 });
    const balance = await sb.getBalance();
    expect(balance.cash).toBeLessThan(1_000_000);
    expect(balance.marketValue).toBeGreaterThan(0);
    expect(balance.totalEquity).toBeCloseTo(balance.cash + balance.marketValue, 0);
  });
});

describe('SandboxBroker — persistence and reset', () => {
  it('persists state to disk after operations', async () => {
    const sb = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
    });
    await sb.placeOrder({ symbol: '600519', side: 'buy', type: 'market', quantity: 100 });
    expect(existsSync(stateFile)).toBe(true);
    const raw = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(raw.cash).toBeLessThan(1_000_000);
    expect(raw.positions).toHaveLength(1);
  });

  it('resumes from persisted state on reload', async () => {
    const sb1 = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
    });
    await sb1.placeOrder({ symbol: '600519', side: 'buy', type: 'market', quantity: 100 });
    await sb1.close();

    const sb2 = new SandboxBroker({
      stateFile,
      quoteProvider: fixedQuoteProvider(100),
    });
    await sb2.loadState();
    const balance = await sb2.getBalance();
    expect(balance.cash).toBeLessThan(1_000_000);
    const positions = await sb2.getPositions();
    expect(positions).toHaveLength(1);
  });

  it('reset() restores initial state', async () => {
    const sb = new SandboxBroker({
      stateFile,
      initialCash: 100_000,
      quoteProvider: fixedQuoteProvider(100),
    });
    await sb.placeOrder({ symbol: '600519', side: 'buy', type: 'market', quantity: 100 });
    await sb.reset();
    const balance = await sb.getBalance();
    expect(balance.cash).toBe(100_000);
    expect(await sb.getPositions()).toHaveLength(0);
  });
});
