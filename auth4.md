# Dexter 与 Claude Code 授权系统架构差异分析与统一权限架构计划

## 一、Dexter 当前授权流程分析

### 1.1 核心组件架构

Dexter 的授权系统由以下核心组件构成：

```
src/
├── controllers/agent-runner.ts      # 授权决策控制器
├── session/
│   ├── session-tracker.ts          # 会话级权限追踪
│   └── session-state.ts            # 会话状态与权限模式管理
├── utils/permissions/
│   ├── types.ts                   # 权限类型定义
│   ├── permissionSetup.ts         # CLI 参数解析与安全检查
│   ├── permissionsLoader.ts       # 多源规则加载器
│   ├── permissions.ts             # 核心权限检查器
│   └── permissionRuleParser.ts    # 规则解析器
└── tools/bash/permission-mode.ts   # Bash 工具权限模式
```

### 1.2 授权流程详解

#### 1.2.1 初始化阶段

```
runCli()
  └─> initialPermissionModeFromCLI()
        ├─> 检查 --dangerouslySkipPermissions 参数
        ├─> 检查 --permission-mode 参数
        ├─> 检查环境变量 (UPUP_PERMISSION_MODE)
        └─> 设置默认权限模式 'default'
```

**关键代码** (`src/cli.ts` 第 269-278 行):
```typescript
const { mode, notification } = initialPermissionModeFromCLI({
  dangerouslySkipPermissions: options.dangerouslySkipPermissions,
  permissionMode: options.permissionMode,
} as PermissionCliArgs)
setPermissionMode(mode)
```

#### 1.2.2 会话级权限追踪

Dexter 使用 `SessionTracker` 持久化会话级权限：

```typescript
// 核心状态
interface SessionTrackerState {
  id: string;
  sessionId: string;
  approvedTools: string[];    // 已批准的工整体
  deniedTools: string[];     // 已拒绝的工整体
  toolCallCounts: Record<string, number>;
  totalTokens: number;
  totalIterations: number;
}
```

**关键特性**:
- 工具粒度的 approve/deny 追踪
- 崩溃恢复支持 (`approveToolSync()`)
- 自动持久化到 `~/.dexter/cache/session-tracker/`

#### 1.2.3 运行时授权流程

```
Agent 请求工具执行
  │
  ▼
AgentRunner.requestToolApproval()
  │
  ├── 检查 SessionTracker.isToolApproved()
  │     └─> 已批准 → 直接执行
  │
  ├── 检查权限模式
  │     ├─> bypassPermissions/dangerously → 直接执行
  │     └─> plan 模式 → 拒绝写操作
  │
  ├── 查找匹配规则 (permissionsLoader.ts)
  │     └─> deny 规则 → 拒绝
  │     └─> allow 规则 → 执行
  │
  └── 无匹配规则 → 弹出授权对话框
        │
        ├── allow-once: 单次授权
        ├── allow-session: 会话级授权
        └── deny: 拒绝
```

**授权决策超时** (`src/utils/permissions/index.ts`):
```typescript
export function getTimeoutForTool(tool: string): number {
  const timeouts: Record<string, number> = {
    write_file: 30000,
    edit_file: 30000,
    bash: 60000,
    browser: 120000,
  };
  return timeouts[tool] ?? 60000;
}
```

### 1.3 权限模式系统

Dexter 支持 9 种权限模式：

| 模式 | 说明 | 确认提示 | 持久化 |
|------|------|----------|--------|
| `default` | 标准权限检查 | 是 | 否 |
| `acceptEdits` | 自动接受编辑 | 否 | 否 |
| `bypassPermissions` | 绕过所有检查 | 否 | 否 |
| `dangerously` | 允许危险操作 | 否 | 否 |
| `dontAsk` | 不询问 | 否 | 否 |
| `plan` | 只读计划模式 | - | - |
| `auto` | AI 辅助决策 | 可选 | 否 |
| `bubble` | 冒泡提示 | - | - |
| `.accept-all` | 接受所有 | 否 | 否 |

### 1.4 规则来源优先级

Dexter 的规则按以下优先级加载（数字越小优先级越高）：

```
1. builtin      # 内置安全规则
2. cliArg       # CLI 参数
3. flagSettings # 标志设置
4. policySettings # 策略设置
5. session      # 会话规则
6. userSettings # 用户设置 (~/.dexter/settings.json)
7. projectSettings # 项目设置 (.dexter/settings.json)
8. localSettings # 本地设置 (.dexter/local-settings.json)
9. command      # 命令级规则
```

