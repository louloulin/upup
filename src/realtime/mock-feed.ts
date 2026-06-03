/**
 * In-memory mock RealtimeFeed.
 *
 * Useful for tests, offline development, and replays. The caller drives
 * the feed by pushing Quote events into `pushQuote()`. The feed fans them
 * out to subscribers. Throttling and aggregation are applied at the
 * outer layer (`throttled-feed`, `aggregator`) so this mock stays minimal.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import type {
  FeedEvent,
  FeedHandler,
  FeedEventType,
  Quote,
  RealtimeFeed,
  SubscribeOptions,
} from "./types.js";

export interface MockFeedOptions {
  /** Auto-connect on first subscribe. Default true. */
  autoConnect?: boolean;
  /** Optional clock for tests. */
  now?: () => number;
}

export interface MockFeed extends RealtimeFeed {
  /** Inject a quote into the feed. Fans out to subscribers of that symbol. */
  pushQuote(quote: Quote): void;
  /** Inject many quotes at once. */
  pushQuotes(quotes: Quote[]): void;
  /** Open the underlying "connection". */
  connect(): void;
  /** Number of currently-subscribed symbols (deduped). */
  subscribedCount(): number;
}

export function createMockFeed(options: MockFeedOptions = {}): MockFeed {
  const autoConnect = options.autoConnect ?? true;
  const now = options.now ?? (() => Date.now());
  const subscribed = new Set<string>();
  const handlers: Map<FeedEventType, Set<FeedHandler>> = new Map();
  let connected = false;

  function emit(event: FeedEvent): void {
    const set = handlers.get(event.type);
    if (!set) return;
    for (const h of set) {
      try {
        h(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[mock-feed] handler threw:", err);
      }
    }
  }

  function status(status: "connected" | "disconnected" | "reconnecting", detail?: string): void {
    emit({ type: "status", payload: { status, detail } });
  }

  const feed: MockFeed = {
    source: "mock",

    async subscribe(symbols, _options?: SubscribeOptions) {
      for (const s of symbols) subscribed.add(s);
      if (autoConnect && !connected) feed.connect();
      const captured = new Set(symbols);
      return async () => {
        for (const s of captured) subscribed.delete(s);
      };
    },

    async unsubscribe(symbols) {
      for (const s of symbols) subscribed.delete(s);
    },

    on<T extends FeedEventType>(event: T, handler: FeedHandler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => set!.delete(handler);
    },

    async close() {
      // emit disconnected BEFORE clearing handlers so subscribers see it
      connected = false;
      status("disconnected");
      subscribed.clear();
      handlers.clear();
    },

    pushQuote(quote) {
      if (!subscribed.has(quote.symbol)) return;
      // stamp timestamp if not provided (callers usually set it)
      const stamped: Quote = quote.timestamp ? quote : { ...quote, timestamp: now() };
      emit({ type: "quote", payload: stamped });
    },

    pushQuotes(quotes) {
      for (const q of quotes) feed.pushQuote(q);
    },

    connect() {
      connected = true;
      status("connected");
    },

    subscribedCount() {
      return subscribed.size;
    },

    get isConnected() {
      return connected;
    },
  };
  return feed;
}
