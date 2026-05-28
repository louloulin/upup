/**
 * Fullscreen Approval Overlay Component (pi-tui native + BorderBox)
 *
 * 全屏授权覆盖层，使用纯 pi-tui 组件构建
 * 充分利用 pi-tui 0.73.1 的组件:
 * - Container: 容器布局
 * - BorderBox: 带边框的框 (自定义实现)
 * - Text: 文本显示
 * - Spacer: 间距
 */

import {
  Container,
  Text,
  Spacer,
  getKeybindings,
  type Component,
} from '@earendil-works/pi-tui';
import { BorderBox } from '../BorderBox.js';
import type { ApprovalDecision } from '../../agent/types.js';
import { getToolDangerLevel, isHardDenyCommand } from '../../utils/permissions/index.js';
import { theme } from '../../theme.js';
import type { ApprovalRequestData } from './BaseApprovalRequest.js';

// Re-use the factory from GenericApprovalRequest
export { createApprovalRequest } from './GenericApprovalRequest.js';

export interface FullscreenOverlayCallbacks {
  onApprove: (decision: ApprovalDecision) => void;
  onDeny: () => void;
}

export interface ApprovalOption {
  key: string;
  label: string;
  description: string;
  decision: ApprovalDecision;
  style?: 'normal' | 'danger' | 'success';
}

// 默认超时时间 (秒)
const DEFAULT_TIMEOUT_SECONDS = 300; // 5分钟

/**
 * 全屏授权覆盖层组件
 *
 * 使用纯 pi-tui 组件构建，充分利用 Container 的 addChild 机制
 */
export class FullscreenApprovalOverlay extends Container {
  private toolName: string;
  private args: Record<string, unknown>;
  private callbacks: FullscreenOverlayCallbacks;
  private selectedIndex = 0;
  private options: ApprovalOption[];
  private startTime: number;
  private timeoutMs: number;
  private headerBox: BorderBox;
  private optionsBox: BorderBox;
  private hintsText: Text;
  private timeText: Text;

  constructor(data: ApprovalRequestData, callbacks: FullscreenOverlayCallbacks, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS) {
    super();
    this.toolName = data.toolName;
    this.args = data.args || {};
    this.callbacks = callbacks;
    this.startTime = Date.now();
    this.timeoutMs = timeoutSeconds * 1000;

    // Build approval options based on tool type
    this.options = this.buildOptions();

    // Create persistent UI components
    this.headerBox = this.createHeaderBox();
    this.optionsBox = this.createOptionsBox();
    this.hintsText = this.createHintsText();
    this.timeText = this.createTimeText();

    // Add all children
    this.addChild(new Spacer(1));
    this.addChild(this.headerBox);
    this.addChild(new Spacer(1));
    this.addChild(this.optionsBox);
    this.addChild(new Spacer(1));
    this.addChild(this.hintsText);
  }

  private buildOptions(): ApprovalOption[] {
    const baseOptions: ApprovalOption[] = [
      {
        key: '1',
        label: 'Yes',
        description: 'Allow this operation once',
        decision: 'allow-once',
        style: 'success',
      },
      {
        key: '2',
        label: 'Yes, allow all this session',
        description: 'Trust this tool for the rest of the session',
        decision: 'allow-session',
        style: 'success',
      },
      {
        key: '3',
        label: 'No',
        description: 'Deny this operation',
        decision: 'deny',
        style: 'normal',
      },
    ];

    // For dangerous commands, add extra warning option
    if (this.isDangerous()) {
      baseOptions.push({
        key: 'n',
        label: 'No (never for this)',
        description: 'Deny and add to always-deny list',
        decision: 'deny',
        style: 'danger',
      });
    }

    return baseOptions;
  }

  private isDangerous(): boolean {
    const level = getToolDangerLevel(this.toolName);
    if (level === 'high') {
      if (this.toolName === 'Bash' && this.args.command) {
        const cmd = this.args.command as string;
        return isHardDenyCommand(cmd) || /sudo\s+rm/i.test(cmd);
      }
    }
    return level === 'high';
  }

  private getDangerLevel(): 'low' | 'medium' | 'high' {
    return getToolDangerLevel(this.toolName);
  }

  private formatToolLabel(tool: string): string {
    return tool
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private getRemainingTime(): { remaining: number; expired: boolean } {
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, this.timeoutMs - elapsed);
    return {
      remaining,
      expired: remaining <= 0,
    };
  }

