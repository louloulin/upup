# UpUp (涨涨) 🤖📈

> **Chinese-language financial research AI agent** — terminal-native A-share / HK / US investment research workbench
> Forked from [virattt/dexter](https://github.com/virattt/dexter), independently built for Chinese investment research

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Fork](https://img.shields.io/badge/fork-dexter-blueviolet.svg)](https://github.com/virattt/dexter)
[![i18n: EN | zh-CN](https://img.shields.io/badge/i18n-EN%20%7C%20zh--CN-ff69b4.svg)](#i18n)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub stars](https://img.shields.io/github/stars/louloulin/upup.svg)](https://github.com/louloulin/upup/stargazers)

[中文](./README.md) · [English](#) · [Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md)

![UpUp CLI welcome screen — model DeepSeek V4 Flash, version 2026.6.12](./docs/images/upup-welcome.png)

---

## What is this

**UpUp (涨涨)** is a **terminal-native Chinese-language financial research AI agent**. Ask it a question in your CLI — *"Analyze Kweichow Moutai's 2025 Q3 earnings"* — and it will pull data, run valuation, cite filings, cross-verify, and deliver a sourced structured report.

Forked from [virattt/dexter](https://github.com/virattt/dexter) and independently built across 8 Sprints, UpUp fills every gap in the Chinese investment research pipeline — from tool calls to research workflow — with native A-share data stack, 50 investment skills, 5-phase workflow, 4 runtime plugins, bilingual i18n, Session 2.0, multi-agent coordination, and proactive monitoring. Full positioning: [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md).

---

## Core Capabilities

### 🇨🇳 Native A-share / HK / Chinese-language investment research

- **Tushare Pro + AKShare + East Money fallback** data stack, covering 5,000+ Shanghai/Shenzhen/BSE tickers
- **12 A-share specific tools** (`src/tools/astock/`): realtime quotes / financials / ratios / money flow / northbound flows / dragon-tiger list / block trades / sector classification
- **Three sector classification systems** — Shenwan / CITIC / Wind; full valuation metrics (PE-TTM / PB / PS / PEG / dividend yield / DCF)
- **Hong Kong stocks**: Tushare HK + AKShare
- **Funds**: Tushare fund + AKShare fund data (REITs / ETF / bonds)
- **Default provider flipped** to `deepseek` (vs. upstream dexter's `openai`) — optimized for Chinese-language financial scenarios

### 🤖 Agent core (`src/agent/`)

- **Anthropic-style Agent Loop** (`src/agent/agent.ts`): max 50 iterations, tool calls + Scratchpad
- **Auto compaction** (`compact.ts` + `microcompact.ts`): token-threshold triggered, keeps last 3 rounds
- **Loop Recovery** (`loop-recovery.ts`): detects infinite loops, auto-restarts
- **Plan Mode** (`src/plan/plan-builder.ts`): auto-generates 2-10 step research plans, user reviews before execution
- **Capability Manifest**: Capability Manifest + Registry + Feature Gates
- **Intent Detection**: stock / sector / portfolio / risk
- **Fallback Handler**: multi-model cascade, primary model failure auto-downgrades
- **Stream Mode**: realtime token output + token usage tracking
- **Session memory**: Memory Manager + Extraction Hook + Observation Buffer

### 📊 50 SKILL.md + 14 bundled Skills

**Bundled dynamic skills (14)**: `research` · `fund` · `portfolio` · `portfolio-review` · `risk-assessment` · `alert` · `batch` · `stock-screen` · `dream` · `hunter` · `sandbox` · `verify` · `index` · `prompt-helpers`

**File-based SKILL.md (50, by domain)**:
- **Valuation / Financials**: `dcf` · `cash-flow-analysis` · `dividend-analysis` · `earnings-forecast` · `earnings-season` · `earnings-calendar` · `valuation-comparison` · `valuation-alert` · `financial-interpretation` · `financial-report` · `performance-prediction`
- **Technical / Volume-price**: `technical-analysis` · `money-flow` · `shareholder-analysis` · `momentum-investing` · `backtest-dca` · `dca-strategy`
- **Sector / Theme**: `sector-analysis` · `sector-rotation` · `macro-analysis` · `market-monitor` · `market-overview` · `swarm-analysis` · `x-research`
- **Style / School**: `value-investing` · `growth-investing`
- **Fund / Institution**: `fund-analysis` · `fund-comparison` · `fund-holdings` · `fund-management` · `manager-analysis` · `institution-research` · `institutional-holding`
- **Portfolio**: `portfolio-management` · `portfolio-rebalancing` · `personalized-recommendation`
- **A-share specific**: `a-share-analysis` · market structure / money flow
- **Data / Reports**: `api-integration` · `research-report` · `alert-management` · `multi-market-analysis`

**Features**: hot reload (`hot-reload.ts`) + bilingual descriptions (i18n-helper) + MCP integration (`mcp-skills.ts`) + dependency check (`dependency.ts`) + recent-usage counts (`auto-activate.ts`).

### 🎯 `/invest` 5-phase investment workflow

```
User ──► detect   Intent recognition (stock / sector / portfolio / risk)
     ──► plan     Auto-generate 2-10 step research plan (user reviews)
     ──► execute  Concurrent data fetch / model run (finance tools + skills + subagents)
     ──► verify   Cross-verify (multi-source compare / history replay / number consistency)
     ──► report   Structured report (with citations + data cards + risk notes)
```

### 11 investment subcommands

| Command | Purpose |
|---|---|
| `/invest <code>` | Full 5-phase research |
| `/dossier <code>` | Stock dossier |
| `/earnings-preview <code>` | Earnings preview (7 days before report) |
| `/strategy` | Strategy dev / audit / publish / fork |
| `/screen` | Multi-factor screening |
| `/morning-brief` | Pre-market brief |
| `/portfolio-review` | Portfolio review (Brinson attribution) |
| `/risk-dashboard` | Risk dashboard (realtime) |
| `/watchlist-edit` | Watchlist editing |
| `/plan` | Enter plan mode |
| `/skills` | Browse all skills (dynamic discovery) |

### 🛠 Tool ecosystem (48 categories / ~296 tools)

| Category | Tools | Purpose |
|---|---:|---|
| `finance` | 20 | US SEC data (price / metrics / filings / estimates) |
| `astock` | 12 | A-share (Tushare + AKShare + East Money) |
| `portfolio` | 20 | Portfolio management / Brinson attribution / rebalancing |
| `quant` | 13 | Quant strategies / backtest |
| `trading` | 11 | Execution algorithms (VWAP / POV / IS) |
| `bash` | 13 | Shell execution |
| `filesystem` | 16 | File read/write / git / worktree |
| `powershell` | 3 | Windows compatibility |
| `valuation` | 7 | DCF / valuation comparison |
| `fund` | 7 | Fund analysis |
| `risk` | 1 | Risk assessment |
| `screening` | 3 | Multi-factor screening |
| `sector` / `forecast` / `earnings` / `calendar` | 10 | Sector / forecast / earnings / calendar |
| `search` / `browser` / `fetch` | 12 | Search (Exa / Tavily) + browser (Playwright) + scraping |
| `news` / `sentiment` / `alt-data` / `short-interest` | 10 | News / sentiment / alt data / short interest |
| `monitor` / `alerts` / `heartbeat` / `cron` | 7 | Monitor / alerts / heartbeat / scheduling |
| `plan` / `task` / `todo` / `workflow` | 11 | Plan / task / todo / workflow |
| `memory` / `cache` / `export` / `notify` / `lsp` | 20 | Memory / cache / export / notify / LSP |
| `discovery` / `comparison` / `benchmark` / `fx` | 11 | Discovery / comparison / benchmark / forex |

**Safety layer**: `registry/` (24 files) + Tool Safety Level / Category / Side Effects / Concurrency Metadata + tool-level deny / tool-level mode + global tool-deny.

### 🔌 4 Runtime Plugin System

| Runtime | File | Sandbox | Purpose |
|---|---|---|---|
| `bun` | `src/plugins/adapters/bun.ts` | process | In-process ESM, fastest |
| `jiti` | `src/plugins/adapters/jiti.ts` | process | TS native require-style loading |
| `wasm` | `src/plugins/adapters/wasm.ts` | wasm | Untrusted code isolation (sandbox) |
| `mcp` | `src/plugins/adapters/mcp.ts` | mcp | Model Context Protocol external services |

**Registration**: `registerPlugin` / `registerBuiltinPlugin` / `registerSingleton` / `registerFactory`
**Third-party SDK**: `@upup/plugin-sdk` (independently publishable)
**Example**: `@upup/example-plugin` runs across all 4 runtimes
**MCP**: standalone adapter, mounts any MCP service (filesystem / GitHub / database / custom)

### 🧠 Session 2.0 + 3-layer permissions (`src/session/` + `src/hooks/`)

- **18 session files**: context collapse / message chain / migration / restore / PID manager / Selector
- **Plan Mode**: user reviews plan before execution (Claude Code reference)
- **3-layer permissions**:
  1. Static whitelist (`.upup/settings.json`)
  2. Tool-level mode (`allow` / `ask` / `deny`)
  3. Session-level mode (temporary elevation / downgrade)
- **17 hook files**: tool lifecycle / permission / rate limit / stop hook / elicitation / worktree
- **Default mode**: `ask` (never bypass)

### 🤝 Multi-agent coordination (`src/multi-agent/` + `src/coordinator/`)

- **39 multi-agent files**: parallel task orchestration / investment subagents / result aggregation
- **16 coordinator files**: 4 worker pool + task routing
- **5 investment subagents**: Explore (data fetch) / Plan (plan generation) / Risk (risk assessment) / Trade (execution) / Review (verification)
- **5 general-purpose subagents** (inherited from dexter, extended to investment domain)

### ⏰ KAIROS proactive runtime (`src/kairos/` + `src/bridge/` + `src/realtime/` + `src/daemon/` + `src/cron/`)

- **KAIROS (14 files)**: 6-state-machine proactive runtime — earnings triggers / holding monitoring / sector rotation signals
- **Bridge (36 files)**: remote / cross-device / encrypted channel
- **Realtime (10 files)**: event bus / realtime push
- **Daemon (12 files)**: background workers / persistent processes
- **Cron (6 files)**: scheduled task scheduler

### 🌍 EN + zh-CN bilingual i18n (`src/i18n/`)

- **56 strongly-typed keys**: typo in key → compile error
- **Missing translation fails**: `strings.test.ts` unit test, missing any locale → fail
- **Auto-detect**: `getLocale()` infers from `LANG` / `LC_ALL`, overridable via `UPSTREAM_LOCALE`
- **Coverage**: components / prompts / skill descriptions / command copy
- **Zero dependency**: static table + lookup function, no runtime translation library

### 🧩 8 LLM Providers (`packages/llm/`)

| Provider | Default | Notes |
|---|:---:|---|
| **DeepSeek** | ✅ | Chinese financial default, best cost |
| OpenAI | | `gpt-5.4` |
| Anthropic | | Prompt caching (`cache_control`) |
| Google | | Gemini series |
| xAI | | Grok |
| Moonshot | | Kimi |
| OpenRouter | | Aggregate gateway |
| Ollama | | Local (`http://127.0.0.1:11434`) |

Switch via `/model` command in CLI or `.upup/settings.json`.

### 📦 18 Workspace Packages (`packages/`)

| Package | Purpose |
|---|---|
| `agent-core` | Core agent abstraction |
| `llm` | Multi-provider adapter |
| `memory` | Persistent memory |
| `skills` | Skill runtime |
| `plugins` | Plugin infrastructure |
| `plugin-sdk` | Third-party plugin SDK |
| `mcp` | MCP protocol |
| `commands` | Unified command registry |
| `gateway` | HTTP / WebSocket gateway |
| `daemon` | Background process |
| `cron` | Scheduled task |
| `hooks` | Hook runtime |
| `state` | State management |
| `keybindings` | Key bindings |
| `types` | Shared types |
| `utils` | Utility functions |
| `sdk` | Common SDK |
| `adapter-paperclip` | Paperclip adapter |

**Independently publishable**: each package has its own `package.json` + `tsconfig.json`, individually publishable to npm.

### 📡 Web Gateway + Evaluation

- **Web gateway**: `src/web/` + `packages/gateway/` (read-only JSON snapshot)
- **Evaluation framework**: `src/evals/` + LangSmith 240+ questions + citation density counter + Ink UI
- **Telemetry**: `src/telemetry/` + audit signatures + event stream

---

## Project size (reproducible)

| Dimension | Value | Command |
|---|---:|---|
| `src/` TS+TSX files | **1,055** | `find src -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` |
| `src/` lines | **237,914** | same + `-exec cat {} + \| wc -l` |
| `packages/` files | **1,253** | `find packages -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` |
| `packages/` lines | **406,495** | same |
| `src/skills/*/SKILL.md` | **50** | `find src/skills -name SKILL.md \| wc -l` |
| `bundled/` TS skills | **14** | `ls src/skills/bundled/*.ts \| wc -l` |
| `src/tools/*.ts` | **296** | `find src/tools -name '*.ts' \| wc -l` |
| Tool categories | **48** | `ls -d src/tools/*/ \| wc -l` |
| `src/commands/*.ts` | **28** | `find src/commands -name '*.ts' \| wc -l` |
| Investment subcommands | **11** | `ls src/commands/investment/*.ts \| grep -v test \| wc -l` |
| `src/plugins/adapters/` | **4** | `ls src/plugins/adapters/*.ts \| grep -v index \| wc -l` |
| `packages/` count | **18** | `ls packages/ \| wc -l` |
| `src/*/` top-level modules | **48** | `ls -d src/*/ \| wc -l` |
| i18n keys | **56** | `grep -cE "^\s+\| '" src/i18n/strings.ts` |
| LLM providers | **8** | `packages/llm/src/providers.ts` |
| Test files | **276** | `find src -name '*.test.ts' \| wc -l` |

> All numbers reproducible via [Appendix: Reproducible Commands](#appendix-reproducible-commands).

---

## Quickstart

### Requirements

- [Bun](https://bun.sh) 1.0+ (primary runtime)
- macOS / Linux / Windows (WSL recommended)

### Install

```bash
git clone https://github.com/louloulin/upup.git
cd upup
bun install
cp env.example .env
```

### Minimal config (`.env`)

At least one LLM key. For A-share users DeepSeek is recommended:

```env
DEEPSEEK_API_KEY=sk-...              # Recommended for Chinese financial scenarios
ANTHROPIC_API_KEY=sk-ant-...         # Optional
OPENAI_API_KEY=sk-...                # Optional
TUSHARE_TOKEN=your_tushare_token     # A-share (register at https://tushare.pro)
EXASEARCH_API_KEY=...                # Search (Exa preferred)
```

### Launch

```bash
bun start                            # Interactive TUI
bun start "Analyze Kweichow Moutai 2025 Q3 earnings"  # Direct question
bun start "/invest 600519.SH 2025Q3" # 5-phase research
bun start "/screen PE<20 ROE>15"     # Multi-factor screen
```

---

## Project structure

```
upup/
├── src/                          # 1,055 files / 237,914 lines / 48 subdirs
│   ├── agent/                    # Agent loop / Plan mode / Loop recovery / Memory flush
│   ├── cli.ts                    # CLI entry (Ink + pi-tui)
│   ├── index.tsx                 # Package entry
│   ├── commands/                 # 28 slash commands (incl. 11 investment subcommands)
│   │   └── investment/           #   - invest / dossier / earnings-preview /
│   │                             #     morning-brief / portfolio-review /
│   │                             #     risk-dashboard / strategy / screen /
│   │                             #     watchlist-edit / phase-handlers / registry
│   ├── skills/                   # 50 SKILL.md + 14 bundled + hot-reload + i18n-helper
│   ├── tools/                    # 296 tool files / 48 categories
│   │   ├── finance/              #   20 US-stock tools
│   │   ├── astock/               #   12 A-share specific (upup-only)
│   │   ├── portfolio/            #   20 portfolio tools
│   │   ├── quant/                #   13 quant
│   │   ├── trading/              #   11 execution algos (VWAP/POV/IS)
│   │   ├── bash/ / filesystem/   #   13 + 16 system tools
│   │   └── registry/             #   24 registry + types + permissions
│   ├── plugins/                  # 4 runtime adapters (bun/jiti/wasm/mcp)
│   ├── session/                  # 18 Session 2.0 files
│   ├── plan/                     # Plan mode (builder / executor / context)
│   ├── hooks/                    # 17 hook files
│   ├── i18n/                     # EN + zh-CN strongly-typed
│   ├── components/               # Ink TUI components
│   ├── memory/                   # 48 memory / observation buffer / extraction hook
│   ├── multi-agent/              # 39 multi-agent orchestration
│   ├── coordinator/              # 16 4-worker pool
│   ├── kairos/                   # 14 proactive runtime (6-state machine)
│   ├── bridge/                   # 36 remote / cross-device
│   ├── realtime/                 # 10 event bus
│   ├── daemon/                   # 12 background workers
│   ├── cron/                     # 6 scheduled task
│   ├── web/                      # Gateway (read-only JSON snapshot)
│   └── tui/                      # 50 Ink + pi-tui render
├── packages/                     # 18 workspace packages / 1,253 files / 406,495 lines
├── docs/                         # Design / implementation / validation reports
├── evals/                        # LangSmith evaluation
├── .upup/                        # User-level config (gitignored)
└── package.json                  # name=upup, version=2026.6.12
```

---

## Documentation

Full docs at **[docs/index.md](./docs/index.md)**. Quick links:

- 🚀 New users: [docs/quickstart.md](./docs/quickstart.md) · [docs/a-share.md](./docs/a-share.md) · [docs/showcase.md](./docs/showcase.md) · [docs/faq.md](./docs/faq.md)
- 🔍 Reference: [docs/commands.md](./docs/commands.md) · [docs/skills.md](./docs/skills.md) · [docs/investment-workflow.md](./docs/investment-workflow.md) · [docs/i18n.md](./docs/i18n.md) · [docs/session-and-permissions.md](./docs/session-and-permissions.md)
- 🛠 Extension: [docs/plugins.md](./docs/plugins.md) · [docs/architecture-overview.md](./docs/architecture-overview.md) · [ARCHITECTURE.md](./docs/architecture-overview.md)
- 📊 Eval: [docs/benchmarks.md](./docs/benchmarks.md) · [docs/comparison.md](./docs/comparison.md) · [docs/roadmap.md](./docs/roadmap.md)
- 🇨🇳 China-edition: [docs/upup-china-edition-positioning.md](./docs/upup-china-edition-positioning.md)

---

## Security

UpUp runs in `ask` permission mode by default, never bypasses. See [SECURITY.md](./SECURITY.md).

- Vulnerability disclosure: `security@upup.dev`
- Known not-redone: upstream LLM provider bugs / `--dangerously` misuse

---

## Acknowledgments

UpUp (涨涨) stands on the shoulders of two giants:
- [virattt/dexter](https://github.com/virattt/dexter) — overall financial research framework / Tool registry / Agent loop / SKILL.md protocol
- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Session / Permission / TUI design reference

---

## Appendix: Reproducible Commands

```bash
# In upup repo root
echo "src files:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "src lines:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l)"
echo "src/*/ dirs:      $(ls -d src/*/ | wc -l)"
echo "SKILL.md:         $(find src/skills -name SKILL.md | wc -l)"
echo "bundled skills:   $(ls src/skills/bundled/*.ts | wc -l)"
echo "tools:            $(find src/tools -name '*.ts' | wc -l)"
echo "tool categories:  $(ls -d src/tools/*/ | wc -l)"
echo "tools/finance:    $(find src/tools/finance -name '*.ts' | wc -l)"
echo "tools/astock:     $(ls src/tools/astock/ | wc -l)"
echo "commands:         $(find src/commands -name '*.ts' | wc -l)"
echo "investment cmds:  $(ls src/commands/investment/*.ts | grep -v test | wc -l)"
echo "plugin adapters:  $(ls src/plugins/adapters/*.ts | grep -v index | wc -l)"
echo "workspaces:       $(ls packages/ | wc -l)"
echo "packages files:   $(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "session files:    $(find src/session -name '*.ts' | wc -l)"
echo "hooks files:      $(find src/hooks -name '*.ts' | wc -l)"
echo "memory files:     $(find src/memory -type f | wc -l)"
echo "multi-agent:      $(find src/multi-agent -type f | wc -l)"
echo "coordinator:      $(find src/coordinator -type f | wc -l)"
echo "kairos:           $(find src/kairos -type f | wc -l)"
echo "bridge:           $(find src/bridge -type f | wc -l)"
echo "tui:              $(find src/tui -type f | wc -l)"
echo "realtime:         $(find src/realtime -type f | wc -l)"
echo "daemon:           $(find src/daemon -type f | wc -l)"
echo "cron:             $(find src/cron -type f | wc -l)"
echo "telemetry:        $(find src/telemetry -type f | wc -l)"
echo "i18n keys:        $(grep -cE "^\s+\| '" src/i18n/strings.ts)"
echo "test files:       $(find src -name '*.test.ts' | wc -l)"
```

> If any number doesn't match, please open an issue with the command output. We treat command output as authoritative.

---

## License

MIT License. See [LICENSE](./LICENSE).

---

<p align="center">
  <strong>UpUp (涨涨) — 涨,涨,一直涨。</strong><br/>
  <sub>Chinese-language financial research AI in your terminal · Forked from <a href="https://github.com/virattt/dexter">virattt/dexter</a></sub>
</p>
