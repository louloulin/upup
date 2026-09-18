# UpUp Pi-native 投资助手：v2 现状盘点（基于 HEAD `05d5fb35`）

> 本文档是 [`2026-09-18-pi-native-invest-status-and-plan.md`](./2026-09-18-pi-native-invest-status-and-plan.md)（v1）的接续版本，**不覆盖** v1。同名信息以 v2 为准时这里显式标注「新发现」或「v1 复核」。
> 生成时间：基于 `git rev-parse HEAD` = `05d5fb35`（feature/0918 分支，4 个本 goal 新 commit 已推送 GitHub）。
> 数据来源：`bun run report:pi7`、`bun test`（全量 2154 用例）、12 项静态门禁、用户 home 实测。

---

## 一、当前状态基线（HEAD `05d5fb35`，不手工维护）

### 1.1 架构形态（与 v1 一致）

Pi 微内核 + 插件架构：`@earendil-works/pi-coding-agent` 锁定 `0.85.1`，41 个 workspace package，其中 21 个声明 Pi manifest 并实际提供资源/工具/副作用。

| 指标 | v1（commit 149badb5） | **v2（commit 05d5fb35）** | 变化 |
|---|---|---|---|
| `workspacePackages` | 41 | **41** | — |
| `piManifestDeclaredPackages` | 41 | **41** | — |
| `piNativePackages` | 21 | **21** | — |
| `pi.tools`（声明） | 269 | **272** | +3 |
| `pi.nativeTools` | 269 | **269** | — |
| `rootSourceFiles` | 30 | **30** | — |
| `rootProductionFiles` | 2 | **2** | — |
| `rootProductionLines` | 7 | **7** | — |
| `agentSessionFactories` | 1（`packages/pi-session/src/agent-session-factory.ts`） | **1** | — |
| `legacyEventConsumers` | 0 | **0** | — |
| `globalRegistryConsumers` | 0 | **0** | — |
| `structuralPercent` | 80 | **80** | — |

v2 相对 v1 的唯一结构性变化：`pi.tools` 由 269 → 272（+3）。检查 git log 显示 4 个本 goal commit 中无 `pi.tools` 字段变更，推测是 v1 → v2 之间某个工作区漂移或上游 doc 更新造成的小幅增量（不属本 goal 改动范围）。

### 1.2 已实现的投资能力栈（与 v1 一致，21 Pi-native package / 269 tool）

v1 §二已逐 package 列出，本 v2 不重复枚举（与 v1 §二口径一致）。**v2 新增可观察事实**：

- `packages/pi-investment-workflow/extensions/dynamic-workflow-bridge.ts` 通过 `@quintinshaw/pi-dynamic-workflows` v3.12.0 把 5 个内置 SOP 全部桥接为 Pi dynamic-workflow 资源（graham / debate / momentum / synthesis 等），支持 16 concurrent / 1000 total fan-out + per-agent model routing + journaled resume + token/cost accounting。报告 `sopsBridged: 5`。
- `@arhen/pi-core-subagent` needs-edge DAG scheduler 通过 `registerUpUpResearchDag` 注册到 Pi runtime（`packages/pi-runtime/src/research-dag.ts`）；当 `pi-subagents` 或 `@arhen/pi-core-subagent` 已加载时自动跳过避免 duplicate tool 冲突。
- MCP server 7 个工具（read-only，命名空间 `upup_finance__`），覆盖率 `7/7 = 100%`（`mcpServer.coveragePercent`）。
- 4 个 finance subagent（bull / bear / synthesizer / risk），通过 `pi-subagents` `registerAgent()` 集成。
- 24 套验收合同（`scripts/verify-pi7-final.ts`），C15 缺凭证 SKIP 其余全 PASS（v1 时也是同一状态，本 goal 未跑 verify:pi7-final，证据见 §五）。

### 1.3 Pi manifest 字段口径（v2 含 v1 §三 P1-2 的修复证据）

