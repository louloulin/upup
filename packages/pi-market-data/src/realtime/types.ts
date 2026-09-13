export type FeedEventType = 'quote' | 'bar' | 'error' | 'status';

export interface Quote {
  symbol: string;
  last: number;
  volume: number;
  turnover?: number;
  bid?: { price: number; size: number };
  ask?: { price: number; size: number };
  timestamp: number;
}

export interface Bar {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  start: number;
  end: number;
  periodMs: number;
}

export type FeedEvent =
  | { type: 'quote'; payload: Quote }
  | { type: 'bar'; payload: Bar }
  | { type: 'error'; payload: Error }
  | { type: 'status'; payload: { status: 'connected' | 'disconnected' | 'reconnecting'; detail?: string } };

export type FeedHandler = (event: FeedEvent) => void;
export type SubscribeOptions = { throttleMs?: number; aggregateMs?: number };

export interface RealtimeFeed {
  subscribe(symbols: string[], options?: SubscribeOptions): Promise<() => void>;
  unsubscribe(symbols: string[]): Promise<void>;
  on<T extends FeedEventType>(event: T, handler: FeedHandler): () => void;
  close(): Promise<void>;
  readonly source: string;
  readonly isConnected: boolean;
}

export const DEFAULT_THROTTLE_MS = 1000;
export const DEFAULT_AGGREGATE_MS = 0;
