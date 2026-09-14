/**
 * HintBar Component
 *
 * 对标 Loucode HintBar 组件
 * 底部快捷键提示栏
 */

import { Box, Text } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface HintItem {
  /** 快捷键 */
  key: string;
  /** 描述 */
  label: string;
  /** 是否启用 */
  enabled?: boolean;
}

export interface HintBarProps {
  /** 提示项列表 */
  hints: HintItem[];
  /** 底部消息 */
  message?: string;
  /** 消息颜色 */
  messageColor?: string;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  key: '\x1b[1;33m',       // 黄色
  label: '\x1b[0;37m',      // 白色
  separator: '\x1b[0;90m',  // 灰色
  enabled: '\x1b[1;37m',    // 亮白
  disabled: '\x1b[0;90m',    // 灰色
  message: '\x1b[1;36m',    // 青色
  reset: '\x1b[0m',
};

// ============================================================================
// Component
// ============================================================================

export class HintBar {
  private hints: HintItem[];
  private message: string;
  private messageColor: string;

  constructor(props: HintBarProps) {
    this.hints = props.hints;
    this.message = props.message || '';
    this.messageColor = props.messageColor || THEME.message;
  }

  /**
   * 更新提示项
   */
  updateHints(hints: HintItem[]): void {
    this.hints = hints;
  }

  /**
   * 更新消息
   */
  updateMessage(message: string, color?: string): void {
    this.message = message;
    if (color) this.messageColor = color;
  }

  /**
   * 渲染快捷键提示
   */
  private renderHints(width: number): string {
    const parts: string[] = [];

    for (let i = 0; i < this.hints.length; i++) {
      const hint = this.hints[i];
      const enabled = hint.enabled !== false;

      const keyStr = `${THEME.key}[${hint.key}]${THEME.reset}`;
      const labelStr = enabled
        ? `${THEME.enabled}${hint.label}${THEME.reset}`
        : `${THEME.disabled}${hint.label}${THEME.reset}`;

      parts.push(`${keyStr} ${labelStr}`);

      // 添加分隔符 (除了最后一个)
      if (i < this.hints.length - 1) {
        parts.push(`${THEME.separator}│${THEME.reset}`);
      }
    }

    const hintStr = parts.join(' ');
    return hintStr;
  }

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    const lines: string[] = [];

    // 上边框
    lines.push(`${THEME.separator}┬${'─'.repeat(width - 2)}┬${THEME.reset}`);

    // 消息行
    if (this.message) {
      const msg = this.message.slice(0, width - 4);
      lines.push(`${THEME.separator}│${THEME.reset} ${this.messageColor}${msg.padEnd(width - 4)}${THEME.reset}`);
    }

    // 快捷键提示行
    const hintStr = this.renderHints(width);
    const hintLine = hintStr.slice(0, width - 4).padEnd(width - 4);
    lines.push(`${THEME.separator}│${THEME.reset} ${hintLine}${THEME.separator}│${THEME.reset}`);

    // 下边框
    lines.push(`${THEME.separator}┴${'─'.repeat(width - 2)}┴${THEME.reset}`);

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createHintBar(props: HintBarProps): HintBar {
  return new HintBar(props);
}

// ============================================================================
// Common Hint Sets
// ============================================================================

export const COMMON_HINTS = {
  /** 普通模式 */
  normal: [
    { key: 'Enter', label: '发送', enabled: true },
    { key: 'Esc', label: '中断', enabled: true },
    { key: '↑↓', label: '历史', enabled: true },
    { key: '/', label: '技能', enabled: true },
    { key: 'Ctrl+C', label: '中断', enabled: true },
  ] as HintItem[],

  /** 编辑模式 */
  editing: [
    { key: 'Enter', label: '换行', enabled: true },
    { key: 'Esc', label: '取消编辑', enabled: true },
    { key: 'Ctrl+S', label: '保存', enabled: false },
  ] as HintItem[],

  /** 选择模式 */
  selecting: [
    { key: '↑↓', label: '选择', enabled: true },
    { key: 'Enter', label: '确认', enabled: true },
    { key: 'Esc', label: '取消', enabled: true },
  ] as HintItem[],

  /** 确认模式 */
  confirming: [
    { key: 'y', label: '是', enabled: true },
    { key: 'n', label: '否', enabled: true },
    { key: 'a', label: '全部是', enabled: true },
    { key: 'Esc', label: '取消', enabled: true },
  ] as HintItem[],
};
