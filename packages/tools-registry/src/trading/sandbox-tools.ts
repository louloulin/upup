/**
 * Sandbox Trading Tools (LangChain wrapper)
 *
 * Wraps SandboxBroker as LangChain tools so the UpUp agent can place paper
 * trades. Companion to sandbox-engine.ts.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { SandboxBroker } from './sandbox-engine.js';

// Singleton sandbox broker — shared across tool invocations within a session
let sandboxSingleton: SandboxBroker | null = null;

async function getSandbox(): Promise<SandboxBroker> {
  if (!sandboxSingleton) {
    sandboxSingleton = new SandboxBroker();
    await sandboxSingleton.loadState();
  }
  return sandboxSingleton;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const placeOrderSchema = z.object({
  symbol: z.string().describe('Stock symbol (e.g., 600519.SH, AAPL)'),
  side: z.enum(['buy', 'sell']).describe('Order side'),
  type: z.enum(['market', 'limit', 'stop', 'stop_limit']).default('market').describe('Order type'),
  quantity: z.number().int().positive().describe('Number of shares'),
  price: z.number().positive().optional().describe('Limit price (required for limit / stop_limit)'),
  stopPrice: z.number().positive().optional().describe('Stop trigger price (required for stop / stop_limit)'),
  timeInForce: z.enum(['day', 'gtc', 'ioc', 'fok']).default('day').optional().describe('Time in force'),
});

const cancelOrderSchema = z.object({
  orderId: z.string().describe('Order ID returned from place_trade_order'),
});

const getQuoteSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
});

// ============================================================================
// Tool Factory
// ============================================================================

export const createPlaceTradeOrderTool = () =>
  new DynamicStructuredTool({
    name: 'place_trade_order',
    description: `Place a paper trade order in the sandbox broker. Use this to simulate buying or selling a stock without using real money. Returns order status (filled / pending / rejected), fill price, and commission.

Common usage:
- "模拟买入 100 股 600519" → {symbol:'600519.SH', side:'buy', type:'market', quantity:100}
- "限价 95 买入 000001" → {symbol:'000001.SZ', side:'buy', type:'limit', price:95, quantity:100}
- "止损 90 卖出 600519" → {symbol:'600519.SH', side:'sell', type:'stop', stopPrice:90, quantity:100}`,
    schema: placeOrderSchema,
    func: async (params) => {
      const sb = await getSandbox();
      const order = await sb.placeOrder(params);
      return formatToolResult({
        id: order.id,
        status: order.status,
        filledQuantity: order.filledQuantity,
        avgFillPrice: order.avgFillPrice,
        commission: order.commission,
        createdAt: order.createdAt,
        filledAt: order.filledAt,
      });
    },
  });

export const createCancelTradeOrderTool = () =>
  new DynamicStructuredTool({
    name: 'cancel_trade_order',
    description: 'Cancel a pending sandbox order. Cannot cancel filled or already-cancelled orders.',
    schema: cancelOrderSchema,
    func: async (params) => {
      const sb = await getSandbox();
      const order = await sb.cancelOrder(params.orderId);
      return formatToolResult({
        id: order.id,
        status: order.status,
        cancelledAt: Date.now(),
      });
    },
  });

export const createGetTradingPositionsTool = () =>
  new DynamicStructuredTool({
    name: 'get_trading_positions',
    description: `Get current open positions in the sandbox broker. Returns array of {symbol, quantity, avgCost, realizedPnL, openedAt}. Use this to see what's currently held in the paper trading account.`,
    schema: z.object({}),
    func: async () => {
      const sb = await getSandbox();
      const positions = await sb.getPositions();
      return formatToolResult(positions);
    },
  });

export const createGetTradingBalanceTool = () =>
  new DynamicStructuredTool({
    name: 'get_trading_balance',
    description: `Get sandbox broker account balance: {cash, marketValue, totalEquity, currency}. Use to see available buying power and total portfolio value.`,
    schema: z.object({}),
    func: async () => {
      const sb = await getSandbox();
      return formatToolResult(await sb.getBalance());
    },
  });

export const createGetTradeQuoteTool = () =>
  new DynamicStructuredTool({
    name: 'get_trade_quote',
    description: 'Get current quote (bid / ask / last) for a symbol in the sandbox. Useful to check price before placing an order.',
    schema: getQuoteSchema,
    func: async (params) => {
      const sb = await getSandbox();
      return formatToolResult(await sb.getQuote(params.symbol));
    },
  });

// ============================================================================
// Aggregated tool list
// ============================================================================

export const sandboxTools = [
  createPlaceTradeOrderTool,
  createCancelTradeOrderTool,
  createGetTradingPositionsTool,
  createGetTradingBalanceTool,
  createGetTradeQuoteTool,
] as const;
