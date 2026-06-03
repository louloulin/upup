/**
 * AlgoRunner unit tests using a mock broker.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: Algo Runner
 */

import { describe, expect, mock, test } from 'bun:test';
import { AlgoRunner, getAlgo } from './runner.js';
import { TwapAlgo } from './twap.js';
import type { BrokerAdapter, Order, Quote } from '../types.js';
import type { ChildOrder, ParentOrder } from './types.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Mock broker
// ---------------------------------------------------------------------------

class MockBroker implements BrokerAdapter {
  readonly name = 'mock';
  public readonly orders: Order[] = [];
  private nextId = 1;
  private readonly prices = new Map<string, number>();

  constructor(seedPrice: number) {
    this.prices.set('600519.SH', seedPrice);
  }

  async placeOrder(input: Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>): Promise<Order> {
    const id = `mock-${this.nextId++}`;
    const price = this.prices.get(input.symbol) ?? 100;
    // Simulate tiny slippage on market orders
    const fillPrice = input.type === 'market'
      ? price * (input.side === 'buy' ? 1.001 : 0.999)
      : (input.price ?? price);
    const order: Order = {
      ...input,
      id,
      status: 'filled',
      createdAt: Date.now(),
      filledQuantity: input.quantity,
      avgFillPrice: fillPrice,
      commission: Math.max(5, input.quantity * 0.0005),
    };
    this.orders.push(order);
    return order;
  }
  async cancelOrder(id: string): Promise<Order> {
    const o = this.orders.find(x => x.id === id);
    if (!o) throw new Error(`not found: ${id}`);
    o.status = 'cancelled';
    return o;
  }
  async getOrder(id: string): Promise<Order | null> {
    return this.orders.find(x => x.id === id) ?? null;
  }
  async listPendingOrders(): Promise<Order[]> {
    return this.orders.filter(o => o.status === 'pending');
  }
  async getPositions() { return []; }
  async getBalance() {
    return { cash: 1_000_000, marketValue: 0, totalEquity: 1_000_000, currency: 'CNY' };
  }
  async getQuote(symbol: string): Promise<Quote> {
    const last = this.prices.get(symbol) ?? 100;
    return { symbol, bid: last * 0.999, ask: last * 1.001, last, timestamp: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shMorningStart(): number {
  return Date.UTC(2026, 5, 4, 1, 30, 0); // 2026-06-04 09:30 +08:00
}

function makeParent(overrides: Partial<ParentOrder> = {}): ParentOrder {
  const start = shMorningStart();
  return {
    symbol: '600519.SH',
    side: 'buy',
    quantity: 1000,
    duration: { startMs: start, endMs: start + 30 * 60_000 },
    session: DEFAULT_A_SHARE_SESSIONS,
    referencePrice: 100,
    childOrderType: 'market',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAlgo', () => {
  test('returns TwapAlgo for twap kind', () => {
    expect(getAlgo('twap').kind).toBe('twap');
  });
  test('throws for unknown kind', () => {
    expect(() => getAlgo('zzz' as never)).toThrow();
  });
});

describe('AlgoRunner', () => {
  test('runUntilDone submits every child and produces a final report', async () => {
    const broker = new MockBroker(100);
    const runner = new AlgoRunner(makeParent(), {
      broker,
      now: () => Date.UTC(2026, 5, 4, 2, 0, 0), // mid-morning, after all children scheduled
      sleep: async () => {},
    });
    const report = await runner.runUntilDone(0);
    expect(report.state).toBe('completed');
    expect(report.filledChildCount).toBe(report.childCount);
    expect(broker.orders.length).toBe(report.childCount);
    expect(report.filledQuantity).toBe(1000);
    expect(report.averageFillPrice).toBeGreaterThan(100);
    // Implementation shortfall is positive for a market buy (paid above reference)
    expect(report.slippageBps).toBeGreaterThan(0);
  });

  test('emits child_filled events with the expected payload shape', async () => {
    const broker = new MockBroker(100);
    const events: Array<{ topic: string; payload: unknown }> = [];
    const runner = new AlgoRunner(makeParent(), {
      broker,
      now: () => Date.UTC(2026, 5, 4, 2, 0, 0),
      sleep: async () => {},
      onEvent: (topic, payload) => events.push({ topic, payload }),
    });
    await runner.runUntilDone(0);
    const fillEvents = events.filter(e => e.topic === 'trading.algo.child_filled');
    expect(fillEvents.length).toBeGreaterThan(0);
    for (const e of fillEvents) {
      const p = e.payload as { parentId: string; child: ChildOrder };
      expect(p.parentId).toMatch(/^parent-/);
      expect(p.child.order?.status).toBe('filled');
    }
    const completed = events.find(e => e.topic === 'trading.algo.completed');
    expect(completed).toBeDefined();
  });

  test('cancel() halts the runner before completion', async () => {
    const broker = new MockBroker(100);
    const start = shMorningStart();
    const runner = new AlgoRunner(
      makeParent({ duration: { startMs: start, endMs: start + 60 * 60_000 } }),
      { broker, now: () => start + 5 * 60_000, sleep: async () => {} },
    );
    // First tick submits the first few children.
    await runner.tick();
    const beforeCancel = broker.orders.length;
    expect(beforeCancel).toBeGreaterThan(0);
    runner.cancel();
    const report = await runner.runUntilDone(0);
    expect(report.state).toBe('cancelled');
    // No new orders after cancel.
    expect(broker.orders.length).toBe(beforeCancel);
  });

  test('does not submit children scheduled in the future', async () => {
    const broker = new MockBroker(100);
    const start = shMorningStart();
    // Now is BEFORE the parent's start, so no child should submit on the first tick.
    const runner = new AlgoRunner(makeParent(), {
      broker,
      now: () => start - 60_000, // 1 minute before start
      sleep: async () => {},
    });
    await runner.tick();
    expect(broker.orders.length).toBe(0);
    expect(runner.progress.state).toBe('running');
  });

  test('handles broker errors gracefully and records notes', async () => {
    const broker = new MockBroker(100);
    // Use a real subclass that overrides placeOrder only.
    class FailingBroker extends MockBroker {
      override async placeOrder(): Promise<Order> { throw new Error('simulated broker outage'); }
    }
    const failingBroker = new FailingBroker(100);
    const runner = new AlgoRunner(makeParent({ quantity: 500 }), {
      broker: failingBroker,
      now: () => Date.UTC(2026, 5, 4, 2, 0, 0),
      sleep: async () => {},
    });
    const report = await runner.runUntilDone(0);
    expect(report.state).toBe('completed');
    expect(report.notes.some(n => n.includes('failed'))).toBe(true);
  });
});
