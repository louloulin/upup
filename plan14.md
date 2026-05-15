# Plan 14 - @upup/sdk SDK 增强与 Claude Agent SDK 对标

**日期**: 2026-05-15
**版本**: v1.0
**状态**: 分析完成，待实施
**目标**: 完善 @upup/sdk 的 Session、Memory、Streaming 和工具执行功能，对标 Claude Agent SDK

---

## 📋 执行摘要

### 核心发现

1. **@upup/sdk 当前版本**: v0.2.1
2. **主要功能**: Stdio 通信、工具注册、Hooks、权限管理、会话管理
3. **核心差距**: Memory API 缺失、流式处理不完整、工具执行循环未实现
4. **参考目标**: Claude Agent SDK (@anthropic-ai/sdk v0.74.0)

### SDK 架构概览

```
packages/sdk/
├── src/
│   ├── index.ts              # 主入口
│   ├── client/client.ts       # UpClient 主入口 (v2)
│   ├── transport/            # 传输层 (Stdio, HTTP)
│   ├── tools/                # 工具注册表
│   ├── permissions/           # 权限管理
│   ├── hooks/                # Hook 执行器
│   ├── session/              # 会话管理
│   └── pool/                 # 进程池
└── dist/                     # 编译输出
```

### 当前功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| **Client v2** | ✅ | UpClient 主入口 |
| **Transport** | ✅ | StdioTransport, HttpTransport |
| **Tools Registry** | ✅ | ToolRegistry |
| **Permissions** | ✅ | PermissionManager |
| **Hooks** | ✅ | HookExecutor, HookRegistry |
| **Session** | ⚠️ 基础 | SessionManager (仅内存) |
| **Pool** | ⚠️ 基础 | ProcessPool (仅框架) |
| **Memory API** | ❌ | 无 |
| **Tool Runner** | ❌ | 无 |
| **Streaming** | ⚠️ 基础 | 仅消息流 |
| **Batch** | ❌ | 无 |

---

## 📊 Claude Agent SDK 功能矩阵

