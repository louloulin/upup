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

- [x] 1.2.1 定义 `src/data/alt/types.ts` `AltDataAdapter` 接口(fetch/normalize/source)
- [ ] 1.2.2 [deferred → Sprint 4 per Design Doc Q5] 实现 `src/data/alt/news.ts` 财联社 + 新华财经 Adapter
- [ ] 1.2.3 [deferred → Sprint 4 per Design Doc Q5] 实现 `src/data/alt/reports.ts` 慧博 + Choice 研报 Adapter
- [ ] 1.2.4 [deferred → Sprint 4 per Design Doc Q5] 实现 `src/data/alt/social.ts` 雪球 + X Adapter
- [x] 1.2.5 实现 `src/data/alt/dragon-tiger.ts` 龙虎榜 + 大宗交易 Adapter
- [x] 1.2.6 实现 `src/data/alt/north-bound.ts` 北向资金 + 融资融券 Adapter
- [x] 1.2.7 写 `src/data/alt/types.test.ts` 验证 NormalizedEvent 统一 schema
- [x] 1.2.8 [2 of 5 adapters tested; news/reports/social deferred to Sprint 4] 写 5 个 Adapter 单元测试(mock API)
- [x] 1.2.9 注册 `alt_data_fetch` / `alt_data_search` 2 个 tool 到 registry
- [x] 1.2.10 写 e2e:抓取过去 7 天数据,验证去重 + 格式统一

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
- [ ] 2.1.10 通过 `featureGates.isCoordinatorV2Enabled()` 灰度,可降级 v1

### 2.2 feature-gates-v2

- [ ] 2.2.1 扩展 `src/agent/feature-gates.ts` 50+ `feature('BUN_CONFIG_FEATURE_XXX')` 编译开关
- [ ] 2.2.2 实现 `src/agent/feature-gates/growthbook.ts` 运行时灰度(可选)
- [ ] 2.2.3 实现 isXxxEnabled() 模式(参考 loucode `true ? : false` Positive ternary)
- [ ] 2.2.4 `bun build` 阶段验证 DCE(`bun run build:compile` 后 grep 开关名)
- [ ] 2.2.5 实现 `featureGates.set(feature, { userId, ratio })` 运行时灰度 API
- [ ] 2.2.6 实现 `feature-gates doctor` CLI 命令,诊断当前开关状态
- [ ] 2.2.7 写 50+ 开关的 e2e 测试(开/关行为差异)
- [ ] 2.2.8 写 `docs/feature-gates.md` 50+ 开关清单 + 推荐配置
- [ ] 2.2.9 验证 v1 11 个 spec 的所有 feature 都能正确开关

### 2.3 bridge-v2 (完整 34 文件子系统)

- [ ] 2.3.1 复制 loucode `src/bridge/{Api,Config,Debug,Enabled,Messaging,UI,Status,Poll,Transport,Permission,Pointer,Main}.ts` 模板
- [ ] 2.3.2 适配 upup 现有 `src/bridge/{server,protocol,auth,session,client}.ts`(Sprint 1.3 落地)
- [ ] 2.3.3 实现 `bridgeMessaging.ts` + `inboundMessages.ts` + `inboundAttachments.ts` 消息流
- [ ] 2.3.4 实现 `peerSessions.ts` + `sessionIdCompat.ts` session 兼容
- [ ] 2.3.5 实现 `pollConfig.ts` + `pollConfigDefaults.ts` 轮询
- [ ] 2.3.6 实现 `replBridge.ts` + `replBridgeHandle.ts` + `replBridgeTransport.ts` REPL 桥
- [ ] 2.3.7 实现 `initReplBridge.ts` 初始化
- [ ] 2.3.8 实现 `workSecret.ts` + `trustedDevice.ts` + `capacityWake.ts` + `flushGate.ts`
- [ ] 2.3.9 实现 `jwtUtils.ts` + `webhookSanitizer.ts` + `debugUtils.ts`
- [ ] 2.3.10 实现 `envLessBridgeConfig.ts` 双模式(本地 / 远端 CCR)
- [ ] 2.3.11 写 `src/bridge/v2-integration.test.ts` 端到端验证 34 文件协同
- [ ] 2.3.12 写 e2e:本地 CLI 启动 bridge,远端 CCR 接管

### 2.4 kairos-proactive 6 状态机

- [ ] 2.4.1 重构 `src/kairos/proactive.ts` 6 状态机(active/paused/contextBlocked/nextTickAt/listeners/source)
- [ ] 2.4.2 实现 `activateProactive(source)` / `deactivateProactive()` / `pauseProactive()` / `resumeProactive()`
- [ ] 2.4.3 实现 `setContextBlocked(v)` / `setNextTickAt(t)` / `getNextTickAt()`
- [ ] 2.4.4 实现 `subscribeToProactiveChanges(listener)` + emit 模式
- [ ] 2.4.5 实现 `isProactiveActive()` / `isProactivePaused()` / `isProactiveContextBlocked()`
- [ ] 2.4.6 实现 `resolveAutonomyMode({ assistantEnabled, proactiveFlag, proactiveEnv })`
- [ ] 2.4.7 集成到 KAIROS scanner/position-monitor(扫描前查状态)
- [ ] 2.4.8 写 `src/kairos/proactive.test.ts` 6 状态机转换
- [ ] 2.4.9 写 boundary.test.ts 状态转换边界
- [ ] 2.4.10 写 e2e:Proactive 在 mock 时间触发 + 验证告警推送