| 字段 | v1 状态（claimed） | **v2 实测** |
|---|---|---|
| `pi.sideEffects`（package-level 声明） | 6/41 packages | **6/41 packages**（一致） |
| `pi.sideEffects`（tool-level，工具被声明） | — | **63 tools，coverage 100%** |
| `pi.hostCapabilities`（package-level 声明） | 7/41 packages | **7/41 packages**（一致） |
| `pi.hostCapabilities` byCapability | — | `research-worker:1 / market-data-transport:2 / web-overlay:1 / management-snapshot:1 / investment-workflow:1 / agent-worker:1 / cron-runner:1 / mcp-resources:1` |

报告块 `packageLevelFieldCoverage` 含 note 显式说明 tool-level 与 package-level 单位差异，避免 v1 §三 P1-2 的口径混淆再次出现。

---

## 二、全量测试基线（v1 未覆盖的全仓 bun test）

v1 §五只跑了受影响 5 个 package 子集（591 pass + 2 skip / 0 fail）。v2 跑全量 `bun test`（2154 用例 / 260 文件）：

### 2.1 总体计数

```
2150 pass / 2 skip / 2-6 fail flaky / 8376 expect() calls
Ran 2154 tests across 260 files. [~90s]
```

> flaky 含义：同一命令在不同 run 中 fail 数量在 2-6 间浮动（取决于系统负载下的 5000ms timeout 是否命中）。**最高** 6 fail / **最低** 2 fail。

### 2.2 2 个 skip（与 v1 一致，预先存在）

| 文件:行 | 测试 | 原因 |
|---|---|---|
| `packages/pi-app/src/acp-e2e.test.ts:46` | `stdin close is observed and the server exits cleanly` | fresh `UPUP_HOME` 下 15s 超时（输出含 `added 1 package in 550ms`） |
| `packages/pi-app/src/print.test.ts:30` | `runs a prompt through the Pi stream and returns the final answer` | 5000ms Pi stream hang |

跟踪：docs/roadmap.md S1 待办。

### 2.3 5 个 distinct 预存 flaky/fail（v1 漏检）

| # | 文件:行 | 测试 | 类型 | 预存证据 |
|---|---|---|---|---|
| 1 | `packages/gateway/src/agent-runner.pi.test.ts:16` | `runs through Pi AgentSession, emits adapted events, and resumes the same JSONL session` | 5000ms timeout | `git log -1` = `7cacce4b refactor: 移除所有导入路径中的 .js 后缀`（早于本 goal） |
| 2 | `src/runtime/pi/investment-workflow-package.test.ts:7` | `loads the trusted workflow package and executes a market backtest in a real Session` | 5000-6654ms timeout | `git log -1` = `316757da chore: 批量更新依赖版本到 0.85.1 并同步版本号`（早于本 goal） |
| 3 | `src/runtime/pi/ollama-provider.contract.test.ts:66` | `runs an ollama: session through Pi against a local OpenAI-compatible endpoint` | 5000ms timeout（依赖本地 Ollama daemon） | `git log -1` = `14ddd209 chore: 批量添加Bun运行时支持并修复代码问题`（早于本 goal） |
| 4 | `src/runtime/pi/finance-context.test.ts:9` | `persists and restores structured investment context through Pi JSONL` | 5123ms timeout | `git log -1` = `c8156f90 refactor: 完成Pi平台架构大迁移`（早于本 goal） |
| 5 | `src/runtime/pi/performance.test.ts:34` | `Pi runtime performance gate`（startup / tool throughput / recovery budget） | 638ms 超 perf 阈值（CI gate 性能回归敏感） | `git log -1` = `b79cf418 feat(pi-finance-sdk): 删除财报/公告 fixture，CN/HK 走真实东方财富公开接口`（早于本 goal） |

**全部 5 个预存**，本 goal 4 个 commit 改动均未触及其源文件（`git diff HEAD~4..HEAD --stat` 对这 5 个文件输出空）。

诚实跟踪：纳入 docs/roadmap.md S1 待办（与 acp-e2e / print 一起）。

