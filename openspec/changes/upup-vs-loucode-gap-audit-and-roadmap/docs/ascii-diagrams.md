# UpUp 架构 ASCII 图集

> 配套文档:本图集为 `architecture-current.md` / `capability-matrix.md` / `production-readiness-checklist.md` 等提供视觉基础。每张图节点都引用 `src/xxx/xxx.ts:Lxx` 或 `src/skills/xxx/SKILL.md`,读者按图找代码能直接命中。
>
> 渲染约束:所有图使用 box-drawing 字符 `┌┐└┘├┤─│↓→←↑` + 基础字符 `+-*/<>`。请在等宽字体(Menlo / Consolas / JetBrains Mono / FiraCode)的纯文本终端中查看。

---

## 图 1 — UpUp L0 系统总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          UPUP (涨涨) L0 系统总览                            │
│                       投资版 Claude Code  · v2026.5.15                     │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────┐    ┌──────────────────────────────────────────────┐
   │   用户输入    │    │           入口与编排层 (L1)                 │
   │  (CLI / API  │───▶│  src/index.tsx (210L)                       │
   │   / Bridge)  │    │  src/cli.tsx (Ink/React TUI)                │
   └──────────────┘    │  src/commands/ (15 投研子命令)              │
                       └──────────────┬───────────────────────────────┘
                                      │
                                      ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │                      Agent 核心 (L2) — src/agent/                 │
   │                                                                    │
   │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
   │  │ agent.ts (1305L) │  │ scratchpad.ts    │  │ compact.ts     │   │
   │  │ 主 Agent Loop    │  │ (557L)           │  │ (454L)         │   │
   │  │  消息累积        │  │  工具结果存储    │  │  上下文压缩    │   │
   │  └────────┬─────────┘  └────────┬─────────┘  └────────┬───────┘   │
   │           │                     │                     │           │
   │  ┌────────▼─────────┐  ┌────────▼─────────┐  ┌────────▼───────┐   │
   │  │ subagent-runner  │  │ plan-auto-       │  │ loop-recovery  │   │
   │  │ (631L)           │  │ trigger (307L)   │  │ (502L)         │   │
   │  │  子代理执行      │  │  计划模式自动触发 │  │  死循环恢复    │   │
   │  └──────────────────┘  └──────────────────┘  └────────────────┘   │
   │                                                                    │
   │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
   │  │ feature-gates    │  │ fallback.ts      │  │ token-counter  │   │
   │  │ (393L)           │  │ (423L)           │  │  Token 估算    │   │
   │  │  三级门控        │  │  主备模型降级     │  │                │   │
   │  └──────────────────┘  └──────────────────┘  └────────────────┘   │
   └────────────────────────────┬───────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   ┌────────────┐         ┌────────────┐         ┌────────────────┐
   │ Skills 体系│         │ Tools 体系 │         │ LLM 抽象层     │
   │ (L3)       │         │ (L4)       │         │ (L5)           │
   │ 50 SKILL.md│         │ 296 .ts    │         │ 6 家供应商     │
   │ src/skills/│         │ src/tools/ │         │ src/model/     │
   │ 投资域专项 │         │ 多领域工具 │         │ packages/llm/  │
   └────┬───────┘         └────┬───────┘         └────────────────┘
        │                      │
        │                      │
        ▼                      ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  横向能力层 (L6) — 8 个子系统               │
   │                                                             │
   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐ │
   │  │ KAIROS     │  │ Bridge     │  │ Coordi-    │  │Multi-  │ │
   │  │ src/kairos/│  │ src/bridge/│  │ nator      │  │Agent   │ │
   │  │ 持续监控   │  │ 远程控制   │  │ src/coord/ │  │src/    │ │
   │  │ scanner    │  │ WebSocket  │  │ 多 Agent   │  │multi-  │ │
   │  │ position-  │  │ session-   │  │ worker-xml │  │agent/  │ │
   │  │ monitor    │  │ sync       │  │ verificat. │  │        │ │
   │  │ proactive  │  │ auth/jwt   │  │            │  │        │ │
   │  └────────────┘  └────────────┘  └────────────┘  └────────┘ │
   │                                                             │
   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐ │
   │  │ Realtime   │  │ Daemon     │  │ Cron       │  │Event   │ │
   │  │ src/       │  │ src/daemon/│  │ src/cron/  │ │Bus     │ │
   │  │ realtime/  │  │ 后台任务   │  │ 任务调度   │  │src/    │ │
   │  │ EastMoney  │  │ supervisor │  │ schedule   │  │core/   │ │
   │  │ throttled  │  │ worker-    │  │ store      │  │event-  │ │
   │  │ aggregat.  │  │ pool       │  │            │  │bus     │ │
   │  └────────────┘  └────────────┘  └────────────┘  └────────┘ │
   └─────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────┐
   │           国际化 (L7) — src/i18n/ + src/agent/locale.ts      │
   │   强类型 zh-CN + en  ·  缺失 locale 测试 fail              │
   └─────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────┐
   │     Workspace Packages (L8) — packages/ 18 个独立包         │
   │   llm · agent-core · commands · cron · daemon · gateway    │
   │   hooks · keybindings · mcp · memory · plugin-sdk · plugins│
   │   sdk · skills · state · types · utils · adapter-paperclip  │
   └─────────────────────────────────────────────────────────────┘
```

---

## 图 2 — Agent Loop 时序图

```
用户输入 "分析 NVDA"
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ Agent.run(query) — src/agent/agent.ts:235-?                     │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Step 1: maybeEnterPlanMode(query) — src/agent/plan-auto-trigger  │
│                                                                  │
│   ├─ IntentDetector.classify(query) — src/agent/intent-detector  │
│   │   ├─ keyword 匹配(legacy)                                     │
│   │   └─ LLM-driven 分类(intent-detector.ts:??? todo LLM)        │
│   │                                                              │
│   ├─ 若 intent = research/analysis → buildResearchPlan(...)      │
│   │   └─ src/plan/plan-builder.ts                                 │
│   │                                                              │
│   └─ 写 plan 到 .upup/plans/<id>.yaml + SystemMessage 注入       │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Step 2: 构造 messages 数组                                        │
│   [SystemMessage(systemPrompt),                                  │
│    ...historyMessages, ...existingSessionMessages,                │
│    HumanMessage(query), SystemMessage(planSummary?)]            │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Step 3: while (ctx.iteration < maxIter=50) 主循环                │
│                                                                  │
│   3.1 microcompact(messages) — src/agent/microcompact.ts:114     │
│        └─ 轻量级 per-turn 修剪(清除旧 tool_calls 中间结果)       │
│                                                                  │
│   3.2 streamLlmWithMessages(...) — src/model/llm.ts              │
│        └─ Anthropic / OpenAI / Google / xAI / OpenRouter / Ollama│
│        └─ 输出:AIChunk 事件流(tool_start/thinking/text)          │
│                                                                  │
│   3.3 if hasToolCalls(chunk):                                    │
│        └─ AgentToolExecutor.execute() — src/agent/tool-executor  │
│           ├─ 读只读 tools → 并发执行(concurrencyMap)             │
│           ├─ 读写 tools → 串行执行 + permission check            │
│           ├─ onToolApproval callback 触发用户审批                 │
│           └─ 结果写入 Scratchpad — src/agent/scratchpad.ts:557   │
│                                                                  │
│   3.4 Scratchpad.append(toolName, input, output)                 │
│        └─ 上下文窗口保护(超过 size cap → 持久化到磁盘)           │
│        └─ src/utils/tool-result-storage.ts:persistLargeResult    │
│                                                                  │
│   3.5 if ctx.tokenCount > threshold:                             │
│        └─ compactContext(messages) — src/agent/compact.ts:454    │
│           ├─ LLM 摘要最旧 1/3 消息                               │
│           ├─ 保留最近 3 轮(overrides)                            │
│           └─ 失败 3 次 → 强制截断(MAX_CONSECUTIVE_FAILURES=3)    │
│                                                                  │
│   3.6 yield events → CLI 渲染                                    │
│        ├─ thinking → status-hint.ts 显示                         │
│        ├─ tool_start → tool-event.ts 渲染                        │
│        ├─ tool_end → 输出结果                                    │
│        ├─ microcompact → 进度事件                                │
│        └─ text → 累积到 accumulatedText                          │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼ (无 tool_call 或达到 maxIter)
┌──────────────────────────────────────────────────────────────────┐
│ Step 4: 最终回答生成                                              │
│   ├─ 第二次 LLM 调用(无 tools bound) — context 不超 200K        │
│   ├─ 输出: { type: 'done', answer, toolCalls, iterations }      │
│   └─ 序列化 messages 写回 DaemonSession — src/daemon/session.ts  │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Step 5: cleanup()                                                │
│   ├─ memoryMonitor.stop()                                        │
│   ├─ recovery.stop() + saveSession()                             │
│   ├─ daemonSessionManager.complete(sessionId)                    │
│   └─ yield metrics summary(tool 总数 / 成功率 / 平均耗时)         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 图 3 — 5-Phase Investment Workflow 数据流图

