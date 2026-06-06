# Commands Reference

> **UpUp exposes 47+ slash commands**, organized into 6 groups. This page is the exhaustive reference. Type `/` in the TUI for fuzzy completion.

## Quick Index

| Group | Commands |
|---|---|
| **Investment workflow** | `/invest` `/dossier` `/earnings-preview` `/morning-brief` `/portfolio-review` `/risk-dashboard` `/screen` `/strategy` `/watchlist-edit` |
| **Skills & discovery** | `/skills` |
| **Agent control** | `/plan` `/model` `/permissions` `/session` `/resume` `/clear` `/compact` |
| **System** | `/config` `/doctor` `/help` `/version` `/exit` |
| **Plugins** | `/plugin` `/mcp` |
| **Sandbox** | `/sandbox` |

---

## Investment Workflow

### `/invest <ticker> [period]`

The flagship command. Runs the full [5-phase investment workflow](./investment-workflow.md).

```
/invest 600519.SH 2025Q3
/invest 002594.SZ          # latest
/invest 000001.SZ 2024     # full year
/invest BTC-USD
```

**Phases**: detect → plan → execute → verify → report
**Output**: stdout + `.upup/reports/<session-id>/<ticker>_<date>.md`
**Subagents**: Explore / Plan / Risk / Trade / Review (5, run in parallel where possible)

### `/dossier <ticker>`

One-page company dossier. Faster than `/invest` (skips deep analysis).

```
/dossier 600519.SH
/dossier 002594.SZ
/dossier "贵州茅台"
```

**Output**: 公司画像 + 财务速览 + 资金流 + 公告 + 风险
**Best for**: Pre-trade due diligence, quick lookup

### `/earnings-preview <ticker>`

Earnings preview. Use 7 days before a known earnings date.

```
/earnings-preview 002594.SZ
/earnings-preview AAPL
```

**Output**: 业绩前瞻 + 共识预期 + 关键观察点 + 历史 surprise
**Best for**: Earnings season positioning

### `/morning-brief`

Pre-market briefing. Best run at 8:00-9:15 AM (Asia time).

```
/morning-brief
```

**Output**: 大盘回顾 + 隔夜外盘 + 今日公告 + 自选股异动 + 宏观日历
**Best for**: Daily trading prep

### `/portfolio-review`

Review your portfolio. Uses `.upup/portfolio.json`.

```
/portfolio-review
/portfolio-review --since 30d
/portfolio-review --risk-only
```

**Output**: 持仓列表 + 行业暴露 + 风险指标 + 调仓建议
**Best for**: Weekly / monthly review

### `/risk-dashboard`

Real-time risk monitor.

```
/risk-dashboard
/risk-dashboard --portfolio
```

**Output**: VaR / 杠杆 / 集中度 / 相关性矩阵 / 压力测试
**Best for**: Risk-aware traders

### `/screen <criteria>`

Multi-factor stock screening.

```
/screen "PE<30 AND ROE>15%"
/screen "营收增速>20% AND 毛利率>40%"
/screen --preset value_gems
```

**Output**: Ranked table with one-line thesis per stock
**Best for**: Idea generation, watchlist building

### `/strategy [action]`

Strategy development, version control, audit, publish.

```
/strategy list
/strategy new my-momentum-v1
/strategy show my-momentum-v1
/strategy publish my-momentum-v1
/strategy fork my-momentum-v1 my-momentum-v2
/strategy audit my-momentum-v1
```

**Output**: Strategy DSL + backtest + audit trail
**Best for**: Quant strategy iteration

### `/watchlist-edit`

Manage your watchlist.

```
/watchlist-edit add 600519.SH
/watchlist-edit remove 002594.SZ
/watchlist-edit show
/watchlist-edit tag 600519.SH "价值,核心"
```

**Output**: Watchlist file at `.upup/watchlist.json`
**Best for**: Long-term tracking

---

## Skills & Discovery

### `/skills`

Browse all 50+ skills + 14 bundled skills. Dynamic discovery.

```
/skills
/skills --category 估值
/skills --search dcf
/skills --recent
```

