/**
 * Trading Tools - Common Types
 *
 * BrokerAdapter interface and shared types for trading operations.
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 *      openspec/changes/top-tier-investment-assistant/specs/trading-sandbox
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type OrderStatus = 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  /** Required for limit / stop_limit. */
  price?: number;
  /** Required for stop / stop_limit. */
  stopPrice?: number;
  timeInForce?: TimeInForce;
  filledQuantity: number;
  avgFillPrice?: number;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
  commission?: number;
  metadata?: Record<string, unknown>;
}

export interface Position {
  symbol: string;
  /** Positive = long, negative = short. */
  quantity: number;
  avgCost: number;
  realizedPnL: number;
  openedAt: number;
  closedAt?: number;
}

export interface Balance {
  cash: number;
  marketValue: number;
  totalEquity: number;
  margin?: number;
  currency: string;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  commission: number;
  timestamp: number;
}

export interface BrokerConfig {
  /** Per-share commission in currency. */
  commissionPerShare?: number;
  /** Minimum commission per trade. Default 5 (CNY A-share convention). */
  commissionMinimum?: number;
  /** Commission as % of trade value. Overrides perShare if set. */
  commissionPercent?: number;
  /** Slippage in basis points. Default 5 (0.05%). */
  slippageBps?: number;
  /** Initial cash balance. Default 1,000,000. */
  initialCash?: number;
  /** Currency. Default 'CNY'. */
  currency?: string;
  /** State persistence file. Default ~/.upup/sandbox-state.json. */
  stateFile?: string;
  /** Quote provider (overridable for tests). */
  quoteProvider?: (symbol: string) => Promise<Quote>;
}

/**
 * BrokerAdapter - Unified interface for all broker implementations.
 * All broker implementations (sandbox, IBKR, Xueqiu, Tonghuashun, Tiger)
 * MUST implement this interface. Agents interact with brokers only through
 * this interface, so the same trading code works with paper or live.
 */
export interface BrokerAdapter {
  /** Adapter name (e.g., 'sandbox', 'ibkr'). */
  readonly name: string;

  placeOrder(
    order: Omit<Order, 'id' | 'status' | 'createdAt' | 'filledQuantity'>,
  ): Promise<Order>;

  cancelOrder(orderId: string): Promise<Order>;

  getOrder(orderId: string): Promise<Order | null>;

  listPendingOrders(): Promise<Order[]>;

  getPositions(): Promise<Position[]>;

  getBalance(): Promise<Balance>;

  getQuote(symbol: string): Promise<Quote>;

  /** Sandbox-only: reset to initial state. */
  reset?(): Promise<void>;

  /** Cleanup (persist state, release resources). */
  close?(): Promise<void>;
}
