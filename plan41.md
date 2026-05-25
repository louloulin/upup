# Plan41.md - Upup vs Claude Code Skills 系统差距分析

> 更新时间: 2026-05-25

---

## 一、核心架构对比

### 1.1 文件组织

| 系统 | 核心文件 | 总行数 | 特点 |
|------|----------|--------|------|
| **Claude Code** | `loadSkillsDir.ts` | 1086 | 单一大型文件，高度内聚 |
| **Upup** | 分散在 20+ 文件 | ~7000 | 模块化拆分，但整合不足 |

### 1.2 架构图对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Claude Code Architecture                              │
└─────────────────────────────────────────────────────────────────────────────┘

  User: /skill-name
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  commands/skills/index.ts                                                 │
│  └── executeSlashCommand(commandName, args, toolUseContext)              │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  loadSkillsDir.ts → createSkillCommand() → getPromptForCommand()         │
│                                                                           │
│  ✅ 完整集成:                                                           │
│  ├── substituteArguments()                                              │
│  ├── ${CLAUDE_SKILL_DIR} 替换                                           │
│  ├── executeShellCommandsInPrompt()                                      │
│  │   ├── hasPermissionsToUseTool() ← 权限检查                            │
│  │   ├── BashTool.call() ← 集成 BashTool                                │
│  │   └── processToolResultBlock() ← 结果存储                             │
│  └── getAppState() → toolPermissionContext → alwaysAllowRules           │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent receives enriched prompt with shell outputs embedded              │
└───────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        Upup Architecture (Current)                           │
└─────────────────────────────────────────────────────────────────────────────┘

  User: /skill-name
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  src/cli.ts → handleSlashCommand()                                       │
│  └── executeSkillCommand(commandName, args)                              │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  src/skills/executor.ts → executeSkillCommand()                           │
│  ├── createSkillCommand() → getPromptForCommand()                        │
│  └── executeShellCommandsInPrompt()                                       │
│      ├── ⚠️ 使用 executeBashCommand() (已修复 P6)                        │
│      └── ❌ 缺少完整权限集成                                             │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent receives prompt with shell outputs (if ```! used)                 │
│  ⚠️ 缺少 processToolResultBlock() 结果存储                               │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 二、功能差距详细分析

### 2.1 权限系统对比

| 功能 | Claude Code | Upup | 差距 |
|------|-------------|------|------|
| `hasPermissionsToUseTool` | ✅ 完整实现 | ❌ 缺失 | **高** |
| `alwaysAllowRules` | ✅ 支持 | ⚠️ 类型定义存在 | **高** |
| `toolPermissionContext` | ✅ 完整传递 | ⚠️ 未使用 | **高** |
| 权限拒绝处理 | ✅ 抛出 `MalformedCommandError` | ❌ 无 | **高** |

**Claude Code 实现**:
```typescript
const permissionResult = await hasPermissionsToUseTool(
  shellTool,
  { command },
  context,
  createAssistantMessage({ content: [] }),
  '',
);

if (permissionResult.behavior !== 'allow') {
  throw new MalformedCommandError(
    `Shell command permission check failed: ${permissionResult.message}`
  );
}
```

### 2.2 结果存储对比

| 功能 | Claude Code | Upup | 差距 |
|------|-------------|------|------|
| `processToolResultBlock` | ✅ 完整实现 | ❌ 缺失 | **中** |
| 工具结果持久化 | ✅ 支持 | ❌ 无 | **中** |
| 结果格式化 | ✅ 复杂处理 | ⚠️ 简单处理 | **低** |

### 2.3 错误处理对比

| 功能 | Claude Code | Upup | 差距 |
|------|-------------|------|------|
| `MalformedCommandError` | ✅ 自定义错误 | ❌ 通用 Error | **中** |
| `ShellError` | ✅ 完整错误类型 | ❌ 无 | **中** |
| 错误格式化 | ✅ 区分 interrupted/failed | ⚠️ 简单 | **低** |
| 错误日志 | ✅ `logForDebugging` | ❌ 无 | **低** |

### 2.4 Shell 支持对比

| 功能 | Claude Code | Upup | 差距 |
|------|-------------|------|------|
| PowerShell 支持 | ✅ 懒加载 | ❌ 无 | **高** |
| `isPowerShellToolEnabled` | ✅ 运行时检查 | ❌ 无 | **高** |
| `shell` frontmatter | ✅ 支持 | ⚠️ 类型定义存在 | **中** |

---

## 三、缺失的关键模块

### 3.1 必须实现的模块

| # | 模块 | 文件位置 | 优先级 | 说明 |
|---|------|----------|--------|------|
| 1 | `hasPermissionsToUseTool` | `src/skills/permissions.ts` | **P0** | 权限检查核心函数 |
| 2 | `processToolResultBlock` | `src/skills/toolResultStorage.ts` | **P0** | 工具结果存储 |
| 3 | `toolPermissionContext` 集成 | `executor.ts` | **P0** | 传递权限上下文 |
| 4 | PowerShell 支持 | `src/skills/promptShellExecution.ts` | P1 | Shell 选择器 |

### 3.2 需要修复的类型定义

**src/skills/types.ts**:
```typescript
export interface ToolUseContext {
  getAppState?: () => AppState;  // ❌ AppState 未定义
  toolPermissionContext?: {
    alwaysAllowRules?: {
      command?: string[];
    };
  };
  cwd?: string;
}
```

---

## 四、改造计划

### Phase 1: 权限系统集成 (P0)

#### P1.1: 实现 hasPermissionsToUseTool

```typescript
// src/skills/permissions.ts

export interface PermissionResult {
  behavior: 'allow' | 'deny' | 'ask';
  message?: string;
}

export async function hasPermissionsToUseTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
  message: Message,
  inputSummary: string,
): Promise<PermissionResult> {
  // 1. 检查 toolPermissionContext.alwaysAllowRules
  // 2. 检查全局权限设置
  // 3. 返回权限结果
}
```

#### P1.2: 集成 toolPermissionContext

修改 `src/skills/executor.ts`:
```typescript
// 在 getPromptForCommand 中传递完整上下文
finalContent = await executeShellCommandsInPrompt(
  finalContent,
  {
    cwd: context?.cwd || process.cwd(),
    getAppState: () => ({
      toolPermissionContext: {
        alwaysAllowRules: {
          command: skill.allowedTools,  // 应用 allowed-tools
        },
      },
    }),
  } as ToolUseContext,
  `/${skill.name}`,
  skill.shell,
  skill.allowedTools
);
```

### Phase 2: 结果存储 (P0)

#### P2.1: 实现 processToolResultBlock

```typescript
// src/skills/toolResultStorage.ts

