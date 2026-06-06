# Quickstart

> Get from `git clone` to your first A-share research report in **under 10 minutes**.

This is a hands-on walkthrough. By the end you will have:

1. Installed UpUp
2. Configured an LLM provider and a Tushare token
3. Run your first `/invest` on a Chinese A-share stock
4. Generated a structured markdown report with citations

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| [Bun](https://bun.sh) | 1.0+ | Runtime + package manager |
| [Node.js](https://nodejs.org) | 18+ | Optional — only for `build:node` |
| OS | macOS 12+ / Ubuntu 22.04+ / Windows 11 WSL2 | UpUp runs anywhere Bun runs |
| Git | 2.30+ | Cloning the repo |
| 1 GB disk | — | For Playwright browser (installed by `postinstall`) |

Verify your setup:

```bash
bun --version    # 1.0.0 or higher
git --version    # 2.30 or higher
```

---

## 2. Clone & Install

```bash
# Pick one mirror
git clone https://github.com/louloulin/upup.git
# OR: git clone https://gitcode.com/lumosaigroup/upup.git
cd upup

# Install dependencies (this also runs `playwright install chromium`)
bun install
```

`bun install` typically takes 60-90 seconds.

---

## 3. Configure Environment

```bash
cp env.example .env
```

Open `.env` in your editor. You need **at least one** of:

### Option A: DeepSeek (recommended for A-share)

```env
DEEPSEEK_API_KEY=sk-...
DEFAULT_MODEL=deepseek-v4-flash
```

[Get a key](https://platform.deepseek.com) — Chinese-friendly, low cost.

### Option B: Anthropic Claude

```env
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_MODEL=claude-sonnet-4-20250514
```

Stronger reasoning for complex DCF / strategy work.

### Option C: OpenAI

```env
OPENAI_API_KEY=sk-...
DEFAULT_MODEL=gpt-5.4
```

For A-share data, also add:

```env
# Tushare Pro — https://tushare.pro (register, get token from "个人中心")
TUSHARE_TOKEN=your_token_here
# AKShare works out of the box as a fallback (no token needed)
```

For web search (optional but recommended):

```env
# Exa (preferred) — https://exa.ai
EXASEARCH_API_KEY=...
# OR Tavily
TAVILY_API_KEY=...
```

---

## 4. Launch

```bash
bun start
```

You should see the UpUp TUI welcome screen with the Chinese intro and a `>` prompt.

```
$ bun start

  ╭──────────────────────────────────────────╮
  │  涨涨 · UpUp · 深度金融研究 AI            │
  │  Type your question, or / for commands.  │
  ╰──────────────────────────────────────────╯

>
```

Type `/help` to see all slash commands, or `/skills` to browse 50+ investment skills.

---

## 5. Your First A-Share Research

Try this in the TUI:

```
> /invest 600519.SH 2025Q3
```

UpUp will run the **5-phase investment workflow**:

```
[Phase 1/5] detect   … 识别为 A 股个股深度研究 (贵州茅台, 食品饮料)
[Phase 2/5] plan     … 拆解为 8 个子任务 (财报 / 估值 / 行业 / 资金 / 风险 …)
[Phase 3/5] execute  … 拉数据: Tushare 财务 + AKShare 资金流 + 公告
                         并发 4 个子 agent: explore / plan / risk / review
[Phase 4/5] verify   … 多源对比 (Tushare vs AKShare), 关键数字交叉验证
[Phase 5/5] report   … 输出结构化 Markdown 报告到 stdout + .upup/reports/
```

The final report includes:

- 公司画像（业务、股东、管理层）
- 财务三表关键指标 (YoY, QoQ)
- 估值倍数 (PE, PB, EV/EBITDA) + 行业对比
- 资金流（北向、主力、散户）
- 风险提示（杠杆、商誉、监管）
- 数据来源引用（每条数据点都标注 source）

---

## 6. Try Other Slash Commands

```bash
# Quick stock dossier
/dossier 000001.SZ

# Earnings preview (use 7 days before earnings)
/earnings-preview 002594.SZ

# Multi-factor stock screening
/screen "PE<30 AND ROE>15% AND 营收增速>20%"

# Strategy development
/strategy new my-momentum-v1

# Morning brief
/morning-brief

# Portfolio review
/portfolio-review

# Risk dashboard
/risk-dashboard

# Switch LLM model
/model deepseek-v4-pro

# Browse all skills
/skills
```

---

## 7. Common Tasks

### Save a session for later

```bash
/resume <session-id>
```

Or browse via `~/.upup/sessions/`.

### Switch between English and Chinese

```bash
# Auto-detected from LANG; or override:
UPSTREAM_LOCALE=zh-CN bun start
UPSTREAM_LOCALE=en bun start
```

### Run in a sandbox for safety

```bash
docker run --rm -it \
  -v $(pwd):/upup \
  -e ANTHROPIC_API_KEY \
  upup:latest bun start
```

### Build a standalone binary

```bash
bun run build       # → dist/upup (macOS / Linux)
./dist/upup --help
```

For Windows:

```bash
bun run build:node:win
```

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `bun: command not found` | Install Bun: `curl -fsSL https://bun.sh/install \| bash` |
| Tushare 401 / 403 | Check `TUSHARE_TOKEN`; verify in https://tushare.pro dashboard |
| `playwright install` hangs | `PLAYWRIGHT_BROWSERS_PATH=0 bun install` |
| `Cannot find module '@upup/X'` | `bun install` (workspace symlinks) |
| Type errors | `bun run typecheck` — paste the output in an issue |
| Slash command autocomplete broken | Restart TUI; ensure `pi-tui` is on latest |

For more, see [docs/faq.md](./faq.md).

---

## 9. Next Steps

- 📚 Read [docs/architecture.md](./architecture.md) for the system design
- 🇨🇳 Read [docs/a-share.md](./a-share.md) for A-share specific features
- 🛠 Read [docs/skills.md](./skills.md) to write your first skill
- 🔌 Read [docs/plugins.md](./plugins.md) to build a plugin
- 🤝 Read [CONTRIBUTING.md](../CONTRIBUTING.md) to contribute back

---

<p align="center"><strong>Welcome to UpUp. 涨，涨，一直涨。 📈</strong></p>
