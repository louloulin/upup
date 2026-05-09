# SNOW — Dexter → Snow 重命名计划

> 分析日期: 2026-05-09 | 基于 release2026.05.09 分支 (9629ef2)

## 1. 概述

将项目名称从 "Dexter" 改为 "Snow"。涉及 **616 处引用**（278 `.ts` + 338 `.json/.md/.sh`）。

**核心原则**: 分层处理，先内部后外部，先代码后文档。

---

## 2. 命名映射表

| 类别 | 旧名称 | 新名称 | 示例 |
|------|--------|--------|------|
| 项目名 | `dexter` | `snow` | `dexter-ts` → `snow-ts` |
| 包名 | `dexter-ts` | `snow-ts` | package.json name |
| 二进制 | `dexter` / `dexter.exe` | `snow` / `snow.exe` | build outputs |
| 配置目录 | `.dexter` | `.snow` | `~/.dexter` → `~/.snow` |
| 函数名 | `getDexterDir` | `getSnowDir` | paths.ts |
| 函数名 | `dexterPath` | `snowPath` | paths.ts |
| 常量 | `DEXTER_DIR` | `SNOW_DIR` | paths.ts |
| 显示名 | `Dexter` | `Snow` | UI intro "Welcome to Snow" |
| 描述 | `Dexter - AI agent for...` | `Snow - AI agent for...` | package.json description |
| 临时文件 | `dexter-*` | `snow-*` | tmpdir prefixes |
| 日志 | `dexter-*.log` | `snow-*.log` | log file names |
| 进程 | `dexter-wt-*` | `snow-wt-*` | worktree dirs |

---

## 3. 风险分级

### 🟢 安全 — 纯字符串替换 (find+sed)

| # | 文件类型 | 数量 | 操作 |
|---|----------|------|------|
| A1 | `package.json` | ~15 refs | 包名、描述、二进制名、author |
| A2 | `scripts/*.ts` | ~30 refs | PROJECT_DIR 路径、日志文件名 |
| A3 | `scripts/*.sh` | ~10 refs | build/release 脚本 |
| A4 | `src/components/intro.ts` | 1 ref | "Welcome to Snow" |
| A5 | 临时文件前缀 | ~15 refs | `dexter-wt-*` → `snow-wt-*` 等 |
| A6 | 日志文件名 | ~5 refs | `dexter-*.log` → `snow-*.log` |
| A7 | 测试临时目录 | ~8 refs | `/tmp/dexter-*-test-*` |

### 🟡 需要迁移 — 配置目录

| # | 变更 | 影响 | 迁移方案 |
|---|------|------|----------|
| B1 | `.dexter` → `.snow` | 50 处代码引用 + 用户配置目录 | 自动迁移: 首次启动时 `mv .dexter .snow` |
| B2 | `getDexterDir()` → `getSnowDir()` | 5 处调用 | 全局重命名 |
| B3 | `dexterPath()` → `snowPath()` | ~20 处调用 | 全局重命名 |
| B4 | `DEXTER_DIR` → `SNOW_DIR` | 1 处定义 | 全局重命名 |

### 🔴 需要手动审查 — 不可自动替换

| # | 文件 | 原因 |
|---|------|------|
| C1 | `src/agent/prompts.ts` | LLM system prompt 中的 "Dexter" 需改为 "Snow"，但要检查上下文语义 |
| C2 | `src/agent/subagent-runner.ts` | 注释中的 "Dexter's Agent" 需要人工确认 |
| C3 | `src/mcp/client.ts` | MCP clientInfo name: `'dexter', 'cli', '1.0.0'` |
| C4 | `src/daemon/ipc.ts` | IPC socket 名称 `dexter-*` |
| C5 | `.claude/` 和 `.agents/` 下的 SKILL.md | 技能描述中的 Dexter 引用 |
| C6 | `SOUL.md`, `AGENTS.md`, `MEMORY.md` | AI 人格文件 — 需要重写品牌定位 |

### ⚪ 仅文档 — 低优先级

