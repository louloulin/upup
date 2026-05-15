# Plan 14 - SDK Session & Memory 增强与 Claude Agent SDK 对标

**日期**: 2026-05-15
**版本**: v1.0
**状态**: 分析完成，待实施
**目标**: 完善 SDK 的 Session 和 Memory 功能，对标 Claude Agent SDK

---

## 📋 执行摘要

### 核心发现

1. **Dexter Plugin SDK 当前版本**: v0.2.0 (轻量级)
2. **主要差距**: Session 和 Memory 功能仅作为类型导出，无操作 API
3. **参考目标**: Claude Agent SDK (@anthropic-ai/sdk v0.74.0)
4. **升级路径**: Phase 1 (核心) → Phase 2 (高级) → Phase 3 (企业级)

### Claude Agent SDK 功能矩阵

| 功能 | Claude SDK | Dexter SDK | Gap | 优先级 |
|------|-------------|------------|-----|--------|
| **Messages API** | ✅ | ❌ | 🔴 | P1 |
| **Tool Runner** | ✅ | ❌ | 🔴 | P1 |
| **Streaming** | ✅ | ❌ | 🔴 | P1 |
| **Batch Processing** | ✅ | ❌ | 🔴 | P2 |
| **MCP Integration** | ✅ | ⚠️ 基础 | 🟡 | P2 |
| **Skills API** | ✅ | ❌ | 🔴 | P3 |
| **File Upload** | ✅ | ❌ | 🔴 | P2 |
| **Error Handling** | ✅ | ⚠️ 基础 | 🟡 | P1 |
| **Session Management** | ✅ | ⚠️ 类型 | 🟡 | P1 |
| **Memory API** | ✅ | ⚠️ 类型 | 🟡 | P1 |

---

## 📊 当前 SDK 分析

### Dexter Plugin SDK 架构

```
packages/plugin-sdk/
├── src/
│   ├── index.ts          # PluginAPI 主入口
│   └── manifest.ts       # Manifest 定义
└── dist/                 # 编译输出
```

### 当前功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **Tool Registration** | ✅ | registerTool() |
| **Hook System** | ✅ | registerHook() |
| **MCP Channels** | ✅ | registerChannel() |
| **CLI Commands** | ✅ | registerCli() |
| **LLM Providers** | ✅ | registerProvider() |
| **Lifecycle** | ✅ | on(), ready() |
| **Logging** | ✅ | logger |
| **Configuration** | ✅ | getConfig() |

### 缺失功能

| 功能 | 状态 | 说明 |
|------|------|------|
| **Session CRUD** | ❌ | 无 Session 创建/管理 API |
| **Memory API** | ❌ | 无 Memory 读写 API |
| **Tool Executor** | ❌ | 无工具调用循环 |
| **Message Builder** | ❌ | 无消息构建工具 |
| **Stream Handler** | ❌ | 无流式处理 |
| **Batch Processor** | ❌ | 无批量处理 |
| **File Operations** | ❌ | 无文件上传/下载 |
| **Token Counter** | ❌ | 无 token 计数 |

---

## 🎯 目标架构

