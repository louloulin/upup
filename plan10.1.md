# UpUp 配置系统增强计划 (plan10.1.md)

> 创建日期: 2026-05-14
> 更新日期: 2026-05-14
> 参考版本: Claude Code v2.1.138

---

## 一、Claude Code vs UpUp 存储对比

### 1.1 目录结构对比

| Claude Code (~/.claude/) | UpUp (~/.upup/) | 状态 |
|--------------------------|-----------------|------|
| sessions/ (PID映射) | sessions/ (已实现) | ✅ |
| projects/ (项目隔离) | data/sessions/ (全局) | ⚠️ |
| skills/ | 无 | ⏳ |
| hooks/ | 无 | ⏳ |
| plugins/ | plugins/ | ✅ |
| settings.json | settings.json | ✅ |
| settings.local.json | 无 | ⏳ |
| settings.d/ | 无 | ⏳ |
| backups/ | 无 | ⏳ |
| shell-snapshots/ | 无 | ⏳ |
| file-history/ | tool-results/ | ⚠️ |
| todos/ | 无 | ⏳ |
| plans/ | plans/ | ✅ |
| memory/ | memory/ | ✅ |
| cache/ | cache/ | ✅ |
| daemon/ | 无 | ⏳ |

### 1.2 核心差距

1. **项目隔离**: Claude Code 用 projects/ 按项目隔离，UpUp 用全局
2. **设置层级**: Claude Code 有 settings.json + local + d/
3. **自动备份**: Claude Code 有 backups/
4. **Shell 快照**: Claude Code 有 shell-snapshots/

---

## 二、目标架构

### 2.1 Claude Code 配置系统 (参考)

Claude Code 使用多层配置系统:

```
~/.claude/
├── settings.json              ← 全局配置 (env, plugins, thinking)
├── settings.local.json        ← 本地覆盖 (权限, 临时配置)
├── settings.d/                ← 配置片段目录 (evolvemind.json)
│   └── *.json
├── backups/                   ← 备份目录
│   └── settings.json.backup.* ← 时间戳备份
└── .claude.json               ← 主配置文件 (projects, oauthAccount, etc.)
```

关键特性:
1. **多层优先级**: settings.d/ > settings.local.json > settings.json
2. **文件锁机制**: 防止并发写入冲突
3. **自动备份**: 写入前创建时间戳备份
4. **配置缓存**: 内存缓存 + 文件监控
5. **损坏恢复**: 损坏时从备份恢复

### 2.2 UpUp 目标多层配置系统

```
~/.upup/
├── settings.json              ← 全局基础配置
├── settings.local.json        ← 本地覆盖 (当前会话)
├── settings.d/                ← 配置片段目录
│   ├── api-providers.json    ← API provider 配置
│   ├── memory-config.json    ← 记忆配置
│   └── tools-config.json      ← 工具配置
├── backups/                   ← 备份目录
│   ├── settings.json.backup.1234567890
│   └── settings.json.backup.1234567891
└── settings.json.lock         ← 文件锁
```

---

## 三、实现计划

### 3.1 Phase 1: 添加多级配置路径常量

**文件**: `src/utils/storage-paths.ts`

```typescript
// Config - 多级配置系统
export const SETTINGS_FILE = globalUpupPath('settings.json');
export const SETTINGS_LOCAL_FILE = globalUpupPath('settings.local.json');
export const SETTINGS_DIR = globalUpupPath('settings.d');
export const SETTINGS_BACKUPS_DIR = globalUpupPath('backups');
export const SETTINGS_LOCK_FILE = globalUpupPath('settings.json.lock');
```

### 3.2 Phase 2: 重构 config.ts

**文件**: `src/utils/config.ts`

实现功能:
1. loadMergedConfig() - 加载并合并所有配置层
2. saveConfigToLayer() - 保存到指定层
3. backupConfig() - 自动备份
4. restoreFromBackup() - 损坏恢复
5. applyEnvOverrides() - 环境变量覆盖

### 3.3 Phase 3: 配置缓存和监控

**功能**:
1. 内存缓存 - 减少磁盘读取
2. 文件监控 - 自动刷新缓存
3. 缓存失效机制

---

