/**
 * Session composition boundary.
 *
 * The Pi Session orchestration layer consumes these provider contracts
 * instead of importing concrete business composition implementations.
 * Finance and Platform are exposed as two replaceable sub-boundaries so
 * applications and tests can swap either side independently. The default
 * provider keeps the current built-in behavior and is composed from the
 * union of both halves.
 *
 * Sprint 5 Composition Cleanup (Pi Native migration): the finance and
 * platform composition implementations previously hosted in
 * `@upup/pi-finance-composition` and `@upup/pi-platform-composition` are
 * now inlined here so the Pi session boundary is the single owner of
 * session composition. External code may still inject alternative
 * implementations via the `PiSessionCompositionProviders` contract below.
 */
import {
  getNativeFundHistoryForRange,
  NativeResearchDataClient,
  NativeSandboxBroker,
  type ResearchDataClientOptions,
  type ResearchMarket,
} from '@upup/pi-finance-sdk';
import {
  createDefaultMarketQuoteClient,
  FixedWindowMarketHistoryRateLimiter,
  InMemoryMarketHistoryCache,
  JsonFileMarketQuoteTrendStore,
  loadProviderSlaStore,
  NativeMarketHistoryClient,
  type NativeMarketQuoteClient,
  type NativeMarketQuoteResult,
  type NativeMarketQuoteTrendBucket,
  type NativeMarketQuoteTrendStore,
} from '@upup/pi-market-data';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import {
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  saveCronStore,
  startCronRunner,
  type CronExecutionRuntime,
  type CronJob,
  type CronRunner,
  type CronStore,
} from '@upup/cron';
import type { InvestmentWorkflowServices } from '@upup/pi-investment-workflow';
import type { PiHistoricalMarketFreshness, PiMarket } from '@upup/types';
import type { UpUpAgentSpec } from '@upup/pi-runtime';
import {
  buildDefaultInvestmentSystemPrompt,
  buildInvestmentCapabilitiesSection,
  buildCoachSystemPrompt,
} from '@upup/pi-prompt-config';
import type { PiPromptBuilders } from '@upup/pi-runtime';
import type { GatewayAgentRuntimePort, GatewayRuntime } from '@upup/gateway';
import { getConfiguredModelId, getConfiguredProvider, globalUpupPath } from '@upup/utils';

// ============================================================================
// Finance composition (inlined from @upup/pi-finance-composition)
// ============================================================================

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

// ============================================================================
// Platform composition (inlined from @upup/pi-platform-composition)
// ============================================================================

export type PlatformResearchRole = 'technical-analysis' | 'fundamental-analysis' | 'capital-flow' | 'sentiment-analysis';

export interface PlatformPromptOptions {
  readonly spec: UpUpAgentSpec;
  readonly runPrompt: (prompt: string, options: { model?: string; signal?: AbortSignal; sessionKey: string; toolFilter?: readonly string[] | '*'; systemPrompt?: string; modelInstance?: unknown; modelRuntime?: ModelRuntime; agentSpec: UpUpAgentSpec }) => Promise<string>;
  readonly runCron: (job: unknown, modelInstance: unknown, modelRuntime: ModelRuntime | undefined) => Promise<void>;
  readonly listMcpResources: (server: string | undefined) => Promise<readonly { server: string; resources: readonly Record<string, unknown>[] }[]>;
  readonly readMcpResource: (uri: string, server: string | undefined) => Promise<{ server: string; contents: readonly Record<string, unknown>[] }>;
  readonly modelInstance?: unknown;
  readonly modelRuntime?: ModelRuntime;
}

export interface PlatformCompositionOptions extends PlatformPromptOptions {
  readonly sessionId: string;
}

export interface PlatformComposition {
  readonly runResearchWorker: (request: { role: PlatformResearchRole; symbol: string; question: string; systemPrompt: string; allowedTools: readonly string[] }, signal?: AbortSignal) => Promise<{ role: PlatformResearchRole; output: string; evidence: readonly unknown[]; sessionId?: string }>;
  readonly runAgentWorker: (request: { agentId: string; name: string; role: string; prompt: string; tools: readonly string[] | '*'; model?: string }, signal?: AbortSignal) => Promise<{ agentId: string; output: string; sessionId: string }>;
  readonly runCronJob: (request: { job: unknown }, signal?: AbortSignal) => Promise<void>;
  readonly listMcpResources: (server: string | undefined, signal?: AbortSignal) => Promise<readonly { server: string; resources: readonly Record<string, unknown>[] }[]>;
  readonly readMcpResource: (uri: string, server: string | undefined, signal?: AbortSignal) => Promise<{ server: string; contents: readonly Record<string, unknown>[] }>;
}

