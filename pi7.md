# UpUp Pi7：Pi Native 投资助手实施记录

> 实施日期：2026-09-14  
> 目标：将 UpUp 从“Pi 执行内核已迁移”推进到“Pi Runtime + Pi Package 唯一能力架构”。

## 1. 目标与决策

- 根 `src` 最终只保留启动、bootstrap、transport 壳和必要的数据迁移。
- Pi `AgentSession` 是唯一生产 Agent 执行内核；禁止第二个 Agent loop、tool registry 或 skill registry。
- 优先复用现有 workspace package；只有生命周期和边界真正独立时才新增 package。
- 激进移除旧执行路径；仅保留必要的 Session/config 数据迁移。
- Pi 依赖继续锁定 `0.84.3`。

## 2. 当前事实基线

以下数字由 `bun run report:pi7` 实时生成，不手工维护：

- 当前 workspace：40 个；其中 22 个已声明 Pi manifest。
- 根 `src`：737 个 TS/TSX 文件，其中 552 个生产文件，约 121,329 行生产代码。
- 唯一生产 `createAgentSession()` 调用点：`src/runtime/pi/agent-session-factory.ts`。
- 历史剩余债务：legacy event 消费者、TUI/入口 root 实现、Session/Memory/MCP/Bridge/Gateway/Daemon 等外围模块仍待物理迁移。

生成报告：

```text
bun run report:pi7
```

## 3. 已实现

### 3.1 统一 Pi Package manifest contract

`@upup/pi-runtime` 现在提供：

- `PiPackageManifestContract`；
- resource 清单：extensions、skills、prompts、workflows、policies、evals；
- capability requirement 与精确版本；
- trust：builtin/trusted/sandboxed、network、credentials、filesystem；
- lifecycle：runtime/session/process、initialize/reload/dispose；
- `validatePiPackageManifest()` 统一校验。

`src/runtime/pi/package-catalog.ts` 已接入该校验，manifest 资源、依赖和生命周期在注册时验证。

### 3.2 结构报告与门禁

- `scripts/report-pi7-architecture.ts`：输出 workspace、Pi manifest、root domain、行数和迁移债务事实。
- `scripts/check-pi7-architecture.ts`：检查唯一 Pi AgentSession 工厂、Pi domain manifest 和生产 global registry 禁止项。
- `package.json` 新增 `report:pi7` 与 `check:pi7`。

### 3.3 显式 runtime ports

- `@upup/pi-runtime` 提供显式 `registerPiRuntimePort`、`getPiRuntimePort`、`resetPiRuntimePorts`。
- `src/runtime/pi/agent-port.ts` 与 `packages/commands/src/agent-port.ts` 改为使用显式 runtime port contract。
- 生产代码不再写入或读取 `globalThis.__upupAgentPorts`。
- `@upup/pi-capability-registry` 删除 `__upupPiHosts` legacy fallback；Package host 只能从显式 session registry 解析。

### 3.4 投资助手 canonical workflow

`@upup/pi-investment-workflow` 新增：

- canonical phases：`detect → plan → execute → verify → report`；
- 七个可序列化 Agent Profile：researcher、analyst、risk-manager、portfolio-manager、backtest-engineer、monitor、reviewer；
- Profile capability、tool allowlist、风险等级、approval 要求和 output contract；
- `InvestmentWorkflowArtifact` 与 `createInvestmentWorkflowArtifact()`；
- Pi extension tool：`invest_workflow`。

原有 `research/valuation/backtest/trade/review` API 暂作为已测试的底层兼容执行函数，canonical tool 统一从 Pi Package 暴露。

## 4. 迁移矩阵与剩余工作

