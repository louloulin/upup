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

跨 `packages/commands/` ↔ `src/agent/` 的访问必须通过**端口注册表**(globalThis 上的 typed registry),不允许直接相对路径 import。

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

## 3. 跨包端口注册表

### 3.1 位置

| 文件 | 角色 |
|------|------|
| `src/agent/agent-port.ts` | 端口接口 + 注册表(globalThis.__upupAgentPorts) |
| `packages/commands/src/agent-port.ts` | 端口接口本地副本(只 4 行的 interface) |

### 3.2 当前注册的端口

| 端口 | 实现方 | 消费方 |
|------|-------|-------|
| `PlanModePort` | `src/agent/plan-mode-state.ts`(模块加载时自注册) | `packages/commands/src/commands/plan/plan-impl.ts` |
| `PlanModePort` | 同上 | `packages/commands/src/commands/add-step/add-step-impl.ts` |
| `AgentConfigPort` | (v6 计划) | (v6 计划) |
| `SessionPort` | (v6 计划) | (v6 计划) |

### 3.3 添加新端口的流程

1. 在 `src/agent/agent-port.ts` 加 interface + register/getter
2. 在 `packages/commands/src/agent-port.ts` 加本地副本(4 行 interface)
3. 在 `src/agent/` 某个模块末尾 `import { registerFoo } from './agent-port.js'` + `registerSelf()`
4. 在 `packages/commands/` 用 `getFooPortLocal()` 消费,不需要 import src/

### 3.4 为什么用 globalThis

- **零静态依赖**:packages/commands/ 不需要在编译期 resolve `src/agent/`
- **零相对路径**:不会出现 `../../../../src/...` 这种脆弱的深层路径
- **类型安全**:TypeScript 通过本地 interface 副本保证类型一致(测试套件保证不漂移)
- **可测试**:`__resetAgentPorts()` 让测试可以隔离

## 4. 已修复的循环依赖征兆

| 位置 | 修复前 | 修复后 |
|------|-------|-------|
| `packages/commands/src/commands/plan/plan-impl.ts:26` | `await import('../../../../src/agent/plan-mode-state.js')` (4 级,实际解析路径不存在,被 try/catch 吞掉) | `getPlanModePortLocal()` 通过本地端口 |
| `packages/commands/src/commands/add-step/add-step-impl.ts:17` | 同上 | 同上 |

**修复前症状**:`/plan` 和 `/add-step` 命令的 plan mode 状态检测**从未工作过**,因为相对路径错误(4 级应改为 5 级,实际解析到 `packages/src/agent/...` 不存在),`try/catch` 静默吞掉。所有 plan 命令在 `packages/commands/` 侧的状态判断都返回 fallback 值。

**修复后**:port 注册表在 `src/agent/plan-mode-state.ts` 模块加载时自注册,`packages/commands/` 通过 globalThis 读取,零路径耦合。

## 5. src/tools/ 内部规则

### 5.1 允许的依赖方向

```
src/tools/portfolio/index.ts        → src/tools/portfolio/{portfolio-tools,multi-portfolio,types}.ts
src/tools/portfolio/*.ts            → src/tools/types.ts
src/tools/portfolio/*.ts            → src/tools/astock/tushare-client.ts (单向下游)
src/tools/portfolio/*.ts            → src/utils/storage-paths.ts
src/tools/portfolio/*.ts            → 外部:@langchain/core/tools, zod
```

**禁止**:`src/tools/portfolio/*` → `src/agent/*` 或 `src/tools/registry/*`(反向引用会产生循环)。

### 5.2 已有的边界设计

- `src/tools/registry/domain-tools.ts` 中 `multi-portfolio.js` 用 `await import` 懒加载(已用 try/catch 包住,允许运行时缺失)
- `src/tools/export/export-tools.ts:124` 中 `portfolio/index.js` 用 `await import` 懒加载(同上)

**v6 重构目标**:把这两个 `await import` 也改成端口注入模式,完全消除动态 import。

## 6. src/commands/ 内部规则

### 6.1 投资命令(src/commands/investment/)