### 1.5 Dexter 当前授权流程总结

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dexter 授权流程                              │
├─────────────────────────────────────────────────────────────────┤
│  1. 启动时:                                                      │
│     - 解析 CLI 参数 (--dangerouslySkipPermissions)                 │
│     - 加载权限模式 (default/acceptEdits/bypassPermissions 等)      │
│     - 加载规则 (builtin + settings.json)                          │
│                                                                  │
│  2. 会话初始化:                                                   │
│     - 创建 SessionTracker                                         │
│     - 从磁盘恢复已批准/拒绝的工具列表                              │
│                                                                  │
│  3. 工具执行请求:                                                 │
│     - 检查 SessionTracker.approvedTools                          │
│     - 匹配权限规则 (deny > allow > ask)                           │
│     - 执行安全检查 (isHardDenyCommand)                             │
│     - 弹出 TUI 授权对话框                                         │
│                                                                  │
│  4. 授权决策:                                                     │
│     - allow-once: 单次执行                                        │
│     - allow-session: SessionTracker.approveTool()                 │
│     - deny: SessionTracker.denyTool()                            │
│                                                                  │
│  5. 状态持久化:                                                   │
│     - SessionTracker 自动保存到磁盘                                │
│     - 授权规则可持久化到 settings.json                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、Claude Code 授权架构分析

### 2.1 核心架构特点

Claude Code 的授权系统设计理念与 Dexter 类似，但有以下特点：

1. **规则存储位置**: `~/.claude/settings.json` 和 `~/.claude/settings.d/` 目录
2. **权限配置格式**:
   ```json
   {
     "permissions": {
       "allow": ["ToolName", "Bash(npm install)"],
       "ask": ["Read(*.ts)"],
       "deny": ["Bash(rm -rf /)"]
     }
   }
   ```
3. **MCP 权限**: 通过 `mcpServers` 配置独立管理
4. **Hook 系统**: 通过 `hooks` 配置进行生命周期管理

### 2.2 Claude Code 授权的核心优势

#### 2.2.1 分层配置系统

Claude Code 使用 `settings.d/` 目录支持插件级配置：

```
~/.claude/
├── settings.json           # 主配置
└── settings.d/
    ├── evolvemind.json    # 插件配置
    ├── gstack.json        # 插件配置
    └── ...
```

#### 2.2.2 环境变量驱动

Claude Code 广泛使用环境变量控制行为：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:15721",
    "ANTHROPIC_AUTH_TOKEN": "PROXY_MANAGED",
    "API_TIMEOUT_MS": "3000000"
  }
}
```

#### 2.2.3 MCP 权限隔离

Claude Code 对 MCP 服务器使用独立配置：

```json
{
  "mcpServers": {
    "evolvemind": {
      "command": "evolvemind",
      "args": ["mcp", "run"],
      "env": { ... }
    }
  }
}
```

---

## 三、两者差异对比

### 3.1 功能特性对比

| 特性 | Dexter | Claude Code | 差距 |
|------|--------|-------------|------|
| 权限模式数量 | 9 种 | 7 种 | Dexter 更丰富 |
| 会话级追踪 | SessionTracker | SessionStorage | 基本对等 |
| 规则语法 | `Tool(content)` | `Tool(content)` | 一致 |
| 硬拒绝模式 | 支持 | 支持 | 一致 |
| CLI 参数 | 完整支持 | 基础支持 | Dexter 更完整 |
| TUI 授权界面 | 完整实现 | 基础实现 | Dexter 更完整 |
| MCP 权限 | 基础支持 | 完整隔离 | Claude Code 更优 |
| 插件配置系统 | 无 | settings.d 目录 | Claude Code 更优 |
| Hook 系统 | 无 | on_start 等钩子 | Claude Code 更优 |
| 权限持久化 | 多位置 | settings.json | Dexter 更灵活 |

### 3.2 架构差异

```
Dexter:
┌─────────────────────────────────────────────────────────────┐
│  CLI Args ──> PermissionSetup ──> PermissionMode            │
│                                        │                     │
│  settings.json ──> PermissionsLoader ──┼──> PermissionChecker│
│                                        │          │          │
│  SessionTracker ────────────────────────┴──────────┘          │
│       │                                                         │
│       └──────────────────────────────────────────> UI (TUI)     │
└─────────────────────────────────────────────────────────────┘

