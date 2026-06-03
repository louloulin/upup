/**
 * Event Scanner tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      (Requirement: Event Scanner)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { createEventBus, type EventBus } from "../core/event-bus.js";
import {
  createEventScanner,
  type ScanSymbol,
  type ScanEvent,
  type ScannerSession,
} from "./scanner.js";

const SYMBOLS: ScanSymbol[] = [
  {
    symbol: "GAP",
    last: 100,
    prevClose: 100,
    volume: 1_000_000,
    avgVolume20d: 800_000,
    preMarketLast: 105,
  },
  {
    symbol: "VOL",
    last: 50,
    prevClose: 50,
    volume: 5_000_000,
    avgVolume20d: 1_000_000, // 5x
  },
  {
    symbol: "NEWS",
    last: 30,
    prevClose: 30,
    volume: 1_000_000,
    avgVolume20d: 800_000,
    newsHeadline: "突发: 重大资产重组方案公布",
  },
  {
    symbol: "ORDER",
    last: 80,
    prevClose: 80,
    volume: 1_000_000,
    avgVolume20d: 800_000,
    recentOrderFlowCny: 200_000_000, // 2亿
  },
  {
    symbol: "QUIET",
    last: 80,
    prevClose: 80,
    volume: 800_000,
    avgVolume20d: 800_000,
  },
];

describe("createEventScanner", () => {
  let bus: EventBus;
  let captured: Map<string, ScanEvent[]>;
  let unsubs: Array<() => void>;

  beforeEach(() => {
    bus = createEventBus({ bufferSize: 200 });
    captured = new Map();
    unsubs = [];
    for (const k of [
      "kairos.scanner.price-anomaly",
      "kairos.scanner.volume-spike",
      "kairos.scanner.breaking-news",
      "kairos.scanner.large-order",
      "kairos.scanner.overnight-gap",
    ]) {
      unsubs.push(
        bus.on<ScanEvent>(k, (e) => {
          const list = captured.get(k) ?? [];
          list.push(e.payload);
          captured.set(k, list);
        }),
      );
    }
  });

  function makeScanner(overrides: Partial<Parameters<typeof createEventScanner>[0]> = {}) {
    return createEventScanner({
      bus,
      fetchSymbols: async () => SYMBOLS,
      config: { now: () => 1_700_000_000_000 },
      ...overrides,
    });
  }

  test("emits overnight-gap event in pre-market", async () => {
    const s = makeScanner();
    const r = await s.runPreMarket();
    expect(r.scanned).toBe(5);
    const gaps = captured.get("kairos.scanner.overnight-gap") ?? [];
    expect(gaps).toHaveLength(1);
    expect(gaps[0].symbol).toBe("GAP");
    expect(gaps[0].kind).toBe("overnight-gap");
    expect(gaps[0].session).toBe("pre-market");
    expect(gaps[0].headline).toContain("+5.00%");
  });

  test("emits volume-spike during intraday", async () => {
    const s = makeScanner();
    const r = await s.runIntraday();
    const spikes = captured.get("kairos.scanner.volume-spike") ?? [];
    expect(spikes).toHaveLength(1);
    expect(spikes[0].symbol).toBe("VOL");
    expect(spikes[0].confidence).toBeGreaterThan(0.5);
  });

  test("emits breaking-news when keyword matches", async () => {
    const s = makeScanner();
    await s.runIntraday();
    const news = captured.get("kairos.scanner.breaking-news") ?? [];
    expect(news).toHaveLength(1);
    expect(news[0].symbol).toBe("NEWS");
    expect(news[0].data.matchedKeyword).toBe("突发");
  });

  test("emits large-order for big flow", async () => {
    const s = makeScanner();
    await s.runIntraday();
    const orders = captured.get("kairos.scanner.large-order") ?? [];
    expect(orders).toHaveLength(1);
    expect(orders[0].symbol).toBe("ORDER");
    expect(orders[0].data.direction).toBe("buy");
  });

  test("does not emit for quiet symbols", async () => {
    const s = makeScanner({ fetchSymbols: async () => [SYMBOLS[4]] });
    const r = await s.runIntraday();
    expect(r.emitted).toBe(0);
    expect(r.events).toHaveLength(0);
  });

  test("post-market skips price-anomaly and breaking-news, still detects volume-spike", async () => {
    const s = makeScanner();
    const r = await s.runPostMarket();
    expect(r.scanned).toBe(5);
    expect(captured.get("kairos.scanner.price-anomaly") ?? []).toHaveLength(0);
    expect(captured.get("kairos.scanner.breaking-news") ?? []).toHaveLength(0);
    expect(captured.get("kairos.scanner.volume-spike") ?? []).toHaveLength(1);
  });

  test("runSession dispatches by name", async () => {
    const s = makeScanner();
    const pre = await s.runSession("pre-market");
    const intra = await s.runSession("intraday");
    const post = await s.runSession("post-market");
    expect(pre.session).toBe("pre-market");
    expect(intra.session).toBe("intraday");
    expect(post.session).toBe("post-market");
  });

  test("uses custom topic prefix", async () => {
    const custom: ScanEvent[] = [];
    bus.on<ScanEvent>("custom.scanner.volume-spike", (e) => custom.push(e.payload));
    const s = createEventScanner({
      bus,
      fetchSymbols: async () => [SYMBOLS[1]],
      config: { topicPrefix: "custom.scanner", now: () => 0 },
    });
    await s.runIntraday();
    expect(custom).toHaveLength(1);
  });

  test("events sorted by confidence descending", async () => {
    const symbols: ScanSymbol[] = [
      { symbol: "LOW", last: 80, prevClose: 80, volume: 1_000_000, avgVolume20d: 1_000_000 }, // 1x — won't trigger
      { symbol: "BIG", last: 100, prevClose: 80, volume: 10_000_000, avgVolume20d: 1_000_000 }, // +25% price + 10x vol
    ];
    const s = createEventScanner({
      bus,
      fetchSymbols: async () => symbols,
      config: { now: () => 0 },
    });
    const r = await s.runIntraday();
    expect(r.events.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < r.events.length; i++) {
      expect(r.events[i - 1].confidence).toBeGreaterThanOrEqual(
        r.events[i].confidence,
      );
    }
  });

  test("uses injected clock for deterministic detectedAt", async () => {
    const s = createEventScanner({
      bus,
      fetchSymbols: async () => [SYMBOLS[1]],
      config: { now: () => 12345 },
    });
    const r = await s.runIntraday();
    for (const e of r.events) {
      expect(e.detectedAt).toBe(12345);
    }
  });

  test("gap below threshold does not trigger", async () => {
    const s = createEventScanner({
      bus,
      fetchSymbols: async () => [
        {
          symbol: "SMALLGAP",
          last: 100,
          prevClose: 100,
          volume: 1_000_000,
          avgVolume20d: 800_000,
          preMarketLast: 101, // +1% — below default 3%
        },
      ],
      config: { now: () => 0 },
    });
    const r = await s.runPreMarket();
    expect(r.emitted).toBe(0);
  });

  test("small order below threshold does not trigger", async () => {
    const s = createEventScanner({
      bus,
      fetchSymbols: async () => [
        {
          symbol: "SMALLORDER",
          last: 100,
          prevClose: 100,
          volume: 1_000_000,
          avgVolume20d: 800_000,
          recentOrderFlowCny: 10_000_000, // 1kw — below 5kw default
        },
      ],
      config: { now: () => 0 },
    });
    const r = await s.runIntraday();
    expect(captured.get("kairos.scanner.large-order") ?? []).toHaveLength(0);
  });

  test("non-matching news keyword does not trigger", async () => {
    const s = createEventScanner({
      bus,
      fetchSymbols: async () => [
        {
          symbol: "BLAH",
          last: 100,
          prevClose: 100,
          volume: 1_000_000,
          avgVolume20d: 800_000,
          newsHeadline: "Company held its annual picnic on Friday",
        },
      ],
      config: { now: () => 0 },
    });
    const r = await s.runIntraday();
    expect(captured.get("kairos.scanner.breaking-news") ?? []).toHaveLength(0);
  });

  test("teardown", () => {
    for (const u of unsubs) u();
  });
});
