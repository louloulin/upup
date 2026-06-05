/**
 * Cache Management Tools
 *
 * Tools for managing the market data cache.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { globalCacheManager, globalCache, CACHE_PRESETS } from './market-cache.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const getCacheStatsSchema = z.object({
  cacheName: z.enum(['realtime', 'historical', 'daily', 'holidays', 'financials', 'news']).optional()
    .describe('Specific cache to query. If omitted, returns all cache stats.'),
});

const clearCacheSchema = z.object({
  cacheName: z.enum(['realtime', 'historical', 'daily', 'holidays', 'financials', 'news']).optional()
    .describe('Specific cache to clear. If omitted, clears all caches.'),
  confirm: z.boolean().describe('Must be true to confirm clearing cache'),
});

const invalidateSchema = z.object({
  prefix: z.string().describe('Cache key prefix to invalidate (e.g., "AAPL" to invalidate all AAPL entries)'),
  cacheName: z.enum(['realtime', 'historical', 'daily', 'holidays', 'financials', 'news']).optional()
    .describe('Specific cache to invalidate. If omitted, invalidates all caches.'),
});

const cacheInfoSchema = z.object({});

// ============================================================================
// Tool Handlers
// ============================================================================

function handleGetStats(params: z.infer<typeof getCacheStatsSchema>) {
  if (params.cacheName) {
    const cache = globalCacheManager.getCache(params.cacheName);
    const stats = cache.getStats();
    return formatToolResult({
      type: 'Cache Statistics',
      cacheName: params.cacheName,
      ...stats,
      preset: CACHE_PRESETS[params.cacheName as keyof typeof CACHE_PRESETS],
    });
  }

  const allStats = globalCacheManager.getAllStats();
  return formatToolResult({
    type: 'All Cache Statistics',
    caches: allStats,
    presets: CACHE_PRESETS,
  });
}

function handleClearCache(params: z.infer<typeof clearCacheSchema>) {
  if (!params.confirm) {
    return formatToolResult({
      type: 'Cache Clear',
      status: 'error',
      message: 'Must confirm by setting confirm=true to clear cache',
    });
  }

  if (params.cacheName) {
    const cache = globalCacheManager.getCache(params.cacheName);
    cache.clear();
    return formatToolResult({
      type: 'Cache Clear',
      status: 'success',
      message: `Cache "${params.cacheName}" cleared successfully`,
    });
  }

  globalCacheManager.clearAll();
  return formatToolResult({
    type: 'Cache Clear',
    status: 'success',
    message: 'All caches cleared successfully',
  });
}

function handleInvalidate(params: z.infer<typeof invalidateSchema>) {
  if (params.cacheName) {
    const cache = globalCacheManager.getCache(params.cacheName);
    const count = cache.invalidatePrefix(params.prefix);
    return formatToolResult({
      type: 'Cache Invalidation',
      prefix: params.prefix,
      cacheName: params.cacheName,
      invalidatedEntries: count,
    });
  }

  let totalInvalidated = 0;
  for (const [name] of Object.keys(CACHE_PRESETS)) {
    const cache = globalCacheManager.getCache(name);
    totalInvalidated += cache.invalidatePrefix(params.prefix);
  }

  return formatToolResult({
    type: 'Cache Invalidation',
    prefix: params.prefix,
    invalidatedEntries: totalInvalidated,
  });
}

function handleCacheInfo() {
  const presets: Record<string, { ttlSeconds: number; maxEntries: number; description: string }> = {
    realtime: {
      ...CACHE_PRESETS.realtime,
      description: 'Real-time price data - 30s TTL, 500 entries max',
    },
    historical: {
      ...CACHE_PRESETS.historical,
      description: 'Historical price data - 1h TTL, 200 entries max',
    },
    daily: {
      ...CACHE_PRESETS.daily,
      description: 'Daily summaries - 24h TTL, 100 entries max',
    },
    holidays: {
      ...CACHE_PRESETS.holidays,
      description: 'Market holiday calendar - 1 week TTL, 50 entries max',
    },
    financials: {
      ...CACHE_PRESETS.financials,
      description: 'Financial statement data - 30min TTL, 300 entries max',
    },
    news: {
      ...CACHE_PRESETS.news,
      description: 'News articles - 5min TTL, 200 entries max',
    },
  };

  return formatToolResult({
    type: 'Cache Information',
    description: 'Market data caching layer reduces API calls and improves response times',
    cachePresets: presets,
    usage: {
      get_stats: 'Get statistics about cache usage',
      clear_cache: 'Clear cache entries (requires confirm=true)',
      invalidate: 'Invalidate cache entries by prefix',
    },
    note: 'Cache is automatically used by market data tools to reduce redundant API calls',
  });
}

// ============================================================================
// Tool Factories
// ============================================================================

export function createGetCacheStatsTool() {
  return new DynamicStructuredTool({
    name: 'get_cache_stats',
    description: 'Get statistics about the market data cache. Shows hit counts, entry counts, and TTL settings for each cache type.',
    schema: getCacheStatsSchema,
    func: async (params) => handleGetStats(params),
  });
}

export function createClearCacheTool() {
  return new DynamicStructuredTool({
    name: 'clear_cache',
    description: 'Clear the market data cache. Use to force fresh data fetch or when cache becomes stale. Requires confirm=true.',
    schema: clearCacheSchema,
    func: async (params) => handleClearCache(params),
  });
}

export function createInvalidateCacheTool() {
  return new DynamicStructuredTool({
    name: 'invalidate_cache',
    description: 'Invalidate specific cache entries by prefix. Useful when you know certain data has changed and want to force refresh.',
    schema: invalidateSchema,
    func: async (params) => handleInvalidate(params),
  });
}

export function createCacheInfoTool() {
  return new DynamicStructuredTool({
    name: 'get_cache_info',
    description: 'Get information about available cache types and their TTL settings.',
    schema: cacheInfoSchema,
    func: async () => handleCacheInfo(),
  });
}

export const cacheTools = [
  createGetCacheStatsTool(),
  createClearCacheTool(),
  createInvalidateCacheTool(),
  createCacheInfoTool(),
];
