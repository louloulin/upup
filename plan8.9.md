# UpUp 存储系统重构计划 (plan8.9.md)

> 创建日期：2026-05-13
> 更新日期：2026-05-13
> 参考版本：Claude Code v2.1.138

---

## 一、问题分析

### 1.1 当前问题

执行 `upup -r` 时显示 **0 sessions available**，但实际上数据存储在 `./dist/.upup/` 目录。

**原因分析**：

```
当前存储行为：
./dist/upup -r  → 读取 ./dist/.upup/data/sessions/  ✅ 有数据
upup -r         → 读取 ./.upup/data/sessions/       ❌ 无数据
```

| 存储位置 | 目录 | Session 数量 |
|---------|------|-------------|
| dist/.upup | dist/.upup/data/sessions/ | ~58 个 |
| 当前目录 | .upup/data/sessions/ | ~0 个 |

### 1.2 根因分析

**src/utils/paths.ts** 中的 `getUpupDir()` 使用相对路径：

```typescript
export function getUpupDir(): string {
  // 问题：返回相对路径 .upup，而非 ~/.upup
  if (!existsSync(UPUP_DIR) && existsSync(OLD_DIR)) {
    renameSync(OLD_DIR, UPUP_DIR);
  }
  return UPUP_DIR;  // 返回 ".upup" 而非 "~/.upup"
}
```

---

## 二、Claude Code 存储架构详解

### 2.1 Claude Code 全局存储结构 (~/.claude/)

```
~/.claude/
├── sessions/                     # PID → Session 映射文件
│   ├── 11225.json              # { pid, sessionId, cwd, startedAt, ... }
│   ├── 12660.json
│   └── compaction-log.txt
├── projects/                    # 项目级存储（URL 编码路径）
│   ├── -Users-xxx-project/    # 项目路径
│   │   └── *.jsonl            # 会话历史文件
│   └── ...
├── file-history/               # 文件变更历史
├── shell-snapshots/            # Shell 状态快照
├── session-env/               # 会话环境变量
├── todos/                     # Todo 状态
├── skills/                    # 全局 Skills
├── plugins/                   # 插件
├── plans/                     # Plan 文件
├── memory/                    # 记忆存储
├── cache/                     # 缓存
├── backups/                   # 配置备份
│   └── .claude.json.backup.*  # 自动备份
├── daemon/                    # 守护进程数据
│   ├── daemon.log            # 日志
│   ├── daemon.pid            # PID
│   ├── daemon.sock           # IPC 套接字
│   ├── sessions.db           # SQLite 会话数据库
│   └── state.db              # SQLite 状态数据库
├── ide/                       # IDE 集成
├── hooks/                    # 钩子配置
├── agents/                   # 代理配置
├── commands/                 # 自定义命令
├── telemetry/               # 遥测数据
├── statsig/                  # Statsig 配置
├── metrics/                  # 指标数据
├── usage-data/               # 使用数据
├── chrome/                   # Chrome 集成
├── settings.json             # 全局设置
├── settings.local.json       # 本地覆盖
├── settings.d/               # 设置片段目录
├── history.jsonl            # 全局历史
├── .session-stats.json      # 会话统计
├── mcp-health-cache.json     # MCP 健康缓存
├── mcp-needs-auth-cache.json # MCP 认证缓存
└── CLAUDE.md, RTK.md         # 用户配置
```

### 2.2 Claude Code 存储特点

| 特性 | 说明 |
|------|------|
| **全局统一存储** | 所有数据在 ~/.claude，不在项目目录 |
| **PID 会话映射** | sessions/ 下是 PID.json 文件，不是直接存储会话 |
| **项目隔离存储** | projects/ 下按 URL 编码的项目路径组织 |
| **SQLite 数据库** | daemon/ 下使用 sessions.db 和 state.db |
| **实时备份** | 每次启动自动备份配置到 backups/ |
| **多层级配置** | settings.json + settings.local.json + settings.d/ |

### 2.3 Claude Code 路径解析源码

```typescript
// src/daemon/paths.ts
export function getClaudeDir(): string {
  return join(homedir(), '.claude')
}

export function getSessionsDir(): string {
  return join(getClaudeDir(), 'sessions')
}

export function getSkillsDir(): string {
  return join(getClaudeDir(), 'skills')
}
```

### 2.4 Claude Code 会话文件格式

