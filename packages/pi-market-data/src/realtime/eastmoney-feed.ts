import type { FeedEvent, FeedEventType, FeedHandler, RealtimeFeed } from './types';
import type { Quote } from './types';

export interface EastmoneyFeedSocket {
  send(data: string): void;
  close(): void;
  onMessage(handler: (raw: string) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}
export type EastmoneySocketFactory = (url: string) => EastmoneyFeedSocket;
export interface EastmoneyFeedOptions { url: string; socketFactory?: EastmoneySocketFactory; now?: () => number; }

export function createEastmoneyFeed(options: EastmoneyFeedOptions): RealtimeFeed {
  const subscribed = new Set<string>();
  const handlers = new Map<FeedEventType, Set<FeedHandler>>();
  const now = options.now ?? (() => Date.now());
  let socket: EastmoneyFeedSocket | undefined;
  let connected = false;
  const emit = (event: FeedEvent) => { for (const handler of handlers.get(event.type) ?? []) handler(event); };
  const ensureSocket = () => {
    if (socket) return socket;
    if (!options.socketFactory) throw new Error('eastmoney realtime source requires an injected socket factory');
    socket = options.socketFactory(options.url);
    socket.onMessage((raw) => {
      try {
        const parsed = JSON.parse(raw) as { code?: string; price?: number; vol?: number; amount?: number } | Array<{ code?: string; price?: number; vol?: number; amount?: number }>;
        for (const item of (Array.isArray(parsed) ? parsed : [parsed])) {
          if (!item.code || !subscribed.has(item.code)) continue;
          const quote: Quote = { symbol: item.code, last: item.price ?? 0, volume: item.vol ?? 0, turnover: item.amount, timestamp: now() };
          emit({ type: 'quote', payload: quote });
        }
      } catch (error) { emit({ type: 'error', payload: error as Error }); }
    });
    socket.onError((error) => emit({ type: 'error', payload: error }));
    socket.onClose(() => { connected = false; emit({ type: 'status', payload: { status: 'disconnected' } }); });
    return socket;
  };
  return {
    source: 'eastmoney',
    get isConnected() { return connected; },
    async subscribe(symbols) {
      for (const symbol of symbols) subscribed.add(symbol);
      ensureSocket().send(JSON.stringify({ op: 'sub', codes: [...symbols] }));
      connected = true;
      emit({ type: 'status', payload: { status: 'connected' } });
      const captured = [...symbols];
      return async () => { for (const symbol of captured) subscribed.delete(symbol); };
    },
    async unsubscribe(symbols) {
      for (const symbol of symbols) subscribed.delete(symbol);
      socket?.send(JSON.stringify({ op: 'unsub', codes: symbols }));
    },
    on<T extends FeedEventType>(event: T, handler: FeedHandler) {
      const set = handlers.get(event) ?? new Set<FeedHandler>();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    async close() { subscribed.clear(); handlers.clear(); socket?.close(); socket = undefined; connected = false; },
  };
}
