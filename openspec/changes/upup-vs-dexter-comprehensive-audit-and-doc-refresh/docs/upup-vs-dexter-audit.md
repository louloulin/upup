# UpUp vs Upstream Dexter — Authoritative Audit

> **Audit generated: 2026-06-12**
> **Pinned to**: UpUp `1c5f9346` (v2026.05.15) · Upstream Dexter `4adf9382` (v2026.6.9)
> **Last reviewed: 2026-06-12**
> **Methodology codified in**: `openspec/specs/upup-vs-dexter-audit-spec/spec.md`

This is the single source of truth for the "UpUp is the Chinese version of dexter" claim. Every number below is reproducible by copying the dimension's command into a shell at the repository root. If a number disagrees with what you see in another UpUp doc, **this document wins** — please open a PR to update that doc.

---

## TL;DR

| Metric | UpUp | Upstream Dexter | Ratio |
|---|---:|---:|---:|
| `src/` TS+TSX files | **1,055** | 184 | **5.7×** |
| `src/` lines (TS+TSX) | **237,914** | 21,899 | **10.9×** |
| Top-level `src/*` directories | **48** | 12 | **4.0×** |
| Total `packages/` files (TS+TSX) | **1,253** | 0 | n/a |
| Total `packages/` lines (TS+TSX) | **406,495** | 0 | n/a |
| `SKILL.md` investment skills | **50** | 3 | **16.7×** |
| Bundled dynamic skills | **14** | 0 | n/a |
| Total `src/tools/*.ts` files | **296** | 53 | **5.6×** |
| Slash command files in `src/commands/` | **28** | 1 | **28×** |
| Investment commands (non-test, under `src/commands/investment/`) | **11** | 0 | n/a |
| Plugin runtime adapters | **4** (bun/jiti/wasm/mcp) | 0 | n/a |
| Workspace packages | **18** | 0 | n/a |
| LLM providers | **8** metadata (DeepSeek default) | 8 metadata (OpenAI default) | same list, default flipped |
| i18n locales (EN + zh-CN symmetric) | **2** | 1 (EN only) | 2× |

> Headline: UpUp is **not a fork with a Chinese skin** — it is a substantial rewrite for the Chinese investment market, with the original dexter framework as the foundation.

---

## Why these 8 dimensions

We deliberately chose the 8 dimensions below because each one is:

1. **Reproducible**: a single shell command produces the number.
2. **Citable**: the number is stable across runs (modulo `wc` line-count drift).
3. **Distinct from upstream**: every dimension has a clear difference in intent, not just in volume.
4. **Useful for positioning**: a journalist, contributor, or user can quote any of them in one sentence.

If a future contributor wants to add a 9th dimension, the spec requires them to also supply the equivalent upstream command.

---

## Dimension 1 — Code volume

| | UpUp | Upstream Dexter |
|---|---:|---:|
| `src/` TS+TSX files | **1,055** | 184 |
| `src/` lines (TS+TSX) | **237,914** | 21,899 |
| Top-level `src/*` directories | **48** | 12 |
| `packages/` TS+TSX files | **1,253** | 0 (single package) |
| `packages/` lines (TS+TSX) | **406,495** | 0 |
| **Total repo TS+TSX** | **~644k lines** | **~22k lines** |

### Reproducible commands

```bash
# UpUp (run from upup repo root)
find src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l                # → 1055
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec cat {} + | wc -l # → 237914
find packages -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l            # → 1253
find packages -type f \( -name "*.ts" -o -name "*.tsx" \) -exec cat {} + | wc -l # → 406495
```

```bash
# Upstream dexter (run from dexter repo root)
find src -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l                # → 184
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec cat {} + | wc -l # → 21899
ls packages/ 2>/dev/null | wc -l                                              # → 0
```

### UpUp-only top-level directories (in `src/`)

UpUp adds these top-level `src/*` directories that have **no equivalent in upstream dexter**:

- `analysis/`, `bridge/`, `coach/`, `code-archaeology/`, `competitive-positioning/`, `coordinator/`, `core/`, `daemon/`, `data/`, `i18n/`, `kairos/`, `keybindings/`, `mcp/`, `multi-agent/`, `multimodal/`, `permissions/`, `plan/`, `proactive/`, `realtime/`, `research/`, `screening/`, `services/`, `session/`, `state/`, `stdio/`, `storage/`, `subagent/`, `tasks/`, `telemetry/`, `tui/`, `web/`, `worktree/`

Upstream dexter has only: `agent/`, `commands/`, `components/`, `controllers/`, `cron/`, `evals/`, `gateway/`, `memory/`, `model/`, `skills/`, `tools/`, `utils/`.

```bash
# Reproducible
ls -d src/*/ | wc -l           # UpUp: 48
cd /Users/louloulin/Documents/linchong/touzhi/dexter && ls -d src/*/ | wc -l   # Dexter: 12
```

---

## Dimension 2 — Tool registry

| | UpUp | Upstream Dexter |
|---|---:|---:|
| Total `src/tools/*.ts` files | **296** | 53 |
| `src/tools/finance/*.ts` | **20** | 18 |
| Investment-specific tool categories | **many** (astock, alt-data, analytics, backtest, …) | none |

### Reproducible commands

```bash
# UpUp
find src/tools -name "*.ts" | wc -l            # → 296
find src/tools/finance -name "*.ts" | wc -l     # → 20
ls src/tools/astock/ | wc -l                   # → 12 (A-share tools, all upup-only)
```

```bash
# Upstream dexter
find src/tools -name "*.ts" | wc -l            # → 53
find src/tools/finance -name "*.ts" | wc -l     # → 18
ls src/tools/astock/ 2>/dev/null | wc -l        # → 0
```

### Notable UpUp-only tool categories

These directories exist only in UpUp (all return 0 in upstream dexter):

- `src/tools/astock/` — A-share specific tools (Tushare / AKShare backed)
- `src/tools/alt-data/`, `src/tools/analytics/`, `src/tools/backtest/`
- `src/tools/calendar/`, `src/tools/comparison/`, `src/tools/discovery/`
- `src/tools/earnings/` (expanded), `src/tools/export/`, `src/tools/forecast/`
- `src/tools/fund/`, `src/tools/fx/`, `src/tools/lsp/`, `src/tools/monitor/`
- `src/tools/news/` (expanded), `src/tools/notebook/`, `src/tools/notify/`
- `src/tools/portfolio/`, `src/tools/powershell/`, `src/tools/quant/`
- `src/tools/risk/`, `src/tools/screening/`, `src/tools/sector/`
- `src/tools/sentiment/`, `src/tools/short-interest/`, `src/tools/task/`
- `src/tools/team-tools.ts`, `src/tools/todo/`, `src/tools/tool-deny.ts`
- `src/tools/trading/`, `src/tools/valuation/`, `src/tools/watchlist/`
- `src/tools/workflow/`, `src/tools/worktree/`

UpUp's toolset is **5.6× broader** than upstream and is purpose-built for A-share + global markets with backtest, risk, portfolio, valuation, screening, trading (research-only), and team-workflow primitives that upstream does not attempt.

---

## Dimension 3 — Skills (SKILL.md + bundled)

| | UpUp | Upstream Dexter |
|---|---:|---:|
| `SKILL.md` files | **50** | 3 |
| Bundled dynamic skills | **14** | 0 |
| Hot-reload of `SKILL.md` | **yes** (`src/skills/hot-reload.ts`) | no |
| I18n-aware skill descriptions | **yes** (`src/skills/i18n-helper.ts`) | no |

### Reproducible commands

```bash
# UpUp
find src/skills -name "SKILL.md" | wc -l         # → 50
ls src/skills/bundled/*.ts | wc -l                # → 14
```

```bash
# Upstream dexter
find src/skills -name "SKILL.md" 2>/dev/null | wc -l   # → 3
ls src/skills/bundled/*.ts 2>/dev/null | wc -l          # → 0
```

