/**
 * 入场信号聚合。
 *
 * 把周线判方向 + 日线找拐点 + 止损止盈 + 风控校验
 * 串成完整的入场决策。
 */
import type { Bar, EntrySignal } from "../types.js";
import { detectPullbackPivot } from "../structures/pullback-pivot.js";
import { detectBouncePivot } from "../structures/bounce-pivot.js";
import { calcLongTakeProfit, calcShortTakeProfit } from "./take-profit.js";
import { calcLongStopLoss, calcShortStopLoss } from "./stop-loss.js";

export interface EntryContext {
  direction: "long" | "short";
  weeklyBars: Bar[];
  dailyBars: Bar[];
  contractMultiplier: number;
}

export function generateEntrySignal(ctx: EntryContext): EntrySignal {
  const asOf = ctx.dailyBars.length - 1;
  if (asOf < 0) {
    return emptySignal(ctx.direction);
  }

  if (ctx.direction === "long") {
    const pivot = detectPullbackPivot(ctx.dailyBars, asOf);
    if (
      !pivot.detected ||
      pivot.pivotIdx === undefined ||
      pivot.stopLoss === undefined ||
      pivot.newLowCloseIdx === undefined
    ) {
      return emptySignal("long");
    }
    const entryPrice = ctx.dailyBars[pivot.pivotIdx].close;
    const stopLoss = calcLongStopLoss(pivot.stopLoss);
    const takeProfit = calcLongTakeProfit(
      ctx.dailyBars,
      pivot.pivotIdx,
      pivot.newLowCloseIdx,
      asOf,
    );
    if (takeProfit === null) return emptySignal("long");

    const estimatedLoss = (entryPrice - stopLoss) * ctx.contractMultiplier;
    return {
      detected: true,
      direction: "long",
      pivotIndex: pivot.pivotIdx,
      pivotDate: ctx.dailyBars[pivot.pivotIdx].date,
      entryPrice,
      stopLoss,
      takeProfit,
      estimatedLoss,
    };
  }

  // short
  const pivot = detectBouncePivot(ctx.dailyBars, asOf);
  if (
    !pivot.detected ||
    pivot.pivotIdx === undefined ||
    pivot.stopLoss === undefined ||
    pivot.newHighCloseIdx === undefined
  ) {
    return emptySignal("short");
  }
  const entryPrice = ctx.dailyBars[pivot.pivotIdx].close;
  const stopLoss = calcShortStopLoss(pivot.stopLoss);
  const takeProfit = calcShortTakeProfit(
    ctx.dailyBars,
    pivot.pivotIdx,
    pivot.newHighCloseIdx,
    asOf,
  );
  if (takeProfit === null) return emptySignal("short");

  const estimatedLoss = (stopLoss - entryPrice) * ctx.contractMultiplier;
  return {
    detected: true,
    direction: "short",
    pivotIndex: pivot.pivotIdx,
    pivotDate: ctx.dailyBars[pivot.pivotIdx].date,
    entryPrice,
    stopLoss,
    takeProfit,
    estimatedLoss,
  };
}

function emptySignal(direction: "long" | "short"): EntrySignal {
  return {
    detected: false,
    direction,
    pivotIndex: null,
    pivotDate: null,
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    estimatedLoss: null,
  };
}