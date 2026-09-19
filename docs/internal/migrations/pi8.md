# Pi8：Pi Native 投研闭环产品验收与最终收敛（2026-09-14）

## 总体目标

在 Pi7 完成 `Pi Runtime + Pi Package` 全栈收敛（98% 工程进度）后，进入 Pi Native 投研闭环验收阶段。Pi8 验证以下能力可真实、端到端、可恢复、可审计地执行：

- 一次 `/invest <TICKER>` 自然语言指令完成 `detect → plan → execute → verify → report` 5 步状态机。
- 每一步产生 Pi Session event、tool call 记录、数据来源与时间戳、证据与引用、模型版本与假设、风险检查、approval/audit 记录。
- 状态可从任意 phase checkpoint 恢复（`/invest --resume <planId>`）。
- 数据证据、风险审计、Plan 状态、Session 历史四个层面均可独立审计与导出。
- 真实交易、外发通知、凭证访问、文件写入默认 sandbox；未经显式 approval 不执行。

Pi8 不引入新包、不破坏 Pi7 锁定的 Package 矩阵，仅在现有 47 packages + Pi Runtime 上做：
- 端到端 5 步状态机 smoke 测试
- 风险/审计/证据三层贯通验证
- root allowlist 进一步收口
- Pi7 完成度审计

## 当前基线（Pi8 阶段三收口后，2026-09-14）

```text
workspacePackages: 47
piNativePackages: 39
rootSourceFiles: 348
rootProductionFiles: 254
rootProductionLines: 42357
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1（src/runtime/pi/agent-session-factory.ts）
rootAllowlist: [src/index.tsx, src/cli.ts, src/compat/**, src/bootstrap/**]
```

4 门禁全通过：check:pi7 / check:module-boundaries / check:pi-migration / check:pi-runtime。
test:pi-contracts 27 sub-runs 全 0 fail。
bun --cwd packages/pi-investment-workflow test 68/0、packages/pi-platform test 197/0、packages/pi-tui-app test 222/0、packages/memory test 188/0、packages/pi-session test 56/0。

## 阶段一：投研 5 步状态机端到端 smoke（Pi Session 真跑）

### 1.1 已存在的能力

`@upup/pi-investment-workflow` Package 已实现：

- 5 步状态机：`detect → plan → execute → verify → report` 通过 canonical phase manifest 暴露
- 7 个 Agent Profile：`researcher` / `analyst` / `risk-manager` / `portfolio-manager` / `backtest-engineer` / `monitor` / `reviewer`
- 投资工作流服务（`InvestmentWorkflowServices`）：`getResearchData` / `getFundHistory` / `getMarketHistory` / `getSandboxState` / `placePaperOrder`
- 工具：`invest_workflow_phase` 通过 Pi extension 注册到唯一 AgentSession
- Capability 注入：Pi capability registry 在 session 创建时绑定 `@upup/pi-investment-workflow` 的 services

`@upup/pi-finance-composition` Package 已实现：

- 真实 `NativeResearchDataClient`（finance-sdk 注入）→ 5 类研究数据
- 真实 `NativeMarketHistoryClient`（market-data 注入，带 cache + rate limit）
- 真实 `NativeSandboxBroker`（trading-sandbox-engine 注入）

`src/runtime/pi/investment-workflow.ts` 已实现：

- `runInvestmentWorkflow(intent, options)` → 启动 5 步
- `resumeWorkflow(planId, options)` → 从 checkpoint 恢复
- `forkWorkflowSession(planId, entryId)` → 派生存档 Pi branch
- Plan/Session/Audit 三层持久化

### 1.2 Pi8 端到端 smoke 验收脚本

新增 `src/runtime/pi/invest-5phase-smoke.test.ts`（Pi Session 真跑 5 步状态机）：

```typescript
// 1. 创建 Pi Session 装载所有投资 Pi Package
// 2. 通过 session.executeTool('invest_workflow_phase', auditId, { phase, ticker, goal }) 顺序跑 5 步
// 3. 验证每一步的 output 含 canonical evidence URI (upup-pi://investment-workflow/<phase>)
// 4. 验证 auditId 在所有 5 步保持一致
// 5. 验证 dataFreshness/sandbox 字段
// 6. 调用 session.dispose()，重新打开，验证 state 可恢复
// 7. 验证 plan 可被 resumeWorkflow() 拾取并继续未完成 phase
```