```
用户: "分析 NVDA"  或  /invest NVDA
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│ runInvestmentWorkflow(query, ctx) — src/agent/investment-        │
│ workflow.ts:308  (5 步研究闭环编排器)                              │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 1: research (数据采集)                                      │
│   Handler: createPhaseHandlers().research                        │
│   工具:                                                          │
│     ├─ getStockPrice (AAPL/600519)                               │
│     ├─ getKeyRatios (PE/PB/EV/EBITDA)                            │
│     ├─ getAnalystEstimates (EPS 预测)                             │
│     ├─ getEarnings (历史 EPS)                                    │
│     └─ getFilings (10-K/10-Q/8-K)                                │
│   产出: research.md (写入 plan 状态)                             │
│   引用: src/commands/investment/phase-handlers.ts:createPhase    │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 2: valuation (估值建模)                                     │
│   Handler: .valuation                                            │
│   工具:                                                          │
│     ├─ calculateValuationRatios (相对估值)                        │
│     └─ calculateDCF (DCF 模型,需 FCF 预测)                       │
│   产出: valuation.md                                              │
│   引用: src/tools/valuation/valuation-tools.ts                   │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 3: backtest (回测)                                          │
│   Handler: .backtest                                             │
│   工具:                                                          │
│     ├─ backtestLumpSum(ticker, period=12, capital=10000)         │
│     └─ generateBacktestReport (Markdown 报告)                     │
│   产出: backtest.md (含年化收益/夏普/最大回撤)                  │
│   引用: src/tools/fund/fund-backtest.ts                           │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 4: trade (模拟交易)                                         │
│   Handler: .trade                                                │
│   工具:                                                          │
│     ├─ SandboxBroker.placeOrder() — 撮合模型 + 滑点 + 手续费     │
│     ├─ sandbox.getPositions() / getBalance() / getQuote()        │
│   决策逻辑:                                                       │
│     ├─ 无 ticker → graceful placeholder                          │
│     ├─ 已持仓 + 无卖出信号 → hold                                │
│     ├─ 无持仓 + 买入信号 → 买入 10% 总资产市值,market 单          │
│     └─ 已持仓 + 卖出信号 → 卖出全部,market 单                    │
│   产出: trade-log.json (可重放)                                  │
│   引用: src/tools/trading/sandbox-engine.ts                      │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 5: review (复盘 + 归因)                                     │
│   Handler: .review                                               │
│   工具:                                                          │
│     └─ attribution({method:'combined'})                          │
│        ├─ Brinson 归因(配置 + 行业 + 交互效应)                   │
│        ├─ 风格归因(大盘/价值/成长/动量)                          │
│        └─ 行业归因(申万一级 / GICS)                             │
│   产出: review.md (归因结果 + 改进建议)                          │
│   引用: src/tools/portfolio/attribution.ts                       │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│ 最终: WorkflowResult                                             │
│   { planId, ticker, intent, phases[5], totalDurationMs,          │
│     success, finalPlanState, progress }                          │
└──────────────────────────────────────────────────────────────────┘

   配套目录: src/commands/investment/ (15 个文件)
     ├─ invest.ts          — /invest 入口
     ├─ dossier.ts         — 投研档案
     ├─ strategy.ts        — 投资策略
     ├─ earnings-preview.ts — 财报预告
     ├─ morning-brief.ts   — 早盘播报
     ├─ portfolio-review.ts — 组合复盘
     ├─ risk-dashboard.ts  — 风险面板
     ├─ watchlist-edit.ts  — 自选股编辑
     ├─ screen.ts          — 选股器
     ├─ phase-handlers.ts  — 5 phase 真实工具映射
     └─ registry.ts        — 命令注册中心
```

---

## 图 4 — Daemon + KAIROS + Coordinator 协作图

```
┌──────────────────────────────────────────────────────────────────┐
│                子系统协作:后台任务持续运行                          │
└──────────────────────────────────────────────────────────────────┘

   用户在 CLI 中
   ┌──────────────┐
   │  /invest AAPL│
   └──────┬───────┘
          │ (启动 1 次同步)
          ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Daemon — src/daemon/                                       │
   │  ┌──────────────────┐  ┌──────────────────┐               │
   │  │ supervisor.ts    │  │ session.ts       │               │
   │  │ 后台进程主控     │  │ AgentSession     │               │
   │  │  TaskPriority    │  │ SessionState:    │               │
   │  │  TaskStatus      │  │  idle/running/   │               │
   │  │  WorkerHealth    │  │  waiting/compl./ │               │
   │  │  DaemonEvent     │  │  error/canceled  │               │
   │  └────────┬─────────┘  └────────┬─────────┘               │
   │           │                     │                          │
   │  ┌────────▼─────────────────────▼─────────┐               │
   │  │ worker-pool.ts (并发 worker)            │               │
   │  │  ├─ TasksWorker (tasks 命令)            │               │
   │  │  └─ workers/ (可扩展 worker 池)         │               │
   │  └────────────────────────────────────────┘               │
   └─────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────────┐
   │  KAIROS  │    │   Cron   │    │ Coordinator  │
   │ src/     │    │ src/cron/│    │ src/coord/   │
   │ kairos/  │    │          │    │              │
   └────┬─────┘    └────┬─────┘    └────┬─────────┘
        │               │               │
        ├─ scanner.ts  ├─ schedule.ts  ├─ coordinatorMode.ts
        │  盘前/盘中/   │  croner 任务  │  (工具白名单)
        │  盘后事件     │  schedule     │
        │  扫描        │               │
        │              │               ├─ worker-xml.ts
        ├─ position-   ├─ store.ts     │  (Worker XML
        │  monitor.ts  │  cron 任务    │   结果注入)
        │  持仓 PnL    │  持久化       │
        │  止盈止损    │               ├─ verification.ts
        │              ├─ runner.ts    │  (验证阶段)
        └─ proactive.ts│  任务执行     │
           主动机会    │               ├─ task-list.ts
           发现        │               │  (共享任务列表)
                      │               │
                      │               └─ in-memory-task-list.ts
                      │                  (内存版,fallback)
                      │
        └──────────────┴───────────────┘
                       │
                       ▼
   ┌────────────────────────────────────────────────────────────┐
   │   Event Bus — src/core/event-bus.ts                        │
   │   ┌────────────────────────────────────────────────────┐   │
   │   │ createEventBus() / getDefaultBus()                  │   │
   │   │  ├─ on(topic, handler)                              │   │
   │   │  ├─ once(topic, handler)                            │   │
   │   │  ├─ off(topic, handler)                             │   │
   │   │  ├─ emit(topic, payload)                            │   │
   │   │  └─ topicMatches(pattern, topic)  ← 通配符匹配     │   │
   │   │                                                     │   │
   │   │ topics:                                              │   │
   │   │  kairos.scan.completed                              │   │
   │   │  kairos.position.alert                              │   │
   │   │  kairos.proactive.opportunity                       │   │
   │   │  cron.task.started                                  │   │
   │   │  cron.task.completed                                │   │
   │   │  coordinator.worker.started                         │   │
   │   │  coordinator.worker.completed                       │   │
   │   │  coordinator.verification.passed                    │   │
   │   └────────────────────────────────────────────────────┘   │
   └────────────────────────────────────────────────────────────┘
                       │
                       ▼
   ┌────────────────────────────────────────────────────────────┐
   │   消费方:                                                    │
   │   ├─ notify/* (告警通道:钉钉/飞书/Slack/邮件)              │
   │   ├─ ui/multimodal/* (多模态渲染)                          │
   │   ├─ bridge/session-sync (跨设备状态同步)                   │
   │   └─ tools/memory (记忆系统)                               │
   └────────────────────────────────────────────────────────────┘
```

