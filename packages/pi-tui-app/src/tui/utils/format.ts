/**
 * Format Utilities
 *
 * 对标 Loucode format utilities
 * 格式化文本、时间、货币等
 */

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * 格式化相对时间
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return 'just now';
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * 格式化时间戳为 HH:mm:ss
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * 格式化时间戳为完整日期时间
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

// ============================================================================
// Token & Cost Formatting
// ============================================================================

/**
 * 格式化 Token 数量
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

/**
 * 格式化成本 (USD)
 */
export function formatCost(costUSD: number): string {
  if (costUSD < 0.001) return `$${costUSD.toFixed(6)}`;
  if (costUSD < 0.01) return `$${costUSD.toFixed(4)}`;
  if (costUSD < 1) return `$${costUSD.toFixed(3)}`;
  return `$${costUSD.toFixed(2)}`;
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

// ============================================================================
// Text Formatting
// ============================================================================

/**
 * 截断文本
 */
export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * 文本自动换行
 */
export function wrapText(text: string, maxWidth: number): string[] {
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
 * 移除 ANSI 转义序列
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * 获取文本可视宽度 (用于中日韩文字)
 */
export function visualWidth(text: string): number {
  // 简单实现: 中文按2计算，英文按1计算
  let width = 0;
  for (const char of text) {
    if (char.charCodeAt(0) > 255) {
      width += 2; // CJK 字符
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 填充到指定宽度 (考虑中日韩文字)
 */
export function padEnd(text: string, width: number): string {
  const currentWidth = visualWidth(text);
  const padding = width - currentWidth;
  if (padding <= 0) return text;
  return text + ' '.repeat(padding);
}

/**
 * 居中对齐文本
 */
export function centerText(text: string, width: number): string {
  const currentWidth = visualWidth(text);
  const padding = Math.max(0, width - currentWidth);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

// ============================================================================
// File Size Formatting
// ============================================================================

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * 渲染进度条
 */
export function renderProgressBar(
  progress: number, // 0-100
  width: number,
  options: {
    filled?: string;
    empty?: string;
    showText?: boolean;
  } = {}
): string {
  const { filled = '█', empty = '░', showText = true } = options;

  const filledWidth = Math.round((progress / 100) * width);
  const emptyWidth = width - filledWidth;

  let bar = filled.repeat(filledWidth) + empty.repeat(emptyWidth);

  if (showText) {
    bar += ` ${progress.toFixed(0)}%`;
  }

  return bar;
}

/**
 * 渲染不确定进度条
 */
export function renderIndeterminateProgressBar(width: number): string {
  const position = Math.floor((Date.now() / 200) % width);
  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i === position) {
      bar += '█';
    } else if (i === (position + 1) % width) {
      bar += '▓';
    } else if (i === (position + 2) % width) {
      bar += '▒';
    } else {
      bar += '░';
    }
  }
  return bar;
}

// ============================================================================
// Table Formatting
// ============================================================================

/**
 * 表格列定义
 */
export interface TableColumn<T> {
  header: string;
  width: number;
  render: (item: T) => string;
}

/**
 * 渲染表格行
 */
export function renderTableRow<T>(
  columns: TableColumn<T>[],
  item: T,
  options: {
    border?: string;
    headerBg?: string;
    headerFg?: string;
  } = {}
): string[] {
  const { border = '│', headerBg = '', headerFg = '' } = options;
  const cells: string[] = [];

  for (const col of columns) {
    const value = col.render(item);
    const truncated = truncate(value, col.width);
    cells.push(padEnd(truncated, col.width));
  }

  return [` ${cells.join(` ${border} `)} `];
}

/**
 * 渲染表格分隔线
 */
export function renderTableDivider<T>(
  columns: TableColumn<T>[],
  style: 'single' | 'double' | 'heavy' = 'single'
): string {
  const chars = {
    single: { h: '─', l: '┌', r: '┐', j: '┬', m: '├', p: '┆', s: '┤', b: '└', t: '┴', x: '┼' },
    double: { h: '═', l: '╔', r: '╗', j: '╦', m: '╠', p: '║', s: '╣', b: '╚', t: '╩', x: '╬' },
    heavy: { h: '━', l: '┏', r: '┓', j: '┳', m: '┣', p: '┃', s: '┫', b: '┗', t: '┻', x: '╋' },
  };

  const c = chars[style];
  const line = c.h.repeat(columns.reduce((sum, col) => sum + col.width + 2, 0) - 1);
  return ` ${c.l}${line}${c.r}`;
}
