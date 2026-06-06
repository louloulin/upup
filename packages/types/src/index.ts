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

// ===== Token Usage =====
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}


// ===== UpUp-specific Types =====
//
// These types live in their canonical packages and are re-exported here for
// backward compatibility with code that imports from @upup/types.
export type { DisplayEvent } from '@upup/agent-runtime';
export type { HistoryItemStatus, WorkingState } from '@upup/tui-renderer';
// Legacy alias for code that imports the tui-renderer local-store HistoryItem
// (events: HistoryMessage[]). Not the same as the agent-runtime HistoryItem
// above; prefer the agent-runtime one for agent code.
export type { HistoryItem as TuiHistoryItem } from '@upup/tui-renderer';

// ===== Coordinator / multi-agent types =====
//
// Re-exported from @upup/coordinator-system for convenience. The canonical
// definitions live in packages/coordinator-system/src/multi-agent/types.ts.
export type {
  TeamMember,
  TeamFile,
  CreateTeamParams,
  AgentInstance,
  SpawnAgentParams,
  AgentMessage,
  BackendType,
  Backend,
  CoordinatorConfig,
  CoordinatorEvent,
  CoordinatorEventListener,
  TeamCreateInput,
  TeamCreateOutput,
  AgentSpawnInput,
  AgentSpawnOutput,
  AgentMessageInput,
  AgentMessageOutput,
  AgentResultsInput,
  AgentResultsOutput,
} from '@upup/coordinator-system';

// ===== Tool result formatting =====
//
// Re-exported from @upup/tools-registry for convenience. The canonical
// implementation lives in packages/tools-registry/src/types.ts.
export { formatToolResult } from '@upup/tools-registry';
export { parseSearchResults } from '@upup/tools-registry';
export type { ToolResult, ToolSideEffects, ToolConcurrencyMetadata, RegisteredTool, ToolSafetyLevel, ToolCategory } from '@upup/tools-registry';

// ===== Working state / history types =====
//
// Some legacy code imports `WorkingState` from @upup/types. The canonical
// definition now lives in @upup/tui-renderer; re-export for compat.

// ===== Plugin types =====
//
// Re-exported from @upup/plugins for convenience.
export type {
  PluginAdapter,
  PluginManifest,
  LoadedPlugin,
  UpUpPluginApi,
  PluginService,
  HookHandler,
} from '@upup/plugins';

// Session message types
export interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Portfolio/Benchmark types (re-exported from tools-registry)
export type { Portfolio, Benchmark } from '@upup/tools-registry/types.js';