Claude Code:
┌─────────────────────────────────────────────────────────────┐
│  Environment ──> Config ──> PermissionEngine                │
│                                          │                  │
│  settings.json ──> RuleLoader ───────────┴──────> Executor  │
│                                                              │
│  settings.d/*.json ──> PluginConfig ──> MCPServers          │
│                                                              │
│  Hooks ──> Lifecycle Events                                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 核心差距分析

#### 3.3.1 配置灵活性

**Dexter 优势**:
- 多种权限模式 (`auto`, `bubble`, `.accept-all`)
- 分层规则来源 (9 个级别)
- CLI 参数完整支持

**Claude Code 优势**:
- `settings.d/` 目录支持插件配置
- Hook 系统支持生命周期管理
- MCP 服务器独立配置

#### 3.3.2 用户体验

**Dexter 优势**:
- 完整的 TUI 授权界面
- 键盘导航支持 (↑↓, 1/2/3, Enter, Esc)
- 超时自动拒绝
- 授权队列处理

**Claude Code 差距**:
- 基础授权对话框
- 缺少键盘快捷键支持
- 无队列机制

#### 3.3.3 安全性

**Dexter 特点**:
- `isHardDenyCommand()` 硬拒绝
- 沙箱环境检测
- Root 权限警告

**Claude Code 特点**:
- 基础安全检查
- 无沙箱检测

---

## 四、统一权限架构计划

### 4.1 设计目标

1. **兼容性**: 保持与 Claude Code 权限格式兼容
2. **扩展性**: 支持更多权限模式和粒度
3. **可持久化**: 权限决策可保存和恢复
4. **安全优先**: 硬拒绝和沙箱检测

### 4.2 统一架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一权限架构 (Unified Permission Architecture) │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ Input Layer │───>│  Mode Resolver  │───>│  Rule Engine    │ │
│  └─────────────┘    └─────────────────┘    └─────────────────┘ │
│         │                   │                      │            │
│         │           ┌───────┴───────┐              │            │
│         │           │               │              │            │
│         │    ┌──────┴─────┐  ┌──────┴─────┐      │            │
│         │    │ CLI Args   │  │ Env Vars   │      │            │
│         │    └────────────┘  └────────────┘      │            │
│         │           │               │             │            │
│         ▼           ▼               ▼             ▼            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Permission Modes                          │   │
│  │  default | acceptEdits | bypassPermissions | dangerously  │   │
│  │  dontAsk | plan       | auto             | bubble        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Rule Sources (Priority Order)               │   │
│  │  1. builtin    4. policySettings    7. projectSettings   │   │
│  │  2. cliArg     5. session           8. localSettings     │   │
│  │  3. flagSettings 6. userSettings   9. command           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Decision Engine                       │   │
│  │  deny > allow > ask > default                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Output / UI Layer                       │   │
│  │  - TUI Authorization Dialog                              │   │
│  │  - Keyboard Navigation (↑↓ 1/2/3 Enter Esc)              │   │
│  │  - Approval Queue Management                             │   │
│  │  - Timeout Handling                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 实现计划

#### Phase 1: 核心统一 (优先级: P0)

**目标**: 建立统一的权限类型和接口

**文件变更**:
1. 创建 `src/utils/permissions/unified-types.ts`
   ```typescript
   // 统一的权限类型定义
   export type UnifiedPermissionMode =
     | 'default'
     | 'acceptEdits'
     | 'bypassPermissions'
     | 'dangerously'
     | 'dontAsk'
     | 'plan'
     | 'auto'
     | 'bubble'
     | '.accept-all';

   export interface UnifiedPermissionRule {
     source: PermissionSource;
     behavior: 'allow' | 'deny' | 'ask';
     toolName: string;
     pattern?: string;
   }

   export interface UnifiedPermissionResult {
     decision: 'allow' | 'deny' | 'ask';
     reason?: string;
     source?: string;
   }
   ```

2. 创建 `src/utils/permissions/unified-engine.ts`
   - 统一的决策引擎
   - 规则匹配算法
   - 模式解析

#### Phase 2: 配置兼容性 (优先级: P1)

**目标**: 兼容 Claude Code 配置格式

**实现**:
1. 扩展 `permissionsLoader.ts`:
   ```typescript
   // 支持 Claude Code 格式
   interface ClaudeSettings {
     permissions?: {
       allow?: string[];
       deny?: string[];
       ask?: string[];
     };
   }
   ```

2. 添加 `settings.d/` 支持:
   ```typescript
   // 加载 settings.d/*.json
   function loadSettingsDirectory(): PermissionRule[] {
     const rules: PermissionRule[] = [];
     const settingsDir = join(globalUpupPath(), 'settings.d');
     // 遍历目录加载所有 JSON 文件
     return rules;
   }
   ```

#### Phase 3: MCP 权限隔离 (优先级: P2)

**目标**: 实现 MCP 服务器独立权限

**实现**:
1. 创建 `src/utils/permissions/mcp-permissions.ts`:
   ```typescript
   export interface MCPPermissionConfig {
     serverName: string;
     allowedTools: string[];
     deniedTools: string[];
     requireApproval: boolean;
   }

   export class MCPPermissionManager {
     checkMCPToolPermission(server: string, tool: string): PermissionResult;
   }
   ```

2. 更新 `types.ts`:
   ```typescript
   export interface PermissionRule {
     source: PermissionRuleSource;
     ruleBehavior: PermissionBehavior;
     ruleValue: PermissionRuleValue;
     mcpServer?: string;  // MCP 服务器名称
   }
   ```

#### Phase 4: Hook 系统 (优先级: P3)

**目标**: 支持生命周期钩子

**实现**:
1. 创建 `src/hooks/permission-hooks.ts`:
   ```typescript
   export type PermissionHook = (
     request: PermissionRequest,
     context: PermissionContext
   ) => PermissionResult | Promise<PermissionResult>;

   export const HOOK_POINTS = [
     'beforePermissionCheck',
     'afterPermissionCheck',
     'onPermissionAllow',
     'onPermissionDeny',
   ] as const;
   ```

2. 支持的钩子:
   - `on_start`: 启动时
   - `on_resume`: 恢复会话时
   - `on_tool_approval`: 工具授权时
   - `on_tool_deny`: 工具拒绝时

#### Phase 5: TUI 增强 (优先级: P4)

**目标**: 提升授权用户体验

**实现**:
1. 授权历史记录:
   ```typescript
   interface ApprovalHistory {
     timestamp: number;
     toolName: string;
     decision: 'allow' | 'deny';
     mode: 'once' | 'session';
   }
   ```

2. 权限统计面板:
   - 工具使用次数
   - 拒绝率
   - 常用命令

### 4.4 迁移策略

#### 向后兼容

1. **CLI 参数**: 保持 `--dangerouslySkipPermissions` 兼容
2. **环境变量**: 保持 `UPUP_PERMISSION_MODE` 兼容
3. **settings.json**: 自动检测并迁移

#### 数据迁移

```typescript
// 从 Claude Code 格式迁移
function migrateFromClaudeFormat(config: ClaudeSettings): PermissionConfig {
  return {
    defaultMode: 'default',
    allowRules: config.permissions?.allow?.map(parseRule) ?? [],
    denyRules: config.permissions?.deny?.map(parseRule) ?? [],
    askRules: config.permissions?.ask?.map(parseRule) ?? [],
  };
}
```

### 4.5 测试计划

| 测试项 | 方法 | 验收标准 |
|--------|------|----------|
| 权限模式切换 | 单元测试 | 所有模式正确切换 |
| 规则匹配 | 集成测试 | glob 模式正确匹配 |
| CLI 参数 | E2E 测试 | 参数正确生效 |
| 超时处理 | 单元测试 | 超时后正确拒绝 |
| 持久化 | 集成测试 | 重启后状态恢复 |
| MCP 权限 | 集成测试 | MCP 工具正确隔离 |

---

## 五、关键文件清单

### 5.1 需要创建的文件

```
src/utils/permissions/
├── unified-types.ts          # 统一类型定义
├── unified-engine.ts         # 统一决策引擎
├── mcp-permissions.ts        # MCP 权限管理
└── hook-system.ts            # 钩子系统

src/hooks/
└── permission-hooks.ts       # 权限钩子实现
```

### 5.2 需要修改的文件

```
src/utils/permissions/
├── types.ts                  # 扩展权限类型
├── permissionsLoader.ts      # 支持 settings.d/
├── permissions.ts            # 集成统一引擎
└── permissionRuleParser.ts   # 优化规则解析

src/session/
├── session-tracker.ts        # 添加 MCP 追踪
└── session-state.ts          # 扩展状态管理

src/cli.ts                    # 添加 MCP 权限初始化

src/components/
└── chat-log.ts              # 增强 TUI 授权界面
```

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 规则冲突 | 权限判断错误 | 明确的优先级规则 + 日志 |
| 迁移失败 | 配置丢失 | 向后兼容 + 自动备份 |
| 性能影响 | 规则加载慢 | 缓存 + 懒加载 |
| 安全漏洞 | 权限绕过 | 安全审计 + 硬拒绝 |

---

## 七、总结

Dexter 和 Claude Code 的授权系统有着相似的设计理念，核心差异在于:

1. **Dexter** 拥有更完整的 TUI 授权界面和会话追踪
2. **Claude Code** 拥有更灵活的插件配置系统和 Hook 支持

通过本计划实施的统一权限架构，可以:

- 保持与 Claude Code 的兼容性
- 增强 Dexter 的配置灵活性
- 支持 MCP 权限隔离
- 提升用户体验

最终实现一个既安全又灵活的跨平台权限管理系统。
