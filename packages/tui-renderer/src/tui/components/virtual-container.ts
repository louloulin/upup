/**
 * VirtualContainer - 虚拟化容器组件
 *
 * 类似于 Loucode 的 VirtualMessageList，但针对 pi-tui 设计。
 * 只渲染可见区域内的组件，通过高度缓存和滚动量化优化性能。
 */

import { Container, type Component } from '@earendil-works/pi-tui';

export interface VirtualItem {
  id: string;
  component: Component;
  height?: number;
}

export interface VirtualContainerOptions {
  /** 默认估计高度 (行) */
  defaultEstimate?: number;
  /** Overscan 行数 (上下各渲染多少额外行) */
  overscan?: number;
  /** 最大挂载组件数 */
  maxMounted?: number;
  /** 滚动量化大小 */
  scrollQuantum?: number;
}

/**
 * 虚拟化容器
 * 通过只渲染可见区域的组件来优化大量组件的渲染性能
 */
export class VirtualContainer implements Component {
  private items: VirtualItem[] = [];
  private heightCache = new Map<string, number>();
  private mountedRange: [number, number] = [0, 0];
  private scrollOffset = 0;
  protected viewportHeight = 30;
  private visibleStart = 0;
  private visibleEnd = 30;

  private readonly defaultEstimate: number;
  private readonly overscan: number;
  private readonly maxMounted: number;
  private readonly scrollQuantum: number;

  constructor(options: VirtualContainerOptions = {}) {
    this.defaultEstimate = options.defaultEstimate ?? 3;
    this.overscan = options.overscan ?? 20;
    this.maxMounted = options.maxMounted ?? 100;
    this.scrollQuantum = options.scrollQuantum ?? 10;
  }

  /**
   * 添加项目
   */
  addItem(id: string, component: Component): void {
    this.items.push({ id, component });
    this.invalidate();
  }

  /**
   * 移除项目
   */
  removeItem(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.heightCache.delete(id);
      this.invalidate();
    }
  }

  /**
   * 获取项目
   */
  getItem(id: string): Component | undefined {
    return this.items.find((item) => item.id === id)?.component;
  }

  /**
   * 清除所有项目
   */
  clear(): void {
    this.items = [];
    this.heightCache.clear();
    this.invalidate();
  }

  /**
   * 更新滚动位置
   */
  updateScroll(scrollOffset: number, viewportHeight: number): void {
    // 滚动量化 - 减少重渲染
    const newBin = Math.floor(scrollOffset / this.scrollQuantum);
    const currentBin = Math.floor(this.scrollOffset / this.scrollQuantum);

    this.scrollOffset = scrollOffset;
    this.viewportHeight = viewportHeight;

    // 只有 bin 变化时才重新计算可见范围
    if (newBin !== currentBin) {
      this.calculateVisibleRange();
      this.invalidate();
    }
  }

  /**
   * 计算可见范围
   */
  private calculateVisibleRange(): void {
    let currentOffset = 0;
    let start = 0;
    let end = this.items.length;

    // 找到可见起始位置
    for (let i = 0; i < this.items.length; i++) {
      const h = this.getItemHeight(i);
      if (currentOffset + h > this.scrollOffset) {
        start = Math.max(0, i - this.overscan);
        break;
      }
      currentOffset += h;
    }

    // 找到可见结束位置
    currentOffset = 0;
    for (let i = 0; i < this.items.length; i++) {
      currentOffset += this.getItemHeight(i);
      if (currentOffset >= this.scrollOffset + this.viewportHeight) {
        end = Math.min(this.items.length, i + this.overscan + 1);
        break;
      }
    }

    // 限制最大挂载数
    if (end - start > this.maxMounted) {
      const excess = end - start - this.maxMounted;
      start += Math.floor(excess / 2);
      end = start + this.maxMounted;
    }

    this.visibleStart = start;
    this.visibleEnd = end;
    this.mountedRange = [start, end];
  }

  /**
   * 获取项目高度
   */
  private getItemHeight(index: number): number {
    const item = this.items[index];
    if (!item) return this.defaultEstimate;

    if (item.height !== undefined) {
      return item.height;
    }

    const cached = this.heightCache.get(item.id);
    if (cached !== undefined) {
      return cached;
    }

    return this.defaultEstimate;
  }

  /**
   * 设置项目高度（测量后调用）
   */
  setItemHeight(id: string, height: number): void {
    this.heightCache.set(id, height);
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.height = height;
    }
  }

  /**
   * 使缓存失效
   */
  invalidate(): void {
    this.heightCache.clear();
    for (const item of this.items) {
      item.component.invalidate?.();
    }
  }

  /**
   * 获取总高度
   */
  getTotalHeight(): number {
    let total = 0;
    for (let i = 0; i < this.items.length; i++) {
      total += this.getItemHeight(i);
    }
    return total;
  }

  /**
   * 获取挂载范围
   */
  getMountedRange(): [number, number] {
    return this.mountedRange;
  }

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    // 如果没有滚动信息，渲染前 N 个项目
    if (this.scrollOffset === 0 && this.viewportHeight === 30) {
      const end = Math.min(this.items.length, this.overscan * 2);
      return this.renderRange(0, end, width);
    }

    this.calculateVisibleRange();
    return this.renderRange(this.visibleStart, this.visibleEnd, width);
  }

  /**
   * 渲染指定范围的项目
   */
  private renderRange(start: number, end: number, width: number): string[] {
    const lines: string[] = [];

    // 渲染顶部 Spacer
    if (start > 0) {
      let topHeight = 0;
      for (let i = 0; i < start; i++) {
        topHeight += this.getItemHeight(i);
      }
      // 用占位符表示顶部空间
      lines.push(...this.renderSpacer(topHeight));
    }

    // 渲染可见项目
    for (let i = start; i < end && i < this.items.length; i++) {
      const item = this.items[i];
      const height = this.getItemHeight(i);

      const itemLines = item.component.render(width);
      lines.push(...itemLines);

      // 测量并缓存高度
      if (item.height === undefined && itemLines.length > 0) {
        this.heightCache.set(item.id, itemLines.length);
        item.height = itemLines.length;
      }
    }

    // 渲染底部 Spacer
    if (end < this.items.length) {
      let bottomHeight = 0;
      for (let i = end; i < this.items.length; i++) {
        bottomHeight += this.getItemHeight(i);
      }
      lines.push(...this.renderSpacer(bottomHeight));
    }

    return lines;
  }

  /**
   * 渲染占位符
   */
  private renderSpacer(height: number): string[] {
    if (height <= 0) return [];
    // 使用不可见的占位符行
    return [''.padEnd(height, '─')];
  }
}