## 四、配置优先级架构图

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    UpUp 多层配置系统架构图                                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  Layer 1: Global Settings (settings.json)                                  ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │ { "provider": "deepseek", "modelId": "deepseek-v4-flash", ... }   │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                                    ↓ Merge                                ║
║  Layer 2: Local Override (settings.local.json)                            ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │ { "debug": true, "logLevel": "debug" } ← 覆盖全局                  │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                                    ↓ Merge                                ║
║  Layer 3: Settings.d/ (片段配置)                                          ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │ api-providers.json + memory-config.json + tools-config.json        │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                                    ↓ Merge                                ║
║  Environment Variables (highest priority):                                 ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │ UPUP_PROVIDER, UPUP_MODEL_ID, UPUP_DEBUG, etc.                    │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                                                                             ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

## 五、执行时间估算

```
Phase 1: 添加路径常量             ████░░░░░░░░░░░░░░   15 分钟
Phase 2: 重构 config.ts            ████░░░░░░░░░░░░░░   1 小时
Phase 3: 备份恢复系统              ███░░░░░░░░░░░░░░░   30 分钟
Phase 4: 配置缓存监控              ██░░░░░░░░░░░░░░░░   30 分钟
Phase 5: 环境变量覆盖              ██░░░░░░░░░░░░░░░░   30 分钟
Phase 6: 测试验证                  ████░░░░░░░░░░░░░░   1 小时
─────────────────────────────────────────────────────────────────────────────
总计                                约 4 小时
```

---

## 六、文件变更清单

### 6.1 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/storage-paths.ts` | 添加 SETTINGS_LOCAL_FILE, SETTINGS_DIR, SETTINGS_BACKUPS_DIR |
| `src/utils/config.ts` | 完全重构为多层配置系统 |
| `src/utils/env.ts` | 更新为使用新配置系统 |

### 6.2 新建文件

| 文件 | 说明 |
|------|------|
| `scripts/oscript-config-verify.ts` | 配置系统验证脚本 |

---

## 七、与 Claude Code 功能对比

| 功能 | Claude Code | UpUp (当前) | UpUp (目标) |
|------|-------------|-------------|-------------|
| 多层配置 | ✅ settings.json/local/d/ | ❌ 单层 | ✅ 3 层 |
| 文件锁 | ✅ lockfile | ❌ | ✅ |
| 自动备份 | ✅ backups/ | ❌ | ✅ |
| 损坏恢复 | ✅ findMostRecentBackup | ❌ | ✅ |
| 配置缓存 | ✅ + 文件监控 | ❌ | ✅ |
| 环境变量 | ✅ env/ | 部分 | ✅ 完整 |
| 配置合并 | ✅ deep merge | ❌ | ✅ |

---

## 八、硬编码路径分析 (来自之前计划)

### 8.1 P1 必须修复（使用 cwd 或错误路径）

| 文件 | 硬编码 | 问题 | 状态 |
|------|--------|------|------|
| `src/memory/memory-audit.ts:38` | `join(process.cwd(), '.upup', 'logs')` | 使用 cwd | ✅ 已修复 |
| `src/memory/nested-paths.ts:391` | `join(process.env.HOME, '.upup')` | HOME 可能为 undefined | ⚠️ 分析中 |
| `src/memory/nested-paths.ts:415` | `join(projectDir, '.upup')` | 项目目录 | ⚠️ 设计中 |
| `src/memory/team-paths.ts:92` | `join(process.cwd(), DEFAULT_TEAM_MEMORY_DIR)` | cwd | ⚠️ 分析中 |
| `src/plan/plan-context.ts:237` | `'.upup/plans'` | 相对路径 | ✅ 已修复 |

### 8.2 P2 应该修复（使用全局但非统一）

