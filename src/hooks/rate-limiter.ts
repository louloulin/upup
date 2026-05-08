/**
 * Enhanced Rate Limiter - API-aware rate limiting with header parsing
 *
 * Features:
 * - Parse rate limit headers (X-RateLimit-Reset, Retry-After)
 * - Exponential backoff
 * - Burst limiting
 * - Per-provider tracking
 * - Integration with LLM calls
 *
 * Reference: Loucode's rate limit handling
 */

import { info, warn, error } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Rate limit info from API response
 */
export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  reset?: number;        // Unix timestamp
  retryAfter?: number;   // Seconds to wait
}

/**
 * Rate limit config
 */
export interface RateLimitConfig {
  /** Enable rate limiting */
  enabled: boolean;
  /** Default interval in ms (for providers without headers) */
  defaultInterval: number;
  /** Max backoff in ms */
  maxBackoff: number;
  /** Initial backoff in ms */
  initialBackoff: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Provider rate limit state
 */
interface ProviderState {
  lastCall: number;
  calls: number[];       // Timestamps of recent calls
  backoffUntil: number;  // When backoff ends
  limit?: number;
  remaining?: number;
  resetTime?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  enabled: true,
  defaultInterval: 500,     // 500ms default
  maxBackoff: 60000,        // 60s max
  initialBackoff: 1000,     // 1s initial
  backoffMultiplier: 2,
};

// ============================================================================
// Rate Limiter
// ============================================================================

export class EnhancedRateLimiter {
  private config: RateLimitConfig;
  private providers: Map<string, ProviderState> = new Map();
  private readonly WINDOW_SIZE = 60000; // 1 minute window

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Update configuration
   */
  configure(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if rate limiting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  // -------------------------------------------------------------------------
  // Rate Limit Check
  // -------------------------------------------------------------------------

  /**
   * Check if we need to wait before making a request
   * Returns time to wait in milliseconds
   */
  async check(provider: string): Promise<number> {
    if (!this.config.enabled) return 0;

    const state = this.getState(provider);
    const now = Date.now();

    // Check if in backoff period
    if (state.backoffUntil > now) {
      const wait = state.backoffUntil - now;
      warn('system', `${provider}: in backoff, waiting ${wait}ms`);
      return wait;
    }

    // Check interval limit
    const elapsed = now - state.lastCall;
    if (elapsed < this.config.defaultInterval) {
      return this.config.defaultInterval - elapsed;
    }

    // Check burst limit (calls in window)
    this.cleanupWindow(state, now);
    if (state.calls.length >= 60) { // Max 60 calls per minute default
      const oldest = state.calls[0];
      const wait = oldest + this.WINDOW_SIZE - now;
      warn('system', `${provider}: burst limit, waiting ${wait}ms`);
      return Math.max(0, wait);
    }

    return 0;
  }

  /**
   * Check and wait if needed
   */
  async waitForSlot(provider: string): Promise<void> {
    const wait = await this.check(provider);
    if (wait > 0) {
      await this.sleep(wait);
    }
  }

  /**
   * Record a successful call
   */
  recordSuccess(provider: string, response?: Response): void {
    const state = this.getState(provider);
    const now = Date.now();

    state.lastCall = now;
    state.calls.push(now);
    state.backoffUntil = 0; // Reset backoff on success

    // Parse rate limit headers if available
    if (response) {
      this.parseHeaders(state, response.headers);
    }

    info('system', `${provider}: call recorded (${state.calls.length} in window)`);
  }

  /**
   * Record a rate limit error
   */
  recordRateLimitError(provider: string, response?: Response, retryAfter?: number): void {
    const state = this.getState(provider);
    const now = Date.now();

    // Calculate backoff
    let backoff = this.config.initialBackoff;

    if (retryAfter) {
      // Use Retry-After header
      backoff = retryAfter * 1000;
    } else if (response) {
      // Try to get reset time
      const reset = this.parseResetTime(response.headers);
      if (reset) {
        backoff = Math.max(0, reset * 1000 - now);
      }
    }

    // Apply multiplier for consecutive errors
    const currentBackoff = state.backoffUntil - now;
    if (currentBackoff > 0) {
      backoff = Math.min(currentBackoff * this.config.backoffMultiplier, this.config.maxBackoff);
    }

    backoff = Math.min(backoff, this.config.maxBackoff);
    state.backoffUntil = now + backoff;

    warn('system', `${provider}: rate limit error, backing off ${backoff}ms`);
  }

  /**
   * Record a generic error (increase backoff slightly)
   */
  recordError(provider: string): void {
    const state = this.getState(provider);
    const now = Date.now();

    const currentBackoff = state.backoffUntil - now;
    const newBackoff = Math.min(
      currentBackoff > 0 ? currentBackoff * 1.5 : this.config.initialBackoff,
      this.config.maxBackoff
    );

    state.backoffUntil = now + newBackoff;
  }

  // -------------------------------------------------------------------------
  // State Management
  // -------------------------------------------------------------------------

  /**
   * Get state for a provider
   */
  private getState(provider: string): ProviderState {
    if (!this.providers.has(provider)) {
      this.providers.set(provider, {
        lastCall: 0,
        calls: [],
        backoffUntil: 0,
      });
    }
    return this.providers.get(provider)!;
  }

  /**
   * Clean up old calls outside the window
   */
  private cleanupWindow(state: ProviderState, now: number): void {
    const cutoff = now - this.WINDOW_SIZE;
    state.calls = state.calls.filter(t => t > cutoff);
  }

  /**
   * Parse rate limit headers
   */
  private parseHeaders(state: ProviderState, headers: Headers): void {
    // X-RateLimit-Limit
    const limit = headers.get('X-RateLimit-Limit');
    if (limit) state.limit = parseInt(limit, 10);

    // X-RateLimit-Remaining
    const remaining = headers.get('X-RateLimit-Remaining');
    if (remaining) state.remaining = parseInt(remaining, 10);

    // X-RateLimit-Reset
    const reset = headers.get('X-RateLimit-Reset');
    if (reset) state.resetTime = parseInt(reset, 10);

    // Retry-After
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      // Could be seconds or Unix timestamp
      const val = parseInt(retryAfter, 10);
      if (val > 1000000000) {
        // Unix timestamp
        state.resetTime = val;
      } else {
        // Seconds
        state.resetTime = Math.floor(Date.now() / 1000) + val;
      }
    }
  }

