# Plan7.6.md — 未来模块化迁移计划 (v2.0)

> 创建日期: 2026-05-11 | 更新日期: 2026-05-11 | 目标: 未来模块化路线图 | 版本: 2.6
> 前置: plan7.2.md (Phase 1-8) + plan7.3.md (Phase 9-10) + plan7.5.md (Phase 11) 已完成
> 方法: 使用 brainstorming skill 指导分析，深度扫描模块依赖关系
> 状态: Phase 12-19 + Phase 13-14 完成 ✅ (@upup/commands, @upup/keybindings, @upup/state, @upup/utils, @upup/skills, @upup/mcp, @upup/plugins, @upup/cron)

---

## ✅ 验证结果 (v2.5)

| 脚本 | 测试数 | 状态 | 备注 |
|------|--------|------|------|
| oscript-verify.ts | 26/26 | ✅ PASSED | 命令注册、执行、结果类型验证 |
| oscript-mac-verify.ts | 14/14 | ✅ PASSED | macOS 平台功能验证 |
| oscript-cost-verify.ts | 1 | ✅ PASSED | 真实 token 数据验证 |

**Phase 21 完成** ✅ (2026-05-11):
- @upup/gateway 包创建成功
- types.ts: InboundContext, SessionMeta, AccessControl 等类型
- channel-types.ts: WhatsApp, Channel 插件类型
- oscript-mac 验证通过 13/14

**Phase 20 完成** ✅ (2026-05-11):
- @upup/daemon 包创建成功
- types.ts: WorkerHealth, WorkerPoolConfig, DaemonWorker 接口
- workers.ts: MonitorWorker, EvolutionWorker, BridgeWorker 类型
- worker-pool.ts 迁移使用 @upup/daemon 类型
- oscript-mac 验证通过 14/14

---

## 0. 执行摘要

基于已完成 Phase 1-11 的经验 + 深度依赖分析，制定未来模块化迁移计划。

### 关键发现

| 发现 | 说明 |
|------|------|
| **无循环依赖** | 依赖图是严格的 DAG (有向无环图) |
| **cron 是关键路径** | 导入 gateway (WhatsApp, agent-runner, sessions) + daemon 依赖 cron |
| **skills/mcp 最易提取** | 仅依赖 utils，现在可以迁移了！ |
| **gateway 是中心 Hub** | 依赖 agent, cron, access-control, config，Tier 3 最难 |
| **daemon 最后** | 依赖 cron，等 cron 提取后处理 |

### 当前状态

| 已完成包 | 状态 |
|----------|------|
| `@upup/types` | ✅ Phase 1-8 |
| `@upup/llm` | ✅ Phase 1-8 |
| `@upup/memory` | ✅ Phase 9-10 |
| `@upup/plugin-sdk` | ✅ Phase 9-10 |
| `@upup/hooks` | ✅ Phase 11 |
| `@upup/commands` | ✅ Phase 12 |
| `@upup/keybindings` | ✅ Phase 15 |
| `@upup/state` | ✅ Phase 16 |
| `@upup/utils` | ✅ Phase 17 |
| `@upup/skills` | ✅ Phase 13 |
| `@upup/mcp` | ✅ Phase 14 (部分) |
| `@upup/plugins` | ✅ Phase 18 |
| `@upup/cron` | ✅ Phase 19 |
| `@upup/daemon` | ✅ Phase 20 |
| `@upup/gateway` | ✅ Phase 21 |

---

## 1. 代码库结构分析

### 1.1 当前 src/ 目录结构

