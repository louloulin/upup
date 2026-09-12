/**
 * Trading tool registration — wires the trading-sandbox and broker-adapter
 * implementations into the unified tool registry so the agent loop can
 * call them.
 *
 * Tools:
 *  - place_trade_order (financial write — modifies sandbox state)
 *  - cancel_trade_order (financial write)
 *  - get_trading_positions (financial read)
 *  - get_trading_balance (financial read)
 *  - get_trade_quote (financial read)
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 *      openspec/changes/top-tier-investment-assistant/specs/trading-sandbox
 */

import type { RegisteredTool } from './types.js';
import { financialReadMetadata, financialWriteMetadata } from './types.js';
import {
  createPlaceTradeOrderTool,
  createCancelTradeOrderTool,
  createGetTradingPositionsTool,
  createGetTradingBalanceTool,
  createGetTradeQuoteTool,
  TRADING_DESCRIPTION,
} from '../trading/index.js';

export function loadTradingTools(): RegisteredTool[] {
  const read = financialReadMetadata();
  const write = { ...financialWriteMetadata(), safetyLevel: 'dangerous' as const };

  return [
    {
      name: 'place_trade_order',
      tool: createPlaceTradeOrderTool(),
      description: TRADING_DESCRIPTION,
      compactDescription: '下模拟单 (sandbox/ibkr/xueqiu),支持 market/limit/stop/stop_limit',
      concurrencySafe: false,
      concurrencyMetadata: write,
    },
    {
      name: 'cancel_trade_order',
      tool: createCancelTradeOrderTool(),
      description: 'Cancel a pending order by ID.',
      compactDescription: '撤单',
      concurrencySafe: false,
      concurrencyMetadata: write,
    },
    {
      name: 'get_trading_positions',
      tool: createGetTradingPositionsTool(),
      description: 'Read current open positions in the sandbox broker.',
      compactDescription: '查持仓',
      concurrencySafe: true,
      concurrencyMetadata: read,
    },
    {
      name: 'get_trading_balance',
      tool: createGetTradingBalanceTool(),
      description: 'Read sandbox broker account balance (cash, market value, equity).',
      compactDescription: '查余额',
      concurrencySafe: true,
      concurrencyMetadata: read,
    },
    {
      name: 'get_trade_quote',
      tool: createGetTradeQuoteTool(),
      description: 'Get the current quote (bid / ask / last) for a symbol from the sandbox broker.',
      compactDescription: '查报价',
      concurrencySafe: true,
      concurrencyMetadata: read,
    },
  ];
}
