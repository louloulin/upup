# Plan 21: Bash UI 展示优化 + Skill 执行效率改进

## 问题分析

### 1. UI 展示问题 (✅ 已完成)

**旧格式 → 新格式：**
```
旧: ⎿  ✅ Done (13 lines) in 2.7s
新: ⎿  → 13 lines | {"name": "GDP"}
```

**已修复：**
| # | 问题 | 状态 |
|---|------|------|
| 1 | 冗余状态 `✅ Done` | ✅ 已修复 |
| 2 | 重复耗时 `in Xs` | ✅ 已修复 |
| 3 | 信息量少 | ✅ 已修复 |
| 4 | 错误截断 | ✅ 已修复 |
| 5 | 空输出处理 `✅  in 444ms` | ✅ 已修复 |

### 2. Bash 命令显示问题 (待修复)

**当前显示：**
```
Bash(command=python3 -c "
import akshare as ak
import json
#...", description=Fetch China GDP data,
timeout=30)
```

**问题：**

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| 1 | **命令过长** | 🔴 高 | Python 多行命令显示不完整 |
| 2 | **命令截断** | 🔴 高 | 关键代码被截断，无法识别 |
| 3 | **描述丢失** | 🟡 中 | description 参数被忽略 |
| 4 | **换行显示** | 🟡 中 | 多行命令显示混乱 |

**理想显示：**
```
⎿  python3 Fetch China GDP data → 13 lines | {"gdp": 126.5}
```

**目标格式：**
- 使用 `python3` 作为命令标识（提取命令的 base name）
- 使用 `description` 作为子标题
- 移除冗余的 `command=` 前缀
- 截断多行命令，只显示第一行或关键部分

### 2. macro-china Skill 执行问题

**当前执行模式：**
```
Bash() → Read /tmp/macro_err.txt → Bash() → Read /tmp/gdp_out.txt → Bash() ...
```

**发现的问题：**

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| 1 | **过度文件中介** | 🔴 高 | 先写文件再读文件，增加延迟 |
| 2 | **重复执行** | 🟡 中 | 同样的 akshare 命令执行多次 |
| 3 | **静默失败** | 🟡 中 | 某些命令失败但继续执行 |
| 4 | **缺少重试** | 🟡 中 | Tushare API 失败后没有重试逻辑 |

---

## 改造计划

### Phase 1: Bash UI 结果优化 (✅ 已完成)

**修改文件:**
- `src/tools/bash/formatter.ts` - 重写 `formatBashSummary`
- `src/components/tool-event.ts` - 简化 `setComplete`
- `src/components/chat-log.ts` - 简化 `setComplete`
- `src/tools/tool-renderers.ts` - 更新所有渲染器

**已实现格式:**
```
→ 13 lines | {"gdp": 126.5}  # 多行输出预览
→ hello world                     # 单行输出
→ exit 0                         # 空输出
✗ error message                  # 错误
⏱ timeout                       # 超时
```

### Phase 2: Bash 命令显示优化 (✅ 已完成)

**目标:** 优化 Bash 工具的 header 显示

**当前问题:**
```
Bash(command=python3 -c "
import akshare as ak
import json
...", description=Fetch China GDP data,
timeout=30)
```

**期望格式:**
```
python3 Fetch China GDP data
```

**实施步骤:**

```typescript
// src/components/tool-event.ts

// 提取命令基名
function extractCommandName(command: string): string {
  // python3 -c "..." → python3
  // node script.js → node
  // bash script.sh → bash
  const parts = command.trim().split(/\s+/);
  return parts[0] || command;
}

// 格式化工具名和参数
function formatToolName(name: string, args: Record<string, unknown>): string {
  // Bash(command=..., description=..., timeout=...)
  // → python3 Fetch China GDP data

  // 1. 提取命令名
  let cmdName = name;
  if (name === 'bash' && args.command) {
    cmdName = extractCommandName(args.command as string);
  }

  // 2. 优先使用 description
  if (args.description) {
    return `${cmdName} ${args.description}`;
  }

  // 3. 否则截断命令
  if (args.command) {
    const cmd = args.command as string;
    const firstLine = cmd.split('\n')[0];
    const truncated = truncateAtWord(firstLine, 40);
    return `${cmdName} ${truncated}`;
  }

  return cmdName;
}
```

