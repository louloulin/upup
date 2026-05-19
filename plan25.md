# Plan 25: 全局授权模式与代码架构优化

## 一、代码库全面分析结果

### 1.1 项目概述

**项目名称**: UpUp (涨涨)
**项目类型**: 深度金融研究 AI Agent
**技术栈**: TypeScript + Bun + Monorepo

### 1.2 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      入口层                                  │
│  cli.ts (命令) │ index.tsx (TUI) │ bundled-runner.ts       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent 核心                             │
│  agent.ts │ capability registry │ fallback handling          │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Tools     │      │   Skills     │      │ Components   │
│    (64)     │      │    (25)     │      │    (16)      │
└──────────────┘      └──────────────┘      └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Packages (17+)                         │
│  agent-core | llm | memory | plugin-sdk | skills | ...     │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 核心模块分析

| 模块 | 文件数 | 核心功能 |
|------|--------|----------|
| **agent/** | 47 | Agent 运行逻辑、工具注册、消息处理 |
| **tools/** | 64+ | Bash、文件系统、金融工具(A股/外汇/回测) |
| **skills/** | 25+ | Skill 加载器、执行器、调度器 |
| **components/** | 16 | TUI 组件库 |
| **packages/** | 17+ | Monorepo 包：llm, memory, plugin-sdk |

### 1.4 权限系统现状

#### 1.4.1 已有权限模式

```typescript
// src/session/session-state.ts
export type PermissionMode = 
  | 'default'        // 默认模式，需要确认
  | '.accept-all'    // 接受所有提示
  | 'bypassPermissions'  // 绕过权限检查
  | 'dangerously';     // 危险操作允许
```

#### 1.4.2 权限检查函数

```typescript
// src/session/session-state.ts
export function isDangerousMode(): boolean {
  return _currentPermissionMode === 'dangerously' 
      || _currentPermissionMode === 'bypassPermissions';
}
```

#### 1.4.3 Bash 权限规则

```typescript
// src/tools/bash/permission-mode.ts
BUILT_IN_RULES = [
  // 安全命令 - 直接放行
  { pattern: /^pwd$/i, mode: 'bypass' },
  { pattern: /^echo\s+/i, mode: 'bypass' },
  { pattern: /^ls(\s|$)/i, mode: 'bypass' },
  { pattern: /^git\s+(log|show|diff|status)/i, mode: 'bypass' },
  
  // 写操作 - 需要确认
  { pattern: /^rm\s+/i, mode: 'ask' },
  { pattern: /^git\s+(add|commit|push)/i, mode: 'ask' },
  { pattern: /^npm\s+(install|uninstall)/i, mode: 'ask' },
  
  // 危险操作 - 始终拒绝
  { pattern: /^rm\s+-rf\s+\//i, mode: 'deny' },
  { pattern: /^mkfs\b/, mode: 'deny' },
]
```

#### 1.4.4 全局配置文件

```json
// .claude/settings.local.json
{
  "permissions": {
    "allow": [
      "Bash(grep -E \"\\.(json|js|ts|md)$\")",
      "Bash(wc -l /path/**/*.ts)"
    ]
  }
}
```

---

## 二、Claude Code 全局授权模式对比

### 2.1 Claude Code 的 `--dangerouslyAllowMax` 模式

Claude Code 提供 `--dangerouslyAllowMax` 标志来：
- 跳过所有权限确认
- 允许执行所有命令（包括危险命令）
- 绕过工具使用限制

### 2.2 UpUp vs Claude Code 权限对比

| 特性 | Claude Code | UpUp (当前) | 差距 |
|------|------------|-------------|------|
| CLI 标志 | `--dangerouslyAllowMax` | ❌ 无 | 需添加 |
| 环境变量 | ❌ | ❌ | 需添加 |
| 全局配置文件 | `~/.claude/settings.json` | `.claude/settings.local.json` | ✅ 已实现 |
| 权限规则语法 | `Bash(...)` | `Bash(...)` | ✅ 一致 |
| 运行时切换 | ❌ | `setPermissionMode()` | ✅ 已实现 |
| 权限持久化 | ✅ | ✅ | ✅ 已实现 |

---

## 三、实现计划

### 3.1 Phase 1: 全局授权模式 CLI 标志

**目标**: 添加 `--dangerously` 或 `--allow-all` CLI 标志

**修改文件**:
- `src/cli.ts` - 添加命令行参数解析
- `src/run.ts` - 初始化时设置全局权限模式

**实现步骤**:
```bash
# 新的 CLI 用法
dexter --dangerously "分析A股市场"
dexter --allow-all run "分析某股票"
```

### 3.2 Phase 2: 环境变量支持

**目标**: 支持环境变量控制全局权限

**修改文件**:
- `src/utils/config.ts` - 读取环境变量
- `src/session/session-state.ts` - 初始化权限模式

**新增环境变量**:
```bash
export UPUP_DANGEROUSLY_MODE=true
export UPUP_ALLOW_ALL=true
```

### 3.3 Phase 3: 配置文件增强

**目标**: 在 `.claude/settings.local.json` 支持全局开关

**修改文件**:
- `src/utils/config.ts` - 解析新配置项

**配置格式**:
```json
{
  "permissions": {
    "dangerouslyAllow": true,
    "allow": ["Bash(...)", "Read(...)"]
  }
}
```

### 3.4 Phase 4: 运行时权限切换命令

**目标**: 添加 `/dangerously` 和 `/safemode` slash 命令

**修改文件**:
- `src/skills/commands.ts` - 添加新命令

**实现**:
```
/dangerously    # 切换到全局授权模式
/safemode      # 切换回安全模式
```

---

## 四、详细实现规格

### 4.1 CLI 参数解析

```typescript
// src/cli.ts
interface CliFlags {
  dangerously: boolean;
  allowAll: boolean;
  safe: boolean;
}

