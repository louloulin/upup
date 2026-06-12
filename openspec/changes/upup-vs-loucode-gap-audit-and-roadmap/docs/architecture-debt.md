# UpUp 架构债清单

> 版本:v1.0 · 对应 upup v2026.5.15 · 生成日期 2026-06-06
> 配套文档:[architecture-current.md](architecture-current.md) / [capability-matrix.md](capability-matrix.md) / [production-readiness-checklist.md](production-readiness-checklist.md)
> 评估方式:每条债标注 `问题描述 / 影响文件 / 影响面 / 修复成本 / 优先级` 5 字段

---

## §0 总览

| 优先级 | 数量 | 总修复成本(人天) | 修完后影响 |
|--------|------|----------------|------------|
| **P0** | 4 | 35-50 | 可读性 / 可维护性显著提升 |
| **P1** | 3 | 20-30 | 性能 / 健壮性 / 测试覆盖 |
| **P2** | 2 | 10-15 | 工程化 / 工具链 |

> 总修复成本估算:**65-95 人天**(约 3-5 人月单人工作量)

---

## §0.1 目标架构与重构路径

> 本节债清单的"目标解"全部收敛到 [target-architecture-cohesion-coupling.md](target-architecture-cohesion-coupling.md),本节每条 P0 债在 §3-§5 的目标架构下都有对应的解耦路径。
> 配套图集:[ascii-diagrams.md §图 15-17](ascii-diagrams.md#图-15--目标架构-7-层--单向依赖)

| 本文档债条 | 目标架构对应 | 配套图 | 重构 Wave |
|------------|-------------|--------|-----------|
| §1 单文件超长(P0-1) | [§1.1-1.11 内聚热点清单](target-architecture-cohesion-coupling.md#§1-当前架构的内聚热点cohesion-hotspots) | 图 15 | Wave 3 |
| §2 模块边界泄漏(P0-2) | [§2.1 完整耦合矩阵](target-architecture-cohesion-coupling.md#§2-当前架构的耦合点coupling-smells) | 图 15,17 | Wave 2,4 |
| §3 状态机散落(P0-3) | [§1.6 Session 2.0 双套实现](target-architecture-cohesion-coupling.md) | 图 6-9 | Wave 4 |
| §4 测试覆盖不足(P1-1) | [§3.4 端口/适配器](target-architecture-cohesion-coupling.md#§3-4-跨包跨层接口规范) → 可注入 mock | 图 17 | Wave 2,3 |
| §5 TypeScript 严格度(P1-2) | [§5 重构原则 #8](target-architecture-cohesion-coupling.md#§5-重构原则13-条) | -- | Wave 3,5 |
| §6 Bun 兼容性风险(P0-4) | [§1.1 巨型 agent.ts](target-architecture-cohesion-coupling.md) → 拆小后 Bun 兼容更好 | -- | Wave 3 |
| §7 依赖图循环风险(P1-3) | [§3.3 packages/ 边界](target-architecture-cohesion-coupling.md#§3-3-packages-边界) | -- | Wave 5 |
| §8 错误处理不一致(P1-4) | [§1.1-1.11 重构后内聚提升](target-architecture-cohesion-coupling.md) | -- | Wave 3,4 |
| §9 监控缺失(P2-1) | [§3.5 governance 包 metrics + telemetry](target-architecture-cohesion-coupling.md#§3-5-横切关注点治理器governance-package) | -- | Wave 1 |
| §10 文档漂移(P2-2) | [§4 Wave 6 文档同步](target-architecture-cohesion-coupling.md) | -- | Wave 6 |
| §12 分 Wave 推进 | **[§4 重构 Roadmap 6 Wave](target-architecture-cohesion-coupling.md#§4-重构-roadmap分-6-wave)** | **图 16** | -- |

> **核心结论**:本清单 10 条债的"修法"在目标架构下已经收敛为 6 个 Wave,83-116 人天,3-4 人小团队 4-5 月完成。详见 [target-architecture-cohesion-coupling.md](target-architecture-cohesion-coupling.md) 与 [图 16 重构时间线](ascii-diagrams.md#图-16--重构-roadmap-6-wave-时间线)。

---

## §1 单文件超长(P0-1)

### 问题
`src/agent/agent.ts:1-1305` 1305 行单文件,集成 Agent Loop + Plan Auto Trigger + Tool Executor + Microcompact + Compact + LLM 调用 + Cleanup + Memory Flush + Stop Hooks + Session Recovery + Session Backgrounding + Tool Metrics + Context Watchdog + Fallback Handler + Extraction Hook 共 14 个职责。

### 影响文件
- `src/agent/agent.ts` (1305L)
- `src/agent/subagent-runner.ts` (631L)
- `src/agent/scratchpad.ts` (557L)
- `src/agent/feature-gates.ts` (393L)
- `src/agent/loop-recovery.ts` (502L)
- `src/agent/fallback.ts` (423L)

### 影响面
- 新人 onboarding:读 1 个文件 1 小时起步
- 修改风险:任何小改动要回归整个 1305L 文件
- 测试隔离:无法针对单个职责精细测试
- 命名空间污染:Agent 类私有属性 > 20 个

### 修复成本
- 5 模块拆分,各 < 400L
- 保守估计 8-12 人天

### 优先级
**P0**(影响维护性 + 测试隔离)

### 建议拆分
```
src/agent/agent.ts (1305L)
  ├─ agent.ts (主类,协调器)         < 400L
  ├─ agent-loop.ts (while 循环)      < 400L
  ├─ agent-prep.ts (消息构造)         < 300L
  ├─ agent-compact.ts (compact 调度)  < 300L
  └─ agent-cleanup.ts (cleanup)       < 200L
```

---

## §2 模块边界泄漏(P0-2)

### 问题
`src/agent/` 内部直接 import `src/tools/finance/` `src/tools/portfolio/` `src/tools/valuation/` `src/tools/trading/`,造成 `agent → tools` 反向引用(本来应该是 `tools → agent` 依赖方向)。

### 影响文件
- `src/agent/agent.ts:L20+` import `src/tools/registry/`
- `src/agent/agent-port.ts:190` 暴露 `src/tools/` API
- `src/agent/investment-workflow.ts:308` 通过 callback 注入工具
- `src/agent/investment-config.ts:508` 大量 import `src/tools/*`

### 影响面
- 循环依赖风险:某次 import 改动可能引发死锁
- 编译时联动:改 `tools/` 一个文件可能触发 `agent/` 重新编译
- 分层破坏:不应该是"agent → tools" 而应该是 "tools → agent"(工具依赖 agent 接口)

### 修复成本
- 引入"端口 + 适配器"模式
- 把 `tools/` 中对 `agent/` 的依赖提取到共享 `packages/agent-core/`
- 估计 10-15 人天

### 优先级
**P0**(影响架构清晰度 + 编译时间)

---

## §3 状态机散落(P0-3)

### 问题
4 套独立状态机,各自实现 transfer 函数、持久化、错误处理,**没有任何共享抽象**:

| 状态机 | 状态数 | 状态名 | 引用 |
|--------|--------|--------|------|
| Agent Session | 6 | idle/running/waiting/completed/error/canceled | `src/daemon/session.ts:SessionState` |
| Plan State | 5 | created/approved/in-progress/completed/failed | `src/plan/research-plan.ts:ResearchPlanState` |
| KAIROS Task | 4 | queued/running/done/failed | `src/kairos/types.ts:TaskState` |
| Coordinator Worker | 6 | pending/running/awaiting-peers/verifying/passed/partial/failed | `src/coordinator/types.ts:WorkerState` |

### 影响面
- 重复代码:4 套 state transfer 逻辑相似但不同
- 难以全局追踪:1 个用户的 1 次操作可能在 4 套状态机里都触发迁移
- 错误处理不一致:有的状态机支持 retry,有的不支持
- 持久化 schema 不统一:Session 走 SQLite,Plan 走 YAML,KAIROS 走内存

### 修复成本
- 设计 1 套统一状态机抽象(`StateMachine<S, E, T>`)
- 收敛到 ≤ 8 个核心状态 + 通用 transfer 函数
- 估计 8-12 人天

### 优先级
**P0**(影响可观测性 + 可调试性)

### 建议
引入 `packages/state/` 包,提供:
```typescript
interface StateMachine<S, E> {
  current(): S;
  send(event: E): { from: S; to: S } | InvalidTransition;
  history(): Array<{ from: S; to: S; event: E; at: number }>;
  subscribe(observer: (transition) => void): Unsubscribe;
}
```

---

## §4 测试覆盖不足(P1-1)

### 问题
- 总测试文件:`src/**/*.test.ts` 276 个
- 总工具文件:`src/tools/**/*.ts` 296 个
- 比值:**0.93**(几乎 1:1,但实际上 1 个 .test.ts 可能测多个文件)

### 影响文件
- `src/agent/agent.ts:1305L` 仅有 8+ 个 `.test.ts`
- `src/agent/investment-workflow.ts:308L` 仅有 4 个 `.test.ts`
- `src/coordinator/` 多模块无 .test.ts
- `src/multi-agent/` 27 个 .ts 中 < 5 个 .test.ts

### 影响面
- 投资域 5-Phase Workflow 一旦改动,回归成本高
- Coordinator 协议不变量无人守护
- Multi-Agent 路由几乎裸跑

### 修复成本
- 给 `src/agent/agent.ts` 至少补 5 个 e2e .test.ts
- 给 `src/coordinator/` 每个模块补 .test.ts
- 给 `src/multi-agent/` 关键路径补 .test.ts
- 估计 15-20 人天

### 优先级
**P1**(影响回归信心)

---

## §5 TypeScript 严格度(P1-2)

### 问题
虽然 `tsconfig.base.json` 设置了 `strict: true`,但:
- `src/agent/agent.ts` 中使用 `as any` 至少 3 处
- `src/agent/agent.ts` 中使用 `instanceof SystemMessage` + `as any` 至少 4 处
- `src/agent/subagent-runner.ts` 中 `as any` 多处
- `src/commands/` 部分文件 `as any` 用于跨包类型互转

### 影响面
- 类型安全实际是 80% 而非 100%
- 跨包类型改动不会被编译期发现
- 重构时容易破坏类型契约

### 修复成本
- 替换 `as any` 为具体类型守卫
- 估计 5-8 人天(分散在各文件)

### 优先级
**P1**(影响类型安全)

### 示例
```typescript
// 当前 (agent.ts:L320+)
const toolCalls = (msg as any).tool_calls;
const content = typeof msg.content === 'string' ? msg.content : '';

// 建议
import type { AIMessage } from '@langchain/core/messages';
if (msg instanceof AIMessage) {
  const toolCalls = msg.tool_calls;
}
```

---

## §6 Bun 兼容性风险(P0-4)

### 问题
`package.json` 包含多个 Bun 兼容性未验证的 npm 包:

| 包 | 风险 | 影响 |
|------|------|------|
| `@whiskeysockets/baileys` 7.0.0-rc.9 | 用了 Node.js child_process 大量 API | 可能在 Bun 上运行失败 |
| `better-sqlite3` 12.8.0 | native binding | 需 Bun 兼容编译,需 prebuild |
| `@duckdb/duckdb-wasm` 1.33.1-dev45.0 | WASM 加载,Bun 应该支持 | 但需测试 streaming 行为 |
| `playwright` 1.58.2 | Chromium 启动,Node + Bun 行为略不同 | 截图行为可能差异 |
| `linkedom` 0.18.12 | 纯 JS,Bun 兼容 | 风险低 |
| `gray-matter` 4.0.3 | 纯 JS | 风险低 |
| `zod-v4` (npm: zod@4.3.6) | v3 → v4 迁移 | schema 校验行为可能变 |

### 影响面
- 二进制编译(`bun build --compile`)可能失败
- 跨平台构建(Win/macOS/Linux)行为不一致
- 用户在 Bun 升级后可能遇到崩溃

### 修复成本
- 验证 5 个高风险包,加 .skip 标记或替换
- 估计 5-8 人天

### 优先级
**P0**(影响分发 + 用户安装成功率)

---

## §7 依赖图循环风险(P1-3)

### 问题
`packages/` 18 个包,虽声称无循环,但有 2 个潜在风险点:

```
packages/agent-core → packages/commands → packages/skills → packages/llm
                       ↑                       │
                       └───────────────────────┘  (潜在 cycle)
```

```
packages/agent-core → packages/hooks → packages/state
                       ↑                       │
                       └──────── types ────────┘  (type-only cycle 风险)
```

### 影响面
- 未来重构可能引入真正循环依赖
- 跨包导入会让 webpack/bun 构建复杂化
- `packages/*` 之间没有明确的"层"概念

### 修复成本
- 显式定义 `packages/` 层次(L0 types → L1 utils/state/hooks → L2 llm/memory/skills/mcp → L3 plugin-sdk → L4 commands → L5 agent-core)
- 加 CI 检查循环依赖(`madge --circular`)
- 估计 3-5 人天

### 优先级
**P1**(影响长期可维护性)

---

## §8 错误处理不一致(P1-4)

### 问题
错误处理模式在 `src/agent/` `src/tools/` `src/skills/` 中不一致:

| 模块 | 错误处理模式 |
|------|--------------|
| `src/agent/agent.ts` | try/catch 包裹 + warn 日志 + 继续执行 |
| `src/agent/subagent.ts` | try/catch + 状态转移(error state) |
| `src/tools/finance/*` | 抛异常 + 由 LangChain 捕获 |
| `src/tools/trading/sandbox-engine.ts` | 返回 `{ ok: false, error }` |
| `src/skills/*` | 大多 try/catch + fallback 到 mock |
| `src/coordinator/*` | 部分用 Result 类型,部分用 throw |

### 影响面
- 1 个 tool 失败,有的路径会污染主 Agent 上下文,有的会优雅降级
- 调试时不知道错误从哪个 catch 抛出
- 错误恢复策略不统一(有的重试 3 次,有的立即失败)

### 修复成本
- 引入 `Result<T, E>` 类型 + 统一错误处理工具
- 重构 5 个关键路径使用统一模式
- 估计 8-10 人天

### 优先级
**P1**(影响调试 + 健壮性)

### 建议
```typescript
// packages/utils/result.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// 使用
const r = await tool.invoke(input);
if (!r.ok) {
  yield { type: 'tool_error', toolName, error: r.error };
  continue; // 优雅继续
}
```

---

## §9 监控 / 可观测性缺失(P2-1)

### 问题
- 没有 OpenTelemetry exporter(只有 LangSmith 集成)
- 没有 metrics 持久化(只有 session 内的内存 metrics)
- 没有结构化日志(console.log + warn/error 混用)
- 没有 trace 关联(LangSmith trace 是 LLM 级别的,tool 级别没有)

### 影响面
- 用户报错时无法重现
- 性能瓶颈无法定位
- 投资域决策的可解释性差(为什么这个建议?)

### 修复成本
- 引入 `pino` 结构化日志 + OpenTelemetry SDK
- 估计 5-8 人天

### 优先级
**P2**(影响生产运维)

---

## §10 文档与代码同步漂移(P2-2)

### 问题
- `README.md` 19KB + `README_CN.md` 19KB 写得非常详细,但**多个文件名路径已与当前 src/ 不一致**(如提到 "src/utils/cache.ts" 实际是 "src/utils/caching.ts")
- `docs/` 目录 28 个 .md,但有 5+ 个超过 6 个月未更新
- `openspec/` 已经有 30+ 个 spec,新旧混在一起,难找"现行" spec

### 影响面
- 新 contributor onboarding 困惑
- 投资域功能变更时,文档滞后于代码
- OpenSpec governance 失效(spec 多到无法管理)

### 修复成本
- 同步更新 README 中 5+ 个路径
- 给 `docs/` 加"最后更新日期" + 归档过时文档
- 给 `openspec/specs/` 加索引文件
- 估计 5-7 人天

### 优先级
**P2**(影响 onboarding)

---

## §11 修复优先级总表

| 编号 | 标题 | 优先级 | 修复成本(人天) | 依赖 |
|------|------|--------|---------------|------|
| D-1 | 单文件超长(agent.ts 1305L 拆分) | P0 | 8-12 | -- |
| D-2 | 模块边界泄漏(agent ↔ tools 循环引用) | P0 | 10-15 | -- |
| D-3 | 状态机散落(4 套 → 1 套) | P0 | 8-12 | -- |
| D-4 | Bun 兼容性风险(5 高风险包验证) | P0 | 5-8 | -- |
| D-5 | 测试覆盖不足(276/296) | P1 | 15-20 | -- |
| D-6 | TypeScript 严格度(as any 替换) | P1 | 5-8 | -- |
| D-7 | 依赖图循环风险(18 packages) | P1 | 3-5 | -- |
| D-8 | 错误处理不一致(4 种模式 → 1 种) | P1 | 8-10 | -- |
| D-9 | 监控/可观测性缺失(OTel/Logs/Metrics) | P2 | 5-8 | D-2 |
| D-10 | 文档与代码同步漂移 | P2 | 5-7 | -- |

> 总修复成本:**72-103 人天** (3-5 人月单人工作量,或 1-2 人月 3-4 人小团队)

---

## §12 修复建议:分 Wave 推进

### Wave 1(并行 1-2 周)
- D-4 Bun 兼容性 + D-10 文档同步(快速收益)

### Wave 2(并行 2-3 周)
- D-1 Agent Loop 拆分 + D-3 状态机统一 + D-7 依赖图循环(架构债清理)

### Wave 3(并行 2-3 周)
- D-2 模块边界 + D-5 测试覆盖 + D-6 TS 严格度(质量债清理)

### Wave 4(2 周)
- D-8 错误处理统一 + D-9 监控/可观测性(运维债清理)

> 详见 [production-readiness-checklist.md](production-readiness-checklist.md) 与之并行的 8-12 个 P0 投资域改造工作
