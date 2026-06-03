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

v1 没有 Bridge;v2 加 src/bridge/ 子系统,34 个文件:
- `bridgeServer.ts` WebSocket server(Bun 内置 `Bun.serve({ websocket })`)
- `bridgeProtocol.ts` 消息协议(chat / approval / output / status / 4 类)
- `bridgeAuth.ts` token 鉴权(JWT,本地生成 + 远端 CCR 二选一)
- `bridgeSession.ts` 远端 session 接入
- `bridgeConfig.ts` + `envLessBridgeConfig.ts` 双模式(本地 / 远端)
- `bridgeMessaging.ts` + `inboundMessages.ts` + `inboundAttachments.ts` 消息流
- `bridgeUI.ts` + `bridgeStatusUtil.ts` UI 与状态
- `bridgePermissionCallbacks.ts` 权限审批回调
- `peerSessions.ts` + `sessionIdCompat.ts` session 兼容
- `pollConfig.ts` + `pollConfigDefaults.ts` 轮询
- `replBridge.ts` + `replBridgeHandle.ts` + `replBridgeTransport.ts` REPL 桥
- `initReplBridge.ts` 初始化
- `workSecret.ts` 工作密钥
- `trustedDevice.ts` 可信设备
- `capacityWake.ts` 容量唤醒
- `flushGate.ts` 刷新门控
- `jwtUtils.ts` JWT 工具
- `webhookSanitizer.ts` webhook 清理
- `debugUtils.ts` + `bridgeDebug.ts` 调试
- `bridgePointer.ts` 指针
- `bridgeMain.ts` 主入口(2999 行参考模板)
- `bridgeApi.ts` API
- `bridgeEnabled.ts` 启用检查
- `codeSessionApi.ts` code session API
- `createSession.ts` 创建 session
- `sessionRunner.ts` session 运行
- `remoteBridgeCore.ts` 远端核心
- `types.ts` 类型
- **理由**:远程协同是顶级助手的标志(参考 loucode 完整 bridge 体系 + Claude.ai Remote Control)
- **替代方案**:SSH 反向 tunnel(否决,UX 差);仅 REST API(否决,无实时推送)

### D5. Proactive 6 状态机(参考 loucode `proactive/`)

v1 kairos 有 scanner/position-monitor 但缺状态机;v2 加:
- **6 状态**:`active` / `paused` / `contextBlocked` / `nextTickAt` / `listeners` / `source`
- **API**:`activateProactive(source)` / `deactivateProactive()` / `pauseProactive()` / `resumeProactive()` / `setContextBlocked(v)` / `setNextTickAt(t)` / `getNextTickAt()` / `subscribeToProactiveChanges(listener)` / `isProactiveActive()` / `isProactivePaused()` / `isProactiveContextBlocked()`
- **AutonomyMode**:`resolveAutonomyMode({ assistantEnabled, proactiveFlag, proactiveEnv })` 解析双标志
- **理由**:无人交互时主动找机会需要清晰状态机,避免"什么时候该主动"的混乱
- **替代方案**:简单 boolean(否决,无法表达 pause/blocked);事件总线扩展(否决,职责不清)

### D6. Task Runtime 6 类抽象

参考 loucode `tasks/`:
- **LocalAgentTask**:本地 Agent 子任务(Coordinator 派工)
- **LocalShellTask**:本地 shell 命令
- **LocalWorkflowTask**:本地工作流(多步骤)
- **LocalMainSessionTask**:本地主 session
- **MonitorMcpTask**:MCP 监控任务
- **RemoteAgentTask**:远端 Agent(CCR)
- **InProcessTeammateTask**:进程内队友(Coordinator worker)
- **DreamTask**:后台 dream 任务(类似睡眠周期)
- **stopTask** + **types.ts** + **pillLabel.ts** 通用工具
- **理由**:任务类型多,统一抽象避免 KAIROS / Coordinator / 旧 cron 各自实现
- **替代方案**:不抽象,各自实现(否决,重复);只抽象 2-3 类(否决,不全)

