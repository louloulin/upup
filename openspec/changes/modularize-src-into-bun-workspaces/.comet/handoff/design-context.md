# Comet Design Handoff

- Change: modularize-src-into-bun-workspaces
- Phase: design
- Mode: compact
- Context hash: bab8a74b0a22bd711cb6ddd1360c6db188685717bd76a1f077d6ba11f51fed80

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/modularize-src-into-bun-workspaces/proposal.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/proposal.md
- Lines: 1-56
- SHA256: 57e49464bf1242b83b7e1ba91766cc206a49debfe509ede5f5debb62daf92f82

```md
## Why

upup 仓库已经在 package.json 中声明 21 个 workspace 包（packages/*），但 src/ 仍然保留了所有原始实现，packages/* 中多数只是空 index.ts stub。这种"双轨制"导致：模块边界模糊、无法独立发布、构建必须绕过 workspace、测试/类型/发布路径不一致、onboarding 看不清职责。本次整改要把 src/ 下的 68 个目录彻底迁移到对应的 workspace 包，让 src/index.tsx 只做应用壳 + 顶层编排，让每个 packages/* 真正成为可独立构建/测试/发布的单元。

## What Changes

- 把 src/ 下 68 个目录按"单一职责"映射到 21+ 个 workspace 包，逐个搬运、补全 stub、调整 import 路径
- 新增缺失的 workspace 包（@upup/agent、@upup/tools、@upup/tui、@upup/components、@upup/bridge、@upup/coordinator、@upup/plan、@upup/daemon、@upup/cron、@upup/telemetry、@upup/realtime、@upup/gateway、@upup/memory、@upup/skills、@upup/plugins、@upup/mcp、@upup/multimodal、@upup/research、@upup/services、@upup/storage、@upup/session、@upup/cli、@upup/index）补齐 src/ 现有所有目录
- src/index.tsx、src/cli.ts、src/run.ts、src/bundled-runner.ts、src/theme.ts 改为只组合 packages/*，不再写业务逻辑
- 顶层 tsconfig.base.json + 每个包独立 tsconfig.json，统一 ESM/bun 解析与 path alias
- 引入 bunfig.toml workspace 锁定、根 package.json workspaces 字段校验
- 增量构建脚本：bun run build:packages（按拓扑排序逐包构建）；替换当前手写多步
- 现有测试全部跟着代码迁移，bun test 必须在迁移后保持绿灯
- 现有 bun run typecheck / bun run lint:scc 在迁移后必须保持绿灯
- 删除 src/ 中所有已被 workspace 包接管的实现（保留 src/index.tsx / src/cli.ts / src/run.ts / src/bundled-runner.ts / src/theme.ts 作为入口壳）

## Capabilities

### New Capabilities

- agent-runtime: agent 循环、scratchpad、上下文压缩、事件流、状态机
- tools-registry: 工具注册、调度、rendering、description 注入
- finance-tools: 行情/财报/估值/筛选/backtest/watchlist 等金融工具集
- tui-renderer: Ink 风格 pi-tui 渲染层、组件、keybindings、overlays
- skill-system: SKILL.md 发现、调度、执行、审计
- mcp-bridge: MCP 客户端、服务端、stdio 传输
- plugin-system: 插件 manifest、加载、adapters
- memory-system: memvid/SQLite/BM25 记忆、归档、跨 session 共享
- cron-system: croner 调度、任务状态、worker pool
- daemon-system: 后台守护进程、健康检查、worker 池
- session-system: session 持久化、checkpoint、resume、迁移
- realtime-channel: 实时通道（WebSocket/SSE/广播）
- telemetry-system: 指标、trace、events、anonymized 遥测
- cli-shell: CLI 命令注册、子命令解析、onboarding、doctor、stdio server
- bridge-system: 外部桥接（Paperclip/WhatsApp/IM）
- coordinator-system: 多 agent 编排、planner、orchestrator
- plan-system: research plan、plan builder、plan executor、audit
- research-system: research workflow、dossier、报告生成
- multimodal-system: 多模态输入/输出（image/audio/structured）
- services-core: 应用服务层、context wiring、DI 容器
- storage-system: 存储抽象、KV、文件、对象存储适配
- gateway-system: 通道网关、消息路由、WhatsApp/Webhook
- index-app: 顶层入口（src/index.tsx + src/run.ts），把 cli/bundled-runner/stdio server 串起来

### Modified Capabilities

无（首次系统性模块化，只搬运实现，不修改已有 capability 的需求）。

## Impact

- 受影响代码：src/**/*、packages/**/*、tsconfig*.json、package.json、bunfig.toml、bun.lock
- 受影响 API：所有 import 路径；新 import 必须走 workspace 协议 @upup/<name>
- 受影响依赖：现有 @upup/* 之间的 peer/dev/dependency 关系按"分层 + 单向"重排（types → utils → hooks → state → llm → agent-core → tools/skills/mcp/memory/cron/... → cli → index）
- 受影响系统：CI（bun run typecheck + bun test）、本地 dev、release 流程、二进制编译
- 受影响测试：所有 *.test.ts 随被测代码迁移到对应包；bun test 在所有包必须通过
- 风险：迁移面广（68 目录 + 21+ 包）；必须"逐包迁移 + 绿测试 + 绿 typecheck"滚动式推进
```

