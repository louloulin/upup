# UpUp (涨涨) 🤖

> Deep Financial Research AI Agent — Built on Dexter, Inspired by Claude Code

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Overview

**UpUp (涨涨)** is a deep financial research AI agent that combines:

- **From Dexter**: Complete financial data analysis framework, tool system, multi-source integration
- **From Claude Code**: Permission management, session state management, TUI interaction design, plugin architecture

### Key Features

| Category | Features |
|---------|----------|
| **Financial Research** | A-share analysis, technical indicators, fund flows, valuation models |
| **Data Sources** | Tushare Pro, AKShare, Financial Datasets API |
| **Analysis Tools** | Backtesting engine, sentiment analysis, risk management |
| **Architecture** | Session 2.0, permission system, multi-runtime plugins |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- Node.js 18+ (for some build targets)

### Installation

```bash
# Clone repository
git clone https://github.com/virattt/upup.git
cd upup

# Install dependencies
bun install
```

### Configuration

```bash
# Copy environment template
cp env.example .env

# Edit .env with your API keys
```

**Recommended configuration:**

```env
# LLM Provider (at least one required)
ANTHROPIC_API_KEY=sk-ant-...        # Claude models
OPENAI_API_KEY=sk-...               # GPT models
DEEPSEEK_API_KEY=sk-...             # DeepSeek models

# Financial Data (required for A-share)
TUSHARE_TOKEN=your_tushare_token    # https://tushare.pro

# Search (optional)
EXASEARCH_API_KEY=your_exa_key      # Web search

# UpUp Permission Mode (optional)
UPUP_DANGEROUSLY_MODE=true          # Enable no-authorization mode
```

### Running

```bash
# Interactive TUI
bun start

# Single query
bun run src/run.ts "Analyze Guizhou Moutai's financial status"

# No-authorization mode
bun --dangerously "Batch analyze A-share tech stocks"
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UpUp Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │    CLI      │     │    TUI      │     │  Bundled    │           │
│  │  (dexter)   │     │  (Claude)  │     │   Runner    │           │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘           │
│         └────────────────────┴────────────────────┘                   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Agent Core                                │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │ Capability │  │  Session   │  │   Skill   │           │  │
│  │  │ Registry   │  │   State    │  │ Executor  │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐               │
│         ▼                    ▼                    ▼               │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐       │
│  │   Tools     │      │   Skills     │      │ Components   │       │
│  │   (64+)     │      │   (25+)      │      │   (16)       │       │
│  │             │      │              │      │              │       │
│  │ • Bash      │      │ • medfish    │      │ • ChatLog    │       │
│  │ • Read/Edit│      │ • technical  │      │ • Approval   │       │
│  │ • A-share   │      │ • backtest   │      │ • Debug      │       │
│  │ • Backtest  │      │ • risk-mgmt  │      │ • StatusBar  │       │
│  └─────────────┘      └─────────────┘      └─────────────┘       │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Packages (17+)                           │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │  │
│  │  │   llm   │  │ memory  │  │   sdk   │  │ plugins │      │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Source | Description |
|--------|--------|-------------|
| `agent/` | Dexter | Agent runtime logic, tool registration |
| `tools/` | Mixed | Bash, filesystem, financial tools |
| `session/` | Claude Code | Session state, permission mode |
| `components/` | Claude Code | TUI component library |
| `packages/sdk/` | New Design | UpUp Plugin SDK |

---

## Permission System

UpUp uses a multi-layer permission architecture inspired by Claude Code:

### Permission Modes

```typescript
// Session level
type PermissionMode =
  | 'default'           // Standard permission check
  | '.accept-all'       // Accept all prompts
  | 'bypassPermissions' // Bypass all checks
  | 'dangerously';      // Allow dangerous operations

// Bash tool level
type BashMode = 'bypass' | 'allow' | 'ask' | 'deny';
```

### CLI Flags

```bash
# Dangerous mode - allow all operations
bun --dangerously "Execute batch analysis"

