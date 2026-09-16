# Changelog

> All notable changes to **UpUp (涨涨)** are documented here. The format follows
> [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
> adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
> (in spirit — version format is CalVer `YYYY.M.D`).
>
> For the granular, commit-level changelog see [`openspec/CHANGELOG.md`](./openspec/CHANGELOG.md).

## [Unreleased]

### Added
- **Global Pi home is now `~/.upup/agent`** — UpUp publishes `PI_CODING_AGENT_DIR` before importing any `@earendil-works/pi-*` module
  (`ensureUpupAgentDir()` in `@upup/pi-app/bootstrap-agent`). `resolveAgentDir` precedence is now
  `override → UPUP_AGENT_DIR → UPUP_CODING_AGENT_DIR → PI_CODING_AGENT_DIR → ~/.upup/agent`, with a **constant** default
  (no existence gate, no cwd dependence). `~/.pi/agent` is no longer in the fallback chain.
- **First-launch seed** — a fresh `~/.upup/agent` is seeded once from `UPUP_MIGRATE_FROM` or `~/.pi/agent`, restricted to an
  allowlist (`settings.json` / `models.json` / `auth.json` / `themes/` / `prompts/` / `skills/` / `extensions/`).
  Existing files are never overwritten; `auth.json` / `models.json` are forced to `0600`. Sessions, caches and logs are never copied.
  Re-runnable with `upup openbuddy migrate [--dry-run] [--force]`.
- **UpUp branding** — `brand-extension.ts` (`@upup/pi-runtime`) rewrites the Pi default system prompt through the official
  `before_agent_start` extension point (6 anchored replacements, everything else preserved). Registered in both the TUI entry
  and the headless session factory. Also ships `upup-dark.json` (auto-installed, replaceable themes only).
- **Project-level config prefers `.upup/`** — `<cwd>/.upup/settings.json` wins; `<cwd>/.pi/settings.json` stays as a read-only
  compatibility fallback. UpUp never writes `.pi/`.

### Changed
- **Positioning rewritten: Pi is the runtime, UpUp is the product.** README.md / README_CN.md / AGENTS.md no longer frame UpUp as a
  "China edition" of an upstream fork; they describe the Pi-native architecture, the single-factory constraints, and the
  `~/.upup/agent` home. `docs/upup-china-edition-positioning.md` is replaced by `docs/pi-native-positioning.md`.
- **`bun run dev` fixes** — the startup banner was printed twice (entry + CLI); `banner.ts` used `require()` in ESM; the bundled
  theme path in `bootstrap-agent.ts` was missing a `..` segment.

### Not changed
- **No Pi fork** — `@earendil-works/pi-*` stays pinned at `0.85.1` in `node_modules` and is never modified.

## [2026.05.15] - 2026-05-15

### Added
- Skills & Plugins Round 1-3 integration
  - Unified `registerSkill` SDK entry point
  - `/skills` command — browse all discovered skills dynamically
  - SKILL.md hot-reload — no restart needed
  - `recent-usage` real counts surfaced in `/skills`
  - Sample plugin (`@upup/example-plugin`) demonstrating all 4 runtimes
- 16 workspace packages published (commands, cron, daemon, gateway, hooks, keybindings, mcp, memory, pi-finance-sdk, plugin-sdk, plugins, sdk, skills, state, types, utils)

### Changed
- README — honest "Forked from virattt/dexter" attribution, "中国版 Dexter" positioning
- i18n — all 50+ component strings EN + zh-CN symmetric, strong-typed keys
- Plugin system — 4 runtime adapters (bun / jiti / wasm / mcp), unified manifest

### Fixed
- Slash command autocomplete — single source of truth (pi-tui's `CombinedAutocompleteProvider`)
- `hint-bar.ts` legacy component fully replaced by `status-hint.ts`
- Permission system edge cases (Loop recovery, plan mode + bash interaction)

## [2026.05.07] - 2026-05-07

### Added
- Investment 5-phase workflow: `/invest` (detect → plan → execute → verify → report)
- 5 Investment Subagents: Explore, Plan, Risk, Trade, Review
- KAIROS proactive runtime — earnings triggers, position monitor
- Multi-portfolio support with TusharePriceProvider real-time P&L
- 11 investment commands (dossier, earnings-preview, morning-brief, portfolio-review, risk-dashboard, screen, strategy, watchlist-edit, …)

### Changed
- LangGraph-style state machine for the 5-phase workflow
- 8 轮 Sprint v1 → v8 closeout

## [2026.04.x] — earlier rounds

> See [`openspec/CHANGELOG.md`](./openspec/CHANGELOG.md) for the full commit-level history.
> Headline milestones (oldest → newest):
>
> - **Fork from [virattt/dexter](https://github.com/virattt/dexter)** — initial codebase import
> - **Rename Dexter → UpUp (涨涨)** — brand migration
> - **A 股 data stack** — Tushare Pro + AKShare integration
> - **50 SKILL.md skills** — DCF / technical / backtest / sector / fund / portfolio …
> - **Session 2.0** — plan mode, auto-compact, loop recovery
> - **Memory system** — observation buffer, extraction hook, audit chain
> - **Plugin SDK** — `@upup/plugin-sdk` published
> - **MCP integration** — Tushare data via MCP
> - **Evals** — LangSmith evaluation runner with Ink UI
> - **Sprint v1 → v8** — 8 rounds of architecture, performance, and quality hardening

---

## Versioning Notes

- **CalVer `YYYY.M.D`** — releases are date-stamped, not semver'd
- **Tags** — `vYYYY.M.D` (e.g., `v2026.05.15`)
- **Branches** — `main` is always deployable; feature branches use `codex/<name>` prefix
