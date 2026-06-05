/**
 * Command System Integration Layer
 *
 * Phase 50: 现在使用 input-state 作为统一状态源
 *
 * 提供 cli.ts 与 InputState Store 之间的集成接口
 * 解决循环依赖问题
 */

// Phase 50: Use input-state as unified state source
import { inputStore, inputActions, inputSelectors, type InputState } from './state/input-state.js';
import type { SlashCommand } from '@upup/commands';

// Re-export InputState type
export type { InputState } from './state/input-state.js';

/**
 * 命令系统状态管理
 * Phase 50: 委托给 inputState
 */
export const commandState = {
  // 获取当前状态
  getState() {
    return inputStore.getState();
  },

  // 订阅变化
  subscribe(listener: () => void) {
    return inputStore.subscribe(listener);
  },

  // 更新查询
  setQuery(query: string) {
    inputActions.setQuery(query);
  },

  // 更新建议
  setSuggestions(suggestions: SlashCommand[]) {
    inputActions.setSuggestions(suggestions);
  },

  // 导航
  navigateUp() {
    inputActions.selectPrev();
  },

  navigateDown() {
    inputActions.selectNext();
  },

  // 分页
  nextPage() {
    inputActions.nextPage();
  },

  prevPage() {
    inputActions.prevPage();
  },

  // 选择
  selectIndex(index: number) {
    inputActions.selectIndex(index);
  },

  // 清除
  clear() {
    inputActions.clear();
  },

  // 获取页信息
  getPageInfo() {
    return inputSelectors.getPageInfo();
  },

  // 检查是否可以分页
  canPaginate() {
    return inputSelectors.getPageInfo();
  },

  // 记录使用
  recordUsage(commandName: string) {
    inputActions.recordUsage(commandName);
  },

  // 获取当前页建议
  getCurrentPageSuggestions() {
    return inputSelectors.getCurrentPageSuggestions();
  },
};

/**
 * 获取是否处于建议模式
 */
export function isInSuggestionsMode(): boolean {
  return inputSelectors.isShowingSuggestions();
}

/**
 * 获取当前建议列表
 */
export function getCurrentSuggestions(): SlashCommand[] {
  return inputSelectors.getSuggestions();
}

/**
 * 获取当前选中索引
 */
export function getSelectedIndex(): number {
  return inputSelectors.getSelectedIndex();
}

/**
 * 获取当前页码
 */
export function getCurrentPage(): number {
  return inputSelectors.getPageInfo().current;
}

/**
 * 获取总页数
 */
export function getTotalPages(): number {
  return inputSelectors.getPageInfo().total;
}
