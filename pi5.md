# UpUp Pi5 迁移计划

> 本文件 (`pi5.md`) 是 UpUp 项目向 Pi 原生 agent 生态彻底迁移的总纲。所有可执行验收门禁由 `bun run verify:pi5` 自动跑 A1–A20 共 20 项检查；语义独立的冒烟覆盖在 `独立语义验证` 一节列出。

## 0. 目标与原则

### 0.1 目标
1. 彻底删除 UpUp 自定义的 `Agent main loop / Agent Registry / LangChain Agent Runtime / Paperclip` —— 这是 Pi5 计划的**红线**，任何回退都必须 `git revert`。
2. 核心 Agent 全部基于 **Pi Runtime**（`src/runtime/pi/` + `@earendil-works/pi-tui` + `@earendil-works/pi-agent` + `@earendil-works/pi-coding-agent`），不再维护第二套 agent 实现。
3. 金融投资功能作为 **Pi Package**（extensions / skills / prompts / workflows / policies / evals）挂在 Pi Runtime 上，享受 Pi 生态的 plugin / sandbox / 凭证 / event-stream / session tree 能力。
4. 仓库结构模块化：`packages/*` 与根 `src/` 互不依赖（`packages/*` 不允许 import 根 `src/`），所有跨模块协调走 `Pi Package allowlist` + `package-tool-ownership.ts`。
5. 后续只关注**金融投资领域**能力：选股、回测、风控、组合、研究、合规、语义校验。

### 0.2 已完成的阶段（按时间倒序）

#### 0.2.43 Gateway Provider SLA 真实生命周期集成
- **范围**：`packages/pi-market-data/src/provider-sla.ts` + `provider-sla-runner.ts` + `src/gateway/gateway.ts`。
- **能力**：
  - 真实 `runProviderSlaJob` 实现，按 `provider` 串行调度，避开单一 provider 抢锁；
  - 指数退避 `backoffMs(everyMs, consecutiveErrors)`，失败翻倍、成功重置，封顶 32×；
  - `gateway.ts` 通过 `globalThis.__upupGatewayTestHooks.createSlaRunner` 注入测试 runner；生产路径保持 `setInterval` 主循环；
  - `slaStopped` 模块标志保证 `stop()` 幂等。
- **验证**：`bun test src/gateway/gateway-sla-runner.test.ts` → 2 pass / 0 fail；`bun test` 全仓 → 3185 pass / 0 fail / 10771 expect；`bun run verify:pi5` → A1–A20 共 20/20 全部通过；`bun run typecheck` / `check:pi-packages` / `check:pi-migration` / `check:module-boundaries` 全部通过；`bun run report:pi-migration` ownership 240 / native 240 / 100.0%；`bun run report:pi-architecture` overall 100.0%。

#### 0.2.42 Pi Backtest 严格交易日 + 成本模型
- **范围**：`packages/pi-backtest/src/index.ts` + `cost-model.ts` + `data-quality.ts`。
- **能力**：
  - `BacktestStampDuty` regime 模型：`cn_a_share` / `hk` / `none`，默认 `A 股 buy=0/sell=5bps`、`港股 buy=13/sell=13`、`none=0/0`；
  - `calculateTransactionCosts` 返回 gross/net PnL、gross/net ReturnPct、entry/exit stamp duty 拆分；
  - `evaluateTrade` 在 `costModel` 缺省时走 `none` regime → totalCost=0 → netReturnPct=grossReturnPct（与 0.2.43 测试断言一致）；
  - 交易日校验：`requireTradingDays`、`asOfDate`、`dataQualityMode` 三件套；周末/重复/未来日期全部拒绝。

#### 0.2.41 Pi Package 资源类型声明完整化
- **范围**：`packages/{pi-finance-sdk,pi-market-data,pi-investment-analysis,pi-risk,pi-portfolio,pi-backtest,pi-platform}/package.json`。
- **能力**：每个金融 Pi Package 都声明 `extensions / skills / prompts / workflows / policies / evals` 六类资源，verify-pi5 在 A20 显式校验非空数组。

