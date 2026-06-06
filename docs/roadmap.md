# Roadmap

> **Where UpUp is going.** This is a living document, updated every release. It is **not** a promise — items can be deprioritized or re-scoped based on user feedback.

## TL;DR

| Now (2026 Q2) | Next (2026 Q3) | Later (2026 Q4+) |
|---|---|---|
| A-share data, 50 skills, 5-phase workflow | Plugin marketplace, web UI, voice mode | Backtesting-as-a-service, broker integration, mobile |

---

## 2026 Q2 (Now) — Polish & Adoption

> **Theme**: make what exists rock-solid and well-documented.

### Core
- [x] Top-tier OSS documentation (this commit)
- [x] Honest "Forked from dexter" attribution everywhere
- [x] README comparison vs alternatives
- [x] 50+ skills indexed in `/skills`
- [x] 4 plugin runtimes (bun / jiti / wasm / mcp)
- [x] i18n EN + zh-CN symmetric, 56+ keys
- [x] Plan mode + Loop recovery + auto-compact
- [x] KAIROS proactive runtime (earnings triggers, position monitor)

### Quality
- [x] LangSmith eval runner with Ink UI
- [x] Citation density counter
- [x] Audit chain (signed)
- [x] Permission system + plan mode + hooks
- [x] `bun run lint:scc` (source-code-size budget)
- [x] 8 rounds of Sprint hardening (v1 → v8)

### Distribution
- [x] Binary compile via `bun build --compile`
- [x] Homebrew formula (planned — Q2 end)
- [ ] `npm publish` (planned)
- [ ] Docker image (planned)

---

## 2026 Q3 (Next) — Ecosystem

> **Theme**: let the community build on UpUp.

### Plugin Marketplace
- [ ] `upup skills add <owner>/<name>` — install skills from a registry
- [ ] `upup plugins add <name>` — install plugins
- [ ] Discovery UI in TUI
- [ ] Rating / review system
- [ ] Verified-publisher badge
- [ ] Revenue share (planned, post-MVP)

### Web UI (optional companion)
- [ ] Read-only web view for reports (`.upup/reports/`)
- [ ] Browser-based chat (via gateway)
- [ ] Multi-device sync (via cloud memory, opt-in)
- [ ] Mobile-friendly PWA

### Voice Mode
- [ ] Voice input via Whisper / local model
- [ ] Voice output via TTS
- [ ] Wake-word "UpUp"
- [ ] Hands-free `/invest` walkthrough

### More Data Sources
- [ ] Wind EDB integration
- [ ] Choice 金融终端 integration
- [ ] 雪球 sentiment data
- [ ] 同花顺 问财 query language
- [ ] 东方财富 龙虎榜 full data
- [ ] 通达信 formula import

### More Skills
- [ ] Options strategies (50ETF 期权 / 商品期权)
- [ ] Convertible bonds (可转债)
- [ ] 北交所 strategies
- [ ] REITs
- [ ] 港股通 strategies
- [ ] Crypto (BTC / ETH / DeFi)
- [ ] FX / commodities

---

## 2026 Q4+ (Later) — Differentiation

> **Theme**: things no one else does.

### Broker Integration
- [ ] Read-only portfolio sync (华泰 / 中信 / 国君)
- [ ] One-click research → broker terminal handoff
- [ ] Execution: NO. (Compliance, risk, and philosophical reasons)

### Backtesting-as-a-Service
- [ ] Server-side backtest (your data, our compute)
- [ ] Walk-forward optimization
- [ ] Multi-strategy portfolios
- [ ] Live paper trading

### Institutional Features
- [ ] Multi-user teams (read / write roles)
- [ ] Compliance log (every tool call, every output)
- [ ] Data lineage (where did this number come from?)
- [ ] Audit reports (PDF)
- [ ] SSO / SAML

### Education
- [ ] Interactive tutorials in the TUI
- [ ] "Show your work" mode — explain every step
- [ ] Curriculum for new investors

### Mobile
- [ ] iOS / Android app (read-only, with deep links to TUI)
- [ ] Watch push notifications
- [ ] Voice assistant on the go

---

## Non-Goals

Things we will **not** do, on purpose:

- ❌ **Trade execution** — too much regulatory burden, too much risk
- ❌ **Central server / SaaS** — we are local-first
- ❌ **Closed-source plugins** — all plugins must be open
- ❌ **Paid skills** — at least in the foreseeable future
- ❌ **Crypto wallet integration** — too many scams, too much risk
- ❌ **Leveraged products** — no margin, no futures recommendations

---

## How to Influence the Roadmap

- **Upvote existing issues** with 👍
- **Open a new issue** with the `feature_request` template
- **Submit a PR** — see [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Sponsor** — coming soon

---

## Versioning

- **CalVer `YYYY.M.D`** — e.g., `2026.05.15`
- **Tags** — `vYYYY.M.D` (e.g., `v2026.05.15`)
- **Branches** — `main` is always deployable; feature branches use `codex/<name>` prefix
- See [CHANGELOG.md](../CHANGELOG.md) for history

---

## See Also

- [README.md](../README.md) — overview
- [docs/architecture.md](./architecture.md) — under the hood
- [docs/comparison.md](./comparison.md) — vs alternatives
- [CHANGELOG.md](../CHANGELOG.md) — what shipped

---

<p align="center"><strong>UpUp — 涨，涨，一直涨。</strong></p>
