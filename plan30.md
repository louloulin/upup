# Plan 30: UpUp 全面权限优化 - 无授权全面支持

## 一、综合分析总结

### 1.1 项目背景

**项目**: UpUp (涨涨) - 深度金融研究 AI Agent
**目标**: 学习 Claude Code 权限策略，优化 UpUp 权限系统，实现全面权限控制不需要授权的功能

### 1.2 权限架构全貌

```
┌──────────────────────────────────────────────────────────────────────┐
│                        权限模式分层架构                                 │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 1: Session 级别 (src/session/session-state.ts)                │
│  ├─ 'default'         → 标准权限检查                                  │
│  ├─ '.accept-all'     → 接受所有提示                                  │
│  ├─ 'bypassPermissions' → 绕过所有权限检查                            │
│  └─ 'dangerously'     → 允许危险操作                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 2: Bash 工具级别 (src/tools/bash/permission-mode.ts)         │
│  ├─ 'bypass'          → 直接允许                                       │
│  ├─ 'allow'          → 允许（持久化）                                  │
│  ├─ 'ask'            → 需要确认                                       │
│  └─ 'deny'           → 直接拒绝                                        │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 3: SDK 级别 (packages/sdk/src/permissions/manager.ts)         │
│  ├─ 'default'        → 标准检查                                       │
│  ├─ 'acceptEdits'    → 接受编辑                                       │
│  ├─ 'bypassPermissions' → 绕过检查                                     │
│  └─ 'plan'           → 仅规划模式                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、Claude Code 权限策略学习

### 2.1 Claude Code 核心权限特性

| 特性 | 说明 | 优先级参考 |
|------|------|-----------|
| `--dangerouslyAllowMax` | CLI 标志，完全绕过所有权限 | P0 |
| `--dangerously-allow-arbitrary-commands` | 允许执行任意命令 | P1 |
| 环境变量 `ANTHROPIC_DANGEROUSLY_ALLOW_PERMISSIONS` | 环境变量控制 | P0 |
| `~/.claude/settings.json` | 全局配置文件 | P1 |
| 权限规则语法 `Bash(...)` `Read(...)` | 规则匹配格式 | P2 |

### 2.2 Claude Code 权限规则示例

```json
// ~/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff --staged)",
      "Bash(npm run:*)",
      "Read(CLAUDE.md)",
      "Read(README.md)",
      "Read(src/**/*.ts)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)"
    ]
  }
}
```

### 2.3 危险操作永不绕过原则

即使在 `--dangerously` 模式下，Claude Code 仍会阻止：
- Fork bombs: `:( ){ :|: & };:`
- 根目录删除: `rm -rf /`
- 磁盘直接写入: `dd of=/dev/sda`

---

## 三、UpUp 当前权限系统分析

### 3.1 已有功能

#### 3.1.1 Session 级别权限 (`src/session/session-state.ts`)

```typescript
export type PermissionMode = 'default' | '.accept-all' | 'bypassPermissions' | 'dangerously';

export function setPermissionMode(mode: PermissionMode): void
export function getPermissionMode(): PermissionMode
export function isDangerousMode(): boolean  // bypassPermissions || dangerously
export function isBypassPermissionsMode(): boolean
```

#### 3.1.2 Bash 权限规则 (`src/tools/bash/permission-mode.ts`)

**内置 BUILT_IN_RULES:**
```typescript
// bypass 模式 - 读操作和安全命令
{ pattern: /^pwd$/i, mode: 'bypass' }
{ pattern: /^ls(\s|$)/i, mode: 'bypass' }
{ pattern: /^cd\s+\S/i, mode: 'bypass' }
{ pattern: /^cat\s+/i, mode: 'bypass' }
{ pattern: /^grep\s+/i, mode: 'bypass' }
{ pattern: /^find\s+/i, mode: 'bypass' }
{ pattern: /^git\s+(log|show|diff|status|branch|tag|remote|stash)/i, mode: 'bypass' }

