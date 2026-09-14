/**
 * KeyBindings System
 *
 * 对标 Loucode KeyBindings
 * 基于 pi-tui matchesKey/Key 的快捷键解析系统
 * 支持 Chord (组合键) 如 Ctrl+K Ctrl+S
 */
import type { ParsedKeystroke, ParsedBinding } from './types.js';

import { matchesKey, Key, type KeyId } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

/** 快捷键上下文名称 */
export type KeybindingContextName = string;

/** 快捷键动作标识 */

/** 解析后的按键 */

export type { KeyEvent, ResolveResult, Keybinding, KeybindingBlock, ParsedKeystroke, KeybindingContext, KeybindingAction } from './types.js';
export type ChordResolveResult =
  | { type: 'match'; action: string }
  | { type: 'none' }
  | { type: 'unbound' }
  | { type: 'chord_started'; pending: ParsedKeystroke[] }
  | { type: 'chord_cancelled' };

// ============================================================================
// Key Parser
// ============================================================================

/**
 * 解析快捷键字符串为 ParsedKeystroke[]
 * 例如: "ctrl+c" -> [{ key: "c", ctrl: true }]
 * 例如: "ctrl+k ctrl+s" -> [{ key: "k", ctrl: true }, { key: "s", ctrl: true }]
 */
export function parseKeyBinding(keysStr: string): ParsedKeystroke[] | null {
  const parts = keysStr.toLowerCase().split(/\s+/);
  if (parts.length === 0) return null;

  const keystrokes: ParsedKeystroke[] = [];

  for (const part of parts) {
    const stroke = parseSingleKey(part);
    if (!stroke) return null;
    keystrokes.push(stroke);
  }

  return keystrokes;
}

/**
 * 解析单个快捷键
 */
function parseSingleKey(keyStr: string): ParsedKeystroke | null {
  const modifiers: string[] = [];
  let baseKey = keyStr;

  // 解析修饰符前缀
  for (const mod of ['ctrl', 'shift', 'alt', 'meta', 'super']) {
    if (baseKey.startsWith(mod + '+')) {
      modifiers.push(mod);
      baseKey = baseKey.slice(mod.length + 1);
    }
  }

  if (!baseKey) return null;

  // 转换修饰符
  const stroke: ParsedKeystroke = { key: baseKey };
  for (const mod of modifiers) {
    switch (mod) {
      case 'ctrl': stroke.ctrl = true; break;
      case 'shift': stroke.shift = true; break;
      case 'alt':
      case 'meta': stroke.alt = true; break;
      case 'super': stroke.super = true; break;
    }
  }

  return stroke;
}

/**
 * 将 ParsedKeystroke 转换为 KeyId
 */
export function keystrokeToKeyId(ks: ParsedKeystroke): KeyId | null {
  const parts: string[] = [];

  if (ks.ctrl) parts.push('ctrl');
  if (ks.shift) parts.push('shift');
  if (ks.alt || ks.meta) parts.push('alt');
  if (ks.super) parts.push('super');

  parts.push(ks.key);

  const keyId = parts.join('+') as KeyId;

  // 验证是否为有效 KeyId
  try {
    // 简单验证 - 检查是否包含有效的基础键
    const validKeys = [
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'escape', 'enter', 'tab', 'space', 'backspace', 'delete',
      'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown',
    ];

    const baseKey = ks.key.toLowerCase();
    if (validKeys.includes(baseKey) || baseKey.length === 1) {
      return keyId;
    }
  } catch {
    // ignore
  }

  return null;
}

// ============================================================================
// Keybinding Registry
// ============================================================================

export class KeybindingRegistry {
  private bindings: Map<string, ParsedBinding> = new Map();

