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

<a id="zh-roadmap"></a>

## 中文路线图（Pi Native 迁移后 · 2026 Q3+）

> 与上方英文季度规划互补，本节按 **Sprint** 划分而非季度，回答「迁完后做什么」。与 [`pi11.md`](./internal/migrations/pi11.md)（回答「怎么迁」）、[`docs/analysis/2026-09-18-pi-native-invest-status-and-plan.md`](./internal/analysis/2026-09-18-pi-native-invest-status-and-plan.md)（回答「现状与问题分级」）三者口径一致。

### Sprint 划分

#### S1（立即 · 本周内可完成）

- [ ] **P0-A 收尾**：跑 `upup doctor` 确认 `~/.upup/agent/settings.json` 的 `defaultProvider` / `defaultModel` 已被新 `checkDefaultModel` 守卫接住，未配置用户偏好时不再静默 fallback 到 Pi 默认模型。
- [ ] **P0-B 验证**：实测 `curl -s -X POST https://api.minimaxi.com/anthropic/v1/messages -H "x-api-key: <key>"` 返回 `429 rate_limit_error`（凭证有效、配额耗尽），与 catalog 端点 `api.minimax.io` 的 `HTTP 000 connect FAILED` 对照，确认 `lookupPiModel` 的 runtime-first 顺序生效。
- [ ] **acp-e2e 修复**：`packages/pi-app/src/acp-e2e.test.ts` 的 `stdin close is observed` 测试在 fresh `UPUP_HOME` 下 15s 超时——实测输出含 `added 1 package in 550ms`，是首次运行时 `bun install` 拖住事件循环，需预热或跳过 npm install。
- 工时估算：约 3 人日。
- 验证方式：`bun run verify:pi7-final` 预期 24 PASS / 1 SKIP（C15 缺凭证）/ 0 FAIL。
- 风险与回滚：本 goal 所有改动均在 working tree（未 push）；任一 P0 修复验证失败则 `git checkout .` 撤销。
- 依赖：无。

#### S2（1-2 周 · 用户配置与真凭证前置）

- [ ] **上游配额问题（P0-C）**：联系 minimax 充值 Token Plan，或在 `~/.upup/agent/models.json` 把默认模型切到 deepseek 备用（需 `.env` 增补 `DEEPSEEK_API_KEY`）。
- [ ] **真凭证闭环（C15）**：用户提供 `TUSHARE_TOKEN`（CN/HK 行情与公告）与 `FINANCIAL_DATASETS_API_KEY`（美股 SEC 之外）后，重跑 `bun run verify:pi7-final` 让 C15 退出 skip 状态。
- [ ] **pi11.md 已规划项合并**：把 [pi11.md](./internal/migrations/pi11.md) 后续 Sprint 中尚未落实的项（如扩展 pi-native package 的 host capability）合并到本路线图。
- 工时估算：约 5 人日（含等待用户充值的时间）。
- 验证方式：所有 25 套验收合同全 PASS（包括 C15）。
- 风险与回滚：若 minimax 充值后仍不稳，可临时切 deepseek；备份 `~/.upup/agent/{settings,models,auth}.json` 到 `~/.upup/agent/<date>-backup/`。
- 依赖：用户提供凭证。

#### S3（中期 · 2026 Q3-Q4）

- [ ] **投资链路端到端真凭证验证**：用 `UPUP_REAL_INVEST=1 UPUP_REAL_INVEST_CONFIRM=READ_ONLY` 跑 `/invest <ticker>` 走完 detect → plan → execute → verify → report 五阶段，每阶段断言产物。
- [ ] **Skill 作用域精细化**：按 `spec.skills` 显式白名单暴露用户全局 skill（解决 `AGENTS.md` Known Gap「每次 session 默认加载 175 个全局 skill」）。
- [ ] **Plugin-toggles 公开 API**：`upup plugin list / enable / disable` 命令文档化与 E2E（当前实现已在 `packages/pi-cli-bootstrap/src/plugin.ts` + `packages/pi-resource-composition/src/plugin-toggles.ts`）。
- [ ] **Side-effects 阈值收紧**：critical 工具（`config_set` / `write_file` / `mcp_auth_get` / `notify` / `place_trade_order`）的 policy 默认 deny 与显式 approval 路径打通 E2E。
- 工时估算：约 15 人日。
- 验证方式：`bun run eval` evals 套件全绿 + 真凭证下五阶段 E2E。
- 风险与回滚：plugin disable 粒度若过粗（误关核心包），回退到 bundled 全加载只需 `upup plugin enable @upup/<pkg>`。
- 依赖：S2 完成。

#### S4（远期 · 2026 Q4+ / 2027）

