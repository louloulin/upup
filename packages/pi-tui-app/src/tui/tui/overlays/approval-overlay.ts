/**
 * ApprovalOverlay Component
 *
 * 对标 Loucode ApprovalOverlay
 * 工具执行授权确认浮层
 * 使用 pi-tui TUI.showOverlay API 实现居中显示
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';
import type { Component, OverlayHandle } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface ApprovalRequest {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  description?: string;
}

export interface ApprovalOverlayProps {
  /** 授权请求 */
  request: ApprovalRequest | null;
  /** 是否可见 */
  visible: boolean;
  /** 确认回调 */
  onApprove: (id: string) => void;
  /** 拒绝回调 */
  onDeny: (id: string) => void;
  /** 全部允许回调 */
  onApproveAll: (id: string) => void;
  /** 全部拒绝回调 */
  onDenyAll: (id: string) => void;
  /** 关闭回调 */
  onClose: () => void;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  border: '\x1b[1;36m',        // 青色边框
  title: '\x1b[1;37m',          // 白色标题
  tool: '\x1b[1;33m',           // 黄色工具名
  param: '\x1b[0;37m',         // 白色参数
  value: '\x1b[0;36m',           // 青色值
  buttonApprove: '\x1b[1;32m',   // 绿色确认
  buttonDeny: '\x1b[1;31m',     // 红色拒绝
  buttonApproveAll: '\x1b[1;33m', // 黄色全部
  buttonDenyAll: '\x1b[1;35m',  // 紫色全部
  buttonCancel: '\x1b[0;90m',   // 灰色取消
  focused: '\x1b[1;4m',         // 下划线
  reset: '\x1b[0m',
};

// ============================================================================
// ApprovalContent - 浮层内容组件 (实现 Component 接口)
// ============================================================================

class ApprovalContent implements Component {
  private overlay: ApprovalOverlay;

  constructor(overlay: ApprovalOverlay) {
    this.overlay = overlay;
  }

  render(width: number): string[] {
    return this.overlay.renderContent(width);
  }

  handleInput(data: string): void {
    this.overlay.handleInputInternal(data);
  }

  invalidate(): void {
    // no-op for content component
  }
}

// ============================================================================
// ApprovalOverlay - 使用 pi-tui Overlay 系统
// ============================================================================

export class ApprovalOverlay implements Component {
  private request: ApprovalRequest | null;
  private visible: boolean;
  private focusedIndex: number = 0;
  private selectedOption: 'approve' | 'deny' | 'approve-all' | 'deny-all' | 'cancel' = 'approve';

  // pi-tui Overlay 句柄
  private overlayHandle: OverlayHandle | null = null;
  private contentComponent: ApprovalContent | null = null;

  private onApprove: (id: string) => void;
  private onDeny: (id: string) => void;
  private onApproveAll: (id: string) => void;
  private onDenyAll: (id: string) => void;
  private onClose: () => void;

  constructor(props: ApprovalOverlayProps) {
    this.request = props.request;
    this.visible = props.visible;
    this.onApprove = props.onApprove;
    this.onDeny = props.onDeny;
    this.onApproveAll = props.onApproveAll;
    this.onDenyAll = props.onDenyAll;
    this.onClose = props.onClose;

    // 创建内容组件
    this.contentComponent = new ApprovalContent(this);
  }

  /**
   * 显示浮层
   */
  showOverlay(tui: { showOverlay: (component: Component, options?: object) => OverlayHandle }): void {
    if (this.overlayHandle) return;

    this.visible = true;
    this.overlayHandle = tui.showOverlay(this.contentComponent!, {
      anchor: 'center',
      width: 60,
      maxHeight: '80%',
    });
  }

  /**
   * 隐藏浮层
   */
  hideOverlay(): void {
    if (this.overlayHandle) {
      this.overlayHandle.hide();
      this.overlayHandle = null;
    }
    this.visible = false;
  }

  /**
   * 更新请求
   */
  updateRequest(request: ApprovalRequest | null): void {
    this.request = request;
    this.focusedIndex = 0;
    this.selectedOption = 'approve';
  }

  /**
   * 设置可见性
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.focusedIndex = 0;
      this.selectedOption = 'approve';
    }
  }

  /**
   * 获取当前选项
   */
  getSelectedOption(): string {
    return this.selectedOption;
  }

  /**
   * 处理输入 (由 TUI 调用)
   */
  handleInput(data: string): void {
    this.handleInputInternal(data);
  }

