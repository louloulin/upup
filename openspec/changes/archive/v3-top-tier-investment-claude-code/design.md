# Design: 顶级投资助手的 Claude Code (v3)

> **范围**:在 v2 基础上把 upup 做成"投研 Claude Code"——5 层架构 + 7 隐藏功能投研化 + 4 唯一差异化 + 投研 5 个核心 spec。
>
> **方法**:不重写 v2 的 25 个 spec,而是在其上"叠一层"——加 5 个 v3 新 spec(`claude-code-5layer` / `coach-mode` / `deep-plan` / `cli-extension` / `investment-3d-positioning`),深化 2 个 v2 spec(`kairos-v2` / `bridge-v2`),把"投研 Claude Code"的故事讲清楚。

---

## 一、v2 baseline 盘点(基于 src/ 实测)

| 指标 | 数值 | 备注 |
|------|------|------|
| 总 .ts/.tsx | 941 | 真实文件数 |
| `src/skills/` 目录 | 87(含 50 SKILL.md) | 投研域全覆盖 |
| `src/tools/` 子目录 | 286 tool 文件 | 投资域 5 group |
| `src/agent/` 文件 | 71 | agent.ts 1232 行主循环 |
| `src/coordinator/` | 7 文件 | 4 Worker 雏形 |
| `src/bridge/` | 12 文件 | Sprint 1.5 完成基础 |
| `src/kairos/` | 8 文件 | scanner / position-monitor / proactive 雏形 |
| `src/proactive/` | 1 文件(12K) | 雏形,6 状态机待加 |
| `src/multimodal/` | 7 文件 | charts + reports |
| `src/realtime/` | 10 文件 | OHLC + 东方财富 adapter |
| `src/telemetry/` | Sprint 4.1 完成 | 5 类事件 + JSONL sink |
| `src/research/` | Sprint 4.2 完成 | DeepSearchEngine (575 行) |
| `src/analysis/` | Sprint 4.3 完成 | MatrixEngine (608 行) |
| `src/screening/` | Sprint 4.4 完成 | NLScreener (664 行) |
| `src/agent/intent-detector/zh-router.ts` | Sprint 4.5 完成 | 274 行,7 意图路由 |

**核心能力(5 group,来自 `src/agent/capability-manifest.ts`)**:
- `realtime`:实时行情(Mock 默认,东方财富生产 adapter)
- `coordinator`:多 worker 分析(4 Worker 雏形:技术/基本面/资金/情绪)
- `kairos`:机会/告警/扫描(KAIROS 8 文件,read-only 视图)
- `trading`:模拟/实盘交易(sandbox 默认 + IBKR/雪球 adapter + 4 algo)
- `portfolio`:组合分析(Brinson 3-factor + 风格 + 行业 + 16 文件)

---

## 二、v3 核心架构:投研 Claude Code 5 层

### 2.1 架构总图

