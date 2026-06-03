---
name: agent-loop
description: |
  AI Agent核心循环架构与实现。当需要理解AI Agent如何工作、构建Agent系统、设计工具调用循环、处理上下文管理、实现流式响应、处理循环检测和恢复时触发。
  包括：工具执行、上下文压缩、Scratchpad、日志记录、Agent状态管理。
---

# Agent Loop - AI Agent核心循环实现

## 核心概念

Agent循环是AI系统执行任务的核心机制，循环迭代执行工具直到生成最终答案。

## 循环流程

```
用户查询
    ↓
1. 初始化上下文 & Scratchpad
    ↓
2. 主循环 (最多N次迭代)
    ├── LLM生成响应
    ├── 解析工具调用
    ├── 执行工具 (并发/串行)
    ├── 记录结果到Scratchpad
    ├── 循环检测
    └── 上下文压缩检查
    ↓
3. 生成最终答案 (无工具)
    ↓
返回结果
```

## Scratchpad (工具结果追踪)

**目的**: 记录所有工具执行结果，支持JSONL持久化，用于调试和历史追踪。

```typescript
class Scratchpad {
  private entries: ScratchpadEntry[] = []
  
  addToolResult(toolName: string, args: Record<string, unknown>, result: string) {
    this.entries.push({
      type: 'tool_result',
      toolName,
      args,
      result: this.parseResult(result),
      timestamp: new Date().toISOString()
    })
  }
  
  getToolResults(): ToolResult[] {
    return this.entries.filter(e => e.type === 'tool_result')
  }
}
```

## 工具执行器

### 并发安全映射

```typescript
interface ConcurrencyMap {
  // 只读工具 - 可并发
  get_financials: true,
  get_market_data: true,
  web_search: true,
  memory_search: true,
  
  // 写操作 - 需串行
  write_file: false,
  run_command: false,
  memory_update: false
}
```

### 执行模式

```typescript
async executeTool(tool: Tool, args: object, concurrencySafe: boolean) {
  if (concurrencySafe) {
    // 并发执行
    return Promise.all([tool.func(args)])
  } else {
    // 串行执行
    return tool.func(args)
  }
}
```

## 上下文压缩

### Microcompact (每轮)

去除冗余格式，压缩空白，合并连续消息。

### Full Compaction (阈值触发)

```typescript
interface CompactionConfig {
  minToolResults: 10,           // 最小工具结果数
  maxContextSize: 150000,       // 最大上下文(tokens)
  keepRecentResults: 5,         // 保留最近结果数
  summaryThreshold: 0.7         // 摘要触发阈值
}

function shouldCompact(contextSize: number, toolCount: number): boolean {
  return contextSize > MAX_CONTEXT || 
         toolCount >= MIN_TOOL_RESULTS
}
```

### 压缩策略

1. 保留最近N条工具结果
2. 总结早期结果为摘要
3. 保留关键数据点

## 循环检测与恢复

### 检测机制

```typescript
class LoopDetector {
  private callHistory: Map<string, number> = new Map()
  private lastArgs: Map<string, string> = new Map()
  
  detect(toolName: string, args: object): RecoverySuggestion | null {
    const argsHash = hashArgs(args)
    const lastArgs = this.lastArgs.get(toolName)
    
    // 相同调用 + 相同参数
    if (this.callHistory.get(toolName) > MAX_CALLS) {
      return {
        strategy: 'suggest_different_tool',
        message: `Consider trying a different approach`
      }
    }
    
    // 相似查询检测
    if (similarity(argsHash, lastArgs) > SIMILARITY_THRESHOLD) {
      return {
        strategy: 'suggest_refinement',
        message: `Query is similar to previous attempts`
      }
    }
    
    return null
  }
}
```

### 恢复策略

| 检测问题 | 恢复策略 |
|---------|---------|
| 工具调用过多 | 建议其他工具或直接回答 |
| 相似查询重复 | 提示数据限制 |
| 连续失败 | 返回部分结果或错误信息 |

## 流式处理

```typescript
interface StreamingConfig {
  onChunk: (chunk: string) => void
  onToolStart: (tool: string) => void
  onToolEnd: (tool: string, result: string) => void
  onThinking: (content: string) => void
}

async function* streamResponse(messages: Message[], config: StreamingConfig) {
  const stream = await llm.stream(messages)
  
  for await (const chunk of stream) {
    if (chunk.type === 'text') {
      config.onChunk(chunk.content)
    } else if (chunk.type === 'tool_call') {
      config.onToolStart(chunk.tool)
      const result = await executeTool(chunk.tool, chunk.args)
      config.onToolEnd(chunk.tool, result)
      yield { type: 'tool_result', result }
    }
  }
}
```

## 工具限制

```typescript
interface ToolLimit {
  maxCallsPerTool: number       // 默认3
  similarityThreshold: number   // 默认0.7
}

function canCallTool(toolName: string, query?: string): ToolCallStatus {
  const count = scratchpad.getCallCount(toolName)
  
  if (count >= MAX_CALLS) {
    return {
      allowed: true,  // 软限制 - 仍允许但警告
      warning: `Consider alternative approaches`
    }
  }
  
  return { allowed: true }
}
```