## openspec/changes/modularize-src-into-bun-workspaces/design.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/design.md
- Lines: 1-219
- SHA256: e72c0003a3149c09aa6bb2a63f99b3a85b46744509d32ecda227a6a8b91ceef1

[TRUNCATED]

```md
# Design — modularize-src-into-bun-workspaces

## Architecture overview

把 upup 重塑为**多层 workspace** + **单向上游依赖**：

```
┌──────────────────────────────────────────────────────────────┐
│                     L7 入口壳  src/                           │
│   src/index.tsx · src/run.ts · src/bundled-runner.ts         │
│   src/cli.ts · src/theme.ts                                  │
│   职责: .env 加载 · 启动 wiring · 暴露 dist/upup 二进制      │
└──────────────────────────┬───────────────────────────────────┘
                           │ depends on @upup/cli
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L6 应用壳  @upup/cli (packages/cli)                          │
│   子命令路由 · onboarding · doctor · stdio server            │
│   depends on: @upup/commands · @upup/services-core           │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L5 应用编排  @upup/services-core                              │
│   AppContext · ServiceRegistry · DI 容器                      │
│   depends on: 全部 L4 runtime 包                              │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L4 Runtime  (按职责划分)                                      │
│   @upup/agent-runtime · @upup/tools-registry                  │
│   @upup/skill-system · @upup/mcp-bridge                      │
│   @upup/plugin-system · @upup/memory-system                  │
│   @upup/cron-system · @upup/daemon-system                    │
│   @upup/session-system · @upup/realtime-channel              │
│   @upup/bridge-system · @upup/coordinator-system             │
│   @upup/plan-system · @upup/research-system                  │
│   @upup/multimodal-system · @upup/gateway-system             │
│   @upup/finance-tools · @upup/cli-shell (l5 entry)            │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L3 基础设施  @upup/storage · @upup/telemetry                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L2 核心抽象  @upup/llm · @upup/state · @upup/hooks            │
│   @upup/keybindings · @upup/tui-renderer                      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ L1 底层共享  @upup/types · @upup/utils                        │
└──────────────────────────────────────────────────────────────┘
```

**分层规则**：
- 同层包之间**不直接互相 import**；跨层只能**向下依赖**
- `@upup/types` 是叶子；任何包都可以依赖
- `@upup/utils` 提供纯函数工具，不允许持有 runtime 状态
- `@upup/llm` 不允许 import 任何 agent / tool / skill
- `@upup/agent-runtime` 是 L4 的核心；其它 L4 包可以 import 它

## Workspace 包映射（src/ → packages/*）

| 现有 src 目录 | 目标包 | 备注 |
|---|---|---|
| `src/agent/` | `@upup/agent-runtime` | agent 循环、scratchpad、context、events、state |
| `src/tools/` | `@upup/tools-registry` + `@upup/finance-tools` | registry 与 finance 拆开 |
| `src/agent/tools/finance/` | `@upup/finance-tools` | 全部金融工具族 |
| `src/components/` | `@upup/tui-renderer` | UI 组件 |
| `src/hooks/` + `src/keybindings/` | `@upup/hooks` + `@upup/keybindings` | 拆开 |
| `src/skills/` | `@upup/skill-system` | 保留 `skills/` 目录（SKILL.md） |
| `src/mcp/` | `@upup/mcp-bridge` | MCP 客户端/服务端 |
| `src/plugins/` | `@upup/plugin-system` | 含 sdk + adapters |
| `src/memory/` | `@upup/memory-system` | memvid + sqlite + bm25 |
| `src/cron/` | `@upup/cron-system` | croner |
| `src/daemon/` | `@upup/daemon-system` | daemon + worker pool |
| `src/session/` | `@upup/session-system` | checkpoint + resume |
| `src/realtime/` | `@upup/realtime-channel` | ws/sse |
| `src/telemetry/` | `@upup/telemetry-system` | metrics + trace |
| `src/commands/` | `@upup/cli-shell` | CLI 框架 |
```

Full source: openspec/changes/modularize-src-into-bun-workspaces/design.md

## openspec/changes/modularize-src-into-bun-workspaces/tasks.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/tasks.md
- Lines: 1-98
- SHA256: bfe588bfd11045a2e0ec7c8aa751145ab92129b8c36b7cf8014571ee618e1975

[TRUNCATED]

