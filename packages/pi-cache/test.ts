import { describe, expect, test } from 'bun:test';
import { PiCache, PiCacheManager } from './src/index.js';

describe('pi-cache core', () => {
  test('tracks hits, misses, LRU eviction, and prefix invalidation', () => {
    const cache = new PiCache({ ttlSeconds: 60, maxEntries: 2 });
    cache.set('price:A', 1); cache.set('price:B', 2); expect(cache.get('price:A')).toBe(1); expect(cache.get('missing')).toBeNull();
    cache.set('price:C', 3); expect(cache.get('price:B')).toBeNull(); expect(cache.invalidatePrefix('price:A')).toBe(1); expect(cache.getStats()).toMatchObject({ hits: 1, misses: 2, evictions: 1, totalEntries: 1 });
  });
  test('manager keeps named caches isolated', () => { const manager = new PiCacheManager(); manager.getCache('news').set('x', 1); expect(manager.getCache('financials').get('x')).toBeNull(); expect(manager.getAllStats().news.totalEntries).toBe(1); });
});
