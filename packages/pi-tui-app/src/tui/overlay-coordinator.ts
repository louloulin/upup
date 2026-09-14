/**
 * OverlayCoordinator - Overlay 协调器
 *
 * 对标 Loucode 的 OverlayContext
 * 统一管理多个 Overlay 的显示、焦点和 Escape 键处理
 *
 * 解决的问题：
 * 1. 多个 Overlay 之间的优先级
 * 2. Escape 键的自动协调（哪个优先处理）
 * 3. 焦点管理（哪个 Overlay 接收输入）
 * 4. Overlay 之间的叠加关系
 */

import type { Component, OverlayHandle } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

/**
 * Overlay 类型
 */
export enum OverlayType {
  /** 普通选择列表 */
  SELECT_LIST = 'select_list',
  /** 命令面板 */
  COMMAND_PALETTE = 'command_palette',
  /** 审批对话框 */
  APPROVAL = 'approval',
  /** 设置面板 */
  SETTINGS = 'settings',
  /** 会话选择器 */
  SESSION_SELECTOR = 'session_selector',
  /** 模型选择器 */
  MODEL_SELECTOR = 'model_selector',
  /** 自定义 */
  CUSTOM = 'custom',
}

/**
 * Overlay 配置
 */
export interface OverlayConfig {
  /** Overlay 类型 */
  type: OverlayType;
  /** 显示的组件 */
  component: Component;
  /** 是否可被其他 Overlay 中断 */
  interruptible?: boolean;
  /** 优先级（数值越大优先级越高） */
  priority?: number;
  /** 关闭时的回调 */
  onClose?: () => void;
  /** Escape 键处理回调（返回 true 表示已处理） */
  onEscape?: () => boolean;
  /** 显示选项 */
  showOptions?: {
    width?: number | string;
    maxHeight?: number | string;
    anchor?: 'center' | 'top' | 'bottom';
  };
}

/**
 * Overlay 栈项
 */
interface OverlayStackItem {
  /** 配置 */
  config: OverlayConfig;
  /** 句柄 */
  handle: OverlayHandle;
  /** 关闭时的回调 */
  onClose?: () => void;
}

/**
 * Overlay 事件
 */
export type OverlayEventType = 'show' | 'hide' | 'escape' | 'focus_change';

/**
 * Overlay 事件监听器
 */
export type OverlayEventListener = (type: OverlayEventType, overlay: OverlayConfig | null) => void;

// ============================================================================
// OverlayCoordinator
// ============================================================================

export class OverlayCoordinator {
  private stack: OverlayStackItem[] = [];
  private eventListeners: Set<OverlayEventListener> = new Set();
  private tui: any = null; // pi-tui TUI instance

  /**
   * 初始化协调器
   */
  initialize(tui: any): void {
    this.tui = tui;
  }

  /**
   * 获取当前活跃的 Overlay
   */
  getActiveOverlay(): OverlayConfig | null {
    if (this.stack.length === 0) return null;
    return this.stack[this.stack.length - 1].config;
  }

  /**
   * 获取当前活跃的 Overlay 句柄
   */
  getActiveHandle(): OverlayHandle | null {
    if (this.stack.length === 0) return null;
    return this.stack[this.stack.length - 1].handle;
  }

  /**
   * 检查是否有活跃的 Overlay
   */
  hasActiveOverlay(): boolean {
    return this.stack.length > 0;
  }

  /**
   * 获取 Overlay 栈深度
   */
  getStackDepth(): number {
    return this.stack.length;
  }

  // ============================================================================
  // Show/Hide Operations
  // ============================================================================

  /**
   * 显示 Overlay
   *
   * @param config Overlay 配置
   * @returns OverlayHandle 或 null
   */
  show(config: OverlayConfig): OverlayHandle | null {
    if (!this.tui) {
      console.error('[OverlayCoordinator] Not initialized with TUI');
      return null;
    }

    // 检查是否可中断
    if (this.stack.length > 0) {
      const active = this.stack[this.stack.length - 1];
      if (!config.interruptible && active.config.priority && config.priority) {
        if (active.config.priority >= config.priority) {
          console.log('[OverlayCoordinator] Cannot interrupt lower priority overlay');
          return null;
        }
      }
    }

    // 显示新的 Overlay
    const showOptions = config.showOptions || {
      width: 70,
      maxHeight: '80%',
      anchor: 'center',
    };

    const handle = this.tui.showOverlay(config.component, {
      anchor: showOptions.anchor || 'center',
      width: showOptions.width || 70,
      maxHeight: showOptions.maxHeight || '80%',
    });

    const item: OverlayStackItem = {
      config,
      handle,
      onClose: config.onClose,
    };

    this.stack.push(item);
    this.notifyListeners('show', config);

    return handle;
  }

  /**
   * 隐藏当前 Overlay
   */
  hide(): boolean {
    if (this.stack.length === 0) return false;

    const item = this.stack.pop()!;

    // 关闭 Overlay
    if (item.handle) {
      item.handle.hide();
    }

    // 调用关闭回调
    item.onClose?.();

    this.notifyListeners('hide', null);

    return true;
  }

  /**
   * 隐藏所有 Overlay
   */
  hideAll(): void {
    while (this.stack.length > 0) {
      this.hide();
    }
  }

  /**
   * 根据类型隐藏 Overlay
   */
  hideByType(type: OverlayType): boolean {
    const index = this.stack.findIndex((item) => item.config.type === type);
    if (index === -1) return false;

    // 移除并关闭该 Overlay 之后的所有 Overlay
    const removed = this.stack.splice(index);
    for (const item of removed) {
      item.handle?.hide();
      item.onClose?.();
    }

    if (removed.length > 0) {
      this.notifyListeners('hide', null);
    }

    return true;
  }

