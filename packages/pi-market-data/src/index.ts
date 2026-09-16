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

export { buildTechnicalSnapshot } from './technical';
export {
  fetchEastmoneyBoardList,
  fetchEastmoneyStockIndustry,
  getMarketStructureSnapshot,
  querySectorSnapshot,
  MarketStructureUnavailableError,
} from './market-structure-eastmoney';
export type { BoardRow, MarketStructureParams, MarketStructureSnapshot, MarketStructureType, SectorListSnapshot, SectorMember, SectorQueryType, SectorSnapshot } from './market-structure-eastmoney';
export {
  asScreenerMarket,
  createEastmoneyScreenLoader,
  defaultEastmoneyScreenLoader,
  EASTMONEY_CLIST_URL,
  EASTMONEY_SCREEN_SEGMENTS,
  EASTMONEY_SUGGEST_URL,
  EASTMONEY_XUANGU_URL,
  eastmoneyScreenUniverseFields,
  fetchEastmoneyScreenRows,
  resetEastmoneyScreenLoader,
  resolveEastmoneyBoard,
  screenEastmoneyStocks,
  ScreenerUnavailableError,
  selectScreenerRows,
} from './screen-eastmoney';
export type { ScreenerFetchResult, ScreenerMarket, ScreenerRow, ScreenerRowLoader, ScreenerRowRequest } from './screen-eastmoney';
export type { TechnicalBar, TechnicalPeriod, TechnicalSnapshot } from './technical';
export {
  assertScreenFiltersSupported,
  deterministicScreenParser,
  evaluateScreenFilter,
  executeNaturalLanguageScreen,
  extractScreenKeywords,
  runNaturalLanguageScreen,
  ScreenFilterUnsupportedError,
} from './natural-language-screen';
export type {
  NaturalLanguageScreenMetrics,
  NaturalLanguageScreenOutput,
  NaturalLanguageScreenParser,
  NaturalLanguageScreenResult,
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
