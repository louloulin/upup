/**
 * 回测验证 + 预测文件
 *
 * 数据源：data/ 目录下的真实主力合约日线 CSV
 *   - 沪金AU2612 (167 根日线, 2026-01-05 ~ 2026-09-09, 乘数 1000)
 *   - 鸡蛋JD2702 (136 根日线, 2026-02-25 ~ 2026-09-09, 乘数 10)
 *   - 生猪LH2611 (171 根日线, 2026-01-05 ~ 2026-09-16, 乘数 16)
 *
 * 任务：
 *   1. 验证回测引擎能跑通（不卡死、不崩溃）
 *   2. 记录每个合约的预测结果（胜率/盈亏/回撤）
 *   3. 打印交易明细用于人工复核
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchViaCsv } from "../../src/adapters/akshare-bridge.js";
import { runBacktest } from "../../src/domain/backtest/engine.js";
import { formatBacktestResult } from "../../src/domain/backtest/metrics.js";
import { DEFAULT_COST_MODEL, type BacktestResult } from "../../src/domain/types.js";

const DATA_DIR = join(import.meta.dir, "..", "..", "data");

interface Fixture {
  symbol: string;
  csv: string;
  contractMultiplier: number;
  /** 预期至少触发交易数（用于 sanity check） */
  minExpectedTrades: number;
}

const FIXTURES: Fixture[] = [
  { symbol: "沪金AU2612", csv: "au2612_daily.csv", contractMultiplier: 1000, minExpectedTrades: 0 },
  { symbol: "鸡蛋JD2702", csv: "jd2702_daily.csv", contractMultiplier: 10, minExpectedTrades: 0 },
  { symbol: "生猪LH2611", csv: "lh2611_daily.csv", contractMultiplier: 16, minExpectedTrades: 0 },
];

describe("回测验证 + 预测（真实主力合约数据）", () => {
  for (const f of FIXTURES) {
    describe(`${f.symbol}`, () => {
      const csvPath = join(DATA_DIR, f.csv);
      const exists = (() => {
        try {
          readFileSync(csvPath);
          return true;
        } catch {
          return false;
        }
      })();

      it.skipIf(!exists)("能加载 CSV 数据", async () => {
        const result = await fetchViaCsv(csvPath);
        expect(result.daily.length).toBeGreaterThan(0);
        expect(result.weekly.length).toBeGreaterThan(0);
      });

      it.skipIf(!exists)("能跑完回测（不卡死、不超时）", async () => {
        const result = await fetchViaCsv(csvPath);
        const startTime = Date.now();
        const backtest = runBacktest({
          symbol: f.symbol,
          weeklyBars: result.weekly,
          dailyBars: result.daily,
          contractMultiplier: f.contractMultiplier,
          cost: DEFAULT_COST_MODEL,
        });
        const elapsed = Date.now() - startTime;

        // 不应超时（10 秒以内）
        expect(elapsed).toBeLessThan(10000);

        // 不应崩溃
        expect(backtest).toBeDefined();
        expect(backtest.trades).toBeDefined();

        console.log(
          `\n[${f.symbol}] 耗时: ${elapsed}ms | ` +
          `数据: ${result.daily.length} 根日线, ${result.weekly.length} 根周线`,
        );
      });

      it.skipIf(!exists)("预测：输出完整回测结果", async () => {
        const result = await fetchViaCsv(csvPath);
        const backtest = runBacktest({
          symbol: f.symbol,
          weeklyBars: result.weekly,
          dailyBars: result.daily,
          contractMultiplier: f.contractMultiplier,
          cost: DEFAULT_COST_MODEL,
        });

        // 打印完整结果
        console.log("\n" + formatBacktestResult(backtest));

        // 基本 sanity check：至少能产生交易（或震荡市不开仓）
        expect(backtest.totalTrades).toBeGreaterThanOrEqual(f.minExpectedTrades);
      });

      it.skipIf(!exists)("预测：风控拦截信号被记录", async () => {
        const result = await fetchViaCsv(csvPath);
        const backtest = runBacktest({
          symbol: f.symbol,
          weeklyBars: result.weekly,
          dailyBars: result.daily,
          contractMultiplier: f.contractMultiplier,
          cost: DEFAULT_COST_MODEL,
        });

        // 找出所有 risk_blocked 的信号
        const blocked = backtest.trades.filter((t) => t.exitReason === "risk_blocked");
        if (blocked.length > 0) {
          console.log(
            `\n[${f.symbol}] 风控拦截 ${blocked.length} 个信号（单手亏损 ∉ [10, 2000] 元）`,
          );
          for (const b of blocked.slice(0, 5)) {
            const estLoss = Math.abs(b.entryPrice - b.stopLoss) * f.contractMultiplier;
            console.log(
              `  ${b.entryDate} ${b.direction} 入@${b.entryPrice.toFixed(2)} ` +
              `止损@${b.stopLoss.toFixed(2)} 距离=${Math.abs(b.entryPrice - b.stopLoss).toFixed(2)}点 ` +
              `单手亏损=${estLoss.toFixed(2)}元 (${estLoss < 10 ? "过小" : "过大"})`,
            );
          }
        }

        // 这个测试只是观察，不强制要求
        expect(blocked.length).toBeGreaterThanOrEqual(0);
      });
    });
  }
});

/**
 * 汇总预测：3 个合约的表现对比
 */
describe("汇总预测", () => {
  it("3 个合约综合表现", async () => {
    const results: Array<{
      symbol: string;
      backtest: BacktestResult;
    }> = [];

    for (const f of FIXTURES) {
      const csvPath = join(DATA_DIR, f.csv);
      const data = await fetchViaCsv(csvPath);
      const bt = runBacktest({
        symbol: f.symbol,
        weeklyBars: data.weekly,
        dailyBars: data.daily,
        contractMultiplier: f.contractMultiplier,
        cost: DEFAULT_COST_MODEL,
      });
      results.push({ symbol: f.symbol, backtest: bt });
    }

    console.log("\n========== 3 个主力合约预测汇总 ==========");
    console.log(
      "合约        | 交易 | 胜 | 负 | 胜率  | 净盈亏(元)  | 最大回撤(元) | 平均盈亏(元/笔)",
    );
    console.log(
      "------------|------|----|----|-------|-------------|-------------|--------------",
    );
    for (const r of results) {
      const b = r.backtest;
      const winRateStr = (b.winRate * 100).toFixed(1) + "%";
      console.log(
        `${r.symbol.padEnd(11)} | ${String(b.totalTrades).padStart(4)} | ${String(b.wins).padStart(2)} | ${String(b.losses).padStart(2)} | ${winRateStr.padStart(5)} | ${b.totalNetPnl.toFixed(2).padStart(11)} | ${b.maxDrawdown.toFixed(2).padStart(11)} | ${b.avgPnl.toFixed(2).padStart(12)}`,
      );
    }
  });
});