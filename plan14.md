# Plan 14 - @upup/sdk SDK 增强与 Claude Agent SDK 对标

**日期**: 2026-05-15 (更新)
**版本**: v1.3
**状态**: P1 核心功能已实现
**目标**: 完善 @upup/sdk 的 Session、Memory、Streaming 和工具执行功能，对标 Claude Agent SDK

---

## 📋 执行摘要

### 核心发现

1. **@upup/sdk 当前版本**: v0.2.1
2. **主要功能**: Stdio 通信、工具注册、Hooks、权限管理、会话管理
3. **本次实现: P2 BetaTool, TokenCounter, MemoryTool
4. **参考目标**: Claude Agent SDK (@anthropic-ai/sdk v0.74.0)

### 已实现功能 (v1.3)

| 功能 | 状态 | 说明 |
|------|------|------|
| **Client v2** | ✅ | UpClient 主入口 |
| **Transport** | ✅ | StdioTransport, HttpTransport |
| **Tools Registry** | ✅ | ToolRegistry |
| **Permissions** | ✅ | PermissionManager |
| **Hooks** | ✅ | HookExecutor, HookRegistry |
| **Session** | ✅ | SessionManager (完整生命周期) |
| **Pool** | ✅ | ProcessPool (完整进程管理) |
| **Memory** | ✅ | MemoryStore (@upup/memory) - 独立包 |
| **P1: ToolRunner** | ✅ | Claude SDK 风格工具循环 |
| **P1: ToolError** | ✅ | 完整工具错误类型 |
| **P1: Messages API** | ✅ | MessagesClient 实现 |
| **P1: SDK Errors** | ✅ | 完整错误类型体系 |
| **P2: Session Store** | ✅ | Json/File/Memory Store |

### 待实现功能

| 功能 | 状态 | 优先级 |
|------|------|--------|
| **Batch Processing** | ✅ | P2 |
| **File Upload** | 🔲 | P2 |

---

## 📊 Claude Agent SDK 功能矩阵 (v1.3)

| 功能 | Claude SDK | @upup/sdk | Gap | 优先级 | 状态 |
|------|------------|------------|-----|--------|------|
| **核心 API** | | | | | |
| Messages.create | ✅ | ✅ | - | P1 | ✅ 已实现 |
| Streaming | ✅ | ✅ | - | P1 | ✅ 已实现 |
| Batch | ✅ | ❌ | 🟡 | P2 | 待实现 |
| Tool Runner | ✅ | ✅ | - | P1 | ✅ 已实现 |
| **工具系统** | | | | | |
| Tool Registry | ✅ | ✅ | - | ✅ | 已实现 |
| BetaTool (Zod) | ✅ | ✅ | - | P2 | ✅ 已实现 |
| ToolError | ✅ | ✅ | - | P1 | ✅ 已实现 |
| **Hooks** | | | | | |
| Hook Executor | ✅ | ✅ | - | ✅ | 已实现 |
| PostSampling | ✅ | ❌ | 🟡 | P2 | 待实现 |
| **会话** | | | | | |
| Session Management | ✅ | ✅ | - | ✅ | 已实现 |
| Session Store | ✅ | ✅ | - | P2 | ✅ 已实现 |
| **记忆** | | | | | |
| Memory API | ✅ | ✅ | - | ✅ | 独立包 |
| Memory Tool | ✅ | ✅ | 🟡 | P2 | ✅ 已实现 |
| **Beta API** | | | | | |
| Beta Messages | ✅ | ✅ | - | P2 | ✅ 新增 |
| BetaToolRunner | ✅ | ✅ | - | P2 | ✅ 新增 |
| RpcTransport | ✅ | ✅ | - | P2 | ✅ 新增 |
| **其他** | | | | | |
| File Upload | ✅ | ❌ | 🔴 | P2 | 待实现 |
| MCP Integration | ✅ | ❌ | 🔴 | P3 | 待实现 |
| Skills API | ✅ | ❌ | 🔴 | P3 | 待实现 |

---

## 🎯 目标架构

