import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LRUCache, getOrCreateRequest, memoizeWithBackgroundRefresh, BackgroundRefreshManager, createCache, getGlobalCache, clearAllGlobalCaches, clearInFlightRequests } from './enhanced-cache.js';

// ============================================================================
// LRUCache Tests
// ============================================================================

describe('LRUCache', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache<string, string>(3, 60000); // 3 max, 60s TTL
  });

  test('stores and retrieves values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  test('returns undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  test('evicts LRU entry when at capacity', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // should evict key1

    expect(cache.has('key1')).toBe(false);
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  test('updates access order on get (moves to most recently used)', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    // Access key1 to make it most recently used
    cache.get('key1');

    // Add key4, which should evict key2 (the actual LRU)
    cache.set('key4', 'value4');

    expect(cache.get('key1')).toBe('value1'); // key1 should still be there
    expect(cache.get('key2')).toBeUndefined(); // key2 should be evicted
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  test('tracks statistics correctly', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1'); // hit
    expect(cache.get('nonexistent')).toBeUndefined(); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  test('calculates hit rate correctly', () => {
    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('key1');
    cache.get('nonexistent');

    expect(cache.getHitRate()).toBe(2 / 3);
  });

  test('has() returns true for valid entries', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('delete() removes entry', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.has('key1')).toBe(false);
  });

  test('clear() removes all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test('returns keys needing refresh', async () => {
    // Create cache with very short TTL
    const shortCache = new LRUCache<string, string>(10, 100); // 100ms TTL

    shortCache.set('key1', 'value1');

    // Wait for 80% of TTL
    await new Promise(resolve => setTimeout(resolve, 85));

    const keysNeedingRefresh = shortCache.getKeysNeedingRefresh();
    expect(keysNeedingRefresh).toContain('key1');
  });

  test('size() returns correct count', () => {
    expect(cache.size()).toBe(0);
    cache.set('key1', 'value1');
    expect(cache.size()).toBe(1);
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);
  });
});

// ============================================================================
// Request Deduplication Tests
// ============================================================================

describe('getOrCreateRequest', () => {
  beforeEach(() => {
    clearInFlightRequests();
  });

  test('creates new request when none in flight', async () => {
    let callCount = 0;
    const factory = async () => {
      callCount++;
      return 'result';
    };

    const result = await getOrCreateRequest('key1', factory);

    expect(callCount).toBe(1);
    expect(result).toBe('result');
  });

  test('returns existing promise when request is in flight', async () => {
    let resolvePromise: ((value: string) => void) | null = null;
    let callCount = 0;

    const factory = async () => {
      callCount++;
      return new Promise<string>(resolve => {
        resolvePromise = resolve;
      });
    };

    // Start first request (won't complete until we resolve)
    const promise1Promise = getOrCreateRequest('key1', factory);

    // Give it a tick to start
    await new Promise(resolve => setTimeout(resolve, 10));

    // Only one factory call should have been made
    expect(callCount).toBe(1);

    // Start second request while first is still pending
    const promise2Promise = getOrCreateRequest('key1', factory);

    // Still only one factory call (deduplication)
    expect(callCount).toBe(1);

    // Resolve the promise
    resolvePromise!('result');

    // Both should get the result
    const [result1, result2] = await Promise.all([promise1Promise, promise2Promise]);
    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(callCount).toBe(1);
  });

  test('creates new request after timeout', async () => {
    let callCount = 0;
    const factory = async () => {
      callCount++;
      return `result-${callCount}`;
    };

    // First request
    await getOrCreateRequest('key1', factory, { dedupTimeoutMs: 10 });

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 20));

    // Second request should create new factory call
    await getOrCreateRequest('key1', factory, { dedupTimeoutMs: 10 });

    expect(callCount).toBe(2);
  });
});

// ============================================================================
// Memoize with Background Refresh Tests
// ============================================================================

