/**
 * 价格结构交易系统回测引擎（修复版 v2）。
 *
 * 性能优化：
 *   - 增量计算累计周线（不每次重新聚合）
 *   - 限制回溯深度（最多回溯 250 根日线，避免 O(n³)）
 *
 * SOP 流程同 v1：
 *   1. 每周线节点评估方向
 *   2. 日线找拐点
 *   3. 风控校验
 *   4. 入场后监控日线出场
 */
import type { Bar, BacktestTrade, BacktestResult, CostModel } from "../types.js";
import { DEFAULT_COST_MODEL } from "../types.js";
import { detectBullishStructure } from "../structures/bullish.js";
import { detectBearishStructure } from "../structures/bearish.js";
import { detectPullbackPivot } from "../structures/pullback-pivot.js";
import { detectBouncePivot } from "../structures/bounce-pivot.js";
import { calcLongTakeProfit, calcShortTakeProfit } from "../signal/take-profit.js";
import { checkRisk, MIN_LOSS_YUAN_RELAXED, MAX_LOSS_YUAN_RELAXED } from "../risk/position-sizing.js";
import { isSymbolEnabled, filterEntry } from "../optimization/symbol-rules.js";
import { calcRoundTripCommission, applySlippage } from "./cost-model.js";
import { aggregateMetrics } from "./metrics.js";

const MAX_LOOKBACK = 250; // 最多回溯 250 根日线（≈1 年）
const MIN_WEEKLY_BARS = 3;

export interface BacktestEngineInput {
  symbol: string;
  weeklyBars: Bar[];
  dailyBars: Bar[];
  contractMultiplier: number;
  cost?: CostModel;
  /** 风控选项（默认放宽：5~5000 元） */
  riskOptions?: {
    minLoss?: number;
    maxLoss?: number;
  };
}

