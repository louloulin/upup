---
comet_change: top-tier-investment-assistant-v2
role: technical-design
canonical_spec: openspec
---

# Design Doc: 顶级投资助手 v2 (top-tier-investment-assistant-v2)

> 上游事实源: `openspec/changes/top-tier-investment-assistant-v2/{proposal,design,tasks}.md`
> 本文档聚焦"实现方案 / 技术风险 / 测试策略 / 边界条件"，不复述 OpenSpec 的 why/what。
> 设计决策继承 design.md 的 11 个 D1-D11，本文档补充 D12-D21 的技术细节。

## D12. Resolved Open Questions (10 个拍板)

| ID | 问题 | 拍板 | 实施落地 |
|----|------|------|----------|
| Q1 | Bridge 客户端 | CLI flag (`--bridge --bridge-port=7333`) | Sprint 1.3；网页 React 客户端 Sprint 5 |
| Q2 | Telemetry sink | 本地 JSONL `~/.upup/telemetry/YYYY-MM-DD.jsonl`，滚动 7 天 | Sprint 4.1；远程 sink Sprint 5 评估 |
| Q3 | Proactive 频率 | 盘前 09:15 起每 60s 扫；盘中 09:30-11:30 / 13:00-15:00 每 60s；盘后 15:30 触发 daily brief | Sprint 2.4 |
| Q4 | Worktree 命名 | `upup-agent-<workerType>-<8位uuid短码>` 例: `upup-agent-fundamental-a3f2b1c0` | Sprint 3.3 |
| Q5 | Alt-Data 优先级 | Sprint 1.2 只做 **dragon-tiger + north-bound** 2 路；news/reports/social 留 Sprint 4 | Sprint 1.2 + 4.6 |
| Q6 | Telemetry 脱敏 | symbol 原样；quantity `sha256(symbol+date).slice(0,8)`；资金 0/100/1000 桶化（<=100→"0" / <=1000→"1" / >1000→"2"） | Sprint 4.1 |
| Q7 | Plan-mode-v2 | 共存：`/plan` 走 v1，`/plan-v2` 显式启用 v2；CLI flag `--plan-mode=v2` 也支持 | Sprint 3.4 |
| Q8 | 编译开关清单 | Sprint 2 落地 10 个高频开关（见 D13），完整 50+ Sprint 4 | Sprint 2.2 + 4 |
| Q9 | TradingAgents 兼容 | **只借鉴思想**：4 路 Agent（Fundamentals/Sentiment/News/Technicals）协议思路，但走 upup 事件总线 + worktree 隔离；不锁其 schema | Sprint 4.7 |
| Q10 | Hebbia vs 问财 | **先 Hebbia `matrix-analysis`**（50 标的 × 4 维度），`intent-routing-zh` Sprint 4 落地 | Sprint 4.3 + 4.5 |

## D13. 编译开关清单 (10 个 Sprint 2 落地)

参考 loucode `feature('BUN_CONFIG_FEATURE_XXX')` Positive ternary 模式，编译时 Bun DCE 干净：

```ts
// src/agent/feature-gates-v2.ts
export function isCoordinatorV2Enabled(): boolean {
  return true
    ? getFeatureValue_CACHED_MAY_BE_STALE('tengu_coordinator_v2', false)
    : false;
}
// Negative -> Positive ternary：true 分支保留运行时检查，false 分支 Bun DCE 干净
```