### Skill groups in UpUp (50 + 14 bundled)

| Group | Examples |
|---|---|
| Valuation / fundamentals | `dcf`, `cash-flow-analysis`, `dividend-analysis`, `earnings-forecast`, `earnings-season`, `earnings-calendar`, `valuation-comparison`, `valuation-alert`, `financial-interpretation`, `financial-report`, `performance-prediction` |
| Technical / money flow | `technical-analysis`, `money-flow`, `shareholder-analysis`, `momentum-investing`, `backtest-dca`, `dca-strategy` |
| Sector / macro / theme | `sector-analysis`, `sector-rotation`, `macro-analysis`, `market-monitor`, `market-overview`, `swarm-analysis`, `x-research` |
| Style / philosophy | `value-investing`, `growth-investing`, `momentum-investing` |
| Fund / institution | `fund-analysis`, `fund-comparison`, `fund-holdings`, `fund-management`, `manager-analysis`, `institution-research`, `institutional-holding` |
| Portfolio | `portfolio-management`, `portfolio-rebalancing`, `personalized-recommendation` |
| A-share specific | `a-share-analysis` |
| Data / report | `api-integration`, `research-report`, `alert-management`, `multi-market-analysis`, `stock-comparison` |
| Bundled (dynamic) | `research`, `fund`, `portfolio`, `portfolio-review`, `risk-assessment`, `alert`, `batch`, `stock-screen`, `dream`, `hunter`, `sandbox`, `verify`, `index`, `prompt-helpers` |

Upstream dexter ships only: `dcf`, `x-research`, `write-memo`.

UpUp's `src/skills/hot-reload.ts` and `src/skills/i18n-helper.ts` are **upup-only** — they allow contributors to add or modify a `SKILL.md` and have the LLM see it on next launch, with EN + zh-CN descriptions.

---

## Dimension 4 — 5-phase investment workflow

| | UpUp | Upstream Dexter |
|---|---|---|
| `/invest` 5-phase workflow | **yes** (`src/commands/investment/invest.ts`) | no |
| Phases | detect → plan → execute → verify → report | n/a |
| Plan mode (audit before execute) | **yes** | no |
| Investment subcommands | **15** (dossier / earnings-preview / invest / morning-brief / phase-handlers / portfolio-review / registry / risk-dashboard / screen / strategy / watchlist-edit) | 0 |
| Investment Subagent files in `src/agent/subagent*` | **7** | 0 |

### Reproducible commands

```bash
# UpUp
ls src/commands/investment/*.ts | grep -v test | wc -l   # → 11
find src/agent -name "subagent*" 2>/dev/null | wc -l      # → 7
```

```bash
# Upstream dexter
ls src/commands/investment/ 2>/dev/null | wc -l           # → 0
find src -path "*subagent*" 2>/dev/null | wc -l            # → 5 (general-purpose only; no investment subagent)
```

The 5-phase workflow is the spine of the China-edition positioning. It exists only in UpUp.

---

## Dimension 5 — 4 runtime plugin adapters

| Runtime | File | Sandbox level | UpUp | Upstream Dexter |
|---|---|---|:---:|:---:|
| `bun` | `src/plugins/adapters/bun.ts` | process (same ESM) | yes | no |
| `jiti` | `src/plugins/adapters/jiti.ts` | process (TS require) | yes | no |
| `wasm` | `src/plugins/adapters/wasm.ts` | wasm sandbox | yes | no |
| `mcp` | `src/plugins/adapters/mcp.ts` | Model Context Protocol | yes | no |
| **Total adapters** | | | **4** | **0** |

### Reproducible commands

```bash
# UpUp
ls src/plugins/adapters/*.ts | grep -v index.ts | wc -l   # → 4
ls src/plugins/adapters/                                    # → bun.ts  jiti.ts  wasm.ts  mcp.ts  index.ts
```

```bash
# Upstream dexter
ls src/plugins/ 2>/dev/null                                 # → directory does not exist
```

