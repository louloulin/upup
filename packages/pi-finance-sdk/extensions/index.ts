import { Type } from 'typebox';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { resolvePiCapabilityHost } from '@upup/pi-capability-registry';
import {
  PI_FINANCE_HOST_CAPABILITIES,
  PI_FINANCE_HOST_CONTRACT,
  PI_FINANCE_PACKAGE_NAME,
  PI_FINANCE_PACKAGE_VERSION,
  type PiFinanceHostBridge,
} from './host-contract.js';
import { registerPiFinanceCommands } from './commands.js';
import {
  getNativeFundDetail,
  getNativeFundHoldings,
  getNativeFundManager,
  getNativeFundPerformance,
  getTopNativeFunds,
  compareNativeFunds,
  searchNativeFunds,
  screenNativeFunds,
} from '../src/fund-catalog.js';
import {
  createInitialFundWatchlistState,
  followNativeFund,
  listNativeFollowedFunds,
  unfollowNativeFund,
  type NativeFundWatchlistState,
} from '../src/fund-watchlist.js';
import {
  createInitialFundAlertState,
  createNativeFundAlert,
  deleteNativeFundAlert,
  listNativeFundAlerts,
  type NativeFundAlertState,
  type NativeFundAlertType,
} from '../src/fund-alerts.js';
import { getNativeAStockFinancials, listNativeAStockFinancialSymbols } from '../src/astock-financials.js';
import { getNativeAStockNews, listNativeAStockNewsSymbols } from '../src/astock-news.js';
import { getNativeCompanyProfile, getNativeRisks, getNativeSectors, type NativeRiskSeverity, type NativeRiskType } from '../src/knowledge-snapshot.js';
import { calculateNativePnl, calculateNativeTax, calculateNativeTradesTax, type NativeTaxJurisdiction } from '../src/tax-calculator.js';
import { getNativeFinancialSnapshot, listNativeFinancialSymbols } from '../src/financial-snapshot.js';
import { listNativeInvestmentStrategies, type NativeStrategyRiskTolerance, type NativeStrategyTimeHorizon } from '../src/strategy-catalog.js';
import { readNativeFilings, type NativeFilingType } from '../src/filings.js';
import { NativeAltDataClient, type NativeAltDataSource } from '../src/alt-data.js';
import { NativeResearchDataClient } from '../src/research-data.js';
import { NativeSandboxBroker, type NativeOrderSide, type NativeOrderType, type NativeTimeInForce } from '../src/sandbox-trading.js';
import { listNativeExecutionStrategies, runNativeStrategyBacktest, runNativeStrategyPaper, type NativeAlgoKind } from '../src/strategy-execution.js';
import {
  createInitialKnowledgeJournalState,
  getTrackedCompany,
  listTrackedCompanies,
  listTrackedSectors,
  trackNativeCompany,
  trackNativeSector,
  type NativeKnowledgeJournalState,
} from '../src/knowledge-journal.js';

function getPiFinanceToolHost(events: { emit(channel: string, data: unknown): void; on(channel: string, handler: (data: unknown) => void): () => void }): PiFinanceHostBridge | undefined {
  const host = resolvePiCapabilityHost<PiFinanceHostBridge>(events, PI_FINANCE_PACKAGE_NAME, undefined);
  if (!host || host.contract !== PI_FINANCE_HOST_CONTRACT) return undefined;
  if (host.packageName !== PI_FINANCE_PACKAGE_NAME || host.packageVersion !== PI_FINANCE_PACKAGE_VERSION) return undefined;
  if (!host.sessionId || !PI_FINANCE_HOST_CAPABILITIES.every((capability) => host.capabilities.includes(capability))) return undefined;
  return host;
}

