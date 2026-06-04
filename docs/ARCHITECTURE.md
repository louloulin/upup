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
