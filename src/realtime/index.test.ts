/**
 * Realtime feed factory + Eastmoney adapter end-to-end tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import { describe, expect, test } from "bun:test";
import { createRealtimeFeed, createEastmoneyFeed, type EastmoneyFeedSocket } from "./index.js";
import type { Quote } from "./types.js";

class FakeSocket implements EastmoneyFeedSocket {
  sent: string[] = [];
  closed = false;
  private msgHandler: ((r: string) => void) | null = null;
  private errHandler: ((e: Error) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.closeHandler?.(); }
  onMessage(h: (r: string) => void) { this.msgHandler = h; }
  onError(h: (e: Error) => void) { this.errHandler = h; }
  onClose(h: () => void) { this.closeHandler = h; }
  // test helpers
  deliver(raw: string) { this.msgHandler?.(raw); }
  failWith(err: Error) { this.errHandler?.(err); }
}

describe("createRealtimeFeed", () => {
  test("mock source with no throttle or aggregate", async () => {
    const bundle = createRealtimeFeed({ source: "mock" });
    const received: Quote[] = [];
    bundle.feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });
    await bundle.feed.subscribe(["A"]);
    // re-acquire the inner mock to push
    const inner = bundle.feed as unknown as { pushQuote: (q: Quote) => void };
    inner.pushQuote({ symbol: "A", last: 1, volume: 1, timestamp: 1 });
    expect(received).toHaveLength(1);
    expect(bundle.aggregator).toBeUndefined();
    await bundle.close();
  });

  test("mock + aggregate (no throttle) builds bars from raw quotes", async () => {
    // Pure mock + aggregate (no throttle). Throttle+aggregate is covered
    // by throttled-feed.test.ts and aggregator.test.ts in isolation.
    let now = 1_700_000_000_000;
    const bundle = createRealtimeFeed({
      source: "mock",
      aggregateMs: 5000,
    });
    const inner = bundle.feed as unknown as { pushQuote: (q: Quote) => void };
    await (bundle.feed as any).subscribe(["A"]);

    const bars: any[] = [];
    bundle.aggregator!.onBar((b) => bars.push(b));

    // 3 quotes within the same 5s period.
    inner.pushQuote({ symbol: "A", last: 100, volume: 1, timestamp: now });
    inner.pushQuote({ symbol: "A", last: 105, volume: 2, timestamp: now + 1000 });
    inner.pushQuote({ symbol: "A", last: 110, volume: 3, timestamp: now + 2000 });

    // Same-period bars are buffered until flush() or period rollover.
    bundle.aggregator!.flush();
    expect(bars).toHaveLength(1);
    expect(bars[0].open).toBe(100);
    expect(bars[0].close).toBe(110);
    expect(bars[0].high).toBe(110);
    await bundle.close();
  });

  test("close stops the aggregator and closes the feed", async () => {
    const bundle = createRealtimeFeed({
      source: "mock",
      aggregateMs: 5000,
    });
    expect(bundle.aggregator).toBeTruthy();
    await bundle.close();
    // After close the feed is disconnected
    expect(bundle.feed.isConnected).toBe(false);
  });

  test("throws when source=eastmoney is missing options.eastmoney", () => {
    expect(() => createRealtimeFeed({ source: "eastmoney" })).toThrow(/eastmoney/);
  });

  test("throws on unknown source", () => {
    expect(() =>
      createRealtimeFeed({ source: "unknown" as any }),
    ).toThrow(/unknown source/);
  });
});

describe("createEastmoneyFeed (end-to-end with fake socket)", () => {
  test("requires socketFactory when subscribing", async () => {
    const feed = createEastmoneyFeed({ url: "wss://test" });
    expect(feed.isConnected).toBe(false);
    await expect(feed.subscribe(["600519"])).rejects.toThrow(/socketFactory/);
  });

  test("connects, subscribes, parses quotes, and closes via fake socket", async () => {
    const socket = new FakeSocket();
    const feed = createEastmoneyFeed({
      url: "wss://push2.eastmoney.com/test",
      socketFactory: () => socket,
    });
    const received: Quote[] = [];
    feed.on("quote", (e) => {
      if (e.type === "quote") received.push(e.payload);
    });

    const unsub = await feed.subscribe(["600519"]);
    expect(feed.isConnected).toBe(true);
    expect(socket.sent[0]).toContain("600519");

    socket.deliver(JSON.stringify({ code: "600519", price: 1800, vol: 100 }));
    socket.deliver(JSON.stringify({ code: "000001", price: 12, vol: 50 })); // not subscribed
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe("600519");
    expect(received[0].last).toBe(1800);

    await unsub!();
    socket.deliver(JSON.stringify({ code: "600519", price: 1801, vol: 110 }));
    expect(received).toHaveLength(1); // no more

    await feed.close();
    expect(socket.closed).toBe(true);
    expect(feed.isConnected).toBe(false);
  });

  test("propagates parse errors as 'error' events", async () => {
    const socket = new FakeSocket();
    const feed = createEastmoneyFeed({
      url: "wss://test",
      socketFactory: () => socket,
    });
    const errors: Error[] = [];
    feed.on("error", (e) => {
      if (e.type === "error") errors.push(e.payload);
    });
    await feed.subscribe(["X"]);
    socket.deliver("not-json");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    await feed.close();
  });

  test("forwards socket close as 'status' event", async () => {
    const socket = new FakeSocket();
    const feed = createEastmoneyFeed({
      url: "wss://test",
      socketFactory: () => socket,
    });
    const statuses: string[] = [];
    feed.on("status", (e) => {
      if (e.type === "status") statuses.push(e.payload.status);
    });
    await feed.subscribe(["X"]);
    socket.close();
    expect(statuses).toContain("disconnected");
  });
});