export function runBacktest(input: BacktestEngineInput): BacktestResult {
  const cost = input.cost ?? DEFAULT_COST_MODEL;
  const trades: BacktestTrade[] = [];

  if (input.weeklyBars.length === 0 || input.dailyBars.length === 0) {
    return aggregateMetrics({
      symbol: input.symbol,
      contractMultiplier: input.contractMultiplier,
      startDate: input.dailyBars[0]?.date ?? "",
      endDate: input.dailyBars.at(-1)?.date ?? "",
      trades: [],
    });
  }

  let i = 0;
  let lastEntryIdx = -1; // 防重复入场同一根

  while (i < input.dailyBars.length) {
    // 限制回溯窗口（性能 + 现实）
    const lookbackStart = Math.max(0, i - MAX_LOOKBACK);
    const searchWindowDaily = input.dailyBars.slice(lookbackStart, i + 1);
    const searchWindowWeekly = aggregateWeeklyToDate(searchWindowDaily);

    if (searchWindowWeekly.length < MIN_WEEKLY_BARS) {
      i += 1;
      continue;
    }

    const direction = detectDirectionAt(searchWindowWeekly);

    if (direction === "range") {
      i += 1;
      continue;
    }

    // 品种规则过滤（仅当传了 symbol 时启用）
    if (input.symbol) {
      if (!isSymbolEnabled(input.symbol)) {
        i += 1;
        continue;
      }
    }

    // 找拐点（只在 searchWindow 内）
    const pivot: {
      detected: boolean;
      pivotIdx?: number;
      stopLoss?: number;
      newLowCloseIdx?: number;
      newHighCloseIdx?: number;
    } = direction === "long"
      ? detectPullbackPivot(searchWindowDaily)
      : detectBouncePivot(searchWindowDaily);

    if (
      !pivot.detected ||
      pivot.pivotIdx === undefined ||
      pivot.stopLoss === undefined
    ) {
      i += 1;
      continue;
    }

    // pivot.pivotIdx 是 searchWindow 内的索引，要转回完整 dailyBars 索引
    const entryIdx = lookbackStart + pivot.pivotIdx;
    if (entryIdx >= input.dailyBars.length) {
      i += 1;
      continue;
    }

    // 品种专属过滤（趋势/量能）
    if (input.symbol) {
      const filterResult = filterEntry(input.symbol, searchWindowDaily, pivot.pivotIdx, direction);
      if (!filterResult.pass) {
        i = Math.max(i + 1, entryIdx + 2);
        continue;
      }
    }

    // 防重复入场：同一根不能反复开仓
    if (entryIdx <= lastEntryIdx) {
      // 跳过到下一根，避免反复处理同一根
      i = Math.max(i + 1, lastEntryIdx + 2);
      continue;
    }

    const entryPriceRaw = input.dailyBars[entryIdx].close;
    const stopLossRaw = pivot.stopLoss;

    let takeProfitRaw: number | null = null;
    if (direction === "long" && pivot.newLowCloseIdx !== undefined) {
      takeProfitRaw = calcLongTakeProfit(
        searchWindowDaily,
        pivot.pivotIdx,
        pivot.newLowCloseIdx,
      );
    } else if (direction === "short" && pivot.newHighCloseIdx !== undefined) {
      takeProfitRaw = calcShortTakeProfit(
        searchWindowDaily,
        pivot.pivotIdx,
        pivot.newHighCloseIdx,
      );
    }

    if (takeProfitRaw === null) {
      // takeProfit 没找到（可能数据不够），向前推进，跳过相同 entryIdx
      i = Math.max(i + 1, entryIdx + 2);
      continue;
    }

    // 校验止盈方向合法性
    const isValidTp = direction === "long"
      ? takeProfitRaw > entryPriceRaw
      : takeProfitRaw < entryPriceRaw;
    if (!isValidTp) {
      // 止盈价非法（比如数据不足导致镜像逻辑出错），跳过
      i = Math.max(i + 1, entryIdx + 2);
      continue;
    }

    // 风控校验（默认放宽：5~5000 元）
    const riskOptions = {
      minLoss: input.riskOptions?.minLoss ?? MIN_LOSS_YUAN_RELAXED,
      maxLoss: input.riskOptions?.maxLoss ?? MAX_LOSS_YUAN_RELAXED,
    };
    const risk = checkRisk(entryPriceRaw, stopLossRaw, input.contractMultiplier, riskOptions);
    if (!risk.pass) {
      trades.push({
        symbol: input.symbol,
        direction,
        entryDate: input.dailyBars[entryIdx].date,
        entryPrice: entryPriceRaw,
        quantity: 0,
        stopLoss: stopLossRaw,
        takeProfit: takeProfitRaw,
        exitDate: null,
        exitPrice: null,
        exitReason: "risk_blocked",
        grossPnl: 0,
        commission: 0,
        netPnl: 0,
        netPnlPercent: 0,
      });
      // 风控拦截也跳过相同 entryIdx
      i = Math.max(i + 1, entryIdx + 2);
      continue;
    }

    // 应用滑点（入场）
    const entryPrice = applySlippage({
      price: entryPriceRaw,
      direction,
      side: "entry",
      cost,
    });

    // 监控出场（用完整 dailyBars）
    let exitIdx = -1;
    let exitReason: BacktestTrade["exitReason"] = "end_of_data";
    for (let j = entryIdx + 1; j < input.dailyBars.length; j++) {
      const bar = input.dailyBars[j];
      if (direction === "long") {
        if (bar.low <= stopLossRaw) {
          exitIdx = j;
          exitReason = "stop_loss";
          break;
        }
        if (bar.high >= takeProfitRaw) {
          exitIdx = j;
          exitReason = "take_profit";
          break;
        }
      } else {
        if (bar.high >= stopLossRaw) {
          exitIdx = j;
          exitReason = "stop_loss";
          break;
        }
        if (bar.low <= takeProfitRaw) {
          exitIdx = j;
          exitReason = "take_profit";
          break;
        }
      }
    }

    const exitPriceRaw = exitIdx >= 0 ? input.dailyBars[exitIdx].close : entryPriceRaw;
    const exitPrice = exitIdx >= 0
      ? applySlippage({ price: exitPriceRaw, direction, side: "exit", cost })
      : entryPrice;

    let grossPnl = 0;
    if (direction === "long") {
      grossPnl = (exitPrice - entryPrice) * input.contractMultiplier * risk.quantity;
    } else {
      grossPnl = (entryPrice - exitPrice) * input.contractMultiplier * risk.quantity;
    }
    const commission = calcRoundTripCommission(
      entryPriceRaw,
      exitPriceRaw,
      input.contractMultiplier,
      risk.quantity,
      cost,
    );
    const netPnl = grossPnl - commission;
    const denom = entryPriceRaw * input.contractMultiplier * risk.quantity;
    const netPnlPercent = denom > 0 ? netPnl / denom : 0;

    trades.push({
      symbol: input.symbol,
      direction,
      entryDate: input.dailyBars[entryIdx].date,
      entryPrice,
      quantity: risk.quantity,
      stopLoss: stopLossRaw,
      takeProfit: takeProfitRaw,
      exitDate: exitIdx >= 0 ? input.dailyBars[exitIdx].date : null,
      exitPrice: exitIdx >= 0 ? exitPrice : null,
      exitReason,
      grossPnl,
      commission,
      netPnl,
      netPnlPercent,
    });

    lastEntryIdx = entryIdx;
    i = Math.max(i + 1, exitIdx >= 0 ? exitIdx + 2 : entryIdx + 2);
  }

  return aggregateMetrics({
    symbol: input.symbol,
    contractMultiplier: input.contractMultiplier,
    startDate: input.dailyBars[0]?.date ?? "",
    endDate: input.dailyBars.at(-1)?.date ?? "",
    trades,
  });
}

