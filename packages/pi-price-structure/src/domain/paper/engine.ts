/**
 * 真实模拟交易引擎
 *
 * 流程：
 *   1. 用 dailyBars 逐根推进（每日）
 *   2. 对每个启用品种调用 runBacktest 的子集（判方向 + 找拐点 + 风控）
 *   3. 通过 PaperAccount 开仓 / 平仓
 *   4. 每日结算并保存快照
 *   5. 输出账户表现报告
 */
import type { Bar } from "../types.js";
import { PaperAccount, type DailySnapshot, type Position } from "./account.js";
import { detectBullishStructure } from "../structures/bullish.js";
import { detectBearishStructure } from "../structures/bearish.js";
import { detectPullbackPivot } from "../structures/pullback-pivot.js";
import { detectBouncePivot } from "../structures/bounce-pivot.js";
import { calcLongTakeProfit, calcShortTakeProfit } from "../signal/take-profit.js";
import { checkRisk, MIN_LOSS_YUAN_RELAXED, MAX_LOSS_YUAN_RELAXED } from "../risk/position-sizing.js";
import { aggregateWeeklyToDate } from "../backtest/engine.js";
import { isSymbolEnabled, filterEntry } from "../optimization/symbol-rules.js";

export interface PaperSymbolConfig {
  symbol: string;
  name: string;
  contractMultiplier: number;
  marginRate: number;
}

export interface PaperSimulationInput {
  initialCapital: number;
  startDate: string;
  endDate: string;
  symbols: PaperSymbolConfig[];
  /** 启用品种过滤（默认 null = 用 symbol-rules） */
  enabledSymbols?: string[];
  /** 最大风险比例（默认 2%） */
  maxRiskPerTrade?: number;
}

export interface PaperSimulationResult {
  config: PaperSimulationInput;
  totalEquity: number;
  totalReturn: number;
  totalReturnPct: number;
  realizedPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  maxDrawdown: { amount: number; pct: number };
  finalPositions: Position[];
  snapshots: DailySnapshot[];
  /** 每日按品种的 P&L 序列 */
  trades: NonNullable<ReturnType<PaperAccount["openPosition"]>["trade"]>[];
}