```
┌──────────────────────────────────────────────────────────────────────┐
│ L5  持续自主 (KAIROS 6 状态机 + Proactive + Telemetry + Dream 整合)   │
│      ↑                                                                │
│      ├─ kairos-v2 升级(coordinator / runtime / compaction / dream)    │
│      ├─ coach-mode 投研 Coach 推送(晨会 / 盘后 / 财报日 / 政策日)     │
│      └─ telemetry-events 5 类事件 → JSONL → 准确率评估              │
├──────────────────────────────────────────────────────────────────────┤
│ L4  远程协同 (Bridge 34 文件 + Session Sync + 多渠道)                │
│      ↑                                                                │
│      ├─ bridge-v2 升级(RBAC / UI / Permission / Status / Poll)      │
│      ├─ multi-channel-bridge(微信 / 飞书 / 钉钉 推送)                │
│      └─ session-sync v2(断点续传 + 冲突合并)                          │
├──────────────────────────────────────────────────────────────────────┤
│ L3  多 Agent 编排 (Coordinator V2 + Subagent + Task Runtime 6 类)    │
│      ↑                                                                │
│      ├─ coordinator-v2(主只调度 + Worker XML 协议 + 失败续接)        │
│      ├─ task-runtime(LocalAgent / LocalShell / LocalWorkflow /       │
│      │   MonitorMcp / RemoteAgent / InProcessTeammate 6 类)          │
│      └─ worktree-isolation(每个 Worker 任务独立 git worktree)        │
├──────────────────────────────────────────────────────────────────────┤
│ L2  工具 + 技能 (Tools 286 + Skills 50→80+ + Hooks + MCP)            │
│      ↑                                                                │
│      ├─ tools/* 5 group 完整(realtime/coordinator/kairos/trading/    │
│      │   portfolio + 新 research/analysis/screening/institutional)    │
│      ├─ skills/* 80+ SKILL.md(50 → 80+,加 30+ chainable)             │
│      └─ cli-extension(20+ 投研隐藏命令)                               │
├──────────────────────────────────────────────────────────────────────┤
│ L1  基础循环 (Agent Loop + Scratchpad + Context + Compaction)        │
│      ↑                                                                │
│      ├─ agent.ts 1232 行(10 步迭代,稳定,只增量)                       │
│      ├─ scratchpad(单源真相,所有 tool 结果)                           │
│      └─ context(Anthropic 风格:全量保留 + token 阈值清最旧)          │
│                                                                       │
│      L1 顶层叠加:投研 Claude 主对话(系统 prompt 注入人设)            │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 L1 → L5 跨层协议

| 跨层 | 协议 | 实现 |
|------|------|------|
| L1 → L2 | Tool registry + skill registry | `src/tools/registry/` + `src/skills/registry.ts` |
| L2 → L3 | Worker XML 注入 | `<task-notification><task-id>...</task-id><result>...</result></task-notification>` |
| L3 → L4 | Bridge transport v1/v2 | `src/bridge/{repl,remote,worktree}-bridge.ts` |
| L4 → L5 | EventBus 跨设备 | `src/core/event-bus.ts` + 远端 sink |
| L1 ↔ L5 | Telemetry 全链路埋点 | `src/telemetry/{events,sink,anonymizer}.ts` |
| L1 ↔ Coach | System prompt 注入 | `src/agent/role-system.ts`(v3 新增) |

### 2.3 5 layer × 5 group 双视角 manifest

v2 是 5 group 视角(realtime/coordinator/kairos/trading/portfolio),v3 增加 5 layer 视角(L1-L5),manifest 字段扩展:

```ts
// src/agent/capability-manifest.ts (v3 升级)
export interface CapabilityGroup {
  id: string;
  title: string;
  // v2 字段
  prefixes: string[];
  blurb: string;
  whenToUse: string[];
  // v3 新增(向下兼容,?? 兜底)
  layer?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  featureGate?: string;  // feature('XXX') 编译开关名
  coachEnabled?: boolean;  // 是否被投研 Coach 主动调用
  // v3 新增:市场覆盖
  markets?: Array<'a-share' | 'us' | 'hk' | 'crypto'>;
}
```

---

## 三、loucode 7 隐藏功能 → upup 投研 7 增强(详细设计)

### 3.1 BUDDY → 投研 Coach(`coach-mode`)

**loucode BUDDY**:18 种虚拟宠物 + 5 级稀有度 + 1% 闪光 + 6 眼睛 + 8 帽子 + 动画;**不学虚拟宠物**,学**情感化交互**思路。

**upup Coach 设计**:
- **人格**:中文投研专家,引用源,有风险提示,不直接给买卖建议
- **主动推送**:晨会(9:00 前)/ 盘后(15:30 后)/ 财报日(T-1)/ 政策日(事件触发)
- **跨会话记忆**:用户偏好 / 持仓 / 历史咨询 / 风险偏好,持久化
- **个性化**:用户问过的股票 / 用过的策略 / 关注过的行业,逐步学习
- **实现**:
  - `src/agent/role-system.ts` 定义"投研 Claude"人设 + prompt 模板
  - `src/coach/{morningBrief,afterHours,earningsPreview,riskDashboard}.ts` 4 个 Coach 主动模式
  - `src/coach/memory.ts` 跨会话记忆(集成 KAIROS Dream 整合)
- **不开创"BUDDY 宠物"**(投研域价值低,优先级 P3 skip)
- **编译开关**:`feature('COACH_MODE')`,默认 off;`UPUP_COACH_MODE=1` 启用
- **影响**:主对话 system prompt 增强,所有 subagent 继承人设
- **风险**:人设 prompt 注入可能改变 LLM 行为 → 通过 `UPUP_COACH_MODE=0` 软降级

### 3.2 KAIROS → 投研 KAIROS(`kairos-v2`)

**loucode KAIROS**:5 层激活 + 跨会话持久 + 每日日志 + Dream 整合(24h+5 会话触发)+ Proactive + 后台任务 + 持久 cron

**upup KAIROS v2 设计**:
- **5 层激活门控**:
  1. `feature('KAIROS')` 编译开关
  2. `.upup/settings.json` 的 `kairos.enabled: true`
  3. 目录信任状态(防恶意仓库劫持)
  4. GrowthBook `tengu_kairos` 远程开关
  5. `setKairosActive(true)` 全局状态
- **跨会话持久**:`.upup/kairos/state.json` 存会话状态 + `.upup/kairos/logs/YYYY/MM/YYYY-MM-DD.md` 存日志
- **Dream 整合**:
  - 触发:距上次整合 24h + 5+ 新会话
  - 4 阶段:Orientation → Gather → Consolidate → Prune
  - 锁机制:`.upup/kairos/.dream-lock` + PID 存活检查
- **Proactive 6 状态机**:
  - `active` / `paused` / `contextBlocked` / `nextTickAt` / `listeners` / `source`
  - API:`activateProactive` / `pauseProactive` / `setContextBlocked` / `subscribeToProactiveChanges`
  - AutonomyMode:`resolveAutonomyMode({ assistantEnabled, proactiveFlag, proactiveEnv })`
- **投研 KAIROS 增强**:
  - **盘中异动**(`scanner.ts` 已建,扩到多频率)
  - **财报日历**(`earnings-calendar` skill 集成)
  - **政策事件**(`alt-data` adapter 集成)
  - **行业轮动**(`sector-rotation` skill 集成)
  - **风险预警**(`risk-assessment` skill 集成)
- **实现**:升级 v2 的 8 文件 → v3 的 16 文件
  ```
  src/kairos/
  ├── types.ts
  ├── index.ts
  ├── runtime.ts (v3 新,状态机主类)
  ├── compaction.ts (v3 新,dream 整合)
  ├── scheduling.ts (v3 新,持久 cron)
  ├── proactive.ts (升级,6 状态机)
  ├── position-monitor.ts (扩,跨 broker)
  ├── scanner.ts (扩,多频率)
  ├── dream.ts (v3 新,4 阶段)
  ├── memory.ts (v3 新,跨会话)
  ├── channels/ (v3 新,微信/飞书/钉钉)
  ├── cron.ts (v2 已有,扩)
  ├── heartbeat.ts (v2 已有,扩)
  ├── session.ts (v3 新,会话管理)
  └── tests/
  ```
- **编译开关**:`feature('KAIROS')` / `feature('KAIROS_BRIEF')` / `feature('KAIROS_CHANNELS')` / `feature('KAIROS_DREAM')`

### 3.3 ULTRAPLAN → 投研深度规划(`deep-plan`)

**loucode ULTRAPLAN**:云端 Opus 30 分钟规划,用户可在浏览器审批;**外部版永不可用**(`isEnabled: () => "external" === 'ant'`)。

**upup deep-plan 设计**:
- **不做云端**(投研域数据敏感,云端有合规风险),做**本地深度规划**
- **触发**:用户输入 `/deep-plan` 或 query 含 "深度规划" "长期规划" "投资计划" "组合规划"
- **流程**(本地 5-30 分钟):
  ```
  1. Planner Agent:拆解用户目标 → 子任务列表
  2. Researcher Agent:多 worker 并行调研(基本面/技术/政策/行业)
  3. Backtest Agent:对候选策略做回测
  4. Synthesizer Agent:综合,生成"投资计划书"(Markdown + 图表)
  5. Reviewer Agent:同行评议(可选,通过 loucode 风格 verification)
  6. 用户审批 → 执行或修改
  ```
- **产物**:`.upup/plans/<plan-id>.md` + 可执行 TaskCreate 列表
- **取消 / 续接**:类似 loucode,支持 `TASK_STOP` + `SEND_MESSAGE` 续接
- **实现**:
  - `src/deep-plan/{planner,researcher,backtest,synthesizer,reviewer}.ts` 5 Agent
  - `src/deep-plan/index.ts` 主入口
  - `src/deep-plan/types.ts` + `src/deep-plan/persistence.ts`
  - 复用 Coordinator V2 + Task Runtime 6 类
- **编译开关**:`feature('DEEP_PLAN')`

### 3.4 COORDINATOR → 投研 Coordinator V2(`coordinator-v2`)

**loucode COORDINATOR**:主只调度(只 Agent / SendMessage / TaskStop),Worker 才执行;4 阶段(Research / Synthesis / Implementation / Verification);Worker XML `<task-notification>` 协议;TASK_STOP + SEND_MESSAGE 失败续接。

**upup Coordinator v2 设计**(v2 已规划,v3 深化):
- **4 阶段**:`Research` → `Synthesis` → `Implementation` → `Verification`
- **投研 4 阶段映射**:
  - Research:行业扫描 + 公司精选(6 Worker:基本面/技术/资金/情绪/政策/行业)
  - Synthesis:综合候选标的,生成组合建议
  - Implementation:回测 + 模拟 + 准备实盘
  - Verification:同行评议 + 风险检查 + 审计
- **主 Agent 工具白名单硬约束**:只允许 `Agent` / `SendMessage` / `TaskStop`,其他 throw
- **Worker XML 协议**:
  ```xml
  <task-notification>
    <task-id>...</task-id>
    <result>...</result>
    <artifacts>...</artifacts>
    <confidence>0.0-1.0</confidence>
  </task-notification>
  ```
- **失败续接**:`TASK_STOP` 取消 + `SEND_MESSAGE` 续接(避免 context 丢失)
- **真实验证**:Worker 跑测试 + typecheck + 独立验证
- **6 Worker 类型**(v2 4 → v3 6):
  - `fundamental-analysis` / `technical-analysis` / `capital-flow` / `sentiment` / `policy` / `industry`
- **降级**:`featureGates.isCoordinatorV2Enabled()` 控制,`false` 走 v1 模式
- **实现**:`src/coordinator/{coordinatorMode,workerAgent,worker-xml,worker-resume,verification}.ts`
- **编译开关**:`feature('COORDINATOR_MODE')` + `CLAUDE_CODE_COORDINATOR_MODE=1`

### 3.5 HIDDEN-COMMANDS → 投研 CLI 隐藏命令生态(`cli-extension`)

**loucode HIDDEN-COMMANDS**:50+ 隐藏开关(`/buddy` / `/proactive` / `/assistant` / `/brief` / `/bridge` / `/voice` / `/ultraplan` 等),通过 `feature()` 编译开关门控,外部版大部分不可见。

**upup cli-extension 设计**(v3 新 spec,20+ 投研隐藏命令):
- **晨会类**(2):
  - `/morning-brief`:每日开盘前简报(昨日行情 + 今日关注 + 财报日历)
  - `/earnings-preview`:财报日 T-1 简报(业绩预期 + 卖方一致预期)
- **盘后类**(3):
  - `/after-hours-summary`:每日收盘总结
  - `/portfolio-review`:组合每日复盘
  - `/risk-dashboard`:风险仪表盘(仓位 / 行业 / 集中度)
- **持仓类**(3):
  - `/watchlist-edit`:编辑自选股(REPL 内)
  - `/rebalance-now`:立即调仓(基于组合再平衡策略)
  - `/alert-add` / `/alert-remove`:快速加减预警
- **研究类**(4):
  - `/industry-deep-dive`:行业深度研究(对应 deep-plan)
  - `/backtest-run`:快速回测
  - `/screen`:自然语言选股
  - `/compare`:多标的对比
- **协同类**(3):
  - `/bridge`:启动远程桥接
  - `/wechat-bind` / `/feishu-bind`:绑定推送渠道
  - `/session-share`:分享会话链接
- **调试类**(3):
  - `/telemetry-show`:查看最近事件
  - `/feature-list`:列出 50+ 编译开关
  - `/doctor`:环境自检
- **实现**:
  - `src/commands/{morning-brief,earnings-preview,after-hours-summary,portfolio-review,risk-dashboard,watchlist-edit,rebalance-now,alert-add,alert-remove,industry-deep-dive,backtest-run,screen,compare,bridge,wechat-bind,feishu-bind,session-share,telemetry-show,feature-list,doctor}.tsx` 20 个文件
  - 全部 `feature('XXX')` 编译开关门控
  - 注册到 `src/commands/index.ts` 中央 registry
- **编译开关**:每个命令一个,共 20+ 个 `feature('COMMAND_XXX')`

### 3.6 BRIDGE → 投研 Bridge(`bridge-v2` + `multi-channel-bridge`)

**loucode BRIDGE**:33 文件,从 claude.ai 网页端远程操控本地 CLI;2 种模式(独立 daemon + REPL 内嵌);3 种 session 模式(single / worktree / same-dir)。

**upup bridge-v2 设计**(v2 已规划 12 文件,v3 升级到 34 文件):
- **34 个文件对应**(参考 v2 design D4):
  - `bridgeServer.ts` WebSocket server(Bun 内置)
  - `bridgeProtocol.ts` 消息协议(chat / approval / output / status / 4 类)
  - `bridgeAuth.ts` token 鉴权(JWT)
  - `bridgeSession.ts` 远端 session
  - `bridgeConfig.ts` + `envLessBridgeConfig.ts` 双模式
  - `bridgeMessaging.ts` + `inboundMessages.ts` + `inboundAttachments.ts`
  - `bridgeUI.ts` + `bridgeStatusUtil.ts` UI 与状态
  - `bridgePermissionCallbacks.ts` 权限审批
  - `peerSessions.ts` + `sessionIdCompat.ts` session 兼容
  - `pollConfig.ts` + `pollConfigDefaults.ts` 轮询
  - `replBridge.ts` + `replBridgeHandle.ts` + `replBridgeTransport.ts` REPL 桥
  - `initReplBridge.ts` 初始化
  - `workSecret.ts` / `trustedDevice.ts` / `capacityWake.ts` / `flushGate.ts`
  - `jwtUtils.ts` / `webhookSanitizer.ts` / `debugUtils.ts` / `bridgeDebug.ts`
  - `bridgePointer.ts` / `bridgeMain.ts`(2999 行参考) / `bridgeApi.ts`
  - `bridgeEnabled.ts` / `codeSessionApi.ts` / `createSession.ts`
  - `sessionRunner.ts` / `remoteBridgeCore.ts` / `types.ts`
- **多渠道推送**(`multi-channel-bridge`,v3 新):
  - 微信(Wechat Work / Server 酱 / PushPlus)
  - 飞书(Lark Bot)
  - 钉钉(DingTalk Bot)
  - 邮件(SMTP)
  - 移动端(响应式网页)
- **实现**:
  - 升级 v2 的 12 文件到 34 文件
  - `src/bridge/{wechat,feishu,dingtalk,email,push}.ts` 5 渠道
  - 全部 `feature('BRIDGE_MODE')` / `feature('DAEMON')` / `feature('BRIDGE_XXX')` 门控

### 3.7 FEATURE-GATES → 投研 Feature Gates 升级(`feature-gates-v2`)

**loucode FEATURE-GATES**:3 层门控(编译时 `feature()` + 运行时 `USER_TYPE` + GrowthBook 远程);50+ 编译开关;DCE friendly Positive ternary pattern。

**upup feature-gates-v2 设计**(v2 已规划,v3 深化):
- **3 层门控**:
  1. 编译时 `feature('BUN_CONFIG_FEATURE_UPUP_XXX')`(Bun bundle filter)
  2. 运行时 `userType === 'ant' | 'external'`
  3. GrowthBook-like `getFeatureValue_CACHED_MAY_BE_STALE(key, default)`
- **50+ 编译开关**(v2 雏形,v3 完整 50+):
  ```
  TRADING / COORDINATOR_MODE / KAIROS / KAIROS_BRIEF / KAIROS_CHANNELS / KAIROS_DREAM /
  BRIDGE_MODE / DAEMON / BRIDGE_WECHAT / BRIDGE_FEISHU / BRIDGE_DINGTALK /
  COACH_MODE / DEEP_PLAN / PROACTIVE / TELEMETRY / GROWTHBOOK /
  COMMAND_MORNING_BRIEF / COMMAND_EARNINGS_PREVIEW / COMMAND_PORTFOLIO_REVIEW / ...(20+ CLI)
  ALGO_TWAP / ALGO_VWAP / ALGO_POV / ALGO_IS /
  WORKTREE_ISOLATION / TASK_RUNTIME / MONITOR_TOOL / BRIEF_TOOL /
  ULTRAPLAN / VOICE_MODE / BUDDY(skip) /
  INSTITUTIONAL_FEED / NORTH_BOUND / DRAGON_TIGER / REALTIME_EASTMONEY_PROD /
  RESEARCH_DEEP_SEARCH / MATRIX_ANALYSIS / NL_SCREENER / INTENT_ROUTING_ZH / TA_COMPAT /
  ...
  ```
- **DCE friendly pattern**(loucode 风格):
  ```ts
  export function isCoordinatorV2Enabled(): boolean {
    return true
      ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_coordinator_v2', false)
      : false
  }
  ```
- **Bun bundle filter**:`Bun.build` 根据 `feature()` 调用 const-fold 掉分支
- **实现**:升级 `src/agent/feature-gates.ts`,新建 `src/services/analytics/growthbook.ts`

---

## 四、投研 5 个核心 spec 详细设计(在 v3 中新增 / 深化)

### 4.1 投研 Coach(`coach-mode`)

```
用户首次进入 CLI:
  → Coach 自我介绍(投研 Claude,不是普通 LLM 工具)
  → 询问用户偏好(散户/活跃/私募/企业)
  → 推荐初始 watchlist(基于市场热点)
  → 询问是否启用晨会 / 盘后 / 财报日 / 政策日推送

