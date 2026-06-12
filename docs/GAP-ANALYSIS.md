---
> ⚠️ **Superseded** (2026-06-12): this document is kept for historical reference.
> The canonical "upup vs upstream" comparison now lives in
> [`openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md`](./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md)
> with reproducible shell commands and pinned commit SHAs.
> The canonical "中国版" positioning lives in
> [`docs/upup-china-edition-positioning.md`](./upup-china-edition-positioning.md).
> When in doubt, those two docs win.
---

# UpUp 投研 Claude Code 差距分析与 v5 行动方案

> **生成时间**: 2026-06-04
> **目的**: 对照 Claude Code / loucode 代码分析 AI 能力 + 中文圈投研实战需求,盘点 UpUp 现状,识别最大差距,产出 v5 行动方案
> **范围**: 投资研究 AI Agent 闭环(用户明确"upup 不需要实现编码能力")

---

## 0. 上下文

UpUp 已经是一个**功能丰富**的投研 CLI:48 工具子目录 / 60+ 工具 / 5 路推送 / Multi-Agent / KAIROS 主动扫描 / Bridge 跨设备 / 50 skills / 75 feature flags / DCF 估值 / Brinson 归因 / 实时行情 / 自然语言选股 / 跨会话记忆 / 投研 Claude 人设。在 v4-1 + v4-2 还新增了**自指能力**:code-archaeology(读懂自己)+ competitive-positioning(13 竞品矩阵 + 4 唯一差异化 + 4 投资者路径)。

但**"丰富"≠"闭环"**。本报告对照 Claude Code / loucode 的核心能力,识别最大差距,产出 v5 投资研究 AI Agent 闭环方案。

---

## 1. 已落地能力盘点(Strengths)

### 1.1 工具层(48 子目录,60+ 工具)

| 域 | 子目录 / 工具 | 数量 |
|----|--------------|------|
| **A 股** | `src/tools/astock/`(龙虎榜 / 北向 / 涨停 / 板块 / 个股详情等) | 12 |
| **美股 / 全球** | `src/tools/finance/`(18 文件,4 市场统一抽象) | 18 |
| **港股 / 加密** | financial_datasets API 覆盖 | — |
| **估值** | `src/tools/valuation/`(DCF / DDM / 多倍) | 4 |
| **回测** | `src/tools/backtest/`(策略 + 引擎 + 归因) | 3 |
| **归因** | `src/tools/portfolio/`(Brinson / sector / style) | 10 |
| **风险** | `src/tools/risk/`(VaR / 集中度) | 1 |
| **新闻 / 情绪** | `src/tools/news/` + `src/tools/sentiment/` | 多个 |
| **研报** | `src/tools/research/deep-search`(AlphaSense 对标) | — |
| **筛选** | `src/tools/screening/`(FinChat 对标) | 1 |
| **分析** | `src/tools/analysis/`(Hebbia 对标) | — |
| **意图** | `src/agent/intent-detector/`(同花顺问财对标) | — |
| **交易** | `src/tools/trading/`(sandbox / ibkr / xueqiu) | — |
| **协作** | Bridge(36 文件) + Coach(记忆 + 5 推送) | — |

**结论**:数据 + 分析层**非常厚**,单个工具能力已对标国内外头部产品。

### 1.2 Agent 层(主对话 + 子 Agent + 主动)

- ✅ **投研 Claude 主对话**:`src/agent/role-system.ts` + `src/agent/agent.ts` + `src/coach/memory.ts`(1.1 + 1.2 + 1.3 全部落地)
- ✅ **Multi-Agent Coordinator**:`src/coordinator/`(4 worker 并行 research → synthesis → implementation → verification)
- ✅ **KAIROS 6 状态机**:`src/kairos/`(待命 / 扫描 / 告警 / 追踪 / 汇报 / 休整)
- ✅ **5 路推送**:`src/coach/channels/`(cli/wechat/feishu/dingtalk/email)
- ✅ **75 feature flags**:`src/agent/feature-gates.ts`
- ✅ **Capability manifest 5 groups**:realtime / coordinator / kairos / trading / multimodal + competitorRefs + markets
- ✅ **投资知识 + 工作流 hooks**:`src/agent/investment-knowledge.ts`(324 行) + `src/agent/investment-workflow-hooks.ts`(445 行)

