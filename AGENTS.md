# Repository Guidelines

> UpUp (涨涨) 是基于 [virattt/dexter](https://github.com/virattt/dexter) 的 fork，遵循 MIT 协议。
> 保留所有上游 dexter 的工程约束，本节仅为真实仓库地址 + 定位说明做更新。

- This fork: https://github.com/louloulin/upup
- Mirror: https://gitcode.com/lumosaigroup/upup
- Upstream (forked from): https://github.com/virattt/dexter
- UpUp (涨涨) is a CLI-based AI agent for **Chinese-language deep financial research**, built on top of the [Dexter](https://github.com/virattt/dexter) framework and now powered entirely by the Pi Runtime + Pi Package ecosystem, with TypeScript and Ink (React for CLI). It is **not** a thin reskin of Dexter — see "China-Edition Increment" in [README.md](./README.md) for the full delta (A-share data stack, 50 investment skills, 5-phase /invest workflow, Pi Package ecosystem, 4-runtime plugin system, EN+zh-CN i18n, multi-agent coordination, Session 2.0, 48 workspace packages, etc.).

> 📌 **Pi Native 投资助手定型 (2026-09-15)**: 完整 Pi7 计划与定型记录见 [pi7.md](./pi7.md)；8 维度 vs 上游 dexter 的全量审计见 [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)。当前根 `src` 已收敛为 2 个生产文件（7 行），所有能力通过 Pi Package manifest contract 接入。

## 上游归属 (Upstream Attribution)

UpUp (涨涨) 是基于 [virattt/dexter](https://github.com/virattt/dexter) 的 fork，遵循 MIT 协议。

- **上游协议**：MIT（同 UpUp）
- **上游贡献**：整体金融研究框架、Tool registry、Agent loop、SKILL.md 协议、Ink 渲染层、Ink + pi-tui 集成
- **UpUp 的独立贡献**：A 股数据栈（Tushare Pro / AKShare）、50 个 SKILL.md 投资分析 skill、14 个 bundled skill、5 阶段投资工作流 (`/invest`)、4 runtime 插件系统（bun/jiti/wasm/mcp）、EN+zh-CN 双语 i18n、多 Agent 协同、Session 2.0 / Permission 体系、48 个 workspace package（35 个 Pi native + 13 个外围）、8 轮 Sprint 持续打磨。详见 [README.md](./README.md) 的 "China-Edition Increment" 段。
- **修改上游代码**：请保留协议头；新增模块时直接以 UpUp 名义贡献。
- **上游同步**：若上游 dexter 发布新版本，UpUp 团队会在 PR 中评估 cherry-pick（见 `docs/sync-plan.md`）。

## Project Structure（Pi7 真实状态）

### 根 `src`（仅 bootstrap，2 文件 7 行）

- `src/index.tsx` — 进程启动入口：`import '@upup/pi-app/entry';`
- `src/bootstrap/gateway.ts` — gateway 入口 bootstrap：`runGatewayCli({ runtime: getPiNativeApp().getGatewayRuntime() })`
- `src/runtime/pi/*.test.ts` — 19 个 Pi 合同测试，**不包含生产代码**（生产实现已迁入 Pi Package）
- `src/controllers/*.test.ts` — Agent runner 的 Pi 合同测试
- `src/utils/*.test.ts` — 路径与 config source 测试

根 `src` 是 bootstrap + transport 壳 + 必要数据迁移。新增业务代码禁止直接放到 `src/` 下，必须以 Pi Package 形式接入。

### 48 个 workspace package（全部 Pi native）

#### 35 个 Pi domain package

- 公共 Runtime：`pi-runtime`、`pi-session`、`pi-resource-composition`、`pi-capability-registry`、`pi-event-adapter`、`pi-prompt-config`、`pi-cli-bootstrap`
- Composition：`pi-finance-composition`、`pi-platform-composition`
- 金融 SDK 与领域：`pi-finance-sdk`、`pi-market-data`、`pi-investment-analysis`、`pi-investment-workflow`、`pi-risk`、`pi-portfolio`、`pi-backtest`、`pi-research`、`pi-browser`、`pi-technical`、`pi-corporate-actions`、`pi-quant`、`pi-notify`
- 平台与基础设施：`pi-config`、`pi-cache`、`pi-platform`、`pi-storage`、`pi-memory`、`pi-permissions`、`pi-observability`、`pi-planning`、`pi-management`
- 入口与应用：`pi-app`、`pi-tui-app`
- 其他 Pi native：`pi-bridge`、`pi-stdio`、`pi-evals`

#### 13 个外围 workspace package

`commands`、`cron`、`daemon`、`gateway`、`hooks`、`i18n`、`keybindings`、`mcp`、`memory`、`plugin-sdk`、`plugins`、`sdk`、`skills`、`state`、`types`、`utils`（以 Pi manifest contract 接入，不是金融业务实现）

### Pi Runtime 与 Session

- **唯一 Agent 内核**：`@upup/pi-session/agent-session-factory.ts` 中的 `PiAgentSessionFactory` 是唯一生产 Pi `AgentSession` 创建入口；由 `check:pi7` 守门，禁止第二个 factory。
- **唯一资源 contract**：`@upup/pi-runtime` 固化的 `PiPackageManifestContract`（resources、capabilities、trust、lifecycle、version）。
- **唯一事件协议**：`@upup/pi-event-adapter` 是 Pi canonical event → 外部协议的唯一适配点。
- **唯一装配入口**：`@upup/pi-app/default` 的 `getPiNativeApp()` 提供默认 Package catalog、研究 Profile、policy、Session/Memory/Storage、Pi event sink、CLI/TUI 或 transport adapter、provider 配置、真实数据能力与 sandbox action。
- **fail-closed 默认**：5 高风险工具（`config_set`/`write_file`/`mcp_auth_get`/`notify`/`place_trade_order`）在 Pi policy 层默认 deny，未经显式 approval 不执行。

### 投资助手与 `/invest`

- canonical phases：`detect → plan → execute → verify → report`
- 7 个可序列化 Profile：researcher、analyst、risk-manager、portfolio-manager、backtest-engineer、monitor、reviewer
- dossier / strategy / screen / risk-dashboard / portfolio-review / earnings-preview / morning-brief / watchlist 由 `@upup/pi-investment-workflow` 的 Pi extension tool 暴露
- 跨日恢复、跨进程 dossier、policy audit、fail-closed artifact isolation 合同由 `verify:pi7-final` 一键 orchestrator 守门（20 套合同）

### 静态门禁与验证

- `bun run check:pi7` — 单 factory、零生产 global registry
- `bun run check:module-boundaries` — workspace 边界、root allowlist、无环
- `bun run check:pi-packages` + `check:pi-side-effects` — Pi manifest 与工具副作用
- `bun run check:pi-runtime` — Bun/Node 版本与 build target
- `bun run check:pi-deletion-audit` (strict) — 旧路径消费者清零
- `bun run check:pi-package-audit` (strict) — package pin 一致性
- `bun run verify:pi7-final` — 20 套产品验收合同（一键 orchestrator）
- `bun run report:pi7` — 实时结构基线（workspace 数、src 行数、Pi manifest 覆盖、capability negotiation、global registry 消费者、唯一 factory 校验、root allowlist）

### 配置与运行环境

- Config: `.upup/settings.json`（gitignored，持久化 model/provider 选择）
- Environment: `.env`（API keys；见 `env.example`）
- Scripts: `scripts/release.sh`、各种 `verify-pi-*.ts` 与 `report-pi*.ts`

## Build, Test, and Development Commands

- Runtime: Bun (primary)。使用 `bun` 执行所有命令。
- Install deps: `bun install`
- Run: `bun run start` 或 `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Type-check: `bun run typecheck`
- Tests: `bun test`（2239 测试）
- 验证流水线：`bun run verify:pi7-final`（一键 orchestrator，20 套合同）
- Evals: `bun run evals` 或 `bun run evals --sample 10`
- CI runs `bun run typecheck` + `bun test` + `bun run verify:pi7-final`。

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode)。JSX via React (Ink for CLI rendering)。
- 严格 typing；避免 `any`。
- 文件精简；抽取 helper，不复制实现。
- 仅对非平凡逻辑加注释。
- 不要加日志除非显式要求。
- 不要新建 README 或文档除非显式要求。

## LLM Providers

- 支持：OpenAI (default)、Anthropic、Google、xAI (Grok)、OpenRouter、Ollama (local)。
- Default model: `gpt-5.4`。Provider 通过前缀识别（`claude-` → Anthropic、`gemini-` → Google 等）。
- 轻量任务的快速模型：使用 `@upup/pi-runtime` 暴露的 Pi model registry。
- Anthropic 使用显式 `cache_control` 启用 prompt caching。
- 用户通过 CLI 的 `/model` 命令切换 provider/model。

## Tools（全部 Pi Package 化）

工具通过 `@upup/pi-finance-sdk`、`@upup/pi-market-data`、`@upup/pi-investment-analysis`、`@upup/pi-investment-workflow`、`@upup/pi-risk`、`@upup/pi-portfolio`、`@upup/pi-backtest`、`@upup/pi-research`、`@upup/pi-browser`、`@upup/pi-technical`、`@upup/pi-corporate-actions`、`@upup/pi-quant`、`@upup/pi-notify` 等 Pi Package 暴露。

常用工具（按 Pi extension 注册）：

- `financial_search`、`financial_metrics`、`read_filings`、`web_search`、`browser`、`skill`、`invest_workflow`、`evaluate_trade`、`run_backtest`、`get_backtest_summary` 等。
- 工具 ownership 与 native extension registration 报告：`bun run report:pi7`。

## Skills

- Skills 以 `SKILL.md` 文件形式存在（YAML frontmatter + markdown body）。
- Discovery 由 `@upup/pi-resource-composition` 的 resource loader 接管；启动时扫描 Pi Package manifest 声明的 skills。
- Skill 在系统 prompt 中以 metadata 暴露给 LLM；通过 `skill` tool 调用。
- 投资 skill 由 `@upup/pi-investment-workflow`、`@upup/pi-investment-analysis`、`@upup/pi-research` 等 Pi Package 提供。

## Agent Architecture（Pi7 形态）

- **唯一生产 Agent 内核**：Pi `AgentSession` / `pi-agent-core`，由 `@upup/pi-session/agent-session-factory.ts` 的 `PiAgentSessionFactory.create()` 创建。
- **唯一执行链**：CLI / Gateway / Cron / Daemon / Bridge / SDK / stdio / Eval 全部通过 `getPiNativeApp().get*Runtime()` 进入同一个 Pi Runtime。
- **唯一装配入口**：`@upup/pi-app/default` 的 `getPiNativeApp()` 提供 default Package catalog、研究 Profile、policy、Session/Memory/Storage、event sink 与 transport adapter。
- **禁止事项**：
  - 禁止第二个 `createAgentSession()` 入口；
  - 禁止根 `src` 直接创建 Agent loop、tool registry、skill registry；
  - 禁止 `globalThis.__upupPiHosts` / `globalThis.__upupAgentPorts`（已清零）；
  - 禁止入口重复实现 Pi event 映射（统一走 `@upup/pi-event-adapter`）。
- **事件流**：Pi 产生 typed events（`tool_start`、`tool_end`、`thinking`、`answer_start`、`done` 等），由 `@upup/pi-event-adapter` 适配到 TUI / Gateway / Bridge / stdio。

## Slash Autocomplete

- Slash command 完成（和 `@`-前缀文件完成）由 `@upup/pi-tui-app` 的 `CombinedAutocompleteProvider` 接入；Editor 由 `@earendil-works/pi-tui` 提供，是自动完成 popup 的单一 source of truth。
- `src/commands/unified-registry.ts` 已删除；统一入口在 `@upup/commands`，由 `@upup/pi-tui-app` 与 `@upup/pi-app/default` 装配。
- 按 Enter 直接提交当前行（与 codex / claude code 一致）。

## Environment Variables

- LLM keys: `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GOOGLE_API_KEY`、`XAI_API_KEY`、`OPENROUTER_API_KEY`
- Ollama: `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`）
- Finance: `FINANCIAL_DATASETS_API_KEY` (US)、`TUSHARE_TOKEN` (CN/HK)
- Search: `EXASEARCH_API_KEY` (preferred)、`TAVILY_API_KEY` (fallback)
- Real invest verifier: `UPUP_REAL_INVEST=1` + `UPUP_REAL_INVEST_CONFIRM=READ_ONLY` + `UPUP_REAL_INVEST_TICKERS=600519.SH,00700.HK,AAPL`（凭证缺失时默认 fail-closed，状态 `skipped`）
- Tracing: UpUp telemetry 与 Pi event/audit streams；无 LangChain/LangSmith runtime 依赖
- 不要 commit `.env` 或真实 API keys。

## Version & Release

- Version format: CalVer `YYYY.M.D`（不补零）。Tag prefix: `v`。
- Release script: `bash scripts/release.sh [version]`（默认今天日期）。
- Release flow: bump `package.json` version、创建 git tag、push tag、用 `gh` 创建 GitHub release。
- 不要 push 或 publish 除非用户确认。

## Testing

- Framework: Bun 内置 test runner（primary）；Jest 配置仅作 legacy 兼容。
- 测试 colocated 为 `*.test.ts`。
- 修改逻辑后跑 `bun test` 再 push。
- 完整产品验收：`bun run verify:pi7-final`。

## Security

- API keys 存在 `.env`（gitignored）；用户也可通过 CLI 交互输入。
- Config 存在 `.upup/settings.json`（gitignored）。
- 真实交易、外发通知、凭证访问、文件写入默认进入 sandbox；未经显式 approval 不得执行（由 Pi policy layer 守门）。
- 不要 commit 或暴露真实 API keys、tokens 或凭证。
