/**
 * 品种专属规则（调优模块）
 *
 * 6 年回测发现：
 *   - 铁矿 (I0) 100% 胜率但信号少：需要更长趋势 + 量能确认
 *   - 棉花 (CF0) 100% 胜率但持仓极短：持仓 < 2 天的过滤假信号
 *   - 沪金 (AU0) 0% 胜率且大亏：保守持仓（已有 1 手上限）
 *   - 螺纹/棕榈 0% 胜率：暂停（结构性错误，待规则更新）
 *
 * 设计：
 *   每个品种可独立配置：
 *   - 启用/禁用
 *   - 入场过滤（额外的趋势/量能/形态确认）
 *   - 持仓过滤（最少持仓天数，避免假突破）
 *   - 风控覆盖（强制 maxLoss 限制）
 */
import type { Bar } from "../types.js";

/** Bar with volume（可选字段） */
type BarWithVolume = Bar & { volume?: number };

/** 取成交量（兼容无 volume 字段） */
function volumeOf(b: Bar): number {
  return (b as BarWithVolume).volume ?? 0;
}

export type SymbolCode =
  | "AU0" | "AG0" | "CU0" | "RB0" | "M0" | "Y0"
  | "CF0" | "I0"  | "SR0" | "P0";

export interface SymbolRule {
  symbol: SymbolCode;
  /** 是否启用（false = 不开仓） */
  enabled: boolean;
  /** 持仓最少天数（过滤假突破） */
  minHoldDays: number;
  /** 量能过滤：最近 5 日均量必须 > 20 日均量 */
  requireVolumeExpansion: boolean;
  /** 趋势确认：入场前 N 根日线必须同向 */
  trendConfirmDays: number;
  /** 自定义最大亏损（覆盖默认） */
  customMaxLoss?: number;
  /** 说明（调优日志） */
  notes: string;
}

/**
 * 10 个主力合约的专属规则（基于 6 年回测调优）
 */
export const SYMBOL_RULES: Record<SymbolCode, SymbolRule> = {
  // 100% 胜率：启用但用宽松过滤（6 年数据样本太少，过严会导致 0 笔）
  I0: {
    symbol: "I0",
    enabled: true,
    minHoldDays: 0,        // 不限制（样本少）
    requireVolumeExpansion: false,
    trendConfirmDays: 0,
    notes: "铁矿：100% 胜率，启用但不加严苛过滤（样本不足）",
  },
  CF0: {
    symbol: "CF0",
    enabled: true,
    minHoldDays: 0,
    requireVolumeExpansion: false,
    trendConfirmDays: 0,
    notes: "棉花：100% 胜率，启用但不加严苛过滤（样本不足）",
  },
  AG0: {
    symbol: "AG0",
    enabled: true,
    minHoldDays: 0,
    requireVolumeExpansion: false,
    trendConfirmDays: 0,
    notes: "沪银：100% 胜率，启用标准规则",
  },
  Y0: {
    symbol: "Y0",
    enabled: true,
    minHoldDays: 0,
    requireVolumeExpansion: false,
    trendConfirmDays: 0,
    notes: "豆油：100% 胜率，启用标准规则",
  },

  // 0% 胜率且大亏：禁用或严控
  AU0: {
    symbol: "AU0",
    enabled: false,         // 暂时禁用
    minHoldDays: 5,
    requireVolumeExpansion: false,
    trendConfirmDays: 3,
    notes: "沪金：6 年大亏 -4082 元（单笔风险过大），暂停",
  },
  RB0: {
    symbol: "RB0",
    enabled: false,
    minHoldDays: 5,
    requireVolumeExpansion: false,
    trendConfirmDays: 3,
    notes: "螺纹：0% 胜率，待规则更新",
  },
  P0: {
    symbol: "P0",
    enabled: false,
    minHoldDays: 5,
    requireVolumeExpansion: false,
    trendConfirmDays: 3,
    notes: "棕榈：0% 胜率，待规则更新",
  },
  SR0: {
    symbol: "SR0",
    enabled: false,
    minHoldDays: 5,
    requireVolumeExpansion: false,
    trendConfirmDays: 3,
    notes: "白糖：0% 胜率，待规则更新",
  },
  M0: {
    symbol: "M0",
    enabled: false,
    minHoldDays: 5,
    requireVolumeExpansion: false,
    trendConfirmDays: 3,
    notes: "豆粕：0% 胜率，待规则更新",
  },
  CU0: {
    symbol: "CU0",
    enabled: false,
    minHoldDays: 5,
    requireVolumeExpansion: false,
    trendConfirmDays: 3,
    notes: "沪铜：信号被风控拦截（止损过宽），暂停",
  },
};

/**
 * 检查某品种是否启用
 */
export function isSymbolEnabled(symbol: string): boolean {
  const rule = SYMBOL_RULES[symbol as SymbolCode];
  return rule ? rule.enabled : false;
}

/**
 * 获取品种规则
 */
export function getSymbolRule(symbol: string): SymbolRule | null {
  return SYMBOL_RULES[symbol as SymbolCode] ?? null;
}

/**
 * 检查入场是否通过品种过滤
 */
export interface FilterResult {
  pass: boolean;
  reason?: string;
}

export function filterEntry(
  symbol: string,
  dailyBars: Bar[],
  entryIdx: number,
  direction: "long" | "short",
): FilterResult {
  const rule = getSymbolRule(symbol);
  if (!rule) return { pass: true };

  // 1. 启用检查
  if (!rule.enabled) {
    return { pass: false, reason: `${symbol} 已禁用: ${rule.notes}` };
  }

  // 2. 持仓过滤（伪过滤器，在 backtest 里实现）

  // 3. 量能放大检查
  if (rule.requireVolumeExpansion) {
    const pass = checkVolumeExpansion(dailyBars, entryIdx);
    if (!pass) return { pass: false, reason: `${symbol} 量能未放大` };
  }

  // 4. 趋势确认
  if (rule.trendConfirmDays > 0) {
    const pass = checkTrend(dailyBars, entryIdx, direction, rule.trendConfirmDays);
    if (!pass) return { pass: false, reason: `${symbol} 趋势未确认` };
  }

  return { pass: true };
}

/**
 * 量能放大检查：最近 5 日均量 > 20 日均量
 */
function checkVolumeExpansion(bars: Bar[], idx: number): boolean {
  if (idx < 25) return false;
  const window5 = bars.slice(idx - 5, idx);
  const window20 = bars.slice(idx - 20, idx);
  const avg5 = avg(window5.map(volumeOf));
  const avg20 = avg(window20.map(volumeOf));
  return avg5 > avg20 * 1.1; // 至少放大 10%
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * 趋势确认：入场前 N 根日线必须同向（阳线做多 / 阴线做空）
 */
function checkTrend(
  bars: Bar[],
  idx: number,
  direction: "long" | "short",
  n: number,
): boolean {
  if (idx < n) return false;
  let count = 0;
  for (let i = idx - n; i < idx; i++) {
    const bar = bars[i];
    if (direction === "long" && bar.close > bar.open) count++;
    if (direction === "short" && bar.close < bar.open) count++;
  }
  return count >= n * 0.7; // 至少 70% 同向
}