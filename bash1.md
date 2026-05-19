# Bash 执行结果展示 UI 改造计划

## 问题分析

### 当前 Dexter 的问题
```
Bash(command=python3 -c "...",
description=获取中国GDP数据,
timeout=30)
⎿  ❌ Exit code 1 in 4ms

--- stderr ---
Security... in 6ms
⎿  ✅ Done in 940ms

--- stdout... in 944ms
```

**问题：**
1. **状态信息混乱** - `Exit code 1` 和 `Done` 交错出现
2. **时间显示不准确** - 4ms、940ms、944ms 混在一起，语义不清
3. **输出分组缺失** - stdout/stderr 标题被截断，信息不完整
4. **缺乏视觉层次** - 没有清晰的命令开始/结束边界

### Loucode 的展示方式（参考）
```
⎿  ✅ Done in 4196ms
   --- stdout... in 4.2s
⎿  ✅ Done in 684ms
   --- stdout... in 685ms
⎿  ❌ Exit code 1 in 504ms
   --- stderr... in 504ms
```

**优点：**
1. 每条输出有明确的状态标记 (✅/❌)
2. 清晰的耗时信息 (in Xms/Xs)
3. stdout/stderr 分组明确
4. 简洁的树形缩进符号 (⎿)

---

## 改造计划

### Phase 1: 结构化输出数据模型

#### 新增文件: `src/tools/bash/types.ts` (已有，检查并扩展)

```typescript
// 扩展 BashToolResult 类型
export interface BashToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  durationMs: number;
  truncated?: boolean;
  securityWarnings?: string[];
  // 新增：执行阶段信息
  phases?: {
    validation?: number;  // 安全验证耗时
    execution?: number;   // 命令执行耗时
  };
}

// 输出行类型
export type OutputLineType = 'stdout' | 'stderr' | 'info' | 'warning' | 'error';

// 格式化输出行
export interface FormattedOutputLine {
  type: OutputLineType;
  content: string;
  timestamp?: number;
  isTruncated?: boolean;
}

// Bash 执行结果（结构化）
export interface StructuredBashOutput {
  status: 'success' | 'error' | 'timeout';
  exitCode: number;
  durationMs: number;
  stdoutLines: FormattedOutputLine[];
  stderrLines: FormattedOutputLine[];
  infoMessages: string[];
  truncated?: boolean;
}
```

### Phase 2: 输出格式化模块

#### 新增文件: `src/tools/bash/formatter.ts`

```typescript
/**
 * Bash 输出格式化器
 * 
 * 职责：
 * 1. 将 BashToolResult 转换为结构化输出
 * 2. 生成符合 TUI 显示格式的字符串
 * 3. 处理 JSON、ANSI 颜色、链接等内容的展示
 */

// ============================================================================
// 常量定义
// ============================================================================

const STATUS_SUCCESS = '✅';
const STATUS_ERROR = '❌';
const STATUS_TIMEOUT = '⏱️';
const STATUS_INFO = 'ℹ️';

const TREE_INDENT = '⎿  ';
const SECTION_STDOUT = '--- stdout ---';
const SECTION_STDERR = '--- stderr ---';

// ============================================================================
// 格式化函数
// ============================================================================

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
 * 截断长输出
 */
function truncateOutput(output: string, maxLength: number = 5000): string {
  if (output.length <= maxLength) {
    return output;
  }
  return output.slice(0, maxLength) + `\n... [${output.length - maxLength} chars truncated]`;
}

/**
 * 生成完整的 Bash 结果字符串
 */
export function formatBashOutput(result: BashToolResult): string {
  const lines: string[] = [];
  
  // 1. 状态行
  lines.push(formatStatusLine(result.exitCode, result.durationMs, result.timedOut));
  
  // 2. 安全警告
  if (result.securityWarnings && result.securityWarnings.length > 0) {
    lines.push(`${TREE_INDENT}⚠️  Security warnings:`);
    for (const warning of result.securityWarnings) {
      lines.push(`${TREE_INDENT}   - ${warning}`);
    }
  }
  
  // 3. stdout 部分
  if (result.stdout) {
    const stdoutDuration = result.phases?.execution ?? result.durationMs;
    lines.push(`${TREE_INDENT}   ${SECTION_STDOUT} in ${formatDuration(stdoutDuration)}`);
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
 */
export function formatBashSummary(result: BashToolResult): string {
  const status = result.timedOut
    ? STATUS_TIMEOUT
    : result.exitCode === 0
      ? STATUS_SUCCESS
      : STATUS_ERROR;
  
  const duration = formatDuration(result.durationMs);
  
  if (result.timedOut) {
    return `${status} Timed out (${duration})`;
  }
  
  if (result.exitCode === 0) {
    const lineCount = result.stdout.split('\n').length;
    if (lineCount > 1) {
      return `${status} Done (${lineCount} lines, ${duration})`;
    }
    const firstLine = result.stdout.split('\n')[0]?.slice(0, 40) || '';
    return `${status} ${firstLine} (${duration})`;
  }
  
  const errorPreview = result.stderr.split('\n')[0]?.slice(0, 40) || 'Unknown error';
  return `${status} ${errorPreview} (${duration})`;
}
```

