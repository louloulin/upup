/**
 * Bash 输出格式化器
 *
 * 职责：
 * 1. 将 BashToolResult 转换为结构化输出
 * 2. 生成符合 TUI 显示格式的字符串
 * 3. 支持 JSON 格式化和 ANSI 清理
 *
 * Plan 21 改动：
 * - 简化状态符号：✅→ →, ❌→ ✗, ⏱️→ ⏱
 * - 移除冗余的 "Done" 文字
 * - 不再重复显示耗时
 * - 成功时显示输出预览（不显示行数）
 */

import {
  tryJsonFormatContent,
  stripUnderlineAnsi,
  truncateAtWord,
} from './output-processors';

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
// 常量定义 - Plan 21: 简化符号
// ============================================================================

// 新符号: → 表示成功/导向，✗ 表示错误，⏱ 表示超时
const ARROW = '→';  // 成功/输出导向
const CROSS = '✗';  // 错误
const CLOCK = '⏱'; // 超时

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
 * 格式化执行状态行 (Plan 21: 简化版)
 */
function formatStatusLine(
  exitCode: number,
  durationMs: number,
  timedOut?: boolean
): string {
  if (timedOut) {
    return `${TREE_INDENT}${CLOCK} Timed out`;
  }
  if (exitCode === 0) {
    return `${TREE_INDENT}${ARROW} Done`;
  }
  return `${TREE_INDENT}${CROSS} Exit ${exitCode}`;
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
 * 简化的摘要格式 (Plan 21: 极简风格)
 *
 * 格式:
 * - 成功: → content (直接显示内容，不显示行数)
 * - 错误: ✗ error message
 * - 超时: ⏱ timeout
 * - 空输出: → exit 0
 *
 * 注意: 不再包含耗时，耗时由 tool-event.ts 的 setComplete 统一处理
 */
export function formatBashSummary(result: BashToolResult): string {
  // 超时
  if (result.timedOut) {
    return `${CLOCK} timeout`;
  }

  // 成功
  if (result.exitCode === 0) {
    const stdout = result.stdout.trim();
    if (!stdout) {
      return `${ARROW} exit 0`;
    }

    // 只显示第一行内容，简洁明了
    const lines = stdout.split('\n').filter(l => l.trim());
    const content = truncateAtWord(lines[0], 80);
    return `${ARROW} ${content}`;
  }

  // 错误：显示错误信息
  const stderr = result.stderr.trim();
  if (!stderr) {
    return `${CROSS} exit ${result.exitCode}`;
  }

  // 提取核心错误信息
  const firstLine = stderr.split('\n')[0] || 'error';
  const errorMsg = summarizeErrorMessage(firstLine, 80);
  return `${CROSS} ${errorMsg}`;
}

/**
 * 智能错误摘要 (Plan 21)
 * 1. 移除冗余路径前缀
 * 2. 提取核心错误信息
 * 3. 在单词边界截断
 */
function summarizeErrorMessage(error: string, maxLen: number): string {
  // 移除常见冗余前缀
  let msg = error
    // 移除 Python 路径
    .replace(/File ".*?", line \d+/g, '')
    // 移除 Node.js 路径
    .replace(/\/Users\/.*?\/node_modules\//g, '')
    // 移除 ANSI 颜色代码
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    // 移除多余空白
    .replace(/\s+/g, ' ')
    .trim();

  // 移除常见错误前缀
  msg = msg
    .replace(/^Error:\s*/i, '')
    .replace(/^Exception:\s*/i, '')
    .replace(/^Warning:\s*/i, '');

  return truncateAtWord(msg, maxLen);
}
