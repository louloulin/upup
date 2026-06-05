/**
 * FocusManager - 焦点管理器
 *
 * 对标 Loucode 的焦点管理系统
 * 管理 TUI 中的焦点切换，支持焦点层级和焦点锁定
 */

import type { Component } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

/**
 * 焦点目标
 */
export interface FocusTarget {
  /** 目标组件 */
  component: Component;
  /** 目标名称 */
  name: string;
  /** 优先级（数值越大优先级越高） */
  priority?: number;
  /** 是否可获取焦点 */
  enabled?: boolean;
  /** 获取焦点时的回调 */
  onFocus?: () => void;
  /** 失去焦点时的回调 */
  onBlur?: () => void;
}

/**
 * 焦点状态
 */
export interface FocusState {
  /** 当前焦点目标 */
  current: FocusTarget | null;
  /** 焦点栈（用于焦点返回） */
  stack: FocusTarget[];
  /** 是否锁定 */
  locked: boolean;
  /** 锁定来源 */
  lockSource?: string;
}

/**
 * 焦点事件类型
 */
export type FocusEventType = 'focus' | 'blur' | 'lock' | 'unlock' | 'stack_change';

/**
 * 焦点事件监听器
 */
export type FocusEventListener = (type: FocusEventType, target: FocusTarget | null) => void;

// ============================================================================
// FocusManager
// ============================================================================

export class FocusManager {
  private targets: Map<string, FocusTarget> = new Map();
  private currentTarget: FocusTarget | null = null;
  private focusStack: FocusTarget[] = [];
  private locked: boolean = false;
  private lockSource?: string;
  private eventListeners: Set<FocusEventListener> = new Set();

  /**
   * 注册焦点目标
   */
  registerTarget(name: string, target: FocusTarget): void {
    // 如果已存在，先注销
    if (this.targets.has(name)) {
      this.unregisterTarget(name);
    }

    this.targets.set(name, {
      ...target,
      name,
      priority: target.priority ?? 0,
      enabled: target.enabled ?? true,
    });

    this.notifyListeners('stack_change', null);
  }

  /**
   * 注销焦点目标
   */
  unregisterTarget(name: string): void {
    const target = this.targets.get(name);
    if (target) {
      // 如果当前焦点在这个目标上，先转移焦点
      if (this.currentTarget?.name === name) {
        this.blur();
      }
      this.targets.delete(name);
      this.notifyListeners('stack_change', null);
    }
  }

  /**
   * 获取焦点目标
   */
  getTarget(name: string): FocusTarget | null {
    return this.targets.get(name) || null;
  }

  /**
   * 获取所有焦点目标
   */
  getAllTargets(): FocusTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * 获取可用的焦点目标
   */
  getEnabledTargets(): FocusTarget[] {
    return this.getAllTargets().filter((t) => t.enabled !== false);
  }

  // ============================================================================
  // Focus Operations
  // ============================================================================

  /**
   * 设置焦点
   *
   * @param name 目标名称
   * @param pushToStack 是否推入焦点栈
   */
  focus(name: string, pushToStack: boolean = true): boolean {
    // 检查是否锁定
    if (this.locked) {
      console.log(`[FocusManager] Cannot focus '${name}' - locked by ${this.lockSource}`);
      return false;
    }

    const target = this.targets.get(name);
    if (!target) {
      console.log(`[FocusManager] Target '${name}' not found`);
      return false;
    }

    if (target.enabled === false) {
      console.log(`[FocusManager] Target '${name}' is disabled`);
      return false;
    }

    // 如果已经是当前焦点，不做处理
    if (this.currentTarget?.name === name) {
      return true;
    }

    // 推入栈
    if (pushToStack && this.currentTarget) {
      this.focusStack.push(this.currentTarget);
      this.notifyListeners('stack_change', null);
    }

    // 失去当前焦点
    if (this.currentTarget) {
      this.currentTarget.onBlur?.();
      this.notifyListeners('blur', this.currentTarget);
    }

    // 获取新焦点
    this.currentTarget = target;
    target.onFocus?.();
    this.notifyListeners('focus', target);

    return true;
  }

  /**
   * 失去焦点
   */
  blur(): void {
    if (this.currentTarget) {
      const previous = this.currentTarget;
      this.currentTarget = null;
      previous.onBlur?.();
      this.notifyListeners('blur', previous);
    }
  }

  /**
   * 返回上一个焦点
   */
  pop(): boolean {
    if (this.locked) {
      console.log(`[FocusManager] Cannot pop - locked by ${this.lockSource}`);
      return false;
    }

    if (this.focusStack.length === 0) {
      console.log(`[FocusManager] Focus stack is empty`);
      return false;
    }

    // 失去当前焦点
    if (this.currentTarget) {
      this.currentTarget.onBlur?.();
      this.notifyListeners('blur', this.currentTarget);
    }

    // 弹出栈顶
    const previous = this.focusStack.pop()!;
    this.currentTarget = previous;
    previous.onFocus?.();
    this.notifyListeners('focus', previous);
    this.notifyListeners('stack_change', null);

    return true;
  }

  /**
   * 清除焦点栈
   */
  clearStack(): void {
    this.focusStack = [];
    this.notifyListeners('stack_change', null);
  }

  // ============================================================================
  // Lock Operations
  // ============================================================================

  /**
   * 锁定焦点
   *
   * @param source 锁定来源
   */
  lock(source: string = 'unknown'): void {
    if (this.locked) {
      console.log(`[FocusManager] Already locked by ${this.lockSource}`);
      return;
    }

    this.locked = true;
    this.lockSource = source;
    this.notifyListeners('lock', this.currentTarget);
  }

