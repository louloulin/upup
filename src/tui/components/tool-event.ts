/**
 * ToolEvent Component
 *
 * 对标 Loucode ToolEvent 组件
 * 显示工具执行事件和结果
 */

import { Box, Text } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export type ToolEventType = 'start' | 'progress' | 'success' | 'error' | 'complete';

export interface ToolEvent {
  id: string;
  toolName: string;
  type: ToolEventType;
  message?: string;
  progress?: number; // 0-100
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  timestamp: number;
}

export interface ToolEventProps {
  /** 工具事件列表 */
  events: ToolEvent[];
  /** 最大显示事件数 */
  maxEvents?: number;
  /** 是否显示输入/输出 */
  showDetails?: boolean;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  start: '\x1b[1;33m',      // 黄色
  progress: '\x1b[1;36m',    // 青色
  success: '\x1b[1;32m',     // 绿色
  error: '\x1b[1;31m',       // 红色
  complete: '\x1b[0;37m',    // 白色
  dim: '\x1b[0;90m',        // 灰色
  reset: '\x1b[0m',
};

// ============================================================================
// Progress Bar
// ============================================================================

function renderProgressBar(progress: number, width: number): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return `[${'\x1b[1;32m'.repeat(filled)}${'\x1b[0;90m'.repeat(empty)}]`;
}

// ============================================================================
// Component
// ============================================================================

export class ToolEventDisplay {
  private events: ToolEvent[];
  private maxEvents: number;
  private showDetails: boolean;

  constructor(props: ToolEventProps) {
    this.events = props.events;
    this.maxEvents = props.maxEvents || 10;
    this.showDetails = props.showDetails !== false;
  }

  /**
   * 更新事件列表
   */
  updateEvents(events: ToolEvent[]): void {
    this.events = events.slice(-this.maxEvents);
  }

  /**
   * 添加新事件
   */
  addEvent(event: ToolEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * 获取事件类型颜色
   */
  private getColor(type: ToolEventType): string {
    return THEME[type] || THEME.dim;
  }

  /**
   * 获取事件类型图标
   */
  private getIcon(type: ToolEventType): string {
    switch (type) {
      case 'start': return '▶';
      case 'progress': return '◐';
      case 'success': return '✓';
      case 'error': return '✗';
      case 'complete': return '●';
      default: return '○';
    }
  }

  /**
   * 格式化时间戳
   */
  private formatTimestamp(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * 截断长文本
   */
  private truncate(text: string, maxLen: number): string {
    const clean = text.replace(/[\x1b\x07]/g, '');
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 3) + '...';
  }

  /**
   * 渲染单个事件
   */
  private renderEvent(event: ToolEvent, maxWidth: number): string[] {
    const lines: string[] = [];
    const color = this.getColor(event.type);
    const icon = this.getIcon(event.type);

    // 事件头部
    const header = `${color}${icon} ${event.toolName}${THEME.reset}`;
    const timestamp = `${THEME.dim}${this.formatTimestamp(event.timestamp)}${THEME.reset}`;

    lines.push(`${header} ${timestamp}`);

    // 消息
    if (event.message) {
      const msgLines = this.wrapText(event.message, maxWidth - 4);
      for (const line of msgLines) {
        lines.push(`  ${THEME.dim}${line}${THEME.reset}`);
      }
    }

    // 进度条
    if (event.type === 'progress' && event.progress !== undefined) {
      const barWidth = Math.min(maxWidth - 10, 30);
      lines.push(`  ${renderProgressBar(event.progress, barWidth)} ${event.progress}%`);
    }

    // 输入详情
    if (this.showDetails && event.input) {
      const inputStr = JSON.stringify(event.input);
      lines.push(`  ${THEME.dim}IN: ${this.truncate(inputStr, maxWidth - 6)}${THEME.reset}`);
    }

    // 输出
    if (event.output) {
      lines.push(`  ${THEME.dim}OUT: ${this.truncate(event.output, maxWidth - 6)}${THEME.reset}`);
    }

    // 错误
    if (event.error) {
      const errLines = this.wrapText(event.error, maxWidth - 4);
      for (const line of errLines) {
        lines.push(`  ${THEME.error}${line}${THEME.reset}`);
      }
    }

    return lines;
  }

  /**
   * 文本自动换行
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
    const lines: string[] = [];

    // 标题
    lines.push(`${THEME.dim}┌─ Tool Events ─┐${THEME.reset}`);
    lines.push(`${THEME.dim}│${THEME.reset}`);

    // 事件列表
    for (const event of this.events) {
      const eventLines = this.renderEvent(event, width - 4);
      lines.push(...eventLines.map(l => `${THEME.dim}│${THEME.reset} ${l}`));
    }

    // 空状态
    if (this.events.length === 0) {
      lines.push(`${THEME.dim}│  (no events)${THEME.reset}`);
    }

    // 底部
    lines.push(`${THEME.dim}│${THEME.reset}`);
    lines.push(`${THEME.dim}└${'─'.repeat(width - 2)}┘${THEME.reset}`);

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createToolEventDisplay(props: ToolEventProps): ToolEventDisplay {
  return new ToolEventDisplay(props);
}