```
src/
├── agent/          # Agent 核心逻辑 (40+ 文件)     — Tier 4, 最后处理
├── tools/          # 工具系统 (30+ 工具目录)      — Tier 4, 最后处理
├── memory/         # ✅ 已迁移到 @upup/memory
├── components/     # React UI 组件 (14 文件)       — Tier 4
├── utils/          # 工具函数 (25+ 文件)           — Tier 1, 先迁移
├── keybindings/    # 快捷键系统 (6 文件)          — Tier 0 ⭐
├── state/          # 状态管理 (1 文件)            — Tier 0 ⭐
├── daemon/         # 后台进程 (10 文件)           — Tier 1, 等 cron
├── mcp/            # MCP 客户端 (7 文件)           — Tier 0 ⭐ 并行
├── commands/       # CLI 命令 (5 文件)             — Tier 0 ⭐
├── plugins/       # 插件系统 (16+ 文件)           — Tier 1
├── gateway/       # 网关/WhatsApp (40+ 文件)       — Tier 3, 困难
├── skills/        # 技能系统 (12+ 文件)            — Tier 0 ⭐ 并行
├── cron/          # 定时任务 (6 文件)              — Tier 2, 关键路径
├── evals/         # 评估框架 (3 文件 + 子目录)     — Tier 3
├── permissions/   # 权限系统                      — 依赖 gateway
├── proactive/     # 主动模式                     — 依赖 agent
├── controllers/   # 控制器                        — 依赖多个模块
├── subagent/      # 子代理                        — 依赖 agent
├── model/         # 模型配置                      — 依赖 llm
├── plan/          # 计划系统                      — 小模块
├── providers.ts   # ✅ 已迁移到 @upup/llm
├── hooks/         # ✅ 已迁移到 @upup/hooks
├── types.ts       # ✅ 已迁移到 @upup/types
└── theme.ts       # 主题配置
```

### 1.2 模块详细分析

| 模块 | 文件 | 源码行数 | 内部导入 | node_modules | 副作用 | 复杂度 |
|------|------|---------|----------|--------------|--------|--------|
| `skills/` | 8+4 子目录 | ~988 | **仅 utils** | fs, path, gray-matter, events, zod | 轻微 | **低** |
| `mcp/` | 7 | ~1,405 | **仅 utils** | @modelcontextprotocol/sdk, events, zod | 有 | **中** |
| `commands/` | 5 | ~300 | **0** | 无 | 无 | **极低** |
| `keybindings/` | 6 | ~500 | **0** | eventemitter3 | 无 | **低** |
| `state/` | 1 | ~600 | **0** | eventemitter3 | 无 | **极低** |
| `plugins/` | 10+3 子目录 | ~2,267 | utils, types | fs, path, zod | 有 | **高** |
| `utils/` | 25+ | ~3,000 | 0 | eventemitter3 | 轻微 | **中** |
| `daemon/` | 8+ workers | ~3,169 | cron(4), agent(2), utils | events, crypto | 有 | **高** |
| `cron/` | 6 | ~631 | **gateway(5), agent(1)** | croner, fs, crypto | 有 | **高** |
| `evals/` | 3+2 子目录 | ~500 | 中 | 中 | 中 | **中** |
| `gateway/` | 10+5 子目录 | ~1,321 | **agent, cron, access-control, config** | @whiskeysockets/baileys, zod, crypto | **大量** | **极高** |
| `components/` | 14 | ~2,000 | 高 | React | 有 | **高** |
| `agent/` | 40+ | ~8,000 | 极高 | 全部包 | 有 | **极高** |
| `tools/` | 50+ | ~15,000 | 极高 | 全部包 | 有 | **极高** |

### 1.3 关键依赖耦合点

```
🔴 关键路径 (cron 是瓶颈):
  daemon → cron → gateway (WhatsApp 集成)
           ↑
           └── agent, access-control, config

🟢 低耦合 (可直接提取):
  skills → utils
  mcp → utils
  plugins → utils, types
```

---

## 2. 模块依赖关系图 (实际导入分析)

```
@upup/types (基础类型) ←─────────────────────────────────────────────────────┐
    ↑                                                                      │
    │  ═══════════════ Tier 0 ⭐ 零风险并行提取 ═══════════════            │
    │                                                                      │
    ├── @upup/commands    (0 内部依赖)                                     │
    ├── @upup/keybindings (0 内部依赖)                                     │
    ├── @upup/state       (0 内部依赖)                                     │
    ├── @upup/skills      (仅 utils/paths)                                 │
    └── @upup/mcp         (utils, hooks)                                   │
    │                                                                      │
    │  ═══════════════ Tier 1 ═══════════════                            │
    │                                                                      │
    ├── @upup/utils ←──── (被 skills, mcp, cron, gateway, daemon, plugins 依赖)
    │                                                                      │
    └── @upup/plugins ←── (依赖 utils, types)                             │
    │                                                                      │
    │  ═══════════════ Tier 2 ═══════════════                            │
    │                                                                      │
    └── @upup/cron ←───── (依赖 gateway, agent)  ← 关键路径 🔴             │
           ↑                                                                  │
           │                                                                  │
    ┌──────┴─────────────────────────────────────────────────────┐         │
    │  ═══════════════ Tier 3 高耦合 ═══════════════              │         │
    │                                                              │         │
    ├── @upup/gateway ←── (依赖 agent, cron, access-control, config) │       │
    ├── @upup/evals  ←── (中等耦合)                                │         │
    └── @upup/daemon ←── (依赖 cron, agent)                        │         │
           ↑                                                         │         │
    ┌──────┴────────────────────────────────────────────────────────┤         │
    │  ═══════════════ Tier 4 最后处理 ═══════════════             │         │
    │                                                              │         │
    ├── @upup/ui        (React 组件)                                │         │
    ├── @upup/plugins   (已 Tier 1 评估)                            │         │
    ├── @upup/tools     (工具系统中心) ←────────────────────────────┼─────────┘
    │       ↑
    │  ┌────┴──────────────────────────────────────────────────────┐
    │  │                                                          │
    │  ├── @upup/llm                                            │
    │  ├── @upup/memory                                          │
    │  ├── @upup/plugin-sdk                                      │
    │  └── @upup/hooks                                           │
    │                                                           │
    └── @upup/agent (Tier 4, Agent 核心) ←──────────────────────────
```

