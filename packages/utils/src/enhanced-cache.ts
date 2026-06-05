/**
 * Enhanced Cache System with LRU, Deduplication, and Background Refresh
 *
 * Features:
 * - LRU eviction for memory cache
 * - In-flight request deduplication
 * - Background refresh before TTL expiry
 * - Tiered cache (memory + disk)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { logger } from './logger.js';
import { upupPath } from './paths.js';

// ============================================================================
// Types
// ============================================================================

interface CacheEntry<T = unknown> {
  data: T;
  url: string;
  cachedAt: number; // timestamp
  accessCount: number;
  lastAccessed: number;
}

interface InFlightRequest {
  promise: Promise<unknown>;
  timestamp: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  diskWrites: number;
  diskReads: number;
  refreshes: number;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = upupPath('cache');
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 500; // max entries in memory cache
const BACKGROUND_REFRESH_THRESHOLD = 0.8; // refresh at 80% of TTL
const DEDUP_TIMEOUT_MS = 30 * 1000; // 30 seconds for in-flight deduplication

// ============================================================================
// LRU Cache
// ============================================================================

/**
 * Thread-safe LRU Cache with disk persistence
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    diskWrites: 0,
    diskReads: 0,
    refreshes: 0,
  };

  constructor(maxSize = DEFAULT_MAX_SIZE, ttlMs = DEFAULT_TTL_MS) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get a value from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access stats (move to end for LRU)
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    // Move to end of map (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set a value in cache
   */
  set(key: K, value: V): void {
    // Evict LRU entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    const entry: CacheEntry<V> = {
      data: value,
      url: '',
      cachedAt: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists and is valid (not expired)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.cachedAt;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return this.stats.hits / total;
  }

  /**
   * Get number of entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get keys that need background refresh (expiring soon)
   */
  getKeysNeedingRefresh(): K[] {
    const threshold = this.ttlMs * BACKGROUND_REFRESH_THRESHOLD;
    const now = Date.now();
    const keys: K[] = [];

    for (const [key, entry] of this.cache) {
      const age = now - entry.cachedAt;
      if (age >= threshold && age < this.ttlMs) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Persist to disk (call periodically or on shutdown)
   */
  persistToDisk?(key: K, filepath: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    try {
      const dir = dirname(filepath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filepath, JSON.stringify(entry, null, 2));
      this.stats.diskWrites++;
    } catch (error) {
      logger.warn(`Cache persist error: ${error}`);
    }
  }

  /**
   * Load from disk
   */
  loadFromDisk?(key: K, filepath: string): boolean {
    if (!existsSync(filepath)) return false;

    try {
      const content = readFileSync(filepath, 'utf-8');
      const parsed = JSON.parse(content) as CacheEntry<V>;

      // Check TTL
      if (Date.now() - parsed.cachedAt > this.ttlMs) {
        unlinkSync(filepath);
        return false;
      }

      this.cache.set(key, parsed);
      this.stats.diskReads++;
      return true;
    } catch (error) {
      logger.warn(`Cache load error: ${error}`);
      return false;
    }
  }
}

// ============================================================================
// Request Deduplication
// ============================================================================

/**
 * Singleton deduplication map for in-flight requests
 */
const inFlightRequests = new Map<string, InFlightRequest>();

/**
 * Get or create an in-flight request (deduplication)
 * Returns existing promise if request is already in flight
 */
export async function getOrCreateRequest<T>(
  cacheKey: string,
  factory: () => Promise<T>,
  options?: {
    ttlMs?: number;
    dedupTimeoutMs?: number;
  }
): Promise<T> {
  const timeout = options?.dedupTimeoutMs ?? DEDUP_TIMEOUT_MS;
  const now = Date.now();

  // Check for existing in-flight request
  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    // Check if request is still valid (not timed out)
    if (now - existing.timestamp < timeout) {
      return existing.promise as Promise<T>;
    }
    // Clean up stale entry
    inFlightRequests.delete(cacheKey);
  }

  // Create new request
  const promise = factory().finally(() => {
    // Clean up after completion
    setTimeout(() => {
      inFlightRequests.delete(cacheKey);
    }, 1000); // Small delay to catch rapid duplicate requests
  });

  inFlightRequests.set(cacheKey, {
    promise: promise as Promise<unknown>,
    timestamp: now,
  });

  return promise;
}

/**
 * Clear all in-flight requests (useful for cleanup)
 */
export function clearInFlightRequests(): void {
  inFlightRequests.clear();
}

// ============================================================================
// Memoize with Background Refresh
// ============================================================================

/**
 * Memoization wrapper with background refresh
 */
