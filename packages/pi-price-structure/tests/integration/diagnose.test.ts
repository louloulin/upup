/**
 * 诊断脚本：详细打出每笔触发的信号、入场价、止损、亏损额。
 * 看风控为什么把所有信号拦下。
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchViaCsv } from "../../src/adapters/akshare-bridge.js";
import { runBacktest } from "../../src/domain/backtest/engine.js";
import { formatBacktestResult } from "../../src/domain/backtest/metrics.js";
import { detectBullishStructure } from "../../src/domain/structures/bullish.js";
import { detectBearishStructure } from "../../src/domain/structures/bearish.js";
import { detectPullbackPivot } from "../../src/domain/structures/pullback-pivot.js";
import { detectBouncePivot } from "../../src/domain/structures/bounce-pivot.js";
import { generateEntrySignal } from "../../src/domain/signal/entry.js";
import { DEFAULT_COST_MODEL } from "../../src/domain/types.js";

const DATA_DIR = join(import.meta.dir, "..", "..", "data");

interface Fixture {
  symbol: string;
  csv: string;
  contractMultiplier: number;
}

const FIXTURES: Fixture[] = [
  { symbol: "沪金AU2612", csv: "au2612_daily.csv", contractMultiplier: 1000 },
  { symbol: "鸡蛋JD2702", csv: "jd2702_daily.csv", contractMultiplier: 10 },
  { symbol: "生猪LH2611", csv: "lh2611_daily.csv", contractMultiplier: 16 },
];

describe("诊断：详细打出每个信号", () => {
  for (const f of FIXTURES) {
    it(`${f.symbol} 信号详情`, async () => {
      const path = join(DATA_DIR, f.csv);
      const result = await fetchViaCsv(path);
      const { weekly, daily } = result;

      console.log(`\n========== ${f.symbol} (${f.contractMultiplier} 元/点) ==========`);
      console.log(`日线: ${daily.length} 根 (${daily[0].date} ~ ${daily[daily.length - 1].date})`);
      console.log(`周线: ${weekly.length} 根`);

      // 1. 周线判方向
      const bull = detectBullishStructure(weekly);
      const bear = detectBearishStructure(weekly);
      console.log(`\n多头结构: ${bull.detected ? `✓ (方法${bull.method}, idx=${bull.index})` : "✗"}`);
      console.log(`空头结构: ${bear.detected ? `✓ (方法${bear.method}, idx=${bear.index})` : "✗"}`);

      // 2. 逐日扫描入场信号
      const signals: Array<{
        date: string;
        direction: "long" | "short";
        entryPrice: number;
        stopLoss: number;
        estimatedLoss: number;
      }> = [];

      for (let i = 60; i < daily.length; i++) {
        const subWeekly = weekly.filter((w) => w.date <= daily[i].date);
        const subDaily = daily.slice(0, i + 1);

        const subBull = detectBullishStructure(subWeekly);
        const subBear = detectBearishStructure(subWeekly);
        let direction: "long" | "short" | "range" = "range";
        if (subBull.detected && !subBear.detected) direction = "long";
        else if (subBear.detected && !subBull.detected) direction = "short";
        if (direction === "range") continue;

        const signal = generateEntrySignal({
          direction,
          weeklyBars: subWeekly,
          dailyBars: subDaily,
          contractMultiplier: f.contractMultiplier,
        });

        if (signal.detected && signal.entryPrice !== null && signal.stopLoss !== null) {
          signals.push({
            date: signal.pivotDate ?? daily[i].date,
            direction: signal.direction,
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            estimatedLoss: signal.estimatedLoss ?? 0,
          });
        }
      }

      console.log(`\n检测到 ${signals.length} 个入场信号:`);
      for (const s of signals) {
        const dist = Math.abs(s.entryPrice - s.stopLoss);
        const lossPerHand = dist * f.contractMultiplier;
        const pass = lossPerHand >= 5 && lossPerHand <= 5000 ? "✓" : "✗被拦";
        console.log(
          `  ${s.date} ${s.direction === "long" ? "多" : "空"} 入@${s.entryPrice.toFixed(2)} 止损@${s.stopLoss.toFixed(2)} 距离=${dist.toFixed(2)}点 亏损=${lossPerHand.toFixed(2)}元 ${pass}`,
        );
      }
    });
  }
});