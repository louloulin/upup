export const PI_CACHE_PACKAGE_NAME = '@upup/pi-cache' as const;
export const PI_CACHE_PACKAGE_VERSION = '0.1.0' as const;

export const CACHE_PRESETS = {
  realtime: { ttlSeconds: 30, maxEntries: 500 },
  historical: { ttlSeconds: 3600, maxEntries: 200 },
  daily: { ttlSeconds: 86400, maxEntries: 100 },
  holidays: { ttlSeconds: 604800, maxEntries: 50 },
  financials: { ttlSeconds: 1800, maxEntries: 300 },
  news: { ttlSeconds: 300, maxEntries: 200 },
} as const;

export type CacheName = keyof typeof CACHE_PRESETS;
export interface CacheStats { readonly hits: number; readonly misses: number; readonly evictions: number; readonly totalEntries: number }
export interface CacheConfig { readonly ttlSeconds: number; readonly maxEntries: number }

interface Entry { readonly expiresAt: number; readonly value: unknown; hits: number }

export class PiCache {
  private readonly entries = new Map<string, Entry>();
  private readonly order: string[] = [];
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(private readonly config: CacheConfig = { ttlSeconds: 300, maxEntries: 1000 }) {}

  static generateKey(prefix: string, params: Record<string, unknown>): string {
    return `${prefix}:${Object.keys(params).sort().map((key) => `${key}=${JSON.stringify(params[key])}`).join('&')}`;
  }

  get<T>(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt < Date.now()) { if (entry) this.delete(key); this.misses += 1; return null; }
    entry.hits += 1; this.hits += 1; this.touch(key); return entry.value as T;
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) this.deleteEntry(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const existed = this.entries.has(key);
    this.deleteEntry(key);
    return existed;
  }

  set<T>(key: string, value: T, ttlSeconds = this.config.ttlSeconds): void {
    if (!this.entries.has(key) && this.entries.size >= this.config.maxEntries) { const oldest = this.order.shift(); if (oldest) { this.entries.delete(oldest); this.evictions += 1; } }
    this.entries.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlSeconds) * 1000, hits: 0 }); this.touch(key);
  }

  clear(): void { this.entries.clear(); this.order.length = 0; }
  invalidatePrefix(prefix: string): number { let count = 0; for (const key of [...this.entries.keys()]) if (key.startsWith(prefix)) { this.deleteEntry(key); count += 1; } return count; }
  getStats(): CacheStats { return { hits: this.hits, misses: this.misses, evictions: this.evictions, totalEntries: this.entries.size }; }
  private touch(key: string): void { const index = this.order.indexOf(key); if (index >= 0) this.order.splice(index, 1); this.order.push(key); }
  private deleteEntry(key: string): void { this.entries.delete(key); const index = this.order.indexOf(key); if (index >= 0) this.order.splice(index, 1); }
}

export class PiCacheManager {
  private readonly caches = new Map<CacheName, PiCache>();
  getCache(name: CacheName): PiCache { let cache = this.caches.get(name); if (!cache) { cache = new PiCache(CACHE_PRESETS[name]); this.caches.set(name, cache); } return cache; }
  clearAll(): void { for (const cache of this.caches.values()) cache.clear(); this.caches.clear(); }
  getAllStats(): Record<string, CacheStats> { return Object.fromEntries([...this.caches.entries()].map(([name, cache]) => [name, cache.getStats()])); }
}

export const piCacheManager = new PiCacheManager();

export function cacheInfo(): Record<string, unknown> {
  return { cachePresets: Object.fromEntries(Object.entries(CACHE_PRESETS).map(([name, preset]) => [name, { ...preset, description: `${name} cache with ${preset.ttlSeconds}s TTL and ${preset.maxEntries} max entries` }])), note: 'Pi cache state is process-local and tool operations are auditable.' };
}