| Root 模块 | 目标 Package | 当前状态 | 删除条件 |
|---|---|---|---|
| `src/runtime/pi` | `@upup/pi-runtime`、`@upup/pi-session`、`@upup/pi-resource-composition` | contract 已建立，Factory 尚未完全物理迁移 | Factory 只保留 composition root |
| `src/tools` | 已有金融 `pi-*` packages | 工具 native registration 已完成，旧实现仍在 root | 生产消费者为零且行为测试覆盖 |
| `src/skills` | `@upup/skills` / 投资 Pi packages | 仍有 root loader/registry | resource loader 接管 discovery |
| `src/commands/investment` | `@upup/pi-investment-workflow` | canonical workflow 已加入 | CLI 只保留参数转发 |
| `src/session`、`src/memory`、`src/storage` | `@upup/pi-session`、`@upup/memory`、`@upup/pi-storage` | 部分已 package 化 | worker 无 CLI 依赖可运行 |
| `src/mcp`、`src/plugins` | `@upup/mcp`、`@upup/plugins` | manifest 已登记，root 实现未迁移 | trust/transport 生命周期由 Package 管理 |
| `src/gateway`、`src/bridge`、`src/stdio` | 对应 Pi transport packages | 未完成 | 入口只做 bind/bootstrap |
| `src/cron`、`src/daemon`、`src/subagent` | Pi platform packages | 未完成 | worker/cron 共享 Pi session |
| `src/tui`、`src/components` | `@upup/pi-tui-app` | 未完成 | UI 只消费 canonical event |

## 5. 目标依赖方向

```text
src bootstrap
  -> @upup/pi-app / transport packages
    -> @upup/pi-runtime + @upup/pi-session
      -> Pi Package manifest/resources/capabilities
        -> investment domain packages
          -> provider/storage/observability adapters
```

禁止 Package import root `src`；禁止 transport 直接拼装金融工具；禁止新代码使用 global capability/port registry；禁止入口重复转换 Pi event。

## 6. 验证记录

本轮已通过：

- `bun run typecheck`；
- `bun run check:pi7`：40 manifests、唯一 Pi AgentSession factory、无生产 global registry；
- `bun run check:module-boundaries`：40 packages、552 root modules、无 root import/循环；
- `bun --cwd packages/pi-runtime test`：14 pass；
- `bun --cwd packages/pi-capability-registry test`：5 pass；
- `bun --cwd packages/pi-investment-workflow test`：6 pass；
- `git diff --check`。

尚未宣称完成：全仓 root 物理迁移、真实 provider smoke、长周期 SLA、所有入口端到端 smoke、全仓 `bun test`。

## 7. 下一阶段执行顺序

1. 将 `PiAgentSessionFactory` 的 resource/session/platform/finance composition 完全转为 Package public API。
2. 迁移 `src/skills`、`src/commands/investment` 和 `src/tools` 的剩余生产实现并删除旧路径。
3. 迁移 Session、Memory、Permissions、Planning、Observability。
4. 迁移 MCP、Plugin、Gateway、Bridge、stdio、Cron、Daemon。
5. 迁移 TUI/components，并把 CLI 降为 bootstrap。
6. 删除 `legacy-events`、旧 facade 和所有无消费者兼容层。
7. 执行全仓测试、构建、入口 smoke、并发恢复验证和配置凭证 provider smoke。

## 8. 第二轮已完成项

### 8.1 Pi Package resource/trust/contract 物理迁移

- `git mv` 已将以下源文件移入 `@upup/pi-resource-composition`：
  - `src/runtime/pi/package-catalog.ts` → `packages/pi-resource-composition/src/package-catalog.ts`（416 行）
  - `src/runtime/pi/plugin-trust.ts` → `packages/pi-resource-composition/src/plugin-trust.ts`（125 行）
  - `src/runtime/pi/package-contracts.ts` → `packages/pi-resource-composition/src/package-contracts.ts`（136 行）
  - `src/runtime/pi/package-catalog.test.ts` → `packages/pi-resource-composition/src/package-catalog.test.ts`
  - `src/runtime/pi/plugin-trust.test.ts` → `packages/pi-resource-composition/src/plugin-trust.test.ts`
