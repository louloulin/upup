# Plan7.md — UP SDK 对外集成改造计划

> 创建日期: 2026-05-11 | 版本: 3.0 | 目标: 对标 Claude Code Agent SDK，构建 UP SDK
> 状态: **规划中** | 核心: stdio 通信 + 依赖分层

---

## 0. 核心架构：Stdio 通信模式

### 0.1 为什么需要 Stdio 模式

Claude Code Agent SDK 和 MCP 协议都使用 **stdio 通信**，原因：

```
┌─────────────────────────────────────────────────────────────┐
│                     Host Application                         │
│  ┌─────────────┐     stdin      ┌─────────────┐            │
│  │  Claude SDK  │◄──────────────│   SDK CLI   │            │
│  │  (Node.js)  │               │  (Child)    │            │
│  └─────────────┘    stdout     └─────────────┘            │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Agent Core  │
                    │  (独立进程)  │
                    └─────────────┘
```

**优势**：
- 进程隔离，崩溃不影响主应用
- 独立部署，版本独立
- 支持任意语言实现 Agent Core
- Claude Code / MCP / Codex 都采用此模式

### 0.2 两种集成方式

| 方式 | 适用场景 | 复杂度 |
|------|----------|--------|
| **Stdio 进程** | 外部集成、独立部署 | 中 |
| **NPM 库导入** | 同进程集成、快速开发 | 低 |

---

## 1. 目标架构：三层依赖 + Stdio

### 1.1 完整架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Host Application                         │
│                    (用户代码、网页、CLI)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   @upup/sdk       │  ← NPM 包（主 SDK）
                    │   (stdio client)   │
                    └─────────┬─────────┘
                              │ stdio JSON-RPC
                    ┌─────────▼─────────┐
                    │   upup-agent       │  ← 独立 CLI 进程
                    │   (stdio server)   │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼────┐  ┌───────▼─────┐  ┌─────▼─────┐
     │ @upup/types │  │@upup/agent- │  │ @upup/mcp  │
     │ (纯类型)     │  │   core      │  │ (MCP 客户端)│
     └─────────────┘  └─────────────┘  └───────────┘
```

### 1.2 依赖分层

```
packages/types/          # @upup/types
│                         纯类型定义，无任何依赖
│
packages/agent-core/     # @upup/agent-core  
│                         Agent 核心运行时
│                         依赖: @upup/types
│                         
packages/sdk/            # @upup/sdk
│                         对外 SDK（NPM 包）
│                         依赖: @upup/types
│                         包含: stdio client
│
upup-agent/              # upup-agent (CLI)
│                         独立进程
│                         依赖: @upup/agent-core
│                         提供: stdio server
│
src/                     # 主应用 (Dexter)
                          依赖: @upup/sdk
                          可选: 直接 import @upup/agent-core
```

---

## 2. Stdio 通信协议设计

### 2.1 JSON-RPC 消息格式

```typescript
// 请求
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: Record<string, unknown>
}

// 响应
interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// 通知（无响应）
interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}
```

### 2.2 Agent Methods

```typescript
// 初始化
{ method: 'initialize', params: { 
    clientName: 'my-app',
    clientVersion: '1.0.0',
    capabilities: { streaming: true, tools: true }
  }
}

// 运行
{ method: 'run', params: {
    messages: [{ role: 'user', content: '分析茅台' }],
    model?: 'claude-sonnet-4',
    maxTokens?: 4096,
    systemPrompt?: '你是一个投资助手'
  }
}

// 流式事件
{ method: 'event', params: {
    type: 'thinking' | 'tool_call' | 'tool_result' | 'message' | 'done',
    data: unknown
  }
}

// 取消
{ method: 'cancel', params: { runId: 'xxx' } }

// 关闭
{ method: 'shutdown' }
```

### 2.3 SDK Client (stdio client)

```typescript
// packages/sdk/src/stdio-client.ts
import { spawn } from 'child_process'

export class StdioAgentClient {
  private proc: ChildProcess
  private requestId = 0
  private pending = new Map<number, (res: JsonRpcResponse) => void>()

