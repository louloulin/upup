# Tasks: 补齐对标顶级投研助手的差距

> 5 个 P0/P1 差距(G1–G5)+ 3 个横切主题(C1–C3)的实施任务清单,分 4 个阶段(P0–P3)。
> **每个阶段 = 1 个 OpenSpec change;每个阶段内每条任务 = 1 个 commit。**
> 任务排序保证 `bun run typecheck` + `bun test` 在每个 commit 之后都绿。
>
> 本 change 仅做规划、归档,实际实现落在后续 change 中。本 tasks.md 既是实施蓝图,也作为本 change 的"已盘点但未执行"产物。

## 阶段总览(ANSI 视图)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          4 阶段实施序列                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   P0 速赢 ──→ P1 核心 ──→ P2 战略护城河 ──→ P3 横切加固                       │
│   (1 change)  (2 change)  (2 change)        (2 change)                       │
│   ~5 commits  ~12 commits ~18 commits        ~8 commits                      │
│                                                                              │
│   关键依赖:                                                                  │
│   P1 依赖 P0 (dossier 实体存在,G1 引用基础设施已有)                             │
│   P2 依赖 P1 (数据层稳态后再做重型 UI / 市场)                                    │
│   P3 依赖 P0-P2 (功能差距落地后再做打磨)                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## P0 — 速赢(1 个 change,~5 commits)

> 目标:用 1 个 prompt 改动 + 1 个 memory 实体,证明"复用优先"范式能 ship。

- [ ] **P0.1** 在 `src/agent/capability-manifest.ts` 新增 `citation` 工具组描述符;在 `src/agent/prompts.ts` 的最终答案段落注入"每条断言必须 `[src:N]`"硬约束,引用密度上限 ≤ 1 引用 / 60 tokens。evals 加引用密度 + 正确性回归。
  - 改: `src/agent/prompts.ts`, `src/agent/capability-manifest.ts`, `src/evals/*`(新增)
  - 验收: `bun test src/evals` 全绿;手工跑一次"分析 NVDA"能在最终答案看到 ≥ 3 个 `[src:N]` 引用且都跳到真实来源。

- [ ] **P0.2** 在 `src/memory/investment-memory.ts` 新增 `Dossier<T>` 实体类型(键 = ticker,字段 = snapshot / metricsHistory / theses[] / watchTriggers[] / freshnessTs / versionHash)。在 `src/agent/investment-workflow.ts` 给任意分析加 pre-phase hook(读)+ post-phase hook(写),RAG 用 `src/memory/memvid-rag.ts` 召回历次论点。
  - 改: `src/memory/investment-memory.ts`, `src/agent/investment-workflow.ts`, `src/memory/memvid-rag.ts`(只追加调用点)
  - 验收: 跑两次"分析 NVDA",第二次的最终答案里包含"基于上次的 X 论点,本次新增 Y";`bun test` 已有用例全绿。

- [ ] **P0.3** 在 `src/agent/scratchpad.ts` 之上新增带签名的 `AuditRecord`(ed25519,密钥来自 `src/memory/encrypted-store.ts`)。在 `src/commands/investment/registry.ts` 的 BUY / SELL / COVER 推荐路径上 emit 一条不可变记录。
  - 改: `src/agent/scratchpad.ts`(扩展类型), `src/commands/investment/registry.ts`, `src/memory/encrypted-store.ts`(只追加密钥派生)
  - 验收: 跑一次 `/invest BUY NVDA 100`,审计日志里能看到签名记录,篡改任何字段后签名验证失败。

- [ ] **P0.4** 在 `src/mcp/resource-tools.ts` 暴露 3 个新资源:`upup://dossier/{ticker}`、`upup://audit/{intent-id}`、`upup://citations/{query-id}`。外部 MCP client(Claude.ai / Cursor)能直接 read。
  - 改: `src/mcp/resource-tools.ts`, `src/mcp/server.ts`(注册资源)
  - 验收: 用 `mcp inspector` 工具能 read 上面 3 个 URI,返回结构化 JSON。

