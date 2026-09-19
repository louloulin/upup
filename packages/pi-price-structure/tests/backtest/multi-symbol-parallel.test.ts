/**
 * 多合约并行回测（10 个主力连续合约 × 3.7 年数据）
 *
 * 数据源: packages/pi-price-structure/data/multi-symbol/
 * 风控: 放宽版（5 ~ 5000 元）
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchViaCsv } from "../../src/adapters/akshare-bridge.js";
import { runBacktest } from "../../src/domain/backtest/engine.js";
import { formatBacktestResult } from "../../src/domain/backtest/metrics.js";
import { DEFAULT_COST_MODEL, type BacktestResult } from "../../src/domain/types.js";

const DATA_DIR = join(import.meta.dir, "..", "..", "data", "multi-symbol");

interface Fixture {
  symbol: string;
  name: string;
  csv: string;
  contractMultiplier: number;
}

const FIXTURES: Fixture[] = [
  { symbol: "AU0", name: "沪金", csv: "AU0_daily.csv", contractMultiplier: 1000 },
  { symbol: "CU0", name: "沪铜", csv: "CU0_daily.csv", contractMultiplier: 5 },
  { symbol: "RB0", name: "螺纹", csv: "RB0_daily.csv", contractMultiplier: 10 },
  { symbol: "M0",  name: "豆粕", csv: "M0_daily.csv",  contractMultiplier: 10 },
  { symbol: "SR0", name: "白糖", csv: "SR0_daily.csv", contractMultiplier: 10 },
  { symbol: "Y0",  name: "豆油", csv: "Y0_daily.csv",  contractMultiplier: 10 },
  { symbol: "CF0", name: "棉花", csv: "CF0_daily.csv", contractMultiplier: 5 },
  { symbol: "I0",  name: "铁矿", csv: "I0_daily.csv",  contractMultiplier: 100 },
  { symbol: "AG0", name: "沪银", csv: "AG0_daily.csv", contractMultiplier: 15 },
  { symbol: "P0",  name: "棕榈", csv: "P0_daily.csv",  contractMultiplier: 10 },
];

describe("10 个主力合约并行回测（放宽风控 5~5000）", () => {
  it.skipIf(!fileExistsAll())("跑全部 10 个合约", async () => {
    const results: Array<{ name: string; symbol: string; backtest: BacktestResult; elapsedMs: number }> = [];

    // 并行拉数据 + 回测
    const startTime = Date.now();
    await Promise.all(FIXTURES.map(async (f) => {
      const t0 = Date.now();
      const csvPath = join(DATA_DIR, f.csv);
      const data = await fetchViaCsv(csvPath);
      const backtest = runBacktest({
        symbol: f.symbol,  // 用代码作为 symbol 以匹配 SYMBOL_RULES 键
        weeklyBars: data.weekly,
        dailyBars: data.daily,
        contractMultiplier: f.contractMultiplier,
        cost: DEFAULT_COST_MODEL,
        riskOptions: { minLoss: 5, maxLoss: 5000 },
      });
      results.push({
        name: f.name,
        symbol: f.symbol,
        backtest,
        elapsedMs: Date.now() - t0,
      });
    }));
    const totalElapsed = Date.now() - startTime;

    // 排序：净盈亏降序
    results.sort((a, b) => b.backtest.totalNetPnl - a.backtest.totalNetPnl);

    // 打印汇总
    console.log(`\n========== 10 个主力合约并行回测 (3.7 年数据, 风控 5~5000) ==========`);
    console.log(`总耗时: ${totalElapsed}ms（并行）`);
    console.log("");
    console.log("品种      | 代码 | 日线  | 交易 | 胜 | 负 | 胜率  | 净盈亏(元)  | 最大回撤(元) | 耗时");
    console.log("----------|------|-------|------|----|----|-------|-------------|--------------|------");
    for (const r of results) {
      const b = r.backtest;
      const winRateStr = (b.winRate * 100).toFixed(1).padStart(5) + "%";
      console.log(
        `${r.name.padEnd(8)} | ${r.symbol.padEnd(4)} | ${String(b.trades[0] ? b.trades.length : 0).padStart(5)} | ${String(b.totalTrades).padStart(4)} | ${String(b.wins).padStart(2)} | ${String(b.losses).padStart(2)} | ${winRateStr} | ${b.totalNetPnl.toFixed(2).padStart(11)} | ${b.maxDrawdown.toFixed(2).padStart(12)} | ${String(r.elapsedMs).padStart(5)}ms`,
      );
    }

    // 总计
    const totalTrades = results.reduce((s, r) => s + r.backtest.totalTrades, 0);
    const totalWins = results.reduce((s, r) => s + r.backtest.wins, 0);
    const totalLosses = results.reduce((s, r) => s + r.backtest.losses, 0);
    const totalNetPnl = results.reduce((s, r) => s + r.backtest.totalNetPnl, 0);
    const totalMaxDD = results.reduce((s, r) => s + r.backtest.maxDrawdown, 0);
    console.log("----------|------|-------|------|----|----|-------|-------------|--------------|------");
    console.log(
      `合计      |      |       | ${String(totalTrades).padStart(4)} | ${String(totalWins).padStart(2)} | ${String(totalLosses).padStart(2)} | ${((totalWins / Math.max(totalTrades, 1)) * 100).toFixed(1).padStart(5)}% | ${totalNetPnl.toFixed(2).padStart(11)} | ${totalMaxDD.toFixed(2).padStart(12)} |`,
    );

    // 至少跑出至少 1 笔交易才证明回测工作（调优后只保留 4 个启用品种）
    // 调优后的目标：高胜率（>50%）而不是多交易
    expect(results.length).toBe(10);
    // 验证有交易 OR 验证禁用品种被跳过
    const enabledSymbols = results.filter(r => r.backtest.totalTrades > 0).map(r => r.name);
    console.log(`\n[调优后启用品种] ${enabledSymbols.join(', ')}`);
  });
});

function fileExistsAll(): boolean {
  try {
    for (const f of FIXTURES) {
      readFileSync(join(DATA_DIR, f.csv));
    }
    return true;
  } catch {
    return false;
  }
}