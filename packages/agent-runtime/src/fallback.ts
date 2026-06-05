/**
 * Model Fallback Handler - Claude Code-style model fallback
 *
 * Features:
 * - Automatic model switching on error
 * - Output token limit recovery (retry with higher limit)
 * - Thinking signature stripping
 * - Circuit breaker for failed models
 *
 * Reference: Loucode's query.ts model fallback mechanism
 */

import { info, warn, error } from '@upup/utils/logging';
import { AIMessage } from '@langchain/core/messages';
import { getSetting } from '@upup/utils/config';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '@upup/llm';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Errors that trigger fallback
 */
export class FallbackTriggeredError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly failedModel: string
  ) {
    super(message);
    this.name = 'FallbackTriggeredError';
  }
}

/**
 * Output token limit exceeded
 */
export class OutputTokenLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: number,
    public readonly model: string
  ) {
    super(message);
    this.name = 'OutputTokenLimitError';
  }
}

/**
 * Context overflow error
 */
export class ContextOverflowError extends Error {
  constructor(message: string, public readonly contextLength: number) {
    super(message);
    this.name = 'ContextOverflowError';
  }
}

/**
 * All fallback errors exhausted
 */
export class LoopExhaustedError extends Error {
  constructor(
    message: string,
    public readonly lastError?: Error
  ) {
    super(message);
    this.name = 'LoopExhaustedError';
  }
}

// ============================================================================
// Configuration
// ============================================================================

export interface FallbackConfig {
  /** Primary model */
  primaryModel: string;
  /** Fallback models in order of preference */
  fallbackModels: string[];
  /** Maximum retries per model */
  maxRetriesPerModel: number;
  /** Enable token limit recovery */
  enableTokenLimitRecovery: boolean;
  /** Enable thinking strip */
  enableThinkingStrip: boolean;
}

/**
 * Get default fallback config from settings
 */
export function getDefaultFallbackConfig(): FallbackConfig {
  const provider = getSetting('provider', DEFAULT_PROVIDER) as string;
  const modelId = getSetting('modelId', DEFAULT_MODEL) as string;

  // Build model ID based on provider
  let primaryModel = modelId;
  if (provider === 'deepseek') {
    primaryModel = modelId || 'deepseek-v4-flash';
  }

  return {
    primaryModel,
    fallbackModels: ['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.0-flash'],
    maxRetriesPerModel: 3,
    enableTokenLimitRecovery: true,
    enableThinkingStrip: true,
  };
}

const DEFAULT_CONFIG = getDefaultFallbackConfig();

// ============================================================================
// Thinking Signature Stripping
// ============================================================================

/**
 * Strip thinking signatures from content
 * Claude's <thinking> tags, o1's chain-of-thought, etc.
 */