| Feature Flag | 默认 | 控制能力 |
|--------------|------|----------|
| `BUN_CONFIG_FEATURE_UPUP_COORDINATOR_V2` | off | 主 Agent 工具白名单 + Worker XML |
| `BUN_CONFIG_FEATURE_UPUP_KAIROS_PROACTIVE` | off | 6 状态机主动模式 |
| `BUN_CONFIG_FEATURE_UPUP_BRIDGE_V2` | off | 34 文件 bridge 子系统 |
| `BUN_CONFIG_FEATURE_UPUP_WORKTREE_ISOLATION` | off | Agent 任务 worktree 隔离 |
| `BUN_CONFIG_FEATURE_UPUP_TELEMETRY` | on | 结构化事件埋点（默认开，因为脱敏严格） |
| `BUN_CONFIG_FEATURE_UPUP_PLAN_MODE_V2` | off | EnterPlanMode/ExitPlanMode 三件套 |
| `BUN_CONFIG_FEATURE_UPUP_MONITOR_TASK` | off | MonitorMcpTask 后台监控 |
| `BUN_CONFIG_FEATURE_UPUP_BRIEF_TOOL` | off | 一次性简报工具 |
| `BUN_CONFIG_FEATURE_UPUP_DREAM_TASK` | off | 后台 Dream 任务（autoMem 整合） |
| `BUN_CONFIG_FEATURE_UPUP_INTENT_ROUTING_ZH` | off | 中文投资意图路由 |

## D14. Coordinator V2 主 Agent 工具白名单（硬约束）

```ts
// src/coordinator/tool-allowlist.ts
const COORDINATOR_V2_ALLOWED_TOOLS = new Set([
  'Agent',           // 派工 Worker
  'SendMessage',     // 给 Worker 发续接消息
  'TaskStop',        // 取消 Worker
  'TodoWrite',       // 内部待办（不入事件流）
] as const);

// 主 Agent 工具调用前的硬门控
export function assertCoordinatorV2Allowed(toolName: string): void {
  if (!isCoordinatorV2Enabled()) return;  // v1 模式放行
  if (!COORDINATOR_V2_ALLOWED_TOOLS.has(toolName as any)) {
    throw new CoordinatorV2ToolNotAllowedError(toolName);
  }
}
```

**测试策略**: `coordinator-v2.test.ts` 验证主 Agent 调任意非白名单工具都抛 `CoordinatorV2ToolNotAllowedError`，主 Agent 调白名单工具全 pass。

## D15. Worker XML 结果注入协议

```xml
<task-notification>
  <task-id>upup-agent-fundamental-a3f2b1c0</task-id>
  <worker-type>fundamental</worker-type>
  <status>completed | failed | cancelled</status>
  <result>
    <symbol>600519.SH</symbol>
    <verdict>STRONG_BUY</verdict>
    <confidence>0.82</confidence>
    <metrics>{"PE": 28.4, "ROE": 0.31, "revenue_growth_yoy": 0.18}</metrics>
    <evidence>
      <source url="https://..." timestamp="2026-06-04T10:23:45Z">2025 年报 ROE 31%</source>
      <source url="https://..." timestamp="...">机构持仓环比 +5.2%</source>
    </evidence>
  </result>
  <notes>1 处数据缺失: Q4 季报未发布</notes>
</task-notification>
```

**解析**: `src/coordinator/worker-xml.ts` 用 `fast-xml-parser` 解析为强类型 `WorkerResult`（Zod schema 校验），主 Agent 拿到的是结构化对象而非 LLM 自由文本。

**失败续接协议**:
```xml
<task-notification>
  <task-id>upup-agent-fundamental-a3f2b1c0</task-id>
  <status>failed</status>
  <error>timeout after 300s</error>
  <resume-context>{"partialResult": {...}, "nextStep": "fetch Q3 report"}</resume-context>
</task-notification>
```

主 Agent 收到 `<status>failed</status>` 不 spawn 新 Worker，而是 `SendMessage` 续接：`Agent(resumeContext={"partialResult": ..., "nextStep": "fetch Q3 report"})`。

## D16. 6 状态机 Proactive 实现

```ts
// src/kairos/proactive.ts
interface ProactiveState {
  active: boolean;          // 整体激活
  paused: boolean;          // 用户手动暂停
  contextBlocked: boolean;  // 上下文窗口已满，暂不主动
  nextTickAt: number;       // 下次扫描时刻 (ms epoch)
  source: 'user' | 'kairos' | 'cron' | 'heartbeat';
  listeners: Set<() => void>;
}

export function activateProactive(source: ProactiveState['source']): void { ... }
export function pauseProactive(): void { ... }
export function resumeProactive(): void { ... }
export function setContextBlocked(blocked: boolean): void { ... }
export function setNextTickAt(ms: number): void { ... }
export function subscribeToProactiveChanges(listener: () => void): () => void { ... }
export function isProactiveActive(): boolean { ... }
export function resolveAutonomyMode(opts: {
  assistantEnabled: boolean;
  proactiveFlag: boolean;
  proactiveEnv: string | undefined;
}): 'on' | 'off' | 'context-blocked' { ... }
```

