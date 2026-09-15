import type { FeedEvent, FeedEventType, FeedHandler, Quote, RealtimeFeed, SubscribeOptions } from './types';

export interface MockFeed extends RealtimeFeed {
  pushQuote(quote: Quote): void;
  pushQuotes(quotes: Quote[]): void;
  connect(): void;
  subscribedCount(): number;
}

export function createMockFeed(now: () => number = () => Date.now()): MockFeed {
  const subscribed = new Set<string>();
  const handlers = new Map<FeedEventType, Set<FeedHandler>>();
  let connected = false;
  const emit = (event: FeedEvent) => {
    for (const handler of handlers.get(event.type) ?? []) handler(event);
  };
  const feed: MockFeed = {
    source: 'mock',
    get isConnected() { return connected; },
    async subscribe(symbols: string[]) {
      for (const symbol of symbols) subscribed.add(symbol);
      if (!connected) feed.connect();
      const captured = new Set(symbols);
      return async () => { for (const symbol of captured) subscribed.delete(symbol); };
    },
    async unsubscribe(symbols) { for (const symbol of symbols) subscribed.delete(symbol); },
    on<T extends FeedEventType>(event: T, handler: FeedHandler) {
      const set = handlers.get(event) ?? new Set<FeedHandler>();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    async close() {
      connected = false;
      emit({ type: 'status', payload: { status: 'disconnected' } });
      subscribed.clear();
      handlers.clear();
    },
    pushQuote(quote) {
      if (!subscribed.has(quote.symbol)) return;
      emit({ type: 'quote', payload: quote.timestamp ? quote : { ...quote, timestamp: now() } });
    },
    pushQuotes(quotes) { for (const quote of quotes) feed.pushQuote(quote); },
    connect() {
      connected = true;
      emit({ type: 'status', payload: { status: 'connected' } });
    },
    subscribedCount() { return subscribed.size; },
  };
  return feed;
}
