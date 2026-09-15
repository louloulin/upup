import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type NativeOrderSide = 'buy' | 'sell';
export type NativeOrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type NativeOrderStatus = 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
export type NativeTimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';

export interface NativeSandboxQuote {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
  readonly timestamp: number;
}

export interface NativeSandboxOrder {
  readonly id: string;
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly type: NativeOrderType;
  readonly quantity: number;
  readonly price?: number;
  readonly stopPrice?: number;
  readonly timeInForce: NativeTimeInForce;
  readonly filledQuantity: number;
  readonly avgFillPrice?: number;
  readonly status: NativeOrderStatus;
  readonly createdAt: number;
  readonly filledAt?: number;
  readonly commission?: number;
}

export interface NativeSandboxPosition {
  readonly symbol: string;
  readonly quantity: number;
  readonly avgCost: number;
  readonly realizedPnL: number;
  readonly openedAt: number;
  readonly closedAt?: number;
}

export interface NativeSandboxBalance {
  readonly cash: number;
  readonly marketValue: number;
  readonly totalEquity: number;
  readonly currency: string;
}

export interface NativePlaceOrderInput {
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly type?: NativeOrderType;
  readonly quantity: number;
  readonly price?: number;
  readonly stopPrice?: number;
  readonly timeInForce?: NativeTimeInForce;
}

interface NativeFill {
  readonly orderId: string;
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly quantity: number;
  readonly price: number;
  readonly commission: number;
  readonly timestamp: number;
}

interface NativeSandboxState {
  cash: number;
  positions: NativeSandboxPosition[];
  orders: NativeSandboxOrder[];
  orderSeq: number;
  fills: NativeFill[];
}

export interface NativeSandboxBrokerOptions {
  readonly stateFile?: string;
  readonly initialCash?: number;
  readonly currency?: string;
  readonly commissionPerShare?: number;
  readonly commissionMinimum?: number;
  readonly commissionPercent?: number;
  readonly slippageBps?: number;
  readonly quoteProvider?: (symbol: string) => Promise<NativeSandboxQuote>;
}

function stateFileFromEnvironment(): string {
  return process.env.UPUP_SANDBOX_STATE_FILE?.trim() || join(process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup'), 'sandbox-state.json');
}

function missingQuoteProvider(_symbol: string): Promise<NativeSandboxQuote> {
  return Promise.reject(new Error('sandbox quote requires an injected market-data provider'));
}

function finitePositive(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`${name} must be a positive finite number`);
}

function validateOrderInput(input: NativePlaceOrderInput): void {
  if (!/^[A-Za-z0-9.-]{1,32}$/.test(input.symbol.trim())) throw new Error('symbol must be a valid security identifier');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > 10_000_000) throw new Error('quantity must be a positive integer no greater than 10000000');
  const type = input.type ?? 'market';
  finitePositive(input.price, 'price');
  finitePositive(input.stopPrice, 'stopPrice');
  if ((type === 'limit' || type === 'stop_limit') && input.price === undefined) throw new Error(`${type} orders require price`);
  if ((type === 'stop' || type === 'stop_limit') && input.stopPrice === undefined) throw new Error(`${type} orders require stopPrice`);
}

function parseState(value: unknown): NativeSandboxState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as Record<string, unknown>;
  if (typeof state.cash !== 'number' || !Number.isFinite(state.cash) || !Array.isArray(state.positions) || !Array.isArray(state.orders)) return undefined;
  return {
    cash: state.cash,
    positions: state.positions.filter((item): item is NativeSandboxPosition => Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).symbol === 'string' && typeof (item as Record<string, unknown>).quantity === 'number' && typeof (item as Record<string, unknown>).avgCost === 'number' && typeof (item as Record<string, unknown>).realizedPnL === 'number' && typeof (item as Record<string, unknown>).openedAt === 'number'),
    orders: state.orders.filter((item): item is NativeSandboxOrder => Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string' && typeof (item as Record<string, unknown>).symbol === 'string' && typeof (item as Record<string, unknown>).quantity === 'number' && typeof (item as Record<string, unknown>).status === 'string'),
    orderSeq: typeof state.orderSeq === 'number' && Number.isInteger(state.orderSeq) && state.orderSeq >= 0 ? state.orderSeq : 0,
    fills: Array.isArray(state.fills) ? state.fills as NativeFill[] : [],
  };
}

