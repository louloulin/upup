import type { NativeOrderSide, NativeOrderType, NativeSandboxBroker, NativeSandboxOrder } from './sandbox-trading.js';

export type NativeAlgoKind = 'twap' | 'vwap' | 'pov' | 'is';

export interface NativeStrategyRunPaperInput {
  readonly sessionId?: string;
  readonly algo: NativeAlgoKind;
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly quantity: number;
  readonly durationMinutes: number;
  readonly referencePrice?: number;
  readonly childOrderType?: NativeOrderType;
  readonly childLimitPrice?: number;
  readonly participationRate?: number;
}

export interface NativeStrategyBacktestInput {
  readonly algo: NativeAlgoKind;
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly quantity: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly participationRate?: number;
  readonly bars: readonly { readonly date: string; readonly close: number; readonly volume?: number }[];
}

export interface NativeStrategyPaperTrade {
  readonly id: string;
  readonly algo: NativeAlgoKind;
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly averageFillPrice: number;
  readonly slippageBps: number;
  readonly state: 'completed' | 'failed';
  readonly startedAt: number;
  readonly completedAt: number;
}

export interface NativeStrategyReport extends NativeStrategyPaperTrade {
  readonly totalQuantity: number;
  readonly totalCommission: number;
  readonly childCount: number;
  readonly filledChildCount: number;
  readonly children: readonly NativeSandboxOrder[];
  readonly notes: readonly string[];
}

export interface NativeStrategyBacktestReport {
  readonly status: 'completed';
  readonly algo: NativeAlgoKind;
  readonly symbol: string;
  readonly side: NativeOrderSide;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly fillRate: number;
  readonly averageFillPrice: number;
  readonly referencePrice: number;
  readonly slippageBps: number;
  readonly tradingDays: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly dataSource: 'caller-provided-historical-bars';
  readonly notes: readonly string[];
}

export interface NativeStrategyMetadata {
  readonly kind: NativeAlgoKind;
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly string[];
  readonly bestFor: string;
}

export const NATIVE_STRATEGY_METADATA: readonly NativeStrategyMetadata[] = [
  { kind: 'twap', name: 'TWAP (Time-Weighted Average Price)', description: 'Splits a parent order into equal child orders at uniform time intervals.', parameters: ['durationMinutes'], bestFor: 'Simple, predictable execution that reduces timing concentration.' },
  { kind: 'vwap', name: 'VWAP (Volume-Weighted Average Price)', description: 'Weights child order sizes toward the opening and closing liquidity windows.', parameters: ['durationMinutes'], bestFor: 'Following a typical intraday liquidity curve.' },
  { kind: 'pov', name: 'POV (Percent-of-Volume)', description: 'Uses a participation rate to model a controlled share of available volume.', parameters: ['participationRate', 'durationMinutes'], bestFor: 'Keeping participation bounded relative to market volume.' },
  { kind: 'is', name: 'IS (Implementation Shortfall)', description: 'Adjusts urgency around an arrival price to reduce implementation shortfall.', parameters: ['referencePrice', 'durationMinutes'], bestFor: 'Urgency-aware execution against an arrival price.' },
];

const paperHistory: NativeStrategyPaperTrade[] = [];

export function listNativeExecutionStrategies(limit = 5): readonly (NativeStrategyMetadata & { recentPaperTrades: readonly NativeStrategyPaperTrade[] })[] {
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  return NATIVE_STRATEGY_METADATA.map((metadata) => ({
    ...metadata,
    recentPaperTrades: paperHistory.filter((trade) => trade.algo === metadata.kind).slice(0, boundedLimit),
  }));
}

function childWeights(algo: NativeAlgoKind, count: number, participationRate?: number): number[] {
  if (algo === 'vwap') return Array.from({ length: count }, (_, index) => index === 0 || index === count - 1 ? 3 : 1);
  if (algo === 'pov') return Array.from({ length: count }, () => Math.max(0.01, participationRate ?? 0.1));
  return Array.from({ length: count }, () => 1);
}

function childQuantities(input: NativeStrategyRunPaperInput): number[] {
  const count = input.durationMinutes >= 1 ? 5 : 1;
  const weights = childWeights(input.algo, count, input.participationRate);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const quantities: number[] = [];
  let remaining = input.quantity;
  for (let index = 0; index < count; index += 1) {
    const quantity = index === count - 1 ? remaining : Math.min(remaining, Math.max(1, Math.floor(input.quantity * (weights[index]! / totalWeight))));
    if (quantity > 0) quantities.push(quantity);
    remaining -= quantity;
  }
  return quantities;
}

