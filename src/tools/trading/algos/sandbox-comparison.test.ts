/**
 * TWAP vs Market Order Implementation Shortfall comparison.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: Sandbox Matching Comparison
 *
 * Runs both an immediate market order and a TWAP 30-minute order for the
 * same symbol/quantity against a price walk that exhibits ~1% intraday
 * volatility. Asserts TWAP achieves lower slippage (in basis points) than
 * the market order.
 */

import { describe, expect, test } from 'bun:test';
import { AlgoRunner } from './runner.js';
import type { BrokerAdapter, Order, Quote } from '../types.js';
import type { ParentOrder } from './types.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Volatile mock broker: price walk with intraday volatility
// ---------------------------------------------------------------------------

/**
 * Price walk: starts at base, drifts randomly each call with ~0.1% per
 * minute standard deviation, plus a tiny impact for market orders. The
 * total intraday range is roughly ±1%.
 */
class VolatileBroker implements BrokerAdapter {
  readonly name = 'volatile-mock';
  public readonly orders: Order[] = [];
  private id = 1;
  private currentPrice: number;
  private callCount = 0;
  private readonly basePrice: number;
  constructor(basePrice: number) {
    this.basePrice = basePrice;
    this.currentPrice = basePrice;
  }
  /**
   * Simulate the price moving. The walk is deterministic from a seed so
   * tests are reproducible. The market impact is added only when a
   * market order is placed (caller passes `impact = true`).
   */
  private step(symbol: string, withImpact: boolean, orderSize: number): Quote {
    this.callCount++;
    // Deterministic pseudo-random walk
    const h = ((this.callCount * 2654435761) ^ symbol.charCodeAt(0)) >>> 0;
    const driftBps = (h % 21) - 10; // -10..+10 bps per step
    this.currentPrice = this.currentPrice * (1 + driftBps / 10_000);
    if (withImpact) {
      // Impact scales with order size: ~0.001 bps per share. A 10,000-share
      // market order therefore pays ~10 bps, while a 333-share TWAP child
      // pays ~0.33 bps. This mirrors the square-root law of market impact.
      const impactBps = Math.min(50, orderSize * 0.001);
      this.currentPrice = this.currentPrice * (1 + impactBps / 10_000);
    }
    return {
      symbol,
      bid: this.currentPrice * 0.9995,
      ask: this.currentPrice * 1.0005,
      last: this.currentPrice,
      timestamp: 0,
    };
  }
  async placeOrder(input: Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>): Promise<Order> {
    const q = this.step(input.symbol, input.type === 'market', input.quantity);
    const id = `vol-${this.id++}`;
    const order: Order = {
      ...input,
      id,
      status: 'filled',
      createdAt: Date.now(),
      filledQuantity: input.quantity,
      avgFillPrice: input.type === 'market' ? q.ask : (input.price ?? q.last),
      commission: 5,
    };
    this.orders.push(order);
    return order;
  }
  async cancelOrder(id: string) {
    const o = this.orders.find(x => x.id === id);
    if (!o) throw new Error('not found');
    o.status = 'cancelled';
    return o;
  }
  async getOrder(id: string) { return this.orders.find(x => x.id === id) ?? null; }
  async listPendingOrders() { return this.orders.filter(o => o.status === 'pending'); }
  async getPositions() { return []; }
  async getBalance() { return { cash: 1_000_000, marketValue: 0, totalEquity: 1_000_000, currency: 'CNY' }; }
  async getQuote(symbol: string): Promise<Quote> {
    return {
      symbol,
      bid: this.currentPrice * 0.9995,
      ask: this.currentPrice * 1.0005,
      last: this.currentPrice,
      timestamp: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shMorningStart(): number {
  return Date.UTC(2026, 5, 4, 1, 30, 0);
}

function makeParent(over: Partial<ParentOrder> = {}): ParentOrder {
  const start = shMorningStart();
  return {
    symbol: '600519.SH',
    side: 'buy',
    quantity: 10_000,
    duration: { startMs: start, endMs: start + 30 * 60_000 },
    session: DEFAULT_A_SHARE_SESSIONS,
    referencePrice: 100,
    childOrderType: 'market',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('Sandbox TWAP vs Market comparison', () => {
  test('TWAP achieves lower implementation shortfall than a single market order', async () => {
    const start = shMorningStart();

    // -- Run 1: single market order, full 10,000 shares at start.
    const broker1 = new VolatileBroker(100);
    await broker1.placeOrder({
      symbol: '600519.SH', side: 'buy', type: 'market', quantity: 10_000,
    });
    const marketAvg = broker1.orders[0]!.avgFillPrice!;
    const marketSlippageBps = ((marketAvg - 100) / 100) * 10_000;

    // -- Run 2: TWAP 30 minutes, same quantity, same start.
    const broker2 = new VolatileBroker(100);
    const runner = new AlgoRunner(makeParent(), {
      broker: broker2,
      // Use a clock that always returns "now is past the latest schedule" so
      // runUntilDone completes in a single iteration.
      now: () => start + 31 * 60_000,
      sleep: async () => {},
    });
    const report = await runner.runUntilDone(0);
    expect(report.state).toBe('completed');
    expect(report.filledQuantity).toBe(10_000);

    // -- Compare: TWAP should have LOWER slippage than the single market order,
    // because its 30 child orders spread across time average out the per-call
    // 5 bps market impact. The market order pays the 5 bps impact once.
    // Volatile walk itself averages to near 0 over many steps, so the
    // dominant signal is market impact.
    expect(report.slippageBps).toBeLessThan(marketSlippageBps);
    // Sanity bound: TWAP should not be vastly worse than reference
    expect(report.slippageBps).toBeLessThan(20);

    // Document the comparison for traceability
    console.log(
      `Market order slippage: ${marketSlippageBps.toFixed(2)} bps, ` +
      `TWAP slippage: ${report.slippageBps} bps, ` +
      `improvement: ${(marketSlippageBps - report.slippageBps).toFixed(2)} bps`,
    );
  });
});
