# Plan 18: Commands/Skills 系统全面改造 - 达到 Claude Code 级别

**Date**: 2026-05-17 (v3.0 - Comprehensive Analysis & Reform Plan)
**Status**: Planning Phase - Critical Issues Identified
**Target**: 投资助手 Dexter Command System v3 (Claude Code Level)
**Reference**: `/Users/louloulin/Documents/linchong/claw/loucode`

---

## Executive Summary

经过深度分析，发现 Dexter 当前命令系统存在**严重的架构问题**，与 loucode/Claude Code 存在巨大差距。需要全面重构才能达到生产级别。

**核心问题统计**:
- `slash-commands.ts`: 41 个静态定义
- `cli.ts handleSlashCommand`: ~30 个 switch/case 硬编码实现
- `commands.ts registry`: ~35 个注册命令
- loucode: 115+ 个命令，完整的类型系统

**关键差距**: 3 处定义不同步，缺少 PromptCommand 类型，无懒加载，UI 简陋

---

## 1. 问题分析 (真实情况)

### 1.1 命令定义三处不同步 (CRITICAL)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Dexter Commands 当前问题架构                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [slash-commands.ts] ──── 41 个静态定义 ──── 无 execute()                    │
│          │                        │                                        │
│          │                        │ 无法自动同步                            │
│          ▼                        ▼                                        │
│  [cli.ts handleSlashCommand] ──── ~30 个 switch/case 实现 ──── 不在 registry │
│          │                                                                  │
│          │                        ┌─────────────────┐                       │
│          └───────────────────────→│ commands.ts     │                       │
│                                   │ registry        │                       │
│                                   │ ~35 个 execute()│                       │
│                                   └─────────────────┘                       │
│                                                                             │
│  用户输入 /xxx 后的行为完全不可预测！                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**实际代码分析**:

#### cli.ts handleSlashCommand (行 488-996)
```typescript
// 约 30 个命令直接在 switch/case 中实现
// 这些命令不在 CommandRegistry 中！
const handleSlashCommand = async (commandName: string, commandArgs: string = '') => {
  switch (commandName) {
    case 'model': ...
    case 'rules': ...
    case 'clear': ...
    case 'memory': ...
    case 'heartbeat': ...
    case 'history': ...
    case 'help': ...
    case 'plan': ...
    case 'exit-plan': ...
    case 'add-step': ...
    case 'steps': ...
    case 'agent': ...
    case 'tasks': ...  // 直接访问 subagent runner
    case 'fork': ...
    case 'status': ... // ~80 行状态展示
    case 'cost': ...   // ~60 行成本展示
    case 'compact': ...
    case 'doctor': ... // ~60 行健康检查
    case 'theme': ...
    case 'mcp': ...    // ~30 行 MCP 状态
    case 'permissions': ...
    case 'approve': ...
    case 'deny': ...
    case 'reset-permissions': ...
    case 'proactive': ...
    case 'events': ...
    case 'session': ...  // 调用 sessionSelection.startSelection()
    case 'resume': ...    // ~40 行会话恢复
    case 'continue': ...
    default: {
      // 回退到 CommandRegistry
      const registry = getGlobalRegistry();
      // ...
    }
  }
}
```

**问题**:
1. `status`, `cost`, `doctor`, `mcp`, `permissions` 等命令有完整的实现 (~300 行)
2. 这些实现不在 registry 中，无法通过 `registry.list()` 获取
3. 无法通过 skills 系统调用
4. `tasks` 命令直接访问 `subagentRunner`，绕过了命令抽象

#### commands.ts registry (~35 个命令)
```typescript
// 已注册的命令
- help, clear, compact, status, echo, skills, reset, tools
- model, history, memory, config, sandbox
- git, diff, commit, branch
- agent, team
- export
// 总计约 25 个实际实现
```

**问题**:
1. 很多命令只有 stub 实现，不完整
2. `sandbox` 命令有完整实现
3. `agent` 命令尝试动态导入 `subagent-runner.js`