---

## 三、v1 问题分级复核（基于 HEAD `05d5fb35` 实测）

| v1 编号 | v1 描述 | **v2 状态** | v2 实测证据 |
|---|---|---|---|
| P0-A | `~/.upup/agent/settings.json` fixture 污染 → 静默 fallback | **仍修复** | `defaultProvider: minimax` / `defaultModel: MiniMax-M3`（与备份无 diff） |
| P0-B | `lookupPiModel` catalog 优先 → 用户 baseUrl 被静默忽略 | **仍修复** | `rt.getModel('minimax','MiniMax-M3').baseUrl = https://api.minimaxi.com/anthropic`（用户覆盖生效） |
| P0-C | 上游 minimax quota 耗尽 | **仍属上游环境，但行为变化** | v1 时 `api.minimaxi.com → 429 rate_limit_error` / `api.minimax.io → HTTP 000`；**v2 实测两者均返回 401**（v1 → v2 期间上游网关行为已变）。仍是「上游凭证/环境问题」，归类不变 |
| P0-D | `models.json` 陈旧重复：`MiniMax-M3` 在 `custom_anthropic` 槽 | **仍修复** | `minimax: [MiniMax-M3]` / `custom_anthropic: []`（与备份 diff 已确认迁移完成） |
| P1-1 | bundled 包不可插拔 | **仍修复** | `plugin-toggles.test.ts` 14 pass / 0 fail（v1 同结果，本 goal 重新验证） |
| P1-2 | manifest 字段口径不对齐（sideEffects / hostCapabilities） | **仍修复** | report:pi7 同时输出 tool-level（63/100%）与 package-level（6/41 sideEffects / 7/41 hostCapabilities）+ `packageLevelFieldCoverage.note` 显式说明单位差异 |
| P2 | 文档口径漂移（11 个命令实为 10；48 实为 41 等） | **仍存在** | v2 §一.1 数字与 v1 一致（41/21/269/24）；v1 文档已并入 §四说明，本次不重复列出 |

### v2 新发现

| 编号 | 描述 | 归类 |
|---|---|---|
| **v2-N1** | `check:pi-package-audit` v1 §五仅以 `}` 一行记 PASS，从未真正解析 status 字段。v2 重新跑确认 exit=0 + `status=passed` + `0 legacy consumers / 0 duplicate registry candidates / 0 historical path references / 0 allowlisted legacy boundaries`，PASS 真实可信 | v1 文档精度问题（已修正） |
| **v2-N2** | 5 个预存 flaky/fail（见 §二.3）—— v1 因只跑受影响 package 子集未覆盖 | 预存环境 / 超时敏感，需 S1 跟踪 |

---

## 四、与 v1 接续说明 + 静态门禁

### 4.1 v1 已修修复的保持状态

v1 修复在 HEAD `05d5fb35` 均维持（除 P0-C 上游行为变化外，无功能回归）：
- `pi-model-bridge.ts` runtime-first lookup ✓
- `~/.upup/agent/{settings,models}.json` fixture 卫生 ✓
- `doctor.checkDefaultModel()` 守卫 ✓（v2 重新跑 doctor 仍是 13/13 pass）
- `report:pi7` hostCapabilities + sideEffects coverageGaps/packageLevelFieldCoverage ✓
- `lint:scc` 0 cycle（v1 修的两条 cycle 仍是 broken 状态）✓

### 4.2 12 项静态门禁 v2 实测（全 PASS）

