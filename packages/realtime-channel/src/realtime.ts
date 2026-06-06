/**
 * Realtime feed facade — unified entry point for feed creators and types.
 */
import { createEastmoneyFeed, type EastmoneyFeedOptions } from './eastmoney-feed.js';
import { createMockFeed, type MockFeedOptions } from './mock-feed.js';
import { createThrottledFeed } from './throttled-feed.js';
import { aggregateToBars } from './aggregator.js';
import type { RealtimeFeed, FeedSource, SubscribeOptions } from './types.js';

export { createEastmoneyFeed } from './eastmoney-feed.js';
export { createMockFeed } from './mock-feed.js';
export { createThrottledFeed } from './throttled-feed.js';
export { aggregateToBars } from './aggregator.js';
export type {
  RealtimeFeed,
  FeedEvent,
  FeedEventType,
  FeedSource,
  Quote,
  Bar,
  SubscribeOptions,
} from './types.js';

/**
 * RealtimeFeedBundle — a configured feed plus its handle.
 */
export interface RealtimeFeedBundle {
  feed: RealtimeFeed;
  source: FeedSource;
  aggregator?: { aggregate(bar: unknown): void };
  close(): void;
}

/**
 * Factory config for createRealtimeFeed.
 */
export interface CreateRealtimeFeedConfig {
  source: FeedSource;
  throttleMs?: number;
  aggregateMs?: number;
  eastmoney?: EastmoneyFeedOptions;
  mock?: MockFeedOptions;
}

/**
 * Factory: create a realtime feed bundle for the given config.
 */
export function createRealtimeFeed(config: CreateRealtimeFeedConfig): RealtimeFeedBundle {
  const options: SubscribeOptions = {
    throttleMs: config.throttleMs,
    aggregateMs: config.aggregateMs,
  };
  let feed: RealtimeFeed;
  switch (config.source) {
    case 'eastmoney':
      feed = createEastmoneyFeed(config.eastmoney ?? (options as any));
      break;
    case 'throttled':
      feed = createThrottledFeed(options as any);
      break;
    case 'mock':
    default:
      feed = createMockFeed(config.mock);
      break;
  }
  return {
    feed,
    source: config.source,
    close: () => feed.close(),
  };
}
