# upup 架构与模块边界 (Architecture & Module Boundaries)

> 投资 AI Agent 的严格分层。v6 之后所有新代码必须遵守本文档定义的边界规则。

## 1. 核心原则

### 1.1 模块高内聚

每个模块只负责一个明确的关注点,对外暴露最小、稳定、类型化的 API。模块内部实现可自由演进,模块外部只依赖接口。

### 1.2 严格依赖方向

依赖图必须是**有向无环图 (DAG)**。禁止:
- 跨包 `await import('../../../../src/...')` 这种深度相对路径
- 用 `try/catch` 包住 import 来掩盖路径错误
- 同层模块互相 import 形成回路
- 底层模块 import 上层模块

### 1.3 跨包边界用端口(Port)

跨 `packages/commands/` ↔ `src/` 的访问必须通过**端口注册表**(globalThis 上的 typed registry),不允许直接相对路径 import。

## 2. 分层(从下到上)

```
Layer 0:  第三方依赖(外部)
  ↓
Layer 1:  src/utils/      纯工具,无业务逻辑,无 src/ 内部 import
Layer 2:  src/types/      纯类型
Layer 3:  src/storage/    持久化
Layer 4:  src/tools/      工具实现(被 LLM 调用)
Layer 5:  src/agent/      Agent 核心(plan / workflow / 编排)
Layer 6:  src/commands/   CLI 命令(Ink 渲染)
Layer 7:  src/hooks/      React Hooks(Ink 组件消费)
Layer 8:  packages/commands/  旧命令容器(只允许消费 ports)
```

**规则**:Layer N 只能 import Layer 0..N-1,不能 import 同层或更高层。

**注**:port 注册表 (`src/agent/agent-port.ts`) 是一个跨层基础设施,不是普通的 Layer 5 模块。它的存在就是为了让高层和低层之间通过 `globalThis` 类型化注册表通信,而不是用脆弱的相对路径 import。src/state/ 等"边界"模块可以 import 它,因为这就是它的职责。

## 3. 跨包端口注册表

### 3.1 位置

| 文件 | 角色 |
|------|------|
| `src/agent/agent-port.ts` | 端口接口 + 注册表(globalThis.__upupAgentPorts) |
| `packages/commands/src/agent-port.ts` | 端口接口本地副本 |

### 3.2 当前注册的端口 (v7-2b 之后)

| 端口 | 接口文件 | 实现方(自注册) | 消费方 (packages/commands/) |
|------|---------|---------------|------------------------------|
| `PlanModePort` | `src/agent/agent-port.ts` | `src/agent/plan-mode-state.ts` | `exit-plan-impl.ts`, `steps-impl.ts` |
| `AgentConfigPort` | 同上 | (v6 计划) | (v6 计划) |
| `SessionPort` | 同上 | (v6 计划) | (v6 计划) |
| `SubagentPort` | 同上 | `src/agent/subagent-runner.ts` | `agent-impl.ts`, `agents-impl.ts`, `tasks-impl.ts` |
| `McpRegistryPort` | 同上 | `src/mcp/registry.ts` | `mcp-add-impl.ts` |
| `StatePort` | 同上 | `src/state/index.ts` (re-export 包装) | `resume-impl.ts`, `usage-impl.ts` |

### 3.3 添加新端口的流程

1. 在 `src/agent/agent-port.ts` 加 interface + register/getter
2. 在 `packages/commands/src/agent-port.ts` 加本地副本 interface + getter (`*Local`)
3. 在 `src/<layer>/<module>` 末尾 `import { registerXPort } from './agent-port.js'` + `registerSelf()`
4. 在 `packages/commands/` 用 `getXPortLocal()` 消费,不需要 import src/

### 3.4 为什么用 globalThis