### 1.2 executor.ts 分析

**已创建的文件**:
- `packages/commands/src/executor.ts` - 统一执行入口
- `packages/commands/src/types/command-types.ts` - 类型定义

**executor.ts 实现的命令** (BUILTIN_COMMANDS):
```typescript
rules, heartbeat, approve, deny, continue, exit-plan, add-step,
steps, agent, fork, plan, model, memory, history, help, session,
resume, permissions, reset-permissions, sandbox, proactive, events, theme
```

**问题**:
1. 这些是 stub 实现，返回简单的提示文本
2. 没有真正的状态获取逻辑
3. `history` 命令尝试访问 `context.ui?.getHistory()` 但没有完整实现
4. CLI handleSlashCommand 仍然是 switch/case 主导，没有使用 executor

### 1.3 UI HintBar 分析

**Dexter HintBarComponent**:
```typescript
// src/components/hint-bar.ts
setSuggestions(commands: SlashCommand[], selectedIndex: number): void {
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const prefix = isSelected ? theme.primary('> ') : '  ';
    const name = isSelected ? theme.primary(`/${cmd.name}`) : theme.muted(`/${cmd.name}`);
    const desc = theme.muted(` — ${cmd.description}`);
    this.addChild(new Text(`${prefix}${name}${desc}`, 0, 0));
  }
}
```

**问题**:
1. 无 category 图标
2. 无 argumentHint 灰色提示
3. 无 whenToUse 描述
4. 无来源标注 (builtin, plugin, skills)
5. 无 shortcut hints

**loucode HelpV2**:
```typescript
// src/commands/help/help.tsx
export const call: LocalJSXCommandCall = async (onDone, { options: { commands } }) => {
  return <HelpV2 commands={commands} onClose={onDone} />;
}
```

**差距**: loucode 使用 React 组件渲染完整的帮助 UI，Dexter 使用简单的 Text

### 1.4 Skills 系统分析

**Dexter Skills** (`packages/commands/src/skills/`):
- `slash-command.ts` - 基础的 frontmatter 解析
- 只有 6 个字段: name, description, triggers, user_invocable 等

**loucode Skills** (`src/skills/`):
- 16+ 个 frontmatter 字段
- 文件提取支持
- hooks 支持
- depends-on 依赖管理
- 懒加载机制

### 1.5 Commands 目录结构对比

