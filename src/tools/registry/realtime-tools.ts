/**
 * Realtime tool registration — wires the realtime-stream RealtimeFeed
 * abstraction into the unified tool registry.
 *
 * Tools:
 *  - realtime_subscribe        (network — opens a feed connection)
 *  - realtime_unsubscribe      (network — closes a feed connection)
 *  - realtime_list_subscriptions (read — no side effects)
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import type { RegisteredTool } from "./types.js";
import { networkMetadata } from "./types.js";
import {
  createRealtimeFeed,
  type RealtimeFeedBundle,
  type FeedSource,
} from "../../realtime/index.js";
import { getDefaultBus } from "../../core/event-bus.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

interface ActiveSubscription {
  id: string;
  symbols: string[];
  source: FeedSource;
  throttleMs: number;
  aggregateMs: number;
  bundle: RealtimeFeedBundle;
  createdAt: number;
  quoteCount: number;
  barCount: number;
}

let sequence = 0;
const subscriptions = new Map<string, ActiveSubscription>();

function nextId(): string {
  return `sub-${++sequence}`;
}

export function resetRealtimeRegistry(): void {
  for (const sub of subscriptions.values()) {
    sub.bundle.close().catch(() => undefined);
  }
  subscriptions.clear();
  sequence = 0;
}

export function listActiveSubscriptions(): Array<{
  id: string;
  symbols: string[];
  source: string;
  throttleMs: number;
  aggregateMs: number;
  createdAt: number;
  quoteCount: number;
  barCount: number;
}> {
  return Array.from(subscriptions.values()).map((s) => ({
    id: s.id,
    symbols: [...s.symbols],
    source: s.bundle.feed.source,
    throttleMs: s.throttleMs,
    aggregateMs: s.aggregateMs,
    createdAt: s.createdAt,
    quoteCount: s.quoteCount,
    barCount: s.barCount,
  }));
}

export function getSubscription(id: string): ActiveSubscription | undefined {
  return subscriptions.get(id);
}

export const REALTIME_DESCRIPTION = `
Realtime stream tools for live market data.

## What It Does
- Subscribe to a configurable realtime feed (mock by default; eastmoney if
  UPUP_REALTIME_SOURCE=eastmoney and a socket factory is configured)
- Per-symbol throttling and OHLC bar aggregation
- Forwards quote / bar events to the in-process event bus under
  realtime.quote and realtime.bar so other subsystems (kairos, coordinator,
  proactive scanner) can react
- Manages multiple concurrent subscriptions; each has a stable id

## When to Use
- User wants "实时跟踪 600519 报价" → realtime_subscribe
- User wants to build a 5-second OHLC feed → realtime_subscribe with aggregateMs=5000
- User wants to stop a tracker → realtime_unsubscribe

## Notes
- The default source is "mock" — production deployments should switch the
  source via UPUP_REALTIME_SOURCE.
- Use realtime_list_subscriptions to introspect the active set.
`;

export function createRealtimeSubscribeTool() {
  return new DynamicStructuredTool({
    name: "realtime_subscribe",
    description: "Open a realtime feed subscription for one or more symbols. Returns a subscription id; quote and bar events are emitted to the event bus under realtime.quote / realtime.bar.",
    schema: z.object({
      symbols: z.array(z.string().min(1)).min(1)
        .describe("Symbols to subscribe to (e.g. ['600519', '000001'])."),
      throttleMs: z.number().int().min(0).optional()
        .describe("Per-symbol throttle window in ms. 0 disables throttling. Default 1000."),
      aggregateMs: z.number().int().min(0).optional()
        .describe("OHLC bar period in ms. 0 disables aggregation. Default 0."),
      source: z.enum(["mock", "eastmoney"]).optional()
        .describe("Feed source. Default 'mock'."),
    }),
    func: async (input) => {
      const id = nextId();
      const throttleMs = input.throttleMs ?? 1000;
      const aggregateMs = input.aggregateMs ?? 0;
      const source: FeedSource = input.source ?? "mock";
      const bus = getDefaultBus();

      const bundle = createRealtimeFeed({
        source,
        throttleMs,
        aggregateMs,
        eastmoney: source === "eastmoney" ? {
          url: process.env.UPUP_EASTMONEY_URL ?? "wss://push2.eastmoney.com/api/qt/stock/get",
        } : undefined,
      });

      await bundle.feed.subscribe(input.symbols);

      const sub: ActiveSubscription = {
        id,
        symbols: [...input.symbols],
        source,
        throttleMs,
        aggregateMs,
        bundle,
        createdAt: Date.now(),
        quoteCount: 0,
        barCount: 0,
      };

      bundle.feed.on("quote", (e) => {
        if (e.type !== "quote") return;
        sub.quoteCount++;
        bus.emit("realtime.quote", e.payload);
      });

      bundle.aggregator?.onBar((bar) => {
        sub.barCount++;
        bus.emit("realtime.bar", bar);
      });

      subscriptions.set(id, sub);

      return JSON.stringify({
        subscriptionId: id,
        symbols: input.symbols,
        source,
        throttleMs,
        aggregateMs,
        note: source === "mock"
          ? "Mock feed active. Production deployments should set UPUP_REALTIME_SOURCE=eastmoney and inject a socket factory."
          : "Eastmoney adapter active; ensure a socket factory has been wired in the runtime.",
      });
    },
  });
}

export function createRealtimeUnsubscribeTool() {
  return new DynamicStructuredTool({
    name: "realtime_unsubscribe",
    description: "Close a previously-opened realtime subscription by id.",
    schema: z.object({
      subscriptionId: z.string().describe("The id returned by realtime_subscribe."),
    }),
    func: async (input) => {
      const sub = subscriptions.get(input.subscriptionId);
      if (!sub) {
        return JSON.stringify({
          ok: false,
          error: `subscription not found: ${input.subscriptionId}`,
        });
      }
      await sub.bundle.close();
      subscriptions.delete(input.subscriptionId);
      return JSON.stringify({
        ok: true,
        subscriptionId: input.subscriptionId,
        quoteCount: sub.quoteCount,
        barCount: sub.barCount,
      });
    },
  });
}

export function createRealtimeListSubscriptionsTool() {
  return new DynamicStructuredTool({
    name: "realtime_list_subscriptions",
    description: "List all active realtime subscriptions managed by this process.",
    schema: z.object({}),
    func: async () => {
      return JSON.stringify({ subscriptions: listActiveSubscriptions() });
    },
  });
}

export function loadRealtimeTools(): RegisteredTool[] {
  const network = networkMetadata();
  return [
    {
      name: "realtime_subscribe",
      tool: createRealtimeSubscribeTool(),
      description: REALTIME_DESCRIPTION,
      compactDescription: "订阅实时行情 (mock/eastmoney),支持节流+OHLC 聚合",
      concurrencySafe: false,
      concurrencyMetadata: network,
    },
    {
      name: "realtime_unsubscribe",
      tool: createRealtimeUnsubscribeTool(),
      description: "Close a realtime subscription.",
      compactDescription: "退订实时行情",
      concurrencySafe: true,
      concurrencyMetadata: network,
    },
    {
      name: "realtime_list_subscriptions",
      tool: createRealtimeListSubscriptionsTool(),
      description: "List active realtime subscriptions.",
      compactDescription: "查活跃订阅",
      concurrencySafe: true,
      concurrencyMetadata: network,
    },
  ];
}