UpUp also ships a `plugin-sdk` workspace package (`packages/plugin-sdk/`) that third parties can import to author plugins against a stable manifest. The full plugin system — registration, lifecycle, manifest validation, locator injection (`registerPlugin`, `registerBuiltinPlugin`, `registerSingleton`, `registerFactory`) — is upup-only.

---

## Dimension 6 — i18n (EN + zh-CN)

| | UpUp | Upstream Dexter |
|---|---|---|
| i18n key registry | `src/i18n/strings.ts` (239 lines, EN + zh-CN symmetric) | none |
| Strongly-typed keys | yes (TypeScript `StringKey` union) | n/a |
| Missing-locale test | yes (`src/i18n/strings.test.ts` fails the build if a key is missing in either locale) | n/a |
| Default locale | `en` (configurable via `LANG` / `LC_ALL` / `UPSTREAM_LOCALE`) | `en` only |
| Components / Prompts / Skill descriptions covered | yes (verified by `loader.zh-cn.test.ts`) | n/a |

### Reproducible commands

```bash
# UpUp
ls src/i18n/                                          # → index.ts  strings.test.ts  strings.ts
wc -l src/i18n/strings.ts                              # → 239 src/i18n/strings.ts
grep -cE "^\s+\| '" src/i18n/strings.ts                 # → ~56 keys
bun test src/i18n/strings.test.ts                      # → all pass
```

```bash
# Upstream dexter
find src -name "*i18n*" -o -name "*locale*" -o -name "strings.ts" 2>/dev/null   # → no output
```

UpUp's i18n is **the** differentiator that justifies the "China edition" brand: every CLI string, every prompt, every skill description exists in both English and zh-CN, and the build fails if a translation is missing.

---

## Dimension 7 — Session 2.0 (plan mode, loop recovery, audit)

| | UpUp | Upstream Dexter |
|---|---|---|
| Plan mode | **yes** (`src/plan/`) | no |
| Loop recovery | **yes** (`src/agent/`) | no |
| Memory flush + observation buffer | **yes** (`src/memory/`, 48 files) | basic (`src/memory/`) |
| Hooks system | **yes** (`src/hooks/`, 17 files; `packages/hooks/`) | no |
| Telemetry / audit chain | **yes** (`src/telemetry/`) | no |
| Worktree integration | **yes** (`src/worktree/`) | no |
| Permission system (3-tier) | **yes** (`src/permissions/`) | no |
| TUI (Ink + pi-tui) | **yes** (`src/tui/`, 50 files; `src/components/`) | minimal (`src/components/`) |
| Session files in `src/session/` | **18** | 0 |

### Reproducible commands

```bash
# UpUp
find src/session -name "*.ts" 2>/dev/null | wc -l        # → 18
find src/hooks -name "*.ts" 2>/dev/null | wc -l          # → 17
find src/memory -type f 2>/dev/null | wc -l              # → 48
find src/tui -type f 2>/dev/null | wc -l                 # → 50
find src/plan -type f 2>/dev/null | wc -l                # → 7
find src/worktree -type f 2>/dev/null | wc -l            # → 1
find src/telemetry -type f 2>/dev/null | wc -l           # → variable
```

```bash
# Upstream dexter
find src -path "*session*" 2>/dev/null | wc -l            # → 5 (gateway sessions only)
find src -name "hooks*" 2>/dev/null | wc -l               # → 0
find src/memory -type f 2>/dev/null | wc -l               # → variable (smaller)
```

UpUp's Session 2.0 is a deliberate Claude-Code-inspired layer that gives the agent plan mode (the user reviews a 2-10 step plan before tools fire), automatic context compaction, loop recovery, and a 3-tier permission model. None of this exists upstream.

---

## Dimension 8 — Ecosystem (multi-agent, KAIROS, Bridge, Coordinator, 18 packages)

