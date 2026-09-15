/**
 * @upup/hooks - Hooks SDK
 *
 * Rate limiting, caching, and API validation utilities.
 * No external dependencies.
 *
 * @example
 * ```typescript
 * import { checkRateLimit, cacheGet, cacheSet, validateRequiredKeys } from '@upup/hooks';
 *
 * // Rate limit API calls
 * const wait = await checkRateLimit('openai', 0.5);
 * if (wait > 0) await new Promise(r => setTimeout(r, wait));
 *
 * // Cache responses
 * const cached = cacheGet('api', 'stock-aapl');
 * if (!cached) {
 *   const data = await fetchStockData('AAPL');
 *   cacheSet('api', 'stock-aapl', data, 300);
 * }
 *
 * // Validate API keys
 * const { valid, missing } = validateRequiredKeys();
 * if (!valid) console.error('Missing keys:', missing);
 * ```
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ============================================================================
// Configuration
// ============================================================================

export interface RateLimitConfig {
  enabled: boolean;
  interval: number;
  providers: string[];
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: string;
}

export interface ApiValidationConfig {
  enabled: boolean;
  requiredKeys: string[];
  optionalKeys: string[];
}

export interface HooksConfig {
  enabled: boolean;
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  apiValidation?: ApiValidationConfig;
}

const DEFAULT_CONFIG: HooksConfig = {
  enabled: true,
  rateLimit: {
    enabled: true,
    interval: 0.5,
    providers: ['openai', 'deepseek'],
  },
  cache: {
    enabled: true,
    ttl: 3600,
    maxSize: '100MB',
  },
  apiValidation: {
    enabled: true,
    requiredKeys: [],
    optionalKeys: [],
  },
};

let hooksConfig: HooksConfig = { ...DEFAULT_CONFIG };

// Resolve the global UpUp home at module load. Honours `$UPUP_HOME` so tests
// can sandbox the hooks SDK the same way the rest of UpUp does.
const UPUP_HOME_ROOT = process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup');

// ============================================================================
// Rate Limiter
// ============================================================================

const RATE_LIMIT_FILE = join(UPUP_HOME_ROOT, 'rate-limit.state');
const CACHE_DIR = join(UPUP_HOME_ROOT, 'cache');

interface RateLimitState {
  [provider: string]: number;
}

function loadRateLimitState(): RateLimitState {
  try {
    if (existsSync(RATE_LIMIT_FILE)) {
      const content = readFileSync(RATE_LIMIT_FILE, 'utf-8');
      const state: RateLimitState = {};
      for (const line of content.split('\n')) {
        const [key, value] = line.split('=');
        if (key && value) state[key.trim()] = parseFloat(value.trim());
      }
      return state;
    }
  } catch {}
  return {};
}

function saveRateLimitState(state: RateLimitState): void {
  try {
    const dir = dirname(RATE_LIMIT_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const content = Object.entries(state).map(([k, v]) => `${k}=${v}`).join('\n');
    writeFileSync(RATE_LIMIT_FILE, content, 'utf-8');
  } catch {}
}

/**
 * Check if we need to wait before making a request
 * @param provider The API provider name
 * @param interval Minimum interval in seconds
 * @returns Time to wait in milliseconds, or 0 if no wait needed
 */
export async function checkRateLimit(provider: string, interval?: number): Promise<number> {
  if (!hooksConfig.enabled || !hooksConfig.rateLimit?.enabled) return 0;
  const minInterval = interval ?? hooksConfig.rateLimit.interval ?? 0.5;
  const state = loadRateLimitState();
  const now = Date.now() / 1000;
  const lastCall = state[provider] ?? 0;
  const elapsed = now - lastCall;
  return elapsed < minInterval ? Math.ceil((minInterval - elapsed) * 1000) : 0;
}

/**
 * Record an API call for rate limiting
 * @param provider The API provider name
 */
export function recordRateLimit(provider: string): void {
  if (!hooksConfig.enabled || !hooksConfig.rateLimit?.enabled) return;
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
    try { if (existsSync(RATE_LIMIT_FILE)) unlinkSync(RATE_LIMIT_FILE); } catch {}
  }
}

/**
 * Get current rate limit state
 */