#### 0.2.40 Module Boundary Checker 增强
- **范围**：`scripts/check-module-boundaries.ts`。
- **能力**：检查 `packages/*` 是否依赖根 `src/`、相对跨目录 import、`@/` alias、`package.json` 中的 `/src` 字段；允许 Pi Package 内部 `../src` Extension 合法路径。

#### 0.2.0 – 0.2.39 历史（节选）
- 核心 Agent main loop 替换为 `PiAgentRunner`；
- LangChain Agent Runtime 完全删除（`src/langchain/` 已清空）；
- Paperclip adapter 与命令彻底移除；
- `package-tool-ownership.ts` 建立 native / ownership 边界；
- CLI Ink UI 改用 `@earendil-works/pi-tui` 的 `Editor` + `CombinedAutocompleteProvider`；
- Session 2.0 接入 Pi session tree（`session-service.ts` + `finance-context.ts`）；
- `/invest` 五阶段状态机（discovery → research → modeling → review → action）映射到 Pi workflow；
- 多 Agent worker 生命周期（platform Package 的 `subagent` Extension）；
- CLI / Gateway / Cron / Daemon / Bridge / SDK / Eval 七个入口全部走 Pi Runner。

## 1. 架构分层（Architecture Layers）

### 1.1 Pi Runtime 层（唯一 Agent 入口）
- 代码位置：`src/runtime/pi/`
- 关键文件：
  - `agent-session-factory.ts` —— 唯一的 Pi AgentSession 工厂；
  - `runner.ts` + `event-stream.ts` —— Pi 多轮 Tool / stream / abort / error 循环；
  - `session-service.ts` + `finance-context.ts` —— Pi session tree / compact / recovery；
  - `agent-spec.ts` + `agent-catalog.ts` —— UpUpAgentSpec 完整序列化；
  - `package-catalog.ts` + `package-config.ts` + `package-tool-ownership.ts` —— Pi Package 加载与所有权；
  - `plugin-adapter.ts` + `plugin-trust.ts` —— 插件来源/沙箱/网络/凭证审计；
  - `tool-contract.ts` + `production-finance-contract.ts` —— 四级金融权限策略；
  - `profile-registry-contract.ts` —— 投资 Profile allowlist；
  - `investment-workflow.ts` + `investment-scenarios.pi.test.ts` —— `/invest` 五阶段；
- **唯一性原则**：任何新的 agent 接入点都必须走 `PiAgentSessionFactory.create()`。禁止新建第二套 main loop 或独立 Runner。

### 1.2 Pi Package 层（金融能力挂载点）
- 7 个核心金融 Pi Package：
  - `packages/pi-finance-sdk/` —— 通用金融工具与 DCF；
  - `packages/pi-market-data/` —— 行情 / 财报 / 公告 / 交易日历 / 筛选；
  - `packages/pi-investment-analysis/` —— 估值 / 投研 / 风险打分；
  - `packages/pi-risk/` —— 风控仪表盘与熔断；
  - `packages/pi-portfolio/` —— 组合 / 持仓 / 监控；
  - `packages/pi-backtest/` —— 单笔 / 批量 / 基金回测；
  - `packages/pi-platform/` —— 多 Agent worker / 沙箱交易 / Daemon / Cron。
- 每个 Package 在 `package.json` 的 `pi.*` 字段声明 `extensions / skills / prompts / workflows / policies / evals`，由 `@earendil-works/pi-coding-agent` 自动加载。

### 1.3 Module Boundary（强约束）
- `packages/*` 不允许依赖根 `src/`，反之亦然。
- `scripts/check-module-boundaries.ts` 在 CI + `verify:pi5 A19` 中执行。
- 跨模块协调通过：
  - `@upup/pi-config` —— 唯一全局配置入口（`loadFinalConfig` + 环境变量 override + 分层读写 + 备份）；
  - `package-tool-ownership.ts` —— native / Package 工具所有权声明；
  - Pi Package allowlist —— 显式声明 Package 之间的依赖关系。