```md
# Tasks — modularize-src-into-bun-workspaces

> 每个任务都包含：交付物 · 验证（`bun run typecheck` + `bun test`）· 风险提示
> 顺序：L1 → L2 → L3 → L4 → L5 → L6 → L7 → 收尾

## Phase 1 — L1 底层（types / utils）

- [ ] T-1.1 把 `src/types/*` 和 `src/types.ts` 整体迁入 `packages/types/src/`
  - 验证：`bun --filter @upup/types typecheck && bun --filter @upup/types test`
- [ ] T-1.2 把 `src/utils/*` 整体迁入 `packages/utils/src/`
  - 验证：同上
- [ ] T-1.3 锁定 `@upup/types` 的 `exports` 字段
- [ ] T-1.4 锁定 `@upup/utils` 的 `exports` 字段

## Phase 2 — L2 核心抽象

- [ ] T-2.1 把 `src/model/llm.ts` 和 `src/providers.ts` 迁入 `packages/llm/src/`
- [ ] T-2.2 把 `src/hooks/*` 迁入 `packages/hooks/src/`
- [ ] T-2.3 把 `src/keybindings/*` 迁入 `packages/keybindings/src/`
- [ ] T-2.4 把 `src/state/*` 迁入 `packages/state/src/`
- [ ] T-2.5 把 `src/components/*` 和 `src/tui/*` 迁入新包 `packages/tui-renderer/src/`
- [ ] T-2.6 把 `packages/agent-core` 合并到 L4 的 `agent-runtime`（保留 @upup/sdk 不动）

## Phase 3 — L3 基础设施

- [ ] T-3.1 创建 `packages/storage/` 包，把 `src/storage/*` 和 `src/data/*` 迁入
- [ ] T-3.2 创建 `packages/telemetry/` 包，把 `src/telemetry/*` 迁入

## Phase 4 — L4 Runtime（按 capability 顺序）

- [ ] T-4.1 创建 `packages/agent-runtime/`，把 `src/agent/*` 迁入
- [ ] T-4.2 创建 `packages/tools-registry/`，把 `src/tools/registry/*` + `src/tools/tool-renderers.ts` + `src/tools/descriptions/*` 迁入
- [ ] T-4.3 创建 `packages/finance-tools/`，把 `src/tools/finance/*` + `src/tools/forecast|benchmark|research|quant|notify|monitor|calendar|astock|memory|cache|ask|fx|sector|plan|discovery|worktree|lsp|filesystem|bash|alt-data|todo|search|backtest|alerts|powershell|heartbeat|browser|fetch|news|earnings|workflow|task|portfolio|comparison|short-interest|notebook|export|sentiment|trading|valuation|risk|watchlist|cron|analytics|screening|fund` 全部迁入
- [ ] T-4.4 创建 `packages/skill-system/`，把 `src/skills/*` 迁入
- [ ] T-4.5 创建 `packages/mcp-bridge/`，把 `src/mcp/*` 迁入
- [ ] T-4.6 创建 `packages/plugin-system/`，把 `src/plugins/*` 迁入
- [ ] T-4.7 创建 `packages/memory-system/`，把 `src/memory/*` 迁入
- [ ] T-4.8 创建 `packages/cron-system/`，把 `src/cron/*` 迁入
- [ ] T-4.9 创建 `packages/daemon-system/`，把 `src/daemon/*` 迁入
- [ ] T-4.10 创建 `packages/session-system/`，把 `src/session/*` 迁入
- [ ] T-4.11 创建 `packages/realtime-channel/`，把 `src/realtime/*` 迁入
- [ ] T-4.12 创建 `packages/bridge-system/`，把 `src/bridge/*` 迁入
- [ ] T-4.13 创建 `packages/coordinator-system/`，把 `src/coordinator/*` + `src/multi-agent/*` + `src/subagent/*` 迁入
- [ ] T-4.14 创建 `packages/plan-system/`，把 `src/plan/*` 迁入
- [ ] T-4.15 创建 `packages/research-system/`，把 `src/research/*` + `src/analysis/*` + `src/competitive-positioning/*` + `src/code-archaeology/*` + `src/coach/*` 迁入
- [ ] T-4.16 创建 `packages/multimodal-system/`，把 `src/multimodal/*` 迁入
- [ ] T-4.17 创建 `packages/gateway-system/`，把 `src/gateway/*` 迁入

## Phase 5 — L5 应用编排

- [ ] T-5.1 创建 `packages/services-core/`，把 `src/services/*` 迁入
- [ ] T-5.2 把 `src/permissions/*` 迁入 `packages/services-core/src/permissions/`

## Phase 6 — L6 应用壳

- [ ] T-6.1 创建 `packages/cli/`，把 `src/commands/*` 迁入
- [ ] T-6.2 把 `src/cli.ts` 拆成 `packages/cli/src/run.ts` + `packages/cli/src/subcommands/*.ts`

## Phase 7 — L7 入口壳

- [ ] T-7.1 创建 `packages/index-app/`，把 `src/index.tsx` + `src/run.ts` + `src/bundled-runner.ts` + `src/theme.ts` 迁入
- [ ] T-7.2 `src/index.tsx` 改为只 `import 'dotenv/config'; import { runCli } from '@upup/cli'; runCli();`
- [ ] T-7.3 `src/cli.ts` 改为只 re-export 入口
- [ ] T-7.4 `src/run.ts` 改为 stdio 入口
- [ ] T-7.5 `src/bundled-runner.ts` 改为 bundled binary 入口
- [ ] T-7.6 `src/theme.ts` 改为只导出主题常量

## Phase 8 — 配置与构建

- [ ] T-8.1 根 `package.json` 校验 `workspaces: ["packages/*"]`
- [ ] T-8.2 根 `bunfig.toml` 加 `linker = "hoisted"`
- [ ] T-8.3 根 `tsconfig.base.json` 抽公共编译选项
- [ ] T-8.4 每个包独立 `tsconfig.json`（继承 base）
- [ ] T-8.5 根 `package.json` 加 `build:packages` 脚本（DAG 拓扑排序）
- [ ] T-8.6 根 `package.json` 加 `lint:boundaries` 脚本（禁止跨层 import）
- [ ] T-8.7 根 `package.json` 把 `start` 改为 `bun run --filter @upup/index-app start`

## Phase 9 — 收尾

- [ ] T-9.1 `bun install` 锁住 workspace 拓扑
```

Full source: openspec/changes/modularize-src-into-bun-workspaces/tasks.md

## openspec/changes/modularize-src-into-bun-workspaces/specs/agent-runtime/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/agent-runtime/spec.md
- Lines: 1-36
- SHA256: 26951e726970f372e0cb18828719528f828190d76f017e1e31e74f263d7b1754

```md
# agent-runtime

## Purpose
封装 agent 循环（思考→工具调用→观察→再思考）、scratchpad、上下文压缩、事件流和状态机。所有 agent 行为只走这一个 capability，不在其它 capability 里重新发明轮子。

## Requirements

### R-1 Agent loop
系统 SHALL 提供迭代式 agent 循环：接收 query → 调用 LLM → 处理 tool_call → 执行工具 → 写回 scratchpad → 再次调用 LLM，直至 LLM 返回 final answer 或达到 max_iterations。

### R-2 Scratchpad
系统 SHALL 把所有工具结果存到单一 scratchpad 对象，作为该 query 的"事实之源"；LLM 在每轮只能看到 scratchpad 的内容。

### R-3 Context compaction
系统 SHALL 在累计 token 超过阈值时按"最旧优先"清理工具结果；压缩前后 scratchpad 内容 SHALL 一致。

### R-4 Event stream
系统 SHALL 在循环中 yield 类型化事件（`tool_start`、`tool_end`、`thinking`、`answer_start`、`done` 等），供 UI 和外部观察者订阅。

### R-5 Final answer
系统 SHALL 在 LLM 决定收尾时单独发起一次无工具的 LLM 调用生成 final answer，传入完整 scratchpad 上下文。

### R-6 Multi-provider LLM
系统 SHALL 支持 OpenAI、Anthropic、Google、xAI、OpenRouter、Ollama；模型选择由 `@upup/llm` 提供。

## Scenarios

### S-1 Single-tool research
- **GIVEN** 用户 query "NVDA 2024 revenue"
- **WHEN** agent 启动
- **THEN** 经过 ≤10 轮迭代后返回引用财报数据的 final answer

### S-2 Context overflow
- **GIVEN** scratchpad 累计 token 超过 80k
- **WHEN** 新一轮 LLM 调用发起
- **THEN** 系统清理最旧工具结果并继续，scratchpad 内容不丢
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/bridge-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/bridge-system/spec.md
- Lines: 1-25
- SHA256: 45f7286102e33e972a15901aa30052b54d4c198c15c859518937eec4f5fd78ab

```md
# bridge-system

## Purpose
提供外部桥接（Paperclip/WhatsApp/IM），让 UpUp 能跑在这些外部 surface 上。

## Requirements

### R-1 Adapter contract
系统 SHALL 定义统一 BridgeAdapter 接口。

### R-2 Built-in adapters
系统 SHALL 内置 paperclip、whatsapp、telegram 三个 adapter。

### R-3 Message routing
系统 SHALL 把外部消息映射成 UpUp session。

### R-4 Media
系统 SHALL 支持图片/文件/语音的入站和出站。

## Scenarios

### S-1 WhatsApp query
- **GIVEN** 用户在 WhatsApp 发 "分析 NVDA"
- **WHEN** bridge 收到消息
- **THEN** 系统 SHALL 创建 session 跑 agent 并回复
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/cli-shell/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/cli-shell/spec.md
- Lines: 1-28
- SHA256: 4370ccabdafdf513ec0608234e9255d193f37fcc005812dc194b25ee3e15d554

```md
# cli-shell

## Purpose
提供 CLI 命令注册、子命令解析、onboarding、doctor、stdio server。

## Requirements

### R-1 Subcommand routing
系统 SHALL 支持 `upup <subcommand> [args]`，子命令由 `@upup/commands` 注册。

### R-2 Onboarding
系统 SHALL 提供 first-run 引导（API key、provider 选择、.upup 目录创建）。

### R-3 Doctor
系统 SHALL 提供 `upup doctor` 健康检查。

### R-4 Stdio server
系统 SHALL 提供 stdio JSON-RPC server，给 SDK 客户端使用。

### R-5 Config
系统 SHALL 支持 `~/.upup/settings.json` 持久化 model/provider 选择。

## Scenarios

### S-1 First run
- **GIVEN** `~/.upup/` 不存在
- **WHEN** 首次执行 `upup`
- **THEN** onboarding SHALL 引导用户完成 API key 配置
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/coordinator-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/coordinator-system/spec.md
- Lines: 1-25
- SHA256: 81a424442497d4a19ff14ac627d338411ccd95062c72703d4129b3e8919e26f1

```md
# coordinator-system

## Purpose
提供多 agent 编排、planner、orchestrator。

## Requirements

### R-1 Multi-agent
系统 SHALL 支持 planner / executor / critic 三种角色 agent。

### R-2 Task delegation
系统 SHALL 支持把子任务委派给 subagent。

### R-3 Result aggregation
系统 SHALL 收集 subagent 结果并汇总。

### R-4 Backends
系统 SHALL 支持 local、docker、remote 三种 subagent backend。

## Scenarios

### S-1 Plan + execute
- **GIVEN** 用户 query "深度调研 NVDA"
- **WHEN** coordinator 启动
- **THEN** planner SHALL 拆 5 步，executor SHALL 串行执行，critic SHALL 评估
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/cron-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/cron-system/spec.md
- Lines: 1-28
- SHA256: 6823cf709fd1ec61a2cdf7d16ebf7656379269fe7eb5823475e23bfdfe9163e6

```md
# cron-system

## Purpose
提供 croner 驱动的调度、任务状态机和 worker pool。

## Requirements

### R-1 Cron syntax
系统 SHALL 支持标准 cron 表达式和时区。

### R-2 Job state machine
系统 SHALL 提供 5 态状态机：pending → running → success/failed/cancelled。

### R-3 Worker pool
系统 SHALL 支持多 worker 并发执行 job。

### R-4 Retry & backoff
系统 SHALL 支持指数退避重试。

### R-5 Observability
系统 SHALL 暴露 cron metrics 给 telemetry。

## Scenarios

### S-1 Daily morning brief
- **GIVEN** 配置 cron "0 9 * * 1-5"
- **WHEN** 时间到达
- **THEN** 系统 SHALL 触发 morning-brief job
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/daemon-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/daemon-system/spec.md
- Lines: 1-25
- SHA256: 9b50d57495f2f5a40b9ccc8b5f5b17a01b40bbaaa2ed763a37c132c4b4fdae42

```md
# daemon-system

## Purpose
提供后台守护进程、健康检查、worker 池。

## Requirements

### R-1 Daemon lifecycle
系统 SHALL 支持 start / stop / restart / status。

### R-2 Health endpoint
系统 SHALL 暴露 /health、/ready、/metrics 端点。

### R-3 Worker pool
系统 SHALL 支持 task queue + worker pool 解耦。

### R-4 PID & log
系统 SHALL 写 PID file 和 log file 到 `~/.upup/daemon/`。

## Scenarios

### S-1 Auto-restart on crash
- **GIVEN** worker panic
- **WHEN** 进程退出
- **THEN** daemon SHALL 拉起新 worker 并上报 health=fail 事件
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/finance-tools/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/finance-tools/spec.md
- Lines: 1-30
- SHA256: de28ca1ce9ae2155db7fbdfb375392a82d0e2bd2a633e7b4094ba21842ef13c3

```md
# finance-tools

## Purpose
提供股票/财报/估值/筛选/backtest/watchlist 等金融工具集。所有金融数据查询 SHALL 走 `@upup/finance-tools`，不直接调用第三方 API。

## Requirements

### R-1 Tool families
系统 SHALL 提供以下工具族：prices、fundamentals、filings、insider、institutional、metrics、screener、watchlist、earnings、valuation、backtest、risk、portfolio、comparison、short-interest、news、sentiment、notebook、export。

### R-2 Data source
系统 SHALL 使用 `financial_datasets` API 作为主数据源；缺失时 SHALL 降级到 web search。

### R-3 Caching
系统 SHALL 对所有只读查询启用缓存，TTL 由工具类型决定（行情短、财报长）。

### R-4 A-stock support
系统 SHALL 至少对 a-share 提供：实时行情、涨停跌停、龙虎榜、北向资金、估值/财报。

## Scenarios

### S-1 Price query
- **GIVEN** 用户问 "AAPL 当前价"
- **WHEN** 工具被调用
- **THEN** SHALL 返回 latest price + change + volume + timestamp

### S-2 Backtest
- **GIVEN** 用户给一个策略（双均线）
- **WHEN** backtest 工具被调用
- **THEN** SHALL 返回年化、夏普、最大回撤、交易明细
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/gateway-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/gateway-system/spec.md
- Lines: 1-25
- SHA256: 8ca2837580afa0ecef331cc18d8c7d63ba172f355892b984ab064c518317400e

```md
# gateway-system

## Purpose
提供通道网关、消息路由、WhatsApp/Webhook。

## Requirements

### R-1 Channel registry
系统 SHALL 维护 channel 列表（whatsapp、telegram、webhook、stdio）。

### R-2 Routing
系统 SHALL 按 channel + user 把消息路由到对应 session。

### R-3 Outbound
系统 SHALL 支持把 agent 回复按 channel 序列化（文本、按钮、卡片）。

### R-4 Reconnect
系统 SHALL 断线自动重连，重连后 SHALL resync 未送达消息。

## Scenarios

### S-1 WhatsApp webhook
- **GIVEN** WhatsApp webhook 收到消息
- **WHEN** gateway 处理
- **THEN** 系统 SHALL 路由到正确 session 并返回 reply
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/index-app/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/index-app/spec.md
- Lines: 1-28
- SHA256: fb67b067bf4ac4ea17f8dc06b37e3c7cf94d7d6c03cbdc1b76bbfadfeaf9be97

```md
# index-app

## Purpose
提供顶层入口（src/index.tsx + src/run.ts），把 cli / bundled-runner / stdio server 串起来。

## Requirements

### R-1 Entry point
系统 SHALL 暴露 `bun run start` 调起 CLI 入口。

### R-2 Bundled runner
系统 SHALL 提供 bundled runner 用于单文件分发。

### R-3 Stdio server
系统 SHALL 支持 `upup stdio` 启动 stdio JSON-RPC server。

### R-4 No business logic
系统 SHALL 不在入口写业务；只做 wiring。

### R-5 Env loading
系统 SHALL 在入口最早阶段加载 .env。

## Scenarios

### S-1 Default start
- **GIVEN** `bun run start`
- **WHEN** 执行
- **THEN** CLI SHALL 启动并进入 REPL
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/mcp-bridge/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/mcp-bridge/spec.md
- Lines: 1-25
- SHA256: 0ee4bc71320f33551f3892e9ea65674f36e437f285f106833e40a5a31cf9fddc

```md
# mcp-bridge

## Purpose
实现 Model Context Protocol 客户端、服务端和 stdio 传输，让 UpUp 能作为 MCP host 或 server。

## Requirements

### R-1 MCP client
系统 SHALL 支持 stdio 和 HTTP 两种 transport 连接外部 MCP server。

### R-2 MCP server
系统 SHALL 暴露 stdio MCP server，注册所有内部工具。

### R-3 Tool bridging
系统 SHALL 把外部 MCP 工具以 `mcp__<server>__<tool>` 命名空间注入 LLM。

### R-4 Capability negotiation
系统 SHALL 实现 MCP 协议能力协商（tools、resources、prompts）。

## Scenarios

### S-1 Connect external server
- **GIVEN** 用户配置 external MCP server
- **WHEN** CLI 启动
- **THEN** 外部工具 SHALL 出现在 LLM 可用列表
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/memory-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/memory-system/spec.md
- Lines: 1-28
- SHA256: fb58d04426ed3987491991eb1763d6b1a1b49ac242a720d2a97b6f4b06cd6dcb

```md
# memory-system

## Purpose
提供 memvid/SQLite/BM25 记忆、归档、跨 session 共享。

## Requirements

### R-1 Multi-tier memory
系统 SHALL 提供 working / episodic / semantic / procedural 四层记忆。

### R-2 BM25 search
系统 SHALL 在所有记忆上提供 BM25 全文检索。

### R-3 Cross-session share
系统 SHALL 支持跨 session 记忆共享（带 ACL）。

### R-4 Archive
系统 SHALL 支持长期归档（memvid 视频 / S3 / 本地冷存）。

### R-5 Privacy
系统 SHALL 支持记忆脱敏和删除（GDPR-style）。

## Scenarios

### S-1 Recall
- **GIVEN** 用户在 session A 提到 "关注 AAPL"
- **WHEN** session B 启动
- **THEN** LLM SHALL 能通过 memory 工具检索到该上下文
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/multimodal-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/multimodal-system/spec.md
- Lines: 1-25
- SHA256: d590ab77c949ca9a69020a8b7e3dfbc8c7e40db3b31f9319f56bfb2370ada0b9

```md
# multimodal-system

## Purpose
提供多模态输入/输出（image/audio/structured）。

## Requirements

### R-1 Input
系统 SHALL 支持 image、pdf、audio、video 入站。

### R-2 Output
系统 SHALL 支持文本、结构化 JSON、image、chart 出站。

### R-3 Provider abstraction
系统 SHALL 用 provider 抽象（vision、tts、image-gen）隔离具体实现。

### R-4 Caching
系统 SHALL 对多模态 embedding 做缓存。

## Scenarios

### S-1 Screenshot analysis
- **GIVEN** 用户贴一张财报截图
- **WHEN** LLM 调用 vision 工具
- **THEN** 系统 SHALL 返回结构化财务摘要
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/plan-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/plan-system/spec.md
- Lines: 1-28
- SHA256: 8eb6470b722a683da63bf6434f4b26c57d9c4b57d0e775b456ff4ec8911d8405

```md
# plan-system

## Purpose
提供 research plan、plan builder、plan executor、audit。

## Requirements

### R-1 Plan model
系统 SHALL 定义 ResearchPlan + PlanAuditEntry + 5 态状态机。

### R-2 Builder
系统 SHALL 把自然语言 query 拆成结构化 plan。

### R-3 Executor
系统 SHALL 按 plan 跑每一步并写 audit log。

### R-4 Persistence
系统 SHALL 把 plan 和 audit 持久化到 `.upup/plans/<id>.json`。

### R-5 Resume
系统 SHALL 支持从断点恢复 plan。

## Scenarios

### S-1 /invest NVDA
- **GIVEN** 用户输入 `/invest NVDA`
- **WHEN** system 收到
- **THEN** 5 步研究闭环 SHALL 跑完并写 audit log
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/plugin-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/plugin-system/spec.md
- Lines: 1-28
- SHA256: b2538a6178e43c1e339c920064a5ac2547214f50c059ef2ebd6f2bc900e21a7f

```md
# plugin-system

## Purpose
提供第三方插件的 manifest、加载、adapters；UpUp SHALL 作为可扩展 host。

## Requirements

### R-1 Plugin manifest
系统 SHALL 用 JSON + Zod schema 描述插件元数据（name、version、entry、permissions、tools）。

### R-2 Loader
系统 SHALL 支持从 `plugins/` 和 `~/.upup/plugins/` 加载插件。

### R-3 Adapters
系统 SHALL 提供 paperclip、whatsapp、webhook 等内置 adapter。

### R-4 Permission model
系统 SHALL 强制插件权限（读文件 / 写文件 / 调 LLM / 调工具）。

### R-5 Hot-reload
系统 SHALL 支持开发态热重载（watch 模式）。

## Scenarios

### S-1 Install community plugin
- **GIVEN** 用户把插件放入 `~/.upup/plugins/my-plugin/`
- **WHEN** CLI 启动
- **THEN** 插件的工具 SHALL 被注册并暴露给 LLM
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/realtime-channel/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/realtime-channel/spec.md
- Lines: 1-25
- SHA256: 8b0bcc4b3bd732261649ee9d071d7895d1bfc579253ea8d861175ff1e07d57d1

```md
# realtime-channel

## Purpose
提供实时通道（WebSocket/SSE/广播），让多个客户端能订阅 agent 事件流。

## Requirements

### R-1 Transports
系统 SHALL 支持 WebSocket、SSE、长轮询三种 transport。

### R-2 Multi-channel
系统 SHALL 支持按 session、agent、user 维度分通道广播。

### R-3 Backpressure
系统 SHALL 在客户端消费慢时自动 buffer 或丢弃最旧事件。

### R-4 Auth
系统 SHALL 对所有实时连接做 auth（API key / session token）。

## Scenarios

### S-1 Multi-client subscribe
- **GIVEN** 两个 client 订阅同一 session
- **WHEN** agent 发出 tool_start 事件
- **THEN** 两个 client SHALL 同时收到
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/research-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/research-system/spec.md
- Lines: 1-25
- SHA256: 5e68be791f3c1f2fa1cf5068214f99cd6c78d898a8271a3a9149a8c897a92ef2

```md
# research-system

## Purpose
提供 research workflow、dossier、报告生成。

## Requirements

### R-1 Research workflow
系统 SHALL 定义可复用的 research flow（collect → analyze → synthesize → report）。

### R-2 Dossier
系统 SHALL 维护结构化 dossier 对象（company、financials、events、risks、thesis）。

### R-3 Report generator
系统 SHALL 把 dossier 渲染成 markdown / html / pdf。

### R-4 Caching
系统 SHALL 对相同 ticker 的 dossier 做缓存。

## Scenarios

### S-1 Full report
- **GIVEN** 用户要 "AAPL 完整研报"
- **WHEN** research 跑完
- **THEN** dossier SHALL 含 4 部分 + 报告 SHALL 渲染为 markdown
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/services-core/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/services-core/spec.md
- Lines: 1-25
- SHA256: 67206b9fe15fa184edbced948fdfdaa1fac02254a79099d3ff11f9bd74475636

```md
# services-core

## Purpose
提供应用服务层、context wiring、DI 容器。

## Requirements

### R-1 Service registry
系统 SHALL 提供 ServiceRegistry，所有 runtime 依赖 SHALL 通过 registry 解析。

### R-2 Context
系统 SHALL 暴露 AppContext（config、logger、telemetry、storage、llm）。

### R-3 Lifecycle
系统 SHALL 支持 service init / start / stop / dispose。

### R-4 No ambient globals
系统 SHALL 禁止直接 import 全局 config；所有依赖 SHALL 显式注入。

## Scenarios

### S-1 Service init
- **GIVEN** CLI 启动
- **WHEN** AppContext 初始化
- **THEN** 所有 service SHALL 按依赖序完成 init
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/session-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/session-system/spec.md
- Lines: 1-28
- SHA256: ed95de5d21f9f3a1abdac626a8e78882d78c05b13430ba9c36525dd2c64b735a

```md
# session-system

## Purpose
提供 session 持久化、checkpoint、resume、迁移。

## Requirements

### R-1 Session model
系统 SHALL 定义 Session 包含 id、messages、events、tokenUsage、checkpoints。

### R-2 Checkpoint
系统 SHALL 在每轮 agent 循环后写入 checkpoint。

### R-3 Resume
系统 SHALL 支持从任意 checkpoint 恢复 session。

### R-4 Migration
系统 SHALL 支持跨 UpUp 版本的 session 迁移（schema versioned）。

### R-5 Storage
系统 SHALL 使用 `@upup/storage` 抽象，支持本地 + S3。

## Scenarios

### S-1 Crash recovery
- **GIVEN** CLI 崩溃在第 7 轮
- **WHEN** 用户 `/resume`
- **THEN** 系统 SHALL 从第 7 轮 checkpoint 恢复
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/skill-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/skill-system/spec.md
- Lines: 1-28
- SHA256: 71995f75d5adf3181e4030512d56aa4e70130da910b8d6405fd9f1f664afa1f3

```md
# skill-system

## Purpose
提供 SKILL.md 的发现、加载、调度和执行。每个 skill SHALL 是一段结构化指令，可被 LLM 主动调用。

## Requirements

### R-1 SKILL.md format
系统 SHALL 解析 SKILL.md 的 YAML frontmatter（name、description）和 markdown body。

### R-2 Discovery
系统 SHALL 在启动时扫描 `skills/` 和 `packages/*/skills/` 目录，缓存所有 SKILL.md。

### R-3 Tool exposure
系统 SHALL 把 skill 暴露为 LLM 可调用的工具；每个 query 内 skill SHALL 最多执行一次。

### R-4 Built-in skills
系统 SHALL 内置至少一个 skill（DCF valuation）。

### R-5 Skill state
系统 SHALL 跟踪 skill 执行状态（pending/running/success/fail），供 UI 和 telemetry 观察。

## Scenarios

### S-1 DCF invocation
- **GIVEN** 用户问 "AAPL 估值"
- **WHEN** LLM 选择 dcf skill
- **THEN** skill SHALL 跑完 valuation flow 并返回 intrinsic value
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/storage-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/storage-system/spec.md
- Lines: 1-25
- SHA256: eb328ffd26952b7af46da5395c922866d8081d58ae5108f3c2b27bf248e33bc7

```md
# storage-system

