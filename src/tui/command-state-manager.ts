/**
 * Command System Integration Layer
 *
 * 提供 cli.ts 与 CommandState Store 之间的集成接口
 * 解决循环依赖问题
 */

import { commandStore, commandActions, commandSelectors, type CommandState } from './state/command-state.js';
import type { SlashCommand } from '@upup/commands';

// Re-export types
export type { CommandState } from './state/command-state.js';

/**
 * 命令系统状态管理
 */
export const commandState = {
  // 获取当前状态
  getState() {
    return commandStore.getState();
  },

  // 订阅变化
  subscribe(listener: () => void) {
    return commandStore.subscribe(listener);
  },

  // 更新查询
  setQuery(query: string) {
    commandActions.setQuery(query);
  },

  // 更新建议
  setSuggestions(suggestions: SlashCommand[]) {
    commandActions.setSuggestions(suggestions);
  },

  // 导航
  navigateUp() {
    commandActions.selectPrev();
  },

  navigateDown() {
    commandActions.selectNext();
  },

  // 分页
  nextPage() {
    commandActions.nextPage();
  },

  prevPage() {
    commandActions.prevPage();
  },

  // 选择
  selectIndex(index: number) {
    commandActions.selectIndex(index);
  },

  // 清除
  clear() {
    commandActions.clear();
  },

  // 获取页信息
  getPageInfo() {
    return commandSelectors.getPageInfo();
  },

  // 检查是否可以分页
  canPaginate() {
    return commandSelectors.canPaginate();
  },

  // 记录使用
  recordUsage(commandName: string) {
    commandActions.recordUsage(commandName);
  },

  // 获取当前页建议
  getCurrentPageSuggestions() {
    return commandSelectors.getCurrentPageSuggestions();
  },
};

/**
 * 获取是否处于建议模式
 */
export function isInSuggestionsMode(): boolean {
  return commandStore.getState().mode === 'suggestions';
}

/**
 * 获取当前建议列表
 */
export function getCurrentSuggestions(): SlashCommand[] {
  return commandStore.getState().suggestions;
}

/**
 * 获取当前选中索引
 */
export function getSelectedIndex(): number {
  return commandStore.getState().selectedIndex;
}

/**
 * 获取当前页码
 */
export function getCurrentPage(): number {
  return commandStore.getState().currentPage;
}

/**
 * 获取总页数
 */
export function getTotalPages(): number {
  return commandStore.getState().totalPages;
}