/**
 * Market Data Cache
 *
 * Provides in-memory caching for market data API responses.
 * Reduces API calls, avoids rate limits, and improves response times.
 */

import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  hitCount: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  maxEntries: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalEntries: number;
}

// ============================================================================
// Cache Implementation
// ============================================================================

export class MarketDataCache {
  private cache: Map<string, CacheEntry<unknown>>;
  private config: CacheConfig;
  private accessOrder: string[]; // LRU tracking

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.accessOrder = [];
    this.config = {
      ttlSeconds: config.ttlSeconds ?? 300, // 5 minutes default
      maxEntries: config.maxEntries ?? 1000,
    };
  }

  /**
   * Generate cache key from request parameters
   */
  static generateKey(prefix: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${JSON.stringify(params[k])}`)
      .join('&');
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Get cached value if exists and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    // Update LRU
    entry.hitCount++;
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);

    return entry.data as T;
  }

  /**
   * Set cache value with TTL
   */
  set<T>(key: string, data: T, ttlSeconds?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    const now = Date.now();
    const ttl = ttlSeconds ?? this.config.ttlSeconds;

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl * 1000,
      hitCount: 0,
    });

    // Update LRU
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() <= entry.expiresAt;
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string): boolean {
    this.removeFromAccessOrder(key);
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Invalidate entries matching prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.removeFromAccessOrder(key);
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let hits = 0;
    for (const entry of this.cache.values()) {
      hits += entry.hitCount;
    }
    return {
      hits,
      misses: 0, // Not tracked
      evictions: 0, // Not tracked
      totalEntries: this.cache.size,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private removeFromAccessOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
  }
}

// Global cache instance
const globalCache = new MarketDataCache();

// ============================================================================
// Cache Presets for Different Data Types
// ============================================================================

export const CACHE_PRESETS = {
  // Real-time prices: short TTL, high frequency
  realtime: { ttlSeconds: 30, maxEntries: 500 },
  // Historical data: medium TTL
  historical: { ttlSeconds: 3600, maxEntries: 200 }, // 1 hour
  // Daily summaries: longer TTL
  daily: { ttlSeconds: 86400, maxEntries: 100 }, // 24 hours
  // Market holidays: very long TTL
  holidays: { ttlSeconds: 604800, maxEntries: 50 }, // 1 week
  // Financial data: medium TTL
  financials: { ttlSeconds: 1800, maxEntries: 300 }, // 30 minutes
  // News: short TTL
  news: { ttlSeconds: 300, maxEntries: 200 }, // 5 minutes
};

// ============================================================================
// Cache Manager
// ============================================================================

export class CacheManager {
  private caches: Map<string, MarketDataCache>;

  constructor() {
    this.caches = new Map();
  }

  getCache(name: string): MarketDataCache {
    let cache = this.caches.get(name);
    if (!cache) {
      const preset = CACHE_PRESETS[name as keyof typeof CACHE_PRESETS];
      cache = new MarketDataCache(preset);
      this.caches.set(name, cache);
    }
    return cache;
  }

  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.caches.clear();
  }

  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }
}

const globalCacheManager = new CacheManager();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Cached fetch wrapper for market data APIs
 */
export async function cachedFetch<T>(
  url: string,
  options: {
    cacheName?: string;
    ttlSeconds?: number;
    keyPrefix?: string;
  } = {}
): Promise<{ data: T; fromCache: boolean }> {
  const { cacheName = 'default', ttlSeconds, keyPrefix = 'fetch' } = options;

  const cache = globalCacheManager.getCache(cacheName);
  const cacheKey = MarketDataCache.generateKey(keyPrefix, { url });

  // Check cache
  const cached = cache.get<T>(cacheKey);
  if (cached !== null) {
    return { data: cached, fromCache: true };
  }

  // Fetch from API
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as T;

  // Store in cache
  cache.set(cacheKey, data, ttlSeconds);

  return { data, fromCache: false };
}

// ============================================================================
// Export default instance
// ============================================================================

export { globalCache, globalCacheManager };

// ============================================================================
// TypeScript Types Export
// ============================================================================

export type { CacheStats };
