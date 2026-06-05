/**
 * Realtime stream — RealtimeFeed factory and module entry.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

import { createMockFeed, type MockFeed } from "@upup/./mock-feed";
import { createEastmoneyFeed, type EastmoneyFeedOptions } from "@upup/./eastmoney-feed";
import { createThrottledFeed } from "@upup/./throttled-feed";
import { aggregateToBars, type AggregatorHandle } from "@upup/./aggregator";
import type { RealtimeFeed } from "@upup/./types";

export * from "@upup/./types";
export { createMockFeed, type MockFeed } from "@upup/./mock-feed";
export { createEastmoneyFeed, type EastmoneyFeedOptions, type EastmoneyFeedSocket, type EastmoneySocketFactory, type EastmoneyMessage } from "@upup/./eastmoney-feed";
export { createThrottledFeed } from "@upup/./throttled-feed";
export { aggregateToBars, type AggregatorOptions, type AggregatorHandle } from "@upup/./aggregator";

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
