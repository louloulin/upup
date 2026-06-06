# UpUp (涨涨) - AI Agent Project Guide

> Deep Financial Research AI Agent — Bun Workspace Monorepo

## Project Overview

**UpUp** is a deep financial research AI agent built as a **bun workspace monorepo** with 34 packages across 7 architectural layers. The `src/` directory contains only 5 thin shell files; all business logic lives in `packages/*`.

## Quick Links

| Document | Description |
|---------|-------------|
| [README.md](README.md) | English documentation |
| [README_CN.md](README_CN.md) | 中文文档 |
| [SOUL.md](SOUL.md) | Design philosophy |
| [AGENTS.md](AGENTS.md) | Agent system design |

## Key Commands

```bash
# Development
bun start                     # Interactive CLI (src/index.tsx → @upup/index-app)
bun dev                       # Watch mode
bun run src/run.ts "prompt"   # Non-interactive agent runner

# Workspace
bun install                   # Install all workspace dependencies
bun run typecheck             # Typecheck src/ shell files
bun run build:packages        # Typecheck all 34 packages in topological order
bun run lint:boundaries       # Enforce workspace boundary rules

# Testing
bun test                      # Run all tests across packages
bun test packages/agent-runtime/  # Run tests for a specific package

# Build
bun run build                 # Compile binary
./dist/upup                   # Run compiled binary
```

## Architecture — 7 Layers

| Layer | Purpose | Packages |
|-------|---------|----------|
| L1 | Foundations | `@upup/types`, `@upup/utils` |
| L2 | Core abstractions | `@upup/llm`, `@upup/hooks`, `@upup/keybindings`, `@upup/state`, `@upup/tui-renderer`, `@upup/agent-runtime`, `@upup/memory-system` |
| L3 | Infrastructure | `@upup/storage`, `@upup/telemetry` |
| L4 | Runtime capabilities | `@upup/tools-registry`, `@upup/finance-tools`, `@upup/skills`, `@upup/mcp`, `@upup/plugins`, `@upup/cron`, `@upup/daemon`, `@upup/session-system`, `@upup/realtime-channel`, `@upup/bridge-system`, `@upup/coordinator-system`, `@upup/plan-system`, `@upup/research-system`, `@upup/multimodal-system`, `@upup/gateway` |
| L5 | Application services | `@upup/services-core` |
| L6 | Application shell | `@upup/cli`, `@upup/commands` |
| L7 | Entry shell | `@upup/index-app` |
| SDK | Plugin SDKs | `@upup/sdk`, `@upup/plugin-sdk`, `@upup/memory`, `@upup/adapter-paperclip` |

## src/ Shell (5 files)

| File | Delegates to |
|------|-------------|
| `src/index.tsx` | `@upup/index-app` |
| `src/cli.ts` | `@upup/cli` |
| `src/run.ts` | `@upup/agent-runtime` |
| `src/bundled-runner.ts` | `@upup/agent-runtime` |
| `src/theme.ts` | `@upup/tui-renderer/theme` |

## Workspace Scripts

| Script | Purpose |
|--------|---------|
| `scripts/build-packages.ts` | DAG topological typecheck of all 34 packages |
| `scripts/lint-boundaries.ts` | Enforce src/ shell + detect undeclared deps |
| `scripts/check-scc.ts` | Source code complexity check |

## Adding a New Package

1. Create `packages/my-package/` with `package.json`, `tsconfig.json`, `src/`
2. Add `"@upup/my-package": "workspace:*"` to dependent packages
3. Add `paths` entry in each dependent package's `tsconfig.json`
4. Run `bun install` to link the workspace

## Permission System

UpUp uses multi-layer permissions (inspired by Claude Code):

- **Session Mode**: `default`, `accept-all`, `bypassPermissions`, `dangerously`
- **Bash Mode**: `bypass`, `allow`, `ask`, `deny`

Key files:
- `packages/services-core/src/permissions/` — Permission rules and config
- `packages/agent-runtime/src/agent-port.ts` — Agent port for tool approval
- `packages/cli/src/commands/permissions/` — CLI permission commands

## Financial Features

| Skill | Function |
|-------|----------|
| `medfish` | Medical/pharmaceutical analysis |
| `technical-analysis` | RSI, MACD, Bollinger Bands |
| `backtesting` | Strategy backtesting |
| `risk-management` | Risk tools |
| `sentiment-analysis` | Sentiment analysis |

Skills live in `packages/skills/src/`. The skill tool is exposed via `@upup/tools-registry`.

## Development Notes

1. **TypeScript First**: All code is TypeScript, strict mode enabled
2. **Bun Runtime**: Primary runtime (bun >= 1.0)
3. **LangChain**: LLM integration via `@langchain/core` 1.1.x
4. **Permission Safety**: All dangerous operations require explicit approval
5. **Workspace Convention**: L1 → L7 layering; no upward imports allowed

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` — LLM provider
- `TUSHARE_TOKEN` — A-share data (required for Chinese stocks)
- `EXASEARCH_API_KEY` — Web search (preferred)
- `TAVILY_API_KEY` — Web search (fallback)

## Troubleshooting

```bash
# Permission issues
DEBUG=permissions bun start

# Type errors after adding a new package
bun install && bun run typecheck

# Boundary violations (importing from wrong layer)
bun run lint:boundaries

# Build errors
bun run typecheck && bun run build:packages
```

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
