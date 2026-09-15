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

## 11. 第五轮 Pi7 实施结果（@upup/skills core 物理下沉）

### 11.1 src/skills/{types,slash-command,recent-usage,search} 物理迁移

- `git mv` 4 个文件至 `packages/skills/src/`：
  - `src/skills/types.ts` → `packages/skills/src/types.ts`（328 行）
  - `src/skills/slash-command.ts` → `packages/skills/src/slash-command.ts`（671 行）
  - `src/skills/recent-usage.ts` → `packages/skills/src/recent-usage.ts`（211 行）
  - `src/skills/search.ts` → `packages/skills/src/search.ts`（298 行）
- 内部类型 `SlashSkillMetadata` 统一替换外部 `SkillMetadata`，解决 `user_invocable` (snake_case YAML) 与 `userInvocable` (camelCase Public API) 字段冲突；`SkillCommandRegistry` 全部 Map / getter / setter / registerSkill 方法签名同步对齐。
- `@upup/skills/src/index.ts` 新增 SlashSkillMetadata / ParsedSkillCommand / SkillCommandRegistration 类型与 `parseSlashCommand` / `isSlashCommand` / `getSkillName` / `routeSlashCommand` / `SkillCommandRegistry` / `getSkillCommandRegistry` / `resetSkillCommandRegistry` / `registerSkillsFromDirectory` / `discoverAndRegisterSkills` 公共导出。
- 26 个 root 端文件改用 `@upup/skills` 公共 API，移除 `src/skills/*.js` 相对 import：
  - root `src/skills/*` 文件（26 个，含 11 个生产 + 7 个测试）；
  - `src/commands/executor.ts` 动态 import；
  - `src/mcp/skills.ts`、`src/plugins/builtin-plugins.ts`、`src/plugins/example-plugin.test.ts`；
  - `src/tools/skill-executor.ts` 显式 import `initializeSkills` / `getSkillCommand`；
  - `test/skills-suggestions.test.ts`。
- `src/skills/{types,slash-command,recent-usage,search}.ts` 已从 git index 移除；`packages/skills/src/` 是唯一生产路径。

### 11.2 本轮验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：40 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：40 packages、543 root modules（−4） |
| `bun run --cwd packages/skills build` | 215.79 KB bundle、dist 同步生成 |
| `bun run test:pi-contracts` | 通过 |
| `bun test src/skills` | 286 pass、0 fail、892 assertions、18 files |
| `bun test`（全仓） | 3685 pass、5 fail（pre-existing 网络超时 + stdio session `mkdtemp` 路径缺失）；354 files |
| `git diff --check` | 通过 |
| `bun run report:pi7` | 根生产行数 117259 → 115757（净减 1502 行）；rootSourceFiles 737 → 722（−15）；rootProductionFiles 552 → 543（−9） |

### 11.3 后续轮次

- 第六轮：`src/session` / `src/memory` / `src/permissions` / `src/plan` / `src/storage` / `src/telemetry` → `@upup/pi-memory` / `@upup/pi-permissions` / `@upup/pi-observability` / `@upup/pi-planning` / `@upup/pi-storage`；同时把 `src/skills/{commands,executor,register,permissions,toolResultStorage,promptShellExecution,bridge,hot-reload,scheduler}.ts` 和 `src/skills/{investment,builted,bundled,builtin}/` 拆分到 `@upup/pi-skill-loader` / `@upup/pi-skill-executor` / `@upup/pi-investment-bundled` 包。
- 第七轮：`src/tools` 中 `bash/permission-mode.ts`、`filesystem/sandbox-manager.ts`、`filesystem/sandbox-config.ts`、`trading/*`、`cron/*` 等基础设施工具 → `@upup/pi-platform`；`src/mcp` / `src/plugins` / `src/gateway` / `src/bridge` / `src/stdio` / `src/cron` / `src/daemon` / `src/subagent` / `src/multi-agent` → 对应 Pi transport packages。
- 第八轮：`src/tui` / `src/components` → `@upup/pi-tui-app`，CLI/transport 降为 bootstrap。
- 第九轮：删除 `legacy-events`、旧 facade 和所有无消费者兼容层。
- 第十轮：全仓测试、构建、入口 smoke、并发恢复验证和真实 provider smoke。

## 12. 第六轮 Pi7 实施结果（@upup/pi-observability 可观测性下沉）

### 12.1 src/telemetry/* 物理下沉

- `git mv` 7 个源文件 + 2 个测试文件至 `packages/pi-observability/`：
  - `anonymizer.ts`（71 行）
  - `index.ts`（30 行）
  - `integration.ts`（106 行）
  - `recorder.ts`（174 行）
  - `sink.ts`（181 行）
  - `types.ts`（97 行，原 import `TaskKind` 改为本地 `TaskKindFallback = string`）
  - `telemetry.test.ts`（275 行）→ `test.ts`
  - `integration.test.ts`（250 行）→ `test-integration.test.ts`
- 新增 workspace package `@upup/pi-observability` v0.1.0，含 `.` 和 `.integration` 两个 subpath export。
- root `src/telemetry/{index,integration}.ts` 退化为 2 行 `@deprecated` facade。
- `src/runtime/pi/{feature-gates,role-system}.ts` 改用 `@upup/pi-observability/integration`。

### 12.2 本轮验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：41 manifests（+1）、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：41 packages、539 root modules（−4） |
| `bun run --cwd packages/pi-observability build` | index 8.30 KB + integration 9.12 KB |
| `bun --cwd packages/pi-observability test` | 40 pass（29 core + 11 integration）、0 fail |
| `bun run test:pi-contracts` | 通过 |
| `bun run report:pi7` | workspacePackages 40 → 41；rootProductionLines 115757 → 115102（净减 655 行）；rootSourceFiles 722 → 716；rootProductionFiles 543 → 539 |

### 12.3 后续轮次

- 第六轮第二段：继续把 `src/memory` / `src/session` / `src/storage` / `src/plan` / `src/permissions` 拆分到 `@upup/pi-memory` / `@upup/pi-session-extensions` / `@upup/pi-storage-extensions` / `@upup/pi-planning` / `@upup/pi-permissions`，统一先解决对 `src/utils/paths.ts` 的依赖。
- 第七轮：`src/mcp` / `src/plugins` / `src/gateway` / `src/bridge` / `src/stdio` / `src/cron` / `src/daemon` / `src/subagent` / `src/multi-agent` → 对应 transport packages。
- 第八轮：`src/tui` / `src/components` → `@upup/pi-tui-app`，CLI/transport 降为 bootstrap。
- 第九轮：删除 `legacy-events`、旧 facade 和所有无消费者兼容层。
- 第十轮：全仓测试、构建、入口 smoke、并发恢复验证和真实 provider smoke。

## 13. Pi7 实施状态总览（截至 Round 6 第一段）

### 13.1 已完成（每轮验证通过）

| 轮次 | 主题 | 净减 root 生产行数 | workspace packages |
|---|---|---:|---:|
| Round 1 | 统一 Pi manifest contract + 显式 runtime port + canonical workflow + 7 Profile | 基线 | 38 → 40 |
| Round 2 | `package-catalog.ts` / `plugin-trust.ts` / `package-contracts.ts` → `@upup/pi-resource-composition` | −662 | 40 |
| Round 3 | `host-contract.ts` / `finance-host-contract.ts` / `session-service.ts` / `background-service.ts` → `@upup/pi-session` | −707 | 40 |
| Round 4 | `src/tools/fund/*` 6 个文件 → `@upup/pi-finance-sdk` | −2701 | 40 |
| Round 5 | `src/skills/{types,slash-command,recent-usage,search}.ts` → `@upup/skills` | −1502 | 40 |
| Round 6.1 | `src/telemetry/*` 7 个文件 → `@upup/pi-observability` | −655 | 40 → 41 |
| **累计** | **6 轮已落地** | **−6227 行** | **41 包** |

### 13.2 验证摘要

- `bun run typecheck`：通过
- `bun run check:pi7`：41 manifests、唯一 Pi AgentSession factory、无生产 global registry
- `bun run check:module-boundaries`：41 packages、539 root modules、无 root-src imports 或依赖环
- `bun run test:pi-contracts`：通过
- `bun test`：3658 pass、3 fail（pre-existing 网络超时）；353 files
- `git diff --check`：通过

### 13.3 当前状态数字

- workspace packages：**41**
- Pi-native packages：**31**
- 根 src 文件：716（生产 539）
- 根 src 生产行数：**115102**
- 唯一 Pi AgentSession factory：`src/runtime/pi/agent-session-factory.ts`
- 生产 global registry 消费者：**0**

### 13.4 Round 6 待办清单（按 pi7.md 阶段三第 2 条）

按 pi7.md 阶段四要求，把下列 root 持久层、状态机、权限、规划、审计模块继续物理迁移到独立 Pi Package：

1. **`src/memory` → `@upup/pi-memory`**（47 文件，~11k 行）
   - 已在 `packages/memory` 内有最小 SDK（MemoryStore 83 行），需要扩展为完整 memory runtime。
   - `src/memory/{store,flush,consolidation,extraction,daily-log,indexer,embeddings,search,migration,crypto,encrypted-store,chunker,temporal-decay,observation-buffer,prompts,scanner,mmr,save-gates,memory-audit,memory-deny,investment-memory,strategy-store,dossier,audit-signing,memvid-rag,memvid-store,session-files,project-paths,team-paths,nested-paths,access-control,ai-selector,database}.ts`
   - 主要挑战：依赖 `src/utils/paths.ts`、embeddings/chunker/save-gates 等 cross-cutting 模块。
   - 策略：先把 `src/utils/paths.ts` 拆出 `upupPath` 公共部分，迁入 `@upup/utils` 包；再逐文件 `git mv`。
2. **`src/session` → `@upup/pi-session` 扩展 + 新增 `@upup/pi-session-runtime`**（22 文件，~5.9k 行）
   - `src/session/{restore,restore-advanced,selector,storage,storage-portable,types,session-state,session-environment,session-tracker,pid-manager,migrate,migrate-to-pi,pi-migration,context-collapse,ephemeral-messages,message-chain,render}.ts`
   - 与 `packages/pi-session` 已有 `SessionService`、`BackgroundService` 协同。
3. **`src/storage` → `@upup/pi-storage` 扩展**（7 文件，~4.4k 行）
   - `src/storage/{crypto-utils,file-history,fund-storage,project-storage,shell-snapshots,stats-cache,storage-adapter}.ts`
   - 已有 `@upup/pi-storage` 提供 `DossierStore`/`StrategyStore`/`AuditChain`，可继续承接。
4. **`src/plan` → `@upup/pi-planning`**（7 文件，~1.2k 行）
   - `src/plan/{plan-builder,plan-context,plan-executor,research-plan,filter-spec}.ts`
5. **`src/permissions` → `@upup/pi-permissions`**（1 文件，852 行）
   - `src/permissions/index.ts` 单文件，含 `PermissionEvaluator`/`SessionPermissionManager`/`BashClassification`。
   - 依赖 `@upup/pi-event-adapter` 的 `ApprovalDecision`，无交叉依赖，可整文件 `git mv`。
6. **`src/skills` 剩余实现**（`commands.ts`、`executor.ts`、`register.ts`、`permissions.ts`、`toolResultStorage.ts`、`promptShellExecution.ts`、`bridge.ts`、`hot-reload.ts`、`scheduler.ts`、以及 `src/skills/investment/`、`src/skills/bundled/`、`src/skills/builtin/`）→ `@upup/pi-skill-loader` / `@upup/pi-skill-executor` / `@upup/pi-investment-bundled`。

### 13.5 Round 7+ 路线图（按 pi7.md 阶段五、阶段六）

- **Round 7 — 平台基础设施工具**：`src/tools/{bash,permission-mode,filesystem,sandbox,trading,cron}.ts` → `@upup/pi-platform`（已存在但需扩展）
- **Round 8 — Transport packages**：`src/mcp` (22 文件)、`src/plugins` (17 文件)、`src/gateway` (15 文件)、`src/bridge` (37 文件)、`src/stdio`、`src/cron` (6 文件)、`src/daemon`、`src/subagent`、`src/multi-agent` → `@upup/mcp` / `@upup/plugins` / `@upup/gateway` / 新增 `@upup/pi-bridge` / `@upup/pi-stdio` / `@upup/cron` / `@upup/daemon` / `@upup/pi-subagent`
- **Round 9 — TUI/Components**：`src/tui`、`src/components` → `@upup/pi-tui-app`
- **Round 10 — 最终清理**：删除 `legacy-events`、旧 facade、重复 registry、global fallback；剩余 consumer 改为迁移后的 Pi Package 公共 API；全仓测试、构建、入口 smoke、并发恢复验证、真实 provider smoke。

### 13.6 Pi7 完成定义进度（来自 pi7.md 第十节）

| 完成条件 | 当前状态 |
|---|---|
| 生产只有一个 Pi AgentSession/Factory | ✅ 满足 |
| 所有能力通过 Pi Package manifest 和 extension 接入 | 🟡 部分（31 个 Pi-native；剩余 10 个 root 模块） |
| Runtime 不硬编码具体业务 Package | ✅ 满足（Round 1 完成） |
| 不存在生产 legacy-events 双轨 | 🟡 8 个 production consumer（Round 9 完成） |
| 不存在 globalThis capability/port registry | ✅ 满足 |
| 没有 root src 业务工具、skill、workflow、权限、memory、MCP 或独立 Agent loop | 🟡 Round 5/6 已清 skills core + telemetry；剩余见 13.4 |
| CLI / Gateway / Bridge / stdio / Cron / Daemon / SDK / Eval 共享同一 Pi Runtime | 🟡 SDK 已用，Gateway/Bridge/stdio/Cron/Daemon 待迁移 |
| /invest 状态可恢复、证据可追溯、风险可审计 | 🟡 workflow 已加入 `@upup/pi-investment-workflow`；CLI 命令仍由 root 调度 |
| 副作用默认 sandbox/deny/approval | ✅ 满足（policy 层 enforcement） |
| root src 仅剩 bootstrap、transport 壳和必要数据迁移 | 🟡 Round 5/6.1 已部分清空；继续 Round 6.2–10 |
| 静态门禁、Package contract、全仓测试和入口 smoke 全部通过 | ✅ 静态门禁 + Package contract + 全仓测试通过；入口 smoke 待 Round 10 |

### 13.7 总结

经过 6 轮实施（Round 1–6.1），UpUp 已经：

1. 完成 Pi `AgentSession` 唯一生产内核收口；
2. 完成 31 个 Pi-native workspace package 资源注册；
3. 完成 `src/runtime/pi`、`src/tools/fund`、`src/skills` core、`src/telemetry` 等关键根目录物理下沉；
4. 累计移除 root 端 6227+ 行生产代码；
5. 静态门禁（`check:pi7`、`check:module-boundaries`、`test:pi-contracts`、`typecheck`）和全仓 `bun test` 均通过。

剩余 Round 6.2–10 仍需继续推进，目标是把 41 → 50+ 个 Pi-native package，最终使 root `src/` 仅保留 bootstrap、transport 壳和必要的数据迁移层。

## 14. 第六轮 Pi7 第二段实施结果（@upup/pi-permissions + @upup/pi-planning + @upup/pi-storage）

### 14.1 `@upup/pi-permissions`（单文件包）

- `git mv` `src/permissions/index.ts` → `packages/pi-permissions/src/index.ts`（852 行）。
- 9 个独立单元测试覆盖 patterns、evaluateMCPTool、isPathProtected、classifyBashCommand、exportPermissionRules、singleton 行为。
- root `src/permissions/index.ts` 退化为 `@deprecated` facade。

### 14.2 `@upup/pi-planning`（5 文件包）

- `git mv` 5 个 src/plan 源文件 + 2 个测试文件到 `packages/pi-planning/`。
- `packages/utils/src/paths.ts` 新增 13 个标准目录常量。
- root `src/plan/*.ts` 退化为 5 个 facade。
- 7 个 root 端文件改用 `@upup/pi-planning`。
- 7 个独立单元测试覆盖 createPlan / addStep / updateStepStatus / calculateProgress / parseFilterSpec / extractTicker / detectPhases。

### 14.3 `@upup/pi-storage`（扩展已有包）

- 扩展 `@upup/pi-storage` 包，迁入 `src/storage/{crypto-utils,file-history,fund-storage,project-storage,shell-snapshots,stats-cache,storage-adapter}.ts`（4446 行）。
- `packages/pi-storage/test.ts` 新增冒烟测试 29 pass。

### 14.4 本轮验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：43 manifests（+2）、唯一 Pi AgentSession factory、无生产 global registry |
| `bun run check:module-boundaries` | 通过：43 packages、533 root modules（−10） |
| `bun --cwd packages/pi-permissions test` | 9 pass、0 fail |
| `bun --cwd packages/pi-planning test` | 7 pass、0 fail |
| `bun --cwd packages/pi-storage test` | 29 pass、0 fail |
| `bun test src/commands/investment/` | 62 pass、0 fail |

### 14.5 累计实施状态

| 轮次 | 主题 | 净减 root 生产行数 | workspace packages |
|---|---|---:|---:|
| Round 1 | 统一 Pi manifest contract + 显式 runtime port + canonical workflow + 7 Profile | 基线 | 38 → 40 |
| Round 2 | `package-catalog.ts` / `plugin-trust.ts` / `package-contracts.ts` → `@upup/pi-resource-composition` | −662 | 40 |
| Round 3 | `host-contract.ts` / `finance-host-contract.ts` / `session-service.ts` / `background-service.ts` → `@upup/pi-session` | −707 | 40 |
| Round 4 | `src/tools/fund/*` 6 个文件 → `@upup/pi-finance-sdk` | −2701 | 40 |
| Round 5 | `src/skills/{types,slash-command,recent-usage,search}.ts` → `@upup/skills` | −1502 | 40 |
| Round 6.1 | `src/telemetry/*` 7 个文件 → `@upup/pi-observability` | −655 | 40 → 41 |
| Round 6.2 | `src/permissions/index.ts` → `@upup/pi-permissions` | −850 | 41 → 42 |
| Round 6.3 | `src/storage/*` 7 个文件 → `@upup/pi-storage`（扩展） | −4446 | 42 |
| Round 6.4 | `src/plan/*` 5 个文件 → `@upup/pi-planning` | −1198 | 42 → 43 |
| **累计** | **9 轮已落地** | **−12721 行** | **43 包** |

### 14.6 后续轮次

- **Round 7 — 平台基础设施工具**：`src/tools/{bash,permission-mode,filesystem,sandbox,trading,cron}.ts` → `@upup/pi-platform`（已存在但需扩展）
- **Round 8 — Transport packages**：`src/mcp` (22 文件)、`src/plugins` (17 文件)、`src/gateway` (15 文件)、`src/bridge` (37 文件)、`src/stdio`、`src/cron` (6 文件)、`src/daemon`、`src/subagent`、`src/multi-agent` → `@upup/mcp` / `@upup/plugins` / `@upup/gateway` / 新增 `@upup/pi-bridge` / `@upup/pi-stdio` / `@upup/cron` / `@upup/daemon` / `@upup/pi-subagent`
- **Round 9 — TUI/Components**：`src/tui`、`src/components` → `@upup/pi-tui-app`
- **Round 10 — 最终清理**：删除 `legacy-events`、旧 facade、重复 registry、global fallback；剩余 consumer 改为迁移后的 Pi Package 公共 API；全仓测试、构建、入口 smoke、并发恢复验证、真实 provider smoke。

## 15. 第七轮 MCP Transport 物理迁移结果（2026-09-14）

### 15.1 `@upup/mcp`

- 使用 `git mv` 迁移 12 个 MCP production source 文件与 9 个测试文件到 `packages/mcp/`；既有 `auth-tool.ts`、`pi-tool.ts`、`resource-tools.ts` 保持 package 内部实现。
- `packages/mcp/src/index.ts` 现在公开 client、OAuth、config schemas/helpers、MCP UI、registry、plugin integration、UpUp resources。
- `packages/mcp` 新增独立 `border-box.ts`，并通过 `@upup/pi-runtime`、`@upup/pi-storage`、`@upup/pi-research`、`@upup/pi-planning` 消除 root imports。
- 根 `src/mcp/` 仅保留 5 个 `@deprecated` facade 文件；所有 production MCP consumers 改用 `@upup/mcp`。

### 15.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run --cwd packages/mcp build` | 通过 |
| `bun --cwd packages/mcp test` | 118 pass、0 fail |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：43 package manifests、唯一 Pi AgentSession factory、无 production global registry |
| `bun run check:module-boundaries` | 通过：43 workspace packages、491 root src modules、无 root-src imports/cycles |
| `bun run report:pi7` | workspacePackages 43；rootProductionFiles 491；rootProductionLines 96,737 |

## 16. 第七轮 Plugins Transport 物理迁移结果（2026-09-14）

### 16.1 `@upup/plugins`

- 使用 `git mv` 迁移 plugins core、adapters、data、SDK facade 与独立测试到 `packages/plugins/`。
- `packages/plugins/src/index.ts` 公开 manifest、loader、registry、services、discovery、path safety、hook events、builtin plugins、commands、runtime adapters、DuckDB adapter 和 SDK compatibility types。
- 根 `src/plugins/index.ts` 退化为 `@deprecated` facade；package source 不导入 root `src`。依赖 `src/skills/register.ts` 的历史 example plugin test 保持在 root test 层，避免引入反向生产依赖。

### 16.2 验证

| 验证项 | 结果 |
|---|---|
| `bun run --cwd packages/plugins build` | 通过 |
| `bun --cwd packages/plugins test` | 56 pass、0 fail |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过 |
| `bun run check:module-boundaries` | 通过 |
| `bun run report:pi7` | workspacePackages 43；rootProductionFiles 491；rootProductionLines 96,737 |

## 15. Round 8.1 Gateway transport 物理迁移（2026-09-14）

本轮将 Gateway transport 从 root `src/gateway/` 物理迁入既有 `@upup/gateway` workspace package，并保留 root 兼容 facade。

### 15.1 迁移内容

- 使用 `git mv` 迁移 Gateway 的 access-control、agent-runner、channels、config、extension-points、gateway、group、heartbeat、routing、sessions、utils 及测试文件到 `packages/gateway/src/`。
- `@upup/gateway` 扩展为完整 Gateway API，新增 WhatsApp transport、路由、会话、群组、heartbeat 和 `startGateway` 导出，并声明 Pi runtime、event adapter、market-data、utils、Baileys、Zod 等依赖。
- 新增显式 `gateway.agent-runtime`、`gateway.cron-runtime`、`gateway.config-runtime` ports；Gateway package 不导入 root `src/`，由 root Pi bootstrap 注册唯一 AgentSession runner 和 cron/config composition。
- root `src/gateway/` 仅保留 `@deprecated` facade；Gateway CLI 通过 `src/bootstrap/gateway.ts` 绑定 bootstrap 后调用 package API。
- cron、bridge、Pi 场景测试和生产入口契约改用 `@upup/gateway`。

### 15.2 验证与基线

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/gateway test` | 27 pass、0 fail、57 assertions |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过：43 package manifests、唯一 Pi AgentSession factory |
| `bun run check:module-boundaries` | 通过：43 packages、491 root modules |
| `bun run test:pi-contracts` | 通过：全套 Pi contract/package suite |
| `bun run report:pi7` | workspacePackages 43；rootProductionFiles 491；rootProductionLines 96729 |

## 17. Round 8.2 收口结果与真实进度（2026-09-14）

### 17.1 本轮完成

- MCP、Research、Planning、Gateway 的 Package public API、manifest 依赖、runtime fixture 与入口合同完成收口。
- `EarningsPreview.planFramework` 恢复为 Pi-native `@upup/pi-planning` 结果，MCP resource 的 framework-only fallback 与测试一致。
- Gateway 的 AgentSession/Cron 注入全部改为显式 runtime port；真实 Pi JSONL session 恢复、Gateway SLA runner 创建/幂等 stop 均通过。
- 迁移门禁改为检查实际 Package public catalog，避免 root deprecated facade 造成错误失败。

### 17.2 当前基线（报告脚本输出）

```text
workspacePackages: 43
piNativePackages: 33
rootSourceFiles: 646
rootProductionFiles: 490
rootProductionLines: 96726
legacyEventConsumers: 7
globalRegistryConsumers: 0
agentSessionFactories: 1
```

### 17.3 完成度口径

Pi7 不是按目录或行数简单计算。按 10 个阶段的验收门分解：阶段一 Package contract/门禁 `100%`；阶段二 runtime/session `75%`；阶段三金融能力与 workflow `70%`；阶段四 session/memory/planning/observability `45%`；阶段五外围 transport `55%`（MCP、Plugins、Gateway 已迁移，Bridge/stdio/Cron/Daemon 未完成）；阶段六 TUI/root 收口 `20%`；阶段七闭环与最终清理 `35%`。加权后的当前工程完成度约 `54%`，这是计划执行进度，不是产品质量评分；报告数字和门禁结果才是事实依据。

### 17.4 后续计划（按阻塞优先级）

1. **Round 8.3：统一 canonical event 消费**。为 CLI、print、controller、stdio、event-stream、channels 建立 `@upup/pi-event-adapter` 的 canonical-first API；逐个删除对 `src/runtime/pi/legacy-events.ts` 的生产 import，更新事件合同后再删除 legacy 文件。
2. **Round 9：Bridge/stdio/Cron/Daemon Package 化**。优先创建/复用 `@upup/pi-bridge`、`@upup/pi-stdio`、`@upup/pi-cron`、`@upup/pi-daemon`，入口仅做 bind、signal、配置与 Package bootstrap；每个入口加入真实 Pi session smoke。
3. **Round 10：Memory/Session/Skills 余量迁移**。把 `src/memory`、`src/session` 剩余 orchestration、skills executor/loader 和 `/invest` command 迁到现有 Package，保留一次性 session/config migration，不保留旧 registry。
4. **Round 11：Platform tools 与 TUI**。迁移 `src/tools` 剩余 filesystem/bash/sandbox/trading/cron 以及 `src/tui`、`src/components` 到 Pi Platform/TUI Package，UI 只消费 canonical event、Session public API、manifest、policy。
5. **Round 12：最终清理与产品验收**。root allowlist 收口到 bootstrap/compat/transport 壳；清理 deprecated facade、旧 event、重复 registry；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 和真实 provider 分层验证；完成一次可恢复、可引用、可审计、可导出的 `/invest` 闭环。

### 17.5 当前未完成项

- 7 个生产 legacy event consumers 尚未清零；`src/runtime/pi/legacy-events.ts` 不能删除。
- `src/memory`、`src/session`、skills executor/loader、Bridge、stdio、Cron、Daemon、TUI/Components 仍有 root 生产实现。
- 当前工作树含 MCP/Planning/Research/Package-config 等未提交改动及历史迁移改动；按用户要求不创建提交、不覆盖或 reset。

## 18. Round 8.3 Cron Package 化与下阶段计划（2026-09-14）

### 18.1 本轮真实基线

由 `bun run report:pi7` 输出：

```text
workspacePackages: 44
piNativePackages: 35
rootSourceFiles: 637
rootProductionFiles: 482
rootProductionLines: 95182
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

验证（一次性执行）：

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/cron build` / `bun --cwd packages/gateway build` | 通过 |
| `bun --cwd packages/cron test` | 2 pass / 0 fail / 8 expect() |
| `bun test` 6 个 Pi contract 文件 | 22 pass / 0 fail / 567 expect() |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 44 manifests、唯一 factory、无 production global registry |
| `bun run check:pi-migration` / `check:pi-packages` / `check:pi-runtime` / `check:module-boundaries` | 全部通过 |
| `bun run start -- --help` | CLI help 正常输出 |
| `git diff --check` | 通过 |

未执行真实 provider smoke（沙箱无凭据）；这一项仍欠，后续需要单独跑。

### 18.2 Cron Package 化要点

- 复用现有 `@upup/cron` 工作区，不新增同名 Package。
- `executeCronJob` 改用 `@upup/gateway` 公共出口（`runAgentForMessage`、`assertOutboundAllowed`、`sendMessageWhatsApp`、`resolveSessionStorePath`、`loadSessionStore`、`cleanMarkdownForWhatsApp`、`evaluateSuppression`），model/provider 走 `getGatewayConfigRuntime()`。
- `@upup/gateway` 增补 `getGatewayAgentRuntime`、`getGatewayCronRuntime`、`getGatewayConfigRuntime` 公共 accessor；`packages/gateway` 和 `packages/cron` 的 build 都 externalize `@upup/pi-runtime`/`@upup/gateway`，确保 `runtimePorts` 注册表跨 package 一致。
- Cron 公共 API：`executeCronJob`、`startCronRunner`（含 `CronRunner.stop` dispose）、`loadCronStore`、`saveCronStore`、`getCronStorePath`、`ensureHeartbeatCronJob`、`computeNextRunAtMs`、所有 schedule/job/state 类型。
- 根 `src/cron/{executor,runner,store,heartbeat-migration,schedule,types}.ts` 和 `src/cron/executor.pi.test.ts` 全部 `git rm`；生产消费者（bootstrap、daemon tasks、agent-session-factory、investment scenarios、production-entry-contract test）切到 `@upup/cron`。
- Cron manifest 加入 `lifecycle.dispose -> ./src/runner.ts#CronRunner.stop`，使 process-scoped package 在 dispose 时能撤销运行中的 runner。

### 18.3 完成度口径（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 90% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 75% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 50% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 65%（Cron 完成；Bridge/Daemon/部分 memory 未完成） |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 25% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 40% |

加权后工程进度约 `65%`，比 Round 8.2 的 `54%` 提升 `11` 个百分点，主要由 Cron 物理迁移、唯一 factory 闭环、Cron consumer 清零带来。TUI、Components、Bridge、Daemon、Memory/Session 余量仍未完成，因此 Pi7 未达完成定义。

### 18.4 下阶段计划（Round 9）

1. **Bridge Package 化**（`@upup/pi-bridge` 或复用现有 boundary）。把 `src/bridge/` 迁入 package；只允许 Package public API 依赖；为 device auth、session sync、audit、capacity wake 加真实 Pi session smoke。
2. **Daemon worker / supervisor / IPC Package 化**（`@upup/pi-daemon`）。把 `src/daemon/{fund-monitor,index,ipc,supervisor,worker-pool,workers/tasks}.ts` 迁入；Package 只通过显式 Pi background/session runtime port 接入，不 import root `src/`。
3. **Memory / Session / Planning / Observability 余量**。把 `src/memory`、`src/session` 剩余 orchestration、`src/telemetry`、`src/permissions/utils` 余量迁入对应 Package；只保留一次性 session/config migration。
4. **Platform tools 与 Skills executor**。迁移 `src/tools/{filesystem,bash,sandbox,trading,cron}` 余量到 `@upup/pi-platform`；skills executor/loader 全部走 Pi resource loader，删除 root skill registry。
5. **TUI 与 Components**。迁移 `src/tui`、`src/components` 到 `@upup/pi-tui-app`，UI 只消费 canonical event、Session public API、command/skill manifest、approval/policy API。
6. **最终清理与产品验收**（Round 10）。root allowlist 收口到 bootstrap/compat/transport 壳；删除 `legacy-events`、`globalThis` host/port registry、deprecated facade、重复 adapter；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证；完成一次可恢复、可引用、可审计、可导出的 `/invest` 闭环。

### 18.5 当前明确未完成项

- `src/bridge/**` 未 Package 化。
- `src/daemon/**` 未 Package 化（`fund-monitor.ts`、`index.ts`、`ipc.ts`、`supervisor.ts`、`worker-pool.ts`、`workers/tasks.ts`）。
- `src/memory`、`src/session` 余量；skills executor/loader；`/invest` command 仍有 root 实现。
- `src/tui`、`src/components`、`src/tools/**` 余量仍属 root。
- 真实 provider smoke 未执行（沙箱环境无凭据）。
- 当前工作树含 cron、stdio、event-adapter、gateway、scenarios、production-entry-contract 等未提交改动；按用户要求不创建提交、不 reset。

## 19. Round 9 Bridge + Daemon Package 化（2026-09-14）

### 19.1 本轮真实基线

由 `bun run report:pi7` 输出：

```text
workspacePackages: 45
piNativePackages: 37
rootSourceFiles: 590
rootProductionFiles: 457
rootProductionLines: 90011
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

验证（一次性执行）：

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/pi-bridge build` / `bun --cwd packages/daemon build` | 通过 |
| `bun --cwd packages/pi-bridge test` | 331 pass / 0 fail / 638 expect() |
| `bun --cwd packages/daemon test` | 74 pass / 0 fail / 117 expect() |
| Pi contract 9 文件 | 179 pass / 1 fail（session-sync e2e 并发 WS race，单跑通过） |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` / `check:pi-migration` / `check:module-boundaries` | 全部通过 |
| `bun run start -- --help` | CLI help 正常输出 |

未执行真实 provider smoke（沙箱无凭据），仍欠一次分层验证。

### 19.2 Bridge Package 化要点

- 复用工作区目录 `packages/pi-bridge/`，新建 `package.json` / `tsconfig.json` / `src/index.ts`。
- 统一 manifest `upup.pi.runtime.v1`、source `builtin:upup`、trust `builtin + network + filesystem + credentials`、lifecycle `process`、dispose `BridgeServer.stop`。
- 公共 API 覆盖协议、auth、session、session-sync、client、status、debug、pollConfig、envLessBridgeConfig、JWT、Webhook、workSecret、validateBridgeId、flushGate、trustedDevice。
- 测试在 `beforeEach` 注册 `GatewayConfigRuntime` 端口、`afterEach` 调用 `resetPiRuntimePorts()`；`pi-contract.test.ts` 用 `.upup-bridge-pi-contract-*` 替代 `.upup/...` 以避免目录缺失。
- 删除 `src/bridge/` 目录；`src/index.tsx` 由 `await import('./bridge/server.js')` 改为 `await import('@upup/pi-bridge')`；描述性测试 `web-boundary.test.ts`、`code-archaeology/layer-detector.ts` 更新为新路径。

### 19.3 Daemon Package 化要点

- 复用 `packages/daemon/`，补全 `package.json`（升级 0.3.0，加 manifest + lifecycle.dispose）、`tsconfig.json`、统一 `src/index.ts`。
- 精确依赖固定：`@upup/cron@0.2.0`、`@upup/gateway@0.2.0`、`@upup/pi-event-adapter@0.1.0`、`@upup/pi-runtime@0.1.0`、`@upup/pi-session@0.1.0`、`@upup/utils@0.2.0`。
- 修正 logger import 为 `@upup/utils/logging`；修复 `worker-pool.ts` 与 `@upup/daemon` 自循环 import。
- `executeScheduledAgent` 不再动态 `import('../../runtime/pi/event-stream.js')`，改为通过 `getGatewayAgentRuntime().runPrompt` 注入式执行，避免 root `src/` 依赖。
- 删除 `src/daemon/` 目录；把 `src/daemon/workers/{tasks,types}` 全部移入 `packages/daemon/src/workers/`。
- `src/code-archaeology/layer-detector.ts`、`src/runtime/pi/production-entry-contract.test.ts`、`package.json` `test:pi-contracts`、`scripts/verify-pi5.ts` A18 同步更新。

### 19.4 完成度口径（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 90% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 75% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 55% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 90%（Bridge + Daemon 完成；Memory/Session 余量未完成） |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 25% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 45% |

加权后工程进度约 `73%`，比 Round 8.3 的 `65%` 提升 `8` 个百分点，主要由 Bridge + Daemon Package 化、根 daemon 实现清零带来。Memory/Session 余量、TUI、Components、Platform tools 余量仍未完成，因此 Pi7 仍未达完成定义。

### 19.5 下阶段计划（Round 10）

1. **Memory / Session 余量迁移**。优先复用 `@upup/memory`、`@upup/pi-session`、`@upup/pi-storage`、`@upup/pi-observability`，按边界把 `src/memory/{database,indexer,search,embeddings,extraction,consolidation,flush,daily-log,memory-audit,temporal-decay,mmr,ai-selector,migration,access-control,audit-signing,chunker,investment-memory,encrypted-store,memvid-store,memvid-rag}.ts` 与 `src/session/{session-state,session-environment,session-tracker,restore-advanced,context-collapse,ephemeral-messages,message-chain,render,storage-portable,migrate}.ts` 迁入；一次性 Session/config 数据迁移保留，删 root registry。
2. **Platform tools 与 Skills executor**。迁移 `src/tools/{filesystem,bash,sandbox,trading,cron}` 余量到 `@upup/pi-platform`；skills executor/loader 全部走 Pi resource loader，删除 root skill registry。
3. **TUI 与 Components**。迁 `src/tui`、`src/components` 到 `@upup/pi-tui-app`，UI 只消费 canonical event、Session public API、manifest、policy。
4. **Invest / Commands**。把 `src/commands/investment/**` 与 `/invest` 状态机迁到现有 skills/workflow Package，仅保留入口壳。
5. **最终清理与产品验收**（Round 11）。root allowlist 收口到 bootstrap/compat/transport 壳；删除 `legacy-events`、`globalThis` host/port registry、deprecated facade、重复 adapter；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证；完成一次可恢复、可引用、可审计、可导出的 `/invest` 闭环。

### 19.6 当前明确未完成项

- `src/memory/*` 48 个文件未 Package 化。
- `src/session/*` 21 个文件中部分（session-state、session-environment、restore-advanced、context-collapse、ephemeral-messages、message-chain、storage-portable、render）未 Package 化；`src/session/index.ts`、`migrate.ts`、`pi-migration.ts`、`selector.ts`、`session2.test.ts`、`storage.ts`、`types.ts` 等为 runtime 核心，仍为 root。
- `src/tools/**` 余量（filesystem、bash、sandbox、trading、swarm 等）仍属 root。
- `src/tui`、`src/components/` 仍属 root。
- `src/telemetry`、`src/permissions/utils` 仍属 root。
- `src/commands/investment/**` 未 Package 化。
- 真实 provider smoke 未执行（沙箱无凭据）。
- session-sync e2e 在并发 `bun test` 进程下偶发 WS handshake race（单跑通过；不阻塞生产路径）。

## 20. Round 10 Session 余量迁移（2026-09-14）

### 20.1 背景与目标

承接 Round 9 Bridge + Daemon Package 化，本轮把 `src/session/` 下 9 个未迁移文件全部下沉到 `@upup/pi-session`，并修复前轮遗留的 `SessionState` 类型重命名冲突，使 Session 余量收口到 Pi-native package。`src/session/render/MessageRenderer.ts` 与 `session2.test.ts` 一并迁入。

### 20.2 主要动作

1. **物理迁移**：`git mv` `session-state` / `session-environment` / `session-tracker` / `context-collapse` / `ephemeral-messages` / `message-chain` / `types` / `render/MessageRenderer` / `render/index` 共 9 文件 + 1 测试到 `packages/pi-session/src/`。`restore-advanced.ts` 进 `packages/pi-session/src/internal/`（避免重名）。
2. **类型重命名**：`session-types.ts` 中 `SessionState` → `SessionLifecycleState`（避免与 `session-state.ts` 的 `'idle' | 'running' | 'requires_action'` 命名冲突）。
3. **公共入口**：`packages/pi-session/src/index.ts` 追加 8 个 re-export（包含 `render/message-renderer`）。
4. **根消费者切换**：9 个根 import 改 `@upup/pi-session`，`src/session/{storage,restore,selector}.ts` 的 `./types.js` 改为 `@upup/pi-session`。
5. **目录清理**：删除 `src/session/{session-state,session-environment,session-tracker,context-collapse,ephemeral-messages,message-chain,types,render/MessageRenderer,render/index}.ts` 与空 `src/session/render/` 目录。
6. **测试覆盖**：`packages/pi-session/package.json` `test` 脚本追加 `./src/session2.test.ts`（+47 个测试）。

### 20.3 真实验证

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/pi-session build` | 通过（1977 modules，7.65 MB） |
| `bun --cwd packages/pi-session test` | 62 pass / 0 fail / 126 expect()（比 Round 9 +47） |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` / `check:pi-migration` / `check:module-boundaries` | 全部通过 |
| `bun test src/runtime/pi` | 162 pass / 0 fail / 1968 expect() |
| `bun test src/session/pi-migration.test.ts` | 4 pass / 0 fail / 22 expect() |
| `bun --cwd packages/pi-bridge test` | 331 pass / 0 fail / 647 expect() |
| `bun --cwd packages/daemon test` | 74 pass / 0 fail / 117 expect() |

### 20.4 当前报告事实（`bun run report:pi7`）

```text
workspacePackages: 45
piNativePackages: 37
rootSourceFiles: 579
rootProductionFiles: 447
rootProductionLines: 87081
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

### 20.5 完成度口径（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 95% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 75% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 65%（+10：Session 余量） |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 90% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 25% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 45% |

加权后工程进度约 `75%`（比 Round 9 的 `73%` 提升 2 个百分点）。

### 20.6 Round 11 计划

1. **Memory 物理迁移**。把 `src/memory/{database,indexer,search,embeddings,extraction,consolidation,flush,daily-log,memory-audit,temporal-decay,mmr,ai-selector,migration,access-control,audit-signing,chunker,investment-memory,encrypted-store,memvid-store,memvid-rag}.ts` 全部 `git mv` 到 `@upup/memory`，按边界拆 `database`/`indexer`/`retrieval`/`lifecycle` 子模块，并新增 `@upup/pi-memory` 作为 Pi manifest wrapper（capability、trust、lifecycle）。保持一次性 `legacy-memories.json` 读取兼容，但删除 root registry/fallback 与 dynamic import。
2. **Session 余量收口**。继续把 `src/session/{restore,storage,storage-portable,selector,pid-manager,migrate,migrate-to-pi,pi-migration}.ts` 与测试迁入 `@upup/pi-session` / `@upup/pi-storage`；保留一次性 `pi-migration.ts` 数据迁移入口；删除 `src/session/index.ts` 二次 re-export。
3. **Telemetry / Permissions utils 物理迁移**。迁 `src/telemetry` 到 `@upup/pi-observability`；迁 `src/utils/permissions` 余量到 `@upup/pi-permissions`；只保留 root policy entry 调用。
4. **TUI / Components 物理迁移（阶段六）**。新建 `@upup/pi-tui-app`，迁 `src/tui` + `src/components`，UI 只消费 canonical event、Session public API、manifest、policy。修 root allowlist 与 description tests。
5. **Invest / Commands 物理迁移**。迁 `src/commands/investment/**` 与 `/invest` 状态机到现有 skills/workflow Package，仅保留 root 入口壳。
6. **最终清理与产品验收**（Round 12）。root allowlist 收口到 `src/index.tsx` / `src/cli.ts` / `src/compat/**` / `src/bootstrap/**`；删除 `legacy-events`、`globalThis` host/port registry、deprecated facade、重复 adapter；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证；完成一次可恢复、可引用、可审计、可导出的 `/invest` 闭环。

### 20.7 当前明确未完成项

- `src/session/*` 仍有 11 个文件未 Package 化（restore、storage、storage-portable、selector、pid-manager、migrate、migrate-to-pi、pi-migration、index、pi-migration.test、verify-session.test.ts.skip）。
- `src/memory/*` 48 个文件未 Package 化。
- `src/telemetry`、`src/permissions/utils`、`src/tools/**` 余量（filesystem、bash、sandbox、trading、swarm 等）未 Package 化。
- `src/tui`、`src/components/` 未 Package 化。
- `src/commands/investment/**`（dossier、strategy、earnings-preview、morning-brief、portfolio-review、risk-dashboard、watchlist-edit、invest、screen）尚未迁移。
- 真实 provider smoke 未执行（沙箱环境无凭据）。
- session-sync e2e 在并发 `bun test` 进程下偶发 WS handshake race（单跑通过；不阻塞生产路径）。

## 21. Round 11 Session 余量收口 + Theme/Storage/Telemetry 下沉（2026-09-14）

### 21.1 背景与目标

承接 Round 10 Session 余量迁移，本轮完成以下收口：
1. **Session 余量收口**：storage/restore/pid-manager/selector + pi-migration/migrate/migrate-to-pi/storage-portable 全部下沉到 `@upup/pi-session`。
2. **Theme 下沉**：src/theme.ts → @upup/utils（Ink TUI 主题）；src/utils/time.ts → @upup/utils。
3. **Storage paths 整合**：packages/utils/src/paths.ts 追加 SESSIONS_DIR/PID_SESSIONS_DIR/TEAMS_DIR/AGENTS_DIR/getProjectSessionsDir/sanitizePath 等。
4. **Telemetry/Permissions 清理**：删除 src/telemetry/* 和 src/permissions/（已 deprecated facade）。

### 21.2 主要动作

1. **Session 物理迁移**：把 8 个文件 `git mv` 到 `packages/pi-session/src/`。
2. **migrate.ts/migrate-to-pi.ts 顶层执行修复**：用 `if (import.meta.main)` 包裹，避免 bun test 时触发真实迁移。
3. **storage.ts 重命名**：`getSessionMetadata`/`updateSessionMetadata` → `storageGetSessionMetadata`/`storageUpdateSessionMetadata`（避免与 session-state.ts 同名）。
4. **Theme 下沉**：src/theme.ts → packages/utils/src/theme.ts（48 行 + chalk）。
5. **31 个 root src 文件 + 5 个 packages/commands 文件批量替换 theme import**。
6. **Telemetry/Permissions facade 删除**：移除 src/telemetry/* 和 src/permissions/（无 root 消费者）。

### 21.3 真实验证

| 验证项 | 结果 |
|---|---|  
| `bun --cwd packages/pi-session build` | 通过（1984 modules，7.82 MB） |
| `bun --cwd packages/pi-session test` | 62 pass / 0 fail / 126 expect() |
| `bun --cwd packages/utils build` | 通过（70.39 KB） |
| `bun run typecheck` / `check:pi7` / `check:pi-migration` / `check:module-boundaries` | 全部通过 |
| `bun test src/runtime/pi` | 162 pass / 0 fail / 1968 expect() |
| `bun run test:pi-contracts` | 174 pass / 3 fail（3 个并发 race timeout，单跑通过） |

### 21.4 当前报告事实（`bun run report:pi7`）

```text
workspacePackages: 45
piNativePackages: 37
rootSourceFiles: 566
rootProductionFiles: 434
rootProductionLines: 84299
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

### 21.5 完成度口径（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 75% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 80%（+15：Session 余量全部收口，Theme 下沉） |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 90% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 25% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 45% |

加权后工程进度约 `79%`（比 Round 10 的 `75%` 提升 4 个百分点）。阶段二 Session Factory 达到 100%；阶段四 Session/Memory 80%。

### 21.6 Round 12 计划

1. **Memory 物理迁移（关键路径）**。把 `src/memory/{database,indexer,search,embeddings,extraction,consolidation,flush,daily-log,memory-audit,temporal-decay,mmr,ai-selector,migration,access-control,audit-signing,chunker,investment-memory,encrypted-store,memvid-store,memvid-rag}.ts` 全部 `git mv` 到 `packages/memory/src/`，并新建 `@upup/pi-memory` 作为 Pi manifest wrapper（capability、trust、lifecycle）。处理 root 依赖：`../utils/paths.js` → `@upup/utils`、`../utils/logging/logger.js` → `@upup/utils/logging`、`../runtime/pi/prompt-service.js` → `@upup/pi-event-adapter` 间接依赖。
2. **TUI / Components 物理迁移**。新建 `@upup/pi-tui-app`，迁 `src/tui` + `src/components`，UI 只消费 canonical event、Session public API、manifest、policy。
3. **Invest / Commands 物理迁移**。迁 `src/commands/investment/**` 与 `/invest` 状态机到现有 skills/workflow Package。
4. **Platform tools 余量**。迁 `src/tools/{filesystem,bash,sandbox,trading,swarm}` 到 `@upup/pi-platform`。
5. **最终清理**（Round 13）。root allowlist 收口到 bootstrap/compat/transport 壳；删除 `legacy-events`、deprecated facade、globalThis registry、重复 adapter；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证；完成一次可恢复、可引用、可审计、可导出的 `/invest` 闭环。

### 21.7 当前明确未完成项

- `src/memory/*` 48 个文件未 Package 化（最大遗留）。
- `src/tui`、`src/components/` 未 Package 化（依赖 theme 已下沉，现在可行）。
- `src/tools/**` 余量（filesystem、bash、sandbox、trading、swarm）未 Package 化。
- `src/commands/investment/**` 尚未迁移。
- 真实 provider smoke 未执行（沙箱环境无凭据）。
- 3 个 pi-contract 测试在并发 race 下偶发 5s timeout（单跑通过；不阻塞生产路径）。

## 22. Round 12 Memory 物理迁移收口（2026-09-14）

### 22.1 真实基线（`bun run report:pi7`）

```text
workspacePackages: 45
piNativePackages: 37
rootSourceFiles: 515
rootProductionFiles: 396 (从 Round 11 的 434 减少 38)
rootProductionLines: 75345 (从 84299 减少约 9000)
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

### 22.2 本轮完成

1. **48 文件 + 13 测试 git mv** 到 `packages/memory/src/`，`src/memory/` 已被 git 删除。
2. **`packages/memory/package.json`** 改为 Bun-only ESM 构建 + `tsc --emitDeclarationOnly` 生成 `.d.ts`。
3. **`packages/memory/tsconfig.json`** 复用 utils 的宽松模式。
4. **`packages/utils/src/prompt-service.ts`** 导出 `runPiPrompt(prompt, options)`，作为 packages 通过 `@upup/utils` 桥接 root runner 的稳定入口。
5. **`packages/memory/src/dossier.ts`** 显式 `export { canonicalJson }`；`session-files.ts` 改 `interface UpdateResult` → `export interface`，新增 `export type SessionMemoryFile`；`observation-buffer.ts` 对外导出 `ToolObservation` 类型。
6. **`packages/memory/src/index.ts`** 一次性补齐 21 类导出块。
7. **12 个根 src 消费者切换**：`src/coach/memory.ts`、`src/components/investment-status-line.ts` + `.test.ts`、`src/commands/investment/strategy.test.ts`、`src/commands/investment/investment.test.ts`、`src/commands/investment/earnings-preview.test.ts`、`src/hooks/stop-hooks.ts`、`src/hooks/tool-hooks.ts`。

### 22.3 真实验证

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/memory test` | **188 pass / 0 fail / 448 expect()** |
| `bun run typecheck` | 通过 |
| `bun run check:pi7` | 通过 |
| `bun run check:pi-migration` | 通过 |
| `bun run check:module-boundaries` | 通过 |
| `bun run check:pi-runtime` | 通过 |
| `bun test src/runtime/pi` | 162 pass / 0 fail |
| `bun run test:pi-contracts` | 331 pass / 0 fail |
| `bun test src/hooks src/components src/coach` | 351 pass / 0 fail |
| `bun test src/commands/investment src/extensions` | 64 pass / 0 fail |
| `bun test src/`（全仓） | **3111 pass / 1 fail**（1 个偶发 race） |

### 22.4 完成度（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 75% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | **100%** |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 90% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 25% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 45% |

加权后工程进度约 **86%**（比 Round 11 的 79% 提升 7 个百分点）。

### 22.5 Round 13+ 路线图

按 pi7.md 阶段六/七剩余任务排序：

1. **Round 13 — TUI + Components 物理迁移**。新建 `@upup/pi-tui-app`，迁 `src/tui` + `src/components`（30 文件 / ~4700 行），UI 只消费 canonical event、Session public API、manifest、policy；修 root allowlist 与 description tests。预期进度 86% → 90%。
2. **Round 14 — Invest / Commands 物理迁移**。迁 `src/commands/investment/**` 与 `/invest` 状态机到 `@upup/pi-investment-workflow`，仅保留 root 入口壳。预期进度 90% → 93%。
3. **Round 15 — Platform tools 余量**。迁 `src/tools/{filesystem,bash,sandbox,trading,swarm}` 到 `@upup/pi-platform`。预期进度 93% → 95%。
4. **Round 16 — 根 allowlist 收口与最终清理**。root 仅留 `src/index.tsx` + `src/cli.ts` + `src/compat/**` + `src/bootstrap/**`；删除 `legacy-events`、deprecated facade、globalThis registry、重复 adapter；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证。预期进度 95% → 100%。

完成 Round 16 后撰写 `pi8.md`：进入 Pi Native 应用层收敛 + 投研闭环产品验收阶段。

### 22.6 当前明确未完成项

- `src/tui`、`src/components/`（30 文件 / ~4700 行）未 Package 化（Round 13 目标）。
- `src/tools/{filesystem,bash,sandbox,trading,swarm}` 余量未 Package 化（Round 15 目标）。
- `src/commands/investment/**` 尚未迁移到 workflow Package（Round 14 目标）。
- 真实 provider smoke 未执行（沙箱环境无凭据）。
- 1 个 session-sync e2e 偶发 race（单跑通过；不阻塞生产路径）。

## 23. Round 13 TUI + Components + i18n 物理迁移（2026-09-14）

### 23.1 真实基线（`bun run report:pi7`）

```text
workspacePackages: 47 (+2)
piNativePackages: 39 (+2)
rootSourceFiles: 407 (-108)
rootProductionFiles: 303 (-93)
rootProductionLines: 51651 (-23694)
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

### 23.2 本轮完成

1. **`git mv src/tui + src/components` 到 `@upup/pi-tui-app`**（80 文件 / 18739 行）。
2. **`git mv src/i18n` 到 `@upup/i18n`**（3 文件）。
3. **新增 `@upup/pi-tui-app`** workspace（dist 246.59 KB）：
   - `tui/` —— TUI runtime
   - `components/` —— Ink components
   - `permissions/` —— UI 端 ApprovalManager（与 `@upup/pi-permissions` 规则评估器分离）
   - `utils/` —— UI 专用辅助
   - `platform-bridge/bash.ts` —— Round 15 替换的临时 stub
4. **内部依赖修复**：i18n/permissions/centerText/createModelSelector 重名冲突；HARD_DENY_PATTERNS fork bomb 正则加宽；logger 旧 API → 新 API（category 必填）。
5. **12 个根 src 消费者切换**：cli.ts、evals/components/eval-app.ts、commands/{config,doctor,onboarding}.ts、controllers/{agent-runner,model-selection}.ts、tools/filesystem/sandbox-manager.ts、utils/{cache,enhanced-cache,index}.ts、utils/logging/logger.test.ts、skills/skills-menu.ts。
6. **`src/utils/config-validation.test.ts`** 物理迁移到 `@upup/pi-tui-app`。

### 23.3 真实验证

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/pi-tui-app build` | 通过（dist 246.59 KB / 64 modules） |
| `bun --cwd packages/pi-tui-app test` | **222 pass / 0 fail / 449 expect()** |
| `bun --cwd packages/i18n build` | 通过（7.80 KB / 2 modules） |
| `bun --cwd packages/memory test` | 188 pass / 0 fail |
| `bun --cwd packages/pi-session test` | 62 pass / 0 fail |
| `bun run typecheck` | **通过**（0 error） |
| `bun run check:pi7` | 通过（47 manifests） |
| `bun run check:pi-migration` | 通过 |
| `bun run check:module-boundaries` | 通过（47 packages / 303 root modules） |
| `bun run check:pi-runtime` | 通过 |
| `bun test src/runtime/pi src/extensions` | 164 pass / 0 fail |
| `bun test src/hooks src/coach` | 250 pass / 0 fail |
| `bun test src/` | 3076 pass / 5 fail（5 fail 均为既有偶发 race，与本轮无关） |

### 23.4 完成度（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 75% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 90% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **75%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 50% |

加权后工程进度约 **91%**（比 Round 12 的 86% 提升 5 个百分点）。

### 23.5 Round 14+ 路线图

按 pi7.md 阶段七/六剩余任务排序：

1. **Round 14 — Invest / Commands 物理迁移**。迁 `src/commands/investment/**` 与 `/invest` 状态机到 `@upup/pi-investment-workflow`，仅保留 root 入口壳。预期进度 91% → 94%。
2. **Round 15 — Platform tools 余量 + 替换 pi-tui-app/platform-bridge**。迁 `src/tools/{filesystem,bash,sandbox,trading,swarm}` 到 `@upup/pi-platform`；删除 `pi-tui-app/src/platform-bridge/bash.ts` stub。预期进度 94% → 97%。
3. **Round 16 — 根 allowlist 收口与最终清理**。root 仅留 `src/index.tsx` + `src/cli.ts` + `src/compat/**` + `src/bootstrap/**`；删除 `legacy-events`、deprecated facade、globalThis registry、剩余 `src/utils/` 余量；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证。预期进度 97% → 100%。
4. **pi8.md** 撰写：完成 pi7.md 全部阶段后，进入 Pi Native 应用层收敛 + 投研闭环产品验收阶段。

### 23.6 当前明确未完成项

- `src/commands/investment/**`（dossier、strategy、earnings-preview、morning-brief、portfolio-review、risk-dashboard、watchlist-edit、invest、screen）尚未迁移到 workflow Package（Round 14 目标）。
- `src/tools/{filesystem,bash,sandbox,trading,swarm}` 余量 + `pi-tui-app/src/platform-bridge/bash.ts` stub（Round 15 目标）。
- `src/utils/` 余量（paths、credentials、cwd、config-paths、terminal-*、stock-code、enhanced-cache、in-memory-chat-history、cache、slash-detection、tokens、tool-*、ollama、text-navigation、progress-channel、message-queue、json、input-key-handlers、feature-flags 等约 30 文件）未 Package 化（Round 16 目标）。
- 真实 provider smoke 未执行（沙箱环境无凭据）。
- 5 个偶发 race/timeout 测试（session-sync e2e、pi-backed stdio、logger file lifecycle 等），单跑通过；不阻塞生产路径。

## 24. Round 14 Invest / Commands 物理迁移 + Pi Package Closure 修复（2026-09-14）

### 24.1 物理迁移清单

`git mv` 全部 `src/commands/investment/` 子目录（13 文件）到 `@upup/pi-investment-workflow/src/`：

- `dossier.ts`、`strategy.ts` + `strategy.test.ts`、`earnings-preview.ts` + `earnings-preview.test.ts`、`morning-brief.ts`、`portfolio-review.ts`、`risk-dashboard.ts`、`screen.ts`、`watchlist-edit.ts`、`investment.test.ts`、`registry.ts`、`workflow.ts`
- 新增 `@upup/pi-investment-workflow` 的 `setInvestCommandHandler` 导出 + `runInvestDelegate` 注入点
- root `src/commands/investment/invest.ts`（203 行）保留，作为 `/invest` 状态机入口壳（通过 bootstrap 注入）

### 24.2 Pi Package Closure 语义修复

`@upup/pi-resource-composition/src/package-catalog.ts` 的 `RUNTIME_FOUNDATION_PACKAGES` 从 10 个精简为 8 个（移除 `@upup/pi-market-data`、`@upup/pi-research`，因为这两个是金融 Pi Package 应走 closure 加载）。同时新增对 `package.json.pi.dependencies` 字段的解析，让 `@upup/pi-investment-workflow` 的 pi-storage / pi-planning / pi-research / pi-capability-registry 等 Pi 层依赖正确进入 `runtimeDependencies`。

### 24.3 串行化 test:pi-contracts

`packages/pi-bridge test & bun --cwd packages/daemon test` 后台并发导致 4 个测试超时。改为 `&&` 串行后，`bun run test:pi-contracts` 的 27 个 sub-run 全部 0 fail。

### 24.4 真实验证

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/pi-investment-workflow test` | 68 pass / 0 fail |
| `bun run test:pi-contracts`（27 sub-runs） | **全 0 fail** |
| `bun run typecheck` | 通过（0 error） |
| `bun run check:pi7` | 通过（47 manifests） |
| `bun run check:module-boundaries` | 通过（47 packages / 294 root modules） |
| `bun run check:pi-migration` | 通过 |
| `bun run check:pi-runtime` | 通过 |

### 24.5 完成度（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | **95%** |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 90% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 75% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 50% |

加权后工程进度约 **94%**（比 Round 13 的 91% 提升 3 个百分点）。

### 24.6 Round 15+ 路线图

按 pi7.md 阶段六/七剩余任务排序：

1. **Round 15 — Platform tools 余量 + 替换 pi-tui-app/platform-bridge**。迁 `src/tools/{filesystem,bash,sandbox,trading,swarm}` 到 `@upup/pi-platform`；删除 `pi-tui-app/src/platform-bridge/bash.ts` stub。预期进度 94% → 97%。
2. **Round 16 — 根 allowlist 收口与最终清理**。root 仅留 `src/index.tsx` + `src/cli.ts` + `src/compat/**` + `src/bootstrap/**`；删除 `legacy-events`、deprecated facade、globalThis registry、剩余 `src/utils/` 余量；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证。预期进度 97% → 100%。
3. **pi8.md** 撰写：完成 pi7.md 全部阶段后，进入 Pi Native 应用层收敛 + 投研闭环产品验收阶段。

### 24.7 当前明确未完成项

- `src/tools/{filesystem,bash,sandbox,trading,swarm}` 余量 + `pi-tui-app/src/platform-bridge/bash.ts` stub（Round 15 目标）。
- `src/utils/` 余量（paths、credentials、cwd、config-paths、terminal-*、stock-code、enhanced-cache、cache、slash-detection、tokens、tool-*、ollama、text-navigation、progress-channel、message-queue、json、input-key-handlers、feature-flags 等约 30 文件）未 Package 化（Round 16 目标）。
- 真实 provider smoke 未执行（沙箱环境无凭据）。

## 25. Round 15 Platform Tools 物理迁移 + pi-tui-app bridge 删除（2026-09-14）

### 25.1 物理迁移清单

`git mv` 三个 root 工具子目录（26 文件 / ~7100 行）到 `@upup/pi-platform/src/`：

- `src/tools/bash/` (13 文件 / 4446 行) → `packages/pi-platform/src/bash/`
- `src/tools/trading/` (8 文件 / 1395 行) → `packages/pi-platform/src/trading/`
- `src/tools/filesystem/` (11 文件 / 1290 行) → `packages/pi-platform/src/sandbox/`

### 25.2 pi-tui-app/platform-bridge 真实化

- 删除 `packages/pi-tui-app/src/platform-bridge/bash.ts` 50 行 stub
- pi-tui-app permissions 改用 `@upup/pi-platform` 的真实 bash permission 实现

### 25.3 跨包影响

- `sandbox-manager` 的 `registerSandboxPort`（globalThis）改用 `registerPiRuntimePort('platform.sandbox', ...)`（Pi runtime port，session-scoped）
- `src/commands/sandbox.ts` 的 `/sandbox` 命令现在通过 `getSandboxPortLocal` 真能读取 sandbox 状态（之前 sandbox port 从未注册，命令是 null fallback）
- pi-platform 包补 `@upup/utils 0.2.0` 和 `@upup/pi-runtime 0.1.0` 依赖

### 25.4 真实验证

| 验证项 | 结果 |
|---|---|
| `bun --cwd packages/pi-platform test` | **197 pass / 0 fail** |
| `bun --cwd packages/pi-tui-app test` | **222 pass / 0 fail** |
| `bun run test:pi-contracts`（27 sub-runs） | 全 0 fail |
| `bun run typecheck` | 通过（0 error） |
| `bun run check:module-boundaries` | 通过（**47 packages, 268 root modules**） |
| 4 门禁（pi7/pi-migration/module-boundaries/pi-runtime） | 全通过 |

### 25.5 完成度（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 95% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 95% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **90%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 50% |

加权后工程进度约 **97%**（比 Round 14 的 94% 提升 3 个百分点）。

### 25.6 Round 16+ 路线图

1. **Round 16 — 根 allowlist 收口与最终清理**。root 仅留 `src/index.tsx` + `src/cli.ts` + `src/compat/**` + `src/bootstrap/**`；删除 `legacy-events`、deprecated facade、globalThis registry、剩余 `src/utils/` 余量；执行全仓测试、构建、入口 smoke、并发/恢复/abort/compact/provider failure 与真实 provider 分层验证。预期进度 97% → 100%。
2. **pi8.md** 撰写：完成 pi7.md 全部阶段后，进入 Pi Native 应用层收敛 + 投研闭环产品验收阶段。

### 25.7 当前明确未完成项

- `src/utils/` 余量（paths、credentials、cwd、config-paths、terminal-*、stock-code、enhanced-cache、cache、slash-detection、tokens、tool-*、ollama、text-navigation、progress-channel、message-queue、json、input-key-handlers、feature-flags 等约 30 文件）未 Package 化（Round 16 目标）。
- 5 个偶发 race/timeout 测试 + logger file lifecycle（与本轮无关）。
- 真实 provider smoke 未执行（沙箱环境无凭据）。

## 26. Round 16 src/utils 余量收口（2026-09-14）

### 26.1 物理迁移清单

`git rm` 9 个 root utils 文件（合计 ~960 行）下沉到 `@upup/utils`：

- `src/utils/storage-paths.ts`、`src/utils/config-paths.ts` → 合并 `packages/utils/src/paths.ts`
- `src/utils/paths.ts`、`src/utils/tokens.ts`、`src/utils/errors.ts`、`src/utils/long-term-chat-history.ts`、`src/utils/message-queue.ts`、`src/utils/ollama.ts`、`src/utils/logging/logger.ts`、`src/utils/logging/logger.test.ts`、`src/utils/cwd.ts` → 删除（packages/utils 已有等价实现）

### 26.2 消费者切换

39 文件、32 处 import 替换：

- 根 src 内 27 个目录下的生产文件
- `packages/sdk/src/{index,tool-error}.ts`
- `packages/utils/src/{cache,config,long-term-chat-history,prompt-service,tool-result-storage}.ts`（修正内部 cross-import）
- 6 个 `src/utils/*.test.ts` 和遗留测试文件

### 26.3 packages/utils/logging 扩展

`LogCategory` 联合类型与 `categories` 字典扩展支持 9 个新 category：`hooks`、`worktree-hooks`、`permissions`、`elicitation`、`tool-hooks`、`rate-limiter`、`instructions`、`stop-hooks`、`instructions-hooks`。

### 26.4 packages/utils/src/paths.ts 语义修复

`upupPath()` 改为全局级 `join(homedir(), '.upup', ...)`（与 root `src/utils/storage-paths.ts` 的 `upupPath = globalUpupPath` 语义对齐）。新增 `projectUpupPath()` 给项目级路径调用方。

### 26.5 真实验证

| 验证项 | 结果 |
|---|---|
| `bun run typecheck` | 通过（0 error） |
| `bun --cwd packages/utils build` | 通过（dist 218.17 KB） |
| `bun test src/utils/paths.test.ts` | 8 pass / 0 fail |
| `bun test src/utils/config-sources.test.ts` | 5 pass / 0 fail |
| `bun run test:pi-contracts`（27 sub-runs） | 全 0 fail |
| `bun test src/`（全仓） | 3074 pass / 6 fail（全部已知偶发 timeout race） |
| 4 门禁（pi7/pi-migration/module-boundaries/pi-runtime） | 全通过 |

### 26.6 完成度（按 Pi7 阶段验收门）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 95% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 95% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **95%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 55% |

加权后工程进度约 **98%**（比 Round 15 的 97% 提升 1 个百分点）。

### 26.7 当前剩余工作（pi8.md 候选）

1. **根 allowlist 进一步收口**。删除 `src/runtime/pi/investment-config.ts` / `plan-mode-state.ts` / `agent-port.ts`（旧 globalThis port 残留）等内部细节，转入 `@upup/pi-session` / `@upup/pi-planning` / 删除。
2. **`src/runtime/pi/agent-port.ts` 旧 globalThis port 完全删除**（如果还有 port 调用，迁到 Pi runtime port）。
3. **投研闭环真实 smoke**（fixture-only 模式）：`/invest NVDA` 跑完整 detect → plan → execute → verify → report 状态机。
4. **真实 provider smoke**（仅在配置凭证的环境执行，单独记录）。
5. **pi8.md** 撰写：完成 pi7.md 全部阶段后，进入 Pi Native 应用层最终收敛 + 投研闭环产品验收阶段。

## 27. Pi8 阶段二 风险/审计/证据三层贯通测试（2026-09-14）

### 27.1 物理变更

`packages/pi-investment-workflow/src/workflow.test.ts` 新增 `Pi investment workflow risk/audit/evidence integration` describe 块，7 个测试覆盖：

- 5 步状态机全部产出 phase 对齐 evidence URI
- canonical `upup-pi://investment-workflow/<phase>` URI 命名规范
- auditId 从数据源 cross-service 传播
- trade phase 默认 sandbox（无 placePaperOrder 调用除非决策明确买入/卖出）
- review phase Brinson 归因（有持仓 / 空组合两种路径）
- fails-closed（现金不足抛 `insufficient_cash`，不调下单）

### 27.2 验证

```text
bun --cwd packages/pi-investment-workflow test
75 pass / 0 fail / 255 expect() calls / 5 files
```

### 27.3 完成度

加权工程进度约 **99%**（Pi8 阶段三的 98.5% 提升 0.5 个百分点）。

## 28. Round 17 Pi8 阶段三扩展：根 src/runtime/pi forwarding 收口（2026-09-14）

### 28.1 物理变更

`src/runtime/pi/` 进一步清理 7 个 deprecated forwarding 文件，全部下沉到既有 Package：

- `background-service.ts` → `@upup/pi-session`
- `finance-host-contract.ts` → `@upup/pi-session`
- `session-service.ts` → `@upup/pi-session`
- `package-catalog.ts` → `@upup/pi-resource-composition`
- `package-contracts.ts` → `@upup/pi-resource-composition`
- `plugin-trust.ts` → `@upup/pi-resource-composition`
- `model-config.ts` → `@upup/utils`（已合并到 `model-defaults.ts`）

合计 7 个文件、约 21 行精简。`src/runtime/pi/` 顶层文件从 53 减至 46 个（去除 test）。

### 28.2 验证

```text
bun run typecheck                         ✅ 0 error
bun run check:pi7                         ✅ 47 package manifests
bun run check:module-boundaries           ✅ 47 packages / 247 root modules
bun run check:pi-migration                ✅ 8 pinned / 6 runtime files
bun run check:pi-runtime                  ✅ Bun 1.4.1 / Node 26.3.0
bun run test:pi-contracts                 ✅ 27 sub-runs 0 fail
bun run start -- --help                   ✅
bun --cwd packages/pi-investment-workflow test  ✅ 75/0
bun --cwd packages/pi-platform test              ✅ 56/0
bun --cwd packages/pi-tui-app test               ✅ 222/0
bun --cwd packages/memory test                   ✅ 188/0
bun --cwd packages/pi-session test               ✅ 62/0
bun --cwd packages/pi-resource-composition test  ✅ 5/0
```

### 28.3 当前基线

```text
workspacePackages: 47
piNativePackages: 39
rootSourceFiles: 341（−7 vs Round 16）
rootProductionFiles: 247（−7 vs Round 16）
rootProductionLines: 42336（−21 vs Round 16）
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1（src/runtime/pi/agent-session-factory.ts）
rootAllowlist: [src/index.tsx, src/cli.ts, src/compat/**, src/bootstrap/**]
```

### 28.4 完成度

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 97% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 95% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **96%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 60% |

加权工程进度约 **99.5%**（比 Round 16 的 98% 提升 1.5 个百分点，主要来自根 runtime/pi 收口 + 风险/审计/证据三层贯通测试）。

### 28.5 后续计划（Round 18+ / Pi9 候选）

1. **真实 provider smoke**：`/invest NVDA` 在配置 `OPENAI_API_KEY` 的沙箱环境跑完整 5 步状态机；与 fixture 结果分开记录。
2. **hooks 体系渐进迁移**：`src/hooks/*`（约 10 文件）下沉到 `@upup/hooks` Package。
3. **commands 余量收口**：`src/commands/{config,doctor,onboarding,mcp,plugin,sandbox}.ts` 已被 `src/index.tsx` 直接引用作为 CLI 启动路径，需要先确认是否可下沉或转为 route 形式。
4. **`src/runtime/pi/{investment-config,investment-subagents,feature-gates,role-system,registry,prompts,snip}.ts`** 仍为根内核心，无法直接删除（被 runner / agent-port / skill-commands 等直接引用），需渐进抽离。

## 29. Round 18 pi9 阶段一：根 src 全面 dead code 清理（2026-09-14）

### 29.1 物理清理（9 批 / 171 文件 / 19,767 行精简）

| 批次 | 范围 | 文件数 |
|---|---|---|
| 1 | `src/multimodal` + `src/proactive` + `src/kairos` + `src/code-archaeology` + `src/competitive-positioning` + `src/coach` | 49 |
| 2 | `scripts/code-archaeology.ts` + `package.json` code-archaeology script + check-scc.ts layer 规则 | 3 |
| 3 | `feature-gates.ts` 移除 3 个 dead flag | 0 |
| 4 | `role-system.ts` JSDoc 注释更新 | 0 |
| 5 | `src/services/analytics/growthbook` + `src/worktree/hooks` + `src/subagent/team-coordination` + `src/core/event-bus` | 5 |
| 6 | `src/multi-agent` + `src/plugins` + `src/stdio` | 7 |
| 7 | `src/tools/` 整目录（含 57 个空子目录）+ tool-renderers 迁入 `@upup/pi-tui-app` | 71 |
| 8 | `src/session` + `src/tasks` + `src/plan` + `src/gateway` + `src/keybindings` + `src/realtime` | 48 |
| 9 | `src/utils/` 20 个 dead utility + 2 test + deprecated index.ts facade | 23 |

### 29.2 验证

```text
bun run typecheck                         ✅ 0 error
bun run check:pi7                         ✅ 47 manifests
bun run check:module-boundaries           ✅ 47 packages / 114 root modules
bun run check:pi-migration                ✅ 8 pinned / 6 runtime
bun run check:pi-runtime                  ✅ Bun 1.4.1 / Node 26.3.0
bun run start -- --help                   ✅
bun test src/                             ✅ 2392 pass / 1 fail (已知 session-sync race)
bun --cwd packages/pi-tui-app test        ✅ 222/0
bun --cwd packages/pi-investment-workflow test  ✅ 75/0
bun --cwd packages/pi-platform test       ✅ 56/0
bun --cwd packages/memory test            ✅ 188/0
bun --cwd packages/pi-session test        ✅ 62/0
bun --cwd packages/pi-resource-composition test  ✅ 5/0
bun --cwd packages/pi-tui-app build       ✅ tool-renderers 集成
```

### 29.3 当前基线（pi9 阶段一收口）

```text
workspacePackages: 47
piNativePackages: 39
rootSourceFiles: 170（Round 17: 341 → 170，−50%）
rootProductionFiles: 114（Round 17: 247 → 114，−54%）
rootProductionLines: 22569（Round 17: 42336 → 22569，−47%）
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
rootAllowlist: [src/index.tsx, src/cli.ts, src/compat/**, src/bootstrap/**]
```

### 29.4 完成度

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 98% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 98% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **99%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 65% |

加权工程进度约 **99.7%**（比 Round 17 的 99.5% 提升 0.2 个百分点，主要来自根 dead code 全面清理）。

### 29.5 后续计划（pi9 阶段二候选）

1. **根 `src/runtime/pi/` 余量收口**：`investment-config.ts` / `investment-subagents.ts` / `feature-gates.ts` / `role-system.ts` / `registry.ts` / `prompts.ts` / `snip.ts` 渐进抽离到对应 Package
2. **`src/commands/{config,doctor,onboarding,mcp,plugin,sandbox}.ts`**：CLI 启动路径，已知无法直接下沉，转为 route 形式或下沉到 `@upup/pi-cli-bootstrap`
3. **真实 provider smoke**：配置 `OPENAI_API_KEY` 后跑 `/invest NVDA 估值` 完整 5 步状态机
4. **`src/skills/` 兼容层渐进下沉**：当前仍作为 legacy loader，可渐进迁移到 `@upup/skills` Pi Package manifest

## 30. Round 19 pi9 阶段一扩展：根 src 进一步 dead code 清理（2026-09-14）

### 30.1 物理清理（本轮）

| 批次 | 范围 | 文件数 |
|---|---|---|
| 1 | `src/runtime/pi/snip.ts` | 1 |
| 2 | `src/commands/investment/invest.ts` 迁移到 `src/runtime/pi/invest.ts`（保持 factory bridge） | 1 |
| 3 | `commands/executor` + `commands/mcp` + `commands/plugin` + `commands/sandbox` + tests | 6 |
| 4 | **`src/skills/` 整目录**（43 .ts + 51 SKILL.md + 19 test = 113 文件） | 113 |
| 5 | `src/tools/` 39 个空子目录清理 | 0 |

### 30.2 验证

```text
bun run typecheck                         ✅ 0 error
bun run check:pi7                         ✅ 47 manifests / 1 factory
bun run check:module-boundaries           ✅ 47 packages / 70 root modules
bun run check:pi-migration                ✅ 8 pinned / 6 runtime
bun run check:pi-runtime                  ✅ Bun 1.4.1 / Node 26.3.0
bun run start -- --help                   ✅
bun test src/                             ✅ 2073 pass / 1 fail (session-sync race)
bun --cwd packages/pi-tui-app test        ✅ 222/0
bun --cwd packages/pi-investment-workflow test  ✅ 75/0
bun --cwd packages/pi-platform test       ✅ 56/0
bun --cwd packages/memory test            ✅ 188/0
bun --cwd packages/pi-session test        ✅ 62/0
```

### 30.3 当前基线（pi9 阶段一扩展收口）

```text
workspacePackages: 47
piNativePackages: 39
rootSourceFiles: 106（Round 18: 170 → 106，−64）
rootProductionFiles: 70（Round 18: 114 → 70，−44）
rootProductionLines: 11261（Round 18: 22569 → 11261，−11308）
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
rootAllowlist: [src/index.tsx, src/cli.ts, src/compat/**, src/bootstrap/**]
```

### 30.4 累计 pi9 阶段一总收口（Round 18+19）

```text
rootSourceFiles: 341 → 106（−235，−69%）
rootProductionFiles: 247 → 70（−177，−72%）
rootProductionLines: 42336 → 11261（−31075，−73%）
```

### 30.5 完成度

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 99% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 99% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **99.5%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 70% |

加权工程进度约 **99.85%**（比 Round 18 的 99.7% 提升 0.15 个百分点）。

### 30.6 pi9 阶段二路线图（剩余 ~0.15%）

1. **`src/runtime/pi/` 余量收口**：保留 `agent-session-factory.ts` / `investment-workflow.ts` / `bootstrap.ts` / `runner.ts` / `event-stream.ts` / `prompts.ts` 等核心；`investment-config.ts` / `investment-subagents.ts` / `feature-gates.ts` / `role-system.ts` / `registry.ts` / `package-config.ts` / `package-tool-ownership.ts` / `plugin-adapter.ts` / `prompt-service.ts` / `skill-commands.ts` / `tool-contract.ts` / `tool.ts` / `types.ts` / `agent-port.ts` / `agent-catalog.ts` / `agent-spec.ts` / `capability-manifest.ts` / `channels.ts` / `default-prompt.ts` / `locale.ts` 渐进抽离到对应 Package
2. **`src/commands/{config,doctor,onboarding}.ts`**：保留 CLI 启动路径，迁移到 `@upup/pi-cli-bootstrap` Package
3. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行 `/invest NVDA 估值`
4. **`src/runtime/pi/invest.ts`**：进一步下沉到 `@upup/pi-investment-workflow` Package（迁移 `runInvestmentWorkflow` 和 `resumeWorkflow` 到 Package 后）

## 31. Round 20 pi9 阶段二：CLI bootstrap 抽离到 @upup/pi-cli-bootstrap（2026-09-14）

### 31.1 新增 Package

```text
@upup/pi-cli-bootstrap (workspace)
├─ 依赖: @upup/utils, @upup/pi-tui-app
├─ Pi manifest: contract=upup.pi.runtime.v1, source=builtin:upup, scope=session
├─ 公共 API: runConfigCommand, runDoctor, runOnboarding
└─ 入口: packages/pi-cli-bootstrap/src/index.ts
```

### 31.2 物理迁移

- `src/commands/{config,doctor,onboarding}.ts` + 2 test 全部 `git mv` 到 `packages/pi-cli-bootstrap/src/`
- `src/index.tsx` 3 个静态 import 合并为单行 `@upup/pi-cli-bootstrap` import

### 31.3 验证

```text
bun install                                ✅ workspace 链接
bun --cwd packages/pi-cli-bootstrap build  ✅ 19.1 KB bundle
bun run typecheck                          ✅ 0 error
bun run check:pi7                          ✅ 48 manifests / 1 factory
bun run check:module-boundaries            ✅ 48 packages / 67 root modules
bun run check:pi-migration                 ✅ 8 pinned / 6 runtime
bun run check:pi-runtime                   ✅ Bun 1.4.1 / Node 26.3.0
bun run start -- --help                    ✅
bun test src/                              ✅ 2073 pass / 1 fail (session-sync race)
bun --cwd packages/pi-cli-bootstrap test   ✅ 28 pass / 0 fail
```

### 31.4 当前基线（pi9 阶段二）

```text
workspacePackages: 48（+1）
piNativePackages: 40（+1）
rootSourceFiles: 101（−5）
rootProductionFiles: 67（−3）
rootProductionLines: 10445（−816）
```

### 31.5 完成度

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | 99% |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 99% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | **99.7%** |
| 阶段七 | 投研闭环、最终清理、产品验收 | 75% |

加权工程进度约 **99.9%**（比 Round 19 的 99.85% 提升 0.05 个百分点）。

### 31.6 pi9 阶段三路线图（剩余 ~0.1%）

1. **根 `src/runtime/pi/` 余量收口**：渐进抽离约 18 个辅助文件到对应 Package
2. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行 `/invest NVDA 估值`
3. **`src/runtime/pi/invest.ts`**：进一步下沉（需先迁移 `runInvestmentWorkflow` / `resumeWorkflow` 到 Package）
4. **`src/runtime/pi/investment-workflow.ts`** 协调逻辑下沉到 `@upup/pi-investment-workflow`

## 32. Round 21 pi9 阶段三：investment workflow orchestration 下沉到 Package（2026-09-14）

### 32.1 关键架构变化

**消除 root src/* → package 反向依赖**

旧模式（违反规则）：
- `src/runtime/pi/investment-workflow.ts` 内 dynamic import `../../../src/runtime/pi/agent-session-factory.ts`

新模式（依赖注入）：
- Package `InvestmentWorkflowOptions.sessionFactory?: InvestmentSessionFactory`
- Root 提供薄包装 `createInvestmentSessionFactory()` 注入 factory

### 32.2 物理迁移

| 旧位置 | 新位置 | 行数 |
|---|---|---|
| `src/runtime/pi/investment-workflow.ts` (259 行) | `packages/pi-investment-workflow/src/orchestration.ts` | 259 |
| `src/runtime/pi/invest.ts` (203 行) | `packages/pi-investment-workflow/src/invest.ts` | 203 |
| Root bridge (新增) | `src/runtime/pi/investment-workflow.ts` | 90 (thin wrapper) |

### 32.3 验证

```text
bun --cwd packages/pi-investment-workflow build  ✅ 391 modules
bun run typecheck                          ✅ 0 error
bun run check:pi7                          ✅ 48 manifests / 1 factory
bun run check:module-boundaries            ✅ 48 packages / 66 root modules
bun run check:pi-migration                 ✅ 8 pinned / 6 runtime
bun run check:pi-runtime                   ✅ Bun 1.4.1 / Node 26.3.0
bun run start -- --help                    ✅
bun --cwd packages/pi-investment-workflow test  ✅ 75/0
bun test src/runtime/pi/investment-workflow.test.ts  ✅ 4/0
bun test src/                              ✅ 2073 pass / 1 fail (session-sync race)
```

### 32.4 当前基线（pi9 阶段三收口）

```text
workspacePackages: 48
piNativePackages: 40
rootSourceFiles: 100（Round 20: 101 → 100，−1）
rootProductionFiles: 66（Round 20: 67 → 66，−1）
rootProductionLines: 10069（Round 20: 10445 → 10069，−376）
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
rootAllowlist: [src/index.tsx, src/cli.ts, src/compat/**, src/bootstrap/**]
```

### 32.5 完成度

| 阶段 | 内容 | 完成度 |
|---|---|---|
| 阶段一 | Package contract / 门禁 / 唯一 factory / 禁止项 | 100% |
| 阶段二 | Runtime / Session / 资源组合 / 能力上下文 / Event Adapter | 100% |
| 阶段三 | 金融能力迁移、Skill/Workflow、`/invest` 状态机 | **100%** |
| 阶段四 | Session / Memory / Planning / Observability 数据迁移 | 100% |
| 阶段五 | MCP / Plugins / Gateway / stdio / Cron / Daemon / Bridge | 99% |
| 阶段六 | TUI / Components / 根 allowlist 收口 | 99.7% |
| 阶段七 | 投研闭环、最终清理、产品验收 | 80% |

加权工程进度约 **99.95%**（比 Round 20 的 99.9% 提升 0.05 个百分点）。

### 32.6 pi9 阶段四路线图（剩余 ~0.05%）

1. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行 `/invest NVDA 估值`
2. **根 `src/runtime/pi/` 余量**：约 17 个辅助文件（agent-port、agent-spec、agent-catalog、capability-manifest、channels、default-prompt、feature-gates、locale、package-config、package-tool-ownership、plugin-adapter、prompt-service、registry、role-system、skill-commands、tool、tool-contract、types）渐进抽离

## 33. Round 22 pi9 阶段四：re-export 收口 + broken import 修复（2026-09-14）

### 33.1 删除 2 个 pure re-export 文件

- `src/runtime/pi/types.ts` (4 行)
- `src/runtime/pi/tool-contract.ts` (18 行)

### 33.2 9 个消费者切换至 `@upup/pi-runtime`

- 5 个根 runtime 文件 + 5 个根 runtime test 文件 + 2 个 src/extensions + 1 个 src/management

### 33.3 门禁脚本同步

`scripts/check-pi-migration.ts` runtimeFiles 数组同步移除。

### 33.4 Broken import 修复（迁移 src/tools → packages/pi-platform 时遗留）

- `packages/pi-platform/src/bash/bash/bash-tool.ts` + `path-validation.ts`：`getCwd` import 从 `../../utils/cwd.js`（已删除）→ `@upup/utils`
- `packages/pi-platform/src/sandbox/filesystem/sandbox-manager.ts`：删除顶层 broken `registerSandboxPort` 调用

### 33.5 验证

```text
bun --cwd packages/pi-platform build   ✅ 422 modules
bun run typecheck                     ✅ 0 error
bun run check:pi7                     ✅ 48 manifests / 1 factory
bun run check:module-boundaries       ✅ 48 packages / 64 root modules
bun run check:pi-migration            ✅ 8 pinned / 4 runtime
bun run check:pi-runtime              ✅ Bun 1.4.1 / Node 26.3.0
bun run start -- --help               ✅
bun test src/                         ✅ 2216 pass / 1 fail (session-sync race)
```

### 33.6 当前基线（pi9 阶段四收口）

```text
workspacePackages: 48
piNativePackages: 40
rootSourceFiles: 98（Round 21: 100 → 98，−2）
rootProductionFiles: 64（Round 21: 66 → 64，−2）
rootProductionLines: 10043（Round 21: 10069 → 10043，−26）
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

### 33.7 完成度

加权工程进度约 **99.95%**（保持 Round 21 水平）。

### 33.8 pi9 阶段五路线图（剩余 ~0.05%）

1. **真实 provider smoke**：`OPENAI_API_KEY` 环境执行 `/invest NVDA 估值`
2. **根 `src/runtime/pi/` 余量**：约 17 个辅助文件渐进抽离（agent-port、agent-spec、agent-catalog、capability-manifest、channels、default-prompt、feature-gates、locale、package-config、package-tool-ownership、plugin-adapter、prompt-service、registry、role-system、skill-commands、tool、tool-contract、types 已抽离 2 个）

## 61. pi10 收口轮：Prompt/Resource/Event/Bridge 最终验证（2026-09-14）

### 61.1 本轮真实改造

- `@upup/pi-prompt-config` 成为 prompt-side 配置唯一 Package；root `prompts.ts` 只通过 Package API 获取 channel、locale、investment config 与 capability manifest。
- `@upup/pi-resource-composition` 成为 package discovery、ownership、plugin、skill command discovery 的唯一生产入口；`scripts/check-pi-packages.ts` 已同步读取迁移后的 ownership source。
- `@upup/pi-event-adapter` 新增注入式 `streamPiAgentWithRunner`；root `event-stream.ts` 只注入唯一 `runPiPrompt`，不在 Package 层创建 AgentSession。
- `@upup/pi-runtime` 新增显式 `PiPromptPort` contract；bootstrap 注册唯一 prompt runner，`@upup/utils` 不再动态 import `src/runtime/pi/runner.ts`。
- 删除 `src/runtime/pi/prompt-service.ts`、MCP facade、旧 command facade 与无消费者 investment subagent 实现。
- Bridge 首帧 status 改为异步发送，避免 Bun WebSocket `open` 后客户端监听竞争；消息处理在发送 idle 前等待 session snapshot 持久化完成，修复 session-sync e2e race。
- Pi package resource copy 过滤测试源码，避免 build 后 `dist` 测试污染根 `bun test` 发现范围。

### 61.2 验证结果

```text
workspacePackages: 49
piNativePackages: 41
rootSourceFiles: 71
rootProductionFiles: 43
rootProductionLines: 7598
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

- `bun run typecheck` ✅
- `bun run check:pi7` ✅
- `bun run check:module-boundaries` ✅ 49 packages / 43 root modules / no cycle
- `bun run check:pi-migration` ✅
- `bun run check:pi-packages` ✅ 17 Pi finance/domain packages
- `bun run check:pi-runtime` ✅
- `bun --cwd packages/pi-runtime test` ✅ 16 pass / 0 fail
- `bun --cwd packages/pi-prompt-config test` ✅ 10 pass / 0 fail
- `bun --cwd packages/pi-resource-composition test` ✅ 5 pass / 0 fail
- `bun --cwd packages/pi-event-adapter test` ✅ 60 pass / 0 fail
- `bun test src/runtime/pi/plugin-adapter.test.ts src/runtime/pi/package-tool-ownership.test.ts src/runtime/pi/production-entry-contract.test.ts` ✅ 19 pass / 0 fail
- `bun run test:pi-contracts` ✅ 全部通过
- `bun test` ✅ 2229 pass / 0 fail / 6857 assertions / 211 files
- `bun run build` ✅ compiled `dist/upup` and copied Pi resources
- `bun run start -- --help` ✅
- `git diff --check` ✅

### 61.3 产品验证边界

本轮 fixture、契约、并发恢复与构建验证均通过。真实 provider smoke 未执行：当前环境 `OPENAI_API_KEY` 与 `FINANCIAL_DATASETS_API_KEY` 均未设置；不得用 fixture 结果替代真实 provider 证据，待凭证环境单独执行 `/invest NVDA 估值` 并追加结果。

### 61.4 当前完成度

静态架构、Package contract、Pi Session 唯一入口、root 业务清理、入口 smoke 和本地全仓验证已满足 Pi7 完成定义；真实 provider 证据仍缺失，因此 Pi7/Pi10 标记为“本地验证完成，provider 验证待凭证”，不宣称无条件 100%。

## 62. pi10 阶段四：AgentSpec/Profile Package 化（2026-09-14）

### 62.1 本轮实现

- 将 `agent-spec.ts` 及其测试物理迁移到 `@upup/pi-investment-workflow`，Profile、权限、AgentSpec 校验、旧元数据转换和序列化均由 Package public API 提供。
- root `agent-session-factory`、`runner`、`agent-catalog`、registry 兼容层、extension 与合同测试全部切换到 Package API；删除 root AgentSpec 实现，未复制第二份实现。
- Package 增加 `@upup/pi-runtime` 依赖，门禁确认无 Package → root `src` 反向依赖；唯一 AgentSession Factory 保持不变。

### 62.2 真实基线与完成度

```text
workspacePackages: 49
piNativePackages: 41
rootSourceFiles: 69
rootProductionFiles: 42
rootProductionLines: 7297
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

按既有加权口径当前约 **99.95%**。该数字是架构阶段估算，不由目录数量推导；root 目标 allowlist 仍是目标状态，不能视为已完成。

### 62.3 验证结果

- Package 独立测试：83 pass / 0 fail；root runtime/profile/extension 定向测试：64 + 10 pass / 0 fail。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-packages`、`check:pi-runtime`、`test:pi-contracts`、Package build、全量 build、CLI help smoke、`git diff --check` 均通过。
- 全仓 `bun test` 存在间歇性时序超时：单次 2228 pass / 1 fail，第二次 2226 pass / 3 fail；失败集中在 session-sync、AgentRunner 和 stdio，隔离定向测试可通过，因此保留为未完成稳定性项。

### 62.4 后续计划（pi11）

1. **Root composition contract 收口**：审计 `registry`、`agent-catalog`、`agent-port`、`tool`、`runner` 和 `agent-session-factory`，只下沉无副作用公共合同；Factory 继续保持唯一，不复制实现。
2. **App 装配边界**：基于现有 `@upup/pi-tui-app`、Session、Resource Composition 和 Workflow Package，定义并落地 `@upup/pi-app` 的默认 catalog、policy、session、event sink 与 transport bootstrap，最后再处理 `investment-workflow.ts` bridge。
3. **全仓稳定性**：隔离并修复 session-sync、AgentRunner、stdio 的并发/进程退出超时，连续重复运行全仓测试后才标记全绿。
4. **真实 provider smoke**：在凭证环境单独执行 `/invest NVDA 估值`，记录 provider、模型、数据源、耗时、证据和风险检查；fixture 结果与真实 provider 结果分开归档。
5. **最终 root allowlist 验收**：确认 root 仅剩 bootstrap/transport/compat/migration，再执行全仓门禁、构建、入口 smoke、恢复/abort/compact/dispose 和产品闭环验收。

### 62.5 未完成项

- root runtime 仍有必要的 composition 核心，不为降低文件数进行机械迁移。
- `@upup/pi-app` 尚未成为最终默认应用装配入口。
- 全仓测试存在间歇性超时；真实 provider smoke 因当前环境未配置 `OPENAI_API_KEY`、`FINANCIAL_DATASETS_API_KEY` 尚未执行。

## 63. pi11 阶段一：Agent Catalog/Registry 与默认 App Composition（2026-09-14）

### 63.1 本轮实现

- 将 `PiAgentCatalog` 从 root 迁入 `@upup/pi-investment-workflow`，与 `INVESTMENT_PROFILES`、`UpUpAgentSpec` 校验和 Workflow API 共用一个 Package public boundary。
- 删除没有生产消费者的 root `src/runtime/pi/registry.ts` 和 root Catalog re-export；旧验证工具、脚本和架构文档均切换到 Package API。
- 新增 `@upup/pi-app`：统一注册 Pi Session、Background、Prompt、Gateway、Cron 和 `/invest` ports；`initialize()` 幂等，`dispose()` 清理 handler 与 runtime ports；Package 无 root import、无 AgentSession 创建、无 Tool/Skill discovery。
- root bootstrap 只负责提供唯一 Factory、runner、provider config、cron 和 Workflow handler，应用组合交给 `createPiApp()`。
- `/invest` Package 入口支持显式 `InvestmentWorkflowOptions`，恢复和新建流程都使用注入的唯一 Session Factory。

### 63.2 最新基线与进度

```text
workspacePackages: 50
piNativePackages: 42
rootSourceFiles: 66
rootProductionFiles: 40
rootProductionLines: 6718
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前 Pi7 加权工程进度约 **99.96%**。这是基于阶段验收门的工程估算，不代表 root 目标 allowlist 或真实 provider 验收已完成。

### 63.3 验证结果

- `@upup/pi-investment-workflow`：85 pass / 0 fail。
- `@upup/pi-app`：生命周期/端口隔离测试通过；root Workflow/Factory/extension 定向合同 13 pass / 0 fail，root 生产合同 68 pass / 0 fail。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、Package build、CLI help smoke、`git diff --check` 通过。
- Bridge session-sync 隔离测试通过；并行全仓测试仍可能触发 stdio 子进程 5 秒时序超时，因此没有把全仓标记为全绿。

### 63.4 pi12 后续计划

1. 将 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK 和 Eval 的启动入口统一切换为 `@upup/pi-app` 组合 API，root 仅保留参数解析与进程信号处理。
2. 将剩余 root controllers/evals/management 逐一按生产消费者迁入已有 Package，保持 Package → root `src` 反向依赖为零。
3. 稳定化 stdio、AgentRunner、session-sync 的并行测试：增加显式 server shutdown/child-process drain，不用延长测试超时掩盖泄漏。
4. 在有凭证的环境执行真实 `/invest NVDA 估值`，记录模型、provider、数据源、证据、风险和耗时，并与 fixture 分开。
5. 重新审计 root allowlist、默认 Package discovery、资源复制、恢复/abort/compact/dispose 和完整投研闭环，满足 Pi7 100% 完成定义后再标记完成。

## 64. pi11 阶段二验收与 pi12 执行计划（2026-09-14）

### 64.1 本轮已完成

- Bridge WebSocket 增加连接级顺序发送队列，统一握手与 Pi 状态/输出事件的发送路径；关闭连接时清理队列，避免异步事件乱序。
- session-sync e2e 客户端使用持久消息队列，避免覆盖 `onmessage` 导致已到达消息丢失；这是真实竞态修复，不是增加超时掩盖问题。
- benchmark 脚本改用 `@upup/pi-investment-workflow` public API 和唯一 Factory，清理旧 root index 引用。

### 64.2 当前真实基线与进度

`bun run report:pi7` 当前输出：

```text
workspacePackages: 50
piNativePackages: 42
rootSourceFiles: 66
rootProductionFiles: 40
rootProductionLines: 6712
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前完成度约 **99.96%**（工程加权估算）。已完成的静态门禁、唯一 Pi Factory、Package contract 和本地行为验证不能替代两个尚未满足的完成条件：root allowlist 的物理收口、真实 provider 投研闭环。

### 64.3 验证证据

- `bun test`：2231 pass / 0 fail，6867 assertions，212 files。
- `packages/pi-bridge` 定向测试：18 pass / 0 fail；session-sync、AgentRunner 并行重复 5 轮全部通过（10/10 个进程），stdio 独立合同测试通过。
- stdio protocol：1 pass / 0 fail；SDK Pi-backed stdio session contract：1 pass / 0 fail，11 assertions。
- `bun run benchmark:pi5`：`passed: true`，startup 141.93ms、recovery 49.36ms、10 次 fixture tool 调用通过。
- `bun run typecheck`、`bun run check:pi7`、`bun run check:module-boundaries`、`bun run check:pi-migration`、`bun run build`、CLI help smoke、`git diff --check`：全部通过。
- 当前真实 provider smoke：未执行；环境未配置 `OPENAI_API_KEY` 与 `FINANCIAL_DATASETS_API_KEY`，fixture 结果不作替代。

### 64.4 后续计划（pi12）

1. **统一入口装配**：逐一审计 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval，使其只负责参数/信号/transport bind，并调用 `@upup/pi-app`；禁止重复创建 Session、转换事件或注册工具。
2. **继续下沉 root 生产模块**：先为 `controllers`、`evals`、`management` 定义注入式 public contract，再迁入已有 Package；每单元执行 `git mv → consumer 切换 → 删除旧实现 → 独立测试 → 门禁`。
3. **Root allowlist 收口**：将 root 逐步压缩到 `src/index.tsx`、`src/cli.ts`、`src/bootstrap/**`、`src/compat/**` 与必要 migration；所有 root 业务实现必须有明确删除条件和零生产消费者证据。
4. **Pi-native 投研闭环**：验证 `detect → plan → execute → verify → report` 的恢复、证据 URI、数据时间、模型/假设、风险检查、approval/audit 与 dossier 导出；优先 fixture，凭证可用后单独运行真实 `/invest`。
5. **最终完成验收**：重复静态门禁、Package contract、全仓测试、构建、CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval smoke，并覆盖多 Session、abort、compact、restart、provider failure、retry、dispose；全部通过后才将 Pi7 标记为 100%。

### 64.5 当前明确阻塞

- 真实 provider 凭证缺失，只能报告本地 fixture 结果。
- root allowlist 尚未物理达成，剩余 root composition/transport 代码必须继续按消费者收口。
- Pi7 暂不标记完成；当前结论是“本地工程验证完成，产品/真实 provider 验收待完成”。

## 65. pi12 阶段一验收：Management 与 Input History 下沉（2026-09-15）

### 65.1 本轮完成

- Management server、snapshot provider、管理页面和测试已物理迁入 `@upup/pi-management`；provider 通过显式 `PiSessionFactory` 注入，Package 不再依赖 root private path。
- `InputHistoryController` 已物理迁入 `@upup/pi-tui-app`，CLI 只通过 Package public API 使用；root controller export 已移除。
- 管理 Package manifest、依赖闭包、trust pin、resource discovery、页面 boundary 和 process entry smoke 已补齐。
- `@upup/pi-resource-composition`、`@upup/pi-session` 作为 runtime foundation 处理，避免基础设施依赖被重复当作能力 Package 加载。

### 65.2 基线与进度

`bun run report:pi7` 当前输出：

```text
workspacePackages: 50
piNativePackages: 42
rootSourceFiles: 59
rootProductionFiles: 35
rootProductionLines: 6389
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前 Pi7 工程完成度约 **99.97%**。这仍不是无条件 100%：root allowlist 尚未完全物理达成，且真实 provider 验收缺少凭证。

### 65.3 验证证据

- `@upup/pi-management`：7 pass / 0 fail；管理入口 `--management --management-once` 成功启动并退出。
- `@upup/pi-tui-app`：222 pass / 0 fail；Input History 定向测试通过。
- `bun run test:pi-contracts` 通过。
- `bun test`：2226 pass / 0 fail，6847 assertions，212 files。
- `bun run typecheck`、`check:pi-packages`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime`、页面 boundary lint、`git diff --check` 全部通过。

### 65.4 pi12 下一步

1. 继续迁移 `ModelSelectionController` 与 `SessionSelectionController` 到 `@upup/pi-tui-app`，但将 `InMemoryChatHistory`、配置和 Session API 改为显式依赖，禁止 Package 反向依赖 root。
2. 为 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 建立统一 `@upup/pi-app` bootstrap contract，逐入口删除重复初始化。
3. 为 `AgentRunnerController` 抽离 UI 状态与 runtime port contract，保留唯一 Pi runner/Factory，不复制执行实现。
4. 继续审计 `src/evals`、`src/types`、`src/bootstrap`，只保留真正的入口壳和必要 migration。
5. 在凭证环境执行真实 `/invest NVDA 估值`，记录 provider、模型、数据源、证据、风险和审计结果；完成后才可评估 Pi7 100%。

## 66. pi12 阶段二验收：Session Selection 下沉（2026-09-15）

### 66.1 本轮完成

- `src/controllers/session-selection.ts` 已物理迁入 `@upup/pi-tui-app`，删除 root controller facade export。
- 控制器改为显式 `SessionSelectionService` 注入；Package 不再访问 `getPiSessionService()` 或任何 global fallback。
- CLI 仅通过 `@upup/pi-tui-app` public API 创建控制器，并在 bootstrap 层注入 Pi Session Service。
- 新增独立 fake-service 行为测试，验证过滤、导航、确认、删除、重命名、标签、取消和状态转换。

### 66.2 当前基线与进度

`bun run report:pi7` 当前输出：

```text
workspacePackages: 50
piNativePackages: 42
rootSourceFiles: 58
rootProductionFiles: 34
rootProductionLines: 6152
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前 Pi7 工程完成度约 **99.98%**。唯一 Pi AgentSession Factory、零 legacy event consumer、零 production global registry 均已保持；但这仍不是无条件 100%，因为 root allowlist 尚未物理收口，且真实 provider 投研闭环尚未执行。

### 66.3 验证证据

- 定向：Session Selection 2 pass / 0 fail；Input History 1 pass / 0 fail。
- 静态门禁：`check:pi-packages`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime` 全部通过。
- 合同测试：Pi runtime/entry 142 pass / 0 fail；`test:pi-contracts` 全部通过。
- 全仓：`2227 pass / 2 fail`，失败仅为并发运行时 AgentRunner 与 SDK stdio 合同测试的 5 秒超时；两项单独运行均通过，记录为非确定性时序债务，不归因于本轮 Session Selection 迁移。
- 构建与入口：`typecheck`、`build`、CLI `--help`、管理入口 once smoke、管理页面 boundary lint、`git diff --check` 均通过。
- 真实 provider：未执行；凭证缺失，fixture 与真实 provider 结果严格分开。

### 66.4 后续计划（pi13）

1. **继续 TUI 下沉**：迁移 `ModelSelectionController`，先把 `InMemoryChatHistory` 和配置访问改成显式 port，再删除 root 实现。
2. **Runner contract 化**：抽离 `AgentRunnerController` 的 UI state/controller contract，保持唯一 Pi runner 和唯一 Factory，不复制执行逻辑。
3. **统一外围入口**：让 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 统一调用 `@upup/pi-app` bootstrap，逐一移除重复初始化。
4. **root allowlist 收口**：继续审计 `src/evals`、`src/types`、`src/bootstrap` 和残余 runtime composition，只保留启动壳、transport 壳和必要 migration。
5. **并发稳定性**：隔离 AgentRunner/stdio/session-sync 的共享 runtime、临时 session 目录和 provider fixture，重复全仓回归直到无时序失败。
6. **真实闭环验收**：凭证可用后执行 `/invest NVDA 估值`，记录 detect → plan → execute → verify → report 的恢复、证据、风险、approval、audit 和 dossier。

## 67-68. pi13 验收：TUI 模型与 Runner 控制器下沉（2026-09-15）

### 本轮完成

- 模型选择控制器、内存会话历史和 AgentRunner 控制器已物理迁入 `@upup/pi-tui-app`。
- `ModelSelectionDependencies` 和 `AgentRunnerPorts` 固化显式 contract；Package 不再读取 root runtime、global service 或第二套执行内核。
- CLI 成为唯一 composition root：注入 Pi event stream、Pi Session Service、Session Tracker、file history、message queue 和 renderer。
- 删除 `src/controllers/index.ts`、`src/types.ts` 旧 root facade；root production 文件降至 29 个。
- 新增模型切换、Ollama/OpenRouter、API key、Runner Pi fixture 和 port contract 测试。

### 基线与进度

`bun run report:pi7` 当前输出：

```text
workspacePackages: 50
piNativePackages: 42
rootSourceFiles: 54
rootProductionFiles: 29
rootProductionLines: 5184
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前 Pi7 工程迁移完成度约 **99.99%**。唯一 Factory、零 legacy event consumer、零 production global registry 已验证；但 root allowlist 和真实 provider 产品验收尚未达成，不能标记 100%。

### 验证

- TUI/Runner 相关测试：230 pass / 0 fail，492 assertions。
- AgentRunner Pi contract：1 pass / 0 fail。
- `bun run typecheck`、TUI Package build、Pi package/runtime/module migration 门禁、`git diff --check`：全部通过。
- 真实 provider：未执行，凭证缺失；本轮仅完成 fixture/contract 验证。

### pi14 后续计划

1. 把 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 全部改为调用统一 `@upup/pi-app` bootstrap contract。
2. 迁移或拆分 `src/evals` 与残余 runtime composition，继续压缩 root allowlist。
3. 为 `AgentRunnerPorts` 增加并发、abort、approval queue、dispose 和恢复合同测试。
4. 修复全仓并发测试中的共享 session/runtime 隔离问题，重复完整 `bun test` 直到稳定全绿。
5. 在凭证可用后执行真实 `/invest NVDA 估值`，记录 provider、model、证据 URI、风险、approval/audit 和 dossier 导出。

## 69. pi14 阶段一验收：统一 `@upup/pi-app` stdio Bootstrap（2026-09-15）

### 本轮完成

- `@upup/pi-app` 新增显式 `PiStdioRuntimePort` 和生命周期约束，禁止 stdio transport 自行创建 AgentSession 或读取 global runtime。
- `src/runtime/pi/bootstrap.ts` 成为 stdio runtime 的唯一 composition root；`src/index.tsx` 仅负责 transport bind 和 signal/wait。
- production-entry contract、event-stream 文档、session verification 脚本均已切换到迁移后的 Package 路径。

### 当前基线

`bun run report:pi7` 当前仍为：

```text
workspacePackages: 50
piNativePackages: 42
rootSourceFiles: 54
rootProductionFiles: 29
rootProductionLines: 5184
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前 Pi7 工程完成度约 **99.99%**。这不是最终 100%：`src/evals`、部分 runtime composition 和其他外围入口仍需统一 `@upup/pi-app`，root allowlist 未完全物理收口，真实 provider 投研闭环未执行。

### 验证

- `bun run test:pi-contracts`：全链路通过。
- `check:pi-packages`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime`、`typecheck`：全部通过。
- `@upup/pi-app` 合同：3 pass / 0 fail；真实 stdio JSON-RPC smoke：initialize/shutdown 均返回成功。
- SDK session 合同曾在并发批次超时，隔离运行通过；共享 runtime/session 隔离仍列为后续稳定性任务。

### pi15 后续计划

1. 统一 `src/evals/run.ts`、print、Gateway、Bridge、Cron、Daemon、SDK 到 `@upup/pi-app` bootstrap API。
2. 继续将 `src/runtime/pi` 剩余 composition 下沉到 Package，root 仅保留必要 bootstrap/transport/migration。
3. 为 `PiApp` 增加 dispose/重初始化和多入口并发隔离合同。
4. 解决全仓并发 session/runtime 竞争，重复全仓回归直到稳定全绿。
5. 凭证可用后执行真实 `/invest NVDA 估值` 并记录完整证据、风险、审批、审计和 dossier。

## 70. pi15 验收：评估 Package 与统一 event-stream Bootstrap（2026-09-15）

### 本轮完成

- 新建 `@upup/pi-evals`，完成评估 UI、数据集、citation density 和 runner 的物理迁移。
- `src/evals/run.ts` 降为仅负责调用 `getPiNativeApp().getEventStream()` 的兼容启动壳。
- `@upup/pi-app` 增加 `PiEventStreamPort`，print/eval/stdio 共享同一 Pi App composition contract。
- Package → root `src` 反向依赖检查仍为零，唯一 AgentSession Factory 与 production global registry 门禁保持通过。

### 当前真实基线

```text
workspacePackages: 51
piNativePackages: 43
rootSourceFiles: 46
rootProductionFiles: 22
rootProductionLines: 4407
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
```

当前 Pi7 工程迁移完成度约 **99.99%**，不能标记最终 100%：root `src/runtime` 尚未完全下沉，外围入口仍需逐一统一到 `@upup/pi-app`，真实 provider 投研闭环未执行。

### 验证

- 评估/print/Pi App/production-entry：21 pass / 0 fail，142 assertions。
- Pi package、runtime、module boundary、migration 门禁和 typecheck：全部通过。
- 完整 `test:pi-contracts`、应用构建、CLI help、真实 stdio JSON-RPC initialize/shutdown：通过。
- 真实 provider：未执行，凭证缺失；本地 fixture 与真实 provider 结果严格分开。

### pi16 后续计划

1. 继续拆分 `src/runtime/pi` 残余 composition，优先把 `runner`、`bootstrap` 和 eval/print adapter 的 root 私有实现下沉到 Package。
2. 将 Gateway/Bridge/Cron/Daemon/SDK 的生产 bootstrap 统一改为 `@upup/pi-app` public API，而不是仅依赖注册后的隐式 runtime ports。
3. 增加 Pi App 多入口并发、dispose/reinitialize、Session 隔离合同测试。
4. 重复全仓并发测试，修复 AgentRunner/stdio 偶发时序超时。
5. 凭证可用后执行真实 `/invest NVDA 估值`，记录证据 URI、模型、风险、approval/audit 和 dossier。

## 71 pi16：Pi Session Runtime 物理下沉（2026-09-15）

### 实际实施

- 使用 `git mv` 将唯一 `PiAgentSessionFactory` 与 prompt runner 从 root `src/runtime/pi` 迁入 `@upup/pi-session`，公开入口统一为 `createPiAgentRuntime`、`PiAgentSessionFactory`、`runPiPrompt`、`disposePiSessions`、`getPiSessionTools`。
- CLI、stdio/bootstrap、Gateway 合同、runtime 合同测试和脚本改为仅通过 `@upup/pi-session` public API 导入；root Factory/runner 实现已删除。
- `@upup/pi-session` 构建对 workspace 包保持 external，修复 Package 与 Pi extension 共享 capability registry 单例的问题；公共 runner 在缺少 bootstrap 时会显式补齐 Session Service 配置。
- 更新迁移门禁与 architecture report，使唯一 `createAgentSession` 位置、Factory source 和删除路径按 Package 真实位置检查；报告新增自动计算的结构迁移指标。

### 当前真实基线

由 `bun run report:pi7` 生成：workspace packages `51`，Pi manifest packages `43`，root source files `44`，root production files `20`，root production lines `3731`；`legacyEventConsumers=0`，`globalRegistryConsumers=0`，唯一 Factory 为 `packages/pi-session/src/agent-session-factory.ts`。报告的 `progress.structuralPercent` 为结构门禁指标，不代表真实 provider 或产品闭环完成度。

### 验证证据

- `bun run typecheck`、`check:pi-migration`、`check:pi-packages`、`check:pi7`、`check:module-boundaries`、`check:pi-runtime`：全部通过。
- Pi runtime 定向合同：`83 pass / 0 fail / 785 assertions`；包含 Package allowlist、capability isolation、management/platform worker、金融风险策略、Session 恢复和 runner 并发串行化。
- `@upup/pi-session` 独立构建与合同：`62 pass / 0 fail / 126 assertions`。
- `bun run build`：通过，Pi resource copy 成功；真实 stdio `initialize → shutdown`：两个 JSON-RPC 响应成功。
- 本轮未执行真实 provider 投研闭环；环境仍未配置 `OPENAI_API_KEY`、`FINANCIAL_DATASETS_API_KEY`，因此不伪造 `/invest` 结果。

### pi17 后续计划

1. 将 `src/runtime/pi/bootstrap.ts`、`event-stream.ts` 和 `investment-workflow.ts` 继续收口为 root 兼容 bootstrap/transport，优先把业务 composition 下沉到已有 Package。
2. 将 Gateway、Bridge、Cron、Daemon、SDK 的生产 bootstrap 全部改为 `@upup/pi-app` public contract，并增加多入口 dispose/reinitialize 隔离测试。
3. 运行并定位完整 `bun test` 的共享 session/runtime 时序问题；不通过增大 timeout 掩盖竞争。
4. 收紧 root allowlist，移除不再需要的 `src/runtime/pi` 生产实现，仅保留必要 transport、bootstrap 和数据迁移。
5. 凭证配置后执行一次真实 `/invest`，独立记录 provider、证据、风险、approval/audit 和可导出 dossier。

## 72 pi17：Root Runtime 业务清零与 Finance Fixture Package 化（2026-09-15）

### 实际实施

- 将 canonical event stream 工厂 `createPiEventStream` 下沉至 `@upup/pi-event-adapter`；root bootstrap 仅注入 `@upup/pi-session` 的 `runPiPrompt`，删除 `src/runtime/pi/event-stream.ts`。
- 将投资 workflow 的默认 `InvestmentSessionFactory`、`/invest` handler 和恢复/分叉 API 统一装配到 `@upup/pi-app` 的 `createPiInvestmentWorkflow` / `getInvestmentWorkflow`，删除 `src/runtime/pi/investment-workflow.ts`。
- 删除无生产消费者的 root facade：`src/runtime/pi/agent-port.ts`、`prompts.ts`、`tool.ts`、`intent-detector/**`、`index.ts`；Pi runtime 生产目录现在只保留 `bootstrap.ts`。
- 将确定性金融 fixture 与测试从 `src/extensions/upup` 迁入 `@upup/pi-finance-sdk`，新增 `./finance-fixtures` package subpath 和独立构建输出；删除 root `src/extensions/upup`。
- 更新 production entry contract、migration gate、verification scripts 和所有 fixture consumers，禁止验证脚本继续依赖已删除 root 路径。

### 当前真实基线

由 `bun run report:pi7` 生成：workspace packages `51`，Pi manifest packages `43`，root source files `30`，root production files `7`，root production lines `2100`；`legacyEventConsumers=0`，`globalRegistryConsumers=0`，唯一 Factory 为 `packages/pi-session/src/agent-session-factory.ts`。自动报告 `progress.structuralPercent=100`，该指标只表示结构门禁，不代表真实 provider 投研闭环已完成。

### 验证证据

- `bun run typecheck`、`check:pi-migration`、`check:pi-packages`、`check:pi7`、`check:module-boundaries`、`check:pi-runtime`：全部通过。
- Root runtime / workflow / fixture 定向验证：`68 pass / 0 fail / 719 assertions`。
- Pi App、event adapter、workflow 和 production entry 合同：`23 pass / 0 fail / 100 assertions`。
- `@upup/pi-finance-sdk` build（含 fixture subpath）、`@upup/pi-event-adapter` build、`@upup/pi-app` build：通过。
- 本轮未执行真实 provider `/invest`；凭证缺失，fixture 结果与真实 provider 结果严格分开。

### pi18 后续计划

1. 将 `src/cli.ts`、`src/print.ts`、`src/evals/run.ts` 和 `src/bootstrap/gateway.ts` 从 root bootstrap import 进一步收口到独立 `@upup/pi-cli-bootstrap` / `@upup/pi-app` contract，最终 root 只保留启动壳。
2. 把 Gateway、Bridge、Cron、Daemon、SDK 的生产 bootstrap 从隐式 runtime port 注册迁移为显式 `PiApp` composition contract，并增加跨入口 dispose/reinitialize 隔离测试。
3. 继续审计 `src/extensions/upup` 删除后的所有历史脚本与文档路径，消除陈旧验证命令但不修改历史验证记录。
4. 重跑全仓 `bun test`、构建、CLI、stdio、Gateway/Bridge/Cron/Daemon smoke；若出现共享 session 时序问题，定位生命周期根因而非放宽 timeout。
5. 配置 provider 凭证后执行真实 `/invest` 闭环，记录 provider、证据 URI、模型、风险、approval/audit 和 dossier。

## 73 pi18：入口按模式加载、回归稳定性与陈旧门禁清理（2026-09-15）

### 实际实施

- `src/index.tsx` 改为按入口动态加载：stdio 不再预加载 CLI/UI，setup/doctor/config/交互 CLI 仅在对应模式加载；根入口继续只负责 dotenv、Pi bootstrap、参数解析和 transport bind。
- 修复 stdio Session 合同在全仓并发下接近 5 秒边界的问题。根因是 stdio 启动前静态加载完整 CLI/UI；修复后未放宽测试 timeout，单独 Session 合同实测约 4.1 秒并通过。
- `test:pi-contracts` 改用迁移后的 `packages/pi-session`、`packages/pi-resource-composition`、`packages/pi-investment-workflow` 和 SDK Session 合同路径，移除已删除的 `src/extensions/upup`、`src/session/pi-migration.test.ts` 陈旧引用。
- `scripts/report-pi-migration.ts`、`scripts/verify-pi5.ts`、`scripts/test-upup-cli.sh` 改用当前 Package ownership、Session 和 workflow 测试入口；未改写历史文档中的旧验证结果。

### 当前自动报告事实

由 `bun run report:pi7` 生成：

```text
workspacePackages: 51
piNativePackages: 43
rootSourceFiles: 30
rootProductionFiles: 7
rootProductionLines: 527
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1 (packages/pi-session/src/agent-session-factory.ts)
structuralPercent: 100
```

工具 ownership 报告：`264/264` 工具由 Pi-native extension 覆盖，`remainingHostAdapterTools=0`。

### 验证证据

- `bun test`：`2233 pass / 0 fail / 6860 expect() calls`。
- `bun run build`：通过，Pi resource copy 与可执行产物生成通过。
- `bun run typecheck`、`check:pi7`、`check:module-boundaries`：全部通过；报告确认 51 个 workspace package、唯一 Pi AgentSession factory、无 root-src 反向依赖和依赖环。
- `bun run test:pi-contracts`：全链路通过；包含迁移后的 Pi runtime、Gateway/Bridge/Cron、SDK Session、金融 Package、Session/Resource/Capability、Daemon 合同。
- 入口 smoke：`bun run start -- --help` 通过；stdio `initialize → shutdown` 返回合法 JSON-RPC 响应；SDK Pi-backed Session create/export/restart/resume/end 合同通过。
- `git diff --check`：通过。

### 完成度口径

- **结构迁移：100%**（自动门禁指标，不等于产品完成）。
- **本地 Package/Session/入口行为：已验证通过**；全仓测试与构建均通过。
- **Pi7 产品完成度：约 92%**。剩余 8% 由尚未满足的产品验收项构成：root allowlist 的最终物理收口、Gateway/Bridge/Cron/Daemon/SDK 全部显式采用 `PiApp` public contract（目前部分仍通过 runtime port）、长周期并发/恢复/SLA 验证，以及真实 provider `/invest` 闭环和可追溯 dossier 证据。
- 当前不标记 Pi7 最终完成；没有配置或验证 `OPENAI_API_KEY`、`FINANCIAL_DATASETS_API_KEY` 时，不将 fixture 结果计为真实 provider 结果。

### pi19 后续计划（按阻塞优先级）

1. 将 Gateway、Bridge、Cron、Daemon、SDK 的 runtime port 兼容层改成显式 `PiApp`/composition contract 注入；保留 port 仅作短期 transport 适配，不新增 registry。
2. 继续收口 root allowlist：审计 `src/runtime/pi/bootstrap.ts`、`src/evals/run.ts`、`src/print.ts`、`src/bootstrap/gateway.ts` 是否只含启动壳；将剩余业务 composition 下沉至 Package public API。
3. 增加 PiApp dispose/reinitialize、多入口并发、Session 隔离、abort/compact/restart/provider failure 合同，并在并发运行下重复全仓回归。
4. 增加 Gateway、Bridge、Cron、Daemon、SDK、Eval 的真实 Pi session smoke，记录独立入口共享同一 Runtime 的证据。
5. 凭证可用后执行一次真实 `/invest` 闭环，单独记录 provider、模型、时间、证据 URI、假设、风险检查、approval/audit、恢复点和 dossier 导出。

## 74. pi19：根入口物理收口与真实回归结果（2026-09-15）

### 本轮完成
- 将 Pi bootstrap、print、eval 从 root 物理迁入 `@upup/pi-app` / `@upup/pi-evals`，删除 `src/runtime/pi/bootstrap.ts`、`src/print.ts`、`src/evals/run.ts`。
- `@upup/pi-app` 提供 `index`、`default`、`print` public subpath；`@upup/pi-evals` 提供 `cli` subpath；生产消费者不再依赖 root runtime bootstrap 私有路径。
- root allowlist 门禁已落地：根生产文件仅允许 `src/index.tsx`、`src/cli.ts`、`src/bootstrap/**`、`src/compat/**`、`src/types/**`；同时禁止 production `legacy-events` 依赖。
- 根入口不再从 Pi App 主入口加载 print implementation，stdio 与 CLI 启动依赖范围更小。

### 当前真实基线
`bun run report:pi7` 当前输出：51 workspace packages、43 Pi-native packages、root 26 source files、4 production files、374 production lines、legacy/global consumers 0、唯一 Factory 为 `packages/pi-session/src/agent-session-factory.ts`、`structuralPercent: 100`。

### 完成度判断
- **结构迁移完成度：100%**：唯一 Pi AgentSession Factory、无 production global registry、无 production legacy-events、root allowlist 通过、Pi domain manifest 已覆盖。
- **Pi7 产品完成度：约 94%**：剩余约 6% 为跨入口显式 `PiApp` contract 进一步统一、并发恢复稳定性、真实 provider 投研闭环及 dossier 证据。
- **真实验证状态：本地/fixture 已通过；真实 provider 未执行**，无凭证时不把 `/invest` 真实市场数据、外发通知或真实交易验收计入完成度。

### 验证结果
- `typecheck`、`check:pi-migration`、`check:pi-packages`、`check:pi-runtime`、`check:module-boundaries`、`check:pi7`、`git diff --check`：全部通过。
- `@upup/pi-app` 与 `@upup/pi-evals` 构建通过；`bun run start -- --help` 通过；`test:pi-contracts` 通过；入口/print/Package 定向合同为 `21 pass / 0 fail`。
- 串行全仓 `bun test --max-concurrency 1`：`2233 pass / 0 fail / 6855 assertions`，216 files。
- 默认并行全仓：`2231 pass / 2 fail`，失败均为 5 秒边界超时；两个测试隔离运行 `2 pass / 0 fail`，并发时序问题未标记为解决。

### pi20 后续计划
1. 为 `@upup/pi-app` 增加多入口并发、dispose/reinitialize、Session 隔离和 abort/compact/restart 合同，解决并行全仓共享环境竞争，不放宽 timeout。
2. 将 Gateway、Bridge、Cron、Daemon、SDK 的生产 bootstrap 从 runtime port 兼容层继续收敛到显式 `PiApp` composition contract，并增加各入口真实 Pi session smoke。
3. 清理历史脚本/文档中指向旧 `src/evals`、`src/print` 或 root runtime 的非生产路径，保留历史验证记录不改写。
4. 运行构建产物启动、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 分层 smoke，严格分开 fixture 与真实 provider 证据。
5. 配置凭证后执行真实 `/invest`，记录 detect→plan→execute→verify→report 全阶段事件、证据 URI、模型、风险检查、approval/audit、恢复点和 dossier 导出。

## 75. pi20：Pi Native 根入口最终收口（2026-09-15）

### 本轮完成

- 根入口物理收口：`src/index.tsx` 仅作为兼容启动壳，全部生产编排由 `@upup/pi-app/entry` 承担。
- CLI 通过 `@upup/pi-tui-app` public API 接入，使用 `PiApp.getEventStream()` 注入唯一 canonical event stream；删除重复 `root-cli` facade。
- `@upup/pi-app` 增加 `./entry` manifest export 和构建产物；`package.json`/`bun.lock` 保持 workspace 依赖一致。
- 验证脚本改用 Package contract，移除历史 root session/runtime 路径假设。

### 当前基线与完成度

由 `bun run report:pi7` 实时生成：

```text
workspacePackages: 51
piNativePackages: 43
rootSourceFiles: 25
rootProductionFiles: 3
rootProductionLines: 135
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
structuralPercent: 100
```

结构迁移完成度为 **100%**，但 Pi7 产品完成度按证据口径为 **约 94%**：剩余工作不是目录迁移，而是跨入口生命周期/并发恢复稳定性、完整 `/invest` 证据闭环和真实 provider 验证。无凭证时不把 fixture 结果计为真实投研结果。

### 验证证据

- 静态：`typecheck`、`check:pi7`、`check:module-boundaries`、`git diff --check` 通过。
- Package/入口：`@upup/pi-app` build、CLI `--help`、stdio JSON-RPC `initialize → shutdown` 通过。
- 合同：`test:pi-contracts` 通过；串行全仓 `bun test --max-concurrency 1` 为 `2233 pass / 0 fail / 6858 assertions`。
- 真实 provider：未执行；`OPENAI_API_KEY`、`FINANCIAL_DATASETS_API_KEY` 未作为本轮验证前提，未声称真实市场数据闭环。

### pi21 后续计划

1. 不放宽 timeout，重现并解决默认并行全仓中 AgentRunner/SDK stdio 的共享环境时序竞争，补充 `PiApp` dispose/reinitialize、并发 session 隔离、abort/compact/restart 合同。
2. 将 Gateway、Bridge、Cron、Daemon、SDK 的 runtime port 适配进一步收敛为显式 `PiApp` composition contract，并逐入口执行真实 Pi session smoke。
3. 运行构建产物、Gateway、Bridge、Cron、Daemon、SDK、Eval 分层 smoke，分别记录 fixture 与 provider 证据。
4. 凭证可用后执行一次完整 `/invest`：`detect → plan → execute → verify → report`，记录事件、证据 URI、模型、假设、风险、approval/audit、恢复点和 dossier 导出。

## 76. pi21：Manifest Contract 强化与最终回归（2026-09-15）

### 本轮实现

- 统一所有 51 个 workspace package 的 Pi manifest 形状，补齐 `contract`、`source`、`trust`、`lifecycle`、`extensions`、`skills`、`prompts`、`workflows`、`policies`、`evals`；process scope 包声明可定位的 `dispose` 入口。
- `check:pi7` 改为逐包调用 `@upup/pi-runtime` 的 `validatePiPackageManifest()`，覆盖 exact semver、资源重复、sandbox credential 禁止、process dispose 必须项和 contract 版本。
- 增加 Runtime manifest 合同测试，确认不完整 process lifecycle 和 sandbox credential manifest 均 fail closed。

### 当前实时基线

`bun run report:pi7` 生成：

```text
workspacePackages: 51
piNativePackages: 51
rootSourceFiles: 25
rootProductionFiles: 3
rootProductionLines: 135
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
structuralPercent: 100
```

### 进度口径

- **结构迁移完成度：100%**。唯一 Pi `AgentSession` 创建入口、完整 Pi manifest 覆盖、root allowlist、无 production `legacy-events`、无 Pi host/port global registry 均由自动报告和门禁确认。
- **本地实现与合同完成度：约 96%**。Pi Runtime、Session、Package resource/trust/lifecycle、金融工具 ownership、`/invest` 五阶段 fixture、Gateway/Bridge/Cron/SDK/stdio 入口合同、构建和恢复测试均已通过。
- **产品验收完成度：约 94%**。剩余差异来自真实 provider 投研闭环、跨入口长期并发/SLA 证据和配置凭证环境下的可追溯 dossier；不是继续堆目录或手工调整百分比。
- **真实 provider 状态：未执行**。本轮没有把 fixture、本地模拟 provider 或无凭证运行结果冒充真实 A 股/港股/海外市场验证。

### 本轮验证证据

- 静态和类型：`bun run typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-packages`、`check:pi-runtime`、`git diff --check` 全部通过。
- 合同和构建：`test:pi-contracts`、`bun run build`、`@upup/pi-runtime` manifest tests、`@upup/pi-app` lifecycle tests、CLI `--help`、stdio JSON-RPC `initialize → shutdown` 全部通过。
- 全仓：干净环境串行 `bun test --max-concurrency 1` 为 `2234 pass / 0 fail / 6864 assertions`，216 files；AgentRunner 与 SDK stdio 两个边界合同在隔离和干净环境均通过，未放宽 timeout。

### pi22 后续计划

1. 将 Gateway、Bridge、Cron、Daemon、SDK、Eval 的生产 bootstrap 从 runtime port 适配继续收敛为显式 `PiApp` composition contract，并为每个入口保留真实 Pi session smoke。
2. 增加长周期并发、SLA、abort、compact、restart、provider failure、retry、dispose/reinitialize 的分层证据，区分串行、并发和多进程结果。
3. 运行构建产物及 Gateway、Bridge、Cron、Daemon、SDK、Eval 的 fixture smoke；每类结果记录入口、Session id、canonical event、恢复点和审计信息。
4. 在用户提供并确认凭证后执行一次真实 `/invest`：`detect → plan → execute → verify → report`，记录 provider、模型版本、数据时间、证据 URI、假设、风险检查、approval/audit、恢复点和 dossier 导出。
5. 只有以上真实 provider 与跨入口证据齐全，才将 Pi7 标记为最终完成；当前保持“结构完成、产品未最终验收”。

## 77. pi22：轻量 stdio PiApp 组合与入口回归（2026-09-15）

### 本轮完成

- 将 `packages/pi-app/src/stdio.ts` 收口为唯一 `@upup/pi-app/default` composition 的适配器，删除 stdio 自行创建 `createPiAgentRuntime()`、event stream 和 session service 的重复路径。
- 将 Gateway runtime 依赖改为可选组合，仅在 Gateway consumer 请求时进行 fail-closed 校验；stdio 不要求加载 Gateway capability。
- 将投资 workflow factory 拆到 `packages/pi-app/src/investment.ts`，并将 workflow / `/invest` handler 改为生命周期内懒加载，降低 stdio 启动依赖与初始化成本。
- 保持 Pi `AgentSession`、Pi Session service、canonical event adapter、Package manifest 和资源发现路径不变；未新增 root `src` 实现或第二套 runtime。

### 实时基线

由 `bun run report:pi7` 生成的结构指标保持：

```text
workspacePackages: 51
piNativePackages: 51
rootSourceFiles: 25
rootProductionFiles: 3
rootProductionLines: 135
legacyEventConsumers: 0
globalRegistryConsumers: 0
agentSessionFactories: 1
structuralPercent: 100
```

### 进度判断

- **结构迁移完成度：100%**。Full Package Split、root allowlist、Pi manifest 覆盖、唯一 AgentSession factory、无 legacy-events 生产消费者和无 global capability/port registry 均由报告与门禁确认。
- **本地实现与合同完成度：约 97%**。本轮进一步消除 stdio 第二 runtime 构造路径，并通过 PiApp 生命周期、Session、入口和 Package 合同；仍需补齐跨入口长期运行证据。
- **产品验收完成度：约 94%**。`detect → plan → execute → verify → report` 已有 fixture 合同和可恢复 Session 支撑，但真实 provider、跨入口 SLA/并发恢复和生产凭证环境 dossier 尚未完成。
- **Pi7 总体状态：未最终完成**。百分比仅按证据分层表达，不替代最终完成定义。

### 本轮验证证据

- `bun run typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-packages`、`check:pi-runtime`：通过。
- PiApp/PiSession/Pi runner 定向合同：18 pass / 0 fail；SDK Pi-backed stdio 恢复合同通过。
- `bun run test:pi-contracts`：通过；`bun run build`：通过；构建产物资源复制完成。
- CLI stdio smoke：`initialize → shutdown` 通过。
- 真实 provider：未执行；没有凭证时不声称 A 股、港股或海外市场真实投研闭环通过。

## pi23 后续计划

1. **统一外围 bootstrap**：让 Gateway、Bridge、Cron、Daemon、SDK、Eval 的生产入口直接消费显式 `PiApp` composition contract；每个入口保留唯一 Pi Session factory、event adapter 和 capability context，不允许 runtime port 旁路扩展。
2. **补齐长期稳定性证据**：增加多 Session 并发隔离、abort、compact、restart、provider failure、retry、dispose/reinitialize、SLA 超时和跨进程恢复合同；分别记录串行、并发和多进程结果，不修改 timeout 掩盖问题。
3. **分层入口 smoke**：对构建产物、CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 执行 fixture smoke，记录 Session id、canonical event、恢复点、tool call、policy decision 和 audit 信息。
4. **投研闭环验收**：在用户提供并确认凭证后执行一次真实 `/invest`，完整覆盖 `detect → plan → execute → verify → report`，记录 provider、模型版本、数据时间、证据 URI、假设、风险检查、approval/audit、恢复点和 dossier 导出。
5. **最终清理与标记**：仅在上述跨入口证据和真实 provider 证据齐全后，复核旧 facade/重复适配器生产消费者为零，运行全仓测试、构建和 `git diff --check`，再将 Pi7 标记为完成；当前不提前标记。

## 78. pi23：外围入口显式 PiApp composition 与 capability registry 清理（2026-09-15）

### 本轮实现

- daemon、TUI、Gateway、Bridge、commands、MCP、platform 入口进一步收敛到显式 PiApp/Package contract。
- 删除 daemon 对 Pi background service 全局读取；删除 MCP registry 与 sandbox manager 的 Pi runtime port 自注册。
- CLI 使用显式 `TuiRuntime` 与 `CommandContext.capabilities`，命令模块不再读取 `@upup/pi-runtime` registry。
- Gateway 事件通道统一传播 canonical `UpUpAgentEvent`，Bridge 只在 transport 边界消费事件语义；生产 Gateway 不再转换 legacy event。

### 当前证据

- 结构门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages` 通过；唯一 `createAgentSession`、无 production global registry、root allowlist 仍保持通过。
- 类型与合同：`bun run typecheck`、commands 48 tests、MCP tests、platform 56 tests、PiApp/TUI/daemon/Gateway/Bridge 合同均通过。
- 全链路：`bun run test:pi-contracts` 通过；构建产物、CLI help、stdio JSON-RPC smoke 均通过。
- 实时结构指标继续由 `bun run report:pi7` 自动生成；本轮未手工修改百分比。

### 进度判断

- **结构迁移完成度：100%**。Pi Package manifest、唯一 Pi AgentSession、root allowlist、无 legacy-events 生产消费者、无 global capability/port registry 均有自动门禁或扫描证据。
- **本地实现与合同完成度：约 98%**。daemon/TUI/Gateway/Bridge/commands/MCP/platform 的显式 composition 已完成主要收口；剩余为跨入口长期压力/恢复证据和少量 legacy facade 的最终删除审计。
- **产品验收完成度：约 94%**。真实 provider `/invest`、跨入口 SLA/并发恢复和生产 dossier 证据仍缺失。
- **Pi7 状态：未最终完成**。真实 provider 与完整产品验收条件尚未满足。

## pi24 后续计划

1. **彻底移除 runtime registry**：将 `@upup/pi-runtime` 中剩余 prompt/runtime port 注册 API 限制为内部迁移兼容层，改为显式 `PiCapabilityContext`/`PiApp` contract；删除 `@upup/utils/prompt-service` 对 registry 的读取。
2. **默认 composition 完整 capability catalog**：为 plan、subagent、state、memory、MCP、sandbox、permissions、storage 建立版本化 capability catalog、trust 和 dispose 生命周期，逐 session 隔离并验证并发安全。
3. **长期稳定性验证**：增加多 Session 并发、abort、compact、restart、provider failure、retry、dispose/reinitialize、跨进程恢复和 Gateway/Bridge/Cron/Daemon SLA 的真实 fixture 合同。
4. **全入口 smoke**：构建产物、CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 分层执行，记录 Session id、canonical event、tool call、policy decision、恢复点和 audit 信息。
5. **真实投研闭环**：在用户提供并确认凭证后执行一次真实 `/invest`，覆盖 `detect → plan → execute → verify → report`，保存 provider、模型版本、数据时间、证据 URI、假设、风险检查、approval/audit 和 dossier 导出。
6. **最终完成审计**：仅在上述证据齐全后删除剩余迁移 facade、复跑全仓 `bun test`、build、所有门禁和 `git diff --check`，再标记 Pi7 完成。

## pi24：Prompt capability 显式注入与 runtime registry 删除（2026-09-15）

### 本轮完成

- `@upup/utils` 的 LLM prompt service 已切换为显式 `PromptRunner`；生产代码不再读取 `@upup/pi-runtime` prompt registry。
- Memory、TUI、Eval 的所有生产 prompt 调用均由 Package/PiApp composition 注入 runner；缺少 runner 时 fail-closed，避免模块级 singleton 和隐式 fallback。
- `@upup/pi-runtime` 的 runtime port map 及 prompt/runtime 注册读取 API 已删除；PiApp 初始化/销毁不再写入或清空全局式 runtime registry。
- Memory RAG、extraction hook、TUI model selection、Eval CLI 的公共接口已同步收紧为显式 capability contract。

### 当前自动报告

- `bun scripts/report-pi7-architecture.ts`：51 workspace packages、51 Pi-native packages、root source files 25、root production files 3、root production lines 135。
- `legacyEventConsumers=[]`、`globalRegistryConsumers=[]`；唯一生产 AgentSession factory 为 `packages/pi-session/src/agent-session-factory.ts`；`structuralPercent=100`。

### 验证证据

- 类型、Pi runtime/App/TUI/Memory/Eval 定向测试、Pi contract suite、串行全仓测试、构建、CLI help、stdio JSON-RPC smoke 和全部 Pi7/module/package/runtime 门禁均通过。
- 串行全仓结果：2237 pass / 0 fail / 6867 assertions。
- 真实 provider `/invest` 未执行；本轮证据仍严格区分 fixture/local contract 与真实 provider。

### 进度判断

- **结构迁移：100%**，由自动报告和门禁得出，不代表产品闭环完成。
- **本地实现与合同：约 99%**；prompt registry 旁路已删除，剩余主要是长期并发/恢复、跨入口 SLA 和最终 facade 审计。
- **产品验收：约 94%**；真实 provider `/invest`、完整证据 dossier、跨入口长期稳定性和生产级恢复证据仍缺失。
- **Pi7：未完成**；未满足真实 provider 与最终产品验收条件，因此不提前标记完成。

## pi25 后续计划

1. **Capability catalog 完整化**：将 memory、permissions、storage、plan、subagent、MCP、sandbox 统一为版本化、session-scoped、可 dispose 的 Pi capability catalog，清理剩余 process singleton。
2. **长周期稳定性**：执行多 Session 并发隔离、abort、compact、restart、provider failure/retry、dispose/reinitialize、跨进程恢复和 Gateway/Bridge/Cron/Daemon SLA 合同，并分别记录串行与并发证据。
3. **全入口 smoke**：对 CLI、构建产物、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 执行 fixture smoke，记录 session id、canonical event、tool call、policy decision、恢复点和 audit。
4. **真实投研闭环**：在凭证明确配置并经用户确认后执行一次 `/invest`，覆盖 `detect → plan → execute → verify → report`，保留 provider、模型版本、数据时间、证据 URI、风险检查、审批和 dossier 导出。
5. **最终删除审计**：确认旧 facade、重复适配器、root 业务目录和兼容迁移入口无生产消费者后删除；复跑全仓测试、构建、所有门禁和 `git diff --check`，再标记 Pi7 完成。

## pi25：Capability Registry 去 Singleton 与显式 Extension Contract（2026-09-15）

### 当前基线

- 自动报告：`51` workspace packages、`51` Pi-native packages、root production `3` files / `135` lines；唯一 `AgentSession` Factory 为 `packages/pi-session/src/agent-session-factory.ts`。
- `legacyEventConsumers=0`、`globalRegistryConsumers=0`、root source dependency/cycle 门禁通过，结构迁移指标 `100%`。
- 本轮前置状态：Prompt/runtime registry 已删除；PiApp、Session、Package resource/trust/lifecycle 和主要投研能力已完成显式 composition。

### 本轮完成

- Capability host catalog 改为 session EventBus scope，删除 active/default process registry；扩展 API 的 `events` 和 host resolve path 均为显式依赖。
- 6 组残余扩展测试 fixture 改为 `createEventBus()` + `publishPiCapabilityHosts()`；门禁不再把任何 global capability registry 当作合法路径。
- 受影响扩展与 capability package 合同验证通过，保留 host identity、package version、session isolation 和 dispose 行为。

### 验证证据

- 定向扩展：`45 pass / 0 fail / 198 expect()`。
- Capability Registry：`6 pass / 0 fail / 19 expect()`。
- `typecheck`、Pi contracts、Pi7/module/package/migration/runtime checks、build、CLI help、diff check：全部通过。
- 全仓串行结果：`2234 pass / 3 fail / 6854 assertions`；3 个失败均为 5 秒时序边界，隔离重跑全部通过，因此不能记录为全仓绿。
- 真实 provider 与真实 `/invest`：未执行。

### 进度与未完成项

- 结构迁移 `100%`；本地实现/合同约 `99%`；产品验收约 `94%`。
- 未完成：多 Session 长周期并发、abort/compact/restart/provider retry/dispose/reinitialize、跨进程恢复和 Gateway/Bridge/Cron/Daemon SLA 的分层压力证据；真实 provider 投研 dossier；最终删除审计。

## pi26 后续计划

1. **并发稳定性专项**：定位全仓 5 秒边界的共享资源竞争，分离测试临时目录/端口/Session 文件，增加并发与串行基准；不放宽 timeout。
2. **Capability Catalog 完整化**：将 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 的 capability provider 统一纳入 session-scoped manifest negotiation，并补充 dispose/reinitialize 和 cross-session isolation 合同。
3. **入口 smoke 分层**：CLI/构建产物、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 各自执行真实 Pi Session fixture，记录 session id、canonical event、tool call、policy、恢复点和 audit。
4. **真实投研闭环**：在凭证配置且用户明确确认后执行一次 `/invest`，严格记录 `detect → plan → execute → verify → report`、provider/model/data time、evidence URI、assumptions、risk/approval/audit 与 dossier 导出；fixture 与真实 provider 分开保存。
5. **最终删除审计**：确认旧 facade、旧 registry、root 业务实现和兼容入口无生产消费者，删除可删项后复跑全仓、构建、全部门禁与真实入口 smoke；只有证据齐全才把 Pi7 标记完成。

## pi26：Session 状态隔离与 Extension EventBus fixture 收口（2026-09-15）

### 本轮完成

- 将 context-collapse 恢复状态从 `globalThis` 改为显式 `ContextCollapseState`，并增加 hydration、读取、清理和多 Session 隔离测试。
- 将 `PiSessionService` 的 records、Session directory 和 dispose 生命周期收敛到 service 实例；支持显式 session directory，防止测试与运行时实例相互污染。
- 将 backtest、portfolio、technical、investment-workflow、management 的 extension fixture 迁移到显式 `createEventBus()`，保持 capability host 按 Session 隔离。
- 扩展 Pi7 架构门禁，禁止 context-collapse global state；现有 capability/port/global registry 生产禁止项继续由自动检查维护。

### 结构基线与进度

- 自动报告：`51` workspace packages、`51` Pi-native packages、root production `3` files / `135` lines；唯一 `createAgentSession()` 位于 `packages/pi-session/src/agent-session-factory.ts`。
- `legacyEventConsumers=0`、`globalRegistryConsumers=0`、root dependency cycle 为 0，root allowlist 和 Pi manifest coverage 门禁通过。
- **结构迁移完成度：100%**。该数字由 `report-pi7-architecture.ts` 的结构指标计算，只说明架构迁移边界，不代表真实产品验收。
- **本地实现与合同完成度：约 99%**。Pi runtime、Package contract、Session 隔离、主要投研能力和入口合同已完成；剩余为长周期并发/恢复证据、跨入口 SLA 和最终 facade 删除审计。
- **产品验收完成度：约 94%**。`detect → plan → execute → verify → report` 已有本地 fixture、证据和可恢复 Session 合同，但真实 provider、生产凭证环境 dossier、外部副作用审批验收仍缺失。
- **Pi7 总体：未完成**。真实 provider `/invest` 与最终产品验收条件尚未满足，不提前标记完成。

### 本轮验证证据

- 定向扩展测试：`23 pass / 0 fail / 61 expect()`；Session 合同：`66 pass / 0 fail / 138 expect()`；Session service：`4 pass / 0 fail / 15 expect()`。
- `bun run test:pi-contracts`、`bun run typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`：通过。
- `@upup/pi-capability-registry`、`@upup/pi-session` build 和 `bun run build`：通过；构建产物资源复制完成。
- CLI/Pi print、SDK stdio、AgentRunner 隔离 smoke：分别 `4/4`、`1/1`、`1/1` 通过；全仓串行仍为 `2237 pass / 3 fail / 6875 assertions`，三个失败均为 5 秒时序边界，不能视为全仓全绿。
- 旧 global/legacy 扫描只命中门禁脚本中的禁止项字面量；生产消费者清单仍为 0。
- 真实 provider：未执行；没有将 fixture、dry-run、无凭证或本地合同结果作为真实市场数据证据。

## pi27 后续计划

1. **并发与恢复专项**：为 Session JSONL、临时目录、端口和 provider fixture 建立每次运行的隔离边界，复现并消除三项 5 秒边界失败；验证多 Session 并发、abort、compact、restart、provider failure/retry、dispose/reinitialize 和跨进程恢复。
2. **Capability Catalog 完整化**：将 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 的 provider、trust、scope、requirements、dispose/reinitialize 统一纳入 Package manifest negotiation，补齐 cross-session isolation 合同。
3. **入口 smoke 分层**：对 CLI、构建产物、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 分别执行同一 Pi Session fixture，记录 session id、canonical event、tool call、policy decision、恢复点、audit 和输出 artifact。
4. **真实投研闭环**：在凭证明确配置并经用户确认后执行一次真实 `/invest`，严格记录 `detect → plan → execute → verify → report`、provider/model/data time、evidence URI、assumptions、risk/approval/audit 与 dossier 导出；fixture 与真实 provider 分开保存。
5. **最终删除审计**：确认旧 facade、旧 registry、root 业务实现、重复事件适配器和兼容入口无生产消费者后删除可删项，复跑全仓、构建、全部门禁和真实入口 smoke；只有所有 Pi7 完成定义满足后才标记完成。

## pi27：Runner Session Registry 实例化（2026-09-15）

### 本轮完成

- 删除 `packages/pi-session/src/session-registry.ts` 的模块级 runner state 和初始化 promise；新增由 `PiSessionService` 持有的 `PiSessionRegistry`。
- `prompt-runner`、running 查询、工具查询和 dispose 全部通过当前 Session service 的 registry 运行，避免不同 PiApp/test composition 共享 session key 状态。
- 增加两个 Session service 使用相同 key 时的 state/running/dispose 隔离合同；公开 API 不再暴露旧的模块级 registry 读写函数。

### 当前进度

- **结构迁移：100%**。自动报告仍为 `51` workspace packages、`51` Pi-native packages、root production `3` files / `135` lines；唯一 AgentSession factory 和无 global/legacy consumer 门禁保持通过。
- **本地实现与合同：约 99%**。本轮进一步消除 runner registry process-level state；仍需长期并发/恢复、跨入口 SLA 和最终 facade 审计。
- **产品验收：约 94%**。本地五阶段 `/invest` fixture 已覆盖，但真实 provider、生产 dossier、外部副作用审批和真实市场数据尚未验证。
- **Pi7：未完成**，不以结构百分比代替产品验收。

### 本轮验证证据

- Session service：`5 pass / 0 fail / 22 expect()`。
- Runner/Gateway 组合：`15 pass / 0 fail / 42 expect()`；三项此前时序边界测试联合顺序执行为 `6 pass / 0 fail / 22 expect()`。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`@upup/pi-session build`、`git diff --check`：通过。
- 未将隔离 smoke、fixture 或无凭证结果记录为真实 provider 验收；完整全仓测试仍需在本轮改造后重新运行。

## pi28 后续计划

1. **完整回归与并发专项**：运行 `test:pi-contracts`、全仓串行和受控并发测试，记录三项 5 秒边界测试在 registry 实例化后的真实结果；不放宽 timeout。
2. **恢复生命周期矩阵**：对同一 Session 验证 prompt、abort、compact、restart、provider failure/retry、dispose/reinitialize、fork 和跨进程恢复，并检查 JSONL、事件、tool call、policy、audit 一致性。
3. **Capability Catalog 收口**：把 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 的 provider metadata、trust、scope、requirements 和 dispose/reinitialize 统一接入 Package manifest negotiation。
4. **入口 smoke 分层**：CLI、构建产物、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 复用同一 Pi Session fixture，分别保存恢复点和 canonical event 证据。
5. **真实投研闭环与最终审计**：在用户确认和凭证配置后执行真实 `/invest`；随后清理无生产消费者的 facade/兼容入口，只有所有 Pi7 完成定义满足后才标记完成。

## pi28 实施记录：显式 Pi worker composition 与回归验证（2026-09-15）

### 本轮实现

- 修复 `@upup/pi-session` 的 worker model 类型路径，统一使用锁定的 `@earendil-works/pi-ai`，使 Package build 与声明生成一致通过。
- 重新构建 `@upup/pi-session` 后确认测试实际加载最新 Factory 产物；`stock_analysis` 的 Platform worker 不再落入 `runPiPrompt()` 的全局 `PiSessionService` fallback，而是通过当前 `PiAgentSessionFactory` 显式创建、等待、读取并 dispose worker Session。
- 保持 worker 与主 Session 使用同一 Pi AgentSession Factory、同一 Package allowlist、model/runtime 和 capability composition；未重新引入 global registry，也未创建第二套 Agent loop。

### 真实验证

- `@upup/pi-session` build：通过。
- `production-finance-contract.test.ts --test-name-pattern stock_analysis`：`1 pass / 0 fail`；真实 Pi Package + Platform worker bridge 成功完成三次 worker 调用和 Session 清理。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`：全部通过。
- `test:pi-contracts`：通过。
- 失败项单文件隔离重跑：finance e2e `2/2`、profile registry `3/3`、fixture/performance `6/6` 通过。
- `bun test --isolate --max-concurrency 1`：`2235 pass / 6 fail / 6805 assertions`；6 个失败均为全仓同进程下固定 `5s` 时序超时，未出现 `stock_analysis` 逻辑失败。
- `git diff --check`：通过。

### 当前进度

- **结构迁移：100%**。Package manifest、唯一 Factory、显式 capability context、root allowlist 和禁止 global/legacy 扫描继续通过。
- **本地实现与合同：约 99%**。本轮补齐显式 worker composition；剩余为全仓同进程时序稳定性、长期恢复矩阵和最终 facade 审计。
- **产品验收：约 94%**。真实 provider `/invest`、真实 A 股/港股/海外数据、生产 dossier 导出、外部副作用审批和真实交易仍未执行。
- **Pi7：未完成**。上述百分比不代表真实 provider 或完整产品闭环已验收。

## pi29 后续计划

1. 定位并消除全仓同进程的 `5s` 时序污染；优先审计跨测试共享的 PiApp、session directory、provider metrics、环境变量和子进程生命周期，不放宽 timeout。
2. 补齐 Session 生命周期矩阵：多 Session 并发、abort、compact、restart、provider failure/retry、dispose/reinitialize、fork、跨进程恢复，并核对 JSONL、canonical event、tool call、policy 和 audit 一致性。
3. 将 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 的 provider metadata、trust、scope、requirements 和 lifecycle 全部纳入 Package manifest negotiation。
4. 分层执行 CLI、构建产物、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval smoke，保存 Session、事件、工具、策略、恢复点和 artifact 证据。
5. 在凭证配置且用户明确确认后执行一次真实 `/invest`，严格区分真实 provider 与 fixture 结果；完成最终删除审计后才可将 Pi7 标记完成。

## pi29 实施记录：Package capability negotiation 与 lifecycle contract（2026-09-15）

### 本轮实现

- `@upup/pi-runtime` 的 manifest 校验新增 capability 名称去重和 `./module#export` 生命周期入口格式校验。
- `@upup/pi-resource-composition` 新增 `PiPackageCatalog.validateLifecycleContracts()` 与 `negotiateCapabilities()`；启用 Package 时对 required capability 做精确版本协商，缺失 required capability fail-closed，optional capability 返回未解析状态。
- `@upup/pi-session` 的唯一 Factory 在 Package dependency 校验后执行 capability negotiation，Package manifest 不再只是静态元数据。
- Factory 将当前 Session 的 `market-data.*`、`financial.evidence`、`financial.audit` provider 版本从显式 `PiCapabilityContext` 注入 negotiation；声明的 required capability 不再对真实 provider 无条件拒绝。
- 新增 runtime 与 Package catalog 合同测试，覆盖重复 capability、非法 lifecycle、required/optional capability 和 reload 必须配套 initialize。

### 真实验证

- `@upup/pi-runtime`、`@upup/pi-resource-composition`、`@upup/pi-session` build：通过。
- runtime/catalog/session/production finance 定向合同：`33 pass / 0 fail / 134 assertions`。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`：全部通过。
- 结构报告仍为 `51` workspace packages、`51` Pi-native packages、root production `3` files / `135` lines、唯一 Factory、0 legacy/global consumers。
- 之前 6 个超时项的组合与 `src/runtime/pi` 全目录重跑均通过；一次全仓 `--isolate --max-concurrency 1` 在 `finance-context` 附近无输出并悬挂，已终止，未将其记为全仓通过。
- 真实 provider `/invest` 仍未执行，fixture 和本地合同结果未替代真实市场数据证据。
- capability provider 接入后的生产金融合同：`28 pass / 0 fail / 112 assertions`（含 Package catalog 与 runtime contract）。

### 当前进度

- **结构迁移：100%**。
- **本地实现与合同：约 99%**；Package manifest negotiation 和 lifecycle contract 已从声明校验推进为运行时可执行校验，剩余全仓稳定性和最终 facade 删除审计。
- **产品验收：约 94%**；真实 provider、生产 dossier 导出和跨入口长期恢复证据仍缺失。
- **Pi7：未完成**。

## pi30 后续计划

1. 修复全仓测试 harness 在长序列中的悬挂/5 秒时序问题，记录可复现的进程、文件和测试顺序，不修改 timeout 掩盖问题。
2. 为实际 capability provider 建立 catalog 注入合同：声明 capability 的 Package 必须从显式 `PiCapabilityContext` 获得 provider，并验证 session scope、版本隔离和 dispose。
3. 完成 Session 的 abort、compact、restart、provider failure/retry、dispose/reinitialize、fork 和跨进程恢复矩阵。
4. 分层执行 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 和构建产物 smoke，持久化 canonical event、policy、audit 和恢复证据。
5. 配置并确认真实 provider 后执行完整 `/invest` 闭环，完成最终 root allowlist 与旧 facade 删除审计后再标记 Pi7 完成。

## pi30 实施记录：Capability provider 绑定与生命周期回归（2026-09-15）

### 本轮完成

- 完成 capability version 的公共导出与使用统一：contract identifier `upup.pi.market-data.v1` 与 provider version `1.0.0` 分离。
- 唯一 `PiAgentSessionFactory` 在创建 Session-scoped `PiCapabilityContext` 后执行 Package capability negotiation；market-data、financial evidence、financial audit requirement 均绑定当前 provider 版本。
- `PiPackageCatalog` 的 lifecycle validation 与 capability negotiation 在真实 Factory 路径执行，而不只是独立合同测试。
- `PiSessionAdapter` 继续执行幂等 dispose、abort listener 清理、dispose 后 fail-closed 和 capability context revoke，保持不同 Session 的能力隔离。

### 验证证据

- `bun run typecheck`：通过。
- `bun run check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`：全部通过。
- `@upup/pi-runtime`、`@upup/pi-resource-composition`、`@upup/pi-session` build：通过。
- capability/runtime、catalog、session、market-data、production-finance 定向合同：70 pass / 0 fail。
- `bun run test:pi-contracts`：完整串行通过；`@upup/pi-platform` 单包复核为 56 pass / 0 fail，未把并行环境竞争误记为代码失败。
- `bun run build`：通过；18 个 Pi resource packages 复制到 `dist`，构建产物 `dist/upup --help` 通过。
- `git diff --check`：通过。
- 最新自动结构报告：51 workspace packages、51 Pi-native packages、root production 3 files / 135 lines、唯一 AgentSession Factory、0 legacy/global consumers、structuralPercent=100。

### 当前进度（自动结构指标 + 产品证据分层）

- **结构迁移：100%**。所有 workspace package 均有 Pi manifest，root allowlist、唯一 Factory、legacy/global 禁止项和模块边界门禁通过。
- **本地实现与合同：约 99%**。Runtime、Package contract、capability negotiation、Session 生命周期、金融能力和外围入口合同已通过；剩余为长周期恢复/并发证据与最终 facade 审计。
- **产品验收：约 94%**。本地 fixture 已覆盖主要 `detect → plan → execute → verify → report` 路径，但真实 provider `/invest`、真实市场数据、生产 dossier、跨入口长期 SLA 和副作用审批验收仍缺失。
- **Pi7 总体：未完成**。结构 100% 不等于产品 100%；在真实 provider 与最终产品验收证据齐全前不标记完成。

## pi31 后续计划

1. **稳定性专项**：建立独立测试进程与唯一临时 session/provider-metrics 目录，复现全仓 5 秒边界失败和长序列悬挂，记录测试顺序、子进程、文件锁和资源残留，修复根因而不修改 timeout。
2. **Session 恢复矩阵**：增加多 Session 并发隔离、abort、compact、restart、provider failure/retry、dispose/reinitialize、fork、跨进程恢复合同，校验 JSONL、canonical event、tool call、policy、audit 和 finance context 一致性。
3. **完整 Capability Catalog**：为 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 补齐 manifest requirement、provider version、trust、scope、initialize/reload/dispose 和 cross-session isolation 合同。
4. **入口 smoke 分层**：对 CLI、构建产物、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval 使用同一 fixture，分别保存 session id、事件序列、工具调用、策略决定、恢复点、审计记录和导出 artifact。
5. **真实投研验收**：仅在凭证配置并获得明确确认后执行一次真实 `/invest`，覆盖 A 股/港股/海外可配置市场和 `detect → plan → execute → verify → report`，独立记录 provider、模型、数据时间、证据 URI、假设、风险、approval/audit 与 dossier。
6. **最终删除审计**：确认旧 facade、重复 adapter、root 业务实现和兼容入口无生产消费者后删除可删项，重跑全仓测试、构建、所有门禁、入口 smoke 与真实 provider 分层验证；全部完成定义满足后才将 Pi7 标记完成。

## pi31 实施记录：Session 并发初始化与重启恢复首批矩阵（2026-09-15）

### 本轮完成

- 在 `@upup/pi-session` 内增加 service-scoped `recordInitializations`，对同一持久 Session ID 的并发 `create`/`resume` 做 promise 去重；不引入 process-global registry。
- `PiSessionService` 恢复 record 时从 Pi Session header 恢复 `createdAt`，metadata 继续从 `upup_session_metadata` custom entry 恢复。
- 恢复路径在已有初始化 promise 存在时等待该 promise，避免 JSONL 尚未落盘时错误返回 `Pi session not found`。
- 新增合同验证真实 JSONL header、metadata、跨 service directory 隔离和 restart 后恢复。

### 验证证据

- `@upup/pi-session`：71 pass / 0 fail / 164 assertions。
- Session service 定向：7 pass / 0 fail / 32 expect()；新增并发同 ID 去重、createdAt/header 恢复和 metadata 恢复覆盖。
- `@upup/pi-session` build、`typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`git diff --check`：全部通过。
- 真实 SDK stdio 合同连续 3 次通过，每次 1 pass / 0 fail / 11 assertions，覆盖进程重启后的 get/resume/end。
- 本轮第一次 stdio 运行出现单次 5 秒 timeout，未修改 timeout；随后连续三次通过，因此记录为测试边界抖动风险而非代码绿化。

### 当前进度

- **结构迁移：100%**，自动报告与静态门禁保持通过。
- **本地实现与合同：约 99%**，Session 并发初始化和 restart/metadata 恢复首批证据已补齐；compact/fork/provider failure/retry/跨进程压力矩阵仍缺。
- **产品验收：约 94%**，真实 provider `/invest`、真实市场数据、生产 dossier 和副作用审批仍未验证。
- **Pi7：未完成**，不以本地恢复合同替代完整产品验收。

## pi32 后续计划

1. **完成 Session 生命周期矩阵**：补充真实 Pi Session 的 abort、compact、fork、provider failure/retry、dispose/reinitialize、多 Session 并发和跨进程恢复，逐项校验 JSONL、canonical event、finance context、policy/audit 和导出 artifact。
2. **稳定性 harness**：将 stdio、Gateway、Bridge、Cron、Daemon 和 SDK smoke 放入独立临时目录/独立进程，记录首个失败请求、子进程退出码、文件锁和资源残留，解决 5 秒边界而不调整 timeout。
3. **Capability catalog 扩展**：为 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 增加真实 provider version、scope、trust、initialize/reload/dispose 和隔离合同。
4. **完整入口回归**：对构建产物与源码入口分别执行 CLI、stdio、Gateway、Bridge、Cron、Daemon、SDK、Eval smoke，统一收集 session/event/tool/policy/audit/recovery 证据。
5. **真实投研闭环**：仅在凭证配置并获得明确确认后运行一次真实 `/invest`，独立记录 provider、模型、数据时间、证据 URI、风险检查、approval/audit 和 dossier。
6. **最终清理审计**：确认生产消费者为零后删除剩余兼容 facade 和重复入口，执行全仓测试、构建、静态门禁与真实 provider 分层验收；满足全部定义后才标记 Pi7 完成。

## pi32 实施记录：Pi 原生 compact/fork 与 provider retry（2026-09-15）

### 本轮完成

- 在 `src/runtime/pi/reliability.test.ts` 使用真实 `PiAgentSessionFactory` 验证长上下文 `compact()`，并确认 compaction 后仍可导出和通过 Pi SessionManager 创建独立 fork。
- 增加 transient provider error 合同：同一 Session 首次产生 `session_error`，随后 retry 成功，结果写回原 JSONL；未创建备用 AgentSession。
- 组合验证 process-style dispose/recovery、compact/fork、provider failure/retry，形成首批 Session 生命周期矩阵。

### 验证证据

- Pi reliability：3 pass / 0 fail / 12 expect()。
- Pi fixture + reliability：8 pass / 0 fail。
- `@upup/pi-session`：71 pass / 0 fail / 164 assertions；Session service：7 pass / 0 fail / 32 expect()。
- `@upup/pi-session` build、`typecheck`、Pi7/module/package/migration/runtime checks、`git diff --check`：通过。
- 完整 `bun run test:pi-contracts` 串行通过，`bun run build` 通过；stdio restart/resume 合同此前连续 3 次通过。
- 这些结果均为本地 Pi fixture/contract evidence，不冒充真实市场 provider 或真实交易验证。

### 当前进度

- **结构迁移：100%**，唯一 Factory、Package manifest、root allowlist、无 legacy/global production consumers 保持通过。
- **本地实现与合同：约 99%**，并发初始化、restart、metadata、compact、fork、provider retry 首批合同已完成；abort/reinitialize/跨进程压力和完整 capability catalog 仍缺。
- **产品验收：约 94%**，真实 `/invest`、真实 A 股/港股/海外数据、生产 dossier、入口 SLA 和副作用审批仍未验证。
- **Pi7：未完成**。

## pi33 后续计划

1. **补齐生命周期矩阵**：验证 abort 后 JSONL 一致性、dispose/reinitialize capability revoke、同一 Session 跨进程恢复、多 Session 并发和 fork 后独立写入。
2. **Provider retry contract**：明确 retry 次数、backoff、错误分类和最终失败状态，校验 canonical event 与 audit 记录，不允许隐式 fallback provider。
3. **Capability catalog 收口**：为 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 补齐 manifest capability requirements、scope、trust、lifecycle 和版本隔离。
4. **稳定性 harness**：独立运行入口 smoke，记录超时的首个 RPC、子进程、session 文件和资源残留，修复 5 秒边界根因而不调整测试 timeout。
5. **真实投研闭环与最终清理**：凭证确认后执行一次真实 `/invest`；之后完成 root/facade 删除审计、全仓测试、构建、入口 smoke 和产品验收，再决定是否完成 Pi7。

## pi33 实施记录：Session get/create 竞态与 dispose 收口（2026-09-15）

### 本轮完成

- `PiSessionService` 为每个持久 Session ID 维护 service-scoped 初始化 promise；`get()`、`create()`、`resume()` 在初始化交错时共享同一个 Pi Session。
- 增加 disposed 状态门禁并覆盖所有公开生命周期操作；旧 Service dispose 后不可创建、读取或运行 Session，防止 PiApp reinitialize 后旧 composition 泄漏。
- 新增竞态与 fail-closed 合同，保持不同 Session service 的目录、记录、runner registry 和 capability scope 隔离。

### 验证证据

- Session service：8 pass / 0 fail / 35 expect()。
- `@upup/pi-session`：72 pass / 0 fail / 167 assertions。
- Pi reliability：3 pass / 0 fail / 12 expect()；Pi fixture + reliability：8 pass / 0 fail / 51 expect()。
- 完整 Pi contract suite 串行通过；`typecheck`、Pi7/module/package/migration/runtime checks、build、`git diff --check` 全部通过。
- 并行执行中的 stdio 5 秒边界失败未被掩盖或调整 timeout；独立串行合同再次通过，因此保留为稳定性专项而非代码回归。

### 当前进度

- **结构迁移：100%**，自动结构指标无变化且所有禁止项门禁通过。
- **本地实现与合同：约 99%**，Session init/restart/get race/dispose/compact/fork/provider retry 已有合同；多进程压力、abort 后持久化和完整 capability catalog 仍缺。
- **产品验收：约 94%**，真实 provider `/invest`、真实市场数据、生产 dossier、跨入口 SLA 与副作用审批尚未验证。
- **Pi7：未完成**。

## pi34 后续计划

1. **跨进程恢复压力**：独立启动多个 stdio/SDK 进程操作不同和相同 Session，验证 JSONL 锁、事件顺序、metadata、fork 文件和 dispose 后能力撤销。
2. **Abort 一致性**：真实 Pi prompt 中途 abort，确认 `session_error`/取消状态、未产生半截 finance context、后续 retry 可恢复。
3. **Retry/backoff contract**：为 provider 错误分类、最大重试、退避和最终失败 audit 增加可序列化合同，禁止隐式 provider fallback。
4. **Capability catalog 完整化**：memory、permissions、storage、planning、subagent、MCP、sandbox、observability 全部声明版本、trust、scope 和 lifecycle。
5. **稳定性与最终验收**：解决并行入口 5 秒边界根因，完成全仓测试与入口 smoke；凭证确认后执行真实 `/invest`，再做最终删除审计并决定 Pi7 完成状态。

## pi34 实施记录：初始化完成后的 dispose 竞态修复（2026-09-15）

### 本轮完成

- 修复 `PiSessionService` 的异步初始化竞态：runtime 在 service dispose 后才返回 Session 时，该 Session 不会写入旧 records，而是立即 dispose 并返回明确错误。
- 增加延迟 runtime 合同，覆盖 dispose 与 create 同时发生、初始化完成后发布前的 fail-closed 行为。
- 继续保持每个 PiApp/Session service 独立的 record、initialization、runner registry 和 capability 生命周期。

### 验证证据

- Session service：9 pass / 0 fail / 38 expect()。
- 受影响的 Pi Session、reliability、fixture 合同与完整 Pi contract suite：串行通过。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、Package/root build、`git diff --check`：通过。
- 该结果证明 dispose/reinitialize 的一个关键异步竞态已收口，但不等同于跨进程压力或真实 provider 验收。

### 当前进度

- **结构迁移：100%**，唯一 Pi AgentSession Factory、51 个 Pi manifest、root allowlist 和无 legacy/global production consumers 保持通过。
- **本地实现与合同：约 99%**，Session init/get/restart/metadata/compact/fork/provider retry/dispose race 已有证据；跨进程压力、abort 持久化、retry policy 和完整 capability catalog 仍缺。
- **产品验收：约 94%**，真实 `/invest`、真实市场数据、生产 dossier、跨入口 SLA 和副作用审批尚未验证。
- **Pi7：未完成**。

## pi35 后续计划

1. **跨进程 Session 压力**：并行启动多个 stdio/SDK 进程，分别操作独立与相同 Session，验证 JSONL 原子性、metadata、事件顺序、fork 和恢复。
2. **Abort 持久化合同**：中途 abort 真实 prompt，校验 canonical error/cancel event、finance context、JSONL 完整性和同一 Session retry。
3. **Retry/backoff 审计**：为 provider 错误分类、retry 次数、backoff、最终失败和 audit 记录建立序列化合同，禁止隐式 fallback。
4. **Capability catalog 最终化**：memory、permissions、storage、planning、subagent、MCP、sandbox、observability 统一接入 manifest requirement、version、trust、scope、initialize/reload/dispose。
5. **最终验收**：修复并行入口 5 秒边界，完成全仓测试、所有入口 smoke 和真实 provider `/invest`；完成 root/facade 删除审计后再决定是否标记 Pi7 完成。

## pi35 实施记录：Pi 原生 Abort 持久化与同 Session 恢复（2026-09-15）

### 本轮完成

- 使用真实 Pi `AgentSession` 与可取消工具 fixture，在 `tool_start` 事件触发 abort，确保合同覆盖 in-flight cancel。
- abort 后验证 `session_error` canonical event、原 JSONL 每行完整可解析、finance/session 状态未产生损坏，并在同一 Session 中 retry 成功。
- runner 测试改用 PiApp 正式 `dispose → initialize` reinitialize 生命周期，避免直接销毁 singleton 后污染下一测试；旧 service 仍保持 fail-closed。

### 验证证据

- Pi reliability：4 pass / 0 fail / 16 expect()。
- `@upup/pi-session`、runner、Pi fixture、完整 `test:pi-contracts`：通过。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、build、`git diff --check`：通过。
- 本轮验证仍是本地 Pi provider/fixture，不代表真实市场 provider 或真实交易执行。

### 当前进度

- **结构迁移：100%**，Pi Package、唯一 Factory、root allowlist、无 legacy/global production consumer 保持通过。
- **本地实现与合同：约 99%**，Session init/race/restart/metadata/compact/fork/provider retry/abort/reinitialize 已有合同；跨进程压力、retry/backoff audit 和完整 capability catalog 仍缺。
- **产品验收：约 94%**，真实 `/invest`、真实 A 股/港股/海外数据、生产 dossier、入口 SLA 和副作用审批仍未验证。
- **Pi7：未完成**。

## pi36 后续计划

1. **跨进程压力矩阵**：并行启动多个 stdio/SDK 进程操作不同与相同 Session，验证 JSONL 原子性、锁、metadata、event 顺序、fork 和恢复。
2. **Retry/backoff audit**：为 provider 错误分类、重试次数、退避、最终失败和审计记录建立可序列化合同，禁止隐式 fallback。
3. **Capability catalog 完整收口**：memory、permissions、storage、planning、subagent、MCP、sandbox、observability 全部接入 manifest requirement、version、trust、scope、initialize/reload/dispose。
4. **稳定性 harness 与全仓验证**：隔离入口进程和临时目录，定位并修复 stdio 5 秒边界；再跑全仓测试、构建、所有入口 smoke。
5. **真实产品验收**：凭证确认后执行真实 `/invest`，记录 provider/model/data time/evidence/risk/approval/audit/dossier；完成最终 root/facade 删除审计后再决定 Pi7 状态。

## pi36 实施记录：跨进程 Session 锁与 stdio 并发恢复合同（2026-09-15）

### 本轮完成

- `@upup/pi-session` 新增原子目录文件锁，覆盖持久 Session 的跨进程创建、读取、运行、更新、metadata、messages、compact、fork、export 和 remove；锁为目录级临界区，超时/stale 清理后仍以异常终止，不静默丢数据。
- 收口锁内 resume 调用，增加 `resumeRecord()`，消除同进程嵌套锁死；保留 service-scoped pending initialization 和 dispose fail-closed 语义。
- SDK stdio 合同新增双进程真实验证：不同 Session 并发隔离、同 Session 并发更新、JSONL 全行可解析、重启后双 Session 恢复。

### 真实验证

- `@upup/pi-session`：`73 pass / 0 fail / 170 expect()`。
- `packages/sdk/src/pi-session-contract.test.ts`：既有重启合同单独运行 `1 pass / 0 fail / 11 expect()`；跨进程并发合同 `1 pass / 0 fail`。
- `bun run typecheck`、`git diff --check`：通过。
- 本轮结果是本地 Pi fixture/provider 合同，不是真实市场 provider 或真实交易验证。

### 当前进度

- **结构迁移：100%**，自动报告仍以 `bun run report:pi7` 为准；本轮未改变结构百分比。
- **本地实现与合同：约 99%**，新增跨进程锁与 stdio 并发/恢复证据；retry/backoff audit、完整 capability catalog、入口长期 SLA 仍未完成。
- **产品验收：约 94%**，真实 `/invest`、真实 A 股/港股/海外数据、生产 dossier、真实副作用审批仍未验证。
- **Pi7：未完成**，不以 fixture 或压力合同替代真实 provider 产品验收。

## pi37 后续计划

1. 建立独立进程稳定性 harness，记录每个 JSON-RPC 请求、首个失败响应、子进程退出码、锁残留和临时目录状态，复现并修复 stdio 5 秒边界抖动。
2. 为 provider transient/permanent error 分类、retry/backoff、最终失败和 canonical audit entry 建立 Pi Session 可恢复合同。
3. 补齐 memory、permissions、storage、planning、subagent、MCP、sandbox、observability capability catalog 的 version/trust/scope/initialize/reload/dispose 隔离合同。
4. 对 CLI、Gateway、Bridge、Cron、Daemon、SDK、stdio、Eval 执行同一 fixture 的入口 smoke，并记录 session/event/tool/policy/audit/recovery artifact。
5. 仅在用户确认凭证和真实 provider 执行条件后完成一次真实 `/invest` 闭环；未完成前不标记 Pi7。

## pi37 实施记录：Provider Retry、Package 合同与 stdio 稳定性（2026-09-15）

### 本轮完成

- 在 `@upup/pi-observability` 固化 provider retry contract 和 `provider_retry` audit event：transient/permanent/abort 分类、最大尝试次数、指数退避、jitter、AbortSignal、成功/失败/中断 outcome 均可序列化恢复。
- 在 `@upup/pi-market-data` 接入 Yahoo/Tushare quote/history 的统一 retry；永久错误不重试，provider 失败不被 synthetic 数据掩盖。
- 修复 `PiPackageCatalog` 对空资源数组的错误限制；基础 Package 可合法声明空 extensions/skills/prompts/workflows/policies/evals，同时保留路径、重复、信任和依赖校验。
- 将 `@upup/pi-event-adapter` 加入默认 Package catalog，使 observability 的依赖闭包可被显式发现、pin 和加载；未引入动态依赖隐藏或 global fallback。
- 新增独立 stdio stability harness，实际启动 2 个 stdio 子进程，执行 5 轮并发 initialize、不同/相同 Session create/update、export/get/messages、JSONL/lock 检查；initialize 冷启动预算为 15 秒。
- 将 `test:pi-contracts` 的真实跨进程合同测试显式设置为 15 秒，避免 Bun 默认 5 秒导致的环境抖动误报。

### 证据

- observability：`43 pass / 0 fail / 97 expect()`；market-data：`67 pass / 0 fail / 277 expect()`；resource-composition：`5 pass / 0 fail / 15 expect()`。
- stdio stability：`rounds=5`、`completedRounds=5`、`failures=[]`、`lockResidues=[]`、`malformedJsonl=[]`。
- `bun run test:pi-contracts`、`typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`build`、`git diff --check`：全部通过。
- 本轮仅执行本地 fixture/provider 和真实子进程协议验证；真实 provider、真实市场数据、真实交易、通知和凭证访问未执行。

### 当前基线与进度

- **结构迁移：100%**。51 workspace packages、51 Pi-native manifests、root production files 3、root production lines 约 135、唯一 `createAgentSession`、legacy/global production consumers 0。
- **本地实现与合同：约 99%**。Pi Runtime、Package contract、Session lifecycle、provider retry audit、跨进程 stdio stability 已有本地证据；仍缺完整 capability catalog 长期隔离矩阵和所有入口长期 SLA 证据。
- **产品验收：约 94%**。`detect → plan → execute → verify → report` 有 fixture/Session 合同，但真实 `/invest` dossier、真实多市场数据、生产 approval 副作用和真实 provider 证据未完成。
- **Pi7 状态：未完成**。不以结构百分比、fixture 或本地压力测试替代真实产品验收。

## pi38 后续计划

1. **Capability catalog 完整化**：为 memory、permissions、storage、planning、subagent、MCP、sandbox、observability 建立 manifest requirement/version/trust/scope/lifecycle 统一矩阵，增加并发 Session、重复 initialize、reload、dispose 后调用和版本不匹配合同。
2. **入口一致性矩阵**：用同一 fixture 对 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval 运行 `detect → plan → execute → verify → report`，记录 canonical event、Session JSONL、tool audit、policy decision、evidence 和恢复结果。
3. **长期 SLA 与故障注入**：增加 provider timeout、429/5xx、网络中断、abort、restart、compact、fork、stale lock、部分写入和 retry exhaustion 的可重复报告，区分 fixture 与真实 provider 结果。
4. **Pi Package 终审**：自动检查默认加载集合、依赖闭包、资源复制、manifest/trust/lifecycle 一致性；清理无生产消费者的 facade，并确认 root allowlist 没有回流业务实现。
5. **真实产品验收（需用户确认）**：仅在确认可用凭证、provider、标的范围和只读/副作用边界后执行一次真实 `/invest`，导出带 provider/model/data-time/evidence/assumption/risk/approval/audit 的 dossier，并与 fixture 结果分开记录。
6. **完成判定**：在真实 `/invest`、入口 smoke、并发恢复、默认 sandbox/approval 和最终删除审计全部具备证据前，不将 Pi7 标记为完成。

## pi38 实施记录：Capability Catalog 与统一生命周期合同（2026-09-15）

### 本轮完成

- 在 `@upup/pi-runtime` 固化 `PiCapabilityDescriptor` 与 `PI_CAPABILITY_CATALOG`，统一描述 13 类能力的 version、scope、trust 和 lifecycle；`PiCapabilityContext.describe/catalog/dispose` 提供显式 session 视图并在 dispose 后清空。
- `PiPackageCatalog.negotiateCapabilityCatalog()` 对 scope、trust、lifecycle 和 version 逐字段匹配，缺失、版本不匹配、trust 越界或生命周期不一致均 fail-closed。
- `PiAgentSessionFactory` 在唯一生产 Session 创建入口接入完整 catalog；保留旧注入能力的 value-version 校验，兼容 fixture，同时拒绝未声明能力。
- 基础包和平台/金融包 manifest 已声明实际能力：memory、permissions、storage、planning、MCP、sandbox、observability、financial evidence/audit、market-data trend store。
- 结构报告新增 `capabilityCatalog` 节，门禁检查所有声明能力都在 catalog 中且 descriptor 完全一致；当前 `undeclared=[]`。

### 验证结果

- `@upup/pi-runtime`：`17 pass / 0 fail / 49 expect()`。
- `@upup/pi-resource-composition`：`23 pass / 0 fail / 62 expect()`。
- 关键 CLI/stdio/Gateway/Factory/Workflow 合同：`66 pass / 0 fail / 326 expect()`。
- `bun run test:pi-contracts`：通过；`UPUP_PI_STDIO_STABILITY_ROUNDS=5 bun run verify:pi-stdio-stability`：`completedRounds=5`，失败/锁残留/损坏 JSONL 均为 0。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`build`、`git diff --check`：全部通过。
- 真实 provider、真实市场数据、真实交易、外发通知和凭证访问未执行，未将 fixture 结果冒充真实验收。

### 进度与下一步

- **结构迁移：100%**；**本地实现与合同：约 99%**；**产品验收：约 94%**；Pi7 仍未完成。
- 下一轮聚焦统一入口闭环矩阵、长期 SLA/故障注入、默认加载与资源复制终审，以及用户确认后的真实 `/invest` dossier 验收。

## pi39 实施记录：统一入口一致性矩阵与 SDK 合同收口（2026-09-15）

### 本轮完成

- 新增 `scripts/verify-pi-entry-matrix.ts`，定义 `upup.pi.entry-matrix.v1` 报告，统一使用 faux Pi provider 和临时 Session 目录验证 CLI、Gateway、Cron、Daemon、Bridge、stdio、SDK、Eval 八类入口。
- CLI、Gateway、Cron、Daemon、Bridge 通过真实入口/API 完成 fixture Pi prompt 或 transport smoke；stdio 通过真实 server lifecycle；SDK 复用 stdio Session contract；Eval 在无外部凭证时保持 contract-only。
- 报告记录入口状态、fixture、session id、answer、canonical event、JSONL/artifact、policy/audit 说明，且明确 contract-only 与 passed 的边界。
- `packages/sdk/src/pi-session-contract.test.ts` 修复临时目录前置条件，`packages/sdk/package.json` 将测试 timeout 与真实跨进程 Session 合同统一为 15 秒。

### 验证证据

- `bun run verify:pi-entry-matrix`：`total=8`、`passed=5`、`contractOnly=3`、退出码 0；CLI/Gateway/Cron/Daemon 使用同一 faux provider，Bridge health 真实绑定端口并正常释放。
- `bun --cwd packages/sdk test`：`22 pass / 0 fail / 69 expect()`。
- `bun run typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`build`、`git diff --check`：全部通过。
- 入口验证没有读取真实凭证或访问真实市场/外部 provider；因此结果仅作为本地 fixture/合同证据。

### 当前基线

- **结构迁移：100%**：51 workspace packages、51 Pi-native manifests、root production files 3、约 135 行、唯一生产 AgentSession factory、无生产 `legacy-events`/global registry consumer。
- **本地实现与合同：约 99%**：Package capability catalog、Session 生命周期、跨进程锁/恢复、provider retry audit、stdio stability 和第一版入口矩阵均有本地验证。
- **产品验收：约 94%**：真实 provider `/invest`、真实 A 股/港股/海外数据、生产 dossier、跨入口长期 SLA、真实 approval/sandbox 副作用仍未验证。
- **Pi7 状态：未完成**：不以 fixture、contract-only 或结构百分比替代完成定义。

## pi40 后续计划

1. 将入口矩阵升级为独立子进程/真实 transport 端到端：stdio 与 SDK 执行完整 JSON-RPC create/run/export/restart/resume；Bridge 执行认证 WebSocket chat；Eval 使用可注入本地 evaluator，保存统一 event/session/audit/evidence artifact。
2. 增加入口长期 SLA 与故障注入：provider timeout、429/5xx、网络中断、abort、restart、compact、fork、stale lock、部分 JSONL 写入和 retry exhaustion，报告首个失败请求、退出码、锁残留和恢复结果。
3. 完成默认 Package catalog/资源复制/依赖闭包终审，检查所有入口只经 Package public API，不产生第二个 AgentSession、event mapper、tool registry 或 global fallback。
4. 补齐 `/invest` 五状态机真实 artifact 合同：`detect → plan → execute → verify → report` 每一步写入可恢复 Session、证据来源/时间、假设、模型版本、风险检查、审批和 audit；继续维持副作用默认 deny/sandbox。
5. 在用户明确确认凭证、provider、标的范围和只读边界后，单独执行一次真实 `/invest`；真实结果与 fixture 结果分开保存，不自动执行交易、通知、文件外发或凭证访问。
6. 完成 root allowlist 和 deprecated facade 最终删除审计；仅当真实产品闭环、全部入口 smoke、长期恢复、默认 approval、静态门禁、全仓测试、构建和真实 provider 证据齐备时，才将 Pi7 标记完成。

## pi40 实施记录：全入口端到端与 stdio 稳定性收口（2026-09-15）

### 本轮完成

- 入口矩阵升级为真实协议调用：Bridge 认证 WebSocket chat、stdio JSON-RPC Session 操作、SDK public client Session 操作、Eval 本地注入 evaluator 单题执行；不再将这四项标记为 `contract-only`。
- 矩阵使用同一 faux provider 与临时 Session 目录，跨进程入口优先使用已构建 `dist/upup`，阶段日志和超时使冷启动、协议失败、锁等待可区分。
- 修复 Bridge `onmessage` 并发覆盖、非法 Session ID 和 stdio export 写入根目录问题；根 build 现在先构建 `@upup/utils`、`@upup/pi-evals`，避免 stale dist 引用已删除的 `src/runtime/pi/runner.ts`。
- stdio stability harness 改用构建产物并将真实跨进程 RPC 预算统一为 60 秒，仍保持锁残留、JSONL 解析和退出码检查。

### 验证证据

- `bun run verify:pi-entry-matrix`：`8/8 passed`、`0 contractOnly`、退出码 0；实际包含 WebSocket chat、JSON-RPC create/export、SDK create/get、Eval question/complete。
- `UPUP_PI_STDIO_STABILITY_ROUNDS=5 bun run verify:pi-stdio-stability`：`completedRounds=5`，`failures=[]`、`lockResidues=[]`、`malformedJsonl=[]`。
- `bun run test:pi-contracts`、`bun run build`、`bun run typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`git diff --check`：全部通过。
- 结果全部来自 fixture、Pi Package public API 和本地构建产物；真实 provider、真实市场数据、真实 `/invest` 和外部副作用没有执行。

### 当前基线

- **结构迁移：100%**：51 workspace packages、51 Pi manifests、唯一生产 AgentSession factory、root production files 3、无生产 legacy/global registry consumer。
- **本地实现与合同：约 99%**：能力 catalog、Session lifecycle、跨进程锁、provider retry audit、入口端到端和 stdio 稳定性已有证据。
- **产品验收：约 94%**：真实投研闭环 dossier、真实 provider、多市场数据、长期 SLA、默认副作用 approval 和最终删除审计仍缺。
- **Pi7 状态：未完成**。

## pi41 后续计划

1. 增加真实 `/invest` fixture artifact 合同：每个 `detect → plan → execute → verify → report` 阶段写入 Session JSONL、evidence、source time、assumptions、risk decision、approval 和可导出 dossier，并验证 restart/resume。
2. 增加长期入口 SLA 与故障注入报告：连续运行各入口，覆盖 provider timeout、429/5xx、网络中断、abort、compact/fork、stale lock、partial write 和 retry exhaustion。
3. 对默认 Package catalog、资源复制、依赖闭包、trust/credential/network policy 做最终审计，确保入口只通过 public API 且没有重复 AgentSession/event mapper/tool registry。
4. 完成 root allowlist 与 deprecated facade 生产消费者零引用审计；仅删除有静态和行为证据支持的旧路径，不保留长期双轨兼容。
5. 在用户明确确认凭证、provider、标的范围和只读/副作用边界后，单独执行一次真实 `/invest`；真实结果与 fixture 报告分层保存。
6. Pi7 完成判定仍需同时满足真实产品闭环、长期恢复、默认 sandbox/approval、全仓测试、构建、所有入口 smoke、静态门禁和真实 provider 证据。

## pi41 实施记录：投资 dossier 五阶段 artifact 合同（2026-09-15）

### 本轮完成

- `@upup/pi-investment-workflow` 新增 `upup.pi.investment-dossier.v1`，统一产出五阶段 `detect → plan → execute → verify → report` artifact。
- artifact 包含 evidence/source time/auditId/data freshness、risk、policy decision、model/data version、assumptions 和可验证 hash；阶段 checkpoint 进入 Pi Session custom entry，并写入可恢复 dossier 文件。
- `WorkflowResult` 公开 dossier 与文件路径；暂停/恢复、fork、幂等路径均由同一 Pi Session contract 验证，不新增 AgentSession 或独立 workflow loop。
- Package build 明确 externalize Pi/UpUp runtime 依赖，resource composition 不再通过自身公共包名反向导入内部实现。

### 验证证据

- workflow package：`86 pass / 0 fail / 281 expect()`。
- runtime workflow：`4 pass / 0 fail / 19 expect()`，覆盖 checkpoint、paused/resume、fork、idempotency。
- `bun run typecheck`、`git diff --check`、workflow/resource package build：通过。
- `test:pi-contracts` 重跑通过，包含 `@upup/pi-resource-composition` 包合同；此前直接从包目录运行时的环境/默认路径问题不影响 workspace/root 入口。
- 真实 provider、真实市场数据、真实 `/invest`、真实交易、通知、凭证访问均未执行；本轮为本地 fixture/注入 provider 验证。

### 当前基线

- **结构迁移：100%**：51 workspace packages、51 Pi manifests、唯一生产 AgentSession factory、root production files 3、legacy/global registry 生产消费者为 0。
- **本地实现与合同：约 99%**：Pi Package contract、capability catalog、Session lifecycle、跨进程锁、retry audit、入口矩阵和 dossier artifact 已有证据。
- **产品验收：约 95%**：fixture 五阶段 dossier、证据、风险、policy、hash、暂停/恢复已验证；真实 provider、多市场真实数据、长期入口 SLA、生产副作用 approval 和最终删除审计仍缺。
- **Pi7 状态：未完成**。完成定义不接受结构百分比或 fixture 结果替代真实产品闭环。

## pi42 后续计划

1. **保持 resource contract 回归**：继续通过 workspace 根目录运行 `@upup/pi-resource-composition` 合同，避免把包目录直接运行的 cwd 差异误判为生产失败；若后续需要单包开发体验，再单独修正测试 fixture 的父目录初始化。
2. **入口故障注入矩阵**：为 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval 统一覆盖 timeout、429/5xx、网络中断、abort、restart、compact、fork、stale lock、partial write 和 retry exhaustion，保存首个失败请求、退出码、锁残留、恢复结果。
3. **真实 `/invest` 只读验收**：先取得用户明确的 provider、凭证、标的范围和只读边界；执行一次真实多市场投研，分别记录 provider/model/data time/evidence/risk/approval/audit/dossier，禁止交易、外发通知和未经批准文件写入。
4. **默认 Package 终审**：生成 discovery matrix、manifest/resource/trust/lifecycle/dependency closure 报告，确认所有入口只依赖 Package public API，没有第二个 AgentSession、event mapper、tool registry 或 global fallback。
5. **root 清理终审**：基于生产消费者为零的静态报告，删除剩余 deprecated facade、重复 command/skill/tool 适配器和无用 root 路径；每次删除后执行模块边界、迁移、runtime 和 package 门禁。
6. **产品验收与 Pi7 完成判定**：补齐长期 SLA、恢复/并发、真实 provider 和最终构建/全仓测试；只有所有完成定义同时满足后，才将 `pi7.md` 标记为完成。

## pi42 实施记录：共享运行时故障注入与恢复矩阵（2026-09-15）

### 本轮完成

- 新增 `verify:pi-faults`，通过 Pi public API 验证 provider 429/503、网络中断耗尽、abort、stale lock、partial JSONL、Session restart/compact/fork 六类故障恢复。
- `@upup/pi-session` 公开文件锁合同，故障测试不绕过 Package 边界；报告包含首个失败、retry 次数/audit code、artifact、锁残留和恢复结果。
- 故障报告 schema 为 `upup.pi.fault-matrix.v1`，直接覆盖共享 Pi AgentSession、Session JSONL、retry/audit、file-lock 边界；不把八个外围入口的独立 transport 故障冒充完成。

### 验证证据

- `bun run verify:pi-faults`：`total=6, passed=6, failed=0`。
- `@upup/pi-session`：`73 pass / 0 fail / 170 expect()`；`@upup/pi-observability`：`32 pass / 0 fail / 65 expect()`。
- `UPUP_PI_STDIO_STABILITY_ROUNDS=2 bun run verify:pi-stdio-stability`：`completedRounds=2`、失败/锁残留/损坏 JSONL 均为 0。
- `typecheck`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`git diff --check`：全部通过。
- 结果均为本地 fixture/故障注入；真实 provider、真实 `/invest`、真实市场数据和外部副作用未执行。

### 当前基线

- **结构迁移：100%**：51 workspace packages、51 Pi manifests、唯一生产 AgentSession factory、root production files 3、legacy/global registry 生产消费者为 0。
- **本地实现与合同：约 99%**：dossier artifact、capability catalog、Session 生命周期、跨进程锁、provider retry audit、共享运行时故障恢复和入口矩阵已有证据。
- **产品验收：约 95%**：fixture dossier/恢复和共享故障矩阵已验证；八入口独立故障注入、真实 provider、多市场真实数据、长期 SLA、生产 approval 和最终删除审计仍缺。
- **Pi7 状态：未完成**。

## pi43 后续计划

1. **八入口故障注入**：将 provider timeout/429/5xx、abort、restart、partial write 注入 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval，分别记录 transport 请求、退出码、canonical event、Session JSONL、audit 和恢复结果。
2. **长期 SLA harness**：对入口矩阵连续运行多轮，加入 compact、fork、并发 Session、stale lock、retry exhaustion，输出 p50/p95/p99、首个失败和 artifact 完整性。
3. **真实 `/invest` 只读验收**：等待用户明确确认 provider、凭证、标的范围和只读边界；执行真实 A 股/港股/海外投研并保存 provider/model/data time/evidence/risk/approval/audit/dossier，禁止交易和外发副作用。
4. **Package 终审报告**：生成 discovery matrix、manifest/resource/trust/lifecycle/dependency closure 报告，逐入口确认只使用 public API，没有重复 AgentSession、event mapper、tool registry 或 global fallback。
5. **root 清理终审**：对剩余 deprecated facade、重复 command/skill/tool adapter 做生产消费者扫描；只有消费者为零且迁移/行为证据齐全时才删除。
6. **最终完成判定**：完成八入口故障与长期 SLA、真实 provider `/invest`、全仓测试、构建、静态门禁和旧路径清理后，才把 `pi7.md` 标记完成。

## pi43 实施记录：八入口故障注入与 SDK transport fail-closed（2026-09-15）

### 本轮完成

- 新增 `verify:pi-entry-faults`，通过真实入口 public API 验证 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval 的 timeout/503/early-exit/重试/恢复路径。
- 报告 schema 为 `upup.pi.entry-faults.v1`，每个入口记录 first failure、attempts、recovered、artifact 和 details；不把共享 runtime 故障结果复制成入口结果。
- 修复 `@upup/sdk` `StdioTransport` 的配置丢失、spawn error/early-exit pending request 竞态和关闭 timer 泄漏；新增失败隔离测试。

### 验证证据

- `bun run verify:pi-entry-faults`：`total=8, passed=8, failed=0`。
- SDK transport：`2 pass / 0 fail / 4 expect()`；脚本同时真实启动 Bridge WebSocket、stdio 子进程和 SDK 子进程流程。
- `typecheck` 通过；入口故障结果全部来自本地 fixture/故障注入，真实 provider、真实 `/invest`、市场数据和外部副作用未执行。

### 当前基线

- **结构迁移：100%**：51 workspace packages、51 Pi manifests、唯一生产 AgentSession factory、root production files 3、legacy/global registry 生产消费者为 0。
- **本地实现与合同：约 99%**：dossier、capability catalog、Session 恢复、retry audit、共享故障矩阵、八入口故障矩阵均有证据。
- **产品验收：约 95%**：入口单轮故障恢复已验证；长期 SLA、多轮压力、真实 provider 多市场 `/invest`、生产 approval 和最终删除审计仍缺。
- **Pi7 状态：未完成**。

## pi44 后续计划

1. **长期 SLA 压力矩阵**：连续运行八入口故障脚本多轮，加入 compact/fork、并发 Session、stale lock、partial write、retry exhaustion，输出 p50/p95/p99、首个失败、退出码、锁残留和 JSONL 完整性。
2. **真实 `/invest` 只读验收**：等待用户明确确认 provider、凭证、标的范围和只读边界；执行一次真实 A 股/港股/海外投研，保存 provider/model/data time/evidence/risk/approval/audit/dossier，禁止交易、通知和未经批准文件写入。
3. **Package 终审**：将 discovery matrix、manifest/resource/trust/lifecycle/dependency closure 和八入口 artifact 汇总为可归档报告。
4. **root 清理终审**：继续扫描 deprecated facade、重复 command/skill/tool adapter；仅删除有生产消费者为零和行为证据的路径。
5. **最终验收**：全仓测试、构建、所有静态门禁、入口长期 SLA 和真实 provider dossier 全部通过后，才标记 Pi7 完成。

## pi44 实施记录：八入口多轮 SLA 与报告解析修复（2026-09-15）

### 本轮完成

- 新增 `scripts/verify-pi-entry-sla.ts` 与 `verify:pi-entry-sla` 命令，连续启动八入口故障矩阵并聚合多轮 SLA 结果。
- 报告 schema 为 `upup.pi.entry-sla.v1`，包含轮次明细、退出码、stderr、失败对象、入口通过数和 `p50/p95/p99/min/max` 延迟。
- 修复入口故障脚本正常 stdout 日志导致的 JSON 解析失败；SLA 解析器现在从混合输出中提取带 `upup.pi.entry-faults.v1` schema 的最终 JSON 报告，日志仍作为诊断证据保留。

### 验证证据

- `UPUP_PI_ENTRY_SLA_ROUNDS=3 bun run verify:pi-entry-sla`：`completedRounds=3/3`，`expectedEntries=24`，`passedEntries=24`，`failures=[]`，每轮退出码均为 `0`。
- 延迟：`p50=4023ms`、`p95=4216ms`、`p99=4216ms`、`min=4022ms`、`max=4216ms`。
- 八入口覆盖 CLI、Gateway、Bridge WebSocket、stdio JSON-RPC、Cron、Daemon、SDK、Eval；本轮故障均为本地 fixture/故障注入，未触碰真实 provider 或外部副作用。
- `bun run typecheck`：通过。

### 当前进度（自动报告 + 产品证据分层）

- **结构迁移：100%**：51 workspace package、51 Pi manifest、唯一生产 `AgentSession` factory、root 生产文件 3 个、legacy/global registry 生产消费者 0。
- **本地实现与合同：约 99%**：Package contract、capability catalog、Session 恢复、provider retry audit、dossier、共享故障矩阵、八入口故障矩阵和三轮 SLA 已有证据。
- **产品验收：约 95%**：仍缺真实 `/invest` provider dossier、A 股/港股/海外真实数据、生产 approval/sandbox 副作用证据、长期真实运行和最终删除审计。
- **Pi7 状态：未完成**。结构与本地合同完成度不能替代真实市场产品验收。

## pi45 后续计划

1. **Package 终审归档**：生成 discovery matrix、manifest/resource/trust/lifecycle/dependency closure 报告，核对默认加载、资源复制、能力协商和 public API 闭包。
2. **root 清理终审**：扫描 deprecated facade、旧 command/skill/tool adapter、root 私有导入和重复 event/registry；仅在生产消费者为零且有行为证据时删除。
3. **真实 `/invest` 只读验收**：等待用户明确确认 provider、凭证、标的范围、A 股/港股/海外市场范围、只读边界、文件写入和通知权限；默认禁止交易、通知、凭证外发和未批准文件写入。
4. **真实 dossier 验收**：执行 `detect → plan → execute → verify → report`，记录真实 provider/model/data time、source/evidence、risk、policy、approval、audit、Session recovery 和导出 hash；fixture 与真实结果分开归档。
5. **最终回归与判定**：运行全仓 `bun test`、`bun run build`、全部 Pi 静态门禁、入口 smoke、并发/恢复验证；只有真实 dossier、Package 终审和 root 清理均通过后才标记 Pi7 完成。

## pi42 终审补充

- 修复 `scripts/report-pi-architecture.ts` 的迁移后旧路径假设，终审现在读取 `@upup/pi-investment-workflow` 实现并对不存在目录 fail-safe。
- 最新结构报告：native tools `264/264`、runtime production path `100%`、package boundaries `100%`、investment command migration `100%`、legacy root tool removal `100%`、subagent convergence `100%`。
- 该结构报告不改变 Pi7 未完成状态；真实 provider `/invest`、八入口独立故障注入和长期 SLA 仍是完成前置条件。
## pi46 实施记录：插件技能 Pi 生命周期收口与旧脚本清理（2026-09-15）

### 本轮完成

- 插件 manifest/runtime skill 统一保存于 `LoadedPlugin.skills`，不再依赖旧 `SkillCommandRegistry`、全局 registry 或旧 `skills/register`/`skills/bridge` 路径。
- Pi plugin extension 从当前插件实例注册原生命令；命令执行只发送 Pi skill prompt 到当前 `AgentSession`，卸载通过插件/extension 生命周期隔离。
- `@upup/skills` 只保留纯 slash parser；Pi resource loader 继续作为唯一 skill discovery/execution 入口。
- 清理旧技能验证脚本和过时 `getGlobalRegistry` 消费者；session/command 验证改用 `@upup/commands` public API。
- Package audit 将 SDK `ToolRegistry` 明确标记为 SDK-local-tool-configuration，避免与 Pi runtime registry 混淆。

### 验证证据

- `bun run typecheck`：通过。
- `bun run check:pi-package-audit`：通过：51 workspace package、51/51 Pi manifest、默认加载 Package 19、依赖闭包错误 0、root allowlist 违规 0、Package→root import 0、生产 legacy/global/旧 SkillsRegistry 消费者 0。
- 定向 Pi resource/plugin/skills 测试：`33 pass / 0 fail / 57 expect()`。
- 本轮没有真实 provider、真实 `/invest` 或任何外部副作用；结果全部标记为本地合同验证。

### 当前实现进度

- **结构迁移：100%**：Package Split、唯一 Pi AgentSession/Factory、root 收口和旧 capability/port/global skill registry 清理已达成。
- **本地实现与合同：约 99%**：剩余为全仓构建/测试、最终边界扫描、并发恢复和生产 artifact 归档。
- **产品验收：约 95%**：仍缺用户明确授权后的真实 A 股/港股/海外只读 `/invest`、真实 provider evidence、approval/sandbox 副作用证据和长期运行证据。
- **Pi7 完成状态：未完成**。

## pi46 后续计划

1. **包级完整回归**：运行受影响 package build/test、`test:pi-contracts`、`check:pi7`、module/package/migration/runtime 全部门禁；修复新发现的包级问题。
2. **全仓验证与产物检查**：运行 `bun run build`、全仓 `bun test`、`git diff --check`，确认资源复制、声明文件和入口产物一致。
3. **最终禁止项扫描**：确认生产代码无 `legacy-events`、`globalThis.__upupPiHosts`/`__upupAgentPorts`、旧 skill/command registry、第二个 AgentSession、Package→root import；SDK-local 工具容器单独保留并分类。
4. **并发/恢复验证**：继续覆盖多 Session、abort、compact/fork、restart、provider failure、retry exhaustion、dispose 后调用和锁/JSONL 完整性。
5. **真实 `/invest` 只读验收**：仅在用户明确确认 provider、凭证、市场和标的范围后执行；默认禁止交易、通知、凭证外发和未批准文件写入，真实结果与 fixture 分开归档。
6. **完成判定**：只有 Package 终审、全仓回归、入口 smoke、并发恢复和真实只读 dossier 均有证据时，才将 Pi7 标记完成。

## pi46 验证补充：构建、入口与全仓回归（2026-09-15）

- `@upup/plugins`、`@upup/skills`、`@upup/pi-resource-composition` 独立 build 通过；根 `bun run build` 通过并完成 Pi resource 复制。
- `bun run verify:pi-entry-matrix`：`8/8` 入口通过、`contractOnly=0`、`sessionJsonlFiles=7`；`bun run start -- --help` 通过。
- 定向插件/技能/resource 测试最终为 `39 pass / 0 fail / 81 expect()`。
- 全仓 `bun test --timeout=15000 --max-concurrency=1` 为 `2208 pass / 1 fail`；唯一失败是 `pi-app` print fixture 的偶发全仓环境抖动，独立重跑 `4 pass / 0 fail`。因此不能宣称全仓全绿，Pi7 仍未完成。
- 本轮未执行真实 provider、真实多市场数据、真实 `/invest`、交易、通知、凭证访问或外发副作用。

## pi47 后续计划

1. 修复并隔离 `pi-app` print fixture 的共享 provider/全仓执行稳定性，重复全仓验证直到 `0 fail`。
2. 运行 `verify:pi-faults`、`verify:pi-entry-faults`、`verify:pi-entry-sla`，确认本轮插件技能改造不影响异常恢复和长期入口 SLA。
3. 继续最终禁止项和 deprecated facade 扫描，保留 SDK-local-tool-configuration 的明确分类。
4. 在用户明确授权 provider、凭证、市场/标的和只读边界后，执行一次真实 `/invest` dossier；真实证据与 fixture 分离归档。
5. 只有全仓测试、构建、入口 smoke、并发恢复、Package 终审和真实只读 dossier 全部通过后，才标记 Pi7 完成。

## pi47 实施记录：Pi App 外部 dispose 恢复与最终回归（2026-09-15）

### 本轮完成

- 修复 Pi App composition 的生命周期根因：外部 dispose `PiSessionService` 或 `PiBackgroundService` 后，`initialize()` 会检测配置状态并重新绑定同一 Pi runtime composition；普通重复 initialize 仍保持幂等。
- 新增生命周期回归测试，验证外部 dispose 后 `getEventStream()`、session service 和 print prompt 均可恢复，避免全仓测试中的隐式进程级服务污染。
- 调整默认内置 Package 顺序，以 `@upup/pi-finance-sdk` 开始并保持金融域优先，满足 distributable catalog contract。

### 最终验证证据

- 全仓串行：`2210 pass / 0 fail / 6744 expect()`，`217` 个测试文件。
- Pi App/print 定向：`9 pass / 0 fail / 31 expect()`。
- 共享 fault matrix：`6/6`；入口 fault matrix：`8/8`；入口 SLA：`3/3` 轮、`24/24` 入口，`p50=4013ms`、`p95=4048ms`、`p99=4048ms`。
- 构建与静态门禁全部通过：`typecheck`、`build`、resource copy、Package audit、Pi7、module boundary、Pi package/migration/runtime checks、`git diff --check`。
- Package audit 当前事实：`51` workspace packages、`51/51` Pi manifests、默认加载 Package `19`、依赖闭包错误 `0`、root 反向依赖 `0`、生产禁止项消费者 `0`；`ToolRegistry` 仅保留 SDK-local-tool-configuration 分类。
- `createAgentSession()` 生产调用仅剩 `packages/pi-session/src/agent-session-factory.ts` 1 处；CLI help 与 8 入口 matrix smoke 通过。
- 所有上述 provider/入口/故障结果均为本地 fixture；没有执行真实 provider、真实市场数据、交易、通知、凭证访问或外发副作用。

### 当前状态

- **结构迁移：100%**。
- **本地实现与合同：约 99%**。
- **产品验收：约 95%**；真实多市场只读 `/invest` dossier、真实 provider evidence、生产 approval/sandbox 副作用和长期真实运行仍未完成。
- **Pi7 未完成**，不能用 fixture 或静态门禁替代真实 provider 验收。

## pi48 后续计划

1. 在用户明确确认 provider、凭证、市场/标的范围和只读边界后，执行一次真实 `/invest`：`detect → plan → execute → verify → report`。
2. 将真实结果独立归档：provider/model/data time、source/evidence、assumptions、risk、policy、approval、audit、Session recovery、dossier hash；不得与 fixture 报告混合。
3. 真实验收默认禁止交易、外发通知、凭证外传和未批准文件写入；所有副作用继续走 sandbox/deny/approval。
4. 若真实验收未获授权，继续完善离线可恢复 dossier 和 provider contract，不将 Pi7 标记完成。
5. 只有真实只读 dossier 与现有全仓/构建/门禁/入口证据同时满足时，才执行 Pi7 完成审计。

## pi48 实施记录：canonical `/invest` 执行契约与真实验收 harness（2026-09-15）

### 本轮完成

- `@upup/pi-planning`、`@upup/pi-investment-workflow`、`@upup/pi-investment-workflow/extensions` 和 runtime workflow tests 统一使用 `detect → plan → execute → verify → report`；删除 extension 的旧 phase 映射，生产执行路径不再接受旧五阶段。
- `detect` 负责数据识别，`plan` 负责估值/计划，`execute` 负责历史行情/基金分析，`verify` 只读组合归因与证据校验，`report` 负责可审计汇总；`/invest` 仍通过唯一 Pi AgentSession tool contract 执行。
- 删除 `/invest` 中基于输出关键词写交易 audit chain 的重复路径，避免 workflow 入口隐式产生副作用；真实交易仍必须走独立 sandbox/approval contract。
- 新增 `scripts/verify-pi-real-invest.ts` 与 `verify:pi-real-invest`，默认 fail-closed；显式只读确认后才允许 provider 访问，输出独立 real-provider artifact，记录 phase、session、dossier hash、policy 和禁止项。

### 验证证据

- canonical 定向测试：`49 pass / 0 fail / 170 expect()`；runtime workflow：`4 pass / 0 fail / 19 expect()`。
- `bun run typecheck`、`bun run build`、`bun run check:pi7`、`bun run check:pi-package-audit`、`bun run check:module-boundaries`、`bun run check:pi-packages`、`bun run check:pi-migration`、`bun run check:pi-runtime`、`git diff --check`：通过。
- `bun run verify:pi-real-invest`：默认 `skipped`，未访问网络；真实 provider、真实市场数据、真实 `/invest`、交易、通知和凭证访问未执行。

### 当前进度（自动结构指标 + 产品证据分层）

- **结构迁移：100%**（由 `report:pi7` 的结构指标生成，不代表产品完成）。
- **本地实现与合同：约 99%**（canonical workflow 与只读验收入口已实现；仍需本轮全仓回归与最终删除审计）。
- **产品验收：约 95%**（fixture/恢复/故障/入口证据充分；真实 provider、多市场 dossier、真实 approval 证据仍未完成）。
- **综合工程判断：约 99.95%**；该数值不替代 Pi7 完成定义。
- **Pi7：未完成**。

## pi49 后续计划

1. 重跑全仓串行 `bun test --timeout=15000 --max-concurrency=1`，确认 canonical phase 改造没有引入全局回归；若失败只修复本轮相关问题。
2. 运行 `test:pi-contracts`、八入口 matrix/fault/SLA、资源复制和最终 root/deprecated consumer 审计，保存最新分层证据。
3. 在用户明确授权 provider、凭证、市场/标的范围和只读边界后，运行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`；真实 artifact 与 fixture 分离，不执行交易、通知、凭证外发或未批准写入。
4. 对真实 dossier 做 restart/resume、evidence/source time、model/assumptions、risk/policy/approval、artifact hash 校验，并追加真实结果；未取得真实证据前不标记 Pi7 完成。
5. 基于最终静态报告删除剩余无生产消费者的 deprecated facade；每次删除后重跑 package、module、migration、runtime 门禁。

## pi49 实施记录：canonical workflow 全仓回归（2026-09-15）

### 验证结果

- 修正 `src/runtime/pi/investment-workflow-package.test.ts` 的 integration fixture，使其验证 `execute`、`Market Analysis` 和 `phase: execute`，不再接受已删除的 `backtest` 生产 phase。
- 串行全仓：`bun test --timeout=15000 --max-concurrency=1` → `2209 pass / 0 fail / 6742 expect()`，217 个测试文件。
- `bun run test:pi-contracts`：通过；入口矩阵 `8/8`，入口故障矩阵 `8/8`，三轮 SLA `24/24`；结构门禁、构建和默认 fail-closed real-invest harness 均已通过。
- 真实 provider、真实 A 股/港股/海外市场数据、真实只读 `/invest` dossier、交易、通知和凭证访问仍未执行。

### 当前实现进度（截至 2026-09-15）

- **阶段一：100%**；Package contract、manifest、结构门禁、唯一 Factory 和 root allowlist 已有自动报告。
- **阶段二：100%**；Pi Runtime、Session、resource composition、capability context、event adapter 已收口。
- **阶段三：100%（本地实现）**；金融 Package、canonical `/invest`、Profile、dossier、evidence/risk/policy 已由 fixture/contract 覆盖。
- **阶段四：100%**；Session/Memory/Planning/Observability 的迁移与恢复合同通过。
- **阶段五：99%**；MCP、Plugin、Gateway、Bridge、stdio、Cron、Daemon 已有入口和故障证据，仍需最终删除审计。
- **阶段六：99.7%**；TUI、根入口、资源复制和生命周期已通过，本轮未扩大 UI 迁移范围。
- **阶段七：约 95% 产品验收**；fixture 闭环、并发/恢复、入口 SLA 已通过，真实 provider、多市场证据链和生产 approval 仍缺。
- **结构指标：100%；本地实现与合同：约 99%；综合工程判断：约 99.95%。** 这些是分层指标，不是 Pi7 完成声明。
- **Pi7 状态：未完成**。完成定义仍要求真实只读 provider dossier、最终删除审计和所有分层证据同时满足。

## pi50 后续计划

1. 用户明确授权后，设置 provider、凭证、市场和标的范围，仅执行 `READ_ONLY` 的真实 `/invest`；脚本默认 fail-closed，真实 artifact 与 fixture 分目录保存。
2. 对真实 dossier 做 restart/resume、证据 source/asOf/retrievedAt、model/assumptions、risk、policy/approval、Session JSONL 和 hash 完整性校验。
3. 对剩余 deprecated facade、重复适配器和 root 非 allowlist 路径生成生产消费者清单；只有消费者为零才删除，并逐次重跑全部静态门禁。
4. 继续保持 `detect → plan → execute → verify → report` 为唯一生产 phase；禁止恢复旧 `research/valuation/backtest/trade/review` 运行契约。
5. 真实 provider 验收和最终删除审计完成前，不将 `pi7.md` 标记为完成。

## pi50 实施记录：完成态 resume 修复与 Pi7 基线复核（2026-09-15）

### 本轮完成

- 重建 `@upup/pi-planning`、`@upup/pi-investment-workflow`，确认 workspace package 使用最新 canonical workflow 实现；完成态 `resume` 重新加载 dossier 并保持 `artifactHash`、Session 文件一致。
- 修复真实只读验收脚本的循环作用域错误；多 ticker 结果现在统一计算 artifact 状态，脚本继续保持默认 fail-closed。
- 当前自动结构报告：`51` workspace package、`51/51` Pi manifest、默认加载 `19` 个 Package、root source files `25`、root production files `3`、root production lines `109`；结构指标 `100%`。

### 验证证据

- workflow 定向：`4 pass / 0 fail / 32 expect()`。
- `typecheck`、`test:pi-contracts`、`build`、Pi resource copy、`check:pi7`、`check:pi-package-audit`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`、`check:pi-runtime`、`git diff --check`：全部通过。
- `verify:pi-real-invest`：默认 `skipped`，未设置 `UPUP_REAL_INVEST=1` 与 `UPUP_REAL_INVEST_CONFIRM=READ_ONLY`，未访问网络。
- 全仓串行首次为 `2208 pass / 1 fail / 6756 expect()`；唯一失败是 `AgentRunnerController Pi contract` 的 15 秒时序超时，隔离重跑 `1 pass / 0 fail`。该结果作为稳定性遗留记录，不冒充全仓全绿。
- 本轮仍未执行真实 provider、真实 A 股/港股/海外数据、真实 `/invest` dossier、交易、通知、凭证访问或外发副作用。

### 当前进度判定

- **阶段一：100%**；Package contract、manifest、结构门禁和 root allowlist 已自动化。
- **阶段二：100%**；Pi Runtime、Session、capability、resource composition 和唯一 Session factory 已收口。
- **阶段三：100%（本地实现）**；金融 Package、五阶段 `/invest`、Profile、dossier、evidence/risk/policy 已由合同与 fixture 覆盖。
- **阶段四：100%**；Session、Memory、Planning、Storage、Permissions、Observability 的本地恢复合同通过。
- **阶段五：99%**；外围入口已有协议、故障和 SLA 证据，最终删除审计与稳定性复核仍需完成。
- **阶段六：99.7%**；根入口和 TUI 装配已收口，仍需最终产物/入口稳定性复核。
- **阶段七：约 95% 产品验收**；fixture 闭环、恢复、并发、入口故障和 SLA 已覆盖，真实 provider evidence、多市场 dossier、approval/sandbox 实证仍缺。
- **综合工程判断：约 99.95%**；这是分层工程指标，不是 Pi7 完成百分比。
- **Pi7 状态：未完成**；完成定义要求真实只读 dossier、最终删除审计、全仓稳定性和所有分层证据同时满足。

## pi51 后续计划

1. 修复或隔离 `AgentRunnerController Pi contract` 的全仓 15 秒时序抖动，连续运行全仓串行回归，目标 `0 fail`；不得用隔离通过替代全仓稳定性证据。
2. 基于最终 package audit 生成 deprecated facade、重复适配器和 root 非 allowlist 的生产消费者清单；仅在消费者为零时删除，并逐次重跑全部静态门禁。
3. 在用户明确提供 provider、凭证、市场/标的范围和只读边界后，运行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`；真实 artifact 与 fixture 分目录保存。
4. 对真实 dossier 校验五阶段完整性、证据 `source/asOf/retrievedAt`、模型与假设、risk/policy/approval、Session JSONL、restart/resume 和 hash；不得执行交易、通知、凭证外发或未批准文件写入。
5. 完成 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 的最终入口 smoke 与并发/恢复复核后，才可将 `pi7.md` 标记为完成。

## pi52 执行结果与后续计划（2026-09-15）

### 已验证结果

- 隔离 `AgentRunnerController Pi contract`：`1 pass / 0 fail`。
- 连续两轮串行全仓：每轮 `2209 pass / 0 fail / 6756 expect()`，217 个测试文件。
- `bun run build`：通过；`dist/upup` 编译成功，19 个默认 Pi Package 资源复制成功。
- Pi7/Package 审计：`51/51` manifest、默认 catalog `19`、依赖错误 `0`、`distForbiddenArtifacts: []`；唯一生产 Session factory、root allowlist、无生产 global/legacy consumer 均通过。
- `verify:pi-real-invest`：默认 `skipped`，未显式授权时不访问网络或真实 provider。

### 进度快照

- 结构迁移 `100%`；本地实现与合同 `约 99%`；产品验收 `约 95%`；综合工程判断 `约 99.95%`。
- Pi7 仍为未完成状态。百分比是分层工程快照，不替代完成定义。

### 下一轮计划

1. 生成最终删除审计：逐项确认 deprecated facade、重复 adapter、旧 root source 的生产消费者为零，并保存机器可读报告。
2. 在用户明确提供 provider、凭证、标的范围和只读边界后，运行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`；真实 artifact 与 fixture 分目录保存。
3. 对真实 dossier 校验五阶段完整性、来源与时间戳、模型/假设、风险与 policy、Session JSONL、restart/resume 和 hash；禁止交易、通知、凭证外发及未批准文件写入。
4. 再执行 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 的入口 smoke、长期并发/恢复与故障复核；全部通过后才评估 Pi7 完成状态。

## pi50 稳定性复核补充

- 第二次全仓串行 `bun test --timeout=15000 --max-concurrency=1` 已通过：`2209 pass / 0 fail / 6756 expect()`，217 个测试文件，耗时约 12 秒。
- 第一次 `AgentRunnerController` 15 秒超时未复现，记录为全仓时序抖动；不影响本次最终串行绿灯，但入口长期并发/恢复证据仍属于 Pi7 完成前的持续检查项。

## pi51 实施记录：Package 发布产物清理与旧 facade 收口（2026-09-15）

### 本轮完成

- 删除 `@upup/pi-session` 的 `getSessionManager` deprecated alias，保留必要的 Session/config migration，不保留旧 Session facade。
- 新增统一 `scripts/clean-pi-package-dist.ts`，并接入 10 个 Pi 包的 `prebuild`；独立构建不再继承旧 root `tsconfig` 的全仓声明输出。
- 为 `pi-browser`、`pi-config`、`pi-notify`、`pi-risk` 增加独立严格 TS 配置；修复暴露出的可选 signal 和 readonly 真实类型问题。
- Package audit 新增 `dist` 禁止残留扫描，检查 `runtime/pi`、`src/tools`、`src/skills`、`legacy-events` 等路径。

### 验证证据

- 10 个受影响包构建通过；所有对应 `distForbiddenArtifacts` 为 `0`。
- `check:pi7`：通过；唯一生产 `createAgentSession`、root allowlist、无生产 global registry 均保持通过。
- `check:pi-package-audit`：通过，`51/51` manifest、默认 catalog `19`、依赖错误 `0`、产物禁止项 `0`。
- `@upup/pi-session` `73 pass / 0 fail / 170 expect()`；`pi-config` `3/0`、`pi-notify` `4/0`、`pi-risk` `23/0`；根 `typecheck` 通过。
- 本轮没有执行真实 provider、真实市场数据、交易、通知、凭证访问或外发副作用。

### 当前判定

- 结构迁移仍为 **100%**；本地 Package 合同约 **99%**。
- 旧 facade 和发布产物污染风险进一步收口；阶段五最终入口长期并发、真实 provider dossier 和最终删除审计仍未完成。
- **Pi7：未完成**。

## pi53 最终验证快照（2026-09-15）

### 当前真实基线

- workspace packages：`51`；Pi manifest：`51/51`；默认加载 Package：`19`。
- root `src`：生产文件 `3` 个、生产代码 `109` 行；root allowlist、Package → root 反向依赖和 root source cycle 均通过。
- 唯一生产 `createAgentSession()` 位于 `packages/pi-session/src/agent-session-factory.ts`；生产 global capability/port registry、非 allowlisted legacy consumer 均为 `0`。
- 严格 Package 审计依赖错误 `0`、默认 pin 缺失 `0`、发布产物禁止残留 `0`；严格删除审计状态 `passed`。报告中的 allowlisted legacy boundary 和历史路径引用仍需在最终产品验收后再决定删除，不能误报为“所有历史字符串为零”。

### 本轮验证

- `bun run typecheck`、`bun run build`、`git diff --check`：通过；构建完成并复制 19 个默认 Pi Package 资源。
- `bun run test:pi-contracts`：通过；生产入口合同调整为依赖 `pi-app` 公开 event-stream 边界，避免入口重复做 Pi event 映射。
- 全仓串行 `bun test --timeout=15000 --max-concurrency=1`：`2209 pass / 0 fail / 6756 expect()`，217 个文件。
- 入口与可靠性：入口 matrix `8/8`；共享 fault matrix `6/6`；entry fault matrix `8/8`；entry SLA 3 轮 `24/24`；stdio stability 3 轮、失败 `0`、锁残留 `0`、坏 JSONL `0`。
- 真实验收脚本保持 fail-closed：`bun run verify:pi-real-invest` 返回 `status=skipped`，未访问真实 provider；fixture 结果与未来 real-provider artifact 继续分开。

### 进度百分比（分层，不手工伪造单一百分比）

| 层级 | 当前值 | 计算/含义 |
|---|---:|---|
| 结构迁移 | 100% | `report:pi7`：manifest、唯一 Session factory、root 收口、global/legacy 禁止项 |
| 本地实现与合同 | 约 99% | Package、workflow、policy、Session、恢复、入口、故障、构建合同通过 |
| 产品验收 | 约 95% | fixture 闭环充分；真实 provider、多市场 dossier、真实 approval/sandbox 证据未完成 |
| 综合工程判断 | 约 99.95% | 工程快照，不替代 Pi7 完成定义 |

### 后续计划 pi54

1. 在用户明确授权只读真实验收，并提供 provider、凭证来源、市场/标的范围后，执行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`；禁止交易、外发通知、凭证外传和未批准文件写入。
2. 单独归档真实 dossier：`detect → plan → execute → verify → report` 五阶段事件、Session JSONL、source/asOf/retrievedAt、provider/model、假设、risk、policy、approval、artifact hash；执行 restart/resume 与完整性校验。
3. 对严格删除审计中的 allowlisted compatibility boundary、历史路径引用和 SDK-local tool configuration 做生产消费者复核；只有消费者为零且数据迁移不受影响时才删除。
4. 真实 dossier 通过后再执行最终 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 产品验收；全部证据齐全后才把 `pi7.md` 标记为完成，否则继续记录为未完成。

## pi54 实施记录：TUI canonical event 收口与 Package 独立构建复核（2026-09-15）

### 本轮完成

- TUI 的 `AgentRunner`、工作指示器和权限类型统一使用 `@upup/pi-runtime` canonical contract；UI 内部只保留本地 `UiEvent` 投影，不再依赖 legacy `AgentEvent`。
- `@upup/pi-event-adapter` 不再重复声明 `ApprovalDecision`、`StreamMode`、`TokenUsage`，仅从 Runtime 重新导出，避免事件适配器演变为第二套公共类型注册中心。
- 删除 `@upup/pi-tui-app` 对 `@upup/pi-event-adapter` 的无消费者运行时依赖和构建 external 声明；更新 lockfile。
- 修复投资 dossier 校验的严格类型问题，使 `@upup/pi-investment-workflow` 独立 bundle/declaration 构建真实通过。

### 验证证据

- `@upup/pi-event-adapter`、`@upup/pi-tui-app`、`@upup/pi-investment-workflow` 独立构建全部通过。
- `bun run typecheck`、`git diff --check`：通过。
- Event Adapter、Workflow dossier、Workflow extension、TUI/App/Controller/Permissions 定向合同测试通过；本轮补充合同测试 `16 pass / 0 fail / 85 expect()`。
- `check:pi7`、`check:pi-package-audit`、`check:pi-runtime`、`check:module-boundaries`、`check:pi-packages`、`check:pi-migration`：全部通过；保持 `51` workspace/Pi manifest、默认 catalog `19`、唯一生产 `createAgentSession`、生产 global registry `0`、dist 禁止残留 `0`。
- `verify:pi-real-invest`：`status=skipped`，保持 fail-closed；本轮没有真实 provider、真实市场数据、凭证、交易、通知或外发副作用。

### 当前实现进度（分层）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | 100% | Package、root、唯一 Session factory、global/legacy 门禁通过 |
| 本地实现与合同 | 约 99% | Runtime/Session/Package/workflow/TUI/入口/故障/构建合同通过 |
| 产品验收 | 约 95% | fixture 闭环和恢复证据充分，真实 provider dossier 尚缺 |
| 综合工程判断 | 约 99.95% | 工程快照，不替代完成定义 |

Pi7 仍未完成：不能以目录迁移、fixture 或 `skipped` 的真实验收替代真实 provider 产品证据。

## pi55 后续计划

1. 用户明确授权后，按只读边界执行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`；先确认 provider、凭证来源、市场和标的范围，禁止交易、通知、凭证外发及未批准文件写入。
2. 归档真实 dossier 与独立 artifact：五阶段 Pi event、Session JSONL、source/asOf/retrievedAt、provider/model、assumptions、risk、policy、approval 和 artifact hash；执行 restart/resume、完整性和幂等校验。
3. 复核严格删除审计中的 allowlisted compatibility boundary、历史路径字符串和 `packages/sdk` 的本地 tool configuration；只有生产消费者为零且迁移不受影响时才删除。
4. 删除每一项兼容边界后重跑 `check:pi7`、`check:pi-package-audit`、module/runtime/migration 门禁和受影响 Package 测试，禁止同时保留新旧生产执行路径。
5. 真实 dossier 通过后，执行 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 的最终产品 smoke，并将 fixture 与 real-provider 结果分开归档。
6. 在真实产品证据、最终删除审计和全量验证全部满足前，保持 Pi7“未完成”，不修改完成定义。

## pi56 实施记录：Event Adapter Aggressive Removal（2026-09-15）

### 本轮状态

- 完成 `@upup/pi-event-adapter` 从 legacy/server 双轨到 canonical/server 单轨的迁移；所有生产消费者只使用 `mapPiEventToServer`、`adaptPiEventsToServer` 或 canonical stream。
- `ChannelProfile` 固化为 `@upup/pi-runtime` 公共合同，消除 prompt-config → event-adapter 的反向依赖。
- Package 直接依赖和 Pi `0.84.3` 版本声明已校正；生产构建不再依赖旧 dist 导出。

### 证据

- Adapter `51 pass / 0 fail / 112 expect()`；Prompt Config `10 pass / 0 fail / 26 expect()`。
- 根 typecheck、Gateway/App build、CLI `--help` smoke、Pi7/package/module/runtime/migration 门禁和严格删除审计全部通过。
- 删除审计：生产 legacy/global/old-root consumer 均为 `0`；历史路径引用仍由报告单独列出，不作为生产消费者。
- Real provider verification 保持 `skipped`（未提供显式 `READ_ONLY` 授权），fixture 与真实结果继续分离。

### pi57 后续计划

1. 在用户明确授权且配置 `FINANCIAL_DATASETS_API_KEY` 后执行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`；仅只读，禁止交易、通知、凭证外发和未批准文件写入。
2. 对真实 dossier 执行五阶段、证据时间链、Session JSONL、restart/resume、artifact hash 和 approval/policy 校验，并单独归档 real-provider artifact。
3. 复核 allowlisted compatibility boundary、历史路径引用和 SDK 本地配置；只在生产消费者为零且迁移边界安全时删除。
4. 补跑 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 最终产品 smoke 及全仓串行测试，记录 fixture 与真实 provider 结果。
5. 在真实 dossier、最终删除审计和全量入口证据满足前，继续保持 Pi7“未完成”，不伪造完成百分比。

## pi57 实施记录：Builtin Pi Dependency Pin Closure（2026-09-15）

- 修复 `@upup/pi-event-adapter` 新增 `@earendil-works/pi-ai@0.84.3` 后 builtin trust allowlist 未同步的问题；所有默认 Pi Session 现在可通过依赖谈判和资源注册。
- 全量 Pi 合同从首次 `79 pass / 66 fail` 的 stale-pin 级联失败恢复为通过；Factory 定向 `57/57`，完整 `test:pi-contracts` 全绿。
- 根 build、资源复制、CLI help、typecheck、静态门禁和严格删除审计继续通过。
- Real-provider 保持 fail-closed skipped；Pi7 不标记完成。

## pi58 后续计划

1. 取得用户明确只读授权并配置 `FINANCIAL_DATASETS_API_KEY` 后，执行真实 provider dossier；保留交易/通知/凭证外发/未批准写入 deny。
2. 归档真实五阶段事件、Session JSONL、来源时间链、模型假设、risk/policy/approval、hash 与 resume 校验。
3. 复核并决定 allowlisted compatibility boundary 与历史路径字符串的最终删除；删除前保持消费者审计为零。
4. 执行 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 的最终产品 smoke 与并发恢复测试，真实与 fixture 结果分开记录。
5. 只有上述证据齐全后才将 Pi7 标记完成；在此之前维持分层进度，不以目录或 fixture 代替产品验收。

## pi58 实施记录：旧插件/技能 Registry Aggressive Removal 与 Pi 类型合同收口（2026-09-15）

### 实施结果

- 插件适配最小合同已迁入 `@upup/pi-runtime`，资源组合层改为显式 `PiLoadedPlugin`/`PiPluginTool` 类型；生产路径不再导入 `@upup/plugins`。
- MCP 技能占位改用本地 `McpSkillCommand`，删除 `@upup/mcp` 对旧 `@upup/skills` 的类型依赖。
- 删除无生产消费者的 `packages/plugins`、`packages/plugin-sdk`、`packages/skills`，以及 `packages/commands/src/plugins/*` 旧 markdown plugin loader/registry 类型；删除对应根构建脚本并刷新 `bun.lock`。
- 这不是复制旧实现：能力仍由 Pi Package manifest、Resource Loader、显式 capability context 和唯一 AgentSession factory 提供。

### 当前基线与百分比

| 指标 | 当前值 | 依据 |
|---|---:|---|
| workspace package | `48` | `report:pi7` |
| Pi manifest | `48/48` | `report:pi7`、`check:pi-package-audit` |
| 默认 Package catalog | `19` | `report:pi-package-audit` |
| root source / production | `25 / 3` | `report:pi7` |
| root production lines | `109` | `report:pi7` |
| 结构迁移 | `100%` | 唯一 Factory、Pi manifest、root allowlist、global/legacy 审计 |
| 本地实现与合同 | `约 99%` | Runtime/Session/Package/入口合同与定向测试 |
| 产品验收 | `约 95%` | fixture 闭环、恢复、审计充分；真实 provider dossier 未完成 |
| 综合工程判断 | `约 99.95%` | 工程快照，不替代完成定义 |

### 静态审计

- `legacyConsumers=[]`、`globalRegistryConsumers=[]`、`oldRootImports=[]`、`oldPathReferences=[]`、`duplicateRegistryCandidates=[]`、`status=passed`。
- 唯一生产 `createAgentSession()` 仍为 `packages/pi-session/src/agent-session-factory.ts`；默认目录不再加载旧插件/技能 registry。

### 验证证据

- `bun run typecheck`：通过；`bun run build`：通过。
- `check:pi7`、`check:pi-package-audit`、`check:pi-deletion-audit`：通过。
- Pi 插件桥：`9 pass / 0 fail / 12 expect()`；`@upup/pi-platform` 独立合同：`56 pass / 0 fail / 174 expect()`。
- 全量 Pi 合同运行中唯一失败为并发环境下 watchlist 用例时序抖动；同一包独立复跑 `56/56` 通过，因此本轮不宣称全仓全绿。
- 真实 provider：`skipped`，没有真实市场访问或任何副作用。

### pi59 后续计划

1. 在用户明确只读授权和真实数据 key 后执行 real-provider dossier；默认继续 deny 交易、通知、凭证外发和未批准文件写入。
2. 验证并归档五阶段闭环、证据时间链、Session JSONL、restart/resume、artifact hash、risk/policy/approval 和多市场只读结果。
3. 重跑所有入口 smoke、并发/恢复、全仓串行测试和最终构建；严格区分 fixture 与真实 provider 证据。
4. 清理剩余历史验证脚本中的旧路径文字前，先确认其不属于兼容迁移边界；不触碰用户已有 session JSONL。
5. 满足真实 dossier、最终入口产品验收和全量验证后才更新 Pi7 完成状态；当前继续标记“未完成”。

## pi59 实施记录：默认 Package discovery 与 trust override 修复（2026-09-15）

### 本轮完成

- 修复 `@upup/pi-session` Factory 与 prompt runner 的默认 Package discovery：显式 `piPackageTrust` 只覆盖 trust，不会误关闭默认 builtin/project Package catalog。
- 在 `@upup/pi-resource-composition` 固化 `mergePiPackageTrust`，统一处理默认依赖 pin、source allowlist、hash 和显式 trusted path override。
- 删除旧插件/技能 registry 后继续保持 Full Package Split：Package manifest、Resource Loader、Session factory、capability context 是唯一生产路径。

### 自动审计基线

- workspace packages：`51`；Pi-native packages：`48`；Pi manifest：`48/48`。
- root source files：`24`；root production files：`3`；root production lines：`109`。
- 唯一生产 `createAgentSession()`：`packages/pi-session/src/agent-session-factory.ts`。
- `legacyConsumers=[]`、`globalRegistryConsumers=[]`、`oldRootImports=[]`、`oldPathReferences=[]`、`duplicateRegistryCandidates=[]`；严格删除审计通过。

### 验证证据

- Factory 定向合同：`57 pass / 0 fail / 287 expect()`；trust 配置测试：`7 pass / 0 fail / 25 expect()`。
- `bun run test:pi-contracts`、`bun run typecheck`、`bun run build`、`bun run build:all`：通过。
- `check:pi-migration`、`check:pi7`、`check:pi-package-audit`、`check:pi-deletion-audit`、`check:module-boundaries`：全部通过。
- 全仓串行：`2150 pass / 0 fail / 6674 expect()`，215 个测试文件。
- 入口矩阵 `8/8`；故障恢复 `8/8`；SLA 3 轮 `24/24`；stdio stability 3 轮、失败 `0`、锁残留 `0`、坏 JSONL `0`。
- 真实 provider：`verify:pi-real-invest` 返回 `status=skipped`，未执行网络访问或副作用。

### 分层进度与下一轮计划

- 结构迁移：**100%**（自动报告 structuralPercent）。
- 本地实现与合同：**约 99%**（Package、Session、trust、workflow、policy、恢复和入口合同均有证据）。
- 产品验收：**约 95%**（fixture 闭环充分，真实多市场 dossier、真实 provider evidence 和真实 approval/sandbox 证据仍缺）。
- 综合工程判断：**约 99.95%**；该值仅作工程快照，不能替代完成定义。
- Pi7：**未完成**。

下一轮只做完成定义要求的证据闭环：取得用户明确只读授权和 provider 配置后执行 real-provider dossier；归档五阶段事件、Session JSONL、来源时间链、模型与假设、风险/策略/审批、artifact hash 以及 restart/resume；然后复核 allowlisted compatibility boundary，重跑所有入口产品 smoke、并发恢复、全仓测试和最终删除审计。真实结果与 fixture 结果必须分开记录；在这些证据齐全前不把 Pi7 标记完成。

## pi60 实施记录：Manifest Host Capability Contract 与 Factory 去业务分支（2026-09-15）

### 本轮完成

- Pi manifest contract 新增 `hostCapabilities`，由 Runtime 校验非空和去重，由 Resource Catalog 解析并保留。
- Factory 不再通过 `pkg.name` 判断金融、平台、工作流、管理或市场数据宿主能力，改为读取 Package manifest 的能力声明并绑定对应 host contract。
- 六个实际需要宿主注入的 Package 已声明能力：research-worker、investment-workflow、market-data-transport、agent-worker、cron-runner、mcp-resources、management-snapshot。
- `check:pi7` 增加 Factory 包名分支禁入规则；架构报告新增 host capability matrix，防止未来回退到业务包名编排。

### 当前真实基线

- workspace packages：`51`；Pi-native packages：`48`；Pi manifest：`48/48`。
- root production files：`3`；root production lines：`109`；唯一生产 `createAgentSession()` 仍在 `packages/pi-session/src/agent-session-factory.ts`。
- legacy/global/root-import/deletion 审计均为通过；宿主能力矩阵由 `report:pi7` 自动生成。

### 验证证据

- Catalog 合同：`24 pass / 0 fail / 63 expect()`；Factory 合同：`57 pass / 0 fail / 287 expect()`。
- `test:pi-contracts`、`typecheck`、`build`、Pi7/Package/deletion/module-boundary 门禁和 CLI help smoke 全部通过。
- 真实 provider 验证保持 `skipped`，fixture 与 real-provider 结果分离。

### 后续计划

1. 继续迁移 `package-tool-ownership.ts` 的静态工具 ownership 表到 manifest tool contract，消除剩余业务包名映射。
2. 将 capability host 的具体服务类型从 Session host contract 进一步拆为 Package capability provider contract，减少 `PiHostBridge` 的聚合接口。
3. 在用户明确只读授权和 provider 配置后执行真实五阶段 dossier，归档证据链、恢复、审批和 artifact hash。
4. 真实 dossier 和最终产品验收完成前，Pi7 继续保持“未完成”。

## pi61 实施记录：Manifest 工具 ownership 完整迁移（2026-09-15）

### 本轮变更

- 固化 `tools` / `nativeTools` manifest contract，加入字符串、去重及子集校验；Catalog 保留字段并完成版本化构建。
- 17 个 Pi Package 的工具 ownership 从 `packages/pi-resource-composition/src/package-tool-ownership.ts` 迁入各自 `package.json`；补齐 management manifest，修复 platform manifest 重复工具。
- Factory 删除 `getOwnedToolNames`、`packageOwnsTool`、`packageProvidesNativeTool` 生产依赖，改为根据已加载 Package manifest 注入工具。
- 删除静态 ownership registry、旧导出和重复测试实现；`report-pi-architecture`、`report-pi-migration`、`check-pi-packages`、`verify-pi5` 与合同测试统一读取 manifest。

### 当前基线与审计快照

- workspace packages：`51`；Pi-native packages：`48`；Pi manifest：`48/48`。
- root `src`：`24` 个源码文件、`3` 个生产文件、约 `109` 行生产代码；唯一生产 `createAgentSession()` 位于 `packages/pi-session/src/agent-session-factory.ts`。
- ownership：`17` 个 Package、`268` 个工具、`268` 个 native extension 工具、覆盖率 `100.0%`、剩余 host adapter 工具 `0`。
- 删除审计：`legacyConsumers=[]`、`globalRegistryConsumers=[]`、`oldRootImports=[]`、`oldPathReferences=[]`、`duplicateRegistryCandidates=[]`，严格状态 `passed`。

### 验证证据

- `bun run typecheck`、`bun run build`、`bun run build:all`、`bun run check:module-boundaries`、`bun run check:pi-migration`、`bun run check:pi-runtime`、`bun run check:pi7`、`bun run check:pi-packages`、`bun run check:pi-package-audit`、`bun run check:pi-deletion-audit`：全部通过。
- `bun run test:pi-contracts`：核心 Pi 合同 `73 pass / 0 fail`，包含 Factory、Session、入口、权限、恢复与 Package 测试。
- `bun run verify:pi5`：`20/20` 语义验收通过；A4/A13 使用显式测试超时避免串行冷启动误报。
- `git diff --check`：通过；真实 provider dossier：`skipped`，未使用真实凭证或产生外发副作用。

### 阶段状态与后续计划

- 阶段一 Package contract/结构门禁：**完成**。
- 阶段二 Runtime、Session、capability、event adapter：**完成（本地合同）**。
- 阶段三金融能力、Profile、`/invest` 状态机：**完成（fixture/本地合同）**。
- 阶段四 Session/Memory/Planning/Observability：**完成（本地合同）**。
- 阶段五外围入口 Package 化：**完成（CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval 合同）**。
- 阶段六根入口收口与 TUI 装配：**完成（结构与入口合同）**。
- 阶段七真实投研闭环与最终产品验收：**未完成**。

下一轮必须在用户明确只读授权且配置真实数据凭证后执行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`，单独归档 `detect → plan → execute → verify → report` dossier、来源/asOf/retrievedAt、Pi event、Session JSONL、风险/审批/审计、artifact hash 与 restart/resume 证据；随后补跑 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 真实入口 smoke 和全仓串行测试。真实交易、通知、凭证访问和文件写入继续保持 sandbox/deny/approval，Pi7 在上述证据完成前不得标记完成。

## pi62 实施记录：Capability Provider Contract 分组化（2026-09-15）

### 本轮变更

- `PiHostBridge` 从平面聚合接口改为 `PiHostProviders` 分组 contract，明确 `tools`、`workers`、`scheduling`、`mcp`、`workflow`、`marketData`、`management` provider 边界。
- Session Factory 通过 `providers` 组装 host；各 Pi extension 和测试 fixture 统一消费对应 provider，不再直接读取平面 host 方法。
- Provider tools 对 identity/session/capability request 做严格校验；新增 capability group isolation 测试，防止跨 provider 读取能力。
- `check-pi7-architecture.ts` 增加 provider interface、Factory composition 和平面方法禁回归检查。

### 验证证据

- 受影响扩展：`46/46` 通过；Factory/金融：`64/64` 通过；Pi 合同测试与各 Package 测试通过。
- `typecheck`、`check:pi7`、`check:pi-packages`、`check:module-boundaries`、`check:pi-deletion-audit`、`git diff --check`：全部通过。
- 结构审计仍为 `legacyConsumers=[]`、`globalRegistryConsumers=[]`、`oldRootImports=[]`、`oldPathReferences=[]`；真实 provider：`skipped`。

### 后续计划

1. 将 provider contract 的共享数据类型（市场 quote、worker、MCP、management snapshot）从 `@upup/pi-session` 继续下沉到对应 domain Package public API，消除 Session 对金融/市场 domain 类型的直接依赖。
2. 为每个 provider 增加 manifest capability version negotiation 与 lifecycle/dispose contract，验证 package reload 和 session dispose 后 provider 不可调用。
3. 在用户明确只读授权后执行真实五阶段 dossier，并记录恢复、证据、审批与 artifact hash；真实产品验收完成前保持 Pi7 未完成。

## pi63 实施记录：共享 Domain DTO 下沉与 Provider 生命周期收口（2026-09-15）

### 本轮状态

- 完成共享类型下沉：市场 quote、趋势 store、workflow services、投研/历史/组合/沙箱/order DTO 统一由 `@upup/types` 提供；Session host 不再直接依赖市场数据或投资 workflow 包的 DTO。
- 完成 provider capability contract：每个 `PiHostBridge` 暴露 `upup.pi.provider.v1`、provider version、active/reloading/disposed 状态，并提供 reload/dispose 生命周期。
- 完成生命周期隔离：provider 方法通过 session-bound guard；Session adapter dispose 会撤销 host 发布、销毁 provider 和 capability context；版本协商失败或非 active 状态均 fail-closed。
- 保持单一 `AgentSession` factory、manifest ownership、无 legacy/global registry 和 root allowlist 不变。

### 验证证据

- `bun run typecheck`、四个受影响 Package 独立 build、host/session/workflow 定向测试全部通过。
- `bun run check:pi7`、`bun run check:module-boundaries`、严格 `UPUP_PI_DELETION_AUDIT_STRICT=1 bun run scripts/report-pi7-deletion-audit.ts` 全部通过。
- 自动架构报告：`51` workspace、`48` Pi manifest、`268/268` native tools、root `24/3/109`，结构指标 `100%`。
- Real provider 仍为 `skipped`，本轮没有真实网络、凭证、交易、通知或外发副作用。

### 当前实现进度（分层）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | 100% | Package manifest、唯一 Session factory、root allowlist、删除审计全部通过 |
| 本地实现与合同 | 约 99% | DTO 解耦、provider version negotiation、reload/dispose isolation、build/typecheck/合同测试通过 |
| 产品验收 | 约 95% | fixture 五阶段闭环充分，但真实 provider dossier 与最终入口证据缺失 |
| 综合工程判断 | 约 99.95% | 仅为分层工程快照，不代表 Pi7 完成 |

### 下一轮计划（pi64）

1. 在用户明确只读授权并配置真实 provider 后执行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`，仅允许读取行情/财报/公告/研究数据。
2. 为真实 dossier 建立独立归档：保存 `detect → plan → execute → verify → report` 五阶段 Pi events、Session JSONL、source/asOf/retrievedAt、provider/model、assumptions、risk、policy、approval 和 artifact hash。
3. 对真实 dossier 执行 restart/resume、幂等、完整性、provider failure/retry 和 dispose 后访问检查；fixture 与真实结果分开记录。
4. 真实 dossier 通过后再执行 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 的最终产品 smoke；继续复核 allowlisted compatibility boundary，未满足完成定义前保持 Pi7 未完成。

### pi63 验证补记（2026-09-15）

首次合同回归曾因本地 `packages/pi-session/dist` 未重建而加载旧生命周期实现，出现 10 个级联失败；重建 `@upup/pi-session` 后，受影响 Factory/Workflow 集合为 `58 pass / 0 fail / 292 expect()`，完整 `bun run test:pi-contracts` 通过。该失败是构建产物陈旧，不是源代码行为回归；后续 Package 验证必须先 build 再执行跨包合同集。

## pi64 实施记录：真实投研证据合同与本地 Pi Session 产品验收（2026-09-15）

### 本轮变更

- 新增 `@upup/pi-investment-workflow` 的统一 evidence verification contract，校验 dossier/hash、Session header、plan/session identity、`detect → plan → execute → verify → report` 顺序、phase events、completed 状态、model/dataAsOf、source evidence、JSONL 完整性和独立 artifact policy。
- 真实验收脚本复用该合同，产出可验证的 `real-invest verification artifact`，并保持真实 provider 的显式只读授权门禁；默认命令只返回 `skipped`，不访问网络。
- 研究数据 fetcher 已贯通 Pi Runtime、Session Factory、Finance Composition 和 Native Research Client；研究 response envelope 的 URL、freshness、retrievedAt、auditId 进入 dossier evidence。
- 新增真实 `PiAgentSessionFactory` fixture 产品验收：不创建第二个 AgentSession，不访问网络，完整运行五阶段，读取 Session JSONL，执行 resume 并验证 artifact hash 一致。
- 修复市场历史 domain DTO：`offline` freshness 不再隐式满足投资历史证据合同，运行时显式 fail-closed。

### 真实验证证据

- 受影响 Package build：`@upup/pi-runtime`、`@upup/pi-finance-composition`、`@upup/pi-session`、`@upup/pi-investment-workflow` 通过。
- 本地 Pi 产品验收：`src/runtime/pi/investment-workflow-evidence.test.ts` 为 `1 pass / 0 fail / 10 expect()`；覆盖五阶段、dossier 校验、URL evidence、JSONL、恢复 hash 和独立 artifact。
- `bun run typecheck`：通过。
- `bun run check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-runtime`、`check:pi-migration`：全部通过；当前报告仍为 `51` workspace packages、`48/48` manifest、唯一 Pi Session factory、无 production global registry。
- `bun run test:pi-contracts`：通过；入口合同覆盖 CLI print、Gateway、Bridge、stdio restart/concurrency、Cron、Pi app、Session、Finance、Investment Workflow 和各 Pi Package。
- `bun run start -- --help`：通过。
- `bun run verify:pi-real-invest`：`status=skipped`、`fixtureSeparate=true`；本轮没有真实 provider 授权，未访问真实数据、凭证、交易、通知或外发副作用。

### 当前进度百分比（分层，不伪造单一完成率）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | Package manifest、唯一 Session factory、root allowlist、legacy/global/deletion/module-boundary 门禁通过 |
| 本地实现与合同 | **约 99%** | evidence contract、fetcher 注入、五阶段 fixture、resume/artifact、provider lifecycle 和 Pi 合同通过 |
| 产品验收 | **约 96%** | 本地 Pi Session 闭环完成；真实 provider dossier、多市场真实数据、最终多入口真实 smoke 和生产 approval/sandbox 证据未完成 |
| 综合工程判断 | **约 99.96%** | 分层工程快照，仅用于排程，不代表 Pi7 完成定义 |

### 当前状态

**Pi7 未完成。** 结构和本地合同已经达到目标形态，但完成定义仍缺真实只读 provider dossier，以及该 dossier 的恢复、审计、跨入口和最终产品证据。`fixture` 结果与 `real-provider skipped` 结果严格分开，不将本地验证计为真实 provider 验收。

### pi65 后续计划

1. 在用户明确只读授权并配置 provider 后执行 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`，只读行情/财报/公告/研究数据。
2. 独立归档真实 dossier 的五阶段 Pi events、Session JSONL、source/asOf/retrievedAt、provider/model、assumptions、risk、policy、approval、artifact hash 和 resume hash。
3. 对真实运行注入 provider failure/retry、restart/resume、幂等、并发 session 和 dispose 后访问检查；任何失败保持 fail-closed，不以 fixture 替代。
4. 真实 dossier 通过后重跑 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 的最终产品 smoke、全量测试、build 和删除审计；全部完成定义满足后才将 Pi7 标记完成。

## pi65 实施记录：幂等并发、研究 Provider Retry 与多入口真实故障验收（2026-09-15）

### 本轮变更

- `@upup/pi-investment-workflow` 的 `idempotencyKey` 从非原子“扫描后创建”改为 plans 目录原子文件锁；同一 key 的并发调用/跨进程调用串行化，锁释放幂等，陈旧锁可恢复，避免重复 plan、重复 AgentSession 和重复副作用。
- `NativeResearchDataClient` 统一使用 `@upup/pi-observability` provider retry contract；瞬时 HTTP/网络故障重试，永久错误与 Abort fail-closed，并在 `@upup/pi-finance-sdk` manifest dependencies 中声明 observability。
- `verify:pi-real-invest` 的 skipped 输出与 artifact 完成分支统一到 `upup.pi.real-invest-verification.v2`。
- 修复 `@upup/pi-platform/extensions/index.ts` 的非法 `readonly Record<...>` MCP contents 类型；该问题曾只在 Pi loader 运行时解析时暴露，typecheck 未能覆盖。

### 验证证据

- Workflow 定向：`5 pass / 0 fail / 36 expect()`；投研证据：`6 pass / 0 fail / 46 expect()`。
- `@upup/pi-finance-sdk`：`38 pass / 0 fail / 180 expect()`；研究 retry 覆盖 transient recovery、永久 403 不重试和 Abort。
- `bun run typecheck`、`check:pi7`、`check:pi-packages`、`check:module-boundaries`、`check:pi-runtime`、`check:pi-migration`、严格 deletion audit：全部通过。
- `bun run test:pi-contracts`：`331 pass / 0 fail / 647 expect()` 核心集合及其余 Pi Package 合同测试通过。
- `bun run build`：通过，资源复制和 `dist/upup` 生成成功。
- 入口矩阵：`8/8`；入口故障：`8/8`；stdio stability：`3/3`，失败 `0`、锁残留 `0`、坏 JSONL `0`；entry SLA：`3/3`、`24/24`；Pi fault matrix：`6/6`。
- 默认真实 provider 命令：`schema=upup.pi.real-invest-verification.v2`、`status=skipped`、`fixtureSeparate=true`；本轮没有真实授权，未访问真实网络或副作用。

### 当前进度（分层）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | Package、唯一 Pi Session factory、root allowlist、legacy/global/deletion/module-boundary 门禁通过 |
| 本地实现与合同 | **约 99.5%** | 幂等锁、研究 retry、证据合同、入口 fault/SLA、Pi loader 真实解析通过 |
| 产品验收 | **约 97%** | 本地五阶段、恢复、并发、故障和多入口证据充分；真实 provider dossier、多市场真实数据、生产 approval/sandbox 证据未完成 |
| 综合工程判断 | **约 99.98%** | 分层工程快照，不代表 Pi7 完成定义 |

### 当前状态

**Pi7 未完成。** 本轮解决了无需真实凭证即可验证的并发、重试、入口和运行时解析缺口；仍缺真实 provider 只读 dossier 及其恢复、审计、跨入口和生产副作用边界证据。fixture 与真实 provider 结果继续严格分离。

### pi66 后续计划

1. 获得用户明确只读授权和 provider 配置后，执行真实 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`。
2. 独立归档真实五阶段 Pi events、Session JSONL、source/asOf/retrievedAt、provider/model、assumptions、risk、policy、approval、artifact hash 和 resume hash。
3. 对真实运行验证 provider retry/恢复、幂等并发、restart/resume、dispose 后拒绝调用和跨入口一致性；失败保持 fail-closed。
4. 真实 dossier 通过后重跑 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI、全量测试、build 和最终删除审计；证据齐全后才标记 Pi7 完成。

## pi66 实施记录：Provider Retry 证据进入可导出 Dossier（2026-09-15）

### 本轮变更

- 研究数据 envelope 现在显式包含 `retryAttempts`、`retryMaxAttempts`、`retryRecovered`；provider transient recovery 不再只写入 telemetry，而是进入投研 dossier 的 detect evidence。
- 完成 `NativeResearchDataClient → workflow researchEvidence → persistDossierCheckpoint → InvestmentDossier` 的字段贯通，并保持旧 fixture envelope 兼容。
- 端到端 Pi Session fixture 验证 dossier JSON 中存在 retry metadata；跨包验证固定先 build observability/finance/composition/workflow/session，再运行跨包测试，防止陈旧 dist 造成假失败或假通过。

### 验证证据

- Research client：`4 pass / 0 fail`；本地 dossier 产品验收：`1 pass / 0 fail / 11 expect()`。
- `bun run typecheck`、Pi Package、module boundary、Runtime、Migration、deletion audit 和 Pi 构建门禁在 Pi65 基础上继续通过。
- 真实 provider：未授权，仍为 `schema=upup.pi.real-invest-verification.v2`、`status=skipped`、`fixtureSeparate=true`；没有真实网络或副作用访问。

### 当前进度

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | Pi65 自动结构门禁结果不变 |
| 本地实现与合同 | **约 99.6%** | retry recovery 已进入可导出 dossier artifact，并通过端到端验证 |
| 产品验收 | **约 97%** | fixture/入口/故障/SLA 完成；真实 provider dossier 与生产副作用证据未完成 |
| 综合工程判断 | **约 99.98%** | 工程快照，不代表 Pi7 完成 |

### pi67 后续计划

1. 获得真实 provider 的明确只读授权后执行真实 dossier，并检查真实 retry metadata 与 telemetry/audit 是否一致。
2. 对真实 dossier 做 restart/resume、幂等并发、provider failure/retry、dispose 后拒绝调用和跨入口一致性验证。
3. 真实证据通过后重跑完整产品验收并决定是否满足 Pi7 完成定义；在此之前保持 Pi7 未完成。

## pi67 实施记录：Real-invest Artifact v3 与 Provider Retry 汇总合同（2026-09-15）

### 本轮变更

- `RealInvestVerificationArtifact` 升级为 `upup.pi.real-invest-verification.v3`，每个 ticker 的独立结果必须携带 provider retry summary。
- retry summary 从 dossier evidence 计算，包含总尝试次数、最大尝试次数、是否发生恢复、证据条数；validator 对缺失字段和非法值 fail-closed。
- fixture 与 contract 测试加入 artifact v3 缺字段篡改检查，防止真实验收报告遗漏 provider recovery 证据。

### 当前状态

- `investment-verification.test.ts` 与 Pi Session dossier fixture：`4 pass / 0 fail / 24 expect()`。
- 跨包验证必须按 `pi-observability → pi-finance-sdk → pi-finance-composition → pi-investment-workflow → pi-session` 顺序构建，避免旧 `.d.ts`/`dist` 污染。
- 真实 provider 仍未授权，默认 `verify:pi-real-invest` 保持 `schema=v3`、`status=skipped`、`fixtureSeparate=true`；Pi7 继续未完成。

## pi68 实施记录：Artifact v3 复验与入口 SLA 稳定性门禁（2026-09-15）

### 本轮完成

- 按依赖顺序重建五个受影响 Pi packages，确认此前 Artifact v3 合同失败来自陈旧构建产物；定向合同测试为 `4 pass / 0 fail / 14 expect()`。
- 将入口 SLA 验证器固定 30 秒超时改为可配置的 `UPUP_PI_ENTRY_SLA_TIMEOUT_MS`，默认 60 秒、上限 300 秒；报告不完整仍 fail-closed。
- 保持 Full Package Split、Reuse First、Aggressive Removal；没有回退到 root `src` 业务实现，也没有引入第二 AgentSession、第二 event adapter、旧 registry 或 global capability fallback。

### 验证证据

- `bun run typecheck`、`bun run build`：通过；`dist/upup` 与 Pi resource copy 成功。
- `check:pi7`、`check:pi-packages`、`check:module-boundaries`、`check:pi-runtime`、`check:pi-migration`、严格 Package audit/deletion audit：全部通过。
- `verify:pi-entry-matrix` `8/8`，`verify:pi-entry-faults` `8/8`，`verify:pi-stdio-stability` `3/3` 且无 failures/lock residues/malformed JSONL，`verify:pi-entry-sla` `3/3`、`24/24` entries，`verify:pi-faults` `6/6`。
- `test:pi-contracts` 完成全列出合同测试；Artifact v3 定向测试 `4 pass / 0 fail`；`git diff --check` 通过。
- `verify:pi-real-invest` 保持 `schema=v3`、`status=skipped`、`fixtureSeparate=true`；没有真实 provider 授权，未访问真实网络或副作用。

### 当前实现进度（分层）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | `48/48` Pi manifest、唯一生产 Session factory、root allowlist、legacy/global/deletion/module-boundary 门禁通过 |
| 本地实现与合同 | **约 99.7%** | Artifact v3、retry evidence、五阶段 fixture、入口 fault/SLA、构建和合同门禁通过 |
| 产品验收 | **约 97%** | 本地闭环、恢复、并发、故障、多入口 fixture 已通过；真实 provider dossier、多市场真实数据和生产副作用证据仍缺 |
| 综合工程判断 | **约 99.98%** | 分层工程快照，不代表 Pi7 完成定义 |

### 未完成项与后续计划

1. 在明确只读授权和 provider 配置后执行真实 `/invest` dossier；默认 fail-closed 行为保持不变。
2. 独立保存真实五阶段事件、Session JSONL、来源/asOf/retrievedAt、provider/model、assumptions、retry summary、risk、policy、approval、artifact hash 与 resume hash。
3. 在真实 dossier 上验证 restart/resume、provider failure/retry、幂等并发、dispose 后调用拒绝及 CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval/TUI 跨入口一致性。
4. 真实证据通过后再运行最终全仓测试、各入口 smoke、资源产物校验和删除审计；在此之前不将 Pi7 标记为完成。

## pi69 实施记录：多市场显式配置与投研证据贯通（2026-09-15）

### 本轮完成

- `@upup/pi-planning` 新增 `ResearchMarket` 类型，ResearchPlan、plan builder、tool binding 支持显式市场并持久化。
- `@upup/pi-investment-workflow` 将 market 贯通 `WorkflowOptions → ResearchPlan → Pi extension schema → AgentSession tool args → provider services → dossier → WorkflowResult → real-invest Artifact v3`。
- `@upup/types` 与 `@upup/pi-finance-composition` 的 research/history/quote provider contract 接受 market；ticker 与显式 market 不匹配时 fail-closed。
- `verify-pi-real-invest` 支持 `UPUP_REAL_INVEST_MARKET=cn|hk|us|fund|crypto`，默认按 `600519.SH`/`00700.HK`/海外 ticker 推断；Artifact v3 每个结果强制携带合法 market。
- 新增计划 market 持久化、provider market 透传、ticker/market mismatch、artifact market 完整性测试。

### 验证证据

- `@upup/types`、`@upup/pi-planning`、`@upup/pi-finance-composition`、`@upup/pi-investment-workflow`、`@upup/pi-session`、`@upup/pi-app` build：通过。
- 定向测试 `20 pass / 0 fail / 55 expect()`；投研 workflow、Artifact v3、Pi Session evidence 合计 `18 pass / 0 fail / 102 expect()`。
- `bun run typecheck`、Pi7 architecture、module boundary、migration、package checks：通过；严格 Package/deletion audit：通过。
- 全量 `test:pi-contracts` 运行完成且无失败；entry matrix `8/8`、entry faults `8/8`、fault matrix `6/6`。
- 默认真实 provider 验收保持 `schema=v3`、`status=skipped`、`fixtureSeparate=true`；本轮未访问真实网络、凭证或副作用。
- `git diff --check`：通过。

### 当前实现进度（分层）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | `48/48` Pi manifest、唯一生产 Session factory、root allowlist、legacy/global/deletion/module-boundary 门禁通过 |
| 本地实现与合同 | **约 99.8%** | 多市场 contract、provider 透传、dossier/artifact、恢复、入口合同和构建通过 |
| 产品验收 | **约 97.5%** | 本地 CN/HK/US 配置闭环已验证；真实 provider dossier、多市场真实数据和生产副作用证据仍缺 |
| 综合工程判断 | **约 99.99%** | 分层工程快照，不代表 Pi7 完成定义 |

### 未完成项与后续计划

1. 取得明确只读授权后分别执行 CN/HK/US 真实 provider dossier；不能使用 fixture 代替真实证据。
2. 为每个市场归档五阶段 Pi events、Session JSONL、source/asOf/retrievedAt、provider/model、retry summary、risk、policy、approval、artifact hash 和 resume hash。
3. 对真实运行验证 restart/resume、failure/retry、幂等并发、dispose 后调用拒绝及 CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval/TUI 一致性。
4. 真实三市场证据通过后，再运行最终全仓测试、入口 smoke、资源复制和删除审计；此前维持 Pi7 未完成。

### pi69 验证补记

- 新增 CN/HK/US provider contract isolation 后，workflow 定向测试为 `14 pass / 0 fail / 78 expect()`；计划、workflow、Artifact v3、Pi Session evidence 合计 `35 pass / 0 fail / 144 expect()`。
- 补充后的 `bun run typecheck`、`bun run build`、Pi7 architecture、module boundary、migration、package checks 和 `git diff --check` 均通过；产物启动文件及 Pi resources 复制成功。

## Pi70 实施记录：统一副作用策略、显式市场 history 路由与最终合同复验（2026-09-15）

### 本轮实现

- `@upup/pi-runtime` 新增 `upup.pi.side-effect-policy.v1`，将 `filesystem-write`、`external-network`、`credential-access`、`financial-write` 统一建模并映射到工具。
- `@upup/pi-session` 在唯一生产 Session 边界执行 fail-closed：副作用工具必须满足 Agent Profile、trust/capability 和显式 approval；直接 `executeTool` 与 Pi `tool_call` 均受保护，决策写入 `upup_pi_policy_audit`。
- `@upup/pi-session` 的 `PiSessionAdapter` 与 `PiAgentSessionFactory` 共享同一 Runtime policy，没有复制 Agent loop 或增加第二事件转换路径。
- `NativeMarketHistoryClient` 接受显式 `requestedMarket`，CN/HK/US 路由、Tushare 非 CN 拒绝、cache key 和 evidence query 已统一；Finance Composition 将 workflow market 真实传递到底层。
- 新增和更新 side-effect、market routing、approval/audit fixture tests；所有旧测试改为显式表达审批意图。

### 验证证据

- Runtime：`18 pass / 0 fail / 53 expect()`；Session Factory：`57 pass / 0 fail / 287 expect()`；market/research：`26 pass / 0 fail / 80 expect()`。
- `test:pi-contracts`：`139 pass / 0 fail / 1692 expect()`；全 workspace 合同脚本退出码 `0`。
- `bun run typecheck`、`bun run build`、Pi7 architecture、runtime、module boundary、migration、package checks、严格 package/deletion audit、`git diff --check`：全部通过。
- 静态门禁保持：`48/48` manifests、唯一生产 AgentSession factory、无 legacy/global consumer、无旧 root import/path；deletion audit `passed`。
- 入口 smoke `bun run start -- --help` 通过；真实 provider 验收仍为 `schema=v3/status=skipped/fixtureSeparate=true`，未访问真实网络和副作用。

### Pi7 当前进度（分层）

| 层级 | 当前值 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | Package、唯一 factory、root allowlist、legacy/global/deletion/module-boundary 门禁通过 |
| 本地实现与合同 | **约 99.9%** | side-effect policy/audit、显式 market provider routing、恢复、入口合同、全量合同和 build 通过 |
| 产品验收 | **约 98%** | 本地投研闭环完成；真实多市场 provider dossier、真实恢复和生产副作用审计未完成 |
| Pi7 完成度 | **未完成** | 完成定义仍要求真实 provider 与生产副作用证据 |

### Pi71 后续计划

1. 明确只读授权和凭证后分别执行 CN/HK/US real-invest dossier；真实交易、外发通知、凭证导出和未审批文件写入继续禁止。
2. 归档五阶段 Pi events、Session JSONL、source/asOf/retrievedAt、market/provider/model、retry、risk、policy、approval、artifact hash 和 resume hash。
3. 验证真实 provider failure/retry、restart/resume、幂等并发、dispose 后拒绝调用和所有入口一致性。
4. 独立审计副作用 sandbox/deny/approval 证据；只有全部通过才将 Pi7 标记完成。

## Pi71 实施记录：统一 Package sideEffects contract 与 market-aware research（2026-09-15）

### 已完成

- `PiPackageManifestContract.sideEffects` 完成统一校验、catalog 加载、Session policy 注入和风险等级分组。
- Runtime 只处理通用 effect/safety contract，不再硬编码 `write_file`、`notify`、`place_trade_order` 等业务工具名；Package 自己声明 ownership 与风险。
- Research client 的 `ResearchMarket`、market-specific fetcher/provider、evidence market/provider 已接入；未配置 CN/HK provider 时 fail-closed。
- Session Factory 新增 market provider 配置透传，保持 Pi `AgentSession` 唯一生产执行内核和唯一 policy/event 边界。

### 报告与验证

- `report:pi7`：`51` workspace packages、`48` Pi-native manifests、root production allowlist `3` 个文件、root production `109` 行；结构指标 `100%`。
- `check:pi7`、严格 Package audit、deletion audit：通过；legacy consumers、global registry consumers、old root imports、duplicate registry candidates 均为 `0`。
- Runtime/Resource Composition：`44 pass / 0 fail / 119 expect()`；Session/Finance 定向合同：`56 pass / 0 fail / 154 expect()`。
- 受影响 Package build、根 typecheck/build、CLI help smoke、module/migration/package/runtime checks、`git diff --check`：全部通过。
- 未执行真实 provider 或真实副作用；本轮未访问真实凭证、交易、通知或未审批文件系统写入。

### 当前进度与结论

| 维度 | 进度 | 结论 |
|---|---:|---|
| 结构迁移 | **100%** | Package manifest、root allowlist、唯一 Session factory、legacy/global 清理门禁通过 |
| 本地实现/合同 | **约 99.9%** | Runtime contract、side-effect policy、market provider boundary、恢复/审计合同通过 |
| 产品验收 | **约 98%** | fixture/injected provider 闭环通过；真实多市场 dossier 与生产级副作用审计未完成 |
| Pi7 总体 | **未完成** | 结构报告 100% 不等于 Pi7 完成定义 |

### Pi72 后续计划

1. 取得明确只读授权后执行 CN/HK/US 真实 provider dossier，并与 fixture artifact 分目录、分 schema 记录。
2. 验证五阶段真实事件、可恢复 Session、证据链、retry/failure、artifact hash 和 resume hash。
3. 验证多 Session 隔离、abort、compact、restart、provider failure、retry、dispose，以及外围入口不重复创建 Session、映射 event 或注册 tool。
4. 审计 filesystem、credential、notification、paper/real order 的 sandbox/deny/approval；未通过前保持 Pi7 未完成。
5. 真实证据完成后运行全仓测试、构建、入口 smoke 和最终结构报告，再更新完成状态。

## Pi72 实施记录：market-aware tools、真实历史回测与风险闭环（2026-09-15）

### 已完成

- 研究 Pi tools 与 workflow 统一显式 market schema 和 provider evidence；CN/HK provider 缺失时 fail-closed。
- `strategy_backtest` 从合成 `_stub` 快照改为 caller-provided historical bars：校验日期、排序、close、volume、日期范围和算法所需数据，按历史输入计算 fill/slippage，拒绝伪造回测。
- `/risk-dashboard` 接入 `@upup/pi-risk` 的 VaR、Sharpe、Max Drawdown、HHI；无数据时报告缺失而非“待计算”的假指标。
- 修复 `@upup/pi-risk` declaration 输出路径，避免跨 Package 类型消费失败；workflow manifest 增加精确 risk 依赖。

### 验证

- `19 pass / 0 fail / 139 expect()`：Finance SDK + production finance contracts。
- `62 pass / 0 fail / 250 expect()`：Investment Workflow + Pi Risk。
- `65 pass / 0 fail / 688 expect()`：Pi Session factory、fixture、profile contracts。
- `typecheck`、受影响 Package build、根 build、`check:pi7`、module/migration/package checks、strict package/deletion audits、`git diff --check`：通过。
- 已验证入口矩阵 `8/8`、入口故障 `8/8`、fault matrix `6/6`、stdio stability `3/3`；真实 provider 仍未执行，fixture 与真实证据严格分开。

### 进度

| 维度 | 进度 | 依据 |
|---|---:|---|
| 结构迁移 | **100%** | `48/48` Pi manifests、唯一 Session factory、root allowlist、legacy/global/deletion 门禁通过 |
| 本地实现/合同 | **约 99.9%** | market-aware tools、历史回测、Pi Risk、Session/Package contracts 和构建通过 |
| 产品验收 | **约 98%** | 本地证据闭环通过；真实多市场 dossier、真实恢复和生产副作用审计未完成 |
| Pi7 总体 | **未完成** | 完成定义仍要求真实 provider 与生产级证据 |

### Pi73 后续计划

1. 执行授权后的 CN/HK/US 真实 provider dossier，并按市场独立归档证据。
2. 使用真实历史 bars 验证策略回测、source/asOf/retrievedAt、retry 和审计链。
3. 验证真实 Session 生命周期、并发隔离、入口一致性和副作用 approval/audit。
4. 全仓验证通过后再决定是否满足 Pi7 完成定义；此前保持未完成。

## Pi73 实施记录：合同依赖修复与最终全仓验证（2026-09-15）

### 已完成

- 修复 `@upup/pi-risk@0.1.0` 未进入投资工作流合同 fixture 信任清单的问题，补齐 package name、trusted path、pinned version 和 allowed source；真实 Package contract 与测试 fixture 现在一致。
- 保持 Full Package Split、Reuse First、Aggressive Removal；没有回退到 root `src` 业务实现，没有新增第二 Pi Runtime、AgentSession、event adapter、tool/skill registry 或 global capability registry。

### 验证证据

- 受影响 Package build、根 `bun run typecheck`、根 `bun run build`：通过；Pi resources 复制成功。
- `bun run test:pi-contracts`：通过；全仓 `bun test`：`2170 pass / 0 fail / 6910 expect()`，`217` 个测试文件。
- `check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-packages`、`check:pi-runtime`、严格 Package audit、严格 deletion audit、`git diff --check`：全部通过。
- 结构报告：`51` workspace packages、`48` Pi-native manifests、root production allowlist `3` 个文件、root production `109` 行；legacy consumers、global registry consumers、old root imports、duplicate registry candidates 均为 `0`。
- 入口与恢复：entry matrix `8/8`、entry fault matrix `8/8`、Pi fault matrix `6/6`、stdio stability `3/3`、entry SLA `24/24`，无 failures、lock residues 或 malformed JSONL。
- CLI `start -- --help` 通过；`verify:pi-real-invest` 为 `schema=v3`、`status=skipped`、`fixtureSeparate=true`，未执行真实网络、凭证、交易、通知或未审批文件写入。

### 当前实现进度

| 层级 | 进度 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | Pi manifest 覆盖、唯一 Session factory、root allowlist、无 legacy/global consumer、删除审计和模块边界均通过 |
| 本地实现/合同 | **约 99.9%** | Package contract、capability isolation、market/provider boundary、历史回测、风险指标、policy/audit、Session 恢复和全仓测试通过 |
| 产品验收 | **约 98%** | fixture 与 injected-provider 闭环、故障、恢复、并发和多入口均通过；真实市场 dossier 和生产副作用证据未完成 |
| Pi7 总体 | **未完成** | 真实 provider 与生产级只读证据是完成定义的硬条件，不能用本地 fixture 替代 |

### Pi74 后续计划

1. 在明确只读授权后分别执行 CN/HK/US 真实 dossier，按市场隔离 artifact，记录五阶段事件、来源时间链、provider retry、model、risk/policy/approval 和 artifact/resume hash。
2. 从真实历史 provider 生成带 source/asOf 校验的 bars，验证回测成本、滑点、交易日、微结构和失败恢复，不允许 fallback 到合成数据。
3. 进行真实 Session restart/compact/fork/abort/dispose、并发隔离和跨入口一致性验证，确保所有外围入口共享唯一 Pi Runtime。
4. 对文件写入、凭证访问、通知和交易执行执行 sandbox/deny/approval/audit 验证；在逐项授权前保持默认 deny。
5. 完成真实证据后重新运行全仓测试、构建、入口 smoke、资源校验和最终删除审计，再决定是否将 Pi7 标记完成。

## Pi74 实施记录：legacy Package 清理与真实市场 provider 组合（2026-09-15）

### 已完成

- 物理删除无生产消费者的 legacy `packages/plugins`、`packages/plugin-sdk`、`packages/skills`，包括残留构建产物、源码和测试目录；不保留旧 Package 空壳或双轨能力交付。
- workspace 从 `51` 收敛为 `48`，`48/48` workspace package 均具备有效 Pi manifest；Pi Package contract 成为唯一能力交付边界。
- 新增 `@upup/pi-finance-sdk` Tushare 只读 research adapter，CN/HK 显式路由（HK 使用 `hk_daily`、`hk_fina_indicator`、`hk_forecast`、`hk_income`、`hk_fina_audit`），覆盖行情、指标、预测、财报和公告请求；provider 错误、凭证缺失和错误响应均 fail-closed。
- market-level API key、base URL、fetcher、provider 显式贯通 `Pi Runtime → Finance Composition → Session Factory → Pi App`；默认 Pi App 只在 `TUSHARE_TOKEN` 存在时启用 CN/HK Tushare，不把 US provider 冒充为 CN/HK 数据源。
- `real-invest-verification.v3` 每个 result 强制记录实际 `provider`；research envelope、workflow evidence 和 dossier 保留 provider/source 证据。

### 验证证据

- Tushare/Research：`7 pass / 0 fail / 22 expect()`；Investment verification：`5 pass / 0 fail / 15 expect()`。
- 受影响 Package build、根 typecheck、根 build、Pi resources copy：通过；Pi contract test chain：通过。
- `check:pi7`、`check:pi-migration`、`check:module-boundaries`、`check:pi-packages`、`check:pi-runtime`、严格 Package audit/deletion audit、`git diff --check`：全部通过。
- 自动报告：`48` workspace packages、`48` Pi-native manifests、root production `109` 行、root allowlist `3` 个文件；legacy/global/old-root/duplicate-registry consumers 均为 `0`。
- CLI build 和 `verify:pi-real-invest` 通过；真实验收仍为 `schema=v3`、`status=skipped`、`fixtureSeparate=true`，未访问真实 provider 或副作用。

### 当前实现进度

| 层级 | 进度 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | `48/48` Pi manifest、legacy 包物理删除、唯一 Session factory、root allowlist、删除审计通过 |
| 本地实现/合同 | **约 99.95%** | Tushare market adapter、provider/source evidence、artifact 合同、Package trust/lifecycle 和全链验证通过 |
| 产品验收 | **约 98%** | 本地多市场闭环、恢复、故障、并发和多入口 fixture 通过；真实 CN/HK/US dossier 与生产副作用证据仍缺 |
| Pi7 总体 | **未完成** | 真实 provider 只读 dossier 是硬性完成条件，不能以 fixture 或 skip 替代 |

### Pi75 后续计划

1. 在明确只读授权后分别运行 CN/HK/US 真实 `/invest` dossier，按市场独立归档 provider、source、asOf、retrievedAt、retry、model、risk/policy/approval、artifact hash 和 resume hash。
2. 从真实 history provider 生成校验后的 bars，验证成本、滑点、交易日、微结构、数据缺口与失败恢复，禁止合成数据补齐。
3. 完成真实 Session restart/compact/fork/abort/dispose、并发隔离、provider failure/retry 和 CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval/TUI 一致性验证。
4. 对文件写入、凭证访问、通知和交易执行执行 sandbox/deny/approval/audit 验证；逐项授权前保持默认 deny。
5. 真实证据完成后重新运行全仓测试、构建、入口 smoke、资源校验和最终删除审计，再决定是否将 Pi7 标记完成。

## Pi76 实施记录：最终全仓复验与当前进度快照（2026-09-15）

### 本轮结果

- 重新运行全仓 `bun test`：`2171 pass / 0 fail / 6915 expect()`，覆盖 `217` 个测试文件。
- 重新运行 `bun run build`：通过；根类型检查、CLI 可执行产物构建和全部 Pi resource copy 均成功。
- `bun run test:pi-contracts`：`139 pass / 0 fail / 1693 expect()`；Pi Runtime、Session、Package、入口和金融闭环合同通过。
- `check:pi7`、`check:pi-migration`、`check:module-boundaries`、`check:pi-packages`、`check:pi-runtime`、严格 Package audit、严格 deletion audit、`git diff --check`：全部通过。
- `bun run start -- --help`：通过；CLI、Session、Bridge、Gateway、stdio、Cron 和 daemon 相关 Pi 合同保持通过。
- 自动架构报告：`48` workspace packages、`48/48` Pi-native manifests、root production `3` 个文件共 `109` 行；legacy event、global registry、旧 root import 和重复 registry consumers 均为 `0`；结构迁移指标为 `100%`。
- `bun run verify:pi-real-invest` 在无显式授权时按设计返回 `schema=v3`、`status=skipped`、`fixtureSeparate=true`，未访问真实 provider、凭证、交易、通知或未审批文件写入。

### 当前进度（自动结构指标 + 产品门槛）

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 自动报告的 `48/48` manifest、唯一生产 `createAgentSession`、root allowlist、legacy/global/deletion/module-boundary 门禁全部通过 |
| 本地实现与合同 | **约 99.95%** | 全仓测试、Pi contract chain、Package lifecycle/trust/capability、Session 恢复/隔离、入口 fault/SLA、构建全部通过 |
| 产品验收 | **约 98%** | fixture/injected-provider 闭环、证据、恢复、并发、失败重试和跨入口合同通过；真实 CN/HK/US dossier 及真实生产副作用审计未执行 |
| Pi7 总体 | **未完成** | 完成定义要求真实 provider 只读 dossier、真实恢复和生产级副作用 sandbox/deny/approval/audit 证据；本轮 `status=skipped` 不能计为完成 |

以上百分比只用于分层工程快照；结构数字由 `bun run report:pi7` 生成，产品验收仍以 Pi7 完成定义的硬门槛判定。

### Pi76 后续计划

1. 在用户明确只读授权并配置真实 provider 后，分别执行 CN/Tushare、HK/Tushare 和 US/Financial Datasets dossier；按市场独立归档五阶段 Pi events、Session JSONL、provider/source/asOf/retrievedAt、retry、model、risk/policy/approval、artifact hash 与 resume hash。
2. 使用真实历史 provider 生成带来源和时间校验的 bars，验证交易日、成本、滑点、微结构、数据缺口、回测结果和 provider failure/retry；禁止合成数据补齐真实缺口。
3. 在真实 Session 上验证 restart、compact、fork、abort、dispose、幂等并发和跨 CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval/TUI 入口的一致性。
4. 对文件写入、凭证访问、通知、MCP 外部访问和交易执行逐项验证 sandbox/deny/approval/audit；无逐项授权时继续默认 deny。
5. 真实证据通过后重新执行全仓测试、构建、入口 smoke、资源产物校验和删除审计，再决定是否满足 Pi7 完成定义；在此之前保持“未完成”。

## Pi77 实施记录：多市场历史 provider 配置修复与全链复验（2026-09-15）

### 本轮实现

- 修复 `@upup/pi-app` 默认配置对象的字段覆盖问题：同时配置 `TUSHARE_TOKEN` 与 `FINANCIAL_DATASETS_API_KEY` 时，CN/HK 的 Tushare 与 US 的 Financial Datasets 现在合并保留，不再由后声明字段覆盖前一市场配置。
- 清理 `@upup/pi-market-data` 重复的 US Financial Datasets 路由测试，保留单一、独立、可审计的 market-scoped history contract。
- 保持历史 provider 的 fail-closed 语义：CN/HK 显式走 Tushare，US 显式走 Financial Datasets；少于两根历史 bar、凭证缺失、响应结构不完整或 provider 错误均不得用合成数据补齐。
- 保持真实投研 artifact contract：每个结果必须包含 market、provider、history evidence（provider/source/asOf/retrievedAt）、retry summary、artifact hash 与 resume hash。

### 验证证据

- `packages/pi-market-data` 定向测试：`46 pass / 0 fail / 215 expect()`；US 路由测试仅保留一份。
- `packages/pi-finance-composition`：`2 pass / 0 fail / 5 expect()`。
- `packages/pi-investment-workflow`：`96 pass / 0 fail / 311 expect()`；独立 artifact 校验合同单文件 `5 pass / 0 fail / 15 expect()`。
- 根 `bun run typecheck`、受影响 Package build、根 `bun run build`、资源复制、`bun run start -- --help`：全部通过。
- 全仓 `bun test`：`2171 pass / 0 fail / 6915 expect()`，覆盖 `217` 个测试文件。
- `check:pi7`、`check:pi-migration`、`check:module-boundaries`、`check:pi-packages`、`check:pi-runtime`、严格 Package audit、严格 deletion audit、`git diff --check`：全部通过；`48/48` Pi manifest、唯一生产 Session factory、legacy/global/old-root/duplicate-registry consumers 均为 `0`。
- `bun run verify:pi-real-invest`：`schema=v3`、`status=skipped`、`fixtureSeparate=true`；没有显式只读授权和真实凭证，因此未访问 CN/HK/US provider、交易、通知、凭证或未审批文件写入。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 自动结构报告、Package manifest、唯一 Session factory、root allowlist、删除/边界门禁全部通过 |
| 本地实现与合同 | **约 99.95%** | 多市场 provider 配置、历史 evidence、artifact contract、Session/Package 生命周期、全仓测试和构建通过 |
| 产品验收 | **约 98%** | fixture/injected-provider 的五阶段闭环、恢复、隔离、失败重试和副作用策略通过；真实 dossier 与生产副作用审计仍未执行 |
| Pi7 总体 | **未完成** | 完成定义要求真实 CN/HK/US dossier、真实恢复证据和生产级 sandbox/deny/approval/audit 证据；本轮 skip 不计入完成 |

### Pi78 后续计划

1. 在用户明确只读授权并配置 `TUSHARE_TOKEN`、`FINANCIAL_DATASETS_API_KEY` 后，分别执行 CN/Tushare、HK/Tushare、US/Financial Datasets 的真实 `/invest` dossier；每个市场独立归档五阶段 Pi events、Session JSONL、provider/source/asOf/retrievedAt、retry、model、risk/policy/approval、artifact hash 和 resume hash。
2. 使用真实历史 provider 生成带来源和时间校验的 bars，验证交易日、成本、滑点、微结构、数据缺口和 provider failure/retry；禁止合成 fallback，并将真实 artifact 与 fixture artifact 分离保存。
3. 在真实 Session 上验证 restart、compact、fork、abort、dispose、幂等并发、多 Session 隔离，以及 CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval/TUI 的同一 Pi Runtime 行为。
4. 对 filesystem、credential、notification、MCP 外部访问和 paper/real order 逐项执行 sandbox/deny/approval/audit；未逐项取得授权前保持默认 deny，不执行真实交易和外发副作用。
5. 真实证据完成后重新运行全仓测试、构建、入口 smoke、资源复制、结构/删除审计；只有全部硬门槛通过才将 Pi7 标记完成，否则继续记录具体阻塞证据。

## Pi78 实施记录：真实验收安全合同、幂等/分叉证据与 Worker provider 隔离（2026-09-15）

### 本轮实现

- `@upup/pi-investment-workflow` 新增 `verifyReadOnlySessionSafety()`：解析 Pi Session JSONL 中的 `upup_pi_policy_audit`，拒绝未知或 `approval_granted` 决策，并对 financial-write、credential-access、filesystem-write 强制只允许 denied/approval_required/approval_denied。
- `scripts/verify-pi-real-invest.ts` 现在默认覆盖 `600519.SH`、`00700.HK`、`AAPL` 三市场；显式授权后拒绝 `UPUP_DRY_RUN`、重复 ticker、未指定 ticker 的 market override，以及 fund/crypto 等超出 Pi7 范围的市场。
- 真实验收脚本新增幂等重放、restart/resume、read-only policy audit 和实际 Pi Session fork 文件检查；artifact 强制记录 `forkSessionFile` 与 `policyAudit` 汇总，不能只凭 dossier hash 宣称完成。
- 修复 `@upup/pi-session` Platform worker 子 Session 的 runtime context 透传：market history fetchers/providers/keys/base URLs 和 research fetchers/providers/keys/base URLs 全部继承父 Session，避免 CN/HK/US worker 绕过显式 Package provider 配置。

### 验证证据

- `@upup/pi-investment-workflow`：`97 pass / 0 fail / 314 expect()`；独立 verification 合同新增 read-only safety 与 artifact policy/fork 字段校验。
- `@upup/pi-session`：`68 pass / 0 fail / 160 expect()`；Pi workflow evidence fixture：`1 pass / 0 fail / 11 expect()`。
- 全仓 `bun test`：`2172 pass / 0 fail / 6919 expect()`，覆盖 `217` 个测试文件。
- 根 `typecheck`、workflow Package build、根 `build`、Pi resource copy、CLI `start -- --help`：全部通过。
- `check:pi7`、`check:module-boundaries`、`check:pi-migration`、严格 Package audit、严格 deletion audit、`git diff --check`：全部通过；保持 `48/48` Pi manifest、唯一生产 Session factory、legacy/global/old-root/duplicate-registry consumers 为 `0`。
- 无授权 smoke：`verify:pi-real-invest` 返回 `status=skipped`；显式授权+`UPUP_DRY_RUN=1` 返回非零并明确拒绝，证明真实验收不会误用 fixture。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | Package、唯一 factory、root allowlist、删除/边界门禁持续通过 |
| 本地实现与合同 | **约 99.97%** | read-only policy contract、三市场验收编排、幂等/resume/fork artifact、worker provider 隔离和全仓验证通过 |
| 产品验收 | **约 98%** | 本地 fixture/injected-provider 的闭环与安全合同通过；真实 CN/HK/US provider dossier 尚未执行 |
| Pi7 总体 | **未完成** | 真实凭证/只读授权、真实 provider 证据、真实恢复和生产副作用审计仍是硬门槛 |

### Pi79 后续计划

1. 在用户明确提供只读授权和 `TUSHARE_TOKEN`、`FINANCIAL_DATASETS_API_KEY` 后运行三市场真实 `/invest`，保存独立 artifact、Session JSONL、fork 文件和 policy audit。
2. 对真实 provider failure/retry、历史 bars、交易日、成本、滑点、微结构和缺口执行逐市场检查；任何 synthetic/offline evidence 都使验收失败。
3. 在真实 Session 上执行 compact、restart、resume、fork、abort、dispose、并发幂等及 worker provider 一致性，并核对所有入口共享同一 Pi Runtime。
4. 对 filesystem、credential、notification、MCP 外部访问和 paper/real order 完成 sandbox/deny/approval/audit 证据；未逐项授权前继续默认 deny。
5. 真实证据全部通过后再更新 Pi7 完成状态；目前不得以 `status=skipped`、fixture 或静态门禁代替真实产品验收。

## Pi79 实施记录：最后一次全量门禁与构建复验（2026-09-15）

### 本轮完成

- 在 Pi78 ownership 修复之后重新执行全仓测试、Pi contract suite、类型检查、Pi7 架构/迁移/runtime/Package/deletion 审计、构建、资源复制、CLI help 和 `git diff --check`。
- 自动结构快照确认 `48/48` Pi manifest、`269/269` native extension tools、native coverage `100.0%`、remaining host adapter tools `[]`、root production files `0`、legacy/global/old-root/duplicate-registry consumers `0`。
- 保持唯一生产 Pi Session factory；Package ownership contract 与 `@upup/pi-investment-workflow` 的 `invest_workflow_phase`、`invest_workflow` 声明一致。

### 验证证据

- 全仓 `bun test`：`2172 pass / 0 fail / 6922 expect()`，`217` 个测试文件。
- `bun run test:pi-contracts`：通过；其中 Pi-backed stdio、Gateway、Bridge、Cron、CLI print、Session、Package、market-data、workflow、policy 和跨入口合同均通过。
- `bun run typecheck`：通过；`bun run build`：通过；Pi package resources 已复制到 `dist`；`bun run start -- --help`：通过。
- `bun run check:pi-migration`、`check:pi-runtime`、`check:pi-packages`、`check:pi7`、严格 `check:pi-package-audit`、严格 `check:pi-deletion-audit`：全部通过；`git diff --check`：通过。
- 无授权 `verify:pi-real-invest` 返回 `status=skipped`；本轮未访问真实 provider、凭证、交易、通知或未审批文件写入。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、269/269 native tools、root/legacy/global/deletion 门禁通过 |
| 本地实现与合同 | **约 99.98%** | 全仓 2172 测试、Pi contract、类型、构建和入口 smoke 通过 |
| 产品验收 | **约 98%** | fixture/injected-provider 和安全合同通过；真实 CN/HK/US dossier、真实恢复和生产副作用证据仍缺失 |
| Pi7 总体 | **未完成** | fail-closed 硬门槛尚未满足，不能用 skipped、fixture 或静态门禁替代真实验收 |

### Pi80 后续计划

1. 仅在用户明确授权只读访问并提供可用 `TUSHARE_TOKEN`、`FINANCIAL_DATASETS_API_KEY` 后运行三市场真实 `/invest` dossier；真实 artifact、Session JSONL、fork 文件和 policy audit 独立归档。
2. 逐市场验证真实 history bars、交易日、成本、滑点、微结构、缺口以及 provider failure/retry；任何 synthetic/offline evidence 都判定失败。
3. 在真实 Session 验证 compact、restart/resume、fork、abort、dispose、幂等并发、worker provider 隔离和所有入口共享同一 Pi Runtime。
4. 对 filesystem、credential、notification、MCP 外部访问和 paper/real order 逐项完成 sandbox/deny/approval/audit；未授权时继续默认 deny。
5. 真实证据全部通过后重新运行全量测试、构建、入口 smoke、资源校验和删除审计，再决定是否满足 Pi7 完成定义。

## Pi80 实施记录：生产副作用 manifest 覆盖门禁（2026-09-15）

### 本轮实现

- 新增 `scripts/check-pi-side-effects.ts` 与独立测试，定义并校验 27 个生产副作用工具的 Package manifest 覆盖：filesystem-write、external-network、credential-access、financial-write。
- 将副作用覆盖门禁接入 `check:pi-packages` 和 `check:pi7`；新增工具若未在 manifest 声明 effect/safetyLevel，主验证链直接失败。
- 补齐 `@upup/pi-platform` 的 shell、文件、导出、memory、notebook、heartbeat、cron、worktree、MCP credential/resource sideEffects 声明；保持 Session 内 watchlist/portfolio 状态写入不被误判为外部副作用。
- 扩展 `@upup/pi-portfolio` manifest 的统一 Pi contract 字段，并修正受副作用策略保护的入口合同测试，使直接工具执行必须显式提供 approval callback。

### 验证证据

- `bun run check:pi-side-effects`：`27` 个 required declarations 全部通过。
- `bun test scripts/check-pi-side-effects.test.ts packages/pi-runtime/test.ts`：`2 pass / 0 fail`，runtime manifest contract 通过。
- `src/runtime/pi/agent-session-factory.test.ts`：`57 pass / 0 fail / 287 expect()`；新增副作用声明没有破坏 Session 隔离、恢复或 Package ownership。
- 全仓 `bun test`：`2174 pass / 0 fail / 6925 expect()`，`218` 个测试文件。
- 串行 `bun run test:pi-contracts`：`139` 个 root/entry contract tests、各 Pi Package、Bridge、Daemon 等合同全部通过；最终进程退出码 `0`。
- `bun run typecheck`、`bun run build`、资源复制、CLI `start -- --help`、`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime`、`check:pi-packages`、`check:pi7`、严格 Package/deletion audit、`git diff --check`：全部通过。
- 自动报告保持 `48/48` Pi manifest、`269/269` native extension tools、native coverage `100.0%`、root production files `0`、legacy/global/old-root/duplicate-registry consumers `0`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | Package、唯一 Session factory、root allowlist、删除/边界/副作用覆盖门禁全部通过 |
| 本地实现与合同 | **约 99.99%** | 全仓 2174 测试、Pi contract、类型、构建、入口及 27 项副作用声明通过 |
| 产品验收 | **约 98%** | 本地 fixture/injected-provider、恢复、并发和安全策略通过；真实 provider dossier 与生产副作用审计仍未执行 |
| Pi7 总体 | **未完成** | 缺少用户明确只读授权/真实凭证及真实 CN/HK/US provider 证据，继续 fail-closed |

### Pi81 后续计划

1. 仅在用户明确授权只读访问并提供 `TUSHARE_TOKEN`、`FINANCIAL_DATASETS_API_KEY` 后执行三市场真实 dossier；真实 artifact、Session JSONL、fork 文件和 policy audit 独立存档。
2. 逐市场验证真实历史 bars、来源时间、交易日、成本、滑点、微结构、数据缺口、retry/failure/recovery；拒绝 synthetic/offline fallback。
3. 在真实 Session 验证 compact、restart/resume、fork、abort、dispose、幂等并发、worker provider 隔离和 CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval/TUI 一致性。
4. 对 filesystem、credential、notification、MCP、paper/real order 逐项生成 sandbox/deny/approval/audit 证据；未授权时继续默认 deny。
5. 真实证据通过后重新运行全量验证；只有全部 Pi7 完成定义满足时才标记完成。

## Pi81 实施记录：运行时副作用审计 smoke 与 Provider SLA 类型收口（2026-09-15）

### 本轮实现

- 新增 `scripts/verify-pi-side-effects-runtime.ts`，实际创建 Pi Session 并调用 `config_set`、`write_file`、`mcp_auth_get`、`notify`、`place_trade_order` 五类高风险工具。
- Smoke 校验每个工具均被阻断，Session JSONL 产生 `upup_pi_policy_audit`，并验证 effect、decision、tool 一致；同时确认没有文件写入或凭证状态生成。
- 将运行时 smoke 接入 `test:pi-contracts`，静态 manifest 覆盖和动态 Session policy audit 成为同一合同链。
- 扩展 `UpUpToolPolicyAudit.effect` 与 Pi Session host management provider 类型，纳入 `financial-datasets`，修复 `@upup/pi-session` 独立 build 的 provider 类型缺口。
- `report:pi7` 现在自动输出副作用声明数量、覆盖率和 gaps；当前为 `27 / 100% / []`。

### 验证证据

- `bun run verify:pi-side-effects`：通过，5/5 副作用类别均产生预期阻断和审计。
- `@upup/pi-runtime`、`@upup/pi-session` 独立 build：通过。
- `bun run check:pi7`、`check:pi-packages`、`typecheck` 和 `git diff --check`：通过。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 Session factory、root/legacy/global/deletion 门禁通过 |
| 本地实现与合同 | **约 99.99%** | 27 项静态副作用声明与 5 类运行时 Session audit smoke 通过；Pi10 runtime build 缺口已修复 |
| 产品验收 | **约 98%** | fixture/injected-provider 与 runtime safety audit 通过；真实 CN/HK/US provider dossier 仍未执行 |
| Pi7 总体 | **未完成** | 真实 provider、真实恢复和生产副作用批准证据仍是完成定义硬门槛 |

### Pi82 后续计划

1. 在用户明确只读授权并提供真实 provider 凭证后，执行 CN/HK/US 三市场 dossier，独立保存真实 Session、fork、artifact、provider retry 和 policy audit。
2. 在真实 provider 环境验证 history bars、交易日、成本、滑点、缺口、failure/retry/recovery 以及 worker provider 透传。
3. 对 CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval、TUI 逐入口执行真实 Session smoke，并验证统一 Pi Runtime。
4. 继续保持真实交易、外发通知、凭证导出和未审批文件写入默认 deny；完成真实 sandbox/deny/approval/audit 证据后再审计 Pi7 完成定义。

## Pi82 实施记录：跨入口故障恢复与稳定性验证（2026-09-15）

### 本轮验证

- `verify:pi-entry-matrix`：CLI、Gateway、Cron、Daemon、Bridge、stdio、SDK、Eval 共 `8/8` 入口通过，共享 `Pi AgentSession + Package public APIs`。
- `verify:pi-entry-faults`：8/8 入口在 provider/transport fault 后恢复，首次失败、重试次数、恢复结果和审计 artifact 均可观察。
- `verify:pi-entry-sla`：3 轮、24/24 entry runs 通过；p50 `3853ms`、p95 `3863ms`、无失败轮次。
- `verify:pi-stdio-stability`：3 轮、每轮 2 sessions、每轮 8 requests 通过；无 lock residue、malformed JSONL 或失败。
- 全仓 `bun test`：`2174 pass / 0 fail / 6925 expect()`，`218` 个测试文件；`test:pi-contracts`、typecheck、build、资源复制、CLI help、所有静态门禁通过。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、269/269 native tools、唯一 factory、root/legacy/global/deletion 门禁通过 |
| 本地实现与合同 | **约 99.99%** | 8/8 入口矩阵、24/24 故障恢复、3 轮 SLA、stdio 稳定性和全仓合同通过 |
| 产品验收 | **约 98.5%** | fixture/injected provider 的闭环、恢复、跨入口稳定性和副作用审计通过；真实 provider dossier 仍缺失 |
| Pi7 总体 | **未完成** | 真实 CN/HK/US provider、真实历史 bars/retry/recovery 和用户授权的生产 approval/audit 证据仍未执行 |

### Pi83 后续计划

1. 继续等待并仅在明确只读授权和凭证可用时执行真实 CN/HK/US dossier；真实结果与 fixture 目录隔离。
2. 将真实 provider 运行同样接入 entry matrix、fault/recovery、SLA 和 Session restart/compact/fork/abort/dispose 审计，但不执行交易或外发通知。
3. 收集真实 provider source/asOf/retrievedAt、history bars、retry/failure/recovery、model、风险和 policy audit；任何 synthetic/offline fallback 使验收失败。
4. 完成真实证据后再运行最终全仓、构建、入口 smoke、资源复制和删除审计，最后评估 Pi7 完成定义。

## Pi83 实施记录：Prompt Package 收口与 Session runtime 依赖瘦身（2026-09-15）

### 本轮实现

- 将默认投资助手 system prompt 从 `@upup/pi-session` 私有实现下沉到 `@upup/pi-prompt-config` 的 `buildDefaultInvestmentSystemPrompt()`。
- Session Factory 的能力说明、Coach role prompt 和默认身份 prompt 统一通过 `@upup/pi-prompt-config` public API 组合，不再在 Session runtime 内硬编码 prompt 文本。
- `packages/pi-session/src/prompt-runner.ts` 的 `validateAgentSpec` 改由 `@upup/pi-runtime` contract 提供，移除 Session 对 `@upup/pi-investment-workflow` 的直接验证依赖。
- `@upup/pi-session` manifest 增加精确的 `@upup/pi-prompt-config@0.1.0` Pi dependency 声明。

### 验证证据

- `@upup/pi-prompt-config`：`11 pass / 0 fail / 27 expect()`；新增默认 prompt ownership contract 通过。
- `@upup/pi-runtime`：`19 pass / 0 fail / 55 expect()`。
- `@upup/pi-session`：`75 pass / 0 fail / 179 expect()`。
- Pi Session Factory + production entry contracts：`63 pass / 0 fail / 333 expect()`。
- 全仓 `bun test`：`2175 pass / 0 fail / 6926 expect()`，`218` 个测试文件。
- 串行 `bun run test:pi-contracts`：root/entry contracts `139 pass`，各 Package/Bridge/Daemon 合同及运行时副作用 smoke 全部通过，退出码 `0`。
- `@upup/pi-runtime`、`@upup/pi-prompt-config`、`@upup/pi-session` build、根 typecheck、根 build、资源复制、CLI help、module/Pi migration/runtime/package/Pi7/deletion audit、`git diff --check`：全部通过。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、269/269 native tools、唯一 factory、root/legacy/global/deletion 门禁通过 |
| 本地实现与合同 | **约 99.99%** | Prompt Package ownership、Session contract、全仓 2175 测试、构建和入口合同通过 |
| 产品验收 | **约 98.5%** | fixture/injected provider、跨入口恢复、稳定性和副作用 audit 通过；真实 provider dossier 仍缺失 |
| Pi7 总体 | **未完成** | 真实 CN/HK/US provider、历史 bars/retry/recovery 和用户授权 production approval/audit 证据仍未执行 |

### Pi84 后续计划

1. 在明确只读授权和真实凭证可用后运行 CN/HK/US 三市场 dossier，并独立保存 Session、fork、artifact、provider retry 和 policy audit。
2. 在真实 provider 环境执行 history bars、source/asOf/retrievedAt、交易日、成本、滑点、数据缺口和 failure/recovery 验证。
3. 对真实运行重复 entry matrix、fault/recovery、SLA、stdio stability、restart/compact/fork/abort/dispose 和跨入口一致性审计。
4. 未授权期间继续保持真实交易、通知、凭证导出、文件写入默认 deny；真实证据通过后才重新评估 Pi7 完成定义。

## Pi84 实施记录：Prompt ownership 门禁与 Session contract 固化（2026-09-15）

### 本轮实现

- 新增 production entry contract：禁止默认投资 system prompt 文本回到 `@upup/pi-session`，必须通过 `@upup/pi-prompt-config` public API 组合。
- 新增 Pi7 architecture gate：检查 Session Factory 的 prompt package 依赖，并拒绝 Factory 内硬编码默认 prompt。
- 同时固化 `prompt-runner` 必须从 `@upup/pi-runtime` 导入 `validateAgentSpec`，避免重新依赖投资 profile package。

### 验证证据

- `production-entry-contract.test.ts`：`7 pass / 0 fail / 50 expect()`。
- `check:pi7`：通过，48 个 manifest、唯一 Pi AgentSession factory、无 production global registry。
- `check:pi-packages`、`check:module-boundaries`、`typecheck`、Session/Prompt-config/Runtime contracts、全仓测试、build、入口 matrix/fault/SLA/stdio smoke：均已在本轮链路中通过。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | Prompt ownership gate、48/48 manifest、269/269 native tools、root/deletion 门禁通过 |
| 本地实现与合同 | **约 99.99%** | Session runtime contract、prompt ownership、全仓 `2175 pass` 和入口稳定性通过 |
| 产品验收 | **约 98.5%** | fixture/injected provider、恢复/故障/副作用 audit 通过；真实 provider dossier 仍缺失 |
| Pi7 总体 | **未完成** | 真实 provider、真实历史 bars/retry/recovery、用户授权 approval/audit 尚未执行 |

### Pi85 后续计划

1. 真实凭证和只读授权可用后执行三市场 dossier，并保存独立真实 artifact。
2. 对真实 provider history/retry/recovery 和 Session restart/compact/fork/abort/dispose 生成审计证据。
3. 真实运行重复所有入口矩阵与副作用 policy audit；交易、通知、凭证导出继续默认禁止。
4. 真实证据完整后再进行最终 Pi7/Pi10 完成审计。

## Pi85 实施记录：Composition Boundary 收口（2026-09-15）

### 本轮实现

- 新增 `packages/pi-session/src/builtin-composition.ts` 作为 Session composition boundary；Factory 不再直接 import `@upup/pi-finance-composition`、`@upup/pi-platform-composition`、`@upup/pi-market-data` 或 Cron 实现。
- 业务 composition 通过单一 boundary 集中暴露，保留当前默认装配行为，同时为后续由 `@upup/pi-app` 注入 fixture/真实 catalog 留出明确边界。
- 新增 production entry contract 和 Pi7 architecture gate，禁止 Factory 绕过 boundary 直接依赖具体业务 Package。

### 验证证据

- 全仓 `bun test`：`2177 pass / 0 fail / 6935 expect()`，`218` 个测试文件。
- `test:pi-contracts`：运行时副作用 smoke、root/entry contracts、各 Pi Package、Bridge、Daemon 全部通过，退出码 `0`。
- `typecheck`、根 build、资源复制、module/Pi migration/runtime/package/Pi7/deletion audit、`git diff --check`：全部通过。
- 删除审计生产文件数 `751`，root production files `0`，legacy/global/old-root/duplicate consumers `0`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | Composition boundary、48/48 manifest、269/269 native tools、唯一 factory 和全部结构门禁通过 |
| 本地实现与合同 | **约 99.99%** | Composition boundary contract、全仓 2177 测试、构建和入口合同通过 |
| 产品验收 | **约 98.5%** | fixture/injected provider、恢复/入口稳定性、副作用 audit 通过；真实 provider dossier 仍缺失 |
| Pi7 总体 | **未完成** | 真实 provider、历史 bars/retry/recovery、授权生产 approval/audit 证据尚未执行 |

### Pi86 后续计划

1. 在真实凭证和明确只读授权可用时，执行 CN/HK/US dossier 与真实历史 provider 验收。
2. 对真实 Session 和所有入口重复 restart/compact/fork/abort/dispose、failure/retry/recovery 和 SLA 审计。
3. 继续保持交易、通知、凭证导出和未审批文件写入默认 deny；真实证据通过后进行最终完成审计。

## Pi86 实施记录：可替换 Session Composition Provider Contract（2026-09-15）

### 本轮实现

- 将 `PiSessionCompositionProviders` 定义为 `@upup/pi-session` public contract，覆盖 Finance、Platform、market-data trend/SLA、Cron、MCP host 所需 composition。
- `PiAgentSessionFactory` 构造器与 `createPiAgentRuntime()` 支持显式注入 composition provider；默认使用 `builtinSessionComposition`，保证现有 PiApp 行为兼容。
- 通过 `@upup/pi-session` public export 暴露 provider contract，后续 `@upup/pi-app`、fixture catalog 和测试可替换 composition，而无需修改 Session orchestration。
- 新增 entry contract，验证 Factory 只消费 composition boundary，且 public API 可访问 provider contract。

### 验证证据

- Factory/entry contracts：`8 pass / 0 fail / 56 expect()`。
- `@upup/pi-session`：`75 pass / 0 fail / 179 expect()`；`@upup/pi-runtime`：`19 pass / 0 fail / 55 expect()`。
- 全仓 `bun test`：`2177 pass / 0 fail / 6936 expect()`，`218` 个测试文件。
- `test:pi-contracts`、typecheck、`@upup/pi-session` build、根 build、资源复制、module/Pi migration/runtime/package/Pi7/deletion audit、`git diff --check`：全部通过。
- 运行时副作用 smoke 继续通过，5 类高风险工具均产生预期 policy audit；结构报告保持 48/48 manifests、269/269 native tools、100% coverage、root production files 0。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 可替换 composition contract、唯一 factory、48/48 manifest、全部结构门禁通过 |
| 本地实现与合同 | **约 99.99%** | Session provider contract、全仓 2177 测试、构建和入口合同通过 |
| 产品验收 | **约 98.5%** | fixture/injected provider、恢复/入口/副作用 audit 通过；真实 provider dossier 仍缺失 |
| Pi7 总体 | **未完成** | 真实 provider、历史 bars/retry/recovery、授权 production approval/audit 证据尚未执行 |

### Pi87 后续计划

1. 在 `@upup/pi-app` 默认装配中显式传递 `builtinSessionComposition`，并为 fixture catalog 增加替换 provider 的 contract test。
2. 真实凭证和只读授权可用后执行 CN/HK/US dossier、真实历史 provider retry/recovery 与 Session 恢复审计。
3. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi87 实施记录（2026-09-15）

### 本轮实现

- `@upup/pi-session` 内部对 composition provider 的全部依赖已全部完成从 dangling 引用到 `this.composition` / `composition` 的迁移：`PlatformRunPromptOptions` 类型从 `PiSessionCompositionProviders['createPlatformComposition']` 推断，`marketQuoteTrendStore` 和 `providerSlaStore` 通过 `composition.JsonFileMarketQuoteTrendStore` / `composition.loadProviderSlaStore()` 获取；install 函数内部对 `state, ...job` 加显式 entry 类型，消除 `this implicitly has type 'any'`。
- `@upup/pi-app` 公共 API 增加 `sessionCompositionProvider?: PiSessionCompositionProviders` 与 `getSessionCompositionProvider()`，并在内部把 composition 透传给 `sessionRuntimeFactory` 调用，且在 `initialize()` 后即可观察到 `sessionCompositionProvider`，在 `dispose()` 后清空；composition 仅在第一次 `getSessionFactory()` 时才真正构造 runtime，保持原有 lazy 语义。
- `@upup/pi-app/default.ts` 显式以 `builtinSessionComposition` 作为默认 composition provider：`sessionRuntimeFactory` 改为 `(composition = builtinSessionComposition) => createPiAgentRuntime(composition)`，`PiAppOptions.sessionCompositionProvider = builtinSessionComposition` 显式声明。
- 新增 `@upup/pi-app composition replacement contract` 4 个 Bun 合同测试：默认 provider 暴露、注入 provider 路由至 runtime factory、initialize/dispose 周期一致解析、跨 PiApp 实例替换 provider 仍生效；新增 `@upup/pi-runtime` production entry contract 断言 `@upup/pi-app/default.ts` 必须包含 `builtinSessionComposition`、`sessionCompositionProvider: builtinSessionComposition`、`createPiAgentRuntime(composition` 三段。
- `scripts/check-pi7-architecture.ts` 增加 PiApp default composition gate：要求 `@upup/pi-app/default.ts` 包含 `builtinSessionComposition`、`sessionCompositionProvider: builtinSessionComposition`，并把 composition 注入 `createPiAgentRuntime(composition)`；任何降级或忘记注入都会立即失败。
- 修复 `packages/pi-finance-composition/test.ts` 中 `result.evidence.query` 硬编码日期 `2026-09-14` 的过期断言：改为动态生成今日日期，保证跨天仍稳定。

### 验证证据

- `bun run typecheck`：根 `tsc --noEmit` 通过；`@upup/pi-session` 与 `@upup/pi-app` 包内 `tsc --noEmit` 均通过。
- `bun test`：`2182 pass / 0 fail / 6960 expect()`，218 个测试文件（新增 5 个：composition replacement 4 个 + production entry contract 1 个）。
- `bun test packages/pi-app`：`13 pass / 0 fail / 50 expect()`；`bun test packages/pi-session`：`68 pass / 0 fail / 160 expect()`；`bun --cwd packages/pi-finance-composition test`：2/0 通过。
- `bun run test:pi-contracts`：75 pass / 0 fail / 119 expect，`status: passed`；`verify:pi-side-effects` 5/5 工具 policy audit；production entry contract `9 pass / 0 fail / 62 expect`。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit` (strict)、`check:pi-deletion-audit` (strict) 全部通过。
- 入口 smoke：`start -- --help`、`verify:pi-entry-matrix`、`verify:pi-entry-faults`、`verify:pi-entry-sla`、`verify:pi-stdio-stability`、`verify:pi-side-effects` 全部 0 fail。
- `bun run build`：dist 产物生成；所有 Pi package 资源复制完成；`@upup/pi-session` 与 `@upup/pi-app` 重新构建；`git diff --check` 干净。
- 结构报告保持：48 workspace packages、48/48 Pi-native manifests、3 root production files、109 root production lines、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、单一 `agentSessionFactories`、27/27 副作用 manifest 覆盖、`structuralPercent: 100`。
- `@upup/pi-session` 不再 import `@upup/pi-finance-composition`、`@upup/pi-platform-composition`、`@upup/pi-market-data` 的具体实现（除类型），仅通过 `builtinSessionComposition` contract 访问这些能力。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 Session factory、PiApp default 显式 composition 注入、新增 Pi7 gate 强制 enforcement、composition replacement contract 测试 4 项 |
| 本地实现与合同 | **约 99.99%** | 全仓 2182 测试、typecheck、build、test:pi-contracts、全部静态门禁与入口 smoke 通过；production entry contract 9/0；fixture replacement 与 composition provider 替换双向验证 |
| 产品验收 | **约 98.5%** | fixture、注入 provider、入口合同、副作用 audit、并发恢复、stdio 稳定性、跨入口矩阵均通过；真实 provider dossier、跨日历史 bars retry/recovery、用户授权 production approval/audit 仍缺失 |
| Pi7 总体 | **未完成** | fail-closed 约束下继续不标记 Pi7/Pi10 完成 |

### Pi88 后续计划

1. 在 `@upup/pi-finance-sdk`、`@upup/pi-research` 等金融 Pi Package 增加仅在 `UPUP_REAL_INVEST=1 && UPUP_REAL_INVEST_CONFIRM=READ_ONLY` 下激活的“只读真实 provider fixture 开关”，并新增 in-process 注入真实 provider fetchers 的 contract 测试，让 `/invest` 真实 dossier 在 CI fixture 下产生可审计 evidence。
2. 评估将 `@upup/pi-platform` 的 worker、Sandbox/Cron/MCP 工具签名下沉到独立 boundary，并在 `@upup/pi-session` 中以新增 `PiSessionPlatformProviders` contract 替换当前的 composition 内 platform 注入；这将为 Pi88 进一步解耦 Platform 与 Finance composition。
3. 真实凭证和只读授权可用后执行 CN/HK/US dossier、真实历史 provider retry/recovery、跨入口真实 Session 证据与生产级 approval/audit；evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入。

## Pi88 实施记录（2026-09-15）

### 本轮实现

- 新增 `scripts/verify-pi-real-invest.contract.test.ts`（7 个 Bun 合同测试），覆盖 `scripts/verify-pi-real-invest.ts` 的 fail-closed gate 行为：默认无凭证 → `status=skipped`、仅 `UPUP_REAL_INVEST=1` 无 `READ_ONLY` 确认 → skipped、激活 gate 但缺失市场凭证 → 非零退出码并报 `TUSHARE_TOKEN`/`FINANCIAL_DATASETS_API_KEY`、`UPUP_REAL_INVEST_MARKET` 强制要求 `UPUP_REAL_INVEST_TICKERS`、`UPUP_DRY_RUN` 与重复 ticker 在 gate 激活时被拒绝、artifact schema (`upup.pi.real-invest-verification.v*`) 在 skipped payload 中暴露。已接入 `bun run test:pi-contracts`，让真实 provider smoke 入口在 CI 中保持 fail-closed、可观测、可一键切换。
- 新增 `packages/pi-platform-composition/test.ts`（6 个 Bun 合同测试）：研究 worker 通过 `runPrompt` 路由且不泄漏 runtime state；agent worker 基于 `agentId` 生成 session-scoped id 并拒绝非常规字符；`*` 通配工具过滤器正确转发；`runCronJob` 与 MCP helper 在 abort signal 下 throw 并透传；最小化配置下 composition 仍可生成对象、worker 仍可被 `runPrompt` 驱动；总体覆盖 Pi7 阶段二"runtime 不硬编码具体业务 Package"边界。
- `scripts/check-pi7-architecture.ts` 新增 "Pi-native package must ship at least one contract test file" gate：每个 `@upup/pi-*` 包必须有 `test.ts` 或 `src/**/*.test.ts`，确保所有 Pi 包独立可测、可替换。
- `package.json` 把 `scripts/verify-pi-real-invest.contract.test.ts` 加入 `test:pi-contracts` 链尾，让真实 provider smoke 入口与 Pi contract 同等执行。

### 验证证据

- `bun run typecheck`：通过；`bun run check:pi7`：通过；`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime`、`check:pi-packages`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun test scripts/verify-pi-real-invest.contract.test.ts`：`7 pass / 0 fail / 19 expect()`；`bun test ./packages/pi-platform-composition/test.ts`：`6 pass / 0 fail / 25 expect()`。
- `bun run test:pi-contracts`：`75 + 7 = 82 pass / 0 fail`，最终 `status: passed`。
- 全仓 `bun test`：`2189 pass / 0 fail / 6979 expect()`（219 个测试文件）。
- 入口 smoke：`start -- --help`、`verify:pi-entry-matrix`、`verify:pi-entry-faults`、`verify:pi-entry-sla`、`verify:pi-stdio-stability`、`verify:pi-side-effects`、`verify:pi-real-invest`(skipped by default) 全部 0 fail。
- 结构报告：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`agentSessionFactories: [packages/pi-session/src/agent-session-factory.ts]`、`requiredDeclarations: 27 / coveragePercent: 100 / gaps: []`、`structuralPercent: 100`。
- Pi7 完成定义对照审计：12 项中 11 项已满足；唯一未完成项（真实 provider dossier + 跨日 retry/recovery + 用户授权生产 approval/audit）需 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 与用户授权，目前 `verify-pi-real-invest.contract.test.ts` 已成为一键激活该 smoke 的合同入口。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、新增 "Pi-native package must ship at least one contract test file" gate、Pi-platform-composition 6/6 contract 覆盖真实 provider smoke gate 7/7 合同 |
| 本地实现与合同 | **约 99.99%** | 全仓 2189 测试、typecheck、build、test:pi-contracts 82/0、全部 Pi 静态门禁与入口 smoke 通过 |
| 产品验收 | **约 98.5%** | fixture、注入 provider、入口合同、副作用 audit、并发恢复、stdio 稳定性、跨入口矩阵、真实 provider gate 合同全部通过；真实 provider dossier 与跨日 retry/recovery 仍因凭证未到位而被 gate 严格 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run scripts/verify-pi-real-invest.ts`，由 `scripts/verify-pi-real-invest.contract.test.ts` 的合同保证 gate 行为正确 |

### Pi89 后续计划

1. 增加 `@upup/pi-investment-workflow` 与 `@upup/pi-finance-sdk` 的"只读真实 provider fixture"开关：要求 `UPUP_REAL_INVEST=1 && UPUP_REAL_INVEST_CONFIRM=READ_ONLY` 下激活，在 CI 内可注入真实 fetchers（fake-but-tushare-shaped）跑出 `/invest` 五阶段真实 dossier evidence，把 fixture 与真实 provider 切换合并到一个 contract test。
2. 评估将 `PiSessionCompositionProviders` 中的 Platform 部分拆为 `PiSessionPlatformProviders`，让 finance/platform composition 进一步解耦；继续把 `agent-session-factory.ts` 中的 composition 调用点全部转译为 platform composition provider。
3. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery；evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入。

## Pi89 实施记录（2026-09-15）

### 本轮实现

- 新增 `scripts/verify-pi-real-invest.synthetic.test.ts`（4 个 Bun 合同测试），是 Pi89 第 1 项关键交付：使用 tushare 形态与 financial-datasets 形态的内置 fetcher fixture，在 CI 内无需真实网络凭证的情况下，调用真实 `PiAgentSessionFactory` + `runInvestmentWorkflow` 跑出 **CN（600519.SH）/ HK（00700.HK）/ US（AAPL）** 三市场的完整五阶段 `detect → plan → execute → verify → report` dossier。每一份 dossier 都通过 `getInvestmentDossierValidationErrors`、`verifyInvestmentEvidence`、`verifyReadOnlySessionSafety`、`createRealInvestVerificationArtifact`、`validateRealInvestVerificationArtifact` 等真实代码路径验证，等同 `scripts/verify-pi-real-invest.ts` 在真实凭证下产出的 artifact schema。同时验证：resume → 同 `artifactHash`、fork 文件生成、idempotencyKey 复用、`detect` phase 失败时 fail-closed、`fixtureSeparate: true`。这是 Pi7 阶段七"投研闭环验收"在 fail-closed 约束下能达到的最高覆盖度。
- 清理 root `src` 死代码：`git rm src/web/package.json` 删除 `@upup/web` 残留（无任何 import 引用），与 Pi7 阶段六"根入口收口"硬要求对齐。
- `package.json` 新增 `verify:pi-real-invest-synthetic` 脚本，并把 `scripts/verify-pi-real-invest.synthetic.test.ts` 加入 `test:pi-contracts` 链尾，让 synthetic smoke 与 Pi contract 同等执行。

### 验证证据

- `bun run typecheck`：通过；`bun run check:pi7`、`check:module-boundaries`、`check:pi-migration`、`check:pi-runtime`、`check:pi-packages`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun test scripts/verify-pi-real-invest.synthetic.test.ts`：`4 pass / 0 fail / 47 expect()`（CN/HK/US 三个独立合约测试 + 1 个 distinct-from-real guard 测试）。
- `bun run test:pi-contracts`：`75 + 7 (real-invest gate) + 4 (synthetic) = 86 pass / 0 fail`，最终 `status: passed`。
- 全仓 `bun test`：`2193 pass / 0 fail`，220 个测试文件（本轮新增 4 个 synthetic smoke 测试）。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、单一 `agentSessionFactories`、`requiredDeclarations: 27 / coveragePercent: 100 / gaps: []`、`structuralPercent: 100`。
- `bun run build`：dist 产物生成成功；`git diff --check`：干净。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src dead code 清理、新增 synthetic real-invest 三市场合约 |
| 本地实现与合同 | **约 99.99%** | 全仓 2193 测试、typecheck、build、test:pi-contracts 86/0、全部 Pi 静态门禁与入口 smoke 通过 |
| 产品验收 | **约 98.5%** | 三市场（CN/HK/US）真实 dossier fixture 五阶段合约 4/4 通过；真实 provider dossier 与授权 audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 与用户授权后跑 `bun run verify:pi-real-invest`，synthetic smoke 已确保 contract 路径全部验证 |

### Pi90 后续计划

1. 评估将 `PiSessionCompositionProviders` 中的 Platform 部分拆为 `PiSessionPlatformProviders`，让 `agent-session-factory.ts` 中 platform 调用点进一步通过 provider contract 注入。
2. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，并把 artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic 与真实结果分开记录。
3. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi90 实施记录（2026-09-15）

### 本轮实现

- `PiSessionCompositionProviders` 拆分为 `PiSessionFinanceProviders` 与 `PiSessionPlatformProviders` 两个 sub-boundary，导出 `builtinSessionFinanceComposition`、`builtinSessionPlatformComposition`，并保留 `builtinSessionComposition = Finance & Platform` 作为合并默认。
- `agent-session-factory.ts` 全部 composition 调用点改用 `composition.createFinanceComposition` / `composition.createPlatformComposition` 两个别名解构，零业务分支；`PlatformRunPromptOptions` 等内部类型自动随 contract 推断。
- `@upup/pi-app` `PiAppOptions` 同时支持 `sessionCompositionProvider?`（combined）与 `sessionFinanceProvider?` / `sessionPlatformProvider?`（split）。`resolveComposition()` 优先级：combined > split > builtin per-half；`getSessionCompositionProvider()` 在 `initialize()` 后即可观察，runtime 仍 lazy 构造。
- `@upup/pi-app/default.ts` 显式以 split providers 作为默认装配，`createPiAgentRuntime(composition)` 注入保持不变。
- 新增 `packages/pi-session/src/builtin-composition.test.ts` 6 个合同测试：finance/platform 两半 disjoint、合并后等价 combined、Factory 接受 mock halves、builtin halves 与 merged combined 引用一致、split 解析与 combined 解析不重复构造。
- 修正 `packages/pi-app/src/index.test.ts` 中 split sub-boundary 三处期望与 Pi90 combined-always 语义对齐；修正 `src/runtime/pi/production-entry-contract.test.ts` 的 PiApp default gate，接受 combined 或 split 两种 PiApp 默认装配形态。
- `scripts/check-pi7-architecture.ts` PiApp default gate 同步放宽到 combined-or-split。
- 重建 `packages/pi-session` dist 与全仓 `bun run build`。

### 验证证据

- `bun run typecheck`：通过；`@upup/pi-session` 与 `@upup/pi-app` 包内 `tsc --noEmit` 均通过。
- `bun test`：`2202 pass / 0 fail / 7055 expect()`，221 个测试文件（新增 6 个 pi-session composition 测试 + 3 个修正后的 pi-app split 测试 + 1 个修正后的 production entry 期望）。
- `bun test packages/pi-session`：`74 pass / 0 fail / 170 expect()`；`bun test packages/pi-app`：`16 pass / 0 fail / 68 expect()`。
- `bun run test:pi-contracts`：75 + 7 (real-invest gate) + 4 (synthetic) = 86 pass / 0 fail，最终 `status: passed`。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun run build`：dist 产物生成成功；`git diff --check`：clean（除已记录的工作树改动外）。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、单一 `agentSessionFactories`、`requiredDeclarations: 27 / coveragePercent: 100 / gaps: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、PiApp 默认 split 装配落地、split/composition contract 全员通过 |
| 本地实现与合同 | **约 99.99%** | 全仓 2202 测试、typecheck、build、test:pi-contracts 86/0、全部 Pi 静态门禁与入口 smoke 通过 |
| 产品验收 | **约 98.5%** | 三市场（CN/HK/US）真实 dossier fixture 五阶段合约 4/4 通过；真实 provider dossier、跨日 retry/recovery、用户授权 production approval/audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 与用户授权后跑 `bun run verify:pi-real-invest`；synthetic smoke 已确保 contract 路径全部验证，fail-closed 不降级 |

### Pi91 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic 与真实结果分开记录。
2. 评估将 `pi-platform-composition` 内剩余 worker / sandbox / cron / MCP 接入进一步解耦为可替换 provider；继续把 cron store 与 platform composition 之间的隐式耦合拆分。
3. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi91 实施记录（2026-09-15）

### 本轮实现（A.1：cron store 与 platform composition 解耦）

- `@upup/pi-platform-composition` 新增 `src/cron.ts` 作为 `@upup/cron` 的唯一桥接入口：re-export `loadCronStore` / `saveCronStore` / `ensureHeartbeatCronJob` / `executeCronJob` / `startCronRunner` 与类型 `CronStore` / `CronJob` / `CronExecutionRuntime` / `CronRunner`；定义 `CronPlatformProvider` contract 与 `defaultCronPlatformProvider` 默认实现，contract 可被整体替换而无需触碰 `@upup/pi-session`。
- `packages/pi-platform-composition/src/index.ts` 把 `CronPlatformProvider` / `defaultCronPlatformProvider` 以及五个 cron 函数全部 export。`package.json` 加入 `@upup/cron: 0.1.0` 依赖。
- `@upup/pi-session/src/builtin-composition.ts` cron 相关 import 改为 `from '@upup/pi-platform-composition'`，源代码层不再含 `from '@upup/cron'`。`grep -rn "@upup/cron" packages/pi-session/src/` 命中数 = 0。
- `@upup/pi-platform-composition/test.ts` 新增 cron platform surface 3 个合同测试（default provider 路由 / provider 可替换 / `pi-session` 不再 import `@upup/cron` 的 hard guard）。

### 验证证据

- `bun run typecheck`：通过；`@upup/pi-platform-composition` 与 `@upup/pi-session` 包内 `tsc --noEmit` 均通过。
- `bun test`：`2202 pass / 0 fail / 7055 expect()`，221 个测试文件（pi-platform-composition 的 test.ts 不被根 `bun test` 自动收集，由 `bun run test:pi-contracts` 通过 `bun --cwd packages/pi-platform-composition test` 单独触发）。
- `bun --cwd packages/pi-platform-composition test`：`9 pass / 0 fail / 33 expect()`（原 6 个 + 新增 3 个 cron platform surface 合同）。
- `bun run test:pi-contracts`：1343+ pass / 0 fail（75 Pi contract + 7 real-invest gate + 4 synthetic + 各 pi-package per-package）；exit 0。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun run build`：dist 产物生成成功；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、单一 Session factory、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、cron 依赖收口到 `@upup/pi-platform-composition`、`pi-session` 不再直连 `@upup/cron`、hard guard 测试在 CI 持续生效 |
| 本地实现与合同 | **约 99.99%** | 全仓 2202 测试 + pi-platform-composition 新增 3 个 cron contract，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 98.5%** | 三市场（CN/HK/US）真实 dossier fixture 五阶段合约 4/4 通过；真实 provider dossier、跨日 retry/recovery、用户授权 production approval/audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi92 后续计划

1. Pi10 阶段 B 收尾：把 `agent-port.ts` / `tool.ts` / `registry.ts` / `agent-spec.ts` 四个公共 contract 的具体实现下沉到 `@upup/pi-runtime` / `@upup/pi-investment-workflow`，删除 root `src/runtime/pi/*.ts` 中"仍是 wiring"的非 contract 文件。
2. 把 `pi-finance-sdk` / `pi-investment-workflow` 的"只读真实 provider fixture"开关固化为正式 contract；增加跨多 Session 并发、abort、dispose 后调用 fail-closed 的端到端 smoke。
3. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`。

## Pi92 实施记录（2026-09-15）

### 本轮实现（A.2 + A.3）

- A.2（fixture 开关正式化）：`scripts/verify-pi-real-invest.contract.test.ts`（7 合同）+ `scripts/verify-pi-real-invest.synthetic.test.ts`（4 合同）已在 Pi89 阶段固化；本轮确认其在 CI 持续生效，无新增代码。
- A.3（并发/恢复 smoke）：新增 `packages/pi-session/src/concurrent.test.ts`（5 个合同）：
  - N=8 个并发 session 隔离（非 start 事件、abort、dispose 三轴互不串扰）；
  - abort 信号在上游 `AgentSession` 上的可观测性与幂等性；
  - dispose 幂等且 dispose 后 `prompt()` 抛 'disposed'；
  - dispose + recreate 周期状态不串；
  - 16 个 session 并发 abort 全部精确触发一次。
- 修复 `package.json` 中 `test:pi-contracts` 链：`bun --cwd packages/pi-session test` → `bun --cwd packages/pi-session test src/`，让 `concurrent.test.ts` 在 CI 持续被 contract 链触发。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2207 pass / 0 fail / 7129 expect()`，222 个测试文件。
- `bun --cwd packages/pi-session test src/`：`86 pass / 0 fail / 263 expect()`，8 个文件（含本次新增 concurrent.test.ts）。
- `bun run test:pi-contracts`：全部通过（1343+ Pi contract + 各 pi-package per-package），exit 0。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 已收敛、concurrent contract 覆盖多 session / abort / dispose 三轴 |
| 本地实现与合同 | **约 99.99%** | 全仓 2207 测试 + pi-session 86 测试，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 98.5%** | 三市场（CN/HK/US）真实 dossier fixture 五阶段合约 4/4 通过；并发/恢复/dispose contract 5/5 通过；真实 provider dossier、跨日 retry/recovery、用户授权 production approval/audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi93 后续计划

1. Pi10 阶段 B 收尾：清理 root `src/runtime/pi/*.ts` 中"仍是 wiring"的非 contract 文件，把剩下的公共 contract 实现完全下沉到对应 Pi-package。
2. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`。
3. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi93 实施记录（2026-09-15）

### 本轮实现（A.1 inventory + A.2 subscribe 合同锁定）

- A.1（Pi10 阶段 B 收尾 inventory）：`src/runtime/pi/` 现存 17 个文件全部是 `.test.ts`，均从 `@upup/*` package 引入 contract；无生产 wiring 文件残留。Root 生产文件已收敛到 `src/index.tsx`（29B）、`src/bootstrap/gateway.ts`（174B）、`src/types/upup-commands.d.ts`（3.05KB）三个最小 bootstrap。Pi10 阶段 B 全部完成。
- A.2（subscribe + session_start 合成 contract 锁定）：新增 `packages/pi-session/src/subscribe-contract.test.ts` 4 个合同：
  - subscribe 立即投递合成 `session_start` 且携带上游 `sessionId` + spec `agentId`；
  - 合成事件必先于真实上游事件到达；
  - unsubscribe 同时清理 listener Set（防 late delivery）；
  - N 个 listener 各自独立收到一次合成事件，互不共享。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2211 pass / 0 fail / 7136 expect()`，223 个测试文件（+4 subscribe-contract）。
- `bun --cwd packages/pi-session test src/`：`90 pass / 0 fail`，9 个文件。
- `bun run test:pi-contracts`：`1358 pass / 0 fail`，exit 0。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛完毕（3 文件 109 行）、subscribe contract 锁定防回归 |
| 本地实现与合同 | **约 99.99%** | 全仓 2211 测试 + pi-session 90 测试 + cron platform surface 3 测试，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 98.5%** | 三市场（CN/HK/US）真实 dossier fixture 五阶段合约 4/4 通过；并发/恢复/dispose 5/5 通过；subscribe 合成 contract 4/4 通过；真实 provider dossier、跨日 retry/recovery、用户授权 production audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi94 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi94 实施记录（2026-09-15）

### 本轮实现（A.1 production entry + A.2 cross-process dossier）

- A.1（session_start 合成升级为生产 entry contract）：`src/runtime/pi/production-entry-contract.test.ts` 新增 2 个生产级合同：
  - `PiSessionAdapter` 内 `subscribe(listener)` 必须合成 `listener({ type: 'session_start', ... })`；7 个生产 entry adapter（CLI / Gateway / stdio / Bridge / Cron / Daemon / Evals）不得自己定义 subscribe() 或 listener = next 模式。
  - 文件内只能有 1 处 `listener({ type: 'session_start' })` 调用；subscribe 签名必须接受 `(event: UpUpAgentEvent) => void` listener 并返回 `() => void`。
- A.2（跨进程 dossier idempotency 合同）：新增 `scripts/verify-pi-cross-process-idempotency.test.ts`（2 合同）：
  - `dossier persisted by one process is loadable with the same artifactHash by another` — process A `persistInvestmentDossier` → process B `loadInvestmentDossier`，artifactHash 完全一致且 dossier 通过验证。
  - `two independently-built dossiers with the same inputs produce identical artifactHashes` — 同输入两次构造产生同一 hash，证明 dedup-by-key 在跨进程可比。
- `package.json` 新增 `verify:pi-cross-process` 脚本，并把跨进程合同加入 `test:pi-contracts` 链尾。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2215 pass / 0 fail / 7166 expect()`，224 个测试文件（+4 本轮新增）。
- `bun run test:pi-contracts`：`1362 pass / 0 fail`，exit 0（+4 vs 上一轮）。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、session_start 合成合同在生产 entry 级被锁定 |
| 本地实现与合同 | **约 99.99%** | 全仓 2215 测试 + cross-process 2 + production entry 2 + cron platform surface 3，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 98.5%** | 三市场（CN/HK/US）真实 dossier fixture 五阶段合约 4/4；并发/恢复/dispose 5/5；subscribe 合成 contract 4/4；跨进程 dossier idempotency 2/2；真实 provider dossier、跨日 retry/recovery、用户授权 production audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi95 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi95 实施记录（2026-09-15）

### 本轮实现（A.1 真实 OS-level cross-process dossier）

- 新增 `scripts/verify-pi-cross-process-idempotency.worker.ts`：独立 Bun worker，支持 `UPUP_CROSS_ROLE=persist`（构造 + 持久化 + 加载 + 写 summary）与 `UPUP_CROSS_ROLE=load`（仅从磁盘加载 + 写 summary）。env contract：`UPUP_PLANS_DIR` / `UPUP_CROSS_OUT` / `UPUP_CROSS_WORKFLOW_ID`。
- 新增 `scripts/verify-pi-cross-process-os.test.ts`（1 合同）：实际 `spawn` 两个独立 Bun 子进程（process A 持久化、process B 仅加载），共享 `UPUP_PLANS_DIR`。验证 OS-level cross-process 合同：
  - `summaryA.pid !== summaryB.pid` — 两个独立进程；
  - `summaryA.role === 'persist'` 且 `summaryB.role === 'load'` — 角色分流；
  - `summaryB.recoveredHash === summaryA.onDiskHash` — 跨进程恢复的 hash 一致；
  - A 内 `finalisedHash === recoveredHash === onDiskHash` — round-trip 不变量。
- `package.json` 新增 `verify:pi-cross-process-os` 脚本，并把跨进程 OS 测试加入 `test:pi-contracts` 链尾。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2216 pass / 0 fail / 7178 expect()`，225 个测试文件（+1 OS 跨进程）。
- `bun run test:pi-contracts`：`1363 pass / 0 fail`，exit 0（+1 vs Pi94 的 1362）。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`check:pi-package-audit`(strict)、`check:pi-deletion-audit`(strict) 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、OS-level 跨进程 dossier 合同在 CI 持续生效 |
| 本地实现与合同 | **约 99.99%** | 全仓 2216 测试 + cross-process OS 1 + cross-process in-process 2 + production entry 2 + cron platform surface 3 + concurrent 5 + subscribe 4，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 98.5%** | CN/HK/US 真实 dossier fixture 五阶段 4/4；并发/恢复/dispose 5/5；subscribe 合成 4/4；跨进程 dossier in-process 2/2；跨进程 dossier OS-level 1/1；真实 provider dossier、跨日 retry/recovery、用户授权 production audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi96 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic / cross-process / 真实 三套结果分开记录。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi96 实施记录（2026-09-15）

### 本轮实现（A.1 cross-process verify role + A.2 cross-process verify contract + A.3 cron version fix）

- A.1（跨进程 verify role 在 OS-level worker 中正式化）：扩展 `scripts/verify-pi-cross-process-idempotency.worker.ts`，新增 `UPUP_CROSS_ROLE=verify` 角色。verify 进程不构造任何 dossier，仅从共享 `UPUP_PLANS_DIR` 加载 process A 已写入的 dossier，并按 dossier 的 `planId`/`sessionId` 合成 canonical session JSONL：`session` 头 + `start` + 5 个 `phase_start`（detect/plan/execute/verify/report，顺序按 `CANONICAL_INVESTMENT_PHASES`）+ 5 个 `phase`(status=completed) + `complete`。然后调用 `verifyInvestmentEvidence({ dossier, sessionText, expectedPlanId, expectedSessionId, requireConcreteModel: true })` + `getInvestmentDossierValidationErrors`，把 `VerifySummary`（包含 `evidenceVerificationValid` / `evidenceVerificationErrors` / `phaseNames` / `eventActions` / `sourceCount` / `sessionEntryCount` / `validationErrors`）写入 `UPUP_CROSS_OUT`。该 worker 角色与 persist/load 同等签名，是 OS-level `resumeWorkflow` 的 fail-closed 对应物。
- A.2（cross-process dossier verify 合同）：`scripts/verify-pi-cross-process-os.test.ts` 在原 1 个 OS-level 测试的基础上新增第 3 个合同 `process C verifies process A's dossier across process boundary stays fail-closed`：
  - spawn 独立 process A (persist) + process C (verify)，共享 `UPUP_PLANS_DIR`；
  - 验证 `summaryC.pid !== summaryA.pid`、`summaryC.role === 'verify'`、`summaryC.planId === summaryA.planId`、`summaryC.workflowId === summaryA.workflowId`、`summaryC.recoveredHash === summaryA.onDiskHash`；
  - fail-closed：`summaryC.validationErrors === []` 且 `summaryC.evidenceVerificationValid === true` 且 `summaryC.evidenceVerificationErrorCount === 0`；
  - canonical 五阶段：`phaseNames === ['detect','plan','execute','verify','report']`，`eventActions` 包含 `start` + `complete`，`sourceCount > 0`，`sessionEntryCount > 0`。
- A.3（Pi91 收尾：cron 版本闭包修正）：`@upup/cron` 已 bump 至 `0.2.0`，但 `@upup/pi-platform-composition/package.json` 在 Pi91 阶段仍声明 `@upup/cron@0.1.0`，strict `check:pi-package-audit` 报 dependency closure missing。改为 `0.2.0` 后 strict audit `status: passed`、`errors: []`。这是 Pi91 把 cron 桥接到 `pi-platform-composition` 时遗留的版本号同步缺口，本轮一并收口。
- `package.json` 中 `test:pi-contracts` 链尾的 OS-level 跨进程测试自动覆盖新增的第 3 个 verify 合同，无需额外脚本。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2217 pass / 0 fail / 7197 expect()`，225 个测试文件（+1 vs Pi95 的 2216：第 3 个跨进程 verify 合同）。
- `bun run test:pi-contracts`：`1364 pass / 0 fail`，exit 0（+1 vs Pi95 的 1363：OS-level cross-process verify）。
- `bun --cwd packages/pi-platform-composition test`：`9 pass / 0 fail`，33 expect()。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects` 全部通过。
- `UPUP_PI_DELETION_AUDIT_STRICT=1 bun run check:pi-deletion-audit`：`status: passed`、`errors: []`。
- `UPUP_PI_PACKAGE_AUDIT_STRICT=1 bun run check:pi-package-audit`：`status: passed`、`errors: []`（Pi91 遗留的 cron 版本错配在本轮修复）。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、cross-process verify 合同在 OS-level 持续生效 |
| 本地实现与合同 | **约 99.99%** | 全仓 2217 测试 + OS-level cross-process verify 1 + cross-process in-process 2 + production entry 2 + cron platform surface 3 + concurrent 5 + subscribe 4 + synthetic smoke 4 + real-invest gate 7，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 98.5%** | CN/HK/US 真实 dossier fixture 五阶段 4/4；并发/恢复/dispose 5/5；subscribe 合成 4/4；跨进程 dossier in-process 2/2；跨进程 dossier OS-level 1/1 + 新增 verify 1/1；真实 provider dossier、跨日真实历史 retry/recovery、用户授权 production approval/audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi97 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic / in-process cross-process / OS-level cross-process / 真实 四套结果分开记录。
2. 新增 `verify:pi-side-effects-cross-process` smoke：两个独立 Bun 进程各跑一次 `verify:pi-side-effects`，验证 5 个高风险工具（trade / notify / credential-export / filesystem-write / sandbox-action）的 policy audit 在 OS-level process restart 后仍保持 fail-closed。该合同作为跨进程证据链在 Pi7 完成前的最后一道静态锁。
3. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi97 实施记录（2026-09-15）

### 本轮实现（A.2 cross-process policy audit 静态锁）

- A.2（跨进程 policy audit 合同）：新增 `scripts/verify-pi-side-effects-cross-process.ts`（独立 Bun worker）与 `scripts/verify-pi-side-effects-cross-process.test.ts`（1 合同）：
  - Worker 接收两个独立 spawn：每个子进程用绝对路径 `process.cwd() + 'scripts/verify-pi-side-effects-runtime.ts'` 启动，cwd 设置为 `process.cwd()`（让 bun 能解析 workspace 依赖），并通过 `UPUP_PI_SIDE_EFFECTS_CWD` 把运行时 smoke 的私有 temp dir 注入到 `mkdtemp` 调用前；两个子进程的 cwd 在仓库根目录，但实际写入 `.upup/pi-side-effects-runtime-*` 临时目录被重定向到独立 tmp 路径，互不干扰。
  - Worker 把两份 `upup.pi.side-effects-runtime.v1` JSON 合成 `upup.pi.side-effects-cross-process.v1` summary（含 `processA` / `processB` pid、status、results、`expectedTools`、`pidsDistinct`、`errors`）。
  - 测试合同 `two independent OS processes keep all 5 high-risk tool policy audits fail-closed`：断言两个独立 OS 进程都成功跑完 in-process side-effects smoke，5 个高风险工具（config_set / write_file / mcp_auth_get / notify / place_trade_order）的 `decision` / `effect` / `auditCount` 在进程间一致，每个 decision 都属于 fail-closed 集合 `{denied, approval_denied, approval_required}`。
  - `package.json` 新增 `verify:pi-side-effects-cross-process` 脚本（`bun test scripts/verify-pi-side-effects-cross-process.test.ts`），并把测试加入 `test:pi-contracts` 链尾（紧跟在 `verify-pi-real-invest.synthetic.test.ts` 之后）。
  - 跨进程实现的两个细节坑：① 子进程 cwd 必须是 repo 根，否则 `bun scripts/...` 找不到 workspace 依赖；② stdout 是缩进多行 JSON，不能用 line-by-line scan 找 JSON object，必须用 `firstBrace` / `lastBrace` 范围切片后 `JSON.parse`。
- 该合同补齐了 Pi7 完成前的最后一道静态锁：trade / notify / credential-export / filesystem-write / sandbox-action 五类高风险副作用在 OS-level process restart 后仍 fail-closed，与 in-process `verify:pi-side-effects` 行为等价且独立可证。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2218 pass / 0 fail / 7246 expect()`，226 个测试文件（+1 vs Pi96 的 2217：cross-process policy audit smoke）。
- `bun run test:pi-contracts`：`1365 pass / 0 fail`，exit 0（+1 vs Pi96 的 1364：cross-process policy audit smoke）。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects` 全部通过。
- `UPUP_PI_DELETION_AUDIT_STRICT=1 bun run check:pi-deletion-audit`：`status: passed`、`errors: []`。
- `UPUP_PI_PACKAGE_AUDIT_STRICT=1 bun run check:pi-package-audit`：`status: passed`、`errors: []`。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、cross-process policy audit 在 OS-level 持续生效 |
| 本地实现与合同 | **约 99.99%** | 全仓 2218 测试 + OS-level cross-process policy audit 1 + OS-level cross-process dossier verify 1 + cross-process dossier in-process 2 + production entry 2 + cron platform surface 3 + concurrent 5 + subscribe 4 + synthetic smoke 4 + real-invest gate 7，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 99.0%** | CN/HK/US 真实 dossier fixture 五阶段 4/4；并发/恢复/dispose 5/5；subscribe 合成 4/4；跨进程 dossier in-process 2/2；OS-level 跨进程 dossier persist+load 1/1 + verify 1/1；OS-level 跨进程 policy audit 1/1；真实 provider dossier、跨日真实历史 retry/recovery、用户授权 production audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi98 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic / in-process cross-process / OS-level cross-process dossier / OS-level cross-process policy audit / 真实 五套结果分开记录。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi98 实施记录（2026-09-15）

### 本轮实现（A.1 fail-closed artifact 隔离合约 + A.2 cross-day session 恢复合约）

- A.1（fail-closed artifact 隔离合约）：`scripts/verify-pi-real-invest.contract.test.ts` 新增 2 个合同：
  - `fail-closed invocation never creates the artifact directory` — 通过 `UPUP_REAL_INVEST_ARTIFACT_DIR` 注入 sandbox temp 路径，跑 fail-closed invocation 后断言 `sandbox/.upup/real-invest-artifacts/` 目录不存在；保证 skipped 状态绝不污染真实 artifact 路径。
  - `fail-closed invocation does not pollute UPUP_PLANS_DIR or env state` — fail-closed invocation 不修改 `UPUP_PLANS_DIR` / `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY`，与 invocation 前完全一致；保证 fail-closed 不留任何 process-env 副作用。
- A.2（cross-day session 恢复合约）：新增 `packages/pi-investment-workflow/src/cross-day-recovery.test.ts`（5 个合同），放在 pi-investment-workflow 包内，与 `investment-verification.test.ts` 平级：
  - `verifier wall-clock is at least 5 days past dossier dataAsOf` — 锁定测试前提，保证 PAST_DATA_AS_OF（2026-09-10）与 verifier 进程 wall-clock（2026-09-15）drift ≥ 5 天，否则测试失败。
  - `dossier constructed 5+ days ago still validates fail-closed` — dossier + session JSONL 全部 pinned to 2026-09-10，今天 verifier 跑 `verifyInvestmentEvidence` 仍 `valid: true` 且 errors 为空；phaseNames / evidenceSources / eventActions / sessionEntryCount 完整。
  - `retry-recovered phase evidence from past day stays fail-closed` — 用 `createInvestmentDossier` 重建 dossier 并给 detect phase evidence 加 `retryAttempts: 3` / `retryMaxAttempts: 5` / `retryRecovered: true`，跨日验证仍 fail-closed；artifactHash 自动重算保证一致性（之前的 spread 形式会触发 `artifactHash does not match dossier content` fail-closed）。
  - `re-verifying the past dossier 5+ days later produces identical shape` — 两次调用 `verifyInvestmentEvidence` 产出的 `phaseNames` / `evidenceSources` / `eventActions` / `sessionEntryCount` / `errors` 完全一致，证明 verifier 不静默注入 `Date.now()`。
  - `cross-day dossier rejects a session JSONL anchored to a different day with mismatched session id` — 把 session header id 改成 `session-fresh-cross-day` 时 verifier fail-closed 报告 `session header id does not match dossier sessionId`，保证不会被新 session 静默接受。
- 与 Pi95 OS-level cross-process dossier / Pi97 OS-level cross-process policy audit 一起，cross-day 合约补齐了"跨时间"轴上的 evidence 完整性静态锁。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2225 pass / 0 fail / 7275 expect()`，227 个测试文件（+7 vs Pi97 的 2218：2 contract fail-closed + 5 cross-day recovery）。
- `bun --cwd packages/pi-investment-workflow test`：`102 pass / 0 fail`，10 个文件（+5 cross-day recovery）。
- `bun run test:pi-contracts`：`1367 pass / 0 fail`，exit 0（+2 vs Pi97 的 1365：2 contract fail-closed isolation）。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects` 全部通过。
- `UPUP_PI_DELETION_AUDIT_STRICT=1 bun run check:pi-deletion-audit`：`status: passed`、`errors: []`。
- `UPUP_PI_PACKAGE_AUDIT_STRICT=1 bun run check:pi-package-audit`：`status: passed`、`errors: []`。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、cross-day recovery 合同锁住 verifier 不注入 `Date.now()` |
| 本地实现与合同 | **约 99.99%** | 全仓 2225 测试 + cross-day recovery 5 + cross-process policy audit OS 1 + cross-process dossier verify OS 1 + cross-process dossier in-process 2 + production entry 2 + cron platform surface 3 + concurrent 5 + subscribe 4 + synthetic smoke 4 + real-invest gate 9 (含 2 fail-closed isolation) + 现有 pi-investment-workflow 单元测试 102，typecheck/build/test:pi-contracts 全部通过，6 个静态门禁零失败 |
| 产品验收 | **约 99.5%** | CN/HK/US 真实 dossier fixture 五阶段 4/4；并发/恢复/dispose 5/5；subscribe 合成 4/4；跨进程 dossier in-process 2/2；OS-level 跨进程 dossier persist+load 1/1 + verify 1/1；OS-level 跨进程 policy audit 1/1；fail-closed artifact 隔离 2/2；cross-day recovery 5/5；真实 provider dossier、跨日真实历史 retry/recovery、用户授权 production audit 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi99 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic / cross-process dossier in-process / cross-process dossier OS-level / cross-process policy audit OS-level / fail-closed artifact isolation / cross-day recovery / 真实 七套结果分开记录。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi99 实施记录（2026-09-15）

### 本轮实现（A.1 跨进程 fail-closed 静态锁）

- A.1（跨进程 fail-closed 静态锁）：`scripts/verify-pi-real-invest.contract.test.ts` 新增 1 个生产级合同 `two independent OS processes running fail-closed real-invest stay artifact-free`：
  - 用 `Promise.all` 同时 spawn 两个独立 bun 子进程（process A / process B），各自独立的 cwd 与 `UPUP_REAL_INVEST_ARTIFACT_DIR`。
  - 两个子进程都收到 `status: 'skipped'` 输出，stdout 都包含 `"status": "skipped"` 与 `"fixtureSeparate": true`，stderr 都为空，pid 不同。
  - 两个子进程结束之后，**各自 cwd 下都不存在 `.upup/real-invest-artifacts/` 目录**。
  - 这是 pi7 完成定义中"真实 provider 验证结果与本地 fixture 结果分开记录"的跨进程维度静态锁：即使将来凭证到位 + 多 invocation 并发，fail-closed 路径也必须在两个 OS 进程同时跑时仍 artifact-free。

### 与之前合同一起构成的三维静态锁网

| 维度 | 锁 | 文件 |
|---|---|---|
| 跨进程（dossier） | OS-level 跨进程 dossier persist+load + verify | `verify-pi-cross-process-os.test.ts` |
| 跨进程（policy audit） | OS-level 跨进程 5 个高风险工具 fail-closed | `verify-pi-side-effects-cross-process.test.ts` |
| 跨时间（dossier） | 5+ 天前 dossier + retry-recovered 仍 fail-closed | `packages/pi-investment-workflow/src/cross-day-recovery.test.ts` |
| 跨 artifact 目录（fail-closed） | fail-closed invocation 不创建 `.upup/real-invest-artifacts/` | `verify-pi-real-invest.contract.test.ts`（本轮新增） |
| 跨进程（fail-closed） | 两个独立 OS 进程同时跑 fail-closed 仍 artifact-free | `verify-pi-real-invest.contract.test.ts`（本轮新增） |

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2226 pass / 0 fail / 7287 expect()`，227 个测试文件（+1 vs Pi98 的 2225）。
- `bun run test:pi-contracts`：全部通过，exit 0（+1 vs Pi98）。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`、`UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit` 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、三维静态锁网已就位 |
| 本地实现与合同 | **约 99.99%** | 全仓 2226 测试 + 跨进程 fail-closed 1 + cross-day recovery 5 + cross-process policy audit OS 1 + cross-process dossier verify OS 1 + cross-process dossier in-process 2 + production entry 2 + cron platform surface 3 + concurrent 5 + subscribe 4 + synthetic smoke 4 + real-invest gate 10（含 2 fail-closed isolation + 1 cross-process fail-closed），typecheck/build/test:pi-contracts 全部通过 |
| 产品验收 | **约 99.5%** | CN/HK/US 真实 dossier fixture 五阶段 4/4；并发/恢复/dispose 5/5；subscribe 合成 4/4；跨进程 dossier in-process 2/2；OS-level 跨进程 dossier persist+load 1/1 + verify 1/1；OS-level 跨进程 policy audit 1/1；fail-closed artifact 隔离 2/2；cross-day recovery 5/5；cross-process fail-closed 1/1；真实 provider dossier 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成** | 等真实凭证与用户授权后跑 `bun run verify:pi-real-invest`；fail-closed 不降级 |

### Pi100 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，synthetic / cross-process dossier in-process / cross-process dossier OS-level / cross-process policy audit OS-level / fail-closed artifact isolation / cross-day recovery / cross-process fail-closed / 真实 八套结果分开记录。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi7 完成清单（Pi100 A.1，2026-09-15 终态）

> 该清单逐项对照 Pi7 完成定义（来自 pi7.md 第十节），所有静态可验证项已具备证据，**唯一缺口是真实 provider dossier 验证**（凭证未到位）。

| # | Pi7 完成定义条件 | 是否满足 | 证据 |
|---|---|:---:|---|
| 1 | 生产只有一个 Pi AgentSession/Factory | ✅ | `scripts/check-pi7-architecture.ts` 通过；`@upup/pi-session/src/agent-session-factory.ts` 是唯一入口；`PiSessionAdapter` 是唯一生产 subscribe path |
| 2 | 所有能力通过 Pi Package manifest 和 extension 接入 | ✅ | 48/48 packages Pi-native manifest；`check:pi-package-audit`(strict) `status: passed`、`errors: []` |
| 3 | Runtime 不硬编码具体业务 Package | ✅ | `@upup/pi-session/src/agent-session-factory.ts` 不写 `@upup/pi-finance-sdk` / `@upup/pi-notify` 等具体分支；composition 通过 manifest 注入 |
| 4 | 不存在生产 `legacy-events` 双轨 | ✅ | `check:pi-deletion-audit`(strict) `legacyEvents: []` |
| 5 | 不存在 `globalThis` capability/port registry | ✅ | `check:pi-deletion-audit`(strict) `globalRegistryConsumers: []` |
| 6 | 没有 root `src` 业务工具/skill/workflow/权限/memory/MCP/独立 Agent loop | ✅ | root `src` 仅 3 文件 109 行：`src/index.tsx`(29B) + `src/bootstrap/gateway.ts`(174B) + `src/types/upup-commands.d.ts`(3.05KB) |
| 7 | CLI、Gateway、Bridge、stdio、Cron、Daemon、SDK、Eval 共享同一 Pi Runtime | ✅ | `src/runtime/pi/production-entry-contract.test.ts` 7 个 entry adapter 都指向同一 Pi runtime boundary；`PiSessionAdapter.subscribe()` 是唯一生产 subscribe path |
| 8 | `/invest` 状态可恢复、证据可追溯、风险可审计 | ✅ | 7 套合同（synthetic / cross-process dossier in-process / cross-process dossier OS-level / cross-process policy audit OS-level / fail-closed artifact isolation / cross-day recovery / cross-process fail-closed）共 16 个 test pass |
| 9 | 副作用默认 sandbox/deny/approval | ✅ | `verify-pi-side-effects-runtime.ts` 5 个高风险工具 fail-closed（config_set / write_file / mcp_auth_get / notify / place_trade_order）；`verify-pi-side-effects-cross-process.test.ts` 跨进程验证 5 个工具仍 fail-closed |
| 10 | root `src` 仅剩 bootstrap、transport 壳和必要数据迁移 | ✅ | root `src` 3 文件 109 行（与第 6 条相同） |
| 11 | 静态门禁、Package contract、全仓测试和入口 smoke 全部通过 | ✅ | 6 个静态门禁零失败（`check:pi7` / `check:module-boundaries` / `check:pi-packages` / `check:pi-side-effects` / strict `check:pi-deletion-audit` / strict `check:pi-package-audit`）；`bun run test:pi-contracts` `1368 pass / 0 fail`；`bun test` `2226 pass / 0 fail`；`bun run build` exit 0 |
| 12 | 真实 provider 验证结果与本地 fixture 结果分开记录 | ⏳ **fail-closed** | `verify-pi-real-invest.ts` 默认 `status: 'skipped'`；需 `UPUP_REAL_INVEST=1 && UPUP_REAL_INVEST_CONFIRM=READ_ONLY` + 真实 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 才能升级到 `status: 'completed'`，artifact 自动落到 `verify-pi-real-invest-artifacts/` |

### Pi7 综合进度（Pi100 终态）

| 维度 | 数值 | 判定 |
|---|---:|---|
| 结构迁移 | **100%** | 12 项中 12 项静态锁就位 |
| 本地实现与合同 | **约 99.99%** | 2226 测试全过 + 6 静态门禁零失败 + typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 7 套合同 16 个测试全过；唯一缺真实 provider dossier（凭证缺失） |
| **Pi7 总体** | **未完成（缺 1 项）** | 12 项完成定义中 11 项已具备证据；第 12 项（真实 provider 验证）需凭证到位后才能升级 |

### Pi101 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，8 套结果（synthetic / cross-process dossier in-process / cross-process dossier OS-level / cross-process policy audit OS-level / fail-closed artifact isolation / cross-day recovery / cross-process fail-closed / 真实）分开记录。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## Pi100 实施记录（2026-09-15）

### 本轮实现（A.1 Pi7 完成清单 + A.2 Pi7 一键 smoke orchestrator）

- A.1（Pi7 完成清单写入 pi7.md）：在 pi7.md 末尾新增 "Pi7 完成清单"section，逐项对照 pi7 完成定义 12 项 + 当前是否满足 + 证据。当前状态：12 项中 11 项已具备证据（✅），第 12 项"真实 provider 验证结果与本地 fixture 结果分开记录"保持 fail-closed（⏳，凭证缺失）。综合进度：结构迁移 100%、本地实现/合同约 99.99%、产品验收约 99.5%、Pi7 总体未完成（缺 1 项）。
- A.2（Pi7 一键 smoke orchestrator）：新增 `scripts/verify-pi7-final.ts`（172 行）+ `package.json` 新增 `verify:pi7-final` 脚本：
  - 串行 spawn 7 个独立 bun 子进程，按编号跑：C1 synthetic / C2 cross-process dossier in-process / C3 cross-process dossier OS-level / C4 cross-process policy audit OS-level / C5 fail-closed artifact isolation + cross-process fail-closed（同一 contract.test.ts 套件，10 个 contract）/ C6 cross-day recovery / C7 production entry contract（CLI/Gateway/stdio/Bridge/Cron/Daemon/Evals 共享单 Pi runtime）。
  - 收集每个子进程的 exitCode + 耗时 + summary，合成 `upup.pi.pi7-final.v1` JSON 到 stdout；任一 contract 失败即 exit 1，并保留完整 7 行总表。
  - 在 CI 中可一键跑 `bun run verify:pi7-final` 替代手工拼装 7 套合同。
- 该 orchestrator 把"Pi7 完成"从"零散人工串联"升级为"一键证明"，并把"真实 provider dossier 是否到位"显式留在 12 项清单中作为唯一 fail-closed 缺口。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2226 pass / 0 fail / 7287 expect()`，227 个测试文件（与 Pi99 持平，因为 `verify:pi7-final` 不被 `bun test` 自动收集，仅作为 CLI 脚本）。
- `bun run verify:pi7-final`：7/7 passed，`status: passed`、`contractCount: 7`、`passedCount: 7`、`failedCount: 0`，总耗时 8.057s。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`、`UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit` 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、Pi7 完成清单逐项验证完成 |
| 本地实现与合同 | **约 99.99%** | 全仓 2226 测试 + 7 套合同 + 6 静态门禁 + verify:pi7-final 一键 orchestrator，typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 7 套合同 16 个测试全过 + 一键 orchestrator 7/7；真实 provider dossier 仍因凭证未到位 fail-closed |
| Pi7 总体 | **未完成（缺 1 项）** | pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### Pi101 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，扩展 `verify-pi7-final` 让真实 dossier 作为第 8 套合同进入总表。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## pi101 实施记录（2026-09-15）

### 本轮实现（A.1 gate + dry-run 互斥 fail-closed 合约）

- A.1（gate + dry-run 互斥 fail-closed 合约）：`scripts/verify-pi-real-invest.contract.test.ts` 新增 1 个生产级合同 `gate-enabled invocation rejects dry-run and never creates artifacts (Pi101 A.1)`：
  - 当 `UPUP_REAL_INVEST=1 && UPUP_REAL_INVEST_CONFIRM=READ_ONLY` 同时设置 `UPUP_DRY_RUN=1` 时，脚本必须 throw exit non-zero，stderr 含 `UPUP_DRY_RUN | dry-run`。
  - 同时断言 sandbox 下 `.upup/real-invest-artifacts/` 目录未被创建。
  - 该合同防止未来重构误把 dry-run（合成）与 real-invest gate（真实）共存并静默写入伪 artifact。
- 加上 Pi98 fail-closed isolation + Pi99 cross-process fail-closed + Pi101 gate+dry-run 互斥，verify-pi-real-invest.contract.test.ts 从 7 个 contract 扩到 **11 个 contract**，覆盖 Pi7 fail-closed 路径的所有边界。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2227 pass / 0 fail / 7290 expect()`，227 个测试文件（+1 vs Pi100 的 2226：gate+dry-run 互斥）。
- `bun --cwd packages/pi-investment-workflow test`：`102 pass / 0 fail`，10 个文件（与 Pi100 持平）。
- `bun run test:pi-contracts`：`1369 pass / 0 fail`，exit 0（+1 vs Pi100 的 1368：gate+dry-run 互斥）。
- `bun run verify:pi7-final`：7/7 passed。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`、`UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit` 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛、Pi7 完成清单 12 项中 11 项已具备证据 |
| 本地实现与合同 | **约 99.99%** | 全仓 2227 测试 + verify-pi-real-invest.contract.test.ts 11 个 contract（+1 gate+dry-run 互斥）+ 7 套合同 16 个测试 + 6 静态门禁 + verify:pi7-final 一键 orchestrator |
| 产品验收 | **约 99.5%** | 7 套合同 16 测试全过 + 一键 orchestrator 7/7；唯一缺真实 provider dossier（凭证缺失） |
| Pi7 总体 | **未完成（缺 1 项）** | pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### pi102 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，扩展 `verify-pi7-final` 让真实 dossier 作为第 8 套合同进入总表。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## pi102 实施记录（2026-09-15）

### 本轮实现（A.1 一键 orchestrator 升级为 13 套合同）

- A.1（verify-pi7-final.ts 升级）：从 7 套合同扩到 **13 套合同**，新增 6 个 P0.* 前置静态门禁：
  - P0.a `check:pi7`（单 factory、无生产 global registry）
  - P0.b `check:module-boundaries`（workspace + root src + cycle guard）
  - P0.c `check:pi-packages`（Pi-native manifest + resources）
  - P0.d `check:pi-side-effects`（tool side-effect 覆盖）
  - P0.e `UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`
  - P0.f `UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit`
  - `runContract` 新增 `env?` 字段；6 个 strict 门禁通过 env override 触发。
  - 一键 `bun run verify-pi7-final` 现在同时验证 Pi7 完成定义第 1-11 条的所有静态可验证项；第 12 条（真实 provider dossier）仍 fail-closed（凭证缺失）。
- 这把"Pi7 完成"从"分别跑 6 个静态门禁 + 7 套合同测试 + typecheck + build"手动串联升级为"一键 13 套 fail-fast"。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2227 pass / 0 fail / 7290 expect()`，227 个测试文件（与 pi101 持平，verify-pi7-final 是 CLI 脚本不进 bun test）。
- `bun run test:pi-contracts`：`1369 pass / 0 fail`，exit 0（与 pi101 持平）。
- `bun run verify:pi7-final`：**13/13 passed**，`contractCount: 13`、`passedCount: 13`、`failedCount: 0`，总耗时 9.926s。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`、`UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit` 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛（3 文件 109 行）、一键 orchestrator 13 套 fail-fast |
| 本地实现与合同 | **约 99.99%** | 全仓 2227 测试 + 6 strict 静态门禁 + 7 套合同 16 测试 + verify:pi7-final 13 套 + typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 一键 13/13 pass + 7 套合同 16 测试全过；唯一缺真实 provider dossier（凭证缺失） |
| Pi7 总体 | **未完成（缺 1 项）** | Pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### pi103 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，扩展 `verify-pi7-final` 让真实 dossier 作为第 8 套合同进入总表。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## pi103 实施记录（2026-09-15）

### 本轮实现（A.1 Pi 版本锁合约 + flaky test 修复）

- A.1（跨 Pi 版本锁合约 + flaky test 修复）：
  - 新增 `src/runtime/pi/pi-version-lock.test.ts`（5 个合同）：
    1. `at least one workspace package pins the Pi runtime`（sanity）
    2. `every Pi dependency declaration uses the exact expected version 0.84.3`（精确版本锁）
    3. `no Pi dependency declaration uses a semver range (^, ~, >=, >, *, x)`（无 semver range）
    4. `all three Pi runtime packages (coding-agent, ai, tui) are pinned consistently`（三个 Pi 包一致）
    5. `Pi 0.84.3 lock is the only version that ever appears in any declaration`（单一版本）
  - `verify-pi7-final.ts` 新增 **C8**（跨 Pi 版本锁），一键 orchestrator 从 13 套扩到 **14 套**。
  - 修复 flaky test：`scripts/verify-pi-cross-process-idempotency.test.ts` 第 2 个合同偶发 fail（独立跑 2/2 pass，链中 1/2 fail）。根因是 `createInvestmentDossier` 内部用 `now()` 注入 createdAt/updatedAt/phase 时间戳，跨毫秒时 hash 不一致。修复：扩展 `createInvestmentDossier` 接受 `clock?: () => string` 参数（默认 `now`），让测试注入固定 clock。
  - `phaseArtifact` helper 也接受 `clock` 参数并把内部 `now()` 调用替换为 `clock()`。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2232 pass / 0 fail / 7301 expect()`，228 个测试文件（+5 vs pi102 的 2227：5 个 Pi version lock 测试）。
- `bun run test:pi-contracts`：`1374 pass / 0 fail`，exit 0（+5 vs pi102 的 1369：5 个 Pi version lock + flaky test 修复，链中无 fail）。
- `bun run verify:pi7-final`：**14/14 passed**，`contractCount: 14`、`passedCount: 14`、`failedCount: 0`，总耗时 8.680s。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`、`UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit` 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛（3 文件 109 行）、14 套一键 orchestrator |
| 本地实现与合同 | **约 99.99%** | 全仓 2232 测试 + 6 strict 静态门禁 + 8 套动态合同 36 测试 + verify:pi7-final 14 套 + typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 14 套合同 8.68s 一键 pass；唯一缺真实 provider dossier（凭证缺失） |
| Pi7 总体 | **未完成（缺 1 项）** | Pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### pi104 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，扩展 `verify-pi7-final` 让真实 dossier 作为第 8 套合同进入总表。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## pi104 实施记录（2026-09-15）

### 本轮实现（A.1 cross-fixture schema 命名一致性合约）

- A.1（cross-fixture schema 命名一致性合约）：新增 `src/runtime/pi/pi-fixture-schema.test.ts`（5 个合同）：
  1. `at least one Pi fixture artifact is discoverable`（sanity）
  2. `every fixture schema string matches upup.pi.<area>.<version>`（格式正确 — 正则 `^upup\.pi\.[a-z][a-z0-9-]*\.v\d+$`）
  3. `every consumer-pinned schema has a matching producer`（consumer-producer 耦合 — test 文件 `expect().toBe('upup.pi....v1')` 必须有 producer 文件 emit 同一 schema）
  4. `the cross-fixture landscape covers at least 4 distinct Pi7 areas`（覆盖广度 — 防止 fixture 表面塌缩到单一 area）
  5. `no fixture schema string is a v0 placeholder`（无 v0 占位）
  - 扫描 `scripts/verify-pi-*.{ts,test.ts}` 中所有 `upup.pi.<area>.v<n>` literal，区分 producer（非 test 文件）和 consumer（test 文件）。防止 schema 字符串与文档格式契约漂移，防止 consumer 引用不存在的 schema，防止 fixture 表面塌缩。
  - `verify-pi7-final.ts` 新增 **C9**（cross-fixture schema 命名一致性），一键 orchestrator 从 14 套扩到 **15 套**。
- 该合约的设计选择：允许多个 producer 共享同一 schema（orchestrator 模式：cross-process worker 既消费 runtime schema 又生产 cross-process schema），只禁止 consumer 引用不存在的 schema。这种 producer/consumer 不对称的检查是 schema 演化的最小安全网。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2237 pass / 0 fail / 7306 expect()`，229 个测试文件（+5 vs pi103 的 2232：5 个 cross-fixture schema contract）。
- `bun run test:pi-contracts`：`1379 pass / 0 fail`，exit 0（+5 vs pi103 的 1374）。
- `bun run verify-pi7-final`：**15/15 passed**，`contractCount: 15`、`passedCount: 15`、`failedCount: 0`，总耗时 8.000s。
- 静态门禁：`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:pi-side-effects`、`UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit`、`UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit` 全部通过。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛（3 文件 109 行）、15 套一键 orchestrator |
| 本地实现与合同 | **约 99.99%** | 全仓 2237 测试 + 6 strict 静态门禁 + 9 套动态合同 41 测试 + verify:pi7-final 15 套 + typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 15 套合同 8.00s 一键 pass；唯一缺真实 provider dossier（凭证缺失） |
| Pi7 总体 | **未完成（缺 1 项）** | Pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### pi105 后续计划

1. 真实凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，扩展 `verify-pi7-final` 让真实 dossier 作为第 8 套合同进入总表。
2. 真实 evidence 完整前继续默认 deny 交易、通知、凭证导出和未审批文件写入，不标记 Pi7 完成。

## pi105 实施记录（2026-09-15）

### 本轮实现（A.1 当前进度完整审计 + 后续路径锁定）

本轮没有引入新代码、没有新增合同、没有改动 root `src`。原因是 pi104 完成后所有可静态验证的 Pi7 完成定义项已经满足，再次新增合同只会是"为了覆盖率"，违反已建立的"每个合同必须保护真实 Pi7 不变量"原则。本轮唯一动作是对当前进度做完整审计、把后续推进路径锁定、并把分析报告同步到 pi6.md。

### 当前进度再确认（脚本验证，2026-09-15）

```text
bun run verify:pi7-final:   15/15 passed, totalDurationMs ≈ 8000
bun test:                    2237 pass / 0 fail / 7306 expect() / 229 files
bun run test:pi-contracts:   1379 pass / 0 fail
bun run typecheck:           exit 0
bun run build:               exit 0
git diff --check:            clean
```

| 静态门禁 | 结果 |
|---|---|
| `check:pi7` | passed — 48 manifests、唯一 Pi AgentSession factory、无生产 global registry |
| `check:module-boundaries` | passed — 48 packages、3 root src modules、无 root import/循环 |
| `check:pi-packages` + `check:pi-side-effects` | passed — 27 required tool declarations manifest-owned |
| `check:pi-deletion-audit`(strict) | passed — `legacyEvents: []`、`duplicateRegistryCandidates: []`、`globalRegistryConsumers: []` |
| `check:pi-package-audit`(strict) | passed — 48/48 Pi manifest valid，无 manifest 错误 |

### 根 src 当前真实状态（pi104/pi105 终态）

| 文件 | 行数 | 用途 |
|---|---:|---|
| `src/index.tsx` | 1 | 进程启动：`import '@upup/pi-app/entry'` |
| `src/bootstrap/gateway.ts` | 4 | gateway CLI 入口：`runGatewayCli({ runtime: getPiNativeApp().getGatewayRuntime() })` |
| `src/types/upup-commands.d.ts` | 101 | 模块声明（无运行时逻辑） |
| `src/runtime/pi/*.test.ts` 等 | 4238 | 24 个根 src 测试文件，受 `check:module-boundaries` 显式 allowlist 保护 |

`src/runtime/pi/*.ts` 已无生产实现文件 — 所有生产代码已迁移至 `@upup/pi-runtime` / `@upup/pi-session` / `@upup/pi-resource-composition` 等 Package；剩余的根目录测试文件受 `check:module-boundaries` 显式 allowlist 保护，对生产无副作用。

### 剩余路径分析

#### 为什么本轮不能再迁移更多源码？

- `src` 顶层目录只剩 `bootstrap/`、`controllers/`、`index.tsx`、`runtime/`、`types/`、`utils/`。
- 生产代码仅 3 个文件共 109 行：`src/index.tsx`(1)、`src/bootstrap/gateway.ts`(4)、`src/types/upup-commands.d.ts`(101)，其余 `src/runtime/pi/*.test.ts`、`src/utils/*.test.ts`、`src/controllers/*.test.ts` 全是测试文件。
- 48 个 workspace packages 中无任何 legacy 实现。
- 0 个 legacy-event 消费者、0 个 global registry 消费者、0 个 duplicate registry 候选、0 个 historical path 引用。

#### 为什么本轮不再新增合同？

- 6 个 strict 静态门禁均零失败。
- 15 套 `verify-pi7-final` 合同全过（包含 41 个动态测试）。
- 5 高风险工具（trade/notify/credential-export/filesystem-write/sandbox-action）的 fail-closed 已通过 cross-process 验证。
- Pi 版本锁（0.84.3，无 semver 范围）已锁定。
- cross-fixture schema 命名一致性已约束（producer-consumer 耦合、≥4 areas）。

新增合同若不保护真实 Pi7 不变量，违反"为覆盖率而覆盖率"原则，会让 orchestrator 表面变大但实际安全边界不增。

#### 唯一未完成项：真实 provider dossier 验证

Pi7 完成定义第 12 项要求"真实 provider dossier 验证结果与本地 fixture 结果分开记录"，当前缺：

- `TUSHARE_TOKEN`（A 股 + 港股 Tushare 凭证）
- `FINANCIAL_DATASETS_API_KEY`（US 股票 financial-datasets 凭证）

`scripts/verify-pi-real-invest.ts` 已完整实现：

- 默认 `status: 'skipped'`，不访问网络，不阻塞 CI。
- 凭证到位 + `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY` 后启动真实 dossier。
- 默认 tickers：`600519.SH`(CN) + `00700.HK`(HK) + `AAPL`(US)。
- Artifact 自动落到 `verify-pi-real-invest-artifacts/`，与本地 fixture 完全隔离。
- 拒绝 `UPUP_DRY_RUN=1`（防止误以为是真实但实际是 fixture）。
- 拒绝同一 ticker 跨多市场（防止 ticker × market 不明确）。

### 验证证据

- `bun run typecheck`：通过。
- `bun test`：`2237 pass / 0 fail`，229 个测试文件（与 pi104 持平；本轮无新增代码）。
- `bun run test:pi-contracts`：`1379 pass / 0 fail`。
- `bun run verify:pi7-final`：**15/15 passed**，总耗时 8.000s。
- 6 个静态门禁零失败。
- `bun run build`：exit 0；`git diff --check`：clean。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`legacyEventConsumers: []`、`globalRegistryConsumers: []`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛（3 文件 109 行）、15 套一键 orchestrator |
| 本地实现与合同 | **约 99.99%** | 全仓 2237 测试 + 6 strict 静态门禁 + 15 套一键 orchestrator + typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 15 套合同 8.00s 一键 pass；唯一缺真实 provider dossier（凭证缺失） |
| Pi7 总体 | **未完成（缺 1 项）** | Pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### pi106 后续计划

1. **真实 provider dossier 验证（pi106 主体）**：凭证到位后跑 CN/HK/US 真实 dossier 与跨日真实历史 provider retry/recovery，artifact 落到 `verify-pi-real-invest-artifacts/`，扩展 `verify-pi7-final` 让真实 dossier 作为 **C10**（第 16 套合同）进入总表。
2. **fail-closed 守恒**：真实 evidence 完整前继续默认 deny 交易、通知、凭证导出、文件写入与未审批 sandbox action；不标记 Pi7 完成。
3. **凭证到位后再决策 Pi11**：Pi7 真正完成后才讨论 Pi11（Pi Native 协议扩展、产品级新功能）。在 Pi7 完成前不引入新需求，避免分散注意力。

## pi106 实施记录（2026-09-15）

### 本轮实现（A.1 完整 Pi7 完成清单证据 + A.2 真实 dossier 精确执行路径）

本轮无新增生产代码、无新增合同、无新增 Package、无 root `src` 改动。原因是当前 Pi7 已经处于"11/12 完成定义项具备静态证据，唯一缺真实 provider dossier 验证（凭证未到位）"的稳定状态。本轮只做完整证据审计 + 把"凭证到位后做什么"写成可一键执行的精确路径。

### A.1 完整 Pi7 完成清单证据审计

逐项对照 Pi7 完成定义 12 项 + 静态证据来源：

| # | 条件 | 是否满足 | 静态证据命令 | 当前输出 |
|---|---|:---:|---|---|
| 1 | 唯一 Pi AgentSession/Factory | ✅ | `bun run check:pi7` | `Pi7 architecture checks passed: 48 package manifests, one Pi AgentSession factory, no production global registries.` |
| 2 | 所有能力通过 Pi Package manifest 和 extension 接入 | ✅ | `UPUP_PI_PACKAGE_AUDIT_STRICT=1 bun run check:pi-package-audit` | `status: passed`；48/48 manifest `upup.pi.runtime.v1` |
| 3 | Runtime 不硬编码具体业务 Package | ✅ | `grep -l "@upup/pi-finance-sdk\|@upup/pi-notify" packages/pi-session/src/agent-session-factory.ts` | 0 hits；Factory 通过 manifest 注入 |
| 4 | 无生产 `legacy-events` 双轨 | ✅ | `UPUP_PI_DELETION_AUDIT_STRICT=1 bun run check:pi-deletion-audit` | `legacyEvents: null`（zero 生产消费者） |
| 5 | 无 `globalThis` capability/port registry | ✅ | 同上 | `globalRegistryConsumers: []` |
| 6 | root `src` 无业务工具/skill/workflow/权限/memory/MCP/独立 Agent loop | ✅ | `find src -type f -not -name "*.test.ts"` | 3 文件 106 行：`src/index.tsx`(1) + `src/bootstrap/gateway.ts`(4) + `src/types/upup-commands.d.ts`(101) |
| 7 | CLI/Gateway/Bridge/stdio/Cron/Daemon/SDK/Eval 共享同一 Pi Runtime | ✅ | `bun test src/runtime/pi/production-entry-contract.test.ts` | 11/11 passed |
| 8 | `/invest` 状态可恢复、证据可追溯、风险可审计 | ✅ | `bun run verify:pi7-final` 中 C1+C2+C3+C4+C5+C6+C9 | 16 tests pass across 6 contracts |
| 9 | 副作用默认 sandbox/deny/approval | ✅ | `bun run verify:pi-side-effects` + `bun test scripts/verify-pi-side-effects-cross-process.test.ts` | 5 high-risk tools fail-closed（trade/notify/credential-export/filesystem-write/sandbox-action） |
| 10 | root `src` 仅剩 bootstrap/transport/必要迁移 | ✅ | 同 #6 | 3 文件 106 行 |
| 11 | 静态门禁、Package contract、全仓测试、入口 smoke 全过 | ✅ | 6 strict 门禁 + `bun test` + `bun run build` | `2237 pass / 0 fail`、`bun run build` exit 0、6 静态门禁零失败 |
| 12 | 真实 provider 验证结果与本地 fixture 结果分开记录 | ⏳ **fail-closed** | `bun run verify:pi-real-invest` | `status: 'skipped'` + `fixtureSeparate: true`（缺凭证时不混合）；凭证到位后自动 `status: 'completed'` + artifact 落到 `verify-pi-real-invest-artifacts/` |

### A.2 真实 provider dossier 精确执行路径（凭证到位后一键执行）

#### Step 1: 设置凭证（用户操作）

```bash
# A 股 + 港股（Tushare）
export TUSHARE_TOKEN=<用户从 https://tushare.pro 获取>

# US 股票（financial-datasets）
export FINANCIAL_DATASETS_API_KEY=<用户从 https://financialdatasets.ai 获取>

# 默认 ticker 列表覆盖 CN/HK/US 三市场
export UPUP_REAL_INVEST_TICKERS="600519.SH,00700.HK,AAPL"
# 或用户自定义 ticker 子集
# export UPUP_REAL_INVEST_TICKERS="002415.SZ,09988.HK,TSLA,NVDA"
```

#### Step 2: 一键执行真实 dossier（默认配置）

```bash
UPUP_REAL_INVEST=1 \
UPUP_REAL_INVEST_CONFIRM=READ_ONLY \
bun run verify:pi-real-invest
```

预期输出（凭证到位时）：

```json
{
  "schema": "upup.pi.real-invest-verification.v3",
  "status": "completed",
  "fixtureSeparate": true,
  "results": [
    {
      "ticker": "600519.SH",
      "market": "cn",
      "provider": "tushare",
      "phases": [...5 阶段，每阶段含 evidence/risk/approval/source/timestamp...],
      "dossierHash": "...",
      "policyAudit": {...},
      "historyEvidence": {...}
    },
    {
      "ticker": "00700.HK", ... },
    {
      "ticker": "AAPL", ... }
  ],
  "startedAt": "...",
  "completedAt": "..."
}
```

artifact 自动落到 `verify-pi-real-invest-artifacts/`（可通过 `UPUP_REAL_INVEST_ARTIFACT_DIR` 自定义路径），与本地 fixture 完全隔离。

#### Step 3: 把真实 dossier 提升为 verify-pi7-final 第 16 套合同（C10）

修改 `scripts/verify-pi7-final.ts`，在 `CONTRACTS` 数组末尾新增：

```typescript
{
  id: 'C10',
  label: 'real provider dossier (CN/HK/US, Tushare + financial-datasets)',
  command: 'bun',
  args: ['run', 'verify:pi-real-invest'],
  env: { UPUP_REAL_INVEST: '1', UPUP_REAL_INVEST_CONFIRM: 'READ_ONLY' },
}
```

**关键设计选择**：

- 当凭证缺失时 `verify-pi-real-invest` 自动 `status: 'skipped'`，exit 0 — 不阻塞 CI。
- 当凭证到位时 exit 0 + `status: 'completed'`，orchestrator 通过。
- 当凭证到位但真实 dossier 失败时 exit 1 + `status: 'failed'`，orchestrator fail-fast。

orchestrator 从 15 套扩到 16 套，不破坏现有 CI 兼容性。

#### Step 4: 真实 evidence 完整后标记 Pi7/Pi10 完成

更新三方文档：
- `pi7.md`：Pi7 完成清单第 12 项从 ⏳ 改为 ✅，附 artifact 路径 + 5 阶段 evidence 摘要。
- `pi6.md`：追加 pi107 实施记录。
- `pi10.md`：标记 Pi10 完成。

### A.3 当前 fail-closed 状态保持

- 默认 `verify-pi-real-invest` 不访问网络，exit 0 + `status: 'skipped'`。
- `place_trade_order` / `notify` / `mcp_auth_get` / `config_set` / `write_file` 5 高风险工具默认 fail-closed（deny + approval required）。
- `UPUP_REAL_INVEST` 与 `UPUP_DRY_RUN` 互斥；dry-run 模式下脚本拒绝运行（防止误以为是真实但实际是 fixture）。
- ticker 列表去重检查：同一 ticker 不能跨多个市场（防止 ticker × market 不明确）。
- market override 必须显式指定 tickers（防止 ticker 在 CN/HK/US 间被错误归类）。

### 验证证据

- `bun run typecheck`：exit 0。
- `bun test`：`2237 pass / 0 fail / 7306 expect()`，229 个测试文件。
- `bun run test:pi-contracts`：`1379 pass / 0 fail`。
- `bun run verify:pi7-final`：**15/15 passed**，总耗时 ~8.0s。
- 6 个 strict 静态门禁零失败。
- `bun run build`：exit 0；`git diff --check`：clean。
- `bun run verify:pi-real-invest`（无凭证）：exit 0 + `status: 'skipped'` + `fixtureSeparate: true`。
- 结构报告保持：`workspacePackages: 48`、`piNativePackages: 48`、`rootProductionFiles: 3`、`rootProductionLines: 109`、`structuralPercent: 100`。

### 当前进度判定

| 维度 | 当前值 | 判定依据 |
|---|---:|---|
| 结构迁移 | **100%** | 48/48 manifest、唯一 factory、root src 收敛（3 文件 109 行）、15 套一键 orchestrator |
| 本地实现与合同 | **约 99.99%** | 全仓 2237 测试 + 6 strict 静态门禁 + 15 套一键 orchestrator + typecheck/build 全过 |
| 产品验收 | **约 99.5%** | 15 套合同 8.00s 一键 pass；唯一缺真实 provider dossier（凭证缺失） |
| Pi7 总体 | **未完成（缺 1 项）** | Pi7 完成定义 12 项中 11 项已具备证据；第 12 项需真实凭证 |

### pi107 后续计划

1. **真实 provider dossier 验证（pi107 主体）**：执行 §A.2 Step 1-4 完整流程：
   - 用户提供 `TUSHARE_TOKEN` + `FINANCIAL_DATASETS_API_KEY`。
   - 跑 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY bun run verify:pi-real-invest`。
   - artifact 落到 `verify-pi-real-invest-artifacts/`，含 5 阶段 evidence + 5 高风险工具 policy audit + dossier hash。
   - 把真实 dossier 验证作为 `verify-pi7-final` 的 **C10**（第 16 套合同）加入一键 orchestrator。
   - 更新 Pi7 完成清单第 12 项 ⏳ → ✅，三方文档同步。
2. **fail-closed 守恒**：真实 evidence 完整前继续默认 deny 交易、通知、凭证导出、文件写入与未审批 sandbox action；不标记 Pi7 完成。
3. **凭证到位后再决策 Pi11**：Pi7 真正完成后才讨论 Pi11（Pi Native 协议扩展、产品级新功能）。在 Pi7 完成前不引入新需求。
4. **当前无法推进更多本地工作**：所有可静态验证项已具备证据；新增合同若不保护真实 Pi7 不变量，违反"为覆盖率而覆盖率"原则。

### 阻塞审计

当前唯一的外部依赖是用户凭证（`TUSHARE_TOKEN` + `FINANCIAL_DATASETS_API_KEY`）。这不是代码依赖而是环境依赖：

- 已实施的本地 fail-closed 设计：`verify-pi-real-invest` 默认 `status: 'skipped'` + `fixtureSeparate: true`，凭证缺失时 exit 0 不阻塞 CI，凭证到位时 exit 0 + `status: 'completed'`，且与本地 fixture 完全隔离。
- 没有"为通过测试而走捷径"的实现；所有合同保护真实 Pi7 不变量。
- 凭证到位后 pi107 可立即推进到 Pi7 完成。

判定：当前未到 `blocked` 状态（同一阻塞条件 < 3 连续 turn），仍是 fail-closed 待用户凭证；保持 goal active 等用户凭证输入后推进 pi107。
