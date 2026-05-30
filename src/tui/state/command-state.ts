/**
 * Command State Store
 *
 * 统一管理命令系统的状态，解决 slashActive 双重状态问题
 * 替代 cli.ts 中的全局变量管理
 */

import { createStore } from './store.js';
import type { SlashCommand } from '@upup/commands';

export interface CommandState {
  // 命令列表
  commands: SlashCommand[];
  // 过滤后的建议
  suggestions: SlashCommand[];
  // 当前选中索引
  selectedIndex: number;
  // 搜索查询
  query: string;
  // 模式
  mode: 'idle' | 'suggestions' | 'executing';
  // 分页
  currentPage: number;
  totalPages: number;
  // 每页大小
  pageSize: number;
  // 使用统计
  usageCount: Map<string, number>;
}

const initialState: CommandState = {
  commands: [],
  suggestions: [],
  selectedIndex: 0,
  query: '',
  mode: 'idle',
  currentPage: 0,
  totalPages: 0,
  pageSize: 10,
  usageCount: new Map(),
};

// 创建命令状态 Store
export const commandStore = createStore<CommandState>(initialState);

// 命令状态动作
export const commandActions = {
  /**
   * 设置查询文本
   */
  setQuery(query: string) {
    commandStore.setState(prev => ({ ...prev, query }));
  },

  /**
   * 设置建议列表
   */
  setSuggestions(suggestions: SlashCommand[]) {
    const state = commandStore.getState();
    const totalPages = Math.ceil(suggestions.length / state.pageSize) || 1;
    commandStore.setState(prev => ({
      ...prev,
      suggestions,
      mode: suggestions.length > 0 ? 'suggestions' : 'idle',
      selectedIndex: 0,
      currentPage: 0,
      totalPages,
    }));
  },

  /**
   * 选择下一个建议
   */
  selectNext() {
    const { suggestions, selectedIndex } = commandStore.getState();
    if (suggestions.length > 0) {
      const newIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
      commandStore.setState(prev => ({ ...prev, selectedIndex: newIndex }));
    }
  },

  /**
   * 选择上一个建议
   */
  selectPrev() {
    const { selectedIndex } = commandStore.getState();
    if (selectedIndex > 0) {
      commandStore.setState(prev => ({ ...prev, selectedIndex: selectedIndex - 1 }));
    }
  },

  /**
   * 跳转到指定索引
   */
  selectIndex(index: number) {
    const { suggestions } = commandStore.getState();
    if (index >= 0 && index < suggestions.length) {
      commandStore.setState(prev => ({ ...prev, selectedIndex: index }));
    }
  },

  /**
   * 设置当前页
   */
  setPage(page: number) {
    const { totalPages } = commandStore.getState();
    if (page >= 0 && page < totalPages) {
      commandStore.setState(prev => ({ ...prev, currentPage: page }));
    }
  },

  /**
   * 下一页
   */
  nextPage() {
    const { currentPage, totalPages } = commandStore.getState();
    if (currentPage < totalPages - 1) {
      commandStore.setState(prev => ({ ...prev, currentPage: currentPage + 1 }));
    }
  },

  /**
   * 上一页
   */
  prevPage() {
    const { currentPage } = commandStore.getState();
    if (currentPage > 0) {
      commandStore.setState(prev => ({ ...prev, currentPage: currentPage - 1 }));
    }
  },

  /**
   * 记录命令使用
   */
  recordUsage(commandName: string) {
    const { usageCount } = commandStore.getState();
    const count = (usageCount.get(commandName) || 0) + 1;
    const newMap = new Map(usageCount);
    newMap.set(commandName, count);
    commandStore.setState(prev => ({ ...prev, usageCount: newMap }));
  },

  /**
   * 获取命令使用次数
   */
  getUsage(commandName: string): number {
    const { usageCount } = commandStore.getState();
    return usageCount.get(commandName) || 0;
  },

  /**
   * 清除所有状态
   */
  clear() {
    commandStore.setState(prev => ({
      ...prev,
      suggestions: [],
      selectedIndex: 0,
      query: '',
      mode: 'idle',
      currentPage: 0,
      totalPages: 0,
    }));
  },

  /**
   * 设置执行模式
   */
  setExecuting(executing: boolean) {
    commandStore.setState(prev => ({
      ...prev,
      mode: executing ? 'executing' : 'idle',
    }));
  },

  /**
   * 设置分页大小
   */
  setPageSize(size: number) {
    const { suggestions } = commandStore.getState();
    const totalPages = Math.ceil(suggestions.length / size) || 1;
    commandStore.setState(prev => ({
      ...prev,
      pageSize: size,
      totalPages,
    }));
  },
};

// 状态选择器
export const commandSelectors = {
  /**
   * 获取当前页的建议
   */
  getCurrentPageSuggestions(): SlashCommand[] {
    const state = commandStore.getState();
    const start = state.currentPage * state.pageSize;
    return state.suggestions.slice(start, start + state.pageSize);
  },

  /**
   * 获取页信息
   */
  getPageInfo() {
    const state = commandStore.getState();
    return {
      current: state.currentPage,
      total: state.totalPages,
      hasNext: state.currentPage < state.totalPages - 1,
      hasPrev: state.currentPage > 0,
    };
  },

  /**
   * 检查是否可以分页
   */
  canPaginate() {
    const state = commandStore.getState();
    return {
      canPrev: state.currentPage > 0,
      canNext: state.currentPage < state.totalPages - 1,
    };
  },

  /**
   * 获取按分类分组的建议
   */
  getGroupedSuggestions(): Map<string, SlashCommand[]> {
    const state = commandStore.getState();
    const groups = new Map<string, SlashCommand[]>();
    for (const cmd of state.suggestions) {
      const category = cmd.category || 'other';
      const existing = groups.get(category) || [];
      existing.push(cmd);
      groups.set(category, existing);
    }
    return groups;
  },
};