| 功能 | Claude SDK | @upup/sdk | Gap | 优先级 |
|------|------------|------------|-----|--------|
| **核心 API** | | | | |
| Messages.create | ✅ | ❌ | 🔴 | P1 |
| Streaming | ✅ | ⚠️ 基础 | 🟡 | P1 |
| Batch | ✅ | ❌ | 🔴 | P2 |
| Tool Runner | ✅ | ❌ | 🔴 | P1 |
| **工具系统** | | | | |
| Tool Registry | ✅ | ✅ | - | ✅ |
| BetaTool (Zod) | ✅ | ❌ | 🔴 | P2 |
| ToolError | ✅ | ❌ | 🔴 | P1 |
| **Hooks** | | | | |
| Hook Executor | ✅ | ✅ | - | ✅ |
| PostSampling | ✅ | ❌ | 🔴 | P2 |
| **会话** | | | | |
| Session Management | ✅ | ⚠️ | 🟡 | P1 |
| Session Store | ✅ | ❌ | 🔴 | P2 |
| **记忆** | | | | |
| Memory API | ✅ | ❌ | 🔴 | P2 |
| Memory Tool | ✅ | ❌ | 🔴 | P2 |
| **其他** | | | | |
| File Upload | ✅ | ❌ | 🔴 | P2 |
| MCP Integration | ✅ | ❌ | 🔴 | P3 |
| Skills API | ✅ | ❌ | 🔴 | P3 |

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
  ║   UpClient (v3)                                                     ║
  ║   ├── createClient()                                                ║
  ║   ├── query() → Result                                             ║
  ║   ├── stream() → AsyncGenerator<SDKMessage>                        ║
  ║   └── close()                                                      ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 2: Tool System                             ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   ToolRegistry                  ToolRunner (NEW)                    ║
  ║   ├── register()               ├── create()                        ║
  ║   ├── get()                    ├── runUntilDone()                   ║
  ║   ├── getAll()                ├── pushMessages()                    ║
  ║   └── unregister()            ├── abort()                         ║
  ║                               └── [Symbol.asyncIterator]()          ║
  ║                                                                        ║
  ║   ToolExecutor (NEW)                                                ║
  ║   ├── execute(toolName, input)                                     ║
  ║   ├── validate(toolName, input)                                    ║
  ║   └── list()                                                       ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 3: Session & Memory                       ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   SessionManager                  MemoryManager (NEW)                ║
  ║   ├── create()                  ├── write()                        ║
  ║   ├── getCurrent()              ├── read()                         ║
  ║   ├── addMessage()              ├── update()                        ║
  ║   ├── getMessages()            ├── delete()                        ║
  ║   ├── save()                   ├── search()                        ║
  ║   └── close()                  └── list()                         ║
  ║                                                                        ║
  ║   SessionStore (NEW)                                                ║
  ║   ├── FileSessionStore           MemoryStore (NEW)                   ║
  ║   └── JsonSessionStore          ├── FileMemoryStore                 ║
  ║                               └── JsonMemoryStore                   ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 4: Transport & Pool                       ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   Transport                      ProcessPool                        ║
  ║   ├── StdioTransport             ├── create()                       ║
  ║   ├── HttpTransport              ├── acquire()                       ║
  ║   └── WebSocketTransport         ├── release()                      ║
  ║                                   └── close()                      ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 5: Hooks & Permissions                  ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   HookExecutor                  PermissionManager                   ║
  ║   ├── register()               ├── setMode()                       ║
  ║   ├── execute()                ├── allowTool()                     ║
  ║   ├── clear()                  ├── disallowTool()                  ║
  ║   └── abort()                  └── checkPermission()               ║
  ║                                                                        ║
  ║   HOOK_EVENTS (NEW)                                                  ║
  ║   ├── PreToolUse               HOOK_EVENTS (NEW)                   ║
  ║   ├── PostToolUse             ├── PreMessage                       ║
  ║   ├── PreSampling            ├── PostSampling                      ║
  ║   ├── PostSampling           ├── PreToolUse                       ║
  ║   └── MessageStream          ├── PostToolUse                      ║
  ║                               └── MessageStream                    ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
```

### Session 生命周期

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SESSION LIFECYCLE                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  create()
       │
       ▼
  ┌─────────────┐
  │  created   │ ────────────────────► 继续会话
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  active    │ ◄────────────────────┐
  │  (发送     │                      │ resume()
  │   消息)    │                      │
  └──────┬──────┘                      │
         │                              │
         ▼                              │
  ┌─────────────┐                       │
  │  paused    │ ──────────────────────┘
  │  (暂停)    │   continue()
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ completed  │ ──────────────────────► 恢复会话历史
  │  (完成)    │
  └─────────────┘

  SessionStore (NEW)
  ├── FileSessionStore - 文件系统持久化
  └── JsonSessionStore - JSON 文件持久化
```

### Memory 四层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MEMORY LAYERS                                          │
└─────────────────────────────────────────────────────────────────────────────┘

  Layer 1: Global Memory
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ ~/.upup/memory/                                                       │
  │ ├── MEMORY.md                    # 索引入口                            │
  │ ├── user/                       # 用户记忆                             │
  │ ├── feedback/                   # 反馈记忆                             │
  │ ├── project/                    # 项目记忆                             │
  │ └── reference/                  # 引用记忆                             │
  └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  Layer 2: Project Memory
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ <project>/.upup/memory/                                               │
  │ ~/.upup/projects/<slug>/memory/                                      │
  │ └── (同上结构)                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  Layer 3: Team Memory
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ ~/.upup/teams/<team>/memory/                                        │
  │ └── (同上结构)                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  Layer 4: Session Memory (临时)
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ ~/.upup/sessions/<id>/memory/ephemeral/                             │
  │ └── (同上结构)                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Todo List

