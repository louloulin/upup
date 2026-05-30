/**
 * Input State Store (Phase 50: 合并版)
 *
 * 统一管理输入框和命令的状态，解决双 Store 分裂问题
 * Single source of truth for all input-related state
 *
 * 合并了:
 * - input-state.ts (输入状态)
 * - command-state.ts (命令状态)
 *
 * Reference: loucode/src/state/AppStateStore.ts
 */

import { createStore } from './store.js';
import type { SlashCommand } from '@upup/commands';

export interface InputState {
  // ========== 输入状态 ==========
  /** 当前输入文本 */
  text: string;
  /** 光标位置 */
  cursorPosition: number;

  // ========== 建议状态 ==========
  /** 是否显示 slash 命令建议 */
  showingSuggestions: boolean;
  /** 当前建议列表 (完整列表) */
  suggestions: SlashCommand[];
  /** 当前选中的建议索引 */
  selectedIndex: number;

  // ========== 分页状态 ==========
  /** 当前页码 */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 每页大小 */
  pageSize: number;

  // ========== 模式状态 (合并后) ==========
  /** 输入模式 */
  inputMode: 'idle' | 'input' | 'suggestions' | 'history' | 'executing';
  /** 搜索查询 */
  query: string;

  // ========== 使用统计 (从 command-state 合并) ==========
  /** 命令使用频率追踪 */
  usageCount: Map<string, number>;

  // ========== 历史状态 ==========
  /** 输入历史 */
  history: string[];
  /** 历史导航索引 */
  historyIndex: number;
}

// Phase 50: 合并后的初始状态
const initialState: InputState = {
  text: '',
  cursorPosition: 0,
  showingSuggestions: false,
  suggestions: [],
  selectedIndex: 0,
  currentPage: 0,
  totalPages: 0,
  pageSize: 10,
  inputMode: 'idle',
  query: '',
  usageCount: new Map(),
  history: [],
  historyIndex: -1,
};

// 创建输入状态 Store
export const inputStore = createStore<InputState>(initialState);

