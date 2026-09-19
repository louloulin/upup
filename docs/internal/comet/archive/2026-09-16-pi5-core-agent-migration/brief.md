# Outcome

UpUp 的生产 Agent 核心彻底改为 Pi Runtime，后续主要维护金融投资领域能力。Pi 提供唯一的 Agent loop、Model/Provider、Tool Call、流式事件、取消、Session、Tree/Fork、Compaction、Extension、SDK、RPC 和 TUI 基础；UpUp 通过领域适配层与 Pi 插件生态提供金融数据、投资工具、Skills、投研工作流、权限、证据审计、风险控制和 Gateway/Daemon/Cron 等产品能力。

最终产品边界：

```text
Pi Runtime = 通用 Agent Operating Runtime
UpUp       = 中国金融投资 Data + Tools + Skills + Workflow + Risk Product
```

# Scope

## Source coverage

来源文件：`/Users/louloulin/appx/upup/pi5.md`；读取状态：`complete`。本 change 覆盖该文件全部当前有效可执行要求，背景和参考资料不单独转为验收项。

| 来源单元 | 状态 | 保留语义 | Spec 位置 | 验收 |
|---|---|---|---|---|
| `pi5.md` §0 执行摘要 | complete | Pi 是唯一生产核心，UpUp 聚焦金融领域 | §目标架构/Runtime | A1,A2 |
| `pi5.md` §1 Pi 与 UpUp 基线 | complete | 以本地 Pi 源码/文档和 UpUp 源码为事实依据 | §基线 | A3 |
| `pi5.md` §2 目标架构 | complete | Runtime Adapter、唯一 Session Factory、分层和架构图 | §目标架构 | A4,A5 |
| `pi5.md` §3 Pi 核心替换 | complete | loop、provider、session、compaction、events 使用 Pi | §核心替换 | A6,A7,A8 |
| `pi5.md` §4 金融插件生态 | complete | Finance SDK、Tool Adapter、投资 Profile、/invest 插件化 | §金融插件 | A9,A10,A11 |
| `pi5.md` §5 资源关系 | complete | Extension/Skill/Prompt/Package 分工和发布 | §插件生态 | A12 |
| `pi5.md` §6 安全合规 | complete | Pi 默认权限不足，保留 UpUp policy、sandbox、凭证和证据约束 | §安全 | A13,A14 |
| `pi5.md` §7 Session 迁移 | complete | Pi 单写、旧格式迁移、不可覆盖、金融 compaction | §数据迁移 | A15 |
| `pi5.md` §8 Phase 0-7 | complete | 按阶段实施、验证、再删除旧核心 | §实施顺序 | A16,A17 |
| `pi5.md` §9-12 入口/验证/风险/回滚 | complete | 所有入口迁移、门禁、回滚和运行时风险 | §验证与发布 | A18,A19 |
| `pi5.md` §13-15 DoD/Issues/决策 | complete | 全部完成定义、架构图、生态目标 | §完成定义 | A20 |

## 实现范围

1. 新增 `src/runtime/pi/`，提供唯一 `UpUpAgentRuntime`、`AgentSessionFactory`、Model/Tool/Event/Session/Permission/Memory Adapter。
2. 新增 `src/extensions/upup/`，将金融工具、投资工作流、金融 policy、Memory、Telemetry、commands 和 renderers 作为 Pi Extension 资源接入。
3. 统一 `AgentDefinition`、`CustomAgent`、`SubagentConfig`、`AgentInstance` 为版本化 `UpUpAgentSpec`。
4. 用 Pi `AgentSession`/`AgentSessionRuntime` 替换 `src/agent/agent.ts` 的生产主循环及所有生产入口。
5. 以 Pi AgentMessage/Tool/Event/Model 为核心协议，逐步移除 LangChain message/runtime 依赖。
6. 以 Pi JSONL Session 为新生产写入格式，提供旧 UpUp JSON/JSONL 的安全迁移和回读。
7. 将工具按金融领域和风险边界拆为可审查的 Pi Packages：finance SDK、market data、fundamentals、filings、China data、search、valuation、portfolio、backtest、workflow、policy、evals。
8. 将纯知识迁移为 Pi Skills；确定性计算、数据获取、写操作和工作流保持 Extension Tool/Service。
9. 保留并 Pi 化 `/invest` 五阶段、Coordinator、Gateway、Daemon、Cron、Bridge、Realtime、Memory、Telemetry 和 Evals。
10. 将架构图、模块边界图、数据流图、Session 迁移图和插件生态图作为正式文档落地并随实现更新。