| # | 文件 | 数量 |
|---|------|------|
| D1 | `mm*.md`, `plan*.md` | ~100 refs |
| D2 | `README.md` | ~15 refs |
| D3 | `merge20260509.md` | ~5 refs |
| D4 | `MEMORY_TRANSFORMATION.md` | ~5 refs |

---

## 4. 执行计划 (5 个阶段)

### Phase 1: 核心路径和常量 (安全，无破坏性)

**目标**: 将 `.dexter` → `.snow` 的路径基础改掉

```
文件:
  src/utils/paths.ts          — DEXTER_DIR → SNOW_DIR, getDexterDir → getSnowDir, dexterPath → snowPath
  src/utils/logging/logger.ts — dexter-*.log → snow-*.log
  src/state/index.ts          — ~/.dexter → ~/.snow (rate-limit.state 等)
  src/utils/long-term-chat-history.ts — dexter-* session files
```

**迁移逻辑** (添加到 `src/utils/paths.ts`):
```typescript
// Auto-migration: .dexter → .snow on first run
import { existsSync, renameSync } from 'fs';
const OLD_DIR = '.dexter';
const SNOW_DIR = '.snow';
export function getSnowDir(): string {
  if (!existsSync(SNOW_DIR) && existsSync(OLD_DIR)) {
    renameSync(OLD_DIR, SNOW_DIR);
    console.log(`[snow] Migrated config: ${OLD_DIR} → ${SNOW_DIR}`);
  }
  return SNOW_DIR;
}
```

### Phase 2: package.json 和构建系统

```
文件:
  package.json         — name, description, bin, author, pkg.name, build outputs
  scripts/build.sh     — binary output names
  scripts/release.sh   — release script references
```

**具体替换**:
```json
{
  "name": "snow-ts",                    // was: dexter-ts
  "description": "Snow - AI agent for deep financial research",
  "bin": { "snow-ts": "./src/index.tsx" },
  "author": "Snow Team",
  "build:compile": "... --outfile=snow ...",
  "pkg": { "name": "snow", "bin": "snow" }
}
```

### Phase 3: 源代码中的字符串和函数名

**使用 `sed` 全局替换** (按优先级):

```bash
# 3a. 函数名和常量 (精确替换)
find src/ -name '*.ts' -exec sed -i '' \
  -e 's/getDexterDir/getSnowDir/g' \
  -e 's/dexterPath/snowPath/g' \
  -e 's/DEXTER_DIR/SNOW_DIR/g' \
  {} +

# 3b. UI 面向用户字符串
find src/ -name '*.ts' -exec sed -i '' \
  -e 's/Welcome to Dexter/Welcome to Snow/g' \
  -e 's/Dexter - AI/Snow - AI/g' \
  -e "s/Dexter Team/Snow Team/g" \
  -e "s/Dexter v/Snow v/g" \
  -e "s/Your AI assistant.*Dexter/Your AI assistant for deep financial research. Powered by Snow/g" \
  {} +

# 3c. 临时文件前缀
find src/ -name '*.ts' -exec sed -i '' \
  -e "s/dexter-wt-/snow-wt-/g" \
  -e "s/dexter-memory-index/snow-memory-index/g" \
  -e "s/dexter-memory-migrate/snow-memory-migrate/g" \
  -e "s/dexter-pairing/snow-pairing/g" \
  -e "s/dexter-sessions/snow-sessions/g" \
  -e "s/dexter-finance-eval/snow-finance-eval/g" \
  -e "s/dexter-eval/snow-eval/g" \
  -e "s/dexter-encrypted-store/snow-encrypted-store/g" \
  -e "s/dexter-portfolio/snow-portfolio/g" \
  -e "s/dexter-multiportfolio/snow-multiportfolio/g" \
  -e "s/dexter-crypto-test/snow-crypto-test/g" \
  {} +

# 3d. MCP client info
sed -i '' "s/'dexter', 'cli', '1.0.0'/'snow', 'cli', '1.0.0'/g" src/mcp/client.ts

# 3e. IPC socket
find src/daemon/ -name '*.ts' -exec sed -i '' "s/dexter-/snow-/g" {} +
```

### Phase 4: 配置目录引用

