## Context

UpUp 当前的 Agent 架构是"用户输入 → 主 Claude → 工具循环 → 流式回答"的单线模型。即使有 subagent + team-tools,也缺乏**主从职责分离**的明确范式(主 Agent 经常直接做研究、写代码、综合结果,而不是把活派给 Worker)。同时,以下能力要么缺失,要么深度不足:

- **执行层**(trading/):0 个 tool
- **持续监控**(KAIROS):cron 是任务调度,heartbeat 是健康检查,**没有"主动找机会"的事件驱动扫描**
- **多 Agent 编排**(Coordinator):subagent 启动容易,但**主从协议、Worker 协议、共享任务列表、上下文注入机制不规范**
- **工程化门控**:无 `feature()` 编译开关,新能力上线/回滚靠 git revert
- **远程控制**(Bridge):无
- **实时数据流**(Realtime):无 WebSocket 推送,只有 polling

学习对象:loucode(还原的 Claude Code)的 7 大隐藏能力 + 50+ `feature()` 开关 + Coordinator 4 阶段协议 + KAIROS 5 层门控 + ULTRAPLAN 30 分钟独立研究。

约束:
- 不能破坏现有 50 skills / 240 tools 的兼容性
- Bun runtime(已用),新增 ws / recharts 依赖须兼容 Bun
- TypeScript strict mode,不允许 `any`
- 中文为主,英文 schema/spec 文件名

## Goals / Non-Goals

**Goals:**

1. **执行层闭环**:补齐 `tools/trading/`,提供 sandbox + BrokerAdapter + algo-trading,使"研究→回测→模拟→实盘"全链路在 UpUp 内可走通
2. **KAIROS 持续助手模式**:把 cron + heartbeat 合并升级,新增"盘前/盘中/盘后事件扫描 + 持仓监控 + 主动机会发现"三类后台 agent
3. **Coordinator 模式**:把 subagent 升级为"主只调度,Worker 才执行"四阶段协议(Research / Synthesis / Implementation / Verification),并提供投资分析专用 Worker 模板
4. **50+ feature gates**:三级门控(编译时 `Bun.build` filter + 启动时 env + 运行时 settings),A-B 实验通过 GrowthBook-like 开关
5. **Bridge 远程控制**:WebSocket 双通道,本地 CLI 暴露端口,网页/移动端可远程控制
6. **实时行情推送**:WebSocket 多源(东方财富 / 同花顺 level-2 / AKShare realtime),多标的订阅,事件总线广播
7. **事件流总线**:解耦数据源(行情/公告/异动)和消费方(分析/告警/UI),支持回放、过滤、路由
8. **多模态输出**:蜡烛图 / 曲线 / 热力图(用 recharts 或自绘 ASCII),研报模板

**Non-Goals:**

- 不替用户做"AI 自动下单"决策(只提供工具,实盘下单必须用户确认)
- 不重写 backtest 引擎(只是补 sandbox 模拟层对接)
- 不做投资社区 / UGC
- 不做资管 / 合规 / 审计
- 不引入云端独立研究(类似 ULTRAPLAN),本地 LLM 能力足够,不做云端 CCR 30 分钟研究

## Decisions

### 1. 沙盒与实盘用同一 `BrokerAdapter` 抽象

**决策**:`tools/trading/brokers/types.ts` 定义 `BrokerAdapter` 接口,所有实现(沙盒、IBKR、雪球、同花顺、老虎)都遵循同一接口。沙盒是其中一种实现,不是特殊路径。

**理由**:用户代码(Agent prompt、portfolio、backtest)不需要区分"我现在是 paper 还是 live",只在配置时切换 Adapter 即可。降低 Agent 复杂度。

**替代方案考虑**:
- ❌ Sandbox 走单独 `tools/sandbox/`,与其他 broker 并列 → 切换麻烦,Agent 要做分支
- ❌ 沙盒用 mock 函数而不是接口 → 类型不严谨,IDE 提示差

### 2. KAIROS 模式 = 升级版 cron + heartbeat,保留旧 API

