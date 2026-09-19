# UpUp (涨涨) 📈

> **Pi-native AI investment assistant** — a Chinese-first deep-research agent in your terminal: A-share / Hong Kong / US market quotes and fundamentals, filings and regulatory documents, valuation / portfolio / risk / backtest / quant / technicals, and the 5-stage `/invest` research workflow.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Runtime: Pi 0.85.1](https://img.shields.io/badge/runtime-earendil--works%2Fpi%200.85.1-6c5ce7.svg)](https://github.com/earendil-works/pi)
[![i18n: EN | zh-CN](https://img.shields.io/badge/i18n-EN%20%7C%20zh--CN-ff69b4.svg)](#i18n)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[中文](./README.md) · [Changelog](./CHANGELOG.md) · [Contributing](./CONTRIBUTING.md) · [Architecture](./docs/ARCHITECTURE.md)

> 🇬🇧 **This is the English README.** The Chinese README ([`README.md`](./README.md)) is the GitHub default entry.

![UpUp CLI welcome screen](./docs/images/upup-welcome.png)

---

## Positioning: Pi is the runtime, UpUp is the product

UpUp does **not** reimplement an agent. The agent loop, the interactive TUI (`InteractiveMode`), tool execution, bash / sandbox, sessions and compaction, settings and themes, the extension host, and the provider catalog all come from
`@earendil-works/pi-*` (**pinned to `0.85.1`**, wired in through the `pi` manifest in `package.json` — no fork).

UpUp contributes only what Pi does not have:

| Concern | Provided by the Pi runtime | Contributed by UpUp |
|---|---|---|
| Agent loop | ✅ `AgentSession` (`createAgentSession()`) | No rewrite, only assembly |
| TUI / interaction | ✅ `InteractiveMode` (editor, completion, themes, keybindings) | Registers status line / theme / investment widget |
| Bash / sandbox | ✅ `bash` / `read` / `write` / `edit` / `grep` / `find` / `ls` | Injects finance command allowlist and fail-closed policy |
| Sessions / compaction | ✅ `SessionManager`, `compaction` | Investment dossier recovery across days and processes |
| Settings / themes | ✅ `SettingsManager`, `theme` | `upup-dark` theme + branded system prompt |
| Extension host | ✅ `ExtensionAPI`, `DefaultPackageManager` | 37 Pi Packages (tools / skills / prompts / policies / evals) |
| Provider catalog | ✅ 40+ providers (`pi-ai`) | A-share data stack, research workflow, investment memory, WhatsApp channel |

**There is exactly one way to extend UpUp: a Pi Package.** Every capability declares
`extensions` / `skills` / `prompts` / `workflows` / `policies` / `evals` / `tools` / `sideEffects` under `package.json#pi`,
and is loaded by Pi's `DefaultPackageManager` + `DefaultResourceLoader`. Building an agent loop, tool registry, or skill registry inside the root `src/` is forbidden.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Entry (UpUp bootstrap, 2 production files / 7 lines)                  │
│   src/index.tsx ──▶ @upup/pi-app/entry                               │
│   src/bootstrap/gateway.ts ──▶ runGatewayCli(...)                    │
│   ensureUpupAgentDir()  ──▶ PI_CODING_AGENT_DIR=~/.upup/agent        │
└───────────────────────────┬──────────────────────────────────────────┘
                            │  dynamic import (must happen after env publication)
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Pi runtime (node_modules, unmodified)                                 │
│   InteractiveMode │ AgentSession │ ExtensionAPI │ SessionManager      │
│   DefaultPackageManager │ DefaultResourceLoader │ ModelRegistry       │
└───────────────────────────▲──────────────────────────────────────────┘
                            │  pi manifest (extensions / skills / tools / policies)
┌───────────────────────────┴──────────────────────────────────────────┐
│ UpUp Pi Packages (37 workspaces)                                      │
│   pi-app · pi-session · pi-runtime · pi-event-adapter · …            │
│   pi-finance-sdk · pi-market-data · pi-investment-workflow · …       │
└──────────────────────────────────────────────────────────────────────┘
```

Four non-negotiable constraints, enforced by static gates:

- **Single agent core** — `PiAgentSessionFactory` in `@upup/pi-session/agent-session-factory.ts` is the only production entry point that creates an `AgentSession` (`check:pi7` rejects a second factory).
- **Single assembly entry** — `getPiNativeApp()` in `@upup/pi-app/default`: package catalog, research profiles, policy, session / memory / storage, event sink, transport adapters.
- **Single event protocol** — `@upup/pi-event-adapter` is the only place where Pi canonical events are adapted to external protocols.
- **fail-closed by default** — five high-risk tools (`config_set` / `write_file` / `mcp_auth_get` / `notify` / `place_trade_order`) default to `deny` in the Pi policy layer and never run without explicit approval.

---

## Quick start

### Requirements

- **Bun** ≥ 1.0 (`curl -fsSL https://bun.sh/install | bash`)
- A POSIX shell (zsh / bash)

### Install and run

```bash
git clone https://github.com/louloulin/upup.git
# Mirror: git clone https://gitcode.com/lumosaigroup/upup.git
cd upup
bun install
bun run start          # interactive CLI (enters the Pi InteractiveMode)
bun run dev            # watch mode
```

### Minimal `.env`

```bash
cat > .env <<'EOF'
# LLM key (at least one)
DEEPSEEK_API_KEY=sk-...         # recommended for Chinese financial scenarios
OPENAI_API_KEY=sk-...           # or
ANTHROPIC_API_KEY=sk-ant-...    # or
GOOGLE_API_KEY=...
XAI_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
MOONSHOT_API_KEY=...

# Search (at least one)
EXASEARCH_API_KEY=...           # preferred
TAVILY_API_KEY=tvly-...         # fallback

# Financial data
FINANCIAL_DATASETS_API_KEY=...  # US equities
TUSHARE_TOKEN=...               # A-share / HK (https://tushare.pro)
AKSHARE_ENABLED=1               # keyless, public endpoints
EOF
```

### First conversation

```bash
upup                      # enters the TUI
> /invest 评估宁德时代
> /screen A股 流动性前20 PE<15
> /dossier 600519.SH
> /model deepseek deepseek-v4-pro
```

---

## Investment workflow: `/invest`

UpUp's core capability. The five stages are implemented by separate Pi Packages, and each stage produces an auditable artifact:

| Stage | What it does | Artifact |
|---|---|---|
| **1. detect** | Intent classification, sector routing, urgency grading | `intent.json` |
| **2. plan** | Renders the research plan; the user confirms or edits it (plan mode) | `plan.md` |
| **3. execute** | Multi-profile execution (research / analysis / risk / portfolio / backtest) | `evidence/*.json` |
| **4. verify** | Cross-source consistency checks, citation graph, hallucination interception | `verification.json` |
| **5. report** | Assembles dossier / strategy / earnings-preview / risk-dashboard | `report.md` + `report.json` |

Seven serializable profiles: `researcher`, `analyst`, `risk-manager`, `portfolio-manager`, `backtest-engineer`, `monitor`, `reviewer`.

### Investment commands

These commands are registered by `@upup/pi-finance-sdk/extensions/commands.ts` through Pi's `ExtensionAPI.registerCommand`.
General-purpose commands such as `/model`, `/session`, `/compact`, `/theme`, and `/resume` come straight from Pi — UpUp does not reimplement them.

```text
/invest  [inv]           5-stage investment research workflow
/dossier [doss] <ticker> one-page investment memo
/strategy [strat]        browse / create / audit investment strategies
/risk-dashboard [risk]   risk dashboard
/portfolio-review [pr]   portfolio review
/morning-brief [mb]      morning brief
/earnings-preview [ep]   earnings preview
/watchlist-edit [wl]     edit the watchlist
/screen [scr] <filter>   multi-factor screening
```

CLI subcommands:

```text
upup (in the TUI: /login <provider>)  authenticate + write ~/.upup/agent/auth.json
upup doctor                  health checks
upup config get|set|list     configuration management
upup plugin install|list     manage Pi Packages (thin wrapper over DefaultPackageManager)
upup openbuddy status|migrate|verify
                             migrate an old Pi home into ~/.upup/agent
upup --stdio                 JSON-RPC over stdio (external integration)
upup --acp                   ACP protocol mode
```

---

## Agent home: `~/.upup/agent`

UpUp owns its own global Pi home. Pi resolves the agent dir through `PI_CODING_AGENT_DIR`
(`config.js#getAgentDir()`), and the UpUp entry calls `ensureUpupAgentDir()`
(`@upup/pi-app/bootstrap-agent`) to publish that path to Pi **before any dynamic import of `@earendil-works/pi-*`** — this is configuration, not a fork.

`resolveAgentDir` (`@upup/pi-resource-composition/agent-dir`) precedence:

1. the `override` argument (tests / embedding)
2. `UPUP_AGENT_DIR`
3. `UPUP_CODING_AGENT_DIR` (Pi-style naming)
4. `PI_CODING_AGENT_DIR` (the user has explicitly pointed at some Pi agent dir)
5. **`~/.upup/agent`** — the canonical default, **constant** (it does not depend on whether the directory already exists, and it does not change with `cwd`)

```
~/.upup/agent/
├── settings.json      model / provider / theme / compaction (where `/model` persists)
├── models.json        custom providers / model tables
├── auth.json          API keys (0600)
├── themes/            includes UpUp's bundled upup-dark.json
├── prompts/           prompt templates
├── skills/            user skills
├── extensions/        user extensions
└── sessions/          session records
```

On first launch, `bootstrapUpupAgentSync()` seeds the old Pi home (`~/.pi/agent`, overridable via `UPUP_MIGRATE_FROM`)
in one pass, with an allowlist of `settings.json` / `models.json` / `auth.json` / `themes/` / `prompts/` / `skills/` / `extensions/`:

- **Existing files are never overwritten**; `auth.json` / `models.json` are forced to `0600` after copying
- `sessions/`, caches, and logs are deliberately **not** migrated
- Built-in themes (`dark` / `light` / `auto` / unset) are rewritten to `upup-dark`; **user-defined themes are left alone**
- You can re-run it manually at any time: `upup openbuddy migrate [--dry-run] [--force]`

**Project-level** configuration lives in `<cwd>/.upup/` (`.upup/settings.json` takes precedence; `.pi/settings.json` is only a compatibility fallback, and UpUp never writes to `.pi/`).

---

## Branding: UpUp, not Pi

Pi's default system prompt hardcodes its own identity (`You are an expert coding assistant operating inside pi, a coding agent harness.`).

UpUp does not modify Pi. Instead it uses Pi's official `before_agent_start` extension point
(`BeforeAgentStartEventResult.systemPrompt`, which chains across extensions) to rewrite the system prompt for that turn:
`createUpUpBrandExtension()` (`@upup/pi-runtime/brand-extension`) performs exactly six anchored replacements,
leaving every other Pi guideline / tool snippet / doc path / skill untouched. The extension is registered in both the
TUI entry (`@upup/pi-app/pi-native-cli`) and the headless factory (`@upup/pi-session/agent-session-factory`).

---

## Workspace: 37 Pi Packages

Live output of `bun run report:pi7` (current baseline):

| Metric | Value |
|---|---|
| workspace packages | **37** |
| declaring a `pi` manifest | 37 |
| declaring real Pi resources (extensions / skills / tools / policies / evals) | 19 |
| registered tool names | 269 |
| in-repo skills | 47 |
| production files in root `src/` | **2** (7 lines) |

<details>
<summary>Full package list</summary>

**Runtime and assembly**
`pi-runtime`, `pi-session`, `pi-resource-composition`, `pi-capability-registry`, `pi-event-adapter`, `pi-prompt-config`, `pi-cli-bootstrap`, `pi-app`

**Finance domain**
`pi-finance-sdk`, `pi-market-data`, `pi-investment-analysis`, `pi-investment-workflow`, `pi-risk`, `pi-portfolio`, `pi-backtest`, `pi-research`, `pi-browser`, `pi-technical`, `pi-corporate-actions`, `pi-quant`, `pi-notify`

**Platform and infrastructure**
`pi-config`, `pi-cache`, `pi-platform`, `pi-storage`, `pi-memory`, `pi-permissions`, `pi-observability`, `pi-planning`, `pi-management`, `pi-evals`

**Channels and peripherals**
`gateway`, `cron`, `daemon`, `mcp`, `memory`, `types`, `utils`

</details>

Tool surface (registered as Pi extensions): `financial_search`, `financial_metrics`, `read_filings`, `web_search`,
`browser`, `skill`, `invest_workflow`, `evaluate_trade`, `run_backtest`, `get_backtest_summary`, and more.
Ownership and native registration reports are available via `bun run report:pi7`.

---

## LLM providers

Provider and model metadata all come from the Pi catalog; UpUp only keeps a curated ordering plus the Ollama registration.

| Provider | Supported | Notes |
|---|:---:|---|
| OpenAI | ✅ | default |
| Anthropic | ✅ | explicit `cache_control` prompt caching |
| Google (Gemini) | ✅ | |
| xAI (Grok) | ✅ | |
| Moonshot (Kimi) | ✅ | |
| DeepSeek | ✅ | recommended for Chinese financial scenarios |
| OpenRouter | ✅ | |
| Ollama | ✅ | local, OpenAI-compatible `/v1`, `ollama:<model>` |
| Other Pi catalog providers | ✅ | minimax / zai / groq / mistral / cerebras … |

```bash
> /model deepseek deepseek-v4-pro
> /model anthropic claude-opus-4-7
```

---

## Extending UpUp: write a Pi Package

The only way to add a capability is to declare a `pi` block in `packages/<name>/package.json` and place resources under `extensions/`, `skills/`, and `prompts/`:

```json
{
  "name": "@upup/pi-my-domain",
  "pi": {
    "extensions": ["extensions/index.ts"],
    "skills": ["skills/**/SKILL.md"],
    "prompts": ["prompts/*.md"],
    "tools": ["my_tool"],
    "sideEffects": { "my_tool": "read" }
  }
}
```

```ts
// extensions/index.ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function extension(pi: ExtensionAPI): void {
  pi.registerTool(/* … */);
  pi.registerCommand('my-command', { description: '…', handler: async (args) => { /* … */ } });
}
```

- Tool side effects must be declared in `pi.sideEffects`; `check:pi-side-effects` enforces this.
- High-risk side effects are fail-closed by default and require explicit approval.
- See [docs/pi-plugin-authoring.md](./docs/pi-plugin-authoring.md) for the full guide.

---

## Static gates and verification

```bash
bun run typecheck              # tsc --noEmit (root src + packages/*/src)
bun test                       # Bun test runner
bun run verify:pi7-final       # 22 product acceptance contracts (C15 skipped when credentials are missing)

bun run check:pi7              # single factory, zero production global registries
bun run check:module-boundaries
bun run check:pi-packages      # Pi manifest contract
bun run check:pi-side-effects  # tool side-effect declarations
bun run check:pi-runtime       # Bun/Node versions and build target
bun run check:no-self-impl     # no name collisions with Pi canonical exports
bun run check:tui-bridge-cleanup
bun run check:pi-deletion-audit
bun run check:pi-package-audit
bun run check:upup-home        # every ~/.upup path must go through $UPUP_HOME

bun run report:pi7             # live structural baseline
```

CI (`.github/workflows/ci.yml`) runs the gates above plus `typecheck` and `bun test`, and a separate `verify:pi7-final` job.
CI does not build `dist/`: all 37 workspace packages expose a `"bun": "./src/*.ts"` condition in `exports`, so source is resolved directly.

---

## i18n

CLI strings, prompts, and skill descriptions are bilingual (EN + zh-CN); a missing translation fails the gates.

```bash
> /lang zh-CN
> /lang en
```

---

## Security

- API keys live in `.env` (gitignored), or can be entered interactively through the CLI.
- Configuration lives in `~/.upup/agent/settings.json` and `<cwd>/.upup/settings.json` (gitignored).
- Real trading, outbound notifications, credential access, and file writes go through the sandbox by default; nothing runs without explicit approval (enforced by the Pi policy layer).
- Every tool call is written to the session / audit streams and can be replayed.
- **Never commit or expose real API keys, tokens, or credentials.**

> UpUp is a **research tool**. It does not execute real-money trades.

---

## Documentation index

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — architecture overview
- [docs/pi-plugin-authoring.md](./docs/pi-plugin-authoring.md) — writing a Pi Package
- [docs/investment-workflow.md](./docs/investment-workflow.md) — the 5-stage research workflow
- [docs/skills.md](./docs/skills.md) — the skill system
- [docs/quickstart.md](./docs/quickstart.md) — quick start
- [docs/faq.md](./docs/faq.md) — FAQ
- [Pi Native migration record](./docs/internal/migrations/pi7.md) — migration plan and sign-off (archived)
- [AGENTS.md](./AGENTS.md) — repository engineering constraints (required reading for contributors / agents)

---

## Acknowledgements

- **[Pi](https://github.com/earendil-works/pi)** — the version-pinned AgentSession / ExtensionAPI / TUI / session / package runtime
- **[Tushare Pro](https://tushare.pro)** — A-share data
- **[AKShare](https://github.com/albertandking/akshare)** — A-share / HK / fund data
- **[Eastmoney](https://www.eastmoney.com)** — A-share fallback data source
- **[Playwright](https://playwright.dev)** — browser automation
- **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** — change-driven development

## History and license

The repository started from [virattt/dexter](https://github.com/virattt/dexter) (MIT). The 2026-09 Pi Native migration replaced the entire agent / TUI / transport / session layer with the Pi runtime, and the dexter-era implementation is no longer a production path. This note is retained only to satisfy the MIT attribution requirement.

[MIT](./LICENSE)
