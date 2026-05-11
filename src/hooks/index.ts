/**
 * Hooks Module for UpUp
 *
 * Provides integration hooks for:
 * - Rate limiting API calls
 * - Response caching
 * - API key validation
 *
 * @deprecated Use @upup/hooks directly instead
 * Re-exports from @upup/hooks for backward compatibility
 */

export {
  checkRateLimit,
  recordRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  cacheGet,
  cacheSet,
  cacheClear,
  getCacheStats,
  checkApiKeys,
  validateRequiredKeys,
  loadHooksConfig,
  getHooksConfig,
  setHooksEnabled,
  type HooksConfig,
  type RateLimitConfig,
  type CacheConfig,
  type ApiValidationConfig,
  type ApiKeyStatus,
  type CacheStats,
} from '@upup/hooks';