### SDK 分层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEXTER SDK ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 1: Plugin Interface                          ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   PluginAPI                                                          ║
  ║   ├── registerTool()                                                ║
  ║   ├── registerHook()                                                ║
  ║   ├── registerChannel()                                              ║
  ║   ├── registerCli()                                                  ║
  ║   ├── registerProvider()                                             ║
  ║   └── getConfig()                                                    ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 2: Session Manager                           ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   SessionManager                                                     ║
  ║   ├── create(config) → Session                                      ║
  ║   ├── resume(sessionId) → Session                                     ║
  ║   ├── sendMessage(sessionId, message) → Response                     ║
  ║   ├── streamMessage(sessionId, message) → Stream                     ║
  ║   ├── list(options?) → Session[]                                     ║
  ║   ├── delete(sessionId) → void                                        ║
  ║   ├── export(sessionId, format) → string                            ║
  ║   └── fork(sessionId, config?) → Session                             ║
  ║                                                                        ║
  ║   Session                                                             ║
  ║   ├── id, config, messages, createdAt, updatedAt                    ║
  ║   ├── addMessage(message)                                             ║
  ║   ├── getHistory(options?) → Message[]                               ║
  ║   └── toJSON() → SessionJSON                                         ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 3: Memory Manager                           ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   MemoryManager                                                      ║
  ║   ├── write(entry, options?) → MemoryEntry                          ║
  ║   ├── read(id) → MemoryEntry                                         ║
  ║   ├── update(id, entry) → MemoryEntry                               ║
  ║   ├── delete(id) → void                                              ║
  ║   ├── search(query, options?) → SearchResult[]                      ║
  ║   ├── list(type?, options?) → MemoryEntry[]                         ║
  ║   └── getStats() → MemoryStats                                       ║
  ║                                                                        ║
  ║   MemoryEntry                                                        ║
  ║   ├── id, type, name, description, content                          ║
  ║   ├── scope (private/team/project/global)                            ║
  ║   ├── createdAt, updatedAt                                           ║
  ║   └── metadata                                                        ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 4: Tool Executor                             ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   ToolExecutor                                                        ║
  ║   ├── register(tool)                                                  ║
  ║   ├── execute(toolName, input) → ToolResult                         ║
  ║   ├── validate(toolName, input) → ValidationResult                  ║
  ║   └── list() → Tool[]                                                ║
  ║                                                                        ║
  ║   ToolRunner (Claude SDK 风格)                                        ║
  ║   ├── create(messages, tools) → ToolRunner                           ║
  ║   ├── runUntilDone() → FinalMessage                                 ║
  ║   ├── pushMessages(messages) → void                                  ║
  ║   └── abort() → void                                                 ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
                                    │
                                    ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                     LAYER 5: Streaming & Batch                          ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                        ║
  ║   MessageStream                                                       ║
  ║   ├── on(event, handler) → Stream                                    ║
  ║   ├── finalMessage() → Message                                        ║
  ║   ├── finalText() → string                                           ║
  ║   ├── abort() → void                                                 ║
  ║   └── toReadableStream() → ReadableStream                            ║
  ║                                                                        ║
  ║   BatchProcessor                                                     ║
  ║   ├── create(requests) → Batch                                       ║
  ║   ├── getStatus(batchId) → BatchStatus                                ║
  ║   ├── getResults(batchId) → AsyncGenerator                           ║
  ║   └── cancel(batchId) → void                                          ║
  ║                                                                        ║
  ╚═══════════════════════════════════════════════════════════════════════╝
```

### Session 生命周期

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SESSION LIFECYCLE                                      │
└─────────────────────────────────────────────────────────────────────────────┘

  Create Session
       │
       ▼
  ┌─────────────┐
  │  ACTIVE     │ ◄────────────────────┐
  │  (sending   │                      │
  │   messages) │                      │
  └──────┬──────┘                      │
         │                             │
         │  idle_timeout              │
         ▼                             │
  ┌─────────────┐                     │
  │  IDLE       │ ────────────────────┤
  │  (waiting   │                     │
  │   resume)   │                     │
  └──────┬──────┘                     │
         │                             │
         │  fork()                    │
         ▼                             │
  ┌─────────────┐                     │
  │  FORKED     │                     │
  │  (branch    │                     │
  │   created)  │                     │
  └──────┬──────┘                     │
         │                             │
         │  delete()                  │
         ▼                             │
  ┌─────────────┐                     │
  │  DELETED    │ ────────────────────┘
  │  (archived) │
  └─────────────┘
```

---

## 📋 Todo List

### 🔴 P1 - 核心功能 (必须实现)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 1 | SessionManager 类 | 🔲 | session-manager.ts | 创建/管理 Session |
| 2 | Session CRUD API | 🔲 | session-manager.ts | create/resume/delete/list |
| 3 | Session 消息 API | 🔲 | session-manager.ts | sendMessage, getHistory |
| 4 | MemoryManager 类 | 🔲 | memory-manager.ts | 读写 Memory |
| 5 | Memory CRUD API | 🔲 | memory-manager.ts | write/read/update/delete |
| 6 | Memory Search API | 🔲 | memory-manager.ts | search, list |
| 7 | Error 增强 | 🔲 | errors.ts | SDKError, SessionError 等 |
| 8 | 类型导出更新 | 🔲 | index.ts | 导出新类型 |

