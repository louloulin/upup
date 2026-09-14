/**
 * Key Bindings Utilities
 *
 * 对标 Loucode key bindings
 * 快捷键定义和处理
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';

// ============================================================================
// Key Binding Types
// ============================================================================

export interface KeyBinding {
  /** 快捷键描述 */
  description: string;
  /** 快捷键类别 */
  category: string;
  /** 处理函数 */
  handler: () => void;
  /** 是否可用 */
  enabled?: () => boolean;
}

export interface KeyBindingContext {
  /** 上下文名称 */
  name: string;
  /** 绑定列表 */
  bindings: KeyBinding[];
}

// ============================================================================
// Common Key Names
// ============================================================================

export const KEY_NAMES: Record<string, string> = {
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowUp: '↑',
  arrowDown: '↓',
  arrowLeft: '←',
  arrowRight: '→',
  pageUp: 'PageUp',
  pageDown: 'PageDown',
  home: 'Home',
  end: 'End',
  space: 'Space',
};

// ============================================================================
// Key Sequence Types
// ============================================================================

type KeyHandler = () => void;

/**
 * 简单快捷键映射
 */
export interface KeyMap {
  [key: string]: KeyHandler;
}

/**
 * 组合键修饰符
 */
export type KeyModifier = 'ctrl' | 'alt' | 'shift' | 'meta';

/**
 * 解析快捷键字符串
 * 例如: "Ctrl+C", "Alt+F4", "Ctrl+Shift+S"
 */
export function parseKeyCombo(combo: string): {
  modifiers: KeyModifier[];
  key: string;
} {
  const parts = combo.split('+').map(p => p.trim().toLowerCase());
  const modifiers: KeyModifier[] = [];
  let key = parts[parts.length - 1];

  for (const part of parts.slice(0, -1)) {
    if (part === 'ctrl' || part === 'control') modifiers.push('ctrl');
    else if (part === 'alt' || part === 'option') modifiers.push('alt');
    else if (part === 'shift') modifiers.push('shift');
    else if (part === 'meta' || part === 'cmd' || part === 'command') modifiers.push('meta');
  }

  return { modifiers, key };
}

/**
 * 格式化快捷键显示
 */
export function formatKeyCombo(combo: string): string {
  const { modifiers, key } = parseKeyCombo(combo);

  const modSymbols: Record<KeyModifier, string> = {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    meta: 'Cmd',
  };

  const parts = modifiers.map(m => modSymbols[m]);

  // 添加符号
  if (key === 'enter') parts.push('↵');
  else if (key === 'escape') parts.push('⎋');
  else if (key === 'arrowup') parts.push('↑');
  else if (key === 'arrowdown') parts.push('↓');
  else if (key === 'arrowleft') parts.push('←');
  else if (key === 'arrowright') parts.push('→');
  else if (key === 'tab') parts.push('⇥');
  else if (key === 'backspace') parts.push('⌫');
  else if (key === 'delete') parts.push('Del');
  else if (key === 'space') parts.push('Space');
  else parts.push(key.toUpperCase());

  return parts.join('+');
}

// ============================================================================
// Key Handler Registry
// ============================================================================

/**
 * 快捷键处理器
 */
export class KeyHandlerRegistry {
  private handlers: Map<string, KeyHandler[]> = new Map();
  private enabledCheckers: Map<string, () => boolean> = new Map();

  /**
   * 注册快捷键
   */
  register(combo: string, handler: KeyHandler, enabled?: () => boolean): void {
    const key = combo.toLowerCase();
    if (!this.handlers.has(key)) {
      this.handlers.set(key, []);
    }
    this.handlers.get(key)!.push(handler);

    if (enabled) {
      this.enabledCheckers.set(key, enabled);
    }
  }

  /**
   * 注销快捷键
   */
  unregister(combo: string, handler: KeyHandler): void {
    const key = combo.toLowerCase();
    const handlers = this.handlers.get(key);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.handlers.delete(key);
      }
    }
    this.enabledCheckers.delete(key);
  }

  /**
   * 处理输入
   */
  handleInput(data: string): boolean {
    const key = data.toLowerCase();
    const handlers = this.handlers.get(key);

    if (!handlers || handlers.length === 0) {
      return false;
    }

    // 检查是否启用
    const enabled = this.enabledCheckers.get(key);
    if (enabled && !enabled()) {
      return false;
    }

    // 执行所有处理器
    for (const handler of handlers) {
      handler();
    }

    return true;
  }

  /**
   * 获取所有快捷键
   */
  getAllBindings(): Array<{ combo: string; handler: KeyHandler }> {
    const bindings: Array<{ combo: string; handler: KeyHandler }> = [];
    for (const [combo, handlers] of this.handlers) {
      for (const handler of handlers) {
        bindings.push({ combo, handler });
      }
    }
    return bindings;
  }
}