## 事件系统

```typescript
type AgentEvent = 
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; tool: string; args: object }
  | { type: 'tool_end'; tool: string; result: string }
  | { type: 'context_compacted'; summary: string }
  | { type: 'loop_detected'; suggestion: string }
  | { type: 'answer_start' }
  | { type: 'done'; answer: string }
```

## 配置选项

```typescript
interface AgentConfig {
  maxIterations?: number      // 默认50
  memoryEnabled?: boolean     // 默认true
  toolConcurrencyMap?: Map<string, boolean>
  compactionThreshold?: number
  signal?: AbortSignal
  toolFilter?: string[]       // 限制可用工具
}
```

## 最佳实践

### 什么时候触发这个Skill

- 构建AI Agent系统
- 实现工具调用循环
- 处理上下文溢出
- 实现循环检测
- 设计流式响应

### 实现建议

1. **Scratchpad持久化**: 使用JSONL格式便于追加和恢复
2. **并发执行**: 利用Promise.all并发执行只读工具
3. **软限制**: 工具限制使用警告而非硬阻止
4. **渐进压缩**: 不要一次性压缩，给LLM适应时间

---

## 真实例子

### 例子1: 简单问答Agent

```typescript
import { Agent } from './agent'
import { createOpenAI } from './llm'

// 初始化LLM
const llm = createOpenAI({ model: 'gpt-4' })

// 创建Agent
const agent = new Agent({
  llm,
  maxIterations: 10,
  tools: [calculator, dateTool]
})

// 运行
const result = await agent.run('What is 123 * 456?')
console.log(result) // "123 * 456 = 56,088"
```

### 例子2: 带记忆的对话Agent

```typescript
const agent = new Agent({
  llm,
  memoryEnabled: true,
  scratchpad: {
    persistPath: './.scratchpad'
  }
})

// 上下文自动在迭代间保持
const result = await agent.run('Remember I prefer dark mode')
await agent.run('What theme should I use?')
// → "Based on your preference for dark mode..."
```

### 例子3: 工具循环处理

```typescript
async function processWithTools(query: string) {
  const scratchpad = new Scratchpad(query)
  const maxIterations = 5
  
  for (let i = 0; i < maxIterations; i++) {
    // 1. 生成响应
    const response = await llm.generate(messages)
    
    // 2. 检查是否有工具调用
    if (!response.toolCalls) {
      return response.text
    }
    
    // 3. 执行工具
    for (const call of response.toolCalls) {
      const result = await executeTool(call.tool, call.args)
      scratchpad.addToolResult(call.tool, call.args, result)
      messages.push({ role: 'tool', content: result })
    }
    
    // 4. 检查循环
    if (detectLoop(scratchpad)) {
      return 'Unable to complete - possible loop detected'
    }
  }
}
```

### 例子4: 流式响应处理

```typescript
const stream = await agent.run('Research quantum computing', {
  streaming: true
})

for await (const event of stream) {
  switch (event.type) {
    case 'thinking':
      console.log('💭', event.content)
      break
    case 'tool_start':
      console.log('🔧', event.tool)
      break
    case 'tool_end':
      console.log('✅', event.tool)
      break
    case 'answer':
      process.stdout.write(event.content)
      break
  }
}
```

### 例子5: 上下文压缩实战

```typescript
class ContextCompactor {
  compact(messages: Message[], config: CompactionConfig): Message[] {
    // 1. 如果消息数量少，直接返回
    if (messages.length < config.minMessages) {
      return messages
    }
    
    // 2. 分离系统消息和对话
    const [system, conversation] = splitMessages(messages)
    
    // 3. 保留最近的对话
    const recent = conversation.slice(-config.keepRecent)
    
    // 4. 总结早期对话
    const early = conversation.slice(0, -config.keepRecent)
    const summary = this.summarize(early)
    
    return [
      ...system,
      { role: 'system', content: `[Earlier conversation summarized: ${summary}]` },
      ...recent
    ]
  }
}
```

### 例子6: 循环检测配置

```typescript
const agent = new Agent({
  // 循环检测配置
  loopDetection: {
    maxSameToolCalls: 3,        // 同一工具最多调用3次
    maxSimilarQueries: 2,       // 相似查询最多2次
    similarityThreshold: 0.8,    // 相似度阈值
  },
  // 恢复策略
  recoveryStrategies: [
    { type: 'suggest_different_tool', priority: 1 },
    { type: 'acknowledge_data_limit', priority: 2 },
    { type: 'proceed_with_partial', priority: 3 }
  ]
})
```

### 例子7: 完整Agent工厂

```typescript
function createResearchAgent(config: {
  model: string
  apiKey: string
}) {
  return new Agent({
    llm: createOpenAI({ model: config.model, apiKey: config.apiKey }),
    maxIterations: 20,
    tools: [get_financials, get_market_data, web_search, browser],
    concurrencyMap: new Map([
      [get_financials.name, true],
      [get_market_data.name, true],
      [web_search.name, true],
      [browser.name, false]
    ]),
    memoryEnabled: true,
    compactionThreshold: 100000,
    loopDetection: { maxSameToolCalls: 3 }
  })
}
```