export function nativeSandboxStateFile(): string {
  return stateFileFromEnvironment();
}

export class NativeSandboxBroker {
  private readonly stateFile: string;
  private readonly initialCash: number;
  private readonly currency: string;
  private readonly commissionPerShare: number;
  private readonly commissionMinimum: number;
  private readonly commissionPercent: number;
  private readonly slippageBps: number;
  private readonly quoteProvider: (symbol: string) => Promise<NativeSandboxQuote>;
  private cash: number;
  private positions = new Map<string, NativeSandboxPosition>();
  private orders = new Map<string, NativeSandboxOrder>();
  private fills: NativeFill[] = [];
  private orderSeq = 0;

  constructor(options: NativeSandboxBrokerOptions = {}) {
    this.stateFile = options.stateFile ?? stateFileFromEnvironment();
    this.initialCash = options.initialCash ?? 1_000_000;
    this.currency = options.currency ?? 'CNY';
    this.commissionPerShare = options.commissionPerShare ?? 0;
    this.commissionMinimum = options.commissionMinimum ?? 5;
    this.commissionPercent = options.commissionPercent ?? 0;
    this.slippageBps = options.slippageBps ?? 5;
    this.quoteProvider = options.quoteProvider ?? missingQuoteProvider;
    this.cash = this.initialCash;
  }

  async loadState(): Promise<void> {
    try {
      const state = parseState(JSON.parse(await readFile(this.stateFile, 'utf8')) as unknown);
      if (!state) return;
      this.cash = state.cash;
      this.positions = new Map(state.positions.map((position) => [position.symbol, position]));
      this.orders = new Map(state.orders.map((order) => [order.id, order]));
      this.orderSeq = state.orderSeq;
      this.fills = state.fills;
    } catch {
      // Missing or corrupt state starts a fresh sandbox; no live broker is contacted.
    }
  }