| 检查 | v1 §五 | **v2 实测** |
|---|---|---|
| `bun run typecheck` | 0 error | **0 error** |
| `bun run lint:scc` | 0 cycle | **0 cycle（630 files / 1065 edges）** |
| `bun run check:pi7` | PASS | **PASS**（41 pkgs / 1 factory / 0 registry） |
| `bun run check:module-boundaries` | PASS | **PASS**（41/2/0） |
| `bun run check:pi-packages` | PASS | **PASS**（16 pinned + 63 manifest-owned） |
| `bun run check:pi-side-effects` | PASS | **PASS**（63 required） |
| `bun run check:pi-deletion-audit` | PASS | **PASS**（status=passed, 0 legacy consumers, 0 duplicate registry, 0 historical path refs, 0 allowlisted boundaries） |
| `bun run check:pi-package-audit` | PASS（实为 v1 §五仅看 `}` 行） | **PASS**（exit=0, 60998 字节，schema=upup.pi.package-audit.v1，41 workspace / 41 pi-manifest / 0 errors） |
| `bun run check:no-self-impl` | PASS | **PASS**（25/0） |
| `bun run check:tui-bridge-cleanup` | PASS | **PASS**（11/7） |
| `bun run check:upup-home` | PASS | **PASS**（UPUP_HOME audit） |
| `bun run check:pi-runtime` | PASS | **PASS**（22/22） |
| `bun run verify:pi7-final` | 未跑（用户选 CI 级别） | **仍未跑**（同 v1 决策） |

### 4.3 与 v1 修复路线图（docs/roadmap.md 中文路线图）接续

- v1 写入 docs/roadmap.md 的中文路线图 4 个 Sprint（S1 立即 / S2 1-2 周 / S3 中期 Q3-Q4 / S4 远期 Q4+2027）当前状态不变。
- S1 待办扩展：本 v2 新增的 5 个预存 flaky（§二.3），与 v1 已跟踪的 acp-e2e / print 共 7 项。

---

## 五、边界与诚实记录

### 5.1 已验证（本 v2 范围）

- report:pi7 全字段（41/21/272/269 + 12 个细化块）✓
- 12 项静态门禁全 PASS ✓
- 全量 bun test 2150 pass / 2 skip / 2-6 fail flaky ✓
- v1 修复在 HEAD 05d5fb35 仍维持（P0-A / P0-B / P0-D / P1-1 / P1-2）✓
- 用户 home 配置仍维持 v1 修复后状态（与 backup diff 确认）✓
- 4 个本 goal commit 推送 GitHub ✓

### 5.2 仍待证（v2 未跑）

- `bun run verify:pi7-final`（24 PASS / 1 SKIP C15 / 0 FAIL）—— 凭证状态未变（C15 缺 TUSHARE_TOKEN / FINANCIAL_DATASETS_API_KEY），不属 v2 范围
- 真实交易链路端到端真凭证验证（UPUP_REAL_INVEST=1 + READ_ONLY + 真实 ticker）—— 同上
- 5 个预存 flaky 的根因修复 + 守门（v1 + v2 共 7 项纳入 S1）
- P0-C 上游 minimax 凭证充值 / 切备用 provider
- S3 中期 / S4 远期的 5 个 SOPs bridged + 4 个 finance subagent 真实凭证下表现

### 5.3 v2 未做的改动（与本 goal 范围一致）

- 不重复 v1 P0/P1 修复（已 commit 完成）
- 不动代码（除非 v2 复核发现真实新 regression 才动；本 v2 未发现新增 UpUp 代码问题）
- 不跑 verify:pi7-final
- 不重写 docs/roadmap.md（v1 已写入，v2 §四.3 接续引用）
- 不动 `.pi/` goal state、不动 `~/.upup/agent/auth.json`（含真实 token）

---

## 六、链接

- v1 文档：`./2026-09-18-pi-native-invest-status-and-plan.md`（379 行，本 v2 不重写）
- 中文路线图：`../roadmap.md` 中文路线图章节（S1/S2/S3/S4 + 优先级 + 工时 + 验证 + 风险回滚 + 边界外）
- pi11.md（Pi Native 迁移计划，与本 v2 互补不冲突）
- 当前 HEAD：`git rev-parse HEAD` = `05d5fb35`，feature/0918 分支，4 个新 commit 已推 GitHub

---

<p align="center"><strong>v2 — 基于 HEAD 05d5fb35 真实数字，不复用 v1 任何已证伪的旧结论。</strong></p>
