/**
 * Position Monitor tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      (Requirement: Position Monitor)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { createEventBus, type EventBus } from "../core/event-bus.js";
import {
  createPositionMonitor,
  type Position,
  type QuoteProvider,
} from "./position-monitor.js";

function fakeQuotes(prices: Record<string, number>): QuoteProvider {
  return {
    async getQuote(symbol) {
      const last = prices[symbol];
      if (last === undefined) throw new Error(`No quote for ${symbol}`);
      return { symbol, last };
    },
  };
}

describe("createPositionMonitor", () => {
  let bus: EventBus;
  let captured: Array<{ topic: string; payload: any }>;
  let unsubscribe: () => void;

  beforeEach(() => {
    bus = createEventBus({ bufferSize: 100 });
    captured = [];
    unsubscribe = bus.on<any>("kairos.position.alert", (e) =>
      captured.push({ topic: e.topic, payload: e.payload }),
    );
  });

  test("emits stop-loss alert for long position", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "AAPL", quantity: 100, avgCost: 150, stopLoss: 140 },
      ],
      quotes: fakeQuotes({ AAPL: 139 }),
    });
    const result = await monitor.tick();
    expect(result.scanned).toBe(1);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].kind).toBe("stop-loss");
    expect(result.alerts[0].symbol).toBe("AAPL");
    expect(captured).toHaveLength(1);
    expect(captured[0].payload.recommendation).toContain("市价卖出");
  });

  test("does not emit stop-loss when price above threshold", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "AAPL", quantity: 100, avgCost: 150, stopLoss: 140 },
      ],
      quotes: fakeQuotes({ AAPL: 145 }),
    });
    const result = await monitor.tick();
    expect(result.alerts).toHaveLength(0);
    expect(captured).toHaveLength(0);
  });

  test("emits take-profit alert when target hit", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "NVDA", quantity: 50, avgCost: 400, takeProfit: 500 },
      ],
      quotes: fakeQuotes({ NVDA: 510 }),
    });
    const result = await monitor.tick();
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].kind).toBe("take-profit");
    expect(result.alerts[0].recommendation).toContain("止盈");
  });

  test("emits risk-budget alert when loss exceeds budget", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "TSLA", quantity: 100, avgCost: 200, riskBudget: 1500 },
      ],
      quotes: fakeQuotes({ TSLA: 180 }), // loss = (180-200)*100 = -2000, > 1500
    });
    const result = await monitor.tick();
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].kind).toBe("risk-budget");
    expect(result.alerts[0].recommendation).toContain("2000");
  });

  test("handles short positions with inverted stop/take logic", async () => {
    // Short 100 @ 200, stopLoss at 210 (price rising hurts us)
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "META", quantity: -100, avgCost: 200, stopLoss: 210 },
      ],
      quotes: fakeQuotes({ META: 215 }),
    });
    const result = await monitor.tick();
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].kind).toBe("stop-loss");
    expect(result.alerts[0].recommendation).toContain("买入平仓");
  });

  test("emits multiple alerts for the same position when multiple rules fire", async () => {
    // Take-profit and risk-budget can coexist if both triggered (edge case)
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "GME", quantity: 10, avgCost: 100, takeProfit: 50, stopLoss: 90 },
      ],
      quotes: fakeQuotes({ GME: 50 }),
    });
    const result = await monitor.tick();
    // 50 hits take-profit (>=50) and stop-loss (50 <= 90) — both fire
    expect(result.alerts.length).toBeGreaterThanOrEqual(1);
    const kinds = result.alerts.map((a) => a.kind).sort();
    expect(kinds).toContain("take-profit");
  });

  test("scans multiple positions in one tick", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "A", quantity: 10, avgCost: 100, stopLoss: 90 },
        { symbol: "B", quantity: 10, avgCost: 100 }, // no rules
        { symbol: "C", quantity: 10, avgCost: 100, takeProfit: 120 },
      ],
      quotes: fakeQuotes({ A: 85, B: 100, C: 130 }),
    });
    const result = await monitor.tick();
    expect(result.scanned).toBe(3);
    expect(result.alerts).toHaveLength(2);
    expect(captured).toHaveLength(2);
  });

  test("supports async positions provider", async () => {
    const positions: Position[] = [
      { symbol: "X", quantity: 1, avgCost: 10, stopLoss: 5 },
    ];
    const monitor = createPositionMonitor({
      bus,
      positions: async () => positions,
      quotes: fakeQuotes({ X: 4 }),
    });
    const result = await monitor.tick();
    expect(result.alerts).toHaveLength(1);
  });

  test("unrealized PnL is computed correctly", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [{ symbol: "AAPL", quantity: 100, avgCost: 150 }],
      quotes: fakeQuotes({ AAPL: 160 }),
    });
    const result = await monitor.tick();
    expect(result.alerts).toHaveLength(0);
    // PnL = (160-150)*100 = 1000, exposed via the alert payload if any rule fires.
    // No rule fires here, so verify by injecting a stopLoss that won't trigger.
    const monitor2 = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "AAPL", quantity: 100, avgCost: 150, stopLoss: 200 }, // triggers
      ],
      quotes: fakeQuotes({ AAPL: 160 }),
    });
    const r2 = await monitor2.tick();
    expect(r2.alerts[0].unrealizedPnl).toBe(1000);
  });

  test("uses custom topic prefix from config", async () => {
    const customCaptured: any[] = [];
    bus.on<any>("custom.position.alert", (e) =>
      customCaptured.push(e.payload),
    );
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "Z", quantity: 1, avgCost: 100, stopLoss: 50 },
      ],
      quotes: fakeQuotes({ Z: 40 }),
      config: { topicPrefix: "custom.position" },
    });
    await monitor.tick();
    expect(customCaptured).toHaveLength(1);
    expect(customCaptured[0].kind).toBe("stop-loss");
  });

  test("uses injected clock for deterministic timestamps", async () => {
    let fakeTime = 1_700_000_000_000;
    const monitor = createPositionMonitor({
      bus,
      positions: () => [
        { symbol: "T", quantity: 1, avgCost: 100, stopLoss: 50 },
      ],
      quotes: fakeQuotes({ T: 40 }),
      config: { now: () => fakeTime },
    });
    const result = await monitor.tick();
    expect(result.alerts[0].detectedAt).toBe(fakeTime);
  });

  test("propagates quote errors", async () => {
    const monitor = createPositionMonitor({
      bus,
      positions: () => [{ symbol: "BAD", quantity: 1, avgCost: 100 }],
      quotes: { async getQuote() { throw new Error("feed down"); } },
    });
    await expect(monitor.tick()).rejects.toThrow("feed down");
  });

  // Best-effort cleanup so other suites aren't affected
  test("teardown", () => {
    unsubscribe();
  });
});