## Purpose
提供存储抽象、KV、文件、对象存储适配。

## Requirements

### R-1 Abstraction
系统 SHALL 定义 Storage 接口：get/put/delete/list。

### R-2 Adapters
系统 SHALL 内置 local-fs、sqlite、s3 三个 adapter。

### R-3 Key naming
系统 SHALL 用统一 key convention（`<namespace>/<id>`）。

### R-4 Atomicity
系统 SHALL 保证写操作的原子性（write-then-rename / DB tx）。

## Scenarios

### S-1 Local + S3 swap
- **GIVEN** 配置从 local 切到 s3
- **WHEN** session 写入
- **THEN** 数据 SHALL 落到 s3 bucket 且 key 一致
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/telemetry-system/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/telemetry-system/spec.md
- Lines: 1-28
- SHA256: a0ac9c4bfe8f318aec021e4aa8162de36d290ae57728dad12440fad7e522bd9e

```md
# telemetry-system

## Purpose
提供指标、trace、events、anonymized 遥测。

## Requirements

### R-1 Metrics
系统 SHALL 暴露 counter、gauge、histogram 三类指标。

### R-2 Tracing
系统 SHALL 接入 LangSmith / OpenTelemetry。

### R-3 Events
系统 SHALL 把所有 agent 事件以结构化日志形式持久化。

### R-4 Anonymization
系统 SHALL 在默认模式下脱敏 PII（API key、邮箱、电话）。

### R-5 Opt-out
系统 SHALL 支持 `UPUP_TELEMETRY=off` 关闭。

## Scenarios

### S-1 LangSmith trace
- **GIVEN** `LANGSMITH_API_KEY` 已设置
- **WHEN** agent 跑完一轮
- **THEN** trace SHALL 出现在 LangSmith project
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/tools-registry/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/tools-registry/spec.md
- Lines: 1-33
- SHA256: 8737acdff1dd5efe3492b5e8f74026772de31706a0ac3a3b922da85bd1d1c7a1

```md
# tools-registry

