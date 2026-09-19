/**
 * 反弹拐点结构（做空进场信号）。
 *
 * 规则：
 *   价格形成空头结构创新低 K 线起，收盘价创新高阳线后，
 *   形成创新高 K 线起首根收盘价低于该阳线最低价的阴线，
 *   且尚未创空头结构新低。
 */
import type { Bar } from "../types.js";
import { bearish, bullish } from "../types.js";
import { detectBearishStructure } from "./bearish.js";

export interface BouncePivot {
  detected: boolean;
  pivotIdx?: number;
  stopLoss?: number;
  newHighCloseIdx?: number;
  /** 空头结构创新低 K 线索引 */
  bearishLowIdx?: number;
}

export function detectBouncePivot(
  bars: Bar[],
  asOfIndex: number = bars.length - 1,
): BouncePivot {
  const bear = detectBearishStructure(bars, asOfIndex);
  if (!bear.detected || bear.index === undefined) return { detected: false };

  const bearishLowIdx = bear.index;
  const bearishLowClose = bars[bearishLowIdx].close;

  // 第一步：找收盘价创新高的阳线
  let newHighCloseIdx = -1;
  for (let i = bearishLowIdx + 1; i <= asOfIndex; i++) {
    if (!bullish(bars[i])) continue;
    if (bars[i].close <= bearishLowClose) continue;
    let isMax = true;
    for (let j = bearishLowIdx + 1; j < i; j++) {
      if (bars[j].close > bars[i].close) {
        isMax = false;
        break;
      }
    }
    if (isMax) {
      newHighCloseIdx = i;
      break;
    }
  }
  if (newHighCloseIdx === -1) return { detected: false };

  const newHighCloseBar = bars[newHighCloseIdx];
  const newHighCloseLow = newHighCloseBar.low;

  // 第二步：找创新高 K 线（high 创新高）
  let newHighBarIdx = -1;
  for (let i = newHighCloseIdx + 1; i <= asOfIndex; i++) {
    let isMax = true;
    for (let j = newHighCloseIdx; j < i; j++) {
      if (bars[j].high > bars[i].high) {
        isMax = false;
        break;
      }
    }
    if (isMax && bars[i].high > newHighCloseBar.high) {
      newHighBarIdx = i;
      break;
    }
  }
  if (newHighBarIdx === -1) {
    newHighBarIdx = newHighCloseIdx;
  }

  // 第三步：找首根收盘价低于阳线最低价的阴线
  for (let i = newHighBarIdx + 1; i <= asOfIndex; i++) {
    if (!bearish(bars[i])) continue;
    if (bars[i].close >= newHighCloseLow) continue;

    // 第四步：校验尚未创空头结构新低
    const bearishLowPrice = bars[bearishLowIdx].low;
    let exceeded = false;
    for (let j = bearishLowIdx + 1; j < i; j++) {
      if (bars[j].low < bearishLowPrice) {
        exceeded = true;
        break;
      }
    }
    if (exceeded) continue;

    return {
      detected: true,
      pivotIdx: i,
      stopLoss: newHighCloseBar.high,
      newHighCloseIdx,
      bearishLowIdx,
    };
  }

  return { detected: false };
}