### 1.3 自指 / 战略层(v4-1 + v4-2 已 push)

- ✅ **code-archaeology**(`src/code-archaeology/`):自动读懂 src/ 全部代码,5 layer 推断 + 死文件检测 + hot spot + CODE-MAP.md(963 文件 / 154K LOC)
- ✅ **competitive-positioning**(`src/competitive-positioning/`):13 竞品 7 维度矩阵 + 4 唯一差异化证据 + 4 类投资者决策路径 + 30 字 sologan + docs/COMPETITIVE.md
- ✅ **role-system v4 增强**:投研 Claude 注入 4 唯一 sologan + 三件套(Multi-Agent / KAIROS / Bridge)

### 1.4 测试 / 文档 / 部署

- ✅ `bun test` 4120 tests / 4117 pass(3 pre-existing langchain uuid fail 与本次无关)
- ✅ `LICENSE` (MIT) + `Dockerfile` + `docker-compose.yml` + `env.example`
- ✅ `docs/CODE-MAP.md` + `docs/COMPETITIVE.md`

---

## 2. 关键差距(Gaps)— 对照 Claude Code / loucode + 投研实战

### 2.1 ❌ **差距 1:CLI 命令稀少(最高优)**

**现状**:`src/commands/` 只有 9 个文件(config / doctor / executor / index / mcp / onboarding / plugin / sandbox / unified-registry),**0 个投资研究高优命令**。

**v3 spec 要求**(tasks.md):
- Sprint 1.4(5 个高优):morning-brief / earnings-preview / risk-dashboard / portfolio-review / watchlist-edit
- Sprint 2.3(6 个):rebalance-now / alert-add / alert-remove / screen / compare / doctor
- Sprint 4 提到 11 个 CLI 隐藏命令

**v4-6(5 个):** /competitive-scan / /code-review / /archaeology / /refactor-suggest / /test-coverage

**用户故事痛点**:投研 Claude 启动后,用户键入 `/morning-brief` 应该 1 句话看到今日盘前报告,但**实际不识别这个命令**(只能自然语言问)。这与 Claude Code 的 `/init` `/clear` `/compact` 等高频命令体验**差距巨大**。

**影响**:用户必须每次用自然语言解释"给我看今天早上 9 点的盘前报告,包括我持仓异动、关注股新闻、财报日提醒"。每次 30+ 字符,不如 `/morning-brief` 1 个 token。

**优先级**:**P0**。

### 2.2 ❌ **差距 2:Plan Mode 投资研究工作流缺位**

**现状**:`src/plan/plan-context.ts` 实现了 plan 持久化 / 步骤状态机,但**没有"主对话集成"**(用户问"分析 NVDA",agent 不会先输出研究计划等用户确认)。

**Claude Code 核心能力**:Plan Mode(进入计划模式 → LLM 输出研究计划 → 用户审阅 / 修改 / 确认 → exit plan mode → 执行)。这是 Claude Code 与其他 AI 工具的**最大差异**。

**投研场景特别需要**:
- 用户:"给我深度分析 NVDA"
- 当前 UpUp 行为:直接调 analyze_symbol,4 worker 并行分析,一次性出报告
- Plan Mode 行为:先输出 1 份研究计划(数据 / 工具 / 输出 / 时间 / 风险),用户可"加上 A 股比亚迪对比" / "跳过新闻情绪" / "改用 5 天数据" 等,确认后执行

**为什么投研更需要**:
- 投资决策成本高(动辄几百万),不能 LLM 单方面决定
- 投研计划可以审计(投决会引用"上次计划是什么")
- 投研 plan 可重放(同一计划 → 同一输出,验证 LLM 稳定性)

**影响**:与 Claude Code 体验差距最大的一环,也是投研审计/合规所需。

**优先级**:**P0**。

### 2.3 ❌ **差距 3:研究 → 计划 → 回测 → 交易 → 复盘 闭环未编排**

