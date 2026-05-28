/**
 * ChatLog Component
 *
 * 对标 Loucode ChatLog 组件
 * 聊天消息列表，支持用户消息和助手消息
 */

import { Box, Text } from '@earendil-works/pi-tui';
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
};

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
    this.messages = messages.slice(-this.maxMessages);
  }

  /**
   * 滚动到顶部
   */
  scrollToTop(): void {
    this.scrollOffset = 0;
  }

  /**
   * 滚动到底部
   */
  scrollToBottom(): void {
    this.scrollOffset = Math.max(0, this.messages.length - this.visibleCount);
  }

  /**
   * 设置滚动偏移
   */
  setScrollOffset(offset: number): void {
    this.scrollOffset = Math.max(0, Math.min(offset, this.messages.length - 1));
  }

  /**
   * 获取可见消息数
   */
  private get visibleCount(): number {
    return 20; // 默认可见行数
  }

  /**
   * 格式化时间戳
   */
  private formatTimestamp(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * 转义ANSI控制字符
   */
  private escape(text: string): string {
    return text.replace(/[\x1b\x07]/g, '');
  }

  /**
   * 渲染单条消息
   */
  private renderMessage(msg: ChatMessage, maxWidth: number): string[] {
    const lines: string[] = [];

    // 角色标识
    const roleLabel = msg.role === 'user'
      ? this.userName
      : msg.role === 'assistant'
        ? this.assistantName
        : 'System';

    const roleColor = msg.role === 'user' ? THEME.userBg : THEME.assistantBg;
    const textColor = msg.role === 'user' ? THEME.userText : THEME.assistantText;

    // 头部
    const header = `${roleColor}[${roleLabel}]${THEME.reset}`;
    const timestamp = this.showTimestamp
      ? `${THEME.timestamp}${this.formatTimestamp(msg.timestamp)}${THEME.reset}`
      : '';

    lines.push(`${header} ${timestamp}`);

    // 内容 (自动换行)
    const contentLines = this.wrapText(msg.content, maxWidth - 2);
    for (const line of contentLines) {
      lines.push(`${textColor}${line}${THEME.reset}`);
    }

    // 工具调用
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push(`${THEME.timestamp}├─ Tool Calls:${THEME.reset}`);
      for (const tool of msg.toolCalls) {
        const toolLine = `  ${tool.name}${tool.output ? ': OK' : tool.error ? ': ERROR' : ': ...'}`;
        lines.push(`${THEME.timestamp}${toolLine}${THEME.reset}`);
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

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createChatLog(props: ChatLogProps): ChatLog {
  return new ChatLog(props);
}
