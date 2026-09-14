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

export { sandboxBalance, sandboxPositions, sandboxQuote, sandboxStateFile } from './sandbox-read.js';
export type { SandboxBalance, SandboxPosition, SandboxQuote } from './sandbox-read.js';
export { NativeSandboxBroker, nativeSandboxStateFile } from './sandbox-trading.js';
export type { NativeOrderSide, NativeOrderType, NativeOrderStatus, NativeTimeInForce, NativeSandboxQuote, NativeSandboxOrder, NativeSandboxPosition, NativeSandboxBalance, NativePlaceOrderInput, NativeSandboxBrokerOptions } from './sandbox-trading.js';
export { compareNativeFunds, getNativeFundDetail, getNativeFundHoldings, getNativeFundManager, getNativeFundPerformance, getTopNativeFunds, searchNativeFunds, screenNativeFunds } from './fund-catalog.js';
export type { NativeFundComparisonItem, NativeFundComparisonPeriod, NativeFundComparisonResult } from './fund-catalog.js';
export { createInitialFundWatchlistState, followNativeFund, listNativeFollowedFunds, unfollowNativeFund } from './fund-watchlist.js';
export type { NativeFundWatchEntry, NativeFundWatchlistState } from './fund-watchlist.js';
export { createInitialFundAlertState, createNativeFundAlert, deleteNativeFundAlert, listNativeFundAlerts } from './fund-alerts.js';
export type { NativeFundAlert, NativeFundAlertState, NativeFundAlertType } from './fund-alerts.js';
export { getNativeAStockFinancials, listNativeAStockFinancialSymbols } from './astock-financials.js';
export type { NativeAStockFinancialPeriod, NativeAStockFinancials } from './astock-financials.js';
export { getNativeFinancialSnapshot, listNativeFinancialSymbols } from './financial-snapshot.js';
export type { NativeFinancialPeriod, NativeFinancialSnapshot } from './financial-snapshot.js';
export { getNativeAStockNews, listNativeAStockNewsSymbols } from './astock-news.js';
export type { NativeAStockNewsItem, NativeAStockNewsKind, NativeAStockNewsQuery, NativeAStockNewsResult } from './astock-news.js';
export { getNativeCompanyProfile, getNativeRisks, getNativeSectors } from './knowledge-snapshot.js';
export type { NativeCompanyProfile, NativeRiskAssessment, NativeRiskSeverity, NativeRiskType, NativeSectorAnalysis, NativeSectorOutlook } from './knowledge-snapshot.js';
export { calculateNativePnl, calculateNativeTax, calculateNativeTradesTax } from './tax-calculator.js';
export type { NativePnlResult, NativePnlTrade, NativePnlTradeInput, NativeTaxEstimate, NativeTaxInput, NativeTaxJurisdiction, NativeTradeTaxInput, NativeTradesTaxResult } from './tax-calculator.js';
export { listNativeInvestmentStrategies } from './strategy-catalog.js';
export type { NativeInvestmentStrategy, NativeStrategyQuery, NativeStrategyRiskTolerance, NativeStrategyTimeHorizon } from './strategy-catalog.js';
export { listNativeExecutionStrategies, runNativeStrategyBacktest, runNativeStrategyPaper, NATIVE_STRATEGY_METADATA } from './strategy-execution.js';
export type { NativeAlgoKind, NativeStrategyBacktestInput, NativeStrategyBacktestReport, NativeStrategyMetadata, NativeStrategyPaperTrade, NativeStrategyReport, NativeStrategyRunPaperInput } from './strategy-execution.js';
export { createInitialKnowledgeJournalState, getTrackedCompany, listTrackedCompanies, listTrackedSectors, trackNativeCompany, trackNativeSector } from './knowledge-journal.js';
export type { NativeKnowledgeJournalState, NativeTrackedCompany, NativeTrackedCompanyInput, NativeTrackedSector, NativeTrackedSectorInput } from './knowledge-journal.js';
export { NativeFilingsClient, readNativeFilings } from './filings.js';
export type { NativeFilingType, NativeFilingRecord, NativeReadFilingsInput, NativeReadFilingsResult, NativeFilingsClientOptions } from './filings.js';
export { NativeAltDataClient } from './alt-data.js';
export type { NativeAltDataSource, NativeAltDataEvent, NativeAltDataInput, NativeAltDataSearchInput, NativeAltDataFetcher, NativeAltDataClientOptions } from './alt-data.js';
export { NativeResearchDataClient, createNativeResearchDataAdapters, createTushareResearchDataFetcher } from './research-data.js';
export type { ResearchDataClientOptions, ResearchDataEnvelope, ResearchDataFreshness, ResearchMarket, TushareResearchFetcherOptions } from './research-data.js';
export { NativeEarningsTranscriptClient } from './earnings-transcripts.js';
export type { NativeEarningsTranscriptClientOptions, NativeEarningsTranscriptQuery, NativeTranscriptRef } from './earnings-transcripts.js';
export { NativeFundHistoryClient, getNativeFundHistoryForRange } from './fund-history.js';
export type { NativeFundHistoryClientOptions, NativeFundHistoryPoint } from './fund-history.js';

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
} from './fund-api.js';
export { BacktestEngine, backtestDCA, backtestLumpSum, backtestThreshold, compareBacktests, generateBacktestReport, getFundHistory } from './fund-backtest.js';
export type { BacktestConfig, BacktestResult, BacktestSnapshot } from './fund-backtest.js';
export { analyzeSectorAllocation, getFundHoldingAnalysis, getFundsHoldingStock, generateHoldingReport } from './fund-holdings-analysis.js';
export type { StockInfo, FundHoldingWithStock, StockFundMapping, SectorAllocation, FundHoldingAnalysis } from './fund-holdings-analysis.js';
export {
  screenFunds as screenFundsByCriteria,
  getFundRecommendations,
  compareFunds,
  getScreeningStrategies,
} from './fund-screening.js';
export type { ScreeningCriteria, FundRecommendation, FundRecommendationScore } from './fund-screening.js';
export {
  createPortfolio,
  getPortfolio,
  buyFund,
  sellFund,
  getTrades,
  resetPortfolio,
} from './fund-trade.js';
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
} from './fund-types.js';
