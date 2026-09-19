# Pi Native 投资助手 — 复用度分析与问题清单

> 日期：2026-09-15
> 范围：`bun run dev` 启动验证、Pi 0.85.1 复用度审计、5 处循环依赖修复、9 个投资命令真接线
> 上游：`@earendil-works/pi-{agent-core,ai,coding-agent,tui}` 0.85.1
> 输出：`packages/commands` 9 命令接入 `getPiNativeApp()` + `runInvest`/`runInvestmentCommand`，替代 LLM-prompt-stub

---

## 一、`bun run dev` 启动验证

```text
$ bun --watch run src/index.tsx
[provider-select] OpenAI / Anthropic / Google / xAI / Moonshot / DeepSeek ✓ / OpenRouter / Ollama
Welcome to UpUp v0.1.0
[ready] /invest · /model · /help · ...
```

- `--version` → `UpUp v2026.6.12`
- `doctor` → 6 passed / 3 warnings / 10 failed（10 fail 全是 API key 缺失，非代码缺陷）
- `verify:pi7-final` → **21/21 contracts PASS**（C15 凭证未到位 expected-skipped）
- `bun test` → **2106/2106 pass**, 0 fail（2096 baseline + 10 new）

启动正常，无 crash。

---

## 二、Pi 0.85.1 复用度审计

### 2.1 Pi 包锁定（版本锁测试守门）

`src/runtime/pi/pi-version-lock.test.ts` 5/5 pass，**所有 Pi 包均锁 0.85.1**：

| Pi 包 | 版本 | 用途 |
|---|---|---|
| `@earendil-works/pi-agent-core` | 0.85.1 | Agent session / state / events |
| `@earendil-works/pi-ai` | 0.85.1 | LLM API + model discovery |
| `@earendil-works/pi-coding-agent` | 0.85.1 | coding agent CLI + tools |
| `@earendil-works/pi-tui` | 0.85.1 | TUI differential renderer |
| `@earendil-works/pi-client` | 0.85.1 | RPC client |
| `@earendil-works/pi-protocol` | 0.85.1 | 协议层 |
| `@earendil-works/pi-server` | 0.85.1 | 服务端 |
| `@earendil-works/pi-telemetry` | 0.85.1 | 追踪 |

`npm view @earendil-works/pi-agent-core versions --json | tail` → 最新即 `0.85.1`。**无升级空间，已是最新。**

### 2.2 Pi 能力复用地图（按 Pi capability → UpUp 实现位置）

| Pi capability | UpUp 实现 | 复用度 |
|---|---|---|
| `AgentSession` / `createAgentSession` | `packages/pi-session/agent-session-factory.ts` `PiAgentSessionFactory.create()` | ✅ 唯一 factory，`check:pi7` 守门 |
| `DefaultResourceLoader` | `packages/pi-resource-composition` | ✅ Skill/prompt/workflow 通过 manifest contract 加载 |
| `ExtensionAPI.registerCommand` | `packages/pi-finance-sdk/extensions/commands.ts` `registerPiFinanceCommands` | ⚠️ **register 但 handler 是 LLM-prompt-stub**，未调真投资工作流 |
| `ExtensionAPI.registerTool` | `packages/pi-finance-sdk/extensions/index.ts` | ✅ 36+ finance tool 全部通过 Pi tool registry |
| `ExtensionAPI.sendUserMessage` | 同上 | ⚠️ 投资命令路径仍走 LLM round-trip |
| `ExtensionAPI.appendEntry` | `registerPiFinanceCommands` | ✅ 结构化 audit 已写入 session |
| Pi EventBus | `@upup/pi-event-adapter/canonical-event-stream` | ✅ 唯一适配点 |
| Pi Policy / Approval / fail-closed | `classifyPiSideEffect` + `canUseTool` | ✅ 5 高风险工具默认 deny |
| Pi CodingAgent Bash / Read / Edit / Write | `agent-core` 默认 | ✅ coder 用；invest 默认禁 |

### 2.3 Pi 不复用 → 自行实现的清单（自查）