export function getRateLimitStatus(): RateLimitState {
  return loadRateLimitState();
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
 * Get cached value
 * @param namespace Cache namespace (e.g., 'api', 'stock')
 * @param key Cache key
 * @returns Cached value or null if not found/expired
 */
export function cacheGet(namespace: string, key: string): unknown | null {
  if (!hooksConfig.enabled || !hooksConfig.cache?.enabled) return null;
  const cacheFile = join(CACHE_DIR, `${namespace}_${hashKey(key)}.json`);
  try {
    if (!existsSync(cacheFile)) return null;
    const content = readFileSync(cacheFile, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);
    const age = (Date.now() / 1000) - entry.timestamp;
    if (age > (entry.ttl ?? hooksConfig.cache?.ttl ?? 3600)) return null;
    return entry.data;
  } catch { return null; }
}

/**
 * Set cached value
 * @param namespace Cache namespace
 * @param key Cache key
 * @param data Data to cache
 * @param ttl Optional TTL in seconds
 */
export function cacheSet(namespace: string, key: string, data: unknown, ttl?: number): void {
  if (!hooksConfig.enabled || !hooksConfig.cache?.enabled) return;
  const cacheFile = join(CACHE_DIR, `${namespace}_${hashKey(key)}.json`);
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const entry: CacheEntry = {
      timestamp: Date.now() / 1000,
      ttl: ttl ?? hooksConfig.cache?.ttl ?? 3600,
      namespace, key, data,
    };
    writeFileSync(cacheFile, JSON.stringify(entry), 'utf-8');
  } catch {}
}

/**
 * Clear cache for a namespace
 * @param namespace Cache namespace, or undefined to clear all
 */
export function cacheClear(namespace?: string): void {
  try {
    if (!existsSync(CACHE_DIR)) return;
    const files = readdirSync(CACHE_DIR);
    for (const file of files) {
      if (!namespace || file.startsWith(`${namespace}_`)) {
        unlinkSync(join(CACHE_DIR, file));
      }
    }
  } catch {}
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  expired: number;
  byNamespace: Record<string, number>;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  const stats: CacheStats = { totalEntries: 0, totalSize: 0, expired: 0, byNamespace: {} };
  try {
    if (!existsSync(CACHE_DIR)) return stats;
    const files = readdirSync(CACHE_DIR);
    const now = Date.now() / 1000;
    const ttl = hooksConfig.cache?.ttl ?? 3600;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      stats.totalEntries++;
      const filePath = join(CACHE_DIR, file);
      stats.totalSize += statSync(filePath).size;
      const ns = file.replace(/_[^_]*\.json$/, '');
      stats.byNamespace[ns] = (stats.byNamespace[ns] || 0) + 1;
      try {
        const content = readFileSync(filePath, 'utf-8');
        const entry: CacheEntry = JSON.parse(content);
        if ((now - entry.timestamp) > (entry.ttl ?? ttl)) stats.expired++;
      } catch {}
    }
  } catch {}
  return stats;
}

// ============================================================================
// API Validation
// ============================================================================

export interface ApiKeyStatus {
  key: string;
  present: boolean;
  required: boolean;
}

function isKeySet(key: string): boolean {
  const value = process.env[key];
  return Boolean(value && value !== 'undefined' && value !== 'null');
}

/**
 * Check API key status
 */
export function checkApiKeys(): ApiKeyStatus[] {
  const results: ApiKeyStatus[] = [];
  for (const key of hooksConfig.apiValidation?.requiredKeys ?? []) {
    results.push({ key, present: isKeySet(key), required: true });
  }
  for (const key of hooksConfig.apiValidation?.optionalKeys ?? []) {
    results.push({ key, present: isKeySet(key), required: false });
  }
  return results;
}

/**
 * Get validation status for required keys
 */
export function validateRequiredKeys(): { valid: boolean; missing: string[] } {
  const missing = checkApiKeys().filter(k => k.required && !k.present).map(k => k.key);
  return { valid: missing.length === 0, missing };
}

// ============================================================================
// Configuration API
// ============================================================================

/**
 * Load hooks configuration
 */
export function loadHooksConfig(config?: Partial<HooksConfig>): void {
  hooksConfig = { ...DEFAULT_CONFIG, ...config };
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