// 优先级: --dangerously > --safe > default
```

### 4.2 权限检查流程

```
用户输入
    │
    ▼
┌─────────────────────────────────────────┐
│  检查 CLI 标志 / 环境变量 / 配置文件     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  dangerouslyMode === true?              │
│    ├─ Yes → 直接放行所有操作            │
│    └─ No  → 执行正常权限检查            │
└─────────────────────────────────────────┘
```

### 4.3 危险操作分类

```typescript
// src/hooks/permission-hooks.ts
const DANGEROUS_TOOLS = [
  'Bash',
  'Write',
  'Edit', 
  'mcp__Bash',
];

const BLOCKED_TOOLS = [
  'Delete',      // 删除系统文件
  'DropTable',   // 数据库操作
  'GitResetHard', // Git 强制重置
];

// dangerously 模式下仍保留 BLOCKED_TOOLS 的拒绝
```

---

## 五、实施优先级

| 优先级 | 任务 | 工作量 | 风险 |
|--------|------|--------|------|
| P0 | CLI `--dangerously` 标志 | 小 | 低 |
| P0 | 环境变量支持 | 小 | 低 |
| P1 | 配置文件增强 | 中 | 低 |
| P1 | Slash 命令支持 | 小 | 低 |
| P2 | 权限规则语法扩展 | 中 | 中 |
| P2 | 权限审计日志 | 中 | 低 |

---

## 六、测试计划

### 6.1 单元测试
- 权限模式切换测试
- 权限规则匹配测试
- CLI 参数解析测试

### 6.2 集成测试
- 端到端权限流程测试
- 配置文件加载测试

### 6.3 安全测试
- 危险操作绕过测试
- 权限持久化测试

---

## 七、向后兼容性

- 默认行为保持不变 (`default` 模式)
- 所有现有配置文件继续有效
- 新增 CLI 标志不影响现有用法

---

## 八、文档更新

- 更新 `README.md` - 新增全局授权模式说明
- 更新 `CLAUDE.md` - 添加安全使用指南
- 添加 `docs/PERMISSIONS.md` - 详细权限文档