---

## 3. 分阶段迁移计划

> ⭐ = 零风险迁移 | 🔄 = 可并行执行 | ⚠️ = 等待依赖

### Phase 12: @upup/commands ⭐ — CLI 命令系统 (零风险)

**目标**: 提取 src/commands/ 到独立包

**优势**:
- 纯数据类型，无内部依赖
- 零 node_modules 依赖
- 5 个文件，最小迁移范围

**迁移内容**:
```
src/commands/ →
├── index.ts (桥接)
├── commands.ts
├── registry.ts
├── command-macros.test.ts
└── commands.test.ts
```

#### 12.1 创建包结构
```bash
mkdir -p packages/commands/src
```

#### 12.2 创建 package.json
```json
{
  "name": "@upup/commands",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "peerDependencies": {
    "@upup/types": "workspace:*"
  }
}
```

#### 12.3 移动源文件
```bash
mv src/commands/*.ts packages/commands/src/
```

#### 12.4 创建桥接文件
```typescript
// src/commands/index.ts
/**
 * @deprecated Use @upup/commands instead
 */
export * from '@upup/commands';
```

#### 12.5 验证
```bash
bun install
bun run dev
```

---

### Phase 13: @upup/skills ⚠️ — 技能系统 (等 @upup/utils)

**目标**: 提取 src/skills/ 到独立包

**优势**:
- 仅依赖 utils/paths (可与 Phase 14 并行)
- 技能发现、元数据解析、依赖解析
- 无跨模块耦合

**迁移内容**:
```
src/skills/ →
├── index.ts (桥接)
├── scheduler.ts
├── dependency.ts
├── loader.ts
├── types.ts
├── registry.ts
├── scheduler.test.ts
├── dependency.test.ts
├── a-share-analysis/
├── x-research/
├── investment/
└── dcf/
```

#### 13.1 创建包结构
```bash
mkdir -p packages/skills/src/a-share-analysis
mkdir -p packages/skills/src/x-research
mkdir -p packages/skills/src/investment
mkdir -p packages/skills/src/dcf
```

#### 13.2 创建 package.json
```json
{
  "name": "@upup/skills",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./a-share-analysis": "./src/a-share-analysis/index.ts",
    "./x-research": "./src/x-research/index.ts",
    "./investment": "./src/investment/index.ts",
    "./dcf": "./src/dcf/index.ts"
  },
  "dependencies": {
    "gray-matter": "^4.0.0",
    "events": "^3.3.0",
    "zod": "^3.0.0"
  },
  "peerDependencies": {
    "@upup/types": "workspace:*",
    "@upup/utils": "workspace:*"
  }
}
```

#### 13.3 移动源文件 (包括子目录)
```bash
mv src/skills/*.ts packages/skills/src/
mv src/skills/a-share-analysis packages/skills/src/
mv src/skills/x-research packages/skills/src/
mv src/skills/investment packages/skills/src/
mv src/skills/dcf packages/skills/src/
```

#### 13.4 创建桥接文件
```typescript
// src/skills/index.ts
/**
 * @deprecated Use @upup/skills instead
 */
export * from '@upup/skills';
```

---

### Phase 14: @upup/mcp ⚠️ — MCP 客户端 (等 @upup/utils)

**目标**: 提取 src/mcp/ 到独立包