## Sprint 3: 任务运行时 + 监控 + 简报 (1 turn)

### 3.1 proactive-mode (独立 spec,与 2.4 互补)

- [ ] 3.1.1 复用 `src/kairos/proactive.ts` 6 状态机作为公共 API
- [ ] 3.1.2 在 `src/agent/` 加 `proactive/` 命名空间导出(避免直接依赖 kairos)
- [ ] 3.1.3 写 AutonomyMode 解析边界测试

### 3.2 task-runtime 6 类任务

- [ ] 3.2.1 实现 `src/tasks/types.ts` 任务接口
- [ ] 3.2.2 实现 `src/tasks/LocalAgentTask.ts` 本地 Agent 子任务
- [ ] 3.2.3 实现 `src/tasks/LocalShellTask.ts` 本地 shell
- [ ] 3.2.4 实现 `src/tasks/LocalWorkflowTask.ts` 本地工作流
- [ ] 3.2.5 实现 `src/tasks/MonitorMcpTask.ts` MCP 监控
- [ ] 3.2.6 实现 `src/tasks/RemoteAgentTask.ts` 远端 Agent(CCR)
- [ ] 3.2.7 实现 `src/tasks/InProcessTeammateTask.ts` 进程内队友
- [ ] 3.2.8 实现 `src/tasks/DreamTask.ts` 后台 dream 任务
- [ ] 3.2.9 实现 `src/tasks/stopTask.ts` 通用停止
- [ ] 3.2.10 实现 `src/tasks/pillLabel.ts` 标签
- [ ] 3.2.11 写 6 类任务的单元测试
- [ ] 3.2.12 KAIROS + Coordinator 接入 task-runtime

### 3.3 worktree-isolation

- [ ] 3.3.1 实现 `src/tasks/worktree.ts` `createAgentWorktree(taskId)` / `removeAgentWorktree(taskId)`
- [ ] 3.3.2 任务结束自动 merge 或 discard
- [ ] 3.3.3 命名规范 `upup-agent-<task-id>`
- [ ] 3.3.4 写 worktree.test.ts
- [ ] 3.3.5 集成到 LocalAgentTask + InProcessTeammateTask

### 3.4 plan-mode-v2

- [ ] 3.4.1 实现 `src/utils/plan-mode-v2.ts` `enterPlanMode()` / `exitPlanMode()` / `verifyPlanExecution()`
- [ ] 3.4.2 plan artifact review 协议
- [ ] 3.4.3 与现有 `/plan` 命令共存(`/plan-v2` 显式启用)
- [ ] 3.4.4 写 plan-mode-v2.test.ts

### 3.5 monitor-task

- [ ] 3.5.1 实现 `src/tools/MonitorTool/`(参考 loucode)持续监控后台任务
- [ ] 3.5.2 可订阅事件、状态推送、回执确认
- [ ] 3.5.3 与 KAIROS 协同
- [ ] 3.5.4 注册 `monitor_subscribe` / `monitor_unsubscribe` / `monitor_list` 3 个 tool
- [ ] 3.5.5 写 monitor-tool.test.ts

### 3.6 brief-tool

- [ ] 3.6.1 实现 `src/tools/BriefTool/`(参考 loucode)一次性简报
- [ ] 3.6.2 聚合 analysis + multimodal(图表 + 报告)
- [ ] 3.6.3 与 SKILL.md 集成
- [ ] 3.6.4 注册 `brief_generate` 1 个 tool
- [ ] 3.6.5 写 brief-tool.test.ts

## Sprint 4: telemetry + 10 个 competitor 对标 (1 turn)

### 4.1 telemetry-events

- [ ] 4.1.1 实现 `src/telemetry/events.ts` ToolCallEvent / DecisionEvent / FeatureGateEvent / ErrorEvent / LatencyEvent
- [ ] 4.1.2 实现 `src/telemetry/sink.ts` 本地 JSONL + 可选远程
- [ ] 4.1.3 实现 `src/telemetry/anonymizer.ts` 脱敏
- [ ] 4.1.4 写 telemetry.test.ts
- [ ] 4.1.5 集成到 feature-gates / tools / agent 主循环
- [ ] 4.1.6 JSONL 滚动 7 天

### 4.2 research-deep-search (AlphaSense 对标)

- [ ] 4.2.1 实现 `src/research/deep-search.ts` 企业级文档/研报全文搜索
- [ ] 4.2.2 NLP 提取关键论断
- [ ] 4.2.3 跨文档引用图谱
- [ ] 4.2.4 注册 `research_deep_search` 1 个 tool
- [ ] 4.2.5 写 deep-search.test.ts

### 4.3 matrix-analysis (Hebbia 对标)