```bash
# 4a. 所有 .dexter → .snow 的路径引用
find src/ -name '*.ts' -exec sed -i '' \
  -e "s|\\.dexter/|.snow/|g" \
  -e "s|/.dexter|/.snow|g" \
  -e "s|'.dexter'|'.snow'|g" \
  {} +

# 4b. 日志和进程名
find src/ -name '*.ts' -exec sed -i '' \
  -e "s/dexter-/snow-/g" \
  {} +

# 4c. 注意: 不要替换 test description 中的 "dexter" 如 "dexter-agent"
# 这些需要手动检查
```

### Phase 5: 文档和脚本

```bash
# 5a. 脚本文件
find scripts/ -name '*.ts' -exec sed -i '' \
  -e "s/Dexter/Snow/g" \
  -e "s/dexter/snow/g" \
  {} +

# 5b. 根目录配置
sed -i '' -e "s/Dexter/Snow/g" -e "s/dexter/snow/g" SOUL.md
sed -i '' -e "s/Dexter/Snow/g" -e "s/dexter/snow/g" README.md
sed -i '' -e "s/Dexter/Snow/g" -e "s/dexter/snow/g" AGENTS.md

# 5c. Claude/Agents skills
find .claude/skills/ .agents/skills/ -name '*.md' -exec sed -i '' \
  -e "s/Dexter/Snow/g" -e "s/dexter/snow/g" {} +

# 5d. 不修改: mm*.md, plan*.md, merge*.md (历史文档保留)
```

---

## 5. 不可替换项 (手动保留)

| 文件 | 字符串 | 原因 |
|------|--------|------|
| `src/hooks/index.ts` | `~/.dexter/rate-limit.state` | 数据文件路径，需配合迁移 |
| `src/memory/migration.ts` | `dexter` → `snow` 数据迁移 | 需要双向兼容 |
| `.claude/hooks/*.sh` | `dexter` 引用 | shell 脚本需单独处理 |
| `.claude/settings.local.json` | dexter 路径 | 本地配置，不提交 |
| `tests/skill-eval.json` | dexter 引用 | 评估数据 |

---

## 6. 验证清单

执行后验证:

```bash
# 1. 编译检查
bunx tsc --noEmit

# 2. 测试全部通过
bun test

# 3. 构建成功
bun run build:compile

# 4. 搜索残留
grep -ri "dexter" --include="*.ts" src/ | grep -v "node_modules" | grep -v "//.*dexter"
# 应该只剩下注释中的历史引用

# 5. 启动测试
bun run dev
# 应该显示 "Welcome to Snow"

# 6. 配置目录迁移测试
# 删除 .snow → 保留 .dexter → 启动 → 检查自动迁移

# 7. osascript 验证
bun run scripts/oscript-mac-verify.ts
```

---

## 7. 统计摘要

| 类别 | 文件数 | 引用数 | 风险 |
|------|--------|--------|------|
| 核心路径 (paths.ts) | 1 | 5 | 🟢 |
| 函数名 (getDexterDir, dexterPath) | ~25 | ~50 | 🟢 |
| 配置目录 (.dexter) | ~30 | 50 | 🟡 需迁移 |
| package.json | 1 | 15 | 🟢 |
| UI 字符串 | ~10 | 15 | 🟢 |
| 临时文件前缀 | ~15 | 20 | 🟢 |
| MCP/IPC 标识符 | 3 | 10 | 🟡 |
| 注释 | ~50 | 100 | ⚪ |
| 文档 (.md) | ~15 | 200 | ⚪ |
| 脚本 (.ts/.sh) | 6 | 40 | 🟢 |
| **总计** | **~100** | **~616** | |

---

## 8. 执行顺序 (推荐)

```
Phase 1: 核心路径    → 验证: bun test
Phase 2: package.json → 验证: bun run build:compile
Phase 3: 源代码字符串 → 验证: bunx tsc --noEmit && bun test
Phase 4: 配置目录    → 验证: bun run dev + 自动迁移
Phase 5: 文档脚本    → 验证: grep -ri "dexter" src/
最终:  osascript 验证 → bun run scripts/oscript-mac-verify.ts
```

预估总工时: **2-3 小时** (含验证)