**决策**:把 `agent/cron/` 和 `agent/heartbeat/` 合并升级为 `agent/kairos/`,但**保留旧 cron 任务的 YAML 配置兼容**(读取时自动检测,无 KAIROS 字段则按 cron 行为)。三个子系统:`scanner`(事件扫描)、`position-monitor`(持仓监控)、`proactive`(主动机会)。

**理由**:不破坏用户现有 cron 配置,渐进升级;命名 loucode 风格对齐。

**替代方案考虑**:
- ❌ 一次性硬切到 KAIROS,旧配置 import 报错 → 破坏性,用户升级痛苦
- ❌ KAIROS 独立于 cron,功能重叠 → 概念混乱

### 3. Coordinator 模式基于现有 subagent,扩展协议

**决策**:`agent/coordinator/coordinator-mode.ts` 新增 Coordinator 类,继承/组合现有 `subagent-runner.ts`。主 Claude 的"主从职责分离"通过 system prompt 强约束 + 工具白名单(主只能用 Agent/SendMessage/TaskStop)实现。

**理由**:复用了 subagent 的 worker 进程管理、权限继承、上下文继承。Coordinator 是"约束版"subagent,不是从零造。

**替代方案考虑**:
- ❌ Coordinator 完全独立,不复用 subagent → 重复造轮子
- ❌ Coordinator 强制要求主 Claude 重写 prompt → 复杂度高,先简单点

### 4. Feature gates 三级,编译时最强

**决策**:
- **编译时**:`process.env.BUN_CONFIG_FEATURE_TRADING=1` 触发 `Bun.build` filter,对应代码完全从 bundle 中剔除
- **启动时**:在 `src/index.tsx` 顶部读 `process.env.FEATURE_*`,把 `featureGates` 注入全局
- **运行时**:通过 `featureGates.set('kairos', { userId, ratio: 0.1 })` 灰度

**理由**:对齐 loucode 的 `feature()` 模式,但 Bun 比 webpack 简单。运行时开关给 A-B 实验用。

**替代方案考虑**:
- ❌ 只做编译时,不做运行时 → 没法 A-B
- ❌ 只做运行时,不做编译时 → bundle 体积大,死代码多

### 5. Bridge 模式默认关闭

**决策**:`bridge/` 是可选模块,默认不启动。`upup --bridge` 启动本地 WebSocket server,token 鉴权。仅在用户显式开启时跑。

**理由**:安全考虑,WebSocket 远程控制是攻击面,默认关闭避免误开。

**替代方案考虑**:
- ❌ 默认开启 → 安全隐患
- ❌ 必须配 HTTPS + 复杂鉴权 → 启动门槛高,普通用户用不上

### 6. Realtime 推送用抽象 `RealtimeFeed` + 多源 Adapter

**决策**:`tools/market/realtime.ts` 定义 `RealtimeFeed` 接口,各源(东方财富 WS、同花顺 level-2、AKShare realtime)实现 Adapter。统一订阅 API:`feed.subscribe(['AAPL', '600519'], { throttle: 1000 })`。

**理由**:数据源经常变(API 升级/限流/下架),抽象让切换成本低。

**替代方案考虑**:
- ❌ 写死东方财富 → 单点故障
- ❌ 每个源一个独立 tool → Agent 选错源效率低

### 7. Event bus 用发布订阅,异步

**决策**:`core/event-bus.ts` 用 `mitt` 或自实现,支持 `on/once/off/emit`,带 topic 过滤(支持通配符 `market.*`)和回放(存最近 1000 条)。

**理由**:解耦数据生产(行情/公告)和消费(分析/告警/UI),符合 Agent 事件驱动模型。

**替代方案考虑**:
- ❌ 用 RxJS → 太重,Bun 兼容性差
- ❌ 直接 callback 链 → 难调试,易循环引用

### 8. 多模态输出先 ASCII,后 SVG/PNG

**决策**:**MVP 只做 ASCII 图表**(蜡烛图 / K 线 / 曲线用字符画),与现有 CLI 风格一致;Phase 2 评估 SVG / PNG(用 `recharts` 或自绘)。

