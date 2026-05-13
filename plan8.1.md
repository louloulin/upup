# Plan 8.1: 命令理解与执行问题修复

> **问题**: UpUp 在执行简单命令如 `ls` 时，将命令错误地当作"分析"任务处理，而不是直接执行 shell 命令
> **日期**: 2026-05-13
> **分支**: feature/plugin-ui-fix

---

## 1. 问题分析

### 1.1 症状

```
❯ 执行ls

⏺ Glob(pattern=*)
⎿  No files found matching pattern: * in 3ms

⏺ 当前工作目录下没有文件。是个空目录。

✻ 3s

❯ 执行pwd

⏺ Glob(pattern=*, path=.)
⎿  No files found matching pattern: * in 2ms
```

**问题**: 用户输入 `ls` 被转换为 Glob 工具调用，而不是 Bash 工具执行。

### 1.2 根本原因

**Claude Code (Loucode) 的设计**:

1. **独立工具**: Claude Code 有独立的 `BashTool`、`GlobTool`、`GrepTool` 等，每个工具职责明确
2. **语义分类**: `isSearchOrReadBashCommand()` 将 `ls` 分类为"list"命令，决定是否折叠显示
3. **Prompt 指令**: System prompt 明确告诉模型何时使用哪个工具

```typescript
// Claude Code 明确区分工具
BASH_TOOL_NAME = 'Bash'
GLOB_TOOL_NAME = 'Glob'

// ls 会被分类为 list 命令 (非 search/read)
const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du']);
```

**UpUp 当前的问题**:

1. **工具定义模糊**: `ls` 命令可能被映射到 Glob 工具或 Bash 工具，没有明确分类
2. **Prompt 缺少指令**: System prompt 没有明确告诉模型何时用 Bash 工具执行 `ls`
3. **工具映射混乱**: 可能存在 Glob 和 Bash 之间的冲突

### 1.3 Claude Code vs UpUp 架构对比

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code (Loucode)                     │
├─────────────────────────────────────────────────────────────┤
│ Tool Pool (assembleToolPool):                               │
│   - BashTool (独立)                                         │
│   - GlobTool (独立)                                        │
│   - GrepTool (独立)                                         │
│   - FileReadTool (独立)                                     │
│   - FileEditTool (独立)                                     │
│   - ...                                                     │
│                                                              │
│ System Prompt 明确指令:                                      │
│   "Use GlobTool for pattern matching"                       │
│   "Use GrepTool for text searching"                         │
│   "Use BashTool for shell commands"                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    UpUp (当前)                              │
├─────────────────────────────────────────────────────────────┤
│ Tool Pool:                                                 │
│   - 工具定义可能混乱                                        │
│   - 缺少明确的工具选择指令                                   │
│   - BashTool 可能没有正确暴露给 LLM                         │
│                                                              │
│ 问题:                                                       │
│   - 模型不知道 ls 应该用 BashTool                           │
│   - 模型将 ls 误解为"分析目录"而非"执行命令"                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 解决方案

### 2.1 方案 A: 修复工具定义和 Prompt (推荐)

**目标**: 明确工具边界，让模型正确选择 BashTool

**步骤**:

1. **修复工具定义**
   - 明确 `ls` 必须通过 BashTool 执行
   - GlobTool 只用于复杂的模式匹配 (如 `**/*.ts`)

