# Comet Design Handoff

- Change: top-tier-investment-assistant-v2
- Phase: design
- Mode: compact
- Context hash: 133ed2ec1465dc5eb68dec4bcab1387de5e7be8af22cc62ed3e4470e54c91a2a

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/top-tier-investment-assistant-v2/proposal.md

- Source: openspec/changes/top-tier-investment-assistant-v2/proposal.md
- Lines: 1-115
- SHA256: 341bd5ba0ebed951e95de8751c339c1d06555417d85b31d0be8c7e49e0f1ff95

[TRUNCATED]

```md
# Proposal: 顶级投资助手 v2 (top-tier-investment-assistant-v2)

## Why

`top-tier-investment-assistant` v1(2026-06-03 启动)在 2 天内推进了 11/16 P1 spec 的代码落地:trading-sandbox / broker-adapter / coordinator / kairos / feature-gates / intent-detector / realtime / multimodal / event-bus / subagent 全部进入主分支,基础骨架完成。但对照 loucode(还原的 Claude Code)与一线投研产品(AlphaSense / Hebbia / FinChat / TradingAgents / 同花顺问财 / 东方财富 Choice),UpUp 距离"顶级投资助手"还差三层:
1. **5 个 P1 spec 未落地**:algo-trading / alt-data / bridge-mode / portfolio-attribution / session-sync —— 直接堵死"决策→回测→模拟→实盘→远程协同"闭环
2. **v1 实现的深度不够**:Coordinator 是 4-Worker 雏形但缺 loucode 风格的"主只调度、Worker 才执行"硬约束 + Worker XML 结果注入协议;feature-gates 是 3-level 雏形但缺 50+ `feature()` 编译开关的 DCE(dead code elimination)pattern;trading-sandbox 缺撮合模型矩阵;kairos 缺主动模式的 6 状态机
3. **缺失 v2 P2 spec**:loucode 的 buddy companion / 监控任务 / 调研任务 / 远程代理任务 / 计划 V2 / voice 等模式在 upup 完全没有对应物;competitor 端 AlphaSense 的企业搜索、Hebbia 的 matrix 分析、Perplexity Finance 的实时引用,以及国内问财的自然语言选股,都对应具体可落地的 spec

v2 目标:用 Phase 1(本次)完成"全面分析"——v1 收尾 + loucode 深度吸收 + competitor 定位 + 全面改造计划;后续 Phase 2-5 落地剩余 P1 + 新增 P2,让 UpUp 真正达到"既能回测、又能交易、还能远程协同"的顶级水平。

## What Changes

### A. v1 P1 收尾(5 个 spec)

- **algo-trading**:新增 `src/tools/trading/algos/{twap,vwap,pov,is}.ts` + 通用 algo runner + sandbox 撮合对比测试
- **alt-data**:新增 `src/data/alt/{news,reports,social,dragon-tiger,north-bound}.ts` 5 路 Adapter,统一 `AltDataAdapter` 接口
- **bridge-mode**:新增 `src/bridge/{server,protocol,auth,session,client}.ts`,WebSocket 远程控制(本地 CLI 暴露端口,网页/移动端连接)
- **portfolio-attribution**:新增 `src/tools/portfolio/{brinson,style,sector,attribution}.ts`,Brinson 3-factor + 风格归因 + 行业归因(申万/GICS)
- **session-sync**:新增 `src/bridge/session-sync.ts`,本地/远端会话状态共享 + 断点续传 + 冲突合并

### B. v2 P2 增强(从 loucode 深度吸收,10 个 spec)

- **coordinator-v2**:升级到 loucode 模式 —— 主 Agent 工具白名单硬约束(只允许 Agent/SendMessage/TaskStop)、Worker XML 结果注入、失败续接(TASK_STOP + SEND_MESSAGE 协议)、verification 真实验证语义
- **feature-gates-v2**:升级到 loucode 模式 —— 50+ `feature('BUN_CONFIG_FEATURE_XXX')` 编译开关、isXxxEnabled() 模式 + GrowthBook-like 运行时灰度、Negative→Positive ternary pattern (DCE friendly)
- **bridge-v2**:升级到 loucode 模式 —— 34 个 bridge 文件对应(BridgeApi/Config/Debug/Enabled/Messaging/UI/Permission/Status/Poll/Transport/RBAC/Session 等)、envLessBridgeConfig 双模式(本地 / 远端 CCR)、worktree 集成
- **proactive-mode**:参考 loucode `proactive/` —— 6 状态机(active/paused/contextBlocked/nextTickAt/listeners)、AutonomyMode(resolveAutonomyMode)、emit/subscribe 模式、KAIROS 集成
- **task-runtime**:参考 loucode `tasks/` —— LocalAgentTask / LocalShellTask / LocalWorkflowTask / MonitorMcpTask / RemoteAgentTask / InProcessTeammateTask 6 类任务抽象,统一 KAIROS + Coordinator 调度
- **worktree-isolation**:参考 loucode `bridgeMain.ts` 里的 `createAgentWorktree/removeAgentWorktree` —— Agent 任务在独立 worktree 跑(隔离 dirty state)
- **plan-mode-v2**:参考 loucode `utils/planModeV2.ts` —— EnterPlanMode/ExitPlanMode/VerifyPlanExecution 三件套 + plan artifact review 协议
- **monitor-task**:参考 loucode `tools/MonitorTool/` —— 持续监控后台任务(可订阅事件、状态推送、回执确认),与 KAIROS 协同
- **brief-tool**:参考 loucode `tools/BriefTool/` —— 一次性"简报"工具,聚合 analysis + multimodal 输出(图表 + 报告),与 SKILL.md 集成
- **telemetry-events**:参考 loucode `services/analytics/` —— 结构化事件埋点(feature gate / 工具调用 / 决策路径),支撑回测准确率评估、A-B 实验、灰度观察

### C. Competitor 定位(对标到具体 spec 能力)

- **AlphaSense 对标**:新增 `research-deep-search` spec —— 企业级文档/研报全文搜索 + NLP 提取关键论断 + 跨文档引用图谱
- **Hebbia 对标**:新增 `matrix-analysis` spec —— 多标的 × 多维度矩阵分析(技术/基本面/资金/情绪 × 50 个标的),适合组合批量决策
- **FinChat 对标**:新增 `natural-language-screener` spec —— 自然语言选股("找出 PE<20、ROE>15%、近 5 日北向净流入的科技股"),用 LLM 翻译成 screening DSL
- **Perplexity Finance 对标**:强化 `web-search` + `web-browser` 实时引用能力,每个数据点带 source URL + 时间戳
- **同花顺问财对标**:新增 `intent-routing-zh` spec —— 中文投资意图路由(选股/诊断/对比/教学 4 大类),LLM-driven 路由,失败 fallback 到关键词
- **东方财富 Choice 对标**:新增 `institutional-data-feed` spec —— 机构级数据订阅(主力资金/北向/融资融券/大宗交易),对接 Wind/Choice/iFinD 同源数据
- **TradingAgents 对标**:升级 `coordinator-v2` 复用其多 Agent LLM 投研框架(Fundamentals / Sentiment / News / Technicals 4 路),但走 upup 自己的事件总线 + worktree 隔离

### D. 非破坏性内部重构

- `src/agent/subagent/` 升级为 Coordinator V2,旧调用方式保留为 legacy adapter
- `src/agent/cron/` + `src/agent/heartbeat/` 已被 v1 合并为 `src/kairos/`,v2 加 proactive 6 状态机
- `src/tools/trading/` v1 有 sandbox / adapters / registry,v2 加 algos 子树,registry 自动 discover

### E. 破坏性变更(明确标记)

- **BREAKING**:`src/coordinator/coordinator-mode.ts` v1 模式("主可调任何工具")替换为 loucode 模式("主只允许 Agent/SendMessage/TaskStop"),通过 `process.env.CLAUDE_CODE_COORDINATOR_MODE` + `featureGates.isCoordinatorV2Enabled()` 双开关,可降级回 v1
- **BREAKING**:`src/agent/feature-gates.ts` v1 是注册式 API,v2 加入 `feature('BUN_CONFIG_FEATURE_XXX')` 编译开关,build 时根据 env 排除分支(类似 loucode 的 `true ? : false` ternary pattern)

## Capabilities

### New Capabilities

- `algo-trading`: 算法交易(TWAP / VWAP / POV / IS)+ 通用 runner
- `alt-data`: 另类数据(新闻/研报/社交/龙虎榜/北向)
- `bridge-mode`: WebSocket 远程控制(本地 CLI 暴露端口)
- `portfolio-attribution`: 组合归因(Brinson / 风格 / 行业)
- `session-sync`: 跨设备会话同步
- `coordinator-v2`: loucode 风格 Coordinator 4 阶段 + Worker XML + 失败续接
- `feature-gates-v2`: loucode 风格 50+ 编译开关 + GrowthBook 灰度
- `bridge-v2`: loucode 风格 34 文件 Bridge 子系统
- `proactive-mode`: 6 状态机主动模式(参考 loucode `proactive/`)
- `task-runtime`: 6 类任务抽象(LocalAgent/LocalShell/LocalWorkflow/MonitorMcp/RemoteAgent/InProcessTeammate)
- `worktree-isolation`: Agent 任务在独立 worktree 跑
- `plan-mode-v2`: EnterPlanMode/ExitPlanMode/VerifyPlanExecution 三件套
- `monitor-task`: 持续监控后台任务
- `brief-tool`: 一次性简报工具(图表 + 报告)
- `telemetry-events`: 结构化事件埋点(支撑 A-B 实验 + 准确率评估)
- `research-deep-search`: AlphaSense 对标(企业搜索 + 跨文档引用)
- `matrix-analysis`: Hebbia 对标(多标的 × 多维度矩阵)
- `natural-language-screener`: FinChat 对标(自然语言选股 → DSL)
- `intent-routing-zh`: 同花顺问财对标(中文投资意图路由)
- `institutional-data-feed`: 东方财富 Choice 对标(机构级数据)
- `tradingagents-compat`: TradingAgents 框架兼容层
```

