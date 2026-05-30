/**
 * useSlashInput Hook
 *
 * 统一管理 slash 命令输入的键盘处理
 * 参考 Claude Code 的 useTextInput.ts 设计
 *
 * 功能:
 * - Slash 命令激活/停用
 * - 建议导航 (上下键)
 * - 分页导航 (左右键在边界)
 * - 建议选择 (Tab/Enter)
 * - 建议关闭 (Esc)
 *
 * Reference: loucode/src/hooks/useTextInput.ts
 */

import { Key, matchesKey } from '@earendil-works/pi-tui';
import { inputStore, inputActions, inputSelectors } from '../state/input-state.js';
import { getCliCommands } from '../../commands/unified-registry.js';

export interface UseSlashInputOptions {
  /** 建议选择回调 */
  onSelect?: (command: { name: string; description: string }) => void;
  /** 建议关闭回调 */
  onDismiss?: () => void;
  /** 分页回调 */
  onPage?: (direction: 'next' | 'prev') => void;
  /** 最大建议数 */
  maxSuggestions?: number;
}

export interface UseSlashInputResult {
  /** 处理输入 */
  handleInput: (data: string) => boolean;
  /** 是否显示建议 */
  isShowing: () => boolean;
  /** 获取当前建议 */
  getSuggestions: () => { name: string; description: string; category?: string }[];
  /** 获取选中索引 */
  getSelectedIndex: () => number;
  /** 清除所有 */
  clear: () => void;
}

/**
 * 创建 slash 输入处理 Hook
 */
export function useSlashInput(options: UseSlashInputOptions = {}): UseSlashInputResult {
  const {
    onSelect,
    onDismiss,
    onPage,
    maxSuggestions = 10,
  } = options;

  /**
   * 处理输入
   * 返回 true 表示已处理，false 表示继续默认处理
   */
  function handleInput(data: string): boolean {
    const showing = inputSelectors.isShowingSuggestions();

    // Escape: 关闭建议
    if (matchesKey(data, Key.escape)) {
      if (showing) {
        inputActions.hideSuggestions();
        onDismiss?.();
        return true;
      }
      return false;
    }

    // Up: 选择上一个
    if (matchesKey(data, Key.up)) {
      if (showing) {
        inputActions.selectPrev();
        return true;
      }
      return false;
    }

    // Down: 选择下一个
    if (matchesKey(data, Key.down)) {
      if (showing) {
        inputActions.selectNext();
        return true;
      }
      return false;
    }

    // Left: 上一页 或 光标左移
    if (matchesKey(data, Key.left)) {
      if (showing) {
        const pageInfo = inputSelectors.getPageInfo();
        if (pageInfo.canPrev && inputSelectors.isCursorAtStart()) {
          inputActions.prevPage();
          onPage?.('prev');
          return true;
        }
        // 光标左移
        inputActions.moveCursorLeft();
        return false;
      }
      return false;
    }

    // Right: 下一页 或 光标右移
    if (matchesKey(data, Key.right)) {
      if (showing) {
        const pageInfo = inputSelectors.getPageInfo();
        if (pageInfo.canNext && inputSelectors.isCursorAtEnd()) {
          inputActions.nextPage();
          onPage?.('next');
          return true;
        }
        // 光标右移
        inputActions.moveCursorRight();
        return false;
      }
      return false;
    }

    // Tab: 选择当前建议
    if (matchesKey(data, Key.tab)) {
      if (showing) {
        const selected = inputSelectors.getSelectedSuggestion();
        if (selected) {
          onSelect?.(selected);
          return true;
        }
      }
      return false;
    }

    // Enter: 选择当前建议
    if (matchesKey(data, Key.return)) {
      if (showing) {
        const selected = inputSelectors.getSelectedSuggestion();
        if (selected) {
          onSelect?.(selected);
          return true;
        }
      }
      return false;
    }

    // 字符输入: 更新建议列表
    if (data.length === 1 && data >= ' ') {
      const text = inputSelectors.getText();
      // 更新建议列表
      const suggestions = getCliCommands(text);
      inputActions.setSuggestions(
        suggestions.slice(0, maxSuggestions).map(s => ({
          name: s.name,
          description: s.description,
          category: s.category,
        }))
      );
      return false;
    }

    // 其他按键继续默认处理
    return false;
  }

  return {
    handleInput,
    isShowing: inputSelectors.isShowingSuggestions,
    getSuggestions: inputSelectors.getSuggestions,
    getSelectedIndex: inputSelectors.getSelectedIndex,
    clear: inputActions.clear,
  };
}

/**
 * useDoublePress Hook
 *
 * 双击检测
 * 参考 Claude Code 的 useDoublePress.ts
 */
export function useDoublePress(
  onFirstPress: (show: boolean) => void,
  onSecondPress: () => void,
  timeout: number = 500,
): () => void {
  let lastPressTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function handlePress() {
    const now = Date.now();

    if (now - lastPressTime < timeout) {
      // 双击
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastPressTime = 0;
      onSecondPress();
    } else {
      // 第一次点击
      lastPressTime = now;
      onFirstPress(true);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        timeoutId = null;
        lastPressTime = 0;
        onFirstPress(false);
      }, timeout);
    }
  };
}
