/**
 * Mock RealtimeFeed tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { createMockFeed } from "./mock-feed.js";
import type { Quote } from "./types.js";

describe("createMockFeed", () => {
  let now: number;
  let feed: ReturnType<typeof createMockFeed>;

  beforeEach(() => {
    now = 1_700_000_000_000;
    feed = createMockFeed({ now: () => now });
  });

  test("source is 'mock' and starts disconnected", () => {
    expect(feed.source).toBe("mock");
    expect(feed.isConnected).toBe(false);
  });

  test("auto-connects on first subscribe and emits status", async () => {
    const statuses: string[] = [];
    feed.on("status", (e) => {
      if (e.type === "status") statuses.push(e.payload.status);
    });
    await feed.subscribe(["600519"]);
    expect(feed.isConnected).toBe(true);
    expect(statuses).toContain("connected");
  });

  test("delivers quotes only for subscribed symbols", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await feed.subscribe(["600519"]);
    feed.pushQuote({ symbol: "600519", last: 1800, volume: 100, timestamp: now });
    feed.pushQuote({ symbol: "000001", last: 12, volume: 50, timestamp: now });
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe("600519");
  });

  test("unsubscribe stops delivery", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await feed.subscribe(["600519"]);
    feed.pushQuote({ symbol: "600519", last: 1800, volume: 1, timestamp: now });
    await feed.unsubscribe(["600519"]);
    feed.pushQuote({ symbol: "600519", last: 1801, volume: 2, timestamp: now });
    expect(received).toHaveLength(1);
  });

  test("subscribe returns an unsubscribe handle", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    const off = await feed.subscribe(["A", "B"]);
    feed.pushQuote({ symbol: "A", last: 1, volume: 1, timestamp: now });
    feed.pushQuote({ symbol: "B", last: 2, volume: 1, timestamp: now });
    await off();
    feed.pushQuote({ symbol: "A", last: 3, volume: 1, timestamp: now });
    expect(received).toHaveLength(2);
  });

  test("stamps timestamp when caller omits it", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await feed.subscribe(["A"]);
    feed.pushQuote({ symbol: "A", last: 1, volume: 1 } as Quote);
    expect(received[0].timestamp).toBe(now);
  });

  test("preserves caller-provided timestamp", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await feed.subscribe(["A"]);
    feed.pushQuote({ symbol: "A", last: 1, volume: 1, timestamp: 12345 });
    expect(received[0].timestamp).toBe(12345);
  });

  test("close clears subscriptions and disconnects", async () => {
    const statuses: string[] = [];
    feed.on("status", (e) => {
      if (e.type === "status") statuses.push(e.payload.status);
    });
    await feed.subscribe(["A"]);
    expect(feed.subscribedCount()).toBe(1);
    await feed.close();
    expect(feed.subscribedCount()).toBe(0);
    expect(feed.isConnected).toBe(false);
    expect(statuses).toContain("disconnected");
  });

  test("multi-symbol subscribe in one call", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await feed.subscribe(["A", "B", "C"]);
    feed.pushQuotes([
      { symbol: "A", last: 1, volume: 1, timestamp: now },
      { symbol: "B", last: 2, volume: 1, timestamp: now },
      { symbol: "C", last: 3, volume: 1, timestamp: now },
    ]);
    expect(received).toHaveLength(3);
  });

  test("handler error does not break the bus", async () => {
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") {
        if (e.payload.last === 1) throw new Error("boom");
        received.push(e.payload);
      }
    });
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push({ ...e.payload, last: e.payload.last * 10 });
    });
    await feed.subscribe(["A"]);
    // suppress console.error noise from the bus's safety net
    const origErr = console.error;
    console.error = () => {};
    try {
      feed.pushQuote({ symbol: "A", last: 1, volume: 1, timestamp: now });
      feed.pushQuote({ symbol: "A", last: 2, volume: 1, timestamp: now });
    } finally {
      console.error = origErr;
    }
    // The second handler still ran for both events
    expect(received.find((q) => q.last === 10)).toBeTruthy();
    expect(received.find((q) => q.last === 20)).toBeTruthy();
  });
});