**loucode commands/** (117 个目录):
```
add-dir, advisor, agents, branch, btw, chrome, clear, color,
commit, compact, config, context, cost, daemon, diff, doctor,
effort, exit, feedback, files, fork, help, ide, init, keybindings,
login, logout, mcp, memory, mobile, model, permissions, plan,
pr_comments, release-notes, rename, resume, session, share, skills,
status, stickers, tasks, theme, vim, workflows, ...
```

**Dexter commands/** (无独立目录):
- 所有命令逻辑混在 `commands.ts` 中
- 无独立的命令实现文件
- 无懒加载机制

---

## 2. 详细问题汇总

### 2.1 CRITICAL 问题 (必须修复)

| # | 问题 | 影响 | 位置 |
|---|------|------|------|
| P1 | 命令定义三处不同步 | 新增命令需要修改三处 | cli.ts, commands.ts, slash-commands.ts |
| P2 | cli.ts handleSlashCommand 约 300 行 switch/case | 难以维护和测试 | src/cli.ts:488-996 |
| P3 | 很多命令是 stub 实现 | 功能不完整 | commands.ts, executor.ts |
| P4 | 无 PromptCommand 类型 | 无法实现 skills 注入 | types/command-types.ts |
| P5 | executor.ts 未被实际使用 | 之前的工作白费 | src/cli.ts 仍用 switch/case |

### 2.2 HIGH 问题 (影响功能)

| # | 问题 | 影响 | 解决方案 |
|---|------|------|----------|
| P6 | 无懒加载机制 | 启动慢 | LocalCommand.load() |
| P7 | commands.ts 无独立目录 | 难以扩展 | 创建 commands/ 子目录 |
| P8 | 状态命令 (status/cost) 实现重复 | 代码冗余 | 统一实现 |
| P9 | subagent runner 直接依赖 | 耦合过高 | 通过 interface 抽象 |

### 2.3 MEDIUM 问题 (影响体验)

| # | 问题 | 影响 | 解决方案 |
|---|------|------|----------|
| P10 | HintBar 无图标分类 | UI 简陋 | 添加 category icons |
| P11 | Skills frontmatter 不全 | 功能受限 | 扩展字段 |
| P12 | 无命令来源标注 | 用户困惑 | formatDescriptionWithSource() |

---

## 3. 改造计划

### Phase 0: 清理和统一 (最优先)

**目标**: 消除三处定义，统一执行入口

#### 0.1 识别所有命令并去重

```typescript
// packages/commands/src/all-commands.ts
// 单一命令定义文件，所有命令在这里定义

import type { Command } from './types/command-types.js'

// 本地命令实现
import { statusCommand } from './commands/status.js'
import { costCommand } from './commands/cost.js'
import { doctorCommand } from './commands/doctor.js'
import { mcpCommand } from './commands/mcp.js'
import { permissionsCommand } from './commands/permissions.js'
// ... 其他命令

export const ALL_COMMANDS: Command[] = [
  // 本地命令 (local type)
  statusCommand,
  costCommand,
  doctorCommand,
  mcpCommand,
  permissionsCommand,
  helpCommand,
  clearCommand,
  compactCommand,
  modelCommand,
  historyCommand,
  memoryCommand,
  // ... 全部 ~45 个命令

  // Skills (prompt type)
  skillsCommand,
  // ...
]

// 自动生成 builtInCommandNames
export const builtInCommandNames = new Set(
  ALL_COMMANDS.flatMap(c => [c.name, ...(c.aliases ?? [])])
)

// 自动生成 SLASH_COMMANDS
export const SLASH_COMMANDS = ALL_COMMANDS.map(cmd => ({
  name: cmd.name,
  description: cmd.description,
  category: inferCategory(cmd.name),
}))
```

#### 0.2 创建命令目录结构

```
packages/commands/src/
├── commands/           # 新目录结构
│   ├── status.ts
│   ├── cost.ts
│   ├── doctor.ts
│   ├── mcp.ts
│   ├── permissions.ts
│   ├── help.ts
│   ├── clear.ts
│   ├── compact.ts
│   ├── model.ts
│   ├── history.ts
│   ├── memory.ts
│   ├── git.ts         # git, diff, branch, commit
│   ├── agent.ts
│   ├── session.ts
│   ├── sandbox.ts
│   └── ...
├── skills/            # Skills 系统
│   ├── frontmatter.ts
│   ├── file-extractor.ts
│   └── bundled/
│       ├── skill1.md
│       └── skill2.md
├── types/
│   └── command-types.ts
├── executor.ts
├── registry.ts
├── slash-commands.ts  # 动态生成
├── index.ts
└── all-commands.ts     # 新增：统一命令定义
```

#### 0.3 迁移 cli.ts handleSlashCommand

```typescript
// cli.ts - 改造后
import { executeCommand } from '@upup/commands'

const handleSlashCommand = async (commandName: string, commandArgs: string = '') => {
  const result = await executeCommand(commandName, commandArgs, {
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
    sessionId: agentRunner.sessionId,
    model: modelSelection.model,
    // UI callbacks
    addText: (text) => chatLog.addChild(new Text(text, 0, 0)),
    clearChat: () => chatLog.clearAll(),
    requestRender: () => tui.requestRender(),
    // 状态获取
    getState: () => appState.getState(),
    getSession: () => sessionManager,
    // ...
  })

  // 统一处理结果
  switch (result.type) {
    case 'output':
      chatLog.addChild(new Spacer(1))
      chatLog.addChild(new Text(result.text, 0, 0))
      break
    case 'error':
      chatLog.addChild(new Spacer(1))
      chatLog.addChild(new Text(theme.error(result.message), 0, 0))
      break
    case 'clear':
      chatLog.clearAll()
      break
    // ...
  }

  tui.requestRender()
}
```

### Phase 1: 命令实现迁移

**目标**: 将 cli.ts 中的命令实现迁移到独立文件

#### 1.1 迁移 status 命令

```typescript
// packages/commands/src/commands/status.ts
import type { LocalCommand } from '../types/command-types.js'

export const statusCommand: LocalCommand = {
  type: 'local',
  name: 'status',
  description: 'Show system status and stats',
  aliases: ['info'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({
    call: async (args, context) => {
      // 从 context 获取状态
      const state = context.getState?.() ?? {}
      const session = context.getSession?.() ?? {}

      return {
        type: 'text',
        value: `UpUp System Status

Session:
  ID: ${state.sessionId?.substring(0, 20)}...
  Duration: ${session.formatDuration?.() ?? 'N/A'}

Model:
  ${state.model ?? 'default'} (${state.provider ?? 'unknown'})

Agent:
  Status: ${state.isProcessing ? 'busy' : 'idle'}
  Messages: ${state.messageCount ?? 0}

Tokens:
  Input: ${formatTokens(state.totalInputTokens ?? 0)}
  Output: ${formatTokens(state.totalOutputTokens ?? 0)}
  Cost: ${formatCost(state.totalCostUSD ?? 0)}`,
      }
    },
  }),
}
```

#### 1.2 迁移 cost 命令

```typescript
// packages/commands/src/commands/cost.ts
export const costCommand: LocalCommand = {
  type: 'local',
  name: 'cost',
  description: 'Show token usage and cost tracking',
  supportsNonInteractive: true,
  load: () => Promise.resolve({
    call: async (args, context) => {
      const state = context.getState?.() ?? {}
      const session = context.getSession?.() ?? {}
      const duration = session.getSessionDuration?.() ?? 0
      const hours = duration / (1000 * 60 * 60)
      const ratePerHour = hours > 0 ? (state.totalCostUSD ?? 0) / hours : 0

      return {
        type: 'text',
        value: `Token Usage & Cost

Session: ${session.formatDuration?.() ?? 'N/A'}
Model: ${state.model ?? 'default'}

Token Usage:
  Input:  ${formatTokens(state.totalInputTokens ?? 0)} tokens
  Output: ${formatTokens(state.totalOutputTokens ?? 0)} tokens
  Total:  ${formatTokens(state.totalTokens ?? 0)} tokens

Cost:
  Session cost: ${formatCost(state.totalCostUSD ?? 0)}
  Rate: ~${formatCost(ratePerHour)}/hour

Tool Usage:
  Total calls: ${state.totalToolCalls ?? 0}
  Errors: ${state.totalToolErrors ?? 0}`,
      }
    },
  }),
}
```

#### 1.3 迁移其他命令...

### Phase 2: Command Types 扩展

**目标**: 添加 prompt/local/local-jsx 完整支持

```typescript
// packages/commands/src/types/command-types.ts (扩展)

export interface PromptCommand extends CommandBase {
  type: 'prompt'
  progressMessage: string
  contentLength: number
  getPromptForCommand(args: string, context: ToolUseContext): Promise<ContentBlockParam[]>
  // ... 完整字段
}

export interface LocalCommand extends CommandBase {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>
}

export interface LocalJSXCommand extends CommandBase {
  type: 'local-jsx'
  load: () => Promise<LocalJSXCommandModule>
}

// 统一 Command 类型
export type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)
```

### Phase 3: Skills 系统

**目标**: 完整的 frontmatter 解析和文件提取

```typescript
// packages/commands/src/skills/frontmatter.ts

export interface SkillMetadata {
  // 基础字段
  name: string
  description?: string
  triggers: string[]
  user_invocable: boolean

  // 扩展字段
  allowedTools?: string[]
  whenToUse?: string
  argumentHint?: string
  argumentNames?: string[]
  model?: string
  context?: 'inline' | 'fork'
  effort?: 'minimal' | 'short' | 'medium' | 'long' | 'extended'
  paths?: string[]
  hooks?: HooksSettings
  files?: Record<string, string>
  dependsOn?: string[]
  version?: string
}

export function parseSkillFrontmatter(content: string): SkillMetadata {
  // 完整 YAML 解析
}

export async function extractSkillFiles(
  files: Record<string, string>,
  skillRoot: string
): Promise<void> {
  // 提取 files 中的文件到 skillRoot
}
```

### Phase 4: UI 增强

**目标**: Rich HintBar with icons

```typescript
// src/components/hint-bar.ts (扩展)

interface SlashCommand {
  name: string
  description: string
  category: 'core' | 'plan' | 'agent' | 'mcp' | 'permissions' | 'system' | 'git' | 'tools'
  argumentHint?: string
  icon?: string
  source?: 'builtin' | 'plugin' | 'skills' | 'bundled'
}

const CATEGORY_ICONS = {
  core: '📦',
  plan: '📋',
  agent: '🤖',
  mcp: '🔌',
  permissions: '🔒',
  system: '⚙️',
  git: '📚',
  tools: '🔧',
}

setSuggestions(commands: SlashCommand[], selectedIndex: number): void {
  this.clear()
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const icon = CATEGORY_ICONS[cmd.category] || '📎'
    const hint = cmd.argumentHint ? theme.dim(` ${cmd.argumentHint}`) : ''

    const prefix = i === selectedIndex ? theme.primary('> ') : '  '
    const name = i === selectedIndex
      ? theme.primary(`/${cmd.name}`)
      : theme.muted(`/${cmd.name}`)
    const desc = theme.muted(` — ${cmd.description}`)
    const source = cmd.source ? theme.dim(` (${cmd.source})`) : ''

    this.addChild(new Text(`${prefix}${icon} ${name}${desc}${hint}${source}`, 0, 0))
  }
}
```

---

## 4. 命令架构图 (Target)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Commands/Skills Target Architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    all-commands.ts (Single Source)                    │   │
│  │                                                                       │   │
│  │   import { statusCommand } from './commands/status.js'               │   │
│  │   import { costCommand } from './commands/cost.js'                   │   │
│  │   ...                                                                 │   │
│  │                                                                       │   │
│  │   export const ALL_COMMANDS: Command[] = [                           │   │
│  │     statusCommand,                                                   │   │
│  │     costCommand,                                                     │   │
│  │     // ... ~45 个命令                                                │   │
│  │   ]                                                                   │   │
│  │                                                                       │   │
│  │   // 自动生成                                                        │   │
│  │   export const builtInCommandNames = new Set(                        │   │
│  │     ALL_COMMANDS.flatMap(c => [c.name, ...c.aliases])                │   │
│  │   )                                                                   │   │
│  │                                                                       │   │
│  │   export const SLASH_COMMANDS = ALL_COMMANDS.map(cmd => ({           │   │
│  │     name: cmd.name,                                                  │   │
│  │     description: cmd.description,                                    │   │
│  │     category: inferCategory(cmd.name),                               │   │
│  │   }))                                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Command Types (Unified)                            │   │
│  │                                                                       │   │
│  │   PromptCommand    → getPromptForCommand() → 注入模型                 │   │
│  │   LocalCommand     → load() → call() → 直接输出                       │   │
│  │   LocalJSXCommand  → load() → React 组件渲染                         │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    executor.ts (Unified Entry)                       │   │
│  │                                                                       │   │
│  │   export async function executeCommand(                               │   │
│  │     name: string,                                                    │   │
│  │     args: string,                                                     │   │
│  │     context: CommandContext                                          │   │
│  │   ): Promise<CommandResult>                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 迁移步骤

### Step 1: 创建命令目录结构 (Day 1)

```bash
mkdir -p packages/commands/src/commands
mkdir -p packages/commands/src/skills/bundled
```

### Step 2: 迁移 status 命令 (Day 1)

创建 `packages/commands/src/commands/status.ts`

### Step 3: 迁移 cost 命令 (Day 1)

创建 `packages/commands/src/commands/cost.ts`

### Step 4: 迁移 doctor/mcp/permissions 命令 (Day 2)

### Step 5: 更新 all-commands.ts (Day 2)

### Step 6: 更新 cli.ts 使用 executor (Day 3)

### Step 7: 扩展 HintBar (Day 3)

### Step 8: 添加 Skills 支持 (Day 4-5)

---

## 6. 关键文件变更清单

### 6.1 New Files

| 文件 | 描述 | 优先级 |
|------|------|--------|
| `commands/all-commands.ts` | 统一命令定义 | P0 |
| `commands/status.ts` | status 命令实现 | P0 |
| `commands/cost.ts` | cost 命令实现 | P0 |
| `commands/doctor.ts` | doctor 命令实现 | P1 |
| `commands/mcp.ts` | mcp 命令实现 | P1 |
| `commands/permissions.ts` | permissions 命令实现 | P1 |
| `commands/help.ts` | help 命令 (local-jsx) | P2 |
| `skills/frontmatter.ts` | 扩展 frontmatter | P2 |
| `skills/file-extractor.ts` | 文件提取 | P2 |

### 6.2 Modify Files

| 文件 | 修改 | 优先级 |
|------|------|--------|
| `src/cli.ts` | 使用 executor | P0 |
| `packages/commands/src/index.ts` | 导出新模块 | P0 |
| `packages/commands/src/slash-commands.ts` | 动态生成 | P1 |
| `src/components/hint-bar.ts` | 添加图标 | P1 |
| `packages/commands/src/registry.ts` | 适配新类型 | P1 |

### 6.3 Delete Files (after migration)

| 文件 | 原因 |
|------|------|
| `packages/commands/src/executor.ts` | 功能合并到 all-commands.ts |

---

## 7. Success Metrics

| 指标 | 当前 | 目标 | 状态 |
|------|------|------|------|
| 命令定义位置 | 3 处 | 1 处 | 🔴 |
| 命令数量 | ~35 可用 | 45+ | 🟡 |
| Command Types | 1 (扁平) | 3 (prompt/local/local-jsx) | 🟡 |
| 命令目录结构 | 无 | 独立目录 | 🔴 |
| CLI handleSlashCommand | ~300 行 switch | ~50 行调用 | 🔴 |
| executor.ts 使用 | 未使用 | 实际使用 | 🔴 |
| UI 图标 | 无 | 有 | 🔴 |

---

## 8. 实施时间表

| Day | 任务 | 产出 |
|-----|------|------|
| Day 1 | 创建命令目录 + 迁移 status/cost | commands/status.ts, commands/cost.ts |
| Day 2 | 迁移 doctor/mcp/permissions + 更新 all-commands.ts | 完整命令定义 |
| Day 3 | 更新 cli.ts + 更新 hint-bar | executor 实际使用 |
| Day 4 | 添加 local-jsx 支持 (help) | commands/help.tsx |
| Day 5 | 扩展 Skills frontmatter | skills/frontmatter.ts |

---

## 9. 验证清单

- [ ] 所有 41 个 SLASH_COMMANDS 都有对应实现
- [ ] `/help` 显示所有可用命令
- [ ] 命令别名正常工作
- [ ] `status` 命令显示完整状态
- [ ] `cost` 命令显示完整成本
- [ ] HintBar 显示 category 图标
- [ ] CLI 使用 executor 而非 switch/case
- [ ] 命令定义在单一文件中

---

**Document Version**: 6.0 (Critical Issues Identified)
**Last Updated**: 2026-05-17
**Status**: Planning - Ready for Implementation
**Next Step**: Create commands/ directory and migrate status command