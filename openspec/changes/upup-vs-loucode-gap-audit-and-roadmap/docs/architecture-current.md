# UpUp 现状架构权威盘点

> 版本:v1.0 · 对应 upup v2026.5.15 · 生成日期 2026-06-06
> 配套图集:[ascii-diagrams.md](ascii-diagrams.md)(共 14 张 ASCII 图)
> 数据来源:`src/` 与 `packages/` 源码 + 50 个 SKILL.md + 已存在 OpenSpec archived `top-tier-investment-assistant`

---

## §1 模块清单表

| 模块 | 路径 | 文件数 | 总行数 | 关键文件 | 状态 |
|------|------|--------|--------|---------|------|
| **Agent 核心** | `src/agent/` | 60+ | ~19807 | `agent.ts` (1305L) / `subagent-runner.ts` (631L) / `scratchpad.ts` (557L) | 成型 |
| **Skills 体系** | `src/skills/` | 50 SKILL.md + 40+ TS | -- | 6 个核心投研 + 44 个专项 | 成型 |
| **Tools 体系** | `src/tools/` | 77 目录 / 296 .ts | -- | finance/portfolio/backtest/trading/screening | 成型 |
| **Investment Workflow** | `src/commands/investment/` | 15 .ts | -- | `phase-handlers.ts` / `invest.ts` | 成型 |
| **Plan Mode** | `src/plan/` | -- | -- | `plan-builder.ts` / `plan-executor.ts` / `research-plan.ts` | 成型 |
| **KAIROS 持续监控** | `src/kairos/` | 9 | -- | `scanner.ts` / `position-monitor.ts` / `proactive.ts` | 成型 |
| **Bridge 远程** | `src/bridge/` | 28 | -- | `server.ts` / `session-sync.ts` / `auth.ts` | 成型 |
| **Coordinator 多 Agent** | `src/coordinator/` | 13 | -- | `coordinatorMode.ts` / `worker-xml.ts` | 成型 |
| **Realtime 行情** | `src/realtime/` | 9 | -- | `eastmoney-feed.ts` / `throttled-feed.ts` | 成型 |
| **Multi-Agent** | `src/multi-agent/` | 27 | -- | `coordinator.ts` / `team-manager.ts` / `verifier` | 成型 |
| **Daemon 后台** | `src/daemon/` | 9 + workers/ | -- | `supervisor.ts` / `session.ts` / `worker-pool.ts` | 成型 |
| **Event Bus** | `src/core/` | 1 | -- | `event-bus.ts` | 基础 |
| **Cron 任务调度** | `src/cron/` | 6 | -- | `schedule.ts` / `store.ts` / `runner.ts` | 成型 |
| **Memory** | `src/memory/` | -- | -- | `flush.ts` / `extraction.ts` / `observation-buffer.ts` | 成型 |
| **MCP** | `src/mcp/` | -- | -- | -- | 成型 |
| **Permissions** | `src/permissions/` | 1 | -- | `index.ts` | 基础 |
| **Hooks** | `src/hooks/` | -- | -- | `stop-hooks.ts` / `user-hooks.ts` | 成型 |
| **i18n** | `src/i18n/` + `src/agent/locale.ts` | -- | -- | 强类型 zh-CN + en | 成型 |
| **Workspace Packages** | `packages/` | 18 个 | -- | `agent-core` / `llm` / `commands` / `skills` / ... | 成型 |
| **Tests** | `src/**/*.test.ts` | 276 个 | -- | bun test | 基本覆盖 |

