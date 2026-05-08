/**
 * Cache Tools
 *
 * Exports market data caching functionality
 */

export {
  MarketDataCache,
  CacheManager,
  globalCache,
  globalCacheManager,
  CACHE_PRESETS,
  cachedFetch,
  type CacheStats,
  type CacheConfig,
} from './market-cache.js';

export {
  createGetCacheStatsTool,
  createClearCacheTool,
  createInvalidateCacheTool,
  createCacheInfoTool,
  cacheTools,
} from './cache-tools.js';

export const GET_CACHE_STATS_DESCRIPTION = `
Get market data cache statistics.

## Cache Types
- realtime: Real-time prices (30s TTL)
- historical: Historical data (1h TTL)
- daily: Daily summaries (24h TTL)
- holidays: Market calendar (1 week TTL)
- financials: Financial statements (30min TTL)
- news: News articles (5min TTL)

## Metrics
- totalEntries: Number of cached entries
- hits: Total cache hits

## When to Use
- Checking cache effectiveness
- Debugging data freshness issues
- Monitoring API call reduction
`.trim();

export const CLEAR_CACHE_DESCRIPTION = `
Clear the market data cache.

## Warning
This will force fresh data fetch on next request.

## Parameters
- confirm: Must be true to execute
- cacheName: Optional specific cache to clear

## When to Use
- Data seems stale
- Forcing fresh analysis
- Troubleshooting data issues
`.trim();

export const INVALIDATE_CACHE_DESCRIPTION = `
Invalidate specific cache entries by prefix.

## Use Cases
- Stock moved: invalidate "AAPL"
- News event: invalidate news cache
- Earnings reported: invalidate financials

## Returns
Number of invalidated entries
`.trim();

export const GET_CACHE_INFO_DESCRIPTION = `
Get information about cache configuration.

## Shows
- Available cache types
- TTL settings for each
- Usage guidelines
`.trim();