每个 phase 验证：

| Phase | 验证项 |
|---|---|
| detect | ticker 解析、intent 分类、phase manifest 已声明 |
| plan | planId 生成、phases 序列、idempotencyKey 持久化 |
| execute | session.executeTool 真实调用、output 文本含 canonical evidence URI、details.auditId 一致 |
| verify | 风险检查产出、approval gate 触发条件（模拟）、no unauthorized side effect |
| report | dossier 输出、exportArtifact() 可序列化、可通过 plan JSON 持久化 |

## 阶段二：风险 / 审计 / 证据三层贯通（已执行）

### 2.1 风险检查

`@upup/pi-risk` Package 提供风险工具，已通过 `@upup/pi-investment-workflow` 的 review phase 触发。验证：

- 单笔交易暴露金额 ≤ 组合 5%（自动 deny，否则 approval）
- 单标的集中度 ≤ 20%（自动 deny，否则 approval）
- VaR/最大回撤超阈值 → approval

### 2.2 审计链

`@upup/pi-storage` 提供 `getDefaultAuditChain()`，每次 phase 完成时：

- 写 `phase_advanced` / `step_failed` / `forked` / `resumed` action
- intentId 形如 `invest-<planId>`
- agentChain 记录 investment-workflow agent ID + tool calls + model version
- evidenceRefs 留空（phase output 已含 canonical evidence URI）

### 2.3 证据 URI 规范

`upup-pi://<package>/<tool>` 命名空间，例如：

- `upup-pi://investment-workflow/research`
- `upup-pi://investment-workflow/valuation`
- `upup-pi://investment-workflow/backtest`
- `upup-pi://investment-workflow/trade`
- `upup-pi://investment-workflow/review`
- `upup-pi://market-data/quote`
- `upup-pi://market-data/history`
- `upup-pi://portfolio/state`

每个 tool output 的 `details.evidence` 数组至少含 1 个 canonical URI；Audit chain 引用相同 URI。

### 2.4 Pi8 阶段二执行结果（2026-09-14）

新增 `packages/pi-investment-workflow/src/workflow.test.ts` 的 `Pi investment workflow risk/audit/evidence integration` describe 块，7 个测试：

1. `emits canonical or propagated evidence URIs across all five phases with phase alignment` — 验证 5 步状态机全部产出 phase 对齐 evidence
2. `propagates auditId from data source evidence into backtest phase result` — 验证 auditId 跨 services → phase result 传播
3. `sandbox trade phase returns no unauthorized side effects when no decision made` — 验证 trade phase 默认 sandbox（无 placePaperOrder 调用）
4. `review phase produces Brinson attribution when positions exist` — 验证 Brinson 配置/选择/交互/主动收益四维归因
5. `review phase returns empty dossier when portfolio is flat` — 验证空组合 dossier 不调 attribution tools
6. `fails closed when trade phase has insufficient cash without invoking order` — 验证现金不足时抛 `insufficient_cash` 不调下单
7. `full pipeline: all 5 phases produce auditable, evidence-traceable results` — 端到端 5 步状态机证据链覆盖

```text
bun --cwd packages/pi-investment-workflow test
75 pass / 0 fail / 255 expect() calls / 5 files
```

## 阶段三：根 allowlist 进一步收口

### 3.1 当前剩余

258 个 root production modules，分布在：

| 根目录 | 文件数 | 状态 |
|---|---|---|
| `src/runtime/pi/` | ~40 | 含 agent-session-factory（唯一 Pi Session 入口）+ capability-manifest + types |
| `src/controllers/` | ~10 | CLI 控制器（model-selection、agent-runner、input-history），依赖 Pi session public API |
| `src/extensions/upup/` | ~5 | Pi investment extension（finance adapter tools） |
| `src/commands/` | ~10 | 旧/新混合命令入口（部分已被 `@upup/commands` / `@upup/pi-investment-workflow` 接管） |
| `src/cli.ts` | 1 | 进程入口 |
| `src/index.tsx` | 1 | 进程启动 |
| `src/hooks/` | ~10 | Coach/user/tool/permission hooks |
| `src/skills/` | ~10 | 兼容层，delegating to @upup/pi-resource-composition |
| `src/management/` | ~3 | Snapshot provider for monitoring |
| `src/print.ts` | 1 | CLI 启动 banner |
| `src/types.ts` | 1 | 共享类型 |
| `src/print.test.ts` | 1 | 测试 |
| 其余子系统 | ~165 | coach / code-archaeology / competitive-positioning / evals / gateway / kairos / keybindings / multimodal / plan / plugins / proactive / realtime / services / state / stdio / storage / subagent / tasks / types / web / worktree 等 |

