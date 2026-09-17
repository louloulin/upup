# Repository Guidelines

**UpUp (涨涨) 是一个 Pi-native 的 AI 投资助手。** 面向中文深度投研：A 股 / 港股 / 美股行情与基本面、公告与监管文件、估值与组合风险、5 阶段 `/invest` 投研工作流。

- 仓库：https://github.com/louloulin/upup
- 镜像：https://gitcode.com/lumosaigroup/upup
- 协议：MIT

## 定位：Pi 是 runtime，UpUp 是产品

UpUp **不重新实现 agent**。Agent loop、TUI/InteractiveMode、工具执行、bash/sandbox、会话与压缩、设置与主题、扩展宿主、provider catalog 全部来自
`@earendil-works/pi-*`（锁定 `0.85.1`）。UpUp 只贡献 Pi 侧没有的东西：

- **金融域能力**：A 股 / 港股 / 美股数据栈（Tushare Pro、AKShare、Financial Datasets）、公告与监管文件、估值 / 组合 / 风险 / 回测 / 量化 / 技术面 / 公司行动 / 通知
- **投研工作流**：`/invest` 五阶段（detect → plan → execute → verify → report）+ 7 个可序列化 Profile
- **投资记忆**：跨日 / 跨进程 dossier 与投资上下文
- **渠道**：WhatsApp gateway、财报披露日历与 A 股 cron、daemon supervisor、MCP、management 只读页

**扩展 Pi 的方式只有一种：Pi Package。** 每个能力以 `package.json#pi` manifest 声明
`extensions` / `skills` / `prompts` / `workflows` / `policies` / `evals` / `tools` / `sideEffects`，
由 Pi 的 `DefaultPackageManager` + `DefaultResourceLoader` 装载。禁止在根 `src` 里自建 agent loop、tool registry 或 skill registry。

**品牌与家目录**：UpUp 拥有自己的全局 Pi home `~/.upup/agent`（经 `PI_CODING_AGENT_DIR` 交给 Pi），
并以 `before_agent_start` 扩展把 Pi 默认 system prompt 改写为 UpUp 身份。两处细节见下文「Global Agent Home」与「Brand」。

