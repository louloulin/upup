## Why

UpUp (涨涨) 已经是一个相当完整的 A 股投研 AI Agent:50 个 skills、240 个 tools、6 个核心投资 skills (decision-dashboard、market-brief、portfolio-review、risk-assessment、stock-analysis、stock-screening)、Tushare/AKShare/Financial Datasets 三路数据源、投资意图识别 + 自动触发、子代理 + 多 Agent 编排、cron 持久化、heartbeat 监控、权限系统。但对照投资行业的"顶级助手"标准(国际产品如 AlphaSense/Hebbia/FinChat,国内产品如同花顺问财/东方财富 Choice/招商 MindGo),UpUp 仍存在几个结构性短板:

1. **执行层缺失**:有 `backtest/`(回测引擎)和 `portfolio/`(多组合管理),但**没有 `trading/` 目录、没有沙盒模拟交易、没有券商 API 对接、没有算法交易**——用户无法在 Agent 内完成"研究→决策→下单"闭环
2. **持续监控缺位**:虽然有 cron + heartbeat,但**没有 KAIROS 风格的"主动找机会"模式**(loucode 还原的 Claude Code 关键能力):盘前/盘后/盘中分时段触发的事件驱动扫描、无人交互时自检持仓 + 标的 + 异动
3. **多 Agent 编排深度不足**:有 subagent + team-tools,但**主从职责分离不强、没有 Coordinator 模式**(主 Claude 拆活,Worker 并行,主 Claude 综合)的明确范式
4. **缺乏工程化门控**:Claude Code 有 50+ `feature()` 编译开关做能力门控和灰度,UpUp 没有对应的分层开关体系,功能上线/回滚/A-B 实验无工程化抓手
5. **缺远程控制/多端**:没有 Bridge 风格的 WebSocket 远程控制,手机/网页/桌面无法协同同一会话
6. **无 ULTRAPLAN 长时研究**:Claude Code 的 30 分钟独立研究 + 50+ 编译开关是它能"甩难题给云端 Opus"和"灰度新功能"的关键,UpUp 都没有

本次改造目标是:在不破坏现有投研能力骨架的前提下,**补齐执行层 + 持续监控层 + 多 Agent 编排层 + 工程化门控 + 远程多端**,让 UpUp 达到"顶级投资助手"标准——能真正帮助投资者做**决策、回测、交易、监控**全链路工作。

## What Changes

### 新增能力(对应 6 大改造方向)

- **EXEC-001**:新增**沙盒模拟交易**(`tools/trading/sandbox.ts`),支持回测后即时转入 paper trading、组合虚拟成交、滑点/手续费/撮合模型可配置
- **EXEC-002**:新增**券商 API 适配层**(`tools/trading/brokers/`),先实现 1-2 个主流券商(雪球/同花顺/老虎/IBKR)的下单/撤单/查持仓接口,统一抽象为 `BrokerAdapter` 接口
- **EXEC-003**:新增**算法交易**(`tools/trading/algos/twap.ts`、`vwap.ts`),大单拆分、按价量分布执行
- **EXEC-004**:新增**组合归因与业绩分析**(`tools/portfolio/attribution.ts`、`brinson.ts`),支持 Brinson 归因、风格归因、行业归因
- **KAIROS-001**:新增**盘前/盘中/盘后事件扫描**(`agent/kairos/scanner.ts`),基于 cron + 行情/公告/异动的事件驱动扫描
- **KAIROS-002**:新增**持仓持续监控**(`agent/kairos/position-monitor.ts`),实时 PnL、止盈止损触发、风险预算偏离告警
- **KAIROS-003**:新增**主动机会发现**(`agent/kairos/proactive.ts`),无人交互时自检:技术形态突破、估值修复、舆情异动、资金异动,生成"今日可关注"清单
- **COORD-001**:新增**Coordinator 模式**(`agent/coordinator/`),主 Claude 拆活 → Worker 并行 → 综合,明确"主只调度、Worker 才执行"职责分离
- **COORD-002**:新增**投资分析专用 Worker 模板**(`agent/coordinator/workers/`),技术面/基本面/资金面/情绪面 4 路并行分析,主 Claude 综合成决策
- **GATE-001**:新增**50+ feature 编译开关体系**(`config/feature-gates.ts`),支持编译时/启动时/运行时三级门控,带 A-B 实验和灰度能力
- **BRIDGE-001**:新增**WebSocket 远程控制**(`bridge/`),本地 CLI 与网页/移动端双向通道,远程查看输出、批准权限、推送消息
- **RT-001**:新增**实时行情推送**(`tools/market/realtime.ts`),WebSocket 接入主流行情源(东方财富/同花顺/AKShare realtime),支持订阅多标的、多频率
- **RT-002**:新增**事件流总线**(`core/event-bus.ts`),解耦数据源和分析/告警/UI 消费方
- **DATA-001**:新增**另类数据集成**(`data/alt/`):新闻(财联社/新华财经)、研报(慧博/choice)、社交(雪球/X)、龙虎榜、北向资金
- **UX-001**:新增**多模态输出**(`ui/multimodal/`):图表(蜡烛图/曲线图/热力图)、研报模板、表格交互
- **UX-002**:新增**跨设备会话同步**(`bridge/session-sync.ts`):本地/远端会话状态共享、断点续传

