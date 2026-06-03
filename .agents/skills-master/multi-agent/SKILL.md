---
name: multi-agent
description: |
  多代理AI系统。当需要创建子Agent、实现任务协调、构建Agent团队、处理并行执行、管理跨Agent通信时触发。
  包括：Agent工厂、协调器模式、团队管理、事件总线、结果聚合。
---

# Multi-Agent System - 多代理系统

## 核心概念

多代理系统通过创建多个专业Agent并行或协同工作，处理复杂任务。

## 架构设计

```
MultiAgentSystem
├── AgentFactory          # Agent创建工厂
├── Coordinator          # 任务协调器
├── AgentRegistry        # Agent注册表
├── TeamManager         # 团队管理
├── EventBus           # 事件总线
└── Persistence        # 状态持久化
```

## Agent工厂

### 创建子Agent

```typescript
interface SubAgentConfig {
  name: string
  task: string
  allowedTools?: string[]      // 限制可用工具
  excludedTools?: string[]     // 排除工具
  model?: string               // 指定模型
  maxIterations?: number       // 最大迭代
  memoryEnabled?: boolean
  parentContext?: Message[]    // 父上下文
}

async function createSubAgent(config: SubAgentConfig): Promise<Agent> {
  const agent = new Agent({
    model: config.model ?? defaultModel,
    maxIterations: config.maxIterations ?? 50,
    memoryEnabled: config.memoryEnabled ?? true,
    toolFilter: config.allowedTools
  })
  
  // 设置父上下文
  if (config.parentContext) {
    agent.setContext(config.parentContext)
  }
  
  return agent
}
```

### 配置示例

```typescript
// 研究Agent
const researcher = await createSubAgent({
  name: 'researcher',
  task: 'Research TSLA financials',
  allowedTools: ['get_financials', 'get_market_data', 'web_search'],
  model: 'gpt-5.4-mini'
})

// 分析Agent
const analyzer = await createSubAgent({
  name: 'analyzer',
  task: 'Analyze financial data',
  allowedTools: ['get_financials', 'calculator'],
  model: 'gpt-5.4'
})

// 执行
const result = await researcher.run()
```

## 协调器模式

### 1. Sequential (顺序)

```typescript
class SequentialCoordinator {
  private agents: Agent[]
  
  async run(task: string): Promise<string> {
    let context = task
    
    for (const agent of this.agents) {
      context = await agent.run(context)
    }
    
    return context
  }
}

// 使用
const coordinator = new SequentialCoordinator({
  agents: [researcher, analyzer, reporter]
})
const result = await coordinator.run(task)
```

### 2. Parallel (并行)

```typescript
class ParallelCoordinator {
  private agents: Agent[]
  
  async run(task: string): Promise<string> {
    const tasks = this.agents.map(agent => agent.run(task))
    const results = await Promise.all(tasks)
    
    return this.aggregate(results)
  }
  
  private aggregate(results: string[]): string {
    // 聚合逻辑
    return results.join('\n---\n')
  }
}
```

### 3. Hierarchical (层级)

```typescript
class HierarchicalCoordinator {
  private manager: Agent
  private workers: Agent[]
  
  async run(task: string): Promise<string> {
    // Manager分解任务
    const subtasks = await this.manager.run(`
      Break this task into subtasks for specialized agents:
      ${task}
    `)
    
    // 并行执行子任务
    const workerTasks = subtasks.map(subtask => 
      this.findBestWorker(subtask).run(subtask)
    )
    const workerResults = await Promise.all(workerTasks)
    
    // Manager汇总
    return this.manager.run(`
      Synthesize these results into a coherent response:
      ${workerResults.join('\n')}
    `)
  }
}
```

## Agent注册表

