# UpUp 存储重构与 Claude Code 对齐计划 (plan10.1.md)

> 创建日期：2026-05-14
> 更新日期：2026-05-14
> 参考版本：Claude Code v2.1.138

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

1. **项目隔离**：Claude Code 用 projects/ 按项目隔离，UpUp 用全局
2. **设置层级**：Claude Code 有 settings.json + local + d/
3. **自动备份**：Claude Code 有 backups/
4. **Shell 快照**：Claude Code 有 shell-snapshots/

---

## 二、硬编码路径分析

### 2.1 P1 必须修复（使用 cwd 或错误路径）

| 文件 | 硬编码 | 问题 |
|------|--------|------|
| `src/memory/memory-audit.ts:38` | `join(process.cwd(), '.upup', 'logs')` | 使用 cwd |
| `src/memory/nested-paths.ts:391` | `join(process.env.HOME, '.upup')` | HOME 可能为 undefined |
| `src/memory/nested-paths.ts:415` | `join(projectDir, '.upup')` | 项目目录 |
| `src/memory/team-paths.ts:92` | `join(process.cwd(), DEFAULT_TEAM_MEMORY_DIR)` | cwd |
| `src/plan/plan-context.ts:237` | `'.upup/plans'` | 相对路径 |

### 2.2 P2 应该修复（使用全局但非统一）

| 文件 | 硬编码 | 应改为 |
|------|--------|--------|
| `src/tools/portfolio/multi-portfolio.ts:41` | `'.upup/portfolios'` | `globalUpupPath('portfolios')` |
| `src/tools/export/export-tools.ts:85` | `'.upup/exports'` | `globalUpupPath('exports')` |
| `src/tools/portfolio/portfolio-tools.ts:56` | `'.upup/portfolio.json'` | `globalUpupPath('portfolio.json')` |
| `src/tools/watchlist/watchlist-tools.ts:42` | `'.upup/watchlist.json'` | `globalUpupPath('watchlist.json')` |
| `src/memory/team-paths.ts:72` | `'.upup/teams'` | `globalUpupPath('teams')` |
| `src/utils/long-term-chat-history.ts:27` | `'.upup/messages/'` | `globalUpupPath('messages')` |

### 2.3 P3 可保留（合理的使用场景）

| 文件 | 硬编码 | 说明 |
|------|--------|------|
| `src/plugins/loader.ts:33` | `'~/.upup/plugins'` | 可接受的全局路径 |
| `src/cli.ts:404` | `'.upup/RULES.md'` | 用户可见的相对路径提示 |
| `src/tools/discovery/skill-discovery.ts` | `['.claude/skills', '.upup/skills']` | 搜索路径数组 |

---

## 三、重构计划

### 3.1 Phase 1: 创建统一路径常量

**文件**: `src/utils/storage-paths.ts`

```typescript
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

const UPUP_DIR_NAME = '.upup';

/**
 * Get global UpUp directory (~/.upup/)
 */
export function getUpupDir(): string {
  const dir = join(homedir(), UPUP_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function globalUpupPath(...segments: string[]): string {
  return join(getUpupDir(), ...segments);
}

export const upupPath = globalUpupPath;

// Config
export const SETTINGS_FILE = globalUpupPath('settings.json');
export const ENV_FILE = globalUpupPath('.env');
export const RULES_FILE = globalUpupPath('RULES.md');
export const HEARTBEAT_FILE = globalUpupPath('HEARTBEAT.md');
export const SOUL_FILE = globalUpupPath('SOUL.md');

// Data
export const SESSIONS_DIR = globalUpupPath('data', 'sessions');
export const PID_SESSIONS_DIR = globalUpupPath('sessions');
export const MEMORY_DIR = globalUpupPath('memory');
export const CACHE_DIR = globalUpupPath('cache');
export const LOGS_DIR = globalUpupPath('logs');
export const TOOL_RESULTS_DIR = globalUpupPath('tool-results');
export const SCRATCHPAD_DIR = globalUpupPath('scratchpad');
export const EXPORTS_DIR = globalUpupPath('exports');
export const PLANS_DIR = globalUpupPath('plans');
export const PORTFOLIOS_DIR = globalUpupPath('portfolios');
export const WATCHLIST_FILE = globalUpupPath('watchlist.json');
export const PORTFOLIO_FILE = globalUpupPath('portfolio.json');
export const MESSAGES_DIR = globalUpupPath('messages');
export const TEAMS_DIR = globalUpupPath('teams');

// Runtime
export const HOOKS_DIR = globalUpupPath('hooks');
export const SKILLS_DIR = globalUpupPath('skills');
export const PLUGINS_DIR = globalUpupPath('plugins');
export const MCP_CONFIG_FILE = globalUpupPath('mcp-config.json');
export const MCP_SERVERS_FILE = globalUpupPath('mcp-servers.json');
export const KEYBINDINGS_FILE = globalUpupPath('keybindings.json');
export const PERMISSIONS_FILE = globalUpupPath('permissions.json');
```

### 3.2 Phase 2: 批量修复 P1

| 文件 | 修改 |
|------|------|
| `src/memory/memory-audit.ts` | `LOGS_DIR` |
| `src/memory/nested-paths.ts` | `getUpupDir()` |
| `src/memory/team-paths.ts` | `globalUpupPath('teams')` |
| `src/plan/plan-context.ts` | `PLANS_DIR` |

### 3.3 Phase 3: 修复 P2

| 文件 | 修改 |
|------|------|
| `src/tools/portfolio/multi-portfolio.ts` | `PORTFOLIOS_DIR` |
| `src/tools/export/export-tools.ts` | `EXPORTS_DIR` |
| `src/tools/portfolio/portfolio-tools.ts` | `PORTFOLIO_FILE` |
| `src/tools/watchlist/watchlist-tools.ts` | `WATCHLIST_FILE` |
| `src/utils/long-term-chat-history.ts` | `MESSAGES_DIR` |

---

## 四、执行时间估算

```
Phase 1: 创建 storage-paths.ts     15 分钟
Phase 2: 修复 P1 (4 文件)          20 分钟
Phase 3: 修复 P2 (5 文件)          15 分钟
Phase 4: 测试验证                 15 分钟
────────────────────────────────────────
总计                              约 1 小时
```

---

## 五、验证清单

```bash
# 检查硬编码
grep -rn "process\.cwd()\|'\.upup'" src --include="*.ts" | grep -v storage-paths

# 应该只有合理的使用
```

---

## 六、文件变更清单

### 6.1 新建

| 文件 | 说明 |
|------|------|
| `src/utils/storage-paths.ts` | 统一路径常量 |

### 6.2 修改

| 文件 | 修改 |
|------|------|
| `src/memory/memory-audit.ts` | LOGS_DIR |
| `src/memory/nested-paths.ts` | getUpupDir() |
| `src/memory/team-paths.ts` | TEAMS_DIR |
| `src/plan/plan-context.ts` | PLANS_DIR |
| `src/tools/portfolio/multi-portfolio.ts` | PORTFOLIOS_DIR |
| `src/tools/export/export-tools.ts` | EXPORTS_DIR |
| `src/tools/portfolio/portfolio-tools.ts` | PORTFOLIO_FILE |
| `src/tools/watchlist/watchlist-tools.ts` | WATCHLIST_FILE |
| `src/utils/long-term-chat-history.ts` | MESSAGES_DIR |

---

*最后更新: 2026-05-14*
