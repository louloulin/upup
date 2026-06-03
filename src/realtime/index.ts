/**
 * Realtime stream — RealtimeFeed factory and module entry.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import { createMockFeed, type MockFeed } from "./mock-feed.js";
import { createEastmoneyFeed, type EastmoneyFeedOptions } from "./eastmoney-feed.js";
import { createThrottledFeed } from "./throttled-feed.js";
import { aggregateToBars, type AggregatorHandle } from "./aggregator.js";
import type { RealtimeFeed } from "./types.js";

export * from "./types.js";
export { createMockFeed, type MockFeed } from "./mock-feed.js";
export { createEastmoneyFeed, type EastmoneyFeedOptions, type EastmoneyFeedSocket, type EastmoneySocketFactory, type EastmoneyMessage } from "./eastmoney-feed.js";
export { createThrottledFeed } from "./throttled-feed.js";
export { aggregateToBars, type AggregatorOptions, type AggregatorHandle } from "./aggregator.js";

export type FeedSource = "mock" | "eastmoney";

export interface CreateRealtimeFeedOptions {
  source: FeedSource;
  /** Client-side throttle in ms. 0 = disabled. Default 1000 (1Hz). */
  throttleMs?: number;
  /** OHLC bar aggregation period in ms. 0 = disabled. */
  aggregateMs?: number;
  /** Symbols to aggregate. If empty, aggregates every symbol seen. */
  aggregateSymbols?: string[];
  /** Required when source = 'eastmoney'. */
  eastmoney?: EastmoneyFeedOptions;
}

/** Result of `createRealtimeFeed` — the underlying feed plus the aggregator handle (if any). */
export interface RealtimeFeedBundle {
  feed: RealtimeFeed;
  aggregator?: AggregatorHandle;
  /** Convenience: close both the aggregator and the feed. */
  close(): Promise<void>;
}

export function createRealtimeFeed(options: CreateRealtimeFeedOptions): RealtimeFeedBundle {
  let inner: RealtimeFeed;
  if (options.source === "mock") {
    inner = createMockFeed();
  } else if (options.source === "eastmoney") {
    if (!options.eastmoney) {
      throw new Error("createRealtimeFeed: source='eastmoney' requires options.eastmoney");
    }
    inner = createEastmoneyFeed(options.eastmoney);
  } else {
    throw new Error(`createRealtimeFeed: unknown source '${options.source}'`);
  }

  const feed: RealtimeFeed =
    options.throttleMs && options.throttleMs > 0
      ? createThrottledFeed(inner, { throttleMs: options.throttleMs })
      : inner;

  const aggregator =
    options.aggregateMs && options.aggregateMs > 0
      ? aggregateToBars(feed, {
          periodMs: options.aggregateMs,
          symbols: options.aggregateSymbols,
        })
      : undefined;

  return {
    feed,
    aggregator,
    async close() {
      aggregator?.stop();
      await feed.close();
    },
  };
}