Full source: openspec/changes/top-tier-investment-assistant-v2/proposal.md

## openspec/changes/top-tier-investment-assistant-v2/design.md

- Source: openspec/changes/top-tier-investment-assistant-v2/design.md
- Lines: 1-234
- SHA256: eff48793488c7b05699d4bd2dd3e71e7ca332ff4588b44cb67a47977eca67971

[TRUNCATED]

```md
# Design: 顶级投资助手 v2

## Context

v1(2026-06-03 ~ 2026-06-04)在 2 天内推进 11/16 P1 spec 落地,建立了基础骨架:
- **执行层**:`src/tools/trading/{sandbox-engine,ibkr-adapter,xueqiu-adapter,registry,sandbox-tools,types}.ts` —— 撮合引擎 + 2 个券商 adapter 骨架 + 注册中心
- **多 Agent**:`src/coordinator/`(4-Worker 雏形)+ `src/subagent/` + `src/agent/intent-detector/`(LLM-driven 5 意图)
- **持续监控**:`src/kairos/{types,proactive,position-monitor,scanner,index}.ts` + `src/core/event-bus.ts`
- **实时数据**:`src/realtime/{types,mock-feed,throttled-feed,aggregator,eastmoney-feed,index}.ts` —— OHLC 聚合 + 东方财富 adapter
- **工程化**:`src/agent/feature-gates.ts` —— 3-level 门控
- **多模态**:`src/multimodal/{charts,reports}/`
- **能力清单**:`src/agent/capability-manifest.ts` —— 5 group 投资能力段

但深度对照 loucode(还原的 Claude Code)与 competitor,缺三类:
1. **5 个 P1 未落地**堵死闭环(algo-trading / alt-data / bridge-mode / portfolio-attribution / session-sync)
2. **v1 实现深度不足**:Coordinator 缺主从职责硬约束 + Worker XML 协议 + 失败续接;feature-gates 缺 50+ `feature()` DCE pattern;trading-sandbox 缺撮合模型矩阵;kairos 缺 proactive 6 状态机
3. **缺失 P2 spec**:buddy / 监控任务 / 调研任务 / 远程代理 / plan-v2 / voice / research-deep-search / matrix-analysis / nl-screener / institutional-feed / telemetry 等

v2 范围:Phase 1 写完 proposal/design/tasks 三件套(本 change),Phase 2-5 落地 25 个新 spec(v1 收尾 5 + v2 P2 10 + competitor 10)。

约束:
- 不能破坏 v1 已落地的 11 个 spec(回归基线必须全绿)
- Bun runtime,WebSocket 用 Bun 内置,不引新重量级依赖
- TypeScript strict mode,不允许 `any`
- 中文为主,英文 schema/spec 文件名

## Goals / Non-Goals

**Goals**:
1. **闭环**:补齐 5 个 P1 spec(algo / alt-data / bridge / attribution / session-sync),让"研究→回测→模拟→实盘→远程协同"链路在 upup 内完整跑通
2. **深度**:把 v1 实现的 4 个 spec(coordinator / feature-gates / kairos / intent-detector)升级到 loucode 深度,吸收 56 tools + 4 阶段协议 + 50+ 编译开关 + 6 状态机 + 6 类任务运行时
3. **对标**:10 个 P2 spec 对标具体 competitor 能力(AlphaSense / Hebbia / FinChat / Perplexity / TradingAgents / 问财 / Choice),让 upup 在产品定位上有清晰差异化
4. **可观测**:`telemetry-events` spec 提供结构化事件埋点,支撑 A-B 实验 + 灰度 + 准确率评估
5. **零破坏**:v1 11 个 spec 测试必须全绿,新能力通过 `featureGates.isV2Enabled()` 灰度上线

**Non-Goals**:
- 不重写 Agent 主循环(agent.ts 48450 行已稳定,只增量扩展)
- 不引入新 LLM provider(用现有 OpenAI / Anthropic / Google / xAI / OpenRouter / Ollama)
- 不做 mobile native app(Bridge 模式网页响应式即可)
- 不做完整 broker 实盘(只做 adapter 骨架 + sandbox 撮合;实盘需用户配 key)

## Decisions

### D1. v2 启用策略:Feature Gate 灰度,而非一刀切

v2 的 10 个 P2 spec 通过 `featureGates.isV2Enabled(subFeature)` 控制,默认关闭,用户主动 `/feature enable coordinator-v2` 才加载。
- **理由**:v1 11 个 spec 是稳定基线,v2 加新能力必须可灰度回滚
- **替代方案**:`process.env` 控制(否决,粒度粗);新加 `--v2` CLI flag(否决,与现有 command 体系冲突)
- **参考**:loucode 的 `isXxxEnabled()` + GrowthBook `getFeatureValue_CACHED_MAY_BE_STALE` 双重检查

### D2. Coordinator 升级为 loucode 4 阶段 + Worker XML 协议

v1 是 4-Worker 雏形,主 Agent 可调任何工具;v2 升级为 loucode 模式:
- **主 Agent 工具白名单硬约束**:只允许 `Agent` / `SendMessage` / `TaskStop` 三个,其他一律 throw
- **Worker XML 结果注入**:Worker 输出用 `<task-notification><task-id>...</task-id><result>...</result></task-notification>` XML 包裹,主 Agent 解析后合成
- **失败续接**:`TASK_STOP` 取消 + `SEND_MESSAGE` 续接,而非 spawn 新 Worker(避免 context 丢失)
- **Verification 真实验证**:Worker 跑测试 + typecheck + 独立验证,不只是 "looks right"
- **理由**:v1 模式"主 Agent 也调工具"违反职责分离,Worker 上下文易污染
- **替代方案**:v1 模式 + 软提示(否决,LLM 不会严格遵守);全新协作者(否决,scope 爆炸)

### D3. Feature Gates 升级到 50+ 编译开关 + DCE

参考 loucode 的 `feature('BUN_CONFIG_FEATURE_XXX')` 模式:
- **编译时**:`Bun.build` filter,`feature('TRADING')` 在 bundle 阶段被 const-fold 成 `false`,整段代码 DCE
- **启动时**:env var + feature registry,启动时一次性注入
- **运行时**:GrowthBook-like 灰度,`featureGates.set('kairos-v2', { userId, ratio: 0.1 })`
- **代码 pattern**(loucode 风格):
  ```ts
  export function isCoordinatorV2Enabled(): boolean {
    return true
      ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_coordinator_v2', false)
      : false
  }
  ```
  Positive ternary 让 Bun DCE 干净;Negative `if (!feature) return` 不会消除 inline literal
- **理由**:v1 缺编译时 DCE,bundle size 大;缺 growthbook 灰度,A-B 实验需手写
- **替代方案**:只做 runtime(否决,失去 DCE);只做 compile-time(否决,失去灰度)

### D4. Bridge 模式:WebSocket 远程控制,本地 CLI 暴露端口

```

