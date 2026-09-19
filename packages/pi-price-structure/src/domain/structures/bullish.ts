/**
 * 多头结构识别。
 *
 * 规则：
 *   A. 价格形成创新低阳线或创新低阴线后的阳线后，形成连续三根收盘价
 *      高于该阳线收盘价的K线，其中第三根为收盘价创新高的阳线。
 *   B. 价格形成创新低K线起九根K线后收盘价创新高的阳线。
 *
 * 实现策略：从最新的创新低 K 线倒序向前搜索（最多 9 根窗口），
 *          先用方法 A，再用方法 B。
 */
import type { Bar, StructureEvent } from "../types.js";
import { bullish, isCloseHighInRange } from "../types.js";

export function detectBullishStructure(
  bars: Bar[],
  asOfIndex: number = bars.length - 1,
): { detected: boolean; index?: number; originIndex?: number; method?: "A" | "B" } {
  if (asOfIndex < 0 || bars.length === 0) return { detected: false };

  for (let i = asOfIndex; i >= 0; i--) {
    if (!isCloseLowCandle(bars, i)) continue;

    const aResult = checkBullishMethodA(bars, i, asOfIndex);
    if (aResult.detected) {
      return {
        detected: true,
        index: aResult.index,
        originIndex: i,
        method: "A",
      };
    }

    const bResult = checkBullishMethodB(bars, i, asOfIndex);
    if (bResult.detected) {
      return {
        detected: true,
        index: bResult.index,
        originIndex: i,
        method: "B",
      };
    }
  }

  return { detected: false };
}

/**
 * 创新低 K 线：收盘价是 [0, idx] 范围内的最低收盘价
 * (idx=0 也算创新低，因为它本身就是起点)
 */
function isCloseLowCandle(bars: Bar[], idx: number): boolean {
  if (idx < 0 || idx >= bars.length) return false;
  const c = bars[idx].close;
  for (let i = 0; i < idx; i++) {
    if (bars[i].close < c) return false;
  }
  return true;
}

/**
 * 方法 A：创新低 K 线 → 阳线 → 连续 3 根收盘价高于该阳线 → 第 3 根为创新高阳线
 */
function checkBullishMethodA(
  bars: Bar[],
  newLowIdx: number,
  asOfIndex: number,
): { detected: boolean; index?: number } {
  const baseClose = bars[newLowIdx].close;

  for (let i = newLowIdx + 1; i <= asOfIndex - 3; i++) {
    if (!bullish(bars[i])) continue;
    if (bars[i].close <= baseClose) continue;

    const c1 = bars[i + 1]?.close > bars[i].close;
    const c2 = bars[i + 2]?.close > bars[i].close;
    const c3 =
      bars[i + 3]?.close > bars[i].close &&
      isCloseHighInRange(bars, i + 3, 0, i + 3);

    if (c1 && c2 && c3) return { detected: true, index: i + 3 };
  }
  return { detected: false };
}

/**
 * 方法 B：创新低 K 线起 9 根内出现收盘价创新高的阳线
 */
function checkBullishMethodB(
  bars: Bar[],
  newLowIdx: number,
  asOfIndex: number,
): { detected: boolean; index?: number } {
  const windowEnd = Math.min(newLowIdx + 9, asOfIndex + 1);
  const maxCloseBefore = Math.max(
    ...bars.slice(0, newLowIdx + 1).map((b) => b.close),
  );

  for (let i = newLowIdx + 1; i < windowEnd; i++) {
    if (!bullish(bars[i])) continue;
    if (bars[i].close > maxCloseBefore) return { detected: true, index: i };
  }
  return { detected: false };
}

export function toBullishEvent(
  idx: number,
  date: string,
  originIdx: number,
  method: "A" | "B",
): StructureEvent {
  return { type: "bullish_structure", index: idx, date, method, originIndex: originIdx };
}