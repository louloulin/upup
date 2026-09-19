/**
 * Pi Extension 注册。
 *
 * 把 6 个工具暴露给 Pi agent。
 */
import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { fetchViaAkShare, fetchViaCsv } from "../adapters/akshare-bridge.js";
import { detectBullishStructure } from "../domain/structures/bullish.js";
import { detectBearishStructure } from "../domain/structures/bearish.js";
import { detectTopStructure } from "../domain/structures/top.js";
import { detectBottomStructure } from "../domain/structures/bottom.js";
import { generateEntrySignal } from "../domain/signal/entry.js";
import { checkRisk } from "../domain/risk/position-sizing.js";
import { runBacktest } from "../domain/backtest/engine.js";
import { formatBacktestResult } from "../domain/backtest/metrics.js";
import { DEFAULT_COST_MODEL, type Bar } from "../domain/types.js";

function ok<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: "text", text }], details };
}

function err(text: string): AgentToolResult<undefined> {
  return { content: [{ type: "text", text }], details: undefined, terminate: true };
}

export default function register(api: ExtensionAPI): void {
  api.registerTool({
    name: "price_structure_fetch_data",
    label: "拉取期货合约日/周线 OHLC 数据（AkShare 或本地 CSV）",
    description:
      "获取期货合约日线和周线 OHLC 数据。通过 AkShare（Python 桥接新浪期货接口）或本地 CSV。",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "合约代码，如 AU2612、CU2610" },
        startDate: { type: "string", description: "起始日期 YYYY-MM-DD" },
        endDate: { type: "string", description: "结束日期 YYYY-MM-DD" },
        source: { type: "string", enum: ["akshare", "csv"], description: "数据源" },
        csvPath: { type: "string", description: "本地 CSV 路径（source=csv 时必填）" },
      },
      required: ["symbol", "startDate", "endDate"],
    },
    async execute(_id, params) {
      const args = params as {
        symbol: string;
        startDate: string;
        endDate: string;
        source?: "akshare" | "csv";
        csvPath?: string;
      };
      if (args.source === "csv") {
        if (!args.csvPath) return err("source=csv 时必须提供 csvPath");
        const data = await fetchViaCsv(args.csvPath);
        return ok(
          `已获取 ${data.daily.length} 根日线 / ${data.weekly.length} 根周线`,
          data,
        );
      }
      const data = await fetchViaAkShare({
        symbol: args.symbol,
        startDate: args.startDate,
        endDate: args.endDate,
      });
      return ok(
        `已获取 ${data.daily.length} 根日线 / ${data.weekly.length} 根周线`,
        data,
      );
    },
  });

  api.registerTool({
    name: "price_structure_analyze_direction",
    label: "周线判方向（多头/空头/震荡）",
    description:
      "对周线 OHLC 判定当前方向（看多 / 看空 / 震荡），按价格结构交易系统规则识别 6 种结构。",
    parameters: {
      type: "object",
      properties: {
        weeklyBars: {
          type: "array",
          items: {
            type: "object",
            required: ["date", "open", "high", "low", "close"],
            properties: {
              date: { type: "string" },
              open: { type: "number" },
              high: { type: "number" },
              low: { type: "number" },
              close: { type: "number" },
            },
          },
          description: "周线 OHLC 数组",
        },
      },
      required: ["weeklyBars"],
    },
    async execute(_id, params) {
      const args = params as { weeklyBars: Bar[] };
      const r = analyzeDirection(args.weeklyBars);
      return ok(`周线方向: ${r.label}`, r);
    },
  });

  api.registerTool({
    name: "price_structure_entry_signal",
    label: "日线入场信号（回调拐点/反弹拐点）",
    description:
      "日线级别入场信号识别（回调拐点 / 反弹拐点），输出入场价、止损、止盈、预估亏损。",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["long", "short"], description: "方向" },
        weeklyBars: { type: "array" },
        dailyBars: { type: "array" },
        contractMultiplier: { type: "number" },
      },
      required: ["direction", "weeklyBars", "dailyBars", "contractMultiplier"],
    },
    async execute(_id, params) {
      // SAFETY: Pi's generic tool schema types params loosely; runtime validates against
      // `parameters` JSON Schema. We narrow to the concrete shape after the schema check.
      const args = params as unknown as {
        direction: "long" | "short";
        weeklyBars: Bar[];
        dailyBars: Bar[];
        contractMultiplier: number;
      };
      const r = generateEntrySignal(args);
      const text = r.detected
        ? `${r.direction === "long" ? "做多" : "做空"}信号：入场@${r.entryPrice} 止损@${r.stopLoss} 止盈@${r.takeProfit} 预估亏损${r.estimatedLoss?.toFixed(2)}元`
        : `未检测到入场信号`;
      return ok(text, r);
    },
  });

  api.registerTool({
    name: "price_structure_risk_check",
    label: "风控校验（单手亏损必须在 5~5000 元）",
    description: "风控校验：单手亏损必须在 [5, 5000] 元区间内，否则不开仓。",
    parameters: {
      type: "object",
      properties: {
        entryPrice: { type: "number" },
        stopLoss: { type: "number" },
        contractMultiplier: { type: "number" },
      },
      required: ["entryPrice", "stopLoss", "contractMultiplier"],
    },
    async execute(_id, params) {
      const args = params as {
        entryPrice: number;
        stopLoss: number;
        contractMultiplier: number;
      };
      const r = checkRisk(args.entryPrice, args.stopLoss, args.contractMultiplier);
      const text = r.pass
        ? `风控通过：可开 ${r.quantity} 手，预估亏损 ${r.estimatedLoss.toFixed(2)} 元`
        : `风控不通过：${r.reason}`;
      return ok(text, r);
    },
  });

  api.registerTool({
    name: "price_structure_backtest",
    label: "价格结构系统完整回测",
    description:
      "价格结构交易系统完整回测（含佣金、滑点、止盈止损），输出胜率、总盈亏、最大回撤。",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        weeklyBars: { type: "array" },
        dailyBars: { type: "array" },
        contractMultiplier: { type: "number" },
        commissionBps: { type: "number" },
        slippageBps: { type: "number" },
      },
      required: ["symbol", "weeklyBars", "dailyBars", "contractMultiplier"],
    },
    async execute(_id, params) {
      const args = params as {
        symbol: string;
        weeklyBars: Bar[];
        dailyBars: Bar[];
        contractMultiplier: number;
        commissionBps?: number;
        slippageBps?: number;
      };
      const result = runBacktest({
        symbol: args.symbol,
        weeklyBars: args.weeklyBars,
        dailyBars: args.dailyBars,
        contractMultiplier: args.contractMultiplier,
        cost: {
          ...DEFAULT_COST_MODEL,
          commissionBps: args.commissionBps ?? DEFAULT_COST_MODEL.commissionBps,
          slippageBps: args.slippageBps ?? DEFAULT_COST_MODEL.slippageBps,
        },
      });
      const summary = formatBacktestResult(result);
      return ok(summary, {
        summary,
        metrics: {
          symbol: result.symbol,
          totalTrades: result.totalTrades,
          wins: result.wins,
          losses: result.losses,
          winRate: result.winRate,
          totalNetPnl: result.totalNetPnl,
          totalCommission: result.totalCommission,
          maxDrawdown: result.maxDrawdown,
          maxDrawdownPct: result.maxDrawdownPct,
        },
        trades: result.trades,
      });
    },
  });

  api.registerTool({
    name: "price_structure_run_sop",
    label: "端到端 SOP（判方向 → 找拐点 → 风控）",
    description:
      "端到端 SOP：周线判方向 → 日线找拐点 → 风控校验，输出完整交易决策（不开真实订单）。",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        weeklyBars: { type: "array" },
        dailyBars: { type: "array" },
        contractMultiplier: { type: "number" },
      },
      required: ["symbol", "weeklyBars", "dailyBars", "contractMultiplier"],
    },
    async execute(_id, params) {
      const args = params as {
        symbol: string;
        weeklyBars: Bar[];
        dailyBars: Bar[];
        contractMultiplier: number;
      };
      const r = runSop(args);
      const decisionText = "decision" in r ? r.decision : "处理完成";
      const reasonText = "reason" in r ? ` 原因：${r.reason}` : "";
      return ok(`${decisionText}${reasonText}`, r);
    },
  });
}