Full source: openspec/changes/top-tier-investment-assistant-v2/design.md

## openspec/changes/top-tier-investment-assistant-v2/tasks.md

- Source: openspec/changes/top-tier-investment-assistant-v2/tasks.md
- Lines: 1-268
- SHA256: 20a764ceb4a642081f003580e485f7cac3b4e5a0b627e10dd263dc18fc05a934

[TRUNCATED]

```md
# Tasks: 顶级投资助手 v2

> 本文件按 Sprint 切分,每个任务是一个 checkbox,Phase 3 build 时按 Sprint 推进。

## Sprint 1: v1 收尾 5 个 P1 spec (1 turn)

### 1.1 algo-trading

- [ ] 1.1.1 实现 `src/tools/trading/algos/twap.ts` 时间加权平均价格(均匀时间拆单)
- [ ] 1.1.2 实现 `src/tools/trading/algos/vwap.ts` 成交量加权(按历史量分布)
- [ ] 1.1.3 实现 `src/tools/trading/algos/pov.ts` 参与率(Percent of Volume)
- [ ] 1.1.4 实现 `src/tools/trading/algos/is.ts` Implementation Shortfall
- [ ] 1.1.5 实现 `src/tools/trading/algos/runner.ts` 通用 algo runner(parent order → child orders)
- [ ] 1.1.6 写 `src/tools/trading/algos/twap.test.ts` 验证 30 分钟拆 30 单
- [ ] 1.1.7 写 `src/tools/trading/algos/vwap.test.ts` 验证按量分布
- [ ] 1.1.8 写 sandbox 撮合对比测试(立即市价 vs TWAP 30 分钟滑点差异)
- [ ] 1.1.9 注册 `strategy_backtest` / `strategy_run_paper` / `strategy_list` 3 个 tool 到 registry
- [ ] 1.1.10 写 e2e:"回测→paper trading→报告"全链路测试

### 1.2 alt-data

- [ ] 1.2.1 定义 `src/data/alt/types.ts` `AltDataAdapter` 接口(fetch/normalize/source)
- [ ] 1.2.2 实现 `src/data/alt/news.ts` 财联社 + 新华财经 Adapter
- [ ] 1.2.3 实现 `src/data/alt/reports.ts` 慧博 + Choice 研报 Adapter
- [ ] 1.2.4 实现 `src/data/alt/social.ts` 雪球 + X Adapter
- [ ] 1.2.5 实现 `src/data/alt/dragon-tiger.ts` 龙虎榜 + 大宗交易 Adapter
- [ ] 1.2.6 实现 `src/data/alt/north-bound.ts` 北向资金 + 融资融券 Adapter
- [ ] 1.2.7 写 `src/data/alt/types.test.ts` 验证 NormalizedEvent 统一 schema
- [ ] 1.2.8 写 5 个 Adapter 单元测试(mock API)
- [ ] 1.2.9 注册 `alt_data_fetch` / `alt_data_search` 2 个 tool 到 registry
- [ ] 1.2.10 写 e2e:抓取过去 7 天数据,验证去重 + 格式统一

### 1.3 bridge-mode

- [ ] 1.3.1 实现 `src/bridge/server.ts` 本地 WebSocket server(`Bun.serve({ websocket })`)
- [ ] 1.3.2 实现 `src/bridge/protocol.ts` 消息协议(chat/approval/output/status 4 类)
- [ ] 1.3.3 实现 `src/bridge/auth.ts` token 鉴权 + 速率限制 + 审计日志
- [ ] 1.3.4 实现 `src/bridge/session.ts` 远端 session 接入 + 跨设备
- [ ] 1.3.5 实现 `src/bridge/client.ts` 基础 CLI 客户端
- [ ] 1.3.6 写 `src/bridge/server.test.ts` 验证 token 鉴权 + 消息路由
- [ ] 1.3.7 写 `src/bridge/protocol.test.ts` 验证消息序列化
- [ ] 1.3.8 CLI 参数 `upup --bridge --bridge-token=<secret>` 启动
- [ ] 1.3.9 写 e2e:启动 bridge,CLI 客户端连接、发送消息、批准权限
- [ ] 1.3.10 写 `docs/bridge.md` 使用文档

### 1.4 portfolio-attribution

- [ ] 1.4.1 实现 `src/tools/portfolio/brinson.ts` Brinson 3-factor(配置/选股/交互)
- [ ] 1.4.2 实现 `src/tools/portfolio/style-attribution.ts` Barra 风格因子(大盘/价值/成长/动量)
- [ ] 1.4.3 实现 `src/tools/portfolio/sector-attribution.ts` 申万一级 / GICS
- [ ] 1.4.4 实现 `src/tools/portfolio/attribution.ts` 统一入口(组合归因)
- [ ] 1.4.5 写 `src/tools/portfolio/brinson.test.ts` 加和验证(配置+选股+交互 = 组合收益-基准)
- [ ] 1.4.6 写 `src/tools/portfolio/style.test.ts` 4 因子分解
- [ ] 1.4.7 写 `src/tools/portfolio/sector.test.ts` 行业归因
- [ ] 1.4.8 注册 `portfolio_attribution` 1 个 tool 到 registry
- [ ] 1.4.9 写 e2e:用 mock 组合 + 基准,跑完整归因

### 1.5 session-sync

- [ ] 1.5.1 实现 `src/bridge/session-sync.ts` 跨设备会话状态共享
- [ ] 1.5.2 写本地 session 序列化(messages + tool history + scratchpad)
- [ ] 1.5.3 写断点续传(远端 session 接管本地未完成 query)
- [ ] 1.5.4 写冲突合并(本地 / 远端同时改,最后写胜 + 备份)
- [ ] 1.5.5 写 `src/bridge/session-sync.test.ts` 验证序列化 + 续传 + 合并
- [ ] 1.5.6 集成到 `src/bridge/server.ts`(subscribe 远端 session 变化)
- [ ] 1.5.7 写 e2e:本地 CLI 启动,远端 bridge 接管同一 session

## Sprint 2: v2 P2 升级 4 个 loucode 深度 spec (2 turn)

### 2.1 coordinator-v2

- [ ] 2.1.1 重写 `src/coordinator/coordinator-mode.ts` 主 Agent 工具白名单(只允许 Agent/SendMessage/TaskStop)
- [ ] 2.1.2 实现 `src/coordinator/worker-xml.ts` Worker XML 结果注入协议(`<task-notification>`)
- [ ] 2.1.3 实现 `src/coordinator/worker-resume.ts` 失败续接(TASK_STOP + SEND_MESSAGE)
- [ ] 2.1.4 实现 `src/coordinator/verification.ts` Worker 真实验证(跑测试 + typecheck + 独立验证)
- [ ] 2.1.5 重写 4 个 Worker(technical/fundamental/capital/sentiment)走新协议
- [ ] 2.1.6 写 `src/coordinator/coordinator-v2.test.ts` 验证主 Agent 工具白名单硬约束
- [ ] 2.1.7 写 worker-xml.test.ts 验证 XML 解析
- [ ] 2.1.8 写 worker-resume.test.ts 验证失败续接
- [ ] 2.1.9 写 e2e:Coordinator v2 调度 4 路 Worker,主 Claude 综合
```