- [ ] **P0.5** 在 `src/commands/investment/registry.ts` 新增 `/dossier <ticker>` 一页式摘要命令;补 `src/commands/investment/investment.test.ts` 单测。
  - 改: `src/commands/investment/registry.ts`, `src/commands/investment/investment.test.ts`
  - 验收: `/dossier NVDA` 输出含 snapshot / 最近 3 次论点 / freshness 时间戳。

**P0 完成定义**:5 个 commit 全绿 + `openspec archive close-top-tier-investment-gaps` 已运行(本规划 change 归档)+ P1 第一个 change 已 new 出来。

---

## P1 — 核心差距(2 个 change,~12 commits)

### P1.a — G3 业绩预告 + 财报会 diff(1 个 change,~6 commits)

- [ ] **P1.a.1** 扩展 `src/commands/investment/earnings-preview.ts`:从 `src/tools/earnings/estimates.ts` 拉一致预期 + 修订历史;从 `src/search/x-search.ts` 拉卖方 / 买方分析师最近 7 天推文;从 `src/tools/finance/read-filings.ts` 抓 8-K 中的电话会底稿(新增 `earnings_transcript` 资源 kind)。
  - 改: `src/commands/investment/earnings-preview.ts`, `src/tools/finance/read-filings.ts`(新增资源类型)
  - 验收: T-7d 触发后能拿到完整预告;电话会结束后 1h 内能补到底稿。

- [ ] **P1.a.2** 在 `src/agent/subagent.ts` 之上加 3-worker 并行 manager(analyst / sentiment / transcript),共享 scratchpad,`src/agent/subagent-parallel.test.ts` 覆盖并发合并。
  - 改: `src/agent/subagent.ts`(追加 manager API), `src/agent/subagent-parallel.test.ts`(新增)
  - 验收: 3 个 worker 都能并行启动,合并结果时不会丢失任一 worker 输出。

- [ ] **P1.a.3** 在 `src/kairos/scanner.ts` 新增 T-7d 财报前触发器(消费 `src/realtime/` 财报日历,dossier 超过 7d 未刷新时触发预告生成)。
  - 改: `src/kairos/scanner.ts`, `src/realtime/types.ts`(如有需要追加字段)
  - 验收: 在测试中注入"7 天后财报"事件,scanner 能在当天产生预告任务。

- [ ] **P1.a.4** 在 P1.a.1 的 earnings-preview 输出里加 `diff_against_prior_call` 字段(QoQ 语气 / 情绪 / Q&A 平衡),历次底稿写入 `src/memory/investment-memory.ts` dossier 的新字段 `earningsCalls[]`。
  - 改: `src/commands/investment/earnings-preview.ts`, `src/memory/investment-memory.ts`(追加字段)
  - 验收: 跑同一 ticker 两次"模拟财报"(mock),第二次能输出 diff。

- [ ] **P1.a.5** 在 `src/mcp/resource-tools.ts` 暴露 `upup://earnings-preview/{ticker}` 资源;在 `src/commands/investment/registry.ts` 新增 `/earnings <ticker>` 命令。
  - 改: `src/mcp/resource-tools.ts`, `src/commands/investment/registry.ts`
  - 验收: 外部 MCP client 能 read,CLI `/earnings NVDA` 输出一页式预告。

- [ ] **P1.a.6** P1.a 单测 + evals 收尾,`bun run typecheck` + `bun test` 全绿。

### P1.b — G4 自然语言选股器(1 个 change,~6 commits)

