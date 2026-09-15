import { getNativeFundHistoryForRange, NativeResearchDataClient, NativeSandboxBroker, type ResearchDataClientOptions, type ResearchMarket } from '@upup/pi-finance-sdk';
import { createDefaultMarketQuoteClient, FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, NativeMarketHistoryClient, type NativeMarketQuoteClient, type NativeMarketQuoteResult, type NativeMarketQuoteTrendStore, type NativeMarketQuoteTrendBucket } from '@upup/pi-market-data';
import type { InvestmentWorkflowServices } from '@upup/pi-investment-workflow';
import type { PiHistoricalMarketFreshness, PiMarket } from '@upup/types';

function requireHistoricalFreshness(value: string): PiHistoricalMarketFreshness {
  if (value === 'historical' || value === 'cached' || value === 'delayed' || value === 'realtime') return value;
  throw new Error(`investment workflow market history returned unsupported freshness: ${value}`);
}

export interface FinanceCompositionOptions {
  readonly sessionId: string;
  readonly marketHistoryFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly marketHistoryFetchers?: Readonly<Record<string, (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;
  readonly marketHistoryProviders?: Readonly<Record<string, 'auto' | 'yahoo' | 'tushare' | 'financial-datasets'>>;
  readonly marketHistoryApiKeys?: Readonly<Record<string, string>>;
  readonly marketHistoryBaseUrls?: Readonly<Record<string, string>>;
  readonly marketQuoteFetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly researchDataFetcher?: typeof fetch;
  readonly researchDataFetchers?: Readonly<Record<string, typeof fetch>>;
  readonly researchDataProviders?: Readonly<Record<string, string>>;
  readonly researchDataApiKeys?: Readonly<Record<string, string>>;
  readonly researchDataBaseUrls?: Readonly<Record<string, string>>;
  readonly marketQuoteTrendStore?: NativeMarketQuoteTrendStore;
}

export interface FinanceComposition {
  readonly quoteClient: NativeMarketQuoteClient;
  readonly trendStore: NativeMarketQuoteTrendStore;
  readonly marketHistoryFetcher?: FinanceCompositionOptions['marketHistoryFetcher'];
  readonly marketQuoteFetcher?: FinanceCompositionOptions['marketQuoteFetcher'];
  readonly getInvestmentWorkflowServices: () => InvestmentWorkflowServices;
  readonly getMarketQuote: (symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string) => Promise<NativeMarketQuoteResult>;
}

class InMemoryTrendStore implements NativeMarketQuoteTrendStore {
  private buckets: readonly NativeMarketQuoteTrendBucket[] = [];
  load(): readonly NativeMarketQuoteTrendBucket[] { return this.buckets; }
  save(buckets: readonly NativeMarketQuoteTrendBucket[]): void { this.buckets = [...buckets]; }
}

export function createFinanceComposition(options: FinanceCompositionOptions): FinanceComposition {
  const trendStore = options.marketQuoteTrendStore ?? new InMemoryTrendStore();
  const quoteClient = createDefaultMarketQuoteClient({
    ...(options.marketQuoteFetcher ? { fetcher: options.marketQuoteFetcher } : {}),
    trendStore,
  });
  const research = new NativeResearchDataClient({
    ...(options.researchDataFetcher ? { fetcher: options.researchDataFetcher } : {}),
    ...(options.researchDataFetchers ? { marketFetchers: options.researchDataFetchers as ResearchDataClientOptions['marketFetchers'] } : {}),
    ...(options.researchDataProviders ? { marketProviders: options.researchDataProviders as ResearchDataClientOptions['marketProviders'] } : {}),
    ...(options.researchDataApiKeys ? { marketApiKeys: options.researchDataApiKeys as ResearchDataClientOptions['marketApiKeys'] } : {}),
    ...(options.researchDataBaseUrls ? { marketBaseUrls: options.researchDataBaseUrls as ResearchDataClientOptions['marketBaseUrls'] } : {}),
  });
  const sandbox = new NativeSandboxBroker({
    quoteProvider: async (symbol) => {
      const quote = await quoteClient.getQuote(symbol, undefined, undefined, `${options.sessionId}:sandbox-quote`);
      return { symbol: quote.value.symbol, bid: quote.value.bid, ask: quote.value.ask, last: quote.value.last, timestamp: Date.parse(`${quote.value.asOf}T00:00:00Z`) };
    },
  });
  const marketHistory = new NativeMarketHistoryClient({
    cache: new InMemoryMarketHistoryCache(),
    rateLimiter: new FixedWindowMarketHistoryRateLimiter(30, 60_000),
    ...(options.marketHistoryFetcher ? { fetcher: options.marketHistoryFetcher } : {}),
    ...(options.marketHistoryFetchers ? { marketFetchers: options.marketHistoryFetchers } : {}),
    ...(options.marketHistoryProviders ? { marketProviders: options.marketHistoryProviders } : {}),
    ...(options.marketHistoryApiKeys ? { marketApiKeys: options.marketHistoryApiKeys } : {}),
    ...(options.marketHistoryBaseUrls ? { marketBaseUrls: options.marketHistoryBaseUrls } : {}),
  });
  let sandboxLoaded = false;
  const ensureSandbox = async () => {
    if (!sandboxLoaded) {
      await sandbox.loadState();
      sandboxLoaded = true;
    }
    return sandbox;
  };
  const services: InvestmentWorkflowServices = {
    getResearchData: async (ticker, signal, market) => {
      const researchMarket = market as ResearchMarket | undefined;
      const [price, ratios, estimates, earnings, filings] = await Promise.all([
        research.getStockPrice({ ticker, ...(researchMarket ? { market: researchMarket } : {}) }, signal),
        research.getKeyRatios({ ticker, ...(researchMarket ? { market: researchMarket } : {}) }, signal),
        research.getAnalystEstimates({ ticker, ...(researchMarket ? { market: researchMarket } : {}) }, signal),
        research.getEarnings({ ticker, ...(researchMarket ? { market: researchMarket } : {}) }, signal),
        research.getFilings({ ticker, ...(researchMarket ? { market: researchMarket } : {}) }, signal),
      ]);
      return { price, ratios, estimates, earnings, filings };
    },
    getFundHistory: (fundCode, startDate, endDate, signal) => getNativeFundHistoryForRange(fundCode, startDate, endDate, { signal }),
    getMarketHistory: async (symbol, startDate, signal, market) => {
      if (signal?.aborted) throw new Error('investment workflow market history request aborted');
      const endDate = new Date().toISOString().slice(0, 10);
      const result = await marketHistory.getHistory(symbol, startDate, endDate, signal, `${options.sessionId}:market-history`, market);
      return { bars: result.value, evidence: { ...result.evidence, dataFreshness: requireHistoricalFreshness(result.evidence.dataFreshness) } };
    },
    getSandboxState: async (signal) => {
      if (signal?.aborted) throw new Error('investment workflow sandbox request aborted');
      const broker = await ensureSandbox();
      const [positions, balance] = await Promise.all([broker.getPositions(), broker.getBalance()]);
      return {
        positions: positions.map((position) => ({ symbol: position.symbol, quantity: position.quantity, avgCost: position.avgCost, realizedPnL: position.realizedPnL })),
        balance,
        getQuote: async (symbol, quoteSignal, requestedMarket?: PiMarket) => {
          if (quoteSignal?.aborted) throw new Error('investment workflow quote request aborted');
          const quote = await quoteClient.getQuote(symbol, requestedMarket, quoteSignal, `${options.sessionId}:sandbox-quote`);
          return { symbol: quote.value.symbol, bid: quote.value.bid, ask: quote.value.ask, last: quote.value.last };
        },
      };
    },
    placePaperOrder: async (input, signal) => {
      if (signal?.aborted) throw new Error('investment workflow paper order aborted');
      const broker = await ensureSandbox();
      const order = await broker.placeOrder({ symbol: input.symbol, side: input.side, quantity: input.quantity, type: 'market' });
      return {
        id: order.id,
        status: order.status,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        ...(order.avgFillPrice === undefined ? {} : { avgFillPrice: order.avgFillPrice }),
        ...(order.commission === undefined ? {} : { commission: order.commission }),
      };
    },
  };
  return {
    quoteClient,
    trendStore,
    ...(options.marketHistoryFetcher ? { marketHistoryFetcher: options.marketHistoryFetcher } : {}),
    ...(options.marketQuoteFetcher ? { marketQuoteFetcher: options.marketQuoteFetcher } : {}),
    getInvestmentWorkflowServices: () => services,
    getMarketQuote: (symbol, requestedMarket, signal, auditId) => quoteClient.getQuote(symbol, requestedMarket, signal, auditId),
  };
}