```json
// ~/.claude/sessions/{pid}.json
{
  "pid": 11225,
  "sessionId": "6abda971-81fd-4b67-9041-8e4b4d05c104",
  "cwd": "/Users/louloulin/Documents/linchong/claw/loucode",
  "startedAt": 1778683910005,
  "procStart": "Wed May 13 14:51:49 2026",
  "version": "2.1.138",
  "peerProtocol": 1,
  "kind": "interactive",
  "entrypoint": "claude-desktop-3p"
}
```

---

## 三、UpUp 存储重构方案

### 3.1 目标存储结构

```
~/.upup/                              # 全局配置目录
├── sessions/                         # PID → Session 映射
│   ├── 12345.json                   # 类似 Claude Code
│   └── compaction-log.txt
├── data/                            # 持久数据（向后兼容）
│   ├── sessions/                   # 会话 JSONL 文件
│   ├── memory/                     # 记忆数据
│   └── messages/                   # 消息历史
├── memory/                          # 全局记忆存储
├── settings.json                    # 全局设置
├── cache/                           # 缓存
├── logs/                            # 日志文件
├── tool-results/                    # 工具结果
├── scratchpad/                      # 临时文件
├── exports/                         # 导出数据
├── portfolios/                      # 投资组合
├── plans/                           # 计划文件
├── gateaway.json                    # 网关配置
├── HEARTBEAT.md                     # 心跳检查
└── SOUL.md                          # 灵魂配置
```

### 3.2 架构图

```
╔════════════════════════════════════════════════════════════════════════════════╗
║                   UpUp 存储系统架构图                                        ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  用户目录                                                                      ║
║  ┌─────────────────────────────────────────────────────────────────────────┐  ║
║  │  ~/.upup/                           全局存储（跨项目共享）               │  ║
║  │  ┌─────────────────────────────┐                                        │  ║
║  │  │ sessions/                   │ PID → Session 映射                    │  ║
║  │  │   12345.json                │                                      │  ║
║  │  │   compaction-log.txt         │                                      │  ║
║  │  └─────────────────────────────┘                                        │  ║
║  │  ┌─────────────────────────────┐                                        │  ║
║  │  │ data/                       │ 持久数据                              │  ║
║  │  │   ├── sessions/*.jsonl      │ 会话历史                             │  ║
║  │  │   ├── memory/               │ 记忆                                 │  ║
║  │  │   └── messages/            │ 消息                                 │  ║
║  │  └─────────────────────────────┘                                        │  ║
║  │  ┌─────────────────────────────┐                                        │  ║
║  │  │ settings.json               │ 全局配置                              │  ║
║  │  │ cache/                     │ 缓存                                 │  ║
║  │  │ logs/                      │ 日志                                 │  ║
║  │  │ tool-results/              │ 工具结果                             │  ║
║  │  └─────────────────────────────┘                                        │  ║
║  └─────────────────────────────────────────────────────────────────────────┘  ║
║                                    │                                          ║
║  项目目录                                                                    ║
║  ┌─────────────────────────────────────────────────────────────────────────┐  ║
║  │  /path/to/project/              无项目本地存储（Claude Code 风格）      │  ║
║  │                                                                       │  ║
║  │  ✅ 不创建 .upup/ 目录                                                │  ║
║  │  ✅ 所有数据在 ~/.upup/                                               │  ║
║  │  ✅ 跨项目共享会话和记忆                                              │  ║
║  └─────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
║  环境变量控制                                                                  ║
║  ┌─────────────────────────────────────────────────────────────────────────┐  ║
║  │  UPUP_DATA_DIR     → 指定数据目录（覆盖默认）                           │  ║
║  │  UPUP_LOCAL=1      → 使用项目本地 .upup/（开发模式）                    │  ║
║  └─────────────────────────────────────────────────────────────────────────┘  ║
║                                                                              ║
╚════════════════════════════════════════════════════════════════════════════════╝
```

### 3.3 与 Claude Code 对比

| 特性 | Claude Code | UpUp (当前) | UpUp (目标) |
|------|------------|------------|-------------|
| 全局存储 | ~/.claude/ | N/A | ~/.upup/ |
| 项目存储 | 无 | ./.upup/ | 无 |
| 会话位置 | ~/.claude/sessions/ | ./.upup/data/sessions/ | ~/.upup/data/sessions/ |
| 项目会话 | ~/.claude/projects/ | 无 | 无 |
| PID 映射 | sessions/{pid}.json | 无 | sessions/{pid}.json |
| 数据库 | SQLite | JSON | JSON |

---

## 四、重构实现步骤

### 4.1 Phase 1: 修复 paths.ts

**文件**: `src/utils/paths.ts`