Full source: openspec/changes/top-tier-investment-assistant-v2/tasks.md

## openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading/spec.md

- Source: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading/spec.md
- Lines: 1-50
- SHA256: 37142cc8d939e117325e5bed16224e4b4af3890387fec36aa4ec1a106f6d9b8b

```md
## ADDED Requirements

### Requirement: TWAP Algorithm
The system SHALL provide a Time-Weighted Average Price (TWAP) algorithm in `src/tools/trading/algos/twap.ts` that splits a parent order into N child orders executed at uniform time intervals over a user-specified duration. The algorithm MUST respect sandbox trading hours and reject child orders scheduled outside the configured session window.

#### Scenario: TWAP 30 minutes
- **WHEN** user submits `strategy_run_paper({ algo: 'twap', symbol: '600519', side: 'BUY', quantity: 10000, duration: '30m' })`
- **THEN** system splits parent order into ~30 child orders of ~333 shares each, scheduled every 60 seconds within the trading session; each child order is submitted to the sandbox adapter; final report returns child_order_count, average_fill_price, slippage_bps.

#### Scenario: TWAP crosses session boundary
- **WHEN** user submits TWAP order with `duration: '8h'` starting at 09:30
- **THEN** system pauses child order submission during the 11:30-13:00 lunch break and resumes after 13:00; total child count adjusted to match available trading minutes.

### Requirement: VWAP Algorithm
The system SHALL provide a Volume-Weighted Average Price (VWAP) algorithm in `src/tools/trading/algos/vwap.ts` that splits a parent order into N child orders weighted by historical intraday volume distribution (default: prior 20 trading days minute-bars from `src/realtime/aggregator.ts`).

#### Scenario: VWAP uses historical distribution
- **WHEN** user submits VWAP BUY 10000 shares of 600519
- **THEN** system fetches prior 20 trading days of 1-minute volume bars, computes the volume-weighted schedule (more shares near 09:35 and 14:55 volume peaks), and submits child orders accordingly.

### Requirement: POV Algorithm
The system SHALL provide a Percent-of-Volume (POV) algorithm in `src/tools/trading/algos/pov.ts` that participates in market volume at a user-specified rate (e.g. 10% of every minute's traded volume). The algorithm MUST read real-time volume from a subscribed RealtimeFeed (default: `eastmoney-feed`).

#### Scenario: POV 10% rate
- **WHEN** user submits POV BUY at 10% participation rate
- **THEN** every 60 seconds, system reads the last minute's traded volume, computes child order size as 10% of that volume (capped at remaining parent order quantity), and submits; continues until parent order is fully filled or user stops.

### Requirement: Implementation Shortfall
The system SHALL provide an Implementation Shortfall (IS) algorithm in `src/tools/trading/algos/is.ts` that minimizes arrival-price slippage by trading more aggressively when price moves away from the arrival price and less aggressively when price moves favorably.

#### Scenario: IS adapts to price moves
- **WHEN** user submits IS BUY 10000 with arrival price 100.00
- **THEN** system increases participation rate when price > 100.00 and decreases when price < 100.00, balancing market impact against opportunity cost.

### Requirement: Algo Runner
The system SHALL provide a generic algo runner in `src/tools/trading/algos/runner.ts` that orchestrates: (1) parent order validation, (2) algo selection dispatch, (3) child order scheduling, (4) sandbox adapter submission, (5) progress reporting via event bus `trading.algo.*` topics, (6) final PnL + slippage report.

#### Scenario: Runner dispatches to TWAP
- **WHEN** runner receives a parent order with `algo: 'twap'`
- **THEN** runner instantiates the TWAP algorithm, subscribes to trading session events, submits child orders on schedule, and emits `trading.algo.child_filled` events for each fill.

### Requirement: Sandbox Matching Comparison
The system SHALL provide an end-to-end test in `src/tools/trading/algos/sandbox-comparison.test.ts` that runs both an immediate market order and a TWAP 30-minute order for the same symbol/quantity in the sandbox, and asserts that TWAP achieves lower implementation shortfall (slippage_bps) than the market order under typical volatility.

#### Scenario: TWAP beats market order
- **WHEN** test runs both algos against mock historical tick data with 1% intraday volatility
- **THEN** TWAP slippage_bps < market order slippage_bps, demonstrating reduced market impact.

### Requirement: Algo Tools Registration
The system SHALL register three new tools in the unified tool registry: `strategy_backtest` (runs a strategy on historical data and returns metrics), `strategy_run_paper` (executes a strategy in sandbox paper trading), and `strategy_list` (lists available strategies / algos with their parameters and last 5 paper-trade results).
```