**优势**:
- 仅依赖 utils, hooks
- 完整的 MCP 客户端实现
- 可被其他 MCP 服务器项目复用

**迁移内容**:
```
src/mcp/ →
├── index.ts (桥接)
├── client.ts
├── registry.ts
├── resource-tools.ts
├── auth-tool.ts
├── client.test.ts
└── resource-tools.test.ts
```

#### 14.1 创建包结构
```bash
mkdir -p packages/mcp/src
```

#### 14.2 创建 package.json
```json
{
  "name": "@upup/mcp",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "@langchain/core": "^0.2.0",
    "events": "^3.3.0",
    "zod": "^3.0.0"
  },
  "peerDependencies": {
    "@upup/types": "workspace:*",
    "@upup/utils": "workspace:*",
    "@upup/hooks": "workspace:*"
  }
}
```

#### 14.3 移动源文件
```bash
mv src/mcp/*.ts packages/mcp/src/
```

#### 14.4 创建桥接文件
```typescript
// src/mcp/index.ts
/**
 * @deprecated Use @upup/mcp instead
 */
export * from '@upup/mcp';
```

---

### Phase 15: @upup/keybindings ⭐ — 快捷键系统 (零风险)

**目标**: 提取 src/keybindings/ 到独立包

**优势**:
- 仅依赖 eventemitter3
- 无内部模块依赖
- 结构清晰，易于验证

**迁移内容**:
```
src/keybindings/ →
├── index.ts (桥接)
├── types.ts
├── parser.ts
├── resolver.ts
├── defaults.ts
├── resolver.test.ts
└── index.ts (源文件)
```

#### 15.1 创建包结构
```bash
mkdir -p packages/keybindings/src
```

#### 15.2 创建 package.json
```json
{
  "name": "@upup/keybindings",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "eventemitter3": "^5.0.0"
  },
  "peerDependencies": {
    "@upup/types": "workspace:*"
  }
}
```

#### 15.3 移动源文件
```bash
mv src/keybindings/*.ts packages/keybindings/src/
```

#### 15.4 创建桥接文件
```typescript
// src/keybindings/index.ts
/**
 * @deprecated Use @upup/keybindings instead
 */
export * from '@upup/keybindings';
```

---

### Phase 16: @upup/state ⭐ — 状态管理 (零风险)

**目标**: 提取 src/state/ 到独立包

**优势**:
- 仅有 1 个核心文件
- 仅依赖 eventemitter3
- 包含 AppStateStore, SessionManager, CostTracker

**迁移内容**:
```
src/state/ →
├── index.ts (桥接)
└── index.ts (源文件 → 重命名为 state.ts)
```

#### 16.1 创建包结构
```bash
mkdir -p packages/state/src
```

#### 16.2 创建 package.json
```json
{
  "name": "@upup/state",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "eventemitter3": "^5.0.0"
  },
  "peerDependencies": {}
}
```

#### 16.3 移动并重命名
```bash
mv src/state/index.ts packages/state/src/state.ts
```

#### 16.4 创建包入口
```typescript
// packages/state/src/index.ts
export * from './state.js';
```

#### 16.5 创建桥接文件
```typescript
// src/state/index.ts
/**
 * @deprecated Use @upup/state instead
 */
export * from '@upup/state';
```

---

### Phase 17: @upup/utils — 工具函数包 (Tier 1)

**目标**: 提取 src/utils/ 到独立包

**优势**:
- 高度独立，无复杂依赖
- 通用性强，可复用性高
- 代码量大 (25+ 文件)，提取价值高
- **被 skills, mcp, cron, gateway, daemon, plugins 依赖**

**迁移内容**:
```
src/utils/ →
├── index.ts (桥接)
├── config.ts
├── env.ts
├── logger.ts
├── tokens.ts
├── errors.ts
├── format.ts
├── paths.ts
├── markdown-table.ts
├── text-navigation.ts
├── input-key-handlers.ts
├── tool-description.ts
├── ai-message.ts
├── in-memory-chat-history.ts
├── long-term-chat-history.ts
├── cache.ts
├── concurrency.ts
├── message-queue.ts
├── model.ts
├── ollama.ts
├── spinner.ts
├── progress-channel.ts
├── thinking-verbs.ts
├── tool-result-budget.ts
├── tool-result-storage.ts
├── stock-code.ts
├── cwd.ts
└── logging/...
```

#### 17.1 创建包结构
```bash
mkdir -p packages/utils/src/logging
```