// ============================================================================
// Predefined Key Maps
// ============================================================================

/**
 * 导航快捷键
 */
export const NAVIGATION_KEYS: KeyMap = {
  up: () => {},
  down: () => {},
  left: () => {},
  right: () => {},
  pageUp: () => {},
  pageDown: () => {},
  home: () => {},
  end: () => {},
};

/**
 * 编辑快捷键
 */
export const EDIT_KEYS: KeyMap = {
  enter: () => {},
  escape: () => {},
  tab: () => {},
  backspace: () => {},
  delete: () => {},
  ctrlA: () => {}, // 全选
  ctrlE: () => {}, // 行尾
  ctrlU: () => {}, // 删除行
  ctrlW: () => {}, // 删除词
};

/**
 * TUI 全局快捷键
 */
export const GLOBAL_KEYS: KeyMap = {
  ctrlC: () => {}, // 中断
  ctrlL: () => {}, // 清屏
  ctrlZ: () => {}, // 挂起
  ctrlS: () => {}, // 保存
  ctrlR: () => {}, // 搜索历史
};

// ============================================================================
// Mode-Specific Bindings
// ============================================================================

export type TUIMode = 'normal' | 'insert' | 'select' | 'confirm' | 'modal';

export interface TUIModeBindings {
  mode: TUIMode;
  bindings: KeyBinding[];
}

/**
 * 获取特定模式的快捷键
 */
export function getModeBindings(mode: TUIMode): TUIModeBindings {
  const modeBindings: Record<TUIMode, TUIModeBindings> = {
    normal: {
      mode: 'normal',
      bindings: [
        { description: 'Enter insert mode', category: 'mode', handler: () => {} },
        { description: 'Open command palette', category: 'navigation', handler: () => {}, enabled: () => true },
        { description: 'Navigate history', category: 'navigation', handler: () => {} },
      ],
    },
    insert: {
      mode: 'insert',
      bindings: [
        { description: 'Submit input', category: 'action', handler: () => {} },
        { description: 'Exit insert mode', category: 'mode', handler: () => {} },
        { description: 'Complete word', category: 'completion', handler: () => {} },
      ],
    },
    select: {
      mode: 'select',
      bindings: [
        { description: 'Select', category: 'action', handler: () => {} },
        { description: 'Cancel', category: 'action', handler: () => {} },
        { description: 'Navigate', category: 'navigation', handler: () => {} },
      ],
    },
    confirm: {
      mode: 'confirm',
      bindings: [
        { description: 'Confirm', category: 'action', handler: () => {} },
        { description: 'Cancel', category: 'action', handler: () => {} },
        { description: 'Yes to all', category: 'action', handler: () => {} },
        { description: 'No to all', category: 'action', handler: () => {} },
      ],
    },
    modal: {
      mode: 'modal',
      bindings: [
        { description: 'Close modal', category: 'action', handler: () => {} },
        { description: 'Confirm', category: 'action', handler: () => {} },
      ],
    },
  };

  return modeBindings[mode];
}

// ============================================================================
// Key Sequence Detection (Chords)
// ============================================================================

/**
 * 按键序列检测器 (例如 Ctrl+K 然后 Ctrl+S)
 */
export class KeySequenceDetector {
  private sequence: string[] = [];
  private timeout: number;
  private handlers: Map<string, () => void> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(timeout: number = 500) {
    this.timeout = timeout;
  }

  /**
   * 注册序列
   */
  register(sequence: string[], handler: () => void): void {
    const key = sequence.join(' ');
    this.handlers.set(key, handler);
  }

  /**
   * 处理按键
   */
  handleInput(data: string): boolean {
    // 清除之前的计时器
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // 添加到序列
    this.sequence.push(data);

    // 检查是否有匹配的序列
    const key = this.sequence.join(' ');
    const handler = this.handlers.get(key);

    if (handler) {
      // 找到完整序列
      this.sequence = [];
      handler();
      return true;
    }

    // 检查是否有部分匹配的序列
    let foundPartial = false;
    for (const registeredKey of this.handlers.keys()) {
      if (registeredKey.startsWith(key + ' ')) {
        foundPartial = true;
        break;
      }
    }

    if (foundPartial) {
      // 等待下一个按键
      this.timer = setTimeout(() => {
        this.sequence = [];
      }, this.timeout);
      return false;
    }

    // 没有匹配，重置
    this.sequence = [];
    return false;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.sequence = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
