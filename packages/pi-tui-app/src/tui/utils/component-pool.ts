/**
 * Component Pool - 组件回收池
 *
 * 用于减少组件创建/销毁开销，通过延迟回收已完成的组件。
 * 当需要创建新组件时，先尝试从池中获取，而不是直接 new。
 */

import type { Component } from '@earendil-works/pi-tui';

/**
 * 组件创建器
 */
export type ComponentFactory<T extends Component> = () => T;

/**
 * 组件重置器 - 在回收到池之前调用，用于重置组件状态
 */
export type ComponentReset<T extends Component> = (component: T) => void;

/**
 * 组件池配置
 */
export interface ComponentPoolOptions {
  /** 最大池大小 (默认: 50) */
  maxSize?: number;
  /** 回收延迟 (ms) (默认: 5000) */
  recycleDelay?: number;
  /** 启用统计 */
  enableStats?: boolean;
}

/**
 * 组件池 - 用于复用已完成但可能需要重新使用的组件
 */
export class ComponentPool<T extends Component> {
  private pool: T[] = [];
  private readonly maxSize: number;
  private readonly recycleDelay: number;
  private readonly createFn: ComponentFactory<T>;
  private readonly resetFn: ComponentReset<T>;
  private readonly enableStats: boolean;

  // 统计信息
  private hits = 0;
  private misses = 0;
  private recycled = 0;

  constructor(
    createFn: ComponentFactory<T>,
    resetFn: ComponentReset<T>,
    options: ComponentPoolOptions = {},
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = options.maxSize ?? 50;
    this.recycleDelay = options.recycleDelay ?? 5000;
    this.enableStats = options.enableStats ?? false;
  }

  /**
   * 从池中获取组件，如果池为空则创建新的
   */
  acquire(): T {
    const component = this.pool.pop();
    if (component) {
      this.hits++;
      return component;
    }
    this.misses++;
    return this.createFn();
  }

  /**
   * 将组件回收到池中（延迟执行）
   */
  release(component: T): void {
    // 重置组件状态
    this.resetFn(component);

    // 如果池已满，丢弃最早的组件
    if (this.pool.length >= this.maxSize) {
      if (this.enableStats) {
        this.recycled++;
      }
      return;
    }

    this.pool.push(component);

    if (this.enableStats) {
      this.recycled++;
    }
  }

  /**
   * 延迟回收组件
   */
  releaseLater(component: T): void {
    setTimeout(() => {
      this.release(component);
    }, this.recycleDelay);
  }

  /**
   * 清空池
   */
  clear(): void {
    this.pool = [];
  }

  /**
   * 获取池大小
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * 获取统计信息
   */
  getStats(): { hits: number; misses: number; recycled: number; poolSize: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      recycled: this.recycled,
      poolSize: this.pool.length,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.recycled = 0;
  }
}

/**
 * 带生命周期的组件池
 * 适用于需要定期清理的组件
 */
export class LifecycleComponentPool<T extends Component> extends ComponentPool<T> {
  private pendingRelease = new Map<string, T>();

  /**
   * 延迟回收，但可取消
   */
  releaseLaterCancelable(component: T, cancelKey: string): void {
    // 取消之前的同名释放
    this.pendingRelease.delete(cancelKey);
    this.pendingRelease.set(cancelKey, component);

    setTimeout(() => {
      if (this.pendingRelease.get(cancelKey) === component) {
        this.pendingRelease.delete(cancelKey);
        this.release(component);
      }
    }, 5000);
  }

  /**
   * 批量清理所有待回收组件
   */
  flush(): void {
    for (const component of this.pendingRelease.values()) {
      this.release(component);
    }
    this.pendingRelease.clear();
  }
}

/**
 * 工具事件组件工厂和重置器类型
 */
export interface ToolEventComponentLike extends Component {
  setActive(progressMessage?: string): void;
  setComplete(summary: string, duration: number): void;
  setError(error: string): void;
  dispose?(): void;
}

/**
 * 工具事件组件池 - 专用于工具显示组件
 */
export class ToolEventPool {
  private pool: ToolEventComponentLike[] = [];
  private readonly maxSize: number;
  private readonly onCreate: (toolName: string) => ToolEventComponentLike;

  constructor(
    onCreate: (toolName: string) => ToolEventComponentLike,
    maxSize: number = 50,
  ) {
    this.onCreate = onCreate;
    this.maxSize = maxSize;
  }

  acquire(toolName: string): ToolEventComponentLike {
    if (this.pool.length > 0) {
      const component = this.pool.pop()!;
      component.setActive();
      return component;
    }
    return this.onCreate(toolName);
  }

  release(component: ToolEventComponentLike): void {
    if (this.pool.length < this.maxSize) {
      component.dispose?.();
      this.pool.push(component);
    }
  }

  releaseLater(component: ToolEventComponentLike): void {
    setTimeout(() => {
      this.release(component);
    }, 5000);
  }

  get size(): number {
    return this.pool.length;
  }

  clear(): void {
    for (const comp of this.pool) {
      comp.dispose?.();
    }
    this.pool = [];
  }
}