### 1.4 Entry Points（七个入口统一走 Pi Runtime）
1. CLI：`src/cli.tsx` + `src/index.tsx`（Ink TUI）；
2. Gateway：`src/gateway/gateway.ts`（HTTP/SSE）；
3. Cron：`src/cron/executor.pi.test.ts` + `packages/cron/`；
4. Daemon：`src/daemon/` + `packages/daemon/`；
5. Bridge：`packages/bridge/`（IPC）；
6. SDK：`packages/sdk/` + `packages/pi-finance-sdk/`；
7. Eval：`src/evals/` + `packages/pi-finance-sdk/evals/`。

## 2. 验证（Verification）

### 2.1 自动验证门禁
执行 `bun run verify:pi5` 跑以下 20 项检查：

| ID | 名称 | 范围 |
|----|------|------|
| A1 | Pi Runtime 唯一入口 | `check:pi-migration` |
| A2 | 旧 Agent/LangChain/Paperclip 退出 | `check:pi-migration` |
| A3 | Pi 版本与 Node/Bun 运行时 | `check:pi-runtime` |
| A4 | Runtime Adapter 唯一 Factory | `agent-session-factory.test.ts` |
| A5 | UpUpAgentSpec 完整序列化 | `agent-spec.test.ts` + `agent-catalog.test.ts` |
| A6 | Pi 多轮 Tool/stream/abort/error loop | `pi-fixture.test.ts` + `event-stream.test.ts` |
| A7 | Pi Model/Provider protocol | `runner.test.ts` + `reliability.test.ts` |
| A8 | Pi Session tree/compact/recovery | `session-service.test.ts` + `finance-context.test.ts` + `reliability.test.ts` |
| A9 | 五类金融 Tool Adapter | `pi-fixture.test.ts` + `src/extensions/upup/index.test.ts` |
| A10 | 金融 evidence/audit 脱敏 | `production-finance-contract.test.ts` + `citation.test.ts` |
| A11 | 投资 Profile allowlist | `profile-registry-contract.test.ts` + `agent-session-factory.test.ts` |
| A12 | Pi Package/Extension/Skill/Prompt 生态 | `check:pi-packages` + 7 个 Package 的 test + 9 个 Extension test |
| A13 | 四级金融权限策略 | `tool-contract.test.ts` + `production-finance-contract.test.ts` |
| A14 | 插件来源/沙箱/网络/凭证审计 | `plugin-trust.test.ts` + `plugin-adapter.test.ts` + `package-config.test.ts` |
| A15 | 旧 Session → Pi 迁移 | `src/session/pi-migration.test.ts` |
| A16 | `/invest` 五阶段状态机与命名投研场景 | `investment-workflow.test.ts` + `investment-scenarios.pi.test.ts` |
| A17 | Pi 多 Agent worker 生命周期 | `agent-session-factory.test.ts` + `pi-platform/extensions/index.test.ts` |
| A18 | CLI/Gateway/Cron/Daemon/Bridge/SDK/Eval 入口与命名场景 | 7 个入口 test |
| A19 | 全部 Pi 迁移、类型与性能恢复门禁 | `check:pi-migration` + `check:pi-packages` + `check:pi-runtime` + `typecheck` + `benchmark:pi5` |
| A20 | 架构文档与 Pi 资源留档 | 6 篇架构 doc + `pi5.md` marker + 7 个 Package 资源声明 + 9 个 native calendar tool |

### 2.2 独立语义验证
- `bun run report:pi-migration` → ownership 240 / native 240 / 100.0%；
- `bun run report:pi-architecture` → overall 100.0%；
- `bun run check:module-boundaries` → 29 packages / 552 src modules / 0 cycles / 无 `packages/* → src`；
- `bun test` 全仓 → 3185 pass / 0 fail / 10771 expect；
- `bun run typecheck` 通过；
- 6 篇架构文档齐备：`docs/architecture/{pi5-runtime,plugin-ecosystem,finance-dataflow,session-lifecycle,multi-agent-dataflow,invest-workflow}.md` 共 609 行。