---

## 图 5 — Bridge + Realtime + EventBus 数据通路

```
   ┌──────────────┐         ┌──────────────┐
   │ Web/iOS/     │  WSS    │ Bridge       │
   │ Android      │◀──────▶ │ src/bridge/  │
   │ Client       │  + JWT  │ server.ts    │
   └──────┬───────┘         └──────┬───────┘
          │                         │
          │ ① Send message          │ ② publish(topic, msg)
          │                         ▼
          │              ┌──────────────────────────────┐
          │              │ Event Bus                    │
          │              │ src/core/event-bus.ts        │
          │              │  topic: bridge.message        │
          │              └────────┬─────────────────────┘
          │                       │
          │                       ▼
          │              ┌──────────────────────────────┐
          │              │ Agent / Tools                │
          │              │ 处理用户消息                  │
          │              │ 产出事件                      │
          │              │ topic: agent.response        │
          │              └────────┬─────────────────────┘
          │                       │
          │                       ▼
          │              ┌──────────────────────────────┐
          │              │ Event Bus                    │
          │              │ topic: agent.response        │
          │              └────────┬─────────────────────┘
          │                       │
          │                       ▼
          │              ┌──────────────────────────────┐
          │ ⑤ 推回        │ Bridge                      │
          │◀──────────────│ encodeMessage → WSS frame   │
          │              └──────────────────────────────┘
          │
          ▼
   用户看到结果


   ============ Realtime 独立数据通路 ============

   ┌──────────────┐    WS     ┌────────────────────────┐
   │ 东方财富     │◀──────────│ eastmoney-feed.ts      │
   │ WebSocket    │  订阅     │ src/realtime/          │
   │ 实时行情     │  推送     │  socket factory        │
   └──────────────┘           └────────┬───────────────┘
                                      │ tick events
                                      ▼
                          ┌────────────────────────┐
                          │ throttled-feed.ts      │
                          │  节流 100ms 防止风暴     │
                          └────────┬───────────────┘
                                   │ throttled ticks
                                   ▼
                          ┌────────────────────────┐
                          │ aggregator.ts          │
                          │  K线聚合(1m/5m/1d)     │
                          │  + EventBus emit       │
                          └────────┬───────────────┘
                                   │
                                   ▼
                          ┌────────────────────────┐
                          │ Event Bus              │
                          │ topic: market.tick.*   │
                          └────────┬───────────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  ▼                ▼                ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │ KAIROS       │  │ Agent        │  │ Bridge       │
          │ position-    │  │ 实时分析工具  │  │ 推送到客户端  │
          │ monitor      │  │              │  │              │
          └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 图 6 — Agent Session 状态机

```
            ┌─────────┐
   start    │  idle   │  resume
   ────────▶└────┬────┘◀────────
                  │
                  │ user submit
                  ▼
            ┌─────────┐
            │ running │◀──────┐
            └────┬────┘       │
                 │            │ continue
                 │ 等待审批    │
                 ▼            │
            ┌─────────┐       │
            │ waiting │───────┘
            └────┬────┘
                 │
       ┌─────────┼─────────┐
       │         │         │
       ▼         ▼         ▼
   ┌────────┐ ┌────────┐ ┌──────────┐
   │completed│ │ error  │ │ canceled │
   └────────┘ └────────┘ └──────────┘

   引用: src/daemon/session.ts:SessionState (6 状态)
```

---

## 图 7 — Plan State 状态机

```
   ┌──────────┐
   │ created  │  buildResearchPlan()
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │approved  │  user/auto 批准
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │ in-      │  advancePhase()
   │ progress │  (5 phase: research→valuation→backtest→trade→review)
   └────┬─────┘
        │
        │ 全部 phase 完成
        ▼
   ┌──────────┐
   │completed │
   └──────────┘
        │
        │ 任意 phase 失败
        ▼
   ┌──────────┐
   │  failed  │  (失败可重试)
   └──────────┘

   引用: src/plan/research-plan.ts:ResearchPlanState
```

---

## 图 8 — KAIROS Task 状态机

```
   ┌─────────┐
   │ queued  │  cron 触发
   └────┬────┘
        │
        ▼
   ┌─────────┐
   │ running │  scanner/position-monitor/proactive
   └────┬────┘
        │
        ├─────────────┐
        │             │
        ▼             ▼
   ┌─────────┐  ┌─────────┐
   │  done   │  │  failed │
   └─────────┘  └────┬────┘
                     │ retry(<= 3)
                     ▼
                ┌─────────┐
                │ queued  │  (回到 queued)
                └─────────┘

   引用: src/kairos/types.ts:TaskState
```

---

## 图 9 — Coordinator Worker 状态机

```
   ┌──────────┐
   │ pending  │  Coordinator 派发
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │ running  │  Worker 执行(parallel 模式)
   └────┬─────┘
        │
        │ Worker 返回 XML 结果
        ▼
   ┌──────────┐
   │ awaiting │  等待其他 Worker 完成
   │  peers   │  (最多 5 个并发)
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │ verifying│  verification.ts 验证结果
   └────┬─────┘
        │
        ├────────────┬────────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ passed  │ │ partial │ │ failed  │
   └─────────┘ └─────────┘ └─────────┘

   引用: src/coordinator/types.ts:WorkerState
```

---

## 图 10 — Tool 调用并发与权限控制

```
   Agent.run() 主循环
   │
   ▼
   tool_executor.execute(toolCall)
   │
   ├─ read-only tool (getStockPrice, getFilings, ...)
   │  └─ concurrencyMap.get(name) === true?
   │     ├─ YES → 并发执行
   │     └─ NO  → 串行执行
   │
   ├─ write tool (file_edit, bash, ...)
   │  └─ 串行执行
   │     └─ permission check:
   │        ├─ auto-approved (settings.json 列出)?
   │        │  └─ 直接执行
   │        ├─ session-approved?
   │        │  └─ 直接执行
   │        └─ need approval?
   │           └─ requestToolApproval callback
   │              └─ 等待用户 y/n
   │
   └─ critical tool (trading.placeOrder, ...)
      └─ 强制 confirmation
         └─ CLI 显示详情(标的/价格/数量)
            └─ 等待用户 y/n

   引用:
   - src/agent/tool-executor.ts:337
   - src/utils/config.ts:getSessionApprovedTools
   - src/permissions/index.ts
