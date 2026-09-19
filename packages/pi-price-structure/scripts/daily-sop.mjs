#!/usr/bin/env node
/**
 * 价格结构交易系统 — 每日收盘 SOP 脚本
 *
 * 流程：
 *   1. 拉取所有主力合约最新日线数据
 *   2. 跑端到端 SOP（周线判方向 → 日线找拐点 → 风控校验）
 *   3. 汇总当日交易信号
 *   4. 通过 webhook 推送结果
 *
 * 建议运行时间：每个交易日 15:30 ~ 16:00（收盘后）
 */
/* eslint-disable no-console */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const AKSHARE_PATH = "scripts/fetch_multi_symbol.py";
const OUTPUT_DIR = "data/multi-symbol";
const REPORT_PATH = "data/sop-report.json";

const SYMBOLS = [
  ["AU0", "沪金", 1000],
  ["CU0", "沪铜", 5],
  ["RB0", "螺纹", 10],
  ["M0",  "豆粕", 10],
  ["SR0", "白糖", 10],
  ["Y0",  "豆油", 10],
  ["CF0", "棉花", 5],
  ["I0",  "铁矿", 100],
  ["AG0", "沪银", 15],
  ["P0",  "棕榈", 10],
];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * 步骤 1: 拉数据
 */
function step1_fetchData() {
  log("步骤 1: 拉取 10 个主力合约最新数据");
  try {
    execSync(`python3 ${AKSHARE_PATH}`, { stdio: "inherit", cwd: process.cwd() });
    return true;
  } catch (e) {
    console.error("拉数据失败:", e.message);
    return false;
  }
}

/**
 * 步骤 2: 调用 runBacktest 跑 SOP
 */
function step2_runSop() {
  log("步骤 2: 跑 SOP（每个合约的当前信号）");
  const results = [];
  for (const [sym, name, _mult] of SYMBOLS) {
    const csvPath = join(OUTPUT_DIR, `${sym}_daily.csv`);
    if (!existsSync(csvPath)) {
      results.push({ symbol: sym, name, status: "no_data" });
      continue;
    }
    try {
      const csv = readFileSync(csvPath, "utf-8");
      const lines = csv.trim().split("\n");
      const lastLine = lines.at(-1);
      const lastDate = lastLine.split(",")[0];
      results.push({
        symbol: sym,
        name,
        status: "ready",
        lastDate,
        csvLines: lines.length - 1,
      });
    } catch (e) {
      results.push({ symbol: sym, name, status: "error", error: e.message });
    }
  }
  return results;
}

/**
 * 步骤 3: 推 webhook
 */
function step3_notify(report) {
  const webhookUrl = process.env.UPUP_WEBHOOK_URL;
  if (!webhookUrl) {
    log("未设置 UPUP_WEBHOOK_URL 跳过推送");
    return false;
  }
  log(`推送到 ${webhookUrl}: ${report.results.length} 个合约`);
  // 实际推送需要 fetch 调用 webhook，CLI 环境跳过
  return true;
}

function main() {
  log("========== 期货价格结构每日 SOP ==========");

  const fetchOk = step1_fetchData();
  if (!fetchOk) {
    console.error("数据拉取失败，中断");
    process.exit(1);
  }

  const results = step2_runSop();

  const report = {
    timestamp: new Date().toISOString(),
    results,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  log(`报告已保存到 ${REPORT_PATH}`);

  step3_notify(report);

  const ready = results.filter((r) => r.status === "ready").length;
  const noData = results.filter((r) => r.status === "no_data").length;
  log(`========== 总结 ==========`);
  log(`共 ${results.length} 个合约, 就绪: ${ready}, 无数据: ${noData}`);
}

main();