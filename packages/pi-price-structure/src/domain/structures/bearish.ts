/**
 * 空头结构识别。
 *
 * 规则（与多头结构镜像）：
 *   A. 价格形成创新高阴线或创新高阳线后的阴线后，形成连续三根收盘价
 *      低于该阴线收盘价的K线，其中第三根为收盘价创新低的阴线。
 *   B. 价格形成创新高K线起九根K线后收盘价创新低的阴线。
 */
import type { Bar, StructureEvent } from "../types.js";
import { bearish, isCloseLowInRange } from "../types.js";

export function detectBearishStructure(
  bars: Bar[],
  asOfIndex: number = bars.length - 1,
): { detected: boolean; index?: number; originIndex?: number; method?: "A" | "B" } {
  if (asOfIndex < 0 || bars.length === 0) return { detected: false };

  for (let i = asOfIndex; i >= 0; i--) {
    if (!isCloseHighCandle(bars, i)) continue;

    const aResult = checkBearishMethodA(bars, i, asOfIndex);
    if (aResult.detected) {
      return {
        detected: true,
        index: aResult.index,
        originIndex: i,
        method: "A",
      };
    }

    const bResult = checkBearishMethodB(bars, i, asOfIndex);
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
 * 创新高 K 线：收盘价是 [0, idx] 范围内的最高收盘价
 * (idx=0 也算创新高，因为它本身就是起点)
 */
function isCloseHighCandle(bars: Bar[], idx: number): boolean {
  if (idx < 0 || idx >= bars.length) return false;
  const c = bars[idx].close;
  for (let i = 0; i < idx; i++) {
    if (bars[i].close > c) return false;
  }
  return true;
}

/**
 * 方法 A：创新高 K 线 → 阴线 → 连续 3 根收盘价低于该阴线 → 第 3 根为创新低阴线
 */
function checkBearishMethodA(
  bars: Bar[],
  newHighIdx: number,
  asOfIndex: number,
): { detected: boolean; index?: number } {
  const baseClose = bars[newHighIdx].close;

  for (let i = newHighIdx + 1; i <= asOfIndex - 3; i++) {
    if (!bearish(bars[i])) continue;
    if (bars[i].close >= baseClose) continue;

    const c1 = bars[i + 1]?.close < bars[i].close;
    const c2 = bars[i + 2]?.close < bars[i].close;
    const c3 =
      bars[i + 3]?.close < bars[i].close &&
      isCloseLowInRange(bars, i + 3, 0, i + 3);

    if (c1 && c2 && c3) return { detected: true, index: i + 3 };
  }
  return { detected: false };
}

/**
 * 方法 B：创新高 K 线起 9 根内出现收盘价创新低的阴线
 */
function checkBearishMethodB(
  bars: Bar[],
  newHighIdx: number,
  asOfIndex: number,
): { detected: boolean; index?: number } {
  const windowEnd = Math.min(newHighIdx + 9, asOfIndex + 1);
  const minCloseBefore = Math.min(
    ...bars.slice(0, newHighIdx + 1).map((b) => b.close),
  );

  for (let i = newHighIdx + 1; i < windowEnd; i++) {
    if (!bearish(bars[i])) continue;
    if (bars[i].close < minCloseBefore) return { detected: true, index: i };
  }
  return { detected: false };
}

export function toBearishEvent(
  idx: number,
  date: string,
  originIdx: number,
  method: "A" | "B",
): StructureEvent {
  return { type: "bearish_structure", index: idx, date, method, originIndex: originIdx };
}