export function stripThinkingSignatures(content: string): string {
  let stripped = content;

  // Claude's thinking tags
  stripped = stripped.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // o1/o3 chain-of-thought patterns
  stripped = stripped.replace(/\n*Let me(?:'s| us)? (?:think|work through|analyze)/gi, '');
  stripped = stripped.replace(/(?:First|Then|Next|Finally),?\s+(?:I(?:'ll|'d)? )?(?:need to )?(?:check|think about|consider|look at|analyze)/gi, '');

  // Step-by-step patterns
  stripped = stripped.replace(/\d+\.\s+(?:I(?:'ll|'d)? )?(?:need to )?(?:check|think about|consider|look at|analyze)/gi, '');

  // Clean up extra whitespace
  stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();

  return stripped;
}

// ============================================================================
// Token Limit Recovery
// ============================================================================

/**
 * Output token limits by model
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'gpt-5.4': 8192,
  'gpt-4o': 16384,
  'claude-sonnet-4-20250514': 8192,
  'claude-opus-4-20250514': 8192,
  'gemini-2.0-flash': 8192,
  'deepseek-v3': 8192,
  'deepseek-v4-flash': 16384,
  'deepseek-chat': 16384,
};

/**
 * Get default token limit for a model
 */
export function getDefaultTokenLimit(model: string): number {
  return MODEL_TOKEN_LIMITS[model] ?? 4096;
}

/**
 * Increase token limit for recovery
 */
export function increaseTokenLimit(currentLimit: number): number {
  // Doubling strategy
  const newLimit = Math.min(currentLimit * 2, 65536);
  warn('agent', `Increasing token limit: ${currentLimit} -> ${newLimit}`);
  return newLimit;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Track failed models for circuit breaker
 */
class CircuitBreaker {
  private failedModels: Map<string, number> = new Map();
  private readonly cooldownMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Record a failure for a model
   */
  recordFailure(model: string): void {
    const count = this.failedModels.get(model) ?? 0;
    this.failedModels.set(model, count + 1);
    warn('agent', `Model ${model} failure count: ${count + 1}`);
  }

  /**
   * Check if a model should be skipped
   */
  shouldSkip(model: string): boolean {
    const count = this.failedModels.get(model);
    if (!count) return false;

    // Skip after 3 consecutive failures
    if (count >= 3) {
      warn('agent', `Circuit breaker: skipping ${model} (${count} failures)`);
      return true;
    }
    return false;
  }

  /**
   * Reset failures for a model (on success)
   */
  reset(model: string): void {
    this.failedModels.delete(model);
  }

  /**
   * Clear all circuit breaker state
   */
  clear(): void {
    this.failedModels.clear();
  }
}

const circuitBreaker = new CircuitBreaker();

// ============================================================================
// Model Fallback Handler
// ============================================================================

export interface LLMResult {
  response: string | AIMessage;
  usage?: TokenUsage;
  model: string;
  finishReason?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class ModelFallbackHandler {
  private config: FallbackConfig;
  private currentModelIndex: number = 0;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get all available models in order
   */
  getAvailableModels(): string[] {
    const models = [this.config.primaryModel, ...this.config.fallbackModels];
    return models.filter(m => !circuitBreaker.shouldSkip(m));
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    const available = this.getAvailableModels();
    return available[this.currentModelIndex] ?? this.config.primaryModel;
  }

  /**
   * Reset to primary model
   */
  reset(): void {
    this.currentModelIndex = 0;
    circuitBreaker.clear();
  }

  /**
   * Execute with fallback
   */
  async executeWithFallback(
    callFn: (model: string, options?: { maxTokens?: number }) => Promise<LLMResult>
  ): Promise<LLMResult> {
    const available = this.getAvailableModels();

    if (available.length === 0) {
      throw new LoopExhaustedError('No available models');
    }

    let lastError: Error | undefined;
    let retriesForCurrentModel = 0;

    for (let i = 0; i < available.length; i++) {
      const model = available[i];
      this.currentModelIndex = i;

      // Skip if circuit breaker says so
      if (circuitBreaker.shouldSkip(model)) {
        continue;
      }

      try {
        info('agent', `Attempting model: ${model}`);

        const result = await callFn(model);

        // Success - reset circuit breaker
        circuitBreaker.reset(model);
        this.currentModelIndex = i;

        info('agent', `Model ${model} succeeded`);
        return { ...result, model };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        warn('agent', `Model ${model} failed: ${lastError.message}`);

        // Handle specific error types
        if (e instanceof OutputTokenLimitError && this.config.enableTokenLimitRecovery) {
          // Retry with higher token limit
          const newLimit = increaseTokenLimit(e.limit);
          try {
            const result = await callFn(model, { maxTokens: newLimit });
            circuitBreaker.reset(model);
            return { ...result, model };
          } catch (retryError) {
            warn('agent', `Token limit recovery failed for ${model}`);
            circuitBreaker.recordFailure(model);
          }
        }

        if (e instanceof ContextOverflowError) {
          // Context overflow - don't retry same model, move to next
          warn('agent', `Context overflow for ${model}, trying next model`);
          circuitBreaker.recordFailure(model);
          retriesForCurrentModel = this.config.maxRetriesPerModel; // Skip retries
        }

        // Check retry count for this model
        retriesForCurrentModel++;
        if (retriesForCurrentModel >= this.config.maxRetriesPerModel) {
          circuitBreaker.recordFailure(model);
          retriesForCurrentModel = 0;
        }
      }
    }

    throw new LoopExhaustedError(
      'All models exhausted',
      lastError
    );
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let fallbackHandler: ModelFallbackHandler | null = null;

export function getFallbackHandler(): ModelFallbackHandler {
  if (!fallbackHandler) {
    fallbackHandler = new ModelFallbackHandler();
  }
  return fallbackHandler;
}

export function resetFallbackHandler(): void {
  fallbackHandler = null;
  circuitBreaker.clear();
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Check if error is a fallback-triggered error
 */
export function isFallbackError(error: unknown): boolean {
  return error instanceof FallbackTriggeredError ||
         error instanceof OutputTokenLimitError ||
         error instanceof ContextOverflowError;
}

/**
 * Get error details for logging
 */
export function getErrorDetails(error: unknown): {
  type: string;
  message: string;
  model?: string;
} {
  if (error instanceof FallbackTriggeredError) {
    return {
      type: 'FallbackTriggered',
      message: error.message,
      model: error.failedModel,
    };
  }
  if (error instanceof OutputTokenLimitError) {
    return {
      type: 'OutputTokenLimit',
      message: error.message,
      model: error.model,
    };
  }
  if (error instanceof ContextOverflowError) {
    return {
      type: 'ContextOverflow',
      message: error.message,
    };
  }
  if (error instanceof LoopExhaustedError) {
    return {
      type: 'LoopExhausted',
      message: error.message,
    };
  }
  return {
    type: error instanceof Error ? error.name : 'Unknown',
    message: error instanceof Error ? error.message : String(error),
  };
}
