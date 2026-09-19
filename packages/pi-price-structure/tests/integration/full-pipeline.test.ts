/**
 * 集成测试：用真实数据（沪金/鸡蛋/生猪主力合约 2026 Q1-Q3）
 * 跑端到端的价格结构交易系统。
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchViaCsv } from "../../src/adapters/akshare-bridge.js";
import { runBacktest } from "../../src/domain/backtest/engine.js";
import { formatBacktestResult } from "../../src/domain/backtest/metrics.js";
import { detectBullishStructure } from "../../src/domain/structures/bullish.js";
import { detectBearishStructure } from "../../src/domain/structures/bearish.js";
import { detectTopStructure } from "../../src/domain/structures/top.js";
import { detectBottomStructure } from "../../src/domain/structures/bottom.js";
import { DEFAULT_COST_MODEL, type Bar } from "../../src/domain/types.js";

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

function fileExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

function analyzeDirection(weeklyBars: Bar[]) {
  const bull = detectBullishStructure(weeklyBars);
  const bear = detectBearishStructure(weeklyBars);
  const top = detectTopStructure(weeklyBars);
  const bottom = detectBottomStructure(weeklyBars);
  let direction: "long" | "short" | "range" = "range";
  let label = "震荡";
  if (bull.detected && !top.detected) {
    direction = "long";
    label = "看多";
  } else if (bear.detected && !bottom.detected) {
    direction = "short";
    label = "看空";
  }
  return { direction, label, bull, bear, top, bottom };
}

for (const f of FIXTURES) {
  const path = join(DATA_DIR, f.csv);
  const exists = fileExists(path);
  if (!exists) continue;

  describe(`全链路集成：${f.symbol}`, () => {
    it("加载 CSV + 合成周线", async () => {
      const result = await fetchViaCsv(path);
      expect(result.daily.length).toBeGreaterThan(0);
      expect(result.weekly.length).toBeGreaterThan(0);
      console.log(
        `  ${f.symbol}: ${result.daily.length} 根日线, ${result.weekly.length} 根周线`,
      );
    });

    it("周线判方向", async () => {
      const result = await fetchViaCsv(path);
      const dir = analyzeDirection(result.weekly);
      expect(["long", "short", "range"]).toContain(dir.direction);
      console.log(`  ${f.symbol} 当前方向: ${dir.label} (${dir.direction})`);
    });

    it("回测能跑通", async () => {
      const result = await fetchViaCsv(path);
      const backtest = runBacktest({
        symbol: f.symbol,
        weeklyBars: result.weekly,
        dailyBars: result.daily,
        contractMultiplier: f.contractMultiplier,
        cost: DEFAULT_COST_MODEL,
      });
      console.log(`\n${formatBacktestResult(backtest)}`);
      console.log(
        `  ${f.symbol} 胜率: ${(backtest.winRate * 100).toFixed(2)}%  净盈亏: ${backtest.totalNetPnl.toFixed(2)} 元`,
      );
      expect(backtest.totalTrades).toBeGreaterThanOrEqual(0);
    });
  });
}