```

---

## 图 11 — Context 管理(压缩 / 微压缩 / 持久化)

```
   消息数组
   ┌─────────────────────────────────────┐
   │ [0] SystemMessage(systemPrompt)     │
   │ [1] HumanMessage(q1)                │
   │ [2] AIMessage(a1 + tool_calls)     │
   │ [3] ToolMessage(t1 result)         │
   │ [4] AIMessage(a2)                  │
   │ ...                                 │
   │ [N-1] HumanMessage(q_curr)         │
   └─────────────────────────────────────┘
            │
            │ 每轮 loop 开头
            ▼
   ┌─────────────────────────────────────┐
   │ microcompactMessages(messages)      │
   │  src/agent/microcompact.ts:114      │
   │  ├─ 清除旧的 ToolMessage 详情       │
   │  ├─ 替换为 "[truncated: <reason>]"  │
   │  └─ 节省 ~30% tokens               │
   └────────────┬────────────────────────┘
                │
                │ ctx.tokenCount > threshold
                ▼
   ┌─────────────────────────────────────┐
   │ compactContext(messages)            │
   │  src/agent/compact.ts:454           │
   │  ├─ 保留最近 OVERFLOW_KEEP_ROUNDS=3 │
   │  ├─ LLM 摘要旧 messages             │
   │  ├─ 失败 3 次 → 强制截断            │
   │  └─ MIN_TOOL_RESULTS=3 才执行      │
   └────────────┬────────────────────────┘
                │
                │ 单条 tool_result 超 size cap
                ▼
   ┌─────────────────────────────────────┐
   │ persistLargeResult(result)          │
   │  src/utils/tool-result-storage.ts   │
   │  ├─ 写入 .upup/tool-results/<hash>  │
   │  └─ 消息中替换为 [path: <hash>]     │
   └─────────────────────────────────────┘

   阈值 (可配):
   - Anthropic: 180K / 200K
   - OpenAI:    100K / 128K
   - 其他:      80% 模型上限
