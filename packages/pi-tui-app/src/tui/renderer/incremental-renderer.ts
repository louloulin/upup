/**
 * IncrementalRenderer - 增量渲染器
 *
 * 对标 Loucode 的增量渲染模式
 * 通过脏标记和缓存，只重新渲染变化的组件
 */

import type { Component } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

/**
 * 渲染项
 */
export interface RenderItem {
  /** 唯一标识 */
  id: string;
  /** 组件实例 */
  component: Component;
  /** 是否脏标记 (需要重新渲染) */
  dirty: boolean;
  /** 缓存的行数据 */
  cachedLines?: string[];
  /** 缓存时的宽度 */
  cachedWidth?: number;
  /** 渲染行数 */
  lineCount?: number;
}

/**
 * 增量渲染器配置
 */
export interface IncrementalRendererOptions {
  /** 调试模式 */
  debug?: boolean;
  /** 最大缓存项数 */
  maxCacheSize?: number;
}

/**
 * 渲染统计
 */
export interface RenderStats {
  /** 总渲染项数 */
  totalItems: number;
  /** 脏项数 */
  dirtyItems: number;
  /** 缓存命中数 */
  cacheHits: number;
  /** 缓存未命中数 */
  cacheMisses: number;
  /** 最后渲染时间 */
  lastRenderTime: number;
  /** 渲染耗时 (ms) */
  renderTimeMs: number;
}

// ============================================================================
// IncrementalRenderer
// ============================================================================

export class IncrementalRenderer {
  private items: Map<string, RenderItem> = new Map();
  private order: string[] = [];
  private width = 0;
  private readonly debug: boolean;
  private readonly maxCacheSize: number;

  // 统计
  private stats: RenderStats = {
    totalItems: 0,
    dirtyItems: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastRenderTime: 0,
    renderTimeMs: 0,
  };

  constructor(options: IncrementalRendererOptions = {}) {
    this.debug = options.debug ?? false;
    this.maxCacheSize = options.maxCacheSize ?? 1000;
  }

  // ============================================================================
  // Item Management
  // ============================================================================

  /**
   * 添加渲染项
   */
  addItem(id: string, component: Component): void {
    if (this.items.has(id)) {
      this.log(`Item ${id} already exists, updating`);
      this.markDirty(id);
      return;
    }

    this.items.set(id, {
      id,
      component,
      dirty: true,
    });
    this.order.push(id);

    this.log(`Added item: ${id}`);
  }

  /**
   * 移除渲染项
   */
  removeItem(id: string): void {
    const index = this.order.indexOf(id);
    if (index !== -1) {
      this.order.splice(index, 1);
    }
    this.items.delete(id);
    this.log(`Removed item: ${id}`);
  }

  /**
   * 获取渲染项
   */
  getItem(id: string): Component | undefined {
    return this.items.get(id)?.component;
  }

