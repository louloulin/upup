/**
 * Hooks Module for UpUp
 *
 * Provides integration hooks for:
 * - Rate limiting API calls
 * - Response caching
 * - API key validation
 *
 * Based on Claude Code's hook system but simplified for UpUp's use case.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ============================================================================
// Configuration
// ============================================================================

export interface HooksConfig {
  enabled: boolean;
  rateLimit?: {
    enabled: boolean;
    interval: number;
    providers: string[];
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    maxSize: string;
  };
  apiValidation?: {
    enabled: boolean;
    requiredKeys: string[];
    optionalKeys: string[];
  };
}

const DEFAULT_CONFIG: HooksConfig = {
  enabled: true,
  rateLimit: {
    enabled: true,
    interval: 0.5,
    providers: ['tushare', 'deepseek', 'openai'],
  },
  cache: {
    enabled: true,
    ttl: 3600,
    maxSize: '100MB',
  },
  apiValidation: {
    enabled: true,
    requiredKeys: ['DEEPSEEK_API_KEY'],
    optionalKeys: ['TUSHARE_TOKEN', 'EXASEARCH_API_KEY', 'PERPLEXITY_API_KEY'],
  },
};

let hooksConfig: HooksConfig = DEFAULT_CONFIG;

// ============================================================================
// Rate Limiter
// ============================================================================

interface RateLimitState {
  [provider: string]: number;
}

const RATE_LIMIT_FILE = join(homedir(), '.upup', 'rate-limit.state');
const CACHE_DIR = join(homedir(), '.upup', 'cache');

/**
 * Load rate limit state from disk
 */
function loadRateLimitState(): RateLimitState {
  try {
    if (existsSync(RATE_LIMIT_FILE)) {
      const content = readFileSync(RATE_LIMIT_FILE, 'utf-8');
      const state: RateLimitState = {};
      for (const line of content.split('\n')) {
        const [key, value] = line.split('=');
        if (key && value) {
          state[key.trim()] = parseFloat(value.trim());
        }
      }
      return state;
    }
  } catch {
    // Ignore errors
  }
  return {};
}

/**
 * Save rate limit state to disk
 */
