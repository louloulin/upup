/**
 * Migrated trading extension — pi-native `ToolDefinition` wrappers for
 * the sandbox trading tool family. Strict pi shape with TypeBox schemas,
 * `promptSnippet` + `promptGuidelines` per pi docs/extensions.md.
 *
 * Migration strategy (Pass 11):
 *   Pass 9 + 10 established the adapter-wrapping pattern for read-only
 *   astock tools. Pass 11 extends it to the FIRST side-effecting tools
 *   (place / cancel orders + read trading state).
 *
 *   Side-effecting tools (`place_trade_order`, `cancel_trade_order`)
 *   THROW on error per pi's recommended pattern — the agent loop needs
 *   to know the operation failed so it can retry or surface to the user.
 *   Read-only tools (`get_trading_positions`, `get_trading_balance`,
 *   `get_trade_quote`) keep the catch-and-return-text pattern from
 *   earlier passes since they cannot fail meaningfully.
 *
 *   Cancellation: side-effecting tools also check `signal?.aborted`
 *   before submitting the order, since pi passes an AbortSignal that
 *   the LLM can revoke mid-execution.
 *
 * Singleton pattern:
 *   The underlying `SandboxBroker` is a process-level singleton shared
 *   across all migrated tool invocations within a session. The pi
 *   runtime keeps tool identity stable across calls, so this works
 *   naturally — `getSandbox()` returns the same broker instance every
 *   time the LLM calls a trading tool.
 *
 * Tool inventory (Batch 3, Pass 11 prototype):
 *   - place_trade_order      (SIDE-EFFECT, S2: required + 5 enums + 4 numerics)
 *   - cancel_trade_order     (SIDE-EFFECT, S1: single string)
 *   - get_trading_positions  (READ-ONLY, S0: arg-less)
 *   - get_trading_balance    (READ-ONLY, S0: arg-less)
 *   - get_trade_quote        (READ-ONLY, S1: single string)
 */

import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { SandboxBroker } from '../tools/trading/sandbox-engine.js';
import { formatToolResult } from '../tools/types.js';

// ============================================================================
// Sandbox singleton — shared across all migrated trading tool invocations
// ============================================================================

let sandboxSingleton: SandboxBroker | null = null;

async function getSandbox(): Promise<SandboxBroker> {
  if (!sandboxSingleton) {
    sandboxSingleton = new SandboxBroker();
    await sandboxSingleton.loadState();
  }
  return sandboxSingleton;
}

// ============================================================================
// place_trade_order — SIDE-EFFECTING
// ============================================================================

const OrderSideSchema = Type.Union([
  Type.Literal('buy'),
  Type.Literal('sell'),
]);

const OrderTypeSchema = Type.Union([
  Type.Literal('market'),
  Type.Literal('limit'),
  Type.Literal('stop'),
  Type.Literal('stop_limit'),
]);

const TimeInForceSchema = Type.Union([
  Type.Literal('day'),
  Type.Literal('gtc'),
  Type.Literal('ioc'),
  Type.Literal('fok'),
]);

export const placeTradeOrderParams = Type.Object({
  symbol: Type.String({
    description: 'Stock symbol (e.g., 600519.SH, AAPL).',
    minLength: 1,
  }),
  side: OrderSideSchema,
  type: Type.Optional(OrderTypeSchema),
  quantity: Type.Number({
    description: 'Number of shares.',
    minimum: 1,
  }),
  price: Type.Optional(Type.Number({
    description: 'Limit price (required for limit / stop_limit).',
    minimum: 0,
  })),
  stopPrice: Type.Optional(Type.Number({
    description: 'Stop trigger price (required for stop / stop_limit).',
    minimum: 0,
  })),
  timeInForce: Type.Optional(TimeInForceSchema),
});

export type PlaceTradeOrderParams = Static<typeof placeTradeOrderParams>;

export interface PlaceTradeOrderDetails {
  id: string;
  status: string;
  filledQuantity: number;
  avgFillPrice?: number;
  commission?: number;
  createdAt: number;
  filledAt?: number;
}

