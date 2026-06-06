# Comparison with Alternatives

> **Why UpUp?** This page compares UpUp to other tools you might be considering. The TL;DR: UpUp is the only tool that combines A-share data, a Claude Code–style agent, and a 50-skill investment library in a single open-source CLI.

---

## TL;DR

| Tool | Type | A-share | Agent | Skills | Open source |
|---|---|---|---|---|---|
| **UpUp (涨涨)** | CLI | ✅ Native (Tushare+AKShare) | ✅ Claude Code style | 50+ investment skills | ✅ MIT |
| [virattt/dexter](https://github.com/virattt/dexter) | CLI | ❌ (upstream) | ✅ | ~10 | ✅ MIT |
| [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) | CLI | ❌ | ✅ Best-in-class | ❌ | ❌ Proprietary |
| [Aider](https://aider.chat) | CLI | ❌ | ✅ Coding-focused | ❌ | ✅ Apache 2.0 |
| [Cursor](https://cursor.com) | GUI | ❌ | ✅ | ❌ | ❌ Proprietary |
| [Continue.dev](https://continue.dev) | VSCode | ❌ | ✅ | Limited | ✅ Apache 2.0 |
| [Open Interpreter](https://openinterpreter.com) | CLI | ❌ | ✅ | ❌ | ✅ AGPL |
| [GPT Researcher](https://gptr.dev) | Python lib | ❌ | ✅ Web research | ❌ | ✅ Apache 2.0 |
| [通义晓蜜 / Kimi / 豆包](https://qianwen.aliyun.com) | Web | ✅ | ❌ No tools | ❌ | ❌ Proprietary |
| [同花顺 i 问财](https://www.iwencai.com) | Web | ✅ | ❌ Search | ❌ | ❌ Proprietary |
| [Wind / Choice](https://www.wind.com.cn) | GUI | ✅ | ❌ | ❌ | ❌ Proprietary |

---

## vs virattt/dexter (the upstream)

| Dimension | Dexter | UpUp |
|---|---|---|
| Origin | Original | Fork + 8 dimensions of additions |
| A-share | ❌ US-focused | ✅ Tushare + AKShare native |
| Skills | ~10 (US-centric) | 50+ (A-share + global) |
| 5-phase /invest | ❌ | ✅ |
| i18n | English | EN + zh-CN (symmetric) |
| Plugin system | Limited | 4 runtimes (bun/jiti/wasm/mcp) |
| LLM providers | 4 | 7 (added DeepSeek default) |
| Investment commands | 5 | 11 |
| Subagents | 2 | 5+ investment subagents |
| Session 2.0 | Basic | Plan mode, loop recovery, audit |
| Memory | None | Full (observation buffer, extraction, audit chain) |
| Evals | None | LangSmith runner with Ink UI |

**UpUp is not a fork with a Chinese skin** — it's a substantial rewrite for the Chinese investment market, with the original dexter framework as the foundation.

---

## vs Claude Code

| Dimension | Claude Code | UpUp |
|---|---|---|
| Core agent | ✅ Best-in-class | ✅ Inspired by |
| Coding focus | ✅ Strong | ⚠️ Secondary (research first) |
| Investment research | ❌ | ✅ Native (50 skills) |
| A-share data | ❌ | ✅ |
| Open source | ❌ Proprietary | ✅ MIT |
| Self-host | ❌ (Anthropic API only) | ✅ Bring your own LLM (Ollama, vLLM) |
| Plugin SDK | Internal | Public, 4 runtimes |
| Price | API cost only | API cost only |
| Language | English | EN + zh-CN |

**Use Claude Code for coding, UpUp for investment research.** Many users run both side by side.

---

## vs Cursor

Cursor is a GUI-based IDE with AI baked in. UpUp is a CLI.

| Dimension | Cursor | UpUp |
|---|---|---|
| Form factor | GUI (VSCode fork) | CLI (terminal-native) |
| Coding | ✅ | ⚠️ (we have it, but not the focus) |
| Investment | ❌ | ✅ |
| A-share | ❌ | ✅ |
| Open source | ❌ | ✅ |
| Cost | $20/month | Free (BYO API key) |
| Scriptable | Limited | ✅ Pipe-able |
| Works over SSH | ❌ | ✅ |
| Data privacy | Cloud | Local |

**Cursor for IDE work, UpUp for investment work in the terminal.**

---

## vs Aider

Aider is the gold standard for AI pair programming in the terminal.

| Dimension | Aider | UpUp |
|---|---|---|
| Coding focus | ✅ Best-in-class | ⚠️ (supported but secondary) |
| Investment | ❌ | ✅ |
| A-share | ❌ | ✅ |
| Repo map | ✅ Excellent | N/A (we don't edit code) |
| Voice mode | ✅ | ❌ (planned) |
| Open source | ✅ Apache 2.0 | ✅ MIT |
| Skills | ❌ | 50+ |
| Plugin SDK | ❌ | 4 runtimes |

**Aider for code commits, UpUp for research reports.**

---

## vs Chinese AI products (Kimi / 豆包 / 通义晓蜜 / i 问财)

| Dimension | Kimi / 豆包 / 通义 | i 问财 | UpUp |
|---|---|---|---|
| Form | Web chat | Web search | CLI |
| Real data (price/财务) | ❌ Search only | ✅ Partial | ✅ Tushare + AKShare |
| 巨潮 filings | ❌ | Partial | ✅ Read + parse |
| DCF model | ❌ | ❌ | ✅ |
| Backtest | ❌ | ❌ | ✅ |
| Portfolio mgmt | ❌ | ❌ | ✅ |
| Multi-source cross-validate | ❌ | ❌ | ✅ Phase 4 verify |
| Citation density | Vague | Vague | Measured + enforced |
| Audit trail | ❌ | ❌ | ✅ Signed |
| Self-host | ❌ | ❌ | ✅ |
| API | ❌ Closed | ❌ Closed | ✅ Plugin SDK |
| Free to use | ✅ | ✅ (limited) | ✅ (BYO API key) |

**UpUp is the only one with end-to-end, verifiable, scriptable research workflow for A-shares.**

---

## vs Wind / Choice (paid terminals)

| Dimension | Wind / Choice | UpUp |
|---|---|---|
| Price | ¥10,000+/year | Free (BYO API) |
| Real-time Level-2 | ✅ | ❌ (Tushare has 1-min bars) |
| A股 fundamentals | ✅ | ✅ (Tushare) |
| Global markets | ✅ | ✅ (via Financial Datasets API) |
| Backtest | ✅ (built-in) | ✅ (via skills) |
| AI agent | ❌ | ✅ |
| Open source | ❌ | ✅ |
| Scriptable | Limited (EPL) | ✅ Any language |
| Runs offline | ✅ | ✅ (with local LLM) |

**Wind for institutional data, UpUp for agentic research on top of the data.**

---

## vs LangChain / LlamaIndex (frameworks)

| Dimension | LangChain | LlamaIndex | UpUp |
|---|---|---|---|
| Form | Python/JS lib | Python lib | CLI app |
| Finance | ❌ (you build) | ❌ (you build) | ✅ Pre-built |
| A-share | ❌ | ❌ | ✅ |
| Skills | ❌ | ❌ | 50+ |
| Plugin system | Limited | Limited | 4 runtimes |
| Production-ready | ⚠️ Bring your own | ⚠️ Bring your own | ✅ Out of the box |

**LangChain for prototyping your own agent, UpUp for actually doing research on A-shares today.**

---

## When NOT to Use UpUp

- **Pure coding work** — use Claude Code / Cursor / Aider
- **High-frequency trading** — UpUp is research, not execution
- **Compliance-critical reports** — UpUp is a tool, not a registered investment advisor
- **Real-time Level-2 data** — Wind / Choice still win
- **You're offline for days** — UpUp is online-first

---

## See Also

- [docs/roadmap.md](./roadmap.md) — what's coming
- [docs/showcase.md](./showcase.md) — real example outputs
- [docs/architecture.md](./architecture.md) — under the hood

---

<p align="center"><strong>UpUp — 投资研究的瑞士军刀。</strong></p>