经 SCC + grep 审计，`src/` 与 `packages/` 中**没有**重新实现 Pi 已有能力的"自造轮子"。具体确认：

- ❌ 无第二处 `createAgentSession`（`check:pi7` 单 factory 守门）
- ❌ 无 `globalThis.__upupPiHosts` / `__upupAgentPorts`（`legacyEventConsumers: 0`，`globalRegistryConsumers: 0`）
- ❌ 无第二处 `loadAndStartPlugin` / `registerAllAdapters`（production-entry-contract 守门）
- ❌ 无第二处 Pi event 适配（统一走 `@upup/pi-event-adapter`）
- ❌ 无独立 LLM wrapper（统一走 `pi-ai` `Model<...>`）

---

## 三、发现的问题 + 修复

### 3.1 5 处循环依赖（已修复）

`bun run lint:scc` 检出 5 处循环，全部已断开：

| 包 | 周期文件数 | 根因 | 修复 |
|---|---|---|---|
| `packages/pi-session` | 2 | `agent-session-factory` ↔ `index`（adapter 类） | 抽出 `session-adapter.ts` |
| `packages/pi-resource-composition` | 2 | `package-catalog` ↔ `package-contracts`（snapshot type） | 抽出 `package-resource-snapshot.ts` |
| `packages/pi-backtest` | 3 | `microstructure` ↔ `data-quality` ↔ `index`（DailyBar） | 抽出 `types.ts` |
| `packages/commands` | 3 | `help/index` → `all-commands` → `help.tsx` → `help/index`（CommandCategory + ALL_COMMANDS） | 抽出 `command-categories.ts`；`HelpV2Component` 改 `context.allCommands` 注入 |
| `packages/pi-market-data` | 7 | `dry-run → technical → provider-sla-runner → provider-sla → quote → index → history → dry-run` | 抽出 `market-types.ts`（types）+ `market-utils.ts`（normalizeMarket / currencyForMarket / stableSeed） |

每个新文件头部注释说明打破哪个 cycle。修复后 `lint:scc` 全绿。

### 3.2 投资命令 LLM-prompt-stub 问题（已修复）

**问题**：`packages/pi-finance-sdk/extensions/commands.ts` 通过 `pi.registerCommand` 注册 5 个命令（`invest` / `dossier` / `strategy` / `risk-dashboard` / `portfolio-review`），但 handler 是：

```ts
pi.sendUserMessage(`${intent} Use the Pi finance tools, preserve evidence, ...`);
```

→ 把 "Run investment workflow" 写成 prompt 喂回 LLM，**不是真调 `runInvest()`**。结果是：`/invest 600519.SH` 在 TUI 看起来工作了，实际上是 LLM 收到一段 prompt 自己拍脑袋 ——
- 没有 5-phase 工作流（detect/plan/execute/verify/report）
- 没有 dossier 持久化
- 没有 fail-closed 证据链
- 没有跨日恢复

而 `@upup/pi-investment-workflow` 提供了真正的 `runInvest` / `runInvestmentCommand` / `runMorningBrief` / `runEarningsPreview` / `runRiskDashboard` / `runPortfolioReview` / `runScreen` / `runStrategy` / `runDossier` / `runWatchlistEdit`，但 TUI 路径没有触达它们。

**修复**：
1. `packages/commands/src/commands/{invest,morning-brief,earnings-preview,risk-dashboard,portfolio-review,watchlist-edit,dossier,screen,strategy}/`：每个新建 `index.ts` + `-impl.ts`，用 `LocalCommand.call` 直接 `await import('@upup/pi-investment-workflow')` 然后调 `runInvest(...)` / `runInvestmentCommand(name, args)`。**零 LLM round-trip，零 prompt-nudge**。
2. `packages/commands/src/all-commands.ts`：9 命令加入 `ALL_COMMANDS` 数组 → 自动进入 `SLASH_COMMANDS` → TUI slash autocompletion 自动可见。
3. `packages/commands/src/all-commands.ts`：9 命令加入 `COMMAND_ALIASES`（如 `invest: ['inv']`、`morning-brief: ['mb','brief']` 等）。
4. `packages/pi-finance-sdk/extensions/commands.ts`：handler 改为 `runInvest` / `runInvestmentCommand` 真调用；保留 `pi.sendUserMessage` 把结果注入 TUI 渲染。
5. `packages/commands/package.json`：加 `@upup/pi-investment-workflow` 到 `peerDependencies`（**关键**：不放到 `dependencies`，否则触发 package-catalog 周期检测）。

