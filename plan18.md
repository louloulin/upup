# Plan 18: Commands/Skills 系统改造 - 达到 Claude Code 级别

**Date**: 2026-05-17
**Status**: Draft
**Target**: 投资助手 Dexter Command System v2

---

## Executive Summary

本文档对比分析 Dexter 当前 commands/skills 实现与参考实现 (loucode/Claude Code) 的差距,制定达到 Claude Code 级别的改造计划。

---

## 1. 当前实现问题分析

### 1.1 Commands 包问题

| 问题 | 当前状态 | 严重性 |
|------|----------|--------|
| **命令数量不足** | ~30 个命令 | 🔴 高 |
| **命令类型单一** | 只有 `type: 'prompt'` | 🔴 高 |
| **缺少本地命令** | 无 `type: 'local'` / `type: 'local-jsx'` | 🔴 高 |
| **权限系统简陋** | 只有 `admin/user/readonly` | 🟡 中 |
| **缺少 MCP 集成** | 无 `isMcp` 支持 | 🟡 中 |
| **缺少插件系统** | 无插件命令加载 | 🟡 中 |
| **缺少 Hooks** | 无 `before/after` hooks | 🟡 中 |
| **缺少上下文分发** | 无 `ToolUseContext` 传递 | 🟡 中 |

### 1.2 Skills 包问题

| 问题 | 当前状态 | 严重性 |
|------|----------|--------|
| **SKILL.md 解析简单** | 只解析 `name/description` | 🔴 高 |
| **缺少完整字段** | 无 `allowedTools/whenToUse/argNames` | 🔴 高 |
| **无文件提取** | 无 bundled skill 文件提取 | 🟡 中 |
| **无延迟加载** | 无 lazy load 命令实现 | 🟡 中 |
| **缺少权限控制** | 无 `user-invocable` 权限 | 🟡 中 |
| **无依赖解析** | 无 `dependsOn` 处理 | 🟡 中 |
| **无目录优先级** | 硬编码顺序 | 🟡 中 |

### 1.3 与 loucode 核心差异

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code Level                             │
├─────────────────────────────────────────────────────────────────────┤
│  Commands.ts (90KB)                                                  │
│  ├── 115+ commands with full types                                  │
│  ├── Local commands (TUI) via load()                               │
│  ├── JSX commands via LocalJSXCommandCall                           │
│  ├── MCP command integration                                       │
│  ├── Plugin command system                                         │
│  ├── Bundled skill system with file extraction                     │
│  ├── Frontmatter: allowedTools, whenToUse, argNames, model       │
│  ├── Hooks system (before/after)                                  │
│  ├── Availability system (claude-ai vs console)                    │
│  └── Token estimation for command content                          │
├─────────────────────────────────────────────────────────────────────┤
│                        Dexter Current                               │
├─────────────────────────────────────────────────────────────────────┤
│  commands.ts (50KB)                                                  │
│  ├── ~30 basic commands                                            │
│  ├── Only 'prompt' type                                            │
│  ├── No local/JSX commands                                         │
│  ├── Basic permission (admin/user/readonly)                        │
│  ├── No MCP integration                                            │
│  ├── No plugin system                                              │
│  └── No hooks/availability                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 参考实现详细分析

### 2.1 loucode Command Types (command.ts)

```typescript
// 三种命令类型
export type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  contentLength: number  // Token 估算
  argNames?: string[]
  allowedTools?: string[]
  model?: string
  source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'
  pluginInfo?: {...}
  hooks?: HooksSettings
  skillRoot?: string
  context?: 'inline' | 'fork'
  agent?: string
  effort?: EffortValue
  paths?: string[]
  getPromptForCommand(args, context): Promise<ContentBlockParam[]>
}

type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>  // 延迟加载
}

type LocalJSXCommand = {
  type: 'local-jsx'
  load: () => Promise<LocalJSXCommandModule>
}
```

### 2.2 loucode Frontmatter Schema

```yaml
---
name: skillify
description: Capture session as reusable skill
# 工具白名单
allowed-tools:
  - Read
  - Write
  - Bash
# 何时使用
when-to-use: |
  When the user wants to automate a repeatable process.
  Examples: 'skillify this workflow', 'save as skill'
# 参数提示
argument-hint: <optional-description>
# 模型选择
model: sonnet
# 用户可调用
user-invocable: true
# 禁用模型调用
disable-model-invocation: false
# Hooks
hooks:
  on_kill: "log session end"
# 依赖
depends-on:
  - memory
# 执行上下文
context: fork
agent: general-purpose
# 文件路径过滤
paths:
  - "src/**/*.ts"
  - "packages/*"
---

# Full instructions below...
```