> **L0 系统总览图**见 [ascii-diagrams.md §图 1](ascii-diagrams.md#图-1--upup-l0-系统总览)

---

## §2 Agent Loop 时序

主 Agent 的 1 次完整运行(从用户输入到最终回答)经历 5 个阶段:

1. **入口与编排**:`src/index.tsx:210` → `src/cli.tsx` (Ink) → `src/commands/`
2. **IntentDetect + PlanAutoTrigger**:`src/agent/plan-auto-trigger.ts:307` 调用 `src/agent/intent-detector.ts:479` 判断意图,若是 research/analysis 类自动构建 plan
3. **主循环**:`src/agent/agent.ts:1305` 的 `while (ctx.iteration < maxIter=50)`,每轮经历 microcompact → streamLlm → tool execute → scratchpad → 可能 compact
4. **Final Answer**:无 tool_call 时第二次 LLM 调用(无 tools bound)生成最终回答
5. **Cleanup**:`memoryMonitor.stop` / `recovery.saveSession` / `daemonSessionManager.complete`

> **时序图**见 [ascii-diagrams.md §图 2](ascii-diagrams.md#图-2--agent-loop-时序图)

### 关键方法调用链(伪代码)

```typescript
// src/agent/agent.ts
const agent = await Agent.create({ model: 'gpt-5.4' });
for await (const event of agent.run('分析 NVDA', { sessionId })) {
  switch (event.type) {
    case 'thinking':      // 渲染思考过程
    case 'tool_start':    // 渲染工具调用
    case 'tool_end':      // 渲染工具结果
    case 'microcompact':  // 渲染压缩进度
    case 'text':          // 累积到 accumulatedText
    case 'done':          // 结束
  }
}
```

---

## §3 5-Phase Investment Workflow

`src/agent/investment-workflow.ts:308` 实现了 `research → valuation → backtest → trade → review` 5 步研究闭环。每个 phase 由 `src/commands/investment/phase-handlers.ts` 中的真实工具调用实现。

| Phase | 工具调用 | 产出 | 状态 |
|-------|----------|------|------|
| 1. research | `getStockPrice` / `getKeyRatios` / `getAnalystEstimates` / `getEarnings` / `getFilings` | `research.md` | ✅ 真实工具 |
| 2. valuation | `calculateValuationRatios` / `calculateDCF` | `valuation.md` | ✅ 真实工具 |
| 3. backtest | `backtestLumpSum` / `generateBacktestReport` | `backtest.md` | ✅ 真实工具 |
| 4. trade | `SandboxBroker.placeOrder` + `sandbox.getPositions` | `trade-log.json` | ✅ 真实工具 |
| 5. review | `attribution({method: 'combined'})` (Brinson + Style + Sector) | `review.md` | ✅ 真实工具 |

**5-Phase 状态机**见 [ascii-diagrams.md §图 7](ascii-diagrams.md#图-7--plan-state-状态机)

### 入口与子命令

`src/commands/investment/` 提供 9 个用户入口:

| 子命令 | 触发方式 | 描述 |
|--------|----------|------|
| `/invest <ticker>` | 主入口 | 跑完整 5 phase |
| `/dossier` | 子命令 | 投研档案(累计) |
| `/strategy` | 子命令 | 投资策略 |
| `/earnings-preview` | 子命令 | 财报预告 |
| `/morning-brief` | 子命令 | 早盘播报 |
| `/portfolio-review` | 子命令 | 组合复盘 |
| `/risk-dashboard` | 子命令 | 风险面板 |
| `/watchlist-edit` | 子命令 | 自选股编辑 |
| `/screen` | 子命令 | 选股器 |

---

## §4 Daemon + KAIROS + Coordinator 协作

后台运行的 3 个核心子系统(以及 1 个调度基础)通过 Event Bus 解耦通信:

- **Daemon**(`src/daemon/`)—— 后台进程主控,管理 worker pool 和 session 持久化
- **KAIROS**(`src/kairos/`)—— 持续监控,3 个子系统:
  - `scanner.ts` 盘前/盘中/盘后事件扫描
  - `position-monitor.ts` 持仓 PnL + 止盈止损
  - `proactive.ts` 主动机会发现
- **Coordinator**(`src/coordinator/`)—— 多 Agent 编排,主从职责分离
- **Cron**(`src/cron/`)—— 基础任务调度
- **Event Bus**(`src/core/event-bus.ts`)—— 解耦数据生产/消费

> **协作图**见 [ascii-diagrams.md §图 4](ascii-diagrams.md#图-4--daemon--kairos--coordinator-协作图)

### 4 套状态机

| 状态机 | 状态数 | 引用 |
|--------|--------|------|
| Agent Session | 6 (idle/running/waiting/completed/error/canceled) | `src/daemon/session.ts:SessionState` |
| Plan State | 4 (created/approved/in-progress/completed/failed) | `src/plan/research-plan.ts` |
| KAIROS Task | 3 (queued/running/done/failed) | `src/kairos/types.ts` |
| Coordinator Worker | 5 (pending/running/awaiting-peers/verifying/passed/partial/failed) | `src/coordinator/types.ts` |

**4 套状态机图**见 [ascii-diagrams.md §图 6/7/8/9](ascii-diagrams.md#图-6--agent-session-状态机)

---

## §5 Bridge + Realtime + EventBus 数据通路

3 个独立数据通路共同支撑"实时 + 远程 + 内部事件"三向数据流:

### 5.1 Bridge 远程通路
Web/iOS/Android 客户端 ↔ `src/bridge/server.ts` (WSS + JWT) ↔ Event Bus ↔ Agent/Tools ↔ 回写客户端

### 5.2 Realtime 行情通路
东方财富 WebSocket ↔ `src/realtime/eastmoney-feed.ts` ↔ `throttled-feed.ts` (100ms 节流) ↔ `aggregator.ts` (K线聚合) ↔ Event Bus ↔ KAIROS / Agent / Bridge

### 5.3 EventBus 内部通路
所有子系统通过 `src/core/event-bus.ts:createEventBus()` 解耦:
- `on(topic, handler)` / `once` / `off` / `emit` / `topicMatches(pattern, topic)` 通配符
- 主题示例:`kairos.scan.completed` / `kairos.position.alert` / `kairos.proactive.opportunity` / `coordinator.worker.completed`

> **数据通路图**见 [ascii-diagrams.md §图 5](ascii-diagrams.md#图-5--bridge--realtime--eventbus-数据通路)

---

## §6 Feature Gates 三级门控

`src/agent/feature-gates.ts:393` 实现三级门控:

1. **编译时**:`BUN_CONFIG_FEATURE_<NAME>=0` → Bun.build filter 排除代码
2. **启动时**:`FEATURE_<NAME>=false` → 启动时读 env
3. **运行时**:`featureGates.set(name, { ratio, userId })` → FNV-1a 哈希决定灰度

**诊断命令**:`upup feature-gates doctor` 输出全表

> **门控图**见 [ascii-diagrams.md §图 12](ascii-diagrams.md#图-12--feature-gates-三级门控)

---

## §7 Tool 调用并发与权限

- 只读工具(`getStockPrice`、`getFilings`...)→ 通过 `concurrencyMap` 决定是否并发
- 写工具(`file_edit`、`bash`...)→ 串行 + permission check
- 关键工具(`trading.placeOrder`...)→ 强制用户确认

权限源:
- `src/utils/config.ts:getSessionApprovedTools` — 会话内已批准
- `.upup/settings.json` — 持久批准
- 用户交互:CLI 显示详情(标的/价格/数量)等待 y/n

> **并发与权限图**见 [ascii-diagrams.md §图 10](ascii-diagrams.md#图-10--tool-调用并发与权限控制)

---

## §8 Context 管理

3 层保护机制:

1. **Microcompact**(`src/agent/microcompact.ts:114`)—— 每轮循环开头,清除旧 ToolMessage 详情,节省 ~30% tokens
2. **Compact**(`src/agent/compact.ts:454`)—— 上下文超阈值时,LLM 摘要旧消息,保留最近 3 轮;失败 3 次强制截断
3. **Tool Result 持久化**(`src/utils/tool-result-storage.ts`)—— 单条 tool_result 超 size cap 时,写入 `.upup/tool-results/<hash>`,消息中替换为 `[path: <hash>]`

阈值(可配):
- Anthropic: 180K / 200K
- OpenAI: 100K / 128K
- 其他: 80% 模型上限

> **Context 管理图**见 [ascii-diagrams.md §图 11](ascii-diagrams.md#图-11--context-管理压缩--微压缩--持久化)

---

## §9 多 Agent 拓扑

3 种协作模式:

| 模式 | 适用场景 | 引用 |
|------|----------|------|
| **Coordinator** | 主从职责分离,主只调度 Worker 才执行 | `src/coordinator/coordinatorMode.ts` |
| **Swarm** | 扁平协作,无主从(Researcher/Analyst/Summarizer) | `src/skills/swarm-analysis/` |
| **Subagent** | 单层调用,独立上下文 | `src/agent/subagent.ts:403` + `subagent-runner.ts:631` |

> **多 Agent 拓扑图**见 [ascii-diagrams.md §图 13](ascii-diagrams.md#图-13--多-agent-拓扑coordinator-vs-swarm)

### Coordinator 工具白名单(主 Agent 限制)

主 Agent 在 Coordinator 模式下**只能**使用:
- `Agent` (dispatch worker)
- `SendMessage` (与 worker 通信)
- `TaskStop`
- `TaskList` (查看共享任务列表)

**不能用**:`bash` / `file_edit` / `web_search` / `browser` / `financial_search` / `trading.*` 等所有 leaf 工具

激活方式(三级):
1. `BUN_CONFIG_FEATURE_COORDINATOR_MODE=0` (编译时)
2. `FEATURE_COORDINATOR_MODE=false` (启动时)
3. `featureGates.set('COORDINATOR_MODE', { ratio, userId })` (运行时)
4. **会话级 override**:`CLAUDE_COORDINATOR_MODE=1` (用户主动开启)

---

## §10 Workspace Packages

18 个独立 workspace package,依赖图清晰无环:

> **依赖图**见 [ascii-diagrams.md §图 14](ascii-diagrams.md#图-14--workspace-packages-依赖图)

基础层(无依赖):`types`

中间层:`utils` / `state` / `hooks` → `llm` → `memory` / `skills` / `mcp`

业务层:`plugin-sdk` → `commands` → `agent-core`

独立模块(无内部依赖):`adapter-paperclip` / `keybindings` / `sdk` / `plugins` / `gateway` / `cron` / `daemon`

---

## §11 测试覆盖

- 总测试文件:`src/**/*.test.ts` 276 个
- 总工具文件:`src/tools/**/*.ts` 296 个
- 核心模块(`src/agent/agent.ts:1305L`)有 8+ 个 `.test.ts`
- 框架:Bun 内置 test runner
- CI:`bun run typecheck` + `bun test` 在 push/PR 时跑

---

## §12 关键依赖

| 依赖 | 用途 |
|------|------|
| `@langchain/core` + `@langchain/*` | LLM 抽象(6 家供应商) |
| `better-sqlite3` | Daemon Session 持久化 |
| `@duckdb/duckdb-wasm` | 投研数据本地分析 |
| `@memvid/sdk` | 视频记忆 |
| `playwright` | Browser 自动化 |
| `@whiskeysockets/baileys` | WhatsApp 集成(Bun 兼容风险) |
| `linkedom` | DOM 解析(用于研报抓取) |
| `@earendil-works/pi-tui` | CLI TUI 框架 |
| `@mozilla/readability` | 网页内容提取 |
| `croner` | Cron 任务调度 |
| `fuse.js` | 命令模糊搜索 |

---

## §13 总结

upup 截至 2026.5.15 已经形成 8 大子系统 + 18 个 workspace package + 50 skills + 296 tools + 14 个横向能力的全栈架构。**从代码规模和功能覆盖看,已经是"强 demo"水平**——能跑通单 Agent 投研 + 多 Agent 协作 + 持续监控 + 远程控制 + 实时行情 + 模拟交易 + 归因分析 + 双语 i18n。

但是,从"投资版 Claude Code"产品定位看,**目前距"真生产"还有显著差距**:
- 单文件 1305 行的 agent.ts 需要拆分
- 4 套独立状态机需要统一
- 8-12 个 P0 工作(投资分析可解释性 / 回测保真度 / 沙盒审计 / 实时风控 / 合规边界 / 多源对账 / KAIROS 生产化 / Bridge 安全加固 / Agent Loop 拆分 / 状态机统一 / 错误处理 / 性能资源)需要逐项补齐
- 国际/国内顶级对标(AlphaSense / Hebbia / 同花顺 i 问财 / 东方财富 Choice / GPT-4o Investing)在 6 层能力模型上还差 L4 执行(沙盒+实盘)+ L3 决策(LLM-driven intent)+ L6 体验(远程多端)

具体差距和路线图见:
- [capability-matrix.md](capability-matrix.md) —— 30+ 维度能力对标
- [architecture-debt.md](architecture-debt.md) —— 架构债清单
- [production-readiness-checklist.md](production-readiness-checklist.md) —— 8-12 个 P0 路线图
- [comparison-with-competitors.md](comparison-with-competitors.md) —— 国际/国内/大模型对标

---

## §14 目标架构(高内聚低耦合)

> 配套详细文档:[target-architecture-cohesion-coupling.md](target-architecture-cohesion-coupling.md) (583L)
> 配套图集:[ascii-diagrams.md §图 15-17](ascii-diagrams.md#图集索引17-张)

§13 提到的所有差距,根源都在于当前架构是"功能驱动"长出来的,模块边界模糊、跨层反向引用、巨型文件、内聚低耦合差。**目标架构设计了一套 7 层 + 1 套接口 + 1 个治理器**的方案,把这 4 大问题一次性收敛。

### 14.1 7 层单向依赖模型(目标)

```
L7 Application       src/commands/ + plugins/ + apps/
  ↓
L6 Presentation      src/cli.tsx + controllers/ + components/ + bridge/ + web/ + tui/
  ↓
L5 Orchestration     src/agent/ + coordinator/ + multi-agent/ + kairos/ + daemon/ + cron/
  ↓
L4 Capability        src/tools/ + skills/ + research/ + analysis/ + screening/ + multimodal/ + services/
  ↓
L3 Domain            src/plan/ + commands/investment/ + coach/ + competitive-positioning/
  ↓
L2 Infrastructure    src/memory/ + session/ + realtime/ + storage/ + data/ + mcp/
  ↓
L1 Primitives        src/utils/ + types/ + i18n/ + hooks/ + permissions/ + core/
```

**只允许上层 → 下层**,严禁下层 → 上层。当前架构存在 24 处跨层反向引用(其中 14 处 `tools → agent` 最严重),目标架构通过**端口/适配器**模式 + **纯函数下沉**全部消除。

### 14.2 当前架构 → 目标架构 映射表

| 当前问题 | 当前位置 | 目标位置 | 配套方案 |
|----------|----------|----------|----------|
| `agent.ts` 1305L / 14 职责 | `src/agent/agent.ts` | `src/agent/agent.ts` 200L + 4 个子模块 | [图 15 L5](ascii-diagrams.md#图-15--目标架构-7-层--单向依赖) + [Wave 3](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |
| 14 处 `tools → agent` 反向 | `src/tools/* → src/agent/*` | `packages/agent-core/ports/` + `src/*/adapters/` | [图 17 端口/适配器](ascii-diagrams.md#图-17--接口边界与端口设计) + [Wave 2](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |
| 4 套独立状态机 | 散落 daemon/plan/kairos/coordinator | `packages/state/` 抽象 + Session 2.0 canonical | [图 6-9 状态机现状](ascii-diagrams.md#图-6--agent-session-状态机) + [Wave 4](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |
| `src/memory/` 30+ 文件巨型子系统 | `src/memory/` | 拆为 `memory/{store,search,security,investment,scanner}/` | [Wave 4 W4.1](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |
| `src/multi-agent/` 27 文件混合 | `src/multi-agent/` | 拆为 7 子目录(router/backends/registry/tools/protocol/observability/types) | [Wave 4 W4.3](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |
| 横切关注点(Feature Gates / EventBus / Logger / Metrics / Telemetry) | 散落 agent/core/telemetry/utils | 集中到 `packages/governance/` | [Wave 1](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |
| 死代码(`.bak` + re-export) | `team-tools.ts.bak` / `swarm-tools.ts.bak` / `agent-registry.ts` 等 | 全部删除 | [Wave 1](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave) |

### 14.3 重构工期

**总工期**:83-116 人天,**3-4 人小团队 4-5 月**完成全量重构。

- Wave 1(死代码 + 治理器):5-7 人天
- Wave 2(去反向引用):8-12 人天
- Wave 3(大文件拆分):25-35 人天
- Wave 4(巨型子系统):30-40 人天
- Wave 5(packages/ 治理):10-15 人天
- Wave 6(验证 + 文档):5-7 人天

详细时间线:[ascii-diagrams.md §图 16](ascii-diagrams.md#图-16--重构-roadmap-6-wave-时间线)

### 14.4 重构原则摘要(13 条,详见 [target-architecture-cohesion-coupling.md §5](target-architecture-cohesion-coupling.md#§5-重构原则13-条))

1. 单向依赖(L(n) → L(n-1),严禁反向)
2. 接口稳定(端口在 packages/,实现在 adapters/)
3. 单一职责(每个模块/类只做一件事)
4. 依赖注入(Composition Root 集中装配)
5. 端口/适配器(跨层必须通过 port interface)
6. 死代码零容忍(Wave 1 全清)
7. 大文件上限(< 400L per file)
8. TypeScript 严格(`strict: true` + `noUncheckedIndexedAccess`)
9. 循环依赖检查(`madge --circular` 进 CI)
10. 测试可注入(端口可 mock)
11. 横切治理(governance 包统一)
12. 文档同步(Wave 6 必跑 README / docs 同步)
13. 不开"巨型" change(分 3 个 follow-up change 提交)

### 14.5 与生产化的并行关系

**目标架构重构**与 §13 提到的"8-12 P0 生产化"**完全并行**,不互相阻塞:
- Wave 2(去反向引用)→ 同步 P0-2(finance 工具 import 清理)
- Wave 3(大文件拆分)→ 同步 P0-9(Agent Loop 拆分) + P0-10(状态机统一)
- Wave 4(巨型子系统)→ 同步 P0-1(session/memory 解耦)
- Wave 1(治理器)→ 同步 P2-1(监控 / 可观测性)
- Wave 5(packages/)→ 同步 P0-3(状态机持久化统一到 packages/state)

详见 [production-readiness-checklist.md](production-readiness-checklist.md) 与 [图 16 时间线](ascii-diagrams.md#图-16--重构-roadmap-6-wave-时间线)。