### 🟡 P2 - 高级功能 (重要)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 9 | ToolRunner 类 | 🔲 | tool-runner.ts | Claude SDK 风格工具循环 |
| 10 | Stream Handler | 🔲 | stream-handler.ts | 流式消息处理 |
| 11 | Batch Processor | 🔲 | batch-processor.ts | 批量消息处理 |
| 12 | File Upload API | 🔲 | file-api.ts | 文件上传/管理 |
| 13 | Token Counter | 🔲 | token-counter.ts | token 计数 |
| 14 | MCP 增强 | 🔲 | mcp-client.ts | 完整 MCP 客户端 |

### 🟢 P3 - 企业级功能 (可选)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 15 | Skills API | 🔲 | skills-api.ts | Agent Skills 支持 |
| 16 | Context Management | 🔲 | context-manager.ts | 1M Token 上下文 |
| 17 | Prompt Cache | 🔲 | prompt-cache.ts | 提示缓存 |
| 18 | Cloud Sync | 🔲 | sync-client.ts | 云端同步 |

---

## 📁 文件变更清单

```
packages/plugin-sdk/src/
│
├── [新增]
├── session-manager.ts       # Session 管理器
│   ├── class SessionManager
│   ├── class Session
│   ├── create(config): Session
│   ├── resume(sessionId): Session
│   ├── sendMessage(sessionId, message): Response
│   ├── streamMessage(sessionId, message): Stream
│   ├── list(options?): Session[]
│   ├── delete(sessionId): void
│   ├── export(sessionId, format): string
│   └── fork(sessionId, config?): Session
│
├── memory-manager.ts       # Memory 管理器
│   ├── class MemoryManager
│   ├── class MemoryEntry
│   ├── write(entry, options?): MemoryEntry
│   ├── read(id): MemoryEntry
│   ├── update(id, entry): MemoryEntry
│   ├── delete(id): void
│   ├── search(query, options?): SearchResult[]
│   ├── list(type?, options?): MemoryEntry[]
│   └── getStats(): MemoryStats
│
├── tool-runner.ts          # 工具运行器 (Claude SDK 风格)
│   ├── class ToolRunner
│   ├── create(messages, tools): ToolRunner
│   ├── runUntilDone(): Promise<Message>
│   ├── pushMessages(messages): void
│   ├── abort(): void
│   └── [Symbol.asyncIterator](): AsyncIterator
│
├── stream-handler.ts       # 流式处理
│   ├── class MessageStream
│   ├── on(event, handler): MessageStream
│   ├── finalMessage(): Promise<Message>
│   ├── finalText(): Promise<string>
│   ├── abort(): void
│   └── toReadableStream(): ReadableStream
│
├── batch-processor.ts      # 批量处理
│   ├── class BatchProcessor
│   ├── create(requests): Batch
│   ├── getStatus(batchId): BatchStatus
│   ├── getResults(batchId): AsyncGenerator
│   └── cancel(batchId): void
│
├── errors.ts               # 错误类型
│   ├── class SDKError
│   ├── class SessionError
│   ├── class MemoryError
│   ├── class ToolError
│   ├── class ValidationError
│   └── class NetworkError
│
├── [更新]
├── index.ts                # 导出新类型和类
└── manifest.ts             # 更新 Manifest
```

---

## 🔧 API 设计

### SessionManager

```typescript
// packages/plugin-sdk/src/session-manager.ts

export interface SessionConfig {
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  tools?: Tool[];
  hooks?: Hook[];
}

export interface SessionOptions {
  projectId?: string;
  teamId?: string;
  metadata?: Record<string, unknown>;
}

export class Session {
  constructor(
    public readonly id: string,
    public config: SessionConfig,
    public createdAt: Date,
    public updatedAt: Date,
    private messages: Message[] = [],
  ) {}

  addMessage(message: Message): void;
  getHistory(options?: { limit?: number; before?: Date }): Message[];
  toJSON(): SerializedSession;
}

export class SessionManager {
  constructor(
    private api: PluginAPI,
    private storage: SessionStorage,
  ) {}

  async create(config: SessionConfig, options?: SessionOptions): Promise<Session> {
    // 创建新 Session
  }

  async resume(sessionId: string): Promise<Session | null> {
    // 恢复现有 Session
  }

  async sendMessage(
    sessionId: string,
    message: Message | string,
  ): Promise<AgentResponse> {
    // 发送消息并获取响应
  }

  async streamMessage(
    sessionId: string,
    message: Message | string,
  ): Promise<MessageStream> {
    // 流式发送消息
  }

  async list(options?: { projectId?: string; limit?: number }): Promise<Session[]> {
    // 列出所有 Session
  }

  async delete(sessionId: string): Promise<void> {
    // 删除 Session (软删除)
  }

  async export(sessionId: string, format: 'json' | 'markdown'): Promise<string> {
    // 导出 Session
  }

  async fork(sessionId: string, config?: Partial<SessionConfig>): Promise<Session> {
    // Fork Session
  }
}
```

