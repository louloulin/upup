# Design: 补齐对标顶级投研助手的差距

## 目标

产出一份基于证据的、可分阶段实施的计划,通过**组合**现有 UpUp 模块,补齐 5 个 P0/P1 差距(G1–G5)与 3 个横切主题(C1–C3)。每个后续实现 change 控制在 ≤ ~6 个文件,以 `bun run typecheck` + `bun test` 收尾,保持代码库已有的"高内聚、低耦合"架构风格。

## 非目标

- 不引入新编排框架。扩展 `investment-workflow.ts` 与 `plan-builder.ts`,不替换。
- 不引入新持久化层。扩展 `memory/investment-memory.ts` 与 `memvid-rag.ts`,不新建数据库。
- 不引入新 LLM provider 路径。扩展 `model/llm.ts` 的 locale 处理。
- 不新建 MCP server。给现有 server 加 resource 即可。
- 不重写 UI。Web dashboard(C3)是只读副屏。
- 不重建"AI Agent 框架"。继续在现有 LangChain + Ink + pi-tui 栈上扩展。

## 顶层架构:UpUp 现状 + 5 大差距落点

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    UpUp 现有架构与 5 大差距分布                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────┐        ┌──────────────────────────┐           │
│   │   CLI (单一信源)          │◀──────▶│   Web UI (C3 只读)       │           │
│   │   src/cli.tsx            │ bridge │   src/web/ (Vite+React)  │           │
│   │   Ink + pi-tui           │        │   ★新:C3                 │           │
│   └──────────────┬───────────┘        └──────────────────────────┘           │
│                  │                                                            │
│                  ▼                                                            │
│   ┌──────────────────────────────────────────────────────────────┐           │
│   │   Agent Loop (src/agent/agent.ts)                            │           │
│   │   ┌────────────┐ ┌──────────────┐ ┌────────────────────┐      │           │
│   │   │ prompts    │ │ plan-builder │ │ subagent 并行      │      │           │
│   │   │ ★G1 加 [src:N]│ ★G4 NL→spec │ │ ★G3 三 worker     │      │           │
│   │   │ ★C1 locale │ │              │ │                    │      │           │
│   │   └────────────┘ └──────────────┘ └────────────────────┘      │           │
│   └──────────────────────────┬───────────────────────────────────┘           │
│                              │                                              │
│   ┌────────────┬─────────────┼─────────────┬────────────┐                  │
│   ▼            ▼             ▼             ▼            ▼                  │
│ ┌────────┐  ┌────────┐    ┌────────┐    ┌────────┐  ┌────────┐               │
│ │ tools  │  │ skills │    │ memory │    │kairos  │  │ bridge │               │
│ │ 80+    │  │ 80+    │    │ ★G2    │    │★G3触发 │  │ ★C3   │               │
│ │        │  │        │    │ dossier│    │★G2 过期│  │        │               │
│ └────────┘  └────────┘    └────────┘    └────────┘  └────────┘               │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────┐              │
│   │  MCP Server (src/mcp/server.ts)                          │              │
│   │  ★G1 暴露 citations  ★G2 暴露 dossier  ★G5 暴露策略        │              │
│   └──────────────────────────────────────────────────────────┘              │
│                                                                              │
│   图例: ★ = 本计划落点  ✗ = 显式不做                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 现状盘点:已被复用的模块(无新建基础设施)

通过 `ls src/` + 抽样阅读,以下模块已经具备,本计划的差距补齐全部基于"组合"它们:

| 领域 | 现有模块 | 复用点 |
|------|----------|--------|
| 搜索 | `src/tools/search/{exa,tavily,x-search,perplexity}.ts` | G1 引用源、G3 电话会底稿、G4 NL 选股器混合检索 |
| 金融数据 | `src/tools/finance/{fundamentals,filings,news,earnings,key-ratios,insider_trades,segments}.ts` | G1 来源标注、G2 dossier 快照、G5 策略输入 |
| 财报读取 | `src/tools/finance/read-filings.ts` + `src/mcp/resource-tools.ts` | G1 段落级引用、G3 8-K 电话会底稿抓取 |
| 记忆 | `src/memory/{investment-memory,memvid-rag,embeddings,store,encrypted-store}.ts` | G2 dossier、C2 审计轨迹、G5 策略版本化 |
| 多 Agent | `src/agent/subagent*.ts` + `src/coordinator/*` | G3 并行 preview worker、G5 沙箱回测执行 |
| 计划 / 工作流 | `src/plan/{plan-builder,plan-executor,research-plan}.ts` + `src/agent/investment-workflow.ts` | G4 NL 选股作为 1 步 plan、G3 preview 作为 3 步 plan |
| MCP | `src/mcp/{server,resource-tools,oauth,investment-data}.ts` | G1 把引用暴露为 MCP resource、G2 把 dossier 暴露为 MCP resource |
| 桥接 | `src/bridge/*` | C3 Web UI 从 bridge 读快照 |
| 实时行情 | `src/realtime/{mock-feed,eastmoney-feed,aggregator,throttled-feed}.ts` | G3 财报时间触发、G4 日内筛选 |
| KAIROS | `src/kairos/{scanner,position-monitor,proactive}.ts` | G3 财报前触发、G2 dossier 新鲜度检查 |
| 回测 | `src/tools/backtest/*` | G5 可分享回测 |
| 导出 | `src/tools/export/*` | G5 PDF/HTML 报告、C3 Web UI JSON 快照 |
| 投资组合 | `src/tools/portfolio/*`(含 Brinson) | G2 dossier P&L 历史、G5 策略归因 |
| 估值 | `src/tools/valuation/{decision-dashboard,target-price}.ts` | G4 选股器打分、G1 来源标注估值 |
| Prompts | `src/agent/prompts.ts`(最终答案路径) | G1 强制引用、C1 locale 切换 |
| 技能注册 | `src/skills/{registry,loader,executor}.ts` | G1 单技能引用提示、C1 locale 感知技能元数据 |
| 审计 / 签名 | `src/agent/scratchpad.ts`(不可变日志) | C2 交易意图审计轨迹 |

## 5 大差距的复用映射

