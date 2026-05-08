/**
 * Market Cache Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MarketDataCache, CACHE_PRESETS, CacheManager } from './market-cache.js';

describe('MarketDataCache', () => {
  let cache: MarketDataCache;

  beforeEach(() => {
    cache = new MarketDataCache({ ttlSeconds: 60, maxEntries: 100 });
  });

  it('stores and retrieves values', () => {
    cache.set('key1', { price: 100 });
    const result = cache.get<{ price: number }>('key1');
    expect(result).toEqual({ price: 100 });
  });

  it('returns null for missing keys', () => {
    const result = cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('expires entries after TTL', async () => {
    const shortCache = new MarketDataCache({ ttlSeconds: 1, maxEntries: 100 });
    shortCache.set('key1', { value: 'test' });

    // Should exist immediately
    expect(shortCache.has('key1')).toBe(true);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be expired
    expect(shortCache.has('key1')).toBe(false);
  });

  it('respects maxEntries limit', () => {
    const smallCache = new MarketDataCache({ ttlSeconds: 60, maxEntries: 3 });

    smallCache.set('key1', 'value1');
    smallCache.set('key2', 'value2');
    smallCache.set('key3', 'value3');
    expect(smallCache.has('key1')).toBe(true);

    // Adding 4th should evict oldest
    smallCache.set('key4', 'value4');
    expect(smallCache.has('key1')).toBe(false);
    expect(smallCache.has('key4')).toBe(true);
  });

  it('updates existing keys without eviction', () => {
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');
    expect(cache.get('key1')).toBe('value2');
    expect(cache.getStats().totalEntries).toBe(1);
  });

  it('tracks hit count on access', () => {
    cache.set('key1', { data: 'test' });
    cache.get('key1');
    cache.get('key1');
    cache.get('key1');

    const stats = cache.getStats();
    expect(stats.hits).toBeGreaterThan(0);
  });

  it('deletes specific entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    expect(cache.delete('key1')).toBe(true);
    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    cache.clear();

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(false);
  });

  it('invalidates by prefix', () => {
    cache.set('AAPL:price', 100);
    cache.set('AAPL:volume', 1000);
    cache.set('GOOGL:price', 200);
    cache.set('MSFT:price', 300);

    const count = cache.invalidatePrefix('AAPL:');

    expect(count).toBe(2);
    expect(cache.has('AAPL:price')).toBe(false);
    expect(cache.has('AAPL:volume')).toBe(false);
    expect(cache.has('GOOGL:price')).toBe(true);
    expect(cache.has('MSFT:price')).toBe(true);
  });

  it('uses custom TTL when provided', async () => {
    cache.set('short', 'value', 1); // 1 second TTL
    cache.set('long', 'value', 60); // 60 seconds TTL

    expect(cache.has('short')).toBe(true);
    expect(cache.has('long')).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(cache.has('short')).toBe(false);
    expect(cache.has('long')).toBe(true);
  });
});

describe('MarketDataCache.generateKey', () => {
  it('generates consistent keys', () => {
    const key1 = MarketDataCache.generateKey('price', { symbol: 'AAPL', date: '2024-01-01' });
    const key2 = MarketDataCache.generateKey('price', { symbol: 'AAPL', date: '2024-01-01' });
    expect(key1).toBe(key2);
  });

  it('generates different keys for different params', () => {
    const key1 = MarketDataCache.generateKey('price', { symbol: 'AAPL' });
    const key2 = MarketDataCache.generateKey('price', { symbol: 'GOOGL' });
    expect(key1).not.toBe(key2);
  });

  it('sorts params for consistent keys', () => {
    const key1 = MarketDataCache.generateKey('price', { symbol: 'AAPL', date: '2024-01-01' });
    const key2 = MarketDataCache.generateKey('price', { date: '2024-01-01', symbol: 'AAPL' });
    expect(key1).toBe(key2);
  });
});

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  it('creates named caches with presets', () => {
    const realtime = manager.getCache('realtime');
    const historical = manager.getCache('historical');

    expect(realtime).toBeDefined();
    expect(historical).toBeDefined();
    expect(realtime).not.toBe(historical);
  });

  it('returns same cache instance for same name', () => {
    const cache1 = manager.getCache('realtime');
    const cache2 = manager.getCache('realtime');
    expect(cache1).toBe(cache2);
  });

  it('clears all caches', () => {
    const cache = manager.getCache('realtime');
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    manager.clearAll();

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
  });

  it('reports stats for all caches', () => {
    const cache = manager.getCache('realtime');
    cache.set('key1', 'value1');
    cache.get('key1');

    const stats = manager.getAllStats();
    expect(stats.realtime).toBeDefined();
    expect(stats.realtime.totalEntries).toBe(1);
  });
});

describe('CachePresets', () => {
  it('has all expected cache types', () => {
    expect(CACHE_PRESETS.realtime).toBeDefined();
    expect(CACHE_PRESETS.historical).toBeDefined();
    expect(CACHE_PRESETS.daily).toBeDefined();
    expect(CACHE_PRESETS.holidays).toBeDefined();
    expect(CACHE_PRESETS.financials).toBeDefined();
    expect(CACHE_PRESETS.news).toBeDefined();
  });

  it('has appropriate TTLs', () => {
    expect(CACHE_PRESETS.realtime.ttlSeconds).toBe(30);
    expect(CACHE_PRESETS.historical.ttlSeconds).toBe(3600);
    expect(CACHE_PRESETS.holidays.ttlSeconds).toBe(604800);
  });
});
