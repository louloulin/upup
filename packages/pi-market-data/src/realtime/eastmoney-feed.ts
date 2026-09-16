import { eastmoneyGateFor, eastmoneySecid } from '../eastmoney';
import type { FeedEvent, FeedEventType, FeedHandler, Quote, RealtimeFeed } from './types';

/**
 * Real Eastmoney (东方财富) intraday stream.
 *
 * `push2.eastmoney.com/api/qt/stock/trends2/sse` is a public
 * `text/event-stream` endpoint: it pushes the day's minute trends for one
 * `secid`, then keeps appending new rows as the market prints. No credentials
 * and no hand-injected socket are required — this replaces the previous mock
 * feed (fabricated quotes) and the placeholder socket protocol that had to be
 * wired by the host before anything streamed.
 */
export const EASTMONEY_TRENDS_URL = 'https://push2.eastmoney.com/api/qt/stock/trends2/sse';
/**
 * The endpoint only serves this exact parameter set: any other `fields1` /
 * `fields2` combination (and a missing `ut`) is answered with an
 * `ECONNRESET` instead of a stream. fields2 = 时间,开盘,收盘,最高,最低.
 */
const TRENDS_FIELDS1 = 'f1,f2,f3,f4';
const TRENDS_FIELDS2 = 'f51,f52,f53,f54,f55';
const TRENDS_UT = 'fa5fd1943c7b386f172d6893dbfba10b';

/** Minimal fetch shape shared with the other providers (Bun's `fetch` includes statics). */
export type RealtimeFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EastmoneyFeedOptions {
  readonly url?: string;
  readonly fetcher?: RealtimeFetcher;
  readonly now?: () => number;
  /** secid resolver; overridable so tests can pin the mapping. */
  readonly secid?: (symbol: string) => string;
}

export { eastmoneySecid };

function framePayloads(frame: string): string[] {
  const payloads: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice('data:'.length).trim();
    if (payload) payloads.push(payload);
  }
  return payloads;
}

interface EastmoneyTrendFrame {
  readonly data?: { readonly trends?: readonly string[] } | null;
}

interface StreamState {
  readonly controller: AbortController;
  lastRowKey?: string;
}

export function createEastmoneyFeed(options: EastmoneyFeedOptions = {}): RealtimeFeed {
  const url = options.url ?? EASTMONEY_TRENDS_URL;
  const fetcher: RealtimeFetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const resolveSecid = options.secid ?? eastmoneySecid;
  const now = options.now ?? (() => Date.now());
  const handlers = new Map<FeedEventType, Set<FeedHandler>>();
  const streams = new Map<string, StreamState>();
  const subscribed = new Set<string>();
  const emit = (event: FeedEvent) => { for (const handler of [...(handlers.get(event.type) ?? [])]) handler(event); };

  const emitRow = (symbol: string, state: StreamState, row: string): void => {
    const [stamp, , close, high, low, volume, amount] = row.split(',');
    if (!stamp || state.lastRowKey === stamp) return;
    const last = Number(close);
    if (!Number.isFinite(last) || last <= 0) return;
    state.lastRowKey = stamp;
    // Eastmoney reports A-share volume in 手 (100-share lots) and amount in CNY;
    // values are forwarded as reported by the provider.
    const quote: Quote = {
      symbol,
      last,
      volume: Number.isFinite(Number(volume)) ? Number(volume) : 0,
      ...(Number.isFinite(Number(amount)) ? { turnover: Number(amount) } : {}),
      ...(Number.isFinite(Number(high)) && Number.isFinite(Number(low)) ? { bid: { price: Number(low), size: 0 }, ask: { price: Number(high), size: 0 } } : {}),
      timestamp: Date.parse(`${stamp.replace(' ', 'T')}:00+08:00`) || now(),
    };
    emit({ type: 'quote', payload: quote });
  };

  const readStream = async (symbol: string, body: ReadableStream<Uint8Array>, state: StreamState): Promise<void> => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const payload of framePayloads(frame)) {
            try {
              const parsed = JSON.parse(payload) as EastmoneyTrendFrame;
              const rows = parsed.data?.trends ?? [];
              const latest = rows.at(-1);
              if (latest) emitRow(symbol, state, latest);
            } catch (error) {
              emit({ type: 'error', payload: error instanceof Error ? error : new Error(String(error)) });
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (!state.controller.signal.aborted) emit({ type: 'error', payload: error instanceof Error ? error : new Error(String(error)) });
    } finally {
      if (streams.get(symbol) === state) {
        streams.delete(symbol);
        if (streams.size === 0) emit({ type: 'status', payload: { status: 'disconnected' } });
      }
    }
  };

  const openStream = async (symbol: string): Promise<void> => {
    const streamUrl = new URL(url);
    streamUrl.searchParams.set('secid', resolveSecid(symbol));
    streamUrl.searchParams.set('fields1', TRENDS_FIELDS1);
    streamUrl.searchParams.set('fields2', TRENDS_FIELDS2);
    streamUrl.searchParams.set('ndays', '1');
    streamUrl.searchParams.set('iscr', '0');
    streamUrl.searchParams.set('ut', TRENDS_UT);
    const controller = new AbortController();
    // The public stream resets the connection when it throttles a client, so a
    // single retry absorbs the common transient reset before failing closed.
    let response: Response | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
      try {
        // The connect goes through the shared push2 gate: an SSE open is a
        // request like any other, and it must not overlap a quote.
        const candidate = await eastmoneyGateFor(streamUrl).run(() => fetcher(streamUrl, {
          signal: controller.signal,
          headers: { Accept: 'text/event-stream', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' },
        }));
        if (candidate.ok) response = candidate;
        else lastError = new Error(`${candidate.status} ${candidate.statusText}`);
      } catch (error) {
        lastError = error;
      }
      if (!response && attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!response) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`Eastmoney realtime stream failed for ${symbol}: ${reason}`);
    }
    if (!response.body) throw new Error(`Eastmoney realtime stream returned no body for ${symbol}`);
    const state: StreamState = { controller };
    streams.set(symbol, state);
    void readStream(symbol, response.body, state);
  };

  const closeStream = async (symbol: string): Promise<void> => {
    const state = streams.get(symbol);
    if (!state) return;
    streams.delete(symbol);
    state.controller.abort();
    if (streams.size === 0) emit({ type: 'status', payload: { status: 'disconnected' } });
  };

  return {
    source: 'eastmoney',
    get isConnected() { return [...streams.values()].some((state) => !state.controller.signal.aborted); },
    async subscribe(symbols) {
      const added: string[] = [];
      try {
        for (const symbol of symbols) {
          if (streams.has(symbol)) { subscribed.add(symbol); continue; }
          await openStream(symbol);
          streams.get(symbol)!.controller.signal.addEventListener('abort', () => subscribed.delete(symbol), { once: true });
          subscribed.add(symbol);
          added.push(symbol);
        }
      } catch (error) {
        for (const symbol of added) await closeStream(symbol);
        throw error;
      }
      emit({ type: 'status', payload: { status: 'connected' } });
      const captured = [...symbols];
      return async () => { for (const symbol of captured) { subscribed.delete(symbol); await closeStream(symbol); } };
    },
    async unsubscribe(symbols) {
      for (const symbol of symbols) { subscribed.delete(symbol); await closeStream(symbol); }
    },
    on<T extends FeedEventType>(event: T, handler: FeedHandler) {
      const set = handlers.get(event) ?? new Set<FeedHandler>();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    async close() {
      for (const symbol of [...streams.keys()]) await closeStream(symbol);
      subscribed.clear();
      handlers.clear();
    },
  };
}
