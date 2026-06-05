/**
 * Realtime stream types and interface.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/realtime-stream
 */

export type FeedEventType = "quote" | "bar" | "error" | "status";

export interface Quote {
  symbol: string;
  /** Last traded price. */
  last: number;
  /** Cumulative traded volume for the day. */
  volume: number;
  /** Turnover in CNY. */
  turnover?: number;
  /** Best bid (price, size). */
  bid?: { price: number; size: number };
  /** Best ask. */
  ask?: { price: number; size: number };
  /** Quote timestamp. */
  timestamp: number;
}

export interface Bar {
  symbol: string;
  /** Bar open. */
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Bar start timestamp (ms). */
  start: number;
  /** Bar end timestamp (ms). */
  end: number;
  /** Bar period in ms (e.g. 5000 = 5s). */
  periodMs: number;
}

export type FeedEvent =
  | { type: "quote"; payload: Quote }
  | { type: "bar"; payload: Bar }
  | { type: "error"; payload: Error }
  | { type: "status"; payload: { status: "connected" | "disconnected" | "reconnecting"; detail?: string } };

export type FeedHandler = (event: FeedEvent) => void;

export interface SubscribeOptions {
  /** Per-symbol throttle in ms. Drops intermediate quotes within the window. */
  throttleMs?: number;
  /** OHLC bar period in ms. When set, emits 'bar' events aggregated from raw quotes. */
  aggregateMs?: number;
}

export interface RealtimeFeed {
  /** Subscribe to one or more symbols. Returns an unsubscribe handle. */
  subscribe(symbols: string[], options?: SubscribeOptions): Promise<() => void>;
  /** Unsubscribe from a previously-subscribed set of symbols. */
  unsubscribe(symbols: string[]): Promise<void>;
  /** Register a typed event handler. Returns an unsubscribe handle. */
  on<T extends FeedEventType>(event: T, handler: FeedHandler): () => void;
  /** Close the feed and release all resources. */
  close(): Promise<void>;
  /** Source name (e.g. "eastmoney", "mock"). */
  readonly source: string;
  /** Whether the underlying connection is open. */
  readonly isConnected: boolean;
}

export const DEFAULT_THROTTLE_MS = 1000;
export const DEFAULT_AGGREGATE_MS = 0; // 0 = no aggregation