## openspec/changes/top-tier-investment-assistant-v2/specs/alt-data/spec.md

- Source: openspec/changes/top-tier-investment-assistant-v2/specs/alt-data/spec.md
- Lines: 1-46
- SHA256: 1cd0e1dc31483fefa6ca6d31b43370df30d7f0e579272e98a3a7a35c418fd36f

```md
## ADDED Requirements

### Requirement: AltDataAdapter Interface
The system SHALL define a unified `AltDataAdapter` interface in `src/data/alt/types.ts` with methods: `fetch(input: FetchInput): Promise<RawEvent[]>`, `normalize(raw: RawEvent): NormalizedEvent`, and a static `source: AltDataSource` enum field. The interface MUST accept lazy initialization (no API key required at construction; adapter is registered only when user provides credentials via env or interactive prompt).

#### Scenario: Lazy registration
- **WHEN** user has no `CLS_API_KEY` env var set
- **THEN** the news adapter is not registered; calling `alt_data_fetch({ source: 'cls' })` returns a structured error `AltDataError(NO_CREDENTIALS, 'CLS_API_KEY not set')` with a remediation hint.

### Requirement: News Adapter
The system SHALL provide a news adapter in `src/data/alt/news.ts` that fetches from CLS (财联社) and Xinhua Finance. Output MUST be normalized to `{ title, source, url, publishedAt, symbols[], sentiment, raw }` where `sentiment` is in `[-1, 1]` (negative=bearish, positive=bullish).

#### Scenario: Fetch today's news for 600519
- **WHEN** user calls `alt_data_fetch({ source: 'news', symbols: ['600519'], dateRange: { start: '2026-06-04T00:00:00+08:00', end: '2026-06-04T23:59:59+08:00' } })`
- **THEN** adapter fetches from CLS + Xinhua, deduplicates by URL, filters items where `symbols` contains '600519', and returns the normalized list sorted by `publishedAt` descending.

### Requirement: Research Report Adapter
The system SHALL provide a research report adapter in `src/data/alt/reports.ts` that fetches from 慧博 (HiBoo) and Choice. Output MUST be normalized to `{ title, source, url, publishedAt, symbols[], analyst, rating, targetPrice, summary }`.

#### Scenario: Fetch 30 days of reports
- **WHEN** user calls `alt_data_fetch({ source: 'reports', symbols: ['600519'], dateRange: { ..., days: 30 } })`
- **THEN** adapter returns up to 50 most recent reports covering 600519, ordered by publishedAt desc, with rating distribution summary.

### Requirement: Social Adapter
The system SHALL provide a social adapter in `src/data/alt/social.ts` that fetches from 雪球 (Xueqiu) posts and X (Twitter) financial tweets. Output MUST be normalized to `{ author, content, url, publishedAt, symbols[], engagement, sentiment }`.

#### Scenario: Fetch top 100 雪球 posts
- **WHEN** user calls `alt_data_fetch({ source: 'social', platform: 'xueqiu', symbols: ['600519'], limit: 100 })`
- **THEN** adapter returns top 100 雪球 posts by engagement, filtering for those mentioning 600519, with sentiment scored by simple keyword + LLM-as-judge fallback.

### Requirement: Dragon-Tiger Adapter
The system SHALL provide a dragon-tiger (龙虎榜) adapter in `src/data/alt/dragon-tiger.ts` that fetches daily 龙虎榜 + 大宗交易 (block trade) data from 东方财富. Output MUST be normalized to `{ tradeDate, symbol, name, side, price, volume, amount, buyerType, sellerType, institutionCode }`.

#### Scenario: Fetch dragon-tiger for 600519
- **WHEN** user calls `alt_data_fetch({ source: 'dragon-tiger', symbols: ['600519'], dateRange: { ..., days: 30 } })`
- **THEN** adapter returns all 龙虎榜 + 大宗交易 records where 600519 appeared, with `institutionCode` resolved to institution name when known.

### Requirement: North-Bound Adapter
The system SHALL provide a north-bound (北向资金) adapter in `src/data/alt/north-bound.ts` that fetches 北向资金 + 融资融券 (margin trading) data. Output MUST be normalized to `{ tradeDate, symbol, northBoundNetInflow, shConnectNetInflow, szConnectNetInflow, marginBalance, shortBalance }`.

#### Scenario: Fetch 30 days north-bound
- **WHEN** user calls `alt_data_fetch({ source: 'north-bound', symbols: ['600519'], dateRange: { ..., days: 30 } })`
- **THEN** adapter returns daily north-bound + margin trading data for 600519, ordered by tradeDate asc.

### Requirement: Alt Data Tools
The system SHALL register two new tools: `alt_data_fetch` (fetches from a specified source with optional symbol/date filters) and `alt_data_search` (cross-source search by free-text query, returning merged normalized results from all configured sources).
```