**修改文件:**
- `src/components/tool-event.ts` - 重写 header 格式化逻辑

### Phase 3: macro-china Skill 优化 (待实施)

#### 1.1 简化状态显示

**修改文件:** `src/tools/bash/formatter.ts`

**新格式:**
```
# 成功 - 单行输出
⎿  python3 script.py → "hello world"

# 成功 - 多行输出
⎿  python3 script.py → 13 lines

# 成功 - 多行输出带预览
⎿  python3 script.py → 13 lines
   > {"name": "GDP", "value": 126.5}

# 错误
⎿  python3 script.py → ✗ error message

# 超时
⎿  python3 script.py → ⏱ timeout
```

**关键改动:**
- 移除 `✅ Done` 冗余，只保留 `→`
- 移除重复耗时
- 错误用 `✗` 替代 `❌ Exit code X`
- 使用 `→` 作为状态分隔符

#### 1.2 优化错误信息显示

**修改文件:** `src/tools/bash/output-processors.ts`

```typescript
// 新增: 智能错误摘要
function summarizeError(stderr: string, maxLen: number = 60): string {
  // 1. 提取关键错误信息
  // 2. 移除冗余路径
  // 3. 保留关键词不被截断
}

// 新增: JSON 错误解析
function parseErrorJson(stderr: string): { code?: string; message?: string } | null
```

#### 1.3 空输出处理

**修改文件:** `src/tools/bash/formatter.ts`

```typescript
// 空输出时显示退出码或命令
if (lineCount === 0) {
  return `⏺ exit ${exitCode}`;
}
```

---

### Phase 2: macro-china Skill 优化 (优先级: 中)

#### 2.1 直接输出模式

**修改策略:** 减少文件中介，直接输出

```bash
# 旧模式: 写文件 → 读文件
python3 -c "..." > /tmp/gdp.txt
Read /tmp/gdp.txt

# 新模式: 直接输出
python3 -c "import akshare as ak; print(ak.macro_china_gdp().tail(8).to_json(orient='records'))"
```

#### 2.2 错误处理增强

**新增功能:**
- 错误时显示具体原因
- 失败命令显示重试建议
- 超时时提供备选数据源

#### 2.3 并行数据获取

```typescript
// 并行获取多个指标
const [gdp, cpi, pmi] = await Promise.all([
  fetchGDP(),
  fetchCPI(),
  fetchPMI()
]);
```

---

### Phase 3: TUI 组件优化 (优先级: 中)

#### 3.1 ToolEventComponent 简化

**修改文件:** `src/components/tool-event.ts`

**改动:**
- 简化 setComplete 显示逻辑
- 移除重复的状态 emoji
- 优化错误信息截断

#### 3.2 ChatLogComponent 优化

**修改文件:** `src/components/chat-log.ts`

**改动:**
- 支持展开/折叠 Bash 输出
- 长输出显示部分预览
- 点击展开完整内容

---

## 实施步骤

### Step 1: 修改 formatter.ts (预计 30 分钟)

```typescript
// 新状态符号
const STATUS_SUCCESS = '→';
const STATUS_ERROR = '✗';
const STATUS_TIMEOUT = '⏱';

// formatBashSummary 简化
export function formatBashSummary(result: BashToolResult): string {
  if (result.timedOut) {
    return `⏱ timeout`;
  }
  if (result.exitCode !== 0) {
    return `✗ ${summarizeError(result.stderr)}`;
  }
  // 成功情况
  const lineCount = result.stdout.split('\n').length;
  if (lineCount === 1) {
    return `→ ${truncateAtWord(result.stdout, 50)}`;
  }
  // 多行：显示行数和预览
  const preview = result.stdout.split('\n').slice(0, 2).join(' | ');
  return `→ ${lineCount} lines | ${truncateAtWord(preview, 60)}`;
}
```

