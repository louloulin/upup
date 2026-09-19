# Architecture Overview

> Production Agent execution is Pi-backed. The former `src/agent/` custom loop and
> LangChain runtime are removed; use `docs/architecture/pi5-runtime.md` as the
> canonical migration architecture and `pi5.md` for acceptance evidence.

> **The full architecture is in [ARCHITECTURE.md](../../ARCHITECTURE.md)** (the canonical document, 334 lines, layers + boundaries). This page is the user-facing overview.

---

## High-Level View

```
┌────────────────────────────────────────────────────────────────┐
│  User (TUI / CLI / Script)                                      │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│  CLI Layer (src/cli.tsx + src/index.tsx)                       │
│    • Ink TUI                                                    │
│    • Slash command autocomplete (pi-tui)                       │
│    • Permission prompts                                         │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│  Pi Runtime Adapter (src/runtime/pi/)                          │
│    • Pi AgentSession and pi-agent-core tool loop               │
│    • Pi session tree / compaction / streaming events           │
│    • UpUp policy, evidence, audit and compatibility adapters   │
│    • Investment profiles and Pi-backed subagent workers        │
└─────┬──────────┬──────────┬──────────┬──────────┬──────────┐
      │          │          │          │          │           │
      ▼          ▼          ▼          ▼          ▼           ▼
  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
  │Tools │  │Skills│  │Memory│  │ MCP  │  │Plugins│  │Hooks │
  │(64+) │  │(50+) │  │      │  │      │  │       │  │      │
  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘
      │          │          │          │          │           │
      ▼          ▼          ▼          ▼          ▼           ▼
┌────────────────────────────────────────────────────────────────┐
│  LLM Provider (OpenAI / Anthropic / Google / xAI / OpenRouter  │
│              / Ollama / DeepSeek)                               │
└────────────────────────────────────────────────────────────────┘
```

---

## The 8 Layers

The architecture follows a strict 8-layer pattern (see [ARCHITECTURE.md](../../ARCHITECTURE.md) for the full rule set):

| Layer | Module(s) | Purpose |
|---|---|---|
| L0 | External deps | npm packages |
| L1 | `src/utils/` | Pure utilities, no business logic |
| L2 | `src/types/` | Pure types |
| L3 | `src/storage/` | Persistence (SQLite, JSON, DuckDB) |
| L4 | `src/runtime/pi/` | Pi AgentSession, model and event adapter |
| L5 | `src/tools/` | External actions (bash, finance tools, search, browser) |
| L6 | `src/skills/` | Domain knowledge (SKILL.md + bundled) |
| L7 | `src/runtime/pi/`, `src/commands/`, `src/coordinator/` | Pi-backed orchestration and investment workflows |
| L8 | `src/cli.tsx` | User interface |

Dependencies flow strictly upward. A Layer-N module can only import from Layer-0 through Layer-N.

---

## Agent Loop

The production loop is Pi's `AgentSession`/`pi-agent-core`, created through `src/runtime/pi/agent-session-factory.ts`. Each turn:

```
1. Pi reads the session tree and current context
2. Pi streams the provider response through `pi-ai`
3. Pi executes registered tools with `AbortSignal`, progress and details
4. UpUp adapters apply profile permissions and attach evidence/audit metadata
5. Pi appends messages and tool results to the session
6. UpUp maps Pi events to CLI/Gateway/SDK event contracts
```

Final synthesis is emitted by the Pi session; UpUp does not maintain a second model runtime or custom Agent loop.

---

## Scratchpad

Pi's session tree is the source of truth for messages and tool results. UpUp's evidence and workflow entries add financial traceability:

- Tool results are appended as Pi session entries
- Pi compaction preserves the active branch and context summary
- Financial entries retain ticker, market, `asOf`, assumptions, risks and evidence IDs

This is more deterministic than rolling-window truncation.

---

## Investment Workflow (5-Phase)

See [docs/investment-workflow.md](../../investment-workflow.md) for the deep dive. The TL;DR:

```
detect → plan → execute → verify → report
```

Implemented in `src/commands/investment/invest.ts` as a state machine. Each phase has:
- A success criterion
- A failure mode
- A fallback path

---

## Plugin System

See [docs/plugins.md](../../plugins.md). 4 runtime adapters:

| Runtime | Speed | Isolation | File |
|---|---|---|---|
| `bun` | ⚡⚡⚡ | process | `src/plugins/adapters/bun.ts` |
| `jiti` | ⚡⚡ | process | `src/plugins/adapters/jiti.ts` |
| `wasm` | ⚡ | wasm | `src/plugins/adapters/wasm.ts` |
| `mcp` | 🌐 | mcp | `src/plugins/adapters/mcp.ts` |

Plugins register via `ctx.registerTool / Skill / Hook / Command / DataSource`.

---

## i18n

See [docs/i18n.md](../../i18n.md). `src/i18n/strings.ts` — EN + zh-CN, strongly-typed, symmetry enforced by tests.

---

## Session & Permission

See [docs/session-and-permissions.md](../../session-and-permissions.md). 3-layer defense:

1. Static bypass rules
2. Per-tool mode (bypass / allow / ask / deny)
3. Session mode (default / accept-all / bypassPermissions / dangerously)

Default: `ask`. Never bypass without explicit user action.

---

## Memory

`packages/memory` + `src/memory/`:

- **Long-term memory** — SQLite (`.upup/memory.db`)
- **Observation buffer** — current session, in-memory
- **Extraction hook** — LLM-driven fact extraction from conversations
- **Audit chain** — HMAC-signed entries, tamper-evident

---

## Data Flow

For a typical `/invest 600519.SH 2025Q3`:

```
1. CLI → /invest command
2. invest.ts → investment-workflow.ts
3. Phase 1 (detect) → Investment Explore Agent
4. Phase 2 (plan)   → Investment Plan Agent
5. Phase 3 (execute)→ parallel: Tushare + AKShare + browser
                       └─ results → scratchpad
6. Phase 4 (verify) → cross-validate (Tushare vs AKShare vs 东财)
                       └─ cite density check
7. Phase 5 (report) → LLM compose markdown from scratchpad
                       └─ save to .upup/reports/
                       └─ print to stdout
```

Each phase yields events that the CLI renders in real-time.

---

## 16 Workspace Packages

| Package | Purpose |
|---|---|
| `pi-finance-sdk` | Pi-native financial extensions, skills, prompts and eval contracts |
| `commands` | Unified command registry |
| `cron` | Scheduled tasks |
| `daemon` | Background process |
| `gateway` | HTTP / WebSocket gateway |
| `hooks` | Hook runtime |
| `keybindings` | Key bindings |
| `llm` | Provider/configuration compatibility helpers; production model protocol is `pi-ai` |
| `mcp` | MCP client/server |
| `memory` | Persistent memory |
| `plugin-sdk` | Plugin author SDK |
| `plugins` | Plugin infrastructure |
| `sdk` | Generic SDK |
| `skills` | Skill runtime |
| `state` | State management |
| `types` | Shared types |
| `utils` | Utilities |

---

## See Also

- **[ARCHITECTURE.md](../../ARCHITECTURE.md)** — the canonical 334-line architecture doc
- **[CODE-MAP.md](../../CODE-MAP.md)** — every file in 151 lines
- [docs/quickstart.md](../../quickstart.md) — getting started
- [docs/investment-workflow.md](../../investment-workflow.md) — 5-phase workflow
- [docs/skills.md](../../skills.md) — skills
- [docs/plugins.md](../../plugins.md) — plugins

---

<p align="center"><strong>Read the code, it's the documentation of last resort.</strong></p>
