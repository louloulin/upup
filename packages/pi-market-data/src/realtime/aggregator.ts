import type { Bar, FeedHandler, Quote, RealtimeFeed } from './types';

export interface AggregatorHandle {
  stop(): void;
  flush(): Bar[];
  onBar(handler: (bar: Bar) => void): () => void;
}

interface BarState { open: number; high: number; low: number; close: number; volume: number; start: number; end: number; }

export function aggregateToBars(feed: RealtimeFeed, periodMs: number): AggregatorHandle {
  const states = new Map<string, BarState>();
  const handlers = new Set<(bar: Bar) => void>();
  const build = (symbol: string, state: BarState): Bar => ({ symbol, ...state, periodMs });
  const emit = (bar: Bar) => { for (const handler of handlers) handler(bar); };
  const off = feed.on('quote', ((event: { type: 'quote'; payload: Quote }) => {
    const quote = event.payload;
    const start = Math.floor(quote.timestamp / periodMs) * periodMs;
    const current = states.get(quote.symbol);
    if (!current || current.start !== start) {
      if (current) emit(build(quote.symbol, current));
      states.set(quote.symbol, { open: quote.last, high: quote.last, low: quote.last, close: quote.last, volume: quote.volume, start, end: start + periodMs });
      return;
    }
    current.high = Math.max(current.high, quote.last);
    current.low = Math.min(current.low, quote.last);
    current.close = quote.last;
    current.volume = quote.volume;
  }) as FeedHandler);
  const flush = () => {
    const bars = [...states.entries()].map(([symbol, state]) => build(symbol, state));
    for (const bar of bars) emit(bar);
    states.clear();
    return bars;
  };
  return {
    stop() { off(); flush(); handlers.clear(); },
    flush,
    onBar(handler) { handlers.add(handler); return () => handlers.delete(handler); },
  };
}