后续会话:
  → Coach 主动引用用户历史(持仓 / 关注 / 偏好)
  → 引用源(URL + 时间戳) + 风险提示
  → 不直接给买卖建议,给"分析 + 候选 + 风险"

多渠道触达:
  → 微信(Wechat Work) / 飞书 / 钉钉 推送简报
  → 邮件(可选) / 移动端(响应式网页)
```

**实现**:`src/agent/role-system.ts` + `src/coach/{memory,morningBrief,afterHours,earningsPreview,riskDashboard,channels}.ts`

### 4.2 回测全链路(`backtest-v2`)

```
5 步:
  1. 数据:src/data/historical/{eod,intraday,fundamental,alt}.ts
  2. 策略:src/strategies/{factor,risk-parity,grid,momentum,dca,value,growth}.ts
  3. 撮合:src/tools/trading/sandbox-engine.ts(已建,扩)
  4. 归因:src/tools/portfolio/{brinson,style,sector,attribution}.ts(已建)
  5. 报告:src/multimodal/reports/{backtest,attribution,risk}.ts(已建,扩)

输出:
  - 净值曲线(PNG/HTML)
  - 夏普 / 最大回撤 / 卡玛 / 胜率
  - Brinson 归因
  - 风格 / 行业归因
  - 月度 / 年度收益分布
  - 与基准(沪深 300 / 标普 500)的对比
