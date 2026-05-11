# UP SDK 使用指南

> 版本: 1.0.0 | 更新: 2026-05-11

---

## 目录

1. [快速开始](#1-快速开始)
2. [核心 API](#2-核心-api)
3. [工具注册](#3-工具注册)
4. [Hooks 系统](#4-hooks-系统)
5. [运行模式](#5-运行模式)
6. [示例代码](#6-示例代码)
7. [最佳实践](#7-最佳实践)

---

## 1. 快速开始

### 1.1 安装

```bash
# 使用 bun
bun add @upup/sdk

# 或使用 npm
npm install @upup/sdk
```

### 1.2 基本使用

```typescript
import { Agent, defineTool } from '@upup/sdk'

async function main() {
  // 1. 创建 Agent
  const agent = new Agent({
    model: 'claude-sonnet-4',
    maxIterations: 10,
  })

  // 2. 连接 upup-agent
  await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])

  // 3. 注册工具
  agent.registerTool(defineTool({
    name: 'get_time',
    description: '获取当前时间',
    inputSchema: {},
    handler: async () => ({ time: new Date().toISOString() }),
  }))

  // 4. 运行
  const result = await agent.run({
    messages: [{ role: 'user', content: '现在几点了？' }],
  })

  console.log(result.output)

  // 5. 关闭
  await agent.disconnect()
}

main()
```

---

## 2. 核心 API

### 2.1 Agent 类

```typescript
import { Agent } from '@upup/sdk'

// 创建实例
const agent = new Agent(config?: AgentConfig)

// 连接
await agent.connect(command: string, args: string[])

// 断开连接
await agent.disconnect()

// 运行（非流式）
const result = await agent.run(params: RunParams): Promise<RunResult>

// 流式运行
for await (const event of agent.runStream(params: RunParams)) {
  console.log(event)
}
```

### 2.2 配置选项

```typescript
interface AgentConfig {
  model?: string              // 模型名称，默认 claude-sonnet-4
  maxIterations?: number      // 最大迭代次数，默认 50
  systemPrompt?: string      // 系统提示词
  signal?: AbortSignal       // 中断信号
}
```

### 2.3 运行参数

```typescript
interface RunParams {
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  model?: string
  maxIterations?: number
  systemPrompt?: string
}

interface RunResult {
  output: string             // Agent 输出
  toolCalls: number          // 工具调用次数
  iterations: number         // 迭代次数
  totalTime: number           // 总耗时(ms)
}
```

---

## 3. 工具注册

### 3.1 defineTool

```typescript
import { defineTool } from '@upup/sdk'

agent.registerTool(defineTool({
  name: 'tool_name',           // 工具名称（唯一）
  description: '工具描述',       // 描述工具功能
  inputSchema: {               // 输入参数 schema
    param1: { type: 'string', description: '参数1' },
    param2: { type: 'number' },
  },
  handler: async ({ param1, param2 }) => {
    // 处理逻辑
    return { result: 'success' }
  },
}))
```

### 3.2 输入类型

```typescript
// 字符串
{ name: { type: 'string' } }

// 数字
{ age: { type: 'number' } }

// 布尔
{ enabled: { type: 'boolean' } }

// 数组
{ items: { type: 'array', items: { type: 'string' } } }

// 对象
{ config: { type: 'object', properties: { ... } } }
```

### 3.3 批量注册

```typescript
// 批量注册
agent.registerTools([tool1, tool2, tool3])

// 移除工具
agent.removeTool('tool_name')

// 获取已注册工具
const tools = agent.getTools()
```

---

## 4. Hooks 系统

### 4.1 可用事件

| 事件 | 触发时机 | 用途 |
|------|----------|------|
| `thinking` | Agent 思考时 | 记录思考过程 |
| `tool_call` | 调用工具前 | 记录/修改工具调用 |
| `tool_result` | 工具返回后 | 处理工具结果 |
| `message` | 消息生成时 | 处理生成的消息 |

### 4.2 使用示例

```typescript
agent.useHook('tool_call', async (ctx) => {
  console.log(`调用工具: ${ctx.tool}`)
  console.log(`参数:`, ctx.params)
  return ctx  // 可修改 ctx 修改行为
})

agent.useHook('tool_result', async (ctx) => {
  console.log(`工具 ${ctx.tool} 返回:`, ctx.result)
  return ctx
})

agent.useHook('thinking', async (ctx) => {
  console.log(`思考: ${ctx.content}`)
  return ctx
})
```

---

## 5. 运行模式

### 5.1 非流式运行

```typescript
const result = await agent.run({
  messages: [{ role: 'user', content: '分析茅台股票' }],
})

console.log(result.output)
console.log(`耗时: ${result.totalTime}ms`)
console.log(`工具调用: ${result.toolCalls}次`)
```

### 5.2 流式运行

```typescript
for await (const event of agent.runStream({
  messages: [{ role: 'user', content: '分析茅台股票' }],
})) {
  switch (event.type) {
    case 'thinking':
      console.log('思考:', event.content)
      break
    case 'tool_call':
      console.log('调用:', event.tool)
      break
    case 'tool_result':
      console.log('结果:', event.result)
      break
    case 'message':
      console.log('消息:', event.content)
      break
    case 'done':
      console.log('完成')
      break
  }
}
```

### 5.3 直接使用 StdioAgentClient

```typescript
import { StdioAgentClient } from '@upup/sdk'

const client = await StdioAgentClient.connect('bun', ['run', 'upup-agent/src/cli.ts'])

// 发送请求
const result = await client.request('run', {
  messages: [{ role: 'user', content: 'hello' }],
})

// 事件监听
client.on('event', (data) => {
  console.log('事件:', data)
})

// 关闭
await client.shutdown()
```

---

## 6. 示例代码

### 6.1 投资分析助手

```typescript
import { Agent, defineTool } from '@upup/sdk'

const agent = new Agent({
  model: 'claude-sonnet-4',
  maxIterations: 20,
  systemPrompt: '你是一个专业的投资分析师',
})

await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])

// 注册投资工具
agent.registerTool(defineTool({
  name: 'get_stock_price',
  description: '获取股票价格',
  inputSchema: { ticker: { type: 'string' } },
  handler: async ({ ticker }) => ({
    ticker,
    price: 1688.88,
    change: '+2.5%',
  }),
}))

// 运行分析
const result = await agent.run({
  messages: [{
    role: 'user',
    content: '分析贵州茅台(600519)的投资价值',
  }],
})

console.log(result.output)

await agent.disconnect()
```

### 6.2 研究助手

```typescript
import { Agent, defineTool } from '@upup/sdk'

const agent = new Agent({ maxIterations: 25 })
await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])

// 研究工具
agent.registerTool(defineTool({
  name: 'search_news',
  description: '搜索新闻',
  inputSchema: { keyword: { type: 'string' } },
  handler: async ({ keyword }) => ({
    news: [{ title: `${keyword} 最新动态`, source: '财经网' }],
  }),
}))

// 研究任务
const result = await agent.run({
  messages: [{
    role: 'user',
    content: '研究新能源行业的发展趋势',
  }],
})
```

### 6.3 市场扫描器

```typescript
import { Agent, defineTool } from '@upup/sdk'

const agent = new Agent()
await agent.connect('bun', ['run', 'upup-agent/src/cli.ts'])

agent.registerTool(defineTool({
  name: 'scan_stocks',
  description: '批量扫描股票',
  inputSchema: {
    tickers: { type: 'array', items: { type: 'string' } },
    criteria: { type: 'string' },
  },
  handler: async ({ tickers, criteria }) => ({
    results: tickers.map(t => ({
      ticker: t,
      score: Math.random() * 100,
    })),
  }),
}))

const result = await agent.run({
  messages: [{
    role: 'user',
    content: '扫描我的关注列表: 600519, 000858, 601318',
  }],
})
```

---

## 7. 最佳实践

### 7.1 工具设计

1. **清晰的描述** - 工具描述要准确，让 Agent 理解何时调用
2. **参数验证** - 在 handler 中验证输入参数
3. **错误处理** - 始终返回有意义的错误信息

```typescript
// ✅ 好
defineTool({
  name: 'get_stock_price',
  description: '获取股票当前价格，输入股票代码，返回价格和涨跌幅',
  inputSchema: { ticker: { type: 'string', description: '6位股票代码' } },
  handler: async ({ ticker }) => {
    if (!/^\d{6}$/.test(ticker)) {
      return { error: '无效的股票代码' }
    }
    return { ... }
  },
})

// ❌ 差
defineTool({
  name: 'price',
  description: 'get price',
  inputSchema: { t: { type: 'string' } },
  handler: async ({ t }) => getPrice(t),
})
```

### 7.2 迭代次数控制

```typescript
// 简单任务
const result = await agent.run({ messages }, { maxIterations: 5 })

// 复杂任务
const result = await agent.run({ messages }, { maxIterations: 30 })

// 超时控制
const controller = new AbortController()
setTimeout(() => controller.abort(), 60000)

const agent = new Agent({ signal: controller.signal })
```

### 7.3 资源清理

```typescript
async function main() {
  const agent = new Agent()
  try {
    await agent.connect(...)
    // ... 使用 agent
  } finally {
    await agent.disconnect()  // 始终清理
  }
}
```

### 7.4 Hooks 使用

```typescript
// 日志记录
agent.useHook('tool_call', async (ctx) => {
  console.log(`[${new Date().toISOString()}] ${ctx.tool}`)
  return ctx
})

// 监控统计
let toolCount = 0
agent.useHook('tool_result', async (ctx) => {
  toolCount++
  return ctx
})

// 错误追踪
agent.useHook('error', async (ctx) => {
  console.error('Error:', ctx.error)
  return ctx
})
```

---

## 附录

### A. JSON-RPC 协议

SDK 使用 JSON-RPC 2.0 协议与 upup-agent 通信：

```json
// 请求
{ "jsonrpc": "2.0", "id": 1, "method": "run", "params": { ... } }

// 响应
{ "jsonrpc": "2.0", "id": 1, "result": { "output": "..." } }

// 错误
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "..." } }
```

### B. 可用示例

```
packages/sdk/examples/
├── basic-usage.ts          # 基础使用
├── real-stdio-test.ts      # Stdio 通信测试
├── oscript-scenario.ts     # 系统自动化场景
├── demo-project.ts         # 完整项目演示
├── stock-analysis.ts       # 股票分析
├── investment-demo.ts      # 投资功能
├── research-agent.ts       # 研究助手
├── market-scanner.ts      # 市场扫描
└── portfolio-optimizer.ts # 组合优化
```

### C. 测试

```bash
# 运行所有测试
bun test packages/sdk/src/

# 运行特定测试
bun test packages/sdk/src/sdk.test.ts

# 运行集成测试
bun test packages/sdk/src/integration.test.ts
```

---

**文档版本**: 1.0.0
**最后更新**: 2026-05-11
**相关文档**: [plan7.md](./plan7.md) | [README.md](./packages/sdk/README.md)