```typescript
import { join, resolve, relative, isAbsolute } from 'node:path';
import { cwd as processCwd } from 'node:process';
import { homedir } from 'node:os';
import { mkdirSync, existsSync, renameSync } from 'fs';

const UPUP_DIR_NAME = '.upup';
const OLD_DIR_NAME = '.dexter';

/**
 * 获取 UpUp 全局配置目录 (~/.upup/)
 * 始终使用全局目录，跨项目共享数据
 */
export function getUpupDir(): string {
  const globalDir = join(homedir(), UPUP_DIR_NAME);

  // 确保目录存在
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }

  return globalDir;
}

/**
 * 获取本地开发目录（仅开发模式使用）
 * 使用环境变量 UPUP_LOCAL=1 启用
 */
export function getLocalUpupDir(): string {
  if (process.env.UPUP_LOCAL !== '1') {
    return getUpupDir();
  }
  const localDir = UPUP_DIR_NAME;
  if (!existsSync(localDir)) {
    mkdirSync(localDir, { recursive: true });
  }
  return localDir;
}

/**
 * 获取当前使用的存储目录
 * 优先级: UPUP_DATA_DIR > UPUP_LOCAL=1 > ~/.upup/
 */
export function getStorageDir(): string {
  // 显式指定目录
  if (process.env.UPUP_DATA_DIR) {
    const dir = process.env.UPUP_DATA_DIR;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  // 本地开发模式
  if (process.env.UPUP_LOCAL === '1') {
    return getLocalUpupDir();
  }

  // 默认全局目录
  return getUpupDir();
}

/**
 * 全局存储路径（用于 sessions, memory 等持久数据）
 */
export function globalUpupPath(...segments: string[]): string {
  return join(getUpupDir(), ...segments);
}

/**
 * 当前存储路径
 */
export function upupPath(...segments: string[]): string {
  return join(getStorageDir(), ...segments);
}
```

### 4.2 Phase 2: 更新存储模块

**文件**: `src/session/storage.ts`

```typescript
import { globalUpupPath, upupPath } from '../utils/paths.js';

// 会话始终使用全局路径，确保跨项目共享
const SESSIONS_DIR = globalUpupPath('data', 'sessions');

function getSessionsDir(): string {
  const dir = SESSIONS_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}
```

### 4.3 Phase 3: 更新其他模块

| 文件 | 修改 |
|------|------|
| `src/agent/session-persistence.ts` | 使用 `globalUpupPath('data', 'sessions')` |
| `src/memory/*.ts` | 使用 `globalUpupPath('memory')` |
| `src/utils/cache.ts` | 使用 `globalUpupPath('cache')` |
| `src/utils/tool-result-storage.ts` | 使用 `globalUpupPath('tool-results')` |
| `src/utils/config.ts` | 使用 `globalUpupPath('settings.json')` |

### 4.4 Phase 4: 添加 PID 会话映射

**文件**: `src/session/pid-manager.ts`

```typescript
import { globalUpupPath } from '../utils/paths.js';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';

interface SessionPidInfo {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart: string;
  version: string;
}

const SESSIONS_DIR = globalUpupPath('sessions');

function getSessionDir(): string {
  const dir = SESSIONS_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function registerSessionPid(sessionId: string): void {
  const dir = getSessionDir();
  const pidFile = join(dir, `${process.pid}.json`);

  const info: SessionPidInfo = {
    pid: process.pid,
    sessionId,
    cwd: process.cwd(),
    startedAt: Date.now(),
    procStart: new Date().toLocaleString(),
    version: '2026.05.13',
  };

  writeFileSync(pidFile, JSON.stringify(info, null, 2));
}

export function unregisterSessionPid(): void {
  const dir = getSessionDir();
  const pidFile = join(dir, `${process.pid}.json`);

  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

export function getAllActiveSessions(): SessionPidInfo[] {
  const dir = getSessionDir();
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));

  return files.map(f => {
    const content = readFileSync(join(dir, f), 'utf-8');
    return JSON.parse(content) as SessionPidInfo;
  }).filter(info => {
    // 检查进程是否仍然存在
    try {
      process.kill(info.pid, 0);
      return true;
    } catch {
      // 进程不存在，清理文件
      unlinkSync(join(dir, f));
      return false;
    }
  });
}
```

### 4.5 Phase 5: 迁移脚本

