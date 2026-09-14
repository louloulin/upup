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
}

export { FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, NativeMarketHistoryClient, getNativeMarketHistoryForRange } from './history.js';
export type { MarketHistoryCache, MarketHistoryFetcher, MarketHistoryProvider, MarketHistoryRateLimiter, NativeMarketHistoryClientOptions, NativeMarketHistoryResult } from './history.js';
export { createDefaultMarketQuoteClient, InMemoryMarketQuoteCache, JsonFileMarketQuoteTrendStore, NativeMarketQuoteClient } from './quote.js';
export type { MarketQuoteCache, NativeMarketQuote, NativeMarketQuoteClientOptions, NativeMarketQuoteResult, NativeMarketQuoteMetrics, NativeMarketQuoteSample, NativeMarketQuoteTrendBucket, NativeMarketQuoteTrendStore } from './quote.js';
export { getProviderSlaStorePath, JsonFileProviderSlaStore, loadProviderSlaStore, providerSla, runProviderSlaJob } from './provider-sla.js';
export type { ProviderSlaJob, ProviderSlaProbe, ProviderSlaRunResult, ProviderSlaRunStatus, ProviderSlaStore } from './provider-sla.js';
export { startProviderSlaRunner } from './provider-sla-runner.js';
export type { ProviderSlaRunner, ProviderSlaRunnerOptions } from './provider-sla-runner.js';

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

export function makeFixtureQuote(symbol: string, marketValue: string | undefined, auditId: string): { value: MarketQuote; evidence: MarketEvidence } {
  const market = normalizeMarket(marketValue);
  const price = Number((20 + stableSeed(symbol) / 100).toFixed(2));
  const asOf = '2026-09-12';
  return {
    value: { symbol, market, price, currency: currencyForMarket(market), asOf, source: 'upup-fixture://market-data/quote', freshness: 'historical' },
    evidence: { id: `market-data:${auditId}:quote`, source: 'upup-fixture://market-data/quote', provider: 'fixture-market-data', retrievedAt: '2026-09-13T00:00:00.000Z', asOf, query: symbol, dataFreshness: 'historical', auditId },
  };
}

export function makeFixtureBars(symbol: string, startDate: string, limit: number, auditId: string): { value: MarketBar[]; evidence: MarketEvidence } {
  const seed = stableSeed(symbol);
  const base = 20 + seed / 100;
  const value = Array.from({ length: Math.min(Math.max(limit, 1), 30) }, (_, index) => {
    const close = Number((base + index * 0.13).toFixed(2));
    return { date: `${startDate.slice(0, 8)}${String(Math.min(28, index + 1)).padStart(2, '0')}`, open: Number((close - 0.2).toFixed(2)), high: Number((close + 0.4).toFixed(2)), low: Number((close - 0.5).toFixed(2)), close, volume: 100000 + seed * 10 + index * 1000 };
  });
  return {
    value,
    evidence: { id: `market-data:${auditId}:history`, source: 'upup-fixture://market-data/history', provider: 'fixture-market-data', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: value.at(-1)?.date ?? startDate, query: `${symbol}:${startDate}`, dataFreshness: 'historical', auditId },
  };
}

export function isTradingDay(date: string, market: Market): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (market === 'cn' && date === '2026-10-01') return false;
  if (market === 'us' && date === '2026-07-04') return false;
  return true;
}

export { getStockSnapshot, screenStockSnapshot, screenerAsOf } from './screener.js';
export { getMarketStructureSnapshot, querySectorSnapshot } from './market-insights.js';
export { buildTechnicalSnapshot, makeTechnicalSnapshot } from './technical.js';
export type { ScreeningStock, StockScreenInput, ScreenerMarket, ScreenerPerformance } from './screener.js';
export type { MarketStructureSnapshot, MarketStructureType, SectorQueryType, SectorSnapshot } from './market-insights.js';
export type { TechnicalBar, TechnicalPeriod, TechnicalSnapshot } from './technical.js';
export {
  deterministicScreenParser,
  executeNaturalLanguageScreen,
  NATURAL_LANGUAGE_SCREEN_UNIVERSE,
  runNaturalLanguageScreen,
} from './natural-language-screen.js';
export type {
  NaturalLanguageScreenOutput,
  NaturalLanguageScreenParser,
  NaturalLanguageScreenResult,
  RealtimeScreenFetcher,
  ScreenFilterClause,
  ScreenFilterSpec,
  ScreenStockRow,
  ScreenUniverse,
} from './natural-language-screen.js';
export { appendKairosEvent, classifyKairosTopic, createInitialKairosJournalState, listKairosEvents, summarizeKairos } from './kairos-journal.js';
export type { KairosEventKind, NativeKairosEvent, NativeKairosJournalState } from './kairos-journal.js';
export {
  createRealtimeSubscriptionManager,
  normalizeRealtimeSymbols,
  type FeedSource,
  type RealtimeSubscription,
  type RealtimeSubscriptionManagerOptions,
} from './realtime/index.js';

export {
  DRY_RUN_AUDIT_TAG,
  DRY_RUN_FRESHNESS,
  DRY_RUN_SOURCE_HISTORY,
  DRY_RUN_SOURCE_QUOTE,
  DryRunMarketHistoryClient,
  DryRunMarketQuoteClient,
  dryRunQuoteSnapshot,
  isDryRunSource,
  isResolvedMarketHistoryDryRun,
  isResolvedMarketQuoteDryRun,
  makeDryRunHistoryResult,
  makeDryRunQuoteResult,
  quoteMarketFromSymbol,
  resolveDryRunActivation,
  resolveMarketHistoryClient,
  resolveMarketQuoteClient,
  shouldAutoActivateDryRun,
} from './dry-run.js';
export type {
  DryRunClientMetrics,
  DryRunHistoryResult,
  DryRunOptions,
  DryRunQuoteResult,
  DryRunQuoteSnapshot,
  ResolveMarketHistoryClientOptions,
  ResolveMarketQuoteClientOptions,
  ResolvedMarketHistoryClient,
  ResolvedMarketQuoteClient,
} from './dry-run.js';