| 文件 | 硬编码 | 应改为 | 状态 |
|------|--------|--------|------|
| `src/tools/portfolio/multi-portfolio.ts:41` | `'.upup/portfolios'` | `PORTFOLIOS_DIR` | ✅ 已修复 |
| `src/tools/export/export-tools.ts:85` | `'.upup/exports'` | `EXPORTS_DIR` | ✅ 已修复 |
| `src/tools/portfolio/portfolio-tools.ts:56` | `'.upup/portfolio.json'` | `PORTFOLIO_FILE` | ✅ 已修复 |
| `src/tools/watchlist/watchlist-tools.ts:42` | `'.upup/watchlist.json'` | `WATCHLIST_FILE` | ✅ 已修复 |
| `src/memory/team-paths.ts:72` | `'.upup/teams'` | `TEAMS_DIR` | ✅ 已修复 |
| `src/utils/long-term-chat-history.ts:27` | `'.upup/messages/'` | `MESSAGES_DIR` | ✅ 已修复 |

### 8.3 修复说明

**已修复的文件**:
- `src/utils/long-term-chat-history.ts`: 已更新为使用 `globalUpupPath()` 替代 `join(process.cwd(), getUpupDir())`
- `src/memory/memory-audit.ts`: 已使用 `LOGS_DIR` 替代硬编码路径
- 其他文件分析结果：大部分已正确使用 storage-paths.js 中的常量

**待分析的文件**:
- `src/memory/nested-paths.ts`: 需要进一步分析设计意图
- `src/memory/team-paths.ts`: 需要进一步分析设计意图

---

## 九、Skills 和 MCP 系统实现计划

### 9.1 Claude Code Skills 系统分析

**目录结构**:

```
~/.claude/skills/                           # 全局 Skills (100+)
├── using-superpowers/SKILL.md
├── tdd/SKILL.md
├── frontend-design/SKILL.md
└── ... (更多 skills)

~/.agents/skills/                           # Agent Skills (符号链接)
```

**SKILL.md 格式**:

```markdown
---
name: skill-name
description: 技能描述
triggers:
  - /skill-name
  - 关键词
---

# Instructions
技能执行指令...
```

**Skill 发现优先级**:
1. `~/.claude/skills/` - 全局 Skills
2. `~/.agents/skills/` - Agent Skills
3. `project/.claude/skills/` - 项目级 Skills

### 9.2 Claude Code 插件钩子系统

**支持的钩子事件** (20+):

| 事件 | 说明 | 用途 |
|------|------|------|
| `PreToolUse` | 工具调用前 | 修改参数、记录日志 |
| `PostToolUse` | 工具调用后 | 处理结果、存储数据 |
| `SessionStart` | 会话开始 | 初始化、加载上下文 |
| `SessionEnd` | 会话结束 | 清理、保存状态 |
| `MessageReceived` | 收到消息 | 处理、过滤 |
| `MessageSent` | 发送消息 | 记录、修改 |
| `PlanCreated` | 创建计划 | 添加建议 |
| `PlanApproved` | 计划批准 | 执行前处理 |
| `ErrorOccurred` | 发生错误 | 错误处理 |
| `FileCreated/Modified/Deleted` | 文件操作 | 版本控制 |
| `McpServerStarted/Stopped` | MCP 生命周期 | 连接处理 |

### 9.3 Claude Code MCP 系统

**MCP 配置**:

```json
// ~/.config/claude/mcp.json 或 .mcp.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

**MCP 缓存文件**:
- `~/.claude/mcp-health-cache.json` - 健康状态
- `~/.claude/mcp-needs-auth-cache.json` - 认证状态

### 9.4 UpUp 当前实现

**Skills** (`src/tools/discovery/skill-discovery.ts`):

```typescript
// 支持的目录
const SKILL_DIRS = [
  '.claude/skills/',
  '.upup/skills/',
  'src/skills/'
];

// Skill 结构
interface Skill {
  name: string;
  path: string;
  enabled: boolean;
}
```

**问题**:
- ❌ 无 Slash 命令支持
- ❌ SKILL.md 格式不完整
- ❌ 无自动激活机制

### 9.5 实现计划

#### Phase 1: Skill 系统增强 (1-2 小时)

**目标目录结构**:

```
~/.upup/skills/                              # UpUp 全局 Skills
├── using-superpowers/SKILL.md
└── ...

./.claude/skills/                            # Claude Code 兼容
./.upup/skills/                              # UpUp 项目 Skills
src/skills/                                  # 项目内 Skills
```

**SKILL.md 格式升级**:

```markdown
---
name: upup-skill-name
description: 技能描述
version: 1.0.0
author: 作者
triggers:
  - /skill-name
  - 关键词触发
