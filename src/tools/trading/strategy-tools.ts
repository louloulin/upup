/**
 * Strategy Tools (LangChain wrapper)
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: Algo Tools Registration
 *
 * Three tools that expose the algo subsystem to the LLM agent:
 * - `strategy_run_paper` — executes a ParentOrder against the sandbox broker
 *   using a chosen algo (twap | vwap | pov | is). Runs to completion and
 *   returns a final AlgoReport.
 * - `strategy_list` — lists the 4 built-in algos with parameters, descriptions,
 *   and the last N paper-trade results.
 * - `strategy_backtest` — runs a deterministic stub backtest over a date range.
 *   Returns shape compatible with a future real backtest engine so callers
 *   can be built today.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { SandboxBroker } from './sandbox-engine.js';
import { AlgoRunner } from './algos/runner.js';
import type { AlgoKind, ParentOrder, TradingSessionWindow } from './algos/types.js';

// Paper trading should not be gated by A-share trading hours. Provide a
// 24/7 session window so children can be scheduled any time of day.
const PAPER_SESSION: TradingSessionWindow = {
  timezone: 'UTC',
  sessions: [{ start: '00:00', end: '23:59' }],
};

const sandboxCache = new Map<string, SandboxBroker>();
async function getSandbox(sessionId: string): Promise<SandboxBroker> {
  let sb = sandboxCache.get(sessionId);
  if (!sb) {
    sb = new SandboxBroker({ stateFile: `~/.upup/sandbox-${sessionId}.json` });
    await sb.loadState();
    sandboxCache.set(sessionId, sb);
  }
  return sb;
}

interface PaperTradeRecord {
  id: string;
  algo: AlgoKind;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  startedAtMs: number;
  durationMs: number;
  filledQuantity: number;
  averageFillPrice: number;
  slippageBps: number;
  state: 'completed' | 'cancelled' | 'failed';
}
const paperTradeHistory: PaperTradeRecord[] = [];

const runPaperSchema = z.object({
  sessionId: z.string().default('default'),
  algo: z.enum(['twap', 'vwap', 'pov', 'is']),
  symbol: z.string(),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().int().positive(),
  durationMinutes: z.number().int().positive().max(480),
  referencePrice: z.number().positive().optional(),
  childOrderType: z.enum(['market', 'limit']).default('market'),
  childLimitPrice: z.number().positive().optional(),
  pollMs: z.number().int().positive().default(2000),
});

const listSchema = z.object({
  limit: z.number().int().positive().max(20).default(5),
});

const backtestSchema = z.object({
  algo: z.enum(['twap', 'vwap', 'pov', 'is']),
  symbol: z.string(),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  participationRate: z.number().positive().max(1).optional(),
});

const ALGO_METADATA: Array<{
  kind: AlgoKind;
  name: string;
  description: string;
  parameters: string[];
  bestFor: string;
}> = [
  {
    kind: 'twap',
    name: 'TWAP (Time-Weighted Average Price)',
    description: 'Splits a parent order into N equal child orders at uniform time intervals.',
    parameters: ['durationMinutes', 'minChildQuantity', 'maxChildQuantity'],
    bestFor: 'Simple, predictable schedule. Minimizes timing risk without volume assumptions.',
  },
  {
    kind: 'vwap',
    name: 'VWAP (Volume-Weighted Average Price)',
    description: 'Weights child order sizes by the historical intraday volume curve (default U-shape).',
    parameters: ['durationMinutes', 'volumeProfile (optional, length 240)'],
    bestFor: 'Matching natural liquidity — less market impact by trading more when volume is heavier.',
  },
  {
    kind: 'pov',
    name: 'POV (Percent-of-Volume)',
    description: 'Each tick submits a child sized at participationRate% of recent minute volume.',
    parameters: ['participationRate (default 0.10)', 'tickMs (default 60_000)', 'quantityResolver (optional)'],
    bestFor: 'Be a known fraction of market volume. Adapts to real-time liquidity.',
  },
  {
    kind: 'is',
    name: 'IS (Implementation Shortfall)',
    description: 'Adjusts participation based on price move vs arrival: faster when adverse, slower when favorable.',
    parameters: ['referencePrice (required)', 'baseIntervalMs (default 60_000)'],
    bestFor: 'Urgency-driven execution. Minimize opportunity cost on adverse moves.',
  },
];

export const createStrategyRunPaperTool = () =>
  new DynamicStructuredTool({
    name: 'strategy_run_paper',
    description: `Execute a parent order against the sandbox broker using a chosen execution algorithm. The algo splits the parent into child orders scheduled over the configured duration, then submits each to the sandbox. Returns a final report with filled quantity, average fill price, slippage in bps, and per-child detail.

Common usage:
- "用 TWAP 30 分钟分批买入 600519 10000 股" → {algo:'twap', symbol:'600519.SH', side:'buy', quantity:10000, durationMinutes:30}
- "用 VWAP 在 1 小时内卖出 000001 5000 股,参考价 12.50" → {algo:'vwap', symbol:'000001.SZ', side:'sell', quantity:5000, durationMinutes:60, referencePrice:12.50}
- "POV 5% 参与率买入 600519 5000 股" → {algo:'pov', symbol:'600519.SH', side:'buy', quantity:5000, durationMinutes:30, referencePrice:1740}

Supports 4 algos: twap, vwap, pov, is. Each runs synchronously to completion (use durationMinutes <= 60 to keep wall time short).`,
    schema: runPaperSchema,
    func: async (params) => {
      const startMs = Date.now();
      const sessionId = params.sessionId;
      const sb = await getSandbox(sessionId);
      const parent: ParentOrder = {
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity,
        duration: { startMs, endMs: startMs + params.durationMinutes * 60_000 },
        referencePrice: params.referencePrice,
        childOrderType: params.childOrderType,
        childLimitPrice: params.childLimitPrice,
        session: PAPER_SESSION,
        params: { algo: params.algo },
      };
      const runner = new AlgoRunner(parent, {
        broker: sb,
        now: () => Date.now(),
        sleep: (ms) => new Promise<void>(r => setTimeout(r, ms)),
        onEvent: () => {},
      });
      const wallTimeout = setTimeout(() => runner.cancel(), params.durationMinutes * 60_000 * 2);
      try {
        const report = await runner.runUntilDone(params.pollMs);
        const record: PaperTradeRecord = {
          id: report.parentId,
          algo: params.algo,
          symbol: params.symbol,
          side: params.side,
          quantity: params.quantity,
          startedAtMs: report.startedAtMs,
          durationMs: report.updatedAtMs - report.startedAtMs,
          filledQuantity: report.filledQuantity,
          averageFillPrice: report.averageFillPrice,
          slippageBps: report.slippageBps,
          state: report.state === 'completed' ? 'completed'
               : report.state === 'cancelled' ? 'cancelled' : 'failed',
        };
        paperTradeHistory.unshift(record);
        if (paperTradeHistory.length > 200) paperTradeHistory.pop();
        return formatToolResult({
          algo: params.algo,
          state: report.state,
          filledQuantity: report.filledQuantity,
          totalQuantity: report.totalQuantity,
          averageFillPrice: report.averageFillPrice,
          slippageBps: report.slippageBps,
          totalCommission: report.totalCommission,
          childCount: report.childCount,
          filledChildCount: report.filledChildCount,
          notes: report.notes,
          startedAt: report.startedAtMs,
          completedAt: report.updatedAtMs,
        });
      } finally {
        clearTimeout(wallTimeout);
      }
    },
  });

export const createStrategyListTool = () =>
  new DynamicStructuredTool({
    name: 'strategy_list',
    description: 'List the 4 built-in execution algorithms (twap, vwap, pov, is) with their parameters, descriptions, best-for guidance, and the most recent paper-trade results. Use this when the user asks "有哪些执行算法" or before choosing an algo.',
    schema: listSchema,
    func: async (params) => {
      const limit = params.limit;
      const algos = ALGO_METADATA.map(meta => ({
        ...meta,
        recentPaperTrades: paperTradeHistory.filter(r => r.algo === meta.kind).slice(0, limit),
      }));
      return formatToolResult(algos);
    },
  });

export const createStrategyBacktestTool = () =>
  new DynamicStructuredTool({
    name: 'strategy_backtest',
    description: `Run a historical backtest of an execution algorithm over a date range. Returns mock metrics in this iteration; a future iteration will wire it to the v1 backtest engine with real historical data.

Common usage:
- "回测 TWAP 在 2026-05 表现" → {algo:'twap', symbol:'600519.SH', side:'buy', quantity:10000, startDate:'2026-05-01', endDate:'2026-05-31'}

This iteration returns a deterministic stub result (_stub: true) matching the shape real backtest output will have.`,
    schema: backtestSchema,
    func: async (params) => {
      const days = Math.max(1, Math.ceil(
        (Date.parse(params.endDate) - Date.parse(params.startDate)) / 86_400_000,
      ));
      const algoHash = params.algo.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const symbolHash = params.symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const baseSlippageBps = 5 + (algoHash % 8);
      const participationAdjustment = params.algo === 'pov' && params.participationRate
        ? Math.round(params.participationRate * 5) : 0;
      const slippageBps = baseSlippageBps + participationAdjustment;
      const fillRate = params.algo === 'twap' ? 0.99
        : params.algo === 'vwap' ? 0.98
        : params.algo === 'pov' ? 0.97 : 0.96;
      const filledQuantity = Math.floor(params.quantity * fillRate);
      const referencePrice = 100 + (symbolHash % 200) / 10;
      const avgFillPrice = params.side === 'buy'
        ? referencePrice * (1 + slippageBps / 10_000)
        : referencePrice * (1 - slippageBps / 10_000);
      return formatToolResult({
        _stub: true,
        algo: params.algo,
        symbol: params.symbol,
        side: params.side,
        requestedQuantity: params.quantity,
        filledQuantity,
        fillRate,
        averageFillPrice: Number(avgFillPrice.toFixed(4)),
        referencePrice: Number(referencePrice.toFixed(2)),
        slippageBps,
        tradingDays: days,
        notes: ['Deterministic stub result. Real backtest wiring is planned for a follow-up iteration.'],
      });
    },
  });

export const strategyTools = [
  createStrategyRunPaperTool,
  createStrategyListTool,
  createStrategyBacktestTool,
] as const;
