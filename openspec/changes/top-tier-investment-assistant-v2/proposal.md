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

### Modified Capabilities

- `coordinator-mode`: v1 → v2,主 Agent 工具白名单硬约束
- `feature-gates`: v1 → v2,加入 50+ 编译开关
- `bridge-mode`: v1 → v2,加入 34 文件完整子系统
- `kairos-mode`: 加入 proactive 6 状态机
- `intent-detector`: 加入中文投资意图路由层

## Impact

**Affected code**:
- `src/agent/`:新增 `capability-v2/`(coordinator/feature-gates 重构)、`proactive/`、`plan-v2/`、`telemetry/`
- `src/tools/`:新增 `trading/algos/`、`data/alt/`(v2 升级)
- `src/bridge/`:从无到 ~30 文件子系统
- `src/kairos/`:加 proactive 6 状态机
- `src/agent/intent-detector/`:加中文路由层
- `src/research/`、`src/screening/` 强化 deep-search / nl-screener

**Affected APIs**:
- `process.env.CLAUDE_CODE_COORDINATOR_MODE` 新增(默认 v1)
- `BUN_CONFIG_FEATURE_*` 50+ 新增编译开关
- `/bridge start|stop|status` 新 CLI 命令
- `featureGates.isCoordinatorV2Enabled()` 新 API
- `coordinator.spawnWorker(workerType, prompt)` 新方法

**Affected dependencies**:
- `ws` (Bun 内置 WebSocket,可能无需新增)
- `growthbook` 客户端(运行时灰度,可选用)
- `date-fns` 时间处理(若尚无)
- 不引入新重量级依赖

**Test impact**:
- 预计 50+ 新测试文件,~3000 行测试代码
- 回归基线:v1 已落地的 11 个 spec 测试必须全绿