**状态转换边界**:
- `active=false` + `paused=true` → `paused=true, active=false`（用户暂停后不自动激活）
- `active=true` + `contextBlocked=true` → 扫描时跳过主动推送
- `nextTickAt` 过期 → 触发 `tick` 事件 → 扫描器执行
- `paused=true` 期间所有 `activate()` 调用不生效

**KAIROS 集成**: scanner 每次启动前调 `isProactiveActive()` + `isProactiveContextBlocked()`，双重 false 才执行。

## D17. 6 类 Task Runtime 抽象

```ts
// src/tasks/types.ts
interface Task {
  id: string;
  type: 'LocalAgent' | 'LocalShell' | 'LocalWorkflow' | 'MonitorMcp' | 'RemoteAgent' | 'InProcessTeammate' | 'Dream' | 'LocalMainSession';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAtMs: number;
  completedAtMs: number | null;
  result: unknown;
  metadata: Record<string, unknown>;
  pillLabel: string;  // UI 标签
}

interface TaskRuntime {
  spawn(task: Omit<Task, 'id' | 'status' | 'startedAtMs' | 'pillLabel'>): Promise<Task>;
  stop(taskId: string, reason: string): Promise<void>;
  get(taskId: string): Task | null;
  list(filter?: Partial<Task>): Task[];
}
```

**Worktree 集成**: `LocalAgentTask` 和 `InProcessTeammateTask` 默认走 `createAgentWorktree(taskId)`，任务结束 `removeAgentWorktree(taskId, { merge: 'auto' | 'discard' | 'manual' })`。

## D18. AltDataAdapter 接口 + 2 路优先实现

```ts
// src/data/alt/types.ts
export type AltDataSource = 'cls' | 'xinhua' | 'xueqiu' | 'x' | 'dragon-tiger' | 'north-bound' | 'reports' | 'choice';

export interface NormalizedEvent {
  id: string;                    // sha256(source+url+publishedAt) 去重
  title: string;
  source: AltDataSource;
  url: string;
  publishedAt: number;           // ms epoch
  symbols: string[];             // 关联标的 ['600519.SH', ...]
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  raw: Record<string, unknown>;  // 原始 payload
}

export interface AltDataAdapter {
  readonly source: AltDataSource;
  fetch(input: { symbols?: string[]; dateRange?: [number, number] }): Promise<NormalizedEvent[]>;
  normalize(raw: unknown): NormalizedEvent;
}
```

**Sprint 1.2 优先 2 路**:
- `dragon-tiger.ts`: 龙虎榜（东方财富 + 雪球）+ 大宗交易（沪深交易所）
- `north-bound.ts`: 北向资金（沪深港通）+ 融资融券（沪深交易所）

**Sprint 4 补 3 路**: news (财联社 + 新华) / reports (慧博) / social (雪球 + X)

**Lazy-load 模式**: Adapter 构造时不检查 API key，调用 `fetch()` 时若无 key 抛 `AltDataError(NO_CREDENTIALS, 'CLS_API_KEY not set')` + 修复提示。

## D19. Portfolio Attribution: Brinson 3-Factor

```ts
// src/tools/portfolio/brinson.ts
interface BrinsonInput {
  portfolio: { sector: string; weight: number; return: number }[];
  benchmark: { sector: string; weight: number; return: number }[];
}

interface BrinsonOutput {
  allocation: number;   // 配置效应: Σ (w_p - w_b) * r_b
  selection: number;    // 选股效应: Σ w_b * (r_p - r_b)
  interaction: number;  // 交互效应: Σ (w_p - w_b) * (r_p - r_b)
  activeReturn: number; // 组合收益 - 基准收益
}

// 加和验证: allocation + selection + interaction === activeReturn
// 容差 ±0.01%
```