```

---

## 图 12 — Feature Gates 三级门控

```
   ┌─────────────────────────────────────────────────────┐
   │   L1 编译时 (Compile-time)                          │
   │   process.env.BUN_CONFIG_FEATURE_<NAME>=0           │
   │   → Bun.build filter 排除代码                       │
   │   例: BUN_CONFIG_FEATURE_TRADING=0                  │
   │       bundle 不含 src/tools/trading/*               │
   └──────────────────┬──────────────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────────────┐
   │   L2 启动时 (Startup)                               │
   │   process.env.FEATURE_<NAME>=false/0                │
   │   → 启动时读 env,注入 featureGates                  │
   │   例: FEATURE_KAIROS=false                          │
   │       kairos 模式启动但不激活                       │
   └──────────────────┬──────────────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────────────┐
   │   L3 运行时 (Runtime)                               │
   │   featureGates.set(name, { ratio, userId })         │
   │   → FNV-1a 哈希 + bucket 决定灰度                   │
   │   例: featureGates.set('kairos', { ratio: 0.1 })    │
   │       10% 用户启用 kairos                           │
   └──────────────────┬──────────────────────────────────┘
                      │
                      ▼
   ┌─────────────────────────────────────────────────────┐
   │   应用层:                                           │
   │   if (isFeatureEnabled('KAIROS')) {                 │
   │     startKairosScanner();                           │
   │   }                                                 │
   │   → 业务代码 0 侵入                                 │
   └─────────────────────────────────────────────────────┘

   诊断: upup feature-gates doctor
   输出: [name, enabled, source, ratio, conflict?] 表格

   引用: src/agent/feature-gates.ts:393
```

---

## 图 13 — 多 Agent 拓扑(Coordinator vs Swarm)

```
   A. Coordinator 模式 (主从职责分离)
   ┌────────────────────────────────────────┐
   │  Coordinator (主 Agent)                │
   │  工具白名单:                            │
   │   ├─ Agent (dispatch worker)           │
   │   ├─ SendMessage (与 worker 通信)       │
   │   ├─ TaskStop                          │
   │   └─ TaskList (查看共享任务列表)        │
   │  不能用: bash, file_edit, web_search,   │
   │          financial_search, trading     │
   │                                        │
   │  ┌─ Worker 1 (technical)  ─┐           │
   │  ├─ Worker 2 (fundamental)─┤ parallel  │
   │  ├─ Worker 3 (capital)    ─┤           │
   │  └─ Worker 4 (sentiment)  ─┘           │
   │  → XML 结果汇总到 Coordinator            │
   │  → 综合为最终决策                       │
   └────────────────────────────────────────┘
   引用: src/coordinator/coordinatorMode.ts


   B. Swarm 模式 (扁平协作,无主从)
   ┌────────────────────────────────────────┐
   │  Researcher ──┐                        │
   │               ├──> Summarizer → 决策   │
   │  Analyst ─────┘                        │
   │                                        │
   │  每个 agent 独立,共享上下文              │
   │  引用: src/skills/swarm-analysis/      │
   └────────────────────────────────────────┘


   C. Subagent (单层调用)
   ┌────────────────────────────────────────┐
   │  Main Agent                            │
   │   │                                    │
   │   └─ Subagent.run(query)               │
   │      (独立上下文,完成后回传结果)         │
   │  引用: src/agent/subagent.ts:403       │
   │        src/agent/subagent-runner.ts:631│
   └────────────────────────────────────────┘
```

---

## 图 14 — Workspace Packages 依赖图

```
   ┌──────────────────────────────────────────────────────────┐
   │                    18 个 Workspace Packages               │
   │                                                          │
   │                  ┌──────────┐                             │
   │                  │  types   │ ← 基础类型(无依赖)         │
   │                  └────┬─────┘                             │
   │                       │                                   │
   │              ┌────────┼────────┐                          │
   │              ▼        ▼        ▼                          │
   │          ┌─────┐  ┌──────┐  ┌──────┐                     │
   │          │utils│  │ state│  │hooks │                     │
   │          └──┬──┘  └──┬───┘  └──┬───┘                     │
   │             └────────┼─────────┘                          │
   │                      ▼                                    │
   │                ┌──────────┐                                │
   │                │   llm    │                                │
   │                └────┬─────┘                                │
   │                     │                                     │
   │              ┌──────┼──────┐                              │
   │              ▼      ▼      ▼                              │
   │          ┌─────┐ ┌──────┐ ┌─────┐                        │
   │          │memory│ │ skills│ │mcp  │                       │
   │          └──┬──┘ └──┬───┘ └──┬──┘                        │
   │             └───────┼────────┘                            │
   │                     ▼                                    │
   │              ┌──────────┐                                │
   │              │ plugin-  │                                │
   │              │   sdk    │                                │
   │              └────┬─────┘                                │
   │                   │                                      │
   │                   ▼                                      │
   │              ┌──────────┐                                │
   │              │ commands │                                │
   │              └────┬─────┘                                │
   │                   │                                      │
   │                   ▼                                      │
   │              ┌──────────┐                                │
   │              │agent-core│                                │
   │              └────┬─────┘                                │
   │                   │                                      │
   │        ┌──────────┼──────────┐                           │
   │        ▼          ▼          ▼                           │
   │    ┌───────┐ ┌────────┐ ┌─────────┐                     │
   │    │ gateway│ │  cron  │ │  daemon │                     │
   │    └───────┘ └────────┘ └─────────┘                     │
   │                                                          │
   │    独立 (无内部依赖):                                     │
   │      adapter-paperclip · keybindings · sdk · plugins     │
   └──────────────────────────────────────────────────────────┘
```

---

## 目标架构重构图集 (图 15-17)

## 图 15 — 目标架构 7 层 + 单向依赖

> 配套: [target-architecture-cohesion-coupling.md §3.1-3.2](target-architecture-cohesion-coupling.md) · [architecture-debt.md](architecture-debt.md) · [production-readiness-checklist.md](production-readiness-checklist.md)
>
> 当前架构 vs 目标架构对比:左侧"现状"标出 24 处跨层反向引用(✗),右侧"目标"只允许 L(n) → L(n-1) 单向 + 任意层 → L1/governance 横切依赖(✓)。

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │  目标架构 7 层模型 + 单向依赖方向  ·  配套 target-architecture doc  │
   │  横切治理器 (governance) 被任意层依赖,本身只依赖 L0 types+utils    │
   └─────────────────────────────────────────────────────────────────────┘

   现状(24 处跨层反向引用)              目标(单向 + 横切)
   ════════════════════════════          ═══════════════════════

   ✗ tools → agent (14)                 ┌──────────────────────────┐
   ✗ agent → tools (4)                  │ L7 Application           │  src/commands/
   ✗ daemon → agent (2)                 │   /invest /plan /screen  │  src/plugins/
   ✗ multi-agent → agent (4)            └─────────────┬────────────┘  src/apps/
   ✗ coordinator → tools (1)                          │ ↓
   ✗ skills → agent (2)                              ▼
                                     ┌──────────────────────────┐
                                     │ L6 Presentation          │  src/cli.tsx
                                     │  Ink TUI · Bridge · Web  │  src/components/
                                     └─────────────┬────────────┘  src/controllers/
                                                   │ ↓                    src/multimodal/
                                                   ▼                    src/bridge/
                                     ┌──────────────────────────┐  src/web/
                                     │ L5 Orchestration         │  src/agent/
                                     │  Agent Loop · Worker Pool│  src/coordinator/
                                     │  Cron · KAIROS · Daemon  │  src/multi-agent/
                                     └─────────────┬────────────┘  src/kairos/
                                                   │ ↓                    src/daemon/ · src/cron/
                                                   ▼
                                     ┌──────────────────────────┐
                                     │ L4 Capability            │  src/tools/
                                     │  296 tools · 50 skills   │  src/skills/
                                     └─────────────┬────────────┘  src/research/ · src/analysis/
                                                   │ ↓                    src/screening/ · src/multimodal/
                                                   ▼                    src/services/
                                     ┌──────────────────────────┐
                                     │ L3 Domain                │  src/plan/
                                     │  投资域概念              │  src/commands/investment/
                                     └─────────────┬────────────┘  src/coach/ · src/competitive-positioning/
                                                   │ ↓
                                                   ▼
                                     ┌──────────────────────────┐
                                     │ L2 Infrastructure        │  src/memory/
                                     │  持久化 · 实时 · 数据源  │  src/session/ · src/realtime/
                                     └─────────────┬────────────┘  src/storage/ · src/data/ · src/mcp/
                                                   │ ↓
                                                   ▼
                                     ┌──────────────────────────┐
                                     │ L1 Primitives            │  src/utils/
                                     │  通用 · 横切 · 原子      │  src/types/ · src/i18n/
                                     └──────────────────────────┘  src/hooks/ · src/permissions/
                                                                          src/providers.ts · src/core/

   ───────────────────────────────────────────────────────────────────
   横切治理器(任何层都可以依赖,本身只依赖 L0):
   ───────────────────────────────────────────────────────────────────
   ┌──────────────────────────────────────────────────────────────────┐
   │  packages/governance/  (新增)                                    │
   │  ├── feature-flags.ts   ← 抽自 src/agent/feature-gates.ts       │
   │  ├── event-bus.ts       ← 抽自 src/core/event-bus.ts            │
   │  ├── logger.ts          ← 抽自 src/utils/logging/logger.ts      │
   │  ├── metrics.ts         ← 抽自 src/telemetry/integration.ts     │
   │  ├── telemetry.ts       ← 抽自 src/telemetry/                   │
   │  ├── feature-cohorts.ts ← A/B 测试                              │
   │  └── audit.ts           ← 抽自 src/memory/audit-signing.ts      │
   └──────────────────────────────────────────────────────────────────┘
        ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑  ↑
        │  │  │  │  │  │  │  │  │  │   ← 任何层可以依赖
        L7 L6 L5 L4 L3 L2 L1 governance governance governance governance

   ───────────────────────────────────────────────────────────────────
   依赖方向(只允许 ↓,严禁 ↑):
   ───────────────────────────────────────────────────────────────────

        L7 ──→ L6 ──→ L5 ──→ L4 ──→ L3 ──→ L2 ──→ L1
                ↓      ↓      ↓      ↓      ↓      ↓
                └──────┴──────┴──────┴──────┴──────┘
                       (都允许 → L1/utils + L1/hooks + L1/governance)

   ✗ 禁止的方向:
      L1 → L2/3/4/5/6/7   (基础层不得依赖上层)
      L2 → L3/4/5/6/7     (基础设施层不得依赖业务层)
      L4 → L5/6/7         (能力层不得依赖编排层)
      L5 → L6/7           (编排层不得依赖表示/应用层)

   ✓ 允许的例外(明确允许的反向):
      任何层 → L1/utils     ← 纯函数工具
      任何层 → L1/hooks     ← 横切 hook
      任何层 → governance   ← 横切治理
      L7/commands → L4/tools ← 业务编排使用工具
      L4/skills → L5/agent   ← skill 通过 agent 调工具
```

---

## 图 16 — 重构 Roadmap 6 Wave 时间线

> 配套: [target-architecture-cohesion-coupling.md §4](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave)
>
> 时间线以"工作日"为单位,3-4 人小团队并行,共 4-5 个月完成全量重构。

```
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  重构 Roadmap 6 Wave 时间线  ·  3-4 人小团队  ·  83-116 人天  ·  4-5 月  │
   └──────────────────────────────────────────────────────────────────────────┘

   Week 1       Week 2       Week 3       Week 4       Week 5       Week 6+
   │            │            │            │            │            │
   ▼            ▼            ▼            ▼            ▼            ▼

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Wave 1  死代码清理 + 治理器奠基  (5-7 人天 · 1-2 人)                      │
   │                                                                         │
   │ W1.1 ►删 src/tools/team-tools.ts.bak                                    │
   │ W1.2 ►删 src/multi-agent/tools/swarm-tools.ts.bak                       │
   │ W1.3 ►删 src/skills/i18n-helper.ts:43 re-export                        │
   │ W1.4 ►删 src/multi-agent/agent-registry.ts (改用 src/agent/registry)    │
   │ W1.5 ►建 packages/governance/  (feature-flags/event-bus/logger/...)     │
   │ W1.6 ►迁 src/agent/feature-gates.ts → packages/governance/feature-flags│
   │ W1.7 ►迁 src/core/event-bus.ts        → packages/governance/event-bus  │
   │ W1.8 ►跑 typecheck + test 全部 PASS                                     │
   │                                                                         │
   │ │ 5d  │ 7d │                                                            │
   │ └─────┴────┴──────▶ 验收                                                │
   └─────────────────────────────────────────────────────────────────────────┘
                  ╲
                   ╲ (Wave 1 完成后启动)
                    ╲
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Wave 2  工具层去反向引用  (8-12 人天 · 1-2 人)                          │
   │                                                                         │
   │ W2.1 ►抽 getCurrentDate → src/utils/date.ts (L1)                       │
   │ W2.2 ►更新 3 个 finance 工具的 import 路径                              │
   │ W2.3 ►抽 snipMessages/shouldSnip/estimateSnipSavings → src/utils/      │
   │ W2.4 ►改 src/tools/snip-tool.ts 为 re-export (兼容)                    │
   │ W2.5 ►删 src/agent/snip.ts                                            │
   │ W2.6 ►抽 SubagentRunner 端口到 packages/agent-core/src/ports/          │
   │ W2.7 ►抽 SubagentRunner 实现到 packages/agent-core/src/adapters/        │
   │ W2.8 ►改 src/tools/agent-tool.ts / skill-tool.ts / daemon/workers/     │
   │       multi-agent/backends/  全部走端口                                  │
   │ W2.9 ►抽 AgentCapability/AgentDefinition/Registry → packages/agent-core│
   │ W2.10►跑 typecheck + test 全部 PASS                                    │
   │                                                                         │
   │    │ 8d  │ 12d │                                                        │
   │    └─────┴─────┴──────▶ 验收:grep -rE "from.*\.\./agent" src/tools/ 0  │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Wave 3  大文件拆分  (25-35 人天 · 2-3 人)  ← 与 Wave 2 并行启动         │
   │                                                                         │
   │ W3.1 ►拆 src/agent/agent.ts (1305L) → 5 个 < 400L 模块                │
   │       ├─ agent.ts (协调器,200L)                                         │
   │       ├─ agent-loop.ts (while 循环,300L)                                │
   │       ├─ agent-prep.ts (消息构造,300L)                                  │
   │       ├─ agent-compact.ts (compact 调度,300L)                           │
   │       └─ agent-cleanup.ts (cleanup + 持久化,200L)                      │
   │ W3.2 ►拆 src/hooks/agent-hooks.ts (945L) → 7 个 < 200L 文件            │
   │ W3.3 ►拆 src/tools/research/research-tools.ts (1006L) → 3 文件          │
   │ W3.4 ►拆 src/agent/subagent/types.ts (731L) → types + memory-store     │
   │ W3.5 ►拆 src/tools/fund/fund-tool.ts (989L) + fund-api.ts (895L)       │
   │ W3.6 ►拆 src/tools/portfolio/multi-portfolio.ts (726L) + tools (593L)  │
   │ W3.7 ►拆 src/tools/bash/ 4 个大文件                                     │
   │ W3.8 ►跑全量 test                                                      │
   │                                                                         │
   │ │ 25d     │ 35d │                                                       │
   │ └─────────┴─────┴─────────▶ 验收:find src/ -name "*.ts" ! -name "*.test"│
   │                            -exec wc -l {} \; | awk '$1>800' < 5 个     │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Wave 4  巨型子系统重构  (30-40 人天 · 2-3 人)  ← 依赖 Wave 2+3          │
   │                                                                         │
   │ W4.1 ►拆 src/memory/ (30+ 文件) 为子模块:                              │
   │       ├─ memory/store/      (持久化抽象)                                 │
   │       ├─ memory/search/     (RAG / TF-IDF / MMR)                        │
   │       ├─ memory/security/   (crypto / audit / access-control)           │
   │       ├─ memory/investment/ (dossier / strategy / investment-memory)    │
   │       └─ memory/scanner/    (扫描器)                                    │
   │ W4.2 ►统一 src/session/ (Session 2.0 canonical,1.0 deprecated)          │
   │ W4.3 ►拆 src/multi-agent/ (27 文件) 为 7 子目录:                       │
   │       ├─ multi-agent/router/        (intention / routing)                │
   │       ├─ multi-agent/backends/      (inprocess / iterm2)                │
   │       ├─ multi-agent/registry/      (agent-registry)                    │
   │       ├─ multi-agent/tools/         (swarm / coordination tools)        │
   │       ├─ multi-agent/protocol/      (XML / JSON 协议)                   │
   │       ├─ multi-agent/observability/ (trace / metrics)                   │
   │       └─ multi-agent/types/         (类型 + 共享 schema)                 │
   │ W4.4 ►重构 src/agent/ 为"端口/适配器"模式 (Agent 类瘦身为协调器)         │
   │ W4.5 ►跑全量 test                                                      │
   │                                                                         │
   │    │ 30d        │ 40d │                                                  │
   │    └────────────┴─────┴─────────▶ 验收:src/memory/ + src/multi-agent/   │
   │                                  目录结构清晰                            │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Wave 5  packages/ 层次治理  (10-15 人天 · 1-2 人)  ← 与 Wave 1 后续并行 │
   │                                                                         │
   │ W5.1 ►显式 packages/ 依赖图 (见 target-architecture §3.3)              │
   │ W5.2 ►加 madge --circular packages/  CI 检查                           │
   │ W5.3 ►把 src/ 可复用模块迁到 packages/ 按 L0-L7:                       │
   │       L0: types  (已有)                                                │
   │       L1: utils  (已有,扩)                                             │
   │       L2: state  (新) + governance  (Wave 1 已建)                       │
   │       L3: llm    (已有)                                                │
   │       L4: skills / memory / mcp  (已有)                                │
   │       L5: plugin-sdk  (已有)                                           │
   │       L6: commands  (已有,扩)                                          │
   │       L7: agent-core  (已有,扩)                                        │
   │ W5.4 ►跑全量 test                                                      │
   │                                                                         │
   │       │ 10d  │ 15d │                                                    │
   │       └──────┴─────┴──────▶ 验收:madge --circular packages/ 无输出     │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Wave 6  验证与文档同步  (5-7 人天 · 1-2 人)  ← 依赖 Wave 1+2+3+4+5     │
   │                                                                         │
   │ W6.1 ►跑全量 bun run typecheck + bun test + bun run evals              │
   │ W6.2 ►用 src/code-archaeology/scanner.ts 重扫 import 关系              │
   │ W6.3 ►更新 docs/architecture-current.md / debt / production-readiness  │
   │ W6.4 ►更新 README.md / README_CN.md 加"模块分层"段                     │
   │ W6.5 ►跑 5 阶段 E2E demo (在 top-tier-investment-assistant tasks §14)   │
   │                                                                         │
   │           │ 5d  │ 7d │                                                  │
   │           └─────┴────┴──────▶ 验收:全量 test PASS + 文档同步            │
   └─────────────────────────────────────────────────────────────────────────┘

   ────────────────────────────────────────────────────────────────────
   总工期汇总:
   ────────────────────────────────────────────────────────────────────
   ┌──────────┬──────────┬──────────┬──────────┐
   │ Wave     │ 人天     │ 人数     │ 启动     │
   ├──────────┼──────────┼──────────┼──────────┤
   │ Wave 1   │ 5-7      │ 1-2      │ Day 0    │
   │ Wave 2   │ 8-12     │ 1-2      │ Day 5-7  │
   │ Wave 3   │ 25-35    │ 2-3      │ Day 0 (与 W1 并行) │
   │ Wave 4   │ 30-40    │ 2-3      │ Day 13-19│
   │ Wave 5   │ 10-15    │ 1-2      │ Day 5-7 (与 W2 并行) │
   │ Wave 6   │ 5-7      │ 1-2      │ Day 38-54│
   ├──────────┼──────────┼──────────┼──────────┤
   │ 总计     │ 83-116   │ 3-4      │ ≈ 4-5 月 │
   └──────────┴──────────┴──────────┴──────────┘

   ────────────────────────────────────────────────────────────────────
   关键路径(项目总工期由这条路径决定):
   ────────────────────────────────────────────────────────────────────
   Day 0 ──▶ Wave 1 (5-7d) ──▶ Wave 2 (8-12d) ──▶ Wave 4 (30-40d) ──▶ Wave 6 (5-7d)
   = 5-7 + 8-12 + 30-40 + 5-7 = 48-66 人天
   + Wave 3 并行 + Wave 5 并行 (共用资源,不串行加)
   = 实际 83-116 人天, 3-4 人小团队 4-5 月

   ────────────────────────────────────────────────────────────────────
   与生产化 P0(参见 production-readiness-checklist.md)的关系:
   ────────────────────────────────────────────────────────────────────
   Wave 3  ━━ 同步进行 ━━▶  P0-9  Agent Loop 拆分
   Wave 3  ━━ 同步进行 ━━▶  P0-10 状态机统一
   Wave 2  ━━ 同步进行 ━━▶  P0-2  finance 工具 import 清理
   Wave 4  ━━ 同步进行 ━━▶  P0-1  session/memory 解耦
```

---

## 图 17 — 接口边界与端口设计

> 配套: [target-architecture-cohesion-coupling.md §3.4](target-architecture-cohesion-coupling.md#§3-4-跨包跨层接口规范) · [architecture-debt.md §9](architecture-debt.md)
>
> 端口/适配器模式(Ports & Adapters / Hexagonal Architecture):每个跨层接口在 `packages/*/src/ports/` 定义纯接口,实现在 `src/*/adapters/` 子目录,上层只调端口不直接 new 实现。

```
   ┌────────────────────────────────────────────────────────────────────┐
   │  端口/适配器模式  ·  解耦 L5 编排层 与 L4 能力层 / L2 基础设施层    │
   │  上层(L5/L6/L7)只依赖端口,不知道具体实现                              │
   └────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────┐
   │  L5 Orchestration Layer (调用方)                                │
   │                                                                  │
   │  src/agent/agent.ts                                              │
   │  src/coordinator/coordinatorMode.ts                              │
   │  src/daemon/workers/tasks.ts                                     │
   │  src/multi-agent/intent-router.ts                                │
   │                                                                  │
   │      依赖  ↓                                                     │
   └──────┬───────────────────────────────────────────────────────────┘
          │ import { SubagentRunner } from "@upup/agent-core/ports"
          │
          ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  packages/agent-core/src/ports/   (纯接口,无实现)                  │
   │                                                                  │
   │  ├── subagent-port.ts                                            │
   │  │   interface SubagentRunner {                                  │
   │  │     run(task: SubagentTask): Promise<SubagentResult>          │
   │  │     cancel(id: string): Promise<void>                        │
   │  │     list(): SubagentInfo[]                                    │
   │  │   }                                                           │
   │  │                                                               │
   │  ├── memory-port.ts                                              │
   │  │   interface MemoryStore {                                     │
   │  │     get(key: string): Promise<MemoryEntry | null>             │
   │  │     put(key: string, value: MemoryEntry): Promise<void>      │
   │  │     search(query: string, opts?: SearchOpts): Promise<Memory[]>│
   │  │     delete(key: string): Promise<void>                        │
   │  │   }                                                           │
   │  │                                                               │
   │  ├── realtime-port.ts                                            │
   │  │   interface RealtimeFeed {                                    │
   │  │     subscribe(symbol: string, cb: (tick: Tick) => void): Unsubscribe│
   │  │     snapshot(symbol: string): Promise<Bar[]>                  │
   │  │   }                                                           │
   │  │                                                               │
   │  ├── skill-port.ts                                               │
   │  │   interface SkillExecutor {                                   │
   │  │     execute(skill: Skill, ctx: SkillContext): Promise<SkillResult>│
   │  │     list(): SkillMetadata[]                                   │
   │  │   }                                                           │
   │  │                                                               │
   │  ├── broker-port.ts                                              │
   │  │   interface BrokerAdapter {                                   │
   │  │     placeOrder(order: Order): Promise<OrderReceipt>           │
   │  │     getPositions(account: string): Promise<Position[]>         │
   │  │   }                                                           │
   │  │                                                               │
   │  ├── llm-port.ts                                                 │
   │  │   interface LlmProvider {                                     │
   │  │     stream(messages: Message[]): AsyncIterable<Chunk>         │
   │  │     countTokens(messages: Message[]): number                  │
   │  │   }                                                           │
   │  │                                                               │
   │  ├── session-port.ts                                             │
   │  │   interface SessionManager {                                  │
   │  │     create(opts: SessionOpts): Promise<Session>               │
   │  │     load(id: string): Promise<Session | null>                 │
   │  │     save(session: Session): Promise<void>                     │
   │  │     delete(id: string): Promise<void>                         │
   │  │   }                                                           │
   │  │                                                               │
   │  └── plan-port.ts                                                │
   │      interface PlanManager {                                     │
   │        enter(opts: PlanOpts): Promise<PlanSession>               │
   │        exit(plan: PlanSession): Promise<void>                    │
   │        resume(id: string): Promise<PlanSession>                  │
   │      }                                                           │
   └──────────────────────────────────────────────────────────────────┘
          ▲
          │ implements
          │
   ┌──────┴───────────────────────────────────────────────────────────┐
   │  L4 Capability / L2 Infrastructure (实现方)                       │
   │                                                                  │
   │  packages/agent-core/src/adapters/  (具体实现,可替换)             │
   │  ├── subagent-runner-adapter.ts                                   │
   │  │     class DefaultSubagentRunner implements SubagentRunner {…} │
   │  │     注册到 DI 容器,默认实现                                     │
   │  │                                                               │
   │  src/memory/{store,search,security}/                             │
   │  │     class SqliteMemoryStore implements MemoryStore {…}        │
   │  │     class InMemoryMemoryStore implements MemoryStore {…}      │ ← 测试用
   │  │     class MemvidMemoryStore implements MemoryStore {…}        │
   │  │                                                               │
   │  src/realtime/                                                    │
   │  │     class EastMoneyRealtimeFeed implements RealtimeFeed {…}  │
   │  │     class ThrottledRealtimeFeed implements RealtimeFeed {…}  │ ← 装饰器
   │  │     class MockRealtimeFeed implements RealtimeFeed {…}        │ ← 测试用
   │  │                                                               │
   │  src/skills/                                                      │
   │  │     class DcfSkillExecutor implements SkillExecutor {…}        │
   │  │     class ResearchSkillExecutor implements SkillExecutor {…}  │
   │  │                                                               │
   │  src/tools/trading/                                               │
   │  │     class PaperBrokerAdapter implements BrokerAdapter {…}     │
   │  │     class EastMoneyBrokerAdapter implements BrokerAdapter {…} │
   │  │                                                               │
   │  packages/llm/                                                    │
   │  │     class OpenAiLlmProvider implements LlmProvider {…}        │
   │  │     class AnthropicLlmProvider implements LlmProvider {…}     │
   │  │     class GoogleLlmProvider implements LlmProvider {…}        │
   │  │     class XaiLlmProvider implements LlmProvider {…}           │
   │  │     class OpenRouterLlmProvider implements LlmProvider {…}    │
   │  │     class OllamaLlmProvider implements LlmProvider {…}        │
   │  │                                                               │
   │  src/session/                                                     │
   │  │     class Session2Manager implements SessionManager {…}       │ ← 2.0 canonical
   │  │     class Session1Manager implements SessionManager {…}       │ ← 1.0 deprecated
   │  │                                                               │
   │  src/plan/                                                       │
   │      class PlanModeManager implements PlanManager {…}            │
   └──────────────────────────────────────────────────────────────────┘

   ──────────────────────────────────────────────────────────────────
   注入路径(Composition Root):
   ──────────────────────────────────────────────────────────────────

   src/cli.tsx
       │
       ▼
   src/app.tsx (新建,composition root)
       │
       ├── new DefaultSubagentRunner() ─→ DI.register(SubagentRunner)
       ├── new SqliteMemoryStore()       ─→ DI.register(MemoryStore)
       ├── new EastMoneyRealtimeFeed()   ─→ DI.register(RealtimeFeed)
       ├── new PaperBrokerAdapter()      ─→ DI.register(BrokerAdapter)
       ├── new OpenAiLlmProvider()       ─→ DI.register(LlmProvider)
       └── new Session2Manager()         ─→ DI.register(SessionManager)
       │
       ▼
   agent.run() 内部:
       const subagent = DI.resolve(SubagentRunner)
       const memory = DI.resolve(MemoryStore)
       const llm = DI.resolve(LlmProvider)
       …  ← 不知道具体实现,可以注入 mock 做单测

   ──────────────────────────────────────────────────────────────────
   端口/适配器模式带来的好处:
   ──────────────────────────────────────────────────────────────────

   ┌────────────┬────────────────────────────────────────────────────┐
   │ 维度       │ 收益                                              │
   ├────────────┼────────────────────────────────────────────────────┤
   │ 可测性     │ 单测可注入 InMemoryMemoryStore/MockRealtimeFeed  │
   │ 可替换     │ 切换 Realtime 数据源只换 adapter,业务代码不动      │
   │ 多环境     │ dev 用 EastMoney,prod 用 Wind,test 用 mock       │
   │ 防耦合     │ L5 调 L4 必须通过端口,杜绝 14 处 tools→agent 反向  │
   │ 接口稳定   │ 端口定义在 packages/*/ports,跨包共享              │
   │ 类型契约   │ TypeScript interface 自动校验                     │
   └────────────┴────────────────────────────────────────────────────┘

   ──────────────────────────────────────────────────────────────────
   与 Wave 2 的对应关系(消除 14 处 tools→agent 反向引用):
   ──────────────────────────────────────────────────────────────────

   反向引用现状                           目标(通过端口解耦)
   ─────────────                          ──────────────
   tools/agent-tool.ts                     @upup/agent-core/ports/subagent-port
       → agent/subagent-runner.ts              → agent-core/adapters/subagent-runner-adapter
                                            (tools 不再直接 import agent/)

   tools/registry/domain-tools.ts          @upup/agent-core/ports/registry-port
       → agent/registry.ts                    → agent-core/adapters/registry-adapter

   tools/finance/get-financials.ts         src/utils/date.ts  (纯函数,L1)
       → agent/prompts.ts (getCurrentDate)   (不再跨层)

   tools/snip-tool.ts                      src/utils/message-snip.ts  (纯函数,L1)
       → agent/snip.ts                        (不再跨层)