// ask 模式 - 写操作
{ pattern: /^rm\s+/i, mode: 'ask' }
{ pattern: /^mkdir\s+/i, mode: 'ask' }
{ pattern: /^cp\s+/i, mode: 'ask' }
{ pattern: /^mv\s+/i, mode: 'ask' }
{ pattern: /^git\s+(add|commit|push|pull|merge)/i, mode: 'ask' }
{ pattern: /^npm\s+(install|uninstall|update)/i, mode: 'ask' }

// deny 模式 - 危险操作
{ pattern: /:\(\)\{:\|:&\};:/, mode: 'deny' }
{ pattern: /^rm\s+-rf\s+\//i, mode: 'deny' }
{ pattern: /^mkfs\b/, mode: 'deny' }
```

#### 3.1.3 命令分类 (`src/tools/bash/command-classifier.ts`)

```typescript
export const READ_ONLY_COMMANDS = new Set([
  'ls', 'pwd', 'cd', 'cat', 'head', 'tail', 'grep', 'find',
  'git status', 'git log', 'git diff', 'git show',
  'ps', 'top', 'df', 'du', 'free'
]);

export const WRITE_COMMANDS = new Set([
  'rm', 'mkdir', 'touch', 'cp', 'mv', 'chmod', 'chown',
  'git add', 'git commit', 'git push', 'npm install'
]);

export const DESTRUCTIVE_COMMANDS = new Set([
  'rm -rf', 'mkfs', 'dd', 'fdisk', 'forkbomb'
]);
```

#### 3.1.4 SDK PermissionManager

```typescript
const pm = new PermissionManager({
  mode: 'bypassPermissions',  // 绕过所有检查
  allowedTools: ['bash', 'read'],
  disallowedTools: ['rm', 'sudo'],
  canUseTool: async (toolName, input) => {
    // 自定义权限逻辑
    return { behavior: 'allow' };
  }
});
```

### 3.2 权限检查流程

```
用户输入命令
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  1. AST 安全分析 (ast-parser.ts)                     │
│  2. 危险模式检测 (security.ts)                        │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  getPermissionMode(command)                         │
│  ├─ 检查 BUILT_IN_RULES (正则匹配)                   │
│  ├─ 检查 permissionStore (用户规则)                  │
│  └─ 检查 classifyCommand() (命令分类)                │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  根据模式决定行为:                                    │
│  ├─ bypass/allow → 直接执行                          │
│  ├─ ask → 触发授权提示                              │
│  └─ deny → 拒绝执行                                  │
└─────────────────────────────────────────────────────┘
```

---

## 四、差距分析与改进方向

### 4.1 功能差距矩阵

| 特性 | Claude Code | UpUp 当前 | 改进方向 |
|------|------------|----------|----------|
| CLI `--dangerously` 标志 | ✅ `--dangerouslyAllowMax` | ❌ 无 | **Phase 1** |
| CLI `--dangerously-allow-arbitrary-commands` | ✅ 支持 | ❌ 无 | **Phase 2** |
| 环境变量控制 | ✅ `ANTHROPIC_*` | ❌ 无 | **Phase 1** |
| 全局 `settings.json` | ✅ `~/.claude/settings.json` | ✅ `.claude/settings.local.json` | ✅ 已实现 |
| 权限规则语法 | ✅ `Bash(...)` `Read(...)` | ✅ 兼容 | ✅ 已实现 |
| 运行时切换 | ❌ | ✅ `setPermissionMode()` | ✅ 已实现 |
| 权限持久化 | ✅ | ✅ | ✅ 已实现 |
| 危险命令永不绕过 | ✅ | ✅ | ✅ 已实现 |

### 4.2 改进优先级

| 优先级 | 任务 | 工作量 | 风险 |
|--------|------|--------|------|
| P0 | 添加 `--dangerously` CLI 标志 | 小 | 低 |
| P0 | 添加环境变量支持 | 小 | 低 |
| P1 | 完善 `settings.local.json` 全局开关 | 中 | 低 |
| P1 | 扩展 bypass 命令列表 | 小 | 低 |
| P2 | `/dangerously` 和 `/safemode` slash 命令 | 小 | 低 |
| P2 | 权限审计日志 | 中 | 低 |
| P3 | Web UI 权限配置面板 | 大 | 中 |

---

## 五、实施计划

### Phase 0: 环境准备

**目标**: 验证现有权限系统

```bash
# 验证 bypass 命令列表
cd /Users/louloulin/Documents/linchong/touzhi/dexter
bun run src/tools/bash/permission-mode.ts

# 查看当前权限模式
bunx tsx -e "
import { getPermissionMode, checkPermission } from './src/tools/bash/permission-mode.js';
console.log('pwd:', getPermissionMode('pwd'));
console.log('ls:', getPermissionMode('ls'));
console.log('rm:', getPermissionMode('rm'));
console.log('git status:', getPermissionMode('git status'));
console.log('git push:', getPermissionMode('git push'));
"
```

### Phase 1: CLI 标志 + 环境变量 (P0)

**修改文件**:

1. **`src/cli.ts`** - 添加 CLI 参数解析
```typescript
// 新增参数
interface DangerousFlags {
  dangerously: boolean;
  dangerouslyAllowArbitrary: boolean;
}

// 参数解析
program
  .option('--dangerously', 'Allow all operations without permission prompts')
  .option('--dangerously-allow-arbitrary-commands', 'Allow arbitrary commands');
```

2. **`src/run.ts`** - 初始化权限模式
```typescript
import { setPermissionMode } from './session/session-state.js';

// CLI 参数 → 权限模式映射
if (argv.dangerously) {
  setPermissionMode('dangerously');
} else if (argv.dangerouslyAllowArbitrary) {
  setPermissionMode('bypassPermissions');
}
```

3. **`src/utils/config.ts`** - 读取环境变量
```typescript
// 新增环境变量
const UPUP_DANGEROUSLY_MODE = process.env.UPUP_DANGEROUSLY_MODE === 'true';
const UPUP_ALLOW_ARBITRARY = process.env.UPUP_ALLOW_ARBITRARY === 'true';

// 优先级: CLI > 环境变量 > 配置文件
```

### Phase 2: 扩展 bypass 命令 (P1)

**修改文件**: `src/tools/bash/permission-mode.ts`

**新增 bypass 命令**:
```typescript
// 开发常用命令
{ pattern: /^npm\s+(run|test|lint|build|dev|start)/i, mode: 'bypass' },
{ pattern: /^bun\s+(run|test|add|remove)/i, mode: 'bypass' },
{ pattern: /^pnpm\s+(run|dev|build)/i, mode: 'bypass' },
{ pattern: /^yarn\s+(dev|build|start)/i, mode: 'bypass' },
{ pattern: /^npx\s+/i, mode: 'bypass' },

// Git 读写操作（安全子集）
{ pattern: /^git\s+(fetch|pull\s+--rebase)/i, mode: 'bypass' },
{ pattern: /^git\s+stash\s+(pop|apply)/i, mode: 'bypass' },

// 文件查看
{ pattern: /^wc\s+/i, mode: 'bypass' },
{ pattern: /^sort\s+/i, mode: 'bypass' },
{ pattern: /^uniq\s+/i, mode: 'bypass' },
{ pattern: /^cut\s+/i, mode: 'bypass' },
{ pattern: /^awk\s+/i, mode: 'bypass' },
{ pattern: /^sed\s+-i\s+/i, mode: 'bypass' },  // 带 -i 的 sed 需要确认

// 进程管理
{ pattern: /^kill\s+-9?\s+\d+/i, mode: 'bypass' },
{ pattern: /^killall\s+/i, mode: 'bypass' },
```

### Phase 3: 配置文件增强 (P1)

**修改文件**: `src/utils/config.ts`

**配置文件格式**:
```json
// .claude/settings.local.json
{
  "permissions": {
    "dangerouslyAllow": false,
    "allowArbitraryCommands": false,
    "allow": [
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(npm run:*)",
      "Bash(bun *)",
      "Read(CLAUDE.md)",
      "Read(README.md)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)"
    ],
    "bypassCommands": [
      "ls",
      "pwd",
      "cd",
      "cat",
      "grep"
    ]
  },
  "env": {
    "UPUP_MODEL": "deepseek-v4"
  }
}
```

### Phase 4: Slash 命令支持 (P2)

**修改文件**: `src/commands/permission-commands.ts`

```typescript
// 新增 slash 命令
export const permissionCommands: SlashCommand[] = [
  {
    name: 'dangerously',
    description: 'Enable dangerous mode - allow all operations',
    handler: () => {
      setPermissionMode('dangerously');
      console.log('✓ Dangerous mode enabled - all operations allowed');
    }
  },
  {
    name: 'safemode',
    description: 'Return to safe mode - normal permission checks',
    handler: () => {
      setPermissionMode('default');
      console.log('✓ Safe mode enabled - permission checks active');
    }
  },
  {
    name: 'bypass',
    description: 'Bypass all permissions without dangerous mode',
    handler: () => {
      setPermissionMode('bypassPermissions');
      console.log('✓ Permission bypass enabled - no prompts');
    }
  }
];
```

### Phase 5: 权限状态显示 (P2)

**修改文件**: `src/components/status-bar.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ [🦁 Dexter]  [Model: deepseek-v4]  [Mode: bypass]  [2/100] │
└─────────────────────────────────────────────────────────────┘
                    ↑
              权限模式指示器
```

---

## 六、详细实现规格

### 6.1 CLI 参数解析规格

```typescript
// src/cli/types.ts
export interface DangerousCliOptions {
  /**
   * --dangerously
   * Enable dangerous mode - allow all operations including dangerous ones
   */
  dangerously?: boolean;

  /**
   * --dangerously-allow-arbitrary-commands
   * Allow execution of arbitrary commands without permission prompts
   */
  dangerouslyAllowArbitrary?: boolean;

  /**
   * --safe, --safemode
   * Force safe mode - all permission checks active
   */
  safe?: boolean;
}

// 优先级: --dangerously > --dangerously-allow-arbitrary > --safe > default
```

### 6.2 环境变量规格

```bash
# .env 或 shell profile
export UPUP_DANGEROUSLY=true           # 危险模式
export UPUP_BYPASS_PERMISSIONS=true    # 绕过模式
export UPUP_SAFE_MODE=true             # 安全模式（覆盖其他）
export UPUP_PERMISSION_MODE=default    # 默认模式
```

### 6.3 权限检查增强规格

```typescript
// src/tools/bash/permission-mode.ts
interface ExtendedBypassConfig {
  // 开发命令自动 bypass
  devCommands: boolean;
  // Git 安全操作 bypass
  gitSafeOps: boolean;
  // 文件查看 bypass
  readCommands: boolean;
  // 网络诊断 bypass
  networkDiagnostics: boolean;
}

// 配置默认值
const DEFAULT_BYPASS_CONFIG: ExtendedBypassConfig = {
  devCommands: true,
  gitSafeOps: true,
  readCommands: true,
  networkDiagnostics: true,
};
```

### 6.4 权限持久化规格

```typescript
// src/tools/bash/permission-store.ts
interface PermissionRule {
  pattern: string;
  mode: 'bypass' | 'allow' | 'ask' | 'deny';
  createdAt: number;
  source: 'builtin' | 'user' | 'config';
}

// 持久化位置
const PERMISSION_STORE_PATH = '~/.upup/permissions.json';
```

---

## 七、安全考虑

### 7.1 永不绕过的危险模式

即使在 `--dangerously` 模式下，以下操作仍会被阻止：

```typescript
const HARD_DENY_PATTERNS = [
  /:\(\)\{:\|:&\};:/,           // Fork bomb
  /^rm\s+-rf\s+\/+/,            // 根目录递归删除
  /^mkfs\b/,                    // 创建文件系统
  /^dd\s+.*of=\/dev\//,         // 直接磁盘写入
  /\bsudo\s+rm\s+-rf\b/,        // sudo 删除
  /base64\s+-d\s.*\|\s*sh/,    // 编码命令注入
];
```

### 7.2 审计日志

```typescript
// 所有绕过操作都记录到审计日志
interface PermissionAuditEntry {
  timestamp: number;
  mode: PermissionMode;
  command: string;
  decision: 'allowed' | 'denied' | 'blocked';
  reason?: string;
}

// 审计日志位置
const AUDIT_LOG_PATH = '~/.upup/logs/permission-audit.jsonl';
```

### 7.3 权限模式指示器

在 CLI 和 TUI 中清晰显示当前权限模式：

```
$ dexter --dangerously "分析股票"
🦁 [DANGEROUS] Dexter >

$ dexter "分析股票"
🦁 Dexter >
```

---

## 八、测试计划

### 8.1 单元测试

```typescript
// src/tools/bash/permission-mode.test.ts
describe('PermissionMode', () => {
  describe('getPermissionMode', () => {
    it('should return bypass for read commands', () => {
      expect(getPermissionMode('ls')).toBe('bypass');
      expect(getPermissionMode('pwd')).toBe('bypass');
      expect(getPermissionMode('git status')).toBe('bypass');
    });

    it('should return ask for write commands', () => {
      expect(getPermissionMode('rm file.txt')).toBe('ask');
      expect(getPermissionMode('npm install')).toBe('ask');
    });

    it('should return deny for dangerous commands', () => {
      expect(getPermissionMode('rm -rf /')).toBe('deny');
      expect(getPermissionMode(':(){ :|: & };:')).toBe('deny');
    });
  });
});
```

### 8.2 集成测试

```bash
# 测试 CLI 标志
bun test tests/cli/dangerously-flag.test.ts
bun test tests/cli/env-vars.test.ts
bun test tests/cli/safe-mode.test.ts

# 测试权限流程
bun test tests/permissions/full-flow.test.ts
```

### 8.3 安全测试

```bash
# 验证危险命令仍被阻止
bun test tests/security/hard-deny.test.ts

# 验证审计日志
bun test tests/security/audit-log.test.ts
```

---

## 九、向后兼容性

- **默认行为不变**: 所有变更不改变默认的 `ask` 模式
- **配置文件兼容**: 现有 `.claude/settings.local.json` 继续有效
- **API 兼容**: 现有的 `setPermissionMode()`, `getPermissionMode()` API 不变

---

## 十、实施时间线

| 周次 | Phase | 任务 | 交付物 |
|------|-------|------|--------|
| 第1周 | Phase 0 | 环境准备、代码审查 | 权限系统现状报告 |
| 第1周 | Phase 1 | CLI + 环境变量 | `--dangerously` 支持 |
| 第2周 | Phase 2 | bypass 命令扩展 | 扩展的命令列表 |
| 第2周 | Phase 3 | 配置文件增强 | 完整权限配置 |
| 第3周 | Phase 4 | Slash 命令 | `/dangerously` 命令 |
| 第3周 | Phase 5 | 状态显示 | 权限模式指示器 |
| 第4周 | 测试 + 文档 | 完整测试 + 文档 | 可发布版本 |

---

## 十一、总结

本计划基于对 UpUp 现有权限系统和 Claude Code 权限策略的全面分析，制定了清晰的实施路线：

1. **核心改进**: 添加 `--dangerously` CLI 标志和环境变量支持
2. **安全底线**: 保持危险命令永不绕过原则
3. **用户体验**: 提供清晰的权限状态指示
4. **渐进实施**: 分 Phase 实施，降低风险

**关键成功指标**:
- 90%+ 常用命令无需授权
- 危险操作仍被阻止
- CLI 标志和环境变量正常生效
- 向后兼容性 100%