describe('memoizeWithBackgroundRefresh', () => {
  test('fetches and caches value', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return `value-${callCount}`;
    };

    const memo = memoizeWithBackgroundRefresh(fetcher);

    // First call - should fetch
    const result1 = await memo.get();
    expect(result1).toBe('value-1');
    expect(callCount).toBe(1);

    // Second call - should use cache
    const result2 = await memo.get();
    expect(result2).toBe('value-1');
    expect(callCount).toBe(1);
  });

  test('invalidate() clears cache', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return `value-${callCount}`;
    };

    const memo = memoizeWithBackgroundRefresh(fetcher);

    await memo.get(); // value-1
    memo.invalidate();
    await memo.get(); // value-2

    expect(callCount).toBe(2);
  });

  test('calls onRefresh callback', async () => {
    let callCount = 0;
    const fetcher = async () => `value-${++callCount}`;
    let refreshedValue: string | undefined;

    const memo = memoizeWithBackgroundRefresh(fetcher, {
      onRefresh: (value) => {
        refreshedValue = value as string;
      }
    });

    await memo.get();
    expect(refreshedValue).toBe('value-1');
  });
});

// ============================================================================
// BackgroundRefreshManager Tests
// ============================================================================

describe('BackgroundRefreshManager', () => {
  let manager: BackgroundRefreshManager;

  beforeEach(() => {
    manager = new BackgroundRefreshManager();
  });

  afterEach(() => {
    manager.cancelAll();
  });

  test('schedules and executes refresh', async () => {
    let callCount = 0;
    const callback = async () => {
      callCount++;
      return `refreshed-${callCount}`;
    };

    manager.scheduleRefresh('key1', 50, callback);

    // Wait for refresh to execute (at 80% of 50ms = 40ms)
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(callCount).toBe(1);
    expect(manager.size()).toBe(0);
  });

  test('cancelRefresh() cancels scheduled refresh', async () => {
    const callback = async () => 'result';

    manager.scheduleRefresh('key1', 50, callback);
    manager.cancelRefresh('key1');

    // Wait for when refresh would have executed
    await new Promise(resolve => setTimeout(resolve, 60));

    // Callback should not have been called
    expect(manager.size()).toBe(0);
  });

  test('cancelAll() cancels all scheduled refreshes', async () => {
    const callback1 = async () => 'result1';
    const callback2 = async () => 'result2';

    manager.scheduleRefresh('key1', 50, callback1);
    manager.scheduleRefresh('key2', 50, callback2);
    manager.cancelAll();

    expect(manager.size()).toBe(0);
  });
});

// ============================================================================
// createCache Factory Tests
// ============================================================================

describe('createCache', () => {
  test('creates configured cache instance', async () => {
    const { cache, refreshManager, getOrCreate, clear } = createCache<string>({
      maxSize: 100,
      ttlMs: 30000,
    });

    expect(cache.size()).toBe(0);
    expect(refreshManager.size()).toBe(0);

    // Test getOrCreate
    clearInFlightRequests();
    const result = await getOrCreate('test', async () => 'value');
    expect(result).toBe('value');

    // Test clear
    clear();
    expect(cache.size()).toBe(0);
  });
});

// ============================================================================
// Global Cache Tests
// ============================================================================

describe('getGlobalCache', () => {
  beforeEach(() => {
    clearAllGlobalCaches();
  });

  test('creates and returns global cache', () => {
    const cache1 = getGlobalCache<string>('test-cache');
    const cache2 = getGlobalCache<string>('test-cache');

    expect(cache1).toBe(cache2); // Same instance
    expect(cache1).toBeDefined();
  });

  test('returns different cache for different names', () => {
    const cache1 = getGlobalCache<string>('cache-1');
    const cache2 = getGlobalCache<string>('cache-2');

    expect(cache1).not.toBe(cache2);
  });

  test('clearAllGlobalCaches() clears all caches', () => {
    const cache1 = getGlobalCache<string>('cache-1');
    const cache2 = getGlobalCache<string>('cache-2');

    cache1.set('key1', 'value1');
    cache2.set('key2', 'value2');

    clearAllGlobalCaches();

    expect(cache1.size()).toBe(0);
    expect(cache2.size()).toBe(0);
  });
});