---
name: upup-multi-agent
description: UpUp多代理系统。用于理解子Agent创建、任务协调、Agent团队管理、跨Agent通信。当需要创建子Agent、协调多个Agent、处理复杂多步骤任务时触发。
---

# UpUp Multi-Agent - 多代理系统 Skill

## 概述

UpUp支持创建子Agent进行并行任务执行，适用于复杂研究、分析和协调场景。

## 架构

```
src/multi-agent/
├── agent-factory.ts      # Agent工厂
├── coordinator.ts       # 任务协调器
├── agent-registry.ts    # Agent注册表
├── skill-tracker.ts     # 技能使用追踪
├── team-manager.ts      # 团队管理
├── scheduler.ts        # 任务调度
├── event-bus.ts        # 事件总线
├── persistence.ts      # 持久化
└── backends/          # 后端实现
```

## 创建子Agent

### AgentFactory

```typescript
import { createSubAgent } from '@/multi-agent/agent-factory';

const subAgent = await createSubAgent({
  name: 'researcher',
  task: 'Research TSLA financials',
  allowedTools: ['get_financials', 'get_market_data'],
  model: 'gpt-5.4-mini',  // 可指定不同模型
});

const result = await subAgent.run();
```

### 配置选项

```typescript
interface SubAgentConfig {
  name: string
  task: string
  allowedTools?: string[]      // 限制工具
  excludedTools?: string[]     // 排除工具
  model?: string               // 指定模型
  maxIterations?: number       // 最大迭代
  memoryEnabled?: boolean
  parentContext?: Message[]    // 父上下文
}
```

## 协调器模式

### 1. Sequential (顺序)

```typescript
const coordinator = new Coordinator({
  strategy: 'sequential',
  agents: [researcher, analyzer, reporter]
});

await coordinator.run(task);
```

### 2. Parallel (并行)

```typescript
const coordinator = new Coordinator({
  strategy: 'parallel',
  agents: [analyst1, analyst2, analyst3]
});

await coordinator.run(task);
// 所有Agent并行执行，结果汇总
```

### 3. Hierarchical (层级)

```typescript
// Manager -> Supervisor -> Workers
const team = new TeamManager({
  manager: orchestrator,
  workers: [researcher1, researcher2, analyzer]
});

await team.run(task);
```

## Agent注册表

```typescript
// 注册已创建的Agent
agentRegistry.register(subAgent, {
  role: 'researcher',
  capabilities: ['financial_analysis', 'market_research']
});

// 查找合适Agent
const researcher = agentRegistry.find({
  capabilities: ['financial_analysis']
});
```

## 事件系统

```typescript
// 监听Agent事件
eventBus.on('agent:start', ({ agentId, task }) => {...});
eventBus.on('agent:progress', ({ agentId, progress }) => {...});
eventBus.on('agent:complete', ({ agentId, result }) => {...});
eventBus.on('agent:error', ({ agentId, error }) => {...});

// 多Agent事件
eventBus.on('team:taskassigned', ({ teamId, agentId }) => {...});
eventBus.on('team:sync', ({ teamId }) => {...});
```

## 结果聚合

```typescript
interface TeamResult {
  teamId: string
  duration: number
  agentResults: {
    agentId: string
    role: string
    result: string
    status: 'success' | 'failed' | 'timeout'
  }[]
  combinedAnswer: string
}
```

## 技能追踪

```typescript
skillTracker.track(subAgentId, {
  skillName: 'dcf-valuation',
  invocationPoint: 'initial',
  result: 'success'
});

// 查询使用历史
const usage = skillTracker.getUsage(subAgentId);
```

## 持久化

```typescript
// 恢复Agent状态
const state = await persistence.loadAgentState(agentId);
const agent = await AgentFactory.restore(state);

// 保存检查点
await persistence.saveCheckpoint(agentId, state);
```

## 最佳实践

### 何时使用多Agent

✓ 复杂任务的子任务可并行
✓ 需要不同专业领域的Agent
✓ 长任务需要检查点
✓ 研究报告需要多角度分析

### 何时不用多Agent

✗ 简单单步任务
✗ 资源受限环境
✗ 需要严格顺序执行

### 工具限制

建议为子Agent配置`allowedTools`:
```typescript
// 研究Agent
allowedTools: ['get_financials', 'get_market_data', 'web_search']

// 分析Agent
allowedTools: ['get_financials', 'browser']

// 报告Agent
allowedTools: ['write_file']
```

## 错误处理

```typescript
try {
  await coordinator.run(task);
} catch (error) {
  if (error instanceof AgentTimeoutError) {
    // 处理超时
  } else if (error instanceof PartialResultError) {
    // 部分结果可返回
    const partial = error.getPartialResults();
  }
}
```