```

**v2 → v3 深化**:v2 已有雏形,v3 串成 5 步全链路 + 报告 + 推送。

### 4.3 交易全链路(`trading-loop`)

```
6 步:
  1. 策略:从 backtest 拿到策略
  2. 风控:仓位限额 + 行业暴露 + 集中度 + 止损
  3. 下单:algos (TWAP/VWAP/POV/IS) + broker (IBKR/雪球/华泰/东财)
  4. 确认:人工审批(默认) / 自动(配 UPUP_AUTO_TRADE=1)
  5. 监控:KAIROS 实时跟踪(异动 / 止损 / 止盈)
  6. 复盘:交易日志 + 归因 + 改进建议

关键:
  - 默认 sandbox
  - 强制风控
  - 二次确认
  - 审计日志
```

**实现**:`src/tools/trading/{pipeline,risk-gate,approval,monitor,review}.ts` + 集成现有 sandbox / algos / brokers

### 4.4 持续监控(`kairos-v2`)

```
持续运行(用户关闭 CLI 仍在后台):
  - 盘中异动扫描(每 5 分钟 / 1 分钟 / 用户配置)
  - 财报日历(财报日 T-1 / T+0 推送)
  - 政策事件(从 alt-data 订阅)
  - 行业轮动(每日)
  - 风险预警(仓位 / 集中度 / 止损)

