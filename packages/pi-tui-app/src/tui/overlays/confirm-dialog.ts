/**
 * ConfirmDialog Component
 *
 * 对标 Loucode ConfirmDialog
 * 通用确认对话框
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export type ConfirmDialogType = 'info' | 'warning' | 'error' | 'success';

export interface ConfirmDialogProps {
  /** 对话框标题 */
  title: string;
  /** 对话框内容 */
  message: string;
  /** 类型 */
  type?: ConfirmDialogType;
  /** 确认按钮文字 */
  confirmLabel?: string;
  /** 取消按钮文字 */
  cancelLabel?: string;
  /** 是否可见 */
  visible: boolean;
  /** 默认聚焦: 'confirm' | 'cancel' */
  defaultFocus?: 'confirm' | 'cancel';
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEMES: Record<ConfirmDialogType, {
  border: string;
  icon: string;
  title: string;
  confirmButton: string;
}> = {
  info: {
    border: '\x1b[1;36m',      // 青色
    icon: '💬',
    title: '\x1b[1;36m',
    confirmButton: '\x1b[1;32m',
  },
  warning: {
    border: '\x1b[1;33m',      // 黄色
    icon: '⚠️',
    title: '\x1b[1;33m',
    confirmButton: '\x1b[1;33m',
  },
  error: {
    border: '\x1b[1;31m',      // 红色
    icon: '❌',
    title: '\x1b[1;31m',
    confirmButton: '\x1b[1;31m',
  },
  success: {
    border: '\x1b[1;32m',      // 绿色
    icon: '✅',
    title: '\x1b[1;32m',
    confirmButton: '\x1b[1;32m',
  },
};

const COMMON_THEME = {
  message: '\x1b[0;37m',         // 白色消息
  buttonKey: '\x1b[0;90m',       // 灰色按键
  buttonLabel: '\x1b[1;37m',     // 白色标签
  focused: '\x1b[1;4m',          // 下划线
  reset: '\x1b[0m',
};

// ============================================================================
// Component
// ============================================================================

export class ConfirmDialog {
  private title: string;
  private message: string;
  private type: ConfirmDialogType;
  private confirmLabel: string;
  private cancelLabel: string;
  private visible: boolean;
  private defaultFocus: 'confirm' | 'cancel';
  private focusedButton: 'confirm' | 'cancel';

  private onConfirm: () => void;
  private onCancel: () => void;

  constructor(props: ConfirmDialogProps) {
    this.title = props.title;
    this.message = props.message;
    this.type = props.type || 'info';
    this.confirmLabel = props.confirmLabel || 'Confirm';
    this.cancelLabel = props.cancelLabel || 'Cancel';
    this.visible = props.visible;
    this.defaultFocus = props.defaultFocus || 'confirm';
    this.focusedButton = this.defaultFocus;
    this.onConfirm = props.onConfirm;
    this.onCancel = props.onCancel;
  }

  /**
   * 更新内容
   */
  update(title: string, message: string, type?: ConfirmDialogType): void {
    this.title = title;
    this.message = message;
    if (type) this.type = type;
  }

  /**
   * 设置可见性
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.focusedButton = this.defaultFocus;
    }
  }

  /**
   * 处理输入
   */
  handleInput(data: string): void {
    if (!this.visible) return;

    // Tab - 切换焦点
    if (matchesKey(data, Key.tab)) {
      this.focusedButton = this.focusedButton === 'confirm' ? 'cancel' : 'confirm';
      return;
    }

    // 左右方向键切换
    if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
      this.focusedButton = this.focusedButton === 'confirm' ? 'cancel' : 'confirm';
      return;
    }

    // Enter - 确认
    if (matchesKey(data, Key.enter)) {
      if (this.focusedButton === 'confirm') {
        this.onConfirm();
      } else {
        this.onCancel();
      }
      return;
    }

    // Escape - 取消
    if (matchesKey(data, Key.escape)) {
      this.onCancel();
      return;
    }

    // y - 确认 (yes)
    if (data === 'y' || data === 'Y') {
      this.onConfirm();
      return;
    }

