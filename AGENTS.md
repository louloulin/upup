# Repository Guidelines

> UpUp (涨涨) 是基于 [virattt/dexter](https://github.com/virattt/dexter) 的 fork，遵循 MIT 协议。
> 保留所有上游 dexter 的工程约束，本节仅为真实仓库地址 + 定位说明做更新。

- This fork: https://github.com/louloulin/upup
- Mirror: https://gitcode.com/lumosaigroup/upup
- Upstream (forked from): https://github.com/virattt/dexter
- UpUp (涨涨) is a CLI-based AI agent for **Chinese-language deep financial research**, built on top of the [Dexter](https://github.com/virattt/dexter) framework, with TypeScript, Ink (React for CLI), and LangChain. It is **not** a thin reskin of Dexter — see "China-Edition Increment" in [README.md](./README.md) for the full delta (A-share data stack, 50 investment skills, 5-phase /invest workflow, 4-runtime plugin system, EN+zh-CN i18n, multi-agent coordination, Session 2.0, 18 workspace packages, etc.).

> 📌 **中国版定位 (2026-06-12 升级)**: 完整权威的"中国版 dexter"白皮书见 [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md)。8 维度 vs 上游 dexter 的全量审计见 [upup-vs-dexter-audit.md](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)。本文件 (AGENTS.md) 中的"UpUp's Additions"段已重命名为 **China-Edition Increment**。


## 上游归属 (Upstream Attribution)

UpUp (涨涨) 是基于 [virattt/dexter](https://github.com/virattt/dexter) 的 fork，遵循 MIT 协议。

- **上游协议**：MIT（同 UpUp）
- **上游贡献**：整体金融研究框架、Tool registry、Agent loop、SKILL.md 协议、Ink 渲染层、Ink + pi-tui 集成
- **UpUp 的独立贡献**：A 股数据栈（Tushare Pro / AKShare）、50 个 SKILL.md 投资分析 skill、14 个 bundled skill、5 阶段投资工作流 (`/invest`)、4 runtime 插件系统（bun/jiti/wasm/mcp）、EN+zh-CN 双语 i18n、多 Agent 协同、Session 2.0 / Permission 体系、18 个 workspace package、8 轮 Sprint 持续打磨。详见 [README.md](./README.md) 的 "China-Edition Increment" 段。
- **修改上游代码**：请保留协议头；新增模块时直接以 UpUp 名义贡献。
- **上游同步**：若上游 dexter 发布新版本，UpUp 团队会在 PR 中评估 cherry-pick（见 `docs/sync-plan.md`）。


## Project Structure

- Source code: `src/`
  - Agent core: `src/agent/` (agent loop, prompts, scratchpad, token counting, types, plan mode, subagent, memory flush, investment workflow)
  - CLI interface: `src/cli.tsx` (Ink/React), entry point: `src/index.tsx`
  - Commands: `src/commands/` (slash commands); investment workflow in `src/commands/investment/` (dossier, strategy, earnings-preview, morning-brief, portfolio-review, risk-dashboard, watchlist-edit, invest, screen)
  - Components: `src/components/` (Ink UI components)
  - Hooks: `src/hooks/` (React hooks for agent runner, model selection, input history, agent-hooks)
  - Model/LLM: `src/model/llm.ts` (multi-provider LLM abstraction) + `packages/llm/`
  - Tools: `src/tools/` — `finance/` (prices, fundamentals, filings, insider trades, screen, key ratios, estimates, segments, news, earnings transcripts, crypto, A-share), `search/` (Exa preferred, Tavily fallback), `browser/` (Playwright)
  - Plugins: `src/plugins/` (4 runtime adapters: bun, jiti, wasm, mcp) + `packages/plugin-sdk/`
  - Skills: `src/skills/` (50 SKILL.md + 14 bundled) + `packages/skills/`
  - i18n: `src/i18n/strings.ts` (EN + zh-CN, strongly-typed keys, missing-locale tests fail)
  - Session / plan / memory / worktree: `src/session/`, `src/plan/`, `src/memory/`, `src/worktree/`
  - Utils: `src/utils/` (env, config, caching, token estimation, markdown tables)
  - Web / gateway: `src/web/` + `packages/gateway/` (read-only JSON snapshots)
  - Evals: `src/evals/` + `evals/` (LangSmith evaluation runner with Ink UI)
- 18 workspace packages under `packages/`: adapter-paperclip, agent-core, commands, cron, daemon, gateway, hooks, keybindings, llm, mcp, memory, plugin-sdk, plugins, sdk, skills, state, types, utils
- Config: `.upup/settings.json` (persisted model/provider selection)
- Environment: `.env` (API keys; see `env.example`)
- Scripts: `scripts/release.sh`

## Build, Test, and Development Commands

- Runtime: Bun (primary). Use `bun` for all commands.
- Install deps: `bun install`
- Run: `bun run start` or `bun run src/index.tsx`
- Dev (watch mode): `bun run dev`
- Type-check: `bun run typecheck`
- Tests: `bun test`
- Evals: `bun run src/evals/run.ts` (full) or `bun run src/evals/run.ts --sample 10` (sampled)
- CI runs `bun run typecheck` and `bun test` on push/PR.

## Coding Style & Conventions

- Language: TypeScript (ESM, strict mode). JSX via React (Ink for CLI rendering).
- Prefer strict typing; avoid `any`.
- Keep files concise; extract helpers rather than duplicating code.
- Add brief comments for tricky or non-obvious logic.
- Do not add logging unless explicitly asked.
- Do not create README or documentation files unless explicitly asked.

## LLM Providers

- Supported: OpenAI (default), Anthropic, Google, xAI (Grok), OpenRouter, Ollama (local).
- Default model: `gpt-5.4`. Provider detection is prefix-based (`claude-` -> Anthropic, `gemini-` -> Google, etc.).
- Fast models for lightweight tasks: see `FAST_MODELS` map in `src/model/llm.ts`.
- Anthropic uses explicit `cache_control` on system prompt for prompt caching cost savings.
- Users switch providers/models via `/model` command in the CLI.

## Tools

- `financial_search`: primary tool for all financial data queries (prices, metrics, filings). Delegates to multiple sub-tools internally.
- `financial_metrics`: direct metric lookups (revenue, market cap, etc.).
- `read_filings`: SEC filing reader for 10-K, 10-Q, 8-K documents.
- `web_search`: general web search (Exa if `EXASEARCH_API_KEY` set, else Tavily if `TAVILY_API_KEY` set).
- `browser`: Playwright-based web scraping for reading pages the agent discovers.
- `skill`: invokes SKILL.md-defined workflows (e.g. DCF valuation). Each skill runs at most once per query.
- Tool registry: `src/tools/registry.ts`. Tools are conditionally included based on env vars.

## Skills

- Skills live as `SKILL.md` files with YAML frontmatter (`name`, `description`) and markdown body (instructions).
- Built-in skills: `src/skills/dcf/SKILL.md`.
- Discovery: `src/skills/registry.ts` scans for SKILL.md files at startup.
- Skills are exposed to the LLM as metadata in the system prompt; the LLM invokes them via the `skill` tool.

## Agent Architecture

- Agent loop: `src/agent/agent.ts`. Iterative tool-calling loop with configurable max iterations (default 10).
- Scratchpad: `src/agent/scratchpad.ts`. Single source of truth for all tool results within a query.
- Context management: Anthropic-style. Full tool results kept in context; oldest results cleared when token threshold exceeded.
- Final answer: generated in a separate LLM call with full scratchpad context (no tools bound).
- Events: agent yields typed events (`tool_start`, `tool_end`, `thinking`, `answer_start`, `done`, etc.) for real-time UI updates.

## Slash Autocomplete

- Slash command completion (and `@`-prefixed file completion) is delegated to pi-tui's
  `CombinedAutocompleteProvider`, wired once in `src/cli.ts` via:
  ```ts
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(listAllCommands(), process.cwd()),
  );
  editor.setAutocompleteMaxVisible(8);
  ```
- The `Editor` (from `@earendil-works/pi-tui`) is the single source of truth for the
  autocomplete popup — upup does not mirror its state in any shadow store.
- The single-line status hint (esc / processing / permission-mode) lives in
  `src/components/status-hint.ts` (replaces the old `hint-bar.ts` which mixed single-line
  status with suggestion / pagination / category UI — all of those moved to pi-tui).
- **Behavioral note (SCAP-012)**: pressing Enter on a selected completion now submits
  the line directly, matching codex / claude code. Previously required Tab to insert
  + Enter to fire, which was unique to upup.
- `src/commands/unified-registry.ts` is a 22-line thin wrapper (`listAllCommands()` +
  `findCommand()`) that delegates to `@upup/commands`. The legacy `UnifiedCommandRegistry`
  class with Fuse / CATEGORY_MAP / usage cache was removed.

## Environment Variables

- LLM keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`
- Ollama: `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`)
- Finance: `FINANCIAL_DATASETS_API_KEY`
- Search: `EXASEARCH_API_KEY` (preferred), `TAVILY_API_KEY` (fallback)
- Tracing: `LANGSMITH_API_KEY`, `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_TRACING`
- Never commit `.env` files or real API keys.

## Version & Release

- Version format: CalVer `YYYY.M.D` (no zero-padding). Tag prefix: `v`.
- Release script: `bash scripts/release.sh [version]` (defaults to today's date).
- Release flow: bump version in `package.json`, create git tag, push tag, create GitHub release via `gh`.
- Do not push or publish without user confirmation.

## Testing

- Framework: Bun's built-in test runner (primary), Jest config exists for legacy compatibility.
- Tests colocated as `*.test.ts`.
- Run `bun test` before pushing when you touch logic.

## Security

- API keys stored in `.env` (gitignored). Users can also enter keys interactively via the CLI.
- Config stored in `.upup/settings.json` (gitignored).
- Never commit or expose real API keys, tokens, or credentials.