### 2.3 loucode 命令注册流程

```typescript
// commands.ts 中的注册模式
const COMMANDS = memoize((): Command[] => [
  addDir, advisor, agents, branch, btw,
  // ... 100+ commands
  ...getDynamicSkills(),           // 从 skills/ 目录加载
  ...getBundledSkills(),           // 从 bundledSkills.ts 加载
  ...getPluginCommands(),          // 从插件加载
  ...getMCPSkillBuilders(),        // 从 MCP 服务器加载
])

// 动态加载流程
export function getDynamicSkills(): Command[] {
  const sources: SettingSource[] = [
    'projectSettings', 'userSettings', 'policySettings', 'plugin'
  ]
  return sources.flatMap(source => loadSkillsFromDir(source))
}
```

### 2.4 loucode Bundled Skills 模式

```typescript
// bundledSkills.ts - 代码内嵌的 skill
export function registerBundledSkill(definition) {
  const command: Command = {
    type: 'prompt',
    name: definition.name,
    // ... 支持文件提取
    files: Record<string, string>,
    getPromptForCommand: async (args, ctx) => {
      // 自动提取 files 到磁盘并注入 base dir
    }
  }
}

// 使用示例
registerBundledSkill({
  name: 'skillify',
  description: 'Capture session as reusable skill',
  whenToUse: 'When user wants to automate a process',
  files: {
    'SKILL.md': '# Instructions...',
    'examples/basic.md': '# Example...'
  },
  getPromptForCommand: async (args, ctx) => {
    return [{ type: 'text', text: skillContent }]
  }
})
```

---

## 3. 架构图

### 3.1 Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Command System v2                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │
│  │   /help     │    │   /skills   │    │   /config   │           │
│  │   (core)    │    │  (dynamic)  │    │  (dynamic)  │           │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘           │
│         │                    │                    │                   │
│  ┌──────┴────────────────────┴────────────────────┴───────┐         │
│  │                    CommandRegistry                     │         │
│  │  ┌─────────────────────────────────────────────────┐  │         │
│  │  │  Builtin Commands  │  Skills  │  Plugins  │ MCP │  │         │
│  │  │     (~115)          │  (dir)   │           │     │  │         │
│  │  └─────────────────────────────────────────────────┘  │         │
│  └──────────────────────────────────────────────────────┘         │
│                              │                                     │
│  ┌───────────────────────────┴────────────────────────────┐          │
│  │                    CommandExecutor                    │          │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │          │
│  │  │  Prompt   │  │   Local    │  │   LocalJSX    │   │          │
│  │  │  Command  │  │  Command   │  │   Command     │   │          │
│  │  │ (getPrompt)│ │  (call())  │  │  (React Node) │   │          │
│  │  └────────────┘  └────────────┘  └────────────────┘   │          │
│  └───────────────────────────────────────────────────────┘          │
│                              │                                     │
│  ┌───────────────────────────┴────────────────────────────┐          │
│  │                    ToolUseContext                      │          │
│  │  cwd │ env │ model │ sessionId │ permission │ hooks  │          │
│  └───────────────────────────────────────────────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Skill Loading Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Skill Loading Flow                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Startup                                                             │
│    │                                                                │
│    ▼                                                                │
│  ┌─────────────────────┐                                           │
│  │  discoverSkills()   │  ← 扫描 skills/ 目录                      │
│  │  - builtin/         │     提取 frontmatter (轻量)                │
│  │  - user/            │     缓存 metadata                          │
│  │  - project/         │                                           │
│  └──────────┬──────────┘                                           │
│             │                                                        │
│             ▼                                                        │
│  ┌─────────────────────┐                                           │
│  │ buildSkillSection() │  ← 构建 system prompt                    │
│  │ 返回 name + desc    │     仅包含可用技能列表                     │
│  └──────────┬──────────┘                                           │
│             │                                                        │
│  User invokes /skill-name                                          │
│    │                                                                │
│    ▼                                                                │
│  ┌─────────────────────┐                                           │
│  │   getSkill(name)    │  ← 按需加载完整指令                       │
│  │   loadSkillFromPath │     解析完整 SKILL.md                     │
│  └──────────┬──────────┘                                           │
│             │                                                        │
│             ▼                                                        │
│  ┌─────────────────────┐                                           │
│  │ executeSkill()      │  ← 注入指令到 prompt                       │
│  │ - check dependsOn   │     处理 hooks                            │
│  │ - extract files     │     执行文件提取                          │
│  │ - build prompt     │     构建完整 prompt                       │
│  └─────────────────────┘                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Permission System

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Permission Levels                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │    readonly     │    │      user       │    │      admin      │ │
│  │   (默认)        │    │  (大多数用户)    │    │   (特权操作)     │ │
│  ├─────────────────┤    ├─────────────────┤    ├─────────────────┤ │
│  │ /help           │    │ /git commit     │    │ /reset-perms    │ │
│  │ /status         │    │ /model switch   │    │ /daemon restart │ │
│  │ /compact        │    │ /session        │    │ /plugin reload  │ │
│  │ /history        │    │ /skills         │    │ /init          │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Availability System                          ││
│  │  'claude-ai' - claude.ai 订阅者专有                             ││
│  │  'console'   - Console API 用户专有                            ││
│  │  无声明      - 所有用户可用                                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4 Hook System

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Hook Lifecycle                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Skill Definition                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ hooks:                                                         ││
│  │   on_resume: "restore session context"                         ││
│  │   on_kill: "save checkpoint"                                   ││
│  │   after_tool: "log tool usage"                                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    HookManager                                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         ││
│  │  │on_resume │  │ on_kill │  │ on_begin │  │after_tool│         ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    HookExecutor                                ││
│  │  - Sequential execution for dependencies                      ││
│  │  - Error isolation per hook                                   ││
│  │  - Timeout handling                                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 改造计划

