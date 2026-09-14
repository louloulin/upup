/**
 * useScrollQuantum - 滚动量化 Hook
 *
 * 对标 Loucode 的 useVirtualScroll.ts 中的 SCROLL_QUANTUM
 * 通过将滚动位置量化为固定大小的"桶"，减少重渲染次数
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * 默认滚动量化大小 (行数)
 * Loucode 使用 OVERSCAN_ROWS >> 1 = 80 >> 1 = 40
 */
export const DEFAULT_SCROLL_QUANTUM = 10;

/**
 * 默认 Overscan 行数 (视口上下各渲染多少额外行)
 */
export const DEFAULT_OVERSCAN = 20;

/**
 * 默认估计高度 (行)
 */
export const DEFAULT_ESTIMATE_HEIGHT = 3;

// ============================================================================
// Types
// ============================================================================

/**
 * 滚动状态
 */
export interface ScrollState {
  /** 滚动偏移量 (行) */
  scrollTop: number;
  /** 滚动量化桶号 */
  scrollBin: number;
  /** 视口高度 (行) */
  viewportHeight: number;
  /** 内容总高度 (行) */
  contentHeight: number;
  /** 是否在滚动 */
  isScrolling: boolean;
  /** 滚动方向: -1=上, 0=无, 1=下 */
  direction: -1 | 0 | 1;
}

/**
 * 滚动事件处理器
 */
export type ScrollHandler = (state: ScrollState) => void;

/**
 * 滚动量化配置
 */
export interface ScrollQuantumOptions {
  /** 量化大小 (行) */
  quantum?: number;
  /** Overscan 行数 */
  overscan?: number;
  /** 默认估计高度 */
  estimateHeight?: number;
  /** 是否启用滚动方向检测 */
  detectDirection?: boolean;
}

// ============================================================================
// ScrollQuantum
// ============================================================================

/**
 * 滚动量化器
 *
 * 将滚动位置量化为固定大小的桶，减少重渲染次数
 */
export class ScrollQuantum {
  private scrollTop = 0;
  private viewportHeight = 30;
  private contentHeight = 0;
  private scrollBin = 0;
  private lastScrollTop = 0;
  private direction: -1 | 0 | 1 = 0;
  private isScrolling = false;
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly quantum: number;
  private readonly overscan: number;
  private readonly estimateHeight: number;
  private readonly detectDirection: boolean;

  private handlers: Set<ScrollHandler> = new Set();

  constructor(options: ScrollQuantumOptions = {}) {
    this.quantum = options.quantum ?? DEFAULT_SCROLL_QUANTUM;
    this.overscan = options.overscan ?? DEFAULT_OVERSCAN;
    this.estimateHeight = options.estimateHeight ?? DEFAULT_ESTIMATE_HEIGHT;
    this.detectDirection = options.detectDirection ?? true;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  getQuantum(): number {
    return this.quantum;
  }

  getOverscan(): number {
    return this.overscan;
  }

  getEstimateHeight(): number {
    return this.estimateHeight;
  }

  // ============================================================================
  // Scroll State
  // ============================================================================

  /**
   * 更新滚动位置
   */
  updateScroll(scrollTop: number, viewportHeight: number, contentHeight?: number): void {
    const prevBin = this.scrollBin;
    const prevTop = this.scrollTop;

    this.scrollTop = Math.max(0, scrollTop);
    this.viewportHeight = Math.max(1, viewportHeight);
    if (contentHeight !== undefined) {
      this.contentHeight = contentHeight;
    }

    // 计算新的量化桶
    this.scrollBin = Math.floor(this.scrollTop / this.quantum);

    // 检测滚动方向
    if (this.detectDirection) {
      if (scrollTop > prevTop) {
        this.direction = 1;
      } else if (scrollTop < prevTop) {
        this.direction = -1;
      } else {
        this.direction = 0;
      }
    }

    // 清除之前的滚动结束计时器
    if (this.scrollTimeout !== null) {
      clearTimeout(this.scrollTimeout);
    }

    // 设置滚动结束计时器
    this.isScrolling = true;
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false;
      this.direction = 0;
      this.notify();
    }, 150);

    // 只有桶号变化时才通知
    if (this.scrollBin !== prevBin || this.scrollTop !== prevTop) {
      this.notify();
    }

