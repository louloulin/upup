# Changelog

> All notable changes to **UpUp (涨涨)** are documented here. The format follows
> [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
> adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
> (in spirit — version format is CalVer `YYYY.M.D`).
>
> For the granular, commit-level changelog see [`openspec/CHANGELOG.md`](./openspec/CHANGELOG.md).

## [Unreleased]

### Added
- Comprehensive top-tier OSS documentation suite
  - `CONTRIBUTING.md` — full contribution guide with TDD, skill authoring, plugin dev
  - `CODE_OF_CONDUCT.md` — adapted from Contributor Covenant 2.1, with finance-research specifics
  - `SECURITY.md` — threat model, permission hardening, key hygiene
  - `docs/quickstart.md`, `docs/commands.md`, `docs/skills.md`, `docs/plugins.md`
  - `docs/a-share.md`, `docs/investment-workflow.md`, `docs/i18n.md`
  - `docs/roadmap.md`, `docs/comparison.md`, `docs/faq.md`, `docs/showcase.md`
  - `docs/benchmarks.md`, `docs/session-and-permissions.md`
  - `.github/ISSUE_TEMPLATE/` (bug, feature, question)
  - `.github/PULL_REQUEST_TEMPLATE.md`

## [2026.05.15] - 2026-05-15

### Added
- Skills & Plugins Round 1-3 integration
  - Unified `registerSkill` SDK entry point
  - `/skills` command — browse all discovered skills dynamically
  - SKILL.md hot-reload — no restart needed
  - `recent-usage` real counts surfaced in `/skills`
  - Sample plugin (`@upup/example-plugin`) demonstrating all 4 runtimes
- 18 workspace packages published (adapter-paperclip, agent-core, commands, cron, daemon, gateway, hooks, keybindings, llm, mcp, memory, plugin-sdk, plugins, sdk, skills, state, types, utils)

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
- **No breaking changes without a major CalVer bump** (e.g., `2026.6.0` would mark a breaking release)

## Migration Guides

When breaking changes occur, a migration guide is published in [`docs/migration/`](./docs/migration/) (planned).

## Acknowledgments

UpUp stands on the shoulders of:
- [virattt/dexter](https://github.com/virattt/dexter) — the original financial research framework
- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Session, Permission, TUI design
- [Tushare Pro](https://tushare.pro) + [AKShare](https://akshare.akfamily.xyz) — A-share data providers
- The open source community — every contributor, tester, and bug reporter

---

<p align="center">
  <strong>UpUp (涨涨) — 涨，涨，一直涨。</strong>
</p>