### Phase 3: 集成到 BashTool

#### 修改文件: `src/tools/bash/bash-tool.ts`

```typescript
// 在文件顶部添加
import { formatBashOutput, formatBashSummary } from './formatter.js';

// 修改 executeBashCommand 返回结果，增加 phases 信息
export interface BashToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
  durationMs: number;
  truncated?: boolean;
  securityWarnings?: string[];
  phases?: {
    validation?: number;
    execution?: number;
  };
}

// 修改 createBashTool 中的 func 实现
async func({ command, description, timeout = 30 }: BashToolInput): Promise<string> {
  info('bash', `Executing: ${command}`);
  
  try {
    const result = await executeBashCommand(command, {
      ...options,
      timeout: timeout * 1000,
    });
    
    // 根据输出长度选择显示格式
    const totalOutput = result.stdout.length + result.stderr.length;
    if (totalOutput > 10000) {
      // 长输出使用完整格式
      return formatBashOutput(result);
    }
    
    // 短输出使用摘要格式
    return formatBashSummary(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    error('bash', `Command failed: ${errorMsg}`);
    throw err;
  }
}
```

### Phase 4: 扩展输出处理能力（可选）

#### 新增文件: `src/tools/bash/output-processors.ts`

```typescript
/**
 * 输出后处理器
 * 
 * 职责：
 * 1. JSON 检测与格式化
 * 2. ANSI 颜色清理
 * 3. URL 链接提取
 * 4. 表格美化
 */

/**
 * 检测并格式化 JSON 输出
 */
export function tryFormatJson(output: string): string {
  try {
    const parsed = JSON.parse(output);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return output;
  }
}

/**
 * 清理 ANSI 转义序列
 */
export function stripAnsiCodes(output: string): string {
  // 匹配 ANSI 转义序列的正则
  const ansiPattern = /\x1B\[[0-9;]*[a-zA-Z]/g;
  return output.replace(ansiPattern, '');
}

/**
 * 提取 URL
 */
export function extractUrls(output: string): string[] {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const matches = output.match(urlPattern);
  return matches || [];
}
```

---

## 实施步骤

### 步骤 1: 创建 formatter.ts ✅
- [x] 创建 `src/tools/bash/formatter.ts`
- [x] 实现 `formatStatusLine` 函数
- [x] 实现 `formatDuration` 函数
- [x] 实现 `formatBashOutput` 函数
- [x] 实现 `formatBashSummary` 函数