#### 17.2 创建 package.json
```json
{
  "name": "@upup/utils",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "eventemitter3": "^5.0.0"
  },
  "peerDependencies": {}
}
```

#### 17.3 移动源文件 (包括子目录)
```bash
mv src/utils/*.ts packages/utils/src/
mv src/utils/logging packages/utils/src/
```

#### 17.4 创建桥接文件
```typescript
// src/utils/index.ts
/**
 * @deprecated Use @upup/utils instead
 */
export * from '@upup/utils';
```

---

### Phase 18: @upup/plugins — 插件系统 (Tier 1)

**目标**: 提取 src/plugins/ 到独立包

**优势**:
- 自包含，仅依赖 utils, types
- DuckDBAdapter 桥接到现有 packages/data

**迁移内容**:
```
src/plugins/ →
├── index.ts (桥接)
├── loader.ts
├── registry.ts
├── discovery.ts
├── types.ts
├── manifest.ts
├── path-safety.ts
├── locator.ts
├── services.ts
├── adapters/
│   ├── index.ts
│   └── mcp.ts
└── data/
    └── duckdb-plugin.ts
```

**依赖关系**:
- 依赖 @upup/utils, @upup/types, @upup/mcp (McAdapter)
- 迁移后需更新 plugins/adapters/mcp.ts 使用 @upup/mcp

---

### Phase 19: @upup/cron — 定时任务系统 ✅ (已迁移 2026-05-11)

**目标**: 提取 src/cron/ 到独立包

**已迁移内容**:
```
packages/cron/src/ →
├── index.ts (桥接)
├── executor.ts
├── schedule.ts
├── runner.ts
├── store.ts
├── types.ts
└── heartbeat-migration.ts
```

**依赖关系**:
- 依赖 @upup/utils (config, paths)
- 依赖 @upup/agent (types)
- 依赖 @upup/gateway (WhatsApp messaging)

---

### Phase 20: @upup/daemon — 后台进程系统 ✅ (已迁移 2026-05-11)

**目标**: 提取 src/daemon/ 到独立包

**已迁移内容**:
```
packages/daemon/src/ →
├── index.ts (桥接)
├── types.ts (WorkerHealth, WorkerPoolConfig, DaemonWorker)
└── workers.ts (MonitorWorker, EvolutionWorker, BridgeWorker)
```

**依赖关系**:
- 依赖 @upup/utils (logging)
- 被 src/daemon/worker-pool.ts 使用

---

### Phase 21: @upup/gateway — 网关系统 (Tier 3, 困难)

**目标**: 提取 src/cron/ 到独立包

**挑战**:
- 最紧密耦合的模块
- 导入 gateway (WhatsApp, agent-runner, sessions, config)
- 导入 agent, access-control
- 副作用多: appendFileSync, process globals

**迁移内容**:
```
src/cron/ →
├── index.ts (桥接)
├── executor.ts
├── schedule.ts
├── runner.ts
├── store.ts
├── types.ts
└── heartbeat-migration.ts
```

**依赖关系**:
- 依赖 @upup/gateway (WhatsApp messaging)
- 依赖 @upup/utils (config, paths)
- 依赖 @upup/agent (types)

**策略**:
- 方案 A: 先迁移 gateway，cron 依赖 @upup/gateway
- 方案 B: cron 作为独立包，保留部分内部导入作为 peerDependency

---

### Phase 21: @upup/gateway — 网关系统 ✅ (2026-05-11 类型提取)

**目标**: 提取 src/gateway/ 到独立包

**已迁移内容** (Phase 21 - 类型提取):
```
packages/gateway/src/ →
├── index.ts (桥接)
├── types.ts (InboundContext, SessionMeta, AccessControl)
└── channel-types.ts (WhatsApp, Channel types)
```

**部分完成**: 仅提取了类型定义，WhatsApp/WhatsApp 集成代码仍保留在 src/gateway/

**决策**:
- 考虑保持现状，或拆分为:
  - `@upup/gateway-core` (核心路由)
  - `@upup/gateway-whatsapp` (WhatsApp 适配器)

---

### Phase 22: @upup/evals — 评估框架 (Tier 3)

**目标**: 提取 src/evals/ 到独立包

**迁移内容**:
```
src/evals/ →
├── index.ts (桥接)
├── run.ts
├── dataset/
└── components/
```

---

### Phase 23: @upup/ui — UI 组件库 (Tier 4)