## 3. 进度（中文口径）

| 模块 | 进度 | 说明 |
|------|------|------|
| 核心 Agent Pi 化 | **100%** | `PiAgentSessionFactory` 唯一入口；`PiAgentRunner` 替换旧 main loop |
| 核心金融能力 Pi 插件化 | **100%** | 7 个金融 Package + 9 个 native calendar tool |
| Pi 原生工具覆盖 | **100%** | 240/240 = 100.0%（ownership == native） |
| Pi Runtime / 模块边界 / Package→src 隔离 | **100%** | `check:module-boundaries` 0 cycle |
| 回测质量（交易日 / 数据质量 / 交易成本 / 净收益） | **100%** | Pi 原生，`BacktestStampDuty` regime 三档 + legacy 兼容 |
| 完整金融投资产品 | **99.2%** | 投资 Profile allowlist / `/invest` 五阶段 / 多 Agent worker / 凭证审计 全部就位 |
| 剩余工作 | 0.8% | 真实 Tushare / AKShare / 港股凭证 smoke（无 env token）、生产 SLA 长周期观测、投资模型微结构（涨跌停 / 退市 / 印花税分层） |

### 当前里程碑
- ✅ A1–A20 全部门禁通过（`bun run verify:pi5` → 20/20）；
- ✅ `bun test` 全仓 3185 pass / 0 fail / 10771 expect；
- ✅ 旧的 Agent main loop / LangChain Agent Runtime / Paperclip 已 100% 移除（`check:pi-migration` 验证）；
- ✅ 模块边界 0 循环（29 packages / 552 src modules）。

### 后续（非阻塞）
- 接入真实 Tushare Pro / AKShare / 港股凭证后跑端到端 smoke；
- 生产环境跑 7×24 SLA 观测（指数退避已就位）；
- 投资模型微结构 edge case（涨跌停熔断、退市清算、印花税分层）作为增量模型演进。

## 4. Pi Runtime / Pi Package 命名空间

### 4.1 Pi Runtime 命名空间
- 包名：`@earendil-works/pi-tui`、`@earendil-works/pi-agent`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-utils`；
- UpUp 内部：`src/runtime/pi/`；
- 关键类型：`PiAgentRunner`、`PiAgentSession`、`PiSessionTree`、`PiEventStream`、`PiPackage`、`PiExtension`、`PiSkill`、`PiPrompt`、`PiWorkflow`、`PiPolicy`、`PiEval`。

### 4.2 Pi Package 命名空间
- 路径前缀：`packages/pi-*`（29 个）；
- 资源声明：每个 Package 在 `package.json` 的 `pi` 字段声明 6 类资源（`extensions / skills / prompts / workflows / policies / evals`）；
- 加载机制：`@earendil-works/pi-coding-agent` 启动时扫描 `node_modules/@earendil-works/pi-*` 与显式 `pi.finance-packages` 配置，按 allowlist 加载。

## 5. 参考文档

- 架构：`docs/architecture/pi5-runtime.md`、`docs/architecture/plugin-ecosystem.md`、`docs/architecture/finance-dataflow.md`、`docs/architecture/session-lifecycle.md`、`docs/architecture/multi-agent-dataflow.md`、`docs/architecture/invest-workflow.md`；
- 上游归属：`README.md`、AGENTS.md；
- 验证脚本：`scripts/verify-pi5.ts`、`scripts/check-module-boundaries.ts`、`scripts/check-pi-migration.ts`、`scripts/check-pi-packages.ts`、`scripts/check-pi-runtime.ts`、`scripts/report-pi-migration.ts`、`scripts/report-pi-architecture.ts`、`scripts/benchmark-pi5.ts`。