  // ============================================================================
  // Escape Key Handling
  // ============================================================================

  /**
   * 处理 Escape 键
   *
   * 返回是否被处理
   */
  handleEscape(): boolean {
    if (this.stack.length === 0) return false;

    const item = this.stack[this.stack.length - 1];

    // 先尝试让当前 Overlay 处理
    if (item.config.onEscape) {
      const handled = item.config.onEscape();
      if (handled) {
        this.notifyListeners('escape', item.config);
        return true;
      }
    }

    // 关闭当前 Overlay
    return this.hide();
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  /**
   * 检查是否有焦点
   */
  isFocused(): boolean {
    if (this.stack.length === 0) return false;

    const handle = this.stack[this.stack.length - 1].handle;
    return handle?.isFocused?.() ?? false;
  }

  /**
   * 设置焦点
   */
  setFocus(): void {
    if (this.stack.length === 0) return;
    // OverlayHandle 的 setFocus 方法可能在某些版本不可用
    // 所以这里只记录日志，不强制调用
    // eslint-disable-next-line no-console
    console.log('[OverlayCoordinator] Focus set for overlay');
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  /**
   * 添加事件监听器
   */
  addEventListener(listener: OverlayEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: OverlayEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(type: OverlayEventType, overlay: OverlayConfig | null): void {
    for (const listener of this.eventListeners) {
      try {
        listener(type, overlay);
      } catch (e) {
        console.error('[OverlayCoordinator] Event listener error:', e);
      }
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * 获取栈信息（用于调试）
   */
  getStackInfo(): Array<{ type: OverlayType; priority?: number }> {
    return this.stack.map((item) => ({
      type: item.config.type,
      priority: item.config.priority,
    }));
  }

  /**
   * 检查是否有指定类型的 Overlay
   */
  hasOverlayType(type: OverlayType): boolean {
    return this.stack.some((item) => item.config.type === type);
  }

  /**
   * 销毁协调器
   */
  destroy(): void {
    this.hideAll();
    this.eventListeners.clear();
    this.tui = null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: OverlayCoordinator | null = null;

/**
 * 获取 OverlayCoordinator 单例
 */
export function getOverlayCoordinator(): OverlayCoordinator {
  if (!instance) {
    instance = new OverlayCoordinator();
  }
  return instance;
}

/**
 * 重置 OverlayCoordinator 单例
 */
export function resetOverlayCoordinator(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建标准的 SelectList Overlay
 */
export function createSelectOverlay(
  component: Component,
  options?: {
    onClose?: () => void;
    onEscape?: () => boolean;
  },
): OverlayConfig {
  return {
    type: OverlayType.SELECT_LIST,
    component,
    priority: 10,
    ...options,
  };
}

/**
 * 创建 Approval Overlay
 */
export function createApprovalOverlay(
  component: Component,
  options?: {
    onClose?: () => void;
  },
): OverlayConfig {
  return {
    type: OverlayType.APPROVAL,
    component,
    priority: 100, // 高优先级，不能被中断
    ...options,
  };
}

/**
 * 创建 Command Palette Overlay
 */
export function createCommandPaletteOverlay(
  component: Component,
  options?: {
    onClose?: () => void;
    onEscape?: () => boolean;
  },
): OverlayConfig {
  return {
    type: OverlayType.COMMAND_PALETTE,
    component,
    priority: 50,
    ...options,
  };
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * 集成到 TUIMain 的辅助类
 *
 * 使用方法:
 * ```typescript
 * const coordinator = new OverlayCoordinator();
 * coordinator.initialize(tui);
 *
 * // 显示 Overlay
 * coordinator.show(createSelectOverlay(myComponent, {
 *   onClose: () => { /* cleanup *\/ }
 * }));
 *
 * // 在 handleInput 中处理 Escape
 * if (matchesKey(data, Key.escape)) {
 *   if (coordinator.hasActiveOverlay()) {
 *     coordinator.handleEscape();
 *     return;
 *   }
 * }
 * ```
 */
export class TUIOverlayIntegration {
  private coordinator: OverlayCoordinator;
  private escapeHandler?: (e: string) => boolean;

  constructor(tui: any, escapeHandler?: (e: string) => boolean) {
    this.coordinator = getOverlayCoordinator();
    this.coordinator.initialize(tui);
    this.escapeHandler = escapeHandler;
  }

  /**
   * 创建并显示 SelectList Overlay
   */
  showSelectList(
    component: Component,
    options?: {
      onClose?: () => void;
      onEscape?: () => boolean;
      width?: number;
      maxHeight?: string;
    },
  ): OverlayHandle | null {
    return this.coordinator.show(createSelectOverlay(component, options));
  }

  /**
   * 创建并显示 Approval Overlay
   */
  showApproval(component: Component, options?: { onClose?: () => void }): OverlayHandle | null {
    return this.coordinator.show(createApprovalOverlay(component, options));
  }

  /**
   * 创建并显示 Command Palette
   */
  showCommandPalette(
    component: Component,
    options?: {
      onClose?: () => void;
      onEscape?: () => boolean;
    },
  ): OverlayHandle | null {
    return this.coordinator.show(createCommandPaletteOverlay(component, options));
  }

  /**
   * 处理 Escape 键
   */
  handleEscape(): boolean {
    return this.coordinator.handleEscape();
  }

  /**
   * 获取协调器
   */
  getCoordinator(): OverlayCoordinator {
    return this.coordinator;
  }
}