  async placeOrder(input: NativePlaceOrderInput): Promise<NativeSandboxOrder> {
    validateOrderInput(input);
    this.orderSeq += 1;
    const order: NativeSandboxOrder = {
      id: `SB-${Date.now()}-${this.orderSeq}-${randomUUID().slice(0, 8)}`,
      symbol: input.symbol.trim().toUpperCase(),
      side: input.side,
      type: input.type ?? 'market',
      quantity: input.quantity,
      ...(input.price === undefined ? {} : { price: input.price }),
      ...(input.stopPrice === undefined ? {} : { stopPrice: input.stopPrice }),
      timeInForce: input.timeInForce ?? 'day',
      filledQuantity: 0,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.orders.set(order.id, order);
    const filled = await this.tryFill(order);
    this.orders.set(order.id, filled);
    await this.persist();
    return filled;
  }

  async cancelOrder(orderId: string): Promise<NativeSandboxOrder> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status === 'filled' || order.status === 'cancelled') throw new Error(`Order ${orderId} is ${order.status}, cannot cancel`);
    const cancelled = { ...order, status: 'cancelled' as const };
    this.orders.set(orderId, cancelled);
    await this.persist();
    return cancelled;
  }

  async getPositions(): Promise<readonly NativeSandboxPosition[]> { return [...this.positions.values()]; }

  async getBalance(): Promise<NativeSandboxBalance> {
    let marketValue = 0;
    for (const position of this.positions.values()) marketValue += Math.abs(position.quantity) * (await this.quoteProvider(position.symbol)).last;
    return { cash: this.cash, marketValue, totalEquity: this.cash + marketValue, currency: this.currency };
  }

  async getQuote(symbol: string): Promise<NativeSandboxQuote> {
    if (!/^[A-Za-z0-9.-]{1,32}$/.test(symbol.trim())) throw new Error('symbol must be a valid security identifier');
    return this.quoteProvider(symbol.trim().toUpperCase());
  }

  private async tryFill(order: NativeSandboxOrder): Promise<NativeSandboxOrder> {
    const quote = await this.quoteProvider(order.symbol);
    const slippage = this.slippageBps / 10_000;
    let fillPrice: number | undefined;
    if (order.type === 'market') fillPrice = order.side === 'buy' ? quote.ask * (1 + slippage) : quote.bid * (1 - slippage);
    if (order.type === 'limit' && order.price !== undefined && (order.side === 'buy' ? quote.ask <= order.price : quote.bid >= order.price)) fillPrice = order.side === 'buy' ? quote.ask : quote.bid;
    if (order.type === 'stop' && order.stopPrice !== undefined && (order.side === 'buy' ? quote.last >= order.stopPrice : quote.last <= order.stopPrice)) fillPrice = order.side === 'buy' ? quote.ask * (1 + slippage) : quote.bid * (1 - slippage);
    if (order.type === 'stop_limit' && order.price !== undefined && order.stopPrice !== undefined && (order.side === 'buy' ? quote.last >= order.stopPrice : quote.last <= order.stopPrice) && (order.side === 'buy' ? quote.ask <= order.price : quote.bid >= order.price)) fillPrice = order.side === 'buy' ? quote.ask : quote.bid;
    if (fillPrice === undefined) return order;
    const tradeValue = fillPrice * order.quantity;
    const commission = this.commissionPercent > 0 ? Math.max(tradeValue * this.commissionPercent, this.commissionMinimum) : Math.max(this.commissionPerShare * order.quantity, this.commissionMinimum);
    if (order.side === 'buy' && this.cash < tradeValue + commission) return { ...order, status: 'rejected' };
    const timestamp = Date.now();
    const fill: NativeFill = { orderId: order.id, symbol: order.symbol, side: order.side, quantity: order.quantity, price: fillPrice, commission, timestamp };
    this.fills.push(fill);
    this.applyFill(fill);
    this.cash += order.side === 'buy' ? -(tradeValue + commission) : tradeValue - commission;
    return { ...order, status: 'filled', filledQuantity: order.quantity, avgFillPrice: fillPrice, filledAt: timestamp, commission };
  }

  private applyFill(fill: NativeFill): void {
    const existing = this.positions.get(fill.symbol);
    if (fill.side === 'buy') {
      if (!existing || existing.quantity === 0) this.positions.set(fill.symbol, { symbol: fill.symbol, quantity: fill.quantity, avgCost: fill.price, realizedPnL: existing?.realizedPnL ?? 0, openedAt: fill.timestamp });
      else if (existing.quantity > 0) {
        const quantity = existing.quantity + fill.quantity;
        this.positions.set(fill.symbol, { ...existing, quantity, avgCost: (existing.quantity * existing.avgCost + fill.quantity * fill.price) / quantity });
      } else {
        const closeQuantity = Math.min(fill.quantity, Math.abs(existing.quantity));
        const quantity = existing.quantity + fill.quantity;
        this.positions.set(fill.symbol, { ...existing, quantity, realizedPnL: existing.realizedPnL + (existing.avgCost - fill.price) * closeQuantity, ...(quantity > 0 ? { avgCost: fill.price, openedAt: fill.timestamp } : {}) });
      }
    } else if (!existing || existing.quantity === 0) this.positions.set(fill.symbol, { symbol: fill.symbol, quantity: -fill.quantity, avgCost: fill.price, realizedPnL: existing?.realizedPnL ?? 0, openedAt: fill.timestamp });
    else if (existing.quantity > 0) {
      const quantity = existing.quantity - fill.quantity;
      this.positions.set(fill.symbol, { ...existing, quantity, realizedPnL: existing.realizedPnL + (fill.price - existing.avgCost) * Math.min(fill.quantity, existing.quantity), ...(quantity === 0 ? { closedAt: fill.timestamp } : {}) });
    } else {
      const quantity = Math.abs(existing.quantity) + fill.quantity;
      this.positions.set(fill.symbol, { ...existing, quantity: -quantity, avgCost: (Math.abs(existing.quantity) * existing.avgCost + fill.quantity * fill.price) / quantity });
    }
    if (this.positions.get(fill.symbol)?.quantity === 0) this.positions.delete(fill.symbol);
  }

  private async persist(): Promise<void> {
    const state: NativeSandboxState = { cash: this.cash, positions: [...this.positions.values()], orders: [...this.orders.values()], orderSeq: this.orderSeq, fills: this.fills };
    try {
      await mkdir(dirname(this.stateFile), { recursive: true });
      await writeFile(this.stateFile, JSON.stringify(state, null, 2));
    } catch {
      // State persistence is best effort; the tool result remains explicitly sandboxed.
    }
  }
}
