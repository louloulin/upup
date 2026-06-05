/**
 * IBKR Broker Adapter (Stub)
 *
 * Skeleton for Interactive Brokers Client Portal API integration. Implements
 * the BrokerAdapter contract end-to-end against an in-memory fake transport,
 * so the registry / agent code can be exercised today. The real REST /
 * websocket plumbing (auth, market data subscriptions, order routing) lives
 * behind `setTransport()` and can be swapped in without touching callers.
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

export interface IbkrTransport {
  placeOrder: (payload: unknown) => Promise<unknown>;
  cancelOrder: (orderId: string) => Promise<unknown>;
  getOrder: (orderId: string) => Promise<unknown>;
  listPendingOrders: () => Promise<unknown>;
  getPositions: () => Promise<unknown>;
  getBalance: () => Promise<unknown>;
  getQuote: (symbol: string) => Promise<unknown>;
}

/**
 * In-memory transport for tests. Behaves like the sandbox broker so adapter
 * tests can run without a network. Real transports live in their own files.
 */
export function createMemoryTransport(): IbkrTransport {
  const orders = new Map<string, Order>();
  const positions = new Map<string, Position>();
  let balance: Balance = {
    cash: 1_000_000,
    marketValue: 0,
    totalEquity: 1_000_000,
    currency: 'USD',
  };
  let nextId = 1;

  return {
    async placeOrder(payload) {
      const p = payload as Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>;
      const id = `IBKR-${nextId++}`;
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
      return { symbol, bid: 100, ask: 101, last: 100.5, timestamp: Date.now() } satisfies Quote;
    },
  };
}

export class IbkrAdapter implements BrokerAdapter {
  readonly name = 'ibkr';
  private transport: IbkrTransport;
  private config?: BrokerConfig;

  constructor(config?: BrokerConfig) {
    this.config = config;
    this.transport = createMemoryTransport();
  }

  /** Replace the transport (e.g., wire up the real Client Portal REST client). */
  setTransport(transport: IbkrTransport): void {
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
    // Real transport would persist / disconnect. No-op for the memory transport.
  }
}
