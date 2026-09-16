// Shared market types live in `./market-types` to break the 7-file cycle
// through this barrel (history, quote, technical, dry-run, provider-sla,
// provider-sla-runner all need these types).
import type { Market } from './market-types';
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
export { normalizeMarket, currencyForMarket, stableSeed } from './market-utils';

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
  createEastmoneyFeed,
  createRealtimeSubscriptionManager,
  eastmoneySecid,
  EASTMONEY_TRENDS_URL,
  normalizeRealtimeSymbols,
  type EastmoneyFeedOptions,
  type FeedSource,
  type RealtimeSubscription,
  type RealtimeSubscriptionManagerOptions,
} from './realtime/index';

export {
  createEastmoneyGate,
  eastmoneyGateFor,
  EastmoneyThrottleError,
  isEastmoneySocketReset,
  isEastmoneyThrottleError,
  resetEastmoneyGates,
  type EastmoneyGate,
  type EastmoneyGateOptions,
} from './eastmoney';

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