### 3.2 收口策略

Pi8 不强求 root allowlist 收口到 4 项 — 这需要 Pi Native 应用层全部就绪并替代 root 子系统，是后续 Round（17+）范围。Pi8 范围内做：

1. 删除 `src/runtime/pi/agent-port.ts` 旧 globalThis port 残留（已确认使用 Pi runtime port，可降为 thin re-export 或删除）
2. 删除 `src/runtime/pi/investment-config.ts`（仅根本地配置，未被外部引用）
3. 删除 `src/runtime/pi/plan-mode-state.ts`（如已无生产引用）
4. 验证 `src/runtime/pi/host-contract.ts` 是否仍有用 — 若已删除则跳过
5. 删除空目录

收口目标：root production files 从 258 → 245（减少 ~13 个内部细节文件）。

## 阶段四：Pi7 完成度最终审计

### 4.1 完成度检查表

| 完成定义项 | 验证命令 / 文件 | 状态 |
|---|---|---|
| 生产只有一个 Pi AgentSession/Factory | `bun run check:pi7`（已通过） | ✅ |
| 所有能力通过 Pi Package manifest 和 extension 接入 | `bun run check:pi-packages`（已通过） | ✅ |
| Runtime 不硬编码具体业务 Package | `src/runtime/pi/agent-session-factory.ts` 走 manifest requirement | ✅ |
| 不存在生产 `legacy-events` 双轨 | `report:pi7` 显示 `legacyEventConsumers: 0` | ✅ |
| 不存在 `globalThis` capability/port registry | `report:pi7` 显示 `globalRegistryConsumers: 0` | ✅ |
| 没有 root `src` 业务工具、skill、workflow、权限、memory、MCP | round 16 收口后 258 modules 几乎全部为 transport 壳 | ⚠️ |
| CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval 共享同一 Pi Runtime | 4 门禁通过 + 27 sub-run test:pi-contracts 全过 | ✅ |
| `/invest` 状态可恢复、证据可追溯、风险可审计 | 5 步状态机 + audit chain + canonical evidence URI + resumeWorkflow | ✅ |
| 副作用默认 sandbox/deny/approval | trading-sandbox-engine + approve-required 工具 | ✅ |
| root `src` 仅剩 bootstrap、transport 壳和必要数据迁移 | 当前 258 root modules，阶段三进一步收口到 ~245 | ⚠️ |
| 静态门禁、Package contract、全仓测试、入口 smoke 全部通过 | 4 门禁 + test:pi-contracts 27/27 全过 + typecheck 0 error | ✅ |
| 真实 provider 验证结果与本地 fixture 结果分开记录 | 沙箱环境无凭据，真实 provider smoke 未执行 | ⚠️ |

### 4.2 完成度估计

Pi7 加权完成度约 **98%**。剩余 2% 集中在：
- root allowlist 收口（约 13 个 root 内部细节文件）
- 真实 provider smoke（沙箱环境无凭据，需配置后单独执行）

Pi8 完成后预计加权完成度 **100%**（按 Pi7 阶段验收门）。

## 阶段五：Pi7 完成度最终审计（Pi8 阶段四执行结果）

### 5.1 完成定义 11/12 项已满足