  /**
   * 解锁焦点
   */
  unlock(): void {
    if (!this.locked) {
      return;
    }

    this.locked = false;
    this.lockSource = undefined;
    this.notifyListeners('unlock', this.currentTarget);
  }

  /**
   * 检查是否锁定
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * 获取锁定来源
   */
  getLockSource(): string | undefined {
    return this.lockSource;
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * 获取当前焦点
   */
  getCurrentTarget(): FocusTarget | null {
    return this.currentTarget;
  }

  /**
   * 获取当前焦点名称
   */
  getCurrentName(): string | null {
    return this.currentTarget?.name || null;
  }

  /**
   * 检查是否有焦点
   */
  hasFocus(): boolean {
    return this.currentTarget !== null;
  }

  /**
   * 检查是否有特定焦点的组件
   */
  hasFocusOn(name: string): boolean {
    return this.currentTarget?.name === name;
  }

  /**
   * 获取焦点栈深度
   */
  getStackDepth(): number {
    return this.focusStack.length;
  }

  /**
   * 获取焦点栈信息
   */
  getStackInfo(): Array<{ name: string; priority?: number }> {
    return this.focusStack.map((t) => ({
      name: t.name,
      priority: t.priority,
    }));
  }

  // ============================================================================
  // Target Management
  // ============================================================================

  /**
   * 启用焦点目标
   */
  enableTarget(name: string): void {
    const target = this.targets.get(name);
    if (target) {
      target.enabled = true;
    }
  }

  /**
   * 禁用焦点目标
   */
  disableTarget(name: string): void {
    const target = this.targets.get(name);
    if (target) {
      target.enabled = false;
      // 如果当前焦点在这个目标上，转移焦点
      if (this.currentTarget?.name === name) {
        this.blur();
      }
    }
  }

  /**
   * 更新焦点目标
   */
  updateTarget(name: string, updates: Partial<FocusTarget>): void {
    const target = this.targets.get(name);
    if (target) {
      Object.assign(target, updates);
    }
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  /**
   * 添加事件监听器
   */
  addEventListener(listener: FocusEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: FocusEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(type: FocusEventType, target: FocusTarget | null): void {
    for (const listener of this.eventListeners) {
      try {
        listener(type, target);
      } catch (e) {
        console.error('[FocusManager] Event listener error:', e);
      }
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.blur();
    this.clearStack();
    this.targets.clear();
    this.eventListeners.clear();
    this.locked = false;
    this.lockSource = undefined;
  }

  /**
   * 重置为初始状态
   */
  reset(): void {
    this.destroy();
  }

  /**
   * 获取状态快照
   */
  getState(): FocusState {
    return {
      current: this.currentTarget,
      stack: [...this.focusStack],
      locked: this.locked,
      lockSource: this.lockSource,
    };
  }

  /**
   * 恢复状态
   */
  restoreState(state: FocusState): void {
    // 恢复栈
    this.focusStack = [...state.stack];

    // 恢复锁定状态
    if (state.locked) {
      this.lock(state.lockSource || 'restore');
    } else {
      this.locked = false;
      this.lockSource = undefined;
    }

    // 恢复焦点
    if (state.current) {
      this.focus(state.current.name, false);
    }

    this.notifyListeners('stack_change', null);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: FocusManager | null = null;

/**
 * 获取 FocusManager 单例
 */
export function getFocusManager(): FocusManager {
  if (!instance) {
    instance = new FocusManager();
  }
  return instance;
}

/**
 * 重置 FocusManager 单例
 */
export function resetFocusManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建 FocusTarget
 */
export function createFocusTarget(
  component: Component,
  name: string,
  options?: {
    priority?: number;
    enabled?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
  },
): FocusTarget {
  return {
    component,
    name,
    priority: options?.priority,
    enabled: options?.enabled,
    onFocus: options?.onFocus,
    onBlur: options?.onBlur,
  };
}

/**
 * 创建 FocusManager 实例
 */
export function createFocusManager(): FocusManager {
  return new FocusManager();
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * TUI 焦点管理集成
 *
 * 提供与 pi-tui TUI 集成的辅助方法
 */
export class TUIFocusIntegration {
  private focusManager: FocusManager;
  private tui: any;

  constructor(tui: any) {
    this.tui = tui;
    this.focusManager = getFocusManager();
  }

  /**
   * 注册组件为焦点目标
   */
  registerComponent(
    name: string,
    component: Component,
    options?: {
      priority?: number;
      onFocus?: () => void;
      onBlur?: () => void;
    },
  ): void {
    this.focusManager.registerTarget(
      name,
      createFocusTarget(component, name, {
        priority: options?.priority,
        onFocus: () => {
          this.tui.setFocus(component);
          options?.onFocus?.();
        },
        onBlur: options?.onBlur,
      }),
    );
  }

  /**
   * 设置焦点
   */
  focus(name: string): boolean {
    return this.focusManager.focus(name);
  }

  /**
   * 失去焦点
   */
  blur(): void {
    this.focusManager.blur();
  }

  /**
   * 返回上一个焦点
   */
  pop(): boolean {
    return this.focusManager.pop();
  }

  /**
   * 锁定焦点
   */
  lock(source: string): void {
    this.focusManager.lock(source);
  }

  /**
   * 解锁焦点
   */
  unlock(): void {
    this.focusManager.unlock();
  }

  /**
   * 获取焦点管理器
   */
  getFocusManager(): FocusManager {
    return this.focusManager;
  }
}