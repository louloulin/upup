/**
 * 共享类型定义。
 *
 * 价格结构交易系统的核心数据契约：
 * - Bar: 单根 K 线（OHLC + 日期）
 * - Direction: 周线判定的方向
 * - StructureEvent: 6 种结构之一
 * - EntrySignal: 完整的入场信号（含入场/止损/止盈）
 * - RiskCheck: 风控校验结果
 * - BacktestTrade / BacktestResult: 回测记录
 */

export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Direction = "long" | "short" | "range";

export type StructureType =
  | "bullish_structure"
  | "bearish_structure"
  | "top_structure"
  | "bottom_structure"
  | "pullback_pivot"
  | "bounce_pivot";

export interface StructureEvent {
  type: StructureType;
  index: number;
  date: string;
  method?: "A" | "B";
  /** 结构起点索引（多头/空头结构对应的创新低/创新高 K 线） */
  originIndex?: number;
}

export interface DirectionResult {
  direction: Direction;
  label: string;
  lastEvent: StructureEvent | null;
  events: StructureEvent[];
}

export interface EntrySignal {
  detected: boolean;
  direction: "long" | "short";
  pivotIndex: number | null;
  pivotDate: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** 预估亏损 = |入场 - 止损| × 乘数 × 1手 */
  estimatedLoss: number | null;
}

export interface RiskCheck {
  pass: boolean;
  quantity: number;
  estimatedLoss: number;
  reason?: string;
}

export interface CostModel {
  /** 佣金（每手元，按合约价值 bps） */
  commissionBps: number;
  /** 最低佣金 */
  minCommission: number;
  /** 滑点 bps */
  slippageBps: number;
  /** 印花税（仅卖出，A 股股票有，期货通常无） */
  stampDutyBps: number;
}

export const DEFAULT_COST_MODEL: CostModel = {
  commissionBps: 2.5, // 万分之 2.5
  minCommission: 5,
  slippageBps: 1,
  stampDutyBps: 0,
};

export interface BacktestTrade {
  symbol: string;
  direction: "long" | "short";
  entryDate: string;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  exitDate: string | null;
  exitPrice: number | null;
  exitReason: "stop_loss" | "take_profit" | "end_of_data" | "risk_blocked" | "no_signal";
  /** 毛盈亏（元） */
  grossPnl: number;
  /** 手续费（元） */
  commission: number;
  /** 净盈亏（元） */
  netPnl: number;
  netPnlPercent: number;
}

export interface BacktestResult {
  symbol: string;
  contractMultiplier: number;
  startDate: string;
  endDate: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalGrossPnl: number;
  totalCommission: number;
  totalNetPnl: number;
  avgPnl: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
}

/* ============================================================
 * 工具函数（OHLC 判定）
 * ============================================================ */

/** 阳线：收盘 > 开盘 */
export function bullish(b: Bar): boolean {
  return b.close > b.open;
}

/** 阴线：收盘 < 开盘 */
export function bearish(b: Bar): boolean {
  return b.close < b.open;
}

/** 十字线：开盘 ≈ 收盘 */
export function doji(b: Bar, tolerance = 0.001): boolean {
  const range = b.high - b.low;
  if (range === 0) return true;
  return Math.abs(b.close - b.open) / range < tolerance;
}

/* ============================================================
 * 极值比较（用于阶段识别）
 * ============================================================ */

/** 在 [start, end) 范围内，bars[idx] 的 close 是否为最低收盘价 */
export function isCloseLowInRange(bars: Bar[], idx: number, start: number, end: number): boolean {
  if (idx <= start || idx >= end) return false;
  const c = bars[idx].close;
  for (let i = start; i < end; i++) {
    if (i === idx) continue;
    if (bars[i].close < c) return false;
  }
  return true;
}

/** 在 [start, end) 范围内，bars[idx] 的 close 是否为最高收盘价 */
export function isCloseHighInRange(bars: Bar[], idx: number, start: number, end: number): boolean {
  if (idx <= start || idx >= end) return false;
  const c = bars[idx].close;
  for (let i = start; i < end; i++) {
    if (i === idx) continue;
    if (bars[i].close > c) return false;
  }
  return true;
}

/** 在 [start, end) 范围内，bars[idx] 的 low 是否为最低价 */
export function isLowInRange(bars: Bar[], idx: number, start: number, end: number): boolean {
  if (idx <= start || idx >= end) return false;
  const l = bars[idx].low;
  for (let i = start; i < end; i++) {
    if (i === idx) continue;
    if (bars[i].low < l) return false;
  }
  return true;
}

/** 在 [start, end) 范围内，bars[idx] 的 high 是否为最高价 */
export function isHighInRange(bars: Bar[], idx: number, start: number, end: number): boolean {
  if (idx <= start || idx >= end) return false;
  const h = bars[idx].high;
  for (let i = start; i < end; i++) {
    if (i === idx) continue;
    if (bars[i].high > h) return false;
  }
  return true;
}