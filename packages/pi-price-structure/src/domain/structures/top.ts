/**
 * 见顶结构。
 *
 * 规则：多头结构出现 + 价格创新高后，
 *       第 2 次及以上形成收盘价低于该创新高阳线的阴线。
 */
import type { Bar, StructureEvent } from "../types.js";
import { bearish } from "../types.js";
import { detectBullishStructure } from "./bullish.js";

export function detectTopStructure(
  bars: Bar[],
  asOfIndex: number = bars.length - 1,
): {
  detected: boolean;
  index?: number;
  bullishHighIdx?: number;
  occurrence?: number;
} {
  const bull = detectBullishStructure(bars, asOfIndex);
  if (!bull.detected || bull.index === undefined) return { detected: false };

  const bullishHighIdx = bull.index;
  const bullishHighClose = bars[bullishHighIdx].close;

  let occurrence = 0;
  for (let i = bullishHighIdx + 1; i <= asOfIndex; i++) {
    if (!bearish(bars[i])) continue;
    if (bars[i].close >= bullishHighClose) continue;
    occurrence += 1;
    if (occurrence >= 2) {
      return { detected: true, index: i, bullishHighIdx, occurrence };
    }
  }
  return { detected: false };
}

export function toTopEvent(
  idx: number,
  date: string,
  occurrence: number,
): StructureEvent {
  return {
    type: "top_structure",
    index: idx,
    date,
    method: occurrence === 2 ? "A" : "B",
  };
}