  private formatTimeRemaining(): string {
    const { remaining, expired } = this.getRemainingTime();
    if (expired) {
      return theme.error('⏱ EXPIRED');
    }
    const seconds = Math.ceil(remaining / 1000);
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return theme.muted(`⏱ ${minutes}:${secs.toString().padStart(2, '0')}`);
    }
    // 低于30秒变红警告
    if (seconds <= 30) {
      return theme.error(`⏱ ${seconds}s`);
    }
    return theme.muted(`⏱ ${seconds}s`);
  }

  private createHeaderBox(): BorderBox {
    const level = this.getDangerLevel();
    const icon = level === 'high' ? '🔴' : level === 'medium' ? '⚠️' : '✅';
    const levelText = level === 'high' ? 'HIGH RISK' : level === 'medium' ? 'MEDIUM RISK' : 'LOW RISK';
    const levelColor = level === 'high' ? 'error' : level === 'medium' ? 'warning' : 'success';

    const content: Component[] = [];
    content.push(new Text(theme.bold(`${icon}  Authorization Required`), 0, 0));
    content.push(new Text('', 0, 0));
    content.push(new Text(`Tool: ${theme.primary(this.formatToolLabel(this.toolName))}`, 0, 0));

    const levelColorFn = level === 'high' ? theme.error : level === 'medium' ? theme.warning : theme.success;
    content.push(new Text(`Risk Level: ${levelColorFn(levelText)}`, 0, 0));

    return new BorderBox(content, { style: 'double', paddingX: 1, paddingY: 0 });
  }

  private createToolDetailsBox(): BorderBox {
    const children: Component[] = [];

    if (this.toolName === 'Bash' && this.args.command) {
      const cmd = this.args.command as string;

      // Danger warnings
      if (isHardDenyCommand(cmd)) {
        children.push(new Text(theme.error('⚠️  DANGER: This command will cause permanent data loss!'), 0, 0));
        children.push(new Text('', 0, 0));
      } else if (/sudo\s+rm/i.test(cmd)) {
        children.push(new Text(theme.warning('⚠️  Warning: Uses sudo with rm, may permanently delete files'), 0, 0));
        children.push(new Text('', 0, 0));
      } else if (/curl\s+.*\|\s*(sh|bash)/i.test(cmd)) {
        children.push(new Text(theme.warning('⚠️  Warning: Downloads and executes code from the internet'), 0, 0));
        children.push(new Text('', 0, 0));
      }

      // Command display
      const displayCmd = cmd.length > 70 ? cmd.substring(0, 67) + '...' : cmd;
      children.push(new Text(theme.primary(displayCmd), 0, 0));
    } else if ((this.toolName === 'Write' || this.toolName === 'Edit') && (this.args.file_path || this.args.path)) {
      const path = (this.args.file_path || this.args.path) as string;
      children.push(new Text(`Path: ${theme.primary(path)}`, 0, 0));

      // Sensitive path warning
      const lower = path.toLowerCase();
      if (lower.includes('.ssh/') || lower.includes('.aws/') || lower.includes('credentials')) {
        children.push(new Text('', 0, 0));
        children.push(new Text(theme.warning('⚠️  Warning: This path may contain sensitive data!'), 0, 0));
      }
    } else {
      const argsKeys = Object.keys(this.args);
      if (argsKeys.length > 0) {
        children.push(new Text(theme.muted('Arguments:'), 0, 0));
        for (const key of argsKeys.slice(0, 5)) {
          const value = String(this.args[key]).substring(0, 50);
          children.push(new Text(`  ${key}: ${value}`, 0, 0));
        }
      }
    }

    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  private createOptionsBox(): BorderBox {
    const children: Component[] = [];

    children.push(new Text(theme.bold('Select an option:'), 0, 0));
    children.push(new Text('', 0, 0));

    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      const isSelected = this.selectedIndex === i;

      // Style based on selection and option type
      const prefix = isSelected ? theme.primary('▶ ') : '  ';
      const keyStyle = isSelected ? theme.primary(`[${opt.key}]`) : theme.muted(`[${opt.key}]`);
      const labelStyle = isSelected
        ? theme.primary(opt.label)
        : opt.style === 'danger'
          ? theme.error(opt.label)
          : opt.style === 'success'
            ? theme.success(opt.label)
            : theme.muted(opt.label);

      children.push(new Text(`${prefix}${keyStyle} ${labelStyle}`, 0, 0));
      children.push(new Text(`${' '.repeat(4)}${theme.muted(opt.description)}`, 0, 0));
      children.push(new Text('', 0, 0));
    }

    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  private createHintsText(): Text {
    return new Text(
      theme.muted('↑↓ Navigate  ') + '|  ' +
      theme.muted('1/2/3/Enter Select  ') + '|  ' +
      theme.muted('Esc Deny  ') + '|  ' +
      this.formatTimeRemaining(),
      0,
      0,
    );
  }

  private createTimeText(): Text {
    return new Text(this.formatTimeRemaining(), 0, 0);
  }

  handleInput(keyData: string): void {
    const kb = getKeybindings();

    // Normalize arrow keys: convert escape sequences to 'up'/'down'
    let normalizedKey = keyData;
    if (keyData === '[A' || keyData === '\x1b[A') {
      normalizedKey = 'up';
    } else if (keyData === '[B' || keyData === '\x1b[B') {
      normalizedKey = 'down';
    }

    // Navigation (support arrow keys, vim j/k, and explicit up/down)
    if (
      normalizedKey === 'up' ||
      keyData === 'k' || keyData === 'K' ||
      kb.matches(keyData, 'tui.editor.cursorUp')
    ) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.refreshOptions();
      return;
    }

    if (
      normalizedKey === 'down' ||
      keyData === 'j' || keyData === 'J' ||
      kb.matches(keyData, 'tui.editor.cursorDown')
    ) {
      this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
      this.refreshOptions();
      return;
    }

    // Number key selection
    if (keyData === '1' && this.options.length >= 1) {
      this.selectedIndex = 0;
      this.selectCurrent();
      return;
    }
    if (keyData === '2' && this.options.length >= 2) {
      this.selectedIndex = 1;
      this.selectCurrent();
      return;
    }
    if (keyData === '3' && this.options.length >= 3) {
      this.selectedIndex = 2;
      this.selectCurrent();
      return;
    }
    if (keyData.toLowerCase() === 'n') {
      // Find the "never" option
      const neverIndex = this.options.findIndex(o => o.key === 'n');
      if (neverIndex !== -1) {
        this.selectedIndex = neverIndex;
        this.selectCurrent();
        return;
      }
    }

    // Enter to confirm
    if (kb.matches(keyData, 'tui.input.submit')) {
      this.selectCurrent();
      return;
    }

    // Escape to deny
    if (kb.matches(keyData, 'tui.select.cancel')) {
      this.callbacks.onDeny();
      return;
    }
  }

  private refreshOptions(): void {
    // Remove old options box and add new one
    this.removeChild(this.optionsBox);
    this.optionsBox = this.createOptionsBox();

    // Find the index of hintsText and insert optionsBox before it
    const hintsIndex = this.children.indexOf(this.hintsText);
    if (hintsIndex > 0) {
      this.children.splice(hintsIndex, 0, this.optionsBox);
    } else {
      this.addChild(this.optionsBox);
    }

    // Update hints with new time
    this.removeChild(this.hintsText);
    this.hintsText = this.createHintsText();
    this.addChild(this.hintsText);

    this.invalidate();
  }

  private selectCurrent(): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.options.length) {
      const decision = this.options[this.selectedIndex].decision;
      if (decision !== 'deny') {
        this.callbacks.onApprove(decision);
      } else {
        this.callbacks.onDeny();
      }
    }
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    this.selectedIndex = Math.max(0, Math.min(this.options.length - 1, index));
  }

  /**
   * 获取超时状态
   */
  isExpired(): boolean {
    return this.getRemainingTime().expired;
  }

  /**
   * 获取剩余时间(毫秒)
   */
  getRemainingMs(): number {
    return this.getRemainingTime().remaining;
  }
}

/**
 * Create a fullscreen approval overlay for the given tool request
 * 支持超时参数 (秒)
 */
export function createFullscreenApproval(
  data: ApprovalRequestData,
  callbacks: FullscreenOverlayCallbacks,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS
): FullscreenApprovalOverlay {
  return new FullscreenApprovalOverlay(data, callbacks, timeoutSeconds);
}