export interface ToolResultBlock {
  type: 'tool_use' | 'text';
  content: string | ContentBlock[];
  tool_use_id?: string;
}

export async function processToolResultBlock(
  tool: Tool,
  result: { stdout: string; stderr: string; interrupted: boolean },
  toolUseId: string,
): Promise<ToolResultBlock> {
  // 1. 格式化结果
  // 2. 创建 ToolResultBlock
  // 3. 存储到全局结果缓存
}
```

### Phase 3: 错误处理增强 (P1)

#### P3.1: 实现自定义错误类型

```typescript
// src/skills/errors.ts

export class MalformedCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedCommandError';
  }
}

export class ShellError extends Error {
  stdout: string;
  stderr: string;
  interrupted: boolean;

  constructor(stdout: string, stderr: string, interrupted: boolean) {
    super(`Shell command failed: ${stderr || stdout}`);
    this.stdout = stdout;
    this.stderr = stderr;
    this.interrupted = interrupted;
  }
}
```

### Phase 4: PowerShell 支持 (P2)

#### P4.1: 添加 Shell 选择器

```typescript
// src/skills/promptShellExecution.ts

import { isPowerShellToolEnabled } from '../utils/shell/shellToolUtils.js';

export async function executeShellCommandsInPrompt(
  text: string,
  context: ToolUseContext,
  slashCommandName: string,
  shell?: { commands?: string[] },
  allowedTools?: string[],
): Promise<string> {
  // 根据 shell 参数选择工具
  const shellTool = shell === 'powershell' && isPowerShellToolEnabled()
    ? getPowerShellTool()
    : BashTool;
  
  // 继续执行...
}
```

---

## 五、优先级和实施顺序

### 5.1 优先级矩阵

| 优先级 | 任务 | 工作量 | 依赖 |
|--------|------|--------|------|
| **P0** | hasPermissionsToUseTool 实现 | 中 | 无 |
| **P0** | toolPermissionContext 集成 | 小 | P0.1 |
| **P0** | 错误类型定义 | 小 | 无 |
| **P1** | processToolResultBlock 实现 | 大 | P0 |
| **P1** | 增强错误处理 | 中 | P1.1 |
| **P2** | PowerShell 支持 | 中 | P0 |

### 5.2 实施路线图

```
Week 1: P0 核心权限系统
  ├── P0.1: hasPermissionsToUseTool 实现
  ├── P0.2: toolPermissionContext 集成
  └── P0.3: 错误类型定义

Week 2: P1 结果存储和错误处理
  ├── P1.1: processToolResultBlock 实现
  └── P1.2: 增强错误处理

Week 3: P2 PowerShell 支持
  └── P2.1: Shell 选择器实现
```

---

## 六、验证清单

| # | 测试项 | 方法 | 预期结果 |
|---|--------|------|----------|
| 1 | 权限检查 | 使用 restricted 命令测试 | 拒绝执行 |
| 2 | allowedTools | 使用不在列表的命令 | Permission Denied |
| 3 | 结果存储 | 执行 shell 命令 | 结果正确嵌入 |
| 4 | 错误格式化 | 测试各种错误场景 | 正确错误信息 |
| 5 | PowerShell | 测试 `shell: powershell` | PowerShell 执行 |

---

## 七、总体进度

| Phase | 任务 | 状态 |
|-------|------|------|
| P0 | 权限系统集成 | ⏳ 待实施 |
| P1 | 结果存储 | ⏳ 待实施 |
| P2 | 错误处理增强 | ⏳ 待实施 |
| P3 | PowerShell 支持 | ⏳ 待实施 |

**当前进度: 0%** (准备开始)

---

## 八、附录: Claude Code 参考实现

### A.1 promptShellExecution.ts 关键部分

```typescript
// Claude Code: 完整的权限检查集成
const permissionResult = await hasPermissionsToUseTool(
  shellTool,
  { command },
  context,
  createAssistantMessage({ content: [] }),
  '',
);

if (permissionResult.behavior !== 'allow') {
  throw new MalformedCommandError(
    `Shell command permission check failed for pattern "${match[0]}": ${permissionResult.message}`
  );
}

// 完整的工具调用
const { data } = await shellTool.call({ command }, context);
const toolResultBlock = await processToolResultBlock(
  shellTool,
  data,
  randomUUID(),
);
```

### A.2 需要的 Upup 新增文件

```
src/skills/
├── permissions.ts           # 权限检查 (新增)
├── toolResultStorage.ts     # 结果存储 (新增)
├── errors.ts               # 错误类型 (新增)
├── promptShellExecution.ts  # 增强 (修改)
└── executor.ts            # 集成 (修改)
```