## openspec/changes/top-tier-investment-assistant-v2/specs/bridge-mode/spec.md

- Source: openspec/changes/top-tier-investment-assistant-v2/specs/bridge-mode/spec.md
- Lines: 1-54
- SHA256: 718b5c148078888ad966d477325e2c746d420abda7e082db1aeb66747679bbc4

```md
## ADDED Requirements

### Requirement: WebSocket Bridge Server
The system SHALL provide a local WebSocket server in `src/bridge/server.ts` (built on Bun's native `Bun.serve({ websocket })`) that exposes a controlled subset of CLI capabilities to remote clients (web, mobile). The server MUST use token-based authentication (JWT), support per-session encryption, and emit audit logs for every command.

#### Scenario: Start bridge with token
- **WHEN** user runs `upup --bridge --bridge-port 7333 --bridge-token <random-secret>`
- **THEN** local WebSocket server starts on `ws://127.0.0.1:7333/bridge`, accepts connections presenting the token in `Authorization: Bearer <secret>`, rejects others with 401, and logs every connection + message to `~/.upup/bridge-audit.log`.

#### Scenario: Reject invalid token
- **WHEN** remote client attempts to connect without token
- **THEN** server closes the WebSocket with code 4401 and logs the rejection.

### Requirement: Bridge Protocol
The system SHALL define a bridge protocol in `src/bridge/protocol.ts` with 4 message types: `chat` (user prompt to be processed by the agent), `approval` (permission approval response to a pending bridge prompt), `output` (server-to-client streamed agent output), and `status` (server-to-client session status updates). Each message MUST include `type`, `sessionId`, `timestamp`, and `payload` fields. Protocol version MUST be `bridge.v1`.