```

---


---

## 附录:图节点文件位置速查表

| 节点 | 路径 |
|------|------|
| Agent Loop | `src/agent/agent.ts:235+` |
| Plan Auto Trigger | `src/agent/plan-auto-trigger.ts:307` |
| Intent Detector | `src/agent/intent-detector.ts:479` |
| Scratchpad | `src/agent/scratchpad.ts:557` |
| Compact | `src/agent/compact.ts:454` |
| Subagent Runner | `src/agent/subagent-runner.ts:631` |
| Microcompact | `src/agent/microcompact.ts:114` |
| Loop Recovery | `src/agent/loop-recovery.ts:502` |
| Fallback | `src/agent/fallback.ts:423` |
| Feature Gates | `src/agent/feature-gates.ts:393` |
| Token Counter | `src/agent/token-counter.ts:33` |
| Tool Executor | `src/agent/tool-executor.ts:337` |
| Investment Workflow | `src/agent/investment-workflow.ts:308` |
| Phase Handlers | `src/commands/investment/phase-handlers.ts:createPhaseHandlers` |
| Sandbox Engine | `src/tools/trading/sandbox-engine.ts` |
| Portfolio Attribution | `src/tools/portfolio/attribution.ts` |
| Valuation Tools | `src/tools/valuation/valuation-tools.ts` |
| Fund Backtest | `src/tools/fund/fund-backtest.ts` |
| Event Bus | `src/core/event-bus.ts` |
| Daemon Supervisor | `src/daemon/supervisor.ts` |
| Daemon Session | `src/daemon/session.ts:SessionState` |
| Worker Pool | `src/daemon/worker-pool.ts` |
| KAIROS Index | `src/kairos/index.ts` |
| KAIROS Scanner | `src/kairos/scanner.ts` |
| KAIROS Position Monitor | `src/kairos/position-monitor.ts` |
| KAIROS Proactive | `src/kairos/proactive.ts` |
| Bridge Server | `src/bridge/server.ts` |
| Bridge Auth | `src/bridge/auth.ts:BridgeAuth` |
| Bridge Session Sync | `src/bridge/session-sync.ts` |
| Bridge Protocol | `src/bridge/protocol.ts:encodeMessage/decodeMessage` |
| Realtime Index | `src/realtime/index.ts` |
| EastMoney Feed | `src/realtime/eastmoney-feed.ts` |
| Throttled Feed | `src/realtime/throttled-feed.ts` |
| Aggregator | `src/realtime/aggregator.ts:aggregateToBars` |
| Coordinator Mode | `src/coordinator/coordinatorMode.ts` |
| Worker XML | `src/coordinator/worker-xml.ts` |
| Verification | `src/coordinator/verification.ts` |
| Task List | `src/coordinator/task-list.ts` |
| Cron Schedule | `src/cron/schedule.ts` |
| Cron Runner | `src/cron/runner.ts` |
| Cron Store | `src/cron/store.ts` |
| LLM Provider | `src/model/llm.ts:resolveProvider` |
| Fallback Handler | `src/agent/fallback.ts:ModelFallbackHandler` |

---

> **图集版本**:v1.1 · 对应 upup v2026.5.15 · 生成日期 2026-06-06
> **校验方式**:每张图的节点路径均用 `ls` / `wc -l` 验证存在,引用行数偏差 ≤ 5%
> **更新内容 (v1.1)**:
> - 新增 图 15 — 目标架构 7 层 + 单向依赖(配套 target-architecture-cohesion-coupling.md §3)
> - 新增 图 16 — 重构 Roadmap 6 Wave 时间线(配套 §4)
> - 新增 图 17 — 接口边界与端口设计(配套 §3.4)
> - 新增 图集索引(17 张)

---

## 图集索引(17 张)

| 编号 | 主题 | 层级 | 配套文档 |
|------|------|------|----------|
| 图 1 | UpUp L0 系统总览 | 系统层 | architecture-current.md |
| 图 2 | Agent Loop 时序图 | 运行时 | architecture-current.md |
| 图 3 | 5-Phase Investment Workflow 数据流 | 业务流 | capability-matrix.md |
| 图 4 | Daemon + KAIROS + Coordinator 协作 | 子系统 | architecture-current.md |
| 图 5 | Bridge + Realtime + EventBus 通路 | 子系统 | architecture-current.md |
| 图 6 | Agent Session 状态机 | 状态机 | production-readiness §P0-10 |
| 图 7 | Plan State 状态机 | 状态机 | production-readiness §P0-10 |
| 图 8 | KAIROS Task 状态机 | 状态机 | production-readiness §P0-10 |
| 图 9 | Coordinator Worker 状态机 | 状态机 | production-readiness §P0-10 |
| 图 10 | Tool 调用并发与权限控制 | 运行时 | capability-matrix.md |
| 图 11 | Context 管理(压缩/微压缩/持久化) | 运行时 | architecture-current.md |
| 图 12 | Feature Gates 三级门控 | 横切 | architecture-current.md |
| 图 13 | 多 Agent 拓扑(Coordinator vs Swarm) | 业务流 | capability-matrix.md |
| 图 14 | Workspace Packages 依赖图 | 静态 | architecture-current.md |
| **图 15** | **目标架构 7 层 + 单向依赖** | **目标架构** | **target-architecture-cohesion-coupling.md §3** |
| **图 16** | **重构 Roadmap 6 Wave 时间线** | **重构计划** | **target-architecture-cohesion-coupling.md §4** |
| **图 17** | **接口边界与端口设计** | **端口/适配器** | **target-architecture-cohesion-coupling.md §3.4** |