2. **更新 System Prompt**
   ```markdown
   # 命令执行规则

   对于简单的 shell 命令（如 `ls`, `pwd`, `cat file.txt`），使用 BashTool。

   只有当需要复杂的文件模式匹配（如 `**/*.ts`, `**/*.js`）时，才使用 GlobTool。

   示例：
   - `ls` → BashTool
   - `ls -la` → BashTool
   - `**/*.ts` → GlobTool
   - `find . -name "*.ts"` → BashTool
   ```

3. **测试验证**

### 2.2 方案 B: 合并工具 (长期)

**目标**: 将 BashTool 和 GlobTool 合并，让 BashTool 处理所有 shell 操作

**优点**: 简化工具定义
**缺点**: 需要重构

---

## 3. 实现计划

### 3.1 第一阶段: 诊断和修复 (1-2 小时)

- [ ] 1.1 检查当前工具注册代码
- [ ] 1.2 确认 BashTool 正确暴露
- [ ] 1.3 更新 system prompt
- [ ] 1.4 测试 `ls` 命令

### 3.2 第二阶段: 完整测试 (1 小时)

- [ ] 2.1 测试基本命令: `ls`, `pwd`, `cat`, `echo`
- [ ] 2.2 测试管道命令: `ls | grep`, `cat file | head`
- [ ] 2.3 测试复杂模式: `**/*.ts`, `find . -name "*.ts"`

### 3.3 第三阶段: 验证和文档 (1 小时)

- [ ] 3.1 验证插件 UI 显示
- [ ] 3.2 更新文档
- [ ] 3.3 提交代码

---

## 4. 关键文件

| 文件 | 作用 |
|------|------|
| `src/agent/prompts.ts` | System prompt 定义 |
| `src/tools/bash/bash-tool.ts` | Bash 工具实现 |
| `src/tools/glob-tool.ts` | Glob 工具 (如存在) |
| `src/tools/registry/` | 工具注册表 |

---

## 5. 参考: Claude Code 工具定义

```typescript
// Claude Code tools.ts
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]), // 只有没有内嵌搜索时才单独用
    ExitPlanModeV2Tool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    // ...
  ]
}

// Claude Code BashTool 分类
const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du']);
const BASH_READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'more', ...]);

// Claude Code 明确: ls 是 list 命令，不是 search
function isSearchOrReadBashCommand(command: string): {
  isSearch: boolean;
  isRead: boolean;
  isList: boolean;
}
```

---

## 6. 验证清单

执行以下命令验证修复:

```bash
# 基本命令
❯ ls           # 应该执行 Bash，不是 Glob
❯ pwd          # 应该执行 Bash
❯ echo hello    # 应该执行 Bash

# 复杂模式 (如果 GlobTool 存在)
❯ **/*.ts      # 应该用 GlobTool
❯ find . -name "*.ts"  # 应该用 BashTool
```

---

## 7. 预期结果

**修复前**:
```
❯ ls → Glob(pattern=*) → "No files found"
```

**修复后**:
```
❯ ls → BashTool → 显示文件列表
```

---

## 附录 A: Claude Code 命令分类源码

```typescript
// Claude Code: isSearchOrReadBashCommand
const BASH_SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', ...]);
const BASH_READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', ...]);
const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du']);
const BASH_SEMANTIC_NEUTRAL_COMMANDS = new Set(['echo', 'printf', 'true', 'false', ':']);
const BASH_SILENT_COMMANDS = new Set(['mv', 'cp', 'rm', 'mkdir', ...]);
```

---

## 附录 G: UpUp 问题根因完整分析

### 核心发现

**UpUp 有 BashTool 实现，但没有被加载到工具注册表！**

```
src/tools/bash/bash-tool.ts    ✅ 存在 (完整的 BashTool 实现)
src/tools/registry/domain-tools.ts ❌ 没有加载 BashTool
src/tools/registry/index.ts     ❌ getToolRegistry() 没有调用 bash 工具
```

### 证据

1. **BashTool 存在** (`src/tools/bash/bash-tool.ts`):
```typescript
export const BASH_TOOL_NAME = 'bash';
// 包含完整的命令执行、安全检查、权限管理
```

2. **BashTool 没有被注册** (`src/tools/registry/domain-tools.ts`):
```typescript
// loadDomainTools() 中没有添加 bash 工具
// 而其他工具如 read_file, write_file, glob 都被正确加载
```

3. **工具列表缺少 bash** (`src/tools/registry/filesystem-tools.ts`):
```typescript
export function loadFilesystemTools(): RegisteredTool[] {
  return [
    { name: 'read_file', ... },
    { name: 'write_file', ... },
    { name: 'edit_file', ... },
    { name: 'glob', ... },      // 存在
    { name: 'grep', ... },       // 存在
    // ❌ 没有 bash 工具！
  ];
}
```

### 为什么模型选择 Glob 而不是 Bash？

当用户输入 `ls` 时：
1. **模型可用的工具**: `glob`, `grep`, `read_file`, `write_file`, ...
2. **没有 `bash` 工具**
3. 模型需要理解用户意图是"列出文件"
4. `glob` 的描述: "Find files matching a glob pattern"
5. 模型认为 `glob` 更接近"列出文件"的需求
6. 模型选择 `glob`，因为它是唯一与文件列表相关的工具

### 正确的架构应该是

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code 的工具架构                        │
├─────────────────────────────────────────────────────────────────────┤
│ BashTool (bash)                                                     │
│ ├── 列出目录: ls, tree, du                                          │
│ ├── 读取文件: cat, head, tail, less                                 │
│ ├── 搜索: find, grep, rg, ag                                        │
│ ├── 执行命令: echo, printf, mkdir, rm, cp                           │
│ └── 所有其他 shell 命令                                              │
├─────────────────────────────────────────────────────────────────────┤
│ GlobTool (glob)                                                     │
│ └── 模式匹配: **/*.ts, src/**/*.js (只用于 glob 模式)                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        UpUp 当前的工具架构                           │
├─────────────────────────────────────────────────────────────────────┤
│ read_file, write_file, edit_file                                    │
│ glob (用于模式匹配)                                                  │
│ grep (用于内容搜索)                                                  │
│                                                                     │
│ ❌ 没有 bash 工具！                                                   │
│                                                                     │
│ 结果: 模型用 glob 来模拟 ls，错误百出                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 附录 H: 修复方案 (详细实施步骤)