```typescript
interface AgentRegistration {
  agentId: string
  role: string
  capabilities: string[]
  status: 'idle' | 'running' | 'completed' | 'failed'
}

class AgentRegistry {
  private agents: Map<string, AgentRegistration> = new Map()
  
  register(agent: Agent, config: {
    role: string
    capabilities: string[]
  }): void {
    this.agents.set(agent.id, {
      agentId: agent.id,
      role: config.role,
      capabilities: config.capabilities,
      status: 'idle'
    })
  }
  
  find(criteria: { capabilities?: string[] }): AgentRegistration[] {
    return Array.from(this.agents.values()).filter(a => {
      if (criteria.capabilities) {
        return criteria.capabilities.every(c => 
          a.capabilities.includes(c)
        )
      }
      return true
    })
  }
}
```

## 事件总线

```typescript
type AgentEvent = 
  | { type: 'agent:start'; agentId: string; task: string }
  | { type: 'agent:progress'; agentId: string; progress: number }
  | { type: 'agent:complete'; agentId: string; result: string }
  | { type: 'agent:error'; agentId: string; error: Error }
  | { type: 'team:sync'; teamId: string }
  | { type: 'team:taskassigned'; teamId: string; agentId: string }

class EventBus {
  private listeners: Map<string, Function[]> = new Map()
  
  emit(event: AgentEvent): void {
    const handlers = this.listeners.get(event.type) ?? []
    handlers.forEach(h => h(event))
  }
  
  on(eventType: string, handler: Function): void {
    const handlers = this.listeners.get(eventType) ?? []
    handlers.push(handler)
    this.listeners.set(eventType, handlers)
  }
}

// 使用
eventBus.on('agent:complete', ({ agentId, result }) => {
  console.log(`Agent ${agentId} completed: ${result}`)
})
```

## 结果聚合

### TeamResult格式

```typescript
interface TeamResult {
  teamId: string
  duration: number
  agentResults: AgentResult[]
  combinedAnswer: string
  errors: Error[]
}

interface AgentResult {
  agentId: string
  role: string
  result: string
  status: 'success' | 'failed' | 'timeout'
  duration: number
  toolsUsed: string[]
}

function aggregateTeamResults(results: AgentResult[]): TeamResult {
  return {
    teamId: generateId(),
    duration: sum(results.map(r => r.duration)),
    agentResults: results,
    combinedAnswer: synthesize(results),
    errors: results
      .filter(r => r.status === 'failed')
      .map(r => r.error)
  }
}
```

## 技能追踪

```typescript
interface SkillUsage {
  skillName: string
  invocationPoint: 'initial' | 'mid' | 'final'
  result: 'success' | 'failed'
  duration: number
}

class SkillTracker {
  private usage: Map<string, SkillUsage[]> = new Map()
  
  track(agentId: string, usage: SkillUsage): void {
    const agentUsage = this.usage.get(agentId) ?? []
    agentUsage.push(usage)
    this.usage.set(agentId, agentUsage)
  }
  
  getUsage(agentId: string): SkillUsage[] {
    return this.usage.get(agentId) ?? []
  }
}
```

## 错误处理

```typescript
class AgentTimeoutError extends Error {
  constructor(agentId: string, timeout: number) {
    super(`Agent ${agentId} timed out after ${timeout}ms`)
    this.name = 'AgentTimeoutError'
  }
}

class PartialResultError extends Error {
  results: AgentResult[]
  
  constructor(results: AgentResult[]) {
    super(`Partial results available: ${results.length} agents completed`)
    this.results = results
  }
}

// 处理
try {
  await team.run(task)
} catch (error) {
  if (error instanceof PartialResultError) {
    const partial = error.results
    console.log(`${partial.filter(r => r.status === 'success').length} completed`)
  }
}
```

## 触发场景

### 什么时候使用

- 复杂任务可分解并行
- 需要不同专业领域
- 长任务需要检查点
- 研究需要多角度分析

### 什么时候不用

- 简单单步任务
- 资源受限环境
- 需要严格顺序执行

## 工具限制策略

```typescript
// 按角色限制工具
const roleToolRestrictions = {
  researcher: ['get_financials', 'get_market_data', 'web_search', 'browser'],
  analyst: ['get_financials', 'calculator', 'write_file'],
  writer: ['read_file', 'write_file']
}
```