**测试**: `brinson.test.ts` 用 5 行业 mock 数据验证加和等式；`style.test.ts` 验证 4 因子分解；`sector.test.ts` 验证申万/GICS 行业归因。

## D20. Telemetry 事件 schema + 脱敏

```ts
// src/telemetry/events.ts
export type TelemetryEvent =
  | ToolCallEvent       // { tool, args_sha256, result_shape, latencyMs, success }
  | DecisionEvent       // { phase, model, prompt_sha256, response_sha256, scratchpad_tokens }
  | FeatureGateEvent    // { flag, isEnabled, source: 'compile'|'env'|'growthbook' }
  | ErrorEvent          // { tool, error_kind, stack_sha256, recoverable }
  | LatencyEvent;       // { phase, spanMs, subSpans: Record<string, number> }

// 脱敏 (D12 Q6)
export function anonymize(event: TelemetryEvent): TelemetryEvent {
  return transformEvent(event, (e) => {
    if ('symbol' in e) return e;  // symbol 保留
    if ('quantity' in e) return { ...e, quantity: hashShort(e.symbol + isoDate(e.timestamp)) };
    if ('amount' in e) return { ...e, amount: bucketize(e.amount, [100, 1000]) };
    return e;
  });
}
```

**存储**: `~/.upup/telemetry/YYYY-MM-DD.jsonl` (每行一个 JSON event)，`logrotate` 风格按天滚动，7 天后自动删除。

## D21. Bridge V2 消息协议 (4 类)

```ts
// src/bridge/protocol.ts
type BridgeMessage =
  | { kind: 'chat';      seq: number; payload: { role: 'user' | 'assistant'; content: string } }
  | { kind: 'approval';  seq: number; payload: { tool: string; args: unknown; approved: boolean } }
  | { kind: 'output';    seq: number; payload: { tool: string; result: string; latencyMs: number } }
  | { kind: 'status';    seq: number; payload: { phase: 'idle' | 'thinking' | 'tool' | 'done'; progress?: number } };

interface BridgeProtocol {
  encode(msg: BridgeMessage): Uint8Array;     // 二进制帧 (Bun.serve WebSocket)
  decode(frame: Uint8Array): BridgeMessage;
  sign(msg: BridgeMessage, secret: string): string;  // HMAC-SHA256
  verify(msg: BridgeMessage, sig: string, secret: string): boolean;
}
```

**安全**: JWT 短过期 (5 min) + trusted device 列表 + 所有命令走 `bridgePermissionCallbacks` (与本地 CLI 同源权限检查)。

## Risks / Edge Cases (D22-D25)

### D22. Coordinator V2 降级路径

**Risk**: 主 Agent 工具白名单太严，导致某些 workflow 无法完成（LLM 不知道用什么工具）。
**Mitigation**:
- `featureGates.isCoordinatorV2Enabled()` 默认 off，回退 v1 模式
- `process.env.CLAUDE_CODE_COORDINATOR_MODE=v1` 环境变量硬降级
- 主 Agent 系统 prompt 显式列出白名单工具（避免 LLM 猜）
- 监控: 1 小时内主 Agent 报错 > 10 次 → 自动降级并告警

### D23. Worktree 在 Windows / 容器环境兼容

**Risk**: `git worktree add` 在某些环境失败（git 旧版本 / 容器 no-mount / Windows 长路径）。
**Mitigation**:
- 启动时 `git worktree add --dry-run` 验证可用性
- 不可用时降级到"主分支干净 + 任务结束前 git stash 验证"
- 不在 Windows CI 强制要求 worktree，标 `skip on win32`

### D24. Telemetry 数据量爆炸

**Risk**: 高频 proactive 扫描产生大量 `LatencyEvent`，本地 JSONL 写满磁盘。
**Mitigation**:
- 单文件 100MB 上限自动滚动
- 7 天前文件 `rm -rf`
- 远程 sink（可选）Phase 4 评估后接 CCR/S3/PostgreSQL