  /**
   * 注册快捷键
   */
  register(context: KeybindingContextName, keysStr: string, action: string): boolean {
    const keystrokes = parseKeyBinding(keysStr);
    if (!keystrokes) {
      console.warn(`Invalid key binding: ${keysStr}`);
      return false;
    }

    const binding: ParsedBinding = {
      context,
      keys: keystrokes,
      action,
    };

    // 使用 context:keys 作为唯一键
    const key = `${context}:${keysStr}`;
    this.bindings.set(key, binding);
    return true;
  }

  /**
   * 获取绑定
   */
  getBinding(context: KeybindingContextName, keysStr: string): ParsedBinding | undefined {
    const key = `${context}:${keysStr}`;
    return this.bindings.get(key);
  }

  /**
   * 获取某上下文的全部绑定
   */
  getBindingsForContext(context: KeybindingContextName): ParsedBinding[] {
    return Array.from(this.bindings.values()).filter(b => b.context === context);
  }

  /**
   * 获取全部绑定
   */
  getAllBindings(): ParsedBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * 清除某上下文的绑定
   */
  clearContext(context: KeybindingContextName): void {
    for (const [key, binding] of this.bindings) {
      if (binding.context === context) {
        this.bindings.delete(key);
      }
    }
  }
}

// ============================================================================
// Keybinding Resolver
// ============================================================================

export class KeybindingResolver {
  private registry: KeybindingRegistry;
  private pendingChord: ParsedKeystroke[] | null = null;

  constructor(registry?: KeybindingRegistry) {
    this.registry = registry || new KeybindingRegistry();
  }

  /**
   * 获取当前待处理的 Chord
   */
  getPendingChord(): ParsedKeystroke[] | null {
    return this.pendingChord;
  }

  /**
   * 清除待处理的 Chord
   */
  clearPendingChord(): void {
    this.pendingChord = null;
  }

  /**
   * 解析按键输入
   */
  resolve(
    input: string,
    activeContexts: KeybindingContextName[],
    pending: ParsedKeystroke[] | null = null
  ): ChordResolveResult {
    // 取消 Chord (Escape)
    if (input === '\x1b' && pending !== null) {
      this.pendingChord = null;
      return { type: 'chord_cancelled' };
    }

    // 获取所有绑定
    const bindings = this.registry.getAllBindings();

    // 过滤活跃上下文
    const ctxSet = new Set(activeContexts);
    const contextBindings = bindings.filter(b => ctxSet.has(b.context));

    // 尝试匹配
    for (const binding of contextBindings) {
      if (this.matchesBinding(input, binding, pending)) {
        if (binding.action === '') {
          return { type: 'unbound' };
        }
        return { type: 'match', action: binding.action };
      }
    }

    // 检查是否可能开始 Chord
    for (const binding of contextBindings) {
      if (binding.keys.length > 1) {
        const prefix = pending ? [...pending] : [];
        if (this.isChordPrefix(binding.keys, prefix, input)) {
          const newPending = this.getNextKeystroke(binding.keys, prefix, input);
          if (newPending) {
            this.pendingChord = newPending;
            return { type: 'chord_started', pending: newPending };
          }
        }
      }
    }

    // 无匹配
    if (pending !== null) {
      this.pendingChord = null;
      return { type: 'chord_cancelled' };
    }

    return { type: 'none' };
  }

  /**
   * 检查绑定是否匹配
   */
  private matchesBinding(
    input: string,
    binding: ParsedBinding,
    pending: ParsedKeystroke[] | null
  ): boolean {
    const expectedKeys = pending ? pending : [];

    // 检查键数
    if (binding.keys.length !== expectedKeys.length + 1) {
      return false;
    }

    // 检查所有已完成的键
    for (let i = 0; i < expectedKeys.length; i++) {
      if (!this.keystrokeMatches(expectedKeys[i], binding.keys[i])) {
        return false;
      }
    }

    // 检查最后一个键
    return this.inputMatchesKeystroke(input, binding.keys[binding.keys.length - 1]);
  }