### 🔴 P1 - 核心功能 (必须实现)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 1 | Messages API | 🔲 | messages.ts | client.messages.create() |
| 2 | Tool Runner | 🔲 | tool-runner.ts | Claude SDK 风格工具循环 |
| 3 | ToolError 处理 | 🔲 | tool-error.ts | 工具错误处理 |
| 4 | Session Store | 🔲 | session/store.ts | FileSessionStore, JsonSessionStore |
| 5 | MemoryManager | 🔲 | memory/manager.ts | CRUD + Search |
| 6 | Memory Store | 🔲 | memory/store.ts | FileMemoryStore, JsonMemoryStore |
| 7 | Streaming 增强 | 🔲 | stream.ts | 事件流完整实现 |
| 8 | SDKError 增强 | 🔲 | errors.ts | 完整错误类型 |

### 🟡 P2 - 重要功能

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 9 | BetaTool (Zod) | 🔲 | beta-tool.ts | Zod schema 工具定义 |
| 10 | Batch Processing | 🔲 | batch.ts | 批量消息处理 |
| 11 | PostSampling Hooks | 🔲 | hooks/post-sampling.ts | 采样后钩子 |
| 12 | File Upload API | 🔲 | file.ts | 文件上传管理 |
| 13 | Token Counter | 🔲 | token.ts | token 计数 |
| 14 | MCP Client | 🔲 | mcp.ts | MCP 客户端集成 |

### 🟢 P3 - 企业级功能

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 15 | Skills API | 🔲 | skills.ts | Agent Skills 支持 |
| 16 | Cloud Sync | 🔲 | sync.ts | 云端同步 |
| 17 | Prompt Cache | 🔲 | cache.ts | 提示缓存 |
| 18 | Context Management | 🔲 | context.ts | 1M Token 上下文 |

---

## 📁 文件变更清单

```
packages/sdk/src/
│
├── [新增 - P1]
├── messages.ts                 # Messages API
│   ├── MessagesClient
│   ├── create(params): Message
│   ├── stream(params): MessageStream
│   └── countTokens(params): TokenCount
│
├── tool-runner.ts             # Tool Runner (Claude SDK 风格)
│   ├── class ToolRunner
│   ├── create(params): ToolRunner
│   ├── runUntilDone(): Promise<Message>
│   ├── pushMessages(messages): void
│   ├── abort(): void
│   └── [Symbol.asyncIterator](): AsyncIterator
│
├── tool-error.ts              # ToolError 处理
│   ├── class ToolError
│   ├── class ToolUseError
│   └── class ToolResultError
│
├── session/
│   └── store.ts              # Session Store 实现
│       ├── class FileSessionStore
│       ├── class JsonSessionStore
│       └── class MemorySessionStore
│
├── memory/                    # Memory 模块 (NEW)
│   ├── index.ts              # 模块入口
│   ├── manager.ts            # MemoryManager
│   ├── store.ts             # MemoryStore 实现
│   ├── types.ts             # Memory 类型
│   ├── entry.ts             # MemoryEntry 类
│   └── search.ts            # Search 实现
│
├── errors.ts                 # 增强错误类型
│   ├── class SDKError
│   ├── class SessionError
│   ├── class MemoryError
│   ├── class ValidationError
│   └── class NetworkError
│
├── stream.ts                 # Streaming 增强
│   ├── class MessageStream
│   ├── on(event, handler): Stream
│   ├── finalMessage(): Promise<Message>
│   ├── finalText(): Promise<string>
│   └── abort(): void
│
├── [新增 - P2]
├── beta-tool.ts              # BetaTool (Zod)
│   ├── function betaTool()
│   └── function betaZodTool()
│
├── batch.ts                  # Batch Processing
│   ├── class BatchProcessor
│   ├── create(requests): Batch
│   ├── getStatus(batchId): BatchStatus
│   └── getResults(batchId): AsyncGenerator
│
├── file.ts                   # File Upload API
│   ├── class FileManager
│   ├── upload(file): File
│   └── download(fileId): ReadableStream
│
├── token.ts                  # Token Counter
│   ├── countTokens(text, model?): Promise<TokenCount>
│   └── countMessages(messages, model?): Promise<TokenCount>
│
├── [新增 - P3]
├── skills.ts                 # Skills API
│   ├── createSkill(params): Skill
│   ├── getSkill(id): Skill
│   ├── listSkills(): Skill[]
│   └── deleteSkill(id): void
│
├── sync.ts                   # Cloud Sync
│   ├── class SyncClient
│   ├── sync(): SyncResult
│   └── resolve(): ConflictResult
│
├── cache.ts                  # Prompt Cache
│   ├── class PromptCache
│   ├── get(key): CacheEntry
│   ├── set(key, entry): void
│   └── invalidate(key): void
│
├── [更新]
├── index.ts                 # 导出新类型和类
├── client/client.ts          # 集成新功能
└── session/manager.ts       # 集成 SessionStore
```