export function runPaperSimulation(
  dailyBarsBySymbol: Record<string, Bar[]>,
  input: PaperSimulationInput,
): PaperSimulationResult {
  const account = new PaperAccount({
    initialCapital: input.initialCapital,
    maxRiskPerTrade: input.maxRiskPerTrade ?? 0.02,
    marginRate: 0.13,
    commissionBps: 2.5,
    minCommission: 5,
  });

  // 找最长日期区间
  const allDates = new Set<string>();
  for (const sym of input.symbols) {
    const bars = dailyBarsBySymbol[sym.symbol] ?? [];
    for (const b of bars) allDates.add(b.date);
  }
  const sortedDates = Array.from(allDates).sort();
  const startIdx = sortedDates.indexOf(input.startDate);
  const endIdx = sortedDates.indexOf(input.endDate);
  const simDates = sortedDates.slice(
    startIdx >= 0 ? startIdx : 0,
    endIdx >= 0 ? endIdx + 1 : sortedDates.length,
  );

  // 按日期遍历
  for (const date of simDates) {
    account.currentDate = date;
    const marketPrices: Record<string, number> = {};

    for (const symConfig of input.symbols) {
      const sym = symConfig.symbol;
      const bars = dailyBarsBySymbol[sym] ?? [];
      if (bars.length === 0) continue;

      // 找到今天的索引
      const todayIdx = bars.findIndex((b) => b.date === date);
      if (todayIdx < 0) continue;

      const todayBar = bars[todayIdx];
      marketPrices[sym] = todayBar.close;

      // 检查是否启用：enabledSymbols 覆盖默认规则
      if (input.enabledSymbols) {
        if (!input.enabledSymbols.includes(sym)) continue;
      } else if (!isSymbolEnabled(sym)) {
        continue;
      }

      // 累计日线 + 周线
      const cumDaily = bars.slice(0, todayIdx + 1);
      if (cumDaily.length < 30) continue;
      const cumWeekly = aggregateWeeklyToDate(cumDaily);
      if (cumWeekly.length < 5) continue;

      // 判方向
      const bull = detectBullishStructure(cumWeekly);
      const bear = detectBearishStructure(cumWeekly);
      const bullIdx = bull.detected && bull.index !== undefined ? bull.index : -1;
      const bearIdx = bear.detected && bear.index !== undefined ? bear.index : -1;
      let direction: "long" | "short" | "range" = "range";
      // 取最新结构（与回测引擎一致）
      if (bullIdx >= 0 && bearIdx === -1) direction = "long";
      else if (bearIdx >= 0 && bullIdx === -1) direction = "short";
      else if (bullIdx >= 0 && bearIdx >= 0) {
        if (bullIdx > bearIdx) direction = "long";
        else if (bearIdx > bullIdx) direction = "short";
      }
      if (direction === "range") continue;

      // 已持仓检查：用今日价做风控 / 出场
      const pos = account.positions.get(sym);
      if (pos) {
        // 持仓监控：止损/止盈出场逻辑在下方统一处理
        // 真实环境：止损价应存到 Position.stopLoss
      }

      // 找拐点
      let pivot: {
        detected: boolean;
        pivotIdx?: number;
        stopLoss?: number;
        newLowCloseIdx?: number;
        newHighCloseIdx?: number;
      };
      if (direction === "long") {
        const pp = detectPullbackPivot(cumDaily);
        pivot = pp;
      } else {
        const bp = detectBouncePivot(cumDaily);
        pivot = bp;
      }
      if (!pivot.detected || pivot.pivotIdx === undefined || pivot.stopLoss === undefined) continue;

      // 品种过滤
      const filterResult = filterEntry(sym, cumDaily, pivot.pivotIdx, direction);
      if (!filterResult.pass) continue;

      // 计算入场价、止损、止盈
      const entryIdx = pivot.pivotIdx;
      const entryPrice = cumDaily[entryIdx].close;
      const stopLoss = pivot.stopLoss;
      const newLowCloseIdx = pivot.newLowCloseIdx;
      const newHighCloseIdx = pivot.newHighCloseIdx;

      let takeProfit: number | null = null;
      if (direction === "long" && newLowCloseIdx !== undefined) {
        takeProfit = calcLongTakeProfit(cumDaily, pivot.pivotIdx, newLowCloseIdx);
      } else if (direction === "short" && newHighCloseIdx !== undefined) {
        takeProfit = calcShortTakeProfit(cumDaily, pivot.pivotIdx, newHighCloseIdx);
      }
      if (takeProfit === null) continue;

      // 风控校验（单手亏损 5~5000 元）
      account.setMultiplier(symConfig.contractMultiplier);
      const risk = checkRisk(entryPrice, stopLoss, symConfig.contractMultiplier, {
        minLoss: MIN_LOSS_YUAN_RELAXED,
        maxLoss: MAX_LOSS_YUAN_RELAXED,
      });
      if (!risk.pass) continue;

      // 检查止盈方向合法性
      const validTp = direction === "long" ? takeProfit > entryPrice : takeProfit < entryPrice;
      if (!validTp) continue;

      // 计算最大可开手数（按风险比例 2%）
      const lots = account.calcMaxLots(entryPrice, stopLoss);
      if (lots < 1) continue;

      // 开仓
      account.openPosition({
        symbol: sym,
        direction,
        price: entryPrice,
        quantity: lots,
        contractMultiplier: symConfig.contractMultiplier,
        date: todayBar.date,
        source: "paper_sop",
      });

      // 立刻检查出场（用今日剩余 K 线）
      if (direction === "long" && todayBar.high >= takeProfit) {
        account.closePosition({ symbol: sym, price: takeProfit, date: todayBar.date, reason: "take_profit" });
      } else if (direction === "short" && todayBar.low <= takeProfit) {
        account.closePosition({ symbol: sym, price: takeProfit, date: todayBar.date, reason: "take_profit" });
      } else if (direction === "long" && todayBar.low <= stopLoss) {
        account.closePosition({ symbol: sym, price: stopLoss, date: todayBar.date, reason: "stop_loss" });
      } else if (direction === "short" && todayBar.high >= stopLoss) {
        account.closePosition({ symbol: sym, price: stopLoss, date: todayBar.date, reason: "stop_loss" });
      } else {
        // 持仓延续：每日监控
        const held = account.positions.get(sym);
        if (held) {
          // 简化：每日重新检查出场
          for (let j = todayIdx + 1; j < bars.length && j < todayIdx + 60; j++) {
            const bar = bars[j];
            if (direction === "long") {
              if (bar.low <= stopLoss) {
                account.closePosition({ symbol: sym, price: stopLoss, date: bar.date, reason: "stop_loss" });
                break;
              }
              if (bar.high >= takeProfit) {
                account.closePosition({ symbol: sym, price: takeProfit, date: bar.date, reason: "take_profit" });
                break;
              }
            } else {
              if (bar.high >= stopLoss) {
                account.closePosition({ symbol: sym, price: stopLoss, date: bar.date, reason: "stop_loss" });
                break;
              }
              if (bar.low <= takeProfit) {
                account.closePosition({ symbol: sym, price: takeProfit, date: bar.date, reason: "take_profit" });
                break;
              }
            }
          }
        }
      }
    }

    // 每日结算
    account.takeSnapshot(date, marketPrices);
  }

  // 计算最终统计
  const wins = account.trades.filter((t) => t.action === "CLOSE" && t.realizedPnl > 0).length;
  const losses = account.trades.filter((t) => t.action === "CLOSE" && t.realizedPnl < 0).length;
  const totalCloses = wins + losses;

  return {
    config: input,
    totalEquity: account.totalEquity(),
    totalReturn: account.totalEquity() - input.initialCapital,
    totalReturnPct: account.totalReturn(),
    realizedPnl: account.realizedPnl,
    totalTrades: totalCloses,
    wins,
    losses,
    winRate: totalCloses > 0 ? wins / totalCloses : 0,
    maxDrawdown: account.maxDrawdown(),
    finalPositions: Array.from(account.positions.values()),
    snapshots: account.snapshots,
    trades: account.trades,
  };
}