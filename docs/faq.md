# FAQ

> **Frequently asked questions, honest answers.** If your question isn't here, open an issue with the `question` template.

---

## General

### What is UpUp?

UpUp (涨涨) is a **terminal-based AI agent for Chinese-market financial research**. It combines a Claude Code–style agent loop, A-share data integration (Tushare + AKShare), 50+ investment analysis skills, and a 5-phase investment workflow. See [README.md](../README.md) for the overview.

### How is UpUp different from Claude Code?

Claude Code is a general-purpose coding agent. UpUp is a **research agent specialized for A-shares** — it has 50 investment skills, a 5-phase `/invest` workflow, and native Tushare/AKShare integration. Many users run both side by side.

### Is UpUp really forked from Dexter?

Yes. UpUp is forked from [virattt/dexter](https://github.com/virattt/dexter) (MIT). On top of the upstream framework, we've added 8 dimensions of extensions — see [README.md → UpUp's Additions](../README.md#与上游的边界什么来自-dexters什么是-upup-加的).

### Is UpUp open source?

Yes, MIT license. You can use it commercially, modify it, redistribute it. See [LICENSE](../LICENSE).

### Is UpUp a registered investment advisor?

**No.** UpUp is a research tool. Its output is for informational and educational purposes only. It is not financial advice. You are responsible for your own investment decisions. See [CODE_OF_CONDUCT.md → Investment-Research Specifics](../CODE_OF_CONDUCT.md#investment-research-specifics).

### Does UpUp work in English / Chinese?

Both, symmetrically. The default locale is auto-detected from `LANG`/`LC_ALL`. Override with `UPSTREAM_LOCALE=zh-CN` or `UPSTREAM_LOCALE=en`. See [docs/i18n.md](./i18n.md).

### What's the relationship to the upstream dexter project?

We respect the MIT license and the upstream author's work. We do not take credit for dexter's code — when modifying code originally from dexter, we preserve the attribution. We will consider cherry-picking new features from dexter when they land upstream. See `docs/sync-plan.md` (planned; not yet written).

---

## Installation & Setup

### Why Bun?

- Fastest install (`bun install` is ~10x faster than `npm install`)
- Native TypeScript, no build step needed for dev
- First-class test runner (`bun test`)
- Single binary compilation (`bun build --compile`)

### Can I use Node.js?

Mostly, but you lose:
- Single-binary compile (`bun build --compile`)
- Hot-reload in dev mode

Use `bun run build:node` for a Node-compatible bundle, or `bunx` to invoke bun on demand.

### The `bun install` step hangs on `playwright install chromium`

Set `PLAYWRIGHT_BROWSERS_PATH=0` to skip the browser download if you don't use the `browser` tool. Or run with a longer timeout.

### How do I update UpUp?

```bash
git pull origin main
bun install
bun run typecheck
```

### Can I install via npm / Homebrew?

Not yet. The release pipeline (`scripts/release.sh`) currently only produces git tags. Homebrew tap and `npm publish` are on the roadmap.

---

## Configuration

### What LLM provider should I use?

| Use case | Recommended |
|---|---|
| A-share, cost-sensitive | **DeepSeek** (default) — best CN/EN ratio |
| Complex reasoning | Anthropic Claude Sonnet/Opus |
| US markets | OpenAI GPT-5 or Claude |
| Local / privacy | Ollama (any model) |
| Multi-model | OpenRouter (200+ models) |

See [docs/quickstart.md → Step 3](./quickstart.md#3-configure-environment).

### I have all 7 LLM providers. Which model gets used?

The `DEFAULT_MODEL` env var, or the one set via `/model` or `.upup/settings.json`. Format: `provider:model` (e.g., `anthropic:claude-sonnet-4-20250514`).

### Tushare rate-limited me. What now?

- **Lower your request frequency** — UpUp batches when possible
- **Use AKShare fallback** — set `TUSHARE_TOKEN=""` to force AKShare (slower, but unlimited)
- **Upgrade Tushare tier** — paid plans have higher quotas

### Can I use UpUp without internet?

Mostly no. LLM calls + data fetches require network. Exception: you can use UpUp with a local Ollama model + cached data (DuckDB plugin). See [docs/plugins.md → Example 2](./plugins.md#example-2-local-duckdb-plugin).

---

## Usage

### How do I switch from interactive to scripted?

```bash
# Interactive (default)
bun start

# One-off query
bun start "分析贵州茅台 2025 Q3"

# Bundled runner (for scripting / cron / CI)
bun run src/run.ts "your prompt here"

# With a specific model
DEFAULT_MODEL=claude-sonnet-4-20250514 bun start "..."
```

### How do I resume a previous session?

```bash
# In TUI
/resume 019e95...

# Or from CLI
bun start --resume 019e95...
```

Sessions live in `~/.upup/sessions/`. They're JSONL — easy to grep.

### Can I run UpUp unattended (cron / CI)?

Yes:

```bash
#!/bin/bash
export ANTHROPIC_API_KEY=...
export TUSHARE_TOKEN=...
bun run src/run.ts "morning brief" > /var/log/upup.log 2>&1
```

For CI, set `UPUP_PERMISSION_MODE=accept-all` and pin the model for reproducibility.

### How do I export a report to PDF / HTML?

UpUp outputs Markdown. Convert with:

```bash
bun start "/invest 600519.SH 2025Q3" > report.md
pandoc report.md -o report.pdf
pandoc report.md -o report.html --standalone
```

---

## Skills

### How do I add a custom skill?

```bash
mkdir src/skills/<name>
$EDITOR src/skills/<name>/SKILL.md
```

It will be auto-discovered. No restart needed (hot-reload). See [docs/skills.md](./skills.md).

### How do I share a skill with the community?

1. Push the SKILL.md to a public Git repo
2. Open an issue or PR in [louloulin/upup](https://github.com/louloulin/upup) with the `skill-submission` label
3. Or publish as a plugin (see [docs/plugins.md](./plugins.md))

### The LLM isn't using my skill. Why?

Common causes:
1. **No trigger keywords** — make sure `description:` includes synonyms in zh + en
2. **Generic description** — be specific about when to use it
3. **Multiple skills match** — use the `experimental: true` flag to surface a warning
4. **LLM hallucination** — try `/model` to a more capable model

Use `/skills --search <keyword>` to verify the skill is discoverable.

### Can skills call other skills?

Yes. Use the `requires:` frontmatter field or call them via `ctx.callSkill(name, args)` from bundled skills.

### Can skills be written in languages other than TS?

For bundled skills, no — they're compiled in. For file-based skills, the SKILL.md is just a prompt template; the LLM does the work. Plugins can be any language (via `mcp` runtime).

---

## Plugins

### How do I create a plugin?

```bash
bunx create-upup-plugin my-plugin
cd my-plugin
bun run build
# then copy to ~/.upup/plugins/my-plugin/
```

See [docs/plugins.md → TL;DR](./plugins.md#tldr).

### Which runtime should I use?

| Runtime | Use when |
|---|---|
| `bun` | Default. Trusted code, max performance |
| `jiti` | TS files without a build step |
| `wasm` | Untrusted code, sandboxed |
| `mcp` | Cross-process, cross-language, reusing existing MCP servers |

### Are plugins sandboxed?

- `bun` / `jiti`: process-level (same permissions as UpUp)
- `wasm`: sandboxed (no fs, no net, capped memory/CPU)
- `mcp`: process-level but separate process

Treat `bun`/`jiti`/`mcp` plugins as having **your user's full permissions**. Audit before installing.

---

## Security & Privacy

### Where does my data go?

- **Prompts / tool results** → LLM provider (OpenAI / Anthropic / etc.) per their terms
- **Tushare / AKShare** → their servers, per their terms
- **Long-term memory** → local SQLite at `.upup/memory.db`
- **Sessions** → local JSONL at `.upup/sessions/`
- **Telemetry** → your LangSmith project (if configured)
- **No UpUp central server** — there's nothing to send to

### How do I run UpUp fully offline?

```env
# .env
OLLAMA_BASE_URL=http://127.0.0.1:11434
DEFAULT_MODEL=ollama:llama-3.1-70b
# unset all *_API_KEY and EXA/TAVILY/...
# use DuckDB plugin for local data
```

### Can I disable telemetry entirely?

```env
# Don't set LANGSMITH_API_KEY
# Or set:
UPSTREAM_TELEMETRY=false
```

### How do I report a security issue?

See [SECURITY.md → Reporting a Vulnerability](../SECURITY.md#reporting-a-vulnerability). **Do not open a public GitHub issue.**

---

## Troubleshooting

### `bun: command not found`

```bash
curl -fsSL https://bun.sh/install | bash
# or
brew install bun
```

### `Tushare: 401 Unauthorized`

Your `TUSHARE_TOKEN` is wrong or expired. Check https://tushare.pro 个人中心.

### `Module not found: @upup/X`

```bash
rm -rf node_modules bun.lock
bun install
```

### Slash command autocomplete broken

```bash
rm -rf .upup/cache
bun start
```

### Browser tool not working

```bash
PLAYWRIGHT_BROWSERS_PATH=0 bun install
# or
npx playwright install chromium
```

### "Token limit exceeded" mid-session

```bash
/compact           # force context compaction
/clear             # start fresh (loses session)
```

### "Out of memory" during /invest

```bash
UPSTREAM_HEAP_SIZE=8192 bun start
```

For more, see [docs/architecture.md](./architecture.md) or open an issue.

---

## See Also

- [docs/quickstart.md](./quickstart.md) — getting started
- [docs/architecture.md](./architecture.md) — under the hood
- [docs/commands.md](./commands.md) — all commands
- [docs/skills.md](./skills.md) — all skills
- [docs/plugins.md](./plugins.md) — plugin development
- [docs/roadmap.md](./roadmap.md) — what's next

---

<p align="center"><strong>Still stuck? <a href="https://github.com/louloulin/upup/issues/new?template=question.md">Ask in an issue</a>.</strong></p>