### SDK 分层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         @upup/sdk ARCHITECTURE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 1: Public API                              ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   UpClient (v2)                                                     ║
  ║   ├── create()                                                      ║
  ║   ├── query() → Result                                              ║
  ║   ├── stream() → AsyncGenerator<SDKMessage>                          ║
  ║   └── close()                                                       ║
  ║                                                                        ║
  ║   MessagesClient (NEW - P1)                                        ║
  ║   ├── create(params) → Message                                      ║
  ║   └── stream(params) → MessageStream                               ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 2: Tool System                             ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   ToolRegistry (✅)              ToolRunner (NEW - P1)               ║
  ║   ├── register()                ├── create()                        ║
  ║   ├── get()                     ├── runUntilDone()                  ║
  ║   ├── getAll()                  ├── pushMessages()                  ║
  ║   └── unregister()              ├── abort()                         ║
  ║                                └── [Symbol.asyncIterator]()         ║
  ║                                                                        ║
  ║   ToolError (NEW - P1)                                               ║
  ║   ├── ToolUseError                                                     ║
  ║   └── ToolResultError                                                 ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 3: Session & Memory                          ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   SessionManager (✅)             MemoryStore (@upup/memory)          ║
  ║   ├── create()                   ├── put()                           ║
  ║   ├── getCurrent()               ├── search()                        ║
  ║   ├── addMessage()               ├── semanticSearch()                ║
  ║   ├── getMessages()             ├── ask()                           ║
  ║   ├── save()                     └── timeline()                      ║
  ║   ├── pause()                                                        ║
  ║   ├── continue()                                                    ║
  ║   └── close()                                                         ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 4: Transport & Pool                          ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   Transport (✅)                  ProcessPool (✅)                    ║
  ║   ├── StdioTransport              ├── create()                       ║
  ║   ├── HttpTransport               ├── acquire()                     ║
  ║   └── WebSocketTransport (NEW)    ├── release()                      ║
  ║                                   └── close()                        ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 5: Hooks & Permissions                      ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   HookExecutor (✅)              PermissionManager (✅)               ║
  ║   ├── register()                ├── setMode()                        ║
  ║   ├── execute()                 ├── allowTool()                     ║
  ║   ├── clear()                   ├── disallowTool()                  ║
  ║   └── abort()                   └── checkPermission()               ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
```

### Session 生命周期 (已实现)

```
create()  →  created  →  active  →  paused  →  completed
                │           │          │            │
                │           ▼          ▼            │
                │        continue() resume()        │
                │           │          │            │
                └───────────┴──────────┴────────────┘
                              │
                         SessionStore (接口已定义)
                         ├── FileSessionStore (NEW - P2)
                         └── JsonSessionStore (NEW - P2)
