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
---

## 十四、授权 TUI 分析与改造计划

### 14.1 UpUp 当前授权 TUI 架构

#### 核心文件

| 文件路径 | 核心功能 |
|---------|---------|
| `src/components/approval-prompt.ts` | `ApprovalPromptComponent` - 授权弹窗 TUI 组件 |
| `src/components/select-list.ts` | `createApprovalSelector()` - 授权选项列表 |
| `src/agent/tool-executor.ts` | 工具执行器，处理授权决策 |
| `src/controllers/agent-runner.ts` | `AgentRunnerController` - 协调授权流程 |
| `src/cli.ts` | CLI 主入口，处理按键事件 |

#### 授权流程

```
用户输入
    ↓
ToolExecutor.executeSingleWithId()
    ↓
useCanUseTool().check() (权限门检查)
    ↓
requiresApproval(toolName)? ──No──→ 执行工具
    ↓
requestToolApproval() Promise
    ↓
pendingApprovalValue 设置
    ↓
workingState = 'approval'
    ↓
CLI onChange() → renderSelectionOverlay()
    ↓
渲染授权 UI
    ↓
用户选择 (Enter/Esc/↑↓)
    ↓
respondToApproval(decision)
    ↓
resolve(Promise) → 继续/拒绝
```

#### 当前授权选项

```typescript
// src/components/select-list.ts
const items: SelectItem[] = [
  { value: 'allow-once', label: '1. Yes' },
  { value: 'allow-session', label: '2. Yes, allow all edits this session' },
  { value: 'deny', label: '3. No' },
];
```

---

### 14.2 Claude Code 授权 UI 设计

#### 组件结构

```
src/components/permissions/
├── PermissionRequest.tsx       # 主入口，工具专用组件
├── PermissionDialog.tsx      # 通用对话框容器
├── PermissionPrompt.tsx       # 共享选项选择组件
├── BashPermissionRequest/      # Bash 命令专用
├── FileEditPermissionRequest/  # 文件编辑专用
├── FileWritePermissionRequest/ # 文件写入专用
└── rules/                     # 权限规则配置
```

#### 关键设计特点

1. **工具专用组件模式** - 每种工具类型有专门的处理组件
2. **反馈输入功能** - Tab 键展开反馈输入
3. **快捷键绑定** - 使用 `useKeybindings` 处理键盘交互
4. **通知超时机制** - `useNotifyAfterTimeout`

---

### 14.3 识别的问题

#### 问题 1: 超时配置硬编码

**位置**: `agent-runner.ts:326`

```typescript
const timeout = setTimeout(() => {
  resolve('deny');
}, 60000);  // 硬编码 60 秒
```

**影响**: 无法通过配置修改超时时间

#### 问题 2: UI 与状态时序问题

**位置**: `cli.ts:367-383`

```typescript
if (agentRunner.pendingApproval && !chatLog.hasApprovalPending()) {
  // 存在时序依赖
  scheduleOverlay();
}
```

**影响**: 可能导致渲染延迟或闪烁

#### 问题 3: Hook 执行失败静默处理

**位置**: `tool-executor.ts:165-167`

```typescript
} catch {
  // Hook 执行失败时静默通过
}
```

**影响**: 可能存在安全风险

#### 问题 4: 缓存机制不完整

**位置**: `permission-hooks.ts:109-137`

```typescript
const key = `${context.toolName}:${JSON.stringify(context.args).slice(0, 100)}`;
```

**影响**: 
- 缓存 key 可能碰撞
- 缓存 TTL 固定 5 分钟无配置

#### 问题 5: 缺少工具专用授权组件

**影响**: 所有工具使用相同的授权 UI，无法提供详细信息

---

### 14.4 Claude Code vs UpUp 对比