**Output**: Paginated list with name, description, recent usage count
**Best for**: Finding the right skill for a task

---

## Agent Control

### `/plan`

Enter plan mode. The agent will explore and propose a plan before executing.

```
/plan
/plan exit
```

**Best for**: Complex multi-step tasks, when you want oversight

### `/model [provider:]model`

Switch LLM provider / model.

```
/model
/model deepseek-v4-pro
/model anthropic:claude-sonnet-4-20250514
/model openai:gpt-5.4
/model ollama:llama-3.1-70b
```

**Providers**: openai, anthropic, google, xai, openrouter, ollama, **deepseek** (default)
**Persistence**: `.upup/settings.json`

### `/permissions`

View / edit the permission system.

```
/permissions
/permissions allow "Bash(npm run:*)"
/permissions deny "Bash(curl * | bash)"
/permissions dangerously enable
```

**See**: [docs/session-and-permissions.md](./session-and-permissions.md)

### `/session`

Session management.

```
/session list
/session save my-portfolio-review
/session show <id>
/session delete <id>
```

### `/resume <session-id>`

Resume a previous session.

```
/resume 019e95...
```

### `/clear`

Clear current session (start fresh).

### `/compact`

Force context compaction. Auto-runs at 80% token usage.

```
/compact
/compact --aggressive
```

---

## System

### `/config`

View / edit configuration. Opens an editor for `.upup/settings.json`.

### `/doctor`

Health check.

```
/doctor
```

**Checks**: Bun version, env vars, API key validity, Tushare token, Tushare quota, Playwright browser, disk space, memory DB integrity.

### `/help`

Show help. Aliases: `/?` `/h`

### `/version`

Show version + commit + build date.

### `/exit`

Exit the TUI. Aliases: `/quit` `/q` `Ctrl-D`

---

## Plugins

### `/plugin [action]`

Manage plugins.

```
/plugin list
/plugin install my-plugin
/plugin enable my-plugin
/plugin disable my-plugin
/plugin info my-plugin
/plugin remove my-plugin
```

**See**: [docs/plugins.md](./plugins.md)

### `/mcp [action]`

Manage MCP servers.

```
/mcp list
/mcp add tushare
/mcp remove tushare
/mcp tools
```

**See**: [docs/plugins.md#mcp-runtime](./plugins.md#mcp-runtime)

---

## Sandbox

### `/sandbox [action]`

Manage sandboxed execution.

```
/sandbox run "rm -rf /tmp/cache"
/sandbox status
```

**Best for**: Running untrusted code (user-supplied strategies, downloaded scripts)

---

## Hidden / Advanced

These are not in `/help` but available to power users:

| Command | Description |
|---|---|
| `!` (shell) | Drop into a restricted bash shell within UpUp |
| `!!` (double) | Run last command in unrestricted mode (requires confirm) |
| `@<file>` | Reference a local file (auto-completes with file paths) |
| `?` | Open quick help for the current context |
| `Ctrl-L` | Clear screen |
| `Ctrl-C` | Interrupt current operation |
| `Ctrl-D` / `Esc Esc` | Exit (with confirm) |

---

## Chaining Commands

You can chain commands in a single message by separating with `;`:

```
/dossier 600519.SH; /screen "白酒板块"; /risk-dashboard
```

Each runs in sequence, with the later commands seeing the earlier context.

---

## Custom Commands

Define your own in `.upup/commands/<name>.md`:

```markdown
---
name: my-morning
description: My personal morning routine
---

# My Morning Routine

1. Run `/morning-brief`
2. Check `/risk-dashboard --portfolio`
3. If 风险 > 0.7, run `/portfolio-review`
```

See [docs/skills.md#custom-commands](./skills.md#custom-commands) for the full format.

---

## See Also

- [docs/skills.md](./skills.md) — all 50+ skills
- [docs/plugins.md](./plugins.md) — plugin development
- [docs/investment-workflow.md](./investment-workflow.md) — `/invest` deep dive
- [docs/a-share.md](./a-share.md) — A-share specifics

---

<p align="center"><strong>Type <code>/</code> to start.</strong></p>