```

### Memory 四层架构 (@upup/memory 已实现)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MEMORY LAYERS                                        │
└─────────────────────────────────────────────────────────────────────────────┘

  Layer 1: Global Memory
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ ~/.upup/memory/                                                         │
  │ ├── memvid.mv2                   # Memvid 存储                         │
  │ └── (通过 MemoryStore API 访问)                                         │
  └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  Layer 2: Project Memory
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ <project>/.upup/memory/  或  ~/.upup/projects/<slug>/memory/           │
  └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  Layer 3: Team Memory
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ ~/.upup/teams/<team>/memory/                                            │
  └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  Layer 4: Session Memory (临时)
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ ~/.upup/sessions/<id>/memory/ephemeral/                                │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Todo List

### ✅ 已完成功能 (v1.3)

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 1 | Client v2 | ✅ | UpClient 主入口 |
| 2 | Transport | ✅ | StdioTransport, HttpTransport |
| 3 | Tool Registry | ✅ | 工具注册表 |
| 4 | Permissions | ✅ | PermissionManager |
| 5 | Hooks | ✅ | HookExecutor, HookRegistry |
| 6 | Session Manager | ✅ | 完整生命周期管理 |
| 7 | Process Pool | ✅ | ProcessPool |
| 8 | Memory Store | ✅ | @upup/memory 独立包 |
| 9 | **ToolRunner** | ✅ | tool-runner.ts |
| 10 | **ToolError** | ✅ | tool-error.ts |
| 11 | **Messages API** | ✅ | messages.ts |
| 12 | **SDK Errors** | ✅ | errors.ts |
| 13 | **Session Store** | ✅ | session/store.ts |

### 🔴 P1 - 核心功能 ✅ 已全部实现

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 1 | ToolRunner | ✅ | tool-runner.ts | Claude SDK 风格工具循环 |
| 2 | ToolError | ✅ | tool-error.ts | 工具错误处理 |
| 3 | Messages API | ✅ | messages.ts | client.messages.create() |
| 4 | SDK Errors | ✅ | errors.ts | 完整错误类型 |

### 🟡 P2 - 重要功能

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 5 | ~~Session Store 实现~~ | ✅ | session/store.ts | **已完成** |
| 6 | ~~BetaTool (Zod)~~ | ✅ | beta-tool.ts | **已完成** |
| 7 | ~~Beta API Namespace~~ | ✅ | beta/index.ts | **新增** |
| 8 | ~~RpcTransport~~ | ✅ | transport/transport.ts | **新增** |
| 9 | ~~HttpTransport 支持 RPC~~ | ✅ | transport/http-transport.ts | **新增** |
| 10 | ~~Memory Tool~~ | ✅ | memory/tool.ts | **已完成** |
| 11 | ~~Token Counter~~ | ✅ | token.ts | **已完成** |
| 12 | ~~Batch Processing~~ | ✅ | batch.ts | **新增** |
| 13 | ~~PostSampling Hooks~~ | ✅ | hooks/post-sampling.ts | **新增** |
| 14 | File Upload API | 🔲 | file.ts | 文件上传管理 |

### 🟢 P3 - 企业级功能

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 12 | Skills API | 🔲 | skills.ts | Agent Skills 支持 |
| 13 | Cloud Sync | 🔲 | sync.ts | 云端同步 |
| 14 | MCP Client | 🔲 | mcp.ts | MCP 客户端集成 |
| 15 | Prompt Cache | 🔲 | cache.ts | 提示缓存 |
| 16 | Context Management | 🔲 | context.ts | 1M Token 上下文 |

---

## 📁 文件变更清单

```
packages/sdk/src/
│
├── [已存在 - 已完成]
├── index.ts                      # 主入口
├── client/client.ts              # UpClient (v2)
├── transport/                   # 传输层
│   ├── stdio-transport.ts
│   └── http-transport.ts
├── tools/                       # 工具注册表
├── permissions/                 # 权限管理
├── hooks/                       # Hook 执行器
├── session/                     # 会话管理
│   ├── manager.ts
│   └── types.ts
└── pool/                        # 进程池
│
├── [新增 - P1]
├── tool-runner.ts               # Tool Runner (Claude SDK 风格)
│   ├── class ToolRunner
│   ├── create(params): ToolRunner
│   ├── runUntilDone(): Promise<Message>
│   ├── pushMessages(messages): void
│   ├── abort(): void
│   └── [Symbol.asyncIterator](): AsyncIterator
│
├── tool-error.ts                # ToolError 处理
│   ├── class ToolError
│   ├── class ToolUseError
│   └── class ToolResultError
│
├── messages.ts                  # Messages API
│   ├── class MessagesClient
│   ├── create(params): Message
│   └── stream(params): MessageStream
│
├── errors.ts                    # 错误类型
│   ├── class SDKError
│   ├── class SessionError
│   ├── class MemoryError
│   └── class ValidationError
│
├── [新增 - P2]
├── session/store.ts             # Session Store 实现
│   ├── class FileSessionStore
│   └── class JsonSessionStore
│
├── beta/index.ts                # Beta API Namespace (NEW)
│   ├── class BetaAPI
│   ├── class BetaMessagesAPI
│   ├── class BetaToolRunner
│   └── toolRunner(params): BetaToolRunner
│
├── transport/transport.ts      # RpcTransport 接口 (NEW)
│   └── interface RpcTransport
│
├── beta-tool.ts                 # BetaTool (Zod)
│   ├── function betaTool()
│   └── function betaZodTool()
│
├── batch.ts                     # Batch Processing
│   ├── class BatchProcessor
│   ├── create(requests): Batch
│   └── getResults(batchId): AsyncGenerator
│
├── file.ts                      # File Upload API
│   ├── class FileManager
│   ├── upload(file): File
│   └── download(fileId): ReadableStream
│
├── token.ts                     # Token Counter
│   └── countTokens(text, model?): Promise<TokenCount>
│
├── memory/tool.ts               # Memory Tool 集成
│   └── createMemoryTools()
│
├── batch.ts                     # Batch Processing (NEW)
│   ├── class BatchClient
│   ├── class BatchToolRunner
│   ├── create(params): Batch
│   ├── retrieve(batchId): BatchInfo
│   ├── results(batchId): AsyncGenerator
│   └── list/cancel/delete()
│
├── hooks/post-sampling.ts      # PostSampling Hooks (NEW)
│   ├── class PostSamplingHooks
│   ├── createContentFilterHook()
│   ├── createLoggingHook()
│   ├── createMetadataHook()
│   └── createAugmentHook()
│
├── [新增 - P3]
├── skills.ts                    # Skills API
│   ├── createSkill(params): Skill
│   ├── getSkill(id): Skill
│   └── listSkills(): Skill[]
│
├── sync.ts                      # Cloud Sync
│   ├── class SyncClient
│   └── sync(): SyncResult
│
├── mcp.ts                       # MCP Client
│   └── class MCPClient
│
├── cache.ts                     # Prompt Cache
│   └── class PromptCache
│
├── context.ts                   # Context Management
│   └── class ContextManager
│
├── [更新]
└── index.ts                     # 导出新类型和类
```

---

## 🔧 API 设计

### ToolRunner (P1)

```typescript
// packages/sdk/src/tool-runner.ts

