/**
 * Sandbox Broker Engine
 *
 * Simulates a broker for paper trading and backtest-to-live transition.
 * Pure logic, no Pi / model dependencies.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/trading-sandbox
 *
 * Features:
 * - Market / limit / stop / stop-limit order types
 * - Configurable slippage and commission (A-share defaults: min 5 CNY, 0.05% slip)
 * - State persistence (survives CLI restarts) at ~/.upup/sandbox-state.json
 * - Pluggable quote provider (defaults to deterministic mock for testing)
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import type {
  Balance,
  BrokerAdapter,
  BrokerConfig,
  Fill,
  Order,
  Position,
  Quote,
} from './types';

// ============================================================================
// Default Quote Provider (deterministic mock — replace with real feed in prod)
// ============================================================================

function defaultQuoteProvider(symbol: string): Promise<Quote> {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = ((h << 5) - h + symbol.charCodeAt(i)) | 0;
  }
  const base = 10 + (Math.abs(h) % 990) / 10;
  return Promise.resolve({
    symbol,
    bid: base * 0.999,
    ask: base * 1.001,
    last: base,
    timestamp: Date.now(),
  });
}

// ============================================================================
// Sandbox Broker
// ============================================================================

export class SandboxBroker implements BrokerAdapter {
  readonly name = 'sandbox';

  private readonly config: Required<
    Pick<
      BrokerConfig,
      | 'commissionPerShare'
      | 'commissionMinimum'
      | 'commissionPercent'
      | 'slippageBps'
      | 'initialCash'
      | 'currency'
      | 'stateFile'
    >
  > &
    BrokerConfig;
  private readonly quoteProvider: (symbol: string) => Promise<Quote>;

  private cash: number;
  private positions: Map<string, Position> = new Map();
  private orders: Map<string, Order> = new Map();
  private orderSeq = 0;
  private fills: Fill[] = [];

  constructor(config: BrokerConfig = {}) {
    this.config = {
      commissionPerShare: config.commissionPerShare ?? 0,
      commissionMinimum: config.commissionMinimum ?? 5,
      commissionPercent: config.commissionPercent ?? 0,
      slippageBps: config.slippageBps ?? 5,
      initialCash: config.initialCash ?? 1_000_000,
      currency: config.currency ?? 'CNY',
      stateFile: config.stateFile ?? join(homedir(), '.upup', 'sandbox-state.json'),
      ...config,
    };
    this.cash = this.config.initialCash;
    this.quoteProvider = config.quoteProvider ?? defaultQuoteProvider;
  }

  // --------------------------------------------------------------------------
  // Public API: BrokerAdapter
  // --------------------------------------------------------------------------

  async placeOrder(
    input: Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>,
  ): Promise<Order> {
    this.orderSeq += 1;
    const order: Order = {
      ...input,
      id: `SB-${Date.now()}-${this.orderSeq}`,
      status: 'pending',
      createdAt: Date.now(),
      filledQuantity: 0,
      timeInForce: input.timeInForce ?? 'day',
    };
    this.orders.set(order.id, order);

    await this.tryFill(order);
    await this.persist();
    return this.orders.get(order.id)!;
  }

  async cancelOrder(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status === 'filled' || order.status === 'cancelled') {
      throw new Error(`Order ${orderId} is ${order.status}, cannot cancel`);
    }
    order.status = 'cancelled';
    await this.persist();
    return order;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) ?? null;
  }

  async listPendingOrders(): Promise<Order[]> {
    return [...this.orders.values()].filter(
      (o) => o.status === 'pending' || o.status === 'partial',
    );
  }

  async getPositions(): Promise<Position[]> {
    return [...this.positions.values()];
  }

  async getBalance(): Promise<Balance> {
    const marketValue = await this.computeMarketValue();
    return {
      cash: this.cash,
      marketValue,
      totalEquity: this.cash + marketValue,
      currency: this.config.currency,
    };
  }

  async getQuote(symbol: string): Promise<Quote> {
    return this.quoteProvider(symbol);
  }

  async reset(): Promise<void> {
    this.cash = this.config.initialCash;
    this.positions.clear();
    this.orders.clear();
    this.fills = [];
    this.orderSeq = 0;
    await this.persist();
  }

  async close(): Promise<void> {
    await this.persist();
  }

  /** Load persisted state if any. Call at startup to resume. */
  async loadState(): Promise<void> {
    try {
      const raw = await readFile(this.config.stateFile, 'utf-8');
      const state = JSON.parse(raw);
      this.cash = state.cash;
      this.positions = new Map(
        (state.positions as Position[]).map((p) => [p.symbol, p]),
      );
      this.orders = new Map((state.orders as Order[]).map((o) => [o.id, o]));
      this.orderSeq = state.orderSeq ?? 0;
      this.fills = state.fills ?? [];
    } catch {
      // No state file or invalid; start fresh
    }
  }

  // --------------------------------------------------------------------------
  // Internals: fill logic
  // --------------------------------------------------------------------------

  private async tryFill(order: Order): Promise<void> {
    const quote = await this.quoteProvider(order.symbol);
    const slippage = this.config.slippageBps / 10_000;
    let fillPrice: number | null = null;

    if (order.type === 'market') {
      const raw = order.side === 'buy' ? quote.ask : quote.bid;
      fillPrice =
        order.side === 'buy' ? raw * (1 + slippage) : raw * (1 - slippage);
    } else if (order.type === 'limit' && order.price != null) {
      const canFill =
        order.side === 'buy'
          ? quote.ask <= order.price
          : quote.bid >= order.price;
      if (canFill) fillPrice = order.side === 'buy' ? quote.ask : quote.bid;
    } else if (order.type === 'stop' && order.stopPrice != null) {
      const triggered =
        order.side === 'buy'
          ? quote.last >= order.stopPrice
          : quote.last <= order.stopPrice;
      if (triggered) {
        const raw = order.side === 'buy' ? quote.ask : quote.bid;
        fillPrice =
          order.side === 'buy' ? raw * (1 + slippage) : raw * (1 - slippage);
      }
    } else if (
      order.type === 'stop_limit' &&
      order.stopPrice != null &&
      order.price != null
    ) {
      const triggered =
        order.side === 'buy'
          ? quote.last >= order.stopPrice
          : quote.last <= order.stopPrice;
      if (triggered) {
        const canFill =
          order.side === 'buy'
            ? quote.ask <= order.price
            : quote.bid >= order.price;
        if (canFill) fillPrice = order.side === 'buy' ? quote.ask : quote.bid;
      }
    }

    if (fillPrice == null) return;

    const tradeValue = fillPrice * order.quantity;
    let commission: number;
    if (this.config.commissionPercent && this.config.commissionPercent > 0) {
      commission = Math.max(
        tradeValue * this.config.commissionPercent,
        this.config.commissionMinimum,
      );
    } else {
      commission = Math.max(
        this.config.commissionPerShare * order.quantity,
        this.config.commissionMinimum,
      );
    }

    if (order.side === 'buy' && this.cash < tradeValue + commission) {
      order.status = 'rejected';
      return;
    }

    order.filledQuantity = order.quantity;
    order.avgFillPrice = fillPrice;
    order.status = 'filled';
    order.filledAt = Date.now();
    order.commission = commission;

    const fill: Fill = {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      commission,
      timestamp: Date.now(),
    };
    this.fills.push(fill);

    this.applyFill(fill);

    if (order.side === 'buy') {
      this.cash -= tradeValue + commission;
    } else {
      this.cash += tradeValue - commission;
    }
  }

  private applyFill(fill: Fill): void {
    const existing = this.positions.get(fill.symbol);

    if (fill.side === 'buy') {
      if (!existing || existing.quantity === 0) {
        this.positions.set(fill.symbol, {
          symbol: fill.symbol,
          quantity: fill.quantity,
          avgCost: fill.price,
          realizedPnL: existing?.realizedPnL ?? 0,
          openedAt: fill.timestamp,
        });
      } else if (existing.quantity > 0) {
        const totalQty = existing.quantity + fill.quantity;
        const totalCost =
          existing.quantity * existing.avgCost + fill.quantity * fill.price;
        existing.quantity = totalQty;
        existing.avgCost = totalCost / totalQty;
      } else {
        const closeQty = Math.min(fill.quantity, Math.abs(existing.quantity));
        const realized = (existing.avgCost - fill.price) * closeQty;
        existing.realizedPnL += realized;
        existing.quantity += fill.quantity;
        if (existing.quantity > 0) {
          existing.avgCost = fill.price;
          existing.openedAt = fill.timestamp;
        }
      }
    } else {
      if (!existing || existing.quantity === 0) {
        this.positions.set(fill.symbol, {
          symbol: fill.symbol,
          quantity: -fill.quantity,
          avgCost: fill.price,
          realizedPnL: existing?.realizedPnL ?? 0,
          openedAt: fill.timestamp,
        });
      } else if (existing.quantity > 0) {
        const closeQty = Math.min(fill.quantity, existing.quantity);
        const realized = (fill.price - existing.avgCost) * closeQty;
        existing.realizedPnL += realized;
        existing.quantity -= fill.quantity;
        if (existing.quantity === 0) existing.closedAt = fill.timestamp;
      } else {
        const totalQty = Math.abs(existing.quantity) + fill.quantity;
        const totalCost =
          Math.abs(existing.quantity) * existing.avgCost +
          fill.quantity * fill.price;
        existing.quantity = -totalQty;
        existing.avgCost = totalCost / totalQty;
      }
    }

    for (const [sym, pos] of this.positions) {
      if (pos.quantity === 0) this.positions.delete(sym);
    }
  }

  private async computeMarketValue(): Promise<number> {
    let total = 0;
    for (const pos of this.positions.values()) {
      if (pos.quantity === 0) continue;
      const quote = await this.quoteProvider(pos.symbol);
      total += Math.abs(pos.quantity) * quote.last;
    }
    return total;
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  private async persist(): Promise<void> {
    const state = {
      cash: this.cash,
      positions: [...this.positions.values()],
      orders: [...this.orders.values()],
      orderSeq: this.orderSeq,
      fills: this.fills,
    };
    try {
      await mkdir(dirname(this.config.stateFile), { recursive: true });
      await writeFile(this.config.stateFile, JSON.stringify(state, null, 2));
    } catch {
      // Best-effort; do not crash on write failure
    }
  }
}

export default SandboxBroker;
// Mark unused-import-safe by referencing randomUUID at runtime indirectly
void randomUUID;