---

# Skill Instructions

当触发条件匹配时执行的指令...
```

**Slash 命令解析**:

```typescript
// src/skills/slash-command.ts
interface SkillCommand {
  name: string;
  args?: string;
  skillPath: string;
}

export function parseSlashCommand(input: string): SkillCommand | null {
  const match = input.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;
  
  return {
    name: match[1],
    args: match[2],
    skillPath: findSkillByName(match[1])
  };
}

export function registerSlashCommands(): void {
  const skills = discoverSkills();
  for (const skill of skills) {
    slashCommands.set(skill.name, skill);
  }
}
```

**自动激活机制**:

```typescript
// 根据关键词自动触发 Skill
export function findAutoTriggerSkill(text: string): Skill | null {
  const skills = discoverSkills();
  for (const skill of skills) {
    if (skill.triggers?.some(t => text.includes(t))) {
      return skill;
    }
  }
  return null;
}
```

#### Phase 2: MCP 健康检查系统 (1-2 小时)

**健康检查缓存**:

```typescript
// src/mcp/mcp-health-manager.ts

interface McpHealthStatus {
  server: string;
  healthy: boolean;
  lastCheck: number;
  latency?: number;
  error?: string;
}

const HEALTH_CACHE_FILE = globalUpupPath('mcp-health-cache.json');
const AUTH_CACHE_FILE = globalUpupPath('mcp-needs-auth-cache.json');

export async function checkMcpHealth(
  server: McpServerConfig
): Promise<McpHealthStatus> {
  const start = Date.now();
  try {
    const result = await pingServer(server);
    return {
      server: server.name,
      healthy: true,
      lastCheck: Date.now(),
      latency: Date.now() - start
    };
  } catch (error) {
    return {
      server: server.name,
      healthy: false,
      lastCheck: Date.now(),
      error: String(error)
    };
  }
}

export function updateHealthCache(statuses: McpHealthStatus[]): void {
  writeFileSync(HEALTH_CACHE_FILE, JSON.stringify(statuses, null, 2));
}

export function loadHealthCache(): McpHealthStatus[] {
  if (existsSync(HEALTH_CACHE_FILE)) {
    return JSON.parse(readFileSync(HEALTH_CACHE_FILE, 'utf-8'));
  }
  return [];
}
```

#### Phase 3: 插件钩子系统 (2-3 小时)

**核心架构**:

```typescript
// src/plugins/hook-system.ts

export interface HookContext {
  event: string;
  data: unknown;
  metadata: {
    timestamp: number;
    sessionId?: string;
    pid?: number;
    cwd?: string;
  };
}

export interface HookHandler {
  (context: HookContext): Promise<void> | void;
}

export interface HookPlugin {
  name: string;
  version: string;
  hooks: Record<string, HookHandler | HookHandler[]>;
}

// 核心事件常量
export const HOOK_EVENTS = {
  PRE_TOOL_USE: 'preToolUse',
  POST_TOOL_USE: 'postToolUse',
  SESSION_START: 'sessionStart',
  SESSION_END: 'sessionEnd',
  MESSAGE_RECEIVED: 'messageReceived',
  MESSAGE_SENT: 'messageSent',
  FILE_CREATED: 'fileCreated',
  FILE_MODIFIED: 'fileModified',
  FILE_DELETED: 'fileDeleted',
  PLAN_CREATED: 'planCreated',
  PLAN_APPROVED: 'planApproved',
  ERROR_OCCURRED: 'errorOccurred',
  MCP_SERVER_STARTED: 'mcpServerStarted',
  MCP_SERVER_STOPPED: 'mcpServerStopped',
} as const;

// 钩子注册表
class HookRegistry {
  private handlers: Map<string, HookHandler[]> = new Map();
  
