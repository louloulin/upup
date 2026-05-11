/**
 * @upup/llm - LLM Client SDK
 *
 * Unified interface for multiple LLM providers.
 * No external dependencies.
 *
 * @example
 * ```typescript
 * import { createClient, PROVIDERS } from '@upup/llm';
 *
 * // Create client
 * const client = createClient('openai', process.env.OPENAI_API_KEY);
 *
 * // Complete
 * const response = await client.complete('Hello!');
 * console.log(response.content);
 * ```
 */

import type { AgentTool } from '@upup/types';

// Re-export provider types
export type { ProviderDef } from './providers.js';
export { PROVIDERS, resolveProvider, getProviderById } from './providers.js';

// ===== Token Usage =====

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ===== LLM Options =====

export interface LlmOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  tools?: AgentTool[];
}

// ===== LLM Response =====

export interface LlmResponse {
  content: string;
  model: string;
  finishReason?: 'stop' | 'length' | 'content_filter';
  usage?: TokenUsage;
}

// ===== LLM Client Interface =====

export interface LlmClient {
  /**
   * Send a completion request
   */
  complete(prompt: string, options?: LlmOptions): Promise<LlmResponse>;

  /**
   * Stream a completion response
   */
  stream?(prompt: string, options?: LlmOptions): AsyncIterable<string>;

  /**
   * Provider identifier
   */
  readonly provider: string;

  /**
   * Default model
   */
  readonly defaultModel: string;
}

// ===== Client Factory =====

type ClientConstructor = new (apiKey?: string) => LlmClient;

const clients = new Map<string, ClientConstructor>();

/**
 * Register a client constructor for a provider
 */
export function registerClient(provider: string, clientClass: ClientConstructor): void {
  clients.set(provider, clientClass);
}

/**
 * Create a client for a specific provider
 */
export function createClient(provider: string, apiKey?: string): LlmClient {
  const ClientClass = clients.get(provider);
  if (!ClientClass) {
    const available = Array.from(clients.keys()).join(', ');
    throw new Error(`Unknown provider: ${provider}. Available: ${available}`);
  }
  return new ClientClass(apiKey);
}

/**
 * Check if a provider is registered
 */
export function hasClient(provider: string): boolean {
  return clients.has(provider);
}

/**
 * Get list of registered providers
 */
export function getRegisteredProviders(): string[] {
  return Array.from(clients.keys());
}
