# UpUp (涨涨) - AI Agent Project Guide

> Deep Financial Research AI Agent — Based on Dexter, Inspired by Claude Code

## Project Overview

**UpUp** is a deep financial research AI agent that combines:
- **Dexter**: Financial analysis framework, tool system, multi-source data integration
- **Claude Code**: Permission management, session state, TUI design, plugin architecture

## Quick Links

| Document | Description |
|---------|-------------|
| [README.md](README.md) | English documentation |
| [README_CN.md](README_CN.md) | 中文文档 |
| [SOUL.md](SOUL.md) | Design philosophy and soul |
| [AGENTS.md](AGENTS.md) | Agent system design |

## Key Commands

```bash
# Development
bun start              # Interactive TUI
bun dev                # Watch mode
bun run typecheck      # Type check

# Build
bun run build          # Compile binary
./dist/upup           # Run compiled binary

# Testing
bun test              # Run tests
```

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      Core Layers                           │
├─────────────────────────────────────────────────────────────┤
│  CLI/TUI → Agent Core → Tools/Skills/Components          │
│                              │                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │   llm   │  │ memory  │  │   sdk   │  │ plugins │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Important Files

| Path | Purpose |
|------|---------|
| `src/cli.ts` | Main CLI entry (~1540 lines); slash autocomplete is delegated to pi-tui's `CombinedAutocompleteProvider` (3-line wiring) |
| `src/agent/` | Agent core logic |
| `src/session/` | Session state management |
| `src/components/` | TUI components |
| `src/tools/` | Tool system (64+ tools) |
| `src/skills/` | Skill loader |
| `src/hooks/` | Hook system |
| `packages/sdk/` | Plugin SDK |

## Permission System

UpUp uses multi-layer permissions (inspired by Claude Code):

- **Session Mode**: `default`, `accept-all`, `bypassPermissions`, `dangerously`
- **Bash Mode**: `bypass`, `allow`, `ask`, `deny`

Key files:
- `src/session/session-tracker.ts` - Session state
- `src/hooks/permission-hooks.ts` - Permission hooks
- `src/tools/bash/permission-mode.ts` - Bash permissions

## Financial Features

| Skill | Function |
|-------|----------|
| `medfish` | Medical/pharmaceutical analysis |
| `technical-analysis` | RSI, MACD, Bollinger Bands |
| `backtesting` | Strategy backtesting |
| `risk-management` | Risk tools |
| `sentiment-analysis` | Sentiment analysis |

## Development Notes

1. **TypeScript First**: All code is TypeScript, strict mode enabled
2. **Bun Runtime**: Primary runtime, also supports Node.js
3. **LangChain**: LLM integration via LangChain
4. **Permission Safety**: All dangerous operations require explicit approval

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` - LLM provider
- `TUSHARE_TOKEN` - A-share data (required for Chinese stocks)

## Troubleshooting

```bash
# Permission issues
DEBUG=permissions bun start

# Session recovery
./dist/upup --resume <session-id>

# Build errors
bun run typecheck
```

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
