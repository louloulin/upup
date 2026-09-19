/**
 * 回调拐点结构（做多进场信号）。
 *
 * 规则：
 *   价格形成多头结构创新高 K 线起，收盘价创新低阴线后，
 *   形成创新低 K 线起首根收盘价高于该阴线最高价的阳线，
 *   且尚未创多头结构新高。
 *
 * 返回：{ pivotIdx, stopLoss } —— 给入场信号使用
 */
import type { Bar } from "../types.js";
import { bearish, bullish, isLowInRange } from "../types.js";
import { detectBullishStructure } from "./bullish.js";

export interface PullbackPivot {
  detected: boolean;
  pivotIdx?: number;
  stopLoss?: number;
  newLowCloseIdx?: number;
  /** 多头结构创新高 K 线索引 */
  bullishHighIdx?: number;
}

export function detectPullbackPivot(
  bars: Bar[],
  asOfIndex: number = bars.length - 1,
): PullbackPivot {
  const bull = detectBullishStructure(bars, asOfIndex);
  if (!bull.detected || bull.index === undefined) return { detected: false };

  const bullishHighIdx = bull.index;
  const bullishHighClose = bars[bullishHighIdx].close;

  // 第一步：从多头结构创新高 K 线起，找收盘价创新低的阴线
  let newLowCloseIdx = -1;
  for (let i = bullishHighIdx + 1; i <= asOfIndex; i++) {
    if (!bearish(bars[i])) continue;
    if (bars[i].close >= bullishHighClose) continue;
    // 校验：在 [bullishHighIdx+1, i) 范围内，bars[i].close 是否最低
    let isMin = true;
    for (let j = bullishHighIdx + 1; j < i; j++) {
      if (bars[j].close < bars[i].close) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      newLowCloseIdx = i;
      break;
    }
  }
  if (newLowCloseIdx === -1) return { detected: false };

  const newLowCloseBar = bars[newLowCloseIdx];
  const newLowCloseHigh = newLowCloseBar.high;

  // 第二步：从该阴线后找创新低 K 线（low 创新低）
  let newLowBarIdx = -1;
  for (let i = newLowCloseIdx + 1; i <= asOfIndex; i++) {
    // 在 [newLowCloseIdx, i) 范围内，bars[i].low 是否最低
    let isMin = true;
    for (let j = newLowCloseIdx; j < i; j++) {
      if (bars[j].low < bars[i].low) {
        isMin = false;
        break;
      }
    }
    if (isMin && bars[i].low < newLowCloseBar.low) {
      newLowBarIdx = i;
      break;
    }
  }
  if (newLowBarIdx === -1) {
    // 如果没有更低 low，则用阴线本身的 low 即可
    newLowBarIdx = newLowCloseIdx;
  }

  // 第三步：从 newLowBarIdx 起找首根收盘价高于阴线最高价的阳线
  for (let i = newLowBarIdx + 1; i <= asOfIndex; i++) {
    if (!bullish(bars[i])) continue;
    if (bars[i].close <= newLowCloseHigh) continue;

    // 第四步：校验尚未创多头结构新高（最高价未超过 bullishHighIdx 的 high）
    const bullishHighPrice = bars[bullishHighIdx].high;
    let exceeded = false;
    for (let j = bullishHighIdx + 1; j < i; j++) {
      if (bars[j].high > bullishHighPrice) {
        exceeded = true;
        break;
      }
    }
    if (exceeded) continue;

    return {
      detected: true,
      pivotIdx: i,
      stopLoss: newLowCloseBar.low,
      newLowCloseIdx,
      bullishHighIdx,
    };
  }

  return { detected: false };
}