/**
 * 带滚动条的虚拟容器
 */
export class ScrollableVirtualContainer extends VirtualContainer {
  private scrollTop = 0;

  /**
   * 滚动到指定位置
   */
  scrollTo(top: number): void {
    this.scrollTop = Math.max(0, top);
    this.updateScroll(this.scrollTop, this.getViewportHeight());
  }

  /**
   * 滚动到底部
   */
  scrollToBottom(): void {
    const totalHeight = this.getTotalHeight();
    this.scrollTo(Math.max(0, totalHeight - this.getViewportHeight()));
  }

  getScrollTop(): number {
    return this.scrollTop;
  }

  getViewportHeight(): number {
    return this.viewportHeight;
  }
}

/**
 * 简单的虚拟列表（无滚动条跟踪）
 * 适用于 ChatLogComponent 这种自动滚到底部的场景
 */
export class SimpleVirtualList implements Component {
  private items: Component[] = [];
  private cachedLines: Map<number, string[]> = new Map();
  private cachedWidth: number | undefined;

  private readonly maxVisible: number;
  private readonly estimateHeight: number;

  constructor(maxVisible: number = 30, estimateHeight: number = 3) {
    this.maxVisible = maxVisible;
    this.estimateHeight = estimateHeight;
  }

  addItem(component: Component): void {
    this.items.push(component);
    this.cachedLines.clear();
    this.invalidate();
  }

  removeLast(): Component | undefined {
    const item = this.items.pop();
    if (item) {
      this.cachedLines.clear();
      this.invalidate();
    }
    return item;
  }

  clear(): void {
    this.items = [];
    this.cachedLines.clear();
    this.invalidate();
  }

  get itemCount(): number {
    return this.items.length;
  }

  invalidate(): void {
    this.cachedLines.clear();
    for (const item of this.items) {
      item.invalidate?.();
    }
  }

  render(width: number): string[] {
    // 宽度变化时清除缓存
    if (this.cachedWidth !== width) {
      this.cachedLines.clear();
      this.cachedWidth = width;
    }

    const lines: string[] = [];

    // 只渲染最后 maxVisible 个项目
    const startIndex = Math.max(0, this.items.length - this.maxVisible);

    for (let i = startIndex; i < this.items.length; i++) {
      // 检查缓存
      if (this.cachedLines.has(i)) {
        lines.push(...this.cachedLines.get(i)!);
      } else {
        const itemLines = this.items[i].render(width);
        this.cachedLines.set(i, itemLines);
        lines.push(...itemLines);
      }
    }

    return lines;
  }
}