### 步骤 1: 在 filesystem-tools.ts 中加载 BashTool

编辑 `src/tools/registry/filesystem-tools.ts`:

```typescript
// 添加导入
import { bashTool, BASH_TOOL_NAME } from '../bash/index.js';

// 在 loadFilesystemTools() 中添加
{
  name: BASH_TOOL_NAME,
  tool: bashTool,
  description: `Execute shell commands in the terminal. Use for:
- Listing directories: ls, tree, du
- Reading files: cat, head, tail
- Searching: find, grep
- File operations: mkdir, rm, cp, mv
- Any shell command`,
  compactDescription: 'Execute shell commands (ls, pwd, cat, grep, mkdir, etc.)',
  concurrencySafe: false,
  concurrencyMetadata: fileReadMetadata(), // 或者新建 bashMetadata()
},
```

### 步骤 2: 更新 System Prompt 添加工具选择规则

编辑 `src/agent/prompts.ts` 中的 `buildSystemPrompt()` 函数:

```typescript
// 在 toolDescriptions 后添加工具选择规则
const toolSelectionRules = `

## Tool Selection Rules

**For shell commands → use bash tool**
- ls, pwd, whoami → bash
- cat, head, tail, less → bash
- grep, find, locate → bash
- mkdir, rm, cp, mv → bash
- echo, printf, date → bash

**For file patterns → use glob tool**
- **/*.ts, **/*.tsx → glob
- src/**/*.js → glob

**For content search → use grep tool**
- Search text in files → grep
`;

return `... ${toolDescriptions} ${toolSelectionRules} ...`;
```

### 步骤 3: 修改 GlobTool 描述，避免误导

编辑 `src/tools/registry/filesystem-tools.ts`:

```typescript
{
  name: 'glob',
  tool: globTool,
  compactDescription: 'Find files by glob pattern (e.g., "**/*.ts"). DO NOT use for ls, cat, grep — use bash for those.',
  // 或者在 glob.js 中修改工具本身的描述
}
```

### 步骤 4: 测试验证

```bash
# 测试 ls 命令
❯ ls           # 应该是 bash 工具执行

# 测试 glob 模式
❯ **/*.ts      # 应该是 glob 工具执行

# 测试管道
❯ ls | grep src  # 应该是 bash 工具执行
```

---

## 附录 I: 参考 Claude Code 工具注册方式

```typescript
// Claude Code: src/tools.ts
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
    ExitPlanModeV2Tool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    // ...
  ]
}

// BashTool 是基础工具，总是加载
// GlobTool 只有在没有内嵌搜索工具时才单独使用
```

---

## 附录 J: 下一步行动清单