- [ ] **P1.b.1** 在 `src/tools/screening/index.ts` 新增 `nl_screen` 工具,Schema = `{query: string, universe?: 'us'|'cn'|'hk'|'crypto', limit?: number, realtime?: boolean}`。内部走 plan-builder(已有)做 NL → typed FilterSpec,再交给 `src/tools/finance/screen-stocks.ts` 确定性执行,最后用 `src/tools/valuation/decision-dashboard.ts` 给每个结果附 1 句论点。
  - 改: `src/tools/screening/index.ts`, `src/agent/capability-manifest.ts`(登记)
  - 验收: 跑 `nl_screen("AAPL-like 跌深质量复利 ex-金融")` 返回排序结果,每个结果带 1 句 thesis。

- [ ] **P1.b.2** `src/tools/screening/index.ts` 加 8 个单测 + 3 个 eval case,覆盖典型 NL:`AAPL-like`、跌深、RSI<35、ROE>20%、ex-金融、市值区间、复利型、组合。
  - 改: `src/tools/screening/index.ts`(追加测试)
  - 验收: 全部 NL 查询能稳定产出 FilterSpec(无 LLM 幻觉出的非法 schema)。

- [ ] **P1.b.3** `nl_screen` 加 `realtime: true` 模式,从 `src/realtime/eastmoney-feed.ts`(或 mock)拉日内 RSI / 量能,过滤掉已失效的标的。
  - 改: `src/realtime/index.ts`(暴露 filter API), `src/tools/screening/index.ts`
  - 验收: 开启 realtime 模式时,返回结果会随行情变化而变化(测试用 mock 验证)。

- [ ] **P1.b.4** `src/commands/investment/registry.ts` 新增 `/screen <nl query>` 命令;`src/agent/capability-manifest.ts` 登记 `nl_screen`。
  - 改: `src/commands/investment/registry.ts`, `src/agent/capability-manifest.ts`
  - 验收: `/screen "ROE>20% 且 RSI<35 且非金融"` 输出表格化结果。

- [ ] **P1.b.5** 性能 / 缓存层(用 `src/tools/cache/` 已有抽象,避免对同一 universe 重复扫描)。
  - 改: `src/tools/screening/index.ts`(集成 cache)
  - 验收: 同一 query 第二次响应 < 200ms(mock 环境下)。

- [ ] **P1.b.6** P1.b 单测 + evals 收尾,`bun run typecheck` + `bun test` 全绿。

---

## P2 — 战略护城河(2 个 change,~18 commits)

### P2.a — G5 策略市场 + 可分享回测(1 个 change,~10 commits)

- [ ] **P2.a.1** 在 `src/tools/backtest/backtest-tools.ts` 之上输出结构化"backtest report"(JSON + HTML 两份),用 `src/tools/export/` 已有抽象。报告必须包含:策略说明、因子来源、样本内外拆分、Walk-Forward 验证结果、Look-ahead 偏置检查、Sharpe / MaxDD / WinRate。
  - 改: `src/tools/backtest/backtest-tools.ts`, `src/tools/export/*`(追加渲染器)
  - 验收: 跑一次 sample 策略,生成的 HTML 报告能在浏览器打开,字段齐全。

- [ ] **P2.a.2** 在 `src/memory/` 之下新增(或扩展) `strategy-store.ts`,提供版本化 + 签名 + 依赖声明的策略存储(复用 `src/memory/encrypted-store.ts` 的签名能力)。
  - 改: `src/memory/strategy-store.ts`(新增), `src/memory/encrypted-store.ts`(只追加)
  - 验收: 同一策略多次 publish 后能看到 v1 / v2 / v3,任意历史版本可回滚执行。

- [ ] **P2.a.3** 验证 `src/agent/subagent.ts` 的 `isolation: worktree` 模式在 P2.a 场景下的稳定性(沙箱执行用户上传的策略代码,不能污染主仓库)。补并发 + 异常路径单测。
  - 改: `src/agent/subagent.ts`(追加测试), `src/agent/subagent-deep.test.ts`
  - 验收: 100 次并发沙箱执行,无 worktree 泄漏、无主仓库污染。

