import { aggregateToBars } from './aggregator';
import type { AggregatorHandle } from './aggregator';
import { createEastmoneyFeed, type EastmoneyFeedOptions, type RealtimeFetcher } from './eastmoney-feed';
import { createThrottledFeed } from './throttled-feed';
import type { Bar, RealtimeFeed } from './types';

export * from './types';
export * from './eastmoney-feed';
export * from './aggregator';

/** The only realtime source: Eastmoney's public intraday SSE stream. */
export type FeedSource = 'eastmoney';
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
  fetcher?: RealtimeFetcher;
  onQuote?: (quote: import('./types').Quote, subscription: RealtimeSubscription) => void;
  onBar?: (bar: Bar, subscription: RealtimeSubscription) => void;
}

export function normalizeRealtimeSymbols(symbols: readonly string[]): string[] {
  const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0 || normalized.length > 50 || normalized.some((symbol) => !/^[A-Z0-9._:-]{1,24}$/.test(symbol))) throw new Error('symbols must contain 1-50 valid identifiers');
  return normalized;
}

export function createRealtimeSubscriptionManager(options: RealtimeSubscriptionManagerOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const feedOptions: EastmoneyFeedOptions = {
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    now,
  };
  const subscriptions = new Map<string, { record: RealtimeSubscription; bundle: { feed: RealtimeFeed; aggregator?: AggregatorHandle; close(): Promise<void> }; offQuote: () => void; offBar?: () => void }>();
  let sequence = 0;
  return {
    async subscribe(input: { symbols: readonly string[]; throttleMs?: number; aggregateMs?: number }) {
      const symbols = normalizeRealtimeSymbols(input.symbols);
      const throttleMs = input.throttleMs ?? 1000;
      const aggregateMs = input.aggregateMs ?? 0;
      if (!Number.isInteger(throttleMs) || throttleMs < 0 || throttleMs > 600_000) throw new Error('throttleMs must be an integer from 0 to 600000');
      if (!Number.isInteger(aggregateMs) || aggregateMs < 0 || aggregateMs > 86_400_000) throw new Error('aggregateMs must be an integer from 0 to 86400000');
      const source: FeedSource = 'eastmoney';
      const inner = createEastmoneyFeed(feedOptions);
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