**理由**:与 UpUp CLI/TUI 体验统一,无新依赖,响应快。

**替代方案考虑**:
- ❌ 一上来就 SVG/PNG → CLI 渲染慢,异步,体验割裂
- ❌ 用 `recharts` → React 依赖,与 Ink 体系冲突

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **券商 API 合规风险**:实盘下单涉及监管(证监会/外汇),集成 IBKR 等海外券商需用户接受条款 | 文档明确写"用户自负风险",沙盒默认,实盘需 `--confirm-live` 显式确认 |
| **WebSocket 反向控制的安全攻击面**:Bridge 暴露端口,可能成为入侵入口 | 默认关闭,token 鉴权 + 速率限制 + 审计日志 |
| **Feature gates 太多导致配置爆炸**:50+ 开关管理成本 | 提供 `feature-gates doctor` 命令诊断当前哪些开关开了/关了/冲突 |
| **Realtime 多源数据质量差异**:东方财富 / 同花顺 / AKShare 数据精度和稳定性不同 | Adapter 实现质量评分,Agent 提示"高/中/低"质量 |
| **Coordinator 模式下 LLM 幻觉率上升**:主 Claude 拆活可能不准确 | 限制 Worker 数量 ≤ 5,主 Claude 强制要求看每个 Worker 结果再综合 |
| **KAIROS 持续运行消耗 token 成本**:主动机会发现会调用 LLM | 限制每日调用次数,有"安静时段"(22:00-08:00 默认不主动) |
| **Intent detector 重写的回归风险**:LLM-driven 替换硬编码 | 提供 `legacy` 模式保留旧关键词匹配,渐进切换 |
| **Bun 与 ws 库的兼容性**:Bun 自带 WebSocket,但 npm `ws` 库 API 不同 | 优先用 Bun 原生 WebSocketServer,`ws` 仅在 CLI 模式作为 fallback |

## Migration Plan

### Phase 1 (本次 change 准备)

1. 写好 13 个新 specs + 3 个 modified specs(在 `openspec/changes/<name>/specs/`)
2. 写好 design.md 和 tasks.md
3. **用户确认后,Phase Guard 转换到 `design` 阶段**

### Phase 2 (实现期,留给下一阶段)

按 6 大改造方向并行推进,每个方向一个独立子模块:

- **EXEC(交易)**:沙盒 → 1 个 broker(推荐 IBKR,API 稳定)→ algo-trading
- **KAIROS**:scanner → position-monitor → proactive
- **COORD**:Coordinator 基础 → 投资分析 Worker 模板
- **GATE**:编译时 → 启动时 → 运行时
- **BRIDGE**:WebSocket 服务 → token 鉴权 → 远程 UI
- **RT**:RealtimeFeed 抽象 → 东方财富 Adapter → Event bus

每个子模块独立 PR,带测试和 e2e 验证。

### Phase 3 (回滚/降级)

- Feature gate 编译时排除,代码不进 bundle
- 启动时 `FEATURE_TRADING=false` 关闭,Agent 行为回退
- 运行时灰度比例设为 0,新功能下线

## Open Questions