- [ ] **Web UI 配套**：与上方英文 Q3 节同步，`upup-web` 已有侧车雏形（`check:pi-runtime` 22/22 通过），落地需补浏览器路由 + 反向代理。
- [ ] **Voice mode**：Whisper / 本地 TTS 接入 Pi session；与英文 Q3 节同步。
- [ ] **移动端 / PWA**：iOS / Android app（只读 + 深度链接回 TUI）；与英文 Q4+ 节同步。
- [ ] **Broker integration**（**边界外，待合规与风险评估**）：只读持仓同步（华泰 / 中信 / 国君），不接入交易执行。
- 工时估算：30+ 人日，跨多个季度。
- 验证方式：用户验收 + 合规审查 + 独立发布 tag 滚动。
- 风险与回滚：每个子项独立发布 tag，季度滚动；任一项延期不影响其他项推进。
- 依赖：S3 完成 + 合规审查通过。

### 优先级矩阵

| 优先级 | 项 | 阻塞性 | 备注 |
|---|---|---|---|
| P0 阻断 | P0-A / P0-B / P0-C / P0-D | 高 | A、B、D 已在本 goal 修，C 需用户充值 |
| P1 架构 | bundled 可插拔 + manifest 字段对齐 | 中 | 已在本 goal 修，plugin-toggles 等用户提交 |
| P2 体验 | 真凭证五阶段 E2E + Skill 作用域 | 中 | S3 启动 |
| P3 拓展 | Web UI / Voice / 移动端 | 低 | S4 远期 |

### 与 pi11.md 的对接（pi11.md 已归档至 `docs/internal/migrations/`）

[`pi11.md`](./internal/migrations/pi11.md) 是 **Pi Native 迁移**的完整迁移计划（48 个 package 的迁移路径、约束、回滚），已于 2026-09 收尾（仓库 `be1a780d` HEAD）。本路线图是 **迁移完成后**的功能演进路线图：两者互补不冲突——pi11.md 回答「怎么迁」，本路线图回答「迁完后做什么」。两者节奏可通过 `docs/roadmap.md` 与 `pi11.md` 的交叉引用对齐。

### 边界外（明确排除，不在本路线图 Sprint 内）

按本 goal（mu6n8hdd-ej3dsb）约定：

- ❌ **真实交易下单**：`place_trade_order` 等 critical 工具在 Pi policy 层默认 deny，未经显式 approval 不执行。
- ❌ **发布 tag/publish**：需用户确认时机与粒度，不在本 goal 自动推进。
- ❌ **C15 真实凭证闭环**：缺 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY`，本 goal 仅做 SKIP 占位，不强行跑闭环。
- ❌ **plugin-toggles 的 git commit**：本 goal 内 staged 仅做校验门禁，不 commit。
- ❌ **Web UI / Voice mode / 移动端**：在 S4 远期，本路线图仅列出，不在本 goal 范围内细化。
- ❌ **真实投资验证**：需用户提供真凭证后再启动 S3。

### 验证方式（每个 Sprint 收尾必跑）

1. `bun run typecheck` — 0 error。
2. 受影响 package `bun test` — 全绿（pi-event-adapter 65 + pi-cli-bootstrap doctor 13 + pi-runtime 33 = 111 当前基线）。
3. `bun run lint:scc` — 0 循环依赖（已在本 goal 修两条预存 cycle）。
4. `bun run check:pi7 check:module-boundaries check:pi-packages check:pi-side-effects check:pi-deletion-audit check:pi-package-audit check:no-self-impl check:tui-bridge-cleanup check:upup-home check:pi-runtime` — 全 PASS。
5. 凭证就绪后切 `bun run verify:pi7-final` — 24 PASS / 1 SKIP（C15）/ 0 FAIL。
6. 更新 [`docs/analysis/2026-09-18-pi-native-invest-status-and-plan.md`](./internal/analysis/2026-09-18-pi-native-invest-status-and-plan.md) 的 §三 与 §四，记录该 Sprint 的实施证据。

### 风险与回滚表

| 风险 | 触发条件 | 回滚方案 | 兜底时间 |
|---|---|---|---|
| 真凭证泄露 | 误提交 `.env` 或 `auth.json` | `git filter-repo` 清除历史 + rotate 凭证 | 即时 |
| P0 修复引入新 cycle / type error | `lint:scc` 重新出现 / `tsc --noEmit` 新 error | `git checkout .` 撤销本 goal 改动 | < 30 分钟 |
| plugin-toggles 误关关键包 | 用户核心扩展被 disable | `upup plugin enable @upup/<pkg>`（需先实现 CLI） | 即时（CLI 就绪后） |
| 上游模型 API 变更 / 配额耗尽 | minimax / DeepSeek / OpenAI 调整 | 切备用 provider；保持 `resolvePiModel` 的 runtime-first 语义 | < 1 人日 |
| acp-e2e 测试持续 hang | fresh `UPUP_HOME` 下 npm install 拖住 | 在 S1 修：预热 `node_modules` 或跳过 install | S1 内 |

---

<p align="center"><strong>UpUp — 涨，涨，一直涨。</strong></p>
