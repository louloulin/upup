/**
 * Cross-cutting market utilities — extracted from `./index` so that
 * `technical`, `dry-run`, `quote`, etc. can import `stableSeed`,
 * `normalizeMarket`, and `currencyForMarket` without pulling in the
 * barrel (which re-exports from those same modules → cycle).
 */

import type { Market, MarketQuote } from './market-types';

export function normalizeMarket(value: string | undefined): Market {
  if (value === 'hk' || value === 'us' || value === 'fund' || value === 'crypto') return value;
  return 'cn';
}

export function currencyForMarket(market: Market): MarketQuote['currency'] {
  if (market === 'hk') return 'HKD';
  if (market === 'us' || market === 'crypto') return 'USD';
  return 'CNY';
}

export function stableSeed(symbol: string): number {
  return [...symbol].reduce((seed, character) => (seed * 31 + character.codePointAt(0)!) % 10000, 17);
}
