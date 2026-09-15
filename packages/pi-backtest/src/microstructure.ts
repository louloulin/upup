import type { DailyBar } from './types';

export type MarketMicrostructure =
  | 'cn_main'       // A 股主板：±10%
  | 'cn_chinext'    // 创业板：±20%（注册制后），前 5 个交易日不设涨跌幅
  | 'cn_star'       // 科创板：±20%，前 5 个交易日不设涨跌幅
  | 'cn_st'         // ST / *ST：±5%
  | 'cn_bj'         // 北交所：±30%，前 5 个交易日不设涨跌幅
  | 'cn_etf'        // A 股 ETF：仅按收盘价，不设涨跌幅
  | 'hk'            // 港股：无涨跌幅
  | 'hk_etf'        // 港股 ETF：印花税豁免
  | 'us';           // 美股：无涨跌幅

export interface PriceLimitPolicy {
  readonly dailyLimitPct: number;
  readonly excludeFirstNDays?: number;
}

export type DelistingPhase = 'trading' | 'suspended' | 'delisting-period' | 'delisted';

export interface DelistingPolicy {
  readonly phase: DelistingPhase;
  readonly liquidityDiscountPct?: number;
}

export const DEFAULT_PRICE_LIMITS: Readonly<Record<MarketMicrostructure, PriceLimitPolicy>> = {
  cn_main: { dailyLimitPct: 10 },
  cn_chinext: { dailyLimitPct: 20, excludeFirstNDays: 5 },
  cn_star: { dailyLimitPct: 20, excludeFirstNDays: 5 },
  cn_st: { dailyLimitPct: 5 },
  cn_bj: { dailyLimitPct: 30, excludeFirstNDays: 5 },
  cn_etf: { dailyLimitPct: 100 },
  hk: { dailyLimitPct: 100 },
  hk_etf: { dailyLimitPct: 100 },
  us: { dailyLimitPct: 100 },
};

const SYMBOL_RE_CN_MAIN = /^(?:60\d{4}|00\d{4})$/;
const SYMBOL_RE_CN_CHINEXT = /^30\d{4}$/;
const SYMBOL_RE_CN_STAR = /^68\d{4}$/;
const SYMBOL_RE_CN_BJ = /^(?:8\d{5}|4\d{5})$/;
const SYMBOL_RE_CN_ST = /^ST$/i;
const SYMBOL_RE_CN_ETF = /^(?:5\d{5}|1\d{5}|15\d{4})$/;
const SYMBOL_RE_HK = /\b\d{4,5}\.HK$/i;
const SYMBOL_RE_HK_ETF = /^0[0-9]{4}\.HK$/i;

export function inferMarketMicrostructure(symbol: string, hint?: MarketMicrostructure): MarketMicrostructure {
  if (hint) return hint;
  const normalized = symbol.trim().toUpperCase();
  if (SYMBOL_RE_HK_ETF.test(normalized)) return 'hk_etf';
  if (SYMBOL_RE_HK.test(normalized)) return 'hk';
  if (SYMBOL_RE_CN_ST.test(normalized)) return 'cn_st';
  if (SYMBOL_RE_CN_ETF.test(normalized)) return 'cn_etf';
  if (SYMBOL_RE_CN_BJ.test(normalized)) return 'cn_bj';
  if (SYMBOL_RE_CN_STAR.test(normalized)) return 'cn_star';
  if (SYMBOL_RE_CN_CHINEXT.test(normalized)) return 'cn_chinext';
  if (SYMBOL_RE_CN_MAIN.test(normalized)) return 'cn_main';
  return 'us';
}

export interface PriceLimitedBar {
  readonly date: string;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly open?: number;
  readonly volume?: number;
  readonly previousClose: number;
  readonly effectiveLimitHigh: number;
  readonly effectiveLimitLow: number;
  readonly rawHigh: number;
  readonly rawLow: number;
  readonly wasHighClipped: boolean;
  readonly wasLowClipped: boolean;
  readonly limitActive: boolean;
  readonly tradingDayIndex: number;
}

export function applyPriceLimits(
  bars: readonly DailyBar[],
  market: MarketMicrostructure,
  options: { customLimitPct?: number; entryPrice?: number } = {},
): readonly PriceLimitedBar[] {
  if (bars.length === 0) return [];
  const policy: PriceLimitPolicy = options.customLimitPct !== undefined
    ? { dailyLimitPct: Math.max(0, Math.min(100, options.customLimitPct)) }
    : DEFAULT_PRICE_LIMITS[market];
  const excludeFirstNDays = policy.excludeFirstNDays ?? 0;
  const result: PriceLimitedBar[] = [];
  let previousClose = options.entryPrice ?? bars[0]?.close ?? 0;
  if (!Number.isFinite(previousClose) || previousClose <= 0) previousClose = bars[0]?.close ?? 0;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]!;
    const rawHigh = bar.high ?? bar.close ?? previousClose;
    const rawLow = bar.low ?? bar.close ?? previousClose;
    const close = bar.close ?? previousClose;
    const limitActive = excludeFirstNDays === 0 || index >= excludeFirstNDays;
    const limitHigh = limitActive ? previousClose * (1 + policy.dailyLimitPct / 100) : Number.POSITIVE_INFINITY;
    const limitLow = limitActive ? previousClose * (1 - policy.dailyLimitPct / 100) : Number.NEGATIVE_INFINITY;
    const clippedHigh = Math.min(rawHigh, limitHigh);
    const clippedLow = Math.max(rawLow, limitLow);
    const wasHighClipped = rawHigh > limitHigh;
    const wasLowClipped = rawLow < limitLow;
    result.push({
      date: bar.date,
      high: Number(clippedHigh.toFixed(6)),
      low: Number(clippedLow.toFixed(6)),
      close,
      previousClose,
      effectiveLimitHigh: limitActive ? Number(limitHigh.toFixed(6)) : Number.POSITIVE_INFINITY,
      effectiveLimitLow: limitActive ? Number(limitLow.toFixed(6)) : Number.NEGATIVE_INFINITY,
      rawHigh,
      rawLow,
      wasHighClipped,
      wasLowClipped,
      limitActive,
      tradingDayIndex: index,
    });
    previousClose = close;
  }
  return result;
}

