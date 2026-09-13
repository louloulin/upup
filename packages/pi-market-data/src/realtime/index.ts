import { aggregateToBars } from './aggregator.js';
import type { AggregatorHandle } from './aggregator.js';
import { createEastmoneyFeed, type EastmoneyFeedOptions, type EastmoneySocketFactory } from './eastmoney-feed.js';
import { createMockFeed } from './mock-feed.js';
import { createThrottledFeed } from './throttled-feed.js';
import type { Bar, RealtimeFeed } from './types.js';

export * from './types.js';
export * from './mock-feed.js';
export * from './eastmoney-feed.js';
export * from './aggregator.js';

export type FeedSource = 'mock' | 'eastmoney';
export interface RealtimeSubscription {
  id: string;
  symbols: readonly string[];
  source: FeedSource;
  throttleMs: number;
  aggregateMs: number;
  createdAt: number;
  quoteCount: number;
  barCount: number;
  connected: boolean;
}
export interface RealtimeSubscriptionManagerOptions {
  now?: () => number;
  socketFactory?: EastmoneySocketFactory;
  onQuote?: (quote: import('./types.js').Quote, subscription: RealtimeSubscription) => void;
  onBar?: (bar: Bar, subscription: RealtimeSubscription) => void;
}

export function normalizeRealtimeSymbols(symbols: readonly string[]): string[] {
  const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0 || normalized.length > 50 || normalized.some((symbol) => !/^[A-Z0-9._:-]{1,24}$/.test(symbol))) throw new Error('symbols must contain 1-50 valid identifiers');
  return normalized;
}

function createFeed(source: FeedSource, options: RealtimeSubscriptionManagerOptions): RealtimeFeed {
  if (source === 'mock') return createMockFeed(options.now);
  const eastmoney: EastmoneyFeedOptions = { url: 'wss://push2.eastmoney.com/api/qt/stock/get', socketFactory: options.socketFactory, now: options.now };
  return createEastmoneyFeed(eastmoney);
}

export function createRealtimeSubscriptionManager(options: RealtimeSubscriptionManagerOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const subscriptions = new Map<string, { record: RealtimeSubscription; bundle: { feed: RealtimeFeed; aggregator?: AggregatorHandle; close(): Promise<void> }; offQuote: () => void; offBar?: () => void }>();
  let sequence = 0;
  return {
    async subscribe(input: { symbols: readonly string[]; throttleMs?: number; aggregateMs?: number; source?: FeedSource }) {
      const symbols = normalizeRealtimeSymbols(input.symbols);
      const throttleMs = input.throttleMs ?? 1000;
      const aggregateMs = input.aggregateMs ?? 0;
      if (!Number.isInteger(throttleMs) || throttleMs < 0 || throttleMs > 600_000) throw new Error('throttleMs must be an integer from 0 to 600000');
      if (!Number.isInteger(aggregateMs) || aggregateMs < 0 || aggregateMs > 86_400_000) throw new Error('aggregateMs must be an integer from 0 to 86400000');
      const source = input.source ?? 'mock';
      const inner = createFeed(source, options);
      const feed = throttleMs > 0 ? createThrottledFeed(inner, throttleMs, now) : inner;
      const aggregator = aggregateMs > 0 ? aggregateToBars(feed, aggregateMs) : undefined;
      const record: RealtimeSubscription = { id: `sub-${++sequence}`, symbols, source, throttleMs, aggregateMs, createdAt: now(), quoteCount: 0, barCount: 0, connected: false };
      const offQuote = feed.on('quote', (event) => {
        if (event.type !== 'quote') return;
        record.quoteCount += 1;
        options.onQuote?.(event.payload, record);
      });
      const offBar = aggregator?.onBar((bar) => { record.barCount += 1; options.onBar?.(bar, record); });
      try {
        await feed.subscribe(symbols);
      } catch (error) {
        aggregator?.stop();
        await feed.close();
        throw error;
      }
      record.connected = feed.isConnected;
      subscriptions.set(record.id, { record, bundle: { feed, aggregator, async close() { aggregator?.stop(); await feed.close(); } }, offQuote, offBar });
      return { ...record, symbols: [...record.symbols] };
    },
    async unsubscribe(id: string) {
      const active = subscriptions.get(id);
      if (!active) return { ok: false as const, error: `subscription not found: ${id}` };
      active.offQuote();
      active.offBar?.();
      await active.bundle.close();
      subscriptions.delete(id);
      return { ok: true as const, subscriptionId: id, quoteCount: active.record.quoteCount, barCount: active.record.barCount };
    },
    list() { return [...subscriptions.values()].map(({ record, bundle }) => ({ ...record, symbols: [...record.symbols], connected: bundle.feed.isConnected })); },
    async close() { for (const id of [...subscriptions.keys()]) await this.unsubscribe(id); },
  };
}