- `@upup/pi-resource-composition/src/index.ts` 统一 re-export `withSerializedPiResourceReload`、catalog、trust、contracts。
- `src/runtime/pi/{package-catalog,plugin-trust,package-contracts}.ts` 改为 2 行 `@deprecated` facade，保留向后兼容。
- 生产消费者已切换为 Package API：`src/runtime/pi/agent-session-factory.ts`、`src/runtime/pi/runner.ts`、`src/runtime/pi/skill-commands.ts`、`src/runtime/pi/package-config.ts`、`src/runtime/pi/index.ts`。
- 根 `src/runtime/pi` 生产行数从 121329 下降到 120667（净减 662 行）。

### 8.2 本轮验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、552 root modules |
| `bun --cwd packages/pi-resource-composition test` | 5 pass、15 assertions |
| `bun test src/runtime/pi` | 170 pass、2074 assertions、28 files |
| `bun run test:pi-contracts` | 通过（`pi-session`、`pi-resource-composition`、`pi-finance-composition`、`pi-platform-composition`、`pi-capability-registry` 等） |
| `git diff --check` | 通过 |

## 9. 第三轮 Pi7 实施结果（@upup/pi-session）

### 9.1 Pi Session 物理下沉到 Package

- `git mv` 完成：
  - `src/runtime/pi/host-contract.ts`（290 行）→ `packages/pi-session/src/host-contract.ts`
  - `src/runtime/pi/finance-host-contract.ts`（30 行）→ `packages/pi-session/src/finance-host-contract.ts`
  - `src/runtime/pi/session-service.ts`（335 行）→ `packages/pi-session/src/session-service.ts`
  - `src/runtime/pi/background-service.ts`（88 行）→ `packages/pi-session/src/background-service.ts`
  - 对应 4 个 `.test.ts` 同步迁入。
- `@upup/pi-session` 新增 public API：
  - `configurePiSessionService(runtimeFactory)` 与 `getPiSessionService()`
  - `configurePiBackgroundService(runnerFactory)` 与 `getPiBackgroundService()`
  - `PiSessionListItem`（取代 root `src/session/types` 的 `SessionSummary` 依赖）
- root `src/runtime/pi/{host-contract,finance-host-contract,session-service,background-service}.ts` 全部退化为 2 行 `@deprecated` facade。
- `src/runtime/pi/index.ts` 删除 `session-service` / `background-service` / `finance-host-contract` 的 re-export。
- 新增 `src/runtime/pi/bootstrap.ts`（`bootstrapPiNativeServices()`）作为唯一注入入口，由 `src/index.tsx`、`src/daemon/workers/tasks.ts`、runtime 关键测试在启动时调用。

### 9.2 生产消费者切换

- `src/runtime/pi/runner.ts`：`getPiSessionService` 改从 `@upup/pi-session` 导入。
- `src/runtime/pi/agent-session-factory.ts`：`createPiHostBridge` / `PiHostBridge` / `PiManagementSnapshot` / `PiSkillDefinition` 改从 `@upup/pi-session` 导入。
- `src/state/index.ts` / `src/controllers/agent-runner.ts` / `src/controllers/session-selection.ts` / `src/stdio/server.ts` / `src/multi-agent/monitor.ts` / `src/daemon/workers/tasks.ts` / `src/management/snapshot-provider.ts` 改从 `@upup/pi-session` 导入。
- `src/runtime/pi/runner.test.ts` / `src/runtime/pi/agent-session-factory.test.ts` / `src/controllers/agent-runner.pi.test.ts` / `src/gateway/agent-runner.pi.test.ts` / `src/state/index.pi.test.ts` 在 `beforeAll` / 测试夹具中调用 `bootstrapPiNativeServices()` 或本地 `configurePiSessionService(...)`。
- `src/runtime/pi/production-entry-contract.test.ts` 的生产入口白名单同步更新为 `runtime/pi/bootstrap`。

### 9.3 本轮验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、553 root modules |
| `bun --cwd packages/pi-session test` | 15 pass、46 assertions、5 files |
| `bun test src/runtime/pi` | 162 pass、2044 assertions、24 files |
| `bun run test:pi-contracts` | 通过（`pi-session`、`pi-resource-composition`、`pi-finance-composition`、`pi-platform-composition`、`pi-capability-registry` 等） |
| `bun test`（全仓） | 3691 pass、0 fail、12259 assertions、354 files |
| `git diff --check` | 通过 |
| `bun run report:pi7` | 根 `src/runtime/pi` 生产行数 120667 → 119960（净减 707 行） |