async function fetchNativeQuote(symbol: string, signal: AbortSignal, auditId: string, injectedFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, injectedQuote?: PiFinanceHostBridge['providers']['marketData']['getMarketQuote'], events?: { emit(channel: string, data: unknown): void; on(channel: string, handler: (data: unknown) => void): () => void }): Promise<{ symbol: string; bid: number; ask: number; last: number; timestamp: number; source: string; asOf: string; freshness: FinanceFreshness; evidence?: FinanceEvidence }> {
  const host = events ? getPiFinanceToolHost(events) : undefined;
  const structured = injectedQuote ?? host?.providers.marketData?.getMarketQuote;
  if (structured) {
    const result = await structured(symbol, undefined, signal, auditId);
    return { symbol: result.value.symbol, bid: result.value.bid, ask: result.value.ask, last: result.value.last, timestamp: Date.parse(`${result.value.asOf}T00:00:00Z`), source: result.evidence.source, asOf: result.value.asOf, freshness: result.value.freshness, evidence: createEvidence({ id: result.evidence.id, source: result.evidence.source, retrievedAt: result.evidence.retrievedAt, asOf: result.evidence.asOf, query: result.evidence.query, freshness: result.evidence.dataFreshness, auditId: result.evidence.auditId }) };
  }
  const fetcher = injectedFetcher ?? host?.providers.marketData?.getMarketQuoteFetcher?.();
  if (!fetcher) throw new Error('finance quote requires the session market-data transport');
  const normalized = symbol.trim().toUpperCase();
  const yahoo = /^\d{6}\.SH$/i.test(normalized) ? `${normalized.slice(0, -3)}.SS` : /^\d{6}\.(SZ|BJ)$/i.test(normalized) ? normalized : normalized;
  const response = await fetcher(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}`, { signal, headers: { Accept: 'application/json', 'User-Agent': 'UpUp-Pi-Finance/1.0' } });
  if (!response.ok) throw new Error(`finance quote request failed: ${response.status} ${response.statusText}`);
  const payload = await response.json() as { chart?: { result?: readonly ({ meta?: { regularMarketPrice?: number; regularMarketTime?: number } | null } | null)[] } };
  const meta = payload.chart?.result?.[0]?.meta;
  const last = meta?.regularMarketPrice;
  if (typeof last !== 'number' || !Number.isFinite(last) || last <= 0) throw new Error(`finance quote returned no price for ${normalized}`);
  const timestamp = typeof meta?.regularMarketTime === 'number' ? meta.regularMarketTime * 1000 : Date.now();
  return { symbol: normalized, bid: last, ask: last, last, timestamp, source: 'https://query1.finance.yahoo.com/v8/finance/chart', asOf: new Date(timestamp).toISOString().slice(0, 10), freshness: 'delayed' };
}

type FinanceFreshness = 'realtime' | 'delayed' | 'historical' | 'cached' | 'offline';

interface FinanceEvidence {
  id: string;
  source: string;
  market?: string;
  provider?: string;
  retrievedAt: string;
  asOf?: string;
  query: string;
  freshness: FinanceFreshness;
  warnings: readonly string[];
  auditId: string;
}

interface FinanceResult<T> {
  value: T;
  evidence: readonly FinanceEvidence[];
  warnings: readonly string[];
  auditId: string;
}

function createEvidence(params: Omit<FinanceEvidence, 'warnings'> & { warnings?: readonly string[] }): FinanceEvidence {
  return { ...params, warnings: params.warnings ?? [] };
}

function createFinanceResult<T>(value: T, evidence: readonly FinanceEvidence[], auditId: string): FinanceResult<T> {
  return { value, evidence, warnings: evidence.flatMap((item) => item.warnings), auditId };
}

const symbolParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or security identifier' }),
});
const queryParameters = Type.Object({
  query: Type.String({ minLength: 1, description: 'Research query' }),
});
const financialsParameters = Type.Object({ query: Type.String({ minLength: 1, maxLength: 500, description: 'Company name, ticker, or stock code plus the requested financial topic' }) });
const readFilingsParameters = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 500, description: 'SEC filing question or requested section' }),
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 10, description: 'US ticker or supported company name' })),
  filing_types: Type.Optional(Type.Array(Type.Union([Type.Literal('10-K'), Type.Literal('10-Q'), Type.Literal('8-K')]), { minItems: 1, maxItems: 3 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  items: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 32 }), { minItems: 1, maxItems: 10 })),
});
const researchMarketParameter = Type.Optional(Type.Union([Type.Literal('cn'), Type.Literal('hk'), Type.Literal('us'), Type.Literal('fund'), Type.Literal('crypto')]));
const researchTickerParameters = Type.Object({ ticker: Type.String({ minLength: 1, maxLength: 16 }), market: researchMarketParameter });
const estimatesParameters = Type.Object({ ticker: Type.String({ minLength: 1, maxLength: 16 }), market: researchMarketParameter, period: Type.Optional(Type.Union([Type.Literal('annual'), Type.Literal('quarterly')])) });
const researchFilingsParameters = Type.Object({ ticker: Type.String({ minLength: 1, maxLength: 16 }), market: researchMarketParameter, filing_type: Type.Optional(Type.Array(Type.Union([Type.Literal('10-K'), Type.Literal('10-Q'), Type.Literal('8-K')]), { minItems: 1, maxItems: 3 })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })) });
const altDataFetchParameters = Type.Object({
  source: Type.Union([Type.Literal('dragon-tiger'), Type.Literal('north-bound')]),
  symbols: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 20 }), { maxItems: 50 })),
  dateRange: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});
const altDataSearchParameters = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 200 }),
  sources: Type.Optional(Type.Array(Type.Union([Type.Literal('dragon-tiger'), Type.Literal('north-bound')]), { minItems: 1, maxItems: 2 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
const dateParameters = Type.Object({
  date: Type.String({ minLength: 10, maxLength: 10, description: 'ISO calendar date' }),
});
const emptyParameters = Type.Object({});
const investmentStrategiesParameters = Type.Object({
  risk_tolerance: Type.Optional(Type.Union([Type.Literal('conservative'), Type.Literal('moderate'), Type.Literal('aggressive')])),
  time_horizon: Type.Optional(Type.Union([Type.Literal('short'), Type.Literal('medium'), Type.Literal('long')])),
});
const tradeQuoteParameters = Type.Object({ symbol: Type.String({ minLength: 1, description: 'Symbol to quote' }) });
const placeTradeParameters = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
  side: Type.Union([Type.Literal('buy'), Type.Literal('sell')]),
  type: Type.Optional(Type.Union([Type.Literal('market'), Type.Literal('limit'), Type.Literal('stop'), Type.Literal('stop_limit')])),
  quantity: Type.Integer({ minimum: 1, maximum: 10_000_000 }),
  price: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  stopPrice: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  timeInForce: Type.Optional(Type.Union([Type.Literal('day'), Type.Literal('gtc'), Type.Literal('ioc'), Type.Literal('fok')])),
});
const cancelTradeParameters = Type.Object({ orderId: Type.String({ minLength: 1, maxLength: 200 }) });
const strategyRunPaperParameters = Type.Object({
  sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  algo: Type.Union([Type.Literal('twap'), Type.Literal('vwap'), Type.Literal('pov'), Type.Literal('is')]),
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
  side: Type.Union([Type.Literal('buy'), Type.Literal('sell')]),
  quantity: Type.Integer({ minimum: 1, maximum: 10_000_000 }),
  durationMinutes: Type.Integer({ minimum: 1, maximum: 480 }),
  referencePrice: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  childOrderType: Type.Optional(Type.Union([Type.Literal('market'), Type.Literal('limit')])),
  childLimitPrice: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  participationRate: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1 })),
});
const strategyListParameters = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })) });
const strategyBacktestParameters = Type.Object({
  algo: Type.Union([Type.Literal('twap'), Type.Literal('vwap'), Type.Literal('pov'), Type.Literal('is')]),
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
  side: Type.Union([Type.Literal('buy'), Type.Literal('sell')]),
  quantity: Type.Integer({ minimum: 1, maximum: 10_000_000 }),
  startDate: Type.String({ minLength: 10, maxLength: 10 }),
  endDate: Type.String({ minLength: 10, maxLength: 10 }),
  participationRate: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1 })),
  bars: Type.Array(Type.Object({ date: Type.String({ minLength: 10, maxLength: 10 }), close: Type.Number({ exclusiveMinimum: 0 }), volume: Type.Optional(Type.Number({ minimum: 0 })) }), { minItems: 2, maxItems: 10_000 }),
});
const fundSearchParameters = Type.Object({ keyword: Type.String({ minLength: 1, description: 'Fund name, code, or fund type' }) });
const fundScreenParameters = Type.Object({
  type: Type.Optional(Type.String()), min_scale: Type.Optional(Type.Number()), max_scale: Type.Optional(Type.Number()),
  min_return: Type.Optional(Type.Number()), sort_by: Type.Optional(Type.Union([Type.Literal('return'), Type.Literal('scale'), Type.Literal('rating'), Type.Literal('name')])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
const fundTopParameters = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })) });
const fundCompareParameters = Type.Object({
  fund_codes: Type.Array(Type.String({ minLength: 1, maxLength: 12 }), { minItems: 2, maxItems: 10 }),
  period: Type.Optional(Type.Union([Type.Literal('1M'), Type.Literal('3M'), Type.Literal('6M'), Type.Literal('1Y'), Type.Literal('3Y')])),
});
const fundCodeParameters = Type.Object({ fund_code: Type.String({ minLength: 1, maxLength: 12, description: 'Fund code' }) });
const fundFollowParameters = Type.Object({ fund_code: Type.String({ minLength: 1, maxLength: 12, description: 'Fund code' }), note: Type.Optional(Type.String({ maxLength: 200 })) });
const fundListParameters = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) });
const fundAlertCreateParameters = Type.Object({
  fund_code: Type.String({ minLength: 1, maxLength: 12 }),
  alert_type: Type.Union([Type.Literal('price_above'), Type.Literal('price_below'), Type.Literal('change_up'), Type.Literal('change_down'), Type.Literal('estimate_update')]),
  value: Type.Optional(Type.Number()),
});
const fundAlertListParameters = Type.Object({ fund_code: Type.Optional(Type.String({ minLength: 1, maxLength: 12 })) });
const fundAlertDeleteParameters = Type.Object({ alert_id: Type.String({ minLength: 1, maxLength: 200 }) });
const astockFinancialsParameters = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 40 }),
  period: Type.Optional(Type.String({ minLength: 4, maxLength: 8 })),
  start_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  end_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
});
const astockNewsParameters = Type.Object({
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 40, description: 'A-share code, six-digit code, Chinese company name, or market' })),
  start_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10, description: 'Start date YYYY-MM-DD or YYYYMMDD' })),
  end_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10, description: 'End date YYYY-MM-DD or YYYYMMDD' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});
const companyProfileParameters = Type.Object({ ticker: Type.String({ minLength: 1, maxLength: 20 }) });
const riskQueryParameters = Type.Object({
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
  severity: Type.Optional(Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high'), Type.Literal('critical')])),
  type: Type.Optional(Type.Union([Type.Literal('market'), Type.Literal('company'), Type.Literal('sector'), Type.Literal('portfolio')])),
});
const sectorQueryParameters = Type.Object({ name: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })) });
const trackCompanyParameters = Type.Object({
  ticker: Type.String({ minLength: 1, maxLength: 20 }), name: Type.String({ minLength: 1, maxLength: 160 }),
  sector: Type.String({ minLength: 1, maxLength: 80 }), industry: Type.String({ minLength: 1, maxLength: 120 }),
  market_cap: Type.Optional(Type.Number({ minimum: 0 })), summary: Type.String({ minLength: 1, maxLength: 4000 }),
  key_metrics: Type.Optional(Type.Record(Type.String({ maxLength: 80 }), Type.Number())),
  competitive_advantages: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 20 })),
  risks: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 20 })),
});
const trackSectorParameters = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }), description: Type.String({ minLength: 1, maxLength: 4000 }),
  trends: Type.Array(Type.String({ minLength: 1, maxLength: 240 }), { maxItems: 20 }),
  key_metrics: Type.Optional(Type.Record(Type.String({ maxLength: 80 }), Type.Number())),
  outlook: Type.Union([Type.Literal('bullish'), Type.Literal('bearish'), Type.Literal('neutral')]),
});
const taxJurisdiction = Type.Union([Type.Literal('us'), Type.Literal('china'), Type.Literal('hongkong'), Type.Literal('uk')]);
const capitalGainsTaxParameters = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 40 }), quantity: Type.Number({ exclusiveMinimum: 0 }),
  purchase_price: Type.Number({ exclusiveMinimum: 0 }), current_price: Type.Number({ exclusiveMinimum: 0 }),
  purchase_date: Type.String({ minLength: 10, maxLength: 10 }), as_of: Type.String({ minLength: 10, maxLength: 10 }),
  jurisdiction: Type.Optional(taxJurisdiction),
});
const tradesTaxParameters = Type.Object({
  trades: Type.Array(Type.Object({
    symbol: Type.String({ minLength: 1, maxLength: 40 }), quantity: Type.Number({ exclusiveMinimum: 0 }),
    purchase_price: Type.Number({ exclusiveMinimum: 0 }), sell_price: Type.Number({ exclusiveMinimum: 0 }),
    purchase_date: Type.String({ minLength: 10, maxLength: 10 }), sell_date: Type.String({ minLength: 10, maxLength: 10 }),
  }), { maxItems: 100 }),
  jurisdiction: Type.Optional(taxJurisdiction),
});
const pnlParameters = Type.Object({
  trades: Type.Array(Type.Object({
    symbol: Type.String({ minLength: 1, maxLength: 40 }), quantity: Type.Number({ exclusiveMinimum: 0 }),
    purchase_price: Type.Number({ exclusiveMinimum: 0 }), sell_price: Type.Number({ exclusiveMinimum: 0 }),
  }), { maxItems: 100 }),
  currency: Type.Optional(Type.String({ minLength: 1, maxLength: 8 })),
});

function evidenceResult<T>(toolCallId: string, query: string, source: string, value: T, asOf = '2026-09-12') {
  const evidence = createEvidence({
    id: `pi-finance-${source}-${query.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
    source: `upup-fixture://pi-finance-sdk/${source}`,
    retrievedAt: '2026-09-13T00:00:00.000Z',
    asOf,
    query,
    freshness: 'historical',
    auditId: toolCallId,
  });
  return createFinanceResult(value, [evidence], toolCallId);
}

