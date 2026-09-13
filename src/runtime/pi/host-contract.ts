import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { InvestmentWorkflowServices } from '@upup/pi-investment-workflow';
import type { NativeMarketQuoteTrendStore } from '@upup/pi-market-data';

export const PI_HOST_CONTRACT = 'upup.pi.host.v1' as const;
export const PI_HOST_REGISTRY_GLOBAL_KEY = '__upupPiHosts' as const;
export const PI_HOST_CAPABILITIES = ['tool-definitions', 'research-worker', 'agent-worker', 'cron-runner', 'mcp-resources', 'investment-workflow', 'market-data-transport', 'management-snapshot'] as const;

export type PiHostCapability = (typeof PI_HOST_CAPABILITIES)[number];

export interface PiHostRequest {
  readonly contract: typeof PI_HOST_CONTRACT;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capability: PiHostCapability;
}

export interface PiResearchWorkerRequest {
  readonly role: 'technical-analysis' | 'fundamental-analysis' | 'capital-flow' | 'sentiment-analysis';
  readonly symbol: string;
  readonly question: string;
  readonly systemPrompt: string;
  readonly allowedTools: readonly string[];
}

export interface PiResearchWorkerResult {
  readonly role: PiResearchWorkerRequest['role'];
  readonly output: string;
  readonly evidence: readonly unknown[];
  readonly sessionId?: string;
}

export interface PiAgentWorkerRequest {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly prompt: string;
  readonly tools: readonly string[] | '*';
  readonly model?: string;
}

export interface PiAgentWorkerResult {
  readonly agentId: string;
  readonly output: string;
  readonly sessionId: string;
}

export interface PiCronRunRequest {
  readonly job: unknown;
}

export interface PiMcpResourceGroup {
  readonly server: string;
  readonly resources: readonly Record<string, unknown>[];
}

export interface PiMcpResourceRead {
  readonly server: string;
  readonly contents: readonly Record<string, unknown>[];
}

export interface PiMarketQuoteValue {
  readonly symbol: string;
  readonly market: 'cn' | 'hk' | 'us' | 'fund' | 'crypto';
  readonly price: number;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
  readonly currency: 'CNY' | 'HKD' | 'USD';
  readonly asOf: string;
  readonly source: string;
  readonly freshness: 'historical' | 'cached' | 'delayed' | 'realtime';
  readonly indicative: boolean;
}

export interface PiMarketQuoteResult {
  readonly value: PiMarketQuoteValue;
  readonly evidence: {
    readonly id: string;
    readonly source: string;
    readonly retrievedAt: string;
    readonly asOf: string;
    readonly query: string;
    readonly dataFreshness: PiMarketQuoteValue['freshness'];
    readonly auditId: string;
  };
}

export interface PiManagementSnapshot {
  readonly schema: 1;
  readonly sessionId: string;
  readonly capturedAt: string;
  readonly runtime: {
    readonly name: 'pi';
    readonly contract: typeof PI_HOST_CONTRACT;
    readonly version: string;
  };
  readonly permissions: {
    readonly policyId: string;
    readonly allowFinancialWrites: boolean;
    readonly requireApprovalCount: number;
    readonly deniedRiskLevels: readonly string[];
  };
  readonly packages: readonly { readonly name: string; readonly version: string; readonly enabled: true }[];
  readonly tools: {
    readonly available: number;
    readonly native: number;
    readonly packageOwned: number;
  };
  readonly providers: {
    readonly marketData: {
      readonly providers: readonly { readonly name: 'yahoo' | 'tushare'; readonly configured: boolean }[];
      readonly metrics: {
        readonly requests: number;
        readonly cacheHits: number;
        readonly successes: number;
        readonly failures: number;
        readonly rateLimitFailures: number;
        readonly lastProvider?: 'yahoo' | 'tushare';
        readonly lastLatencyMs?: number;
        readonly lastOutcome?: 'success' | 'failure' | 'cache';
        readonly lastErrorClass?: 'credentials' | 'rate_limit' | 'forbidden' | 'server_error' | 'invalid_response' | 'unsupported_symbol' | 'aborted' | 'unknown';
        readonly lastCheckedAt?: string;
        readonly successRatePct: number;
        readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        readonly recentSamples: readonly {
          readonly provider: 'yahoo' | 'tushare';
          readonly latencyMs: number;
          readonly outcome: 'success' | 'failure' | 'cache';
          readonly errorClass?: 'credentials' | 'rate_limit' | 'forbidden' | 'server_error' | 'invalid_response' | 'unsupported_symbol' | 'aborted' | 'unknown';
          readonly checkedAt: string;
        }[];
        readonly trend?: readonly {
          readonly startAt: string;
          readonly requests: number;
          readonly cacheHits: number;
          readonly successes: number;
          readonly failures: number;
          readonly successRatePct: number;
          readonly avgLatencyMs?: number;
          readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        }[];
      };
      readonly providerSla?: {
        readonly jobs: readonly {
          readonly id: string;
          readonly name: string;
          readonly provider: 'auto' | 'yahoo' | 'tushare';
          readonly enabled: boolean;
          readonly everyMs: number;
          readonly nextRunAtMs?: number;
          readonly lastRunAtMs?: number;
          readonly lastRunStatus?: 'ok' | 'error' | 'disabled';
          readonly lastErrorClass?: string;
          readonly lastLatencyMs?: number;
          readonly consecutiveErrors: number;
        }[];
      };
    };
  };
  readonly evidence: readonly { readonly source: string; readonly retrievedAt: string }[];
}

