/**
 * KAIROS tool registration — wires the proactive + position-monitor +
 * event-scanner subsystems into the unified tool registry.
 *
 * Tools:
 *  - kairos_recent_opportunities     (read — event-bus replay)
 *  - kairos_recent_position_alerts   (read — event-bus replay)
 *  - kairos_recent_scanner_events    (read — event-bus replay)
 *  - kairos_summary                  (read — counts + per-kind recents)
 *
 * KAIROS itself is driven by the cron runtime / a daemon process. The
 * tool layer is intentionally read-only: the LLM gets visibility into
 * what KAIROS has already produced without re-injecting scans. Production
 * code that needs to trigger a scan should call runCoordinator /
 * kairos_runtime directly — not through this surface.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      openspec/changes/top-tier-investment-assistant/specs/event-bus
 */

import type { RegisteredTool } from "./types.js";
import { computationMetadata } from "./types.js";
import { getDefaultBus, type BusEvent } from "@upup/agent-runtime/event-bus";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const KIND_TOPICS: Record<string, string[]> = {
  opportunity: ["kairos.opportunity.*"],
  "position-alert": ["kairos.position.alert"],
  scanner: ["kairos.scanner.*"],
  realtime: ["realtime.quote", "realtime.bar"],
};

function readBusHistory(topicPatterns: string[], limit: number): BusEvent[] {
  // bus.on with replay:true re-fires every matching historical event. We
  // use a one-shot capture handler that unsubscribes after replay.
  const bus = getDefaultBus();
  const captured: BusEvent[] = [];
  const unsubs: Array<() => void> = [];
  for (const pattern of topicPatterns) {
    const off = bus.on<unknown>(
      pattern,
      (e) => {
        captured.push(e);
      },
      { replay: true },
    );
    unsubs.push(off);
  }
  for (const off of unsubs) off();
  // bus.on with replay invokes handlers synchronously, so by now captured
  // is fully populated. Return the most recent N.
  return captured.slice(-limit);
}

export const KAIROS_DESCRIPTION = `
KAIROS — proactive + position-monitor + event-scanner visibility tools.

## What It Does
- Reads from the in-process event bus to surface what KAIROS subsystems have produced
- opportunity events (from proactive scanner): breakouts, valuation reratings, sentiment shifts, capital-flow anomalies
- position-alert events (from position monitor): stop-loss / take-profit / risk-budget breaches
- scanner events (from event scanner): price-anomaly, volume-spike, breaking-news, large-order, overnight-gap
- kairos_summary returns counts + per-kind recents in one call

## When to Use
- User asks "最近有什么机会?" → kairos_recent_opportunities
- User asks "我的持仓触发过什么告警?" → kairos_recent_position_alerts
- User wants a quick health snapshot → kairos_summary

## Notes
- These are read-only. To trigger a scan, run the kairos runtime / cron
  (not exposed through this surface).
- The event bus retains the last 1000 events by default; older events
  are dropped.
`;

export function createKairosRecentOpportunitiesTool() {
  return new DynamicStructuredTool({
    name: "kairos_recent_opportunities",
    description: "Read the most recent opportunity events from the KAIROS proactive scanner (breakouts, valuation reratings, sentiment shifts, capital-flow anomalies).",
    schema: z.object({
      limit: z.number().int().min(1).max(200).optional()
        .describe("Maximum number of events to return. Default 20."),
    }),
    func: async (input) => {
      const limit = input.limit ?? 20;
      const events = readBusHistory(KIND_TOPICS.opportunity, limit);
      return JSON.stringify({ count: events.length, events });
    },
  });
}

export function createKairosRecentAlertsTool() {
  return new DynamicStructuredTool({
    name: "kairos_recent_position_alerts",
    description: "Read the most recent position-alert events emitted by the KAIROS position monitor (stop-loss / take-profit / risk-budget).",
    schema: z.object({
      limit: z.number().int().min(1).max(200).optional()
        .describe("Maximum number of events to return. Default 20."),
    }),
    func: async (input) => {
      const limit = input.limit ?? 20;
      const events = readBusHistory(KIND_TOPICS["position-alert"], limit);
      return JSON.stringify({ count: events.length, events });
    },
  });
}

export function createKairosRecentScannerEventsTool() {
  return new DynamicStructuredTool({
    name: "kairos_recent_scanner_events",
    description: "Read the most recent scanner events from the KAIROS event scanner (price-anomaly, volume-spike, breaking-news, large-order, overnight-gap).",
    schema: z.object({
      limit: z.number().int().min(1).max(200).optional()
        .describe("Maximum number of events to return. Default 20."),
    }),
    func: async (input) => {
      const limit = input.limit ?? 20;
      const events = readBusHistory(KIND_TOPICS.scanner, limit);
      return JSON.stringify({ count: events.length, events });
    },
  });
}

export function createKairosSummaryTool() {
  return new DynamicStructuredTool({
    name: "kairos_summary",
    description: "Return KAIROS subsystem activity counts and the most recent event of each kind.",
    schema: z.object({
      recentsPerKind: z.number().int().min(0).max(10).optional()
        .describe("How many recent events to include per kind. Default 3."),
    }),
    func: async (input) => {
      const n = input.recentsPerKind ?? 3;
      const summary: Record<string, { count: number; recent: BusEvent[] }> = {};
      for (const [kind, patterns] of Object.entries(KIND_TOPICS)) {
        const events = readBusHistory(patterns, n);
        summary[kind] = { count: events.length, recent: events };
      }
      return JSON.stringify(summary, null, 2);
    },
  });
}

export function loadKairosTools(): RegisteredTool[] {
  const compute = computationMetadata();
  return [
    {
      name: "kairos_recent_opportunities",
      tool: createKairosRecentOpportunitiesTool(),
      description: KAIROS_DESCRIPTION,
      compactDescription: "读 KAIROS 主动机会事件 (突破/估值/舆情/资金流)",
      concurrencySafe: true,
      concurrencyMetadata: compute,
    },
    {
      name: "kairos_recent_position_alerts",
      tool: createKairosRecentAlertsTool(),
      description: "Read recent position alerts from the KAIROS position monitor.",
      compactDescription: "读 KAIROS 持仓告警 (止损/止盈/风险预算)",
      concurrencySafe: true,
      concurrencyMetadata: compute,
    },
    {
      name: "kairos_recent_scanner_events",
      tool: createKairosRecentScannerEventsTool(),
      description: "Read recent scanner events from the KAIROS event scanner.",
      compactDescription: "读 KAIROS 扫描事件 (价异/量比/新闻/大单/跳空)",
      concurrencySafe: true,
      concurrencyMetadata: compute,
    },
    {
      name: "kairos_summary",
      tool: createKairosSummaryTool(),
      description: "Return KAIROS subsystem activity counts and recent events of each kind.",
      compactDescription: "KAIROS 综合摘要(每类计数+最近事件)",
      concurrencySafe: true,
      concurrencyMetadata: compute,
    },
  ];
}