export interface ToolRunnerParams {
  messages: MessageParam[];
  tools: Tool[];
  model?: string;
  maxIterations?: number;
}

export class ToolRunner {
  private messages: MessageParam[];
  private tools: Tool[];
  private abortController: AbortController;

  static create(params: ToolRunnerParams): ToolRunner {
    return new ToolRunner(params);
  }

  async runUntilDone(): Promise<Message> {
    while (true) {
      const response = await this.client.messages.create(this.messages);

      const toolUses = response.content.filter(
        (c) => c.type === 'tool_use'
      );

      if (toolUses.length === 0) {
        return response;
      }

      // 执行工具
      for (const toolUse of toolUses) {
        const result = await this.executeTool(toolUse);
        this.messages.push(response);
        this.messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          }],
        });
      }
    }
  }

  pushMessages(messages: MessageParam[]): void {
    this.messages.push(...messages);
  }

  abort(): void {
    this.abortController.abort();
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    // 实现异步迭代器
  }
}
```

### Messages API (P1)

```typescript
// packages/sdk/src/messages.ts

export interface MessageCreateParams {
  model?: string;
  maxTokens?: number;
  messages: MessageParam[];
  system?: string;
  tools?: Tool[];
  stream?: boolean;
}

export class MessagesClient {
  constructor(
    private transport: Transport,
    private config: MessagesClientConfig = {}
  ) {}

  async create(params: MessageCreateParams): Promise<Message> {
    // 创建消息
  }

  stream(params: MessageCreateParams): MessageStream {
    // 流式创建消息
  }

  async countTokens(params: CountTokensParams): Promise<TokenCount> {
    // 计算 token
  }
}
```

---

## 📊 实现顺序

```
Phase 1: P1 核心功能 (预计 2-3 周)
├── 1.1 Messages API
├── 1.2 ToolRunner
├── 1.3 ToolError
└── 1.4 SDK Errors

Phase 2: P2 重要功能 (预计 2-3 周)
├── 2.1 Session Store 实现
├── 2.2 Memory Tool 集成
├── 2.3 BetaTool (Zod)
├── 2.4 Batch Processing
├── 2.5 File Upload
├── 2.6 Token Counter
└── 2.7 PostSampling Hooks

