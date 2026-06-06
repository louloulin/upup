# Comet Design Handoff

- Change: close-top-tier-investment-gaps
- Phase: design
- Mode: compact
- Context hash: 08f0091837763d3dda47fb895c38a18843ba3d800db54812db87b8fa66bbfbec

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/close-top-tier-investment-gaps/proposal.md

- Source: openspec/changes/close-top-tier-investment-gaps/proposal.md
- Lines: 1-61
- SHA256: be0ce72b892b3b5dfa45138a5cfdb0b67c04932e6264ebb0d46542958614885b

```md
## 背景与动机

UpUp 是一款面向深度投研的 CLI 形态 AI Agent,作为一个开源项目,它已经具备了异常宽广的能力面:80+ 工具、80+ 技能、多 Agent 协调器、KAIROS 主动扫描器、实时行情、MCP 集成、Memory、桥接服务、5 步投研工作流、交易适配器(IBKR / 雪球)、回测引擎、投资组合归因(Brinson)、估值决策面板等。仓库现有的 `src/competitive-positioning/matrix.ts` 已经在 7 个维度上对 13 个竞品做过打分,`four-uniques.ts` 沉淀了 4 项差异化(CLI-first、开源自托管、全市场覆盖、三件套 = Claude + KAIROS + Bridge)。

竞品矩阵显示,UpUp 是**唯一同时拿到 cli=2、openSource=2、trading=2** 的玩家。这种结构性优势要转化为产品级对位、进而形成防御性领先,还需要补齐若干具体能力差。本 change 不写代码,只做三件事:把这些差距盘清楚、按 ROI 排序、产出一份**复用现有模块、保持高内聚低耦合**的改造计划。

目标不是追平每个竞品的全部功能,而是聚焦 5 个会显著改变"零售 / 专业投研人员日常工作流"的能力差,用"组合"而非"堆叠"的方式补齐,让未来的能力补齐可以沿用同样的范式。

## 改动范围

本 change **不引入新代码**,只产出三件规划制品:

1. **差距清单** (design.md 附录 A) — 18 个候选差距,按 (impact / feasibility / reusability) 三维打分,分 3 个优先级梯队。
2. **复用映射** — 每个差距对应到一组现有 UpUp 模块。5 个 P0/P1 差距共组合 15+ 既有模块;不新建采集基础设施、不新建数据库、不新建编排框架。
3. **分阶段任务清单** (tasks.md) — 拆成 4 阶段(P0 速赢 → P1 核心差距 → P2 战略护城河 → P3 横切加固),每条任务都有具体文件路径、无依赖顺序、明确验收标准。

本 change 通过并归档后,真正的实现工作落在后续 change 中(每阶段 1 个,每任务组 1 个),每个 change 控制在 ≤ ~6 个文件改动,以仓库现有的 `bun run typecheck` + `bun test` CI 门禁收尾。

### 5 个 P0/P1 差距主题

| 编号 | 差距 | 复用锚点 | 为何优先 |
|------|------|----------|----------|
| G1 | **引用归因式回答** — 最终答案中每条断言都带可点击的引用(财报段落、新闻原文、电话会议逐句) | `search/{exa,tavily,x-search,perplexity}` + `tools/finance/{news,read-filings,earnings}` + `mcp/resource-tools` | AlphaSense 的招牌;当前 `prompts.ts` 最终答案路径中没有强制引用 |
| G2 | **持久化个股研究 dossier** — 每次分析都基于、刷新并复用一份"永不下线"的 dossier(快照、关键指标历史、过往论点、盯盘触发器) | `memory/investment-memory` + `memory/memvid-rag` + `commands/investment/portfolio-review` | 没记忆的研究等于每次重做;这是"AI 感"最关键的一项 |
| G3 | **业绩预告 + 财报电话会 diff** — 提前 7 天生成预告、电话会后 1h 内拉到底稿、QoQ 语气/情绪 diff、管理层 vs 分析师 Q&A 平衡 | `tools/earnings/estimates` + `search/x-search` + `tools/finance/read-filings`(8-K) + `commands/investment/earnings-preview` | 财报季是决策密度最高的窗口;预告是零售-专业的每日习惯 |
| G4 | **自然语言选股器** — `screen "AAPL-like 跌深质量复利 ex-金融,市值 10B–200B,RSI<35,ROE>20%"` 返回带一句话论点的排序结果 | `tools/finance/screen-stocks` + `tools/valuation/decision-dashboard` + `agent/plan/plan-builder` | 替代 15 分钟 Bloomberg / Wind DES 点击;日常效用提升巨大 |
| G5 | **策略市场 + 可分享回测** — 用户可发布、fork、版本化因子 / 策略代码;回测输出自包含 HTML / PDF 报告,带方法学披露 | `tools/backtest/*` + `tools/export/*` + `agent/subagent`(沙箱) + `memory`(版本化) | 闭环"做出来然后呢";契合 D2(开源),把工具变成社区 |

### 3 个横切主题

- **C1: 双语对齐(中文 / English)** — 当前 prompts 和 skill 描述中英混杂。需新增 `prompts/locale.ts`、SKILL frontmatter 多语言、给 30 个最高频 skill 补 zh-CN 描述。
- **C2: 交易意图审计轨迹** — 每条 BUY / SELL / COVER 建议都生成不可篡改、带签名的记录(意图、证据、Agent 链、模型版本、时间戳)。任何机构 / 持证路径的硬性要求。
- **C3: Web UI 作为 CLI 副屏(非替代)** — 一份只读 dashboard,展示 dossier、自选股、当前 workflow、桥接状态。CLI 仍是单一信源;Web 是视窗而非对等。契合 D1。

## Capabilities

### 新增 Capabilities
无。本 change 是规划制品。后续每个实现 change 都会在自己的 proposal 中声明自己的 capabilities。

### 修改 Capabilities
无。`openspec/specs/` 下的规范基线不动。

## 影响

- **本 change 文件数**: 5 个(`.comet.yaml`、`.openspec.yaml`、`proposal.md`、`design.md`、`tasks.md`),纯文档。
- **后续实现 change 预计改动文件**: 6+ 个 change 累计 30–50 个文件,每个 CI 门禁收尾。
- **外部 API**: 零变化。CLI 表面、工具注册表、MCP server、桥接服务全部不变。
- **风险**: 极低。无代码、无行为变化。
- **无依赖变更、无版本号变更。**

## 显式 Out-of-Scope

为聚焦,以下条目**不在本 change 范围**内(每一项都是潜在的未来 change 候选):

- 原生移动端 App(C3 仅 Web)。
- 音频 / 播客式早报。
- 另类数据市场(卫星、网页流量、App 下载量)。
- 公司知识图谱 / 供应链映射。
- 机构合规工作流(FINRA、MiFID II)。
- 多租户团队协作空间(仅单用户 dossier + 社区市场)。
- 语音 / 对话接口。
```

## openspec/changes/close-top-tier-investment-gaps/design.md

- Source: openspec/changes/close-top-tier-investment-gaps/design.md
- Lines: 1-442
- SHA256: f7594187fae032b84ab31896000531f9ec9a624a43b23ab5043315d39361248a

[TRUNCATED]

```md
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
```

Full source: openspec/changes/close-top-tier-investment-gaps/design.md

## openspec/changes/close-top-tier-investment-gaps/tasks.md

- Source: openspec/changes/close-top-tier-investment-gaps/tasks.md
- Lines: 1-225
- SHA256: 0f17fa236a4323009ae6874b9c306a9628c59fbe79e921cadb0a9e1b8a892fa5

[TRUNCATED]

```md
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
```

Full source: openspec/changes/close-top-tier-investment-gaps/tasks.md