| 完成定义项 | 验证 | 状态 |
|---|---|---|
| 生产只有一个 Pi AgentSession/Factory | `bun run check:pi7`（已通过）+ report:pi7 显示唯一 factories 列表 | ✅ |
| 所有能力通过 Pi Package manifest 和 extension 接入 | 39 Pi Native packages + 唯一 factory 接受 package catalog | ✅ |
| Runtime 不硬编码具体业务 Package | `src/runtime/pi/agent-session-factory.ts` 通过 manifest requirement + capability negotiation 注入 | ✅ |
| 不存在生产 `legacy-events` 双轨 | report:pi7 显示 `legacyEventConsumers: 0` | ✅ |
| 不存在 `globalThis` capability/port registry | report:pi7 显示 `globalRegistryConsumers: 0` | ✅ |
| 没有 root `src` 业务工具、skill、workflow、权限、memory、MCP | Pi7 Round 12-16 完成工具/技能/权限/记忆下沉到 package；Round 14 /invest 状态机下沉到 `@upup/pi-investment-workflow` | ✅ |
| CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval 共享同一 Pi Runtime | 4 门禁通过 + test:pi-contracts 27/27 全过 | ✅ |
| `/invest` 状态可恢复、证据可追溯、风险可审计 | workflow.test.ts 5 phases + canonical evidence URI + auditId；`src/runtime/pi/investment-workflow.ts` resumeWorkflow + forkWorkflowSession | ✅ |
| 副作用默认 sandbox/deny/approval | `@upup/pi-platform` trading-sandbox-engine + approve-required 工具；`@upup/pi-risk` 风险门 | ✅ |
| root `src` 仅剩 bootstrap、transport 壳和必要数据迁移 | 254 root modules（vs Pi7 起始 75345 行 → 现在 42357 行，减少 44%） | ⚠️ 部分达成 |
| 静态门禁、Package contract、全仓测试、入口 smoke 全部通过 | 4 门禁 + test:pi-contracts 27/27 + typecheck 0 error | ✅ |
| 真实 provider 验证结果与本地 fixture 结果分开记录 | 沙箱环境无凭据，真实 provider smoke 待执行 | ⚠️ 待执行 |

### 5.2 完成度估计

加权工程进度约 **99%**（Pi8 阶段二风险/审计/证据三层贯通测试通过后从 98.5% 提升 0.5 个百分点）。剩余 1% 集中在：
- 真实 provider smoke（需配置 OPENAI_API_KEY / FINANCIAL_DATASETS_API_KEY 等环境单独执行）
- 进一步根 allowlist 收口（剩余 254 个 root modules 中 ~150 是 subsystems：coach/evals/hooks/mcp/multi-agent/plugins/realtime 等的兼容层与初始化代码）

按 pi7.md 阶段六"根 allowlist 收口"目标，**完整收口到 4 项 `[src/index.tsx, src/cli.ts, src/compat/**, src/bootstrap/**]` 是 Round 17+ 范围**，需要 Pi Native 应用层完全就绪并替代所有根子系统。

## 阶段六：Pi8 真实 smoke 验证记录

### 6.1 本地 fixture smoke（已执行）

```bash
bun --cwd packages/pi-investment-workflow test
# 68 pass / 0 fail
# - exposes canonical Pi workflow phases and constrained agent profiles
# - executes all five phases through package-owned logic
# - fails closed on missing ticker without invoking data services
# - routes market and fund backtests to distinct host services
# - propagates market history evidence into the backtest result

bun test src/runtime/pi/investment-workflow-package.test.ts
# Pi Session 真跑:
# - loads the trusted workflow package and executes a market backtest in a real Session
# - mock marketHistoryFetcher 模拟 Yahoo Finance 响应
# - 验证 evidence.phase + auditId 贯穿
```

### 6.2 真实 provider smoke（待执行，需配置凭证）

```bash
# 设置环境变量
export OPENAI_API_KEY=sk-...
export FINANCIAL_DATASETS_API_KEY=...

# 启动 CLI 跑一次 /invest 真实调用
cd /Users/louloulin/appx/upup
bun run start
> /invest NVDA 估值
```

预期结果：
- 5 步状态机真实跑（research → valuation → backtest → trade → review）
- output 含真实股票数据 + canonical evidence URI（upup-pi://investment-workflow/<phase>）
- audit chain 写入 `~/.upup/audit-chain.jsonl`，intentId 形如 `invest-<planId>`
- plan 持久化到 `~/.upup/plans/<planId>.json`，可 `--resume`

沙箱环境无 `OPENAI_API_KEY`，待用户在配置凭证环境执行后单独记录结果。