    // n - 取消 (no)
    if (data === 'n' || data === 'N') {
      this.onCancel();
      return;
    }
  }

  /**
   * 渲染按钮
   */
  private renderButton(label: string, key: string, focused: boolean): string {
    const keyStr = `${COMMON_THEME.buttonKey}[${key}]${COMMON_THEME.reset}`;
    const focusMark = focused ? COMMON_THEME.focused : '';
    const labelStr = `${COMMON_THEME.buttonLabel}${label}${COMMON_THEME.reset}`;
    return `${keyStr} ${focusMark}${labelStr}${COMMON_THEME.reset}`;
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }

  /**
   * 自动换行
   */
  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    const words = text.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  }

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    if (!this.visible) {
      return [];
    }

    const theme = THEMES[this.type];
    const lines: string[] = [];
    const innerWidth = Math.min(width, 50);
    const padding = Math.floor((width - innerWidth) / 2);

    // 计算内容宽度
    const contentWidth = innerWidth - 6;

    // 准备消息行
    const messageLines = this.wrapText(this.message, contentWidth);
    const titleLine = `${theme.icon} ${this.title}`;
    const dialogHeight = 5 + messageLines.length; // 边框 + 标题 + 空行 + 消息 + 空行 + 按钮 + 底部

    // 上边框
    lines.push(' '.repeat(padding) + `${theme.border}┌${'─'.repeat(innerWidth - 2)}┐${COMMON_THEME.reset}`);

    // 标题
    const titlePadding = innerWidth - 4 - this.truncate(titleLine, contentWidth).length;
    lines.push(' '.repeat(padding) + `${theme.border}│${COMMON_THEME.reset} ${theme.title}${this.truncate(titleLine, contentWidth)}${' '.repeat(Math.max(0, titlePadding))}${theme.border}│${COMMON_THEME.reset}`);

    // 分隔线
    lines.push(' '.repeat(padding) + `${theme.border}├${'─'.repeat(innerWidth - 2)}┤${COMMON_THEME.reset}`);

    // 消息
    if (messageLines.length > 0) {
      for (const msgLine of messageLines) {
        const msgPadding = innerWidth - 4 - msgLine.length;
        lines.push(' '.repeat(padding) + `${theme.border}│${COMMON_THEME.reset} ${COMMON_THEME.message}${msgLine}${' '.repeat(Math.max(0, msgPadding))}${theme.border}│${COMMON_THEME.reset}`);
      }

      // 空行
      lines.push(' '.repeat(padding) + `${theme.border}│${COMMON_THEME.reset}${' '.repeat(innerWidth - 2)}${theme.border}│${COMMON_THEME.reset}`);
    }

    // 按钮
    const confirmBtn = this.renderButton(this.confirmLabel, 'Enter', this.focusedButton === 'confirm');
    const cancelBtn = this.renderButton(this.cancelLabel, 'Esc', this.focusedButton === 'cancel');
    const buttonsLine = `${confirmBtn}  ${cancelBtn}`;

    const buttonPadding = innerWidth - 4 - buttonsLine.length;
    lines.push(' '.repeat(padding) + `${theme.border}│${COMMON_THEME.reset} ${buttonsLine}${' '.repeat(Math.max(0, buttonPadding))}${theme.border}│${COMMON_THEME.reset}`);

    // 底部边框
    lines.push(' '.repeat(padding) + `${theme.border}└${'─'.repeat(innerWidth - 2)}┘${COMMON_THEME.reset}`);

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createConfirmDialog(props: ConfirmDialogProps): ConfirmDialog {
  return new ConfirmDialog(props);
}

// ============================================================================
// Preset Dialogs
// ============================================================================

/**
 * 创建确认退出对话框
 */
export function createExitConfirmDialog(
  onConfirm: () => void,
  onCancel: () => void
): ConfirmDialog {
  return createConfirmDialog({
    title: 'Exit Confirmation',
    message: 'Are you sure you want to exit? Any unsaved changes will be lost.',
    type: 'warning',
    confirmLabel: 'Exit',
    cancelLabel: 'Cancel',
    visible: true,
    defaultFocus: 'cancel',
    onConfirm,
    onCancel,
  });
}

/**
 * 创建清除历史对话框
 */
export function createClearHistoryDialog(
  onConfirm: () => void,
  onCancel: () => void
): ConfirmDialog {
  return createConfirmDialog({
    title: 'Clear History',
    message: 'Are you sure you want to clear all session history? This action cannot be undone.',
    type: 'error',
    confirmLabel: 'Clear',
    cancelLabel: 'Keep',
    visible: true,
    defaultFocus: 'cancel',
    onConfirm,
    onCancel,
  });
}