- [ ] **P2.a.4** 在 `src/mcp/server.ts` 暴露 `publish_strategy` / `fork_strategy` 端点,鉴权复用 `src/mcp/oauth.ts`。
  - 改: `src/mcp/server.ts`, `src/mcp/oauth.ts`(追加 scope)
  - 验收: 用未授权 client 调用 `publish_strategy` 失败;授权后成功。

- [ ] **P2.a.5** `src/commands/investment/registry.ts` 新增 `/strategy` 命令组:`/strategy new`、`/strategy run`、`/strategy publish`、`/strategy fork`。
  - 改: `src/commands/investment/registry.ts`
  - 验收: 4 个子命令全部能跑通 happy path。

- [ ] **P2.a.6** 在 P2.a.1 报告里强制方法学披露(factor sources / look-ahead bias / walk-forward / out-of-sample),缺一不可;新增 `/strategy audit <id>` 命令做合规检查。
  - 改: `src/tools/backtest/backtest-tools.ts`, `src/commands/investment/registry.ts`
  - 验收: 故意提交缺方法学披露的策略,`/strategy audit` 标红。

- [ ] **P2.a.7–10** P2.a 测试加固 + evals + 性能,`bun run typecheck` + `bun test` 全绿。

### P2.b — C3 Web UI 副屏(1 个 change,~8 commits)

- [ ] **P2.b.1** 新建 `src/web/`(Vite + React,**无业务逻辑**)。CI lint 强制:`src/web/**` 不允许 import 业务模块(`src/agent/`、`src/tools/`、`src/skills/`、`src/memory/`、`src/realtime/`、`src/kairos/`、`src/coordinator/`),只允许 import `src/bridge/` 暴露的 JSON snapshot。
  - 改: `src/web/`(全新), `.github/workflows/*` 或 `scripts/lint-boundary.sh`(新增)
  - 验收: 故意写一行违规 import,CI 立即 fail。

- [ ] **P2.b.2** 在 `src/bridge/server.ts` 新增 read-only JSON snapshot 端点:`/snapshot/dossier/{ticker}`、`/snapshot/watchlist`、`/snapshot/workflow/current`、`/snapshot/signals/recent`。
  - 改: `src/bridge/server.ts`, `src/bridge/protocol.ts`(追加消息类型)
  - 验收: 4 个端点都用 curl 能拿到合法 JSON;写权限端点不存在。

- [ ] **P2.b.3** `src/web/` 渲染 3 个页面:dossier 详情、自选股 + signals、workflow 状态。移动端响应式。
  - 改: `src/web/pages/*`(新增)
  - 验收: 用 Playwright 截图,3 个页面在桌面 / 移动两种宽度下都正常。

- [ ] **P2.b.4** Web 与 `src/bridge/` 之间的实时状态(WebSocket):dossier 新鲜度心跳、KAIROS alerts。
  - 改: `src/bridge/server.ts`(WS 通道), `src/web/lib/ws.ts`(新增)
  - 验收: 关闭 `bun run start` 中的 KAIROS 触发,dossier 新鲜度在 5s 内反映到 Web。

- [ ] **P2.b.5–8** Web 单测 + E2E(用 playwright)+ 性能,`bun run typecheck` + `bun test` 全绿。

---

## P3 — 横切加固(2 个 change,~8 commits)

### P3.a — C1 双语对齐(zh-CN / EN)(1 个 change,~5 commits)

- [ ] **P3.a.1** 新建 `src/agent/locale.ts`,提供 `getLocale()`(读 `LANG` / `LC_ALL` / `UPUP_LOCALE` env,默认 EN)和 `formatPrompt(section, locale)`。接入 `src/agent/prompts.ts`。
  - 改: `src/agent/locale.ts`(新增), `src/agent/prompts.ts`
  - 验收: `UPUP_LOCALE=zh-CN bun run start` 启动后所有 prompt 段落中文。

