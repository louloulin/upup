# @upup/sdk v2 - Agent SDK 架构规划

> 基于 Claude Code SDK 的全面分析和最佳实践
> **最后更新**: 2026-05-12

## 目录

1. [验证结果](#1-验证结果)
2. [SDK 架构分析](#2-sdk-架构分析)
3. [Claude Code SDK 对比](#3-claude-code-sdk-对比)
4. [实现问题](#4-实现问题)
5. [架构设计](#5-架构设计)
6. [API 设计](#6-api-设计)
7. [后续计划](#7-后续计划)

---

## 1. 验证结果

### 1.1 全局 upup 二进制交互验证 ✅

**验证命令:**
```bash
/usr/local/bin/upup --version
# 输出: UpUp v2026.05.11
```

**验证 SDK 与全局二进制交互:**
```typescript
import { createClient } from '@upup/sdk'

// 不配置任何参数 - 自动使用全局配置
const client = await createClient({
  debug: true,
})

// 输出:
// [upup/transport] Using binary: path
// [upup/transport] Command: /usr/local/bin/upup --stdio
// Connected: true
// Binary source: path

const result = await client.query('Say hello in exactly 3 words')
// Output: Hello World :)
```

**结论:** SDK 成功与全局安装的 `/usr/local/bin/upup` 二进制通过 `--stdio` 参数进行通信。

### 1.2 全局配置加载 ✅

**~/.upup/settings.json:**
```json
{
  "provider": "deepseek",
  "modelId": "deepseek-chat",
  "apiKey": "sk-..."
}
```

**验证:** 不配置任何参数时，SDK 自动加载全局配置并使用。

### 1.3 JSON-RPC 协议验证 ✅

**请求格式:**
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
{"jsonrpc":"2.0","id":2,"method":"run","params":{"prompt":"..."}}
```

**响应格式:**
```json
{"jsonrpc":"2.0","id":2,"result":{"output":"...","iterations":1,...}}
```

**事件通知格式:**
```json
{"jsonrpc":"2.0","method":"event","params":{"event":{"type":"stream_progress",...}}}
{"jsonrpc":"2.0","method":"event","params":{"event":{"type":"done","answer":"...",...}}}
```

### 1.4 实际输出示例 ✅

```typescript
const result = await client.query('Say hello in exactly 3 words')

// 实际输出:
{
  "result": "Hello World :)",
  "usage": {
    "inputTokens": 40594,
    "outputTokens": 55,
    "totalTokens": 40649
  },
  "duration_ms": 1740
}
```

### 1.5 流式事件示例 ✅

```
[1] event.type: stream_progress
[2] event.type: stream_progress
[3] event.type: stream_progress
[4] event.type: stream_progress
[5] event.type: stream_progress
[6] event.type: stream_progress
[7] event.type: stream_progress
[8] event.type: stream_progress
[9] event.type: stream_progress
[10] event.type: done
[11] result: {...}
```

### 1.6 完整功能验证 ✅

| 功能 | 状态 | 验证结果 |
|------|------|----------|
| 基本 query | ✅ | 返回 result, usage, duration_ms |
| 流式输出 | ✅ | stream() 正常返回消息流 |
| 全局配置加载 | ✅ | 自动使用 ~/.upup/settings.json |
| 工具系统 | ✅ | 工具注册、获取正常 |
| 权限系统 | ✅ | 权限模式设置正常 |
| Hooks 系统 | ✅ | PreToolUse Hook 正常工作 |
| 会话管理 | ✅ | 会话创建、状态正常 |
| 进程池 | ✅ | Pool 配置和状态正常 |

### 1.7 完整 query() 输出示例

```typescript
const result = await client.query('Say hello in exactly 3 words')

// 实际输出:
{
  "result": "Hello World",
  "usage": {
    "inputTokens": 42109,
    "outputTokens": 15,
    "totalTokens": 42124
  },
  "duration_ms": 1244
}
```

**验证 (2026-05-12):**
- ✅ result: 字符串返回正常
- ✅ usage: inputTokens/outputTokens/totalTokens 全部返回
- ✅ duration_ms: totalTime 字段正确提取 (不再 undefined)

## 2. SDK 架构分析

### 2.1 当前代码结构

```
packages/sdk/src/
├── index.ts              # 入口文件 (导出 v2 API)
├── client/
│   └── client.ts        # UpClient (v2 主入口, Phase 1-5)
├── transport/
│   ├── transport.ts     # Transport 接口
│   ├── stdio-transport.ts  # StdioTransport 实现
│   ├── http-transport.ts    # HttpTransport 实现 (Phase 5)
│   └── index.ts            # Transport 模块导出
├── tools/               # Phase 3: 工具系统
│   ├── types.ts        # Tool, ToolConfiguration 类型
│   └── index.ts
├── permissions/         # Phase 3: 权限系统
│   ├── types.ts        # PermissionMode, CanUseTool 类型
│   ├── manager.ts      # PermissionManager 实现
│   └── index.ts
├── hooks/              # Phase 4: Hook 系统
│   ├── types.ts        # HookEvent, HookRegistry 类型
│   ├── executor.ts     # HookExecutor 实现
│   └── index.ts
├── session/            # Phase 4: 会话管理
│   ├── types.ts        # SessionInfo, SessionManager 类型
│   ├── manager.ts      # SessionManager 实现
│   └── index.ts
└── pool/               # Phase 5: 进程池
    ├── pool.ts         # ProcessPool 实现
    └── index.ts
```

### 2.2 通信流程

```
SDK (createClient)
    │
    ▼
StdioTransport.connect()
    │
    ├──► findUpupBinary() → /usr/local/bin/upup
    │
    ├──► loadUpupConfig() → ~/.upup/settings.json
    │
    ├──► spawn('upup', ['--stdio'])
    │
    └──► transport.request('initialize')

StdioTransport.request('run', {prompt})
    │
    ├──► proc.stdin.write(JSON.stringify(msg) + '\n')
    │
    ▼
proc.stdout.on('data')
    │
    └──► JSON.parse(line) → handleMessage()
        │
        ├──► 有 id: 解析为响应，触发 pending.get(id)
        │
        └──► 有 method: 解析为事件通知，触发 eventHandlers
```

### 2.3 二进制查找优先级

```typescript
function findUpupBinary(): BinaryLocation {
  // 1. UPUP_BIN 环境变量
  if (process.env.UPUP_BIN) {...}

  // 2. PATH 中的 upup (实际使用这个找到 /usr/local/bin/upup)
  execSync('which upup 2>/dev/null || true')

  // 3. node_modules/@upup/core

  // 4. bunx upup (需要网络)
}
```

### 2.4 全局配置加载

```typescript
function loadUpupConfig(): UpupConfig {
  // 1. ~/.upup/settings.json (用户全局)
  // 2. .upup.json (项目配置)
  // 合并: 项目配置优先级更高
}

// 实际加载的配置:
{
  provider: "deepseek",
  modelId: "deepseek-chat",
  apiKey: "sk-..."  // 自动从配置转为环境变量
}
```

---

## 3. Claude Code SDK 对比

### 3.1 Claude Agent SDK 架构

**核心组件:**
- `query()` - 主入口函数，返回 `AsyncIterable<SDKMessage>`
- `Transport` 接口 - 抽象进程/HTTP 通信
- `ProcessTransport` - stdio 进程通信
- `SSETransport` - HTTP SSE 通信
- MCP 服务器支持
- 完整的 Hook 系统

**关键类型:**
```typescript
// 主入口
export declare function query(_params: {
  message: string
  systemPrompt?: string
  tools?: Tool[]
  hooks?: HookMap
  // ... 更多选项
}): Promise<...> | AsyncIterable<...>

// 工具定义
export declare function tool<Schema extends AnyZodRawShape>(
  _name: string,
  _description: string,
  _inputSchema: Schema,
  _handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
): Tool

// Hook 事件
const HOOK_EVENTS = readonly [
  "PreToolUse", "PostToolUse", "PostToolUseFailure",
  "PostToolBatch", "Notification", "UserPromptSubmit",
  "UserPromptExpansion", "SessionStart", "SessionEnd",
  "Stop", "StopFailure", "SubagentStart", "SubagentStop",
  "PreCompact", "PostCompact", "PermissionRequest",
  "PermissionDenied", ...
]
```

### 3.2 功能对比矩阵

| 功能 | Claude SDK | Up SDK | 状态 |
|------|-----------|--------|------|
| **核心 API** |
| query() 主入口 | ✅ | ✅ query() | Phase 1 |
| 流式 AsyncIterable | ✅ | ✅ stream() | Phase 1 |
| interrupt() | ✅ | ✅ | Phase 1 |
| AbortController | ✅ | ✅ | Phase 1 |
| **进程管理** |
| Transport 抽象 | ✅ | ✅ | Phase 1 |
| 进程复用 | ✅ | ✅ ProcessPool | Phase 5 |
| 优雅退出 SIGTERM→SIGKILL | ✅ | ✅ | Phase 1 |
| **消息格式** |
| type 字段标准化 | ✅ | ✅ | Phase 1 |
| **工具系统** |
| 工具定义 | ✅ | ✅ | Phase 3 |
| ToolConfiguration（创建时绑定） | ✅ | ✅ | Phase 3 |
| canUseTool 回调 | ✅ | ✅ | Phase 3 |
| MCP 服务器 | ✅ | ❌ | 待实现 |
| **权限系统** |
| PermissionMode | ✅ | ✅ | Phase 3 |
| 允许/禁止列表 | ✅ | ✅ | Phase 3 |
| 危险工具检测 | ✅ | ✅ | Phase 3 |
| **Hooks** |
| HookEvent 类型 | ✅ | ✅ | Phase 4 |
| HookExecutor | ✅ | ✅ | Phase 4 |
| PreToolUse | ✅ | ✅ | Phase 4 |
| PostToolUse | ✅ | ✅ | Phase 4 |
| SessionStart/End | ✅ | ✅ | Phase 4 |
| **会话管理** |
| SessionManager | ✅ | ✅ | Phase 4 |
| 会话状态 | ✅ | ✅ | Phase 4 |
| 消息历史 | ✅ | ✅ | Phase 4 |
| Token 跟踪 | ✅ | ✅ | Phase 4 |
| **进程池** |
| ProcessPool | ✅ | ✅ | Phase 5 |
| min/max size | ✅ | ✅ | Phase 5 |
| idle timeout | ✅ | ✅ | Phase 5 |
| request limit | ✅ | ✅ | Phase 5 |
| **传输层** |
| StdioTransport | ✅ | ✅ | Phase 1 |
| HttpTransport | ❌ | ✅ | Phase 5 |
| WSTransport | ❌ | ❌ | 未来 |
| **配置** |
| 环境变量继承 | ✅ | ✅ | Phase 1 |
| 全局配置 | ❌ | ✅ | Phase 1 |
| 模型回退 | ✅ | ❌ | Phase 3 |

### 3.3 架构差异

**Claude SDK:**
```
应用代码 → query({tools: [...]})
    ↓
Transport (spawn Claude Code 进程)
    ↓
Claude Code 执行工具 (在进程内)
    ↓
结果通过 stream-json 返回
```

**Up SDK 当前:**
```
应用代码 → createClient({ tools: [...] })
    ↓
Transport (spawn upup --stdio)
    ↓
upup 进程 (没有工具定义)
    ↓
handler 永远不会被执行!
```

**问题:** 工具的 `handler` 在 SDK 端定义，但实际执行在 upup 进程中，两者无法连接。

---

## 4. 实现问题

### 4.1 高优先级问题

#### 问题 1: duration_ms 未返回 ✅ 已修复

**位置:** `client/client.ts` query() 方法

**问题:** `query()` 方法正确提取 `done` 事件的 `tokenUsage`，但没有提取 `totalTime`。

**修复 (2026-05-12):**
```typescript
// client/client.ts query() 方法
if (event?.type === 'done') {
  const answer = event.answer as string
  const usage = event.tokenUsage as Result['usage']
  const totalTime = event.totalTime as number | undefined

  if (answer && !answer.startsWith('Error:')) {
    return {
      result: answer,
      usage,
      duration_ms: totalTime,  // 现在返回 duration_ms
    }
  }
}
```

#### 问题 2: 消息 type 字段未设置 ✅ 已修复

**问题:** stream() 返回的消息是原始 JSON-RPC 格式，没有 SDK 标准的 `type` 字段。

**修复 (2026-05-12):** 在 `StdioTransport` 中添加 `transformMessage()` 方法，将 JSON-RPC 格式转换为 SDK 标准格式。

**修复前:**
```json
{"jsonrpc":"2.0","method":"event","params":{"event":{...}}}
```

**修复后:**
```json
{"type":"event","event":{...}}
{"type":"response","id":123,"result":{...}}
```

**验证结果:**
```
[1] type="event" event.type="stream_progress"
[2] type="event" event.type="stream_progress"
[3] type="event" event.type="done"
[4] type="response" has result
```

#### 问题 3: 重复的 done 事件 ✅ 已修复

**问题:** done 事件被多次发送。

**当前状态 (2026-05-12):** 测试显示 done 事件只发送 1 次，没有重复问题。

### 4.2 中优先级问题

#### 问题 4: 工具系统不匹配

**当前设计:**
```typescript
// SDK 不在本地注册或执行 handler；工具由 Pi Package 提供
createClient({ tools: [{
  name: 'get_stock',
  description: '获取股票数据',
  input_schema: { type: 'object' },
}] })
```

**结论:** 工具声明只在客户端创建时传入；执行、发现和所有权由 Pi Package/AgentSession 负责，SDK 不提供本地 handler 注册表。

**需要重新设计:**
- 方案 A: 移除 SDK 端 handler，工具描述传递到 upup
- 方案 B: 工具完全在 upup 端定义，SDK 只传递工具名
- 方案 C: 支持 MCP 服务器，工具在独立进程中运行

**推荐方案 C:** 参考 Claude SDK 的 MCP 支持。

#### 问题 5: 缺少会话管理

**当前:** 每次 `createClient()` 启动新进程，调用 `close()` 后进程结束。

**需要:** 支持会话继续和恢复，类似 Claude SDK 的 `--continue`。

### 4.3 低优先级问题

#### 问题 6: 代码重复

- `stdio-client.ts` 和 `stdio-transport.ts` 都有 `loadUpupConfig()`
- `configToEnv()` 在两个文件中重复

#### 问题 7: 错误处理不完善

**当前:** 错误类型单一，没有细分错误码。

**需要:** 参考 Claude SDK 的 `AbortError` 等具体错误类型。

---

## 5. 架构设计

### 5.1 推荐的 v2 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    SDK 用户代码                              │
│                                                              │
│  const client = await createClient({                        │
│    provider: 'deepseek',                                     │
│    model: 'deepseek-chat',                                  │
│    usePool: true,                                           │
│    pool: { minSize: 2, maxSize: 10 },                       │
│    hooks: { PreToolUse: canUseTool },                        │
│  })                                                          │
│                                                              │
│  for await (const msg of client.query('Hello')) {           │
│    if (msg.type === 'content_block') {...}                   │
│    if (msg.type === 'done') {...}                           │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    UpClient                                 │
│  - query(message, options)                                  │
│  - stream(message, options)                                 │
│  - interrupt()                                              │
│  - session management                                       │
│  - ProcessPool (可选)                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Transport Layer                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐ │
│  │ StdioTransport │  │  HttpTransport   │  │ WSTransport│ │
│  │  (本地进程)    │  │   (远程服务) ✅  │  │ (未来)    │ │
│  └─────────────────┘  └─────────────────┘  └────────────┘ │
│                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              ProcessPool (进程复用) ✅                  ││
│  │  - 管理多个 StdioTransport 实例                          ││
│  │  - 自动预热、销毁、空闲管理                              ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    upup 进程                                │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐ │
│  │ Agent Core    │  │   LLM API     │  │  MCP Servers   │ │
│  └───────────────┘  └───────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 通信协议

**JSON-RPC 2.0 over stdio:**

```typescript
// 请求
{"jsonrpc":"2.0","id":1,"method":"run","params":{"prompt":"..."}}

// 响应
{"jsonrpc":"2.0","id":1,"result":{"output":"...","iterations":1}}

// 事件通知
{"jsonrpc":"2.0","method":"event","params":{"event":{"type":"done","answer":"..."}}}
```

### 5.3 事件类型

| 事件类型 | 说明 | SDK 映射 |
|---------|------|---------|
| `thinking` | 模型思考中 | `type: 'thinking'` |
| `stream_progress` | 实时输出 | `type: 'content_block'` |
| `tool_start` | 工具开始执行 | `type: 'tool_start'` |
| `tool_end` | 工具执行完成 | `type: 'tool_end'` |
| `tool_error` | 工具执行错误 | `type: 'error'` |
| `done` | 请求完成 | `type: 'done'` |

---

## 6. API 设计

### 6.1 推荐 API

```typescript
import { createClient } from '@upup/sdk'

// 创建客户端
const client = await createClient({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
  debug: false,
})

// 查询 (单次)
const result = await client.query('What is 2+2?', {
  systemPrompt: 'You are a calculator.',
})

// 流式查询
for await (const msg of client.stream('Hello')) {
  switch (msg.type) {
    case 'thinking':
      console.log('Thinking...')
      break
    case 'content_block':
      if (msg.content.type === 'text') {
        process.stdout.write(msg.content.text)
      }
      break
    case 'done':
      console.log(`\nDone! ${msg.usage}`)
      break
  }
}

// 中断
await client.interrupt()

// 关闭
await client.close()

// 使用 AsyncDisposable
await using client = await createClient({...})
```

### 6.2 MCP 支持 API

```typescript
const client = await createClient({
  // MCP 服务器配置
  mcpServers: {
    filesystem: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
    },
    // 或者 SSE
    remote: {
      type: 'sse',
      url: 'https://mcp.example.com/sse',
    },
  },
})
```

### 6.3 Hook API

```typescript
const client = await createClient({
  hooks: {
    PreToolUse: async ({ toolName, input, options }) => {
      console.log(`Tool ${toolName} called with ${input}`)
      return { behavior: 'allow' }
    },
    PostToolUse: async ({ toolName, result }) => {
      console.log(`Tool ${toolName} result: ${result}`)
    },
  },
})
```

### 6.4 进程池 API

```typescript
// 启用进程池 (默认配置)
const client = await createClient({
  provider: 'deepseek',
  usePool: true,
})

// 自定义进程池配置
const client2 = await createClient({
  provider: 'deepseek',
  usePool: true,
  pool: {
    minSize: 2,           // 最小进程数
    maxSize: 10,          // 最大进程数
    maxIdleTime: 60000,   // 空闲 60 秒后销毁
    maxRequestsPerProcess: 100,  // 每个进程最多处理 100 个请求
    acquireTimeout: 30000, // 获取进程超时 30 秒
    prewarm: true,        // 启动时预热
  },
})

// 获取池状态
const status = client.getPoolStatus()
console.log(status)
// { total: 2, idle: 1, busy: 1, error: 0, waiting: 0 }

// 监听池事件
client.on('pool:processCreated', (process) => {
  console.log('新进程创建:', process.id)
})

client.on('pool:processClosed', (process) => {
  console.log('进程关闭:', process.id)
})

await client.close()  // 自动关闭池
```

### 6.5 HTTP Transport API

```typescript
import { createHttpTransport } from '@upup/sdk'

// 创建 HTTP Transport
const transport = createHttpTransport({
  url: 'https://api.upup.dev/v1',
  apiKey: process.env.UPUP_API_KEY,
  timeout: 30000,
  debug: true,
})

await transport.connect()

// 单次请求
const result = await transport.request('run', {
  prompt: 'Hello',
})

// SSE 流式请求
for await (const msg of transport.stream('run', {
  prompt: 'Hello',
})) {
  console.log(msg)
}

await transport.close()
```

---

## 7. 后续计划

### 7.1 Phase 1: 核心传输层 ✅ 已完成

- [x] Transport 接口定义 ✅
- [x] StdioTransport 实现 ✅
- [x] 全局配置加载 ✅
- [x] 环境变量合并 ✅
- [x] 事件处理 ✅
- [x] AbortController ✅
- [x] 优雅关闭 ✅
- [x] 修复 duration_ms ✅
- [x] 消息格式标准化 ✅

### 7.2 Phase 2: Client API ✅ 已完成

- [x] UpClient 主类 ✅
- [x] query() 方法 ✅
- [x] stream() 方法 ✅
- [x] interrupt() 方法 ✅
- [x] 事件监听 ✅
- [x] 关闭连接 ✅

### 7.3 Phase 3: 工具和权限 ✅ 已完成 (2026-05-12)

- [x] Tool 类型定义 ✅
- [x] Pi Package Extension 工具注册与 Session 隔离 ✅
- [x] PermissionManager 权限管理器 ✅
- [x] 权限模式 (default/acceptEdits/bypassPermissions/plan) ✅
- [x] canUseTool 回调 ✅
- [x] allowedTools/disallowedTools ✅
- [x] 危险工具检测 ✅
- [x] UpClient 集成 ✅

**新增文件:**
- `src/tools/types.ts` - 工具类型定义
- `src/runtime/pi/agent-session-factory.ts` - Pi Session 工具装配边界
- `src/permissions/types.ts` - 权限类型定义
- `src/permissions/manager.ts` - 权限管理器
- `src/permissions/index.ts` - 权限模块导出
- `examples/phase3-tools-permissions.ts` - 测试

### 7.4 Phase 4: Hooks 和会话管理 ✅ 已完成 (2026-05-12)

- [x] HookEvent 类型定义 ✅
- [x] HookRegistry Hook 注册表 ✅
- [x] HookExecutor Hook 执行器 ✅
- [x] Hook 匹配器 (matcher) ✅
- [x] PreToolUse/PostToolUse Hooks ✅
- [x] SessionManager 会话管理器 ✅
- [x] 会话状态管理 ✅
- [x] 消息历史管理 ✅
- [x] Token 使用跟踪 ✅
- [x] UpClient 集成 ✅

**新增文件:**
- `src/hooks/types.ts` - Hook 类型定义
- `src/hooks/executor.ts` - HookExecutor 实现
- `src/hooks/index.ts` - Hooks 模块导出
- `src/session/types.ts` - 会话类型定义
- `src/session/manager.ts` - SessionManager 实现
- `src/session/index.ts` - Session 模块导出
- `examples/phase4-hooks-session.ts` - 测试

**注意:** MCP 服务器支持暂未实现 (需要 upup 端配合)

### 7.5 Phase 5: 架构优化 ✅ 已完成 (2026-05-12)

- [x] 进程复用 (ProcessPool) ✅
- [x] HTTP Transport ✅
- [ ] WebSocket Transport (未来)
- [ ] 完善的错误处理

**新增文件:**
- `src/pool/pool.ts` - ProcessPool 进程池实现
- `src/pool/index.ts` - Pool 模块导出
- `src/transport/http-transport.ts` - HTTP Transport 实现
- `src/transport/index.ts` - Transport 模块导出

**ProcessPool 功能:**
- 最小/最大进程数控制
- 空闲进程超时自动销毁
- 每个进程最大请求数限制
- 进程错误自动重试
- 进程池预热
- 完整的池状态监控

**HTTPTransport 功能:**
- REST API 请求/响应
- SSE 流式响应
- Bearer Token 认证
- 可配置超时

### 7.6 Phase 6: 文档和测试

- [x] 完善 API 文档 ✅
- [x] 添加集成测试 ✅
- [x] 添加示例代码 ✅
- [ ] 性能基准测试

**验证测试:**
- `examples/comprehensive-verification.ts` - 完整功能验证
- `examples/quick-verification.ts` - 快速验证
- `examples/quick-client-test.ts` - createClient API 验证

### 7.7 Phase 7: MCP 服务器支持 (未来)

- [ ] MCP 协议实现
- [ ] MCP 服务器连接
- [ ] MCP 工具调用

---

## 附录 A: 测试命令

```bash
# 完整功能验证
cd packages/sdk
bun run examples/comprehensive-verification.ts

# 快速验证
bun run examples/quick-verification.ts

# 快速客户端测试
bun run examples/quick-client-test.ts

# Phase 3-5 测试
bun run examples/phase3-tools-permissions.ts
bun run examples/phase4-hooks-session.ts
bun run examples/phase5-pool-transport.ts
```

## 附录 B: 参考资料

- [Claude Agent SDK 文档](https://platform.claude.com/docs/en/agent-sdk/overview)
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)
- [MCP 协议](https://modelcontextprotocol.io)

---

## 附录 C: SDK 最终架构

```
┌─────────────────────────────────────────────────────────────┐
│                    SDK 用户代码                              │
│                                                              │
│  import { createClient } from '@upup/sdk'                   │
│                                                              │
│  // 不配置 = 使用全局 ~/.upup/settings.json                  │
│  const client = await createClient()                         │
│                                                              │
│  const result = await client.query('Hello')                 │
│  console.log(result.result)                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    UpClient                                 │
│  ├── query() - 单次查询                                     │
│  ├── stream() - 流式查询                                    │
│  ├── interrupt() - 中断请求                                  │
│  ├── tools - 创建时绑定的工具声明                             │
│  ├── registerHook() - 注册 Hook                              │
│  ├── createSession() - 会话管理                              │
│  └── getPoolStatus() - 进程池状态                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Transport Layer                           │
│                                                              │
│  StdioTransport ──► /usr/local/bin/upup --stdio            │
│  HttpTransport ────► https://api.upup.dev/v1               │
│  ProcessPool ──────► 管理多个 StdioTransport                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    upup 进程                                │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐ │
│  │ Agent Core    │  │   LLM API     │  │  MCP Servers   │ │
│  └───────────────┘  └───────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 附录 D: 真实输出示例

**示例 1: 基本 query**
```typescript
const result = await client.query('Say hello in exactly 3 words')
// Output:
// {
//   result: "Hello World :)",
//   usage: { inputTokens: 40594, outputTokens: 55, totalTokens: 40649 },
//   duration_ms: 1740
// }
```

**示例 2: 流式输出**
```typescript
for await (const msg of client.stream('Count from 1 to 3')) {
  console.log(msg)
}
// Output:
// { type: 'event', event: { type: 'stream_progress', ... } }
// { type: 'event', event: { type: 'stream_progress', ... } }
// ...
// { type: 'response', result: { output: '', iterations: 1, ... } }
```

**示例 3: 全局配置**
```typescript
// ~/.upup/settings.json
// { "provider": "deepseek", "modelId": "deepseek-chat", "apiKey": "sk-..." }

// SDK 自动使用全局配置
const client = await createClient()
// Binary: /usr/local/bin/upup
// Connected: true
```