- **零静态依赖**:packages/commands/ 不需要在编译期 resolve `src/`
- **零相对路径**:不会出现 `../../../../src/...` 这种脆弱的深层路径
- **类型安全**:TypeScript 通过本地 interface 副本保证类型一致(测试套件保证不漂移)
- **可测试**:`__resetAgentPorts()` 让测试可以隔离(但注意:全局 reset 会影响同进程的其他测试,见 §7 测试注意事项)

## 4. 已修复的循环依赖征兆

### 4.1 v6-1: PlanModePort

| 位置 | 修复前 | 修复后 |
|------|-------|-------|
| `packages/commands/src/commands/plan/plan-impl.ts:26` | `await import('../../../../src/agent/plan-mode-state.js')` (4 级,实际解析路径不存在,被 try/catch 吞掉) | `getPlanModePortLocal()` 通过本地端口 |
| `packages/commands/src/commands/add-step/add-step-impl.ts:17` | 同上 | 同上 |

**修复前症状**:`/plan` 和 `/add-step` 命令的 plan mode 状态检测**从未工作过**,因为相对路径错误(4 级应改为 5 级,实际解析到 `packages/src/agent/...` 不存在),`try/catch` 静默吞掉。所有 plan 命令在 `packages/commands/` 侧的状态判断都返回 fallback 值。

**修复后**:port 注册表在 `src/agent/plan-mode-state.ts` 模块加载时自注册,`packages/commands/` 通过 globalThis 读取,零路径耦合。

### 4.2 v7-2b: 8 个剩余深层 import 一并消除

| # | 文件 | 修复前 | 修复后 |
|---|------|-------|-------|
| 1 | `agent-impl.ts:45` | `await import('../../../../src/agent/subagent-runner.js')` (4 级) | `getSubagentPortLocal()` |
| 2 | `agents-impl.ts:25` | `await import('../../../../../src/agent/subagent-runner.js')` (5 级) | `getSubagentPortLocal()` |
| 3 | `exit-plan/exit-plan-impl.ts:18,45` | `await import('../../../../src/agent/plan-mode-state.js')` (4 级) | `getPlanModePortLocal()` |
| 4 | `mcp-add/mcp-add-impl.ts:33` | `await import('../../../../../src/mcp/registry.js')` (5 级) | `getMcpRegistryPortLocal()` |
| 5 | `resume/resume-impl.ts:31` | `await import('../../../../../src/state/index.js')` (5 级) | `getStatePortLocal()` |
| 6 | `steps/steps-impl.ts:18` | `await import('../../../../src/agent/plan-mode-state.js')` (4 级) | `getPlanModePortLocal()` |
| 7 | `tasks/tasks-impl.ts:24` | `await import('../../../../../src/agent/subagent-runner.js')` (5 级) | `getSubagentPortLocal()` |
| 8 | `usage/usage-impl.ts:22` | `await import('../../../../../src/state/index.js')` (5 级) | `getStatePortLocal()` |

**新增 3 个端口**(扩展了 §3.2 的端口表):
- `SubagentPort` (注册于 `src/agent/subagent-runner.ts`)
- `McpRegistryPort` (注册于 `src/mcp/registry.ts`)
- `StatePort` (注册于 `src/state/index.ts` re-export 包装)

## 5. src/tools/ 内部规则

### 5.1 允许的依赖方向

```
src/tools/portfolio/store.ts          → 无 src/ 内部依赖 (纯数据层)
src/tools/portfolio/service.ts        → store.ts + astock/tushare-client.ts (业务逻辑)
src/tools/portfolio/tracker.ts        → service.ts + store.ts (Pi tool adapter 包装)
src/tools/portfolio/{brinson,sector,style}-attribution.ts → types.ts
src/tools/portfolio/portfolio-tools.ts → types.ts + utils/storage-paths.ts
```

**禁止**:`src/tools/portfolio/*` → `src/agent/*` 或 `src/tools/registry/*`(反向引用会产生循环)。

### 5.2 v7-2 计划

- 把 `src/tools/registry/domain-tools.ts` 的 `await import('...multi-portfolio.js')` 改成静态 import(已无循环风险)
- 把 `src/tools/export/export-tools.ts:124` 的 `await import('...portfolio/index.js')` 改成静态 import