### Step 2: 修改 tool-event.ts (预计 20 分钟)

```typescript
// 简化 setComplete
setComplete(summary: string, duration: number) {
  // 不再追加耗时，因为 formatter 已经包含
  const detail = new Text(
    `${summary}`,
    0, 0
  );
}
```

### Step 3: 修改 output-processors.ts (预计 30 分钟)

```typescript
// 新增智能错误摘要
export function summarizeError(stderr: string, maxLen: number = 60): string {
  // 移除路径前缀
  let error = stderr.replace(/\/Users\/.*?\/node_modules\//g, '');
  error = error.replace(/\/usr\/.*?\/lib\//g, '');

  // 提取核心错误
  const lines = error.split('\n').filter(l => l.trim());
  const firstError = lines[0] || 'Unknown error';

  return truncateAtWord(firstError, maxLen);
}
```

### Step 4: 更新测试 (预计 20 分钟)

```typescript
// bash-tool.test.ts
it('should format success with single line', () => {
  const result = { exitCode: 0, stdout: 'hello world', stderr: '', durationMs: 100 };
  expect(formatBashSummary(result)).toBe('→ hello world');
});

it('should format success with multiple lines', () => {
  const result = { exitCode: 0, stdout: 'line1\nline2\nline3', stderr: '', durationMs: 100 };
  expect(formatBashSummary(result)).toContain('3 lines');
});

it('should format error with summarize', () => {
  const result = { exitCode: 1, stdout: '', stderr: 'Error: connection refused', durationMs: 100 };
  expect(formatBashSummary(result)).toBe('✗ connection refused');
});
```

---

## 验收标准

### Phase 1: UI 结果优化 ✅
- [x] Bash 执行结果显示简洁，不再有 `✅ Done` 冗余
- [x] 耗时只显示一次
- [x] 成功时显示输出预览（单行或前两行）
- [x] 错误信息完整可读
- [x] 空输出显示退出码

### Phase 2: 命令显示优化 ✅
- [x] Bash 工具显示命令名（如 `python3`）而非 `Bash`
- [x] 优先显示 `description` 作为子标题
- [x] 长命令自动截断，保留关键词
- [x] 多行命令只显示第一行

### Phase 3: Skill 优化 ⏳ (无需修改核心代码)

**分析结果：**
- Dexter 核心代码中没有文件中介实现
- macro-china skill 已是直接输出模式
- Phase 3 偏向用户体验优化，非核心代码修改

**优化目标（可选）：**
- [ ] 错误时显示重试建议
- [ ] 优化 skill 使用体验

---

## 文件变更清单

### Phase 1 (已完成)
| 文件 | 改动 | 状态 |
|------|------|------|
| `src/tools/bash/formatter.ts` | 重写 `formatBashSummary` | ✅ |
| `src/components/tool-event.ts` | 简化 `setComplete`，添加颜色处理 | ✅ |
| `src/components/chat-log.ts` | 简化 `setComplete`，添加颜色处理 | ✅ |
| `src/tools/tool-renderers.ts` | 更新所有渲染器使用新符号 | ✅ |
| `src/tools/bash/bash-tool.test.ts` | 更新测试用例 | ✅ |

### Phase 2 (已完成)
| 文件 | 改动 | 状态 |
|------|------|------|
| `src/components/tool-event.ts` | 重写 header 格式化逻辑，添加 formatBashArgs | ✅ |
| `src/components/tool-event.test.ts` | 新增测试用例 | ✅ |

### Phase 3 (无需修改核心代码)
| 项目 | 说明 |
|------|------|
| Dexter 核心代码 | 无需修改 |
| Skill 体验优化 | 可选的体验改进 |

---

## 预计工时

| Phase | 内容 | 预计工时 | 状态 |
|-------|------|----------|------|
| Phase 1 | UI 结果优化 | 1.5 小时 | ✅ 已完成 |
| Phase 2 | 命令显示优化 | 1 小时 | ✅ 已完成 |
| Phase 3 | Skill 体验 | 0 小时 | ⏳ 可选 |

**核心代码修改已完成**
