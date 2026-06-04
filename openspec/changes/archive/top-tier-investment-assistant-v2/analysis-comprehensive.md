# 顶级投资助手 v3 — 全面分析与改造计划

> **目的**:在现有 `top-tier-investment-assistant-v2` (Sprint 1 已完成 5/5,Sprint 2+ 待推进)的基础上,做一次全面体检 + 行业对标 + 路线图升级,确保最终交付的 "UpUp 投资版 Claude Code" 真正达到**顶级水平**。
>
> **方法**:① 竞品横向对比定位 → ② loucode (Claude Code 还原版)子系统能力深度剖析 → ③ upup 现状能力地图(基于 `src/` 871 个 .ts/.tsx 实际文件)→ ④ 三维 gap 分析 → ⑤ Sprint 2-7 详细改造计划 + 优先级矩阵 → ⑥ 风险/里程碑/结论。
>
> **范围**:本文档是 `design.md` 的**深化版**,不替代 design.md / tasks.md;执行时增量更新 tasks.md,不动 design.md 的 11 条设计决策。

---

## 一、产品背景与目标

### 1.1 项目定位

**UpUp** = CLI 形态的 AI Agent(基于 Bun + Ink + LangChain),专为**中文圈投资者**打造。当前形态偏 "通用 LLM 工具 + 投研工具拼接",目标形态是 "**投研版 Claude Code**":

| 维度 | 当前 | 目标 |
|------|------|------|
| LLM 循环 | ✅ 稳定 (agent.ts 1232 行,10 步迭代,scratchpad + context 管理) | 保持稳定,只增量扩展 |
| 多 Agent | ⚠️ 雏形 (coordinator 4 Worker,但无主从硬约束) | loucode 深度:主只调度、Worker 才执行 + XML 协议 + 失败续接 |
| Skills | ✅ 50 个 SKILL.md + 87 个 skill 目录 | 加深:把 DCF/回测/组合管理等变 SKILL.md 链式调用 |
| Tools | ⚠️ 80+ tool,部分 tool 描述不清晰 | 投资域 5 group 重写:CAPABILITY_GROUPS 标准化 |
| 持续监控 | ⚠️ KAIROS 8 文件,无 6 状态机 | loucode 深度:6 状态机 + AutonomyMode |
| 远程控制 | ✅ Sprint 1.5 刚完成 (bridge + session-sync) | 升级到 34 文件子系统 |
| 回测 | ❌ 缺 | 重点建设:`backtest` tool + `dca-strategy` + `portfolio-rebalancing` 等 skill |
| 交易 | ⚠️ sandbox 撮合 + 2 adapter 骨架 (IBKR/雪球) | 4 种 algo (TWAP/VWAP/POV/IS) + 多 broker 接入 |
| 风控/合规 | ❌ 缺 | 加入:仓位限额 / 行业暴露 / 监管检查 |

### 1.2 终极目标 — "投研版 Claude Code"

Claude Code 的核心能力可拆为 **5 层**,UpUp 投资版需要在每一层都做到投研特化:

```
┌──────────────────────────────────────────────────────────┐
│ L5  持续自主 (KAIROS / Proactive / Telemetry / Drift)     │  ← 投资域:盘中异动 / 风险预警 / 持续监控
├──────────────────────────────────────────────────────────┤
│ L4  远程协同 (Bridge / Session Sync / Worktree)           │  ← 投资域:手机接管回测 / 跨设备组合复盘
├──────────────────────────────────────────────────────────┤
│ L3  多 Agent 编排 (Coordinator / Subagent / Task Runtime)  │  ← 投资域:行业对比 50 标的 / 组合归因
├──────────────────────────────────────────────────────────┤
│ L2  工具 + 技能 (Tools + Skills + Hooks + MCP)            │  ← 投资域:回测 / 交易 / 研报 / 估值
├──────────────────────────────────────────────────────────┤
│ L1  基础循环 (Agent Loop + Scratchpad + Context)          │  ← 通用 (已稳定,只做投研 prompt 优化)
└──────────────────────────────────────────────────────────┘
```

---

## 二、竞品分析与产品定位

### 2.1 国内外 AI 投资产品图谱