1. **是否需要"AI 自动下单"开关?** 即"Agent 自主下单,无需用户每次确认"——目前明确不做,等用户后续需求
2. **Bridge 是否要支持 HTTPS + WSS?** 当前是 WS 裸协议,生产环境推荐 WSS,需要证书
3. **Realtime 多源是否需要冗余?** 一个源挂了切到另一个——这要求 Adapter 有 fallback 链,实现复杂度高
4. **Coordinator 是否要支持 UI 可视化?** 类似 Augment Code 的"任务进度条"——先做 CLI 日志,UI 后续
5. **KAIROS 主动机会发现的 LLM 调用预算?** 每天 100 次还是不限?需要产品决策
6. **Intent detector LLM 分类的 prompt 怎么写?** 需要专门的 few-shot 例子,投资领域的意图(选股/分析/回测/交易/监控)有特定模式
7. **.comet.yaml 状态机如何与 openspec 协作?** 两者是同阶段还是不同?需要查 comet 文档
]<]minimax[>[</DESIGN_EOF
wc -l /Users/louloulin/Documents/linchong/touzhi/upup/openspec/changes/top-tier-investment-assistant/design.md
## 附录 A:全面现状盘点(基于源码调研)

### A.1 upup 现有 Skills 全景(51 个 SKILL.md)

按职能归类:

**单股深度分析**(6 个)
- `stock-analysis`、`decision-dashboard`、`dcf-valuation`、`earnings-forecast`、`valuation-comparison`、`valuation-alert`

**技术面/资金面**(8 个)
- `technical-analysis`、`money-flow`、`institutional-holding`、`institution-research`、`shareholder-analysis`、`market-monitor`、`market-overview`、`manager-analysis`(基金经理分析)

**基本面/财报**(8 个)
- `cash-flow-analysis`、`dividend-analysis`、`earnings-calendar`、`earnings-season`、`financial-interpretation`、`financial-report`、`financial-report-analysis`、`macro-analysis`

**选股/筛选**(4 个)
- `stock-screening`、`stock-comparison`、`sector-analysis`、`sector-rotation`

**投资策略**(6 个)
- `value-investing`、`growth-investing`、`momentum-investing`、`multi-market-analysis`、`swarm-analysis`(3-agent 团队)、`dca-strategy`

**情感/舆情**(2 个)
- `sentiment-analysis`、`x-research`(X/Twitter)

**组合/资金管理**(5 个)
- `portfolio-management`、`portfolio-rebalancing`、`personalized-recommendation`、`backtest-dca`、`performance-prediction`

**基金/特殊资产**(8 个)
- `fund-analysis`、`fund-comparison`、`fund-holdings`、`fund-management` + a-share-analysis、alert-management、api-integration、research-report

**核心 6 个投资 skills**(`src/skills/investment/`):decision-dashboard、market-brief、portfolio-review、risk-assessment、stock-analysis、stock-screening

**多代理已存在**:`swarm-analysis` 已是 3-agent(researcher/analyst/summarizer)工作流——**这是 loucode Coordinator 模式的现有雏形**

### A.2 upup 现有 Tools 全景(77 个目录,240 个 .ts 文件)

按职能归类:

**金融数据**(15):finance、fund、earnings、calendar、screening、sector、news、forecast、comparison、short-interest、fx、quant、astock、sentiment、valuation

**组合/回测/风险**(5):portfolio、backtest、risk、monitor、alerts

**代理/任务/团队**(8):send-message、team-tools、subagent、task、discovery、registry、workflow、plan

**会话/记忆/存储**(4):memory、storage、session、cache

**通信/通知**(2):notify、heartbeat

**Skills/MCP 桥**(3):skill、skill-executor、mcp-skills

**代码/开发工具**(12):bash、powershell、fetch、browser、filesystem、lsp、worktree、benchmark、notebook、export、telemetry、analytics

**A 股 / 国别**(2):astock、fx

**主索引**(1):index.ts

### A.3 关键发现:已有但需扩展

| 现有 | 我的 proposal 中 | 实际差距 |
|------|------------------|---------|
| `capability-registry.ts`(416 行) | `feature-gates` 新建 | 已有**运行时**能力注册,缺**编译时** + **A/B** + **远程**门控,需扩展而非新建 |
| `swarm-analysis`(3-agent) | `coordinator-mode` 新建 4 路并行 | 已有**多代理协作**,但缺**主从职责分离**(主 Claude 仍可直接调工具)+ **Worker 协议**标准化 |
| `cron/` + `heartbeat/` | KAIROS 升级 | 已有**调度**,缺**主动机会发现**(`proactive.ts`)+ **事件驱动** |
| `intent-detector.ts`(479 行 import 骨架) | 重写 LLM-driven | 已经是空壳,需**真正实现** |
| `backtest/` | sandbox 模拟交易 | 已有**回测**,缺**沙盒模拟交易**(`broker-adapter` 抽象)+ **实盘对接** |
| `tools/notify/` | KAIROS 告警通道 | 已有部分,需扩展 |
| `data/fmp`、`data/tushare` | 另类数据 | 已有**结构化数据**,缺**新闻/研报/社交/龙虎榜**等非结构化 |

### A.4 loucode 7 大能力 vs upup 现状对标

| loucode 能力 | upup 现状 | 改造映射 |
|------------|----------|---------|
| **BUDDY**(宠物) | 无 | 跳过(非投资域) |
| **KAIROS**(持续助手) | cron + heartbeat,缺 proactive | 升级 → `kairos-mode` capability |
| **ULTRAPLAN**(云端 30 分钟研究) | 无 | 跳过(本地 LLM 已够,本 change 不做云端) |
| **Coordinator**(主从分离) | swarm-analysis(3-agent),但主从不清 | 升级 → `coordinator-mode` capability |
| **26+ 隐藏命令** | `agent-commands.ts` 已有部分 | 增量 → 加进 kairos/coordinator |
| **Bridge**(远程) | 无 | 新建 → `bridge-mode` capability |
| **50+ 编译开关** | capability-registry(运行时 12 个) | 扩展 → `feature-gates` capability |

### A.5 投资助手"顶级水平"6 层能力对照

| 层级 | 国际顶级(AlphaSense/Hebbia) | 国内顶级(问财/Choice) | upup 现状 | 差距 |
|------|---------------------------|----------------------|----------|------|
| **L1 数据** | 强(企业文档) | 强(全市场) | 强(多源) | 缺另类数据(DATA-001) |
| **L2 分析** | 强(LLM 摘要) | 强(技术+基本) | 强(40+ skill) | 缺组合归因(EXEC-004) |
| **L3 决策** | 弱 | 中 | 中(intent-detector 半成品) | 缺 LLM-driven intent(待 8.x) |
| **L4 执行** | 弱(无) | 强(实盘) | 弱(只回测) | **缺沙盒 + 实盘(EXEC-001/002)** |
| **L5 监控** | 弱 | 强(实时) | 中(cron+heartbeat) | 缺主动机会(KAIROS-003) |
| **L6 体验** | 中 | 强(多端) | 中(CLI) | 缺远程多端(BRIDGE-001) |

### A.6 改造优先级矩阵

按"差距大 × 投资价值高"排序,优先级 P0 > P1 > P2:

- **P0(必做,投资人最关心)**:EXEC-001 沙盒、EXEC-002 券商适配、KAIROS-003 主动机会、COORD-001 投资 4 路 Worker
- **P1(强烈建议)**:EXEC-003 algo-trading、EXEC-004 归因、KAIROS-001/002 扫描/监控、RT-001 实时行情、INTENT-001 LLM 分类
- **P2(锦上添花)**:GATE-001 编译开关、BRIDGE-001 远程、DATA-001 另类数据、UX-001 多模态、SESSION-SYNC

### A.7 实施节奏建议

**Wave 1(并行 2-3 周)**:EXEC-001 + EXEC-002 + COORD-001 + KAIROS-003
**Wave 2(并行 2-3 周)**:EXEC-003 + EXEC-004 + KAIROS-001/002 + RT-001
**Wave 3(并行 2 周)**:GATE-001 + BRIDGE-001 + DATA-001
**Wave 4(1 周)**:UX-001 + SESSION-SYNC + 文档 + E2E demo

每个 Wave 结束做一次端到端 demo 验证。

---

> **结论**:upup 已经覆盖投资 6 层中的 L1/L2/L5 大部分,本次 change 集中补齐 L3 决策 + L4 执行 + L6 体验,并对 L5 监控做 KAIROS 升级。改造完成后,UpUp 能力将与同花顺 i 问财 + 东方财富 Choice + AlphaSense + FinChat 在 A 股域形成顶级定位,并通过 Coordinator 模式 + KAIROS 持续助手形成差异化。