**现状**:各模块独立,缺统一编排层。用户想走完"研究 NVDA → 写计划 → 跑回测 → 模拟交易 → 复盘",必须手动串 5 个命令。

**理想闭环**:
```
用户: "我想投资 NVDA,给我一个完整流程"
  → Plan Mode: 自动生成 5 步研究计划
  → 用户确认
  → Step 1: research NVDA(analyze_symbol + research_deep_search)
  → Step 2: 估值(DCF skill + 3 个对比)
  → Step 3: 回测(VWAP 策略 + 5 年数据)
  → Step 4: 模拟交易(sandbox broker,基于 Step 3 信号)
  → Step 5: 复盘(Brinson + 周报)
  → 输出 1 份"NVDA 投决会摘要"
```

**当前痛点**:用户在主对话中必须"先问研究 → 再问估值 → 再问回测 → 再问交易 → 再问复盘",5 轮对话,LLM 上下文已膨胀,可能丢失早期偏好。

**优先级**:**P0**(与 2.2 Plan Mode 强联动)。

### 2.4 ❌ **差距 4:文档 4 唯一故事 + README 不完整**

**现状**:
- ✅ `docs/COMPETITIVE.md`(14,973 字,5K-15K 范围)
- ✅ `docs/CODE-MAP.md`(自动生成)
- ❌ `README.md` 顶部没 sologan
- ❌ `docs/positioning.md` 没写(v3 2.4.4)
- ❌ `docs/deployment.md` 没写(v3 2.4.5,Docker 部署指南分散在 Dockerfile + docker-compose.yml)

**影响**:新用户 git clone 后看 README,不知道 UpUp 是什么、4 唯一是什么、怎么 1 步启动。

**优先级**:**P1**。

### 2.5 ⚠️ 差距 5:Code-archaeology 可执行单文件扫描(增量缓存可改进)

**现状**:`code-archaeology.ts` 全量扫 970 文件 648ms,已可接受。但缺:
- `--stale` 模式(只扫 git diff 文件)— 配合 coach 推送"今日代码晨报"
- `--json` 模式输出给其他工具消费

**优先级**:**P2**。

### 2.6 ⚠️ 差距 6:v3 plan tasks.md 143/0 未更新(只是治理问题,不影响功能)

**现状**:Sprint 1.1/1.2/1.3 已 push,但 v3 tasks.md checkbox 0/143。代码已落地,plan 没标注。

**影响**:plan 治理混乱,后人接手 v3 不知进度。

**优先级**:**P1**(归档前必须 fix)。

### 2.7 v4 plan 现状(目录已删,代码已 push)

`openspec/changes/top-tier-investment-claude-code-v4/` 整个目录被删除(可能是 comet 流程重置)。但 v4-1 (code-archaeology) + v4-2 (competitive-positioning) 代码已 push 到 upstream main(commit edd2ea17 + 3348fb70),**功能 100% 保留**。

v4-3 (code-review) 文件曾部分写入但**目录被 reset,代码未 push**,任务作废。

**v4-4 (refactor + test-coverage) / v4-5 (kairos-code-dream) / v4-6 (cli-extension v4) / v4-7 (manifest 深化) / v4-8 (archive)**:**未开始**。

**v4 中应保留**(与投资研究 AI Agent 强相关):
- ✅ v4-1 code-archaeology(已 push)
- ✅ v4-2 competitive-positioning(已 push)
- ⚠️ v4-5 kairos-code-dream(KAIROS 集成,可与新 v5 合并)
- ⚠️ v4-6 cli-extension v4(与差距 1 重叠,合并到 v5)

**v4 中可跳过**(与"upup 不需要编码能力"冲突):
- ❌ v4-3 code-review(代码评审,编码辅助)
- ❌ v4-4 refactor + test-coverage(代码重构,编码辅助)

---

## 3. 优先补什么(优先级排序)

按"对投资研究 AI Agent 闭环的边际收益 / 实现成本"排序:

| # | 差距 | 边际收益 | 实现成本 | 优先级 |
|---|------|----------|----------|--------|
| 1 | 5-10 个高优投资 CLI 命令 | **极高**(用户故事直接入口) | 中(1 turn) | **P0** |
| 2 | Plan Mode 投资研究工作流(主对话集成) | **极高**(Claude Code 核心差异) | 中(1 turn) | **P0** |
| 3 | 研究 → 计划 → 回测 → 交易 → 复盘 闭环编排 | **高**(整合现有能力) | 中(0.5 turn,需在 Plan Mode 上叠加) | **P0** |
| 4 | 投资 plan 持久化 + 审计 + 重放 | **高**(投决会/合规) | 中(0.5 turn) | **P1** |
| 5 | README + positioning + deployment 文档 | 中(曝光) | 小(0.3 turn) | **P1** |
| 6 | 归档 v3 plan + tasks.md checkbox 同步 | 中(治理) | 小(0.2 turn) | **P1** |
| 7 | KAIROS code-dream(自动每日 code-archaeology + 推送) | 中(差异化) | 中(0.5 turn) | **P2** |
| 8 | 跳过 v4-3 / v4-4(编码辅助) | — | — | — |

**3 件 P0**:**CLI + Plan Mode + 完整闭环**。这 3 个是 v5 核心。

---

## 4. v5 行动方案(top-tier-investment-claude-code-v5)

### 4.1 命名 + 范围

- **Change name**:`top-tier-investment-claude-code-v5`
- **范围**:3 个 P0 sprint + 2 个 P1 sprint(5 sprint 1 turn 落地)
- **方法**:openspec change + 逐 sprint 推进,每个 task 完成需 typecheck + 测试全绿

### 4.2 Sprint 1 — Plan Mode 投资研究工作流(0.4 turn)

**目标**:在主对话中实现 Claude Code 风格的 Plan Mode。

**任务**:
- [ ] 1.1 扩展 `src/plan/plan-context.ts` 加 `enterPlanMode()` / `exitPlanMode()` / `isInPlanMode()` API
- [ ] 1.2 新增 `src/plan/plan-builder.ts`:`buildResearchPlan(intent, context)` 根据用户意图生成结构化研究计划(数据 / 工具 / 输出 / 风险 / 时间)
- [ ] 1.3 新增 `src/plan/plan-executor.ts`:`executePlan(plan, ctx)` 顺序执行 plan 步骤,产出中间结果 + 最终报告
- [ ] 1.4 集成到 `src/agent/agent.ts` 主循环:用户输入触发后,识别"研究类"意图自动 enter plan mode,生成计划 → 等待用户确认 → 执行
- [ ] 1.5 新增 plan 持久化:`.upup/plans/<planId>.json`(可重放,可审计)
- [ ] 1.6 写 `src/plan/plan.test.ts`(10+ tests:enter/exit/build/execute/persist/audit)

### 4.3 Sprint 2 — 5 个高优投资 CLI 命令(0.3 turn)

**目标**:实现 v3 1.4 5 个高优隐藏命令。

**任务**:
- [ ] 2.1 `src/commands/morning-brief.tsx`:盘前 9:00 报告(持仓异动 + 关注股新闻 + 财报日提醒)
- [ ] 2.2 `src/commands/earnings-preview.tsx`:财报日 T-1 提醒(持仓 + 关注股)
- [ ] 2.3 `src/commands/risk-dashboard.tsx`:实时风险仪表板(VaR / 行业暴露 / 集中度)
- [ ] 2.4 `src/commands/portfolio-review.tsx`:组合复盘(Brinson 归因 + 周报)
- [ ] 2.5 `src/commands/watchlist-edit.tsx`:自选股增删改
- [ ] 2.6 集成到 `src/commands/index.ts` 中央注册表
- [ ] 2.7 写 `src/commands/cli-extension-p0.test.ts`(5+ tests per command)

### 4.4 Sprint 3 — 完整研究 → 计划 → 回测 → 交易 → 复盘 闭环(0.3 turn)

**目标**:在主对话中,1 条用户输入触发 5 步闭环。

