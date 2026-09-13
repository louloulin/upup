import type { FeedEvent, FeedEventType, FeedHandler, RealtimeFeed, SubscribeOptions } from './types.js';

export function createThrottledFeed(inner: RealtimeFeed, throttleMs: number, now: () => number = () => Date.now()): RealtimeFeed {
  const lastEmit = new Map<string, number>();
  const handlers = new Map<FeedEventType, Set<FeedHandler>>();
  const detach = (event: FeedEvent) => {
    if (event.type === 'quote' && throttleMs > 0) {
      const last = lastEmit.get(event.payload.symbol) ?? 0;
      const current = now();
      if (current - last < throttleMs) return;
      lastEmit.set(event.payload.symbol, current);
    }
    for (const handler of handlers.get(event.type) ?? []) handler(event);
  };
  const unsubs = (['quote', 'bar', 'error', 'status'] as const).map((event) => inner.on(event, detach));
  return {
    source: `throttled(${inner.source})`,
    get isConnected() { return inner.isConnected; },
    subscribe: (symbols, options) => inner.subscribe(symbols, options),
    async unsubscribe(symbols) { for (const symbol of symbols) lastEmit.delete(symbol); await inner.unsubscribe(symbols); },
    on<T extends FeedEventType>(event: T, handler: FeedHandler) {
      const set = handlers.get(event) ?? new Set<FeedHandler>();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    async close() {
      for (const unsubscribe of unsubs) unsubscribe();
      handlers.clear();
      lastEmit.clear();
      await inner.close();
    },
  };
}