### MemoryManager

```typescript
// packages/plugin-sdk/src/memory-manager.ts

export interface MemoryEntryInput {
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  description?: string;
  content: string;
  scope?: 'private' | 'team' | 'project' | 'global';
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  maxResults?: number;
  minScore?: number;
  type?: 'user' | 'feedback' | 'project' | 'reference';
  scope?: 'private' | 'team' | 'project' | 'global';
  tags?: string[];
  since?: Date;
}

export class MemoryManager {
  constructor(
    private api: PluginAPI,
    private storage: MemoryStorage,
  ) {}

  async write(entry: MemoryEntryInput, options?: { merge?: boolean }): Promise<MemoryEntry> {
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

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // 搜索记忆
  }

  async list(type?: MemoryType, options?: SearchOptions): Promise<MemoryEntry[]> {
    // 列出记忆
  }

  async getStats(): Promise<MemoryStats> {
    // 获取统计信息
  }
}
```

### ToolRunner

```typescript
// packages/plugin-sdk/src/tool-runner.ts

export interface ToolRunnerParams {
  messages: Message[];
  tools: Tool[];
  model?: string;
  maxIterations?: number;
}

export class ToolRunner {
  private messages: Message[];
  private tools: Tool[];
  private client: Anthropic;

  static async create(params: ToolRunnerParams): Promise<ToolRunner> {
    return new ToolRunner(params);
  }

  async runUntilDone(): Promise<Message> {
    // 运行直到没有更多工具调用
  }

  pushMessages(messages: Message[]): void {
    this.messages.push(...messages);
  }

  abort(): void {
    // 中止当前运行
  }

  [Symbol.asyncIterator](): AsyncIterator<ToolEvent> {
    // 异步迭代器支持
  }
}
```

### Stream Handler

```typescript
// packages/plugin-sdk/src/stream-handler.ts

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'content_block'; block: ContentBlock }
  | { type: 'tool_use'; tool: ToolUse }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'message'; message: Message }
  | { type: 'error'; error: Error }
  | { type: 'end' };

export class MessageStream {
  constructor(private response: Response) {}

  on(event: StreamEvent['type'], handler: (data: any) => void): this {
    // 注册事件处理器
    return this;
  }

  async finalMessage(): Promise<Message> {
    // 获取最终消息
  }

  async finalText(): Promise<string> {
    // 获取最终文本
  }

  abort(): void {
    // 中止流
  }

  toReadableStream(): ReadableStream {
    // 转为标准 ReadableStream
  }
}
```

---

## 📊 实现顺序

```
Phase 1: P1 核心功能 (预计 1-2 周)
├── 1.1 SessionManager 基础
├── 1.2 Session CRUD
├── 1.3 Session 消息
├── 1.4 MemoryManager 基础
├── 1.5 Memory CRUD
├── 1.6 Memory Search
└── 1.7 Error 增强

Phase 2: P2 高级功能 (预计 2-3 周)
├── 2.1 ToolRunner
├── 2.2 Stream Handler
├── 2.3 Batch Processor
├── 2.4 File Upload
├── 2.5 Token Counter
└── 2.6 MCP 增强

Phase 3: P3 企业级功能 (预计 3-4 周)
├── 3.1 Skills API
├── 3.2 Context Management
├── 3.3 Prompt Cache
└── 3.4 Cloud Sync
```

---

## ✅ 验收标准

| 阶段 | 验收条件 |
|------|----------|
| **P1** | Session 和 Memory API 可用，通过单元测试 |
| **P2** | ToolRunner 和 Stream 可用 |
| **P3** | Skills API 和云同步可用 |

---

## 📝 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-05-15 | 初始版本，分析完成 |

---

**创建时间**: 2026-05-15
**版本**: v1.0
**状态**: 分析完成，待实施