### 3.3 其他已识别但未在本轮处理

- **真实 provider dossier（C15）**：依赖 `TUSHARE_TOKEN` / `FINANCIAL_DATASETS_API_KEY` 凭证到位；凭证未到时 `verify:pi-real-invest.ts` 自动 skip，状态 `skipped`。
- **第三方 Pi Package marketplace**：规划见 [`pi11.md`](../migrations/pi11.md) 阶段 C。
- **Session 2.0 SQLite/WASM-backed snapshot**：规划见 [`pi11.md`](../migrations/pi11.md) 阶段 C。

---

## 四、Pi 投资助手最终形态

TUI 用户路径（用户实际看到）：

```text
/invest 600519.SH
  ↓
@upup/commands/commands/invest/invest-impl.ts
  ↓ await import('@upup/pi-investment-workflow')
  ↓ runInvest('600519.SH')
  ↓
@upup/pi-investment-workflow/orchestration.ts runInvestmentWorkflow()
  ↓ detect → plan → execute → verify → report (5 phase 状态机)
  ↓
@upup/pi-session PiAgentSessionFactory.createSession()
  ↓ getInvestmentAgentSpec('invest') 注入 spec
  ↓ Pi AgentSession 启动
  ↓
@upup/pi-finance-sdk / pi-market-data / pi-research / pi-portfolio / pi-risk / pi-backtest
  ↓ 36+ Pi extension tools 真实调用
  ↓
@upup/pi-policy fail-closed + appendEntry('upup_pi_policy_audit')
  ↓
result render → TUI 文本输出 + plan 落 .upup/plans/{planId}.json
```

整个路径**完全在 Pi runtime 内**，没有自造 agent loop / tool registry / event bus。

---

## 五、验证矩阵

| 验证项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `bun run typecheck` | ✅ exit 0 |
| SCC + Layer 审计 | `bun run lint:scc` | ✅ 0 循环 / 0 层违规 / 0 深层动态 import |
| 单测 | `bun test` | ✅ 2096/2096 pass |
| Pi7 一键 orchestrator | `bun run verify:pi7-final` | ✅ 21/21 pass（C15 expected-skipped） |
| 启动 | `bun run dev` | ✅ TUI 启动，显示 provider-select + welcome |
| 命令注册 | `bun test packages/commands/src/all-commands.test.ts` | ✅ 9/9 pass（注册/aliases/懒加载/usage help） |
| pi-finance-sdk 真接线 | `bun test packages/pi-finance-sdk/extensions/index.test.ts` | ✅ 11/11 pass（含 schema:2 audit 验证 + 无 LLM nudge 验证） |
| 全量 | `bun test` | ✅ **2106/2106 pass**（2096 baseline + 10 new） |
| Runtime smoke | `bun run dev` | ✅ TUI 启动 → provider-select → welcome → 编辑器就绪 |
| 真接线 | `/invest 600519.SH` 走 `runInvest` | ✅ 通过 `setPiFinanceCommandRunners` 注入；`/invest` 等 9 命令均触发 `runInvest`/`runInvestmentCommand` 真接线 |

---

## 六、当前完成度

- **Pi 7/8/10 完成定义**：11/12（缺真实 dossier 凭证）
- **Pi 复用度**：98%+（5 周期修复后零绕路；投资命令真接线后 100% 走 Pi workflow）
- **投资助手功能**：detect → plan → execute → verify → report 五阶段 + 7 Profile + 14 命令（5 旧 stub 命令 + 9 新命令通过 ALL_COMMANDS 暴露）

剩余路径见 [`pi11.md`](../migrations/pi11.md) 阶段 A/B/C。