  static async connect(command: string, args: string[]): Promise<StdioAgentClient> {
    const client = new StdioAgentClient()
    client.proc = spawn(command, args, { 
      stdio: ['pipe', 'pipe', 'inherit'] 
    })
    
    client.proc.stdout?.on('data', (data) => {
      client.handleMessage(JSON.parse(data.toString()))
    })
    
    await client.request('initialize', { 
      clientName: '@upup/sdk', 
      clientVersion: '1.0.0',
      capabilities: { streaming: true, tools: true }
    })
    
    return client
  }

  async run(params: RunParams): Promise<RunResult> {
    return this.request('run', params)
  }

  streamRun(params: RunParams): AsyncGenerator<StreamEvent> {
    // 发送请求后，yield 所有 event 通知
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.requestId
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
    })
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification) {
    if ('id' in msg && msg.id) {
      const resolve = this.pending.get(msg.id)
      if (resolve) {
        this.pending.delete(msg.id)
        resolve(msg)
      }
    }
    // 通知处理...
  }
}
```

### 2.4 Agent Server (stdio server)

```typescript
// upup-agent/src/server.ts
import { AgentCore } from '@upup/agent-core'

export class StdioAgentServer {
  private agent: AgentCore
  private running = false

  start() {
    process.stdin.on('data', (data) => {
      const msg = JSON.parse(data.toString())
      this.handleMessage(msg)
    })
  }

  private async handleMessage(msg: JsonRpcRequest) {
    try {
      switch (msg.method) {
        case 'initialize':
          this.send({ jsonrpc: '2.0', id: msg.id, result: { 
            version: '1.0.0',
            capabilities: { streaming: true, tools: true }
          }})
          break
          
        case 'run':
          const result = await this.agent.run(msg.params)
          this.send({ jsonrpc: '2.0', id: msg.id, result })
          break
          
        case 'stream':
          for await (const event of this.agent.runStream(msg.params)) {
            this.send({ jsonrpc: '2.0', method: 'event', params: event })
          }
          this.send({ jsonrpc: '2.0', id: msg.id, result: { done: true } })
          break
          
        case 'shutdown':
          process.exit(0)
      }
    } catch (err) {
      this.send({ jsonrpc: '2.0', id: msg.id, error: { 
        code: -32603, 
        message: String(err) 
      }})
    }
  }

  private send(msg: unknown) {
    console.log(JSON.stringify(msg))
  }
}
```

---

## 3. 完整 SDK API 设计

### 3.1 入口文件

```typescript
// packages/sdk/src/index.ts
export { Agent } from './agent.js'           // 便捷类
export { StdioAgentClient } from './stdio-client.js'  // stdio 客户端
export type { AgentConfig, RunParams, RunResult, StreamEvent } from './types.js'

// 工具相关
export type { Tool, ToolDefinition, ToolHandler, ToolContext } from './types.js'
export { defineTool } from './tools.js'      // 类似 Claude SDK
```

### 3.2 Agent 类（便捷封装）

```typescript
// packages/sdk/src/agent.ts
export class Agent {
  private client: StdioAgentClient

  static async create(config: AgentConfig): Promise<Agent> {
    const client = await StdioAgentClient.connect(
      'npx', ['@upup/agent-cli']
    )
    return new Agent(client, config)
  }

  static createInProcess(config: AgentConfig): Agent {
    // 直接在进程内创建（用于开发/测试）
    const core = new AgentCore(config)
    return new Agent(core)
  }

  registerTool(tool: ToolDefinition): this
  registerTools(tools: ToolDefinition[]): this
  useHook(event: HookEvent, handler: HookHandler): this

  async run(params: RunParams): Promise<RunResult>
  async *runStream(params: RunParams): AsyncGenerator<StreamEvent>
}

// 使用示例
const agent = await Agent.create({ model: 'claude-sonnet-4' })
agent.registerTool(defineTool({
  name: 'get_stock_price',
  description: '获取股票价格',
  inputSchema: { ticker: 'string' },
  handler: async ({ ticker }) => ({ price: 1800 })
}))