---

## 🔧 API 设计

### Messages API

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
  constructor(private transport: Transport) {}

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

### ToolRunner

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

  static create(params: ToolRunnerParams): Promise<ToolRunner> {
    return new ToolRunner(params);
  }

  async runUntilDone(): Promise<Message> {
    // 运行直到没有更多工具调用
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
    // 中止当前运行
  }
}
```

### MemoryManager

```typescript
// packages/sdk/src/memory/manager.ts

export interface MemoryEntryInput {
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  description?: string;
  content: string;
  scope?: 'private' | 'team' | 'project' | 'global';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export class MemoryManager {
  constructor(private store: MemoryStore) {}

  async write(entry: MemoryEntryInput): Promise<MemoryEntry> {
    // 写入记忆
  }

  async read(id: string): Promise<MemoryEntry | null> {
    // 读取记忆
  }

  async update(id: string, entry: Partial<MemoryEntryInput>): Promise<MemoryEntry> {
    // 更新记忆
  }

  async delete(id: string): Promise<void> {
    // 删除记忆
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    // 搜索记忆
  }

  async list(
    type?: MemoryType,
    options?: ListOptions
  ): Promise<MemoryEntry[]> {
    // 列出记忆
  }

  async getStats(): Promise<MemoryStats> {
    // 获取统计
  }
}
```

### MessageStream

```typescript
// packages/sdk/src/stream.ts

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'content_block'; block: ContentBlock }
  | { type: 'tool_use'; tool: ToolUse }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'message'; message: Message }
  | { type: 'error'; error: Error }
  | { type: 'end' };

export class MessageStream implements AsyncIterable<StreamEvent> {
  constructor(private response: Response) {}

  on(event: StreamEvent['type'], handler: (data: any) => void): this {
    return this;
  }

  async finalMessage(): Promise<Message> {}
  async finalText(): Promise<string> {}
  abort(): void {}
  toReadableStream(): ReadableStream {}

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {}
}
```

---

## 📊 实现顺序

```
Phase 1: P1 核心功能 (预计 2-3 周)
├── 1.1 Messages API
├── 1.2 Tool Runner
├── 1.3 ToolError
├── 1.4 Session Store
├── 1.5 MemoryManager
├── 1.6 MemoryStore
├── 1.7 Streaming 增强
└── 1.8 SDKError 增强

Phase 2: P2 重要功能 (预计 2-3 周)
├── 2.1 BetaTool (Zod)
├── 2.2 Batch Processing
├── 2.3 PostSampling Hooks
├── 2.4 File Upload
├── 2.5 Token Counter
└── 2.6 MCP Client

Phase 3: P3 企业级功能 (预计 3-4 周)
├── 3.1 Skills API
├── 3.2 Cloud Sync
├── 3.3 Prompt Cache
└── 3.4 Context Management
```

---

## ✅ 验收标准

| 阶段 | 验收条件 |
|------|----------|
| **P1** | Messages API、ToolRunner、MemoryManager 可用，通过单元测试 |
| **P2** | BetaTool、Batch、File Upload 可用 |
| **P3** | Skills API 和 Cloud Sync 可用 |

---

## 📝 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-05-15 | 初始版本，分析完成 |

---

**创建时间**: 2026-05-15
**版本**: v1.0
**状态**: 分析完成，待实施