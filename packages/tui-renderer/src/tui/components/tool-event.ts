/**
 * ToolEventDisplay Component
 *
 * 对标 Loucode ToolEvent 组件
 * 显示工具执行事件和结果
 * 使用 pi-tui wrapTextWithAnsi, truncateToWidth 等工具函数
 *
 * 性能优化：
 * - 使用缓存避免重复渲染
 * - 时间戳格式化结果缓存
 * - JSON.stringify 结果缓存
 * - 脏标记机制
 */

import { wrapTextWithAnsi, truncateToWidth } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export type ToolEventDisplayType = 'start' | 'progress' | 'success' | 'error' | 'complete';

export interface ToolEventDisplayEvent {
  id: string;
  toolName: string;
  type: ToolEventDisplayType;
  message?: string;
  progress?: number; // 0-100
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  timestamp: number;
}

export interface ToolEventDisplayProps {
  /** 工具事件列表 */
  events: ToolEventDisplayEvent[];
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

// 预计算的进度条样式
const PROGRESS_FILLED = '\x1b[1;32m█\x1b[0m';
const PROGRESS_EMPTY = '\x1b[0;90m░\x1b[0m';

function renderProgressBar(progress: number, width: number): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return `[${PROGRESS_FILLED.repeat(filled)}${PROGRESS_EMPTY.repeat(empty)}]`;
}

// ============================================================================
// Cached Timestamp Formatter
// ============================================================================

const timestampCache = new Map<number, string>();
const TIMESTAMP_CACHE_MAX = 100;

function formatTimestampCached(ts: number): string {
  const cached = timestampCache.get(ts);
  if (cached) return cached;

  const date = new Date(ts);
  const result = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // 缓存管理
  if (timestampCache.size >= TIMESTAMP_CACHE_MAX) {
    const firstKey = timestampCache.keys().next().value;
    if (firstKey !== undefined) timestampCache.delete(firstKey);
  }
  timestampCache.set(ts, result);

  return result;
}

// ============================================================================
// JSON Cache
// ============================================================================

const jsonCache = new Map<string, string>();
const JSON_CACHE_MAX = 50;

function jsonStringifyCached(obj: unknown): string {
  const key = JSON.stringify(obj);
  const cached = jsonCache.get(key);
  if (cached) return cached;

  const result = JSON.stringify(obj);

  // 缓存管理
  if (jsonCache.size >= JSON_CACHE_MAX) {
    const firstKey = jsonCache.keys().next().value;
    if (firstKey !== undefined) jsonCache.delete(firstKey);
  }
  jsonCache.set(key, result);

  return result;
}

// ============================================================================
// Component
// ============================================================================

export class ToolEventDisplay {
  private events: ToolEventDisplayEvent[];
  private maxEvents: number;
  private showDetails: boolean;

  // 性能优化：缓存相关
  private _dirty: boolean = true;
  private _cachedLines: string[] = [];
  private _cachedWidth: number = 0;
  private _lastEventCount: number = 0;

  constructor(props: ToolEventDisplayProps) {
    this.events = props.events;
    this.maxEvents = props.maxEvents || 10;
    this.showDetails = props.showDetails !== false;
  }

  /**
   * 更新事件列表
   */
  updateEvents(events: ToolEventDisplayEvent[]): void {
    const newCount = events.length;
    if (newCount !== this._lastEventCount) {
      this._dirty = true;
      this._lastEventCount = newCount;
    }
    this.events = events.slice(-this.maxEvents);
    this._dirty = true;
  }

  /**
   * 添加新事件
   */
  addEvent(event: ToolEventDisplayEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    this._dirty = true;
  }

  /**
   * 获取事件类型颜色
   */
  private getColor(type: ToolEventDisplayType): string {
    return THEME[type] || THEME.dim;
  }

  /**
   * 获取事件类型图标
   */
  private getIcon(type: ToolEventDisplayType): string {
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
   * 文本自动换行 (使用 pi-tui wrapTextWithAnsi)
   */
  private wrapText(text: string, maxWidth: number): string[] {
    return wrapTextWithAnsi(text, maxWidth);
  }

  /**
   * 截断长文本 (使用 pi-tui truncateToWidth)
   */
  private truncate(text: string, maxLen: number): string {
    return truncateToWidth(text, maxLen, '...');
  }

  /**
   * 渲染单个事件
   */
  private renderEvent(event: ToolEventDisplayEvent, maxWidth: number): string[] {
    const lines: string[] = [];
    const color = this.getColor(event.type);
    const icon = this.getIcon(event.type);

    // 事件头部
    const header = `${color}${icon} ${event.toolName}${THEME.reset}`;
    const timestamp = `${THEME.dim}${formatTimestampCached(event.timestamp)}${THEME.reset}`;

    lines.push(`${header} ${timestamp}`);

    // 消息 (使用 pi-tui wrapTextWithAnsi)
    if (event.message) {
      const msgLines = wrapTextWithAnsi(event.message, maxWidth - 4);
      for (const line of msgLines) {
        lines.push(`  ${THEME.dim}${line}${THEME.reset}`);
      }
    }

    // 进度条
    if (event.type === 'progress' && event.progress !== undefined) {
      const barWidth = Math.min(maxWidth - 10, 30);
      lines.push(`  ${renderProgressBar(event.progress, barWidth)} ${event.progress}%`);
    }

    // 输入详情 (使用 JSON 缓存)
    if (this.showDetails && event.input) {
      const inputStr = jsonStringifyCached(event.input);
      lines.push(`  ${THEME.dim}IN: ${this.truncate(inputStr, maxWidth - 6)}${THEME.reset}`);
    }

    // 输出
    if (event.output) {
      lines.push(`  ${THEME.dim}OUT: ${this.truncate(event.output, maxWidth - 6)}${THEME.reset}`);
    }

    // 错误 (使用 pi-tui wrapTextWithAnsi)
    if (event.error) {
      const errLines = wrapTextWithAnsi(event.error, maxWidth - 4);
      for (const line of errLines) {
        lines.push(`  ${THEME.error}${line}${THEME.reset}`);
      }
    }

    return lines;
  }

  /**
   * 渲染组件 (带缓存)
   */
  render(width: number): string[] {
    // 如果没有脏标记且宽度相同，返回缓存
    if (!this._dirty && this._cachedWidth === width && this._cachedLines.length > 0) {
      return this._cachedLines;
    }

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

    // 更新缓存
    this._cachedLines = lines;
    this._cachedWidth = width;
    this._dirty = false;

    return lines;
  }

  /**
   * Component.invalidate - 使组件缓存失效
   */
  invalidate(): void {
    this._dirty = true;
  }

  /**
   * handleInput - 处理键盘输入
   */
  handleInput(data: string): void {
    // 工具事件组件目前不需要交互处理
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createToolEventDisplay(props: ToolEventDisplayProps): ToolEventDisplay {
  return new ToolEventDisplay(props);
}