# No-authorization mode - bypass permission check
bun --bypass "Quick query"

# Safe mode
bun --safe "First run"
```

### Built-in Bypass Rules

The following commands are automatically allowed without authorization:

| Category | Commands |
|----------|----------|
| Basic | `pwd`, `echo`, `cd`, `ls` |
| Read | `cat`, `grep`, `find`, `wc` |
| Git | `git status`, `git log`, `git diff`, `git show` |

---

## Plugin System

UpUp supports multi-runtime plugin architecture (inspired by Claude Code):

### Plugin Types

| Runtime | Description | Sandbox Level |
|---------|------------|---------------|
| `bun` | Native ESM, high performance | `process` |
| `jiti` | TypeScript native execution | `process` |
| `wasm` | WebAssembly secure isolation | `wasm` |
| `mcp` | Model Context Protocol | `mcp` |

### Plugin Structure

```
my-plugin/
├── upup.plugin.json    # Plugin manifest
├── src/
│   ├── index.ts        # Entry point
│   └── tools/          # Tool definitions
└── package.json
```

### Plugin Example

```json
{
  "schemaVersion": "1.0",
  "id": "my-stock-analyzer",
  "name": "Stock Analyzer",
  "runtime": "bun",
  "capabilities": ["tools"],
  "security": {
    "sandbox": "process"
  }
}
```

---

## Skill System

UpUp has built-in financial research Skills:

### Core Skills

| Skill | Function |
|-------|----------|
| `medfish` | Medical/pharmaceutical industry analysis |
| `technical-analysis` | Technical indicator calculation (RSI, MACD, Bollinger Bands) |
| `backtesting` | Strategy backtesting engine |
| `risk-management` | Risk management tools |
| `sentiment-analysis` | Public sentiment analysis |
| `financial-data` | Financial data acquisition |
| `fundamental-analysis` | Fundamental analysis |

### Usage Example

```
> Analyze pharmaceutical industry
[Skill: medfish] loaded
[Skill: financial-data] loaded
```

---

## Directory Structure

UpUp is organized as a **bun workspace monorepo** with 34 packages across 7 architectural layers. The `src/` directory contains only 5 thin shell files; all business logic lives in workspace packages.

```
upup/
├── src/                          # Application shell (5 files only)
│   ├── index.tsx                 # Entry point → @upup/index-app
│   ├── cli.ts                    # CLI re-export → @upup/cli
│   ├── run.ts                    # Non-interactive runner → @upup/agent-runtime
│   ├── bundled-runner.ts         # Bundled binary entry → @upup/agent-runtime
│   └── theme.ts                  # Theme re-export → @upup/tui-renderer/theme
├── packages/                     # Bun workspace packages
│   ├── L1 (foundations)
│   │   ├── types/                # Shared type definitions
│   │   └── utils/                # Shared utilities
│   ├── L2 (core abstractions)
│   │   ├── llm/                  # Multi-provider LLM abstraction
│   │   ├── hooks/                # Agent hook system
│   │   ├── keybindings/          # Key binding parser/resolver
│   │   ├── state/                # TUI state store
│   │   ├── tui-renderer/         # TUI components and rendering
│   │   ├── agent-runtime/        # Agent loop, scratchpad, tools
│   │   └── memory-system/        # Memory management
│   ├── L3 (infrastructure)
│   │   ├── storage/              # SQLite + DuckDB persistence
│   │   └── telemetry/            # Event recording and tracing
│   ├── L4 (runtime capabilities)
│   │   ├── tools-registry/       # Tool registry and dispatch
│   │   ├── finance-tools/        # Financial data tools
│   │   ├── skills/               # SKILL.md workflow system
│   │   ├── mcp/                  # Model Context Protocol
│   │   ├── plugins/              # Plugin loader
│   │   ├── cron/                 # Scheduled tasks
│   │   ├── daemon/               # Background daemon
│   │   ├── session-system/       # Session tracking
│   │   ├── realtime-channel/     # Real-time data feeds
│   │   ├── bridge-system/        # WebSocket bridge
│   │   ├── coordinator-system/   # Multi-agent coordination
│   │   ├── plan-system/          # Planning system
│   │   ├── research-system/      # Research workflows
│   │   ├── multimodal-system/    # Multimodal processing
│   │   └── gateway/              # API gateway
│   ├── L5 (application services)
│   │   └── services-core/        # Permissions + services
│   ├── L6 (application shell)
│   │   ├── cli/                  # Interactive CLI + commands
│   │   └── commands/             # Command implementations
│   ├── L7 (entry shell)
│   │   └── index-app/            # Subcommands, --stdio, --bridge
│   └── SDK packages
│       ├── sdk/                  # Plugin SDK
│       ├── plugin-sdk/           # Plugin authoring API
│       ├── memory/               # Memory SDK
│       └── adapter-paperclip/    # Paperclip platform adapter
├── scripts/                      # Build and lint scripts
│   ├── build-packages.ts         # DAG topological typecheck
│   ├── lint-boundaries.ts        # Boundary enforcement
│   └── check-scc.ts              # Source code complexity check
├── docs/                         # Documentation
└── package.json                  # Root workspace config
```

### Workspace Commands

```bash
bun install                      # Install all workspace dependencies
bun run typecheck                # Typecheck src/ shell files
bun run build:packages           # Typecheck all 34 packages in topological order
bun run lint:boundaries          # Enforce workspace boundary rules
bun test                         # Run all tests across packages
bun run build:compile            # Compile standalone binary to dist/upup
```

---

## Configuration Reference

### settings.local.json

```json
{
  "permissions": {
    "dangerouslyAllow": false,
    "allow": [
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(npm run:*)",
      "Read(CLAUDE.md)",
      "Read(README.md)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)"
    ]
  },
  "env": {
    "DEFAULT_MODEL": "claude-sonnet-4-20250514",
    "UPUP_DANGEROUSLY_MODE": "false"
  }
}
```

---

## Development Guide

### Local Development

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Run tests
bun test

# Build
bun run build
```

