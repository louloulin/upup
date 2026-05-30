/**
 * CommandInputController - 命令输入控制器
 *
 * 目标: 统一管理命令输入状态，解决以下问题:
 * 1. slashActive 双重状态问题
 * 2. 左右键完全被劫持导致无法移动光标
 * 3. 缺少 cursorPosition 属性
 *
 * 参考 Claude Code (Loucode) useTextInput 设计
 *
 * 使用方式:
 * - cli.ts 使用此控制器管理命令输入状态
 * - custom-editor.ts 通过控制器获取状态和进行条件判断
 */

import { commandStore, commandActions } from './state/command-state.js';

export interface InputState {
  text: string;
  cursorPosition: number;
  mode: 'input' | 'suggestions' | 'executing';
}

/**
 * 命令输入控制器
 * 负责:
 * - 跟踪输入文本和光标位置
 * - 管理命令建议状态
 * - 提供条件化分页逻辑
 */
export class CommandInputController {
  private _text: string = '';
  private _cursorPosition: number = 0;
  private _inputCallback?: (text: string) => void;

  constructor() {
    // 初始化为空
  }

  // ==================== Getters ====================

  get text(): string {
    return this._text;
  }

  get cursorPosition(): number {
    return this._cursorPosition;
  }

  get hasSlashPrefix(): boolean {
    return this._text.startsWith('/');
  }

  get query(): string {
    return this.hasSlashPrefix ? this._text.slice(1) : '';
  }

  // ==================== State Updates ====================

  /**
   * 更新输入文本和光标位置
   */
  setText(text: string, cursorPosition: number = 0): void {
    const oldText = this._text;
    this._text = text;
    this._cursorPosition = Math.min(cursorPosition, text.length);

    // 如果输入变化，触发更新
    if (oldText !== text) {
      this._onInputChange();
    }
  }

  /**
   * 更新光标位置
   */
  setCursorPosition(position: number): void {
    this._cursorPosition = Math.max(0, Math.min(position, this._text.length));
  }

  /**
   * 移动光标
   */
  moveCursorLeft(): number {
    if (this._cursorPosition > 0) {
      this._cursorPosition--;
    }
    return this._cursorPosition;
  }

  moveCursorRight(): number {
    if (this._cursorPosition < this._text.length) {
      this._cursorPosition++;
    }
    return this._cursorPosition;
  }

  // ==================== Input Change Handler ====================

  /**
   * 输入变化时的处理
   * 根据当前输入更新命令建议
   */
  private _onInputChange(): void {
    if (this.hasSlashPrefix) {
      // 更新查询状态
      commandActions.setQuery(this._text);
      // 注意: suggestions 由 cli.ts 在调用此方法后设置
    } else {
      // 清除建议
      commandActions.clear();
    }

    // 通知回调
    this._inputCallback?.(this._text);
  }

  /**
   * 设置建议列表 (由 cli.ts 调用)
   */
  setSuggestions(suggestions: any[]): void {
    commandActions.setSuggestions(suggestions);
  }

  // ==================== Navigation ====================

  /**
   * 导航到上一个建议
   */
  navigateUp(): void {
    commandActions.selectPrev();
  }

  /**
   * 导航到下一个建议
   */
  navigateDown(): void {
    commandActions.selectNext();
  }

  // ==================== Pagination Checks ====================

  /**
   * 检查是否可以上一页
   * 条件: 当前页 > 0
   */
  canPagePrev(): boolean {
    const state = commandStore.getState();
    return state.currentPage > 0;
  }

  /**
   * 检查是否可以下一页
   * 条件: 当前页 < 总页数 - 1
   */
  canPageNext(): boolean {
    const state = commandStore.getState();
    return state.currentPage < state.totalPages - 1;
  }

  // ==================== Cursor Position Checks ====================

  /**
   * 光标是否在文本开头
   */
  isAtStart(): boolean {
    return this._cursorPosition === 0;
  }

  /**
   * 光标是否在文本末尾
   */
  isAtEnd(): boolean {
    return this._cursorPosition === this._text.length;
  }

  /**
   * 光标是否在命令名之后 (slash 后)
   * 用于判断是否可以输入参数
   */
  isAfterCommandName(): boolean {
    if (!this.hasSlashPrefix) return false;
    const parts = this._text.slice(1).split(' ');
    if (parts.length > 1) {
      return true;
    }
    const cmdEnd = this._text.indexOf(' ');
    return cmdEnd !== -1 && this._cursorPosition > cmdEnd;
  }

  // ==================== Conditional Key Handling ====================

  /**
   * 条件化左键处理
   * 返回是否应该进行分页，而不是移动光标
   */
  shouldPageLeft(): boolean {
    const state = commandStore.getState();
    return (
      state.mode === 'suggestions' &&
      this.isAtStart() &&
      this.canPagePrev()
    );
  }

  /**
   * 条件化右键处理
   * 返回是否应该进行分页，而不是移动光标
   */
  shouldPageRight(): boolean {
    const state = commandStore.getState();
    return (
      state.mode === 'suggestions' &&
      this.isAtEnd() &&
      this.canPageNext()
    );
  }

  // ==================== Callbacks ====================

  /**
   * 注册输入变化回调
   */
  onInput(callback: (text: string) => void): void {
    this._inputCallback = callback;
  }

  // ==================== State Subscription ====================

  /**
   * 订阅状态变化
   */
  subscribe(listener: () => void): () => void {
    return commandStore.subscribe(listener);
  }

  // ==================== Utility ====================

  /**
   * 重置控制器状态
   */
  reset(): void {
    this._text = '';
    this._cursorPosition = 0;
    commandActions.clear();
  }

  /**
   * 调试信息
   */
  debug(): string {
    const state = commandStore.getState();
    return JSON.stringify({
      text: this._text,
      cursorPosition: this._cursorPosition,
      mode: state.mode,
      suggestionsCount: state.suggestions.length,
      selectedIndex: state.selectedIndex,
      currentPage: state.currentPage,
      totalPages: state.totalPages,
    }, null, 2);
  }
}

// ==================== Singleton Instance ====================

let instance: CommandInputController | null = null;

/**
 * 获取 CommandInputController 单例
 */
export function getCommandInputController(): CommandInputController {
  if (!instance) {
    instance = new CommandInputController();
  }
  return instance;
}

/**
 * 重置 CommandInputController 单例
 */
export function resetCommandInputController(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}