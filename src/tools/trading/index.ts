/**
 * Trading Tools
 *
 * Paper trading and broker integration for UpUp.
 * Spec: openspec/changes/top-tier-investment-assistant/specs/broker-adapter
 *      openspec/changes/top-tier-investment-assistant/specs/trading-sandbox
 */

export {
  SandboxBroker,
  type SandboxBroker as SandboxBrokerType,
} from './sandbox-engine.js';

export {
  createPlaceTradeOrderTool,
  createCancelTradeOrderTool,
  createGetTradingPositionsTool,
  createGetTradingBalanceTool,
  createGetTradeQuoteTool,
  sandboxTools,
} from './sandbox-tools.js';

export type {
  Balance,
  BrokerAdapter,
  BrokerConfig,
  Fill,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  Position,
  Quote,
  TimeInForce,
} from './types.js';

export const TRADING_DESCRIPTION = `
Trading tools for paper and live brokerage operations.

## What It Does
- Place / cancel / monitor orders (market, limit, stop, stop-limit)
- Track positions, balance, realized / unrealized P&L
- Persist sandbox state across CLI restarts
- Pluggable BrokerAdapter — same code works for sandbox and live brokers

## When to Use
- User wants to "模拟买入 X 股" → sandbox broker
- Backtest result needs to continue as paper trading → sandbox
- User asks to connect to a live broker → register IBKR/Xueqiu adapter

## Tools
- \`place_trade_order\` — 下单(支持 market/limit/stop/stop_limit)
- \`cancel_trade_order\` — 撤单
- \`get_trading_positions\` — 查持仓
- \`get_trading_balance\` — 查余额
- \`get_trade_quote\` — 查报价

## Brokers
- \`sandbox\` (default) — paper trading, no real money, deterministic mock quotes by default
- Live brokers: not yet registered in this build. Adapter contract in \`types.ts\`.
`;