### Phase 1: 基础类型增强 (Week 1)

#### 1.1 扩展 Command Types

```typescript
// packages/commands/src/types.ts 新增

// 新增命令类型
export type LocalCommand = {
  type: 'local'
  supportsNonInteractive: boolean
  load: () => Promise<LocalCommandModule>
}

export type LocalJSXCommand = {
  type: 'local-jsx'
  load: () => Promise<LocalJSXCommandModule>
}

export type Command = PromptCommand | LocalCommand | LocalJSXCommand

// 新增 ToolUseContext
export interface ToolUseContext {
  cwd: string
  env: Record<string, string>
  sessionId: string
  model: string
  permission: CommandPermission
  hooks?: HooksSettings
  // ... 更多上下文
}

// 新增 HooksSettings
export interface HooksSettings {
  on_resume?: string
  on_kill?: string
  on_begin?: string
  after_tool?: string
  before_tool?: string
}
```

#### 1.2 扩展 Skills Types

```typescript
// packages/skills/src/types.ts 增强

export interface SkillMetadata {
  name: string
  description: string
  path: string
  source: SkillSource
  // 新增字段
  model?: SkillModel
  userInvocable?: boolean
  argumentHint?: string
  argumentNames?: string[]
  allowedTools?: string[]
  whenToUse?: string
  hooks?: HooksSettings
  context?: 'inline' | 'fork'
  agent?: string
  effort?: EffortValue
  paths?: string[]
  dependsOn?: string[]
  version?: string
  disableModelInvocation?: boolean
}
```

### Phase 2: 命令注册系统 (Week 2)

#### 2.1 命令目录结构

```
src/commands/
├── builtin/
│   ├── help/
│   ├── clear/
│   ├── compact/
│   ├── status/
│   └── ...
├── local/
│   ├── config/
│   ├── session/
│   └── ...
└── jsx/
    ├── init/
    ├── setup/
    └── ...
```

#### 2.2 动态命令加载

```typescript
// packages/commands/src/loader.ts

export function loadCommands(): Command[] {
  return [
    ...loadBuiltinCommands(),
    ...loadSkillsFromDir(),
    ...loadPluginCommands(),
    ...loadBundledSkills(),
    ...loadMCPSkills(),
  ]
}
```

### Phase 3: Skills 系统增强 (Week 3)

#### 3.1 完整 Frontmatter 解析