function resultText(value: unknown): string {
  return JSON.stringify(value);
}

function createResearchClient(): NativeResearchDataClient {
  return new NativeResearchDataClient();
}

async function executeResearchTool(toolCallId: string, signal: AbortSignal, source: string, action: (client: NativeResearchDataClient) => Promise<string>) {
  if (signal.aborted) return { content: [{ type: 'text', text: `${source} request aborted` }], isError: true, details: { auditId: toolCallId } };
  try {
    const raw = await action(createResearchClient());
    const envelope = JSON.parse(raw) as { data: unknown; sourceUrls: string[]; market?: string; provider?: string; freshness: string; retrievedAt: string };
    const evidence = createEvidence({ id: `pi-finance:${toolCallId}:${source}`, source: envelope.sourceUrls[0] ?? 'https://api.financialdatasets.ai', ...(envelope.market ? { market: envelope.market } : {}), ...(envelope.provider ? { provider: envelope.provider } : {}), retrievedAt: envelope.retrievedAt, query: source, freshness: envelope.freshness as FinanceFreshness, warnings: ['Network data requires source-date verification before investment decisions.'], auditId: toolCallId });
    const result = createFinanceResult(envelope.data, [evidence], toolCallId);
    return { content: [{ type: 'text', text: resultText(result) }], details: result };
  } catch (error) {
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
  }
}

function createNativeSandboxBrokerLoader(quoteFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, quoteService?: PiFinanceHostBridge['providers']['marketData']['getMarketQuote']): () => Promise<NativeSandboxBroker> {
  let broker: NativeSandboxBroker | undefined;
  return async () => {
    if (!broker) {
      broker = new NativeSandboxBroker({
        quoteProvider: async (symbol) => {
          const quote = await fetchNativeQuote(symbol, new AbortController().signal, 'sandbox-quote', quoteFetcher, quoteService);
          return { symbol: quote.symbol, bid: quote.bid, ask: quote.ask, last: quote.last, timestamp: quote.timestamp };
        },
      });
      await broker.loadState();
    }
    return broker;
  };
}

async function confirmNativeTrade(context: Pick<ExtensionContext, 'hasUI' | 'ui'> | undefined, title: string, message: string, signal: AbortSignal): Promise<{ approved: boolean; reason: string }> {
  if (signal.aborted) return { approved: false, reason: 'trade request aborted' };
  if (!context?.hasUI || !context.ui) return { approved: false, reason: 'interactive approval is required; non-interactive Pi modes cannot place or cancel orders' };
  const approved = await context.ui.confirm(title, message, { signal });
  return { approved, reason: approved ? 'interactive approval granted' : 'interactive approval denied' };
}

