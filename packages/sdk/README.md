# @upup/sdk

**UP SDK** - 对外 Agent SDK，提供类似 Claude Code Agent SDK 的 API

## 特性

- **Stdio 通信** - 通过 stdio JSON-RPC 与 Agent 进程通信
- **Fluent API** - 链式调用，简洁易用
- **工具定义** - 类似 `define_tool()` 的工具注册方式
- **Hooks 支持** - PreToolUse, PostToolUse 等钩子
- **进程隔离** - Agent 运行在独立进程中
- **全局配置** - 自动加载 `~/.upup/settings.json`
- **环境变量继承** - 自动继承 `process.env`

## 安装

```bash
npm install @upup/sdk
# 或
bun add @upup/sdk
```

## 全局配置

创建 `~/.upup/settings.json` 配置 API key:

```json
{
  "provider": "anthropic",
  "modelId": "claude-sonnet-4-6",
  "apiKey": "sk-ant-..."
}
```

支持的 provider: `anthropic`, `deepseek`, `openai`, `google`

## 快速开始

```typescript
import { createClient } from '@upup/sdk'

// 创建客户端 (自动检测全局配置 ~/.upup/settings.json)
const client = await createClient()

// 简单 query
const result = await client.query('茅台现在多少钱?')
console.log(result.result)

// 流式输出
for await (const msg of client.stream('分析 AAPL')) {
  console.log(msg)
}

// 使用后自动关闭
await using client = createClient() {
  const result = await client.query('你好')
}
```

## v2 API (推荐)

```typescript
import { createClient, UpClient, StdioTransport } from '@upup/sdk'

// 完整选项
const client = await createClient({
  provider: 'deepseek',           // 或 'anthropic', 'openai', 'google'
  model: 'deepseek-chat',         // 模型 ID
  apiKey: 'sk-...',               // 可选，使用 ~/.upup/settings.json
  debug: false,                   // 调试模式
  binary: { command: '/path/upup', args: ['--stdio'] }
})

// query() - 非流式
const result = await client.query('分析茅台')
console.log(result.result)
console.log(result.usage)  // { inputTokens, outputTokens, totalTokens }

// stream() - 流式
for await (const msg of client.stream('数到5')) {
  console.log(msg)
}

// 事件监听
client.on('event', (event) => {
  console.log('Event:', event)
})

// 中断
await client.interrupt()

// 关闭
await client.close()

// 或使用 using (自动关闭)
await using client = createClient() {
  const result = await client.query('你好')
}
```

### 底层 Transport API

```typescript
import { createStdioTransport } from '@upup/sdk'

// 直接使用 StdioTransport
const transport = await createStdioTransport({ debug: true })

// run() 方法
const result = await transport.run('你好')
console.log(result.output)

// messages() - AsyncGenerator
for await (const msg of transport.messages()) {
  console.log(msg)
}

await transport.close()
```

## v1 API (已废弃)

旧版 API 仍然可用，但推荐迁移到 v2：

```typescript
import { Agent, StdioAgentClient, defineTool } from '@upup/sdk'

// v1 仍然支持
const client = await StdioAgentClient.create()
const result = await client.run({ messages: [...] })
```

```typescript
// 创建客户端 (自动检测二进制)
const client = await StdioAgentClient.create({
  debug: true,              // 显示调试信息
  development: false,        // 开发模式
  loadGlobalConfig: true,    // 加载全局配置
  env: {                    // 自定义环境变量
    ANTHROPIC_API_KEY: '...'
  }
})

// 运行
const result = await client.run({
  messages: [{ role: 'user', content: 'Hello' }]
})

// 流式运行
for await (const event of client.streamRun({ messages: [...] })) {
  console.log(event.type, event.data)
}

// 事件监听
client.on('event', (data) => {
  console.log('Event:', data)
})

// 关闭
await client.shutdown()
```

### Agent

```typescript
// 创建 Agent
const agent = new Agent(config?: AgentConfig)

// 连接 Agent 进程
await agent.connect(command?: string, args?: string[])

// 断开连接
await agent.disconnect()

// 工具在 createClient({ tools }) 时一次性绑定；执行和发现由 Pi Package/AgentSession 负责

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
    return { success: true, data: args }
  },
  concurrency?: 'serial' | 'concurrent'
})
```

## Stdio 协议

`@upup/sdk` 通过 stdio JSON-RPC 与 `upup` 通信：

```json
// 请求
{ "jsonrpc": "2.0", "id": 1, "method": "run", "params": { "prompt": "..." } }

// 响应
{ "jsonrpc": "2.0", "id": 1, "result": { "output": "..." } }

// 事件通知
{ "jsonrpc": "2.0", "method": "event", "params": { "event": { "type": "done", "answer": "..." } } }
```

### 方法

| 方法 | 说明 |
|------|------|
| `initialize` | 初始化连接 |
| `run` | 运行 Agent（非流式） |
| `stream` | 流式运行 |
| `cancel` | 取消运行 |
| `shutdown` | 关闭连接 |

## 二进制检测

自动检测优先级:
1. `UPUP_BIN` 环境变量
2. PATH 中的 `upup`
3. `node_modules/@upup/core`
4. `bunx upup`

## 与 Claude Code SDK 对比

| 特性 | Claude Code SDK | @upup/sdk |
|------|----------------|-----------|
| 主入口 | `query()` | `query()` |
| 通信方式 | 内嵌 | stdio 进程 |
| 流式输出 | `stream` 属性 | `runStream()` 方法 |
| Hooks | `useHook()` | `useHook()` |
| 全局配置 | - | `~/.upup/settings.json` |
| 环境继承 | 自动 | 自动 |

## 下一步

- [ ] 集成真实 LLM API 测试
- [ ] 完善错误处理
- [ ] NPM 发布

## 许可证

MIT