## 6. src/commands/ 内部规则

### 6.1 投资命令(src/commands/investment/)

- **零 src/tools/* 依赖**(避免 finance → agent 反向引用)
- **零 packages/commands/ 依赖**(避免跨包耦合)
- 只依赖:src/plan/* + src/agent/investment-workflow.ts + src/utils/storage-paths.ts + node:fs/path

### 6.2 旧命令(packages/commands/src/commands/)

- 通过 `packages/commands/src/agent-port.ts` 消费 src/ 能力
- 不允许 `await import('../../../../../src/...')` 跨包导入 (v7-2b 后已全部消除)

## 7. 测试要求

- 每个端口必须有 `agent-port.test.ts` (基础) + `agent-port-extended.test.ts` (v7-2b 新增的 3 个) 验证注册 + 消费
- 每个跨包消费点应该有 e2e 测试(启动 → 端口注册 → 命令消费)
- 禁止 `try/catch` 包住 import,这是循环依赖的征兆

### 7.1 已知测试隔离问题 (TODO: v7-2c 修)

`src/agent/plan-auto-trigger.test.ts` 的 `beforeEach(() => { __resetAgentPorts(); })` 会清空全局 port 注册表,影响同进程运行的其他测试(agent-port 的 PlanMode 相关测试会失败)。**当前状态**:单文件跑全绿;混合跑时部分 fail。

**修复方向**:
- 改成 `beforeEach(() => { saveAgentPorts(); __resetAgentPorts(); })` + `afterEach(() => { restoreAgentPorts(); })`
- 或者把 `__resetAgentPorts` 改成只清空测试自己关心的 port

**不是 v7-2b 引入的回归**——stash 后的 main 也有同样问题。

## 8. 验证清单(PR Review)

- [ ] 无 `await import('../../../../../...')` 跨包动态导入
- [ ] 无用 `try/catch` 包住的 import
- [ ] 无 Layer N → Layer N+1 的反向 import
- [ ] 新端口已加 `src/agent/agent-port.ts` + 本地副本 + 单测
- [ ] typecheck + 关联模块单测全绿
- [ ] src/agent/agent-port.test.ts + agent-port-extended.test.ts 全绿

## 9. v7-2 依赖审计与重构 (Dependency Audit & Refactor)

> 由 [`$comet-open`](/Users/louloulin/.agents/skills/comet-open/SKILL.md) 主线触发:对全项目做严格依赖审查,识别深层相对路径、循环征兆、高耦合模块,并按"模块高内聚"原则重构。

### 9.1 全项目 SCC 审计

通过 Node 实现的 Tarjan SCC 扫描器扫描全部 ~1040 个源文件、~5300 条 import 边:

- **0 个静态循环**(SCC size > 1) — 之前的 v6-1 端口注册表 + 4 级 `await import` 清理已经把回路堵住
- **0 个下层 import 上层**的违反(基于 §2 的层级 rank)
- **5 条 `src/tools/` → `src/utils/` 边**:正常向下依赖
- **1 条 `packages/` → `src/tools/` 边**:遗留,不在 v7-2 范围

### 9.2 深层相对路径清单 (v7-2b 之前 8 个,v7-2b 之后 0 个)

| # | 文件 | 目标 | 现状 (v7-2b 之后) |
|---|------|------|-----------------|
| 1 | `packages/commands/.../agent-impl.ts:45` | `src/agent/subagent-runner.js` | `getSubagentPortLocal()` |
| 2 | `packages/commands/.../agents-impl.ts:25` | `src/agent/subagent-runner.js` | `getSubagentPortLocal()` |
| 3 | `packages/commands/.../exit-plan-impl.ts` | `src/agent/plan-mode-state.js` | `getPlanModePortLocal()` |
| 4 | `packages/commands/.../mcp-add-impl.ts:33` | `src/mcp/registry.js` | `getMcpRegistryPortLocal()` |
| 5 | `packages/commands/.../resume-impl.ts:31` | `src/state/index.js` | `getStatePortLocal()` |
| 6 | `packages/commands/.../steps-impl.ts:18` | `src/agent/plan-mode-state.js` | `getPlanModePortLocal()` |
| 7 | `packages/commands/.../tasks-impl.ts:24` | `src/agent/subagent-runner.js` | `getSubagentPortLocal()` |
| 8 | `packages/commands/.../usage-impl.ts:22` | `src/state/index.js` | `getStatePortLocal()` |

**v7-2b 完成**:0 个剩余 4+ 级相对路径。

### 9.3 高耦合模块:tracker.ts 重构 (v7-2a)

#### 9.3.1 重构前

`src/tools/portfolio/tracker.ts` (212 行) 三个关注点混在一起:
- Pi tool 绑定 + schema(50 行)
- 业务逻辑:add / remove / list / performance / summaryBySector (140 行)
- 模块级单例状态:`portfolioStore: Map`, `positionIdCounter`(20 行)
- 还有一个未使用的 `_model` 参数

**测试**: 0 行。无法单元测试。

#### 9.3.2 重构后 (3 个高内聚模块)

```
src/tools/portfolio/
  store.ts         91 行  PortfolioRepository 接口 + InMemoryPortfolioRepository
                          + getDefaultPortfolioRepository (保留向后兼容)
  service.ts      241 行  PortfolioService (业务逻辑)
                          + PriceProvider 接口 + TusharePriceProvider + NullPriceProvider
  tracker.ts      155 行  createPortfolioTracker (Pi tool wrapper, 80 行真逻辑)
  store.test.ts    8 测试 纯数据层 CRUD + 单例管理
  service.test.ts 10 测试 业务逻辑 + 假 PriceProvider (零 tushare / 零网络)
```

**依赖方向** (DAG, 无回路):
```
tracker.ts (Layer 4 — 工具)
  └─→ service.ts (Layer 4 — 业务)
        └─→ store.ts (Layer 4 — 数据)
        └─→ astock/tushare-client.ts (Layer 4 — 数据源)
```

**API 兼容性**:
- `createPortfolioTracker(_model)` 签名保留(无 breaking change)
- `PORTFOLIO_TRACKER_DESCRIPTION` 常量保留
- `src/tools/index.ts` 的两个 re-export 不需要改

### 9.4 v7-2 下一步

- [x] v7-2a: 拆分 tracker.ts (commit `0633e9d5`)
- [x] v7-2b: 端口注册表扩展 + 8 个深层 import 清除 (本节)
- [ ] v7-2c: 修复 §7.1 的测试隔离问题
- [ ] v7-2d: 把 `src/tools/registry/domain-tools.ts` 和 `src/tools/export/export-tools.ts` 里的 `await import` 改成静态 import
- [ ] v7-3: 复用 `PortfolioService` 接到 investment `review` phase (v6-2 占位)
- [ ] v7-4: 复用 `TusharePriceProvider` 接到 `multi-portfolio.ts`

## 10. 分层规则 + SCC 自动校验 (Sprint v7-4)

### 10.1 背景

v7-2a / v7-2b 阶段手工梳理了 6 个端口 + tracker.ts 三层拆分,但缺一个 CI 级强制闸门。
脆弱的 `const mod = await import('../../../../src/tools/portfolio/tracker.js')` 这类
"深层动态 import"在 review 阶段才能发现,容易再被引入。v7-4 用 `scripts/check-scc.ts`
做硬约束,跑在 CI 的第一关。

### 10.2 分层定义 (5 层,DAG,严禁反向)

| Layer | 路径 | 职责 | 例子 |
|---|---|---|---|
| 1 | `src/utils/` | 纯函数、path/fs helper | `stock-code.ts`, `config-merge.ts` |
| 2 | `src/state/`, `src/session/`, `src/portfolio/`, `src/storage/`, `src/telemetry/`, `src/hooks/`, `src/mcp/` | 基础服务 + 持久化 | `AppStateStore`, `SessionManager`, `PortfolioRepository` |
| 3 | `src/tools/`, `src/skills/` | 业务工具 (Pi adapters, 计算函数) | `sandbox-engine.ts`, `attribution.ts`, `financial_search` |
| 4 | `src/runtime/pi/`, `src/plan/`, `src/agent/`, `src/multi-agent/`, `src/worktree/`, `src/daemon/`, `src/code-archaeology/` | Pi-backed 业务编排 | `agent-session-factory.ts`, `plan-executor.ts`, `investment-workflow.ts` |
| 5 | `src/commands/`, `src/controllers/`, `src/cli.tsx`, `src/bridge/`, `src/stdio/`, `src/gateway/` | 顶层入口 (CLI/commands/MCP bridge) | `cli.tsx`, `commands.ts`, `bridgeStatusUtil.ts` |

**规则**:
- Layer N → Layer M,要求 N >= M(高层依赖低层或同层)
- Layer N → Layer M where N < M 视为 **back-reference**,CI 失败
- 同层互引 OK(例如 `src/agent/*` 之间互相 import)
- 跨包只允许 `packages/<pkg>/src/index.ts` 这一个公开入口

### 10.3 检查项 (`scripts/check-scc.ts`)

1. **强连通分量 (SCC) > 1** → 循环依赖。Tarjan's algorithm,O(V+E)。
2. **层违规** → 低层反向依赖高层 (Layer N → Layer M where N < M)。
3. **深层动态 import (3+ 级 ../)** → 脆弱的跨包/跨层耦合,违反 v6-1 端口模式。
4. **跨包非公开路径** → `packages/<pkg>/src/X/Y.ts` 而不是 `index.ts`。

`bun run lint:scc` 跑这 4 项,`--strict` 把所有警告也变成错误。
`bun run ci` = `lint && typecheck && test`,本地一遍跑完所有闸门。

### 10.4 v7-4 修过的真实问题

跑 `lint:scc` 时**主动发现**的 1 个层违规:

```
src/utils/config-merge.test.ts (L1) → src/agent/investment-config.ts (L4)
```

根因:这个 86 行的测试文件虽然路径在 `src/utils/`,但实际上**只测 `investment-config.ts`**
(7 个 `await import('../agent/investment-config')`),从未 import 任何 utils 函数。
属于早期重构遗留,测试被遗忘在错层。

**修复**:`git rm src/utils/config-merge.test.ts` — 直接删除。
`src/agent/investment-config.test.ts` 已经有完整的 5 个原版测试覆盖同一模块,无需重复。

修复后:
- 0 循环依赖
- 0 层违规
- 0 深层动态 import
- 0 跨包非公开路径
- 1220 文件扫描 73 条边,全部合法

### 10.5 高内聚模块的范式 (`tracker.ts` v7-2a split)

任何 ≥200 行的混合文件按此模式拆 3 层:

```
<feature>/
  store.ts          纯数据层,CRUD + 单例,零外部依赖
  service.ts        业务逻辑层,持有 store + provider,零 Agent runtime 依赖
  <feature>.ts      工具包装层,Pi tool / CLI 绑定
  *.test.ts         按代码所在层放,严格遵守层约束
```

3 个模块的依赖方向:

```
<feature>.ts (工具)
  └─→ service.ts (业务)
        └─→ store.ts (数据)
        └─→ <data-source>.ts (外部数据)
```

`scripts/check-scc.ts` 用静态分析强制这条 DAG 不可逆。

### 10.6 CI 集成

`.github/workflows/ci.yml` 现在跑 3 个并行任务:

```yaml
matrix:
  include:
    - task: lint-scc
      command: bun run lint:scc
    - task: typecheck
      command: bun run typecheck
    - task: test
      command: bun test
```

任何 PR 改了一行 `import` 引入循环/反向依赖,CI 红。