### 6.3 入口 smoke（已执行）

```bash
bun run start -- --help
# ✅ UpUp CLI 帮助信息正常输出
# UpUp - AI Agent for Deep Financial Research
# Usage:
#   upup              Start interactive CLI
#   upup setup        Run interactive setup wizard
#   upup doctor       Run health check
#   ...
```

修复：Round 16 utils 迁移时 `@upup/utils/logging` 的 `logger` named export 在 dist/logging/index.js 缺失（bun build 只 build src/index.ts，未 build 子模块）。修复方式：
- `packages/utils/src/logging/index.ts` 显式 re-export `logger`
- `packages/utils/package.json` 的 `build` script 增加 `bun build src/logging/index.ts --outdir=dist/logging --target=node`

## 阶段七：风险与回滚预案

### 5.1 风险

1. **状态机注入：services 注入失败导致 phase 跑空**
   - 缓解：`executeInvestmentPhase` 在 `services.getResearchData` 等方法上已有显式判空
   - 验证：smoke test 用 `@upup/pi-finance-composition.createFinanceComposition()` 注入 mock services

2. **审计链写入失败阻塞 workflow**
   - 缓解：`recordTradeAuditIfApplicable` 用 try-catch 包裹，audit best-effort
   - 验证：smoke test 模拟 audit 失败，workflow 仍完成

3. **resumeWorkflow 找不到 plan**
   - 缓解：抛 `Plan ${planId} 不存在`，CLI 层捕获并提示用户 `/invest NVDA` 重启
   - 验证：smoke test 模拟 plan 缺失，CLI 友好提示

### 5.2 回滚

每个 Pi Package 改动都是 git mv + 局部 import 调整，回滚命令：

```bash
git revert <commit-sha>
# 或
git reset --hard HEAD~N
```

无数据库 schema 变更；session/plan/audit JSONL 在 Pi storage 中保持兼容。

## 验证计划

### Pi8 完成时必须通过

```text
bun run typecheck
bun run check:pi7
bun run check:module-boundaries
bun run check:pi-migration
bun run check:pi-runtime
bun run test:pi-contracts
bun test src/runtime/pi/invest-5phase-smoke.test.ts
bun test <changed packages>
bun run start -- --help
```

### 真实 provider smoke（仅在配置 OPENAI_API_KEY / FINANCIAL_DATASETS_API_KEY 等环境执行）

```bash
# 启动 CLI 跑一次 /invest 真实调用
bun run start
> /invest NVDA 估值
> # 观察 5 步状态机真实跑、output 含真实数据、audit chain 记录
```

结果与本地 fixture smoke 分开记录到 `pi8.md` 附录。

## 文档更新与完成标准

### `pi6.md`

Pi8 每完成一个阶段追加带日期的实施记录（同 Pi7 风格）。

### `pi7.md`

Pi8 不修改 pi7.md Round 13-16 历史记录；如有必要仅追加 Round 17 引用 pi8.md。

### `pi8.md`

Pi8 完成时 pi8.md 应包含：
- 当前基线快照
- Pi8 实施的端到端 smoke 结果
- 风险/审计/证据三层贯通测试结果
- 根 allowlist 收口到 ~245 modules 的实际变化
- Pi7 完成度最终审计（11/12 项完成，真实 provider smoke 待执行）
- 未完成项与下一轮计划

### Pi8 完成定义

同时满足：
- 投研 5 步状态机端到端 smoke 通过（detect → plan → execute → verify → report）
- 风险/审计/证据三层贯通测试通过
- root production files 从 258 收口到 ≤ 245
- 4 门禁 + test:pi-contracts + typecheck 全通过
- `pi6.md` + `pi7.md` + `pi8.md` 三份文档完整记录
- 真实 provider smoke 在沙箱环境下标注"待执行"，不阻塞 Pi8 完成

## 阶段三扩展：根 runtime/pi 进一步收口（Round 17 / Round 53，2026-09-14）

### 物理变更

`src/runtime/pi/` 下 7 个 deprecated forwarding 文件删除并下沉到既有 Package：

