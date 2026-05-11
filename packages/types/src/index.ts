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