export function createPlatformComposition(options: PlatformCompositionOptions): PlatformComposition {
  return {
    runResearchWorker: async (request, signal) => {
      const workerSessionId = `${options.sessionId}:research:${request.role}`;
      const workerSpec: UpUpAgentSpec = {
        ...options.spec,
        id: `research-worker-${request.role}`,
        name: `Research Worker: ${request.role}`,
        description: request.systemPrompt,
        mode: 'subagent',
        tools: [...request.allowedTools],
        capabilities: ['financial-research', request.role],
        taskTypes: ['research'],
        permissions: { ...options.spec.permissions, allowFinancialWrites: false, deny: ['dangerous', 'critical'] },
        outputContract: 'evidence',
      };
      const output = await options.runPrompt(`请分析 ${request.symbol}。研究问题：${request.question}`, {
        model: workerSpec.model, signal, sessionKey: workerSessionId, systemPrompt: request.systemPrompt,
        toolFilter: [...request.allowedTools], agentSpec: workerSpec, ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}), ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}),
      });
      return { role: request.role as PlatformResearchRole, output, evidence: [{ source: `upup-pi://research-worker/${request.role}`, sessionId: workerSessionId }], sessionId: workerSessionId };
    },
    runAgentWorker: async (request, signal) => {
      const safeAgentId = request.agentId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'agent-worker';
      const workerSessionId = `${options.sessionId}:agent:${safeAgentId}`;
      const workerSpec: UpUpAgentSpec = {
        ...options.spec,
        id: `platform-worker-${safeAgentId}`,
        name: request.name,
        description: `Pi platform worker: ${request.role}`,
        mode: 'worker',
        tools: request.tools === '*' ? '*' : [...request.tools] as readonly string[],
        ...(request.model ? { model: request.model } : {}),
        capabilities: ['platform-worker', request.role], taskTypes: ['platform-worker'],
        permissions: { ...options.spec.permissions, id: 'pi-platform-worker-read-only', allow: ['safe', 'warning'] as readonly ('safe' | 'warning')[], requireApproval: [] as readonly ('safe' | 'warning' | 'dangerous' | 'critical')[], deny: ['dangerous', 'critical'] as readonly ('safe' | 'warning' | 'dangerous' | 'critical')[], allowFinancialWrites: false },
        outputContract: 'markdown',
      };
      const output = await options.runPrompt(request.prompt, { model: workerSpec.model, signal, sessionKey: workerSessionId, toolFilter: (request.tools === '*' ? '*' : [...request.tools]) as readonly string[] | '*', agentSpec: workerSpec, ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}), ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}) });
      return { agentId: request.agentId, output, sessionId: workerSessionId };
    },
    runCronJob: async (request, signal) => {
      if (signal?.aborted) throw new Error('cron run request aborted');
      await options.runCron(request.job, options.modelInstance, options.modelRuntime);
    },
    listMcpResources: async (server, signal) => {
      if (signal?.aborted) throw new Error('MCP resource request aborted');
      return options.listMcpResources(server);
    },
    readMcpResource: async (uri, server, signal) => {
      if (signal?.aborted) throw new Error('MCP resource request aborted');
      return options.readMcpResource(uri, server);
    },
  };
}

// ============================================================================
// Cron surface (inlined from @upup/pi-platform-composition/cron.ts)
// ============================================================================

export interface CronPlatformProvider {
  readonly loadCronStore: typeof loadCronStore;
  readonly saveCronStore: typeof saveCronStore;
  readonly ensureHeartbeatCronJob: typeof ensureHeartbeatCronJob;
  readonly executeCronJob: typeof executeCronJob;
  readonly startCronRunner: typeof startCronRunner;
}

export const defaultCronPlatformProvider: CronPlatformProvider = {
  loadCronStore,
  saveCronStore,
  ensureHeartbeatCronJob,
  executeCronJob,
  startCronRunner,
};

// ============================================================================
// Provider surfaces (Pi Session composition boundary)
// ============================================================================

export interface PiSessionFinanceProviders {
  readonly createFinanceComposition: (options: FinanceCompositionOptions) => FinanceComposition;
  readonly JsonFileMarketQuoteTrendStore: typeof JsonFileMarketQuoteTrendStore;
  readonly loadProviderSlaStore: typeof loadProviderSlaStore;
  readonly getConfiguredModelId: typeof getConfiguredModelId;
  readonly getConfiguredProvider: typeof getConfiguredProvider;
  readonly globalUpupPath: typeof globalUpupPath;
}

export interface PiSessionPlatformProviders {
  readonly createPlatformComposition: (options: PlatformCompositionOptions) => PlatformComposition;
  readonly ensureHeartbeatCronJob: typeof ensureHeartbeatCronJob;
  readonly executeCronJob: typeof executeCronJob;
  readonly loadCronStore: typeof loadCronStore;
  readonly saveCronStore: typeof saveCronStore;
  readonly startCronRunner: typeof startCronRunner;
}

export interface PiSessionPromptProviders extends PiPromptBuilders {}

export type PiSessionCompositionProviders = PiSessionFinanceProviders & PiSessionPlatformProviders & PiSessionPromptProviders;

export const builtinSessionFinanceComposition: PiSessionFinanceProviders = {
  createFinanceComposition,
  JsonFileMarketQuoteTrendStore,
  loadProviderSlaStore,
  getConfiguredModelId,
  getConfiguredProvider,
  globalUpupPath,
};

export const builtinSessionPlatformComposition: PiSessionPlatformProviders = {
  createPlatformComposition,
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  saveCronStore,
  startCronRunner,
};

export const builtinSessionPromptComposition: PiSessionPromptProviders = {
  buildDefaultInvestmentSystemPrompt,
  buildInvestmentCapabilitiesSection,
  buildCoachSystemPrompt,
};

export const builtinSessionComposition: PiSessionCompositionProviders = {
  ...builtinSessionFinanceComposition,
  ...builtinSessionPlatformComposition,
  ...builtinSessionPromptComposition,
};

export type { GatewayAgentRuntimePort, GatewayRuntime, NativeMarketQuoteTrendStore, CronExecutionRuntime, CronJob, CronRunner, CronStore };