```typescript
// packages/skills/src/loader.ts 增强

export function parseSkillFrontmatter(frontmatter: any): SkillMetadata {
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    model: frontmatter.model,
    userInvocable: frontmatter['user-invocable'],
    argumentHint: frontmatter['argument-hint'],
    argumentNames: frontmatter['argument-names'],
    allowedTools: frontmatter['allowed-tools'],
    whenToUse: frontmatter['when-to-use'],
    hooks: frontmatter.hooks,
    context: frontmatter.context,
    agent: frontmatter.agent,
    effort: frontmatter.effort,
    paths: frontmatter.paths,
    dependsOn: frontmatter['depends-on'],
    version: frontmatter.version,
    disableModelInvocation: frontmatter['disable-model-invocation'],
  }
}
```

#### 3.2 Bundled Skills 支持

```typescript
// packages/commands/src/bundled-registry.ts

export interface BundledSkillDefinition {
  name: string
  description: string
  whenToUse?: string
  allowedTools?: string[]
  model?: string
  files?: Record<string, string>
  getPromptForCommand(args, context): Promise<ContentBlockParam[]>
}

export function registerBundledSkill(def: BundledSkillDefinition): void
export function getBundledSkills(): Command[]
```

### Phase 4: 权限与 Hooks 系统 (Week 4)

#### 4.1 权限系统

```typescript
// packages/commands/src/permissions.ts

export type CommandAvailability = 'claude-ai' | 'console'

export function checkCommandAvailability(
  cmd: Command,
  context: ToolUseContext
): boolean

export function meetsAvailabilityRequirement(
  cmd: Command,
  authType: string
): boolean
```

#### 4.2 Hooks 系统

```typescript
// packages/hooks/src/command-hooks.ts

export class HookManager {
  registerHook(event: HookEvent, handler: HookHandler): void
  async triggerHook(event: HookEvent, context: HookContext): Promise<void>
  async triggerResumHook(sessionId: string): Promise<void>
  async triggerKillHook(): Promise<void>
}

export type HookEvent =
  | 'on_begin'
  | 'on_resume'
  | 'on_kill'
  | 'before_tool'
  | 'after_tool'
```

### Phase 5: MCP 集成 (Week 5)

#### 5.1 MCP Skill Builder

```typescript
// packages/mcp/src/skill-builder.ts

export function registerMCPSkillBuilder(
  serverName: string,
  builder: MCPSkillBuilder
): void

export interface MCPSkillBuilder {
  buildSkill(tool: MCPTool): Command | null
}
```

---

## 5. 新增命令清单

### 5.1 Core Commands (15)

| 命令 | 类型 | 描述 |
|------|------|------|
| /help | prompt | 显示帮助 |
| /clear | local | 清屏 |
| /compact | prompt | 上下文压缩 |
| /status | local | 系统状态 |
| /model | local | 模型切换 |
| /history | prompt | 历史记录 |
| /memory | prompt | 记忆查询 |
| /session | local-jsx | 会话管理 |
| /resume | prompt | 恢复会话 |
| /continue | prompt | 继续对话 |
| /theme | local-jsx | 主题设置 |
| /permissions | local | 权限管理 |
| /doctor | prompt | 健康检查 |
| /cost | prompt | 成本统计 |
| /version | local | 版本信息 |

### 5.2 Plan Mode Commands (5)

| 命令 | 类型 | 描述 |
|------|------|------|
| /plan | prompt | 进入计划模式 |
| /exit-plan | local | 退出计划模式 |
| /add-step | local | 添加步骤 |
| /steps | prompt | 列出步骤 |
| /approve | prompt | 批准计划 |

### 5.3 Agent Commands (8)

| 命令 | 类型 | 描述 |
|------|------|------|
| /agent | prompt | 启动子代理 |
| /tasks | prompt | 任务管理 |
| /jobs | prompt | 作业队列 |
| /fork | prompt | 分支执行 |
| /team | prompt | 团队管理 |
| /proactive | local | 主动模式 |
| /events | prompt | 事件历史 |
| /subscribe | prompt | 订阅事件 |

### 5.4 Git Commands (6)

| 命令 | 类型 | 描述 |
|------|------|------|
| /git | local | 运行 git |
| /diff | prompt | 显示 diff |
| /commit | local | 提交 |
| /branch | local | 分支操作 |
| /stash | local | stash |
| /cherry-pick | prompt | 摘樱桃 |