| 维度 | Claude Code | UpUp | 差距 |
|------|------------|------|------|
| UI架构 | 专用组件+通用容器 | 内联UI+工具组件 | **需改进** |
| 组件复用 | 每工具专用组件 | 通用fallback | **需改进** |
| 反馈机制 | Tab键展开输入 | 无 | **需添加** |
| 快捷键 | useKeybindings | 模块级光标 | **需改进** |
| 超时配置 | 可配置 | 硬编码60秒 | **需改进** |
| 状态同步 | React状态 | 模块级状态 | 相对OK |
| 工具覆盖 | 20+专用组件 | 通用处理 | **需改进** |

---

### 14.5 TUI 改造计划

#### Phase T1: 授权配置化 (P1)

**目标**: 将硬编码的配置项提取到配置文件

**任务**:
- [ ] 提取授权超时时间到配置
- [ ] 提取选项标签文本到配置
- [ ] 支持自定义授权选项

**配置格式**:
```json
{
  "approval": {
    "timeoutMs": 60000,
    "options": [
      { "value": "allow-once", "label": "1. Yes" },
      { "value": "allow-session", "label": "2. Yes, all this session" },
      { "value": "deny", "label": "3. No" }
    ],
    "enableFeedback": true,
    "showDangerWarning": true
  }
}
```

#### Phase T2: 工具专用授权组件 (P1)

**目标**: 为不同工具类型创建专用授权组件

**任务**:
- [ ] 创建 `WriteFilePermissionRequest`
- [ ] 创建 `EditFilePermissionRequest`
- [ ] 创建 `BashPermissionRequest`
- [ ] 创建通用的 `FallbackPermissionRequest`

**架构设计**:
```typescript
// src/components/approval-requests/
├── index.ts
├── BaseApprovalRequest.ts
├── WriteFileApprovalRequest.ts
├── EditFileApprovalRequest.ts
├── BashApprovalRequest.ts
└── GenericApprovalRequest.ts
```

#### Phase T3: 增强用户交互 (P2)

**目标**: 提供更好的用户交互体验

**任务**:
- [ ] 添加 Tab 键展开反馈输入
- [ ] 添加方向键快捷方式
- [ ] 添加权限规则解释
- [ ] 添加预览功能

**UI 示例**:
```
┌─────────────────────────────────────────┐
│ ⚠️ Permission Required                    │
├─────────────────────────────────────────┤
│ Tool: write_file                         │
│ Path: src/utils/new-file.ts              │
├─────────────────────────────────────────┤
│ > 1. Yes                               │
│   2. Yes, all edits this session       │
│   3. No                                │
│                                         │
│ [Tab for feedback]                      │
└─────────────────────────────────────────┘
```

#### Phase T4: 状态管理改进 (P2)

**目标**: 改进授权状态管理，解决时序问题

**任务**:
- [ ] 统一授权状态管理到单一模块
- [ ] 消除时序依赖
- [ ] 添加状态一致性检查
- [ ] 改进错误处理

**新架构**:
```typescript
// src/approval/ApprovalManager.ts
class ApprovalManager {
  private state: ApprovalState
  private listeners: Set<ApprovalListener>
  
  requestApproval(tool: string, args: unknown): Promise<ApprovalDecision>
  respond(decision: ApprovalDecision): void
  addListener(listener: ApprovalListener): void
}
```

#### Phase T5: Hook 安全增强 (P2)

**目标**: 改进权限 Hook 的错误处理

**任务**:
- [ ] Hook 失败时记录警告日志
- [ ] 添加 Hook 执行超时
- [ ] 支持 Hook 级别的拒绝原因

---

### 14.6 TUI 改造文件清单

#### 新建文件

```
src/components/approval-requests/
├── index.ts              # 导出入口
├── BaseApprovalRequest.ts # 基类
├── WriteFileApprovalRequest.ts
├── EditFileApprovalRequest.ts
├── BashApprovalRequest.ts
└── GenericApprovalRequest.ts

src/approval/
├── index.ts             # 导出入口
├── ApprovalManager.ts   # 状态管理
├── ApprovalConfig.ts    # 配置类型
└── ApprovalEvents.ts   # 事件类型
```

#### 修改文件

```
src/components/
├── approval-prompt.ts    # 重构为通用容器
├── select-list.ts       # 支持配置化
└── ...

src/controllers/
└── agent-runner.ts      # 使用新的 ApprovalManager
```