export default function financeEvidenceExtension(pi: ExtensionAPI): void {
  const host = getPiFinanceToolHost(pi.events);
  const quoteFetcher = host?.providers.marketData?.getMarketQuoteFetcher?.();
  const quoteService = host?.providers.marketData?.getMarketQuote;
  const getNativeSandboxBroker = createNativeSandboxBrokerLoader(quoteFetcher, quoteService);
  registerPiFinanceCommands(pi);
  const altData = new NativeAltDataClient();
  const nativeAltDataResult = (toolCallId: string, query: string, value: unknown) => {
    const retrievedAt = new Date().toISOString();
    const evidence = createEvidence({ id: `pi-finance:${toolCallId}:alt-data`, source: `upup-pi://finance-sdk/${query}`, retrievedAt, asOf: retrievedAt.slice(0, 10), query, freshness: 'delayed', warnings: ['Alternative data is retrieved from a configured external source and may be delayed or incomplete; it is not investment advice.'], auditId: toolCallId });
    const result = createFinanceResult(value, [evidence], toolCallId);
    return { content: [{ type: 'text', text: resultText(result) }], details: result };
  };
  pi.registerTool({
    name: 'alt_data_fetch', label: 'Alternative Data Fetch',
    description: 'Fetch normalized dragon-tiger or north-bound alternative data using configured credentials. Results are delayed external data, not investment advice.',
    parameters: altDataFetchParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'alt_data_fetch request aborted' }], isError: true, details: { auditId: toolCallId } };
      try { return nativeAltDataResult(toolCallId, 'alt-data-fetch', await altData.fetch({ source: params.source as NativeAltDataSource, symbols: params.symbols, dateRange: params.dateRange, limit: params.limit }, signal)); }
      catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } }; }
    },
  });
  pi.registerTool({
    name: 'alt_data_search', label: 'Alternative Data Search',
    description: 'Search normalized alternative data across configured dragon-tiger and north-bound sources by title or symbol.',
    parameters: altDataSearchParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'alt_data_search request aborted' }], isError: true, details: { auditId: toolCallId } };
      try { return nativeAltDataResult(toolCallId, 'alt-data-search', await altData.search({ query: params.query, sources: params.sources as NativeAltDataSource[] | undefined, limit: params.limit }, signal)); }
      catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } }; }
    },
  });
  pi.registerTool({
    name: 'get_investment_strategies',
    label: 'Investment Strategies',
    description: 'List deterministic offline investment strategy guidance filtered by risk tolerance and time horizon. This is educational strategy metadata, not personalized investment advice.',
    parameters: investmentStrategiesParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Investment strategy request aborted' }], isError: true };
      const strategies = listNativeInvestmentStrategies({ riskTolerance: params.risk_tolerance as NativeStrategyRiskTolerance | undefined, timeHorizon: params.time_horizon as NativeStrategyTimeHorizon | undefined });
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:investment-strategies`, source: 'upup-pi://finance-sdk/investment-strategies', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: '2026-09-12', query: JSON.stringify(params), freshness: 'offline', warnings: ['Offline strategy metadata for education and research planning; not personalized investment advice.'], auditId: toolCallId });
      const result = createFinanceResult({ count: strategies.length, strategies }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  const KNOWLEDGE_JOURNAL_ENTRY = 'upup_pi_finance_knowledge_journal';
  let knowledgeState: NativeKnowledgeJournalState | undefined;
  const readKnowledgeState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }): NativeKnowledgeJournalState => {
    if (knowledgeState) return knowledgeState;
    const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const value = candidate as { type?: unknown; customType?: unknown; data?: unknown };
      return value.type === 'custom' && value.customType === KNOWLEDGE_JOURNAL_ENTRY && value.data && typeof value.data === 'object';
    }) as { data?: unknown } | undefined;
    const data = entry?.data;
    knowledgeState = data && typeof data === 'object' && (data as { schema?: unknown }).schema === 1
      ? data as NativeKnowledgeJournalState
      : createInitialKnowledgeJournalState();
    return knowledgeState;
  };
  const commitKnowledgeState = (state: NativeKnowledgeJournalState): void => {
    knowledgeState = state;
    if (typeof pi.appendEntry === 'function') pi.appendEntry(KNOWLEDGE_JOURNAL_ENTRY, state);
  };
  if (typeof pi.on === 'function') pi.on('session_start', (_event, context) => { knowledgeState = undefined; readKnowledgeState(context); });
  pi.registerTool({
    name: 'track_company',
    label: 'Track Company',
    description: 'Save a company research profile in the current Pi session journal. This does not fetch live data or provide personalized investment advice.',
    parameters: trackCompanyParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Company tracking request aborted' }], isError: true };
      try {
        const updatedAt = new Date().toISOString();
        const operation = trackNativeCompany(readKnowledgeState(context), { ticker: params.ticker, name: params.name, sector: params.sector, industry: params.industry, marketCap: params.market_cap, summary: params.summary, keyMetrics: params.key_metrics, competitiveAdvantages: params.competitive_advantages, risks: params.risks }, updatedAt);
        commitKnowledgeState(operation.state);
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:track-company`, source: 'upup-pi://finance-sdk/knowledge-journal/company', retrievedAt: updatedAt, asOf: updatedAt.slice(0, 10), query: params.ticker, freshness: 'cached', warnings: ['Session journal entry; values are user-provided research notes and are not independently verified.'], auditId: toolCallId });
        const result = createFinanceResult({ success: true, company: operation.company, companyCount: listTrackedCompanies(operation.state).length }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });
  pi.registerTool({
    name: 'track_sector',
    label: 'Track Sector',
    description: 'Save a sector research note in the current Pi session journal. This does not fetch live data or provide personalized investment advice.',
    parameters: trackSectorParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Sector tracking request aborted' }], isError: true };
      try {
        const updatedAt = new Date().toISOString();
        const operation = trackNativeSector(readKnowledgeState(context), { name: params.name, description: params.description, trends: params.trends, keyMetrics: params.key_metrics, outlook: params.outlook }, updatedAt);
        commitKnowledgeState(operation.state);
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:track-sector`, source: 'upup-pi://finance-sdk/knowledge-journal/sector', retrievedAt: updatedAt, asOf: updatedAt.slice(0, 10), query: params.name, freshness: 'cached', warnings: ['Session journal entry; values are user-provided research notes and are not independently verified.'], auditId: toolCallId });
        const result = createFinanceResult({ success: true, sector: operation.sector, sectorCount: listTrackedSectors(operation.state).length }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });
  pi.registerTool({
    name: 'get_knowledge_summary',
    label: 'Knowledge Summary',
    description: 'Summarize company and sector notes stored in the current Pi session journal together with available offline strategies.',
    parameters: emptyParameters,
    async execute(toolCallId, _params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Knowledge summary request aborted' }], isError: true };
      const state = readKnowledgeState(context);
      const companies = listTrackedCompanies(state);
      const sectors = listTrackedSectors(state);
      const strategies = listNativeInvestmentStrategies();
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:knowledge-summary`, source: 'upup-pi://finance-sdk/knowledge-journal/summary', retrievedAt: new Date().toISOString(), asOf: state.lastUpdated?.slice(0, 10), query: 'session knowledge summary', freshness: 'cached', warnings: ['Summary contains session journal notes and offline strategy metadata; notes are not independently verified.'], auditId: toolCallId });
      const result = createFinanceResult({ investmentKnowledge: { companies: companies.length, sectors: sectors.length, strategies: strategies.length, risks: 0, lastSync: state.lastUpdated ?? null }, companies, sectors, availableStrategies: strategies.map((strategy) => ({ id: strategy.id, name: strategy.name, suitableFor: strategy.suitableFor })) }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  const FUND_WATCHLIST_ENTRY = 'upup_pi_fund_watchlist';
  let watchlistState: NativeFundWatchlistState | undefined;
  const FUND_ALERTS_ENTRY = 'upup_pi_fund_alerts';
  let alertState: NativeFundAlertState | undefined;
  const readWatchlistState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }): NativeFundWatchlistState => {
    if (watchlistState) return watchlistState;
    const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const value = candidate as { type?: unknown; customType?: unknown; data?: unknown };
      return value.type === 'custom' && value.customType === FUND_WATCHLIST_ENTRY && value.data && typeof value.data === 'object';
    }) as { data?: unknown } | undefined;
    const data = entry?.data;
    watchlistState = data && typeof data === 'object' && (data as { schema?: unknown }).schema === 1
      ? data as NativeFundWatchlistState
      : createInitialFundWatchlistState();
    return watchlistState;
  };
  const commitWatchlistState = (state: NativeFundWatchlistState): void => {
    watchlistState = state;
    if (typeof pi.appendEntry === 'function') pi.appendEntry(FUND_WATCHLIST_ENTRY, state);
  };
  const readAlertState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }): NativeFundAlertState => {
    if (alertState) return alertState;
    const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const value = candidate as { type?: unknown; customType?: unknown; data?: unknown };
      return value.type === 'custom' && value.customType === FUND_ALERTS_ENTRY && value.data && typeof value.data === 'object';
    }) as { data?: unknown } | undefined;
    const data = entry?.data;
    alertState = data && typeof data === 'object' && (data as { schema?: unknown }).schema === 1
      ? data as NativeFundAlertState
      : createInitialFundAlertState();
    return alertState;
  };
  const commitAlertState = (state: NativeFundAlertState): void => {
    alertState = state;
    if (typeof pi.appendEntry === 'function') pi.appendEntry(FUND_ALERTS_ENTRY, state);
  };
  if (typeof pi.on === 'function') pi.on('session_start', (_event, context) => { watchlistState = undefined; alertState = undefined; readWatchlistState(context); readAlertState(context); });
  for (const definition of host?.providers.tools.getToolDefinitions({
    contract: PI_FINANCE_HOST_CONTRACT,
    packageName: PI_FINANCE_PACKAGE_NAME,
    packageVersion: PI_FINANCE_PACKAGE_VERSION,
    sessionId: host.sessionId,
    capability: 'tool-definitions',
  }) ?? []) {
    pi.registerTool(definition as never);
  }

  pi.on('session_before_compact', async (event, context) => {
    const financeContextEntry = [...context.sessionManager.getEntries()]
      .filter((entry) => entry.type === 'custom' && entry.customType === 'upup_finance_context')
      .at(-1);
    const financeContext = financeContextEntry && 'data' in financeContextEntry && financeContextEntry.data && typeof financeContextEntry.data === 'object'
      ? financeContextEntry.data
      : {
        ticker: null,
        market: null,
        asOf: null,
        assumptions: {},
        risks: [],
        evidence: [],
        unfinishedPhases: [],
      };
    const summary = [
      JSON.stringify({
        schema: 1,
        domain: 'finance',
        ...financeContext,
        compactionReason: event.reason,
        customInstructions: event.customInstructions ?? null,
      }),
    ].join('\n');
    return {
      compaction: {
        summary,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
        details: { domain: 'finance', schema: 1 },
      },
    };
  });

  pi.registerTool({
    name: 'finance_evidence_quote',
    label: 'Finance evidence quote',
    description: 'Return a provider-backed quote with auditable financial evidence metadata.',
    parameters: symbolParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) {
        return { content: [{ type: 'text', text: 'Quote request aborted' }], isError: true };
      }
      try {
        const quote = await fetchNativeQuote(params.symbol, signal, toolCallId, quoteFetcher, quoteService);
        const { evidence: structuredEvidence, ...quoteValue } = quote;
        const evidence = structuredEvidence ?? createEvidence({ id: `pi-finance:${toolCallId}:quote`, source: quote.source, retrievedAt: new Date().toISOString(), asOf: quote.asOf, query: params.symbol, freshness: quote.freshness, auditId: toolCallId });
        const result = createFinanceResult(quoteValue, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, policy: 'no-synthetic-fallback' } }; }
    },
  });
  pi.registerTool({
    name: 'get_trade_quote',
    label: 'Sandbox trade quote',
    description: 'Read a provider-backed quote for the sandbox without changing trading state.',
    parameters: tradeQuoteParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Trade quote request aborted' }], isError: true };
      try {
        const quote = await fetchNativeQuote(params.symbol, signal, toolCallId, quoteFetcher, quoteService);
        const { evidence: structuredEvidence, ...quoteValue } = quote;
        const evidence = structuredEvidence ?? createEvidence({ id: `pi-finance:${toolCallId}:trade-quote`, source: quote.source, retrievedAt: new Date().toISOString(), asOf: quote.asOf, query: params.symbol, freshness: quote.freshness, warnings: ['Sandbox quote is provider-backed and does not place an order.'], auditId: toolCallId });
        const result = createFinanceResult(quoteValue, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) { return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, policy: 'no-synthetic-fallback' } }; }
    },
  });
  pi.registerTool({
    name: 'get_trading_positions',
    label: 'Sandbox positions',
    description: 'Read persisted sandbox positions without changing trading state.',
    parameters: emptyParameters,
    async execute(toolCallId, _params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Positions request aborted' }], isError: true };
      const positions = await (await getNativeSandboxBroker()).getPositions();
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:positions`, source: 'upup-pi://finance-sdk/sandbox/positions', retrievedAt: new Date().toISOString(), query: 'sandbox positions', freshness: 'cached', auditId: toolCallId });
      const result = createFinanceResult(positions, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  pi.registerTool({
    name: 'get_trading_balance',
    label: 'Sandbox balance',
    description: 'Read persisted sandbox cash, market value, and equity without changing trading state.',
    parameters: emptyParameters,
    async execute(toolCallId, _params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Balance request aborted' }], isError: true };
      const balance = await (await getNativeSandboxBroker()).getBalance();
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:balance`, source: 'upup-pi://finance-sdk/sandbox/balance', retrievedAt: new Date().toISOString(), query: 'sandbox balance', freshness: 'cached', auditId: toolCallId });
      const result = createFinanceResult(balance, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  pi.registerTool({
    name: 'place_trade_order',
    label: 'Place sandbox trade order',
    description: 'Place a paper-trading order in the isolated sandbox. Every call requires an interactive confirmation; print, JSON, RPC, and other non-interactive modes are denied by default.',
    parameters: placeTradeParameters,
    executionMode: 'sequential',
    async execute(toolCallId, params, signal, _onUpdate, context) {
      const approval = await confirmNativeTrade(context, '确认模拟下单', `将以 sandbox 模拟${params.side === 'buy' ? '买入' : '卖出'} ${params.quantity} 股 ${params.symbol}（${params.type ?? 'market'}）。此操作会写入本地模拟账户。`, signal);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:trade-order`, source: 'upup-pi://finance-sdk/sandbox/order', retrievedAt: new Date().toISOString(), query: params.symbol, freshness: 'cached', warnings: ['Sandbox paper-trading write; no live broker is contacted.', approval.reason], auditId: toolCallId });
      if (!approval.approved) {
        const result = createFinanceResult({ status: 'rejected', reason: approval.reason }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: { ...result, policyAudit: { auditId: toolCallId, tool: 'place_trade_order', safetyLevel: 'dangerous', decision: 'approval_denied', reason: approval.reason } }, isError: true };
      }
      try {
        const broker = await getNativeSandboxBroker();
        const order = await broker.placeOrder({ symbol: params.symbol, side: params.side as NativeOrderSide, type: params.type as NativeOrderType | undefined, quantity: params.quantity, price: params.price, stopPrice: params.stopPrice, timeInForce: params.timeInForce as NativeTimeInForce | undefined });
        const result = createFinanceResult({ order }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: { ...result, policyAudit: { auditId: toolCallId, tool: 'place_trade_order', safetyLevel: 'dangerous', decision: 'approval_granted', reason: approval.reason } } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], details: { auditId: toolCallId, policyAudit: { auditId: toolCallId, tool: 'place_trade_order', safetyLevel: 'dangerous', decision: 'execution_failed', reason: error instanceof Error ? error.message : String(error) } }, isError: true };
      }
    },
  });
  pi.registerTool({
    name: 'cancel_trade_order',
    label: 'Cancel sandbox trade order',
    description: 'Cancel a pending paper-trading order in the isolated sandbox. Every call requires an interactive confirmation and non-interactive modes are denied by default.',
    parameters: cancelTradeParameters,
    executionMode: 'sequential',
    async execute(toolCallId, params, signal, _onUpdate, context) {
      const approval = await confirmNativeTrade(context, '确认模拟撤单', `将撤销 sandbox 模拟订单 ${params.orderId}。此操作会写入本地模拟账户。`, signal);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:cancel-order`, source: 'upup-pi://finance-sdk/sandbox/cancel', retrievedAt: new Date().toISOString(), query: params.orderId, freshness: 'cached', warnings: ['Sandbox paper-trading write; no live broker is contacted.', approval.reason], auditId: toolCallId });
      if (!approval.approved) {
        const result = createFinanceResult({ status: 'rejected', reason: approval.reason }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: { ...result, policyAudit: { auditId: toolCallId, tool: 'cancel_trade_order', safetyLevel: 'dangerous', decision: 'approval_denied', reason: approval.reason } }, isError: true };
      }
      try {
        const order = await (await getNativeSandboxBroker()).cancelOrder(params.orderId);
        const result = createFinanceResult({ order }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: { ...result, policyAudit: { auditId: toolCallId, tool: 'cancel_trade_order', safetyLevel: 'dangerous', decision: 'approval_granted', reason: approval.reason } } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], details: { auditId: toolCallId, policyAudit: { auditId: toolCallId, tool: 'cancel_trade_order', safetyLevel: 'dangerous', decision: 'execution_failed', reason: error instanceof Error ? error.message : String(error) } }, isError: true };
      }
    },
  });
  pi.registerTool({
    name: 'strategy_run_paper',
    label: 'Run paper execution strategy',
    description: 'Run TWAP, VWAP, POV, or implementation-shortfall execution against the isolated sandbox. Every call requires interactive approval; no live broker is contacted.',
    parameters: strategyRunPaperParameters,
    executionMode: 'sequential',
    async execute(toolCallId, params, signal, _onUpdate, context) {
      const approval = await confirmNativeTrade(context, '确认策略模拟执行', `将使用 ${params.algo.toUpperCase()} 在 sandbox 模拟${params.side === 'buy' ? '买入' : '卖出'} ${params.quantity} 股 ${params.symbol}。`, signal);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:strategy-paper`, source: 'upup-pi://finance-sdk/strategy-paper', retrievedAt: new Date().toISOString(), query: JSON.stringify(params), freshness: 'cached', warnings: ['Strategy execution is sandbox-only; no live broker is contacted.', approval.reason], auditId: toolCallId });
      if (!approval.approved) {
        const result = createFinanceResult({ status: 'rejected', reason: approval.reason }, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: { ...result, policyAudit: { auditId: toolCallId, tool: 'strategy_run_paper', safetyLevel: 'dangerous', decision: 'approval_denied', reason: approval.reason } }, isError: true };
      }
      try {
        const report = await runNativeStrategyPaper({ ...params, algo: params.algo as NativeAlgoKind, side: params.side as NativeOrderSide, childOrderType: params.childOrderType as NativeOrderType | undefined }, await getNativeSandboxBroker());
        const result = createFinanceResult(report, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: { ...result, policyAudit: { auditId: toolCallId, tool: 'strategy_run_paper', safetyLevel: 'dangerous', decision: 'approval_granted', reason: approval.reason } } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], details: { auditId: toolCallId, policyAudit: { auditId: toolCallId, tool: 'strategy_run_paper', safetyLevel: 'dangerous', decision: 'execution_failed', reason: error instanceof Error ? error.message : String(error) } }, isError: true };
      }
    },
  });
  pi.registerTool({
    name: 'strategy_list',
    label: 'List execution strategies',
    description: 'List the built-in TWAP, VWAP, POV, and implementation-shortfall paper execution strategies and recent session results.',
    parameters: strategyListParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Strategy list request aborted' }], isError: true };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:strategy-list`, source: 'upup-pi://finance-sdk/strategy-list', retrievedAt: new Date().toISOString(), query: 'execution strategies', freshness: 'offline', auditId: toolCallId });
      const result = createFinanceResult(listNativeExecutionStrategies(params.limit), [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  pi.registerTool({
    name: 'strategy_backtest',
    label: 'Backtest execution strategy',
    description: 'Run an execution-strategy backtest over caller-provided historical daily bars. Synthetic prices and provider fallback are rejected.',
    parameters: strategyBacktestParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Strategy backtest request aborted' }], isError: true };
      try {
        const report = runNativeStrategyBacktest({ ...params, algo: params.algo as NativeAlgoKind, side: params.side as NativeOrderSide });
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:strategy-backtest`, source: 'upup-pi://finance-sdk/strategy-backtest', retrievedAt: new Date().toISOString(), asOf: params.bars.at(-1)?.date, query: JSON.stringify({ ...params, bars: `${params.bars.length} historical bars` }), freshness: 'historical', warnings: ['Backtest uses caller-provided historical bars; verify source and as-of date before decisions.'], auditId: toolCallId });
        const result = createFinanceResult(report, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });
  pi.registerTool({
    name: 'fund_search',
    label: 'Fund search',
    description: 'Search the audited offline UpUp mutual-fund catalog by fund name, code, or type.',
    parameters: fundSearchParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund search request aborted' }], isError: true };
      const matches = searchNativeFunds(params.keyword);
      const retrievedAt = new Date().toISOString();
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-search`, source: 'upup-pi://finance-sdk/fund-search', retrievedAt, asOf: retrievedAt.slice(0, 10), query: params.keyword, freshness: 'offline', auditId: toolCallId });
      const result = createFinanceResult({ keyword: params.keyword, matches }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  pi.registerTool({
    name: 'fund_screen',
    label: 'Fund screen',
    description: 'Screen the audited offline fund snapshot by type, scale, one-year return, and deterministic ranking.',
    parameters: fundScreenParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund screen request aborted' }], isError: true };
      const results = screenNativeFunds({ type: params.type, minScale: params.min_scale, maxScale: params.max_scale, minReturn: params.min_return, sortBy: params.sort_by, limit: params.limit });
      const retrievedAt = new Date().toISOString();
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-screen`, source: 'upup-pi://finance-sdk/fund-screen', retrievedAt, asOf: retrievedAt.slice(0, 10), query: JSON.stringify(params), freshness: 'offline', auditId: toolCallId });
      const result = createFinanceResult({ criteria: params, period: '1Y', results }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
  pi.registerTool({
    name: 'fund_top',
    label: 'Top funds',
    description: 'List top funds from the audited offline one-year return snapshot.',
    parameters: fundTopParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund top request aborted' }], isError: true };
      const results = getTopNativeFunds(params.limit);
      const retrievedAt = new Date().toISOString();
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-top`, source: 'upup-pi://finance-sdk/fund-top', retrievedAt, asOf: retrievedAt.slice(0, 10), query: '1Y', freshness: 'offline', auditId: toolCallId });
      const result = createFinanceResult({ period: '1Y', results }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_compare',
    label: 'Fund comparison',
    description: 'Compare two to ten funds using the audited historical offline snapshot. Results are ranked by the selected period return and are not real-time.',
    parameters: fundCompareParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund comparison request aborted' }], isError: true };
      try {
        const comparison = compareNativeFunds(params.fund_codes, params.period ?? '1Y');
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-compare`, source: 'upup-pi://finance-sdk/fund-compare', retrievedAt: new Date().toISOString(), asOf: comparison.asOf, query: JSON.stringify(params), freshness: 'historical', warnings: ['Historical offline snapshot; comparison is not real-time investment advice.'], auditId: toolCallId });
        const result = createFinanceResult(comparison, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
      }
    },
  });

  pi.registerTool({
    name: 'fund_list',
    label: 'Followed funds',
    description: 'List funds followed in the current Pi session. State is persisted in the Pi session journal, not a global workspace file.',
    parameters: fundListParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund list request aborted' }], isError: true };
      const funds = listNativeFollowedFunds(readWatchlistState(context)).slice(0, params.limit ?? 50);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-list`, source: 'upup-pi://finance-sdk/fund-list', retrievedAt: new Date().toISOString(), query: 'session fund watchlist', freshness: 'cached', warnings: ['Watchlist is session-scoped user state; it contains no real-time market quote.'], auditId: toolCallId });
      const result = createFinanceResult({ funds, count: funds.length }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_follow',
    label: 'Follow fund',
    description: 'Follow a known fund in the current Pi session journal. This changes only session watchlist state and does not place trades.',
    parameters: fundFollowParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund follow request aborted' }], isError: true };
      const detail = getNativeFundDetail(params.fund_code);
      if (!detail) return { content: [{ type: 'text', text: `Fund not found in audited catalog: ${params.fund_code}` }], isError: true };
      const current = readWatchlistState(context);
      const operation = followNativeFund(current, { code: detail.code, name: detail.name, ...(params.note ? { note: params.note } : {}) }, new Date().toISOString());
      if (operation.added) commitWatchlistState(operation.state);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-follow`, source: 'upup-pi://finance-sdk/fund-follow', retrievedAt: new Date().toISOString(), query: params.fund_code, freshness: 'cached', warnings: ['Follow action changes only Pi session state; it does not place trades or contact a broker.'], auditId: toolCallId });
      const result = createFinanceResult({ code: detail.code, name: detail.name, added: operation.added, funds: listNativeFollowedFunds(operation.state) }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_unfollow',
    label: 'Unfollow fund',
    description: 'Remove a fund from the current Pi session watchlist. This does not place trades or delete market data.',
    parameters: fundCodeParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund unfollow request aborted' }], isError: true };
      const current = readWatchlistState(context);
      const operation = unfollowNativeFund(current, params.fund_code);
      if (operation.removed) commitWatchlistState(operation.state);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-unfollow`, source: 'upup-pi://finance-sdk/fund-unfollow', retrievedAt: new Date().toISOString(), query: params.fund_code, freshness: 'cached', warnings: ['Unfollow action changes only Pi session state; it does not place trades.'], auditId: toolCallId });
      const result = createFinanceResult({ code: params.fund_code, removed: operation.removed, funds: listNativeFollowedFunds(operation.state) }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_alert_create',
    label: 'Create fund alert',
    description: 'Create a session-scoped fund alert definition. This stores a condition only; it does not poll markets, send notifications, or place trades.',
    parameters: fundAlertCreateParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund alert create request aborted' }], isError: true };
      const detail = getNativeFundDetail(params.fund_code);
      if (!detail) return { content: [{ type: 'text', text: `Fund not found in audited catalog: ${params.fund_code}` }], isError: true };
      try {
        const operation = createNativeFundAlert(readAlertState(context), { id: `alert-${toolCallId}`, fundCode: detail.code, fundName: detail.name, type: params.alert_type as NativeFundAlertType, ...(params.value !== undefined ? { value: params.value } : {}), createdAt: new Date().toISOString() });
        commitAlertState(operation.state);
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-alert-create`, source: 'upup-pi://finance-sdk/fund-alert-create', retrievedAt: new Date().toISOString(), query: JSON.stringify(params), freshness: 'cached', warnings: ['Alert definition is session-scoped and inactive until an external scheduler evaluates it.'], auditId: toolCallId });
        const result = createFinanceResult(operation.created, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
      }
    },
  });

  pi.registerTool({
    name: 'fund_alert_list',
    label: 'List fund alerts',
    description: 'List session-scoped fund alert definitions. This tool does not claim that any condition has been evaluated.',
    parameters: fundAlertListParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund alert list request aborted' }], isError: true };
      const alerts = listNativeFundAlerts(readAlertState(context), params.fund_code);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-alert-list`, source: 'upup-pi://finance-sdk/fund-alert-list', retrievedAt: new Date().toISOString(), query: params.fund_code ?? 'all session alerts', freshness: 'cached', warnings: ['Alert definitions are session-scoped and are not live trigger results.'], auditId: toolCallId });
      const result = createFinanceResult({ alerts, count: alerts.length }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_alert_delete',
    label: 'Delete fund alert',
    description: 'Delete a session-scoped fund alert definition without contacting a broker or notification service.',
    parameters: fundAlertDeleteParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund alert delete request aborted' }], isError: true };
      const operation = deleteNativeFundAlert(readAlertState(context), params.alert_id);
      if (operation.deleted) commitAlertState(operation.state);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-alert-delete`, source: 'upup-pi://finance-sdk/fund-alert-delete', retrievedAt: new Date().toISOString(), query: params.alert_id, freshness: 'cached', warnings: ['Delete action changes only the Pi session journal.'], auditId: toolCallId });
      const result = createFinanceResult({ alertId: params.alert_id, deleted: operation.deleted, alerts: listNativeFundAlerts(operation.state) }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_detail',
    label: 'Fund detail',
    description: 'Return an auditable historical detail snapshot for one fund. This tool is not real-time.',
    parameters: fundCodeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund detail request aborted' }], isError: true };
      const detail = getNativeFundDetail(params.fund_code);
      if (!detail) return { content: [{ type: 'text', text: `Fund not found: ${params.fund_code}` }], isError: true };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-detail`, source: 'upup-pi://finance-sdk/fund-detail', retrievedAt: new Date().toISOString(), asOf: detail.asOf, query: params.fund_code, freshness: 'historical', warnings: ['Historical offline snapshot; not real-time data.'], auditId: toolCallId });
      const result = createFinanceResult(detail, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_performance',
    label: 'Fund performance',
    description: 'Return historical performance from the audited offline fund snapshot.',
    parameters: fundCodeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund performance request aborted' }], isError: true };
      const performance = getNativeFundPerformance(params.fund_code);
      if (!performance) return { content: [{ type: 'text', text: `Fund not found: ${params.fund_code}` }], isError: true };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-performance`, source: 'upup-pi://finance-sdk/fund-performance', retrievedAt: new Date().toISOString(), asOf: performance.asOf, query: params.fund_code, freshness: 'historical', warnings: ['Historical offline snapshot; not investment advice.'], auditId: toolCallId });
      const result = createFinanceResult(performance, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_holdings',
    label: 'Fund holdings',
    description: 'Return historical top holdings from the audited offline fund snapshot.',
    parameters: fundCodeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund holdings request aborted' }], isError: true };
      const holdings = getNativeFundHoldings(params.fund_code);
      if (!holdings || holdings.holdings.length === 0) return { content: [{ type: 'text', text: `No holdings snapshot for fund: ${params.fund_code}` }], isError: true };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-holdings`, source: 'upup-pi://finance-sdk/fund-holdings', retrievedAt: new Date().toISOString(), asOf: holdings.asOf, query: params.fund_code, freshness: 'historical', warnings: ['Historical offline snapshot; holdings may have changed.'], auditId: toolCallId });
      const result = createFinanceResult(holdings, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'fund_manager',
    label: 'Fund manager',
    description: 'Return historical fund manager information from the audited offline snapshot.',
    parameters: fundCodeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fund manager request aborted' }], isError: true };
      const manager = getNativeFundManager(params.fund_code);
      if (!manager || !manager.manager) return { content: [{ type: 'text', text: `No manager snapshot for fund: ${params.fund_code}` }], isError: true };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:fund-manager`, source: 'upup-pi://finance-sdk/fund-manager', retrievedAt: new Date().toISOString(), asOf: manager.asOf, query: params.fund_code, freshness: 'historical', warnings: ['Historical offline snapshot; manager information may have changed.'], auditId: toolCallId });
      const result = createFinanceResult(manager, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'get_astock_financials',
    label: 'A-share Financials',
    description: 'Read deterministic historical A-share income, balance-sheet, cash-flow, and ratio snapshots. This tool is offline and does not query Tushare.',
    parameters: astockFinancialsParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'A-share financials request aborted' }], isError: true };
      const value = getNativeAStockFinancials(params.code, params.period);
      if (!value) return { content: [{ type: 'text', text: JSON.stringify({ error: 'No historical A-share financial snapshot for the requested code or period.', supportedSymbols: listNativeAStockFinancialSymbols() }) }], isError: true, details: { auditId: toolCallId } };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:astock-financials`, source: 'upup-pi://finance-sdk/astock-financials', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: value.asOf, query: JSON.stringify(params), freshness: 'historical', warnings: ['Historical offline snapshot; not real-time data or investment advice.'], auditId: toolCallId });
      const result = createFinanceResult({ ...value, requestedDates: { start_date: params.start_date, end_date: params.end_date } }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'get_financials',
    label: 'Financial Snapshot',
    description: 'Read deterministic historical financial statements and key metrics for a supported company. This offline snapshot is not a complete filing, real-time feed, or investment advice.',
    parameters: financialsParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Financial snapshot request aborted' }], isError: true };
      const value = getNativeFinancialSnapshot(params.query);
      if (!value) return { content: [{ type: 'text', text: JSON.stringify({ error: 'No historical financial snapshot for the requested company.', supportedSymbols: listNativeFinancialSymbols() }) }], isError: true, details: { auditId: toolCallId } };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:financials`, source: 'upup-pi://finance-sdk/financials', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: value.asOf, query: params.query, freshness: 'historical', warnings: ['Historical offline snapshot; not a complete filing, real-time data, or investment advice.'], auditId: toolCallId });
      const result = createFinanceResult(value, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'read_filings',
    label: 'Read SEC Filings',
    description: 'Read SEC filing metadata and up to three selected filing sections through the Financial Datasets API. Requires FINANCIAL_DATASETS_API_KEY; this tool does not use an LLM planner.',
    parameters: readFilingsParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'read_filings request aborted' }], isError: true, details: { auditId: toolCallId } };
      try {
        const value = await readNativeFilings({
          query: params.query,
          ticker: params.ticker,
          filing_types: params.filing_types as NativeFilingType[] | undefined,
          limit: params.limit,
          items: params.items,
        }, signal);
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:filings`, source: 'upup-pi://finance-sdk/filings', retrievedAt: value.fetchedAt, asOf: value.fetchedAt.slice(0, 10), query: JSON.stringify(params), freshness: 'delayed', warnings: ['SEC filing content is retrieved from the configured Financial Datasets API; verify filing dates and context before making investment decisions.'], auditId: toolCallId });
        const result = createFinanceResult(value, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });

  pi.registerTool({ name: 'get_stock_price', label: 'Live stock price', description: 'Fetch a network stock price snapshot through the Financial Datasets API.', parameters: researchTickerParameters, async execute(toolCallId, params, _signal) { return executeResearchTool(toolCallId, _signal, 'stock-price', (client) => client.getStockPrice(params)); } });
  pi.registerTool({ name: 'get_key_ratios', label: 'Live key ratios', description: 'Fetch current financial metrics through the Financial Datasets API.', parameters: researchTickerParameters, async execute(toolCallId, params, signal) { return executeResearchTool(toolCallId, signal, 'key-ratios', (client) => client.getKeyRatios(params)); } });
  pi.registerTool({ name: 'get_analyst_estimates', label: 'Analyst estimates', description: 'Fetch annual or quarterly analyst estimates through the Financial Datasets API.', parameters: estimatesParameters, async execute(toolCallId, params, signal) { return executeResearchTool(toolCallId, signal, 'analyst-estimates', (client) => client.getAnalystEstimates(params)); } });
  pi.registerTool({ name: 'get_earnings', label: 'Latest earnings', description: 'Fetch the latest earnings snapshot through the Financial Datasets API.', parameters: researchTickerParameters, async execute(toolCallId, params, signal) { return executeResearchTool(toolCallId, signal, 'earnings', (client) => client.getEarnings(params)); } });
  pi.registerTool({ name: 'get_filings', label: 'SEC filing metadata', description: 'Fetch SEC filing metadata through the Financial Datasets API.', parameters: researchFilingsParameters, async execute(toolCallId, params, signal) { return executeResearchTool(toolCallId, signal, 'filings-metadata', (client) => client.getFilings(params)); } });

  pi.registerTool({
    name: 'get_astock_news',
    label: 'A-share News Snapshot',
    description: 'Read deterministic historical A-share announcements and market-news snapshots. This tool is offline, not real-time, and does not query Tushare, Eastmoney, or the web.',
    parameters: astockNewsParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'A-share news request aborted' }], isError: true };
      try {
        const value = getNativeAStockNews({ code: params.code, startDate: params.start_date, endDate: params.end_date, limit: params.limit });
        if (!value) return { content: [{ type: 'text', text: JSON.stringify({ error: 'No historical A-share news snapshot for the requested code.', supportedSymbols: listNativeAStockNewsSymbols() }) }], isError: true, details: { auditId: toolCallId } };
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:astock-news`, source: 'upup-pi://finance-sdk/astock-news', retrievedAt: '2026-09-14T00:00:00.000Z', asOf: value.asOf, query: JSON.stringify(params), freshness: 'historical', warnings: ['Historical offline news snapshot; not real-time news, not a web search result, and not investment advice.'], auditId: toolCallId });
        const result = createFinanceResult(value, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });

  pi.registerTool({
    name: 'get_company_profile',
    label: 'Company Profile',
    description: 'Read an auditable historical company profile from the Finance Package snapshot. This tool is read-only and not real-time.',
    parameters: companyProfileParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Company profile request aborted' }], isError: true };
      const profile = getNativeCompanyProfile(params.ticker);
      if (!profile) return { content: [{ type: 'text', text: JSON.stringify({ found: false, ticker: params.ticker.toUpperCase() }) }], isError: true, details: { auditId: toolCallId } };
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:company-profile`, source: 'upup-pi://finance-sdk/company-profile', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: profile.asOf, query: params.ticker, freshness: 'historical', warnings: ['Historical offline snapshot; not real-time data or investment advice.'], auditId: toolCallId });
      const result = createFinanceResult({ found: true, ...profile }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'get_risks',
    label: 'Investment Risks',
    description: 'Read historical market, company, sector, and portfolio risk assessments from the Finance Package snapshot.',
    parameters: riskQueryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Risk query request aborted' }], isError: true };
      const risks = getNativeRisks({ ticker: params.ticker, severity: params.severity as NativeRiskSeverity | undefined, type: params.type as NativeRiskType | undefined });
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:risks`, source: 'upup-pi://finance-sdk/risks', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-12', query: JSON.stringify(params), freshness: 'historical', warnings: ['Historical offline risk snapshot; validate assumptions before making decisions.'], auditId: toolCallId });
      const result = createFinanceResult({ count: risks.length, risks }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'get_sectors',
    label: 'Sector Analysis',
    description: 'Read historical sector analysis, trends, metrics, and outlook from the Finance Package snapshot.',
    parameters: sectorQueryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Sector query request aborted' }], isError: true };
      const sectors = getNativeSectors(params.name);
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:sectors`, source: 'upup-pi://finance-sdk/sectors', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-12', query: params.name ?? 'all', freshness: 'historical', warnings: ['Historical offline sector snapshot; not real-time data or investment advice.'], auditId: toolCallId });
      const result = createFinanceResult({ found: params.name ? sectors.length > 0 : undefined, count: sectors.length, sectors }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'calculate_capital_gains_tax',
    label: 'Capital gains tax',
    description: 'Estimate capital gains tax from an explicit historical as-of date. This is a deterministic estimate, not tax advice.',
    parameters: capitalGainsTaxParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Capital gains tax request aborted' }], isError: true };
      try {
        const estimate = calculateNativeTax({ symbol: params.symbol, quantity: params.quantity, purchasePrice: params.purchase_price, currentPrice: params.current_price, purchaseDate: params.purchase_date, asOf: params.as_of, jurisdiction: (params.jurisdiction ?? 'us') as NativeTaxJurisdiction });
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:capital-gains-tax`, source: 'upup-pi://finance-sdk/capital-gains-tax', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: estimate.asOf, query: JSON.stringify(params), freshness: 'historical', warnings: ['Deterministic tax estimate based on simplified jurisdiction rates; not tax advice.'], auditId: toolCallId });
        const result = createFinanceResult(estimate, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });

  pi.registerTool({
    name: 'calculate_trades_tax',
    label: 'Trades tax summary',
    description: 'Calculate deterministic capital gains tax for completed trades using each trade sell date as the as-of date.',
    parameters: tradesTaxParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Trades tax request aborted' }], isError: true };
      const summary = calculateNativeTradesTax({ trades: params.trades.map((trade) => ({ symbol: trade.symbol, quantity: trade.quantity, purchasePrice: trade.purchase_price, sellPrice: trade.sell_price, purchaseDate: trade.purchase_date, sellDate: trade.sell_date })), jurisdiction: (params.jurisdiction ?? 'us') as NativeTaxJurisdiction });
      const evidence = createEvidence({ id: `pi-finance:${toolCallId}:trades-tax`, source: 'upup-pi://finance-sdk/trades-tax', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-12', query: JSON.stringify(params), freshness: 'historical', warnings: ['Deterministic tax estimate based on simplified jurisdiction rates; invalid trades are returned in errors.'], auditId: toolCallId });
      const result = createFinanceResult(summary, [evidence], toolCallId);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'calculate_pnl',
    label: 'Trade P&L',
    description: 'Calculate deterministic profit and loss for completed trades without tax or broker side effects.',
    parameters: pnlParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'P&L request aborted' }], isError: true };
      try {
        const pnl = calculateNativePnl({ currency: params.currency ?? 'USD', trades: params.trades.map((trade) => ({ symbol: trade.symbol, quantity: trade.quantity, purchasePrice: trade.purchase_price, sellPrice: trade.sell_price })) });
        const evidence = createEvidence({ id: `pi-finance:${toolCallId}:pnl`, source: 'upup-pi://finance-sdk/pnl', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-12', query: JSON.stringify(params), freshness: 'historical', warnings: ['Deterministic trade calculation; excludes commissions, slippage, financing and tax.'], auditId: toolCallId });
        const result = createFinanceResult(pnl, [evidence], toolCallId);
        return { content: [{ type: 'text', text: resultText(result) }], details: result };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });

  pi.registerTool({
    name: 'finance_evidence_fundamentals',
    label: 'Finance evidence fundamentals',
    description: 'Return deterministic fundamental metrics with auditable evidence metadata.',
    parameters: symbolParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fundamentals request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.symbol, 'fundamentals', { symbol: params.symbol, revenue: 1000000, pe: 12.5 });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_news',
    label: 'Finance evidence news',
    description: 'Return deterministic research headlines with auditable evidence metadata.',
    parameters: queryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'News request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.query, 'news', { query: params.query, headlines: ['Fixture headline'] });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_search',
    label: 'Finance evidence search',
    description: 'Search deterministic research documents with auditable evidence metadata.',
    parameters: queryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Search request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.query, 'search', { query: params.query, sources: ['upup-fixture://research/1'] });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_trading_day',
    label: 'Finance evidence trading day',
    description: 'Check a deterministic exchange calendar date with auditable evidence metadata.',
    parameters: dateParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Trading day request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.date, 'trading-day', { date: params.date, isTradingDay: true }, params.date);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
}
