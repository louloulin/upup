# UpUp (涨涨) - AI Agent Project Guide

> **中国版 Dexter** — 中文金融研究 AI 智能体
> Forked from [virattt/dexter](https://github.com/virattt/dexter), 针对 A 股 / 港股 / 中文投研场景深度改造

## Project Overview

**UpUp (涨涨)** 是基于 [Dexter](https://github.com/virattt/dexter) 的 fork，**不是**简单的换皮或翻译。在保留 dexter 整体金融研究框架（MIT）的基础上，UpUp 针对**中文投研场景**做了 8 个维度的实质性扩展：

- **A 股数据栈**：Tushare Pro + AKShare 接入
- **50 个投资分析 Skill** + 14 bundled skill
- **5 阶段投资工作流** (`/invest`)：detect → plan → execute → verify → report
- **4 runtime 插件**：bun / jiti / wasm / mcp
- **i18n**：EN + zh-CN 双语，强类型 key
- **多 Agent 协同**：subagent 并行拉数据
- **Session 2.0**：计划模式、自动压缩、Loop 恢复、停止 hook（参考 Claude Code）
- **18 个 workspace package** + 8 轮 Sprint 持续打磨

完整增量清单见 [README.md](./README.md) 的 "UpUp's Additions" 段。

- This fork: https://github.com/louloulin/upup
- Mirror: https://gitcode.com/lumosaigroup/upup
- Upstream: https://github.com/virattt/dexter

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
| `src/cli.ts` | Main CLI entry; slash autocomplete is delegated to pi-tui's `CombinedAutocompleteProvider` (3-line wiring) |
| `src/agent/` | Agent core (loop, plan mode, subagent, memory flush, investment workflow) |
| `src/commands/investment/` | 5-phase /invest workflow + dossier / strategy / earnings-preview / morning-brief / portfolio-review / risk-dashboard / watchlist-edit / screen |
| `src/skills/` | 50 SKILL.md + 14 bundled skills (registry, hot-reload, i18n) |
| `src/tools/finance/` | 20 finance tools (prices, fundamentals, filings, A-share, screen, key ratios, estimates, segments, news, earnings transcripts, crypto) |
| `src/plugins/adapters/` | 4 plugin runtime adapters: bun, jiti, wasm, mcp |
| `src/i18n/strings.ts` | EN + zh-CN string table, strongly-typed keys |
| `src/session/` | Session state + permission mode (Claude Code-inspired) |
| `src/components/` | TUI components (Ink) |
| `packages/plugin-sdk/` | Plugin SDK for third-party plugin authors |
| `packages/llm/`, `packages/memory/`, `packages/gateway/` | Workspace packages |

## Permission System

UpUp uses multi-layer permissions (inspired by Claude Code):

- **Session Mode**: `default`, `accept-all`, `bypassPermissions`, `dangerously`
- **Bash Mode**: `bypass`, `allow`, `ask`, `deny`

Key files:
- `src/session/session-tracker.ts` - Session state
- `src/hooks/permission-hooks.ts` - Permission hooks
- `src/tools/bash/permission-mode.ts` - Bash permissions

## Financial Features

详细 50 个 skill 列表见 [README.md#skills-概览50--14-bundled](./README.md#skills-概览50--14-bundled) 与 `ls src/skills/*/SKILL.md`。节选核心场景：

| 类别 | 代表 Skill |
|------|-----------|
| 估值 | `dcf`, `valuation-comparison`, `valuation-alert`, `earnings-forecast` |
| 技术 / 量价 | `technical-analysis`, `money-flow`, `momentum-investing` |
| 行业 / 主题 | `sector-analysis`, `sector-rotation`, `macro-analysis` |
| 风格 | `value-investing`, `growth-investing` |
| 基金 / 机构 | `fund-analysis`, `fund-comparison`, `manager-analysis` |
| 组合 | `portfolio-management`, `portfolio-rebalancing` |
| A 股专属 | `a-share-analysis` + 市场结构 / 资金流向 |
| 内置动态 (bundled) | `research`, `fund`, `portfolio`, `risk-assessment`, `alert`, `batch`, `stock-screen`, `dream`, `hunter`, `sandbox`, `verify` |

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