主动推送(多渠道):
  - CLI(用户再次打开时显示)
  - 微信 / 飞书 / 钉钉
  - 邮件
  - 移动端

跨日持久:
  - Dream 整合(24h+5 会话触发)
  - 记忆库(用户偏好 / 持仓 / 关注)
  - 会话恢复
```

**实现**:升级 v2 的 8 文件到 v3 的 16 文件(见 3.2)

### 4.5 远程协同(`bridge-v2` + `multi-channel-bridge`)

```
本地 CLI ↔:
  - 网页控制台(响应式,Next.js)
  - 微信(Wechat Work / Server 酱)
  - 飞书(Lark Bot)
  - 钉钉(DingTalk Bot)
  - 移动端(响应式网页)

功能:
  - 远程发送 prompt
  - 远程审批(交易 / 工具权限)
  - 远程中断
  - 远程切换模型
  - 远程查看输出 / 报告
```

**实现**:升级 v2 的 12 文件到 34 文件 + 5 渠道(见 3.6)

---

## 五、4 个唯一差异化(讲清楚定位)

### 5.1 CLI-first Claude Code 形态

**唯一把 AI Agent 投研能力装进终端的**;对开发者 / 技术派投资人天然友好。

- **证据**:upup 是 CLI 形态(Ink + React)
- **强化**:`cli-extension` 20+ 隐藏命令 + TUI 美化 + `--bridge` 启动 Bridge

### 5.2 完全开源 + 自托管

**不锁数据、不绑 SaaS**;企业 / 合规场景刚需。

- **证据**:upup 是开源项目(MIT/Apache)
- **强化**:Docker / docker-compose 部署文档 / 自托管配置文件示例

### 5.3 A 股 + 美股 + 港股 + 加密四市场全覆盖

**全市场投研**;竞品大多只覆盖单一市场。

- **证据**:`src/tools/finance/` 18 文件(api/crypto/earnings/filings/fundamentals/insider 等)
- **强化**:`capability-manifest.ts` 加 `markets` 字段,显式分 4 market groups

### 5.4 多 Agent + KAIROS + Bridge 三件套

**对标 loucode 全部深度吸收**;在投研域独此一家。

- **证据**:v2 已建 coordinator / kairos / bridge 雏形
- **强化**:v3 升级到 loucode 深度(主从硬约束 + 6 状态机 + 34 文件)

---

## 六、Sprint 详细计划(7 sprints,2-3 月)

### Sprint 1 — 投研 Claude 主对话(1 turn,2-3 天)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **1.1 role-system** | `src/agent/role-system.ts` 投研 Claude 人设 + prompt 模板 | 1 新文件 + 1 升级(`agent.ts` 注入 prompt) | 1 turn | - |
| **1.2 coach-memory** | 跨会话记忆(用户偏好 / 持仓 / 关注 / 历史) | `src/coach/memory.ts` + 集成 KAIROS | 0.5 turn | 1.1 |
| **1.3 coach-channels** | 微信 / 飞书 / 钉钉 推送(最小骨架) | `src/coach/channels/{wechat,feishu,dingtalk}.ts` | 0.5 turn | 1.2 |
| **1.4 cli-extension-p0** | 5 个高优隐藏命令(`/morning-brief` `/earnings-preview` `/risk-dashboard` `/portfolio-review` `/watchlist-edit`) | 5 新文件 in `src/commands/` | 1 turn | 1.1 |

**目标**:投研 Coach 基本形态 + 5 个高优 CLI 命令,主对话即"投研 Claude"

### Sprint 2 — 投研 Claude Code 5 层架构(2 turn,1 周)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **2.1 manifest-5layer** | `capability-manifest.ts` 加 5 layer 字段,扩展 5 group | 1 升级 | 0.5 turn | 1.1 |
| **2.2 feature-gates-50+** | 50+ 编译开关完整化 + DCE friendly | 1 升级 + 1 新(`growthbook.ts`) | 1 turn | - |
| **2.3 cli-extension-p1** | 再加 5 个隐藏命令(`/rebalance-now` `/alert-add` `/screen` `/compare` `/doctor`) | 5 新文件 | 0.5 turn | 1.4 |
| **2.4 docs-3d** | README / 主对话 / CLI help 强化"4 个唯一"差异化 | docs/ 升级 | 0.5 turn | 2.1 |

**目标**:5 layer × 5 group 双视角 manifest + 50+ 编译开关 + 10 个隐藏命令 + 4 唯一故事讲清楚

### Sprint 3 — loucode 7 隐藏功能 → 投研 7 增强(3 turn,2 周)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **3.1 kairos-v2** | 升级 8 文件 → 16 文件(6 状态机 + Dream 整合 + 持久 cron) | 8 新 + 8 升级 | 2 turn | 2.1 |
| **3.2 bridge-v2** | 升级 12 文件 → 34 文件(RBAC/UI/Permission/Poll/Status) | 22 新 + 12 升级 | 2 turn | 2.1 |
| **3.3 coach-active** | 投研 Coach 主动模式(晨会 / 盘后 / 财报日 / 政策日) | `src/coach/{morningBrief,afterHours,earningsPreview,policy}.ts` | 1 turn | 1.2 |

**目标**:kairos-v2 + bridge-v2 + coach-active = loucode 7 大功能中 3 个深度吸收

### Sprint 4 — 投研 5 大核心 spec 深化(2 turn,1 周)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **4.1 backtest-v2** | 回测全链路(数据→策略→撮合→归因→报告) | `src/backtest/{data,strategy,engine,attribution,report}.ts` | 1.5 turn | 2.1 |
| **4.2 trading-loop** | 交易全链路(策略→风控→下单→确认→监控→复盘) | `src/trading-loop/{pipeline,risk-gate,approval,monitor,review}.ts` | 1.5 turn | 4.1 |
| **4.3 deep-plan** | 长任务深度规划(本地 5-30 分钟) | `src/deep-plan/{planner,researcher,backtest,synthesizer,reviewer}.ts` | 1 turn | 4.1 |

**目标**:回测 / 交易 / 深度规划三个核心 spec 串通

### Sprint 5 — 远程协同多渠道 + 移动端(2 turn,1 周)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **5.1 multi-channel-bridge** | 微信 / 飞书 / 钉钉 推送(完整实现) | 5 升级 + 5 测 | 1 turn | 3.2 |
| **5.2 web-console-min** | Web 控制台最小化(响应式,Bridge UI) | `web/{app,pages,api}/...` | 1.5 turn | 3.2 |
| **5.3 mobile-pwa** | 移动端 PWA(响应式,简化版) | `web/mobile/...` | 0.5 turn | 5.2 |

**目标**:Bridge 34 文件 + 多渠道推送 + 移动端

### Sprint 6 — 测试 + 评估 + 文档(1 turn,3-5 天)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **6.1 e2e-coach** | Coach 端到端 demo(用户输入 → 主对话 → 推送) | `src/evals/dataset/coach.jsonl` | 0.5 turn | 3.3 |
| **6.2 e2e-backtest-trading** | 回测 + 交易端到端 demo | `src/evals/dataset/backtest-trading.jsonl` | 0.5 turn | 4.2 |
| **6.3 docs-final** | 完整文档:主 README / 投研 Claude Code 使用手册 / 部署 / 推送渠道配置 | docs/ 完整 | 0.5 turn | 5.3 |
| **6.4 regression** | v2 96 spec 基线 + v3 新 spec 全量测试 + typecheck | CI 配置 | 0.5 turn | - |

**目标**:全量测试 + 端到端 demo + 完整文档

### Sprint 7 — 发布 + 商业化预备(0.5 turn,1-2 天)

| 子 Sprint | 内容 | 文件 | 估算 | 依赖 |
|----------|------|------|------|------|
| **7.1 release** | 版本号 bump(2026.6.4 → 2026.6.X)+ tag + GitHub release | `package.json` + `scripts/release.sh` | 0.25 turn | 6.4 |
| **7.2 v3-archive** | archive v3 change → `openspec/changes/archive/top-tier-investment-claude-code/` | openspec | 0.25 turn | 7.1 |

**目标**:v3 收尾 + 发布

---

## 七、关键里程碑

| 里程碑 | 时间点 | 标志 | 价值 |
|--------|--------|------|------|
| **M1 主对话** | Sprint 1 完 | 投研 Claude 主对话 + 5 高优 CLI 命令 | 用户体验 |
| **M2 架构** | Sprint 2 完 | 5 layer × 5 group + 50+ 编译开关 + 4 唯一故事 | 架构清晰 |
| **M3 loucode 深度** | Sprint 3 完 | kairos-v2 + bridge-v2 + coach-active | 工程深度 |
| **M4 投研核心** | Sprint 4 完 | 回测 + 交易 + 深度规划 3 核心 | 投研专业 |
| **M5 远程协同** | Sprint 5 完 | Bridge 34 文件 + 多渠道 + 移动端 | 持续自主 |
| **M6 完整** | Sprint 6 完 | 测试 + 评估 + 文档 | 可发布 |
| **M7 发布** | Sprint 7 完 | 版本 + archive | 顶级助手落地 |

---

## 八、风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| v2 已落地 96 spec 测试基线退化 | 高 | 任何 v3 PR 必须 `bun test` 全绿 + `bun run typecheck` 全绿才能合 |
| 50+ 编译开关误关 | 高 | e2e 烟雾测试覆盖每个 feature 路径;`feature()` 命名加 `BUN_CONFIG_FEATURE_UPUP_` 前缀防冲突 |
| Bridge WebSocket 安全(token 泄露) | 高 | JWT 短过期 + trusted device 列表 + 所有命令走 `bridgePermissionCallbacks` |
| 投研 Coach 人设 prompt 改变 LLM 行为 | 中 | 通过 `UPUP_COACH_MODE=0` 软降级;e2e 测试对比开关前后 |
| 多渠道推送(微信/飞书/钉钉)API 差异 | 中 | 抽象 `PushChannel` 接口;每个渠道独立 adapter;不通过则跳过(不抛错) |
| 移动端 PWA 复杂度 | 中 | 简化版(响应式);不强求 Native App |
| 数据源限流(东方财富/雪球) | 高 | 多源 + 缓存 + 限流 + 熔断;走 `realtime-prod` adapter |
| 实盘交易接入风险 | 高 | 默认 sandbox + 强制风控 + 二次确认 + 审计;实盘需用户配 key |
| 监管合规(投顾牌照) | 高 | 仅作工具,不直接给买卖建议 + 免责声明 + 持仓信息加密 |
| 50+ 编译开关 bundle size | 中 | DCE friendly pattern + 懒加载 + 按需 `feature()` |
| KAIROS 持久化崩溃 | 中 | 状态定期 snapshot + 锁机制 + 进程监控 |

---

## 九、与 v2 的关系

| 维度 | v2 | v3 |
|------|----|----|
| 定位 | 广度(加 25 个新 spec) | 深度(5 layer + 7 隐藏 + 4 唯一) |
| 新 spec | 25(algo / alt-data / coordinator-v2 / ...) | 5(claude-code-5layer / coach-mode / deep-plan / cli-extension / investment-3d-positioning) |
| 深化 spec | 0 | 2(kairos-v2 / bridge-v2) |
| 时间 | 1 turn 全 proposal | 7 sprints(2-3 月)落地 |
| 输出 | proposal/design/tasks/25 specs | proposal/design/tasks/5 specs + 7 sprint 实际代码 |
| 复用 | 25 新 spec | 复用 v2 的 25 spec + v1 的 11 spec |

**v3 = v2 的 v3 增量,不重复 v2 的工作**。

---

## 十、关键文件路径(实施时)

```
openspec/changes/top-tier-investment-claude-code/
├── .openspec.yaml        (本 change 元数据)
├── .comet.yaml           (comet 状态)
├── proposal.md           (Why + What — 已写)
├── design.md             (How — 本文档)
├── specs/                (5 个新 spec)
│   ├── claude-code-5layer/
│   ├── coach-mode/
│   ├── deep-plan/
│   ├── cli-extension/
│   └── investment-3d-positioning/
├── specs-kairos-v2/      (深化 v2 spec,delta)
├── specs-bridge-v2/      (深化 v2 spec,delta)
└── tasks.md              (7 sprint 任务清单 — 待写)

src/                     (实际代码落地)
├── agent/role-system.ts  (v3 新)
├── coach/                (v3 新,6 文件)
├── deep-plan/            (v3 新,5 文件)
├── commands/             (v3 新,20+ 文件)
├── kairos/               (v3 升级 8→16 文件)
├── bridge/               (v3 升级 12→34 文件)
├── backtest/             (v3 新,5 文件)
├── trading-loop/         (v3 新,5 文件)
└── ...
```