// 输入状态动作
export const inputActions = {
  /**
   * 设置输入文本
   */
  setText(text: string) {
    inputStore.setState(prev => ({
      ...prev,
      text,
      cursorPosition: Math.min(prev.cursorPosition, text.length),
    }));
  },

  /**
   * 设置光标位置
   */
  setCursorPosition(position: number) {
    inputStore.setState(prev => ({
      ...prev,
      cursorPosition: Math.max(0, Math.min(position, prev.text.length)),
    }));
  },

  /**
   * 移动光标
   */
  moveCursor(delta: number) {
    inputStore.setState(prev => ({
      ...prev,
      cursorPosition: Math.max(0, Math.min(prev.cursorPosition + delta, prev.text.length)),
    }));
  },

  /**
   * 设置建议列表
   */
  setSuggestions(suggestions: InputState['suggestions']) {
    inputStore.setState(prev => {
      const totalPages = Math.max(1, Math.ceil(suggestions.length / prev.pageSize));
      return {
        ...prev,
        suggestions,
        showingSuggestions: suggestions.length > 0,
        selectedIndex: 0,
        currentPage: 0,
        totalPages,
      };
    });
  },

  /**
   * 显示建议
   */
  showSuggestions(suggestions: InputState['suggestions']) {
    this.setSuggestions(suggestions);
  },

  /**
   * 隐藏建议
   */
  hideSuggestions() {
    inputStore.setState(prev => ({
      ...prev,
      suggestions: [],
      showingSuggestions: false,
      selectedIndex: 0,
      currentPage: 0,
      totalPages: 0,
    }));
  },

  /**
   * 选择下一个建议
   */
  selectNext() {
    inputStore.setState(prev => {
      if (prev.suggestions.length === 0) return prev;
      const newIndex = Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1);
      const newPage = Math.floor(newIndex / prev.pageSize);
      return {
        ...prev,
        selectedIndex: newIndex,
        currentPage: newPage,
      };
    });
  },

  /**
   * 选择上一个建议
   */
  selectPrev() {
    inputStore.setState(prev => {
      if (prev.suggestions.length === 0) return prev;
      const newIndex = Math.max(prev.selectedIndex - 1, 0);
      const newPage = Math.floor(newIndex / prev.pageSize);
      return {
        ...prev,
        selectedIndex: newIndex,
        currentPage: newPage,
      };
    });
  },

  /**
   * 跳转到指定索引
   */
  selectIndex(index: number) {
    inputStore.setState(prev => {
      if (index < 0 || index >= prev.suggestions.length) return prev;
      const newPage = Math.floor(index / prev.pageSize);
      return {
        ...prev,
        selectedIndex: index,
        currentPage: newPage,
      };
    });
  },

  /**
   * 下一页
   */
  nextPage() {
    inputStore.setState(prev => {
      if (prev.currentPage >= prev.totalPages - 1) return prev;
      return {
        ...prev,
        currentPage: prev.currentPage + 1,
        selectedIndex: (prev.currentPage + 1) * prev.pageSize,
      };
    });
  },

  /**
   * 上一页
   */
  prevPage() {
    inputStore.setState(prev => {
      if (prev.currentPage <= 0) return prev;
      const newPage = prev.currentPage - 1;
      return {
        ...prev,
        currentPage: newPage,
        selectedIndex: newPage * prev.pageSize,
      };
    });
  },

  /**
   * 移动光标到左边
   * 返回是否成功移动
   */
  moveCursorLeft(): boolean {
    const state = inputStore.getState();
    if (state.cursorPosition > 0) {
      inputStore.setState(prev => ({
        ...prev,
        cursorPosition: prev.cursorPosition - 1,
      }));
      return true;
    }
    return false;
  },

  /**
   * 移动光标到右边
   * 返回是否成功移动
   */
  moveCursorRight(): boolean {
    const state = inputStore.getState();
    if (state.cursorPosition < state.text.length) {
      inputStore.setState(prev => ({
        ...prev,
        cursorPosition: prev.cursorPosition + 1,
      }));
      return true;
    }
    return false;
  },

  /**
   * 光标是否在文本开头
   */
  isCursorAtStart(): boolean {
    return inputStore.getState().cursorPosition === 0;
  },

  /**
   * 光标是否在文本末尾
   */
  isCursorAtEnd(): boolean {
    const state = inputStore.getState();
    return state.cursorPosition === state.text.length;
  },

  /**
   * 获取光标前后文本
   */
  getTextAroundCursor(): { before: string; after: string } {
    const state = inputStore.getState();
    return {
      before: state.text.slice(0, state.cursorPosition),
      after: state.text.slice(state.cursorPosition),
    };
  },

  /**
   * 设置页码
   */
  setPage(page: number) {
    inputStore.setState(prev => {
      if (page < 0 || page >= prev.totalPages) return prev;
      return {
        ...prev,
        currentPage: page,
        selectedIndex: page * prev.pageSize,
      };
    });
  },

  /**
   * 获取当前页的建议
   */
  getCurrentPageSuggestions(): InputState['suggestions'] {
    const state = inputStore.getState();
    const start = state.currentPage * state.pageSize;
    return state.suggestions.slice(start, start + state.pageSize);
  },

  /**
   * 检查是否可以分页
   */
  canPaginate(): { canPrev: boolean; canNext: boolean } {
    const state = inputStore.getState();
    return {
      canPrev: state.currentPage > 0,
      canNext: state.currentPage < state.totalPages - 1,
    };
  },

  /**
   * 获取当前选中的建议
   */
  getSelectedSuggestion(): InputState['suggestions'][0] | undefined {
    const state = inputStore.getState();
    return state.suggestions[state.selectedIndex];
  },

  /**
   * 更新 slash 状态
   * 当输入变化时自动调用
   */
  updateSlashState() {
    const state = inputStore.getState();
    const hasSlash = state.text.startsWith('/');

    if (hasSlash !== state.showingSuggestions) {
      inputStore.setState(prev => ({
        ...prev,
        showingSuggestions: hasSlash,
      }));
    }
  },

  /**
   * 清除建议列表状态 (保留文本和光标)
   */
  clearSuggestions() {
    inputStore.setState(prev => ({
      ...prev,
      suggestions: [],
      showingSuggestions: false,
      selectedIndex: 0,
      currentPage: 0,
      totalPages: 0,
      query: '',
    }));
  },

  /**
   * 清除所有状态
   */
  clear() {
    inputStore.setState(() => ({ ...initialState }));
  },

  /**
   * 重置到初始状态 (但保留 text)
   */
  reset() {
    inputStore.setState(prev => ({
      ...initialState,
      text: prev.text,
      usageCount: prev.usageCount, // 保留使用统计
      history: prev.history, // 保留历史
    }));
  },

  // ========== 合并后的命令状态操作 ==========

  /**
   * 设置模式 (从 command-state 合并)
   */
  setMode(mode: InputState['inputMode']) {
    inputStore.setState(prev => ({ ...prev, inputMode: mode }));
  },

  /**
   * 设置查询 (从 command-state 合并)
   */
  setQuery(query: string) {
    inputStore.setState(prev => ({ ...prev, query }));
  },

  /**
   * 记录命令使用 (从 command-state 合并)
   */
  recordUsage(commandName: string) {
    inputStore.setState(prev => {
      const count = (prev.usageCount.get(commandName) || 0) + 1;
      const newMap = new Map(prev.usageCount);
      newMap.set(commandName, count);
      return { ...prev, usageCount: newMap };
    });
  },

  /**
   * 获取命令使用次数 (从 command-state 合并)
   */
  getUsage(commandName: string): number {
    const state = inputStore.getState();
    return state.usageCount.get(commandName) || 0;
  },

  // ========== 历史状态操作 ==========

  /**
   * 添加到历史
   */
  addToHistory(text: string) {
    inputStore.setState(prev => {
      const history = [text, ...prev.history.filter(t => t !== text)].slice(0, 100);
      return { ...prev, history, historyIndex: -1 };
    });
  },

  /**
   * 历史导航 - 上一条
   */
  historyUp(): string | null {
    const state = inputStore.getState();
    if (state.history.length === 0) return null;
    const newIndex = Math.min(state.historyIndex + 1, state.history.length - 1);
    inputStore.setState(prev => ({ ...prev, historyIndex: newIndex }));
    return state.history[newIndex] || null;
  },

  /**
   * 历史导航 - 下一条
   */
  historyDown(): string | null {
    const state = inputStore.getState();
    if (state.history.length === 0) return null;
    const newIndex = Math.max(state.historyIndex - 1, -1);
    inputStore.setState(prev => ({ ...prev, historyIndex: newIndex }));
    if (newIndex === -1) return '';
    return state.history[newIndex] || null;
  },

  /**
   * 重置历史导航
   */
  resetHistoryNavigation() {
    inputStore.setState(prev => ({ ...prev, historyIndex: -1 }));
  },
};