## Purpose
统一管理所有工具的注册、调度、description 注入、rendering。每个工具 SHALL 是一等公民，registry 决定哪些工具暴露给 LLM。

## Requirements

### R-1 Tool interface
系统 SHALL 定义统一 `Tool` 接口：name、description、schema、execute(args, ctx) → result。LLM SHALL 只能调用 registry 暴露的工具。

### R-2 Conditional registration
系统 SHALL 根据环境变量（如 `FINANCIAL_DATASETS_API_KEY`、`EXASEARCH_API_KEY`、`TAVILY_API_KEY`、`LANGSMITH_API_KEY`）决定工具是否注册。

### R-3 Description injection
系统 SHALL 在 system prompt 中按 category 注入工具 description，LLM SHALL 看到当前可用的全部工具列表。

### R-4 Result rendering
系统 SHALL 为每个工具提供 renderer，UI SHALL 通过统一接口 `renderToolResult` 渲染。

### R-5 Per-tool metrics
系统 SHALL 记录每个工具的调用次数、耗时、错误率，暴露给 telemetry。

## Scenarios

### S-1 Missing API key
- **GIVEN** `FINANCIAL_DATASETS_API_KEY` 未设置
- **WHEN** CLI 启动
- **THEN** `financial_search` 工具 SHALL 不出现在 LLM 可用列表中