### Debugging

```bash
# View Scratchpad logs
cat .upup/scratchpad/*.jsonl | jq

# Debug mode
DEBUG=* bun start

# Permission debugging
DEBUG=permissions bun run src/run.ts "test"
```

---

## Acknowledgments

**UpUp (涨涨)** was inspired by:

| Project | Contribution |
|---------|-------------|
| [Dexter](https://github.com/virattt/dexter) | Financial research framework, multi-source integration, core tool system |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Permission architecture, session management, TUI design, plugin system |

---

## Documentation

Comprehensive documentation is available in the [docs/](docs/) directory:

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/architecture.md](docs/architecture.md) | System architecture |
| [docs/permission.md](docs/permission.md) | Permission system |
| [docs/skills.md](docs/skills.md) | Skills system |
| [docs/api.md](docs/api.md) | API reference |
| [docs/plugins.md](docs/plugins.md) | Plugin system |
| [docs/session.md](docs/session.md) | Session management |
| [docs/development.md](docs/development.md) | Development guide |

### Chinese Documentation (中文文档)

| Document | Description |
|----------|-------------|
| [docs/README_CN.md](docs/README_CN.md) | 文档索引 |
| [docs/architecture-cn.md](docs/architecture-cn.md) | 系统架构 |
| [docs/permission-cn.md](docs/permission-cn.md) | 权限系统 |
| [docs/skills-cn.md](docs/skills-cn.md) | 技能系统 |
| [docs/api-cn.md](docs/api-cn.md) | API 参考 |
| [docs/plugins-cn.md](docs/plugins-cn.md) | 插件系统 |
| [docs/session-cn.md](docs/session-cn.md) | 会话管理 |
| [docs/development-cn.md](docs/development-cn.md) | 开发指南 |

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
