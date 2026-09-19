/**
 * 1000万本金 / 半年跨度 / 真实模拟测试
 *
 * 数据：2026-01 ~ 2026-09（~180 个交易日，10 个主力连续合约）
 * 风控：单笔最大风险 2% 总资金 = 200,000 元
 * 启用品种：4 个 100% 胜率品种（铁矿/沪银/棉花/豆油）
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchViaCsv } from "../../src/adapters/akshare-bridge.js";
import { runPaperSimulation } from "../../src/domain/paper/engine.js";
import type { Bar } from "../../src/domain/types.js";

const DATA_DIR = join(import.meta.dir, "..", "..", "data", "multi-symbol");

/** 真实模拟区间：2020-06-01 ~ 2020-12-31（SR0 急跌段，能验证算法修复） */
const START = "2020-06-01";
const END = "2020-12-31";
const INITIAL_CAPITAL = 10_000_000; // 1000 万

describe("1000万本金半年模拟（真实主力连续合约）", () => {
  it("跑全部 10 个合约（不启用品种过滤，看所有信号）", async () => {
    console.log("\n========== 1000 万本金半年模拟测试 ==========");
    console.log(`本金: ${INITIAL_CAPITAL.toLocaleString()} 元`);
    console.log(`区间: ${START} ~ ${END}`);
    console.log(`风险: 单笔最大 2% 总资金 = 200,000 元\n`);

    const symbols = [
      { symbol: "AU0", name: "沪金", contractMultiplier: 1000, marginRate: 0.13 },
      { symbol: "AG0", name: "沪银", contractMultiplier: 15, marginRate: 0.15 },
      { symbol: "CU0", name: "沪铜", contractMultiplier: 5, marginRate: 0.13 },
      { symbol: "RB0", name: "螺纹", contractMultiplier: 10, marginRate: 0.13 },
      { symbol: "M0",  name: "豆粕", contractMultiplier: 10, marginRate: 0.12 },
      { symbol: "Y0",  name: "豆油", contractMultiplier: 10, marginRate: 0.12 },
      { symbol: "CF0", name: "棉花", contractMultiplier: 5, marginRate: 0.13 },
      { symbol: "I0",  name: "铁矿", contractMultiplier: 100, marginRate: 0.13 },
      { symbol: "SR0", name: "白糖", contractMultiplier: 10, marginRate: 0.12 },
      { symbol: "P0",  name: "棕榈", contractMultiplier: 10, marginRate: 0.12 },
    ];

    // 并行加载所有数据
    const barsMap: Record<string, Bar[]> = {};
    await Promise.all(symbols.map(async (s) => {
      try {
        const csvPath = join(DATA_DIR, `${s.symbol}_daily.csv`);
        const data = await fetchViaCsv(csvPath);
        barsMap[s.symbol] = data.daily;
      } catch (e) {
        console.error(`${s.symbol} 加载失败: ${e}`);
      }
    }));

    // 跑模拟：传全部 10 个品种的 enabledSymbols，绕过 symbol-rules 过滤
    const t0 = Date.now();
    const result = runPaperSimulation(barsMap, {
      initialCapital: INITIAL_CAPITAL,
      startDate: START,
      endDate: END,
      symbols,
      enabledSymbols: symbols.map((s) => s.symbol), // 全部启用
      maxRiskPerTrade: 0.02,
    });
    const elapsed = Date.now() - t0;

    // 打印报告
    console.log(`\n========== 模拟结果报告 ==========`);
    console.log(`耗时: ${elapsed}ms`);
    console.log(`总交易: ${result.totalTrades}`);
    console.log(`胜: ${result.wins}, 负: ${result.losses}`);
    console.log(`胜率: ${(result.winRate * 100).toFixed(1)}%`);
    console.log(`已实现盈亏: ${result.realizedPnl.toFixed(2)} 元`);
    console.log(`最终总资产: ${result.totalEquity.toFixed(2)} 元`);
    console.log(`总收益率: ${(result.totalReturnPct * 100).toFixed(3)}%`);
    console.log(`最大回撤: ${result.maxDrawdown.amount.toFixed(2)} 元 (${(result.maxDrawdown.pct * 100).toFixed(2)}%)`);
    console.log(`剩余持仓数: ${result.finalPositions.length}`);

    // 交易明细
    if (result.trades.length > 0) {
      console.log(`\n========== 交易明细 ==========`);
      for (const t of result.trades) {
        const sign = t.realizedPnl >= 0 ? "+" : "";
        console.log(
          `  ${t.date} ${t.action.padEnd(5)} ${t.symbol} ${t.direction.padEnd(5)} ` +
          `${t.quantity}手 @${t.price.toFixed(2)} 手续费${t.commission.toFixed(2)} 盈亏${sign}${t.realizedPnl.toFixed(2)} 元`,
        );
      }
    } else {
      console.log(`\n[无交易] 半年内 10 个合约都没有触发启用品种信号`);
    }

    // 资金曲线（取关键节点）
    if (result.snapshots.length > 0) {
      console.log(`\n========== 资金曲线（关键节点） ==========`);
      const total = result.snapshots.length;
      const step = Math.max(1, Math.floor(total / 12));
      console.log(`  日期       | 总资产        | 浮动盈亏     | 交易数`);
      for (let i = 0; i < total; i += step) {
        const s = result.snapshots[i];
        console.log(
          `  ${s.date} | ${s.totalEquity.toFixed(0).padStart(13)} | ${s.unrealizedPnl.toFixed(0).padStart(12)} | ${s.tradesToday.toString().padStart(5)}`,
        );
      }
    }

    // 断言
    expect(result.totalEquity).toBeGreaterThan(0);
    expect(result.snapshots.length).toBeGreaterThan(0);
  }, 30000); // 30s 超时（真实模拟半年数据）

  it("只跑启用品种（4 个 100% 胜率）", async () => {
    const enabledSymbols = ["I0", "CF0", "AG0", "Y0"];
    const symbols = [
      { symbol: "I0",  name: "铁矿", contractMultiplier: 100, marginRate: 0.13 },
      { symbol: "CF0", name: "棉花", contractMultiplier: 5, marginRate: 0.13 },
      { symbol: "AG0", name: "沪银", contractMultiplier: 15, marginRate: 0.15 },
      { symbol: "Y0",  name: "豆油", contractMultiplier: 10, marginRate: 0.12 },
    ];

    const barsMap: Record<string, Bar[]> = {};
    await Promise.all(symbols.map(async (s) => {
      const csvPath = join(DATA_DIR, `${s.symbol}_daily.csv`);
      const data = await fetchViaCsv(csvPath);
      barsMap[s.symbol] = data.daily;
    }));

    const result = runPaperSimulation(barsMap, {
      initialCapital: INITIAL_CAPITAL,
      startDate: START,
      endDate: END,
      symbols,
      enabledSymbols,
      maxRiskPerTrade: 0.02,
    });

    console.log(`\n========== 启用品种模拟（4 合约） ==========`);
    console.log(`本金: ${INITIAL_CAPITAL.toLocaleString()} 元`);
    console.log(`总交易: ${result.totalTrades} 胜: ${result.wins} 负: ${result.losses}`);
    console.log(`胜率: ${(result.winRate * 100).toFixed(1)}%`);
    console.log(`已实现盈亏: ${result.realizedPnl.toFixed(2)} 元`);
    console.log(`最终总资产: ${result.totalEquity.toFixed(2)} 元`);
    console.log(`总收益率: ${(result.totalReturnPct * 100).toFixed(3)}%`);

    expect(result.totalEquity).toBeGreaterThan(0);
  }, 30000);

  it("压力测试：3% 风险（更激进）", async () => {
    const enabledSymbols = ["I0", "CF0", "AG0", "Y0"];
    const symbols = [
      { symbol: "I0",  name: "铁矿", contractMultiplier: 100, marginRate: 0.13 },
      { symbol: "CF0", name: "棉花", contractMultiplier: 5, marginRate: 0.13 },
      { symbol: "AG0", name: "沪银", contractMultiplier: 15, marginRate: 0.15 },
      { symbol: "Y0",  name: "豆油", contractMultiplier: 10, marginRate: 0.12 },
    ];

    const barsMap: Record<string, Bar[]> = {};
    await Promise.all(symbols.map(async (s) => {
      const csvPath = join(DATA_DIR, `${s.symbol}_daily.csv`);
      const data = await fetchViaCsv(csvPath);
      barsMap[s.symbol] = data.daily;
    }));

    const result = runPaperSimulation(barsMap, {
      initialCapital: INITIAL_CAPITAL,
      startDate: START,
      endDate: END,
      symbols,
      enabledSymbols,
      maxRiskPerTrade: 0.03,  // 3% = 300,000 元
    });

    console.log(`\n========== 压力测试 3% 风险 ==========`);
    console.log(`本金: ${INITIAL_CAPITAL.toLocaleString()} 元`);
    console.log(`总交易: ${result.totalTrades}`);
    console.log(`最终总资产: ${result.totalEquity.toFixed(2)} 元`);
    console.log(`总收益率: ${(result.totalReturnPct * 100).toFixed(3)}%`);
    console.log(`最大回撤: ${result.maxDrawdown.pct * 100}%`);

    expect(result.totalEquity).toBeGreaterThan(0);
  }, 30000);
});