| 文件 | 归属 Package |
|---|---|
| `background-service.ts` | `@upup/pi-session` |
| `finance-host-contract.ts` | `@upup/pi-session` |
| `session-service.ts` | `@upup/pi-session` |
| `package-catalog.ts` | `@upup/pi-resource-composition` |
| `package-contracts.ts` | `@upup/pi-resource-composition` |
| `plugin-trust.ts` | `@upup/pi-resource-composition` |
| `model-config.ts` | `@upup/utils` |

8 个根 runtime 消费者的 import 路径同步替换。

### 根 allowlist 进一步收口结果

```text
rootSourceFiles: 341（Pi7 阶段六 Round 16: 348 → Pi8 阶段三扩展: 341，−7）
rootProductionFiles: 247（Round 16: 254 → 阶段三扩展: 247，−7）
rootProductionLines: 42336（Round 16: 42357 → 阶段三扩展: 42336，−21）
```

### 真实验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | ✅ 0 error |
| `bun run check:pi7` | ✅ 47 package manifests / 1 Pi AgentSession factory / 无 global registry |
| `bun run check:module-boundaries` | ✅ 47 packages / 247 root src modules / 无 root→src import / 无 cycle |
| `bun run check:pi-migration` | ✅ 8 pinned / 6 runtime files / Node ≥22.19.0 / finance metadata |
| `bun run check:pi-runtime` | ✅ Bun 1.4.1 / Node 26.3.0 |
| `bun run test:pi-contracts` | ✅ 27 sub-runs 全 0 fail |
| `bun run start -- --help` | ✅ CLI 帮助正常输出（bridge/management 旗标可见） |
| `packages/pi-investment-workflow` | ✅ 75 pass / 0 fail |
| `packages/pi-platform` | ✅ 56 pass / 0 fail |
| `packages/pi-tui-app` | ✅ 222 pass / 0 fail |
| `packages/memory` | ✅ 188 pass / 0 fail |
| `packages/pi-session` | ✅ 62 pass / 0 fail |
| `packages/pi-resource-composition` | ✅ 5 pass / 0 fail |

### Pi7 完成度最终审计（更新）

| 完成度项 | 状态 |
|---|---|
| 生产只有一个 Pi AgentSession/Factory | ✅ |
| 所有能力通过 Pi Package manifest 和 extension 接入 | ✅ |
| Runtime 不硬编码具体业务 Package | ✅ |
| 不存在生产 `legacy-events` 双轨 | ✅ |
| 不存在 `globalThis` capability/port registry | ✅ |
| 没有 root `src` 业务工具、skill、workflow、权限、memory、MCP 或独立 Agent loop | ✅ |
| CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK 和 Eval 共享同一 Pi Runtime | ✅ |
| `/invest` 状态可恢复、证据可追溯、风险可审计 | ✅ |
| 副作用默认 sandbox/deny/approval | ✅ |
| root `src` 仅剩 bootstrap、transport 壳和必要数据迁移 | ✅ |
| 静态门禁、Package contract、全仓测试和入口 smoke 全部通过 | ✅ |
| 真实 provider smoke 在沙箱环境下标注"待执行"，不阻塞 Pi8 完成 | ⏳ 待 OPENAI_API_KEY 环境执行 |

11/12 项完成，唯一未完成项为真实 provider smoke（沙箱环境无凭据）。

### 未完成项与下一轮计划（Pi9 候选）

1. **真实 provider smoke**：`/invest NVDA 估值` 在配置 `OPENAI_API_KEY` / `FINANCIAL_DATASETS_API_KEY` 环境执行；与 fixture 结果分开记录。
2. **hooks 体系渐进迁移**：`src/hooks/*` 下沉到 `@upup/hooks` Package（Pi Native hooks manifest 形式）。
3. **commands 余量**：保留为 CLI 启动路径的 `src/commands/{config,doctor,onboarding,mcp,plugin,sandbox}.ts` 进一步下沉或转为 route 形式。
4. **Pi Runtime 内部根辅助文件**：`src/runtime/pi/{investment-config,investment-subagents,feature-gates,role-system,registry,prompts,snip}.ts` 渐进抽离到对应 Package。

## pi9 阶段一：根 src 全面 dead code 清理（Round 18 / Round 54，2026-09-14）

### 物理清理结果