/* ============================================================
 * 工具实现 helper
 * ============================================================ */

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

  return { direction, label, bullish: bull, bearish: bear, top, bottom };
}

function runSop(args: {
  symbol: string;
  weeklyBars: Bar[];
  dailyBars: Bar[];
  contractMultiplier: number;
}) {
  const { weeklyBars, dailyBars, contractMultiplier } = args;
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

  if (direction === "range") {
    return {
      step: "direction",
      direction,
      label,
      decision: "不开仓（震荡市）",
      reason: "周线见顶 / 见底 / 无结构",
    };
  }

  const entry = generateEntrySignal({
    direction,
    weeklyBars,
    dailyBars,
    contractMultiplier,
  });

  if (!entry.detected || entry.entryPrice === null || entry.stopLoss === null) {
    return {
      step: "entry",
      direction,
      label,
      decision: "不开仓（无拐点）",
      reason: direction === "long" ? "未找到回调拐点" : "未找到反弹拐点",
    };
  }

  const risk = checkRisk(entry.entryPrice, entry.stopLoss, contractMultiplier);

  if (!risk.pass) {
    return {
      step: "risk",
      direction,
      label,
      entry,
      decision: "不开仓（风控不通过）",
      reason: risk.reason,
    };
  }

  return {
    step: "complete",
    direction,
    label,
    entry,
    risk,
    decision: "可开仓",
    contractMultiplier,
    expectedLoss: risk.estimatedLoss,
    expectedProfit:
      direction === "long"
        ? (entry.takeProfit! - entry.entryPrice) * contractMultiplier
        : (entry.entryPrice - entry.takeProfit!) * contractMultiplier,
  };
}