  register(event: string, handler: HookHandler, plugin?: string): void {
    const existing = this.handlers.get(event) || [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }
  
  async invoke(event: string, context: HookContext): Promise<void> {
    const handlers = this.handlers.get(event) || [];
    for (const handler of handlers) {
      try {
        await handler(context);
      } catch (error) {
        console.error(`Hook ${event} failed:`, error);
      }
    }
  }
}

export const hooks = new HookRegistry();

// 工具执行钩子示例
export async function executeWithHooks(
  tool: Tool,
  args: unknown
): Promise<unknown> {
  // PreToolUse 钩子
  await hooks.invoke('preToolUse', {
    event: 'preToolUse',
    data: { tool: tool.name, args },
    metadata: { timestamp: Date.now() }
  });
  
  // 执行工具
  const result = await tool.execute(args);
  
  // PostToolUse 钩子
  await hooks.invoke('postToolUse', {
    event: 'postToolUse',
    data: { tool: tool.name, result },
    metadata: { timestamp: Date.now() }
  });
  
  return result;
}
```

**插件配置文件**:

```json
// ~/.upup/plugins/registry.json
{
  "plugins": [
    {
      "name": "example-plugin",
      "version": "1.0.0",
      "enabled": true,
      "hooks": {
        "preToolUse": "./plugins/example-plugin/dist/hooks.js"
      }
    }
  ]
}
```

### 9.6 优先级和时间估算

```
Phase 1: Skill 系统增强
├── Slash 命令解析              ██░░░░░░░░░░░░░░░   30 分钟
├── SKILL.md 格式升级          ██░░░░░░░░░░░░░░░   30 分钟
├── 自动激活机制                █░░░░░░░░░░░░░░░░   30 分钟
└── 测试验证                    █░░░░░░░░░░░░░░░░   30 分钟
─────────────────────────────────────────────────────────────
小计                                              约 2 小时

Phase 2: MCP 健康检查
├── 健康检查逻辑               ██░░░░░░░░░░░░░░░   45 分钟
├── 缓存管理                   ██░░░░░░░░░░░░░░░   30 分钟
├── 认证管理                   █░░░░░░░░░░░░░░░░   45 分钟
└── 测试验证                   █░░░░░░░░░░░░░░░░   30 分钟
─────────────────────────────────────────────────────────────
小计                                              约 2.5 小时

Phase 3: 插件钩子系统
├── 核心钩子系统               ████░░░░░░░░░░░░░   1 小时
├── 工具钩子实现               ██░░░░░░░░░░░░░░░   45 分钟
├── 会话钩子实现               ██░░░░░░░░░░░░░░░   45 分钟
└── 测试验证                   ██░░░░░░░░░░░░░░░   30 分钟
─────────────────────────────────────────────────────────────
小计                                              约 3 小时

总计                                              约 7.5 小时
```

### 9.7 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/skills/slash-command.ts` | 新建 | Slash 命令解析 |
| `src/skills/skill-registry.ts` | 新建 | Skill 注册表 |
| `src/skills/skill-activator.ts` | 新建 | 自动激活机制 |
| `src/mcp/mcp-health-manager.ts` | 新建 | MCP 健康检查 |
| `src/plugins/hook-system.ts` | 新建 | 插件钩子核心 |
| `src/plugins/hook-registry.ts` | 新建 | 钩子注册表 |
| `src/utils/storage-paths.ts` | 修改 | 添加 PLUGINS_DIR |
| `scripts/oscript-skill-verify.ts` | 新建 | Skill 系统验证 |
| `scripts/oscript-hook-verify.ts` | 新建 | 钩子系统验证 |

---

## 十、功能对比总结

| 功能 | Claude Code | UpUp (当前) | UpUp (计划) |
|------|-------------|-------------|-------------|
| Skill 发现 | ✅ 3层目录 | ⚠️ 3层目录 | ✅ 增强 |
| Skill 激活 | ✅ Slash + 自动 | ❌ 直接 | ✅ 完整 |
| Skill 格式 | ✅ SKILL.md | ⚠️ 简单 | ✅ 标准化 |
| 插件钩子 | ✅ 20+ 事件 | ❌ | ✅ 核心事件 |
| PreToolUse | ✅ | ❌ | ✅ |
| PostToolUse | ✅ | ❌ | ✅ |
| 会话钩子 | ✅ | ❌ | ✅ |
| MCP 健康 | ✅ | ❌ | ✅ |
| MCP 认证 | ✅ | ❌ | ⚠️ |

---

*最后更新: 2026-05-14*
*Claude Code 对比版本: v2.1.138*