export interface PriceLimitClippingStats {
  readonly totalBars: number;
  readonly highClippedBars: number;
  readonly lowClippedBars: number;
  readonly clippedBars: number;
  readonly maxClippedUpwardPct: number;
  readonly maxClippedDownwardPct: number;
  readonly excludeFirstNDays: number;
  readonly dailyLimitPct: number;
}

export function summarizeClipping(bars: readonly PriceLimitedBar[], market: MarketMicrostructure, customLimitPct?: number): PriceLimitClippingStats {
  const policy: PriceLimitPolicy = customLimitPct !== undefined
    ? { dailyLimitPct: Math.max(0, Math.min(100, customLimitPct)) }
    : DEFAULT_PRICE_LIMITS[market];
  const excludeFirstNDays = policy.excludeFirstNDays ?? 0;
  let highClipped = 0;
  let lowClipped = 0;
  let maxUp = 0;
  let maxDown = 0;
  for (const bar of bars) {
    if (bar.wasHighClipped) {
      highClipped += 1;
      const pct = ((bar.rawHigh - bar.previousClose) / bar.previousClose) * 100;
      if (pct > maxUp) maxUp = pct;
    }
    if (bar.wasLowClipped) {
      lowClipped += 1;
      const pct = ((bar.previousClose - bar.rawLow) / bar.previousClose) * 100;
      if (pct > maxDown) maxDown = pct;
    }
  }
  return {
    totalBars: bars.length,
    highClippedBars: highClipped,
    lowClippedBars: lowClipped,
    clippedBars: highClipped + lowClipped,
    maxClippedUpwardPct: Number(maxUp.toFixed(4)),
    maxClippedDownwardPct: Number(maxDown.toFixed(4)),
    excludeFirstNDays,
    dailyLimitPct: policy.dailyLimitPct,
  };
}

export interface DelistingEvaluation {
  readonly delisted: boolean;
  readonly effectiveExitPrice?: number;
  readonly exitReason?: 'suspended' | 'delisting-period' | 'delisted' | 'trading';
  readonly warning?: string;
  readonly liquidityDiscountPct?: number;
}

export function evaluateDelisting(
  policy: DelistingPolicy,
  simulatedExitPrice: number,
): DelistingEvaluation {
  if (policy.phase === 'trading') return { delisted: false, exitReason: 'trading' };
  if (policy.phase === 'suspended') {
    return {
      delisted: false,
      effectiveExitPrice: undefined,
      exitReason: 'suspended',
      warning: 'symbol is suspended; no exit possible during evaluation window',
    };
  }
  if (policy.phase === 'delisting-period') {
    const discount = policy.liquidityDiscountPct ?? 10;
    const effectiveExitPrice = Number((simulatedExitPrice * (1 - discount / 100)).toFixed(6));
    return {
      delisted: false,
      effectiveExitPrice,
      exitReason: 'delisting-period',
      liquidityDiscountPct: discount,
      warning: `symbol is in delisting period; applying ${discount}% liquidity discount`,
    };
  }
  return {
    delisted: true,
    effectiveExitPrice: 0,
    exitReason: 'delisted',
    warning: 'symbol has been delisted; exit price is zero',
  };
}

export type StampDutyExemption = 'etf' | 'hk-etf' | 'none';

export interface StampDutyResolution {
  readonly exempt: boolean;
  readonly kind: StampDutyExemption;
  readonly effectiveBuyBps: number;
  readonly effectiveSellBps: number;
  readonly reason?: string;
}

export function resolveStampDutyExemption(symbol: string, market: MarketMicrostructure): StampDutyResolution {
  if (market === 'cn_etf') {
    return { exempt: true, kind: 'etf', effectiveBuyBps: 0, effectiveSellBps: 0, reason: 'A-share ETF is exempt from stamp duty on both sides' };
  }
  if (market === 'hk_etf') {
    return { exempt: true, kind: 'hk-etf', effectiveBuyBps: 0, effectiveSellBps: 0, reason: 'Hong Kong ETF is exempt from stamp duty' };
  }
  return { exempt: false, kind: 'none', effectiveBuyBps: 0, effectiveSellBps: 0 };
}