## Pi Native Cleanup — 5 Sprint 子计划（基于粘贴规划）

本节在 A1-A20 之上扩展 Pi Native 全面清理范围，遵循激进迁移策略：完全接受 Pi 默认行为，复用 Pi Agent / TUI / Session / Transport / Provider 能力，删除 UpUp 重复实现。

### Source coverage (扩展)

新增来源：`/Users/louloulin/.codex/attachments/b65430a3-c385-4b32-9d7a-f536973af815/pasted-text-1.txt`（用户粘贴的 Pi Native 迁移计划），`/Users/louloulin/appx/upup/docs/pi-ecosystem-audit-2026-09-15.md`（既有 Pi 生态审计），`/Users/louloulin/appx/upup/pi7.md` + `pi8.md` + `pi10.md` + `pi11.md`（Pi7-Pi11 实施记录）。

| 来源单元 | 状态 | 保留语义 | Spec 位置 | 验收 |
|---|---|---|---|---|
| pasted-text-1.txt §1 TUI/CLI | complete | 删除 pi-tui-app 29K 行，迁移到 Pi InteractiveMode | §TUI 子计划 | A21 |
| pasted-text-1.txt §2 Bash/Sandbox | complete | 删除 pi-platform bash+sandbox 5.6K 行，迁移到 Pi bash tool | §Bash 子计划 | A22 |
| pasted-text-1.txt §3 Session | complete | 瘦身 pi-session 5K 行，复用 Pi SessionManager | §Session 子计划 | A23 |
| pasted-text-1.txt §6 Transport | complete | 删除自造 JSON 协议，切到 pi-protocol/pi-client/pi-server CBOR | §Transport 子计划 | A24 |
| pasted-text-1.txt §7-9 Provider/SDK/Composition | complete | 删硬编码表、删 sdk、删 composition 包装 | §Provider/SDK/Composition | A25 |
| pasted-text-1.txt §11 Memory | complete | memory 包保留，删除 raw fetch 部分 | §Memory | A26 |
| pasted-text-1.txt §12 Investment/Finance | complete | finance 域保留，加固 fund-trade raw LLM | §Finance 加固 | A27 |
| pasted-text-1.txt §13 Channel/Gateway | complete | gateway/cron/daemon 保留并简化 | §Channel/Gateway 简化 | A28 |

### 实施范围 (扩展 — 5 Sprint)

#### Sprint 1: TUI → Pi InteractiveMode (≈25K 行删除)
- 删除 `packages/pi-tui-app/` 全部 29K 行（包括 components/permissions/tui/state/hooks/utils/cli.ts）。
- `packages/pi-app/src/entry.ts` 与 `default.ts` 改为直接调用 Pi `InteractiveMode`，通过 Pi `ExtensionAPI` 注册 UpUp 投资命令。
- `packages/pi-event-adapter` 简化为只服务 stdio JSON 输出，不再为 TUI 服务。
- 现有 232 条 contract test 改写为 Pi `InteractiveMode` integration test。

#### Sprint 2: Bash/Sandbox → Pi bash tool (≈5.6K 行删除)
- 删除 `packages/pi-platform/src/bash/` (4,469 行) + `sandbox/` (1,189 行) + `permission-mode.ts`。
- 通过 Pi `ExtensionAPI.registerTool` 重新暴露 `platformBash`/`platformReadFile`/`platformWriteFile`/`platformEditFile`，命名兼容。
- UpUp 特有 finance command whitelist 通过 Pi `BashOperations` 注入。

#### Sprint 3: Session/Settings/State → Pi 原生 (≈10K 行删除)
- 删除 `pi-session/src/{storage,storage-portable,session-state,session-service,session-tracker,pid-manager,restore,message-chain,context-collapse,ephemeral-messages,session-types,session-environment,selector,session-adapter}.ts`（合计约 5K 行）。
- 删除独立 package `state/`(434 行)、`keybindings/`(614 行)、`i18n/`(352 行)、`hooks/`(341 行)。
- 改用 Pi `core/session-manager.ts`、`core/settings-manager.ts`、`core/resource-loader.ts`、`core/messages.ts`、Pi keybindings、Pi prompt 多语言、Pi hook 机制。