### D25. Bridge 客户端鉴权绕过

**Risk**: 攻击者拿到 JWT 短过期 token 后 5 分钟内可发任意命令。
**Mitigation**:
- 每次 `SendMessage` 重新 `verify` HMAC（不只 JWT）
- trusted device 列表（`~/.upup/bridge-trusted.json`）白名单
- `bridgePermissionCallbacks` 二次确认危险操作（删文件 / 下单）
- 异常模式检测：5 分钟内 > 100 命令 → 自动断连

## Testing Strategy (D26-D29)

### D26. 测试分层

| 层 | 工具 | 覆盖 | 目标数 |
|----|------|------|--------|
| **Unit** | `bun test` 单文件 | 算法纯函数 / 状态机 / 解析器 | 50+ 文件 / 500+ cases |
| **Integration** | `bun test` 多文件 | Tool + Adapter + Sandbox 联动 | 20+ 文件 / 200+ cases |
| **E2E** | `bun test src/e2e/` | 真实 LLM 调用 + sandbox 撮合 | 10+ 场景 / 50+ cases |
| **Regression** | CI 必跑 | v1 11 spec 全测试 + v2 新 spec | 全绿基线 |

### D27. Mock 策略

- **LLM**: `tests/fixtures/llm-mock.ts` 桩 `invokeLLM()`，按 prompt hash 返回固定 response
- **Broker**: 复用 `sandbox-engine.ts`（已支持 mock quoteProvider）
- **Bridge 客户端**: `tests/fixtures/bridge-mock-client.ts` WebSocket 桩
- **Time**: `bun test` 的 `setSystemTime` 控制 `Date.now()`，跑 1 小时 TWAP 用 1ms 模拟

### D28. 覆盖率目标

- 核心算法 (algo/brinson/isMultiplier)：**100% line**
- 状态机 (proactive/coordinator)：**100% branch**
- 工具层 (strategy/portfolio/research)：**80% line**
- Bridge/Telemetry：**60% line**（IO 密集，覆盖率意义有限）

### D29. 性能基线

- `strategy_run_paper` 1 分钟 TWAP：wall time **< 65s**（容忍 5s overhead）
- `portfolio_attribution` 100 持仓 × 5 行业：**< 100ms**
- `matrix_analysis` 50 标的 × 4 维度：**< 30s**（含 4 维度 LLM 调用）
- `bridge` 端到端延迟：**< 200ms**（本地 127.0.0.1）
- `telemetry` 事件埋点开销：**< 5%** 主循环 latency

## Migration / Rollout (D30-D31)

### D30. Feature Gate 灰度发布顺序

1. **Phase 3 Sprint 2 完成** → 10 个 feature flag 落地，默认全 off
2. **dogfood**: 内部 / 团队用户 `featureGates.set('kairos-proactive', { userId: 'team', ratio: 1.0 })` 全量开
3. **观察 1 周** → telemetry 收集 tool_call / error / latency 数据
4. **比率灰度**: `ratio: 0.1` → `0.5` → `1.0` 逐步放量
5. **默认 on**: Sprint 4 评估稳定性后，关键 flag 默认开
6. **archive change**: Sprint 5 完成后 archive 到 `openspec/changes/archive/`

### D31. v1 → v2 兼容层

每个 v2 spec 升级的旧模块保留 `legacy.ts` shim：

```ts
// src/coordinator/legacy.ts
export { spawnWorker as legacySpawnWorker } from './coordinator-v1.js';
export { isCoordinatorV2Enabled } from './feature-gates-v2.js';

// v1 调用方零修改: legacy.ts 自动判断 v1/v2
export function spawnWorker(opts: SpawnWorkerOpts) {
  return isCoordinatorV2Enabled() ? v2SpawnWorker(opts) : legacySpawnWorker(opts);
}
```

## Open Questions (Resolved)

| ID | 拍板 | 备注 |
|----|------|------|
| Q1-Q10 | 全部锁定（见 D12 表） | 用户确认后无遗留 |