  /**
   * 内部输入处理
   */
  handleInputInternal(data: string): void {
    if (!this.visible) return;

    // 方向键导航
    if (matchesKey(data, Key.left) || matchesKey(data, Key.up)) {
      this.focusedIndex = Math.max(0, this.focusedIndex - 1);
      this.updateSelectedOption();
      return;
    }

    if (matchesKey(data, Key.right) || matchesKey(data, Key.down)) {
      this.focusedIndex = Math.min(4, this.focusedIndex + 1);
      this.updateSelectedOption();
      return;
    }

    // 快捷键
    if (data === 'y' || data === 'Y' || matchesKey(data, Key.enter)) {
      this.executeSelected();
      return;
    }

    if (data === 'n' || data === 'N' || matchesKey(data, Key.escape)) {
      if (this.request) {
        this.onDeny(this.request.id);
      }
      this.hideOverlay();
      this.onClose();
      return;
    }

    // a = approve-all, q = deny-all
    if (data === 'a' || data === 'A') {
      if (this.request) {
        this.onApproveAll(this.request.id);
      }
      this.hideOverlay();
      this.onClose();
      return;
    }

    if (data === 'q' || data === 'Q') {
      if (this.request) {
        this.onDenyAll(this.request.id);
      }
      this.hideOverlay();
      this.onClose();
      return;
    }
  }

  /**
   * 更新选中选项
   */
  private updateSelectedOption(): void {
    const options: Array<typeof this.selectedOption> = ['approve', 'deny', 'approve-all', 'deny-all', 'cancel'];
    this.selectedOption = options[this.focusedIndex];
  }

  /**
   * 执行选中操作
   */
  private executeSelected(): void {
    if (!this.request) return;

    switch (this.selectedOption) {
      case 'approve':
        this.onApprove(this.request.id);
        break;
      case 'deny':
        this.onDeny(this.request.id);
        break;
      case 'approve-all':
        this.onApproveAll(this.request.id);
        break;
      case 'deny-all':
        this.onDenyAll(this.request.id);
        break;
      case 'cancel':
        this.hideOverlay();
        this.onClose();
        return;
    }
    this.hideOverlay();
    this.onClose();
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }

  /**
   * 格式化参数值
   */
  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return this.truncate(value, 50);
    }
    if (typeof value === 'object') {
      return this.truncate(JSON.stringify(value), 50);
    }
    return String(value);
  }

  /**
   * 渲染按钮
   */
  private renderButton(label: string, key: string, selected: boolean): string {
    const color = selected ? THEME.focused : '';
    const keyStr = `${THEME.buttonCancel}[${key}]${THEME.reset}`;
    const labelStr = `${THEME.title}${label}${THEME.reset}`;
    return `${keyStr} ${color}${labelStr}${THEME.reset}`;
  }

  /**
   * 渲染内容 (由 ApprovalContent 调用)
   */
  renderContent(width: number): string[] {
    if (!this.visible || !this.request) {
      return [];
    }

    const lines: string[] = [];
    const innerWidth = Math.min(width, 60);
    const padding = Math.floor((width - innerWidth) / 2);

    // 标题
    lines.push(' '.repeat(padding) + `${THEME.border}┌${'─'.repeat(innerWidth - 2)}┐${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset} ${THEME.title}🔒 Tool Authorization Request${THEME.reset}${' '.repeat(Math.max(0, innerWidth - 30))}${THEME.border}│${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}`);

    // 工具名称
    const toolName = `${THEME.tool}${this.request.tool}${THEME.reset}`;
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}   Tool: ${toolName}${' '.repeat(Math.max(0, innerWidth - 20 - this.request.tool.length))}${THEME.border}│${THEME.reset}`);

    // 描述
    if (this.request.description) {
      const desc = this.truncate(this.request.description, innerWidth - 10);
      lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}   ${THEME.param}${desc}${THEME.reset}${' '.repeat(Math.max(0, innerWidth - 6 - desc.length))}${THEME.border}│${THEME.reset}`);
    }

    // 参数
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}   ${THEME.param}Parameters:${THEME.reset}`);
    for (const [key, value] of Object.entries(this.request.params).slice(0, 5)) {
      const k = this.truncate(key, 15);
      const v = this.formatValue(value);
      lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}     ${THEME.param}${k}${THEME.reset}: ${THEME.value}${v}${THEME.reset}${' '.repeat(Math.max(0, innerWidth - 10 - k.length - v.length))}${THEME.border}│${THEME.reset}`);
    }

    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}`);

    // 操作按钮
    const options = [
      { label: 'Approve', key: 'y', value: 'approve' as const },
      { label: 'Deny', key: 'n', value: 'deny' as const },
      { label: 'Approve All', key: 'a', value: 'approve-all' as const },
      { label: 'Deny All', key: 'q', value: 'deny-all' as const },
      { label: 'Cancel', key: 'Esc', value: 'cancel' as const },
    ];

    const buttons: string[] = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const selected = this.focusedIndex === i;
      buttons.push(this.renderButton(opt.label, opt.key, selected));
    }

    const buttonLine = buttons.join('  ');
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}   ${buttonLine}${' '.repeat(Math.max(0, innerWidth - 4 - buttonLine.length))}${THEME.border}│${THEME.reset}`);

    // 底部
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}└${'─'.repeat(innerWidth - 2)}┘${THEME.reset}`);

    return lines;
  }

  /**
   * Component.render - 由 TUI 调用
   */
  render(width: number): string[] {
    return this.renderContent(width);
  }

  /**
   * Component.invalidate
   */
  invalidate(): void {
    // no-op
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createApprovalOverlay(props: ApprovalOverlayProps): ApprovalOverlay {
  return new ApprovalOverlay(props);
}