export async function runNativeStrategyPaper(input: NativeStrategyRunPaperInput, broker: NativeSandboxBroker, now = Date.now): Promise<NativeStrategyReport> {
  if (!/^[A-Za-z0-9.-]{1,32}$/.test(input.symbol.trim())) throw new Error('symbol must be a valid security identifier');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('quantity must be a positive integer');
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 480) throw new Error('durationMinutes must be an integer between 1 and 480');
  const startedAt = now();
  const quantities = childQuantities(input);
  const children: NativeSandboxOrder[] = [];
  const notes: string[] = ['Paper execution is sandbox-only; child schedule is simulated without waiting in wall-clock time.'];
  for (const quantity of quantities) {
    try {
      children.push(await broker.placeOrder({ symbol: input.symbol, side: input.side, type: input.childOrderType ?? 'market', quantity, ...(input.childLimitPrice === undefined ? {} : { price: input.childLimitPrice }) }));
    } catch (error) {
      notes.push(error instanceof Error ? error.message : String(error));
    }
  }
  const filled = children.filter((order) => order.status === 'filled');
  const filledQuantity = filled.reduce((sum, order) => sum + order.filledQuantity, 0);
  const notional = filled.reduce((sum, order) => sum + order.filledQuantity * (order.avgFillPrice ?? 0), 0);
  const averageFillPrice = filledQuantity > 0 ? notional / filledQuantity : 0;
  const slippageBps = input.referencePrice && averageFillPrice > 0
    ? Math.round(((averageFillPrice - input.referencePrice) / input.referencePrice) * 10_000 * (input.side === 'buy' ? 1 : -1))
    : 0;
  const completedAt = now();
  const trade: NativeStrategyPaperTrade = {
    id: `strategy-${startedAt}-${Math.random().toString(36).slice(2, 10)}`,
    algo: input.algo,
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    filledQuantity,
    averageFillPrice,
    slippageBps,
    state: filledQuantity === input.quantity ? 'completed' : 'failed',
    startedAt,
    completedAt,
  };
  paperHistory.unshift(trade);
  if (paperHistory.length > 200) paperHistory.pop();
  return { ...trade, totalQuantity: input.quantity, totalCommission: filled.reduce((sum, order) => sum + (order.commission ?? 0), 0), childCount: quantities.length, filledChildCount: filled.length, children, notes };
}

export function runNativeStrategyBacktest(input: NativeStrategyBacktestInput): NativeStrategyBacktestReport {
  const start = Date.parse(input.startDate);
  const end = Date.parse(input.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('startDate and endDate must be valid ISO dates with endDate >= startDate');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('quantity must be a positive integer');
  if (input.bars.length < 2) throw new Error('historical bars must contain at least two observations');
  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index]!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || !Number.isFinite(bar.close) || bar.close <= 0) throw new Error(`historical bar ${index} has an invalid date or close`);
    if (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0)) throw new Error(`historical bar ${index} volume must be finite and non-negative`);
  }
  for (let index = 1; index < input.bars.length; index += 1) if (input.bars[index]!.date <= input.bars[index - 1]!.date) throw new Error('historical bars must be strictly ordered and unique');
  const bars = input.bars.filter((bar) => {
    const timestamp = Date.parse(`${bar.date}T00:00:00Z`);
    return timestamp >= start && timestamp <= end;
  });
  if (bars.length < 2) throw new Error('historical bars do not cover the requested date range');
  if (input.algo === 'vwap' && bars.some((bar) => bar.volume === undefined)) throw new Error('vwap backtest requires volume on every historical bar');
  const weights = bars.map((bar, index) => input.algo === 'twap' ? 1 : input.algo === 'vwap' ? bar.volume! : input.algo === 'is' ? index + 1 : Math.max(0.01, input.participationRate ?? 0.1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const available = input.algo === 'pov' ? bars.reduce((sum, bar) => sum + Math.floor((bar.volume ?? 0) * (input.participationRate ?? 0.1)), 0) : input.quantity;
  const filledQuantity = Math.min(input.quantity, available);
  if (filledQuantity <= 0) throw new Error('historical volume is insufficient for a POV backtest');
  let allocated = 0;
  let notional = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const quantity = index === bars.length - 1 ? filledQuantity - allocated : Math.min(filledQuantity - allocated, Math.max(0, Math.floor(filledQuantity * (weights[index]! / totalWeight))));
    allocated += quantity;
    notional += quantity * bars[index]!.close;
  }
  const referencePrice = bars[0]!.close;
  const averageFillPrice = notional / filledQuantity;
  const signedSlippage = ((averageFillPrice - referencePrice) / referencePrice) * 10_000 * (input.side === 'buy' ? 1 : -1);
  return { status: 'completed', algo: input.algo, symbol: input.symbol.trim().toUpperCase(), side: input.side, requestedQuantity: input.quantity, filledQuantity, fillRate: Number((filledQuantity / input.quantity).toFixed(6)), averageFillPrice: Number(averageFillPrice.toFixed(4)), referencePrice: Number(referencePrice.toFixed(4)), slippageBps: Number(signedSlippage.toFixed(4)), tradingDays: bars.length, firstDate: bars[0]!.date, lastDate: bars.at(-1)!.date, dataSource: 'caller-provided-historical-bars', notes: ['Backtest uses caller-provided historical bars; no synthetic prices or provider fallback were used.'] };
}
