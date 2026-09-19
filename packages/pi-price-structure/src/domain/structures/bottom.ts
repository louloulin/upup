/**
 * 见底结构。
 *
 * 规则：空头结构出现 + 价格创新低后，
 *       第 2 次及以上形成收盘价高于该创新低阴线的阳线。
 */
import type { Bar, StructureEvent } from "../types.js";
import { bullish } from "../types.js";
import { detectBearishStructure } from "./bearish.js";

export function detectBottomStructure(
  bars: Bar[],
  asOfIndex: number = bars.length - 1,
): {
  detected: boolean;
  index?: number;
  bearishLowIdx?: number;
  occurrence?: number;
} {
  const bear = detectBearishStructure(bars, asOfIndex);
  if (!bear.detected || bear.index === undefined) return { detected: false };

  const bearishLowIdx = bear.index;
  const bearishLowClose = bars[bearishLowIdx].close;

  let occurrence = 0;
  for (let i = bearishLowIdx + 1; i <= asOfIndex; i++) {
    if (!bullish(bars[i])) continue;
    if (bars[i].close <= bearishLowClose) continue;
    occurrence += 1;
    if (occurrence >= 2) {
      return { detected: true, index: i, bearishLowIdx, occurrence };
    }
  }
  return { detected: false };
}

export function toBottomEvent(
  idx: number,
  date: string,
  occurrence: number,
): StructureEvent {
  return {
    type: "bottom_structure",
    index: idx,
    date,
    method: occurrence === 2 ? "A" : "B",
  };
}