#### Sprint 4: Transport → CBOR (≈8K 行删除)
- 删除 `packages/pi-bridge/` 6,252 行所有自实现（protocol、server、session、client、auth、jwt、workSecret 等）。
- 服务端用 `pi-server` 的 `createServer`，客户端用 `pi-client` 的 `createClient` + CBOR framing。
- 删除 `packages/pi-stdio/` 中 JSON envelope 实现（1,764 行），改为基于 `pi-protocol` 的 CBOR over stdio transport。保留 `acp.ts` 薄适配层。
- 接受破坏性变更（README/CHANGELOG 同步）。

#### Sprint 5: Provider/SDK/Composition 清理 (≈8K 行删除)
- `packages/utils/src/providers.ts` 已从 Pi catalog 派生（无需大改）；删除 `packages/pi-tui-app/src/utils/model.ts` (268 行硬编码 8 项)。
- 删除 `packages/sdk/` 7,642 行自实现，改用 Pi `core/sdk.ts`。
- 删除 `packages/pi-finance-composition/` (133 行) + `packages/pi-platform-composition/` (163 行)，内容内联到 `pi-session/builtin-composition.ts`。
- `packages/pi-capability-registry/` (151 行) 简化为 type alias。

### Sprint 6: 入口与 root `src` 收敛
- root `src/` 仅保留 bootstrap + transport 壳；删除 `src/runtime/pi/`、`src/controllers/`、`src/utils/` 下的所有 test fixture。
- `src/index.tsx` 改为 `import { main } from '@earendil-works/pi-coding-agent'` + UpUp finance extension 注册。
- `src/bootstrap/gateway.ts` 改为 Pi extension + WhatsApp 通道注入。

### Sprint 7: 保留并加固
- `packages/memory/` 保留，删除 `search.ts` 和 `embeddings.ts` 中 raw fetch（改走 Pi provider registry），`memory-deny.ts` 与 Pi policy 合并。
- `packages/pi-finance-sdk/` 保留，删除 `fund-trade.ts` 中 raw LLM 调用（改走 Pi `promptRunner`）。
- `packages/pi-investment-workflow/`、`pi-investment-analysis`、`pi-risk`、`pi-portfolio`、`pi-backtest`、`pi-research`、`pi-technical`、`pi-corporate-actions`、`pi-quant`、`pi-market-data`、`pi-notify`：保留为 Pi extension tool 注册。
- `packages/gateway/`、`cron/`、`daemon/` 保留并简化为 thin supervisor over Pi `BackgroundService`。

# Non-goals

- 不把 Pi 默认宿主权限当成金融权限系统。
- 不删除金融数据源、工具、Skills、证据审计、风险政策或投资工作流。
- 不把多 Agent、Plan、MCP、Gateway、Cron、Daemon 误称为 Pi 内置能力；这些属于 UpUp Extension/Service。
- 不一次性把所有金融工具塞进一个巨大 Extension。
- 不在没有 Node/Bun、协议、Session、权限和行为回归证据前切换生产默认值。
- 不启用真实交易；模拟交易和组合写操作必须显式审批、隔离和审计。
- 不覆盖旧 Session，不用自然语言输出替代 evidence、source、asOf、freshness 和 auditId。

# Acceptance examples

验收 ID 必须具体、可观察且不重复：