### 高优先级 (立即修复)
- [ ] 1. 在 `src/tools/registry/filesystem-tools.ts` 中导入并注册 `bashTool`
- [ ] 2. 更新 `src/agent/prompts.ts` 添加工具选择规则
- [ ] 3. 测试 `ls`, `pwd`, `cat` 命令

### 中优先级 (改进体验)
- [ ] 4. 修改 GlobTool 的 compactDescription，避免误导
- [ ] 5. 添加更多命令到 BashTool 的分类中
- [ ] 6. 测试管道命令 `ls | grep`

### 低优先级 (长期优化)
- [ ] 7. 参考 Claude Code 实现命令折叠显示 (isSearchOrReadBashCommand)
- [ ] 8. 实现后台任务自动转换
- [ ] 9. 添加命令执行进度显示

```typescript
// 搜索命令 - 用于模式/内容搜索
const BASH_SEARCH_COMMANDS = new Set([
  'find', 'grep', 'rg', 'ag', 'ack', 'locate', 'which', 'whereis'
]);

// 读取命令 - 用于查看文件内容
const BASH_READ_COMMANDS = new Set([
  'cat', 'head', 'tail', 'less', 'more',
  // 分析命令
  'wc', 'stat', 'file', 'strings',
  // 数据处理 - 管道中常用
  'jq', 'awk', 'cut', 'sort', 'uniq', 'tr'
]);

// 列表命令 - 用于列出目录内容
// 与 BASH_READ_COMMANDS 分开，避免 summary 显示 "Read N files" 而非 "Listed N directories"
const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du']);

// 语义中性命令 - 纯输出/状态命令，不影响管道的搜索/读取性质
// 例如 `ls dir && echo "---" && ls dir2` 仍然是读取操作
const BASH_SEMANTIC_NEUTRAL_COMMANDS = new Set([
  'echo', 'printf', 'true', 'false', ':'
]);

// 静默命令 - 成功时不产生 stdout
const BASH_SILENT_COMMANDS = new Set([
  'mv', 'cp', 'rm', 'mkdir', 'rmdir', 'chmod', 'chown', 'chgrp', 
  'touch', 'ln', 'cd', 'export', 'unset', 'wait'
]);
```

### 核心函数: isSearchOrReadBashCommand

```typescript
export function isSearchOrReadBashCommand(command: string): {
  isSearch: boolean;
  isRead: boolean;
  isList: boolean;
} {
  // 1. 使用 splitCommandWithOperators 解析命令
  const partsWithOperators = splitCommandWithOperators(command);
  
  // 2. 遍历每个部分，检测命令类型
  for (const part of partsWithOperators) {
    // 跳过重定向操作符
    if (part === '>' || part === '>>' || part === '>&') {
      skipNextAsRedirectTarget = true;
      continue;
    }
    
    // 跳过控制操作符
    if (part === '||' || part === '&&' || part === '|' || part === ';') {
      continue;
    }
    
    // 提取基础命令
    const baseCommand = part.trim().split(/\s+/)[0];
    
    // 跳过语义中性命令（echo, printf 等）
    if (BASH_SEMANTIC_NEUTRAL_COMMANDS.has(baseCommand)) {
      continue;
    }
    
    // 检查命令类型
    const isPartSearch = BASH_SEARCH_COMMANDS.has(baseCommand);
    const isPartRead = BASH_READ_COMMANDS.has(baseCommand);
    const isPartList = BASH_LIST_COMMANDS.has(baseCommand);
  }
  
  // 3. 管道中所有命令都必须属于同一类型才折叠
  // 例如 `cat file | grep pattern` 被视为读取命令
}
```

---

## 附录 C: GlobTool 工具定义 (GlobTool/prompt.ts)

```typescript
export const DESCRIPTION = `
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
`;

// 工具说明明确区分用途：
// - GlobTool: 模式匹配 (pattern matching)
// - BashTool: shell 命令执行 (shell commands)

// 示例：
// ✅ **/*.ts → GlobTool
// ✅ src/**/*.tsx → GlobTool
// ✅ file*.txt → GlobTool

// ❌ ls → BashTool (不是 GlobTool)
// ❌ find . -name "*.ts" → BashTool
```

---

## 附录 D: UpUp 问题根因与修复方案

### 问题根因分析

