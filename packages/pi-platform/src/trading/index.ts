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
} from './sandbox-engine';

export {
  createBroker,
  createBrokerAsync,
  listBrokers,
  registerBroker,
  resolveActiveBroker,
  unregisterBroker,
  type BuiltinBrokerName,
} from './registry';

export { IbkrAdapter, createMemoryTransport as createIbkrMemoryTransport, type IbkrTransport } from './ibkr-adapter';

export { XueqiuAdapter, createMemoryTransport as createXueqiuMemoryTransport, type XueqiuTransport } from './xueqiu-adapter';

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
} from './types';

export const TRADING_DESCRIPTION = `
Trading tools for paper and live brokerage operations.

## What It Does
- Place / cancel / monitor orders (market, limit, stop, stop-limit)
- Track positions, balance, realized / unrealized P&L
- Persist sandbox state across CLI restarts
- Pluggable BrokerAdapter — same code works for sandbox and live brokers
- Selectable via \`UPUP_BROKER\` env var (sandbox | ibkr | xueqiu)

## When to Use
- User wants to "模拟买入 X 股" → sandbox broker (default)
- Backtest result needs to continue as paper trading → sandbox
- User asks to connect to a live broker → UPUP_BROKER=ibkr / xueqiu

## Tools
- \`place_trade_order\` — 下单(支持 market/limit/stop/stop_limit)
- \`cancel_trade_order\` — 撤单
- \`get_trading_positions\` — 查持仓
- \`get_trading_balance\` — 查余额
- \`get_trade_quote\` — 查报价

## Brokers
- \`sandbox\` (default) — paper trading, no real money, quotes come from an injected market-data provider (no synthetic fallback)
- \`ibkr\` — Interactive Brokers (Client Portal API; transport stub included, real plumbing TODO)
- \`xueqiu\` — 雪球证券 (HTTPS + cookie auth; transport stub included, real plumbing TODO)
`;
