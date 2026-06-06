# Architecture Overview

> **The full architecture is in [ARCHITECTURE.md](./ARCHITECTURE.md)** (the canonical document, 334 lines, layers + boundaries). This page is the user-facing overview.

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
│  Agent Loop (src/agent/)                                        │
│    • Iterative tool-calling (max 10 iters)                     │
│    • Scratchpad (single source of truth)                       │
│    • Plan mode / Loop recovery / Auto-compact                  │
│    • 5 Investment Subagents (Explore/Plan/Risk/Trade/Review)  │
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

The architecture follows a strict 8-layer pattern (see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full rule set):

| Layer | Module(s) | Purpose |
|---|---|---|
| L0 | External deps | npm packages |
| L1 | `src/utils/` | Pure utilities, no business logic |
| L2 | `src/types/` | Pure types |
| L3 | `src/storage/` | Persistence (SQLite, JSON, DuckDB) |
| L4 | `src/model/` | LLM abstraction |
| L5 | `src/tools/` | External actions (bash, finance tools, search, browser) |
| L6 | `src/skills/` | Domain knowledge (SKILL.md + bundled) |
| L7 | `src/agent/` | Orchestration (loop, plan, subagent) |
| L8 | `src/cli.tsx` | User interface |

Dependencies flow strictly upward. A Layer-N module can only import from Layer-0 through Layer-N.

---

## Agent Loop

`src/agent/agent.ts` is the heart. Each iteration:

```
1. Read messages + scratchpad
2. Call LLM with tools bound
3. LLM returns: text + tool_calls
4. Execute tool_calls (parallel where independent)
5. Write results to scratchpad
6. Yield events (tool_start, tool_end, thinking, answer_start, done)
7. If LLM says done → finalize answer
8. Else → goto 1 (until max iters or stop signal)
```

After the loop, a **separate LLM call** generates the final answer with full scratchpad context (no tools bound). This forces the agent to synthesize rather than keep digging.

---

## Scratchpad

`src/agent/scratchpad.ts` is the single source of truth for tool results within a query. Anthropic-style context management:

- All tool results kept in scratchpad
- When token count exceeds threshold → auto-compact (oldest results cleared/summarized)
- Final answer call gets full scratchpad

This is more deterministic than rolling-window truncation.

---

## Investment Workflow (5-Phase)

See [docs/investment-workflow.md](./investment-workflow.md) for the deep dive. The TL;DR:

```
detect → plan → execute → verify → report
```

Implemented in `src/commands/investment/invest.ts` as a state machine. Each phase has:
- A success criterion
- A failure mode
- A fallback path

---

## Plugin System

See [docs/plugins.md](./plugins.md). 4 runtime adapters:

| Runtime | Speed | Isolation | File |
|---|---|---|---|
| `bun` | ⚡⚡⚡ | process | `src/plugins/adapters/bun.ts` |
| `jiti` | ⚡⚡ | process | `src/plugins/adapters/jiti.ts` |
| `wasm` | ⚡ | wasm | `src/plugins/adapters/wasm.ts` |
| `mcp` | 🌐 | mcp | `src/plugins/adapters/mcp.ts` |

Plugins register via `ctx.registerTool / Skill / Hook / Command / DataSource`.

---

## i18n

See [docs/i18n.md](./i18n.md). `src/i18n/strings.ts` — EN + zh-CN, strongly-typed, symmetry enforced by tests.

---

## Session & Permission

See [docs/session-and-permissions.md](./session-and-permissions.md). 3-layer defense:

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

## 18 Workspace Packages

| Package | Purpose |
|---|---|
| `agent-core` | Agent loop, prompts, scratchpad |
| `commands` | Unified command registry |
| `cron` | Scheduled tasks |
| `daemon` | Background process |
| `gateway` | HTTP / WebSocket gateway |
| `hooks` | Hook runtime |
| `keybindings` | Key bindings |
| `llm` | LLM adapters |
| `mcp` | MCP client/server |
| `memory` | Persistent memory |
| `plugin-sdk` | Plugin author SDK |
| `plugins` | Plugin infrastructure |
| `sdk` | Generic SDK |
| `skills` | Skill runtime |
| `state` | State management |
| `types` | Shared types |
| `utils` | Utilities |
| `adapter-paperclip` | Paperclip adapter |

---

## See Also

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the canonical 334-line architecture doc
- **[CODE-MAP.md](./CODE-MAP.md)** — every file in 151 lines
- [docs/quickstart.md](./quickstart.md) — getting started
- [docs/investment-workflow.md](./investment-workflow.md) — 5-phase workflow
- [docs/skills.md](./skills.md) — skills
- [docs/plugins.md](./plugins.md) — plugins

---

<p align="center"><strong>Read the code, it's the documentation of last resort.</strong></p>