- [ ] 4.3.1 实现 `src/analysis/matrix.ts` 多标的 × 多维度矩阵
- [ ] 4.3.2 默认维度:技术/基本面/资金/情绪
- [ ] 4.3.3 默认 50 个标的(可配置)
- [ ] 4.3.4 批量决策输出(每个 cell 一个 short verdict)
- [ ] 4.3.5 注册 `matrix_analysis` 1 个 tool
- [ ] 4.3.6 写 matrix.test.ts

### 4.4 natural-language-screener (FinChat 对标)

- [ ] 4.4.1 实现 `src/screening/nl-screener.ts` 自然语言 → screening DSL
- [ ] 4.4.2 LLM 翻译("找出 PE<20、ROE>15%、近 5 日北向净流入的科技股" → DSL)
- [ ] 4.4.3 DSL 复用现有 `src/screening/` 引擎
- [ ] 4.4.4 注册 `nl_screen` 1 个 tool
- [ ] 4.4.5 写 nl-screener.test.ts

### 4.5 intent-routing-zh (同花顺问财对标)

- [ ] 4.5.1 实现 `src/agent/intent-detector/zh-router.ts` 中文投资意图路由
- [ ] 4.5.2 4 大类:选股 / 诊断 / 对比 / 教学
- [ ] 4.5.3 LLM-driven 路由,失败 fallback 到关键词
- [ ] 4.5.4 集成到现有 `src/agent/intent-detector/`
- [ ] 4.5.5 写 zh-router.test.ts(中文 query 测试)

### 4.6 institutional-data-feed (东方财富 Choice 对标)

- [ ] 4.6.1 实现 `src/data/institutional/` 主力资金 / 北向 / 融资融券 / 大宗交易 Adapter
- [ ] 4.6.2 复用 `AltDataAdapter` 接口(Sprint 1.2)
- [ ] 4.6.3 注册 `institutional_feed` 1 个 tool
- [ ] 4.6.4 写 institutional-feed.test.ts

### 4.7 tradingagents-compat (TradingAgents 框架兼容)

- [ ] 4.7.1 借鉴 TradingAgents 4 路 Agent 协议(Fundamentals / Sentiment / News / Technicals)
- [ ] 4.7.2 走 upup 自己的事件总线 + worktree 隔离
- [ ] 4.7.3 写 `src/coordinator/workers/tradingagents-*.ts` 4 个 Worker
- [ ] 4.7.4 写 tradingagents-compat.test.ts

## Sprint 5: 端到端验证 (Phase 4 comet-verify)

- [ ] 5.1 实现完整 demo:用户输入"分析 600519,模拟买入 100 股",Agent 调 4 路 Worker,综合决策,sandbox 成交,生成报告
- [ ] 5.2 KAIROS demo:KAIROS 在盘中扫描到异动,推送告警
- [ ] 5.3 Bridge demo:本地 CLI 启动 bridge,网页客户端远程控制
- [ ] 5.4 Proactive demo:无人交互时,Proactive 主动发现机会 + 推送
- [ ] 5.5 Matrix demo:50 标的 × 4 维度批量分析
- [ ] 5.6 Telemetry demo:事件埋点 → JSONL → 简单查询
- [ ] 5.7 所有 demo 在 CI 中跑通,作为长期回归基线
- [ ] 5.8 `bun test` 全量 + `bun run typecheck` 全绿
- [ ] 5.9 验证 v1 11 个 spec 测试基线不退化

## Sprint 6: 文档交付

- [ ] 6.1 写 `docs/trading.md`:trading 沙盒/算法/实盘使用文档
- [ ] 6.2 写 `docs/kairos.md`:KAIROS + Proactive 配置和事件订阅文档
- [ ] 6.3 写 `docs/coordinator.md`:Coordinator v1/v2 使用和 Worker 模板文档
- [ ] 6.4 写 `docs/feature-gates.md`:50+ 开关清单和推荐配置
- [ ] 6.5 写 `docs/bridge.md`:Bridge 部署和远程客户端文档
- [ ] 6.6 写 `docs/alt-data.md`:5 路 Adapter 配置文档
- [ ] 6.7 写 `docs/portfolio-attribution.md`:归因方法论文档
- [ ] 6.8 写 `docs/telemetry.md`:事件埋点和查询文档
- [ ] 6.9 更新主 `README.md` 和 `README_CN.md`,反映 v2 新能力
- [ ] 6.10 写 `CHANGELOG.md` v2 entry

## 文档交付(本 change 收尾)

- [ ] 7.1 写好 21 个新 specs + 5 个 modified specs(在 `openspec/changes/top-tier-investment-assistant-v2/specs/`)
- [ ] 7.2 proposal.md / design.md / tasks.md 三件套内容完整
- [ ] 7.3 用户确认 proposal/design/tasks 内容
- [ ] 7.4 Phase guard 通过,转换到 `design` 阶段(下一步进入详细 spec 撰写期)
- [ ] 7.5 v1 11 个 spec 测试基线不退化
- [ ] 7.6 Sprint 1-5 全量完成
- [ ] 7.7 archive change 到 `openspec/changes/archive/`