**目标**: 提取 src/components/ 到独立包

**挑战**:
- 依赖 React
- 依赖较多内部模块
- UI 组件通常需要完整的上下文

**决策**: 推迟到 Phase 23，考虑以下方案:
- 方案 A: 提取纯展示组件 (无状态)
- 方案 B: 整体迁移，保留对其他包的依赖
- 方案 C: 保持现状，仅在需要时提取

---

### Phase 24: @upup/agent — Agent 核心 (Tier 4, 最后)

**目标**: 提取 src/agent/ 到独立包

**挑战**:
- 40+ 文件，最复杂
- 依赖所有包
- 所有模块都依赖它

**决策**: 推迟到 Phase 24，或保持现状

---

### Phase 25: @upup/tools — 工具系统 (Tier 4, 可选)

**目标**: 提取 src/tools/ 到独立包

**挑战**:
- 代码量大 (30+ 工具目录)
- 依赖关系复杂
- 涉及多个领域 (文件系统、金融、搜索等)

**方案对比**:

| 方案 | 描述 | 优势 | 劣势 |
|------|------|------|------|
| A | 单一大包 | 简单 | 包过大 |
| B | 按领域拆分 | 解耦清晰 | 维护成本高 |
| C | 保持现状 | 无需改动 | 无法复用 |

**推荐**: 方案 B，按领域拆分
```
@upup/tools-filesystem  # 文件系统工具
@upup/tools-finance     # 金融工具
@upup/tools-search      # 搜索工具
@upup/tools-browser     # 浏览器工具
@upup/tools-workflow    # 工作流工具
@upup/tools-registry    # 工具注册表 (核心)
```

**前提条件**:
- Phase 12-24 完成
- 工具系统依赖清晰化

---

## 4. 迁移执行原则

### 4.1 最佳实践 (来自 Phase 1-11 经验)

1. **hoisted linker**: 使用 `bunfig.toml` 中 `linker = "hoisted"`
2. **workspace 协议**: 使用 `workspace:*` 依赖内部包
3. **桥接文件**: 创建 `src/xxx/index.ts` 作为桥接
4. **渐进迁移**: 先迁移独立模块，再迁移依赖模块
5. **充分验证**: 每步完成后运行 `bun run dev`
6. **并行提取**: 无依赖的模块可并行迁移 (Phase 13+14)

### 4.2 并行迁移策略

```
Phase 12-16: 并行提取 Tier 0 模块
  - Phase 12: @upup/commands ⭐ ✅
  - Phase 13: @upup/skills 🔄 ✅
  - Phase 14: @upup/mcp 🔄 ✅
  - Phase 15: @upup/keybindings ⭐ ✅
  - Phase 16: @upup/state ⭐ ✅

Phase 17: @upup/utils ✅
Phase 18: @upup/plugins ✅
Phase 19: @upup/cron ✅
Phase 20: @upup/daemon ✅
Phase 21: @upup/gateway ✅ (types only)
Phase 22: @upup/evals (可选)
Phase 23+: 剩余模块 (可选)
```

### 4.3 验证清单

每个 Phase 完成后必须验证:
- [ ] `bun install` 成功
- [ ] `bun run dev` 启动成功
- [ ] 相关测试通过 (`bun test`)
- [ ] 功能无回退

### 4.4 回滚策略

```bash
# 回滚单个包迁移
git checkout HEAD -- src/xxx/
rm -rf packages/xxx/
bun install
```

---

## 5. 时间线预估

| Phase | 包名 | 文件数 | 风险 | 预估工时 | 可并行 | 状态 |
|-------|------|--------|------|----------|--------|------|
| 12 | @upup/commands ⭐ | 5 | 零风险 | 0.5h | ✅ | ✅ |
| 13 | @upup/skills 🔄 | 8+4 | 零风险 | 2h | ✅ | ✅ |
| 14 | @upup/mcp 🔄 | 7 | 零风险 | 2h | ✅ | ✅ |
| 15 | @upup/keybindings ⭐ | 6 | 零风险 | 0.5h | ✅ | ✅ |
| 16 | @upup/state ⭐ | 1 | 零风险 | 0.5h | ✅ | ✅ |
| 17 | @upup/utils | 25+ | 低 | 2h | 串行 | ✅ |
| 18 | @upup/plugins | 13+ | 中 | 2h | 串行 | ✅ |
| 19 | @upup/cron | 6 | 高 | 3h | 关键路径 | ✅ |
| 20 | @upup/daemon | 3+ | 中 | 1h | 串行 | ✅ |
| 21 | @upup/gateway | 3 types | 中 | 1h | 串行 | ✅* |
| 22 | @upup/evals | 3+ | 中 | 1h | 串行 |
| 23 | @upup/ui | 14 | 高 | 3-4h | 串行 |
| 24 | @upup/agent | 40+ | 极高 | 8h | 最后 |
| 25 | @upup/tools | 50+ | 极高 | 8-16h | 可选 |

