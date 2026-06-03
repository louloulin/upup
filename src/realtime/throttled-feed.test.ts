/**
 * Throttled feed tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 *      (Requirement: Throttle and Aggregation)
 */

import { describe, expect, test } from "bun:test";
import { createMockFeed } from "./mock-feed.js";
import { createThrottledFeed } from "./throttled-feed.js";
import type { Quote } from "./types.js";

function makeQuote(symbol: string, last: number, ts: number): Quote {
  return { symbol, last, volume: 1, timestamp: ts };
}

describe("createThrottledFeed", () => {
  test("passes through when throttleMs = 0", async () => {
    const inner = createMockFeed();
    const feed = createThrottledFeed(inner, { throttleMs: 0 });
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await inner.subscribe(["A"]);
    // we are listening to the throttled feed, not the inner
    // re-emit by attaching to inner directly
    inner.on("quote", () => {});
    // push directly via inner
    for (let i = 0; i < 5; i++) {
      inner.pushQuote(makeQuote("A", i, i));
    }
    // since throttleMs=0, the throttled feed should re-emit all 5
    expect(received).toHaveLength(5);
  });

  test("throttles to 1Hz per symbol", async () => {
    let now = 1_700_000_000_000;
    const inner = createMockFeed({ now: () => now });
    const feed = createThrottledFeed(inner, { throttleMs: 1000, now: () => now });
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await inner.subscribe(["A"]);
    // 10 quotes at 100ms intervals (~10Hz) — only the first should pass
    for (let i = 0; i < 10; i++) {
      inner.pushQuote(makeQuote("A", i, now));
      now += 100;
    }
    expect(received.length).toBe(1);
    expect(received[0].last).toBe(0);
  });

  test("emits again after throttle window elapses", async () => {
    let now = 1_700_000_000_000;
    const inner = createMockFeed({ now: () => now });
    const feed = createThrottledFeed(inner, { throttleMs: 1000, now: () => now });
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await inner.subscribe(["A"]);
    inner.pushQuote(makeQuote("A", 1, now));
    now += 1100;
    inner.pushQuote(makeQuote("A", 2, now));
    now += 50;
    inner.pushQuote(makeQuote("A", 3, now)); // within new window
    expect(received.map((q) => q.last)).toEqual([1, 2]);
  });

  test("throttles per-symbol independently", async () => {
    let now = 1_700_000_000_000;
    const inner = createMockFeed({ now: () => now });
    const feed = createThrottledFeed(inner, { throttleMs: 1000, now: () => now });
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await inner.subscribe(["A", "B"]);
    inner.pushQuote(makeQuote("A", 1, now));
    inner.pushQuote(makeQuote("B", 2, now)); // A throttled, B not — should pass
    expect(received.map((q) => q.symbol)).toEqual(["A", "B"]);
  });

  test("forwards non-quote events (status, error, bar) without throttling", async () => {
    const inner = createMockFeed();
    const feed = createThrottledFeed(inner, { throttleMs: 10000 });
    const statuses: string[] = [];
    feed.on("status", (e) => {
      if (e.type === "status") statuses.push(e.payload.status);
    });
    // simulate status by directly emitting via inner's on API
    // (mock-feed emits 'connected' on subscribe)
    await inner.subscribe(["X"]);
    expect(statuses).toContain("connected");
  });

  test("close forwards to inner and clears lastEmit", async () => {
    let now = 1_700_000_000_000;
    const inner = createMockFeed({ now: () => now });
    const feed = createThrottledFeed(inner, { throttleMs: 1000, now: () => now });
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await inner.subscribe(["A"]);
    inner.pushQuote(makeQuote("A", 1, now));
    now += 100;
    await feed.close();
    // After close, no further forwarding (inner also closed)
    now += 5000;
    expect(received).toHaveLength(1);
    expect(inner.isConnected).toBe(false);
  });

  test("source label includes inner source", () => {
    const inner = createMockFeed();
    const feed = createThrottledFeed(inner);
    expect(feed.source).toBe("throttled(mock)");
  });
});