Phase 3: P3 企业级功能 (预计 3-4 周)
├── 3.1 Skills API
├── 3.2 Cloud Sync
├── 3.3 MCP Client
├── 3.4 Prompt Cache
└── 3.5 Context Management
```

---

## ✅ 验收标准

| 阶段 | 验收条件 |
|------|----------|
| **已完成** | Client, Transport, Tools, Permissions, Hooks, Session, Pool, Memory |
| **P1 ✅** | ToolRunner、ToolError、Messages API、SDK Errors 已实现，编译通过 |
| **P2 ✅** | BetaTool、Beta API, RpcTransport, Batch, PostSampling Hooks 已实现 |
| **P3** | Skills API、Cloud Sync、MCP Client 可用 |

---

## 📝 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.5 | 2026-05-15 | **P2 Batch + PostSampling**: BatchClient, BatchToolRunner, PostSamplingHooks |
| v1.4 | 2026-05-15 | **P2 Beta API 新增**: BetaAPI, BetaToolRunner, RpcTransport, HttpTransport RPC支持 |
| v1.3 | 2026-05-15 | **P1 核心功能已实现**: ToolRunner, ToolError, Messages API, SDK Errors, Session Store |
| v1.1 | 2026-05-15 | 更新状态分析：标记已完成功能，修正待实现任务 |
| v1.0 | 2026-05-15 | 初始版本，分析完成 |

---

## 📊 代码统计 (v1.3)

```bash
# SDK 模块统计
packages/sdk/src/
├── client/           # ~450 行
├── transport/       # ~550 行 (Stdio + HTTP + RpcTransport)
├── tools/           # ~200 行
├── permissions/     # ~250 行
├── hooks/          # ~300 行
├── session/        # ~350 行 + store.ts (新增)
├── pool/           # ~300 行
├── beta/           # ~200 行 (NEW)
├── errors.ts       # ~240 行 (新增)
├── tool-error.ts   # ~150 行 (新增)
├── messages.ts      # ~320 行 (新增)
├── tool-runner.ts  # ~420 行 (新增)
├── beta-tool.ts    # ~260 行 (新增)
├── token.ts        # ~120 行 (新增)
└── memory/tool.ts  # ~260 行 (新增)

# 合计: ~4180 行 (新增 ~2180 行)
```

# @upup/memory
packages/memory/src/
└── index.ts       # ~400 行
```

---

**创建时间**: 2026-05-15
**版本**: v1.5
**状态**: P2 Batch + PostSampling 已实现

## ✅ v1.5 更新 (2026-05-15)

### 新增功能

| 文件 | 功能 | 行数 |
|------|------|------|
| batch.ts | BatchClient, BatchToolRunner | ~320 行 |
| hooks/post-sampling.ts | PostSamplingHooks | ~280 行 |

### Batch API 功能

```typescript
// 使用 BatchClient
import { BatchClient } from '@upup/sdk'

const batch = new BatchClient(httpTransport)

// 创建批量
const result = await batch.create({
  requests: [
    { custom_id: 'req-1', params: { model: 'claude-3', max_tokens: 256, messages: [...] } },
    { custom_id: 'req-2', params: { model: 'claude-3', max_tokens: 256, messages: [...] } },
  ],
})

// 轮询状态
let status = await batch.retrieve(result.id)
while (status.processing_status === 'in_progress') {
  await sleep(5000)
  status = await batch.retrieve(result.id)
}

// 获取结果
for await (const r of batch.results(result.id)) {
  console.log(r.custom_id, r.result)
}
```

### PostSampling Hooks 功能

```typescript
// 使用 PostSamplingHooks
import { PostSamplingHooks, createContentFilterHook } from '@upup/sdk'

const postSampling = new PostSamplingHooks()

// 添加内容过滤
postSampling.register(createContentFilterHook((content) => {
  return content.replace(/badword/g, '***')
}))

// 在响应后执行
const processed = await postSampling.execute(message, { request_params: {...} })
```

### 编译统计

```bash
$ bun run build
Bundled 27 modules in 10ms
  index.js  80.64 KB  (entry point)
```

### 新增导出

```typescript
// Batch API
export { BatchClient, BatchToolRunner }

// PostSampling Hooks
export { PostSamplingHooks, createContentFilterHook, createLoggingHook, createMetadataHook, createAugmentHook }
```