- **A1 Runtime 唯一性**：生产入口 CLI、print、stdio、SDK、Gateway、Cron、Daemon、Bridge 和 Eval 均通过 `AgentSession` 或 `AgentSessionRuntime`；静态检查不能发现第二个生产 Agent loop。
- **A2 旧核心退出**：默认生产路径不 import/instantiate `src/agent/agent.ts`，不调用 `callLlmWithMessages()`；旧实现只存在于明确的迁移/兼容目录。
- **A3 Pi 版本与运行时**：Pi 包版本锁定；Node `>=22.19.0` 与 Bun 策略有可执行 CI 检查；不兼容时使用 Pi Node worker/RPC，而不是隐式降级。
- **A4 Runtime Adapter**：`src/runtime/pi/` 暴露唯一 Session Factory 和 Runtime 接口；Agent、Subagent、Worker、Gateway 不直接创建旧 Agent。
- **A5 Agent Spec**：普通、投资、Custom、Subagent、Worker 都能序列化为带 version、tools、skills、permissions、workflow 的 `UpUpAgentSpec`。
- **A6 Pi Agent loop**：一次真实 fixture 证明 Pi 处理多轮 streaming、多个 Tool Call、steer/follow-up、abort、timeout、错误和最终消息。
- **A7 Pi Model protocol**：核心使用 `pi-ai` Model/Provider/usage/stream；LangChain message classes 不在生产 Runtime Adapter 中出现。
- **A8 Pi Session/Compaction**：Session tree、fork、resume、compact、export、crash recovery 通过；金融摘要保留 ticker、market、asOf、assumption、risk、evidence 和未完成阶段。
- **A9 Tool Adapter**：至少行情、基本面、新闻、搜索、交易日五个真实 fixture 工具通过 Pi `registerTool()` 执行，并保留 safety、concurrency、progress、details、AbortSignal。
- **A10 金融证据**：金融工具结果包含 evidence ID、source、retrievedAt、asOf、freshness、warnings 和 auditId；secret 不进入结果、Session 或 telemetry。
- **A11 投资 Profiles**：`invest-explore`、`invest-plan`、`invest-risk`、`invest-trade`、`invest-review` 使用 Pi Session 和工具 allowlist；越权 Tool Call 被阻止并审计。
- **A12 Pi 生态**：纯知识 Skill、Extension Tool、Prompt Template 和 Pi Package 能分别加载；新增投资能力不修改 Pi Runtime；Package 依赖 pinned 且来源 allowlist 生效。
- **A13 金融权限**：safe/warning/dangerous/critical 四级策略覆盖读数据、筛选/回测、计划/组合草案、模拟交易/外发；critical 默认拒绝或逐次确认。
- **A14 插件安全**：第三方或未审查 Package 不自动加载；敏感工具运行在受控进程/sandbox；凭证访问和网络范围可审计。
- **A15 Session 迁移**：旧 JSON/JSONL 可 dry-run、备份、迁移、Pi 回读、tree/fork/compact/export；失败不覆盖源文件并生成 hash/report。
- **A16 投研工作流**：`/invest` detect→plan→execute→verify→report 五阶段使用 Pi Session，可暂停、恢复、fork、幂等和审计。
- **A17 多 Agent**：Coordinator 只负责分解、spawn、消息、聚合、生命周期和回收；底层每个 worker 的 LLM、Tool、Session、Compaction 来自 Pi。
- **A18 外围入口**：Gateway、Cron、Daemon、Bridge、stdio、SDK、Eval 都通过同一 Runtime Adapter，事件、错误、usage 和取消语义一致。
- **A19 验证门禁**：类型检查、静态依赖检查、Adapter contract tests、双运行时 fixture、金融 E2E、权限测试、性能/恢复测试全部有可重复命令和结果。
- **A20 架构留档与计划更新**：正式架构图、数据流图、插件生态图和迁移状态落盘；每个通过的 ID 在 `pi5.md` 的完成矩阵中标记并链接证据。

- **A21 TUI 切换**：`packages/pi-tui-app/` 目录不存在；`packages/pi-app/src/entry.ts` 调用 Pi `InteractiveMode`；232 条原 TUI test 改写为 Pi integration test；`bun test packages/pi-event-adapter packages/pi-app` 全 PASS。
- **A22 Bash/Sandbox 切换**：`packages/pi-platform/src/bash/` 和 `sandbox/` 目录不存在；Pi `tools/bash.ts` 通过 `ExtensionAPI` 暴露为 `platformBash`；`bun test packages/pi-platform` 全 PASS。
- **A23 Session/Settings/State 瘦身**：`pi-session` 文件数 ≤ 现有 50%；`state/`、`keybindings/`、`i18n/`、`hooks/` 目录不存在；`bun test packages/pi-session` 全 PASS。
- **A24 Transport CBOR**：`packages/pi-bridge/` 目录不存在；`@earendil-works/pi-client` 和 `@earendil-works/pi-server` 成为生产依赖；`pi-test.sh` 跑通；bridge smoke 验证 bootstrap + auth token。
- **A25 SDK/Composition 清理**：`packages/sdk/` 目录不存在；`packages/pi-finance-composition/` 和 `packages/pi-platform-composition/` 目录不存在；`bun run check:pi7 && bun run check:module-boundaries && bun run check:pi-packages` 全 PASS。
- **A26 Memory 简化**：`packages/memory/src/search.ts` 和 `embeddings.ts` 无 raw fetch；走 Pi provider registry；memory contract test 全 PASS。
- **A27 Finance 加固**：`packages/pi-finance-sdk/src/fund-trade.ts` 无 raw LLM 调用；走 Pi `promptRunner`；finance SDK test 全 PASS。
- **A28 Channel/Gateway 简化**：`packages/gateway/src/access-control.ts` 和 `config.ts` 与 Pi policy 重叠部分删除；`packages/daemon/` 简化为 thin supervisor over Pi `BackgroundService`；gateway/cron test 全 PASS。