#### Scenario: chat message round-trip
- **WHEN** client sends `{ type: 'chat', sessionId: 'abc', payload: { prompt: '分析 600519' } }`
- **THEN** server processes the prompt via the agent, streams `output` messages back, and emits a final `status: { state: 'idle' }` when the agent is ready for the next prompt.

### Requirement: Bridge Auth and Rate Limiting
The system SHALL implement token-based auth in `src/bridge/auth.ts` with: (1) short-lived JWT (15-minute expiry, refreshed on use), (2) per-IP rate limit (default 60 messages/minute), (3) trusted device list (tokens bound to a device fingerprint for 30 days), and (4) audit log entries for auth events (login / refresh / revoke).

#### Scenario: Rate limit triggers
- **WHEN** a client sends 61 messages within 60 seconds
- **THEN** server replies with `{ type: 'error', payload: { code: 'RATE_LIMITED', retryAfter: 30 } }` and rejects subsequent messages for 30 seconds.

### Requirement: Bridge Session
The system SHALL provide a bridge session in `src/bridge/session.ts` that maintains a 1:1 mapping between a remote WebSocket connection and a local CLI session. The session MUST support: (1) attaching to an existing session, (2) starting a new session, (3) handing off a session between local CLI and remote client, and (4) graceful shutdown with state persistence.

#### Scenario: Remote client attaches to existing session
- **WHEN** user runs local CLI in one terminal, then opens bridge from another device, then clicks "Attach to local session"
- **THEN** bridge creates a new remote session, attaches to the same underlying agent session, and streams the local agent's output to the remote client.

### Requirement: Bridge CLI Client
The system SHALL provide a minimal CLI client in `src/bridge/client.ts` that connects to a running bridge server and proxies stdin/stdout to/from the remote agent. This enables a local-only feel from a remote machine.

#### Scenario: CLI client proxies prompt
- **WHEN** user runs `upup --bridge-attach ws://host:7333 --token <secret>` from a remote machine
- **THEN** client connects to the bridge, sends user prompts, and prints agent responses locally with full TUI rendering.

### Requirement: Bridge CLI Flag
The system SHALL add a `--bridge` CLI flag to `upup` that starts the WebSocket server alongside the regular CLI interface. By default the bridge is OFF (no port exposed). The flag MUST support `--bridge-port`, `--bridge-token` (auto-generated if omitted), and `--bridge-bind` (default 127.0.0.1, configurable to 0.0.0.0 with explicit opt-in).

#### Scenario: Bridge disabled by default
- **WHEN** user runs `upup` without `--bridge`
- **THEN** no WebSocket port is opened; the CLI behaves as before; netstat / lsof shows no port bound by upup.

### Requirement: Bridge E2E Test
The system SHALL provide an end-to-end test in `src/bridge/e2e.test.ts` that: (1) starts the bridge on a random port, (2) connects a CLI client over WebSocket, (3) sends a chat message, (4) verifies the agent processes it and streams output, (5) verifies the audit log was written, and (6) closes the connection cleanly.

#### Scenario: E2E chat flow
- **WHEN** test runs the full bridge flow
- **THEN** all 6 sub-assertions pass: port bound, client connected, prompt echoed, output streamed, audit line written, clean close.
```

## openspec/changes/top-tier-investment-assistant-v2/specs/portfolio-attribution/spec.md

- Source: openspec/changes/top-tier-investment-assistant-v2/specs/portfolio-attribution/spec.md
- Lines: 1-43
- SHA256: 823f2ea87f84d7da23e51020c4a1da6dc333b4f15ca56432946b69ba0cb3f9e3

```md
## ADDED Requirements

### Requirement: Brinson 3-Factor Attribution
The system SHALL provide Brinson 3-factor attribution in `src/tools/portfolio/brinson.ts` decomposing active return into: (1) **Allocation effect** (sector weight difference × benchmark sector return), (2) **Selection effect** (benchmark weight × (sector return - benchmark sector return)), and (3) **Interaction effect** (sector weight difference × (sector return - benchmark sector return)). The sum of three effects MUST equal the active return (portfolio return - benchmark return) within ±0.01%.

#### Scenario: Brinson additive identity
- **WHEN** user calls `portfolio_attribution({ method: 'brinson', portfolio, benchmark, period })`
- **THEN** system returns `{ allocation: number, selection: number, interaction: number, active_return: number }` where `allocation + selection + interaction === active_return` within 0.01% tolerance.

### Requirement: Style Attribution
The system SHALL provide style attribution in `src/tools/portfolio/style-attribution.ts` decomposing active return by 4 Barra-style factors: Size (大盘/小盘), Value (价值/成长), Momentum (动量/反转), and Volatility (高波/低波). Each factor's contribution is computed as `(portfolio_exposure - benchmark_exposure) × factor_return`.

#### Scenario: Style attribution
- **WHEN** user runs style attribution on a portfolio with overweight Value + underweight Momentum vs CSI 300
- **THEN** system returns factor contributions showing positive Value contribution and negative Momentum contribution matching the exposure differences.

### Requirement: Sector Attribution
The system SHALL provide sector attribution in `src/tools/portfolio/sector-attribution.ts` decomposing active return by sector classification. The classification MUST support 申万一级 (Shenwan Level 1, 31 sectors) and GICS Level 2 as configurable options. For each sector, the system reports: weight_diff (portfolio - benchmark), sector_return, contribution_to_active.