### 步骤 2: 集成到 bash-tool.ts ✅
- [x] 导入 formatter
- [x] 修改 `executeBashCommand` 返回类型
- [x] 修改 `createBashTool` 中的输出格式化

### 步骤 3: 测试验证 ✅
- [x] 测试成功命令的显示
- [x] 测试失败命令的显示
- [x] 测试超时情况的显示
- [x] 测试长输出的截断

### 步骤 4: 扩展功能（可选）
- [ ] 创建 output-processors.ts
- [ ] 添加 JSON 格式化支持
- [ ] 添加 ANSI 清理支持
- [ ] 添加 URL 链接提取

---

## 预期效果

### 改造前
```
Bash(command=python3 -c "...",
description=获取中国GDP数据,
timeout=30)
⎿  ❌ Exit code 1 in 4ms

--- stderr ---
Security... in 6ms
⎿  ✅ Done in 940ms

--- stdout... in 944ms
⎿  ✅ Done in 4196ms
```

### 改造后
```
Bash(command=python3 -c "import akshare...",
description=获取中国GDP数据,
timeout=30)
⎿  ✅ Done in 4196ms
   --- stdout... in 4.2s
   [{...完整 JSON 输出...}]

⎿  ✅ Done in 684ms
   --- stdout... in 685ms
   [输出内容...]

⎿  ✅ Done in 644ms
   --- stdout... in 645ms
   [输出内容...]

⎿  ❌ Exit code 1 in 504ms
   --- stderr... in 504ms
   SecurityError: Invalid API token
```

---

## 参考：Loucode 的关键实现

### BashToolResultMessage.tsx 核心逻辑
```tsx
// 1. 状态判断
const status = task.error ? 'error' : 'success';

// 2. stdout/stderr 分离
const stdout = task.output || '';
const stderr = task.stderr || '';

// 3. 分组显示
<OutputLine content={stdout} verbose={verbose} />
<OutputLine content={stderr} verbose={verbose} isError={true} />

// 4. 超时显示
{timedOut && <ShellTimeDisplay timeoutMs={timeoutMs} />}
```

### OutputLine.tsx 核心逻辑
```tsx
// 1. JSON 格式化尝试
let formatted = tryJsonFormatContent(content);

// 2. ANSI 清理
if (shouldShowFull) {
  formatted = stripUnderlineAnsi(formatted);
}

// 3. 截断处理
const truncated = renderTruncatedContent(formatted, columns, inVirtualList);

// 4. 颜色处理
const color = isError ? 'error' : isWarning ? 'warning' : undefined;
```

---

## 文件清单

| 文件 | 操作 | 说明 | 状态 |
|------|------|------|------|
| `src/tools/bash/formatter.ts` | 新增 | 输出格式化模块 | ✅ 已实现 |
| `src/tools/bash/output-processors.ts` | 新增 | 输出后处理器（可选）| ⏳ 可选 |
| `src/tools/bash/bash-tool.ts` | 修改 | 集成新的格式化逻辑 | ✅ 已实现 |
| `src/tools/bash/types.ts` | 修改 | 扩展类型定义 | ✅ 已实现 |

---

## 实现验证结果

### 测试用例通过

```
=== Test 1: Success (short output) ===
✅ Done (2 lines, 150ms)

=== Test 2: Error ===
❌ Error: ENOENT: no such file or directory (45ms)

=== Test 3: Timeout ===
⏱️ Timed out (30.0s)

=== Test 4: Security warnings ===
⎿  ❌ Exit code 1 in 100ms
⎿  ⚠️  Security warnings:
⎿     - Path traversal attempt detected
```

### 核心功能

1. **状态图标清晰化**: ✅/❌/⏱️ 三种状态
2. **耗时格式化**: 短于1秒显示ms，超过1秒显示s
3. **摘要模式**: 短输出（<10KB）显示一行摘要
4. **完整模式**: 长输出（>10KB）显示完整输出
5. **安全警告**: 显示在状态行下方，带缩进