### 内部重构(非破坏性)

- `agent/subagent.ts` 升级为 Coordinator 模式,**保持向后兼容**(子代理独立调用仍可用)
- `agent/cron/` + `agent/heartbeat/` 合并升级为 `agent/kairos/` 命名空间,旧 cron 任务配置自动迁移
- `tools/` 目录增加 `trading/` 子树(新),与 `backtest/`/`portfolio/` 平级
- `config/` 新增 `feature-gates.ts`,配合 `package.json` 的 `feature:*` 脚本做门控

### 破坏性变更(明确标记)

- **BREAKING**: `agent/intent-detector.ts` 重写为基于 loucode 风格的多层分类(目前只有 import 骨架),旧硬编码关键词匹配将被替换为 LLM-driven 意图分类(可降级回旧模式)

## Capabilities

### New Capabilities

- `trading-sandbox`: 沙盒模拟交易(纸面交易、撮合模型、滑点/手续费/成交约束)
- `broker-adapter`: 券商 API 适配层(下单/撤单/查持仓/查资金,统一 BrokerAdapter 接口)
- `algo-trading`: 算法交易(TWAP/VWAP/POV 等大单拆分执行)
- `portfolio-attribution`: 组合归因与业绩分析(Brinson/风格/行业归因)
- `kairos-mode`: 持续助手模式(盘前/盘中/盘后事件扫描、持仓监控、主动机会发现)
- `coordinator-mode`: 多 Agent 编排模式(主从职责分离,投资分析 4 路并行 Worker)
- `feature-gates`: 工程化门控体系(50+ 编译开关、三级门控、A-B 实验)
- `bridge-mode`: 远程控制桥接(WebSocket 双向通道、远程权限审批、跨端会话)
- `realtime-stream`: 实时行情推送(WebSocket 多源、多标的、多频率订阅)
- `event-bus`: 事件流总线(解耦数据生产/消费、支持回放/过滤/路由)
- `alt-data`: 另类数据集成(新闻/研报/社交/龙虎榜/北向资金)
- `multimodal-output`: 多模态输出(图表/研报模板/表格交互)
- `session-sync`: 跨设备会话同步(状态共享/断点续传/多端协同)

### Modified Capabilities

- `subagent`: 升级为 Coordinator 模式,保留向后兼容(独立子代理调用仍可用)
- `cron-heartbeat`: 合并升级为 `kairos-mode` 命名空间,旧任务配置自动迁移
- `intent-detector`: 重写为 LLM-driven 多层意图分类(可降级回旧模式)

## Impact

### 受影响代码区

- `src/agent/` —— 整体增强:新增 `coordinator/`、`kairos/`,重写 `intent-detector.ts`,升级 `subagent.ts` 和 `cron/heartbeat/`
- `src/tools/` —— 整体增强:新增 `trading/`(EXEC)、`market/realtime.ts`(RT)、`portfolio/attribution.ts`(EXEC-004)
- `src/core/` —— 新增 `event-bus.ts`,作为新的解耦基石
- `src/data/` —— 新增 `alt/` 子树(另类数据)
- `src/ui/` —— 新增 `multimodal/`(图表/研报)
- `src/config/` —— 新增 `feature-gates.ts`
- `bridge/` —— 新增顶层目录(类似 loucode 的 `bridge/`)

### 受影响 API/接口

- `BrokerAdapter` 接口(`tools/trading/brokers/types.ts`)—— 下游券商适配器实现标准
- `Coordinator` API(`agent/coordinator/`)—— 上层应用可调度的多 Agent 编排入口
- `FeatureGate` 枚举(`config/feature-gates.ts`)—— 全局能力门控清单
- `RealtimeFeed` 抽象(`tools/market/realtime.ts`)—— 多源实时行情统一接口
- `IntentDetector` API(`agent/intent-detector.ts`)—— 重写后语义升级(向后兼容,旧关键词匹配可降级)

### 受影响依赖/系统

- 新增 npm 依赖:`ws`(WebSocket)、`recharts`(图表)、`@types/ws`
- 券商 API(雪球/同花顺/老虎/IBKR)—— 需用户自配 token,Adapter 通过环境变量挂载
- 实时行情源(东方财富 WebSocket、同花顺 level-2、AKShare realtime)—— 需用户接受数据使用条款
- 监控/告警通道(钉钉/飞书/Slack/邮件)—— 已存在,本次仅扩展触发源

### 不在范围(Non-Goals)

- 真正的"AI 自动下单"决策(我们只提供 Agent 工具和回测,**不替用户做最终交易决策**,所有实盘下单需用户明确确认)
- 量化策略回测平台(本次不重写 backtest,只是补 sandbox 模拟交易层)
- 投资社区/UGC 内容
- 资管/合规/审计(留给上层应用)