**任务**:
- [ ] 3.1 `src/agent/investment-workflow.ts`:定义 5 步 workflow 类型 + 编排器
- [ ] 3.2 集成 Plan Builder:用户输入 → 自动生成 5 步 plan → 用户确认
- [ ] 3.3 步骤 1: research(analyze_symbol + research_deep_search)
- [ ] 3.4 步骤 2: valuation(DCF skill + 多倍对比)
- [ ] 3.5 步骤 3: backtest(strategy_backtest + 5 年数据)
- [ ] 3.6 步骤 4: trade(sandbox broker 模拟,基于 backtest 信号)
- [ ] 3.7 步骤 5: review(Brinson + 周报)
- [ ] 3.8 写 `src/agent/investment-workflow.test.ts`(8+ tests)

### 4.5 Sprint 4 — 文档 + 投资 plan 持久化审计(0.2 turn)

**任务**:
- [ ] 4.1 `README.md` 顶部 sologan + 1 段话 + 4 唯一链接
- [ ] 4.2 `docs/positioning.md` 写 4 唯一详细故事(从 COMPETITIVE.md 抽出)
- [ ] 4.3 `docs/deployment.md` 写 Docker / 自托管指南
- [ ] 4.4 plan audit log:`.upup/plans/audit.log` JSONL,记录每条 plan 的创建 / 修改 / 执行 / 失败

### 4.6 Sprint 5 — 归档 v3 + 收尾(0.1 turn)

**任务**:
- [ ] 5.1 同步 v3 tasks.md checkbox(143 tasks 按实际落地情况勾选)
- [ ] 5.2 `openspec archive top-tier-investment-claude-code`
- [ ] 5.3 v3 specs sync 到 `openspec/specs/`
- [ ] 5.4 更新根 `openspec/CHANGELOG.md`

### 4.7 v5 完成标志

- [ ] 5-10 个高优投资 CLI 可用(`/morning-brief` 等)
- [ ] Plan Mode 在主对话中可触发(用户问"分析 NVDA"自动进入)
- [ ] 5 步完整闭环 1 句话触发
- [ ] 投研 plan 可持久化 + 审计 + 重放
- [ ] README / positioning / deployment 文档完整
- [ ] v3 plan 归档
- [ ] `bun test` + `bun run typecheck` 全绿
- [ ] v4-1 + v4-2 维护(不破坏)
- [ ] commit + push upstream main

---

## 5. 不做的事(Non-Goals)

- ❌ **不实现编码能力**(用户明确):跳过 v4-3 code-review + v4-4 refactor + test-coverage
- ❌ **不重写 v3 已落地能力**:Sprint 1.1-1.3 / 2.4 / 4.1-4.5 等已 push,只补缺口
- ❌ **不引入新外部依赖**(保持 Bun + TypeScript + LangChain 现状)
- ❌ **不破坏向后兼容**:capability-manifest `competitorRefs` 字段已用 `?? []` 兜底,v5 plan 持久化也用 `?? null` 兜底
- ❌ **不商业化预备**(v3 Sprint 7,本 v5 不做)

---

## 6. 风险

- **Plan Mode 触发判定**:用户说"今天天气"也会误判为"研究类"。需要 intent 阈值 + 用户确认机制。
- **5 步闭环耗时**:5 步顺序执行可能 5-10 分钟。需要 step-level checkpoint + resume。
- **CLI 命令注册冲突**:已 9 个命令 + 加 5 个 = 14 个,中央注册表需要 stable id 防止冲突。
- **plan 持久化体积**:每条 plan 1-10KB,长期 1000+ plans → 需要 LRU + 压缩。

---

## 7. 总结

UpUp 现状:**功能丰富但缺闭环**。最大 3 个 P0 差距是 CLI 命令 / Plan Mode / 5 步编排。这 3 个补完,UpUp 就能从"工具集"升级为"AI Agent 投决会伙伴"。

v5 用 1 turn 落地 3 P0 + 2 P1 = 5 sprint,推送后即可对外宣称"投研 Claude Code 完整版"。

**下一步**:开新 comet change `top-tier-investment-claude-code-v5`,逐 sprint 推进。

---

> **本报告生成于 2026-06-04**,数据源:`code-archaeology` 真实扫 + `competitive-positioning` 矩阵 + `git log` 落地追踪 + `src/commands/` 现状盘点
> **下次更新**:Sprint v5 全部落地后,产出"v5 落地报告" + "v6 路线图"
