/**
 * Cross-cutting market types — extracted from `./index` so that the
 * internal modules (`history`, `quote`, `dry-run`, `technical`) can
 * import these types without inducing a 7-file cycle through the
 * barrel re-exports.
 */

export type Market = 'cn' | 'hk' | 'us' | 'fund' | 'crypto';
export type MarketFreshness = 'historical' | 'cached' | 'delayed' | 'realtime' | 'offline';

export interface MarketQuote {
  symbol: string;
  market: Market;
  price: number;
  currency: 'CNY' | 'HKD' | 'USD';
  asOf: string;
  source: string;
  freshness: MarketFreshness;
}

export interface MarketBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketEvidence {
  id: string;
  source: string;
  readonly provider?: string;
  retrievedAt: string;
  asOf: string;
  query: string;
  dataFreshness: MarketFreshness;
  auditId: string;
  /** Human-readable caveat: fallback source, truncation, delayed mirror, … */
  note?: string;
}