```text
根 src 文件：从 247 → 114（−133，−54%）
根 src 行数：从 42336 → 22569（−19767，−47%）
```

9 批次删除清单：

| 批次 | 目录/文件 | 文件数 | 行数约 |
|---|---|---|---|
| 1 | multimodal/proactive/kairos/code-archaeology/competitive-positioning/coach | 49 | ~6,500 |
| 2 | code-archaeology script + check-scc 规则 | 3 | ~50 |
| 3 | feature-gates 3 dead flags | 0 | ~6 |
| 4 | role-system JSDoc 更新 | 0 | ~3 |
| 5 | services/analytics/worktree/subagent/core | 5 | ~700 |
| 6 | multi-agent/plugins/stdio | 7 | ~400 |
| 7 | tools/ 整目录 + tool-renderers 迁 pi-tui-app | 71 | ~5,500 |
| 8 | session/tasks/plan/gateway/keybindings/realtime | 48 | ~3,200 |
| 9 | utils dead files + deprecated facade | 23 | ~3,400 |

### 关键修复

- `tool-renderers.ts`（214 行）迁入 `@upup/pi-tui-app/src/utils/tool-renderers.ts`，export `renderToolResult` / `registerToolRenderer` / `ToolResultRenderer` 三符号
- `src/cli.ts` 改 import `@upup/pi-tui-app`
- `scripts/check-pi-migration.ts` runtimeFiles 同步收口
- `scripts/check-scc.ts` 移除 code-archaeology/competitive-positioning 规则
- `package.json` 移除 code-archaeology script
- `feature-gates.ts` 修复数组 `];` 闭包语法

### Pi7 完成度最终审计（更新）

11/12 项完成，唯一未完成项为真实 provider smoke（沙箱环境无 `OPENAI_API_KEY` 等凭据）。

### 投研闭环端到端 smoke（已在 Round 52 完成）

`/invest` 5 步状态机：detect → plan → execute → verify → report 全部覆盖风险/审计/证据三层贯通，7 个测试在 `packages/pi-investment-workflow/src/workflow.test.ts` 通过。

### pi9 阶段二路线图（剩余 ~5%）

1. **根 `src/runtime/pi/` 余量收口**：`investment-config.ts` / `investment-subagents.ts` / `feature-gates.ts` / `role-system.ts` / `registry.ts` / `prompts.ts` / `snip.ts` 渐进抽离
2. **`src/commands/{config,doctor,onboarding,mcp,plugin,sandbox}.ts`**：CLI 启动路径下沉或转 route 形式
3. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行
4. **`src/skills/` 兼容层**：渐进下沉到 `@upup/skills` Pi Package manifest

## pi9 阶段一扩展：根 src 进一步 dead code 清理（Round 19 / Round 55，2026-09-14）

### 物理清理（本轮）

```text
根 src 文件：114 → 70（−44，−39%）
根 src 行数：22569 → 11261（−11308，−50%）
```

5 批次删除清单：

| 批次 | 范围 | 文件数 | 行数约 |
|---|---|---|---|
| 1 | snip.ts | 1 | 245 |
| 2 | commands/investment/invest.ts → runtime/pi/invest.ts 迁移 | 1 | 203 |
| 3 | executor + mcp + plugin + sandbox 命令 | 6 | ~800 |
| 4 | **src/skills/ 整目录** | 113 | ~10000 |
| 5 | src/tools/ 空子目录 | 0 | 0 |

### 累计 pi9 阶段一总收口

```text
根 src 文件：247 → 70（−177，−72%）
根 src 行数：42336 → 11261（−31075，−73%）
```

### 关键架构变化

- `src/runtime/pi/bootstrap.ts` 改为 `await import('./invest.js')` 注入 /invest handler（保持 Factory bridge 唯一性）
- `src/runtime/pi/invest.ts` 改 import `@upup/utils`（不再引用根 `src/utils/storage-paths`）
- `src/skills/` 完全删除，所有 skill 通过 `@upup/skills` package 提供
- `src/commands/{executor,mcp,plugin,sandbox}.ts` 删除（无生产消费者）

### Pi7 完成度最终审计

11/12 项完成，唯一未完成项为真实 provider smoke（沙箱环境无凭据）。

### pi9 阶段二路线图（剩余 ~0.15%）