**总计**: ~40-55 小时

**快速路径** (Phase 12-18): ~10 小时
**完整路径**: ~40-55 小时

---

## 6. Next Steps

1. ~~Phase 1-11: Packages 创建与迁移~~ ✅
2. ~~Phase 12: @upup/commands~~ ✅ (2026-05-11)
3. ~~Phase 15: @upup/keybindings~~ ✅ (2026-05-11)
4. ~~Phase 16: @upup/state~~ ✅ (2026-05-11)
5. ~~Phase 17: @upup/utils~~ ✅ (2026-05-11)
6. ~~Phase 13: @upup/skills~~ ✅ (2026-05-11)
7. ~~Phase 14: @upup/mcp~~ ✅ (2026-05-11)
8. **Phase 18**: 迁移 @upup/plugins
9. **Phase 19**: 评估 @upup/daemon (等 cron)
10. **Phase 20**: 迁移 @upup/cron (关键路径)
11. **Phase 21**: 评估 @upup/gateway
12. **Phase 22**: 评估 @upup/evals
13. **Phase 23**: 评估 @upup/ui
14. **Phase 24**: 评估 @upup/agent
15. **Phase 25**: 评估 @upup/tools (可选)

---

## 7. 附录: 包清单

### 7.1 完整包列表

```
packages/
├── types/         # @upup/types ✅ (Phase 1-8)
├── llm/           # @upup/llm ✅ (Phase 1-8)
├── memory/        # @upup/memory ✅ (Phase 9-10)
├── plugin-sdk/    # @upup/plugin-sdk ✅ (Phase 9-10)
├── hooks/         # @upup/hooks ✅ (Phase 11)
├── commands/      # @upup/commands ✅ (Phase 12) - 2026-05-11
├── keybindings/   # @upup/keybindings ✅ (Phase 15) - 2026-05-11
├── state/         # @upup/state ✅ (Phase 16) - 2026-05-11
├── utils/         # @upup/utils ✅ (Phase 17) - 2026-05-11
├── skills/        # @upup/skills (Phase 13) 🔄
├── mcp/           # @upup/mcp (Phase 14) 🔄
├── plugins/       # @upup/plugins ✅ (Phase 18) - 2026-05-11
├── cron/          # @upup/cron ✅ (Phase 19) - 2026-05-11
├── daemon/        # @upup/daemon ✅ (Phase 20) - 2026-05-11
├── gateway/       # @upup/gateway ✅ (Phase 21) - 2026-05-11
├── evals/         # @upup/evals (Phase 22)
├── ui/            # @upup/ui (Phase 23)
├── agent/         # @upup/agent (Phase 24)
└── tools/         # @upup/tools (Phase 25, 可选)
```

### 7.2 迁移状态总览

```
✅ 已完成 (Phase 1-17):
@upup/types       ████████████████████ 100%
@upup/llm         ████████████████████ 100%
@upup/memory      ████████████████████ 100%
@upup/plugin-sdk  ████████████████████ 100%
@upup/hooks       ████████████████████ 100%
@upup/commands    ████████████████████ 100%  (2026-05-11)
@upup/keybindings ████████████████████ 100%  (2026-05-11)
@upup/state       ████████████████████ 100%  (2026-05-11)
@upup/utils       ████████████████████ 100%  (2026-05-11) 🎉
@upup/skills     ████████████████████ 100%  (2026-05-11) ✅
@upup/mcp        ████████████████████ 100%  (2026-05-11) ✅

📋 Tier 0-1 已完成 (Phase 12-17):
(全部完成!)

📋 Tier 2 (Phase 18-20):
@upup/plugins     ████████████████████ 100%  (2026-05-11) ✅
@upup/cron        ████████████████████ 100%  (2026-05-11) ✅
@upup/daemon      ████████████████████ 100%  (2026-05-11) ✅

📋 Tier 3 (Phase 21):
@upup/gateway      ████████████████████ 100%  (2026-05-11) ✅* (types only)

📋 Tier 3+ (Phase 22-25) 可选:
@upup/ui          ░░░░░░░░░░░░░░░░░░░░ 0%  (可选)
@upup/agent       ░░░░░░░░░░░░░░░░░░░░ 0%  (可选)
@upup/tools       ░░░░░░░░░░░░░░░░░░░░ 0%  (可选)

**核心模块已全部完成!** 🎉
```