export interface PiHostBridge {
  readonly contract: typeof PI_HOST_CONTRACT;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly PiHostCapability[];
  getToolDefinitions(request: PiHostRequest): readonly ToolDefinition[];
  getToolMetadata(request: PiHostRequest): readonly PiToolMetadata[];
  getSkillDefinitions?(request: PiHostRequest): readonly PiSkillDefinition[];
  runResearchWorker?(request: PiResearchWorkerRequest, signal: AbortSignal): Promise<PiResearchWorkerResult>;
  runAgentWorker?(request: PiAgentWorkerRequest, signal: AbortSignal): Promise<PiAgentWorkerResult>;
  runCronJob?(request: PiCronRunRequest, signal: AbortSignal): Promise<void>;
  listMcpResources?(server?: string, signal?: AbortSignal): Promise<readonly PiMcpResourceGroup[]>;
  readMcpResource?(uri: string, server?: string, signal?: AbortSignal): Promise<PiMcpResourceRead>;
  getInvestmentWorkflowServices?(): InvestmentWorkflowServices;
  getMarketHistoryFetcher?(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  getMarketQuoteFetcher?(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  getMarketQuoteTrendStore?(): NativeMarketQuoteTrendStore;
  getMarketQuote?(symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string): Promise<PiMarketQuoteResult>;
  getManagementSnapshot?(): PiManagementSnapshot;
}

export interface PiToolMetadata {
  readonly name: string;
  readonly description: string;
  readonly compactDescription?: string;
  readonly concurrencySafe: boolean;
}

export interface PiSkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly instructions?: string;
  readonly disableModelInvocation?: boolean;
}

export type PiHostRegistry = ReadonlyMap<string, PiHostBridge>;

export function getPiHostFromRegistry(
  registry: PiHostRegistry | undefined,
  packageName: string,
): PiHostBridge | undefined {
  const host = registry?.get(packageName);
  if (!host || host.contract !== PI_HOST_CONTRACT || host.packageName !== packageName) return undefined;
  return host;
}

export function createPiHostBridge(
  sessionId: string,
  packageName: string,
  packageVersion: string,
  getToolDefinitions: () => readonly ToolDefinition[],
  runResearchWorker?: (request: PiResearchWorkerRequest, signal: AbortSignal) => Promise<PiResearchWorkerResult>,
  runAgentWorker?: (request: PiAgentWorkerRequest, signal: AbortSignal) => Promise<PiAgentWorkerResult>,
  getToolMetadata: () => readonly PiToolMetadata[] = () => [],
  getSkillDefinitions: () => readonly PiSkillDefinition[] = () => [],
  runCronJob?: (request: PiCronRunRequest, signal: AbortSignal) => Promise<void>,
  listMcpResources?: (server: string | undefined, signal: AbortSignal) => Promise<readonly PiMcpResourceGroup[]>,
  readMcpResource?: (uri: string, server: string | undefined, signal: AbortSignal) => Promise<PiMcpResourceRead>,
  getInvestmentWorkflowServices?: () => InvestmentWorkflowServices,
  getMarketHistoryFetcher?: () => (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  getMarketQuoteFetcher?: () => (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  getMarketQuoteTrendStore?: () => NativeMarketQuoteTrendStore,
  getMarketQuote?: (symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string) => Promise<PiMarketQuoteResult>,
  getManagementSnapshot?: () => PiManagementSnapshot,
): PiHostBridge {
  const capabilities: PiHostCapability[] = ['tool-definitions'];
  if (runResearchWorker) capabilities.push('research-worker');
  if (runAgentWorker) capabilities.push('agent-worker');
  if (runCronJob) capabilities.push('cron-runner');
  if (listMcpResources && readMcpResource) capabilities.push('mcp-resources');
  if (getInvestmentWorkflowServices) capabilities.push('investment-workflow');
  if (getMarketHistoryFetcher || getMarketQuoteFetcher || getMarketQuote || getMarketQuoteTrendStore) capabilities.push('market-data-transport');
  if (getManagementSnapshot) capabilities.push('management-snapshot');
  return {
    contract: PI_HOST_CONTRACT,
    packageName,
    packageVersion,
    sessionId,
    capabilities,
    ...(runResearchWorker ? { runResearchWorker } : {}),
    ...(runAgentWorker ? { runAgentWorker } : {}),
    ...(runCronJob ? { runCronJob } : {}),
    ...(listMcpResources ? { listMcpResources } : {}),
    ...(readMcpResource ? { readMcpResource } : {}),
    ...(getInvestmentWorkflowServices ? { getInvestmentWorkflowServices } : {}),
    ...(getMarketHistoryFetcher ? { getMarketHistoryFetcher } : {}),
    ...(getMarketQuoteFetcher ? { getMarketQuoteFetcher } : {}),
    ...(getMarketQuoteTrendStore ? { getMarketQuoteTrendStore } : {}),
    ...(getMarketQuote ? { getMarketQuote } : {}),
    ...(getManagementSnapshot ? { getManagementSnapshot } : {}),
    getToolDefinitions(request) {
      if (request.contract !== PI_HOST_CONTRACT) return [];
      if (request.packageName !== packageName || request.packageVersion !== packageVersion) return [];
      if (request.sessionId !== sessionId) return [];
      if (request.capability !== 'tool-definitions') return [];
      return getToolDefinitions();
    },
    getToolMetadata(request) {
      if (request.contract !== PI_HOST_CONTRACT) return [];
      if (request.packageName !== packageName || request.packageVersion !== packageVersion) return [];
      if (request.sessionId !== sessionId) return [];
      if (request.capability !== 'tool-definitions') return [];
      return getToolMetadata();
    },
    getSkillDefinitions(request) {
      if (request.contract !== PI_HOST_CONTRACT) return [];
      if (request.packageName !== packageName || request.packageVersion !== packageVersion) return [];
      if (request.sessionId !== sessionId) return [];
      if (request.capability !== 'tool-definitions') return [];
      return getSkillDefinitions();
    },
  };
}
