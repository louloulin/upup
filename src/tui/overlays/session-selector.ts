/**
 * SessionSelector Component
 *
 * 对标 Loucode SessionSelector
 * 会话历史选择浮层
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage?: string;
  tags?: string[];
}

export interface SessionSelectorProps {
  /** 会话列表 */
  sessions: Session[];
  /** 当前会话ID */
  currentSessionId?: string;
  /** 是否可见 */
  visible: boolean;
  /** 选择回调 */
  onSelect: (sessionId: string) => void;
  /** 新建会话回调 */
  onNewSession: () => void;
  /** 删除会话回调 */
  onDelete: (sessionId: string) => void;
  /** 关闭回调 */
  onClose: () => void;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  border: '\x1b[1;34m',        // 蓝色边框
  title: '\x1b[1;37m',          // 白色标题
  sessionTitle: '\x1b[1;36m',  // 青色会话标题
  current: '\x1b[1;32m',       // 绿色当前
  currentBg: '\x1b[42m',       // 绿色背景
  timestamp: '\x1b[0;90m',     // 灰色时间戳
  messageCount: '\x1b[0;33m',  // 黄色消息数
  tag: '\x1b[0;35m',           // 紫色标签
  hint: '\x1b[0;90m',          // 灰色提示
  delete: '\x1b[1;31m',        // 红色删除
  reset: '\x1b[0m',
  indicator: '\x1b[1;32m',     // 绿色指示器
};

// ============================================================================
// Component
// ============================================================================

export class SessionSelector {
  private sessions: Session[];
  private currentSessionId?: string;
  private visible: boolean;
  private selectedIndex: number = 0;
  private mode: 'list' | 'delete' = 'list';

  private onSelect: (sessionId: string) => void;
  private onNewSession: () => void;
  private onDelete: (sessionId: string) => void;
  private onClose: () => void;

  constructor(props: SessionSelectorProps) {
    this.sessions = props.sessions;
    this.currentSessionId = props.currentSessionId;
    this.visible = props.visible;
    this.onSelect = props.onSelect;
    this.onNewSession = props.onNewSession;
    this.onDelete = props.onDelete;
    this.onClose = props.onClose;
  }

  /**
   * 更新会话列表
   */
  updateSessions(sessions: Session[]): void {
    this.sessions = sessions;
    if (this.selectedIndex >= sessions.length) {
      this.selectedIndex = Math.max(0, sessions.length - 1);
    }
  }