  /**
   * 检查输入是否匹配按键
   */
  private inputMatchesKeystroke(input: string, keystroke: ParsedKeystroke): boolean {
    // 使用 pi-tui matchesKey
    const keyId = keystrokeToKeyId(keystroke);
    if (keyId) {
      return matchesKey(input, keyId);
    }

    // 回退：简单字符串匹配
    return input.toLowerCase() === keystroke.key.toLowerCase();
  }

  /**
   * 检查两个按键是否匹配
   */
  private keystrokeMatches(a: ParsedKeystroke, b: ParsedKeystroke): boolean {
    return (
      a.key === b.key &&
      !!a.ctrl === !!b.ctrl &&
      !!a.shift === !!b.shift &&
      (!!a.alt || !!a.meta) === (!!b.alt || !!b.meta) &&
      !!a.super === !!b.super
    );
  }

  /**
   * 检查是否是 Chord 前缀
   */
  private isChordPrefix(
    bindingKeys: ParsedKeystroke[],
    current: ParsedKeystroke[],
    input: string
  ): boolean {
    // 已有键数必须小于绑定键数
    if (current.length >= bindingKeys.length) return false;

    // 检查已有键
    for (let i = 0; i < current.length; i++) {
      if (!this.keystrokeMatches(current[i], bindingKeys[i])) {
        return false;
      }
    }

    // 检查最后一个键是否匹配
    return this.inputMatchesKeystroke(input, bindingKeys[current.length]);
  }

  /**
   * 获取下一个按键
   */
  private getNextKeystroke(
    bindingKeys: ParsedKeystroke[],
    current: ParsedKeystroke[],
    input: string
  ): ParsedKeystroke[] | null {
    if (current.length >= bindingKeys.length) return null;

    // 尝试从输入创建按键
    const nextKey = this.createKeystrokeFromInput(input, bindingKeys[current.length]);
    if (!nextKey) return null;

    // 验证是否匹配期望的键
    if (this.keystrokeMatches(nextKey, bindingKeys[current.length])) {
      return [...current, nextKey];
    }

    return null;
  }

  /**
   * 从输入创建按键
   */
  private createKeystrokeFromInput(input: string, expected: ParsedKeystroke): ParsedKeystroke | null {
    const key = input.toLowerCase();
    if (!key || key.length > 1) return null;

    return {
      key,
      ctrl: expected.ctrl,
      shift: expected.shift,
      alt: expected.alt,
      meta: expected.meta,
      super: expected.super,
    };
  }
}

// ============================================================================
// Default Bindings
// ============================================================================

export const DEFAULT_BINDINGS: Array<{ context: string; keys: string; action: string }> = [
  // Global
  { context: 'Global', keys: 'ctrl+c', action: 'interrupt' },
  { context: 'Global', keys: 'ctrl+d', action: 'exit' },

  // Chat
  { context: 'Chat', keys: 'enter', action: 'submit' },
  { context: 'Chat', keys: 'escape', action: 'cancel' },
  { context: 'Chat', keys: 'ctrl+k', action: 'clear' },

  // Navigation
  { context: 'Navigation', keys: 'up', action: 'scroll-up' },
  { context: 'Navigation', keys: 'down', action: 'scroll-down' },
  { context: 'Navigation', keys: 'home', action: 'scroll-top' },
  { context: 'Navigation', keys: 'end', action: 'scroll-bottom' },

  // Session
  { context: 'Session', keys: 'ctrl+s', action: 'save-session' },
  { context: 'Session', keys: 'ctrl+n', action: 'new-session' },
];

/**
 * 创建默认的快捷键注册表
 */
export function createDefaultRegistry(): KeybindingRegistry {
  const registry = new KeybindingRegistry();

  for (const binding of DEFAULT_BINDINGS) {
    registry.register(binding.context, binding.keys, binding.action);
  }

  return registry;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createKeybindingResolver(registry?: KeybindingRegistry): KeybindingResolver {
  return new KeybindingResolver(registry);
}