function saveRateLimitState(state: RateLimitState): void {
  try {
    const dir = dirname(RATE_LIMIT_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const content = Object.entries(state)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    writeFileSync(RATE_LIMIT_FILE, content, 'utf-8');
  } catch {
    // Ignore errors
  }
}

/**
 * Check if we need to wait before making a request
 * @param provider The API provider name
 * @param interval Minimum interval in seconds
 * @returns Time to wait in milliseconds, or 0 if no wait needed
 */
export async function checkRateLimit(
  provider: string,
  interval?: number
): Promise<number> {
  if (!hooksConfig.enabled || !hooksConfig.rateLimit?.enabled) {
    return 0;
  }

  const minInterval = interval ?? hooksConfig.rateLimit.interval ?? 0.5;
  const state = loadRateLimitState();
  const now = Date.now() / 1000;
  const lastCall = state[provider] ?? 0;
  const elapsed = now - lastCall;

  if (elapsed < minInterval) {
    return Math.ceil((minInterval - elapsed) * 1000);
  }

  return 0;
}

/**
 * Record an API call for rate limiting
 * @param provider The API provider name
 */
export function recordRateLimit(provider: string): void {
  if (!hooksConfig.enabled || !hooksConfig.rateLimit?.enabled) {
    return;
  }

  const state = loadRateLimitState();
  state[provider] = Date.now() / 1000;
  saveRateLimitState(state);
}

/**
 * Reset rate limit for a provider
 * @param provider The API provider name, or undefined to reset all
 */
export function resetRateLimit(provider?: string): void {
  if (provider) {
    const state = loadRateLimitState();
    delete state[provider];
    saveRateLimitState(state);
  } else {
    try {
      if (existsSync(RATE_LIMIT_FILE)) {
        const { unlinkSync } = require('node:fs');
        unlinkSync(RATE_LIMIT_FILE);
      }
    } catch {
      // Ignore errors
    }
  }
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  timestamp: number;
  ttl: number;
  namespace: string;
  key: string;
  data: unknown;
}

/**
 * Get cached value
 * @param namespace Cache namespace (e.g., 'tushare', 'akshare')
 * @param key Cache key
 * @returns Cached value or null if not found/expired
 */
export function cacheGet(namespace: string, key: string): unknown | null {
  if (!hooksConfig.enabled || !hooksConfig.cache?.enabled) {
    return null;
  }

  const cacheFile = join(CACHE_DIR, `${namespace}_${hashKey(key)}.json`);

  try {
    if (!existsSync(cacheFile)) {
      return null;
    }

    const content = readFileSync(cacheFile, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);

    // Check TTL
    const age = (Date.now() / 1000) - entry.timestamp;
    if (age > (entry.ttl ?? hooksConfig.cache?.ttl ?? 3600)) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Set cached value
 * @param namespace Cache namespace
 * @param key Cache key
 * @param data Data to cache
 * @param ttl Optional TTL in seconds
 */
export function cacheSet(
  namespace: string,
  key: string,
  data: unknown,
  ttl?: number
): void {
  if (!hooksConfig.enabled || !hooksConfig.cache?.enabled) {
    return;
  }

  const cacheFile = join(CACHE_DIR, `${namespace}_${hashKey(key)}.json`);

  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }

    const entry: CacheEntry = {
      timestamp: Date.now() / 1000,
      ttl: ttl ?? hooksConfig.cache?.ttl ?? 3600,
      namespace,
      key,
      data,
    };

    writeFileSync(cacheFile, JSON.stringify(entry), 'utf-8');
  } catch {
    // Ignore errors
  }
}

/**
 * Clear cache for a namespace
 * @param namespace Cache namespace, or undefined to clear all
 */
export function cacheClear(namespace?: string): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      return;
    }

    const { readdirSync, unlinkSync } = require('node:fs');
    const files = readdirSync(CACHE_DIR);

    for (const file of files) {
      if (!namespace || file.startsWith(`${namespace}_`)) {
        unlinkSync(join(CACHE_DIR, file));
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Simple hash function for cache keys
 */
function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  totalEntries: number;
  totalSize: number;
  expired: number;
  byNamespace: Record<string, number>;
} {
  const stats = {
    totalEntries: 0,
    totalSize: 0,
    expired: 0,
    byNamespace: {} as Record<string, number>,
  };

  try {
    if (!existsSync(CACHE_DIR)) {
      return stats;
    }

    const { readdirSync, statSync } = require('node:fs');
    const files = readdirSync(CACHE_DIR);
    const now = Date.now() / 1000;
    const ttl = hooksConfig.cache?.ttl ?? 3600;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      stats.totalEntries++;
      const filePath = join(CACHE_DIR, file);
      stats.totalSize += statSync(filePath).size;

      // Parse namespace
      const namespace = file.replace(/_[^_]*\.json$/, '');
      stats.byNamespace[namespace] = (stats.byNamespace[namespace] || 0) + 1;

      // Check expiration
      try {
        const content = readFileSync(filePath, 'utf-8');
        const entry: CacheEntry = JSON.parse(content);
        if ((now - entry.timestamp) > (entry.ttl ?? ttl)) {
          stats.expired++;
        }
      } catch {
        // Ignore parse errors
      }
    }
  } catch {
    // Ignore errors
  }

  return stats;
}

// ============================================================================
// API Key Validation
// ============================================================================

export interface ApiKeyStatus {
  key: string;
  present: boolean;
  required: boolean;
}

/**
 * Check API key status
 */
export function checkApiKeys(): ApiKeyStatus[] {
  const results: ApiKeyStatus[] = [];

  // Required keys
  for (const key of hooksConfig.apiValidation?.requiredKeys ?? []) {
    results.push({
      key,
      present: isKeySet(key),
      required: true,
    });
  }

  // Optional keys
  for (const key of hooksConfig.apiValidation?.optionalKeys ?? []) {
    results.push({
      key,
      present: isKeySet(key),
      required: false,
    });
  }

  return results;
}

/**
 * Check if an environment variable is set
 */
function isKeySet(key: string): boolean {
  const value = process.env[key];
  return Boolean(value && value !== 'undefined' && value !== 'null');
}

/**
 * Get validation status for required keys
 */
export function validateRequiredKeys(): {
  valid: boolean;
  missing: string[];
} {
  const missing = checkApiKeys()
    .filter(k => k.required && !k.present)
    .map(k => k.key);

  return {
    valid: missing.length === 0,
    missing,
  };
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Load hooks configuration from settings
 */
export function loadHooksConfig(config?: Partial<HooksConfig>): void {
  hooksConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };
}

/**
 * Get current hooks configuration
 */
export function getHooksConfig(): HooksConfig {
  return { ...hooksConfig };
}

/**
 * Enable or disable hooks
 */
export function setHooksEnabled(enabled: boolean): void {
  hooksConfig.enabled = enabled;
}

/**
 * Get rate limit status
 */
export function getRateLimitStatus(): RateLimitState {
  return loadRateLimitState();
}