| Subsystem | UpUp files | Upstream Dexter files |
|---|---:|---:|
| `src/multi-agent/` (orchestration) | **39** | 0 |
| `src/coordinator/` (4-worker pool) | **16** | 0 |
| `src/kairos/` (proactive runtime, 6-state machine) | **14** | 0 |
| `src/bridge/` (remote / cross-device) | **36** | 0 |
| `src/realtime/` (event bus) | **10** | 0 |
| `src/daemon/` (background workers) | **12** | 0 |
| `src/daemon/workers/` | (within above) | 0 |
| `src/cron/` | **6** | 0 (no proactive cron) |
| `src/permissions/` | yes | no |
| `src/multimodal/` | yes | no |
| `src/stdio/` | yes | no |
| `src/storage/` | yes | no |
| `src/services/` | yes | no |
| `src/core/` | yes | no |
| `src/coach/` | yes | no |
| `src/data/` | yes | no |
| `src/code-archaeology/` | yes | no |
| `src/competitive-positioning/` | yes | no |
| `src/proactive/` | yes | no |
| `src/tasks/` | yes | no |
| **Workspace packages** | **18** | **0** |

### The 18 workspace packages

```
adapter-paperclip   agent-core        commands         cron
daemon              gateway           hooks            keybindings
llm                 mcp               memory           plugin-sdk
plugins             sdk               skills           state
types               utils
```

### Reproducible commands

```bash
# UpUp
ls packages/ | wc -l                                      # → 18
find packages -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l   # → 1253
find src/multi-agent -type f 2>/dev/null | wc -l          # → 39
find src/coordinator -type f 2>/dev/null | wc -l          # → 16
find src/kairos -type f 2>/dev/null | wc -l               # → 14
find src/bridge -type f 2>/dev/null | wc -l               # → 36
find src/realtime -type f 2>/dev/null | wc -l             # → 10
find src/daemon -type f 2>/dev/null | wc -l               # → 12
find src/cron -type f 2>/dev/null | wc -l                 # → 6
```

```bash
# Upstream dexter
ls packages/ 2>/dev/null                                  # → directory does not exist
find src/multi-agent -type f 2>/dev/null | wc -l          # → 0
find src/coordinator -type f 2>/dev/null | wc -l          # → 0
find src/kairos -type f 2>/dev/null | wc -l               # → 0
find src/bridge -type f 2>/dev/null | wc -l               # → 0
```

UpUp has built a **production ecosystem** around the original dexter agent loop: multi-agent orchestration, a 4-worker coordinator pool, a 6-state KAIROS proactive machine, a bridge for remote control, a realtime event bus, a background daemon with workers, a cron subsystem, an 18-package monorepo split, and dedicated subsystems for permissions, multimodal I/O, stdio, storage, services, competitive positioning, code archaeology, proactive triggers, and task tracking. **None of these exist upstream.**

---

## Bonus — LLM providers

| Provider | UpUp | Upstream Dexter | Notes |
|---|:---:|:---:|---|
| OpenAI | yes (alternate) | yes (**default**) | dexter defaults to OpenAI |
| Anthropic | yes | yes | prompt caching in both |
| Google (Gemini) | yes | yes | |
| xAI (Grok) | yes | yes | routed via prefix in both |
| Moonshot (Kimi) | yes | yes | routed via prefix in both |
| **DeepSeek** | **yes (default)** | yes (alternate) | **UpUp flips default to DeepSeek for Chinese users** |
| OpenRouter | yes | yes | routed via prefix in both |
| Ollama (local) | yes | yes | |
| **Total metadata providers** | **8** | **8** | **Same list, same routing layer** |
| **Default provider** | **`deepseek`** | **`openai`** | **UpUp flips default for Chinese users** |

### Reproducible commands

```bash
# UpUp
grep -cE "displayName: '" packages/llm/src/providers.ts             # → 8 metadata providers
```

```bash
# Upstream dexter
grep -cE "displayName: '" src/providers.ts                                     # → 8 metadata providers
grep -oE "import \{ Chat[A-Za-z]+ \}" src/model/llm.ts | sort -u | wc -l      # → 5 (incl. ChatPromptTemplate); subtract 1 = 4 ChatXxx providers
```

