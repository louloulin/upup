/**
 * ChatLog Component
 *
 * 对标 Loucode ChatLog 组件
 * 聊天消息列表，支持用户消息和助手消息
 * 使用 pi-tui wrapTextWithAnsi, truncateToWidth, visibleWidth 等工具函数
 *
 * 性能优化：
 * - 使用缓存避免重复渲染
 * - 时间戳格式化结果缓存
 * - 脏标记机制
 */

import { wrapTextWithAnsi, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { useStoreSubscription } from '../hooks/use-store.js';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
}

export interface ChatLogProps {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 最大显示消息数 */
  maxMessages?: number;
  /** 是否显示时间戳 */
  showTimestamp?: boolean;
  /** 用户名 */
  userName?: string;
  /** 助手名 */
  assistantName?: string;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  userBg: '\x1b[1;34m',      // 蓝色背景
  userText: '\x1b[1;37m',     // 白色文字
  assistantBg: '\x1b[1;32m',  // 绿色背景
  assistantText: '\x1b[1;37m', // 白色文字
  systemBg: '\x1b[1;33m',     // 黄色背景
  systemText: '\x1b[1;30m',   // 黑色文字
  timestamp: '\x1b[0;36m',    // 青色
  reset: '\x1b[0m',
  toolCall: '\x1b[0;90m',      // 灰色工具调用
  toolError: '\x1b[1;31m',     // 红色错误
  toolSuccess: '\x1b[1;32m',   // 绿色成功
};

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
// Component
// ============================================================================

export class ChatLog {
  private messages: ChatMessage[];
  private maxMessages: number;
  private showTimestamp: boolean;
  private userName: string;
  private assistantName: string;
  private scrollOffset: number = 0;

  // 性能优化：缓存相关
  private _dirty: boolean = true;
  private _cachedLines: string[] = [];
  private _cachedWidth: number = 0;
  private _lastMessageCount: number = 0;

  constructor(props: ChatLogProps) {
    this.messages = props.messages;
    this.maxMessages = props.maxMessages || 100;
    this.showTimestamp = props.showTimestamp !== false;
    this.userName = props.userName || 'You';
    this.assistantName = props.assistantName || 'Assistant';
  }

  /**
   * 更新消息列表
   */
  updateMessages(messages: ChatMessage[]): void {
    const newCount = messages.length;
    if (newCount !== this._lastMessageCount) {
      this._dirty = true;
      this._lastMessageCount = newCount;
    }
    this.messages = messages.slice(-this.maxMessages);
    this._dirty = true;
  }

  /**
   * 滚动到顶部
   */
  scrollToTop(): void {
    this.scrollOffset = 0;
    this._dirty = true;
  }

  /**
   * 向上滚动
   */
  scrollUp(): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - 3);
    this._dirty = true;
  }

  /**
   * 向下滚动
   */
  scrollDown(): void {
    const maxOffset = Math.max(0, this.messages.length - this.visibleCount);
    this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 3);
    this._dirty = true;
  }

  /**
   * 滚动到底部
   */
  scrollToBottom(): void {
    this.scrollOffset = Math.max(0, this.messages.length - this.visibleCount);
    this._dirty = true;
  }

  /**
   * 设置滚动偏移
   */
  setScrollOffset(offset: number): void {
    this.scrollOffset = Math.max(0, Math.min(offset, this.messages.length - 1));
    this._dirty = true;
  }

  /**
   * 获取可见消息数
   */
  private get visibleCount(): number {
    return 20; // 默认可见行数
  }

  /**
   * 渲染单条消息
   */
  private renderMessage(msg: ChatMessage, maxWidth: number): string[] {
    const lines: string[] = [];
    const contentWidth = maxWidth - 2; // 留出边距

    // 角色标识
    const roleLabel = msg.role === 'user'
      ? this.userName
      : msg.role === 'assistant'
        ? this.assistantName
        : 'System';

    const roleColor = msg.role === 'user' ? THEME.userBg : msg.role === 'assistant' ? THEME.assistantBg : THEME.systemBg;
    const textColor = msg.role === 'user' ? THEME.userText : msg.role === 'assistant' ? THEME.assistantText : THEME.systemText;

    // 头部
    const header = `${roleColor}[${roleLabel}]${THEME.reset}`;
    const timestamp = this.showTimestamp
      ? `${THEME.timestamp}${formatTimestampCached(msg.timestamp)}${THEME.reset}`
      : '';

    lines.push(`${header} ${timestamp}`);

    // 内容 (使用 pi-tui wrapTextWithAnsi 处理 ANSI 换行)
    const contentLines = wrapTextWithAnsi(msg.content, contentWidth);
    for (const line of contentLines) {
      lines.push(`${textColor}${line}${THEME.reset}`);
    }

    // 工具调用
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push(`${THEME.toolCall}├─ Tool Calls:${THEME.reset}`);
      for (const tool of msg.toolCalls) {
        const statusText = tool.output ? ': OK' : tool.error ? ': ERROR' : ': ...';
        const statusColor = tool.output ? THEME.toolSuccess : tool.error ? THEME.toolError : THEME.toolCall;
        const toolLine = `  ${tool.name}${statusColor}${statusText}${THEME.reset}`;
        lines.push(toolLine);
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
    const visibleMessages = this.messages.slice(
      this.scrollOffset,
      this.scrollOffset + this.visibleCount
    );

    for (const msg of visibleMessages) {
      const msgLines = this.renderMessage(msg, width);
      lines.push(...msgLines);
    }

    // 滚动指示器
    if (this.messages.length > this.visibleCount) {
      const hasMoreTop = this.scrollOffset > 0;
      const hasMoreBottom = this.scrollOffset + this.visibleCount < this.messages.length;

      if (hasMoreTop) lines.unshift(`${THEME.timestamp}▲ more above${THEME.reset}`);
      if (hasMoreBottom) lines.push(`${THEME.timestamp}▼ more below${THEME.reset}`);
    }

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
    // 上方向键
    if (data === '\x1b[A' || data === 'k') {
      this.scrollUp();
      return;
    }

    // 下方向键
    if (data === '\x1b[B' || data === 'j') {
      this.scrollDown();
      return;
    }

    // Home 键
    if (data === '\x1b[H' || data === 'g') {
      this.scrollToTop();
      return;
    }

    // End 键
    if (data === '\x1b[F' || data === 'G') {
      this.scrollToBottom();
      return;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createChatLog(props: ChatLogProps): ChatLog {
  return new ChatLog(props);
}