- **零 src/tools/* 依赖**(避免 finance → agent 反向引用)
- **零 packages/commands/ 依赖**(避免跨包耦合)
- 只依赖:src/plan/* + src/agent/investment-workflow.ts + src/utils/storage-paths.ts + node:fs/path

### 6.2 旧命令(packages/commands/src/commands/)

- 通过 `packages/commands/src/agent-port.ts` 消费 src/agent/ 能力
- 不允许 `await import('../../../../src/...')` 跨包导入

## 7. 测试要求

- 每个端口必须有 `agent-port.test.ts` 验证注册 + 消费
- 每个跨包消费点必须有 e2e 测试(启动 → 端口注册 → 命令消费)
- 禁止 `try/catch` 包住 import,这是循环依赖的征兆

## 8. 验证清单(PR Review)

- [ ] 无 `await import('../../../../...')` 跨包动态导入
- [ ] 无用 `try/catch` 包住的 import
- [ ] 无 Layer N → Layer N+1 的反向 import
- [ ] 新端口已加 `src/agent/agent-port.ts` + 本地副本 + 单测
- [ ] typecheck + 关联模块单测全绿

---

## 9. v7-2 依赖审计与重构 (Dependency Audit & Refactor)

> 由 [`$comet-open`](/Users/louloulin/.agents/skills/comet-open/SKILL.md) 主线触发:对全项目做严格依赖审查,识别深层相对路径、循环征兆、高耦合模块,并按"模块高内聚"原则重构。

### 9.1 全项目 SCC 审计

通过 Node 实现的 Tarjan SCC 扫描器扫描全部 ~1040 个源文件、~5300 条 import 边:

- **0 个静态循环**(SCC size > 1) — 之前的 v6-1 端口注册表 + 4 级 `await import` 清理已经把回路堵住
- **0 个下层 import 上层**的违反(基于 §2 的层级 rank)
- **5 条 `src/tools/` → `src/utils/` 边**:正常向下依赖
- **1 条 `packages/` → `src/tools/` 边**:遗留,不在 v7-2 范围

### 9.2 深层相对路径清单 (4 级及以上)

> 这一节是 v7-2 收尾的**主要待办**。所有 4+ 级 `../` 都是循环依赖征兆(v6-1 commit 修复了 2 个,还剩 8 个)。

| # | 文件 | 目标 | 现状 |
|---|------|------|------|
| 1 | `packages/commands/src/commands/agent/agent-impl.ts:45` | `../../../../src/agent/subagent-runner.js` | `getDefaultSubagentRunner` |
| 2 | `packages/commands/src/commands/agents/agents-impl.ts:25` | `../../../../../src/agent/subagent-runner.js` | `getDefaultSubagentRunner` |
| 3 | `packages/commands/src/commands/exit-plan/exit-plan-impl.ts:18,45` | `../../../../src/agent/plan-mode-state.js` | `getPlanModeState` (端口已存在,待切换) |
| 4 | `packages/commands/src/commands/mcp-add/mcp-add-impl.ts:33` | `../../../../../src/mcp/registry.js` | `getMCPStatus` |
| 5 | `packages/commands/src/commands/resume/resume-impl.ts:31` | `../../../../../src/state/index.js` | `getSessionManager` |
| 6 | `packages/commands/src/commands/steps/steps-impl.ts:18` | `../../../../src/agent/plan-mode-state.js` | `getPlanModeState` (端口已存在) |
| 7 | `packages/commands/src/commands/tasks/tasks-impl.ts:24` | `../../../../../src/agent/subagent-runner.js` | `getDefaultSubagentRunner` |
| 8 | `packages/commands/src/commands/usage/usage-impl.ts:22` | `../../../../../src/state/index.js` | `getAppState` / `formatCost` / `formatTokens` |

**修复模式**(v7-2 后续 sprint):
1. 在 `src/agent/agent-port.ts` 加 `SubagentPort` / `McpRegistryPort` / `StatePort` interface
2. 在 `src/agent/subagent-runner.ts` / `src/mcp/registry.ts` / `src/state/index.ts` 模块末尾自注册
3. 在 `packages/commands/src/agent-port.ts` 加本地副本(4 行 interface)
4. 8 个调用点改为 `getXxxPortLocal()` 调用,删除 `await import('../../../../../...')`

### 9.3 高耦合模块:tracker.ts 重构 (v7-2a)

#### 9.3.1 重构前

`src/tools/portfolio/tracker.ts` (212 行) 三个关注点混在一起:
- LangChain tool 绑定 + schema(50 行)
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
  tracker.ts      155 行  createPortfolioTracker (LangChain tool wrapper, 80 行真逻辑)
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

**好处**:
- store 可以单测,不需要 LangChain / tushare
- service 可以单测,使用 `NullPriceProvider` / `StubPriceProvider`
- tracker 只负责 schema 绑定和错误包装
- 未来 drop in `FileBackedPortfolioRepository` / `MultiPortfolioRepository` 不需要改 service / tracker
- 移除了未使用的 `_model` 参数(改为可选 overrides 对象)

**API 兼容性**:
- `createPortfolioTracker(_model)` 签名保留(无 breaking change)
- `PORTFOLIO_TRACKER_DESCRIPTION` 常量保留
- `src/tools/index.ts` 的两个 re-export 不需要改

#### 9.3.3 验证

| 检查 | 结果 |
|------|------|
| `bun run typecheck` | 通过(零错误) |
| `bun test src/tools/portfolio/store.test.ts` | 8/8 pass |
| `bun test src/tools/portfolio/service.test.ts` | 10/10 pass |
| `bun test src/tools/portfolio/` (全模块) | 63/63 pass,零回归 |
| `createPortfolioTracker` 调用方影响 | 仅 `src/tools/index.ts`,API 兼容 |

### 9.4 v7-2 下一步

1. **v7-2b**: 扩展 `agent-port.ts` 注册 `SubagentPort` / `McpRegistryPort` / `StatePort`,清掉 §9.2 的 8 个深层 import
2. **v7-2c**: 把 `src/tools/registry/domain-tools.ts` 和 `src/tools/export/export-tools.ts` 里的 `await import('...multi-portfolio.js')` / `await import('...portfolio/index.js')` 改成端口注入(§5.2)
3. **v7-3**: 复用新的 `PortfolioService` 接到 investment `review` phase (v6-2 占位)
4. **v7-4**: 复用 `TusharePriceProvider` 接到 `src/tools/portfolio/multi-portfolio.ts`(目前每个 portfolio 自己的价源逻辑重复)