### D7. Worktree 隔离:Agent 任务跑独立 worktree

参考 loucode `bridgeMain.ts` 的 `createAgentWorktree/removeAgentWorktree`:
- 每个 Worker 任务在独立 git worktree 跑
- 任务结束自动 merge 或 discard
- dirty state 不污染主分支
- **理由**:Worker 跑回测 / 写代码 / 改文件,主分支工作树应保持干净
- **替代方案**:不隔离(否决,Worker 改主分支危险);Docker 容器(否决,Bun 不友好)

### D8. Trading Algos:从单一 TWAP/VWAP 到 4 种

- **TWAP**:时间加权平均价格(均匀时间拆单)
- **VWAP**:成交量加权(按历史量分布)
- **POV**:参与率(Percent of Volume,跟市场量联动)
- **IS**:Implementation Shortfall(目标价偏离最小化)
- **通用 runner**:`algos/runner.ts` 抽象 parent order → child orders → 提交 sandbox
- **理由**:v1 只规划了 TWAP/VWAP,v2 加 POV/IS 覆盖机构需求
- **替代方案**:只做 TWAP(否决,机构不会用);用开源 algo 库(否决,Bun 生态弱)

### D9. Alt-Data:5 路 Adapter 统一接口

```
AltDataAdapter {
  fetch(symbols: string[], dateRange): Promise<RawEvent[]>
  normalize(raw: RawEvent): NormalizedEvent
  source: 'cls' | 'xinhua' | 'xueqiu' | 'x' | 'dragon-tiger' | 'north-bound' | 'reports' | 'choice'
}
```
- `news.ts`:财联社 + 新华财经
- `reports.ts`:慧博 + Choice
- `social.ts`:雪球 + X(Twitter)
- `dragon-tiger.ts`:龙虎榜 + 大宗交易
- `north-bound.ts`:北向资金 + 融资融券
- 统一 `normalized: { title, source, url, publishedAt, symbols[], sentiment, raw }`
- **理由**:另类数据源多,统一接口避免每源一个 tool
- **替代方案**:每源一个 tool(否决,tool 爆炸);不统一,只 fetch(否决,下游消费难)

### D10. Portfolio Attribution:3-factor Brinson + 风格 + 行业

- **Brinson 3-factor**:配置效应 + 选股效应 + 交互效应
- **风格归因**:大盘/价值/成长/动量(Barra 风格因子)
- **行业归因**:申万一级 / GICS
- 加和验证:Σ(配置 + 选股 + 交互) = 组合收益 - 基准收益
- **理由**:机构归因标配,3-factor 起步可扩展
- **替代方案**:只做 Brinson(否决,不全);只做行业(否决,粒度粗)

### D11. Telemetry:结构化事件埋点

- `telemetry/events.ts`:`ToolCallEvent` / `DecisionEvent` / `FeatureGateEvent` / `ErrorEvent` / `LatencyEvent`
- `telemetry/sink.ts`:本地 JSONL + 可选远程(CCR / 自建)
- `telemetry/anonymizer.ts`:脱敏(API key / 持仓 / 资金)
- **理由**:v1 缺埋点,无法做 A-B 实验 / 准确率评估 / 灰度观察
- **替代方案**:console.log(否决,不可查询);第三方 SDK(否决,锁定)

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| v1 已落地 spec 回归测试失败 | 跑 `bun test` 全量基线;任何 v2 PR 必须全绿才能合 |
| `feature()` 编译开关配错导致 bundle 缺代码 | `bun run build:compile` + e2e 烟雾测试覆盖每个 feature 路径 |
| Bridge WebSocket 安全(token 泄露 / 越权) | JWT 短过期 + trusted device 列表 + 所有命令走 bridgePermissionCallbacks |
| Coordinator v2 主 Agent 工具白名单太严导致 workflow 卡死 | `featureGates.isCoordinatorV2Enabled()` 软降级到 v1 模式 |
| Telemetry 数据量爆炸 | 本地 JSONL 滚动 7 天;远程 sink 可关闭 |
| Alt-Data 5 路 Adapter 部分源无 API key | 写"未配置则跳过" pattern,adapters 是 lazy-load |
| Portfolio Attribution 数据需持仓历史 | 复用 v1 `multi-portfolio.ts` 持仓记录;若空则 mock 数据演示 |
| Worktree 隔离在 Windows 兼容差 | 用 `git worktree add` 原生 API;Windows CI 用 git-for-windows 验证 |
| 50+ 编译开关命名冲突 | 统一前缀 `BUN_CONFIG_FEATURE_UPUP_*` 避免与 loucode 同名冲突 |
| Proactive 状态机并发安全 | 用 EventEmitter 单例 + listener Set 模式(参考 loucode `proactive/index.ts`) |