  /**
   * 设置当前会话
   */
  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    const idx = this.sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) this.selectedIndex = idx;
  }

  /**
   * 设置可见性
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) {
      this.mode = 'list';
      if (this.currentSessionId) {
        const idx = this.sessions.findIndex(s => s.id === this.currentSessionId);
        if (idx >= 0) this.selectedIndex = idx;
      }
    }
  }

  /**
   * 获取当前选中会话
   */
  getSelectedSession(): Session | undefined {
    return this.sessions[this.selectedIndex];
  }

  /**
   * 处理输入
   */
  handleInput(data: string): void {
    if (!this.visible) return;

    // 上方向键
    if (matchesKey(data, Key.up)) {
      if (this.mode === 'delete') {
        // 删除模式：删除选中项
        const session = this.sessions[this.selectedIndex];
        if (session && session.id !== this.currentSessionId) {
          this.onDelete(session.id);
          this.updateSessions(this.sessions.filter(s => s.id !== session.id));
        }
      } else {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      }
      return;
    }

    // 下方向键
    if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(this.sessions.length - 1, this.selectedIndex + 1);
      return;
    }

    // Enter - 选择/确认
    if (matchesKey(data, Key.enter)) {
      if (this.mode === 'delete') {
        const session = this.sessions[this.selectedIndex];
        if (session && session.id !== this.currentSessionId) {
          this.onDelete(session.id);
          this.updateSessions(this.sessions.filter(s => s.id !== session.id));
        }
        this.mode = 'list';
      } else {
        const session = this.sessions[this.selectedIndex];
        if (session) {
          this.onSelect(session.id);
        }
      }
      return;
    }

    // Escape - 关闭/退出删除模式
    if (matchesKey(data, Key.escape)) {
      if (this.mode === 'delete') {
        this.mode = 'list';
      } else {
        this.onClose();
      }
      return;
    }

    // d - 切换删除模式
    if (data === 'd' || data === 'D') {
      this.mode = this.mode === 'delete' ? 'list' : 'delete';
      return;
    }

    // n - 新建会话
    if (data === 'n' || data === 'N') {
      this.onNewSession();
      return;
    }

    // x - 删除选中会话
    if (data === 'x' || data === 'X') {
      const session = this.sessions[this.selectedIndex];
      if (session && session.id !== this.currentSessionId) {
        this.onDelete(session.id);
        this.updateSessions(this.sessions.filter(s => s.id !== session.id));
      }
      return;
    }
  }

  /**
   * 格式化时间戳
   */
  private formatTimestamp(ts: number): string {
    const now = Date.now();
    const diff = now - ts;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    const date = new Date(ts);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLen: number): string {
    if (!text) return '';
    const clean = text.replace(/[\n\r]/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 3) + '...';
  }

  /**
   * 渲染会话项
   */
  private renderSession(session: Session, index: number, width: number): string {
    const isSelected = index === this.selectedIndex;
    const isCurrent = session.id === this.currentSessionId;

    const indicator = isSelected
      ? `${THEME.indicator}▶${THEME.reset} `
      : '  ';

    const currentMark = isCurrent
      ? ` ${THEME.current}[current]${THEME.reset}`
      : '';

    const title = `${THEME.sessionTitle}${this.truncate(session.title, 30)}${THEME.reset}`;
    const timestamp = `${THEME.timestamp}${this.formatTimestamp(session.updatedAt)}${THEME.reset}`;
    const msgCount = `${THEME.messageCount}[${session.messageCount}msg]${THEME.reset}`;

    const header = `${indicator}${index + 1}. ${title} ${currentMark}`;

    if (!isSelected) {
      return `${header} ${timestamp} ${msgCount}`;
    }

    // 选中时显示更多信息
    const lines: string[] = [header];

    if (session.lastMessage) {
      const lastMsg = this.truncate(session.lastMessage, width - 10);
      lines.push(`     ${THEME.timestamp}${lastMsg}${THEME.reset}`);
    }

    if (session.tags && session.tags.length > 0) {
      const tags = session.tags.map(t => `${THEME.tag}[${t}]${THEME.reset}`).join(' ');
      lines.push(`     ${tags}`);
    }

    lines.push(`     ${timestamp} ${msgCount}`);

    if (isSelected) {
      if (this.mode === 'delete') {
        lines.push(`     ${THEME.delete}⚠ Press Enter/X to delete${THEME.reset}`);
      } else {
        lines.push(`     ${THEME.hint}[d] Delete  [n] New${THEME.reset}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    if (!this.visible) {
      return [];
    }

    const lines: string[] = [];
    const innerWidth = Math.min(width, 80);
    const padding = Math.floor((width - innerWidth) / 2);

    // 标题
    const modeLabel = this.mode === 'delete' ? `${THEME.delete}[DELETE MODE]${THEME.reset}` : '';
    lines.push(' '.repeat(padding) + `${THEME.border}┌${'─'.repeat(innerWidth - 2)}┐${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset} ${THEME.title}📋 Sessions${THEME.reset}${modeLabel}${' '.repeat(Math.max(0, innerWidth - 15 - modeLabel.length))}${THEME.border}│${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}├${'─'.repeat(innerWidth - 2)}┤${THEME.reset}`);

    if (this.sessions.length === 0) {
      lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}   ${THEME.hint}No sessions yet${THEME.reset}${' '.repeat(Math.max(0, innerWidth - 22))}${THEME.border}│${THEME.reset}`);
    } else {
      // 会话列表
      const maxVisibleItems = 8;
      let startIndex = 0;

      if (this.sessions.length > maxVisibleItems) {
        startIndex = Math.max(0, Math.min(
          this.selectedIndex - Math.floor(maxVisibleItems / 2),
          this.sessions.length - maxVisibleItems
        ));
      }

      const visibleSessions = this.sessions.slice(startIndex, startIndex + maxVisibleItems);

      for (let i = 0; i < visibleSessions.length; i++) {
        const sessionIndex = startIndex + i;
        const session = visibleSessions[i];
        const isSelected = sessionIndex === this.selectedIndex;
        const isCurrent = session.id === this.currentSessionId;

        if (isSelected) {
          lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.currentBg}${' '.repeat(innerWidth - 2)}${THEME.reset}${THEME.border}│${THEME.reset}`);
        }

        const sessionLines = this.renderSession(session, sessionIndex, innerWidth - 4).split('\n');
        for (const line of sessionLines) {
          const content = line.padEnd(innerWidth - 4);
          if (isSelected) {
            lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.currentBg}${content}${THEME.reset}${THEME.border}│${THEME.reset}`);
          } else {
            lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset} ${content} ${THEME.border}│${THEME.reset}`);
          }
        }

        if (isSelected) {
          lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.currentBg}${' '.repeat(innerWidth - 2)}${THEME.reset}${THEME.border}│${THEME.reset}`);
        }
      }
    }

    // 底部提示
    const hints = this.mode === 'delete'
      ? `[↑↓] Delete  [Enter] Confirm  [Esc] Cancel`
      : `[↑↓] Navigate  [Enter] Select  [n] New  [d] Delete  [Esc] Close`;

    lines.push(' '.repeat(padding) + `${THEME.border}├${'─'.repeat(innerWidth - 2)}┤${THEME.reset}`);
    lines.push(' '.repeat(padding) + `${THEME.border}│${THEME.reset}${THEME.hint}${hints}${' '.repeat(Math.max(0, innerWidth - 4 - hints.length))}${THEME.border}│${THEME.reset}`);

    // 底部
    lines.push(' '.repeat(padding) + `${THEME.border}└${'─'.repeat(innerWidth - 2)}┘${THEME.reset}`);

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSessionSelector(props: SessionSelectorProps): SessionSelector {
  return new SessionSelector(props);
}
