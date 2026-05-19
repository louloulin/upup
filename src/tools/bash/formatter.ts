/**
 * Bash 输出格式化器
 *
 * 职责：
 * 1. 将 BashToolResult 转换为结构化输出
 * 2. 生成符合 TUI 显示格式的字符串
 * 3. 支持 JSON 格式化和 ANSI 清理
 */

import {
  tryJsonFormatContent,
  stripUnderlineAnsi,
  truncateAtWord,
} from './output-processors.js';

// Local type definition (duplicated from bash-tool.ts to avoid circular deps)
interface BashToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  durationMs: number;
  truncated?: boolean;
  securityWarnings?: string[];
}

// ============================================================================
// 常量定义
// ============================================================================

const STATUS_SUCCESS = '✅';
const STATUS_ERROR = '❌';
const STATUS_TIMEOUT = '⏱️';

const TREE_INDENT = '⎿  ';
const SECTION_STDOUT = '--- stdout ---';
const SECTION_STDERR = '--- stderr ---';

// ============================================================================
// 格式化函数
// ============================================================================

/**
 * 格式化耗时显示
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

/**
 * 格式化执行状态行
 */
function formatStatusLine(
  exitCode: number,
  durationMs: number,
  timedOut?: boolean
): string {
  const status = timedOut
    ? STATUS_TIMEOUT
    : exitCode === 0
      ? STATUS_SUCCESS
      : STATUS_ERROR;

  const durationStr = formatDuration(durationMs);

  if (timedOut) {
    return `${TREE_INDENT}${status} Timed out in ${durationStr}`;
  }

  if (exitCode === 0) {
    return `${TREE_INDENT}${status} Done in ${durationStr}`;
  }

  return `${TREE_INDENT}${status} Exit code ${exitCode} in ${durationStr}`;
}

/**
 * 处理和截断输出
 * 1. 尝试 JSON 格式化
 * 2. 清理 ANSI 下划线代码
 * 3. 截断到最大长度
 */
function processOutput(output: string, maxLength: number = 5000): string {
  // Step 1: 尝试 JSON 格式化
  let processed = tryJsonFormatContent(output);

  // Step 2: 清理 ANSI 下划线代码
  processed = stripUnderlineAnsi(processed);

  // Step 3: 截断
  if (processed.length <= maxLength) {
    return processed;
  }
  return (
    processed.slice(0, maxLength) +
    `\n... [${processed.length - maxLength} chars truncated]`
  );
}

/**
 * @deprecated 使用 processOutput 代替
 */
function truncateOutput(output: string, maxLength: number = 5000): string {
  return processOutput(output, maxLength);
}

/**
 * 生成完整的 Bash 结果字符串
 */
export function formatBashOutput(result: BashToolResult): string {
  const lines: string[] = [];

  // 1. 状态行
  lines.push(
    formatStatusLine(result.exitCode, result.durationMs, result.timedOut)
  );

  // 2. 安全警告
  if (result.securityWarnings && result.securityWarnings.length > 0) {
    lines.push(`${TREE_INDENT}⚠️  Security warnings:`);
    for (const warning of result.securityWarnings) {
      lines.push(`${TREE_INDENT}   - ${warning}`);
    }
  }

  // 3. stdout 部分
  if (result.stdout) {
    lines.push(`${TREE_INDENT}   ${SECTION_STDOUT} in ${formatDuration(result.durationMs)}`);
    lines.push(truncateOutput(result.stdout));
  }

  // 4. stderr 部分
  if (result.stderr) {
    lines.push(`${TREE_INDENT}   ${SECTION_STDERR} in ${formatDuration(result.durationMs)}`);
    lines.push(truncateOutput(result.stderr));
  }

  // 5. 截断提示
  if (result.truncated) {
    lines.push(`${TREE_INDENT}   [Output truncated]`);
  }

  return lines.join('\n');
}

/**
 * 简化的摘要格式（用于紧凑显示）
 * 注意：这个函数返回的摘要不包含耗时，耗时由 setComplete 统一追加
 */
export function formatBashSummary(result: BashToolResult): string {
  const status = result.timedOut
    ? STATUS_TIMEOUT
    : result.exitCode === 0
      ? STATUS_SUCCESS
      : STATUS_ERROR;

  if (result.timedOut) {
    return `${status} Timed out`;
  }

  if (result.exitCode === 0) {
    const lineCount = result.stdout.split('\n').length;
    if (lineCount > 1) {
      return `${status} Done (${lineCount} lines)`;
    }
    const firstLine = result.stdout.split('\n')[0] || '';
    // 使用 truncateAtWord 确保单词边界截断
    return `${status} ${truncateAtWord(firstLine, 40)}`;
  }

  // 错误情况：使用 truncateAtWord 确保截断在单词边界
  const errorPreview = result.stderr.split('\n')[0] || 'Unknown error';
  return `${status} ${truncateAtWord(errorPreview, 40)}`;
}