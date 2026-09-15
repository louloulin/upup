// Shared market types live in `./market-types` to break the 7-file cycle
// through this barrel (history, quote, technical, dry-run, provider-sla,
// provider-sla-runner all need these types).
import type { Market, MarketBar, MarketEvidence, MarketQuote } from './market-types';
export type { Market, MarketFreshness, MarketQuote, MarketBar, MarketEvidence } from './market-types';

export { FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, NativeMarketHistoryClient, getNativeMarketHistoryForRange } from './history';
export type { MarketHistoryCache, MarketHistoryFetcher, MarketHistoryProvider, MarketHistoryRateLimiter, NativeMarketHistoryClientOptions, NativeMarketHistoryResult } from './history';
export { createDefaultMarketQuoteClient, InMemoryMarketQuoteCache, JsonFileMarketQuoteTrendStore, NativeMarketQuoteClient } from './quote';
export type { MarketQuoteCache, NativeMarketQuote, NativeMarketQuoteClientOptions, NativeMarketQuoteResult, NativeMarketQuoteMetrics, NativeMarketQuoteSample, NativeMarketQuoteTrendBucket, NativeMarketQuoteTrendStore } from './quote';
export { getProviderSlaStorePath, JsonFileProviderSlaStore, loadProviderSlaStore, providerSla, runProviderSlaJob } from './provider-sla';
export type { ProviderSlaJob, ProviderSlaProbe, ProviderSlaRunResult, ProviderSlaRunStatus, ProviderSlaStore } from './provider-sla';
export { startProviderSlaRunner } from './provider-sla-runner';
export type { ProviderSlaRunner, ProviderSlaRunnerOptions } from './provider-sla-runner';

// Shared market helpers live in `./market-utils` to break the cycle
// between this barrel and its child modules.
import { currencyForMarket, normalizeMarket, stableSeed } from './market-utils';
export { normalizeMarket, currencyForMarket, stableSeed } from './market-utils';

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

export { getStockSnapshot, screenStockSnapshot, screenerAsOf } from './screener';
export { getMarketStructureSnapshot, querySectorSnapshot } from './market-insights';
export { buildTechnicalSnapshot, makeTechnicalSnapshot } from './technical';
export type { ScreeningStock, StockScreenInput, ScreenerMarket, ScreenerPerformance } from './screener';
export type { MarketStructureSnapshot, MarketStructureType, SectorQueryType, SectorSnapshot } from './market-insights';
export type { TechnicalBar, TechnicalPeriod, TechnicalSnapshot } from './technical';
export {
  deterministicScreenParser,
  executeNaturalLanguageScreen,
  NATURAL_LANGUAGE_SCREEN_UNIVERSE,
  runNaturalLanguageScreen,
} from './natural-language-screen';
export type {
  NaturalLanguageScreenOutput,
  NaturalLanguageScreenParser,
  NaturalLanguageScreenResult,
  RealtimeScreenFetcher,
  ScreenFilterClause,
  ScreenFilterSpec,
  ScreenStockRow,
  ScreenUniverse,
} from './natural-language-screen';
export { appendKairosEvent, classifyKairosTopic, createInitialKairosJournalState, listKairosEvents, summarizeKairos } from './kairos-journal';
export type { KairosEventKind, NativeKairosEvent, NativeKairosJournalState } from './kairos-journal';
export {
  createRealtimeSubscriptionManager,
  normalizeRealtimeSymbols,
  type FeedSource,
  type RealtimeSubscription,
  type RealtimeSubscriptionManagerOptions,
} from './realtime/index';

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
} from './dry-run';
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
} from './dry-run';
