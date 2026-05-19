# Plan 21: Bash UI 展示优化 + Skill 执行效率改进

## 问题分析

### 1. UI 展示问题

**当前输出示例：**
```
⎿  ✅ Done (13 lines) in 2.7s
⎿  ✅ Done (15 lines) in 583ms
⎿  ✅ Done (18 lines) in 6.6s
```

**发现的问题：**

| # | 问题 | 严重程度 | 说明 |
|---|------|----------|------|
| 1 | **冗余状态** | 🔴 高 | `✅ Done (X lines)` - emoji 和 "Done" 冗余 |
| 2 | **重复耗时** | 🔴 高 | `Done (X lines) in Xs` - 耗时出现两次 |
| 3 | **信息量少** | 🟡 中 | 只显示行数，没有输出预览 |
| 4 | **错误截断** | 🔴 高 | 错误信息被截断，关键词丢失 |
| 5 | **空输出处理** | 🟡 中 | `✅  in 444ms` - 没有内容 |

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

### Phase 1: Bash UI 优化 (优先级: 高)

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

### UI 优化
- [ ] Bash 执行结果显示简洁，不再有 `✅ Done` 冗余
- [ ] 耗时只显示一次
- [ ] 成功时显示输出预览（单行或前两行）
- [ ] 错误信息完整可读
- [ ] 空输出显示退出码

### 性能优化
- [ ] 减少不必要的文件读写
- [ ] macro-china skill 执行时间减少 30%

### 兼容性
- [ ] 所有现有测试通过
- [ ] 不破坏其他工具的显示

---

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `src/tools/bash/formatter.ts` | 重写 `formatBashSummary` |
| `src/tools/bash/output-processors.ts` | 新增 `summarizeError` |
| `src/components/tool-event.ts` | 简化 `setComplete` |
| `src/tools/bash/bash-tool.test.ts` | 更新测试用例 |

---

## 预计工时

- Phase 1 (UI 优化): 1.5 小时
- Phase 2 (Skill 优化): 2 小时
- Phase 3 (TUI 组件): 1 小时
- 测试和调试: 1 小时

**总计: ~5.5 小时**