#### Scenario: Shenwan sector attribution
- **WHEN** user calls `portfolio_attribution({ method: 'sector', classification: 'shenwan-l1', ... })`
- **THEN** system returns 31 sectors each with weight, return, and contribution; total contributions sum to active_return.

### Requirement: Unified Attribution Entry Point
The system SHALL provide a unified `portfolio_attribution` tool in `src/tools/portfolio/attribution.ts` that dispatches to Brinson / Style / Sector sub-modules based on `method` parameter, and supports a `combined` mode that returns all three decompositions in a single response.

#### Scenario: Combined attribution
- **WHEN** user calls `portfolio_attribution({ method: 'combined', portfolio, benchmark, period })`
- **THEN** system returns `{ brinson: {...}, style: {...}, sector: {...} }` in a single response.

### Requirement: Attribution Tools Registration
The system SHALL register a single `portfolio_attribution` tool in the unified tool registry. The tool MUST accept `method` ('brinson' | 'style' | 'sector' | 'combined'), `portfolioId` (resolved via `multi-portfolio.ts`), `benchmark` (default CSI 300), and `period` (default YTD).

#### Scenario: Default benchmark
- **WHEN** user calls `portfolio_attribution({ portfolioId: 'main', period: 'ytd' })` without specifying benchmark
- **THEN** system uses CSI 300 as benchmark and returns the requested decomposition.

### Requirement: Attribution E2E Test
The system SHALL provide an end-to-end test in `src/tools/portfolio/attribution.e2e.test.ts` that: (1) creates a mock portfolio with 20 holdings spanning 5 sectors, (2) creates a mock benchmark (CSI 300) with weights, (3) runs all 4 attribution methods, (4) verifies Brinson additive identity, (5) verifies style and sector decompositions sum to active return.

#### Scenario: Full attribution E2E
- **WHEN** test runs the full attribution pipeline
- **THEN** all 4 methods complete without error; additive identities hold within tolerance; contribution sums equal active return for both style and sector methods.
```

## openspec/changes/top-tier-investment-assistant-v2/specs/session-sync/spec.md

- Source: openspec/changes/top-tier-investment-assistant-v2/specs/session-sync/spec.md
- Lines: 1-43
- SHA256: 11f545def4a10e354f9886ecd3e843a965927468885042bff103949d3e88dd1d

```md
## ADDED Requirements

### Requirement: Cross-Device Session Synchronization
The system SHALL provide a cross-device session sync mechanism in `src/bridge/session-sync.ts` that allows a user to: (1) attach a remote bridge client to a local CLI session, (2) detach without losing state, (3) resume from a remote device after the local CLI has closed. The sync layer MUST persist session state to `~/.upup/sessions/<sessionId>.json` after every meaningful state change.

#### Scenario: Resume from another device
- **WHEN** user runs `upup` locally, asks a few questions, then closes the CLI; later, from a phone, opens the bridge web client and clicks "Resume local session"
- **THEN** remote client downloads the persisted session state, replays the scratchpad and tool history, and continues the conversation seamlessly.

### Requirement: Session Serialization
The system SHALL serialize the full session state (messages, tool history, scratchpad contents, feature gate state, sandbox state) to JSON for cross-device transport. The serialization MUST be deterministic and human-readable for debugging. Large binary blobs (e.g. cached responses) MUST be base64-encoded and truncated to 1MB per blob.

#### Scenario: Serialize a complex session
- **WHEN** session has 50 messages, 30 tool calls, and a 2MB scratchpad
- **THEN** serialization completes in <500ms; output is valid JSON; first message + last 3 messages + scratchpad summary are easily readable; large blobs are truncated and noted as such.

### Requirement: Session Resume
The system SHALL support resuming a session from a serialized snapshot, including: (1) restoring the message history into the agent context, (2) replaying the scratchpad to the new device, (3) preserving the original `sessionId` and timestamps, (4) appending a `resumed_at` field and `resumed_from_device` to the session metadata.

#### Scenario: Resume preserves sessionId
- **WHEN** user resumes a session from another device
- **THEN** the resumed session shares the original `sessionId`; subsequent tool calls and messages are appended to the same session; `resumed_at` and `resumed_from_device` are recorded.

### Requirement: Session Conflict Merge
The system SHALL handle concurrent edits to the same session from two devices with a "last-writer-wins + backup" policy: (1) the most recent timestamp wins for each modified field, (2) the loser's version is archived to `~/.upup/sessions/<sessionId>.conflict-<timestamp>.json`, (3) a `conflict_resolved` event is emitted to the event bus for observability.

#### Scenario: Concurrent edits to scratchpad
- **WHEN** device A and device B both modify the scratchpad within 5 seconds
- **THEN** the device with the later timestamp wins; the loser's scratchpad is archived as a conflict file; both clients see the winning scratchpad; `conflict_resolved` event is emitted.

### Requirement: Bridge Server Session Sync Integration
The system SHALL integrate session sync into the bridge server in `src/bridge/server.ts` so that: (1) every accepted WebSocket connection checks for an existing session with the same `sessionId`, (2) if found, the connection is attached to that session, (3) if not, a new session is created.

#### Scenario: Bridge attaches to existing session
- **WHEN** remote client sends `{ type: 'chat', sessionId: 's-abc' }` where 's-abc' is an existing local session
- **THEN** bridge server attaches the WebSocket to the existing session; subsequent messages are appended to the same conversation history.

### Requirement: Session Sync E2E Test
The system SHALL provide an end-to-end test in `src/bridge/session-sync.e2e.test.ts` that: (1) creates a local session, (2) serializes it, (3) simulates a remote resume, (4) sends a follow-up message from the "remote" device, (5) verifies the local session is updated, (6) simulates a conflict, (7) verifies the loser's state is archived.

#### Scenario: Full sync E2E
- **WHEN** test runs the full sync flow
- **THEN** all 7 sub-assertions pass; local and remote stay in sync; conflict resolution produces the expected archive file.
```