| 产品 | 形态 | 核心能力 | 目标用户 | 商业模式 | 与 UpUp 重合度 |
|------|------|---------|---------|---------|---------------|
| **AlphaSense** | SaaS 网页 | 企业级文档/研报搜索 + NLP 关键论断 + 跨文档引用图谱 | 卖方分析师/对冲基金 | 企业年费 $10K+/seat | 中 (research-deep-search 路线) |
| **Hebbia** | SaaS 网页 | 多标的 × 多维度矩阵分析 (PDF/Excel/邮件) | 资管 / 私募 | 企业年费 | 中 (matrix-analysis 路线) |
| **FinChat / ChatIQ** | 网页对话 | 投资对话 + 实时报价 + 基本面 | 散户 / 高净值 | $30-50/月 | 高 (核心对话交互) |
| **Perplexity Finance** | 网页对话 | 实时引用型搜索 + 实时股价 | 散户 | 免费 + Pro $20/月 | 中 (web-search 实时引用) |
| **TradingAgents (TA)** | 开源多 Agent | 4-7 个角色辩论式决策 (基本面/技术/情绪) | 量化爱好者 | 开源 MIT | 高 (multi-agent 借鉴) |
| **FinRobot** | 开源 | 4 角色 Agent + 报告生成 | 学术 / 实验 | 开源 Apache 2.0 | 中 |
| **AInvest** | 移动 App | 每日 AI 选股 + 推送 | 散户 | Freemium | 低 (移动优先) |
| **同花顺 i 问财** | 国内网页/APP | 自然语言选股 ("PE<20 ROE>15% 北向净流入 科技股") | 散户 | 免费 + 增值 | 高 (NL-screener 路线) |
| **东方财富 Choice** | 终端 | 数据 + 研报 + AI 摘要 | 专业 | 终端年费 ¥5K+ | 中 (institutional-data-feed 路线) |
| **通义晓蜜 / 文心一言 投研版** | 大厂 LLM | 通用 LLM + 投研 prompt | 散户 | 通用 LLM 订阅 | 中 |
| **万得 Wind iFinD AI** | 终端 | 数据 + AI 问答 | 机构 | 终端年费 ¥10K+ | 中 |

### 2.2 差异化定位 — UpUp 的 "4 个唯一"

在以上图谱中,UpUp 投资版可以占据**唯一**的 4 个生态位:

1. **CLI-first + Claude Code 形态**:唯一把 AI Agent 投研能力装进终端的;对开发者/技术派投资人天然友好
2. **完全开源 + 自托管**:不锁数据、不绑 SaaS;企业/合规场景刚需
3. **中国 A 股 + 美股 + 港股 + 加密资产** 全覆盖 (从 `src/tools/finance/` 看有 api/crypto/earnings/filings/fundamentals/insider_trades 等 18 文件)
4. **多 Agent + KAIROS 主动监控 + Bridge 远程协同** 三件套:对标 loucode 全部深度吸收,在投研域独此一家

### 2.3 目标用户画像(分层)

| 层级 | 用户 | 痛点 | UpUp 价值 |
|------|------|------|----------|
| L1 散户 | 个人投资者 | 信息过载、不会选股 | 自然语言选股 / 每日机会推送 |
| L2 活跃 | 量化爱好者 / 行业从业 | 缺回测/缺协同 | 回测 + Bridge 远程 |
| L3 私募/资管 | 投资经理 / 研究员 | 报告繁重、协同低效 | 多 Agent 研报 + 持续监控 |
| L4 企业/合规 | 金融机构 | 数据安全 / 合规审计 | 自托管 + 审计 + 风控 |

### 2.4 商业化路径(可选,非主线)

| 阶段 | 形态 | 收入 | 里程碑 |
|------|------|------|--------|
| v2 现在 | 完全开源 | 0 | 顶级投资助手落地 |
| v3 | 开源 + 增值 SaaS | API 配额 / 数据源 | 用户量 > 1K |
| v4 | 企业版 | 私有部署 / 合规 | 标杆客户 > 10 |

---

## 三、loucode (Claude Code 还原版) 能力深度剖析

> loucode 路径:`/Users/louloulin/Documents/linchong/claw/loucode/`,共 2110 个 .ts/.tsx,210 tools,107 hooks,34 bridge 文件。本节只提炼**可借鉴到投研域**的能力。

### 3.1 总体架构图