> 📌 **历史沿革**：仓库最初从 [virattt/dexter](https://github.com/virattt/dexter)（MIT）起步，2026-09 的 Pi Native 迁移已把 agent /
> TUI / transport / session 层全部替换为 Pi runtime，dexter 遗留实现不再是生产路径。保留此说明仅为满足 MIT 归属要求，UpUp 的产品身份是
> **Pi-native 投资助手**，不是任何上游的 reskin。完整迁移记录见 [pi7.md](./pi7.md)。

## Project Structure（Pi7 真实状态）

### 根 `src`（仅 bootstrap，2 文件 7 行）

- `src/index.tsx` — 进程启动入口：`import '@upup/pi-app/entry';`
- `src/bootstrap/gateway.ts` — gateway 入口 bootstrap：`runGatewayCli({ runtime: getPiNativeApp().getGatewayRuntime() })`
- `src/runtime/pi/*.test.ts` — 22 个 Pi 合同测试，**不包含生产代码**（生产实现已迁入 Pi Package）
- `src/utils/*.test.ts` — 3 个测试：路径、config source、home 隔离合同
- 根 `src` 共 27 个文件，其中 2 个生产文件（7 行）

根 `src` 是 bootstrap + transport 壳 + 必要数据迁移。新增业务代码禁止直接放到 `src/` 下，必须以 Pi Package 形式接入。

### 37 个 workspace package（全部声明 Pi manifest）

`bun run report:pi7` 的实时基线：`workspacePackages=37`、`piManifestDeclaredPackages=37`、`piNativePackages=19`（即 19 个声明了真实 Pi 资源），注册 tool 名 269 个，仓库内 skill 47 个。

- Runtime 与装配：`pi-runtime`、`pi-session`、`pi-resource-composition`、`pi-capability-registry`、`pi-event-adapter`、`pi-prompt-config`、`pi-cli-bootstrap`、`pi-app`
- 金融领域：`pi-finance-sdk`、`pi-market-data`、`pi-investment-analysis`、`pi-investment-workflow`、`pi-risk`、`pi-portfolio`、`pi-backtest`、`pi-research`、`pi-browser`、`pi-technical`、`pi-corporate-actions`、`pi-quant`、`pi-notify`
- 平台与基础设施：`pi-config`、`pi-cache`、`pi-platform`、`pi-storage`、`pi-memory`、`pi-permissions`、`pi-observability`、`pi-planning`、`pi-management`、`pi-evals`
- 渠道与外围：`gateway`、`cron`、`daemon`、`mcp`、`memory`、`types`、`utils`

> ⚠️ 37 个 package 都写了 `pi` 块，但只有 19 个声明了真实资源（extensions/skills/prompts/workflows/policies/evals/tools）。`piNativePackages` 不等于 `piManifestDeclaredPackages`，不要合并成「37 个 Pi-native package」这种口径。

> 📌 **已删除的自实现（Pi Native 迁移）**：`pi-tui-app`（改用 Pi `InteractiveMode`）、`pi-bridge` / `pi-stdio`（改用 Pi transport + `pi-protocol`）、`pi-finance-composition` / `pi-platform-composition`（改用 Pi composition defaults）、`commands`、`state`、`keybindings`、`i18n`、`hooks`、`sdk`。`pi-deletion-audit` 守门旧路径消费者清零。

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
- `bun run check:no-self-impl` — 禁止 UpUp 导出与 Pi canonical 导出同名
- `bun run check:tui-bridge-cleanup` — 确认 `pi-tui-app` 已删除、入口只剩 Pi `InteractiveMode`
- `bun run check:upup-home` — 所有 `~/.upup` 路径必须走 `$UPUP_HOME`，禁止裸 `homedir()` 拼接
- `bun run verify:pi7-final` — 22 套产品验收合同（一键 orchestrator）
- `bun run report:pi7` — 实时结构基线（workspace 数、src 行数、Pi manifest 覆盖、capability negotiation、global registry 消费者、唯一 factory 校验、root allowlist）

### 配置与运行环境

- Config: `~/.upup/agent/settings.json`（全局，持久化 model/provider/theme 选择）与 `<cwd>/.upup/settings.json`（项目级,gitignored）
- Environment: `.env`（API keys；见 `env.example`）
- Scripts: `scripts/release.sh`、各种 `verify-pi-*.ts` 与 `report-pi*.ts`

## Build, Test, and Development Commands

- Runtime: Bun (primary)。使用 `bun` 执行所有命令。
- Install deps: `bun install`
- Run: `bun run start` 或 `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Type-check: `bun run typecheck`（= `tsc --noEmit -p tsconfig.typecheck.json`，覆盖根 `src` + `packages/*/src`）
- Tests: `bun test`（Bun test runner，覆盖根 `src` + 全部 workspace）
- 验证流水线：`bun run verify:pi7-final`（一键 orchestrator，22 套合同，C15 需真实凭证否则 skip）
- Evals: `bun run eval` 或 `bun run eval --sample 10`
- CI（`.github/workflows/ci.yml`）跑 `lint:scc`、`check:pi-runtime`、`check:pi7`、`check:module-boundaries`、`check:pi-packages`、`check:js-suffix`、`check:pi-deletion-audit`、`check:pi-package-audit`、`typecheck`、`bun test`，外加独立的 `verify:pi7-final` job。
- CI 不构建 `dist/`：37 个 workspace package 的 `exports` 都带 `"bun": "./src/*.ts"` 条件，`bun run` / `bun test` / CI 直接解析源码；`dist/` 仅用于发布与 `bun run build:packages`。

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode)。渲染层全部由 Pi 提供（`@earendil-works/pi-tui` / `InteractiveMode`）；UpUp 不再自带 Ink / React 渲染。
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

## Slash Commands

- **通用 slash 命令全部用 Pi 内建的**：`/model`、`/session`、`/compact`、`/theme`、`/resume`、`/fork`、`/help`…（`pi-coding-agent/dist/core/slash-commands.js`）。UpUp 的 `@upup/commands` 与自建 autocomplete 已删除。
- **UpUp 只注册投资命令族**：`/invest`、`/dossier`、`/strategy`、`/risk-dashboard`、`/portfolio-review`、`/morning-brief`、`/earnings-preview`、`/watchlist-edit`、`/screen`，由 `@upup/pi-finance-sdk/extensions/commands.ts` 通过 `ExtensionAPI.registerCommand` 注册；command catalog 的唯一真源是 `@upup/pi-investment-workflow/src/registry.ts#INVESTMENT_COMMANDS`。
- Slash 补全由 Pi `InteractiveMode` + `@earendil-works/pi-tui` Editor 提供；UpUp 不再自建 popup。

## Environment Variables

- LLM keys: `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GEMINI_API_KEY`（Pi 的 Google 变量名，`GOOGLE_API_KEY` 仍作为向后兼容别名）、`XAI_API_KEY`、`OPENROUTER_API_KEY`、`MOONSHOT_API_KEY`、`DEEPSEEK_API_KEY`
- Ollama: `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`，UpUp 自动补 `/v1`；由 Pi provider registration 消费，不再有独立 HTTP 客户端）
- Finance: `FINANCIAL_DATASETS_API_KEY` (US)、`TUSHARE_TOKEN` (CN/HK，可选)
  - CN/HK 行情默认走**免凭证的真实 Eastmoney provider**（`provider: 'auto'`）：`push2.eastmoney.com/api/qt/stock/get` 取实时报价、`push2his.eastmoney.com/api/qt/stock/kline/get` 取前复权日线、`push2.eastmoney.com/api/qt/stock/trends2/sse` 订阅盘中 SSE。配置 `TUSHARE_TOKEN` 时 CN/HK 仍优先 Tushare。
  - 缺凭证**不再**降级到 `dry-run://` 合成价格：dry-run 只在 `UPUP_DRY_RUN=1` 或显式 `dryRun: true` 时启用（工具声明 `policy: 'no-synthetic-fallback'`）。
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

## Global Agent Home: `~/.upup/agent`（2026-09-16 定型）

UpUp 是产品、Pi 是内嵌 runtime，因此 UpUp 拥有自己的全局 Pi home：**`~/.upup/agent`**。
这不是 fork：Pi 通过 `PI_CODING_AGENT_DIR` 解析 agent dir（`config.js#getAgentDir()`），UpUp 入口在**任何 `@earendil-works/pi-*` 动态 import 之前**调用
`ensureUpupAgentDir()`（`@upup/pi-app/bootstrap-agent`）把该路径发布给 Pi。

`resolveAgentDir`（`@upup/pi-resource-composition/agent-dir`）优先级：

1. `override` 参数（测试 / 嵌入）
2. `UPUP_AGENT_DIR`
3. `UPUP_CODING_AGENT_DIR`（Pi 风格命名）
4. `PI_CODING_AGENT_DIR`（用户已显式指向 Pi 的某个 agent dir）
5. `~/.upup/agent` — 规范默认值，**恒定**（不再依赖目录是否已存在，也不再因 cwd 变化）

`~/.pi/agent` **不在**回退链中。首次启动时 `bootstrapUpupAgentSync()` 会把旧 Pi home 一次性迁移过来（allowlist：`settings.json` / `models.json` / `auth.json` / `themes/` / `prompts/` / `skills/` / `extensions/`，绝不覆盖已有文件，凭证文件强制 0600），并把内置主题（`dark`/`light`/`auto`/未设置）替换为 `upup-dark`；用户自定义主题不会被覆盖。也可随时手动执行 `upup openbuddy migrate`。

## Brand: UpUp 而不是 Pi

Pi 的默认 system prompt 硬编码了自身身份（`You are an expert coding assistant operating inside pi, a coding agent harness.`），且
`APP_NAME` / `piConfig.name` 只影响 agent dir 路径、启动 logo 与终端标题，不影响 prompt 模板。

UpUp 不去 fork Pi，而是用 Pi 官方扩展点 `before_agent_start`（`BeforeAgentStartEventResult.systemPrompt`，跨扩展链式生效）改写本轮 system prompt：
`createUpUpBrandExtension()`（`@upup/pi-runtime/brand-extension`）只做 6 处锚定替换，其余 Pi guideline / tool snippet / doc 路径 / skill 全部原样保留。
该扩展同时注册在 TUI 入口（`@upup/pi-app/pi-native-cli`）与 headless 工厂（`@upup/pi-session/agent-session-factory`）。

已知无法在不 fork 的前提下改造的两处（仅影响观感，不影响模型行为）：Pi 的终端标题 `π - <session> - <cwd>`（`APP_TITLE` 模块加载期冻结）与 `Welcome to Pi` setup wizard 文案（仅官方发行版 + `PI_EXPERIMENTAL=1` 时触发）。

## Known Pi-Integration Gaps (2026-09-16 audit)

- **Skill 作用域**：Pi 从三处解析 skill ——（a）Pi package manifest 的 `pi.skills`；（b）`<project>/.agents/skills` 与 `~/.agents/skills`（Pi package-manager 内建约定）；（c）调用方显式传入的 `additionalSkillPaths`。实测一次 session 加载 **222 个 skill**（仓库内 47，用户全局 `~/.agents/skills` 175）。`.claude/skills` **不是** Pi 来源，不会加载。缺口在**作用域**：除 `spec.skills` 显式给出白名单外，会话会把用户全局 skill 库一并暴露给模型。守门测试 `src/runtime/pi/skill-reachability.contract.test.ts`。
- **`tsconfig.typecheck.json` 未覆盖 `packages/*/extensions`**：只 include `packages/*/src/**/*`，extension 目录依赖各自 `tsconfig.json`。

- ✅ 已修复 `agentDir = cwd`：现在恒定 `~/.upup/agent`，并有 `agent-dir.test.ts` 守门。
- ✅ 已修复 `SettingsManager.inMemory()`：`agent-session-factory` 用 `SettingsManager.create(cwd, agentDir)`，`/model` 持久化落到真实 `~/.upup/agent/settings.json`。
- ✅ 已修复 `Welcome to Pi` setup wizard 反复出现：settings.json 迁移到位后不再走向导。
- ✅ 已修复 `Response was truncated before completion.` 死循环：Pi 的 `clampMaxTokensToContext` 会把输出预算夹到
  `contextWindow - estimate - 4096`，下限仅 1 token；当 provider catalog 低报 `contextWindow`（如 `ax` 网关声明的
  128k，实测可服务 260k+ prompt）时，长会话的 `max_tokens` 被夹到 1，网关再返回 `finish_reason: "length"` + 128 token 上限，
  每轮都截断。`@upup/pi-runtime` 的 `before_provider_request`（`contractBehaviors`，返回值会替换 payload）用
  `repairDegenerateOutputBudget` 把 <1024 的预算恢复到模型声明的 `maxTokens`，并在审计里记 `outputBudgetRepair`。
  检测走 `MAX_BUDGET_PATH_DEPTH = 3` 层嵌套，覆盖 `max_tokens` / `max_completion_tokens` / `max_output_tokens`（OpenAI /
  Anthropic / Azure Responses）、`maxOutputTokens`（Google Vertex `params.config.generationConfig.maxOutputTokens`、
  Google Generative AI）、`maxTokens`（Amazon Bedrock `params.inferenceConfig.maxTokens`），与 Pi 自带的 11 个
  `onPayload` 桥接的 provider adapter 全部对齐。端到端守门：
  `packages/pi-runtime/src/provider-output-budget.e2e.test.ts`（走 Pi 真实 `ExtensionRunner` + 真实
  `openai-completions` 请求体捕获）。放大因素 `compaction.enabled=false` 会让 Pi 的溢出/截断自愈整体短路，
  `upup doctor` 的 `Auto Compact` 检查会告警（只读，不覆盖用户设置）。
- `resolvePiModel` 只查 `getBuiltinModel` + ollama，不查 `modelRuntime`，`~/.upup/agent/models.json` 自定义 provider 静默 fallback 到 Pi default。
- `packages/memory/src/embeddings.ts` 与 `packages/pi-research/src/search.ts#searchPerplexity` 走 raw fetch，不走 Pi provider registry；Perplexity 是一个真 LLM 推理。
- 每个 session 默认从 `~/.agents/skills` 加载全局 skills 进 system prompt（`auto/user`），需显式 opt-in 控制。
- 20/37 个 package 的 `pi` block 未声明 `tools` / `resources` / `capabilities`；基础设施类包可接受，但应统一口径。
- **计划修正**：`pi7.md` 迁移计划假设「Pi `core/extensions` 已含 MCP 注册通路」——实测 Pi 明确不内置 MCP
  （`docs/usage.md`: "It intentionally does not include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background bash."）。
  因此 `packages/mcp` **保留**为 UpUp 的 Pi extension 能力，不按原计划删除。

## Security

- API keys 存在 `.env`（gitignored）；用户也可通过 CLI 交互输入。
- Config 存在 `.upup/settings.json`（gitignored）。
- 真实交易、外发通知、凭证访问、文件写入默认进入 sandbox；未经显式 approval 不得执行（由 Pi policy layer 守门）。
- 不要 commit 或暴露真实 API keys、tokens 或凭证。