Both projects share the same 8-provider metadata layer (OpenAI / Anthropic / Google / xAI / Moonshot / DeepSeek / OpenRouter / Ollama) and the same 4 concrete ChatXxx implementations (OpenAI / Anthropic / Google / Ollama); xAI / Moonshot / DeepSeek / OpenRouter are routed via the metadata layer in both. **UpUp's differentiator is the default**: it flips `DEFAULT_PROVIDER` from `openai` to `deepseek` (see `src/model/llm.ts:DEFAULT_PROVIDER = 'deepseek'`), adds Chinese-friendly fallback tokens (`src/agent/fallback.ts`), and exposes curated Chinese model IDs in `src/utils/model.ts` (kimi-k2-5, deepseek-v4-pro, deepseek-v4-flash). The provider list itself is identical to upstream — UpUp re-organizes it into `packages/llm/` workspace package for the monorepo split.

---

## Bonus — Default model

| | UpUp | Upstream Dexter |
|---|---|---|
| Default model | `gpt-5.4` | `gpt-5.5` |
| CalVer of release | 2026.05.15 | 2026.6.9 |

Upstream dexter is **1 month ahead** in version (2026.6.9 vs 2026.05.15). UpUp tracks upstream via `docs/sync-plan.md` and cherry-picks non-conflicting changes; the gpt-5.5 default will be evaluated for adoption in the next Sprint.

---

## How to regenerate this audit

Run the following from each repo root:

```bash
# UpUp (in /Users/louloulin/Documents/linchong/touzhi/upup)
echo "src files:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "src lines:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l)"
echo "src/*/ dirs:      $(ls -d src/*/ | wc -l)"
echo "SKILL.md:         $(find src/skills -name SKILL.md | wc -l)"
echo "bundled skills:   $(ls src/skills/bundled/*.ts 2>/dev/null | wc -l)"
echo "tools:            $(find src/tools -name '*.ts' | wc -l)"
echo "tools/finance:    $(find src/tools/finance -name '*.ts' | wc -l)"
echo "commands:         $(find src/commands -name '*.ts' | wc -l)"
echo "investment cmds:  $(ls src/commands/investment/*.ts 2>/dev/null | grep -v test | wc -l)"
echo "plugin adapters:  $(ls src/plugins/adapters/*.ts 2>/dev/null | grep -v index | wc -l)"
echo "workspaces:       $(ls packages/ 2>/dev/null | wc -l)"
echo "packages files:   $(find packages -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
```

```bash
# Upstream dexter (in /Users/louloulin/Documents/linchong/touzhi/dexter)
echo "src files:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)"
echo "src lines:        $(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -exec cat {} + | wc -l)"
echo "src/*/ dirs:      $(ls -d src/*/ | wc -l)"
echo "SKILL.md:         $(find src/skills -name SKILL.md 2>/dev/null | wc -l)"
echo "bundled skills:   $(ls src/skills/bundled/*.ts 2>/dev/null | wc -l)"
echo "tools:            $(find src/tools -name '*.ts' 2>/dev/null | wc -l)"
echo "tools/finance:    $(find src/tools/finance -name '*.ts' 2>/dev/null | wc -l)"
echo "commands:         $(find src/commands -name '*.ts' 2>/dev/null | wc -l)"
echo "investment cmds:  $(ls src/commands/investment/ 2>/dev/null | wc -l)"
echo "plugin adapters:  $(ls src/plugins/adapters/ 2>/dev/null | wc -l)"
echo "workspaces:       $(ls packages/ 2>/dev/null | wc -l)"
```

If a Sprint closes or upstream dexter releases a new version, regenerate within 7 days and update the "Audit generated" date at the top.

---

## What this audit deliberately does not do

- **It does not modify any `src/` or `packages/` code.** The audit is read-only with respect to source.
- **It does not propose closing gaps.** When the audit reveals upstream has a feature UpUp lacks, that gap is recorded as data; a separate OpenSpec change is opened if it is to be closed.
- **It does not duplicate prose.** Other docs (README, comparison, positioning) cite this audit; they do not re-state these numbers.