// 便捷选择器
export const inputSelectors = {
  /**
   * 获取显示状态
   */
  isShowingSuggestions(): boolean {
    return inputStore.getState().showingSuggestions;
  },

  /**
   * 获取当前文本
   */
  getText(): string {
    return inputStore.getState().text;
  },

  /**
   * 获取光标位置
   */
  getCursorPosition(): number {
    return inputStore.getState().cursorPosition;
  },

  /**
   * 获取当前建议
   */
  getSuggestions(): InputState['suggestions'] {
    return inputStore.getState().suggestions;
  },

  /**
   * 获取选中的索引
   */
  getSelectedIndex(): number {
    return inputStore.getState().selectedIndex;
  },

  /**
   * 获取页信息
   */
  getPageInfo(): { current: number; total: number; canPrev: boolean; canNext: boolean } {
    const state = inputStore.getState();
    return {
      current: state.currentPage,
      total: state.totalPages,
      canPrev: state.currentPage > 0,
      canNext: state.currentPage < state.totalPages - 1,
    };
  },

  /**
   * 光标是否在文本开头
   */
  isCursorAtStart(): boolean {
    return inputStore.getState().cursorPosition === 0;
  },

  /**
   * 光标是否在文本末尾
   */
  isCursorAtEnd(): boolean {
    const state = inputStore.getState();
    return state.cursorPosition === state.text.length;
  },

  /**
   * 获取当前选中的建议
   */
  getSelectedSuggestion(): InputState['suggestions'][0] | undefined {
    const state = inputStore.getState();
    return state.suggestions[state.selectedIndex];
  },

  // ========== 合并后的新选择器 ==========

  /**
   * 获取模式
   */
  getMode(): InputState['inputMode'] {
    return inputStore.getState().inputMode;
  },

  /**
   * 检查是否为 suggestions 模式
   */
  isInSuggestionsMode(): boolean {
    return inputStore.getState().inputMode === 'suggestions';
  },

  /**
   * 检查是否为 executing 模式
   */
  isExecuting(): boolean {
    return inputStore.getState().inputMode === 'executing';
  },

  /**
   * 获取按分类分组的建议
   */
  getGroupedSuggestions(): Map<string, SlashCommand[]> {
    const state = inputStore.getState();
    const groups = new Map<string, SlashCommand[]>();
    for (const cmd of state.suggestions) {
      const category = cmd.category || 'other';
      const existing = groups.get(category) || [];
      existing.push(cmd);
      groups.set(category, existing);
    }
    return groups;
  },

  /**
   * 获取当前页的建议
   */
  getCurrentPageSuggestions(): SlashCommand[] {
    const state = inputStore.getState();
    const start = state.currentPage * state.pageSize;
    return state.suggestions.slice(start, start + state.pageSize);
  },

  /**
   * 获取历史
   */
  getHistory(): string[] {
    return inputStore.getState().history;
  },
};
