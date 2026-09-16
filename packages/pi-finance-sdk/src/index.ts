export type FinanceMarket = 'cn' | 'hk' | 'us' | 'fund' | 'crypto';
export type FinanceFreshness = 'realtime' | 'delayed' | 'historical' | 'cached' | 'offline';

export interface FinanceEvidence {
  id: string;
  source: string;
  retrievedAt: string;
  asOf?: string;
  query: string;
  freshness: FinanceFreshness;
  warnings: readonly string[];
  auditId: string;
}

export interface FinanceResult<T> {
  value: T;
  evidence: readonly FinanceEvidence[];
  warnings: readonly string[];
  auditId: string;
}

export function createEvidence(params: Omit<FinanceEvidence, 'warnings'> & { warnings?: readonly string[] }): FinanceEvidence {
  return { ...params, warnings: params.warnings ?? [] };
}

export function createFinanceResult<T>(value: T, evidence: readonly FinanceEvidence[], auditId: string): FinanceResult<T> {
  return {
    value,
    evidence,
    warnings: evidence.flatMap((item) => item.warnings),
    auditId,
  };
}

export { sandboxBalance, sandboxPositions, sandboxQuote, sandboxStateFile } from './sandbox-read';
export type { SandboxBalance, SandboxPosition, SandboxQuote } from './sandbox-read';
export { NativeSandboxBroker, nativeSandboxStateFile } from './sandbox-trading';
export type { NativeOrderSide, NativeOrderType, NativeOrderStatus, NativeTimeInForce, NativeSandboxQuote, NativeSandboxOrder, NativeSandboxPosition, NativeSandboxBalance, NativePlaceOrderInput, NativeSandboxBrokerOptions } from './sandbox-trading';
export { compareNativeFunds, getNativeFundDetail, getNativeFundHoldings, getNativeFundManager, getNativeFundPerformance, getTopNativeFunds, searchNativeFunds, screenNativeFunds } from './fund-catalog';
export type { NativeFundComparisonItem, NativeFundComparisonPeriod, NativeFundComparisonResult } from './fund-catalog';
export { createInitialFundWatchlistState, followNativeFund, listNativeFollowedFunds, unfollowNativeFund } from './fund-watchlist';
export type { NativeFundWatchEntry, NativeFundWatchlistState } from './fund-watchlist';
export { createInitialFundAlertState, createNativeFundAlert, deleteNativeFundAlert, listNativeFundAlerts } from './fund-alerts';
export type { NativeFundAlert, NativeFundAlertState, NativeFundAlertType } from './fund-alerts';
export { fetchNativeAStockFinancials, normalizeNativeAStockCode } from './astock-financials';
export type { NativeAStockFinancialPeriod, NativeAStockFinancials, NativeAStockFinancialsOptions } from './astock-financials';
export { fetchNativeFinancialSnapshot, normalizeNativeFinancialSymbol } from './financial-snapshot';
export type { NativeFinancialPeriod, NativeFinancialSnapshot, NativeFinancialSnapshotOptions } from './financial-snapshot';
export { fetchNativeAStockNews } from './astock-news';
export type { NativeAStockNewsItem, NativeAStockNewsKind, NativeAStockNewsOptions, NativeAStockNewsQuery, NativeAStockNewsResult } from './astock-news';
export { createEastmoneyResearchDataFetcher, eastmoneyResearchTarget } from './eastmoney-research';
export type { EastmoneyResearchFetcherOptions, EastmoneyResearchMarket } from './eastmoney-research';
export { createSecEdgarResearchDataFetcher } from './sec-edgar-research';
export type { SecEdgarResearchFetcherOptions } from './sec-edgar-research';
export { readEastmoneyJson, eastmoneyDatacenterUrl, eastmoneySecid } from './eastmoney-datacenter';
export { getNativeCompanyProfile, getNativeRisks, getNativeSectors } from './knowledge-snapshot';
export type { NativeCompanyProfile, NativeRiskAssessment, NativeRiskSeverity, NativeRiskType, NativeSectorAnalysis, NativeSectorOutlook } from './knowledge-snapshot';
export { calculateNativePnl, calculateNativeTax, calculateNativeTradesTax } from './tax-calculator';
export type { NativePnlResult, NativePnlTrade, NativePnlTradeInput, NativeTaxEstimate, NativeTaxInput, NativeTaxJurisdiction, NativeTradeTaxInput, NativeTradesTaxResult } from './tax-calculator';
export { listNativeInvestmentStrategies } from './strategy-catalog';
export type { NativeInvestmentStrategy, NativeStrategyQuery, NativeStrategyRiskTolerance, NativeStrategyTimeHorizon } from './strategy-catalog';
export { listNativeExecutionStrategies, runNativeStrategyBacktest, runNativeStrategyPaper, NATIVE_STRATEGY_METADATA } from './strategy-execution';
export type { NativeAlgoKind, NativeStrategyBacktestInput, NativeStrategyBacktestReport, NativeStrategyMetadata, NativeStrategyPaperTrade, NativeStrategyReport, NativeStrategyRunPaperInput } from './strategy-execution';
export { createInitialKnowledgeJournalState, getTrackedCompany, listTrackedCompanies, listTrackedSectors, trackNativeCompany, trackNativeSector } from './knowledge-journal';
export type { NativeKnowledgeJournalState, NativeTrackedCompany, NativeTrackedCompanyInput, NativeTrackedSector, NativeTrackedSectorInput } from './knowledge-journal';
export { NativeFilingsClient, readNativeFilings } from './filings';
export type { NativeFilingType, NativeFilingRecord, NativeReadFilingsInput, NativeReadFilingsResult, NativeFilingsClientOptions } from './filings';
export { NativeAltDataClient } from './alt-data';
export type { NativeAltDataSource, NativeAltDataEvent, NativeAltDataInput, NativeAltDataSearchInput, NativeAltDataFetcher, NativeAltDataClientOptions } from './alt-data';
export { NativeResearchDataClient, createNativeResearchDataAdapters, createTushareResearchDataFetcher } from './research-data';
export type { ResearchDataClientOptions, ResearchDataEnvelope, ResearchDataFreshness, ResearchMarket, TushareResearchFetcherOptions } from './research-data';
export { NativeEarningsTranscriptClient } from './earnings-transcripts';
export type { NativeEarningsTranscriptClientOptions, NativeEarningsTranscriptQuery, NativeTranscriptRef } from './earnings-transcripts';
export { NativeFundHistoryClient, getNativeFundHistoryForRange } from './fund-history';
export type { NativeFundHistoryClientOptions, NativeFundHistoryPoint } from './fund-history';

