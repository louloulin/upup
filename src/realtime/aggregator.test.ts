/**
 * Aggregator tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 *      (Requirement: Throttle and Aggregation)
 */

import { describe, expect, test } from "bun:test";
import { createMockFeed } from "./mock-feed.js";
import { aggregateToBars } from "./aggregator.js";
import type { Quote } from "./types.js";

function makeQuote(symbol: string, last: number, ts: number, volume = 1): Quote {
  return { symbol, last, volume, timestamp: ts };
}

describe("aggregateToBars", () => {
  test("builds a single bar from consecutive quotes in the same period", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    // 4 quotes within the same 5s window (t=0..4s)
    feed.subscribe(["A"]);
    feed.pushQuote(makeQuote("A", 100, now));
    feed.pushQuote(makeQuote("A", 105, now + 1000));
    feed.pushQuote(makeQuote("A", 102, now + 2000));
    feed.pushQuote(makeQuote("A", 110, now + 4000));
    agg.flush();
    expect(bars).toHaveLength(1);
    expect(bars[0].open).toBe(100);
    expect(bars[0].high).toBe(110);
    expect(bars[0].low).toBe(100);
    expect(bars[0].close).toBe(110);
    expect(bars[0].periodMs).toBe(5000);
    agg.stop();
  });

  test("emits a new bar when the period rolls over", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    feed.subscribe(["A"]);
    feed.pushQuote(makeQuote("A", 100, now));            // period 0..5s
    feed.pushQuote(makeQuote("A", 110, now + 4000));      // still period 0..5s
    feed.pushQuote(makeQuote("A", 120, now + 5000));      // new period 5..10s — should trigger
    feed.pushQuote(makeQuote("A", 130, now + 9000));      // still 5..10s
    expect(bars.length).toBeGreaterThanOrEqual(1);
    // First bar (auto-flushed on period rollover)
    expect(bars[0].open).toBe(100);
    expect(bars[0].high).toBe(110);
    expect(bars[0].close).toBe(110);
    agg.stop();
    // After stop() we get a final flush
    const last = bars[bars.length - 1];
    expect(last.open).toBe(120);
    expect(last.close).toBe(130);
  });

  test("aggregates per-symbol independently", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    feed.subscribe(["A", "B"]);
    feed.pushQuote(makeQuote("A", 100, now));
    feed.pushQuote(makeQuote("B", 200, now + 1000));
    feed.pushQuote(makeQuote("A", 105, now + 2000));
    feed.pushQuote(makeQuote("B", 210, now + 3000));
    agg.flush();
    const a = bars.find((b) => b.symbol === "A")!;
    const b = bars.find((b) => b.symbol === "B")!;
    expect(a.open).toBe(100);
    expect(a.close).toBe(105);
    expect(b.open).toBe(200);
    expect(b.close).toBe(210);
    agg.stop();
  });

  test("filters to specified symbols when set", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, symbols: ["A"], now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    feed.subscribe(["A", "B", "C"]);
    feed.pushQuote(makeQuote("A", 1, now));
    feed.pushQuote(makeQuote("B", 2, now));
    feed.pushQuote(makeQuote("C", 3, now));
    agg.flush();
    expect(bars).toHaveLength(1);
    expect(bars[0].symbol).toBe("A");
    agg.stop();
  });

  test("stop() flushes in-progress bars", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    feed.subscribe(["A"]);
    feed.pushQuote(makeQuote("A", 100, now));
    feed.pushQuote(makeQuote("A", 110, now + 1000));
    agg.stop();
    expect(bars).toHaveLength(1);
    expect(bars[0].open).toBe(100);
    expect(bars[0].close).toBe(110);
  });

  test("bar start is aligned to period boundary", () => {
    const now = 1_700_000_003_000; // not aligned
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    feed.subscribe(["A"]);
    feed.pushQuote(makeQuote("A", 100, now));
    agg.flush();
    // floor(1_700_000_003_000 / 5000) * 5000 = 1_700_000_000_000
    expect(bars[0].start).toBe(1_700_000_000_000);
    expect(bars[0].end).toBe(1_700_000_005_000);
    agg.stop();
  });

  test("flush() returns the bars that were emitted", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    feed.subscribe(["A", "B"]);
    feed.pushQuote(makeQuote("A", 1, now));
    feed.pushQuote(makeQuote("B", 2, now + 1000));
    const flushed = agg.flush();
    expect(flushed).toHaveLength(2);
    agg.stop();
  });

  test("volume tracks the latest cumulative reading", () => {
    const now = 1_700_000_000_000;
    const feed = createMockFeed({ now: () => now });
    const agg = aggregateToBars(feed, { periodMs: 5000, now: () => now });
    const bars: any[] = [];
    agg.onBar((b) => bars.push(b));

    feed.subscribe(["A"]);
    feed.pushQuote(makeQuote("A", 100, now, 1000));
    feed.pushQuote(makeQuote("A", 101, now + 1000, 1500));
    feed.pushQuote(makeQuote("A", 102, now + 2000, 2000));
    agg.flush();
    expect(bars[0].volume).toBe(2000);
    agg.stop();
  });
});