const result = await agent.run({
  messages: [{ role: 'user', content: '茅台现在多少钱？' }]
})
```

### 3.3 工具定义（defineTool）

```typescript
// packages/sdk/src/tools.ts
export function defineTool<T extends z.ZodType>(config: {
  name: string
  description: string
  inputSchema: T
  handler: (args: z.infer<T>, context: ToolContext) => Promise<ToolResult>
}): ToolDefinition

// 使用示例
import { z } from 'zod'

const getStockPrice = defineTool({
  name: 'get_stock_price',
  description: '获取股票实时价格',
  inputSchema: z.object({
    ticker: z.string().describe('股票代码，如 600519.SH')
  }),
  handler: async ({ ticker }) => {
    const price = await fetchStockPrice(ticker)
    return { price, currency: 'CNY' }
  }
})
```

---

## 4. 依赖分析详细

### 4.1 @upup/types（底层）

```json
// packages/types/package.json
{
  "name": "@upup/types",
  "version": "1.0.0",
  "dependencies": {}
}
```

**无任何依赖**，只定义类型：
- `Message`, `Tool`, `ToolResult`
- `AgentConfig`, `RunParams`, `RunResult`
- `HookEvent`, `HookContext`
- `StreamEvent`, `StreamEventType`

### 4.2 @upup/agent-core（核心层）

```json
// packages/agent-core/package.json
{
  "name": "@upup/agent-core",
  "version": "1.0.0",
  "dependencies": {
    "@upup/types": "workspace:*"
  },
  "peerDependencies": {
    "@upup/llm": "workspace:*"
  }
}
```

**从 src/ 迁移**：
- `src/agent/agent.ts` → `agent-core/src/agent.ts`
- `src/agent/tool-executor.ts` → `agent-core/src/tool-executor.ts`
- `src/agent/subagent-runner.ts` → `agent-core/src/subagent.ts`
- `src/agent/registry.ts` → `agent-core/src/registry.ts`
- `src/tools/registry/index.ts` → `agent-core/src/tools/registry.ts`
- `src/hooks/tool-hooks.ts` → `agent-core/src/hooks.ts`

**留在 src/ 的模块**：
- 具体工具实现（bash, filesystem, finance...）
- CLI 入口
- MCP 服务器实现

### 4.3 @upup/sdk（SDK 层）

```json
// packages/sdk/package.json
{
  "name": "@upup/sdk",
  "version": "1.0.0",
  "dependencies": {
    "@upup/types": "workspace:*",
    "@upup/agent-core": "workspace:*"
  }
}
```

**新增**：
- `src/stdio-client.ts` - stdio 通信客户端
- `src/agent.ts` - Agent 便捷类
- `src/tools.ts` - defineTool
- `src/hooks.ts` - Hooks API
- `src/subagent.ts` - 子代理 API
- `src/session.ts` - 会话管理
- `src/types.ts` - SDK 公共类型

### 4.4 upup-agent（CLI 进程）

```json
// upup-agent/package.json
{
  "name": "upup-agent",
  "version": "1.0.0",
  "bin": { "upup-agent": "./dist/cli.js" },
  "dependencies": {
    "@upup/agent-core": "workspace:*"
  }
}
```

**实现**：
- `src/server.ts` - stdio server
- `src/cli.ts` - CLI 入口

### 4.5 src/（主应用）

```json
// 改造后
{
  "dependencies": {
    "@upup/sdk": "workspace:*"
  }
}
```

**改造**：
- `src/agent/` → re-export `@upup/agent-core`
- `src/cli.ts` → 使用 `@upup/sdk`

---

## 5. 实现计划

### Phase 1: 包结构重组（Week 1-2）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 创建 `packages/agent-core/` | 迁移 Agent 核心代码 | P0 |
| 创建 `packages/sdk/` | SDK 主包 | P0 |
| 创建 `upup-agent/` | stdio CLI 进程 | P1 |
| 更新 `src/` | 改为 wrapper | P2 |

### Phase 2: Stdio 通信（Week 2-3）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 实现 `stdio-client.ts` | SDK stdio 客户端 | P0 |
| 实现 `server.ts` | Agent stdio 服务端 | P0 |
| 定义 JSON-RPC 协议 | 消息格式标准化 | P0 |
| 测试 stdio 通信 | 端到端测试 | P0 |

### Phase 3: SDK API（Week 3-4）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 实现 `Agent` 便捷类 | fluent API | P0 |
| 实现 `defineTool()` | 工具定义 | P0 |
| 实现 Hooks API | PreToolUse 等 | P1 |
| 实现子代理 API | handoff | P1 |

### Phase 4: 集成和发布（Week 4-6）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 集成测试 | 完整流程测试 | P0 |
| 文档编写 | API 文档 | P0 |
| NPM 发布 | @upup/sdk | P0 |
| CLI 发布 | upup-agent | P1 |

---

## 6. 代码复用清单

### 6.1 完全复用（直接迁移）

| src/ 文件 | agent-core/ 位置 | 说明 |
|-----------|-----------------|------|
| `src/agent/agent.ts` | `agent-core/src/agent.ts` | Agent 主循环 |
| `src/agent/tool-executor.ts` | `agent-core/src/tool-executor.ts` | 工具执行 |
| `src/agent/subagent-runner.ts` | `agent-core/src/subagent.ts` | 子代理 |
| `src/agent/registry.ts` | `agent-core/src/registry.ts` | 注册表 |
| `src/agent/types.ts` | `agent-core/src/types.ts` | 类型 |
| `src/tools/registry/index.ts` | `agent-core/src/tools/registry.ts` | 工具注册 |
| `src/tools/types.ts` | `agent-core/src/tools/types.ts` | 工具类型 |
| `src/hooks/tool-hooks.ts` | `agent-core/src/hooks.ts` | Hooks |

### 6.2 新增代码

| 文件 | 说明 |
|------|------|
| `packages/sdk/src/stdio-client.ts` | stdio 客户端 |
| `packages/sdk/src/agent.ts` | Agent 便捷类 |
| `packages/sdk/src/tools.ts` | defineTool |
| `packages/sdk/src/hooks.ts` | Hooks API |
| `packages/sdk/src/types.ts` | SDK 类型 |
| `packages/sdk/src/index.ts` | 入口 |
| `upup-agent/src/server.ts` | stdio 服务端 |
| `upup-agent/src/cli.ts` | CLI 入口 |

### 6.3 修改文件

| 文件 | 修改 |
|------|------|
| `src/agent/index.ts` | 改为 re-export agent-core |
| `src/cli.ts` | 使用 @upup/sdk |
| `packages/*/package.json` | 添加 workspace 依赖 |

---

## 7. 验证计划

### 7.1 单元测试

```bash
# SDK 核心测试
bun test packages/sdk/src/agent.test.ts
bun test packages/sdk/src/stdio-client.test.ts
bun test packages/sdk/src/tools.test.ts

# Agent Core 测试
bun test packages/agent-core/src/agent.test.ts
```

### 7.2 Stdio 集成测试

```typescript
// 测试 stdio 通信
test('stdio roundtrip', async () => {
  const client = await StdioAgentClient.connect('node', ['upup-agent'])
  
  const result = await client.run({
    messages: [{ role: 'user', content: 'test' }]
  })
  
  expect(result.output).toBeDefined()
  await client.shutdown()
})
```

### 7.3 End-to-End 测试

```bash
# 完整流程测试
bun test e2e/

# CLI 测试
echo '{"jsonrpc":"2.0","id":1,"method":"run","params":{}}' | npx upup-agent
```

---

## 8. 与 Claude Code SDK 对比

| 维度 | Claude Code SDK | UP SDK |
|------|----------------|--------|
| 通信方式 | 进程调用 | stdio JSON-RPC |
| 工具定义 | `define_tool()` | `defineTool()` |
| Agent 模式 | 内嵌 | 进程隔离 |
| 部署方式 | npm 包 | npm 包 + CLI |
| 扩展方式 | 代码导入 | 进程 + MCP |

---

**Next Steps:**
1. 创建 `packages/agent-core/` 包
2. 迁移 Agent 核心代码
3. 实现 stdio 通信协议
4. 编写 SDK 客户端