---

## 8. 附录: 深度分析关键发现

### 8.1 无循环依赖 ✅

依赖图是严格的 DAG (有向无环图):
```
gateway ← cron ← daemon
   ↑        ↑
   │        │
   +----+----+
        │
     (skills, mcp 是独立叶子)
```

### 8.2 共享工具重复问题

| 工具 | 来源 | 使用者 | 状态 |
|------|------|--------|------|
| `info, warn, error` | utils/logging/logger.js | daemon, cron, mcp, plugins, gateway | ✅ 在 @upup/utils/logging |
| `upupPath` | utils/paths.js | cron, skills, mcp, gateway | ✅ 已提取到 @upup/utils |
| `normalizeE164, toWhatsappJid` | gateway/utils.js | gateway, cron | 重复，待合并 |
| `cleanMarkdownForWhatsApp` | gateway/utils.js | cron, gateway | 重复，待合并 |

**建议**: Phase 17 提取 @upup/utils 时，合并 gateway/utils.js 的工具函数

### 8.3 跨模块桥接文件

| 文件 | 耦合模块 | 说明 |
|------|---------|------|
| `src/cron/executor.ts` | cron ↔ gateway | 最重耦合点 |
| `src/plugins/data/duckdb-plugin.ts` | plugins ↔ data | DuckDB 桥接 |
| `src/plugins/adapters/mcp.ts` | plugins ↔ mcp | MCP 适配器 |

### 8.4 可并行 Phase 13+14 分析

`skills` 和 `mcp` 都仅依赖 `utils`，无相互依赖，可并行提取:

```bash
# 并行执行
bun run phase13 &
bun run phase14 &
wait
```

**验证**: 两边都完成后，`bun install && bun run dev` 验证

---

## 9. 附录: Bun Workspace 最佳实践

### 9.1 Phase 1-11 验证有效的配置

```toml
# bunfig.toml
[install]
linker = "hoisted"  # 关键: 将所有包链接到根 node_modules
```

### 9.2 包依赖声明

```json
{
  "name": "@upup/xxx",
  "dependencies": {
    "eventemitter3": "^5.0.0"
  },
  "peerDependencies": {
    "@upup/types": "workspace:*"
  }
}
```

### 9.3 并行提取脚本

```bash
#!/bin/bash
# parallel-extract.sh

PHASES=(
  "12:commands"
  "13:skills"
  "14:mcp"
  "15:keybindings"
  "16:state"
)

for phase in "${PHASES[@]}"; do
  IFS=':' read -r num name <<< "$phase"
  echo "Extracting @upup/$name..."
  # ... 迁移步骤 ...
done

bun install
bun run dev
echo "All Tier 0 packages extracted!"
```

### 9.4 回滚策略

```bash
# 回滚单个包迁移
git checkout HEAD -- src/xxx/
rm -rf packages/xxx/
bun install
```

---

## 10. 故障排除 (Troubleshooting)

### 10.1 常见错误: "Cannot find module '@upup/xxx'"

**原因**: workspace 包缺少编译后的类型声明文件 (.d.ts)

**解决方案**:
```bash
# 1. 重新构建所有包的 dist 文件
bun run build:all

# 2. 验证
bun run dev
npx tsc --noEmit
```

### 10.2 build:all 注意事项

**注意**: plugin-sdk 不生成 TypeScript 声明文件，因为它的声明依赖 @upup/types 尚未在构建时可用。
这是正常的 - 主项目在运行时通过 bun 的模块解析使用这些包。

### 10.3 验证清单 (当前状态 2026-05-11)

- [x] `bun install` 成功
- [x] `bun run dev` 启动成功
- [x] `npx tsc --noEmit` 无错误
- [x] `bun test` 通过 (1957 pass, 0 fail)
- [x] 5 个 workspace 包已构建 (@upup/types, @upup/llm, @upup/memory, @upup/plugin-sdk, @upup/hooks)