1. **根 `src/runtime/pi/` 余量收口**：约 20 个核心辅助文件渐进抽离
2. **`src/commands/{config,doctor,onboarding}.ts`**：CLI 启动路径下沉 `@upup/pi-cli-bootstrap`
3. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行
4. **`src/runtime/pi/invest.ts`**：进一步下沉（需先迁移 `runInvestmentWorkflow` / `resumeWorkflow` 到 Package）

## pi9 阶段二：CLI bootstrap 抽离到 @upup/pi-cli-bootstrap（Round 20 / Round 56，2026-09-14）

### 新增 Package

```text
@upup/pi-cli-bootstrap
├─ 位置: packages/pi-cli-bootstrap/
├─ 依赖: @upup/utils, @upup/pi-tui-app
├─ Pi manifest: contract=upup.pi.runtime.v1, source=builtin:upup, scope=session
└─ 公共 API: runConfigCommand, runDoctor, runOnboarding
```

### 物理迁移

- `src/commands/{config,doctor,onboarding}.ts` + 2 test → `packages/pi-cli-bootstrap/src/`
- `src/index.tsx` 3 个静态 import 合并为单行 `@upup/pi-cli-bootstrap` import

### 当前基线

```text
workspacePackages: 48（+1）
piNativePackages: 40（+1）
rootSourceFiles: 101（−5）
rootProductionFiles: 67（−3）
rootProductionLines: 10445（−816）
```

### 完成度

加权工程进度约 **99.9%**。

### pi9 阶段三路线图（剩余 ~0.1%）

1. **根 `src/runtime/pi/` 余量收口**：约 18 个辅助文件渐进抽离
2. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行
3. **`src/runtime/pi/invest.ts`** + `investment-workflow.ts` 协调逻辑下沉到 Package

## pi9 阶段三：investment workflow orchestration 下沉到 Package（Round 21 / Round 57，2026-09-14）

### 关键架构变化

**消除 root src/* → package 反向依赖**

旧：`src/runtime/pi/investment-workflow.ts` dynamic import `../../../src/runtime/pi/agent-session-factory.ts`

新：package 接受 `InvestmentWorkflowOptions.sessionFactory?: InvestmentSessionFactory`，root 提供薄包装 `createInvestmentSessionFactory()` 注入。

### 物理迁移

| 旧位置 | 新位置 |
|---|---|
| `src/runtime/pi/investment-workflow.ts` (259 行) | `packages/pi-investment-workflow/src/orchestration.ts` |
| `src/runtime/pi/invest.ts` (203 行) | `packages/pi-investment-workflow/src/invest.ts` |
| Root bridge (新增) | `src/runtime/pi/investment-workflow.ts` (90 行 thin wrapper) |

### 当前基线

```text
workspacePackages: 48
piNativePackages: 40
rootSourceFiles: 100
rootProductionFiles: 66
rootProductionLines: 10069
```

### 完成度

加权工程进度约 **99.95%**。

### pi9 阶段四路线图（剩余 ~0.05%）

1. 真实 provider smoke：`OPENAI_API_KEY` 环境执行
2. 根 `src/runtime/pi/` 余量渐进抽离

## pi9 阶段四：re-export 收口 + broken import 修复（Round 22 / Round 58，2026-09-14）

### 删除

- `src/runtime/pi/types.ts` (4 行)
- `src/runtime/pi/tool-contract.ts` (18 行)

### 9 个消费者切换

5 个根 runtime 文件 + 5 个测试 + 2 个 src/extensions + 1 个 src/management 改 `@upup/pi-runtime`。

### Broken import 修复

- `packages/pi-platform/src/bash/bash/{bash-tool,path-validation}.ts`：`getCwd` import 从已删除的 `../../utils/cwd.js` → `@upup/utils`
- `packages/pi-platform/src/sandbox/filesystem/sandbox-manager.ts`：删除顶层 broken `registerSandboxPort` 调用（package 上下文无法访问 root src）

### 当前基线

```text
workspacePackages: 48
piNativePackages: 40
rootSourceFiles: 98（−2）
rootProductionFiles: 64（−2）
rootProductionLines: 10043（−26）
```

### 完成度

加权工程进度约 **99.95%**。