---

### 14.7 实施优先级

| 优先级 | 任务 | 工作量 | 风险 |
|--------|------|--------|------|
| P1 | 超时配置化 | 小 | 低 |
| P1 | 工具专用组件 | 中 | 中 |
| P2 | 用户交互增强 | 中 | 中 |
| P2 | 状态管理改进 | 中 | 中 |
| P2 | Hook 安全增强 | 小 | 低 |

---

### 14.8 里程碑更新

| 阶段 | 功能 | 状态 | 交付日期 |
|------|------|------|----------|
| Phase 0-4 | 权限系统基础 | ✅ | 2026-05-20 |
| Phase T1 | 授权配置化 | 🔲 | 待定 |
| Phase T2 | 工具专用组件 | 🔲 | 待定 |
| Phase T3 | 用户交互增强 | 🔲 | 待定 |
| Phase T4 | 状态管理改进 | 🔲 | 待定 |
| Phase T5 | Hook 安全增强 | 🔲 | 待定 |

---

**文档更新**: 2026-05-21

---

## 十五、代码最佳实践分析

### 15.1 UpUp 代码架构

#### 目录结构

```
src/
├── agent/              # Agent 核心逻辑
│   ├── agent.ts       # Agent 主类
│   ├── tool-executor.ts
│   ├── fallback.ts
│   └── loop-recovery.ts
├── tools/             # 工具集
│   ├── registry/     # 工具注册表
│   ├── bash/         # Bash 工具
│   └── finance-tools.ts
├── hooks/             # 钩子系统
├── memory/            # 记忆系统
├── session/           # 会话管理
├── components/         # UI 组件
├── controllers/        # 控制器
├── utils/             # 工具函数
│   ├── permissions/  # 权限系统
│   ├── errors.ts
│   └── config.ts
└── cli.ts            # CLI 入口
```

#### 设计模式

| 模式 | 使用场景 |
|------|---------|
| 单例模式 | Logger, RateLimiter, MemoryManager |
| 工厂模式 | LLM Client 创建 |
| 观察者模式 | 状态变化通知 |
| 策略模式 | 循环恢复策略选择 |
| 生成器模式 | Agent.create() 分步构建 |
| 代理模式 | Rate-limited fetcher |

#### 状态管理

```typescript
// packages/state/src/state.ts
class AppStateStore {
  private emitter = new EventEmitter()
  
  subscribe(event: string, listener): () => void {
    this.emitter.on(event, listener)
    return () => this.emitter.off(event, listener)
  }
  
  setState(updates: Partial<AppState>): void {
    const oldState = { ...this.state }
    this.state = { ...this.state, ...updates }
    this.emitter.emit('stateChange', this.state, oldState)
  }
}
```

---

### 15.2 Claude Code 代码实践

#### 类型系统

```typescript
// 泛型 + Discriminated Unions
export type PermissionDecision<Input extends {...}> =
  | PermissionAllowDecision<Input>
  | PermissionAskDecision<Input>
  | PermissionDenyDecision

// 错误类层次
class ClaudeError extends Error {}
class AbortError extends ClaudeError {}
class ShellError extends ClaudeError {}

// 类型守卫
export function isAbortError(e: unknown): boolean {
  return e instanceof AbortError || (e instanceof Error && e.name === 'AbortError')
}
```

#### 缓存策略

```typescript
// 后台刷新 + TTL
export function memoizeWithTTLAsync(f, cacheLifetimeMs = 5 * 60 * 1000) {
  // 返回过期数据同时异步刷新
  if (now - cached.timestamp > cacheLifetimeMs && !cached.refreshing) {
    cached.refreshing = true
    Promise.resolve().then(() => {
      const newValue = f(...args)
      // 更新缓存
    })
    return cached.value  // 立即返回
  }
}

// LRU 缓存
export function memoizeWithLRU(f, maxCacheSize = 100) {
  const cache = new LRUCache({ max: maxCacheSize })
  // peek() 避免更新 recency
}
```

#### React 性能优化

