/**
 * 止盈计算（重写版）。
 *
 * 规则严格按用户原始定义：
 *
 * 【做多止盈】
 *   序列：回调拐点结构 → 创新低 K 线 → 收盘价创新低阴线 → 收盘价创新高阳线
 *   取该**创新高阳线的最低价**（做多后续支撑位）
 *
 * 【做空止盈】
 *   序列：反弹拐点结构 → 创新高 K 线 → 收盘价创新高阳线 → 收盘价创新低阴线
 *   取该**创新低阴线的最高价**（做空后续压力位）
 *
 * 关键修复：所有"创新高/创新低"判定都基于**明确的 close 阈值**——
 *   做多的"创新高"必须 close > 上一个创新高的 close
 *   做空的"创新低"必须 close < 上一个创新低的 close
 *   否则宁可返回 null（不触发），不能返回错误方向的止盈
 *
 * 之前的 bug：
 *   - 创新高/创新低判定基于"在区间内是最大/最小"，但区间起点选错（用了 pivotIdx）
 *   - 导致选中的 K 线 close 可能 > 入场价，做空止盈价 > 入场价，违反规则
 *   - 修复：用 newHighCloseIdx/newLowCloseIdx 作为起点，不重算"区间内最大"
 */
import type { Bar } from "../types.js";

export function calcLongTakeProfit(
  bars: Bar[],
  pivotIdx: number,
  newLowCloseIdx: number,
  asOfIndex: number = bars.length - 1,
): number | null {
  // 第一步：从 newLowCloseIdx 之后、在入场之后的范围里找"创新低 K 线"
  const searchStart = Math.max(newLowCloseIdx + 1, pivotIdx + 1);
  let newLowBarIdx = -1;
  for (let i = searchStart; i <= asOfIndex; i++) {
    let isMin = true;
    for (let j = newLowCloseIdx; j < i; j++) {
      if (bars[j].low < bars[i].low) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      newLowBarIdx = i;
      break;
    }
  }
  if (newLowBarIdx === -1) return null;

  // 第二步：从 newLowBarIdx 之后找"收盘价创新低阴线"
  // 创新低：close 必须 < newLowBarIdx 的 close（即真正的更低价）
  let closeLowBearIdx = -1;
  const refClose = bars[newLowBarIdx].close;
  for (let i = newLowBarIdx + 1; i <= asOfIndex; i++) {
    // 严格阴线：close < open
    if (bars[i].close >= bars[i].open) continue;
    // 真正的创新低：close 必须 < 参考 close
    if (bars[i].close >= refClose) continue;
    let isMin = true;
    for (let j = newLowBarIdx + 1; j < i; j++) {
      if (bars[j].close < bars[i].close) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      closeLowBearIdx = i;
      break;
    }
  }
  if (closeLowBearIdx === -1) return null;

  // 第三步：从 closeLowBearIdx 之后找"收盘价创新高阳线"，取其最低价
  // 创新高：close 必须 > closeLowBearIdx 的 close
  const refCloseLow = bars[closeLowBearIdx].close;
  for (let i = closeLowBearIdx + 1; i <= asOfIndex; i++) {
    // 严格阳线：close > open
    if (bars[i].close <= bars[i].open) continue;
    // 真正的创新高：close > 参考 close
    if (bars[i].close <= refCloseLow) continue;
    let isMax = true;
    for (let j = closeLowBearIdx + 1; j < i; j++) {
      if (bars[j].close > bars[i].close) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      return bars[i].low;
    }
  }
  return null;
}

export function calcShortTakeProfit(
  bars: Bar[],
  pivotIdx: number,
  newHighCloseIdx: number,
  asOfIndex: number = bars.length - 1,
): number | null {
  // SAFETY: 限住在入场后寻找序列
  // 第一步：从 newHighCloseIdx 之后、在入场之后的范围里找"创新高 K 线"
  // 必须在 pivotIdx 之后才有效（入场后的价格走势）
  const searchStart = Math.max(newHighCloseIdx + 1, pivotIdx + 1);
  let newHighBarIdx = -1;
  for (let i = searchStart; i <= asOfIndex; i++) {
    let isMax = true;
    for (let j = newHighCloseIdx; j < i; j++) {
      if (bars[j].high > bars[i].high) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      newHighBarIdx = i;
      break;
    }
  }
  if (newHighBarIdx === -1) return null;

  // 第二步：从 newHighBarIdx 之后找"收盘价创新高阳线"
  // 创新高：close 必须 > newHighBarIdx 的 close
  let closeHighBullIdx = -1;
  const refClose = bars[newHighBarIdx].close;
  for (let i = newHighBarIdx + 1; i <= asOfIndex; i++) {
    // 严格阳线：close > open
    if (bars[i].close <= bars[i].open) continue;
    // 真正的创新高：close > 参考 close
    if (bars[i].close <= refClose) continue;
    let isMax = true;
    for (let j = newHighBarIdx + 1; j < i; j++) {
      if (bars[j].close > bars[i].close) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      closeHighBullIdx = i;
      break;
    }
  }
  if (closeHighBullIdx === -1) return null;

  // 第三步：从 closeHighBullIdx 之后找"收盘价创新低阴线"，取其最高价
  // 创新低：close 必须 < closeHighBullIdx 的 close
  const refCloseHigh = bars[closeHighBullIdx].close;
  for (let i = closeHighBullIdx + 1; i <= asOfIndex; i++) {
    // 严格阴线：close < open
    if (bars[i].close >= bars[i].open) continue;
    // 真正的创新低：close < 参考 close
    if (bars[i].close >= refCloseHigh) continue;
    let isMin = true;
    for (let j = closeHighBullIdx + 1; j < i; j++) {
      if (bars[j].close < bars[i].close) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      return bars[i].high;
    }
  }
  return null;
}

/**
 * 校验：做多时止盈必须 > 入场价；做空时止盈必须 < 入场价
 */
export function isValidTakeProfit(
  direction: "long" | "short",
  entryPrice: number,
  takeProfit: number,
): boolean {
  if (direction === "long") return takeProfit > entryPrice;
  return takeProfit < entryPrice;
}