import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { CACHE_PRESETS, cacheInfo, piCacheManager, type CacheName } from '../src/index';

const cacheName = Type.Optional(Type.Union(Object.keys(CACHE_PRESETS).map((name) => Type.Literal(name)) as [never, ...never[]]));
const statsParameters = Type.Object({ cacheName });
const clearParameters = Type.Object({ cacheName, confirm: Type.Boolean() });
const invalidateParameters = Type.Object({ cacheName, prefix: Type.String({ minLength: 1, maxLength: 500 }) });
const emptyParameters = Type.Object({});
const names = Object.keys(CACHE_PRESETS) as CacheName[];

function result(id: string, value: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}), details: { auditId: id, source: 'upup-pi://cache', dataFreshness: 'live' } };
}

export default function cacheExtension(pi: ExtensionAPI): void {
  pi.registerTool({ name: 'get_cache_stats', label: 'Cache Statistics', description: 'Inspect Pi market-data cache statistics for the current process.', parameters: statsParameters, async execute(id, params, signal) { if (signal.aborted) return result(id, { error: 'request aborted' }, true); return result(id, params.cacheName ? { cacheName: params.cacheName, ...piCacheManager.getCache(params.cacheName as CacheName).getStats(), preset: CACHE_PRESETS[params.cacheName as CacheName] } : { caches: piCacheManager.getAllStats(), presets: CACHE_PRESETS }); } });
  pi.registerTool({ name: 'clear_cache', label: 'Clear Cache', description: 'Clear Pi cache entries; confirm must be true.', parameters: clearParameters, async execute(id, params, signal) { if (signal.aborted) return result(id, { error: 'request aborted' }, true); if (!params.confirm) return result(id, { error: 'confirm=true is required' }, true); if (params.cacheName) piCacheManager.getCache(params.cacheName as CacheName).clear(); else piCacheManager.clearAll(); return result(id, { cleared: params.cacheName ?? 'all' }); } });
  pi.registerTool({ name: 'invalidate_cache', label: 'Invalidate Cache', description: 'Invalidate current Pi cache entries by key prefix.', parameters: invalidateParameters, async execute(id, params, signal) { if (signal.aborted) return result(id, { error: 'request aborted' }, true); const caches = params.cacheName ? [params.cacheName as CacheName] : names; const invalidatedEntries = caches.reduce((total, name) => total + piCacheManager.getCache(name).invalidatePrefix(params.prefix), 0); return result(id, { prefix: params.prefix, invalidatedEntries }); } });
  pi.registerTool({ name: 'get_cache_info', label: 'Cache Information', description: 'List Pi cache presets and lifecycle information.', parameters: emptyParameters, async execute(id, _params, signal) { if (signal.aborted) return result(id, { error: 'request aborted' }, true); return result(id, cacheInfo()); } });
}
