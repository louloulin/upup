/**
 * Xueqiu (雪球) Broker Adapter (Stub)
 *
 * Skeleton for the Xueqiu brokerage API. Same shape as the IBKR adapter:
 * implements the BrokerAdapter contract against an in-memory fake transport
 * so the registry / agent code can be exercised today. The real HTTPS /
 * signing plumbing (cookie auth, cube token, order endpoints) is hidden
 * behind `setTransport()`.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 */

import type {
  Balance,
  BrokerAdapter,
  BrokerConfig,
  Order,
  Position,
  Quote,
} from './types.js';

export interface XueqiuTransport {
  placeOrder: (payload: unknown) => Promise<unknown>;
  cancelOrder: (orderId: string) => Promise<unknown>;
  getOrder: (orderId: string) => Promise<unknown>;
  listPendingOrders: () => Promise<unknown>;
  getPositions: () => Promise<unknown>;
  getBalance: () => Promise<unknown>;
  getQuote: (symbol: string) => Promise<unknown>;
}

export function createMemoryTransport(): XueqiuTransport {
  const orders = new Map<string, Order>();
  const positions = new Map<string, Position>();
  let balance: Balance = {
    cash: 500_000,
    marketValue: 0,
    totalEquity: 500_000,
    currency: 'CNY',
  };
  let nextId = 1;

  return {
    async placeOrder(payload) {
      const p = payload as Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>;
      const id = `XQ-${nextId++}`;
      const order: Order = {
        id,
        ...p,
        filledQuantity: 0,
        status: 'pending',
        createdAt: Date.now(),
      };
      orders.set(id, order);
      return order;
    },
    async cancelOrder(orderId) {
      const o = orders.get(orderId);
      if (!o) throw new Error(`Order ${orderId} not found`);
      o.status = 'cancelled';
      return o;
    },
    async getOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
    async listPendingOrders() {
      return Array.from(orders.values()).filter((o) => o.status === 'pending');
    },
    async getPositions() {
      return Array.from(positions.values());
    },
    async getBalance() {
      return balance;
    },
    async getQuote(symbol) {
      return { symbol, bid: 10, ask: 10.1, last: 10.05, timestamp: Date.now() } satisfies Quote;
    },
  };
}

export class XueqiuAdapter implements BrokerAdapter {
  readonly name = 'xueqiu';
  private transport: XueqiuTransport;
  private config?: BrokerConfig;

  constructor(config?: BrokerConfig) {
    this.config = config;
    this.transport = createMemoryTransport();
  }

  setTransport(transport: XueqiuTransport): void {
    this.transport = transport;
  }

  async placeOrder(
    order: Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>,
  ): Promise<Order> {
    return (await this.transport.placeOrder(order)) as Order;
  }

  async cancelOrder(orderId: string): Promise<Order> {
    return (await this.transport.cancelOrder(orderId)) as Order;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return (await this.transport.getOrder(orderId)) as Order | null;
  }

  async listPendingOrders(): Promise<Order[]> {
    return (await this.transport.listPendingOrders()) as Order[];
  }

  async getPositions(): Promise<Position[]> {
    return (await this.transport.getPositions()) as Position[];
  }

  async getBalance(): Promise<Balance> {
    return (await this.transport.getBalance()) as Balance;
  }

  async getQuote(symbol: string): Promise<Quote> {
    return (await this.transport.getQuote(symbol)) as Quote;
  }

  async close(): Promise<void> {
    // No-op for memory transport. Real impl would clear cookies / tokens.
  }
}
