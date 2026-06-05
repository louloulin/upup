/**
 * A股数据缓存与可靠性增强
 * Plan32.md M5: 数据可靠性
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 简单的内存缓存
 */
export class DataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL = 5 * 60 * 1000; // 5分钟

  /**
   * 设置缓存
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  /**
   * 检查缓存是否存在且有效
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 清除过期缓存
   */
  cleanup(): number {
    let count = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * 全局数据缓存实例
 */
export const astockCache = new DataCache();

/**
 * 带缓存的数据获取
 */
export async function withCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // 检查缓存
  const cached = astockCache.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // 获取数据
  const data = await fetchFn();
  
  // 设置缓存
  astockCache.set(key, data, ttl);
  
  return data;
}

/**
 * 错误处理工具
 */
export function handleApiError(error: any, fallback: any = null): any {
  console.warn('API Error:', error instanceof Error ? error.message : String(error));
  return fallback;
}