```typescript
// scripts/migrate-storage.ts
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { homedir } from 'os';

const OLD_DIR = join(homedir(), '.dexter');
const NEW_DIR = join(homedir(), '.upup');

async function migrate() {
  console.log('Migrating UpUp storage...');

  // 创建新目录
  if (!existsSync(NEW_DIR)) {
    mkdirSync(NEW_DIR, { recursive: true });
  }

  // 迁移 .dexter → .upup
  if (existsSync(OLD_DIR)) {
    const dirs = ['sessions', 'data', 'memory', 'cache', 'logs', 'tool-results'];
    for (const dir of dirs) {
      const src = join(OLD_DIR, dir);
      const dest = join(NEW_DIR, dir);
      if (existsSync(src) && !existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
        // 复制文件
        const files = readdirSync(src);
        for (const file of files) {
          copyFileSync(join(src, file), join(dest, file));
        }
        console.log(`  Migrated: ${dir}`);
      }
    }
  }

  // 清理本地 .upup 残留
  const localUpup = '.upup';
  if (existsSync(localUpup) && localUpup !== NEW_DIR) {
    console.log('  Note: local .upup/ exists (development mode)');
  }

  console.log('Migration complete!');
  console.log(`  New storage location: ${NEW_DIR}`);
}
```

---

## 五、向后兼容性

### 5.1 环境变量支持

```bash
# 强制使用本地存储（开发模式）
UPUP_LOCAL=1 upup -r

# 指定存储目录
UPUP_DATA_DIR=/path/to/data upup -r

# 显示当前存储位置
upup --info
```

### 5.2 CLI 选项

```bash
upup --info           # 显示存储位置和版本
upup --storage-dir    # 显示存储目录路径
upup --clear-cache    # 清理缓存
```

---

## 六、验证清单

### 6.1 功能验证

```bash
# 1. 验证全局存储
upup --info  # 应显示: Storage: ~/.upup/

# 2. 验证会话持久化
upup -c                    # 创建会话
upup -r                    # 应显示刚才的会话

# 3. 验证跨项目访问
cd /path/to/project1 && upup -r  # 应看到所有会话
cd /path/to/project2 && upup -r  # 应看到所有会话
```

### 6.2 测试用例

```typescript
describe('Storage', () => {
  test('sessions stored in global directory')
  test('cross-project session access')
  test('PID registration on session start')
  test('PID cleanup on session end')
  test('data migration from .dexter')
  test('UPUP_LOCAL=1 uses local storage')
  test('UPUP_DATA_DIR overrides default')
})
```

---

## 七、执行时间估算

```
Phase 1: paths.ts 重构           ████░░░░░░░░░░░░░░   30 分钟
Phase 2: storage.ts 更新         ██░░░░░░░░░░░░░░░░   20 分钟
Phase 3: 其他模块更新            ████░░░░░░░░░░░░░░   30 分钟
Phase 4: PID 会话映射            ███░░░░░░░░░░░░░░░░   20 分钟
Phase 5: 迁移脚本                █░░░░░░░░░░░░░░░░░   15 分钟
Phase 6: 测试验证                ██████░░░░░░░░░░░░░   45 分钟
─────────────────────────────────────────────────────────────
总计                              约 2.5 小时
```

---

## 八、文件变更清单

### 8.1 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/paths.ts` | 重构 `getUpupDir()` 使用全局路径，添加 `getStorageDir()` |
| `src/session/storage.ts` | 使用 `globalUpupPath('data', 'sessions')` |
| `src/agent/session-persistence.ts` | 使用全局存储路径 |
| `src/memory/*.ts` | 使用 `globalUpupPath('memory')` |
| `src/utils/cache.ts` | 使用 `globalUpupPath('cache')` |
| `src/utils/tool-result-storage.ts` | 使用全局存储路径 |
| `src/utils/config.ts` | 使用 `globalUpupPath('settings.json')` |

### 8.2 新建文件

| 文件 | 说明 |
|------|------|
| `src/session/pid-manager.ts` | PID 会话映射管理 |
| `scripts/migrate-storage.ts` | 数据迁移脚本 |

---

## 九、附录: Claude Code 源码参考

### 9.1 路径解析

```typescript
// src/daemon/paths.ts
export function getClaudeDir(): string {
  return join(homedir(), '.claude')
}

export function getSessionsDir(): string {
  return join(getClaudeDir(), 'sessions')
}
```

### 9.2 会话文件格式

```json
// ~/.claude/sessions/{pid}.json
{
  "pid": 11225,
  "sessionId": "6abda971-81fd-4b67-9041-8e4b4d05c104",
  "cwd": "/path/to/project",
  "startedAt": 1778683910005,
  "procStart": "Wed May 13 14:51:49 2026",
  "version": "2.1.138",
  "peerProtocol": 1,
  "kind": "interactive",
  "entrypoint": "claude-desktop-3p"
}
```

---

*最后更新: 2026-05-13*