/**
 * @upup/types - Shared TypeScript types for UpUp
 *
 * Core types that are shared across UpUp packages.
 */

// ===== Tool Types =====

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolOptions {
  enabled?: boolean;
  timeout?: number;
}

// ===== Hook Types =====

export interface HookConfig {
  events: string[];
  handler: string;
  enabled?: boolean;
}

export interface HookContext {
  event: string;
  data: Record<string, unknown>;
  pluginId?: string;
}

export interface HookResult {
  modified?: boolean;
  blocked?: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ===== Provider Types =====

export interface ProviderConfig {
  id: string;
  name?: string;
  type: 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  options?: Record<string, unknown>;
}

export interface LlmOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  tools?: AgentTool[];
}

export interface LlmResponse {
  content: string;
  model: string;
  finishReason?: 'stop' | 'length' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ===== Session Types =====

export interface SessionConfig {
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface Session {
  id: string;
  config: SessionConfig;
  createdAt: number;
  messages: Message[];
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

// ===== Plugin Types =====

export interface PluginMeta {
  id: string;
  name: string;
  version?: string;
  description?: string;
}

export interface PluginConfig {
  id: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

// ===== Memory Types =====

export interface MemoryEntry {
  id: string;
  content: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  name?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  type?: string;
}

export interface SearchOptions {
  maxResults?: number;
  minScore?: number;
  type?: 'keyword' | 'semantic' | 'hybrid';
}

// ===== Pi Domain Contracts =====

export type PiMarket = 'cn' | 'hk' | 'us' | 'fund' | 'crypto';
export type PiMarketFreshness = 'historical' | 'cached' | 'delayed' | 'realtime' | 'offline';
export type PiHistoricalMarketFreshness = Exclude<PiMarketFreshness, 'offline'>;
export type PiMarketCurrency = 'CNY' | 'HKD' | 'USD';

export interface PiMarketQuoteValue {
  readonly symbol: string;
  readonly market: PiMarket;
  readonly price: number;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
  readonly currency: PiMarketCurrency;
  readonly asOf: string;
  readonly source: string;
  readonly freshness: PiMarketFreshness;
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
    readonly dataFreshness: PiMarketFreshness;
    readonly auditId: string;
  };
}

export interface PiMarketTrendBucket {
  readonly startAt: string;
  readonly requests: number;
  readonly cacheHits: number;
  readonly successes: number;
  readonly failures: number;
  readonly successRatePct: number;
  readonly avgLatencyMs?: number;
  readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface PiMarketTrendStore {
  load(): readonly PiMarketTrendBucket[];
  save(buckets: readonly PiMarketTrendBucket[]): void;
}

export interface PiInvestmentResearchData {
  readonly price?: unknown;
  readonly ratios?: unknown;
  readonly estimates?: unknown;
  readonly earnings?: unknown;
  readonly filings?: unknown;
}

export interface PiInvestmentMarketHistoryPoint {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface PiInvestmentMarketHistoryEvidence {
  readonly source: string;
  readonly provider?: string;
  readonly retrievedAt: string;
  readonly asOf: string;
  readonly query: string;
  readonly dataFreshness: PiHistoricalMarketFreshness;
  readonly auditId: string;
}

export interface PiInvestmentMarketHistory {
  readonly bars: readonly PiInvestmentMarketHistoryPoint[];
  readonly evidence: PiInvestmentMarketHistoryEvidence;
}

export interface PiInvestmentPosition {
  readonly symbol: string;
  readonly quantity: number;
  readonly avgCost: number;
  readonly realizedPnL?: number;
}

export interface PiInvestmentQuote {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
}

export interface PiInvestmentBalance {
  readonly cash: number;
  readonly marketValue: number;
  readonly totalEquity: number;
  readonly currency: string;
}

export interface PiInvestmentOrder {
  readonly id: string;
  readonly status: string;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly avgFillPrice?: number;
  readonly commission?: number;
}

export interface PiInvestmentWorkflowServices {
  readonly getResearchData: (ticker: string, signal: AbortSignal, market?: PiMarket) => Promise<PiInvestmentResearchData>;
  readonly getFundHistory: (fundCode: string, startDate: string, endDate: string, signal: AbortSignal) => Promise<readonly { readonly date: string; readonly nav: number }[]>;
  readonly getMarketHistory: (symbol: string, startDate: string, signal: AbortSignal, market?: PiMarket) => Promise<PiInvestmentMarketHistory>;
  readonly getSandboxState: (signal: AbortSignal) => Promise<{
    readonly positions: readonly PiInvestmentPosition[];
    readonly balance: PiInvestmentBalance;
    readonly getQuote: (symbol: string, signal: AbortSignal, market?: PiMarket) => Promise<PiInvestmentQuote>;
  }>;
  readonly placePaperOrder: (input: { readonly symbol: string; readonly side: 'buy' | 'sell'; readonly quantity: number }, signal: AbortSignal) => Promise<PiInvestmentOrder>;
}

// ===== Error Types =====

export class UpupError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UpupError';
  }
}

export class PluginError extends UpupError {
  constructor(message: string, public pluginId?: string) {
    super(message, 'PLUGIN_ERROR');
    this.name = 'PluginError';
  }
}

export class ToolError extends UpupError {
  constructor(message: string, public toolName?: string) {
    super(message, 'TOOL_ERROR');
    this.name = 'ToolError';
  }
}

export class ProviderError extends UpupError {
  constructor(message: string, public providerId?: string) {
    super(message, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
  }
}