# Constraints and invariants

- `/Users/louloulin/appx/pi` 是只读上游源码参考；UpUp 不直接修改它。
- Pi Extension 运行宿主权限高，所有金融包必须显式 allowlist、pin、审查和 sandbox 评估。
- 所有工具调用传递 `AbortSignal`；所有外部数据标注来源、时间、时区、新鲜度和缓存状态。
- 生产新 Session Pi 单写；迁移期间旧格式只读；同一 Session 禁止两个 Runtime 同时写入。
- 大型原始数据、财报和行情表存到 evidence/run store，LLM context 只持有引用和摘要。
- 领域状态机、权限判断、确定性金融计算不能只靠 Prompt。
- 真实交易默认关闭；测试禁止真实下单。
- 不修改与本 change 无关的用户改动；不自动 commit/push。
- 每个阶段必须真实运行对应验证，失败先修复再推进。
- 删除 ≥ 60K 行业务重复代码（覆盖 Sprint 1-5 主目标）；保留 finance/memory/channel 三大领域。
- 不得修改 `/Users/louloulin/appx/pi` 上游源码；只读取与参考。
- bridge → CBOR 切换为破坏性变更，外部集成方需同步升级协议。
- `@earendil-works/pi-*` 锁定 0.85.1，不升级。
- 静态门禁 `bun run check:pi7`、`check:module-boundaries`、`check:pi-packages` 必须持续通过。
- 新增 `bun run check:no-self-impl` 禁止 packages/* 重复实现 Pi 已导出 API。
- 新增 `bun run check:tui-bridge-cleanup` 确认 `pi-tui-app`、`pi-bridge` 已彻底删除。

# Decisions

- 采用 Pi Runtime 彻底替换 UpUp 核心 Agent，而不是长期双 Runtime。
- 采用 `UpUpAgentSpec` 作为唯一领域 Agent 定义，Pi `AgentSession` 作为唯一执行对象。
- 采用 Adapter + Extension + Pi Package 分层，金融领域代码不进入 Pi 核心。
- 采用 Pi JSONL 单写和 UpUp legacy reader/迁移器，迁移失败不可覆盖原始文件。
- 采用 Node worker/RPC 作为 Bun 不兼容时的正式 fallback，不暗中 fork Pi 或重写旧 loop。
- 采用 deterministic validators + Pi reviewer 双重验证金融报告，模型输出不能替代确定性校验。
- 架构图作为正式产物，至少包括 Runtime 分层图、Agent/Tool 数据流图、Session 迁移图、插件生态图、权限边界图和 `/invest` 状态图。

# Open questions

- [blocking] CONFIRM: 是否确认本 change 按上述范围执行：先完成 Pi Runtime 唯一入口和金融 Tool Adapter，再分阶段迁移 Session、Subagent、Coordinator、外围入口和 Pi Packages；最终删除旧生产 Agent loop，并以 A1-A20 的真实验证作为完成标准？

# Verification expectations

每个阶段由 Builder 提交代码、测试命令、结果和已覆盖的验收 ID；随后由独立只读 Verifier 复核。最终必须提供：

1. 静态依赖图和禁止旧 Runtime 检查结果；
2. Pi Adapter/Extension/Package contract test 结果；
3. Session 迁移报告和不可覆盖证明；
4. `/invest`、五个投资 Profile、权限和 evidence fixture 结果；
5. Gateway/Cron/Daemon/Bridge/SDK/stdio/Eval 入口验证；
6. Node/Bun 运行时决策和性能/恢复数据；
7. 架构图文件路径和与实现一致的复核记录；
8. `pi5.md` 完成矩阵中只将有实际证据的 A 项标记为 `[x]`。