```
┌───────────────────────────────────────────────────────────────┐
│  CLI/REPL (main.tsx 4860 行,Ink + React)                       │
│  ├─ /commands/ (200+ 子命令,如 /buddy, /bridge, /plan)         │
│  ├─ TUI 组件 (Ink 渲染 + keybindings)                          │
│  └─ Assistant mode (Claude Code 子集)                          │
├───────────────────────────────────────────────────────────────┤
│  Agent 循环 (QueryEngine, Task, Tool 抽象)                       │
│  ├─ Context 管理 (microcompact / reactive compact / collapse)  │
│  ├─ Token budget tracking                                       │
│  └─ TodoWrite (任务规划)                                         │
├───────────────────────────────────────────────────────────────┤
│  多 Agent 编排                                                   │
│  ├─ Coordinator (coordinatorMode.ts + workerAgent.ts)           │
│  ├─ Subagent (fork)                                             │
│  └─ Task Runtime 6 类任务 (LocalAgent/LocalShell/LocalWorkflow/ │
│      MonitorMcp/RemoteAgent/InProcessTeammate)                  │
├───────────────────────────────────────────────────────────────┤
│  持续自主 (KAIROS / Proactive / Buddy)                          │
│  ├─ KAIROS 持久助手 (compaction / scheduling)                    │
│  ├─ Proactive 6 状态机 + AutonomyMode                            │
│  └─ Buddy 18 物种宠物 (差异化,非投研)                            │
├───────────────────────────────────────────────────────────────┤
│  远程协同 (Bridge)                                               │
│  ├─ v1 环境层方案 (33 文件)                                      │
│  ├─ v2 REPL 内嵌方案                                              │
│  └─ worktree 集成 (每个 session 独立 git worktree)               │
├───────────────────────────────────────────────────────────────┤
│  工具 + 技能 (210 tools / 107 hooks)                             │
│  ├─ 编译开关 feature() (~50 个) + 运行时 GrowthBook              │
│  ├─ Tool Permission / Can-Use / Classifier                      │
│  └─ MCP (Computer Use / 文件系统 / 浏览器)                       │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 关键子系统能力清单 + 投研借鉴

| loucode 子系统 | 编译开关 | 关键文件 | 投研借鉴 | UpUp 现状 | 差距 |
|---------------|---------|---------|---------|----------|------|
| **Coordinator** | `COORDINATOR_MODE` | `src/coordinator/coordinatorMode.ts` + `workerAgent.ts` | 4 阶段 (Research/Synthesis/Implementation/Verification) + Worker XML `<task-notification>` 协议 | 雏形 (coordinator.ts 4 Worker,但无协议) | **大** — 需 worker-xml.ts + 失败续接 + 真实验证 |
| **Feature Gates** | ~50 个 `feature()` | `src/commands.ts` + `src/services/analytics/growthbook.ts` | 3 层门控 (编译/USER_TYPE/GrowthBook) + DCE | 3 层雏形 (`feature-gates.ts` 3-level) | **中** — 50+ flag + DCE friendly pattern |
| **Bridge** | `BRIDGE_MODE` + `DAEMON` | 33 文件 (`src/bridge/`) | envLessBridgeConfig 双模式 + worktree + transport v1/v2 | Sprint 1.5 完成基础 (server + session-sync) | **大** — 还需要 24 个文件 (RBAC/UI/Permission/Poll/Status/Capacity 等) |
| **KAIROS** | `KAIROS` | `src/services/kairos/` | 持久助手 + compaction + scheduling | 8 文件雏形 (proactive/position-monitor/scanner) | **中** — 缺 compaction/scheduling/runtime state |
| **Proactive** | `PROACTIVE` | `src/proactive/` (6 状态机) | active/paused/contextBlocked/nextTickAt/listeners + AutonomyMode | 1 文件 (proactive/index.ts 12K) | **中** — 状态机 + AutonomyMode 待补 |
| **Task Runtime** | 隐式 | `src/tasks/` | 6 类任务抽象 (LocalAgent/LocalShell/LocalWorkflow/MonitorMcp/RemoteAgent/InProcessTeammate) | 缺 | **大** — 整套待建 |
| **Worktree** | `BRIDGE_MODE` | `src/utils/worktree.ts` | Agent 任务跑独立 worktree 隔离 dirty state | `src/worktree/` 已有雏形 | **小** — 集成到 task runtime 即可 |
| **Plan Mode v2** | 隐式 | `src/utils/planModeV2.ts` | EnterPlanMode/ExitPlanMode/VerifyPlanExecution + artifact review | `src/agent/plan-mode-state.ts` 已有 | **中** — 3 件套待完整 |
| **Monitor Task** | `MONITOR_TOOL` | `src/tools/MonitorTool/` | 持续后台监控 + 事件订阅 + 回执 | `src/tools/monitor/` 已有 | **小** — 事件总线集成 |
| **Brief Tool** | `KAIROS_BRIEF` | `src/tools/BriefTool/` | 一次性"简报" + analysis + multimodal | `src/multimodal/{charts,reports}/` 已有 | **中** — SKILL.md 集成 |
| **Telemetry** | 隐式 | `src/services/analytics/` | 结构化事件埋点 + A/B + 灰度 + 准确率 | 缺 | **大** — 整套待建 |
| **Voice** | `VOICE_MODE` | (略) | 语音输入 | 缺 | **大** — 投研价值低,优先级低 |
| **Hooks** | 107 文件 | `src/hooks/` | 工具权限 / 文件建议 / 通知 / 缓存 / LSP | 缺独立 hooks/ 目录 | **中** — 工具权限 + canUse 待建 |
| **Context** | 多种 | `src/context/` | 折叠 / 邮件 / 通知 / 统计 | `src/agent/compaction/` 已有 | **小** |
| **Microcompact** | `CACHED_MICROCOMPACT` | `src/utils/microcompact.ts` | 增量压缩 context | `src/agent/microcompact.ts` 已有 | **小** |

### 3.3 投研域专属借鉴映射

| loucode 模式 | 投研域对应 |
|-------------|----------|
| Coordinator 4 阶段 | 行业研究 4 阶段:行业扫描 → 公司精选 → 估值定价 → 风险回测 |
| Worker XML 协议 | Worker 输出 `<report path="...">...</report>` 自动注入 Coordinator 上下文 |
| Bridge 双模式 | 投研 Bridge:本地 CLI ↔ 远端网页 ↔ 微信 (PushPlus/Server酱) |
| KAIROS 持续 | 投研 KAIROS:盘中异动 / 风险预警 / 财报日历 / 政策事件 |
| Proactive 6 状态机 | 投研 Proactive:开盘前/盘中/收盘后/财报日/政策日/休假 |
| Task Runtime | 投研 6 类任务:回测任务/组合调仓/研报写作/数据下载/远程协同/常驻监控 |
| Worktree | 投研 Worktree:每个研究子任务一个独立 git worktree (隔离 dirty 状态) |
| Plan Mode v2 | 投研 Plan:研究计划 → 数据采集 → 分析 → 报告 → 同行评议 |
| Telemetry | 投研 Telemetry:工具调用准确率 / Agent 决策路径 / 回测命中率 / 用户反馈 |

---

## 四、upup 现状能力盘点(基于 `src/` 实际文件)

### 4.1 整体规模

| 指标 | 数值 |
|------|------|
| 总 .ts/.tsx 文件 | 871 |
| 总 LOC | ~199,899 |
| `src/skills/` 目录 | 87 个(50 个有 SKILL.md) |
| `src/tools/` 子目录 | 80+ (portfolio/trading/realtime/browser/cache/calendar/...) |
| `src/agent/` | 69 文件(agent.ts 1232 行主循环) |
| `src/coordinator/` | 7 文件(雏形) |
| `src/bridge/` | 12 文件(刚完成 Sprint 1.5) |
| `src/kairos/` | 8 文件 |
| `src/proactive/` | 1 文件(12K) |
| `src/multimodal/` | 7 文件 |
| `src/realtime/` | 10 文件 |
| `src/data/alt/` | 已建空 |
| `src/evals/` | LangSmith 评测(组件/dataset/run.ts) |

### 4.2 投资域 5 大能力组(CAPABILITY_GROUPS)

来源:`src/agent/capability-manifest.ts` 已定义 5 组:

| Group | 工具前缀 | 已有能力 | 投研域价值 |
|-------|---------|---------|----------|
| **realtime** | `realtime_*` | realtime_subscribe / unsubscribe / list_subscriptions | ⭐⭐⭐ 实时行情(东方财富/雪球) |
| **coordinator** | `analyze_*` / `list_research_*` | 4 Worker 并行(技术/基本面/资金/情绪) | ⭐⭐⭐⭐⭐ 核心 |
| **kairos** | `kairos_*` | recent_opportunities / position_alerts / scanner_events / summary | ⭐⭐⭐⭐ 持续监控 |
| **trading** | `place_trade_*` / `cancel_trade_*` / `get_trading_*` / `get_trade_*` | sandbox 默认,IBKR/雪球 adapter | ⭐⭐⭐ 模拟 + 2 实盘 broker |
| **portfolio** | (待标准化) | Brinson 3-factor + 风格 + 行业 (Sprint 1.4) | ⭐⭐⭐⭐ 归因 |

### 4.3 SKILL 库全景(50 个 SKILL.md)

| 类别 | Skills | 投研覆盖度 |
|------|-------|----------|
| 估值 | dcf / valuation-comparison / valuation-alert / earnings-forecast / earnings-calendar / earnings-season | ⭐⭐⭐⭐ |
| 财务 | financial-interpretation / financial-report / cash-flow-analysis / dividend-analysis | ⭐⭐⭐⭐ |
| 基金 | fund-analysis / fund-comparison / fund-holdings / fund-management / manager-analysis | ⭐⭐⭐ |
| 宏观 | macro-analysis / market-overview / market-monitor / sector-rotation / sector-analysis | ⭐⭐⭐⭐ |
| 策略 | value-investing / growth-investing / momentum-investing / dca-strategy / backtest-dca / portfolio-rebalancing / portfolio-management / personalized-recommendation | ⭐⭐⭐⭐ |
| 风险 | risk-assessment / sentiment-analysis / money-flow / shareholder-analysis | ⭐⭐⭐ |
| 调研 | institution-research / institutional-holding / research-report / stock-comparison / swarm-analysis / x-research | ⭐⭐⭐ |
| 技术 | technical-analysis | ⭐⭐ (只有 1 个) |
| 选股/筛选 | (隐含在 screening tools) | ⭐⭐ (待 NL-screener) |
| A 股 | a-share-analysis | ⭐⭐⭐ |
| 告警 | alert-management | ⭐⭐ |
| 集成 | api-integration | ⭐⭐ |

**gap**: 缺 ① NL-screener ② matrix-analysis ③ deep-research ④ realtime news/event ⑤ voice ⑥ 回测全链路 skill ⑦ 交易全链路 skill ⑧ 监管/合规 skill。

### 4.4 Tools 地图(80+)

| 类别 | 工具 | 投研域 |
|------|------|--------|
| `tools/finance/` | 18 文件 (price/market-data/filings/insider/segments/key-ratios) | ⭐⭐⭐⭐⭐ 核心 |
| `tools/portfolio/` | 16 文件 (brinson/style/sector/attribution/multi-portfolio/optimization) | ⭐⭐⭐⭐⭐ |
| `tools/trading/` | 24 文件 (sandbox-engine/ibkr/xueqiu/registry/algos/strategy) | ⭐⭐⭐⭐ |
| `tools/quant/` | (目录) | ⭐⭐ |
| `tools/screening/` | (目录) | ⭐⭐ |
| `tools/sector/` | (目录) | ⭐⭐ |
| `tools/research/` | (目录) | ⭐⭐ |
| `tools/forecast/` | (目录) | ⭐⭐ |
| `tools/risk/` | (目录) | ⭐⭐ |
| `tools/news/` | (目录) | ⭐⭐ |
| `tools/sentiment/` | (目录) | ⭐⭐ |
| `tools/monitor/` | (目录) | ⭐⭐ |
| `tools/watchlist/` | (目录) | ⭐⭐ |
| `tools/notebook/` | (目录) | ⭐ (实验性) |
| `tools/backtest/` | (目录) | ⭐⭐ 重点建设 |
| `tools/workflow/` | (目录) | ⭐⭐ 借鉴 loucode task runtime |
| `tools/registry/` | 20 文件 (中央 registry) | ⭐⭐⭐⭐⭐ |

### 4.5 已完成 Sprint(Sprint 1, 1 turn)

| Sprint | 状态 | 关键交付 |
|--------|------|---------|
| 1.1 algo-trading | ✅ done | 4 algo (TWAP/VWAP/POV/IS) + runner + e2e |
| 1.2 alt-data | ✅ done (Q5 部分 deferred Sprint 4) | 5 路 Adapter 类型 |
| 1.3 bridge-mode | ✅ done (2/10 deferred Sprint 2.3) | 8 协议 + 4 文件 + HMAC + 限流 |
| 1.4 portfolio-attribution | ✅ done | Brinson 3-factor + 风格 + 行业 + e2e |
| 1.5 session-sync | ✅ done | SessionSync 类 + 17 单测 + 3 e2e |

### 4.6 已建子系统状态

| 子系统 | 状态 | 距离 loucode 深度 |
|--------|------|------------------|
| Agent 主循环 | ✅ 稳定(1232 行) | 95% — 只需增量扩展 |
| Scratchpad | ✅ 完整 | 100% |
| Context 管理 | ✅ reactive compact + microcompact | 90% — 缺 collapse |
| Tool Registry | ✅ 20 文件中央化 | 100% |
| Skills 引擎 | ✅ 50 SKILL.md + 加载器 | 80% — 缺链式 / 并行 |
| Coordinator | ⚠️ 4 Worker 雏形 | 50% — 缺主从硬约束 + XML 协议 + 失败续接 |
| Subagent | ⚠️ runner 雏形 | 60% |
| Bridge | ✅ 基础完成(12 文件) | 40% — 还需要 22 文件 (loucode 33 - 12 = 21) |
| Session Sync | ✅ Sprint 1.5 | 90% |
| KAIROS | ⚠️ 8 文件 | 60% — 缺 6 状态机 + AutonomyMode |
| Proactive | ⚠️ 1 文件(12K) | 40% |
| Realtime | ✅ 10 文件 + 5s OHLC | 85% — 缺东方财富/雪球生产 adapter |
| Multimodal | ✅ charts + reports | 75% |
| Trading | ✅ 4 algo + 2 broker | 80% |
| Portfolio Attribution | ✅ Sprint 1.4 | 90% |
| Alt-Data | ⚠️ 仅类型 | 20% — 5 adapter 待实现 |
| Telemetry | ❌ 缺 | 0% — 整套待建 |
| Hooks (权限 / canUse) | ❌ 缺独立 hooks/ | 30% |
| Task Runtime 6 类 | ❌ 缺 | 0% |
| Worktree | ⚠️ 雏形 | 50% |
| Plan Mode v2 | ⚠️ 雏形 | 50% |
| Monitor Task | ⚠️ 雏形 | 50% |
| Brief Tool | ⚠️ multimodal 雏形 | 50% |

---

## 五、差距分析(Gap Analysis)

### 5.1 与 loucode 差距(33 文件子系统)

| 差距项 | 文件数 | 优先级 | 工作量 |
|--------|--------|--------|--------|
| Bridge 升级到 34 文件 | 22 缺 | P1 | 8 turn |
| Coordinator 升级到 4 阶段 + XML 协议 | 2 缺 | P1 | 3 turn |
| Feature Gates 升级到 50+ 编译开关 | 1 缺 | P1 | 1 turn |
| Proactive 6 状态机 + AutonomyMode | 1 缺 | P1 | 2 turn |
| KAIROS 升级(compaction/scheduling) | 3-4 缺 | P1 | 3 turn |
| Task Runtime 6 类 | 1 缺 | P2 | 4 turn |
| Worktree 集成 | 1 缺 | P2 | 1 turn |
| Plan Mode v2 3 件套 | 1 缺 | P2 | 2 turn |
| Monitor Task | 1 缺 | P2 | 1 turn |
| Brief Tool | 1 缺 | P2 | 1 turn |
| Telemetry | 1 缺 | P2 | 3 turn |
| Hooks(权限/canUse) | 107 缺 | P3 | 6 turn |
| Voice | 1 缺 | P3 | 4 turn |
| Buddy 宠物 | 1 缺(非投研) | P3 skip | 1 turn |

### 5.2 与竞品差距

| 能力 | AlphaSense | Hebbia | FinChat | 问财 | TradingAgents | UpUp 现状 | UpUp 目标 |
|------|-----------|--------|---------|------|---------------|----------|----------|
| 企业级研报搜索 | ✅ | | | | | ❌ | 4.2 research-deep-search |
| 矩阵分析 | | ✅ | | | | ❌ | 4.3 matrix-analysis |
| NL 选股 | | | ✅ | ✅ | | ❌ | 4.4 natural-language-screener |
| 中文 NL 选股 | | | | ✅ | | ❌ | 4.5 intent-routing-zh |
| 多 Agent 辩论 | | | | | ✅ | ⚠️ 雏形 | 2.1 coordinator-v2 |
| 机构数据 | | | | | | ⚠️ 部分 | 4.6 institutional-data-feed |
| TA 框架兼容 | | | | | ✅(开源) | ❌ | 4.7 tradingagents-compat |
| 实时引用搜索 | | | ✅ | | | ⚠️ | web-search 增强 |

### 5.3 投研域特殊能力差距

| 投研域特殊能力 | 现状 | 差距 | 优先级 |
|--------------|------|------|--------|
| **回测** (策略 / 组合 / 因子) | `tools/backtest/` 雏形,`dca-strategy` skill | 全链路(数据→策略→撮合→归因→报告)未贯通 | P1 |
| **交易** (模拟 + 多 broker) | sandbox + 2 adapter | 多 broker 适配 + 风控层 + 合规审计 | P1 |
| **风控** (仓位 / 行业 / 集中度) | `tools/risk/` 雏形 | 实时风控 + 预警 + 自动止损 | P1 |
| **合规** (监管 / 披露 / 利益冲突) | ❌ 缺 | 整套 | P3(企业版) |
| **数据源生产化** (东方财富/雪球/Choice/iFinD) | 18 finance tool 雏形 | 生产级 adapter + 缓存 + 限流 | P1 |
| **盘中异动监控** | KAIROS scanner | 实时推送 + 多渠道(微信/邮件/CLI) | P1 |
| **研报写作** (行研 / 公告摘要 / 季报点评) | `multimodal/reports/` + skills | 模板化 + 自动校对 + 同行评议 | P2 |
| **回测准确率评估** | evals/run.ts LangSmith | 投研专用数据集(常见 Q&A + 决策) | P2 |
| **投资组合模拟** (虚拟资金/虚拟交易) | sandbox | 完整 paper trading + 净值曲线 | P1 |
| **微信 / IM 集成** | ❌ 缺 | 微信/钉钉/飞书推送 + 远程控制 | P3 |
| **A 股特色** (龙虎榜 / 北向 / 涨停板 / 行业指数) | 雏形 | 完整数据 + 多维分析 | P2 |
| **加密资产** | `tools/finance/crypto.ts` 雏形 | 扩展 | P3 |
| **港美股** | 18 finance tool 部分覆盖 | 完善 | P2 |

---

## 六、改造计划(Sprint 2-7)

### 6.1 优先级矩阵(Impact × Effort)

```
                  高 Impact
                      │
        coordinator-v2 │ brief-tool
        research-deep  │ monitor-task
        matrix-analysis│ task-runtime
        bridge-v2      │ plan-mode-v2
        ───────────────┼───────────────
        alt-data adapter│ voice
        feature-gates  │ buddy(skip)
        proactive 6 状态│
        institutional  │
                      │
                  低 Impact
   低 Effort ────────────────── 高 Effort
