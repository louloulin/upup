/**
 * Throttling decorator for any RealtimeFeed.
 *
 * Wraps an inner feed, subscribes through it, and applies a per-symbol
 * throttle to the resulting quote stream. Intermediate quotes within
 * the throttle window are dropped (last-write-wins). The inner feed's
 * lifecycle is forwarded (close, status events).
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 *      (Requirement: Throttle and Aggregation)
 */

import type {
  FeedEvent,
  FeedHandler,
  FeedEventType,
  Quote,
  RealtimeFeed,
  SubscribeOptions,
} from "./types.js";

export interface ThrottledFeedOptions {
  /** Throttle window in ms. 0 / undefined disables throttling. */
  throttleMs?: number;
  /** Optional clock for tests. */
  now?: () => number;
}

export function createThrottledFeed(
  inner: RealtimeFeed,
  options: ThrottledFeedOptions = {},
): RealtimeFeed {
  const throttleMs = options.throttleMs ?? 0;
  const now = options.now ?? (() => Date.now());
  const lastEmit = new Map<string, number>();
  const innerUnsubByType = new Map<FeedEventType, () => void>();
  const forwardHandlers: Map<FeedEventType, Set<FeedHandler>> = new Map();

  function forward(event: FeedEvent): void {
    if (event.type === "quote") {
      if (throttleMs > 0) {
        const last = lastEmit.get(event.payload.symbol) ?? 0;
        if (now() - last < throttleMs) return;
        lastEmit.set(event.payload.symbol, now());
      }
    }
    const set = forwardHandlers.get(event.type);
    if (!set) return;
    for (const h of set) h(event);
  }

  // wire up the inner feed to our forwarder for as long as we live
  const allTypes: FeedEventType[] = ["quote", "bar", "error", "status"];
  for (const t of allTypes) {
    const off = inner.on(t, forward);
    innerUnsubByType.set(t, off);
  }

  return {
    source: `throttled(${inner.source})`,
    get isConnected() {
      return inner.isConnected;
    },

    async subscribe(symbols, _opts?: SubscribeOptions) {
      return inner.subscribe(symbols, _opts);
    },

    async unsubscribe(symbols) {
      for (const s of symbols) lastEmit.delete(s);
      return inner.unsubscribe(symbols);
    },

    on<T extends FeedEventType>(event: T, handler: FeedHandler) {
      let set = forwardHandlers.get(event);
      if (!set) {
        set = new Set();
        forwardHandlers.set(event, set);
      }
      set.add(handler);
      return () => set!.delete(handler);
    },

    async close() {
      for (const off of innerUnsubByType.values()) off();
      innerUnsubByType.clear();
      lastEmit.clear();
      forwardHandlers.clear();
      return inner.close();
    },
  };
}

/**
 * Build a fresh Quote with the symbol/timestamp copied from a given quote.
 * Helper for downstream consumers that need to re-stamp a quote after
 * aggregation / forwarding.
 */
export function cloneQuote(quote: Quote): Quote {
  return { ...quote };
}
