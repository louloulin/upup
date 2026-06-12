## ADDED Requirements

### Requirement: 系统总览 ASCII 架构图
变更 MUST 在 `docs/architecture-current.md` 中提供一张 ASCII 系统总览图,展示 8 个子系统(Agent Core / Skills / Tools / KAIROS / Bridge / Coordinator / Realtime / Daemon)+ i18n + 18 个 workspace packages 的边界和调用方向,每个节点引用具体 `src/xxx/xxx.ts` 文件路径。

#### Scenario: 新人凭图能命中代码
- **WHEN** 读者按 ASCII 图上的"Agent Core"节点,跳到对应 `src/agent/agent.ts`
- **THEN** 文件确实存在,功能描述与图中标注一致

#### Scenario: ASCII 图纯文本可读
- **WHEN** 文档在纯文本终端(macOS Terminal / iTerm)打开
- **THEN** ASCII 图字符对齐正确,无乱码,无半边框

### Requirement: Agent Loop 时序图
变更 MUST 在 `docs/architecture-current.md` 中提供一张 Agent Loop ASCII 时序图,展示从用户输入 → IntentDetect → PlanMode 触发 → Scratchpad 累积 → Tool Executor 并发 → Compact 阈值 → Final Answer 生成的完整时序。

#### Scenario: 完整跑通一遍
- **WHEN** 读者按图中标注顺序读 `src/agent/agent.ts:1305`、`src/agent/scratchpad.ts:557`、`src/agent/compact.ts:454`、`src/agent/tool-executor.ts:337`
- **THEN** 4 个文件的公开方法签名与图中的箭头方向一致

#### Scenario: PlanMode 自动触发标注
- **WHEN** 图标注"plan-auto-trigger"
- **THEN** 节点指向 `src/agent/plan-auto-trigger.ts:307`,文件存在且导出 `maybeEnterPlanMode` 函数

### Requirement: 5-Phase Investment Workflow 数据流图
变更 MUST 在 `docs/architecture-current.md` 中提供一张 ASCII 数据流图,展示 research → valuation → backtest → trade → review 5 个 phase 的数据来源、阶段产出、状态持久化路径。

#### Scenario: 5 个 phase handler 命中
- **WHEN** 图中标注每个 phase handler
- **THEN** 引用 `src/commands/investment/phase-handlers.ts:createPhaseHandlers` 的具体行号

#### Scenario: SandboxBroker 真实接入
- **WHEN** 图标注"trade phase → sandbox-engine"
- **THEN** 引用 `src/tools/trading/sandbox-engine.ts`,文件存在

### Requirement: Daemon + KAIROS + Coordinator 协作图
变更 MUST 在 `docs/architecture-current.md` 中提供一张 ASCII 协作图,展示 Session Manager / Cron Runner / KAIROS Scanner / Coordinator Worker Pool 之间的消息通路、状态共享、生命周期管理。

#### Scenario: 4 个子系统边界清晰
- **WHEN** 图中标注 Daemon / KAIROS / Coordinator / Cron
- **THEN** 4 个节点分别引用 `src/daemon/`、`src/kairos/`、`src/coordinator/`、`src/cron/`,路径真实存在

#### Scenario: 状态共享标注 Event Bus
- **WHEN** 图中标注子系统间状态共享
- **THEN** 引用 `src/core/event-bus.ts`,文件存在且提供 `on/once/off/emit` API

### Requirement: Bridge + Realtime + EventBus 数据通路图
变更 MUST 在 `docs/architecture-current.md` 中提供一张 ASCII 数据通路图,展示 WebSocket Server (Bridge) 接收外部客户端消息 → Event Bus 路由 → Realtime Feed 订阅东方财富 WebSocket → Event Bus 广播 → Bridge 推回客户端的完整链路。

#### Scenario: 5 个节点真实存在
- **WHEN** 图中标注 Bridge / Realtime / EventBus / EastMoney Feed / WebSocket Client
- **THEN** 分别引用 `src/bridge/server.ts`、`src/realtime/index.ts`、`src/core/event-bus.ts`、`src/realtime/eastmoney-feed.ts`、`src/bridge/protocol.ts`

#### Scenario: Token 鉴权 + 速率限制标注
- **WHEN** 图中标注"WebSocket Auth"
- **THEN** 引用 `src/bridge/auth.ts` 和 `src/bridge/jwtUtils.ts`,文件存在

### Requirement: 4 套状态机图
变更 MUST 在 `docs/architecture-current.md` 中提供 4 张 ASCII 状态机图(Agent Session / Plan / KAIROS Task / Coordinator Task),每张图标注状态名 + 转移触发器 + 持久化路径。

#### Scenario: 4 张图都存在
- **WHEN** 读者按编号查找图 6/7/8/9
- **THEN** 4 张图都可在 `docs/architecture-current.md` 内定位

#### Scenario: Session 状态与 daemon 对齐
- **WHEN** 图中标注"SessionState.running → completed"
- **THEN** 引用 `src/daemon/session.ts:SessionState` 类型定义,5 个状态名一致