/* ============================================================
 * 方向判定
 * ============================================================ */

export function detectDirectionAt(
  weeklyBars: Bar[],
): "long" | "short" | "range" {
  if (weeklyBars.length < MIN_WEEKLY_BARS) return "range";

  const bull = detectBullishStructure(weeklyBars);
  const bear = detectBearishStructure(weeklyBars);

  const bullIdx = bull.detected && bull.index !== undefined ? bull.index : -1;
  const bearIdx = bear.detected && bear.index !== undefined ? bear.index : -1;

  if (bullIdx === -1 && bearIdx === -1) return "range";

  // 只有多头结构 → 看多
  if (bullIdx >= 0 && bearIdx === -1) {
    const top = detectTopStructureSimple(weeklyBars, bullIdx);
    if (top.detected) return "range";
    return "long";
  }

  // 只有空头结构 → 看空
  if (bearIdx >= 0 && bullIdx === -1) {
    const bottom = detectBottomStructureSimple(weeklyBars, bearIdx);
    if (bottom.detected) return "range";
    return "short";
  }

  // 两边都存在：取最新的
  if (bullIdx > bearIdx) {
    const top = detectTopStructureSimple(weeklyBars, bullIdx);
    if (top.detected) return "range";
    return "long";
  }

  if (bearIdx > bullIdx) {
    const bottom = detectBottomStructureSimple(weeklyBars, bearIdx);
    if (bottom.detected) return "range";
    return "short";
  }

  return "range";
}

function detectTopStructureSimple(
  weeklyBars: Bar[],
  bullIdx: number,
): { detected: boolean } {
  const bullClose = weeklyBars[bullIdx].close;
  let occurrence = 0;
  for (let i = bullIdx + 1; i < weeklyBars.length; i++) {
    if (
      weeklyBars[i].close < weeklyBars[i].open &&
      weeklyBars[i].close < bullClose
    ) {
      occurrence += 1;
      if (occurrence >= 2) return { detected: true };
    }
  }
  return { detected: false };
}

function detectBottomStructureSimple(
  weeklyBars: Bar[],
  bearIdx: number,
): { detected: boolean } {
  const bearClose = weeklyBars[bearIdx].close;
  let occurrence = 0;
  for (let i = bearIdx + 1; i < weeklyBars.length; i++) {
    if (
      weeklyBars[i].close > weeklyBars[i].open &&
      weeklyBars[i].close > bearClose
    ) {
      occurrence += 1;
      if (occurrence >= 2) return { detected: true };
    }
  }
  return { detected: false };
}

/* ============================================================
 * 周线聚合（5 根日线 → 1 根周线，按周五切分）
 * ============================================================ */

/**
 * 把日线聚合成周线（按周五切分）。导出供测试和外部调用。
 */
export function aggregateWeeklyToDate(dailyBars: Bar[]): Bar[] {
  if (dailyBars.length === 0) return [];

  const weekly: Bar[] = [];
  let bucket: Bar[] = [];

  for (const bar of dailyBars) {
    const d = new Date(bar.date);
    const day = d.getUTCDay(); // 0=Sun, 5=Fri
    bucket.push(bar);
    if (day === 5) {
      weekly.push(mergeBucket(bucket));
      bucket = [];
    }
  }
  if (bucket.length > 0) weekly.push(mergeBucket(bucket));
  return weekly;
}

function mergeBucket(bucket: Bar[]): Bar {
  const last = bucket.at(-1);
  if (!last) throw new Error("mergeBucket: empty bucket");
  return {
    date: last.date,
    open: bucket[0].open,
    high: Math.max(...bucket.map((b) => b.high)),
    low: Math.min(...bucket.map((b) => b.low)),
    close: last.close,
  };
}