### S-2 Tool failure
- **GIVEN** 工具执行抛异常
- **WHEN** agent 收到 tool_end 事件
- **THEN** scratchpad SHALL 写入错误摘要，agent SHALL 可以选择重试或换工具
```

## openspec/changes/modularize-src-into-bun-workspaces/specs/tui-renderer/spec.md

- Source: openspec/changes/modularize-src-into-bun-workspaces/specs/tui-renderer/spec.md
- Lines: 1-28
- SHA256: c58cf154d96fdaf2ecab1b12b88ec1505adadc92f2cd9f13adc69e02b29ee77c

```md
# tui-renderer

## Purpose
提供基于 pi-tui 的终端渲染层：组件、keybindings、overlays、状态管理。所有 CLI 交互 SHALL 走 `@upup/tui-renderer`。

## Requirements

### R-1 Component model
系统 SHALL 提供声明式组件：Container、Text、Spacer、Box、ScrollableList、Input、Select、Status、Spinner、Markdown。

### R-2 Keybinding system
系统 SHALL 支持全局 + 局部 keybinding，配置由 `@upup/keybindings` 提供。

### R-3 Render throttling
系统 SHALL 节流 render 请求（30fps），关键事件 SHALL 强制 render。

### R-4 Overlay/modal
系统 SHALL 支持 overlays（确认、选择、文件树）。

### R-5 Theme
系统 SHALL 支持多主题切换，主题色由 `@upup/index-app` 注入。

## Scenarios

### S-1 Multi-line input
- **GIVEN** 用户粘贴多行文本
- **WHEN** 在 Input 组件中输入
- **THEN** SHALL 正确处理 paste events 并保留换行
```

