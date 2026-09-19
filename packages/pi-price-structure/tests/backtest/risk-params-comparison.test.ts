/**
 * 风控参数对比测试
 *
 * 对比：默认放宽（5~5000） vs 严格（10~2000） vs 极宽（1~10000）
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchViaCsv } from "../../src/adapters/akshare-bridge.js";
import { runBacktest } from "../../src/domain/backtest/engine.js";
import { DEFAULT_COST_MODEL, type BacktestResult } from "../../src/domain/types.js";

const DATA_DIR = join(import.meta.dir, "..", "..", "data", "multi-symbol");

interface RiskPreset {
  name: string;
  minLoss: number;
  maxLoss: number;
}

const PRESETS: RiskPreset[] = [
  { name: "放宽(5~5000)", minLoss: 5, maxLoss: 5000 },
  { name: "严格(10~2000)", minLoss: 10, maxLoss: 2000 },
  { name: "极宽(1~10000)", minLoss: 1, maxLoss: 10000 },
];

const FIXTURES = [
  { name: "铁矿", csv: "I0_daily.csv", mult: 100 },
  { name: "棉花", csv: "CF0_daily.csv", mult: 5 },
  { name: "沪金", csv: "AU0_daily.csv", mult: 1000 },
  { name: "豆粕", csv: "M0_daily.csv", mult: 10 },
  { name: "螺纹", csv: "RB0_daily.csv", mult: 10 },
];

describe("风控参数对比（不同风控区间对策略表现的影响）", () => {
  for (const preset of PRESETS) {
    it(`风控: ${preset.name}`, async () => {
      const results: Array<{ name: string; backtest: BacktestResult }> = [];

      for (const f of FIXTURES) {
        const csvPath = join(DATA_DIR, f.csv);
        try {
          readFileSync(csvPath);
        } catch {
          continue;
        }
        const data = await fetchViaCsv(csvPath);
        const bt = runBacktest({
          symbol: f.name,
          weeklyBars: data.weekly,
          dailyBars: data.daily,
          contractMultiplier: f.mult,
          cost: DEFAULT_COST_MODEL,
          riskOptions: { minLoss: preset.minLoss, maxLoss: preset.maxLoss },
        });
        results.push({ name: f.name, backtest: bt });
      }

      const totalTrades = results.reduce((s, r) => s + r.backtest.totalTrades, 0);
      const totalWins = results.reduce((s, r) => s + r.backtest.wins, 0);
      const totalLosses = results.reduce((s, r) => s + r.backtest.losses, 0);
      const totalNetPnl = results.reduce((s, r) => s + r.backtest.totalNetPnl, 0);
      const totalMaxDD = results.reduce((s, r) => s + r.backtest.maxDrawdown, 0);
      const winRate = totalTrades > 0 ? totalWins / totalTrades : 0;

      console.log(`\n=== 风控: ${preset.name} (${preset.minLoss}~${preset.maxLoss}) ===`);
      console.log(
        `${"品种".padEnd(6)} ${"交易".padStart(4)} ${"胜".padStart(3)} ${"负".padStart(3)} ${"胜率".padStart(6)} ${"净盈亏".padStart(11)} ${"最大回撤".padStart(11)}`,
      );
      for (const r of results) {
        const b = r.backtest;
        const wr = b.totalTrades > 0 ? (b.wins / b.totalTrades * 100).toFixed(1) + "%" : "-";
        console.log(
          `${r.name.padEnd(6)} ${String(b.totalTrades).padStart(4)} ${String(b.wins).padStart(3)} ${String(b.losses).padStart(3)} ${wr.padStart(6)} ${b.totalNetPnl.toFixed(2).padStart(11)} ${b.maxDrawdown.toFixed(2).padStart(11)}`,
        );
      }
      console.log(
        `${"合计".padEnd(6)} ${String(totalTrades).padStart(4)} ${String(totalWins).padStart(3)} ${String(totalLosses).padStart(3)} ${(winRate * 100).toFixed(1).padStart(5)}% ${totalNetPnl.toFixed(2).padStart(11)} ${totalMaxDD.toFixed(2).padStart(11)}`,
      );

      expect(results.length).toBeGreaterThan(0);
    });
  }
});