## Migration Plan

1. **Phase 1(本 turn)**:写完 proposal / design / tasks 三件套,用户确认
2. **Phase 2 (comet-design)**:对每个 spec 写完整 requirements + scenarios,落 `openspec/changes/<name>/specs/<capability>/spec.md`
3. **Phase 3 (comet-build)**:
   - **Sprint 1 (1 turn)**:5 个 v1 收尾 spec 落地(algo / alt-data / bridge / attribution / session-sync)
   - **Sprint 2 (2 turn)**:4 个 v2 P2 升级(coordinator-v2 / feature-gates-v2 / bridge-v2 / kairos-proactive)
   - **Sprint 3 (1 turn)**:6 个任务运行时 + 监控 + 简报(proactive-mode / task-runtime / worktree-isolation / plan-mode-v2 / monitor-task / brief-tool)
   - **Sprint 4 (1 turn)**:telemetry + 10 个 competitor 对标
4. **Phase 4 (comet-verify)**:全量 `bun test` + `bun run typecheck` + 端到端 smoke(模拟"分析 600519 → 决策 → sandbox 撮合 → 报告"全链路)
5. **Phase 5 (comet-archive)**:合并 `top-tier-investment-assistant-v2` spec 到 main spec 库

**Rollback 策略**:
- 任意 v2 feature 通过 `featureGates.isV2Enabled()` 关闭即可
- 不删 v1 代码,v2 通过 `legacy.ts` 兼容层保留旧 API
- 编译开关在 `Bun.build` 阶段,误关一个 feature 整段代码消失,需 e2e 烟雾测试覆盖

## Open Questions

1. **Bridge 客户端形态**:网页优先(React/Next.js)还是先只做 CLI 端的 `--bridge` flag?建议先做 CLI flag,网页客户端 Phase 4 验证时再做(降低 v2 scope 爆炸风险)
2. **Telemetion 远端 sink**:接 CCR(类 Claude.ai)还是自建(Next.js + PostgreSQL)?建议先本地 JSONL,远端 sink 等 Phase 4 评估
3. **Proactive 默认频率**:盘前 5 分钟扫一次?还是每分钟?需用户反馈调优
4. **Worktree 命名规范**:`upup-agent-<task-id>` 还是 `upup-<worker-type>-<timestamp>`?建议前者
5. **Alt-Data 优先级**:5 路一起做还是先做 dragon-tiger(数据最稳)+ north-bound(雪球易得)?建议先做这 2 路
6. **Telemetry 脱敏粒度**:symbol 保留 / 数量 hash / 资金完全脱敏?需用户隐私偏好
7. **Plan-mode-v2 与现有 `/plan` 命令关系**:共存还是替换?建议共存(`/plan-v2` 显式启用,默认 `/plan` 走 v1)
8. **50+ 编译开关清单**:本 change 给出 framework + 10 个示例,完整 50+ 在 Phase 2 落地时再列
9. **TradingAgents 兼容层**:完全兼容其 4 路 Agent 协议?还是只借鉴思想?建议只借鉴,避免锁定
10. **Heimat 对标(国外)Hebbia / 国内 问财 哪个优先**:Hebbia matrix 更工程化,问财 nl-routing 更易做;建议先 Hebbia
