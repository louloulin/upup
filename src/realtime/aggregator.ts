/**
 * OHLC bar aggregation for realtime quotes.
 *
 * Subscribes to a feed's quote events and emits aggregated Bar events
 * at the end of each periodMs window per symbol. A new bar is started
 * whenever a quote arrives in a new period window.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 *      (Requirement: Throttle and Aggregation)
 */

import type { Bar, FeedHandler, Quote, RealtimeFeed } from "./types.js";

export interface AggregatorOptions {
  /** Symbols to aggregate. If empty, aggregates every symbol seen. */
  symbols?: string[];
  /** Bar period in ms (e.g. 5000 = 5s). */
  periodMs: number;
  /** Optional clock for tests. */
  now?: () => number;
}

export interface AggregatorHandle {
  /** Stop aggregating and remove listeners. */
  stop(): void;
  /** Flush any in-progress bars immediately, returning what was emitted. */
  flush(): Bar[];
  /** Register a bar handler. */
  onBar(handler: (bar: Bar) => void): () => void;
}

interface BarState {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  start: number;
  end: number;
}

export function aggregateToBars(
  feed: RealtimeFeed,
  options: AggregatorOptions,
): AggregatorHandle {
  const periodMs = options.periodMs;
  const now = options.now ?? (() => Date.now());
  const allow = options.symbols && options.symbols.length > 0
    ? new Set(options.symbols)
    : null;
  const state = new Map<string, BarState>();
  const barHandlers = new Set<(bar: Bar) => void>();

  function periodStart(ts: number): number {
    return Math.floor(ts / periodMs) * periodMs;
  }

  function buildBar(symbol: string, s: BarState): Bar {
    return {
      symbol,
      open: s.open,
      high: s.high,
      low: s.low,
      close: s.close,
      volume: s.volume,
      start: s.start,
      end: s.end,
      periodMs,
    };
  }

  const off = feed.on("quote", ((event: { type: "quote"; payload: Quote }) => {
    const q = event.payload;
    if (allow && !allow.has(q.symbol)) return;
    const ts = q.timestamp || now();
    const ps = periodStart(ts);
    const existing = state.get(q.symbol);
    if (!existing || existing.start !== ps) {
      if (existing) {
        const bar = buildBar(q.symbol, existing);
        for (const h of barHandlers) h(bar);
      }
      state.set(q.symbol, {
        open: q.last,
        high: q.last,
        low: q.last,
        close: q.last,
        volume: q.volume,
        start: ps,
        end: ps + periodMs,
      });
    } else {
      existing.high = Math.max(existing.high, q.last);
      existing.low = Math.min(existing.low, q.last);
      existing.close = q.last;
      // volume is cumulative on the source — take the latest reading
      existing.volume = q.volume;
    }
  }) as FeedHandler);

  function flush(): Bar[] {
    const out: Bar[] = [];
    for (const [sym, s] of state) {
      const bar = buildBar(sym, s);
      out.push(bar);
      for (const h of barHandlers) h(bar);
    }
    state.clear();
    return out;
  }

  return {
    stop() {
      off();
      flush();
      barHandlers.clear();
    },
    flush,
    onBar(handler) {
      barHandlers.add(handler);
      return () => barHandlers.delete(handler);
    },
  };
}