### 5.5 System Commands (10)

| 命令 | 类型 | 描述 |
|------|------|------|
| /config | local-jsx | 配置管理 |
| /export | local | 导出对话 |
| /onboard | local-jsx | 新手引导 |
| /setup | local-jsx | 设置向导 |
| /upgrade | local | 升级检查 |
| /mcp | prompt | MCP 状态 |
| /plugins | local-jsx | 插件管理 |
| /reload | local | 重载配置 |
| /daemon | local | Daemon 控制 |
| /sandbox | local | 沙箱设置 |

### 5.6 Skills Commands (5)

| 命令 | 类型 | 描述 |
|------|------|------|
| /skills | prompt | 列出技能 |
| /skillify | prompt | 创建技能 |
| /skill-edit | prompt | 编辑技能 |
| /skill-remove | local | 删除技能 |
| /skill-import | local | 导入技能 |

---

## 6. 关键文件变更

| 文件 | 变更类型 | 描述 |
|------|----------|------|
| `packages/commands/src/types.ts` | 新增 | 完整 Command 类型定义 |
| `packages/commands/src/registry.ts` | 重写 | 命令注册中心 |
| `packages/commands/src/bundled-registry.ts` | 新增 | Bundled skill 注册 |
| `packages/commands/src/loader.ts` | 重写 | 动态命令加载 |
| `packages/commands/src/permissions.ts` | 新增 | 权限检查系统 |
| `packages/skills/src/types.ts` | 扩展 | 完整 frontmatter 类型 |
| `packages/skills/src/loader.ts` | 重写 | 完整 skill 解析 |
| `packages/hooks/src/command-hooks.ts` | 新增 | Command hooks 系统 |
| `packages/mcp/src/skill-builder.ts` | 新增 | MCP skill builder |

---

## 7. 实施优先级

### P0 (必须实现)

1. 扩展 Command Types (Local/LocalJSX/Prompt)
2. 完整 frontmatter 解析
3. 命令注册中心重构
4. 权限系统
5. 基础命令实现 (~40 个)

### P1 (重要)

1. Hooks 系统
2. Skills 动态加载
3. Bundled Skills 支持
4. MCP 集成
5. Plugins 系统

### P2 (增强)

1. Availability 系统
2. Skillify 内置技能
3. 高级分析技能
4. 工作流系统

---

## 8. 成功标准

- [ ] 命令数量达到 50+ (vs 当前 30)
- [ ] 支持 3 种命令类型 (prompt/local/local-jsx)
- [ ] 完整 frontmatter 解析
- [ ] 权限系统完整
- [ ] Hooks 系统可用
- [ ] Skills 动态加载
- [ ] MCP skill builder
- [ ] 文档完整

---

## Appendix A: loucode Commands 完整列表

```
add-dir, autofix-pr, backfill-sessions, btw, good-claude, issue, feedback,
clear, color, commit, copy, desktop, commit-push-pr, compact, config,
context, cost, daemon, diff, ctx_viz, doctor, memory, help, ide, init,
init-verifiers, keybindings, login, logout, install-github-app, install-slack-app,
break-cache, mcp, mobile, onboarding, pr-comments, release-notes, rename,
resume, review, recap, session, share, skills, status, tasks, teleport,
agents-platform, security-review, bughunter, terminal-setup, usage, theme,
vim, force-snip, workflows, web, subscribe-pr, ultraplan, torch, peers,
fork, buddy, thinkback, thinkback-play, permissions, plan, fast, passes,
privacy-settings, hooks, files, branch, agents, plugin, reload-plugins,
rewind, heapdump, mock-limits, bridge-kick, version, summary, reset-limits,
ant-trace, perf-issue, sandbox-toggle, chrome, stickers, advisor, env,
exit, export, model, tag, output-style, remote-env, upgrade, extra-usage,
rate-limit-options, statusline, effort, stats, insights, oauth-refresh,
debug-tool-call
```

---

## Appendix B: loucode Bundled Skills

```
batch, claude-api, claude-api-content, claude-in-chrome, debug,
dream, hunter, keybindings, loop, lorem-ipsum, remember, run-skill-generator,
schedule-remote-agents, simplify, skillify, stuck, update-config, verify
```