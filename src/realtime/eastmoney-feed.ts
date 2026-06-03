/**
 * Eastmoney (东方财富) RealtimeFeed adapter.
 *
 * Wraps the public Eastmoney WebSocket push for level-1 quotes. The actual
 * protocol requires a server endpoint URL and a token negotiated at login;
 * for the open-source build we expose the wiring and let the runtime
 * inject a connected WebSocket via `socketFactory`.
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

export interface EastmoneyMessage {
  /** Eastmoney internal market id (varies by security type). */
  mkt?: number;
  /** Eastmoney security code, e.g. "600519". */
  code?: string;
  /** Latest price. */
  price?: number;
  /** Day cumulative volume (in shares or hands; 1 hand = 100 shares for A-shares). */
  vol?: number;
  /** Turnover in CNY. */
  amount?: number;
  /** Bid 1..5 and Ask 1..5 packed as [bp1, bv1, ap1, av1, bp2, bv2, ap2, av2, ...]. */
  bidAsk?: number[];
}

export interface EastmoneyFeedSocket {
  send(data: string): void;
  close(): void;
  onMessage(handler: (raw: string) => void): void;
  onError(handler: (err: Error) => void): void;
  onClose(handler: () => void): void;
}

export type EastmoneySocketFactory = (url: string) => EastmoneyFeedSocket;

export interface EastmoneyFeedOptions {
  /** WebSocket URL (e.g. "wss://push2.eastmoney.com/api/qt/stock/get"). */
  url: string;
  /** Socket factory — defaults to a stub that throws (production must inject). */
  socketFactory?: EastmoneySocketFactory;
  /** Parser for incoming messages (defaults to JSON.parse + EastmoneyMessage shape). */
  parse?: (raw: string) => EastmoneyMessage | EastmoneyMessage[] | null;
  /** Optional clock for tests. */
  now?: () => number;
}

export function createEastmoneyFeed(options: EastmoneyFeedOptions): RealtimeFeed {
  const now = options.now ?? (() => Date.now());
  const subscribed = new Set<string>();
  const handlers: Map<FeedEventType, Set<FeedHandler>> = new Map();
  let socket: EastmoneyFeedSocket | null = null;
  let connected = false;

  function emit(event: FeedEvent): void {
    const set = handlers.get(event.type);
    if (!set) return;
    for (const h of set) {
      try {
        h(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[eastmoney-feed] handler threw:", err);
      }
    }
  }

  function ensureSocket(): EastmoneyFeedSocket {
    if (socket) return socket;
    if (!options.socketFactory) {
      throw new Error(
        "eastmoney-feed: no socketFactory provided. Inject one in production or use createMockFeed for tests.",
      );
    }
    const s = options.socketFactory(options.url);
    s.onMessage((raw) => {
      let parsed: ReturnType<NonNullable<EastmoneyFeedOptions["parse"]>>;
      try {
        parsed = options.parse ? options.parse(raw) : (JSON.parse(raw) as EastmoneyMessage | EastmoneyMessage[]);
      } catch (err) {
        emit({ type: "error", payload: err as Error });
        return;
      }
      if (!parsed) return;
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      for (const m of messages) {
        if (m.code && subscribed.has(m.code)) {
          const q: Quote = {
            symbol: m.code,
            last: m.price ?? 0,
            volume: m.vol ?? 0,
            turnover: m.amount,
            timestamp: now(),
          };
          emit({ type: "quote", payload: q });
        }
      }
    });
    s.onError((err) => emit({ type: "error", payload: err }));
    s.onClose(() => {
      connected = false;
      emit({ type: "status", payload: { status: "disconnected" } });
    });
    socket = s;
    return s;
  }

  return {
    source: "eastmoney",
    get isConnected() {
      return connected;
    },

    async subscribe(symbols, _opts?: SubscribeOptions) {
      for (const s of symbols) subscribed.add(s);
      const s = ensureSocket();
      // Real protocol: send subscription frame per symbol. We send a
      // single batch frame; production must adapt to the actual wire format.
      s.send(JSON.stringify({ op: "sub", codes: Array.from(symbols) }));
      connected = true;
      emit({ type: "status", payload: { status: "connected" } });
      const captured = new Set(symbols);
      return async () => {
        for (const c of captured) subscribed.delete(c);
      };
    },

    async unsubscribe(symbols) {
      for (const s of symbols) subscribed.delete(s);
      if (socket) socket.send(JSON.stringify({ op: "unsub", codes: Array.from(symbols) }));
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
      subscribed.clear();
      handlers.clear();
      if (socket) {
        socket.close();
        socket = null;
      }
      connected = false;
    },
  };
}

