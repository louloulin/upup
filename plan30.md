# Plan 30: UpUp 全面权限优化 - 统一架构改造计划

> 基于对 Claude Code 真实源码 (`/Users/louloulin/Documents/linchong/claw/loucode`) 的深度分析

---

## 一、项目起源与定位

### 1.1 改造来源

**UpUp (涨涨)** 是对 [Dexter](https://github.com/virattt/dexter) 的深度改造版本，融合了 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的核心设计理念。

### 1.2 本次分析范围

- **Claude Code 源码**: `/Users/louloulin/Documents/linchong/claw/loucode`
- **参考文档**: plan25.md, plan23.md, plan23.1.md

---

## 二、Claude Code 权限架构详解

### 2.1 核心文件位置 (Claude Code)

| 文件路径 | 核心功能 |
|---------|---------|
| `src/types/permissions.ts` | 权限类型定义 - PermissionMode、PermissionRule、PermissionDecision |
| `src/utils/permissions/PermissionMode.ts` | 权限模式配置 - 模式名称、符号、颜色元数据 |
| `src/utils/permissions/permissionSetup.ts` | 权限初始化 - `initialPermissionModeFromCLI`、`transitionPermissionMode` |
| `src/utils/permissions/permissions.ts` | 权限检查核心 - `hasPermissionsToUseTool`、`checkRuleBasedPermissions` |
| `src/utils/permissions/permissionsLoader.ts` | 权限规则加载 - `loadAllPermissionRulesFromDisk` |
| `src/utils/permissions/permissionRuleParser.ts` | 权限规则解析 - `Tool(content)` 格式 |
| `src/utils/permissions/PermissionUpdate.ts` | 权限更新操作 - `applyPermissionUpdate` |
| `src/utils/sessionState.ts` | 会话状态管理 - `notifyPermissionModeChanged` |

### 2.2 Claude Code PermissionMode 类型

```typescript
// src/types/permissions.ts

// 外部可见模式（用户可配置）
export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const

// 内部模式（包含 ant-only 的 auto）
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'
export type PermissionMode = InternalPermissionMode

// 模式配置元数据
export const PERMISSION_MODE_CONFIG = {
  'default': { title: 'Default', symbol: '', color: 'text' },
  'plan': { title: 'Plan Mode', symbol: '⏵⏵', color: 'planMode' },
  'acceptEdits': { title: 'Accept edits', symbol: '⏵⏵', color: 'autoAccept' },
  'bypassPermissions': { title: 'Bypass Permissions', symbol: '⏵⏵', color: 'error' },
  'dontAsk': { title: "Don't Ask", symbol: '⏵⏵', color: 'error' },
  'auto': { title: 'Auto mode', symbol: '⏵⏵', color: 'warning' },
}
```

### 2.3 Claude Code CLI 参数处理

```typescript
// src/utils/permissions/permissionSetup.ts

export function initialPermissionModeFromCLI({
  permissionModeCli,              // --permission-mode 参数
  dangerouslySkipPermissions,     // --dangerously-skip-permissions 参数
}): { mode: PermissionMode; notification?: string }

// 优先级顺序:
1. --dangerously-skip-permissions → bypassPermissions
2. --permission-mode → 指定模式
3. settings.permissions.defaultMode → 默认模式
4. 'default'
```

### 2.4 Claude Code 权限规则格式

```typescript
// src/utils/permissions/permissionRuleParser.ts

// 格式: "ToolName" 或 "ToolName(content)"
// 规则示例:
"Bash"                    // 允许所有 Bash 命令
"Bash(npm install)"       // 只允许 npm install
"Bash(python:*)"          // 允许所有 python 命令
"Read(CLAUDE.md)"         // 允许读取特定文件
"mcp__server1__*"         // MCP 工具通配符

// 权限行为
type PermissionBehavior = 'allow' | 'deny' | 'ask'

// 规则来源追踪
type PermissionRuleSource =
  | 'userSettings'      // 用户全局设置
  | 'projectSettings'   // 项目设置
  | 'localSettings'     // 本地设置
  | 'flagSettings'      // CLI 标志
  | 'policySettings'    // 托管策略 (MDM/Registry)
  | 'cliArg'            // --allowed-tools 参数
  | 'command'           // 命令注入
  | 'session'           // 会话状态
```

### 2.5 Claude Code 权限检查流程

```typescript
// src/utils/permissions/permissions.ts

export async function checkRuleBasedPermissions(
  tool: Tool,
  input: { [key: string]: unknown },
  context: ToolUseContext,
): Promise<PermissionAskDecision | PermissionDenyDecision | null>

// 检查顺序:
1. 工具级别拒绝规则 (getDenyRuleForTool)
2. 工具级别询问规则 (getAskRuleForTool)
3. 工具特定的命令级规则 (tool.checkPermissions)
4. 内容特定的询问规则
5. 安全检查 (safetyCheck)
6. 分类器决策 (classifierDecision - AI 辅助)
```

### 2.6 Claude Code 危险权限检测

```typescript
// src/utils/permissions/permissionSetup.ts

export function isDangerousBashPermission(toolName, ruleContent): boolean
export function isDangerousPowerShellPermission(toolName, ruleContent): boolean
export function isDangerousTaskPermission(toolName, ruleContent): boolean

// 危险模式列表:
const DANGEROUS_PATTERNS = [
  'python:*', 'python*',    // 解释器
  'node:*', 'node*',        // 运行时
  'iex', 'invoke-expression', // PowerShell 危险命令
  'Start-Process',
]

// 自动模式会剥离危险权限以防止分类器被绕过
```

### 2.7 Claude Code 拒绝跟踪机制

```typescript
// src/utils/permissions/denialTracking.ts

export interface DenialTrackingState {
  consecutiveDenials: number
  totalDenials: number
  lastDenialTime: number
}

export const DENIAL_LIMITS = {
  consecutive: 5,  // 连续拒绝上限
  total: 50,       // 总拒绝上限
}

// 防止无限拒绝循环
```

---

## 三、UpUp 当前权限架构

### 3.1 UpUp 权限文件位置

| 文件路径 | 核心功能 |
|---------|---------|
| `src/session/session-state.ts` | Session 级别权限模式 |
| `src/tools/bash/permission-mode.ts` | Bash 权限规则、PermissionStore |
| `src/tools/bash/command-classifier.ts` | 命令分类 (read/write/unknown) |
| `src/hooks/permission-hooks.ts` | Hook 系统权限检查 |
| `packages/sdk/src/permissions/manager.ts` | SDK 权限管理器 |
| `packages/sdk/src/permissions/types.ts` | SDK 权限类型定义 |

### 3.2 UpUp PermissionMode 类型

```typescript
// src/session/session-state.ts
export type PermissionMode =
  | 'default'           // 标准权限检查
  | '.accept-all'       // 接受所有提示
  | 'bypassPermissions' // 绕过所有检查
  | 'dangerously';      // 允许危险操作

// src/tools/bash/types.ts
export type PermissionMode = 'bypass' | 'allow' | 'ask' | 'deny';
```

### 3.3 UpUp 内置权限规则

```typescript
// src/tools/bash/permission-mode.ts - BUILT_IN_RULES

// bypass - 直接放行
{ pattern: /^pwd$/i, mode: 'bypass' }
{ pattern: /^ls(\s|$)/i, mode: 'bypass' }
{ pattern: /^git\s+(log|show|diff|status)/i, mode: 'bypass' }

// ask - 需要确认
{ pattern: /^rm\s+/i, mode: 'ask' }
{ pattern: /^git\s+(add|commit|push)/i, mode: 'ask' }

// deny - 直接拒绝
{ pattern: /^rm\s+-rf\s+\//i, mode: 'deny' }
{ pattern: /:\(\)\{:\|:&\};:/, mode: 'deny' }  // Fork bomb
```

---

## 四、详细差距分析

### 4.1 PermissionMode 对比

| 模式 | Claude Code | UpUp | 差距 |
|------|------------|------|------|
| 基础模式 | 9 种 | 4 种 | **UpUp 缺少 5 种** |
| `auto` | ✅ AI 分类器 | ❌ 无 | **Phase 2** |
| `dontAsk` | ✅ 不询问 | ❌ 无 | **Phase 1** |
| `bubble` | ✅ 气泡模式 | ❌ 无 | 暂不需要 |
| `acceptEdits` | ✅ 接受编辑 | ✅ 部分支持 | 需统一 |
| `bypassPermissions` | ✅ 绕过检查 | ✅ 支持 | ✅ 已实现 |
| `plan` | ✅ 规划模式 | ❌ 无 | **Phase 2** |

### 4.2 CLI 参数对比

| 功能 | Claude Code | UpUp | 实现状态 |
|------|------------|------|----------|
| `--dangerously-skip-permissions` | ✅ `--dangerously-skip-permissions` | ❌ 无 | **P0** |
| `--permission-mode` | ✅ 指定模式 | ❌ 无 | **P0** |
| `--allowed-tools` | ✅ 允许工具列表 | ❌ 无 | **P1** |
| 安全检查 | ✅ 根用户/沙箱检测 | ❌ 无 | **P0** |

### 4.3 规则系统对比

| 功能 | Claude Code | UpUp | 差距 |
|------|------------|------|------|
| 规则来源追踪 | ✅ 8 种来源 | ❌ 无 | **P1** |
| 优先级链 | ✅ user > project > policy > cli | ❌ 无 | **P1** |
| 规则语法 | ✅ `Tool(content)` | ⚠️ 简单正则 | 需改进 |
| MCP 工具支持 | ✅ `mcp__*` | ❌ 无 | **P2** |
| 托管策略 | ✅ MDM/Registry | ❌ 无 | 暂不需要 |
| 自动模式配置 | ✅ `autoMode` | ❌ 无 | **Phase 2** |

### 4.4 安全机制对比

| 功能 | Claude Code | UpUp | 差距 |
|------|------------|------|------|
| 敏感路径保护 | ✅ .git/, .claude/ | ❌ 无 | **P1** |
| 危险命令检测 | ✅ 多阶段检测 | ⚠️ 简单匹配 | 需改进 |
| 拒绝跟踪 | ✅ 连续/总数限制 | ❌ 无 | **P1** |
| 分类器辅助 | ✅ AI 双阶段分类 | ❌ 无 | **Phase 2** |
| 沙箱集成 | ✅ SandboxManager | ❌ 无 | **P2** |
| 根用户检测 | ✅ sudo/root 检查 | ❌ 无 | **P1** |

### 4.5 Hook 系统对比

| Hook 类型 | Claude Code | UpUp |
|-----------|------------|------|
| PermissionRequest | ✅ | ✅ 基础 |
| PreToolUse | ✅ | ❌ 无 |
| PostToolUse | ✅ | ❌ 无 |
| PreApproval | ✅ | ❌ 无 |
| PostApproval | ✅ | ❌ 无 |

---

## 五、统一架构设计

### 5.1 目标架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                    统一权限架构 (Plan30 Target)                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    入口层 (CLI/配置)                          │    │
│  │  ├─ --dangerously-skip-permissions                          │    │
│  │  ├─ --permission-mode <mode>                               │    │
│  │  ├─ --allowed-tools <tools>                                 │    │
│  │  └─ 环境变量 (UPUP_*)                                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 权限模式管理器 (PermissionModeManager)       │    │
│  │  ├─ setPermissionMode()                                    │    │
│  │  ├─ getPermissionMode()                                   │    │
│  │  ├─ cyclePermissionMode()                                  │    │
│  │  └─ 安全检查 (root/sandbox 检查)                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 规则加载器 (PermissionsLoader)              │    │
│  │  ├─ loadAllPermissionRulesFromDisk()                       │    │
│  │  ├─ getPermissionRulesForSource()                           │    │
│  │  └─ settingsJsonToRules()                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 权限检查器 (PermissionChecker)               │    │
│  │  ├─ hasPermissionsToUseTool()                              │    │
│  │  ├─ checkRuleBasedPermissions()                             │    │
│  │  ├─ checkSafety()                                          │    │
│  │  └─ recordDenial() / recordSuccess()                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 规则解析器 (PermissionRuleParser)            │    │
│  │  ├─ permissionRuleValueFromString()                         │    │
│  │  ├─ permissionRuleValueToString()                           │    │
│  │  ├─ escapeRuleContent()                                    │    │
│  │  └─ unescapeRuleContent()                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 统一类型定义

```typescript
// src/types/permissions.ts (新建统一类型文件)

// ============================================================================
// Permission Modes
// ============================================================================

// 外部可见模式
export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const

export type ExternalPermissionMode = (typeof EXTERNAL_PERMISSION_MODES)[number]

// 内部模式
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'
export type PermissionMode = InternalPermissionMode

// Bash 工具级别模式
export type BashPermissionMode = 'bypass' | 'allow' | 'ask' | 'deny'

// ============================================================================
// Permission Rules
// ============================================================================

export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export type PermissionRuleSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'cliArg'
  | 'command'
  | 'session'

export type PermissionRuleValue = {
  toolName: string
  ruleContent?: string
}

export type PermissionRule = {
  source: PermissionRuleSource
  ruleBehavior: PermissionBehavior
  ruleValue: PermissionRuleValue
}

// ============================================================================
// Permission Update
// ============================================================================

export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg'

export type PermissionUpdate =
  | { type: 'addRules'; destination: PermissionUpdateDestination; rules: PermissionRule[] }
  | { type: 'removeRules'; destination: PermissionUpdateDestination; patterns: string[] }
  | { type: 'replaceRules'; destination: PermissionUpdateDestination; rules: PermissionRule[] }

// ============================================================================
// Permission Decision
// ============================================================================

export type PermissionDecision = 'allow' | 'deny' | 'ask'

export type PermissionResult = {
  decision: PermissionDecision
  reason?: string
  ruleSource?: PermissionRuleSource
  suggestions?: string[]
}
```

### 5.3 统一配置格式

```json
// .claude/settings.json (统一配置文件)

{
  "permissions": {
    "defaultMode": "default",
    "allow": [
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(npm run:*)",
      "Read(CLAUDE.md)",
      "Read(README.md)"
    ],
    "ask": [
      "Bash(rm *)",
      "Bash(mkdir *)",
      "Bash(git add *)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)",
      "Bash(:(){ :|: & };:)"
    ],
    "autoMode": {
      "enabled": false,
      "allowClassifier": true,
      "softDeny": true
    }
  }
}
```

---

## 六、实施计划

### Phase 0: 基础准备 (1-2天)

**任务**: 创建统一类型文件，定义核心接口

**新建文件**:
- `src/types/permissions.ts` - 统一权限类型定义
- `src/utils/permissions/` - 权限工具目录

**迁移内容**:
- 从 `src/session/session-state.ts` 迁移 PermissionMode 类型
- 从 `src/tools/bash/types.ts` 迁移 BashPermissionMode 类型
- 从 `packages/sdk/src/permissions/types.ts` 迁移 SDK 类型

**验证**:
```bash
bun run typecheck
```

### Phase 1: CLI 参数 + 安全检查 (3-5天) ⭐ P0

**目标**: 实现 `--dangerously-skip-permissions` 和安全检查

**修改文件**:

1. **`src/cli.ts`** - 添加 CLI 参数解析
```typescript
program
  .option('--dangerously-skip-permissions', 'Skip all permission prompts')
  .option('--permission-mode <mode>', 'Set permission mode')
  .option('--allowed-tools <tools...>', 'Allow specific tools')
```

2. **`src/utils/permissions/permissionSetup.ts`** - 新建权限初始化
```typescript
export function initialPermissionModeFromCLI(args: {
  permissionModeCli?: string
  dangerouslySkipPermissions?: boolean
}): { mode: PermissionMode; notification?: string }

// 安全检查
export function shouldAllowBypassPermissionsMode(): boolean
export function isRunningAsRoot(): boolean
export function isInSandbox(): boolean
```

3. **`src/session/session-state.ts`** - 更新权限模式管理
```typescript
import { initialPermissionModeFromCLI } from '../utils/permissions/permissionSetup.js'
import { setPermissionMode } from './session-state.js'

// 初始化时读取 CLI 参数
const { mode } = initialPermissionModeFromCLI(argv)
if (mode) setPermissionMode(mode)
```

### Phase 2: 规则系统重构 (3-5天) ⭐ P1

**目标**: 实现统一规则解析和加载器

**新建文件**:
- `src/utils/permissions/permissionsLoader.ts`
- `src/utils/permissions/permissionRuleParser.ts`
- `src/utils/permissions/PermissionUpdate.ts`

**修改文件**:
- `src/tools/bash/permission-mode.ts` - 重构为统一规则格式

**关键实现**:

```typescript
// permissionsLoader.ts
export function loadAllPermissionRulesFromDisk(): PermissionRule[] {
  // 支持多源加载
  const sources: PermissionRuleSource[] = ['userSettings', 'projectSettings', 'localSettings']
  const rules: PermissionRule[] = []

  for (const source of sources) {
    const sourceRules = getPermissionRulesForSource(source)
    rules.push(...sourceRules)
  }

  return rules
}

// permissionRuleParser.ts
export function permissionRuleValueFromString(ruleString: string): PermissionRuleValue {
  // 解析 "ToolName(content)" 格式
  const match = ruleString.match(/^([^(\s]+)(?:\((.+)\))?$/)
  return match
    ? { toolName: match[1], ruleContent: match[2] }
    : { toolName: ruleString }
}
```

### Phase 3: 权限检查重构 (5-7天) ⭐ P1

**目标**: 实现 `checkRuleBasedPermissions` 和 `hasPermissionsToUseTool`

**新建文件**:
- `src/utils/permissions/permissions.ts` - 核心权限检查
- `src/utils/permissions/denialTracking.ts` - 拒绝跟踪

**修改文件**:
- `src/hooks/permission-hooks.ts` - 集成新检查器
- `src/tools/bash/bash-tool.ts` - 使用新权限检查

**关键实现**:

```typescript
// permissions.ts
export async function checkRuleBasedPermissions(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext
): Promise<PermissionResult> {
  // 1. 加载所有规则
  const rules = loadAllPermissionRulesFromDisk()

  // 2. 查找匹配的拒绝规则
  const denyRule = findDenyRule(tool, input, rules)
  if (denyRule) {
    return { decision: 'deny', reason: 'Denied by rule', ruleSource: denyRule.source }
  }

  // 3. 查找匹配的允许规则
  const allowRule = findAllowRule(tool, input, rules)
  if (allowRule) {
    return { decision: 'allow', ruleSource: allowRule.source }
  }

  // 4. 工具特定检查
  if (tool.checkPermissions) {
    const result = await tool.checkPermissions(input, context)
    if (result) return result
  }

  // 5. 安全检查
  const safetyResult = await checkSafety(tool, input)
  if (safetyResult.denied) {
    return { decision: 'deny', reason: safetyResult.reason }
  }

  // 6. 默认询问
  return { decision: 'ask' }
}

// denialTracking.ts
export const DENIAL_LIMITS = {
  consecutive: 5,
  total: 50,
}
```

### Phase 4: 规则格式兼容 (2-3天) ⭐ P2

**目标**: 支持 `Bash(content)` 格式，与 Claude Code 兼容

**修改文件**:
- `src/utils/permissions/permissionRuleParser.ts`
- `src/tools/bash/permission-mode.ts`

**关键实现**:

```typescript
// 支持的规则格式
const RULES = [
  "Bash",                    // 允许所有 Bash
  "Bash(git status)",        // 允许特定命令
  "Bash(git *)",             // 允许所有 git 子命令
  "Read(CLAUDE.md)",         // 允许读取特定文件
  "Read(src/**/*.ts)",       // 允许读取匹配文件
  "mcp__server__tool",       // MCP 工具
]

// 规则匹配逻辑
function matchRule(tool: string, input: unknown, rule: PermissionRule): boolean {
  if (rule.ruleValue.toolName !== tool) return false

  if (!rule.ruleValue.ruleContent) return true // 工具级别允许

  // 内容匹配
  const content = getContentFromInput(input)
  return globMatch(rule.ruleValue.ruleContent, content)
}
```

### Phase 5: 高级功能 (可选) ⭐ P2

**目标**: 实现 auto mode 和 AI 分类器

**新建文件**:
- `src/utils/permissions/autoModeState.ts`
- `src/utils/permissions/classifierDecision.ts` (可选)

**功能**:
- 自动模式配置
- AI 分类器辅助决策
- 拒绝限制跟踪

---

## 七、文件迁移计划

### 7.1 新目录结构

```
src/
├── types/
│   └── permissions.ts          # 新建: 统一类型定义
├── utils/
│   └── permissions/
│       ├── index.ts            # 导出入口
│       ├── PermissionMode.ts   # 模式配置
│       ├── permissionSetup.ts  # 新建: CLI 参数初始化
│       ├── permissions.ts      # 新建: 核心检查逻辑
│       ├── permissionsLoader.ts # 新建: 规则加载
│       ├── permissionRuleParser.ts # 新建: 规则解析
│       ├── PermissionUpdate.ts  # 权限更新
│       ├── denialTracking.ts   # 新建: 拒绝跟踪
│       └── autoModeState.ts   # 可选: 自动模式
├── session/
│   └── session-state.ts        # 修改: 使用统一类型
└── tools/
    └── bash/
        ├── permission-mode.ts  # 修改: 使用统一规则格式
        ├── bash-tool.ts        # 修改: 使用新权限检查
        └── command-classifier.ts # 修改: 保留分类逻辑
```

### 7.2 废弃文件

- `packages/sdk/src/permissions/types.ts` → 合并到 `src/types/permissions.ts`
- `src/tools/bash/types.ts` → 合并到 `src/types/permissions.ts`

---

## 八、测试计划

### 8.1 单元测试

```typescript
// src/utils/permissions/permissions.test.ts

describe('PermissionChecker', () => {
  describe('checkRuleBasedPermissions', () => {
    it('should allow matching allow rule')
    it('should deny matching deny rule')
    it('should ask when no rule matches')
    it('should respect rule priority')
  })

  describe('permissionRuleParser', () => {
    it('should parse "Tool" format')
    it('should parse "Tool(content)" format')
    it('should handle escaped parentheses')
    it('should normalize legacy tool names')
  })
})

describe('PermissionModeManager', () => {
  describe('initialPermissionModeFromCLI', () => {
    it('should prioritize --dangerously-skip-permissions')
    it('should use --permission-mode when specified')
    it('should fall back to default')
  })

  describe('setPermissionMode', () => {
    it('should update mode and notify listeners')
    it('should handle dangerous mode correctly')
  })
})
```

### 8.2 集成测试

```bash
# CLI 参数测试
bun test tests/cli/permissions-flag.test.ts

# 规则加载测试
bun test tests/permissions/loader.test.ts

# 规则匹配测试
bun test tests/permissions/matching.test.ts
```

---

## 九、向后兼容性

### 9.1 配置迁移

旧配置继续有效，自动转换为新格式:

```json
// 旧格式 (仍支持)
{
  "permissions": {
    "bypassCommands": ["ls", "pwd", "cat"]
  }
}

// 新格式 (推荐)
{
  "permissions": {
    "allow": ["Bash(ls)", "Bash(pwd)", "Read(*)"]
  }
}
```

### 9.2 API 兼容

- `setPermissionMode()` - 保持不变
- `getPermissionMode()` - 保持不变
- `isDangerousMode()` - 保持不变
- `checkPermission()` - 内部实现变更，API 不变

---

## 十、实施优先级总结

| 优先级 | 任务 | 工作量 | 交付时间 |
|--------|------|--------|----------|
| **P0** | 统一类型定义 (Phase 0) | 1天 | Week 1 |
| **P0** | CLI 参数 + 安全检查 (Phase 1) | 3天 | Week 1-2 |
| **P1** | 规则系统重构 (Phase 2) | 3天 | Week 2-3 |
| **P1** | 权限检查重构 (Phase 3) | 5天 | Week 3-4 |
| **P2** | 规则格式兼容 (Phase 4) | 2天 | Week 4 |
| **P2** | 高级功能 (Phase 5) | 5天 | Week 5-6 |

---

## 十一、关键成功指标

- [ ] `--dangerously-skip-permissions` CLI 标志正常工作
- [ ] 安全检查阻止非沙箱环境的危险模式
- [ ] `Bash(content)` 规则格式完全支持
- [ ] 权限规则从多源正确加载
- [ ] 拒绝跟踪防止无限循环
- [ ] 向后兼容现有配置
- [ ] 所有权限相关测试通过