```typescript
// 虚拟滚动 + 量化
const SCROLL_QUANTUM = 40  // 滚动位置分片
const OVERSCAN_ROWS = 80   // 上下 overscan

// useSyncExternalStore 同步外部状态
useSyncExternalStore(subscribe, () => {
  const bin = Math.floor(target / SCROLL_QUANTUM)
  return s.isSticky() ? ~bin : bin
})

// useDeferredValue 异步渲染
const dStart = useDeferredValue(start)
const dEnd = useDeferredValue(end)
```

---

### 15.3 最佳实践对比

| 方面 | UpUp | Claude Code | 建议 |
|------|------|------------|------|
| **类型安全** | 良好 | 极致 (泛型) | 增强泛型使用 |
| **缓存策略** | 简单 TTL | LRU + 后台刷新 | 借鉴高级缓存 |
| **错误处理** | 模式匹配 | 完整类层次 | 完善错误类 |
| **性能优化** | 基础 | 虚拟滚动 | 关键组件优化 |
| **单例模式** | 类 + 延迟初始化 | 模块级 let | 统一模式 |

---

### 15.4 可借鉴的改进

#### 1. 类型守卫函数

```typescript
// 借鉴 Claude Code 的类型守卫
export function isContextOverflowError(e: unknown): boolean
export function isRateLimitError(e: unknown): boolean
export function isAuthError(e: unknown): boolean

// 在错误处理中使用
if (isContextOverflowError(error)) {
  return handleContextOverflow()
}
```

#### 2. 后台刷新缓存

```typescript
// src/utils/cache.ts
export function memoizeWithBackgroundRefresh<T>(
  fetcher: () => Promise<T>,
  ttlMs: number = 60000
): () => Promise<T> {
  let cached: { value: T; timestamp: number; refreshing: boolean } | null = null
  
  return async () => {
    const now = Date.now()
    if (!cached || now - cached.timestamp > ttlMs) {
      if (!cached?.refreshing) {
        cached = { value: await fetcher(), timestamp: now, refreshing: false }
      }
    }
    return cached!.value
  }
}
```

#### 3. 错误类层次

```typescript
// src/utils/errors.ts
export class UpupError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'UpupError'
  }
}

export class PermissionError extends UpupError {
  constructor(message: string, public toolName: string) {
    super(message, 'PERMISSION_DENIED')
  }
}

export class TimeoutError extends UpupError {
  constructor(message: string, public timeoutMs: number) {
    super(message, 'TIMEOUT')
  }
}
```

#### 4. 统一常量管理

```typescript
// src/constants/index.ts
export const AGENT = {
  DEFAULT_MAX_ITERATIONS: 50,
  MAX_OVERFLOW_RETRIES: 2,
  OVERFLOW_KEEP_ROUNDS: 3,
} as const

export const TOOLS = {
  APPROVAL_REQUIRED: ['write_file', 'edit_file'] as const,
  DEFAULT_TIMEOUT_MS: 30000,
} as const

export const MEMORY = {
  COMPACTION_THRESHOLD: 0.8,
  MIN_TOOL_RESULTS: 3,
} as const
```

---

### 15.5 实施计划

#### Phase BP1: 类型系统增强

**目标**: 增强类型安全

**任务**:
- [ ] 添加泛型约束到工具系统
- [ ] 创建错误类层次
- [ ] 添加类型守卫函数

#### Phase BP2: 缓存系统升级

**目标**: 提升缓存效率

**任务**:
- [ ] 实现 LRU 缓存
- [ ] 实现后台刷新
- [ ] 添加请求去重

#### Phase BP3: 性能优化

**目标**: 优化关键路径性能

**任务**:
- [ ] 虚拟滚动 (如需要)
- [ ] useDeferredValue 优化
- [ ] 内存监控增强

---

### 15.6 代码质量指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 类型覆盖 | ~70% | 90% |
| 测试覆盖率 | ~40% | 70% |
| 循环复杂度 | 部分高 | <15 |
| 文件大小 | 部分>1000行 | <800行 |

---

**文档更新**: 2026-05-21