- [ ] **P3.a.2** 审计 `src/skills/*/SKILL.md` 全部 80+ 文件,识别最常用的 30 个,给每个 SKILL frontmatter 加 `description.zh-CN` 字段(保留 `description` 英文)。CI lint:新增 / 修改的 SKILL.md 缺 zh-CN 描述则 fail。
  - 改: `src/skills/*/SKILL.md`(30 个文件)+ `scripts/lint-skill-locale.sh`(新增)
  - 验收: 故意改一个 SKILL.md 删掉 zh-CN,CI fail。

- [ ] **P3.a.3** 审计 `src/components/*` 硬编码英文的 UI 字符串,加 zh-CN 兜底字符串。
  - 改: `src/components/*`(按需)
  - 验收: `UPUP_LOCALE=zh-CN` 下 CLI 所有提示中文。

- [ ] **P3.a.4** 把 `src/i18n/` 抽出(若尚未存在),集中维护 EN + zh-CN 字符串表;`src/components/*` 和 `src/agent/prompts.ts` 改用 `t('key')` 风格。
  - 改: `src/i18n/*`(按需新建)
  - 验收: 改一个 EN 字符串后,zh-CN 不受影响。

- [ ] **P3.a.5** P3.a 单测 + locale 切换 E2E,`bun run typecheck` + `bun test` 全绿。

### P3.b — KAIROS 过期告警 + C2 安全复核(1 个 change,~3 commits)

- [ ] **P3.b.1** 在 `src/kairos/proactive.ts` 新增 `stale_dossier` 告警:当 watchlist 中任意 ticker 的 dossier freshness > 30d,在 `src/components/investment-status-line.ts` 红色提示。
  - 改: `src/kairos/proactive.ts`, `src/components/investment-status-line.ts`
  - 验收: 注入 30d+ 的 mock dossier,状态行立刻显示告警。

- [ ] **P3.b.2** C2 审计轨迹的安全复核:验证 ed25519 密钥处理、确认 `src/memory/encrypted-store.ts` 下的审计链是 append-only、把威胁模型补到本 design.md 的"附录 B"。
  - 改: `src/memory/encrypted-store.ts`(按需加固), `openspec/changes/close-top-tier-investment-gaps/design.md`(追加附录 B)
  - 验收: 篡改审计链任何一字节,签名验证失败 + 测试断言通过。

- [ ] **P3.b.3** 补回归单测:审计链不可篡改、dossier 过期触发、引用密度上限。
  - 改: `src/agent/scratchpad.test.ts`(扩展), `src/kairos/proactive.test.ts`, `src/evals/citation-density.test.ts`(新增)
  - 验收: 3 个回归测试全绿。

---

## OUT-OF-SCOPE(本 change 范围内仅做留档,不做实现)

以下 10 项已在 design.md 附录 A 列出,本 change 不实现,各为未来 change 候选:

- 卖方一致预期聚合 + 修订
- 文档对比(10-K vs 10-K diff)
- 策略库搜索 / 发现
- 风险:VaR / Monte Carlo 压力测试
- 因子暴露 / 风格分解
- 投资组合税批会计
- 另类数据市场(卫星、网页流量、App 下载)
- 公司知识图谱 / 供应链映射
- 音频 / 播客式早报
- 移动端 App

---

## 横切验收标准(全部阶段适用)

- `bun run typecheck` 全绿(0 错误)。
- `bun test` 全绿;新功能有对应单测。
- `src/agent/prompts.ts` 最终答案路径 token 数 ≤ 4500(当前预算)。
- 不在 `src/` 下新建顶层目录(P3 的 `src/web/` 是唯一例外,且 CI lint 守住边界)。
- 不新增外部依赖(全部组合现有模块)。
- 每个阶段独立 1 个 OpenSpec change,自带 proposal / design / tasks / archive。
- 本规划 change(`close-top-tier-investment-gaps`)在 P0 最后一个 commit 之后由 `openspec archive` 归档。
