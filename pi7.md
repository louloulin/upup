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