/**
 * Place a paper trade order. THROWS on failure so the agent loop
 * knows the order didn't go through (vs returning a fake success).
 */
export function createPlaceTradeOrderTool() {
  return defineTool({
    name: 'place_trade_order',
    label: 'Place Trade Order',
    description: `Place a paper trade order in the sandbox broker. Simulates buying or selling a stock without using real money. Returns order status (filled / pending / rejected), fill price, and commission.

Common usage:
- "模拟买入 100 股 600519" → {symbol:'600519.SH', side:'buy', type:'market', quantity:100}
- "限价 95 买入 000001" → {symbol:'000001.SZ', side:'buy', type:'limit', price:95, quantity:100}
- "止损 90 卖出 600519" → {symbol:'600519.SH', side:'sell', type:'stop', stopPrice:90, quantity:100}`,
    promptSnippet: 'Place a paper trade order (buy / sell / market / limit / stop)',
    promptGuidelines: [
      'Use place_trade_order ONLY for paper / sandbox trading — never with real money.',
      "For limit / stop_limit orders, `price` is required. For stop / stop_limit, `stopPrice` is required. Type defaults to market.",
    ],
    parameters: placeTradeOrderParams,
    async execute(
      _toolCallId,
      params: PlaceTradeOrderParams,
      signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: PlaceTradeOrderDetails }> {
      // Cancellation check — if the LLM (or user) revoked the request
      // before we hit the broker, exit early with no side effects.
      if (signal?.aborted) {
        throw new Error('Order placement aborted by caller');
      }

      const sb = await getSandbox();
      const order = await sb.placeOrder({
        symbol: params.symbol,
        side: params.side,
        type: params.type ?? 'market',
        quantity: params.quantity,
        price: params.price,
        stopPrice: params.stopPrice,
        timeInForce: params.timeInForce ?? 'day',
      });

      // Inner broker may itself throw on invalid params; we let it
      // propagate so the agent loop sees a failed operation.
      const details: PlaceTradeOrderDetails = {
        id: order.id,
        status: order.status,
        filledQuantity: order.filledQuantity,
        avgFillPrice: order.avgFillPrice,
        commission: order.commission,
        createdAt: order.createdAt,
        filledAt: order.filledAt,
      };

      return {
        content: [{ type: 'text', text: formatToolResult(details) }],
        details,
      };
    },
  });
}

// ============================================================================
// cancel_trade_order — SIDE-EFFECTING
// ============================================================================

export const cancelTradeOrderParams = Type.Object({
  orderId: Type.String({
    description: 'Order ID returned from place_trade_order.',
    minLength: 1,
  }),
});

export type CancelTradeOrderParams = Static<typeof cancelTradeOrderParams>;

export interface CancelTradeOrderDetails {
  id: string;
  status: string;
  cancelledAt: number;
}

/** Cancel a pending sandbox order. THROWS if the order cannot be cancelled. */
export function createCancelTradeOrderTool() {
  return defineTool({
    name: 'cancel_trade_order',
    label: 'Cancel Trade Order',
    description: 'Cancel a pending sandbox order. Cannot cancel filled or already-cancelled orders.',
    promptSnippet: 'Cancel a pending sandbox order by ID',
    promptGuidelines: [
      'Use cancel_trade_order to cancel a pending order before it fills. Cannot cancel filled or already-cancelled orders.',
      "Use get_trading_positions first if you don't know the orderId — positions show open orders.",
    ],
    parameters: cancelTradeOrderParams,
    async execute(
      _toolCallId,
      params: CancelTradeOrderParams,
      signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: CancelTradeOrderDetails }> {
      if (signal?.aborted) {
        throw new Error('Order cancellation aborted by caller');
      }

      const sb = await getSandbox();
      const order = await sb.cancelOrder(params.orderId);

      const details: CancelTradeOrderDetails = {
        id: order.id,
        status: order.status,
        cancelledAt: Date.now(),
      };

      return {
        content: [{ type: 'text', text: formatToolResult(details) }],
        details,
      };
    },
  });
}