export function memoizeWithBackgroundRefresh<T>(
  fetcher: () => Promise<T>,
  options?: {
    ttlMs?: number;
    maxSize?: number;
    onRefresh?: (value: T) => void;
  }
): {
  get: () => Promise<T>;
  invalidate: () => void;
  getCache: () => LRUCache<string, T>;
} {
  const cache = new LRUCache<string, T>(
    options?.maxSize ?? DEFAULT_MAX_SIZE,
    options?.ttlMs ?? DEFAULT_TTL_MS
  );
  let currentFetcher: Promise<T> | null = null;

  return {
    /**
     * Get value (from cache or fetch)
     */
    get: async (): Promise<T> => {
      const cacheKey = 'memoized-value';

      // Check cache first
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      // If there's already a fetch in progress, wait for it
      if (currentFetcher) {
        return currentFetcher;
      }

      // Fetch and cache
      currentFetcher = fetcher().then(value => {
        cache.set(cacheKey, value);
        options?.onRefresh?.(value);
        return value;
      }).finally(() => {
        currentFetcher = null;
      });

      return currentFetcher;
    },

    /**
     * Invalidate cache
     */
    invalidate: (): void => {
      cache.delete('memoized-value');
    },

    /**
     * Get underlying cache
     */
    getCache: () => cache,
  };
}

// ============================================================================
// Background Refresh Manager
// ============================================================================

/**
 * Manages background refresh for cached data
 */
export class BackgroundRefreshManager {
  private refreshTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private refreshCallbacks: Map<string, () => Promise<unknown>> = new Map();

  /**
   * Schedule a background refresh
   */
  scheduleRefresh(
    key: string,
    ttlMs: number,
    callback: () => Promise<unknown>
  ): void {
    // Cancel existing timer if any
    this.cancelRefresh(key);

    // Calculate time until refresh (at 80% of TTL)
    const refreshDelay = ttlMs * BACKGROUND_REFRESH_THRESHOLD;

    const timer = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        logger.warn(`Background refresh failed for ${key}: ${error}`);
      } finally {
        this.refreshTimers.delete(key);
      }
    }, refreshDelay);

    this.refreshTimers.set(key, timer);
    this.refreshCallbacks.set(key, callback);
  }

  /**
   * Cancel a scheduled refresh
   */
  cancelRefresh(key: string): void {
    const timer = this.refreshTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(key);
      this.refreshCallbacks.delete(key);
    }
  }

  /**
   * Cancel all scheduled refreshes
   */
  cancelAll(): void {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.refreshCallbacks.clear();
  }

  /**
   * Get number of scheduled refreshes
   */
  size(): number {
    return this.refreshTimers.size;
  }
}

// ============================================================================
// Re-export original cache functions for compatibility
// ============================================================================

export { readCache as readFileCache, writeCache as writeFileCache } from './cache.js';

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a fully configured cache instance
 */
export function createCache<T>(options?: {
  maxSize?: number;
  ttlMs?: number;
  enableBackgroundRefresh?: boolean;
}): {
  cache: LRUCache<string, T>;
  refreshManager: BackgroundRefreshManager;
  getOrCreate: <V>(
    key: string,
    factory: () => Promise<V>,
    options?: { ttlMs?: number }
  ) => Promise<V>;
  clear: () => void;
} {
  const cache = new LRUCache<string, T>(
    options?.maxSize ?? DEFAULT_MAX_SIZE,
    options?.ttlMs ?? DEFAULT_TTL_MS
  );
  const refreshManager = new BackgroundRefreshManager();

  return {
    cache,
    refreshManager,

    getOrCreate: <V>(
      key: string,
      factory: () => Promise<V>,
      _options?: { ttlMs?: number }
    ): Promise<V> => {
      return getOrCreateRequest(key, factory);
    },

    clear: (): void => {
      cache.clear();
      refreshManager.cancelAll();
    },
  };
}

// ============================================================================
// Global singleton for shared cache instances
// ============================================================================

const globalCaches = new Map<string, LRUCache<unknown, unknown>>();

/**
 * Get or create a global cache instance
 */
export function getGlobalCache<T>(name: string, options?: {
  maxSize?: number;
  ttlMs?: number;
}): LRUCache<string, T> {
  const existing = globalCaches.get(name) as LRUCache<string, T> | undefined;
  if (existing) {
    return existing;
  }

  const cache = new LRUCache<string, T>(
    options?.maxSize ?? DEFAULT_MAX_SIZE,
    options?.ttlMs ?? DEFAULT_TTL_MS
  );
  globalCaches.set(name, cache as LRUCache<unknown, unknown>);
  return cache;
}

/**
 * Clear all global caches
 */
export function clearAllGlobalCaches(): void {
  for (const cache of globalCaches.values()) {
    cache.clear();
  }
  globalCaches.clear();
  clearInFlightRequests();
}