// ============================================================================
// Fund capabilities owned by this Pi Package. Public names remain stable for
// callers while implementation stays behind the package contract.
// ============================================================================
export {
  searchFunds,
  getFundBasic,
  getFundEstimatedValue,
  getFundPerformance,
  getFundHoldings,
  getFundManager,
  getFundManagers,
  screenFunds,
  searchFundsByType,
  getTopFunds,
} from './fund-api';
export { BacktestEngine, backtestDCA, backtestLumpSum, backtestThreshold, compareBacktests, generateBacktestReport, getFundHistory } from './fund-backtest';
export type { BacktestConfig, BacktestResult, BacktestSnapshot } from './fund-backtest';
export { analyzeSectorAllocation, getFundHoldingAnalysis, getFundsHoldingStock, generateHoldingReport } from './fund-holdings-analysis';
export type { StockInfo, FundHoldingWithStock, StockFundMapping, SectorAllocation, FundHoldingAnalysis } from './fund-holdings-analysis';
export {
  screenFunds as screenFundsByCriteria,
  getFundRecommendations,
  compareFunds,
  getScreeningStrategies,
} from './fund-screening';
export type { ScreeningCriteria, FundRecommendation, FundRecommendationScore } from './fund-screening';
export {
  createPortfolio,
  getPortfolio,
  buyFund,
  sellFund,
  getTrades,
  resetPortfolio,
} from './fund-trade';
export type {
  FundBasic,
  FundPerformance,
  FundHoldings,
  FundManager,
  FundSearchResult,
  Portfolio,
  PortfolioHolding,
  SimulatedTrade,
  FollowedFund,
  AlertConfig,
} from './fund-types';

// ============================================================================
// Investment-command runners (injected by pi-app at boot)
// ============================================================================

/**
 * Runner signature for a generic investment command.
 * Mirrors `@upup/pi-investment-workflow`'s `runInvestmentCommand`.
 */
export type PiFinanceCommandRunner = (name: string, args: string) => Promise<string | null>;

/**
 * One investment slash command as declared by the owning
 * `@upup/pi-investment-workflow` registry.
 *
 * The catalog is injected at boot so `registerPiFinanceCommands` registers
 * exactly the names/aliases the workflow package implements. Without this,
 * the two lists drift (the workflow registry grew to nine commands while the
 * extension still only registered five).
 */
export interface PiFinanceCommandSpec {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description?: string;
}

/**
 * Module-level state for the two runners consumed by
 * `registerPiFinanceCommands` in `./extensions/commands`.
 *
 * Why this lives here (in `src/`, not `extensions/`): the `extensions/`
 * subtree is bundled by `bun build` (no `.d.ts` emitted by `tsc` because
 * the build's `tsconfig.json` only includes `src/`). Pi-app imports
 * `setPiFinanceCommandRunners` from this package via `@upup/pi-finance-sdk`
 * (the main subpath) so the function gets proper type declarations.
 */
let _investRunner: ((args: string) => Promise<string>) | null = null;
let _genericRunner: PiFinanceCommandRunner | null = null;
let _commandCatalog: readonly PiFinanceCommandSpec[] | null = null;

export function setPiFinanceCommandRunners(options: {
  invest?: (args: string) => Promise<string>;
  generic?: PiFinanceCommandRunner;
  commands?: readonly PiFinanceCommandSpec[];
}): void {
  _investRunner = options.invest ?? null;
  _genericRunner = options.generic ?? null;
  _commandCatalog = options.commands ?? null;
}

export function getPiFinanceCommandRunners(): {
  readonly invest: ((args: string) => Promise<string>) | null;
  readonly generic: PiFinanceCommandRunner | null;
  readonly commands: readonly PiFinanceCommandSpec[] | null;
} {
  return { invest: _investRunner, generic: _genericRunner, commands: _commandCatalog };
}
