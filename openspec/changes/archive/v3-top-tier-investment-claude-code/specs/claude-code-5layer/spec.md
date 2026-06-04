# Spec: 投研 Claude Code 5 层架构 (claude-code-5layer)

## Purpose

把 upup 重塑为 5 层投研 Claude Code 顶层架构,作为 v3 的"骨架"。每层职责清晰、跨层协议明确,投研域各组件可被定位到具体 layer。该 spec 是 v3 全部 spec 的"分层参考",不引入新功能,只规定分层与跨层协议。

## Requirements

### REQ-1: 5 层定义

The system SHALL be organized into 5 layers from bottom to top:

- **L1 基础循环**(Base Loop):`src/agent/agent.ts` 主循环 + scratchpad + context + compaction
- **L2 工具 + 技能**(Tools + Skills):`src/tools/` + `src/skills/` + Hooks + MCP
- **L3 多 Agent 编排**(Multi-Agent):`src/coordinator/` + `src/subagent/` + `src/tasks/`
- **L4 远程协同**(Remote Collaboration):`src/bridge/` + `src/session/`
- **L5 持续自主**(Persistent Autonomy):`src/kairos/` + `src/proactive/` + `src/telemetry/` + `src/coach/`

### REQ-2: 跨层协议

The system SHALL define the following cross-layer protocols:

- **L1 → L2**:Tool registry + skill registry (`src/tools/registry/` + `src/skills/registry.ts`)
- **L2 → L3**:Worker XML 注入协议 `<task-notification>`
- **L3 → L4**:Bridge transport v1/v2 (`src/bridge/{repl,remote}-bridge.ts`)
- **L4 → L5**:EventBus 跨设备 (`src/core/event-bus.ts`)
- **L1 ↔ L5**:Telemetry 全链路埋点 (`src/telemetry/{events,sink}.ts`)
- **L1 ↔ Coach**:System prompt 注入 (`src/agent/role-system.ts`)

### REQ-3: 双视角 manifest

The capability manifest (`src/agent/capability-manifest.ts`) SHALL expose both:

- **5 group 视角**(v2):`realtime` / `coordinator` / `kairos` / `trading` / `portfolio`
- **5 layer 视角**(v3):`L1` / `L2` / `L3` / `L4` / `L5`

Each CapabilityGroup MUST have a `layer` field (one of L1..L5), with default fallback to v2 derivation if missing.

### REQ-4: 编译开关

Each layer's components SHALL be gated by `feature('BUN_CONFIG_FEATURE_UPUP_LAYER_X')`:

- `BUN_CONFIG_FEATURE_UPUP_LAYER_1` (always on)
- `BUN_CONFIG_FEATURE_UPUP_LAYER_2` (always on)
- `BUN_CONFIG_FEATURE_UPUP_LAYER_3` (gates Coordinator V2)
- `BUN_CONFIG_FEATURE_UPUP_LAYER_4` (gates Bridge)
- `BUN_CONFIG_FEATURE_UPUP_LAYER_5` (gates KAIROS + Proactive)

### REQ-5: 测试覆盖

The system MUST have unit tests verifying:

- 每个 layer 至少 1 个 tool 标到正确的 layer
- 双视角 manifest 解析正确(v2 字段 + v3 字段向后兼容)
- 编译开关关闭时对应 layer 的 tool 不可见

## Scenarios

### Scenario 1: 主对话命中投研 Coach

- **Given**: 用户首次进入 CLI,`UPUP_COACH_MODE=1`
- **When**: 主对话触发
- **Then**: L1 agent 主循环 → L2 加载 role-system prompt → Coach 自我介绍 + 推荐 watchlist

### Scenario 2: 远程 Bridge 调用本地 LLM

- **Given**: Bridge 已启动(34 文件子系统),用户在网页发起 prompt
- **When**: 网页 prompt 通过 WebSocket 传到本地
- **Then**: L4 Bridge transport → L3 Coordinator 派工 → L2 tool 调用 → L1 主对话 → 投研 Coach 回复 → 通过 L4 回传到网页

### Scenario 3: KAIROS 持续监控

- **Given**: KAIROS 已在后台运行(用户关闭 CLI 后)
- **When**: 盘中异动触发 scanner
- **Then**: L5 KAIROS scanner → EventBus → 多渠道推送(微信/飞书/钉钉)→ 用户收到

## Dependencies

- `src/agent/capability-manifest.ts`(扩展)
- `src/agent/role-system.ts`(v3 新增)
- `src/agent/feature-gates.ts`(升级)
- `src/coordinator/`(v2 已建)
- `src/bridge/`(v2 已建,v3 升级)
- `src/kairos/`(v2 已建,v3 升级)

## Out of Scope

- 5 layer 内各组件的具体实现细节(在各自的 spec 中定义)
- 跨层性能优化(后续 spec)