| 方面 | Claude Code | UpUp |
|------|-------------|------|
| 工具分离 | BashTool/GlobTool/GrepTool 完全独立 | 工具边界模糊 |
| 命令分类 | `ls` = BASH_LIST_COMMANDS | `ls` 可能被映射到 Glob |
| Prompt 指令 | 明确告诉模型何时用哪个工具 | 缺少工具选择规则 |
| 工具描述 | GlobTool 描述明确排除 shell 命令 | 工具描述可能误导模型 |

### 修复方案

#### 方案 A: 更新 System Prompt (立即可行)

在 `src/agent/prompts.ts` 中添加：

```markdown
## 工具使用规则

### BashTool (shell 命令执行器)
用于所有 shell 命令执行：
- `ls`, `pwd`, `whoami` → 列出目录
- `cat`, `head`, `tail` → 读取文件内容
- `grep`, `find` → 搜索内容/文件
- `mkdir`, `rm`, `cp` → 文件操作
- `echo`, `printf` → 输出文本
- 任何包含管道、重定向的命令

### GlobTool (文件模式匹配)
仅用于复杂的 glob 模式：
- `**/*.ts` → 匹配所有 TypeScript 文件
- `src/**/*.tsx` → 匹配 src 目录下所有 TSX
- `file*.txt` → 模式匹配文件名

### 决策规则
1. 如果命令包含 shell 操作符 (|, >, &&, ||) → BashTool
2. 如果是简单命令 (ls, pwd, cat) → BashTool
3. 只有 glob 模式 (**, *, ?) 需要文件查找 → GlobTool
```

#### 方案 B: 修改工具描述 (配合方案 A)

修改 GlobTool 的描述，明确排除 shell 命令：

```typescript
export const DESCRIPTION = `
- Pattern matching tool for finding files by name patterns
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- DO NOT use for shell commands (ls, cat, grep, find)
- For shell commands, use BashTool instead
`;

// 或者更简洁
export const DESCRIPTION = `
// 文件模式匹配工具
// ❌ 不要用于: ls, cat, grep, find 等 shell 命令
// ✅ 用于: **/*.ts, src/**/*.js 等 glob 模式
`
```

#### 方案 C: 移除或限制 GlobTool (备选)

如果 GlobTool 经常被误用，可以：
1. 将 GlobTool 的功能合并到 BashTool
2. 或者仅在需要复杂模式匹配时启用

---

## 附录 E: 验证命令

修复后执行以下命令验证：

```bash
# 应该使用 BashTool
❯ ls                    # BashTool → 显示文件列表
❯ pwd                   # BashTool → 显示当前目录
❯ cat package.json      # BashTool → 显示文件内容
❯ echo hello            # BashTool → 输出 hello

# 应该使用 GlobTool (仅当需要模式匹配)
❯ **/*.ts               # GlobTool → 列出所有 .ts 文件
❯ src/**/*.tsx          # GlobTool → 列出 src 下所有 .tsx
```

---

## 附录 F: 关键文件路径

| 文件 | 作用 | Claude Code 对应 |
|------|------|-----------------|
| `src/agent/prompts.ts` | System prompt 定义 | `src/prompts/system.ts` |
| `src/tools/bash-tool.ts` | Bash 工具实现 | `src/tools/BashTool/BashTool.tsx` |
| `src/tools/glob-tool.ts` | Glob 工具 | `src/tools/GlobTool/index.tsx` |
| `src/tools/registry.ts` | 工具注册 | `src/tools.ts` |

---

## 执行计划

### Phase 1: 诊断 (30分钟)
- [ ] 检查当前工具注册代码
- [ ] 确认 BashTool 正确暴露给 LLM
- [ ] 检查 System Prompt 内容

### Phase 2: 修复 Prompt (1小时)
- [ ] 更新 System Prompt 添加工具选择规则
- [ ] 修改 GlobTool 描述
- [ ] 添加示例说明

### Phase 3: 测试验证 (1小时)
- [ ] 测试 `ls`, `pwd`, `cat`
- [ ] 测试 glob 模式
- [ ] 验证工具选择正确

### Phase 4: 优化 (30分钟)
- [ ] 根据测试结果调整
- [ ] 清理不再需要的工具