### G1 引用归因式回答 — 数据流

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  G1 引用归因式回答 数据流                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  user query: "分析 NVDA Q4 业绩"                                              │
│       │                                                                      │
│       ▼                                                                      │
│  ┌──────────────────┐                                                       │
│  │  Agent Loop      │  prompts.ts 加 "每条断言必须 [src:N]"                  │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│     ┌─────┴──────┬──────────────┬──────────────┐                            │
│     ▼            ▼              ▼              ▼                            │
│  ┌────────┐  ┌────────┐    ┌────────┐      ┌────────┐                        │
│  │ exa    │  │ tavily │    │ x-     │      │ read-  │                        │
│  │ search │  │ search │    │ search │      │ filings│                        │
│  │ +para  │  │ +url   │    │+雪球/  │      │ +chunk │                        │
│  │ offset │  │        │    │ 推特   │      │   id   │                        │
│  └───┬────┘  └───┬────┘    └───┬────┘      └───┬────┘                        │
│      │           │             │              │                             │
│      └───────────┴──────┬──────┴──────────────┘                             │
│                         ▼                                                    │
│               ┌─────────────────────┐                                        │
│               │ Citation Registry   │  [src:N] → {                           │
│               │                     │    url, kind, offset,                  │
│               │                     │    snippet, ts}                        │
│               └──────────┬──────────┘                                        │
│                          │                                                   │
│                          ▼                                                   │
│               ┌─────────────────────┐                                        │
│               │  Final Answer       │  内联 markdown 链接,                   │
│               │  "营收 $60.9B       │  可点击跳转原文                          │
│               │   [src:1]..."       │  (密度上限:1 引用 / 60 tokens)         │
│               └──────────┬──────────┘                                        │
│                          │                                                   │
│                          ▼                                                   │
│               MCP 暴露 upup://citations/{query-id}                           │
│               evals/* 加引用密度 + 正确性回归                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**复用锚点(全部已存在)**: `src/agent/prompts.ts` + `src/tools/search/*` + `src/tools/finance/read-filings.ts` + `src/mcp/resource-tools.ts` + `src/components/answer-box.ts` + `src/skills/registry.ts` + `src/evals/*`。

### G2 持久化个股 dossier — 生命周期

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  G2 持久化 Dossier 闭环                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      ┌────────────────────────────────────────────────────┐                 │
│      │   memory/investment-memory.ts (扩展)                │                 │
│      │   ┌────────────────────────────────────────────┐   │                 │
│      │   │ Dossier<T> = {                             │   │                 │
│      │   │   ticker,                                  │   │                 │
│      │   │   snapshot: {name, sector, marketCap, ...}│   │                 │
│      │   │   metricsHistory: KvM[],                    │   │                 │
│      │   │   theses: Thesis[]  // 历次研究论点          │   │                 │
│      │   │   watchTriggers: Trigger[]                  │   │                 │
│      │   │   freshnessTs: number                       │   │                 │
│      │   │   versionHash: string                       │   │                 │
│      │   │ }                                          │   │                 │
│      │   └────────────────────────────────────────────┘   │                 │
│      │   存储: JSON(主) + RAG(memvid-rag,向量召回)         │                 │
│      └─────────────────────────┬──────────────────────────┘                 │
│                                │                                            │
│   ┌────────────┐  load pre   │   refresh post    ┌──────────────┐           │
│   │ CLI query  │─────────────▶│◀──────────────────│ workflow     │           │
│   │ "分析 NVDA"│              │                   │ 结束 phase 5 │           │
│   └────────────┘              ▼                   └──────────────┘           │
│                     ┌──────────────────┐                                     │
│                     │  Agent Loop      │                                     │
│                     │  + dossier 作为  │                                     │
│                     │    上下文        │                                     │
│                     └────────┬─────────┘                                     │
│                              │                                               │
│                              ▼                                               │
│                     ┌──────────────────┐                                     │
│                     │ Final answer     │                                     │
│                     │ (dossier 上下文  │                                     │
│                     │  + 本次新论点)   │                                     │
│                     └────────┬─────────┘                                     │
│                              │                                               │
│                              ▼                                               │
│   ┌──────────────────────────────────────────────────────────┐              │
│   │  对外消费:                                               │              │
│   │  · KAIROS stale-dossier 告警(freshness > 30d)             │              │
│   │  · MCP upup://dossier/{ticker} 资源                      │              │
│   │  · Web UI (C3) 只读展示                                  │              │
│   │  · /dossier <ticker> 一页式摘要命令                      │              │
│   └──────────────────────────────────────────────────────────┘              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**复用锚点**: `src/memory/investment-memory.ts` + `src/memory/memvid-rag.ts` + `src/agent/investment-workflow.ts`(加 pre/post hook)+ `src/commands/investment/portfolio-review.ts` + `src/realtime/*`(心跳)+ `src/kairos/proactive.ts`(过期告警)+ `src/mcp/resource-tools.ts`。

### G3 业绩预告 + 财报会 diff

```
┌──────────────────────────────────────────────────────────────────────────────┐
│            G3 业绩预告 + 财报会 diff (3-worker 并行)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   KAIROS scanner: T-7d 触发 (realtime 检测财报日历)                             │
│        │                                                                     │
│        ▼                                                                     │
│   ┌──────────────────┐                                                      │
│   │  Subagent Manager│  isolation=none, shared scratchpad                    │
│   └────────┬─────────┘                                                      │
│            │                                                                │
│     ┌──────┴────────┬───────────────────┐                                   │
│     ▼               ▼                   ▼                                   │
│  ┌──────────┐   ┌──────────┐       ┌──────────┐                             │
│  │ Worker 1 │   │ Worker 2 │       │ Worker 3 │                             │
│  │ Analyst  │   │ Sentiment│       │Transcript│                             │
│  │          │   │          │       │          │                             │
│  │ earnings │   │ x-search │       │ 8-K +    │                             │
│  │ .estimates│  │ 雪球/推特│       │ read-    │                             │
│  │ revisions│   │ +news    │       │ filings  │                             │
│  │ history  │   │          │       │ (T+1h)   │                             │
│  └────┬─────┘   └────┬─────┘       └────┬─────┘                             │
│       │              │                  │                                   │
│       └──────────────┼──────────────────┘                                   │
│                      ▼                                                      │
│            ┌──────────────────┐                                             │
│            │  Synthesis       │  · QoQ tone diff                           │
│            │  (主 agent)      │  · mgmt-vs-analyst Q&A 平衡                │
│            │                  │  · key revisions 一句话总结                │
│            └────────┬─────────┘                                             │
│                     │                                                       │
│                     ▼                                                       │
│   ┌────────────────────────────────────────────────────────┐               │
│   │  对外消费:                                             │               │
│   │  · /earnings <ticker> 命令                             │               │
│   │  · MCP upup://earnings-preview/{ticker}                │               │
│   │  · 写入 dossier (G2 复用)                              │               │
│   │  · KAIROS dossier staleness 自动重算                   │               │
│   └────────────────────────────────────────────────────────┘               │
│                                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**复用锚点**: `src/commands/investment/earnings-preview.ts`(已有,扩展)+ `src/tools/earnings/estimates.ts` + `src/search/x-search.ts` + `src/tools/finance/read-filings.ts`(新增 `earnings_transcript` 资源类型)+ `src/agent/subagent.ts` + `src/kairos/scanner.ts` + `src/memory/investment-memory.ts`(记忆历次电话会,QoQ diff 依据)。

### G4 自然语言选股器 — 两段式防幻觉

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   G4 自然语言选股器:两段式 (LLM 只能产出结构化 schema,不能写 SQL)                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   user: "AAPL-like 跌深质量复利 ex-金融,市值 10B-200B,RSI<35,ROE>20%"        │
│        │                                                                     │
│        ▼                                                                     │
│   ┌──────────────────────┐                                                   │
│   │  Stage 1: LLM 翻译   │  src/plan/plan-builder.ts 复用                    │
│   │  NL → FilterSpec     │  (LLM 强约束:只能输出 typed schema)              │
│   └─────────┬────────────┘                                                   │
│             │                                                                │
│             ▼                                                                │
│   FilterSpec {                                                               │
│     template: 'AAPL',     // 相似度参照                                        │
│     universe: 'us',                                                       │
│     filters: [                                                            │
│       { field: 'sector', op: '!=', value: 'financials' },                 │
│       { field: 'marketCap', op: 'between', value: [10e9, 200e9] },        │
│       { field: 'rsi14', op: '<', value: 35 },                             │
│       { field: 'roe', op: '>', value: 0.20 }                              │
│     ]                                                                      │
│   }                                                                        │
│             │                                                                │
│             ▼                                                                │
│   ┌──────────────────────┐                                                   │
│   │  Stage 2: 确定性执行  │  src/tools/finance/screen-stocks.ts             │
│   │  FilterSpec → SQL/DSL │  (无 LLM 参与,纯确定性查询)                      │
│   └─────────┬────────────┘                                                   │
│             │                                                                │
│             ▼                                                                │
│   ┌──────────────────────┐                                                   │
│   │  Stage 3: 打分        │  src/tools/valuation/decision-dashboard.ts     │
│   │  每个结果附 1 句论点  │  复用,无需新代码                                  │
│   └─────────┬────────────┘                                                   │
│             │                                                                │
│             ▼                                                                │
│   ranked results + one-line thesis                                          │
│   可选实时模式:从 src/realtime/eastmoney-feed.ts 拉 RSI / 量能                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**复用锚点**: `src/plan/plan-builder.ts`(NL → typed spec)+ `src/tools/finance/screen-stocks.ts` + `src/tools/valuation/decision-dashboard.ts` + `src/agent/investment-workflow.ts`(1 步 plan)+ `src/realtime/*`(可选日内模式)+ `src/tools/screening/index.ts`(新增 `nl_screen` 工具入口)。

### G5 策略市场 + C3 Web 视窗 — 分层与边界

```
┌──────────────────────────────────────────────────────────────────────────────┐
│   G5 策略市场分层 + C3 Web 视窗边界 (高内聚低耦合)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │  Layer 3: 呈现层 (已有 + C3 新增)                             │           │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────────┐         │           │
│  │  │  CLI       │  │  Web UI    │  │  MCP Client     │         │           │
│  │  │(单一信源)  │  │  (C3)      │  │  (Claude.ai...)  │         │           │
│  │  │            │  │  只读视窗  │  │                 │         │           │
│  │  └─────┬──────┘  └─────┬──────┘  └────────┬────────┘         │           │
│  └────────┼───────────────┼──────────────────┼──────────────────┘           │
│           │               │                  │                             │
│           │   ┌───────────┴──────────┐       │                             │
│           │   │  Bridge (WebSocket)  │◀──────┘                             │
│           │   │  + read-only JSON    │  (MCP 也是 bridge 的一种)            │
│           │   │    snapshot API      │                                     │
│           │   └───────────┬──────────┘                                     │
│           │               │                                                │
│  ┌────────▼───────────────▼─────────────────────────────────────┐         │
│  │  Layer 2: 编排层 (已有,扩展)                                  │         │
│  │  ┌──────────────────┐  ┌──────────────────┐                  │         │
│  │  │ investment-      │  │ subagent         │                  │         │
│  │  │ workflow         │  │ (sandboxed       │                  │         │
│  │  │ (5 步)           │  │  worktree 模式)  │                  │         │
│  │  └────────┬─────────┘  └────────┬─────────┘                  │         │
│  └───────────┼────────────────────┼────────────────────────────┘         │
│              │                    │                                        │
│  ┌───────────▼────────────────────▼────────────────────────────┐         │
│  │  Layer 1: 数据 / 引擎 (已有,只做扩展)                        │         │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │         │
│  │  │ backtest     │  │ export       │  │ memory       │       │         │
│  │  │ engine       │  │ (HTML/PDF)   │  │ (strategy    │       │         │
│  │  │              │  │              │  │  versioning) │       │         │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                             │
│  关键边界(由 CI lint 强制):                                                   │
│  ✗ src/web/** 禁止 import src/agent/, src/tools/, src/skills/,              │
│    src/memory/, src/realtime/, src/kairos/, src/coordinator/                │
│  ✓ 只能 import src/bridge/ 暴露的 JSON snapshot                              │
│                                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**复用锚点**: `src/tools/backtest/*` + `src/tools/export/*` + `src/agent/subagent.ts`(`isolation: worktree` 已存在,做负载验证)+ `src/memory/encrypted-store.ts`(版本化策略签名)+ `src/mcp/server.ts`(新增 publish / fork 端点,`src/mcp/oauth.ts` 鉴权)+ `src/commands/investment/registry.ts`(/strategy 命令组)+ `src/bridge/*`(C3 快照源)。

## 架构原则(继承自代码库现状)

1. **模块组合,不是复制**。每个差距补齐只加胶水 / 扩展点,不建平行层。(Dossier 扩展 `investment-memory`,不新建 DB。)
2. **Prompts 描述能力,工具实现能力**。我们新增 `citation`、`dossier` 工具组描述符,不在 `prompts.ts` 里堆能力专属逻辑。
3. **MCP 是集成面,不是应用面**。把引用 / dossier 暴露为 MCP resource,外部 Agent(Claude.ai、Cursor、用户自建工具)就能读 UpUp 状态。
4. **CLI 是单一信源;Web / 移动是视窗**。C3 只从 bridge 读,不持有状态。
5. **复用 > 重构 > 新建**。5 大差距全部组合 15+ 现有模块。如果一个差距没法靠组合现有模块补齐,信号就是它不是"5 大差距"项目——降级处理。
6. **Plan 驱动执行**。任何跨 > 2 个模块、非平凡的逻辑都走 `plan-builder.ts` + `plan-executor.ts`。临时 ad-hoc 编排是 code smell。

## 4 阶段实施序列

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  4 阶段实施序列                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   P0 速赢 (1 个 change, ~5 commits)                                          │
│   ┌──────────────────────────────────────────┐                              │
│   │ G1 引用  G2 dossier 骨架  C2 审计骨架     │  ← 1 个 prompt 改动 +         │
│   │                                          │    1 个 memory 实体           │
│   └─────────────────┬────────────────────────┘                              │
│                     ▼                                                        │
│   P1 核心 (2 个 change, ~12 commits)                                         │
│   ┌────────────────────┬────────────────────┐                               │
│   │ G3 业绩预告         │ G4 NL 选股          │  ← 高日常效用                 │
│   │ 3-worker 并行       │ plan-builder 复用   │                              │
│   └────────────────────┴────────────────────┘                               │
│                     ▼                                                        │
│   P2 战略 (2 个 change, ~18 commits)                                         │
│   ┌────────────────────┬────────────────────┐                               │
│   │ G5 策略市场         │ C3 Web 视窗         │  ← 重型: 沙箱 / 签名 / 前端    │
│   └────────────────────┴────────────────────┘                               │
│                     ▼                                                        │
│   P3 横切 (2 个 change, ~8 commits)                                          │
│   ┌──────────────────────────────────────────┐                              │
│   │ C1 双语对齐  C2 安全复核  KAIROS 过期告警 │  ← 打磨 + i18n               │
│   └──────────────────────────────────────────┘                              │
│                                                                              │
│   每个阶段 1 个 OpenSpec change,自带 proposal / design / tasks / archive     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**为什么这个顺序**:
- **P0** 用 1 个 prompt 改动 + 1 个 memory 实体 = 1 个 change 就 ship,先证明"复用优先"的范式能落地。
- **P1** 高日常效用,锚定在现有模块最密的位置,先拿到"research platform"对位的话语权。
- **P2** 重型:沙箱加固、签名、前端栈,等数据层稳定后再做。
- **P3** 打磨 + i18n,放在 5 大功能差距都"真实存在"之后再做。

## G2 dossier 数据流(代表例)

```
        CLI user query: "分析 NVDA"
                     │
                     ▼
   src/agent/agent.ts (已有,不动)
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  load dossier   run workflow   update dossier
  (memory pre)   (5 步,不变)    (memory post)
       │             │             │
       └─────────────┴─────────────┘
                     │
                     ▼
        final answer (含 dossier 上下文)
                     │
                     ▼
   src/mcp/resource-tools.ts 暴露 dossier
                     │
                     ▼
   外部 Agent / Web UI / Bridge 只读消费
```

不新建编排器。现有 agent loop 只增加 1 个 pre-phase hook 和 1 个 post-phase hook,都挂在 `investment-memory` 上。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| P2(市场)体量大、易膨胀 | 拆 3 个子 change:回测报告 → 策略版本化 → publish / fork 端点。每个独立可 ship |
| C1 双语对齐成打地鼠 | 先建 `prompts/locale.ts`;再用 CI lint 强制新 SKILL.md 必须双 locale |
| C2 审计轨迹签名薄弱成安全隐患 | 用 `memory/encrypted-store.ts` 的 ed25519 密钥;P0 change 显式定义威胁模型 |
| C3 Web UI 蔓延成完整 App | 严格边界:Web 只从 bridge JSON snapshot 读;用 CI lint 检查 `src/web/**` 不 import 业务模块 |
| G1 引用污染最终答案 | prompt 里加密度上限(≤ 1 引用 / 60 tokens);evals 验证 |
| G4 NL 选股器幻觉 filter spec | 两段式:plan-builder 产出 typed schema,LLM 只能写 schema 不能写 SQL;单测覆盖典型 NL |
| G3 电话会底稿依赖 8-K 时机 | T-7d 预告 + T+1h 底稿;即使底稿缺失,预告本身也有价值 |

## 附录 A — 18 个候选差距清单(打分排序)

打分:**impact**(1–3 日常效用)× **feasibility**(1–3 组合难度倒数)× **reusability**(1–3 是否解锁后续差距)。满分 27。P = 优先级梯队。

| ID | 差距 | Impact | Feasibility | Reusability | Score | P |
|----|------|--------|-------------|-------------|-------|---|
| G1 | 引用归因式回答 | 3 | 3 | 3 | 27 | P0 |
| G2 | 持久化 dossier | 3 | 3 | 3 | 27 | P0 |
| C2 | 交易意图审计轨迹 | 2 | 3 | 2 | 12 | P0 |
| G3 | 业绩预告 + 财报会 diff | 3 | 2 | 3 | 18 | P1 |
| G4 | 自然语言选股器 | 3 | 3 | 2 | 18 | P1 |
| C3 | Web UI 副屏(只读) | 2 | 2 | 2 | 12 | P2 |
| G5 | 策略市场 + 可分享回测 | 2 | 2 | 2 | 12 | P2 |
| C1 | 双语对齐(zh-CN / EN) | 2 | 2 | 2 | 12 | P3 |
| -- | 卖方一致预期聚合 + 修订 | 2 | 2 | 1 | 4 | P3 |
| -- | 文档对比(10-K vs 10-K diff) | 2 | 2 | 1 | 4 | P3 |
| -- | 策略库搜索 / 发现 | 1 | 2 | 1 | 2 | P3 |
| -- | 风险:VaR / Monte Carlo 压力测试 | 2 | 2 | 1 | 4 | future |
| -- | 因子暴露 / 风格分解 | 2 | 2 | 1 | 4 | future |
| -- | 投资组合税批会计 | 1 | 1 | 1 | 1 | future |
| -- | 另类数据(网页流量 / App 下载) | 1 | 1 | 1 | 1 | future |
| -- | 公司知识图谱 / 供应链 | 2 | 1 | 1 | 2 | future |
| -- | 音频 / 播客式早报 | 1 | 2 | 0 | 0 | future |
| -- | 移动端 App | 2 | 1 | 1 | 2 | future |

本 change 范围 = 5 个 P0/P1 差距(G1/G2/G3/G4)+ P0 横切(C2)+ 2 个 P2(G5/C3)+ 1 个 P3 横切(C1)。其余 10 项标 `future`,记在 tasks.md 的 `OUT-OF-SCOPE` 区域做留档,不做实现。