### 9.4 后续轮次

- 第四轮：`src/tools` 旧金融工具实现 → 现有 finance / market-data / investment Pi Package。
- 第五轮：`src/skills` + `src/commands/investment` → `@upup/skills` 与 `@upup/pi-investment-workflow`，固化 `/invest` 状态机与 Agent Profile。
- 第六轮：`src/session` / `src/memory` / `src/permissions` / `src/plan` / `src/storage` / `src/telemetry` → `@upup/pi-memory` / `@upup/pi-permissions` / `@upup/pi-observability` / `@upup/pi-planning`。
- 第七轮：`src/mcp` / `src/plugins` / `src/gateway` / `src/bridge` / `src/stdio` / `src/cron` / `src/daemon` / `src/subagent` / `src/multi-agent` → 现有 `@upup/pi-mcp` / `@upup/pi-plugin-runtime` 等。
- 第八轮：`src/tui` / `src/components` → `@upup/pi-tui-app`，CLI/transport 降为 bootstrap。
- 第九轮：删除 `legacy-events`、旧 facade 和所有无消费者兼容层。
- 第十轮：全仓测试、构建、入口 smoke、并发恢复验证和真实 provider smoke。

## 10. 第四轮 Pi7 实施结果（@upup/pi-finance-sdk 基金能力）

### 10.1 src/tools/fund/* 物理下沉

- `git mv` 6 个文件至 `packages/pi-finance-sdk/src/`：
  - `fund-api.ts` / `fund-backtest.ts` / `fund-holdings-analysis.ts` / `fund-screening.ts` / `fund-trade.ts` / `types.ts`（改名 `fund-types.ts`）。
- `@upup/pi-finance-sdk/src/index.ts` 新增 legacy fund API section（搜索/详情/业绩/持仓/经理/筛选/Top 基金/Portfolio/Trade/Backtest/历史净值）。
- `@upup/pi-finance-sdk/src/fund-api.ts`、`fund-backtest.ts`、`fund-holdings-analysis.ts`、`fund-screening.ts`、`fund-trade.ts` 内部相对导入同步改为 `.js` 后缀。
- root `src/storage/fund-storage.ts` / `src/daemon/fund-monitor.ts` 与 7 个 root 级 `test/fund-*.test.ts` 改用 `@upup/pi-finance-sdk`。
- `src/tools/fund/` 目录已删除。

### 10.2 本轮验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、547 root modules |
| `bun --cwd packages/pi-finance-sdk test` | 37 pass、176 assertions |
| `bun run test:pi-contracts` | 通过 |
| `bun test`（全仓） | 3686 pass、4 fail（3 个 pre-existing 网络超时 + 1 个随之 fail）；354 files |
| `bun run report:pi7` | 根生产行数 119960 → 117259（净减 2701 行） |

### 10.3 后续轮次

- 第五轮：`src/skills` + `src/commands/investment` → `@upup/skills` 与 `@upup/pi-investment-workflow`，固化 `/invest` 状态机与 Agent Profile。
- 第六轮：`src/session` / `src/memory` / `src/permissions` / `src/plan` / `src/storage` / `src/telemetry` → `@upup/pi-memory` / `@upup/pi-permissions` / `@upup/pi-observability` / `@upup/pi-planning`。
- 第七轮：`src/tools` 中剩余基础设施工具（bash / filesystem / sandbox / trading / cron 等）→ `@upup/pi-platform`；`src/mcp` / `src/plugins` / `src/gateway` / `src/bridge` / `src/stdio` / `src/cron` / `src/daemon` / `src/subagent` / `src/multi-agent` → 对应 Pi transport packages。
- 第八轮：`src/tui` / `src/components` → `@upup/pi-tui-app`，CLI/transport 降为 bootstrap。
- 第九轮：删除 `legacy-events`、旧 facade 和所有无消费者兼容层。
- 第十轮：全仓测试、构建、入口 smoke、并发恢复验证和真实 provider smoke。