    this.lastScrollTop = scrollTop;
  }

  /**
   * 获取滚动状态
   */
  getState(): ScrollState {
    return {
      scrollTop: this.scrollTop,
      scrollBin: this.scrollBin,
      viewportHeight: this.viewportHeight,
      contentHeight: this.contentHeight,
      isScrolling: this.isScrolling,
      direction: this.direction,
    };
  }

  // ============================================================================
  // Visible Range Calculation
  // ============================================================================

  /**
   * 计算可见范围
   */
  getVisibleRange(itemHeights: number[]): [number, number] {
    let currentOffset = 0;
    let start = 0;
    let end = itemHeights.length;

    // 找到可见起始位置
    for (let i = 0; i < itemHeights.length; i++) {
      const h = itemHeights[i] ?? this.estimateHeight;
      if (currentOffset + h > this.scrollTop) {
        start = Math.max(0, i - this.overscan);
        break;
      }
      currentOffset += h;
    }

    // 找到可见结束位置
    currentOffset = 0;
    for (let i = 0; i < itemHeights.length; i++) {
      currentOffset += itemHeights[i] ?? this.estimateHeight;
      if (currentOffset >= this.scrollTop + this.viewportHeight) {
        end = Math.min(itemHeights.length, i + this.overscan + 1);
        break;
      }
    }

    return [start, end];
  }

  /**
   * 计算虚拟滚动偏移 (用于 Spacer)
   */
  getVirtualOffset(itemHeights: number[]): number {
    let offset = 0;
    const visibleRange = this.getVisibleRange(itemHeights);

    for (let i = 0; i < visibleRange[0]; i++) {
      offset += itemHeights[i] ?? this.estimateHeight;
    }

    return offset;
  }

  /**
   * 计算底部 Spacer 高度
   */
  getBottomSpacerHeight(itemHeights: number[]): number {
    let height = 0;
    const visibleRange = this.getVisibleRange(itemHeights);

    for (let i = visibleRange[1]; i < itemHeights.length; i++) {
      height += itemHeights[i] ?? this.estimateHeight;
    }

    return height;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * 订阅滚动变化
   */
  subscribe(handler: ScrollHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * 通知所有处理器
   */
  private notify(): void {
    const state = this.getState();
    for (const handler of this.handlers) {
      handler(state);
    }
  }

  // ============================================================================
  // Scroll Operations
  // ============================================================================

  /**
   * 滚动到指定位置
   */
  scrollTo(top: number): void {
    this.updateScroll(top, this.viewportHeight, this.contentHeight);
  }

  /**
   * 滚动到指定索引
   */
  scrollToIndex(itemHeights: number[], index: number): void {
    let offset = 0;
    for (let i = 0; i < index && i < itemHeights.length; i++) {
      offset += itemHeights[i] ?? this.estimateHeight;
    }
    this.scrollTo(offset);
  }

  /**
   * 滚动到底部
   */
  scrollToBottom(): void {
    this.scrollTo(Math.max(0, this.contentHeight - this.viewportHeight));
  }

  /**
   * 滚动到顶部
   */
  scrollToTop(): void {
    this.scrollTo(0);
  }

  /**
   * 滚动到可见区域中心
   */
  scrollIntoView(itemIndex: number, itemHeights: number[]): void {
    let offset = 0;
    for (let i = 0; i < itemIndex && i < itemHeights.length; i++) {
      offset += itemHeights[i] ?? this.estimateHeight;
    }

    const itemHeight = itemHeights[itemIndex] ?? this.estimateHeight;
    const viewportCenter = this.scrollTop + this.viewportHeight / 2;

    if (offset + itemHeight / 2 > viewportCenter) {
      // 项目在视口上方，向上滚动
      this.scrollTo(Math.max(0, offset - this.viewportHeight / 2));
    } else if (offset + itemHeight / 2 < viewportCenter) {
      // 项目在视口下方，向下滚动
      this.scrollTo(offset - this.viewportHeight / 2 + itemHeight);
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * 销毁
   */
  destroy(): void {
    if (this.scrollTimeout !== null) {
      clearTimeout(this.scrollTimeout);
    }
    this.handlers.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建默认滚动量化器
 */
export function createScrollQuantum(options?: ScrollQuantumOptions): ScrollQuantum {
  return new ScrollQuantum(options);
}

/**
 * 创建虚拟列表滚动处理器
 */
export function createVirtualScrollHandler(
  options: ScrollQuantumOptions & { onRangeChange?: (range: [number, number]) => void },
): {
  handler: ScrollHandler;
  quantum: ScrollQuantum;
  getVisibleRange: (heights: number[]) => [number, number];
  getTopSpacer: (heights: number[]) => number;
  getBottomSpacer: (heights: number[]) => number;
} {
  const quantum = new ScrollQuantum(options);

  return {
    handler: (state) => {
      options.onRangeChange?.(quantum.getVisibleRange([]));
    },
    quantum,
    getVisibleRange: (heights) => quantum.getVisibleRange(heights),
    getTopSpacer: (heights) => quantum.getVirtualOffset(heights),
    getBottomSpacer: (heights) => quantum.getBottomSpacerHeight(heights),
  };
}

// ============================================================================
// Height Cache
// ============================================================================

/**
 * 高度缓存
 *
 * 用于存储测量后的项目高度
 */
export class HeightCache {
  private cache = new Map<string, number>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  set(id: string, height: number): void {
    if (this.cache.size >= this.maxSize) {
      // 删除最早的 10%
      const keys = Array.from(this.cache.keys());
      const toDelete = Math.ceil(this.maxSize * 0.1);
      for (let i = 0; i < toDelete; i++) {
        this.cache.delete(keys[i]);
      }
    }
    this.cache.set(id, height);
  }

  get(id: string): number | undefined {
    return this.cache.get(id);
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  delete(id: string): void {
    this.cache.delete(id);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}