  /**
   * 检查是否存在
   */
  hasItem(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * 清空所有项
   */
  clear(): void {
    this.items.clear();
    this.order = [];
    this.log('Cleared all items');
  }

  // ============================================================================
  // Dirty Marking
  // ============================================================================

  /**
   * 标记单个项为脏
   */
  markDirty(id: string): void {
    const item = this.items.get(id);
    if (item) {
      item.dirty = true;
      this.log(`Marked dirty: ${id}`);
    }
  }

  /**
   * 标记范围内的项为脏
   */
  markDirtyRange(start: number, end: number): void {
    for (let i = start; i < end && i < this.order.length; i++) {
      const item = this.items.get(this.order[i]);
      if (item) {
        item.dirty = true;
      }
    }
    this.log(`Marked dirty range: ${start}-${end}`);
  }

  /**
   * 标记所有项为脏
   */
  markAllDirty(): void {
    for (const item of this.items.values()) {
      item.dirty = true;
    }
    this.log('Marked all dirty');
  }

  /**
   * 标记特定项之后的所有项为脏
   */
  markDirtyAfter(id: string): void {
    const index = this.order.indexOf(id);
    if (index !== -1) {
      this.markDirtyRange(index + 1, this.order.length);
    }
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /**
   * 渲染所有项
   */
  render(width: number): string[] {
    const startTime = performance.now();

    // 宽度变化时，所有项都需要重新渲染
    if (this.width !== width) {
      this.log(`Width changed: ${this.width} → ${width}`);
      this.width = width;
      this.markAllDirty();
    }

    const lines: string[] = [];
    let dirtyCount = 0;

    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[i];
      const item = this.items.get(id)!;

      if (item.dirty || !item.cachedLines || item.cachedWidth !== width) {
        // 需要重新渲染
        const itemLines = item.component.render(width);
        item.cachedLines = itemLines;
        item.cachedWidth = width;
        item.lineCount = itemLines.length;
        item.dirty = false;
        dirtyCount++;
        this.stats.cacheMisses++;

        this.log(`Rendered: ${id} (${itemLines.length} lines)`);
      } else {
        this.stats.cacheHits++;
      }

      lines.push(...(item.cachedLines ?? []));
    }

    // 更新统计
    this.stats.totalItems = this.items.size;
    this.stats.dirtyItems = dirtyCount;
    this.stats.lastRenderTime = Date.now();
    this.stats.renderTimeMs = performance.now() - startTime;

    this.log(`Render complete: ${this.items.size} items, ${dirtyCount} dirty, ${this.stats.renderTimeMs.toFixed(2)}ms`);

    return lines;
  }

  /**
   * 增量渲染 - 只渲染脏项
   */
  renderIncremental(width: number): { lines: string[]; dirtyIds: string[] } {
    const startTime = performance.now();

    // 宽度变化时，所有项都需要重新渲染
    if (this.width !== width) {
      this.log(`Width changed: ${this.width} → ${width}`);
      this.width = width;
      this.markAllDirty();
    }

    const lines: string[] = [];
    const dirtyIds: string[] = [];

    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[i];
      const item = this.items.get(id)!;

      if (item.dirty || !item.cachedLines || item.cachedWidth !== width) {
        // 需要重新渲染
        const itemLines = item.component.render(width);
        item.cachedLines = itemLines;
        item.cachedWidth = width;
        item.lineCount = itemLines.length;
        item.dirty = false;
        dirtyIds.push(id);
        this.stats.cacheMisses++;
      } else {
        this.stats.cacheHits++;
      }

      lines.push(...(item.cachedLines ?? []));
    }

    this.stats.totalItems = this.items.size;
    this.stats.dirtyItems = dirtyIds.length;
    this.stats.lastRenderTime = Date.now();
    this.stats.renderTimeMs = performance.now() - startTime;

    return { lines, dirtyIds };
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * 使缓存失效
   */
  invalidate(id?: string): void {
    if (id) {
      const item = this.items.get(id);
      if (item) {
        item.cachedLines = undefined;
        item.cachedWidth = undefined;
        item.dirty = true;
      }
    } else {
      for (const item of this.items.values()) {
        item.cachedLines = undefined;
        item.cachedWidth = undefined;
        item.dirty = true;
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalItems: this.items.size,
      dirtyItems: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastRenderTime: 0,
      renderTimeMs: 0,
    };
  }

  /**
   * 获取项数
   */
  get size(): number {
    return this.items.size;
  }

  /**
   * 获取顺序列表
   */
  get orderList(): string[] {
    return [...this.order];
  }

  // ============================================================================
  // Debug
  // ============================================================================

  private log(message: string): void {
    if (this.debug) {
      console.log(`[IncrementalRenderer] ${message}`);
    }
  }
}

// ============================================================================
// BatchRenderer
// ============================================================================

/**
 * 批量渲染器
 *
 * 用于批量更新多个项，然后一次性渲染
 */
export class BatchRenderer {
  private renderer: IncrementalRenderer;
  private batchDirty: Set<string> = new Set();
  private isBatching = false;

  constructor(options?: IncrementalRendererOptions) {
    this.renderer = new IncrementalRenderer(options);
  }

  /**
   * 开始批量更新
   */
  beginBatch(): void {
    this.isBatching = true;
    this.batchDirty.clear();
  }

  /**
   * 标记项为脏 (批量模式)
   */
  markDirty(id: string): void {
    if (this.isBatching) {
      this.batchDirty.add(id);
    } else {
      this.renderer.markDirty(id);
    }
  }

  /**
   * 结束批量更新并渲染
   */
  endBatch(width: number): string[] {
    this.isBatching = false;
    for (const id of this.batchDirty) {
      this.renderer.markDirty(id);
    }
    this.batchDirty.clear();
    return this.renderer.render(width);
  }

  // 代理方法
  addItem(id: string, component: Component): void {
    this.renderer.addItem(id, component);
  }

  removeItem(id: string): void {
    this.renderer.removeItem(id);
  }

  invalidate(id?: string): void {
    this.renderer.invalidate(id);
  }

  getStats(): RenderStats {
    return this.renderer.getStats();
  }

  get size(): number {
    return this.renderer.size;
  }
}

// ============================================================================
// ReactiveRenderer
// ============================================================================

/**
 * 响应式渲染器
 *
 * 订阅 Store 变化，自动标记脏项
 */
export class ReactiveRenderer extends IncrementalRenderer {
  private unsubscribers: Array<() => void> = [];

  /**
   * 订阅 Store
   */
  subscribeToStore<T>(store: { subscribe: (listener: () => void) => () => void; getState: () => T }, selector?: (state: T) => unknown): void {
    const unsub = store.subscribe(() => {
      if (selector) {
        // 使用选择器，只标记相关项
        selector(store.getState());
      }
      this.markAllDirty();
    });
    this.unsubscribers.push(unsub);
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}