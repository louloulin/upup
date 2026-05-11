# @upup/sdk

**UP SDK** - 对外 Agent SDK，提供类似 Claude Code Agent SDK 的 API

## 特性

- **Stdio 通信** - 通过 stdio JSON-RPC 与 Agent 进程通信
- **Fluent API** - 链式调用，简洁易用
- **工具定义** - 类似 `define_tool()` 的工具注册方式
- **Hooks 支持** - PreToolUse, PostToolUse 等钩子
- **进程隔离** - Agent 运行在独立进程中

## 安装

```bash
npm install @upup/sdk
# 或
bun add @upup/sdk
```

## 快速开始

```typescript
import { Agent, defineTool } from '@upup/sdk'

// 创建 Agent
const agent = new Agent({
  model: 'claude-sonnet-4-7',
})

// 注册工具
agent.registerTool(
  defineTool({
    name: 'get_stock_price',
    description: '获取股票价格',
    inputSchema: {
      ticker: { type: 'string', description: '股票代码' }
    },
    handler: async ({ ticker }) => {
      return { price: 1800, currency: 'CNY' }
    }
  })
)

// 运行
const result = await agent.run({
  messages: [
    { role: 'user', content: '茅台现在的价格是多少?' }
  ]
})

console.log(result.output)
```

## API 文档

### Agent

```typescript
// 创建 Agent
const agent = new Agent(config?: AgentConfig)

// 连接 Agent 进程
await agent.connect(command?: string, args?: string[])

// 断开连接
await agent.disconnect()

// 注册工具
agent.registerTool(tool: ToolDefinition)
agent.registerTools(tools: ToolDefinition[])

// 移除工具
agent.removeTool(name: string)

// 注册 Hook
agent.useHook(event: HookEvent, handler: HookHandler)

// 设置配置
agent.setModel(model: string)
agent.setMaxIterations(n: number)
agent.setSystemPrompt(prompt: string)

// 运行
await agent.run(params: RunParams): Promise<RunResult>

// 流式运行
for await (const event of agent.runStream(params: RunParams)) {
  // handle event
}
```

### defineTool

```typescript
import { defineTool } from '@upup/sdk'

const myTool = defineTool({
  name: 'tool_name',
  description: 'Tool description',
  inputSchema: {
    param1: { type: 'string' },
    param2: { type: 'number' }
  },
  handler: async (args, context) => {
    // 处理逻辑
    return { success: true, data: args }
  },
  concurrency?: 'serial' | 'concurrent'
})
```

### StdioAgentClient

```typescript
import { StdioAgentClient } from '@upup/sdk'

// 连接
const client = await StdioAgentClient.connect('bun', ['run', 'upup-agent'])

// 运行
const result = await client.run({
  messages: [{ role: 'user', content: 'Hello' }]
})

// 关闭
await client.shutdown()
```

## Stdio 协议

`@upup/sdk` 通过 stdio JSON-RPC 与 `upup-agent` 通信：

```json
// 请求
{ "jsonrpc": "2.0", "id": 1, "method": "run", "params": { ... } }

// 响应
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }

// 事件通知
{ "jsonrpc": "2.0", "method": "event", "params": { "type": "thinking", "data": { ... } } }
```

### 方法

| 方法 | 说明 |
|------|------|
| `initialize` | 初始化连接 |
| `run` | 运行 Agent（非流式） |
| `stream` | 流式运行 |
| `cancel` | 取消运行 |
| `shutdown` | 关闭连接 |

## Hooks

```typescript
agent.useHook('pre_tool_use', async (ctx) => {
  console.log(`Using tool: ${ctx.toolName}`)
  return { action: 'continue' }
})

agent.useHook('post_tool_use', async (ctx) => {
  console.log(`Tool result: ${ctx.result}`)
  return { action: 'continue' }
})

agent.useHook('pre_tool_modify', async (ctx) => {
  if (ctx.toolName === 'bash') {
    return { action: 'modify', args: { ...ctx.args, timeout: 30000 } }
  }
  return { action: 'continue' }
})
```

## 类型

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
}

interface RunParams {
  messages: Message[]
  model?: string
  maxTokens?: number
  systemPrompt?: string
  tools?: ToolDefinition[]
}

interface RunResult {
  output: string
  messages: Message[]
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}
```

## 与 Claude Code SDK 对比

| 特性 | Claude Code SDK | @upup/sdk |
|------|----------------|-----------|
| 工具定义 | `define_tool()` | `defineTool()` |
| 通信方式 | 内嵌 | stdio 进程 |
| 流式输出 | `stream` 属性 | `runStream()` 方法 |
| Hooks | `useHook()` | `useHook()` |
| 部署 | npm 包 | npm 包 + CLI |

## 下一步

- [ ] 集成真实 LLM API 测试
- [ ] 完善错误处理
- [ ] 添加更多示例
- [ ] NPM 发布

## 许可证

MIT
