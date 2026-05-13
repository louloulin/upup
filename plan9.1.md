# UpUp 存储与 Claude Code 对比分析 + 硬编码清理计划 (plan9.1.md)

> 创建日期：2026-05-14
> 更新日期：2026-05-14
> 参考版本：Claude Code v2.1.138
> 继承自：plan8.9.md

---

## 一、Claude Code vs UpUp 存储架构对比

### 1.1 目录结构对比

| 目录 | Claude Code (~/.claude/) | UpUp (~/.upup/) | 状态 |
|------|------------------------|-----------------|------|
| sessions/ | PID → Session 映射 | sessions/ (已实现) | ✅ |
| file-history/ | 文件变更历史 | tool-results/ | ⚠️ |
| shell-snapshots/ | Shell 状态快照 | 无 | ⏳ |
| daemon/ | SQLite 数据库 | 无 | ⏳ |
| settings.json | 全局设置 | settings.json | ✅ |
| settings.local.json | 本地覆盖 | 无 | ⏳ |
| settings.d/ | 设置片段 | 无 | ⏳ |
| backups/ | 自动备份 | 无 | ⏳ |
| skills/ | 全局 Skills | 无 | ⏳ |
| hooks/ | 钩子配置 | 无 | ⏳ |
| plugins/ | 插件 | plugins/ | ✅ |
| todos/ | Todo 状态 | 无 | ⏳ |
| plans/ | Plan 文件 | plans/ | ✅ |
| memory/ | 记忆存储 | memory/ | ✅ |

---

## 二、硬编码路径分析

### 2.1 已发现硬编码路径 (P1 必须修复)

| 文件 | 硬编码 | 应改为 |
|------|--------|--------|
| `src/memory/memory-audit.ts:38` | `join(process.cwd(), '.upup', 'logs')` | `globalUpupPath('logs')` |
| `src/memory/nested-paths.ts:391` | `join(process.env.HOME \|\| '~', '.upup')` | `getUpupDir()` |
| `src/mcp/client.ts:823` | `join(process.cwd(), '.upup', 'mcp-config.json')` | `globalUpupPath('mcp-config.json')` |
| `src/hooks/user-hooks.ts:42` | `join(process.cwd(), '.upup', 'hooks')` | `globalUpupPath('hooks')` |
| `src/commands/mcp.ts:64` | `join(homedir(), '.config', 'upup', ...)` | `globalUpupPath('mcp-servers.json')` |
| `src/skills/registry.ts:24` | `join(process.cwd(), '.claude', 'skills')` | `globalUpupPath('skills')` |

### 2.2 P2 应该修复

| 文件 | 硬编码 | 应改为 |
|------|--------|--------|
| `src/commands/onboarding.ts:181` | `'.env'` | `globalUpupPath('.env')` |
| `src/commands/doctor.ts:70` | `existsSync('.env')` | `globalUpupPath('.env')` |

---

## 三、重构计划

### 3.1 Step 1: 创建 storage-paths.ts

```typescript
// src/utils/storage-paths.ts
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

const UPUP_DIR_NAME = '.upup';

export function getUpupDir(): string {
  const dir = join(homedir(), UPUP_DIR_NAME);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function upupPath(...segments: string[]): string {
  return join(getUpupDir(), ...segments);
}

export const globalUpupPath = upupPath;

// Config files
export const SETTINGS_FILE = upupPath('settings.json');
export const ENV_FILE = upupPath('.env');

// Data directories
export const SESSIONS_DIR = upupPath('data', 'sessions');
export const PID_SESSIONS_DIR = upupPath('sessions');
export const MEMORY_DIR = upupPath('memory');
export const CACHE_DIR = upupPath('cache');
export const LOGS_DIR = upupPath('logs');
export const TOOL_RESULTS_DIR = upupPath('tool-results');

// Runtime directories
export const HOOKS_DIR = upupPath('hooks');
export const SKILLS_DIR = upupPath('skills');
export const PLUGINS_DIR = upupPath('plugins');
export const MCP_CONFIG_FILE = upupPath('mcp-config.json');
export const MCP_SERVERS_FILE = upupPath('mcp-servers.json');
```

### 3.2 Step 2: 更新 paths.ts

```typescript
// 重导出 storage-paths
export { getUpupDir, upupPath, globalUpupPath } from './storage-paths.js';
```

### 3.3 Step 3: 批量修复 P1 文件

| 文件 | 修改 |
|------|------|
| `src/memory/memory-audit.ts` | 使用 LOGS_DIR |
| `src/memory/nested-paths.ts` | 使用 getUpupDir() |
| `src/mcp/client.ts` | 使用 MCP_CONFIG_FILE |
| `src/hooks/user-hooks.ts` | 使用 HOOKS_DIR |
| `src/commands/mcp.ts` | 使用 MCP_SERVERS_FILE |
| `src/skills/registry.ts` | 使用 SKILLS_DIR |

### 3.4 Step 4: 修复 P2 文件

| 文件 | 修改 |
|------|------|
| `src/commands/onboarding.ts` | 使用 ENV_FILE |
| `src/commands/doctor.ts` | 使用 ENV_FILE |

---

## 四、执行时间估算

```
Step 1: 创建 storage-paths.ts    15 分钟
Step 2: 更新 paths.ts              5 分钟
Step 3: Phase 1 修复 (P1)         20 分钟
Step 4: Phase 2 修复 (P2)         10 分钟
Step 5: 测试验证                  15 分钟
────────────────────────────────────
总计                              约 1 小时
```

---

## 五、文件变更清单

### 5.1 新建文件

| 文件 | 说明 |
|------|------|
| `src/utils/storage-paths.ts` | 统一路径常量模块 |

### 5.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/paths.ts` | 导入并重导出 storage-paths |
| `src/memory/memory-audit.ts` | 使用 LOGS_DIR |
| `src/memory/nested-paths.ts` | 使用 getUpupDir() |
| `src/mcp/client.ts` | 使用 MCP_CONFIG_FILE |
| `src/hooks/user-hooks.ts` | 使用 HOOKS_DIR |
| `src/commands/mcp.ts` | 使用 MCP_SERVERS_FILE |
| `src/skills/registry.ts` | 使用 SKILLS_DIR |
| `src/commands/onboarding.ts` | 使用 ENV_FILE |
| `src/commands/doctor.ts` | 使用 ENV_FILE |

---

*最后更新: 2026-05-14*
