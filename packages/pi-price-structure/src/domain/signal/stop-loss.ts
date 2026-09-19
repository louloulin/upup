/**
 * 止损计算。
 *
 * 规则：
 *   多单：止损 = 回调拐点结构最低点（即 detectPullbackPivot 返回的 stopLoss）
 *   空单：止损 = 反弹拐点结构最高点（即 detectBouncePivot 返回的 stopLoss）
 *
 * 这是入场信号的组成部分。
 */
import type { Bar } from "../types.js";

export function calcLongStopLoss(pivotLow: number): number {
  return pivotLow;
}

export function calcShortStopLoss(pivotHigh: number): number {
  return pivotHigh;
}

/**
 * 校验：做多时，止损必须 < 入场价；做空时，止损必须 > 入场价
 */
export function isValidStopLoss(
  direction: "long" | "short",
  entryPrice: number,
  stopLoss: number,
): boolean {
  if (direction === "long") return stopLoss < entryPrice;
  return stopLoss > entryPrice;
}

/**
 * 计算止损距离（绝对值）
 */
export function stopLossDistance(entryPrice: number, stopLoss: number): number {
  return Math.abs(entryPrice - stopLoss);
}