```

### 6.2 Sprint 详细计划(增量更新 `tasks.md`)

#### Sprint 2 — loucode 深度吸收 (核心基础设施)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **2.1 coordinator-v2** | 主从硬约束 + Worker XML 协议 + 失败续接 + verification | `src/coordinator/{coordinatorMode,workerAgent,worker-xml,worker-resume,verification}.ts` | 3 turn | Sprint 1.4 |
| **2.2 feature-gates-v2** | 50+ 编译开关 + DCE pattern + GrowthBook-like 灰度 | `src/agent/feature-gates.ts` 升级 + `src/services/analytics/growthbook.ts` | 1 turn | - |
| **2.3 bridge-v2** | 升级到 34 文件子系统 (RBAC/UI/Permission/Poll/Status/Capacity/JWT/Worktree) | 22 个新文件 in `src/bridge/` | 8 turn | Sprint 1.5 |
| **2.4 kairos-proactive** | 6 状态机 + AutonomyMode + 事件总线 | `src/kairos/proactive.ts` 升级 + `src/services/autonomy/` | 2 turn | - |
| **2.5 task-runtime** | 6 类任务抽象 (LocalAgent/LocalShell/LocalWorkflow/MonitorMcp/RemoteAgent/InProcessTeammate) | `src/tasks/` 新目录 6 文件 | 4 turn | 2.1 |

#### Sprint 3 — 投研域深化

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **3.1 backtest-v2** | 全链路回测:数据→策略→撮合→归因→报告 | `src/tools/backtest/{engine,data,strategy,attribution,report}.ts` | 4 turn | 1.4 |
| **3.2 paper-trading** | 完整 paper trading + 净值曲线 + 排行榜 | `src/tools/trading/paper-trading.ts` + `src/portfolio/paper-portfolio.ts` | 2 turn | 1.1 |
| **3.3 risk-control** | 实时风控:仓位/行业/集中度/止损 + 预警 | `src/tools/risk/{position,exposure,stop-loss,alert}.ts` | 2 turn | 1.4 |
| **3.4 realtime-prod** | 东方财富 + 雪球生产 adapter(替换 mock) | `src/realtime/{eastmoney,xueqiu}-feed-prod.ts` | 2 turn | - |
| **3.5 alt-data-adapters** | 5 路生产 adapter:news/reports/social/dragon-tiger/north-bound | `src/data/alt/{news,reports,social,dragon-tiger,north-bound}.ts` | 3 turn | 1.2 |

#### Sprint 4 — 竞品对标

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **4.1 telemetry-events** | 结构化事件埋点 + A/B + 灰度 + 准确率评估 | `src/services/analytics/{events,ab,growthbook,accuracy}.ts` | 3 turn | 2.2 |
| **4.2 research-deep-search** | AlphaSense 对标:研报全文搜索 + NLP 关键论断 + 跨文档引用图谱 | `src/tools/research/{search,extract,graph}.ts` | 4 turn | 3.5 |
| **4.3 matrix-analysis** | Hebbia 对标:多标的 × 多维度矩阵分析 | `src/tools/research/matrix.ts` | 3 turn | 2.1 |
| **4.4 nl-screener** | FinChat 对标:自然语言选股(NL → screening DSL) | `src/tools/screening/nl-screener.ts` | 2 turn | - |
| **4.5 intent-routing-zh** | 问财对标:中文 NL 选股 + 行业 / 概念 / 资金多维 | `src/tools/screening/zh-screener.ts` | 2 turn | 4.4 |
| **4.6 institutional-data-feed** | Choice 对标:机构级数据 + 研报 + 公告 | `src/data/institutional/{feed,reports,announcements}.ts` | 4 turn | 3.4 |
| **4.7 tradingagents-compat** | TA 框架兼容:多 Agent 辩论可替换 | `src/multi-agent/ta-compat.ts` | 1 turn | 2.1 |

#### Sprint 5 — 持续自主 + 远程协同

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **5.1 kairos-runtime** | KAIROS runtime state + compaction + scheduling | `src/kairos/{runtime,compaction,scheduling}.ts` | 3 turn | 2.4 |
| **5.2 monitor-task** | 持续后台监控 + 事件订阅 + 多渠道推送 | `src/tools/monitor/{task,push,channel}.ts` | 2 turn | 5.1 |
| **5.3 brief-tool** | 一次性"简报" + 图表 + 报告 | `src/tools/brief/{brief,chart,report}.ts` | 2 turn | 4.2 |
| **5.4 plan-mode-v2** | EnterPlanMode/ExitPlanMode/VerifyPlanExecution | `src/agent/plan-mode-v2.ts` | 2 turn | - |
| **5.5 worktree-isolation** | Agent 任务跑独立 worktree 集成 | `src/worktree/{agent-isolation,task-integration}.ts` | 1 turn | 2.5 |
| **5.6 multi-channel-bridge** | 微信 / 钉钉 / 飞书 推送 + 远程控制 | `src/bridge/{wechat,dingtalk,feishu}.ts` | 3 turn | 2.3 |

#### Sprint 6 — 投研域特殊能力

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **6.1 strategy-library** | 策略库:TWAP/VWAP/POV/IS + 因子 + 多因子组合 | `src/strategies/{factor,risk-parity,grid,momentum}.ts` | 3 turn | 3.1 |
| **6.2 portfolio-rebalance** | 组合再平衡 + 调仓 + 税优 | `src/portfolio/{rebalance,tax-aware,multi-account}.ts` | 2 turn | 1.4 |
| **6.3 compliance-audit** | 合规审计:监管 / 披露 / 利益冲突 | `src/compliance/{audit,disclosure,conflict}.ts` | 3 turn | 3.3 |
| **6.4 institutional-research** | 机构级研究模板 + 自动校对 + 同行评议 | `src/research/{template,proofread,peer-review}.ts` | 3 turn | 5.3 |
| **6.5 backtest-eval** | 回测准确率评估数据集 + 投研专用 evals | `src/evals/dataset/{backtest,decision,screener}.jsonl` | 2 turn | 4.1 |

#### Sprint 7 — 商业化 + 优化

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **7.1 usage-billing** | 用量计费 + API 配额 | `src/billing/{usage,quota,api-key}.ts` | 2 turn | 4.1 |
| **7.2 self-host-deploy** | 自托管部署 + Docker + 升级 | `deploy/{docker,compose,k8s}.yaml` | 1 turn | - |
| **7.3 web-console** | Web 控制台(简化版 Bridge UI) | `web/{app,pages,api}/...` | 4 turn | 2.3 |
| **7.4 voice-mode** | 语音输入(实验) | `src/voice/{stt,tts,command}.ts` | 4 turn | - |
| **7.5 perf-optimization** | 性能优化:context 折叠 / 缓存 / 索引 | `src/agent/compaction/{cache,index}.ts` | 2 turn | - |

### 6.3 关键里程碑

| 里程碑 | 时间点 | 标志 | 价值 |
|--------|--------|------|------|
| **M1 闭环** | Sprint 2 完 | 决策→回测→模拟→实盘→远程协同 全链路 | 投研闭环 |
| **M2 深度** | Sprint 2 完 | loucode 13 个核心子系统深度吸收 | 工程深度 |
| **M3 差异化** | Sprint 4 完 | 7 大竞品能力对标 | 行业领先 |
| **M4 持续** | Sprint 5 完 | KAIROS + Proactive + Plan + Bridge 多渠道 | 持续自主 |
| **M5 投研专业** | Sprint 6 完 | 策略库 + 调仓 + 合规 + 同行评议 | 机构级 |
| **M6 商业化** | Sprint 7 完 | 计费 + 自托管 + Web + 语音 | 可商业化 |

---

## 七、执行路线图

### 7.1 短期(2-3 turn,1-2 周)— 完成 Sprint 2

- **2.1 coordinator-v2**:让 Coordinator 从雏形升级到 loucode 深度(主从硬约束 + XML 协议 + 失败续接)
- **2.2 feature-gates-v2**:50+ 编译开关 + DCE
- **2.3 bridge-v2 起步**:RBAC + Poll + Status + Capacity(分 2 批)
- **2.4 kairos-proactive**:6 状态机

**目标**:M1 + M2 达成 = 投研闭环 + 工程深度 = "投研版 Claude Code" 基本形态

### 7.2 中期(3-5 turn,3-4 周)— 完成 Sprint 3-4

- **Sprint 3**:backtest-v2 + paper-trading + risk-control + realtime-prod + alt-data-adapters
- **Sprint 4 起步**:telemetry-events + research-deep-search

**目标**:M3 达成 = 行业领先 = 真正"顶级水平"

### 7.3 长期(5+ turn,2+ 月)— 完成 Sprint 5-7

- **Sprint 5**:持续自主 + 远程协同多渠道
- **Sprint 6**:策略库 + 合规 + 同行评议
- **Sprint 7**:商业化 + 部署 + Web

**目标**:M6 达成 = 顶级 + 商业化

---

## 八、关键风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 数据源不稳定(东方财富/雪球限流) | 高 | 多源 + 缓存 + 限流 + 熔断 |
| 实盘交易接入风险 | 高 | 默认 sandbox + 强制风控 + 二次确认 + 审计 |
| 多 Agent 协调复杂度 | 中 | 借鉴 loucode 4 阶段 + XML 协议 |
| LLM 成本失控 | 中 | token 预算 + telemetry + 缓存 |
| 监管合规(投顾牌照) | 高 | 仅作工具,不直接给买卖建议 + 免责声明 |
| 开源社区接受度 | 中 | 文档 + 教程 + Discord + 案例 |
| 竞品快速跟进(AlphaSense/FinChat 加 Agent) | 中 | CLI 差异化 + 自托管 + 开源 |

---

## 九、结论

UpUp 已经从 v1 的 "通用 LLM 工具" 进化到 v2 的 "投研工具 + AI Agent 雏形",代码量达 ~200K LOC、80+ tools、50+ skills。

距离"**投研版 Claude Code**"的终极目标,**还需要约 6 个 Sprint(2.5-3.5 月)**:

1. **Sprint 2 (1-2 周)**:loucode 13 子系统深度吸收 → 投研闭环 + 工程深度
2. **Sprint 3 (1-2 周)**:回测 / 模拟 / 风控 / 生产数据 → 投研全链路
3. **Sprint 4 (2-3 周)**:7 竞品能力对标 → 行业领先
4. **Sprint 5 (2 周)**:持续自主 + 远程协同 → 用户粘性
5. **Sprint 6 (2-3 周)**:策略库 + 合规 + 同行评议 → 机构级
6. **Sprint 7 (2 周)**:商业化 + 部署 + Web → 可分发

按 impact / effort 优先级,**最值得立即投入的是**:
- **2.1 coordinator-v2** (主从硬约束) → 立刻把多 Agent 拉满
- **3.1 backtest-v2** (全链路回测) → 投研用户刚需
- **4.2 research-deep-search** (研报搜索) → AlphaSense 对标
- **4.4 nl-screener** (NL 选股) → 散户引流

这些完成后,UpUp 将真正达到 "**既能回测、又能交易、还能远程协同;既能选股、又能研究、还能持续监控**" 的顶级投研助手水平,与 AlphaSense / Hebbia / FinChat / 问财 / Choice 形成清晰的差异化。