// ============================================================================
// get_trading_positions — READ-ONLY (arg-less)
// ============================================================================

export interface PositionDetails {
  symbol: string;
  quantity: number;
  avgCost: number;
  realizedPnL: number;
  openedAt: number;
  closedAt?: number;
}

export interface GetPositionsDetails {
  count: number;
  positions: PositionDetails[];
}

/** Get current open positions in the sandbox broker. */
export function createGetTradingPositionsTool() {
  return defineTool({
    name: 'get_trading_positions',
    label: 'Get Trading Positions',
    description: `Get current open positions in the sandbox broker. Returns array of {symbol, quantity, avgCost, realizedPnL, openedAt}. Use this to see what's currently held in the paper trading account.`,
    promptSnippet: 'Get current open positions in the sandbox broker',
    promptGuidelines: [
      'Use get_trading_positions to see what is currently held in the paper trading account.',
      "Pair with get_trading_balance for a full portfolio snapshot — positions + cash + total equity.",
    ],
    parameters: Type.Object({}),
    async execute(
      _toolCallId,
      _params,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetPositionsDetails }> {
      const sb = await getSandbox();
      const positions = await sb.getPositions();
      const details: GetPositionsDetails = {
        count: positions.length,
        positions,
      };

      return {
        content: [{ type: 'text', text: formatToolResult(details) }],
        details,
      };
    },
  });
}

// ============================================================================
// get_trading_balance — READ-ONLY (arg-less)
// ============================================================================

export interface GetBalanceDetails {
  cash: number;
  marketValue: number;
  totalEquity: number;
  margin?: number;
  currency: string;
}

/** Get sandbox broker account balance. */
export function createGetTradingBalanceTool() {
  return defineTool({
    name: 'get_trading_balance',
    label: 'Get Trading Balance',
    description: `Get sandbox broker account balance: {cash, marketValue, totalEquity, currency}. Use to see available buying power and total portfolio value.`,
    promptSnippet: 'Get sandbox broker account balance (cash / market value / equity)',
    promptGuidelines: [
      'Use get_trading_balance to see available buying power (cash) and total portfolio value.',
      "Use before place_trade_order if the user asks about how much they can buy with available cash.",
    ],
    parameters: Type.Object({}),
    async execute(
      _toolCallId,
      _params,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetBalanceDetails }> {
      const sb = await getSandbox();
      const balance = await sb.getBalance();

      return {
        content: [{ type: 'text', text: formatToolResult(balance) }],
        details: balance,
      };
    },
  });
}

// ============================================================================
// get_trade_quote — READ-ONLY (single string)
// ============================================================================

export const getTradeQuoteParams = Type.Object({
  symbol: Type.String({
    description: 'Stock symbol (e.g., 600519.SH, AAPL).',
    minLength: 1,
  }),
});

export type GetTradeQuoteParams = Static<typeof getTradeQuoteParams>;

export interface QuoteDetails {
  symbol: string;
  last?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  timestamp?: number;
  source?: string;
  error?: string;
}

/** Get current quote (bid / ask / last) for a symbol in the sandbox. */
export function createGetTradeQuoteTool() {
  return defineTool({
    name: 'get_trade_quote',
    label: 'Get Trade Quote',
    description: 'Get current quote (bid / ask / last) for a symbol in the sandbox. Useful to check price before placing an order.',
    promptSnippet: 'Get sandbox quote (bid / ask / last) for a symbol',
    promptGuidelines: [
      'Use get_trade_quote to check the current sandbox price before placing an order.',
      "Returns bid / ask / last from the sandbox — may differ from real-market quotes.",
    ],
    parameters: getTradeQuoteParams,
    async execute(
      _toolCallId,
      params: GetTradeQuoteParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: QuoteDetails }> {
      const sb = await getSandbox();
      const quote = await sb.getQuote(params.symbol);

      return {
        content: [{ type: 'text', text: formatToolResult(quote) }],
        details: quote as QuoteDetails,
      };
    },
  });
}
