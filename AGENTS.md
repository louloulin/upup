# Repository Guidelines

> UpUp (涨涨) 是基于 [virattt/dexter](https://github.com/virattt/dexter) 的 fork，遵循 MIT 协议。
> 保留所有上游 dexter 的工程约束，本节仅为真实仓库地址 + 定位说明做更新。

- This fork: https://github.com/louloulin/upup
- Mirror: https://gitcode.com/lumosaigroup/upup
- Upstream (forked from): https://github.com/virattt/dexter
- UpUp (涨涨) is a CLI-based AI agent for **Chinese-language deep financial research**, built on top of the [Dexter](https://github.com/virattt/dexter) framework and now powered entirely by the Pi Runtime + Pi Package ecosystem, with TypeScript and Ink (React for CLI). It is **not** a thin reskin of Dexter — see "China-Edition Increment" in [README.md](./README.md) for the full delta (A-share data stack, 5-phase /invest workflow, Pi Package ecosystem, EN+zh-CN i18n, multi-agent coordination, Session 2.0, 48 workspace packages — 19 of them Pi-native with real Pi resources/tools).

> 📌 **Pi Native 投资助手定型 (2026-09-15)**: 完整 Pi7 计划与定型记录见 [pi7.md](./pi7.md)；8 维度 vs 上游 dexter 的全量审计见 [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)。当前根 `src` 已收敛为 2 个生产文件（7 行），所有能力通过 Pi Package manifest contract 接入。

## 上游归属 (Upstream Attribution)

UpUp (涨涨) 是基于 [virattt/dexter](https://github.com/virattt/dexter) 的 fork，遵循 MIT 协议。

- **上游协议**：MIT（同 UpUp）
- **上游贡献**：整体金融研究框架、Tool registry、Agent loop、SKILL.md 协议、Ink 渲染层、Ink + pi-tui 集成
- **UpUp 的独立贡献**：A 股数据栈（Tushare Pro / AKShare）、Pi Package 形式的投资 skill、5 阶段投资工作流 (`/invest`)、EN+zh-CN 双语 i18n、多 Agent 协同、Session 2.0 / Permission 体系、48 个 workspace package（19 个 Pi-native：manifest 声明 extensions/skills/prompts/workflows/policies/evals/tools/sideEffects；另 29 个仅有空 `pi` 块）、8 轮 Sprint 持续打磨。详见 [README.md](./README.md) 的 "China-Edition Increment" 段。
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

`commands`、`cron`、`daemon`、`gateway`、`hooks`、`i18n`、`keybindings`、`mcp`、`memory`、`sdk`、`state`、`types`、`utils`（以 Pi manifest contract 接入，不是金融业务实现）

> ⚠️ 其中 29 个 package 的 `pi` 块是**空声明**（无 extensions/skills/prompts/workflows/policies/evals/tools/sideEffects）。`bun run report:pi7` 现在同时输出 `piManifestDeclaredPackages` 与 `piNativePackages`（48 vs 19），`piNative` 不再等价于「有 pi 字段」。

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
- 跨日恢复、跨进程 dossier、policy audit、fail-closed artifact isolation 合同由 `verify:pi7-final` 一键 orchestrator 守门（22 套合同，其中 C15 凭证缺失时 skip）

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
- Type-check: `bun run typecheck`（= `tsc --noEmit -p tsconfig.typecheck.json`，覆盖根 `src` + `packages/*/src`）
- Tests: `bun test`（2124 测试 / 227 文件）
- 验证流水线：`bun run verify:pi7-final`（一键 orchestrator，22 套合同，C15 需真实凭证否则 skip）
- Evals: `bun run evals` 或 `bun run evals --sample 10`
- CI（`.github/workflows/ci.yml`）跑 `lint:scc`、`check:pi-runtime`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:js-suffix`、`check:pi-deletion-audit`、`check:pi-package-audit`、`typecheck`、`bun test`，外加独立的 `verify:pi7-final` job。
- CI 不构建 `dist/`：48 个 workspace package 的 `exports` 都带 `"bun": "./src/*.ts"` 条件，`bun run` / `bun test` / CI 直接解析源码；`dist/` 仅用于发布与 `bun run build:packages`。

### 已知缺口（2026-09-15 审计，尚未修复）

- **Skill 来源与作用域（2026-09-15 实测）**：Pi 从三处解析 skill ——（a）Pi package manifest 的 `pi.skills`；（b）`<project>/.agents/skills` 与 `~/.agents/skills`（Pi package-manager 内建的 agent-skills 约定，见 `pi-coding-agent/dist/core/package-manager.js`）；（c）调用方显式传入的 `additionalSkillPaths`。一次 session 实测加载 **222 个 skill**：仓库内 47（19 来自 `.agents/skills`、28 来自 Pi package），用户全局 `~/.agents/skills` 175。`.claude/skills`（12，含 openspec-\* 等 Claude Code 专用）**不是** Pi 来源，不会加载。`verifyPiResourceTrust` 的 fail-closed 只约束 package 声明的 skill/prompt/extension 路径，不拦截 Pi 自身的 `.agents/skills` 自动发现。**真正的缺口是作用域**：除 `spec.skills` 显式给出白名单外，会话会把用户全局 skill 库一并暴露给模型（`skillsOverride` 仅在 `spec.skills !== undefined` 时生效）。守门测试：`src/runtime/pi/skill-reachability.contract.test.ts`。
- **29 个空 `pi` 块**：`piManifestDeclaredPackages=48`，但 `piNativePackages=19`；空声明会让「48 个 Pi-native package」这类指标虚高。
- **`tsconfig.typecheck.json` 未覆盖 `packages/*/extensions`**：目前只 include `packages/*/src/**/*`，extension 目录依赖各自 `tsconfig.json`。

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode)。JSX via React (Ink for CLI rendering)。
- 严格 typing；避免 `any`。
- 文件精简；抽取 helper，不复制实现。
- 仅对非平凡逻辑加注释。
- 不要加日志除非显式要求。
- 不要新建 README 或文档除非显式要求。

## LLM Providers

- 支持：OpenAI (default)、Anthropic、Google、xAI (Grok)、Moonshot、DeepSeek、OpenRouter、Ollama (local)。
- 前 7 个 provider 的 id / displayName / apiKeyEnvVars / contextWindow 全部取自 Pi catalog（`@upup/pi-runtime/model-registry`）；Ollama 不在 Pi catalog 中，由 `@upup/pi-runtime/custom-providers` 通过 Pi 的 `pi.registerProvider` 注册（OpenAI-compatible `/v1`，keyless，模型表来自 Ollama `/api/tags`），`ollama:<model>` 因此能被 Pi 正常解析与流式调用。
- Default model: `gpt-5.4`。Provider 通过前缀识别（`claude-` → Anthropic、`gemini-` → Google 等）。
- 轻量任务的快速模型：使用 `@upup/pi-runtime/model-registry` 暴露的 Pi catalog（`builtinProviders()` / `getBuiltinModels()`）。`@upup/utils` 的 `PROVIDERS` 表由 `packages/utils/src/providers.test.ts` 对 Pi catalog 做漂移校验。
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

- LLM keys: `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`（Pi 的 Google 变量名，`GOOGLE_API_KEY` 仍作为向后兼容别名）、`XAI_API_KEY`、`OPENROUTER_API_KEY`、`MOONSHOT_API_KEY`、`DEEPSEEK_API_KEY`
- Ollama: `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`，UpUp 自动补 `/v1`；由 Pi provider registration 消费，不再有独立 HTTP 客户端）
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
