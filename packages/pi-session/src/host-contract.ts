import type { PiCapabilityContext } from '@upup/pi-runtime';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { PiInvestmentWorkflowServices, PiMarketQuoteResult, PiMarketTrendStore } from '@upup/types';

export const PI_HOST_CONTRACT = 'upup.pi.host.v1' as const;
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

export type { PiInvestmentWorkflowServices, PiMarketQuoteResult, PiMarketTrendStore } from '@upup/types';

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
      readonly providers: readonly { readonly name: 'auto' | 'yahoo' | 'tushare' | 'financial-datasets'; readonly configured: boolean }[];
      readonly metrics: {
        readonly requests: number;
        readonly cacheHits: number;
        readonly successes: number;
        readonly failures: number;
        readonly rateLimitFailures: number;
        readonly lastProvider?: 'yahoo' | 'tushare' | 'financial-datasets';
        readonly lastLatencyMs?: number;
        readonly lastOutcome?: 'success' | 'failure' | 'cache';
        readonly lastErrorClass?: 'credentials' | 'rate_limit' | 'forbidden' | 'server_error' | 'invalid_response' | 'unsupported_symbol' | 'aborted' | 'unknown';
        readonly lastCheckedAt?: string;
        readonly successRatePct: number;
        readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        readonly recentSamples: readonly {
          readonly provider: 'yahoo' | 'tushare' | 'financial-datasets';
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
          readonly provider: 'auto' | 'yahoo' | 'tushare' | 'financial-datasets';
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

export interface PiHostIdentity {
  readonly contract: typeof PI_HOST_CONTRACT;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly PiHostCapability[];
  readonly providerContract: PiProviderContract;
}

export interface PiProviderContract {
  readonly contract: 'upup.pi.provider.v1';
  readonly version: string;
  readonly state: 'active' | 'reloading' | 'disposed';
  reload(): Promise<void>;
  dispose(): Promise<void>;
}

export function negotiatePiProviderContract(contract: PiProviderContract, expectedVersion: string): void {
  if (contract.contract !== 'upup.pi.provider.v1') throw new Error('Unsupported Pi provider contract');
  if (contract.version !== expectedVersion) throw new Error(`Pi provider version mismatch: ${contract.version}, expected ${expectedVersion}`);
  if (contract.state !== 'active') throw new Error(`Pi provider is not active: ${contract.state}`);
}

export interface PiToolCapabilityProvider {
  getToolDefinitions(request: PiHostRequest): readonly ToolDefinition[];
  getToolMetadata(request: PiHostRequest): readonly PiToolMetadata[];
  getSkillDefinitions?(request: PiHostRequest): readonly PiSkillDefinition[];
}

export interface PiWorkerCapabilityProvider {
  runResearchWorker?(request: PiResearchWorkerRequest, signal: AbortSignal): Promise<PiResearchWorkerResult>;
  runAgentWorker?(request: PiAgentWorkerRequest, signal: AbortSignal): Promise<PiAgentWorkerResult>;
}

export interface PiSchedulingCapabilityProvider {
  runCronJob?(request: PiCronRunRequest, signal: AbortSignal): Promise<void>;
}

export interface PiMcpCapabilityProvider {
  listMcpResources?(server?: string, signal?: AbortSignal): Promise<readonly PiMcpResourceGroup[]>;
  readMcpResource?(uri: string, server?: string, signal?: AbortSignal): Promise<PiMcpResourceRead>;
}

export interface PiInvestmentWorkflowCapabilityProvider {
  getInvestmentWorkflowServices?(): PiInvestmentWorkflowServices;
}

export interface PiMarketDataCapabilityProvider {
  getMarketHistoryFetcher?(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  getMarketQuoteFetcher?(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  getMarketQuoteTrendStore?(): PiMarketTrendStore;
  getMarketQuote?(symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string): Promise<PiMarketQuoteResult>;
  readonly capabilityContext?: PiCapabilityContext;
}

export interface PiManagementCapabilityProvider {
  getManagementSnapshot?(): PiManagementSnapshot;
}

export interface PiHostProviders {
  readonly tools: PiToolCapabilityProvider;
  readonly workers?: PiWorkerCapabilityProvider;
  readonly scheduling?: PiSchedulingCapabilityProvider;
  readonly mcp?: PiMcpCapabilityProvider;
  readonly workflow?: PiInvestmentWorkflowCapabilityProvider;
  readonly marketData?: PiMarketDataCapabilityProvider;
  readonly management?: PiManagementCapabilityProvider;
}

export interface PiHostBridge extends PiHostIdentity {
  readonly providers: PiHostProviders;
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

export interface PiHostBridgeOptions {
  readonly sessionId: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly providers: PiHostProviders;
  readonly providerVersion?: string;
}

export function getPiHostFromRegistry(
  registry: PiHostRegistry | undefined,
  packageName: string,
): PiHostBridge | undefined {
  const host = registry?.get(packageName);
  if (!host || host.contract !== PI_HOST_CONTRACT || host.packageName !== packageName) return undefined;
  return host;
}

export function createPiHostBridge(options: PiHostBridgeOptions): PiHostBridge {
  const { sessionId, packageName, packageVersion, providers } = options;
  let disposed = false;
  let reloading = false;
  const providerVersion = options.providerVersion ?? '1.0.0';
  const ensureActive = (): void => {
    if (disposed) throw new Error(`Pi provider is disposed: ${packageName}`);
    if (reloading) throw new Error(`Pi provider is reloading: ${packageName}`);
  };
  const guard = <T extends object>(provider: T): T => new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        ensureActive();
        const result = value.apply(target, args);
        return typeof result === 'function'
          ? (...nestedArgs: unknown[]) => { ensureActive(); return result(...nestedArgs); }
          : result;
      };
    },
  });
  const capabilities: PiHostCapability[] = ['tool-definitions'];
  if (providers.workers?.runResearchWorker) capabilities.push('research-worker');
  if (providers.workers?.runAgentWorker) capabilities.push('agent-worker');
  if (providers.scheduling?.runCronJob) capabilities.push('cron-runner');
  if (providers.mcp?.listMcpResources && providers.mcp.readMcpResource) capabilities.push('mcp-resources');
  if (providers.workflow?.getInvestmentWorkflowServices) capabilities.push('investment-workflow');
  if (providers.marketData?.getMarketHistoryFetcher || providers.marketData?.getMarketQuoteFetcher || providers.marketData?.getMarketQuote || providers.marketData?.getMarketQuoteTrendStore || providers.marketData?.capabilityContext) capabilities.push('market-data-transport');
  if (providers.management?.getManagementSnapshot) capabilities.push('management-snapshot');
  const tools: PiToolCapabilityProvider = guard({
    getToolDefinitions(request) {
      if (request.contract !== PI_HOST_CONTRACT || request.packageName !== packageName || request.packageVersion !== packageVersion || request.sessionId !== sessionId || request.capability !== 'tool-definitions') return [];
      return providers.tools.getToolDefinitions(request);
    },
    getToolMetadata(request) {
      if (request.contract !== PI_HOST_CONTRACT || request.packageName !== packageName || request.packageVersion !== packageVersion || request.sessionId !== sessionId || request.capability !== 'tool-definitions') return [];
      return providers.tools.getToolMetadata(request);
    },
    ...(providers.tools.getSkillDefinitions ? { getSkillDefinitions: (request: PiHostRequest) => {
      if (request.contract !== PI_HOST_CONTRACT || request.packageName !== packageName || request.packageVersion !== packageVersion || request.sessionId !== sessionId || request.capability !== 'tool-definitions') return [];
      return providers.tools.getSkillDefinitions!(request);
    } } : {}),
  });
  return {
    contract: PI_HOST_CONTRACT,
    packageName,
    packageVersion,
    sessionId,
    capabilities,
    providerContract: {
      contract: 'upup.pi.provider.v1',
      version: providerVersion,
      get state() { return disposed ? 'disposed' : reloading ? 'reloading' : 'active'; },
      async reload() {
        ensureActive();
        reloading = true;
        await Promise.resolve();
        reloading = false;
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        await Promise.resolve();
      },
    },
    providers: {
      ...providers,
      tools,
      ...(providers.workers ? { workers: guard(providers.workers) } : {}),
      ...(providers.scheduling ? { scheduling: guard(providers.scheduling) } : {}),
      ...(providers.mcp ? { mcp: guard(providers.mcp) } : {}),
      ...(providers.workflow ? { workflow: guard(providers.workflow) } : {}),
      ...(providers.marketData ? { marketData: guard(providers.marketData) } : {}),
      ...(providers.management ? { management: guard(providers.management) } : {}),
    },
  };
}

export async function disposePiHostBridge(host: PiHostBridge): Promise<void> {
  await host.providerContract.dispose();
}

export function getPiHostToolDefinitions(host: PiHostBridge, request: PiHostRequest): readonly ToolDefinition[] {
  if (request.contract !== PI_HOST_CONTRACT) return [];
  if (request.packageName !== host.packageName || request.packageVersion !== host.packageVersion) return [];
  if (request.sessionId !== host.sessionId) return [];
  if (request.capability !== 'tool-definitions') return [];
  return host.providers.tools.getToolDefinitions(request);
}