  /**
   * Parse reset time from headers
   */
  private parseResetTime(headers: Headers): number | undefined {
    // Try X-RateLimit-Reset first
    const reset = headers.get('X-RateLimit-Reset');
    if (reset) {
      const val = parseInt(reset, 10);
      if (val > 1000000000) return val; // Unix timestamp
      return Math.floor(Date.now() / 1000) + val; // Seconds from now
    }

    // Try Retry-After
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const val = parseInt(retryAfter, 10);
      if (val > 1000000000) return val;
      return Math.floor(Date.now() / 1000) + val;
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /**
   * Get current state for a provider
   */
  getStateInfo(provider: string): {
    lastCall: number;
    callsInWindow: number;
    backoffMs: number;
    limit?: number;
    remaining?: number;
    resetTime?: number;
  } {
    const state = this.getState(provider);
    const now = Date.now();

    return {
      lastCall: state.lastCall,
      callsInWindow: state.calls.length,
      backoffMs: Math.max(0, state.backoffUntil - now),
      limit: state.limit,
      remaining: state.remaining,
      resetTime: state.resetTime,
    };
  }

  /**
   * Get all providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Reset state for a provider
   */
  reset(provider?: string): void {
    if (provider) {
      this.providers.delete(provider);
    } else {
      this.providers.clear();
    }
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Rate Limit Error
// ============================================================================

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryAfterMs?: number,
    public readonly resetTime?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a rate-limited fetch wrapper
 */
export function createRateLimitedFetcher(
  provider: string,
  limiter: EnhancedRateLimiter
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    await limiter.waitForSlot(provider);

    const response = await fetch(url, init);

    if (response.status === 429) {
      limiter.recordRateLimitError(provider, response);
      throw new RateLimitError(
        `Rate limit exceeded for ${provider}`,
        provider,
        undefined,
        limiter.getStateInfo(provider).resetTime
      );
    }

    if (response.ok) {
      limiter.recordSuccess(provider, response);
    }

    return response;
  };
}

// ============================================================================
// Singleton
// ============================================================================

let rateLimiter: EnhancedRateLimiter | null = null;

export function getRateLimiter(): EnhancedRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new EnhancedRateLimiter();
  }
  return rateLimiter;
}

export function resetRateLimiter(): void {
  rateLimiter = null;
}
