/**
 * Tests for the realtime-tools registry wiring.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  loadRealtimeTools,
  resetRealtimeRegistry,
  listActiveSubscriptions,
} from "./realtime-tools.js";

describe("loadRealtimeTools", () => {
  afterEach(() => {
    resetRealtimeRegistry();
  });

  test("exposes the 3 expected tools", () => {
    const tools = loadRealtimeTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "realtime_subscribe",
      "realtime_unsubscribe",
      "realtime_list_subscriptions",
    ]);
  });

  test("each tool carries a non-empty description and compact description", () => {
    const tools = loadRealtimeTools();
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.compactDescription).toBeTruthy();
    }
  });

  test("each tool exposes a callable PiTool", () => {
    const tools = loadRealtimeTools();
    for (const t of tools) {
      expect(t.tool).toBeTruthy();
      expect(typeof (t.tool as { invoke?: unknown }).invoke).toBe("function");
    }
  });

  test("subscribe opens a subscription, list shows it, unsubscribe closes it", async () => {
    const tools = loadRealtimeTools();
    const sub = tools.find((t) => t.name === "realtime_subscribe")!;
    const unsub = tools.find((t) => t.name === "realtime_unsubscribe")!;
    const list = tools.find((t) => t.name === "realtime_list_subscriptions")!;

    const subResult = JSON.parse(
      await (sub.tool as any).invoke({ symbols: ["A", "B"] }),
    );
    expect(subResult.subscriptionId).toMatch(/^sub-\d+$/);
    expect(subResult.symbols).toEqual(["A", "B"]);
    expect(subResult.source).toBe("mock");
    expect(subResult.throttleMs).toBe(1000);
    expect(subResult.aggregateMs).toBe(0);
    expect(listActiveSubscriptions()).toHaveLength(1);

    const listResult = JSON.parse(await (list.tool as any).invoke({}));
    expect(listResult.subscriptions).toHaveLength(1);
    expect(listResult.subscriptions[0].symbols).toEqual(["A", "B"]);

    const unsubResult = JSON.parse(
      await (unsub.tool as any).invoke({ subscriptionId: subResult.subscriptionId }),
    );
    expect(unsubResult.ok).toBe(true);
    expect(unsubResult.subscriptionId).toBe(subResult.subscriptionId);
    expect(listActiveSubscriptions()).toHaveLength(0);
  });

  test("unsubscribe on unknown id returns ok:false", async () => {
    const tools = loadRealtimeTools();
    const unsub = tools.find((t) => t.name === "realtime_unsubscribe")!;
    const result = JSON.parse(
      await (unsub.tool as any).invoke({ subscriptionId: "nope" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  test("supports custom throttleMs and aggregateMs", async () => {
    const tools = loadRealtimeTools();
    const sub = tools.find((t) => t.name === "realtime_subscribe")!;
    const result = JSON.parse(
      await (sub.tool as any).invoke({
        symbols: ["X"],
        throttleMs: 500,
        aggregateMs: 5000,
      }),
    );
    expect(result.throttleMs).toBe(500);
    expect(result.aggregateMs).toBe(5000);
    const entry = listActiveSubscriptions()[0];
    expect(entry.throttleMs).toBe(500);
    expect(entry.aggregateMs).toBe(5000);
  });

  test("rejects empty symbol list", async () => {
    const tools = loadRealtimeTools();
    const sub = tools.find((t) => t.name === "realtime_subscribe")!;
    await expect((sub.tool as any).invoke({ symbols: [] })).rejects.toThrow();
  });
});
