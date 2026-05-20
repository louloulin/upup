# Plan 30: UpUp 全面权限优化 - 统一架构改造计划

> 基于对 Claude Code 真实源码深度分析，制定的完整权限系统改造计划

**版本**: v2.0  
**更新日期**: 2026-05-20  
**状态**: Phase 0-4 已完成，Phase 5-7 待实现

---

## 一、项目概述

### 1.1 项目背景

**UpUp (涨涨)** 是对 [Dexter](https://github.com/virattt/dexter) 的深度改造版本，融合了 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的核心设计理念。

本次计划专注于权限系统改造，实现全面权限控制，让常用操作无需授权。

### 1.2 目标

1. **统一架构**: 建立高内聚低耦合的权限系统
2. **CLI 支持**: 实现 `--dangerously` 等命令行标志
3. **安全底线**: 保持危险命令永不绕过
4. **用户体验**: 常用命令免授权，减少交互中断

### 1.3 分析来源

- **Claude Code 源码**: `/Users/louloulin/Documents/linchong/claw/loucode`
- **参考计划**: plan25.md, plan23.md, plan23.1.md

---

## 二、Claude Code 权限架构分析

### 2.1 核心模块

| 文件 | 功能 |
|------|------|
| `src/types/permissions.ts` | 权限类型定义 |
| `src/utils/permissions/PermissionMode.ts` | 模式配置元数据 |
| `src/utils/permissions/permissionSetup.ts` | CLI 参数解析 |
| `src/utils/permissions/permissions.ts` | 核心检查逻辑 |
| `src/utils/permissions/permissionsLoader.ts` | 规则加载 |
| `src/utils/permissions/permissionRuleParser.ts` | 规则解析 |
| `src/utils/permissions/denialTracking.ts` | 拒绝跟踪 |

### 2.2 PermissionMode 类型

```typescript
export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits',
  'bypassPermissions',
  'default',
  'dontAsk',
  'plan',
] as const

export type PermissionMode = InternalPermissionMode // 包含 'auto' | 'bubble'
```

### 2.3 CLI 优先级

```
1. --dangerously-skip-permissions → bypassPermissions
2. --permission-mode → 指定模式
3. settings.permissions.defaultMode → 默认
4. 'default'
```

### 2.4 规则格式

```
"ToolName"                    # 工具级允许
"ToolName(content)"           # 内容匹配
"Bash(npm install)"           # 特定命令
"Read(CLAUDE.md)"            # 文件匹配
"mcp__server__*"            # MCP 通配符
```

---

## 三、UpUp 当前架构

### 3.1 现有文件

```
src/
├── session/session-state.ts      # PermissionMode 管理
├── tools/bash/
│   ├── permission-mode.ts        # Bash 权限规则
│   ├── command-classifier.ts    # 命令分类
│   └── types.ts                # BashPermissionMode
├── hooks/permission-hooks.ts     # Hook 权限检查
└── packages/sdk/src/permissions/  # SDK 权限管理
```

### 3.2 现有模式

```typescript
// Session 级别
type PermissionMode = 'default' | '.accept-all' | 'bypassPermissions' | 'dangerously'

// Bash 工具级别
type BashPermissionMode = 'bypass' | 'allow' | 'ask' | 'deny'
```

---

## 四、实现进度

### ✅ Phase 0-4: 基础功能 (已完成)

**完成时间**: 2026-05-20

#### 4.1 新建文件

```
src/utils/permissions/
├── index.ts           # 统一导出入口
├── types.ts          # 统一类型定义
└── permissionSetup.ts # CLI + 安全检查
```

#### 4.2 实现的类型

```typescript
// PermissionMode (扩展到 9 种)
type PermissionMode = 
  | 'default'
  | '.accept-all'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dangerously'
  | 'dontAsk'
  | 'plan'
  | 'auto'
  | 'bubble'

// BashPermissionMode
type BashPermissionMode = 'bypass' | 'allow' | 'ask' | 'deny'

// PermissionRule
interface PermissionRule {
  source: PermissionRuleSource
  ruleBehavior: PermissionBehavior
  ruleValue: PermissionRuleValue
}
```

#### 4.3 CLI 参数支持

```typescript
// src/cli.ts
interface RunCliOptions {
  dangerouslySkipPermissions?: boolean
  permissionMode?: string
}
```

#### 4.4 安全检查

```typescript
export function isRunningAsRoot(): boolean
export function isInSandbox(): boolean
export function shouldAllowBypassPermissionsMode(): boolean
export function runSecurityChecks(): SecurityCheckResult[]
```

#### 4.5 Hard-Deny 检测

```typescript
const HARD_DENY_PATTERNS = [
  /:\(\)\{:\|:&\};:/,           // Fork bomb
  /^rm\s+-rf\s+\/+/,            // 根目录删除
  /^mkfs\b/,                    // 创建文件系统
  /^dd\s+.*of=\/dev\//,        // 磁盘写入
]

export function isHardDenyCommand(command: string): boolean
export function checkPermissionWithHardDeny(command: string): PermissionResult
```

#### 4.6 会话状态增强

```typescript
export function isPlanMode(): boolean
export function isAcceptEditsMode(): boolean
export function isDontAskMode(): boolean
export function getPermissionModeLabel(): string
export function getCurrentModeNotification(): string | undefined
```

---

## 五、待实现功能

### 🔲 Phase 5: 规则解析器

**目标**: 支持 `Tool(content)` 格式

**任务**:
- [ ] 实现 `permissionRuleValueFromString()`
- [ ] 实现 `permissionRuleValueToString()`
- [ ] 实现 glob 模式匹配
- [ ] 实现转义/反转义

**文件**: `src/utils/permissions/permissionRuleParser.ts`

```typescript
export function permissionRuleValueFromString(ruleString: string): PermissionRuleValue {
  // "Bash(npm install)" → { toolName: 'Bash', ruleContent: 'npm install' }
}

export function globMatch(pattern: string, content: string): boolean {
  // 支持 npm run:* 这样的模式
}
```

### 🔲 Phase 6: 规则加载器

**目标**: 多源规则加载和优先级

**任务**:
- [ ] 实现 `loadAllPermissionRulesFromDisk()`
- [ ] 实现 `getPermissionRulesForSource()`
- [ ] 实现 `settingsJsonToRules()`
- [ ] 实现 `applyPermissionUpdate()`
- [ ] 实现 `persistPermissionUpdates()`

**文件**: `src/utils/permissions/permissionsLoader.ts`

```typescript
export function loadAllPermissionRulesFromDisk(): PermissionRule[] {
  // 从 userSettings, projectSettings, localSettings 加载
  // 按优先级合并
}
```

### 🔲 Phase 7: 权限检查核心

**目标**: 完整的 `hasPermissionsToUseTool()` 和 `checkRuleBasedPermissions()`

**任务**:
- [ ] 实现 `hasPermissionsToUseTool()`
- [ ] 实现 `checkRuleBasedPermissions()`
- [ ] 实现 `findDenyRule()`
- [ ] 实现 `findAllowRule()`
- [ ] 集成 Hook 系统

**文件**: `src/utils/permissions/permissions.ts`

```typescript
export async function hasPermissionsToUseTool(
  tool: Tool,
  input: Record<string, unknown>
): Promise<PermissionCheckResult> {
  // 1. 加载所有规则
  // 2. 检查 deny 规则
  // 3. 检查 allow 规则
  // 4. 工具特定检查
  // 5. 安全检查
  // 6. 返回决策
}
```

### 🔲 Phase 8: 拒绝跟踪

**目标**: 防止无限拒绝循环

**任务**:
- [ ] 实现 `DenialTrackingState`
- [ ] 实现 `recordDenial()`
- [ ] 实现 `recordSuccess()`
- [ ] 实现 `shouldFallbackToPrompting()`

**文件**: `src/utils/permissions/denialTracking.ts`

```typescript
export const DENIAL_LIMITS = {
  consecutive: 5,  // 连续拒绝上限
  total: 50,       // 总拒绝上限
}
```

### 🔲 Phase 9: 配置持久化

**目标**: 规则持久化到配置文件

**任务**:
- [ ] 实现规则保存到 `~/.upup/permissions.json`
- [ ] 实现规则从配置文件加载
- [ ] 实现规则的增删改查 API

**文件**: `src/utils/permissions/PermissionUpdate.ts`

```typescript
export type PermissionUpdate =
  | { type: 'addRules'; destination: string; rules: PermissionRule[] }
  | { type: 'removeRules'; destination: string; patterns: string[] }
  | { type: 'replaceRules'; destination: string; rules: PermissionRule[] }
```

---

## 六、配置格式

### 6.1 settings.json 格式

```json
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
      "Write(*)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)"
    ]
  }
}
```

### 6.2 环境变量

```bash
# 权限模式
UPUP_PERMISSION_MODE=default|acceptEdits|bypassPermissions|dangerously
UPUP_DANGEROUSLY_MODE=true
UPUP_BYPASS_MODE=true

# 安全控制
UPUP_ALLOW_BYPASS_OUTSIDE_SANDBOX=true
UPUP_DISABLE_BYPASS=true

# 沙箱环境
UPUP_SANDBOX=true
IS_SANDBOX=true
```

---

## 七、使用指南

### 7.1 CLI 用法

```bash
# 绕过所有权限检查
bun start --dangerously-skip-permissions

# 指定权限模式
bun start --permission-mode bypassPermissions
bun start --permission-mode dangerously
bun start --permission-mode acceptEdits

# 环境变量
export UPUP_DANGEROUSLY_MODE=true
bun start
```

### 7.2 编程使用

```typescript
import {
  setPermissionMode,
  getPermissionMode,
  checkPermissionWithHardDeny,
  isHardDenyCommand,
} from './utils/permissions/index.js'

// 设置模式
setPermissionMode('bypassPermissions')

// 检查命令
const result = checkPermissionWithHardDeny('ls -la')
if (result.allowed) {
  // 执行
}
```

---

## 八、架构设计

### 8.1 模块关系

```
┌─────────────────────────────────────────────────────────────┐
│                    入口层                                     │
│  CLI args → environment → settings.json                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               permissionSetup.ts                              │
│  initialPermissionModeFromCLI()                              │
│  isRunningAsRoot() / isInSandbox()                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               session-state.ts                              │
│  setPermissionMode() / getPermissionMode()                   │
│  事件监听器模式                                              │
└─────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ permissions.ts│  │permissionsLoader│  │ permissionRuleParser│
│ 核心检查逻辑  │  │  规则加载     │  │  规则解析    │
└──────────────┘  └──────────────┘  └──────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│             permission-mode.ts (Bash)                        │
│  checkPermission() / isHardDenyCommand()                    │
│  BUILT_IN_RULES / HARD_DENY_PATTERNS                       │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 类型层级

```
PermissionMode (Session 级别)
├── default
├── acceptEdits
├── bypassPermissions
├── dangerously
├── dontAsk
├── plan
├── auto
├── bubble
└── .accept-all

BashPermissionMode (工具级别)
├── bypass
├── allow
├── ask
└── deny

PermissionBehavior (规则行为)
├── allow
├── deny
└── ask

PermissionRuleSource (规则来源)
├── userSettings
├── projectSettings
├── localSettings
├── flagSettings
├── policySettings
├── cliArg
├── command
└── session
```

---

## 九、文件清单

### 9.1 现有文件

```
src/
├── cli.ts                          ✅ 已修改
├── session/session-state.ts        ✅ 已修改
└── tools/bash/permission-mode.ts   ✅ 已修改
```

### 9.2 新建文件

```
src/utils/permissions/
├── index.ts                ✅ 已创建
├── types.ts               ✅ 已创建
└── permissionSetup.ts      ✅ 已创建

# 待创建
├── permissions.ts          🔲 Phase 7
├── permissionsLoader.ts    🔲 Phase 6
├── permissionRuleParser.ts  🔲 Phase 5
├── denialTracking.ts       🔲 Phase 8
└── PermissionUpdate.ts      🔲 Phase 9
```

---

## 十、测试计划

### 10.1 单元测试

```typescript
// src/utils/permissions/permissions.test.ts
describe('PermissionChecker', () => {
  it('should allow matching allow rule')
  it('should deny matching deny rule')
  it('should ask when no rule matches')
})

describe('permissionRuleParser', () => {
  it('should parse "Tool" format')
  it('should parse "Tool(content)" format')
  it('should handle escaped parentheses')
})

describe('hardDeny', () => {
  it('should deny fork bomb')
  it('should deny rm -rf /')
  it('should deny even in bypassPermissions mode')
})
```

### 10.2 集成测试

```bash
# CLI 参数测试
bun test tests/cli/permissions-flag.test.ts

# 规则加载测试
bun test tests/permissions/loader.test.ts
```

---

## 十一、安全策略

### 11.1 永不绕过的命令

```typescript
const HARD_DENY_PATTERNS = [
  /:\(\)\{:\|:&\};:/,           // Fork bomb
  /^rm\s+-rf\s+\/+/,            // 根目录删除
  /^mkfs\b/,                    // 创建文件系统
  /^dd\s+.*of=\/dev\//,        // 磁盘写入
  /^fdisk\b/,                  // 磁盘分区
  /\bsudo\s+rm\s+-rf\b/,       // sudo 删除
]
```

### 11.2 沙箱优先

```typescript
// 非沙箱环境使用 bypass 需要特殊确认
export function shouldAllowBypassPermissionsMode(): boolean {
  if (isInSandbox()) return true
  if (process.env.UPUP_ALLOW_BYPASS_OUTSIDE_SANDBOX === 'true') return true
  return false  // 需要用户确认
}
```

---

## 十二、里程碑

| 阶段 | 功能 | 状态 | 交付日期 |
|------|------|------|----------|
| Phase 0 | 类型定义统一 | ✅ | 2026-05-20 |
| Phase 1 | CLI + 安全检查 | ✅ | 2026-05-20 |
| Phase 2 | Hard-Deny | ✅ | 2026-05-20 |
| Phase 3 | 权限模式扩展 | ✅ | 2026-05-20 |
| Phase 4 | 会话状态增强 | ✅ | 2026-05-20 |
| Phase 5 | 规则解析器 | 🔲 | 待定 |
| Phase 6 | 规则加载器 | 🔲 | 待定 |
| Phase 7 | 权限检查核心 | 🔲 | 待定 |
| Phase 8 | 拒绝跟踪 | 🔲 | 待定 |
| Phase 9 | 配置持久化 | 🔲 | 待定 |

---

## 十三、后续优化

### 13.1 高级功能 (可选)

- [ ] AI 分类器 (auto mode)
- [ ] MCP 工具规则支持
- [ ] 企业级托管策略
- [ ] 敏感路径保护 (.git/, .claude/)

### 13.2 UI/UX 优化

- [ ] 权限模式状态栏指示器
- [ ] Slash 命令 `/dangerously` `/safemode`
- [ ] 权限提示 UI 改进

---

**计划制定者**: Claude Code 分析 + UpUp 改造团队  
**下次更新**: Phase 5 实现完成后