# SDK v3 - Stream + Session 一体架构改造计划

> **目标**: 实现 Stream 与 Session 的深度融合，构建统一的会话流处理架构
> **核心策略**: Hook 驱动生命周期，零侵入式改造，完全向后兼容
> **最后更新**: 2026-05-16

---

## 1. 执行流程分析

### 1.1 当前 SDK 执行流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UPUP SDK 执行流程分析                                        │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        用户代码层                                         │
   └─────────────────────────────────────────────────────────────────────────┘

   const client = await createClient()
   const result = await client.query('分析苹果股票')
   //       │
   //       ▼
   // for await (const msg of client.stream('分析苹果股票')) { ... }
   //       │
   //       ▼
   // client.stream() → transport.send() → 等待 done → 返回 result

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        内部调用链                                         │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │   client    │───▶│  transport   │───▶│  subprocess  │───▶│   upup 进程   │
   │   .query()  │    │   .send()    │    │   stdin      │    │              │
   └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
          │                                                                 │
          │                    ┌─────────────────────────────────────────┘
          │                    ▼
          │              ┌──────────────┐    ┌──────────────┐
          │              │  subprocess  │◄───│   upup 进程   │
          │              │   stdout     │    │              │
          │              └──────┬───────┘    └──────────────┘
          │                     │
          ▼                     ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        transport.messages()                                │
   │                                                                         │
   │   AsyncGenerator<object> - 消费 stdout 管道                            │
   │   - 解析 JSON-RPC 格式消息                                              │
   │   - 触发 eventHandlers                                                 │
   │   - yield 给调用者                                                     │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        消息类型流程                                        │
   │                                                                         │
   │   user message (发送)                                                   │
   │        │                                                               │
   │        ▼                                                               │
   │   system message (初始化)                                               │
   │        │                                                               │
   │        ▼                                                               │
   │   event: stream_progress (增量文本)                                      │
   │        │                                                               │
   │        ▼                                                               │
   │   event: tool_use (工具调用) ────────┐                                  │
   │        │                              │                                  │
   │        ▼                              │ 循环                            │
   │   event: tool_result (工具结果) ──────┘                                  │
   │        │                                                               │
   │        ▼                                                               │
   │   event: done (完成)                                                    │
   │        │                                                               │
   │        ▼                                                               │
   │   result message (最终结果)                                              │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 当前 Session 管理流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     当前 Session 管理流程                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                     SessionManager 架构                                    │
   │                                                                         │
   │   currentSession: SessionInfo | null                                     │
   │        │                                                               │
   │        ├── id: string                                                   │
   │        ├── status: 'created' | 'active' | 'paused' | 'completed' | ... │
   │        ├── messageCount: number                                        │
   │        ├── tokenUsage?: { inputTokens, outputTokens, totalTokens }      │
   │        └── createdAt, lastActiveAt                                      │
   │                                                                         │
   │   messages: SessionMessage[]                                            │
   │        │                                                               │
   │        ├── role: 'user' | 'assistant' | 'system'                        │
   │        ├── content: string                                              │
   │        ├── timestamp: Date                                               │
   │        ├── tokens?: number                                              │
   │        ├── toolCalls?: [...]                                            │
   │        └── toolResults?: [...]                                          │
   │                                                                         │
   │   store?: SessionStore (可选)                                           │
   │        │                                                               │
   │        ├── save(session, messages)                                       │
   │        ├── load(sessionId)                                               │
   │        └── list(), exists(), delete()                                    │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                      现有 Session 方法                                     │
   │                                                                         │
   │   create(config)     → 创建新会话，返回 SessionInfo                      │
   │   addMessage(msg)    → 手动添加消息                                     │
   │   pause()           → 暂停会话                                         │
   │   continue(id)      → 继续会话                                         │
   │   complete()        → 完成会话                                         │
   │   save()           → 保存到 store                                     │
   │   load(id)          → 从 store 加载                                    │
   │   getMessages()     → 获取消息历史                                      │
   │   getStatus()      → 获取会话状态                                       │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 当前 Stream 实现

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        当前 Stream 实现                                        │
└─────────────────────────────────────────────────────────────────────────────┘

   async *stream(query, options): AsyncGenerator<SDKMessage> {
       // 1. 发送请求
       this.transport.send({
         jsonrpc: '2.0',
         id: Date.now(),
         method: 'run',
         params: { prompt: query, ...options }
       })

       // 2. 流式接收
       for await (const msg of this.transport.messages()) {
         yield msg  // 直接 yield，不同步到 Session
       }
   }

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        问题点                                           │
   │                                                                         │
   │   ❌ Stream 消息不自动同步到 Session                                    │
   │   ❌ 用户需要手动 session.addMessage()                                  │
   │   ❌ messageCount 不自动更新                                            │
   │   ❌ tokenUsage 不自动更新                                             │
   │   ❌ query() 基于 stream 但等待 done 事件                              │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Claude Agent SDK Session + Stream 深度分析

### 2.1 Claude SDK 核心设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude Agent SDK 核心设计                                    │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                     Session-Stream 一体模式                               │
   │                                                                         │
   │   Session 是 Stream 的历史，Stream 是 Session 的当前                     │
   │                                                                         │
   │   for await (const msg of client.query({                               │
   │     messages: [{ role: 'user', content: 'Hello' }]                     │
   │   })) {                                                               │
   │                                                                         │
   │     // msg 自动累积到 Session                                          │
   │     // session.messages 等于已消费的 Stream                             │
   │   }                                                                    │
   │                                                                         │
   │   // 两者完全等价                                                      │
   │   session.messages.length === 已消费的 msg 总数                         │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                      Claude SDK 内部实现                                  │
   │                                                                         │
   │   async *query(params) {                                              │
   │       // 1. 获取或创建 Session                                         │
   │       const session = this.getOrCreateSession(params.sessionId)         │
   │                                                                         │
   │       // 2. 生命周期 Hook                                              │
   │       await this.hooks.execute('SessionStart', { session })             │
   │                                                                         │
   │       // 3. Stream 循环                                                │
   │       for await (const msg of this.transport.stream(params)) {          │
   │           // 自动同步到 Session                                          │
   │           session.addMessage(msg)                                       │
   │           yield msg                                                     │
   │       }                                                                 │
   │                                                                         │
   │       // 4. 结束 Hook                                                  │
   │       await this.hooks.execute('SessionEnd', { session })               │
   │   }                                                                    │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Claude SDK Stream Event 类型

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude SDK Stream Event 类型                                  │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                     增量式 Stream Event                                   │
   │                                                                         │
   │   message_start        → 消息开始                                       │
   │   content_block_start  → 内容块开始                                    │
   │   content_block_delta  → 内容块增量 (text_delta / input_json_delta)     │
   │   content_block_stop   → 内容块结束                                    │
   │   message_delta        → 消息增量 (stop_reason)                         │
   │   message_stop         → 消息结束                                       │
   │                                                                         │
   │   ┌─────────────────────────────────────────────────────────────────┐ │
   │   │                      SSE 格式                                     │ │
   │   │                                                                  │ │
   │   │   event: message_start                                           │ │
   │   │   data: {"type":"message_start","message":{...}}                 │ │
   │   │                                                                  │ │
   │   │   event: content_block_delta                                     │ │
   │   │   data: {"type":"content_block_delta","delta":{"type":"text_d... │ │
   │   │                                                                  │ │
   │   │   data: [DONE]                                                   │ │
   │   │                                                                  │ │
   │   └─────────────────────────────────────────────────────────────────┘ │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Claude SDK SessionMessage 结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude SDK SessionMessage 结构                               │
└─────────────────────────────────────────────────────────────────────────────┘

   interface SessionMessage {
     id: string              // 消息唯一 ID
     type: string           // 'user' | 'assistant' | 'system' | ...
     role: string           // 'user' | 'assistant' | 'system'
     content: string | ContentBlock[]

     // 消息链支持
     parentUuid?: string       // 父消息 ID，支持追问
     rootUuid?: string        // 根消息 ID
     children?: string[]     // 子消息 IDs

     // 工具关联
     toolUseId?: string      // tool_use 的 ID
     toolName?: string       // 工具名称
     toolResult?: string     // 工具结果

     // 元数据
     timestamp: number       // 时间戳
     isEphemeral?: boolean  // 是否临时（不持久化）
     metadata?: Record<string, unknown>
   }
```

### 2.4 Claude SDK Hook 生命周期

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude SDK Hook 生命周期                                      │
└─────────────────────────────────────────────────────────────────────────────┘

   createSession()
        │
        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  SessionStart Hook                                            │
   │        │                                                     │
   │        ▼                                                     │
   │  UserPromptSubmit Hook                                        │
   │        │                                                     │
   │        ▼                                                     │
   │  PreToolUse Hook ──────────────────────▶ 工具执行             │
   │        │                                                     │
   │  PostToolUse Hook ◀────────────────────                     │
   │        │                                                     │
   │  StreamMessage Hook (每条消息)                               │
   │        │                                                     │
   │        │  循环: 多个 ToolUse                                │
   │        ▼                                                     │
   │  SessionEnd Hook                                             │
   └──────────────────────────────────────────────────────────────┘
```

---

## 3. 目标架构设计

### 3.1 Stream + Session 一体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Stream + Session 一体架构                                      │
└─────────────────────────────────────────────────────────────────────────────┘

   ╔═══════════════════════════════════════════════════════════════════════════╗
   ║                           用户视角                                        ║
   ╚═══════════════════════════════════════════════════════════════════════════╝

   client.stream('Hello')
         │
         ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  for await (const msg of ...) {                                       │
   │                                                                       │
   │    // msg 双向流动:                                                   │
   │    // 1. 向上: yield 给用户                                          │
   │    // 2. 向下: 同步到 session.messages                               │
   │                                                                       │
   │    ┌─────────┐    yield     ┌─────────┐                             │
   │    │  用户   │ ◄────────── │ Stream  │                             │
   │    │  代码   │            │  循环   │                             │
   │    └─────────┘            └────┬────┘                             │
   │                               │                                    │
   │                               │ addMessage()                       │
   │                               ▼                                    │
   │                          ┌─────────┐                             │
   │                          │ Session │                             │
   │                          │History  │                             │
   │                          └─────────┘                             │
   │                                                                       │
   │  session = client.getSession()                                    │
   │  messages = session.getMessages()  // = stream 历史               │
   │                                                                       │
   └────────────────────────────────────────────────────────────────────────┘

   ╔═══════════════════════════════════════════════════════════════════════════╗
   ║                           内部视角                                        ║
   ╚═══════════════════════════════════════════════════════════════════════════╝

   ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
   │   UpClient   │────────▶│    Hook     │────────▶│  SessionMgr  │
   │              │  stream  │  Executor   │  hook   │              │
   └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
           │                         │                         │
           │                         │                         │
           ▼                         ▼                         ▼
   ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
   │  Transport   │◄────────│    Hooks     │         │   Session    │
   │  (stdio)    │  events │   用户自定义  │         │   Store      │
   └───────┬───────┘         └───────────────┘         └───────────────┘
           │
           │ stdin/stdout
           ▼
   ┌───────────────┐
   │   upup 进程   │
   └───────────────┘
```

### 3.2 统一数据流架构 (ANSI 框图)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      统一数据流架构 (ANSI 框图)                                  │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
   │  ░                           用户代码层                                ░  │
   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
   └──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ╔════════════════════════════════════════════════════════════════════╗  │
   │  ║                         UpClient                                  ║  │
   │  ║  ┌──────────────────────────────────────────────────────────────┐  ║  │
   │  ║  │                     stream() 方法                           │  ║  │
   │  ║  │  • 触发 StreamStart Hook                                   │  ║  │
   │  ║  │  • 发送 transport.send()                                   │  ║  │
   │  ║  │  • 循环: for await msg of transport.messages()             │  ║  │
   │  ║  │  • yield msg → 用户代码                                    │  ║  │
   │  ║  │  • 触发 StreamMessage Hook → SessionManager 同步            │  ║  │
   │  ║  │  • 触发 StreamEnd Hook                                     │  ║  │
   │  ║  └──────────────────────────────────────────────────────────────┘  ║  │
   │  ╚════════════════════════════════════════════════════════════════════╝  │
   └──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ╔════════════════════════════════════════════════════════════════════╗  │
   │  ║                       HookExecutor                                ║  │
   │  ║  ┌──────────────────────────────────────────────────────────────┐  ║  │
   │  ║  │                   内置同步 Hook                             │  ║  │
   │  ║  │  • StreamMessage Hook: msg → SessionMessage → addMessage() │  ║  │
   │  ║  │  • StreamEnd Hook: updateTokenUsage(), save()              │  ║  │
   │  ║  ├──────────────────────────────────────────────────────────────┤  ║  │
   │  ║  │                   用户自定义 Hook                           │  ║  │
   │  ║  │  • registerHook('StreamMessage', { hooks: [...] })        │  ║  │
   │  ║  │  • registerHook('StreamEnd', { hooks: [...] })            │  ║  │
   │  ║  └──────────────────────────────────────────────────────────────┘  ║  │
   │  ╚════════════════════════════════════════════════════════════════════╝  │
   └──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ╔════════════════════════════════════════════════════════════════════╗  │
   │  ║                     SessionManager                               ║  │
   │  ║  ┌──────────────────────────────────────────────────────────────┐  ║  │
   │  ║  │  currentSession: SessionInfo                                 │  ║  │
   │  ║  │  messages: SessionMessage[] ◀── 自动同步                     │  ║  │
   │  ║  │  messageCount: number ◀── 自动更新                           │  ║  │
   │  ║  │  tokenUsage ◀── StreamEnd Hook 更新                          │  ║  │
   │  ║  ├──────────────────────────────────────────────────────────────┤  ║  │
   │  ║  │  autoSync: boolean (默认 true)                               │  ║  │
   │  ║  │  bindHookExecutor(executor)                                  │  ║  │
   │  ║  └──────────────────────────────────────────────────────────────┘  ║  │
   │  ╚════════════════════════════════════════════════════════════════════╝  │
   └──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ╔════════════════════════════════════════════════════════════════════╗  │
   │  ║                      SessionStore                                 ║  │
   │  ║  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               ║  │
   │  ║  │JsonSession  │  │FileSession  │  │MemorySession│               ║  │
   │  ║  │  Store      │  │  Store      │  │  Store      │               ║  │
   │  ║  └─────────────┘  └─────────────┘  └─────────────┘               ║  │
   │  ╚════════════════════════════════════════════════════════════════════╝  │
   └──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 消息同步流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         消息同步流程                                         │
└─────────────────────────────────────────────────────────────────────────────┘

   upup 进程输出                    转换规则                    SessionMessage
   ──────────                       ─────────                    ─────────────

   { type: 'event',               ┌─────────────────┐
    event: {                       │ StreamMessage    │
     type: 'stream_progress',      │ Hook            │
     content: 'Hello'             │                 │
    }                              └────────┬────────┘
   }                                       │
                                             ▼
                                   ┌─────────────────┐
                                   │ _convert(msg)    │
                                   │                 │
                                   │ stream_progress  │──▶ role: 'assistant'
                                   │     ?           │    content: 'Hello'
                                   └────────┬────────┘    timestamp: Date
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │ tool_use        │──▶ role: 'assistant'
                                   │     ?           │    toolCalls: [{...}]
                                   └────────┬────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │ tool_result     │──▶ role: 'system'
                                   │     ?           │    toolResults: [{...}]
                                   └────────┬────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │ done            │──▶ (不记录为消息)
                                   │     ?           │    updateTokenUsage()
                                   └─────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        转换规则详解                                       │
   │                                                                         │
   │  stream_progress ──▶ {                                                   │
   │    role: 'assistant',                                                    │
   │    content: event.content,                                              │
   │    metadata: { subType: 'stream_progress' }                             │
   │  }                                                                       │
   │                                                                         │
   │  tool_use ──▶ {                                                         │
   │    role: 'assistant',                                                    │
   │    toolCalls: [{ id, name, input }],                                    │
   │    metadata: { subType: 'tool_use' }                                    │
   │  }                                                                       │
   │                                                                         │
   │  tool_result ──▶ {                                                      │
   │    role: 'system',                                                      │
   │    toolResults: [{ toolCallId, result }],                               │
   │    metadata: { subType: 'tool_result' }                                │
   │  }                                                                       │
   │                                                                         │
   │  done ──▶ { 不记录为消息，更新 tokenUsage }                             │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 生命周期 Hook 序列

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        生命周期 Hook 序列                                      │
└─────────────────────────────────────────────────────────────────────────────┘

   用户: client.createSession()
        │
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  SessionStart Hook                                                   │
   │  ───────────────────                                               │
   │                                                                     │
   │  输入: { sessionId, hook_event_name: 'SessionStart' }              │
   │                                                                     │
   │  行为:                                                              │
   │  • 初始化 Session                                                   │
   │  • 设置状态为 'active'                                              │
   │  • 注册内置 Hook                                                    │
   │  • 触发用户自定义 SessionStart Hook                                 │
   └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
   用户: for await (const msg of client.stream('Hello'))
        │
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  StreamStart Hook                                                   │
   │  ─────────────────                                                 │
   │                                                                     │
   │  输入: { sessionId, hook_event_name: 'StreamStart' }                │
   │                                                                     │
   │  行为:                                                              │
   │  • 添加用户消息到 session.messages                                   │
   │  • 触发用户自定义 StreamStart Hook                                 │
   └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  StreamMessage Hook (循环)                                           │
   │  ──────────────────────────                                          │
   │                                                                     │
   │  输入: { sessionId, stream_message: msg, hook_event_name }           │
   │                                                                     │
   │  内置行为:                                                          │
   │  1. 转换 msg → SessionMessage                                      │
   │  2. session.addMessage(convertedMsg)                                │
   │  3. 更新 messageCount                                              │
   │  4. 更新 tokenUsage (如果 done)                                    │
   │                                                                     │
   │  用户自定义: (可选)                                                 │
   │  client.registerHook('StreamMessage', { ... })                      │
   └────────────────────────────────────────────────────────────────────────┘
        │
        │  循环: 每条消息执行一次
        │
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  StreamEnd Hook                                                     │
   │  ────────────                                                      │
   │                                                                     │
   │  输入: { sessionId, hook_event_name: 'StreamEnd', tokenUsage }       │
   │                                                                     │
   │  行为:                                                              │
   │  • 更新最终 tokenUsage                                             │
   │  • session.save() (如果配置了 store)                              │
   │  • 触发用户自定义 StreamEnd Hook                                   │
   └────────────────────────────────────────────────────────────────────────┘
        │
        ▼
   用户: await client.close()
        │
        ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  SessionEnd Hook                                                   │
   │  ─────────────                                                     │
   │                                                                     │
   │  输入: { sessionId, hook_event_name: 'SessionEnd' }               │
   │                                                                     │
   │  行为:                                                              │
   │  • session.complete()                                               │
   │  • 设置状态为 'completed'                                          │
   │  • 清理资源                                                        │
   │  • 触发用户自定义 SessionEnd Hook                                  │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 具体实现方案

### 4.1 类型扩展 (hooks/types.ts)

```typescript
// packages/sdk/src/hooks/types.ts

// ============ 新增 HookEvent ============
export type HookEvent =
  // ... 现有事件 ...
  | 'StreamStart'      // Stream 开始
  | 'StreamMessage'    // 每条 Stream 消息
  | 'StreamEnd'        // Stream 结束

// ============ 扩展 HookInput ============
export interface HookInput {
  // ... 现有字段 ...

  // Stream 相关
  session_id?: string
  stream_message?: SDKMessage
  message_type?: 'stream_progress' | 'tool_use' | 'tool_result' | 'done'
  message_content?: string
  token_usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}
```

### 4.2 类型扩展 (session/types.ts)

```typescript
// packages/sdk/src/session/types.ts

// ============ 扩展 SessionMessage ============
export interface SessionMessage {
  // ... 现有字段 ...
  id?: string              // 消息唯一 ID
  parentUuid?: string      // 父消息 ID
  toolUseId?: string       // 关联的 tool_use ID
  isEphemeral?: boolean    // 是否临时
  metadata?: Record<string, unknown>
}

// ============ 扩展 SessionConfig ============
export interface SessionConfig {
  // ... 现有字段 ...
  autoSync?: boolean           // 自动同步 (默认 true)
  enableCheckpoint?: boolean   // 启用 checkpoint (默认 false)
  checkpointInterval?: number  // checkpoint 间隔
}
```

### 4.3 SessionManager 增强

```typescript
// packages/sdk/src/session/manager.ts

export class SessionManager {
  // 现有字段...
  private hookExecutor?: HookExecutor

  // 新增: 绑定 HookExecutor
  bindHookExecutor(executor: HookExecutor): void {
    this.hookExecutor = executor

    // 注册内置同步 Hook
    executor.register('StreamMessage', {
      hooks: [async (input: HookInput) => {
        await this._syncFromStream(input)
        return { continue: true }
      }]
    })

    executor.register('StreamEnd', {
      hooks: [async (input: HookInput) => {
        if (input.token_usage) {
          this.updateTokenUsage(input.token_usage)
        }
        return { continue: true }
      }]
    })
  }

  // 新增: Stream 消息同步
  private async _syncFromStream(input: HookInput): Promise<void> {
    const msg = input.stream_message
    if (!msg || !this.currentSession) return

    const { type, event } = msg as { type: string; event?: Record<string, unknown> }

    let sessionMsg: SessionMessage | null = null

    if (event?.type === 'stream_progress') {
      sessionMsg = {
        role: 'assistant',
        content: (event.content as string) || '',
        timestamp: new Date(),
        metadata: { subType: 'stream_progress' }
      }
    }

    if (event?.type === 'tool_use') {
      sessionMsg = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [{
          id: (event.tool_use_id as string) || `tool-${Date.now()}`,
          name: event.tool_name as string,
          input: event.tool_input as Record<string, unknown>
        }],
        metadata: { subType: 'tool_use' }
      }
    }

    if (event?.type === 'tool_result') {
      sessionMsg = {
        role: 'system',
        content: '',
        timestamp: new Date(),
        toolResults: [{
          toolCallId: event.tool_use_id as string,
          result: event.result
        }],
        metadata: { subType: 'tool_result' }
      }
    }

    if (event?.type === 'done') {
      if (event.tokenUsage) {
        this.updateTokenUsage(event.tokenUsage as TokenUsage)
      }
      return  // done 不记录为消息
    }

    if (sessionMsg) {
      this.addMessage(sessionMsg)
    }
  }
}
```

### 4.4 UpClient 增强

```typescript
// packages/sdk/src/client/client.ts

export class UpClient {
  async createSession(config?: SessionConfig): Promise<SessionInfo> {
    const session = await this.sessionManager.create(config)

    // 绑定 HookExecutor
    this.sessionManager.bindHookExecutor(this.hookExecutor)

    // 触发 SessionStart Hook
    await this.hookExecutor.execute('SessionStart', {
      session_id: session.id,
      hook_event_name: 'SessionStart'
    })

    return session
  }

  async *stream(query: string, options?: PromptOptions): AsyncGenerator<SDKMessage> {
    const sessionId = this.sessionManager.getSessionId()

    // 触发 StreamStart Hook
    await this.hookExecutor.execute('StreamStart', {
      session_id: sessionId || undefined,
      hook_event_name: 'StreamStart',
      message_content: query
    })

    // 发送请求
    this.transport.send({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'run',
      params: { prompt: query, ...options }
    })

    // Stream 循环
    for await (const msg of this.transport.messages()) {
      // 触发 StreamMessage Hook (SessionManager 自动同步)
      await this.hookExecutor.execute('StreamMessage', {
        session_id: sessionId || undefined,
        stream_message: msg as SDKMessage,
        hook_event_name: 'StreamMessage'
      })

      yield msg as SDKMessage

      const m = msg as Record<string, unknown>
      if (m.type === 'response' || m.type === 'result') {
        break
      }
    }

    // 触发 StreamEnd Hook
    await this.hookExecutor.execute('StreamEnd', {
      session_id: sessionId || undefined,
      hook_event_name: 'StreamEnd'
    })
  }

  async close(): Promise<void> {
    const sessionId = this.sessionManager.getSessionId()

    if (sessionId) {
      await this.hookExecutor.execute('SessionEnd', {
        session_id: sessionId,
        hook_event_name: 'SessionEnd'
      })
    }

    await this.sessionManager.close()
    // ... 其余清理 ...
  }
}
```

---

## 5. 使用示例

### 5.1 基础用法（自动同步）

```typescript
const client = await createClient()
const session = await client.createSession()

for await (const msg of client.stream('分析苹果股票')) {
  console.log(msg)
  // 自动同步到 session
}

console.log(session.messageCount)  // 自动更新
console.log(session.messages.length)  // 已同步

await client.close()
```

### 5.2 自定义 Hook

```typescript
const client = await createClient()

client.registerHook('StreamMessage', {
  hooks: [async (input) => {
    console.log('消息:', input.message_content?.slice(0, 50))
    return { continue: true }
  }]
})

client.registerHook('StreamEnd', {
  hooks: [async (input) => {
    console.log('Token 使用:', input.token_usage)
    return { continue: true }
  }]
})

const session = await client.createSession()
for await (const msg of client.stream('Hello')) { }
await client.close()
```

### 5.3 禁用自动同步

```typescript
const client = await createClient()

// StreamMessage Hook 内部处理，通过返回空操作禁用
client.registerHook('StreamMessage', {
  hooks: [async () => {
    // 不做任何同步
    return { continue: true }
  }]
})

const session = await client.createSession()
for await (const msg of client.stream('Hello')) {
  // 需要手动管理
  session.addMessage({ role: 'assistant', content: '...', timestamp: new Date() })
}
await client.close()
```

---

## 6. 文件变更清单

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          文件变更清单                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   packages/sdk/src/
   │
   ├── hooks/types.ts
   │   ├── HookEvent       [+ StreamStart, StreamMessage, StreamEnd]
   │   └── HookInput       [+ session_id, stream_message, token_usage, ...]
   │
   ├── session/types.ts
   │   ├── SessionMessage  [+ id, parentUuid, toolUseId, isEphemeral, metadata]
   │   └── SessionConfig  [+ autoSync, enableCheckpoint, checkpointInterval]
   │
   ├── session/manager.ts
   │   ├── + hookExecutor: HookExecutor
   │   ├── + bindHookExecutor()
   │   └── + _syncFromStream()
   │
   └── client/client.ts
       ├── createSession()  [+ Hook绑定, SessionStart Hook]
       ├── stream()        [+ Hook调用]
       └── close()         [+ SessionEnd Hook]
```

---

## 7. 向后兼容性

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          向后兼容性                                       │
└─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────┐
   │  API 兼容性                                                        │
   │  ──────────────────────────────────────────────────────────────   │
   │                                                                     │
   │  client.stream()          ✅ 默认启用自动同步                       │
   │  client.query()           ✅ 基于 stream，自动同步                   │
   │  session.addMessage()     ✅ 仍然可用                               │
   │  session.save()          ✅ 仍然可用                               │
   │  session.pause()         ✅ 仍然可用                               │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────┐
   │  类型兼容性                                                        │
   │  ──────────────────────────────────────────────────────────────   │
   │                                                                     │
   │  所有新增字段都是可选的                                            │
   │  现有代码无需修改                                                 │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────┐
   │  Hook 兼容性                                                       │
   │  ──────────────────────────────────────────────────────────────   │
   │                                                                     │
   │  现有 Hook 行为不变                                               │
   │  新增 Hook 事件可选使用                                           │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────────┘
```

---

## 8. 实现检查清单

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          实现检查清单                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   Phase 1: hooks/types.ts 扩展 ✅ 已完成 (2026-05-16)
   ──────────────────────────
   [x] 添加 HookEvent: StreamStart, StreamMessage, StreamEnd
   [x] 扩展 HookInput: session_id, stream_message, token_usage
   [x] 新增 SDKMessage 类型

   Phase 2: session/types.ts 扩展 ✅ 已完成 (2026-05-16)
   ─────────────────────────────
   [x] SessionMessage: id, parentUuid, toolUseId, isEphemeral, metadata
   [x] SessionConfig: autoSync, enableCheckpoint, checkpointInterval

   Phase 3: session/manager.ts 增强 ✅ 已完成 (2026-05-16)
   ───────────────────────────────
   [x] bindHookExecutor() 方法
   [x] _syncFromStream() 方法
   [x] setAutoSync() / isAutoSyncEnabled() 方法

   Phase 4: client/client.ts 增强 ✅ 已完成 (2026-05-16)
   ───────────────────────────
   [x] createSession(): Hook绑定, SessionStart Hook
   [x] stream(): StreamStart/StreamMessage/StreamEnd Hook调用
   [x] close(): SessionEnd Hook

   测试 ✅ 已完成 (2026-05-16)
   ───
   [x] 默认自动同步 - 10 tests pass
   [x] stream_progress 消息同步
   [x] tool_use 消息同步
   [x] tool_result 消息同步
   [x] done 事件更新 tokenUsage
   [x] messageCount 自动更新
   [x] 禁用同步 (autoSync: false)
   [x] Hook 生命周期顺序
   [x] 向后兼容性
```

---

## 8.1 测试验证结果 ✅ 全部通过 (2026-05-16)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      测试验证结果 (2026-05-16)                             │
└─────────────────────────────────────────────────────────────────────────────┘

   ✅ bun test packages/sdk/test-stream-session.test.ts

   18 pass
   0 fail
   74 expect() calls

   测试覆盖:
   ├─ Stream + Session 一体架构 ✅
   │  ├─ 自动同步 stream_progress 消息 ✅
   │  ├─ 自动同步 tool_use 消息 ✅
   │  ├─ 自动同步 tool_result 消息 ✅
   │  ├─ done 事件更新 tokenUsage ✅
   │  ├─ 自动更新 messageCount ✅
   │  └─ 禁用自动同步 ✅
   ├─ Hook 生命周期 ✅
   │  ├─ 正确顺序触发 ✅
   │  └─ SessionStart/End Hook ✅
   ├─ SessionMessage 扩展字段 ✅
   ├─ SessionConfig 扩展字段 ✅
   ├─ 对话连贯性 ✅
   │  ├─ 多轮对话消息累积 ✅
   │  ├─ 消息顺序保持 (FIFO) ✅
   │  ├─ 消息角色正确区分 ✅
   │  └─ token 使用量累积 ✅
   └─ 对话上下文真实性 ✅
      ├─ 工具调用和结果配对 ✅
      ├─ 上下文完整信息 ✅
      ├─ 会话状态查询 ✅
      └─ 消息内容非空验证 ✅
```

## 8.2 upup核心Session能力分析

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    upup核心Session能力 (src/daemon/session.ts)              │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        AgentSession 结构                                 │
   │                                                                         │
   │   interface AgentSession {                                              │
   │     id: string                                                         │
   │     state: 'idle' | 'running' | 'waiting' | 'completed' |             │
   │           'error' | 'canceled'                                        │
   │     createdAt: number                                                  │
   │     lastActivity: number                                               │
   │     messages: SerializedMessage[]                                      │
   │     context: SessionContext                                            │
   │     metadata: { turnCount, toolUseCount, ... }                        │
   │     abortReason?: string                                               │
   │   }                                                                    │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        SessionManager 核心方法                           │
   │                                                                         │
   │   create(params)        → 创建新会话，返回 AgentSession                │
   │   get(id)              → 获取会话                                      │
   │   update(id, updates)   → 更新会话                                     │
   │   delete(id)           → 删除会话                                     │
   │   resume(id)            → 从存储恢复会话                               │
   │   pause/idle/running   → 状态转换                                     │
   │   abort                 → 中止运行中的会话                             │
   │   getAbortController   → 获取 AbortController                         │
   │   isAborted            → 检查是否已中止                               │
   │   on(event)            → 订阅会话事件                                  │
   │   emit(event)          → 触发会话事件                                  │
   │                                                                         │
   │   持久化: 通过 KVStore 接口支持内存/文件/自定义存储                    │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        与SDK SessionManager的关系                       │
   │                                                                         │
   │   当前关系:                                                             │
   │   ──────────────────────────────────────────────────────────────       │
   │   • SDK 通过 stdio 与 upup 进程通信                                    │
   │   • upup 维护自己的 AgentSession                                      │
   │   • SDK 独立维护 SessionManager.messages                               │
   │   • 两者通过消息事件同步                                               │
   │                                                                         │
   │   未来优化方向:                                                        │
   │   ──────────────────────────────────────────────────────────────       │
   │   • 集成 upup 原生的 session resume 功能                              │
   │   • 利用 upup 的 SerializedMessage 格式                             │
   │   • 与 upup 的 KV store 持久化对齐                                   │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

## 8.3 实现架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SDK SessionManager 架构                               │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ╔════════════════════════════════════════════════════════════════════╗  │
   │  ║                    UpClient (packages/sdk)                     ║  │
   │  ║  ┌──────────────────────────────────────────────────────────┐  ║  │
   │  ║  │  createSession()                                        │  ║  │
   │  ║  │    └─▶ SessionManager.create()                          │  ║  │
   │  ║  │    └─▶ HookExecutor.execute('SessionStart')            │  ║  │
   │  ║  │                                                         │  ║  │
   │  ║  │  stream()                                               │  ║  │
   │  ║  │    ├─▶ HookExecutor.execute('StreamStart')             │  ║  │
   │  ║  │    ├─▶ transport.send()                                │  ║  │
   │  ║  │    ├─▶ for await msg of transport.messages()          │  ║  │
   │  ║  │    │     └─▶ HookExecutor.execute('StreamMessage')    │  ║  │
   │  ║  │    │           └─▶ _syncFromStream() → addMessage()   │  ║  │
   │  ║  │    └─▶ HookExecutor.execute('StreamEnd')               │  ║  │
   │  ║  │                                                         │  ║  │
   │  ║  │  query()                                                │  ║  │
   │  ║  │    └─▶ for await msg of stream() → collect → return   │  ║  │
   │  ║  └──────────────────────────────────────────────────────────┘  ║  │
   │  ╚════════════════════════════════════════════════════════════════════╝  │
   └──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ stdio
                                      ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  ╔════════════════════════════════════════════════════════════════════╗  │
   │  ║                    upup 进程 (src/daemon)                     ║  │
   │  ║  ┌──────────────────────────────────────────────────────────┐  ║  │
   │  ║  │  SessionManager (upup核心)                                │  ║  │
   │  ║  │    └─▶ AgentSession 管理                                 │  ║  │
   │  ║  │    └─▶ KVStore 持久化                                    │  ║  │
   │  ║  │    └─▶ AbortController                                   │  ║  │
   │  ║  └──────────────────────────────────────────────────────────┘  ║  │
   │  ╚════════════════════════════════════════════════════════════════════╝  │
   └──────────────────────────────────────────────────────────────────────────┘

   数据流:
   用户.stream() ──▶ UpClient ──▶ HookExecutor ──▶ SessionManager ──▶ yield
                                │
                                └─▶ transport.send() ──▶ upup stdio
```

---

## 9. 总结

### 9.1 核心改造点 ✅ 已完成 (2026-05-16)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          核心改造点                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   1. Stream + Session 一体 ✅
   ────────────────────────────────────────────
      Stream 的每个消息自动成为 Session 历史
      session.messages === 已消费的 Stream

   2. Hook 驱动 ✅
   ────────────────────────────────────────────
      复用 Hook 系统实现自动同步
      零侵入，不修改现有 public API

   3. 生命周期 Hook ✅
   ────────────────────────────────────────────
      SessionStart → StreamStart → StreamMessage (循环) → StreamEnd → SessionEnd

   4. 自动同步 ✅
   ────────────────────────────────────────────
      默认启用 autoSync: true
      可通过 autoSync: false 禁用

   5. 对话连贯性 ✅
   ────────────────────────────────────────────
      多轮对话消息累积
      消息顺序保持 (FIFO)
      消息角色正确区分
      token 使用量累积
      工具调用和结果配对
      会话状态查询

   6. 上下文真实性 ✅
   ────────────────────────────────────────────
      消息内容非空验证
      上下文完整信息验证
      工具调用和结果正确配对
      会话状态可查询

### 9.2 最终架构 ✅ 已实现

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        最终一体架构                                         │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │   用户代码   │────▶│  UpClient   │────▶│ HookExecutor │
   └─────────────┘     └──────┬──────┘     └──────┬──────┘
                              │                   │
                              │                   │
                              ▼                   ▼
                        ┌─────────────┐     ┌─────────────┐
                        │ Transport   │     │ SessionMgr │
                        └──────┬─────┘     └──────┬─────┘
                              │                   ▲
                              │                   │
                              ▼                   │
                        ┌─────────────┐           │
                        │ upup 进程   │───────────┘
                        └─────────────┘

   数据流:
   用户.stream() ──▶ UpClient ──▶ Hook ──▶ Session ──▶ yield
                              │
                              ▼
                        Hook 触发顺序:
                        SessionStart
                          │
                          ▼
                        StreamStart
                          │
                          ▼
                        StreamMessage (循环)
                          │
                          ▼
                        StreamEnd
                          │
                          ▼
                        SessionEnd

   ✅ 所有组件已实现并通过测试
```

---

## 附录 A: 完整类型定义

```typescript
// packages/sdk/src/hooks/types.ts

export type HookEvent =
  | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'PostToolBatch'
  | 'Notification' | 'UserPromptSubmit' | 'UserPromptExpansion'
  | 'SessionStart' | 'SessionEnd'
  | 'Stop' | 'StopFailure' | 'SubagentStart' | 'SubagentStop'
  | 'PreCompact' | 'PostCompact' | 'PermissionRequest' | 'PermissionDenied'
  | 'StreamStart' | 'StreamMessage' | 'StreamEnd'

export interface HookInput {
  // ... 现有字段 ...
  hook_event_name?: string
  session_id?: string
  stream_message?: SDKMessage
  message_type?: 'stream_progress' | 'tool_use' | 'tool_result' | 'done'
  message_content?: string
  token_usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

// packages/sdk/src/session/types.ts

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  tokens?: number
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>
  toolResults?: Array<{ toolCallId: string; result: unknown }>
  id?: string
  parentUuid?: string
  toolUseId?: string
  isEphemeral?: boolean
  metadata?: Record<string, unknown>
}

export interface SessionConfig {
  id?: string
  resumeFrom?: string
  maxMessages?: number
  maxTokens?: number
  timeout?: number
  metadata?: Record<string, unknown>
  autoSync?: boolean
  enableCheckpoint?: boolean
  checkpointInterval?: number
}
```

---

## 附录 B: Claude Agent SDK 参考实现

### B.1 Claude SDK Query 模式

```typescript
// Claude Agent SDK 内部实现 (伪代码)

async *query(params: QueryParams): AsyncIterable<Message> {
  // 1. Session 管理
  const session = await this.sessionManager.getOrCreate(params.sessionId)

  // 2. 生命周期 Hook
  await this.hooks.execute('SessionStart', { session })

  // 3. 用户消息 Hook
  await this.hooks.execute('UserPromptSubmit', {
    prompt: params.messages[params.messages.length - 1]
  })

  // 4. Stream 循环
  for await (const event of this.transport.stream(params)) {
    // 5. StreamMessage Hook
    await this.hooks.execute('StreamMessage', {
      session,
      event
    })

    // 6. 转换并同步
    const msg = this.convertEvent(event)
    session.addMessage(msg)

    yield msg
  }

  // 7. 结束 Hook
  await this.hooks.execute('SessionEnd', { session })
}

// 转换事件为消息
convertEvent(event: StreamEvent): Message {
  switch (event.type) {
    case 'message_start':
      return { id: event.message.id, role: 'assistant', content: [] }
    case 'content_block_delta':
      return {
        type: 'content_block',
        content: event.delta.text
      }
    case 'message_stop':
      return null // 结束信号
  }
}
```

### B.2 Claude SDK HTTP Transport Stream

```typescript
// Claude SDK HTTP Transport (伪代码)

async *stream(method: string, params: object): AsyncIterable<StreamEvent> {
  const response = await fetch('/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({ method, params })
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 解析 SSE 行
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        yield this.parseEvent(data)
      }
    }
  }
}
```

### B.3 Claude SDK Session Persistence

```typescript
// Claude SDK Session 持久化 (伪代码)

class SessionManager {
  async save(session: Session): Promise<void> {
    const serialized = {
      id: session.id,
      messages: session.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        parentUuid: m.parentUuid,
        // ... 序列化
      })),
      metadata: session.metadata
    }

    await this.store.save(serialized)
  }

  async load(sessionId: string): Promise<Session | null> {
    const data = await this.store.load(sessionId)
    if (!data) return null

    return Session.deserialize(data)
  }

  async resume(sessionId: string): Promise<Session> {
    const session = await this.load(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    session.status = 'active'
    return session
  }
}
```

---

## 附录 C: 问题分析与改造方案 (2026-05-16)

### C.1 当前实现问题分析

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SDK Session 实现问题分析                                  │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        问题 1: 独立实现                                   │
   │                                                                         │
   │   ❌ SDK SessionManager 是完全独立实现的                                  │
   │   ❌ 没有使用 upup 核心的 Session 能力                                  │
   │   ❌ upup/src/daemon/session.ts 有完整的 SessionManager               │
   │                                                                         │
   │   SDK (packages/sdk/src/session/manager.ts)                            │
   │   ├── 自己的 SessionInfo 类型                                           │
   │   ├── 自己的消息数组 messages[]                                        │
   │   ├── 自己的状态机 (created/active/paused/completed)                  │
   │   └── 自己的 Hook 驱动的同步                                           │
   │                                                                         │
   │   upup (src/daemon/session.ts)                                        │
   │   ├── AgentSession 类型                                                │
   │   ├── SerializedMessage[]                                              │
   │   ├── 完整状态机 (idle/running/waiting/completed/error/canceled)      │
   │   ├── KVStore 持久化                                                   │
   │   ├── AbortController                                                  │
   │   └── 事件系统                                                         │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        问题 2: 状态不同步                                │
   │                                                                         │
   │   ❌ upup 的 AgentSession 和 SDK 的 SessionInfo 完全独立                │
   │   ❌ SDK 通过 stdio 发送消息给 upup                                   │
   │   ❌ upup 维护自己的会话状态 (AgentSession)                           │
   │   ❌ SDK 独立维护消息历史 (SessionManager.messages)                   │
   │   ❌ 两者通过消息事件同步，但状态不共享                                 │
   │                                                                         │
   │   ┌─────────────────┐         ┌─────────────────┐                        │
   │   │  SDK Session   │         │ upup Session   │                        │
   │   │  ───────────── │         │  ───────────── │                        │
   │   │  id: sess-123  │         │  id: sess-123  │                        │
   │   │  status: active│         │  state: running │                        │
   │   │  messages: []  │         │  messages: []   │                        │
   │   └────────┬────────┘         └────────┬────────┘                        │
   │            │                             │                               │
   │            │    Stream 事件同步          │                               │
   │            └─────────────────────────────┘                               │
   │                         │                                               │
   │                    stdio 通信                                           │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        问题 3: 无法利用 upup 核心能力                    │
   │                                                                         │
   │   ❌ 无法 resume upup 会话 - SDK 的 resume 只从自己的 store 加载       │
   │   ❌ 缺少 AbortController - SDK 没有使用 upup 的 AbortController       │
   │   ❌ 状态不一致 - SDK 和 upup 的状态可能不同步                          │
   │   ❌ 重复实现 - 两边都有 SessionManager，功能重叠                        │
   │                                                                         │
   │   upup 核心能力 (未被 SDK 使用):                                       │
   │   ├── KVStore 持久化 (MemoryKVStore)                                  │
   │   ├── AbortController 管理                                             │
   │   ├── 状态机 (idle/running/waiting/completed)                          │
   │   ├── 会话超时清理                                                     │
   │   ├── 事件订阅/发布                                                    │
   │   └── SerializedMessage 序列化                                          │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        问题 4: 与 Claude SDK 对比                       │
   │                                                                         │
   │   Claude SDK (正确实现):                                                │
   │   ├── 与后端共享 Session 状态                                          │
   │   ├── HTTP Transport 直接与后端通信                                    │
   │   ├── Session 是 Stream 的历史 (Stream 即 Session)                      │
   │   └── 利用后端的完整 Session 能力                                       │
   │                                                                         │
   │   SDK (问题实现):                                                       │
   │   ├── SDK 和 upup 各有自己的 Session                                    │
   │   ├── stdio 通信需要额外的同步机制                                       │
   │   ├── Hook 驱动同步但状态仍然不共享                                     │
   │   └── 自己实现 Session 功能，重复造轮子                                  │
   └─────────────────────────────────────────────────────────────────────────┘
```

### C.2 改造方案: 基于 upup 核心的 SDK Session

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    改造方案: 基于 upup 核心的 Session                       │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        核心策略                                          │
   │                                                                         │
   │   1. SDK SessionManager 包装 upup 核心 SessionManager                   │
   │   2. SDK 通过 stdio 与 upup 通信，同步 Session 状态                     │
   │   3. 添加 JSON-RPC 接口让 SDK 可以调用 upup Session 操作                │
   │   4. 保持 Hook 系统用于 Stream 消息同步                                  │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        改造后的架构                                      │
   │                                                                         │
   │   ┌─────────────────────────────────────────────────────────────────┐ │
   │   │                    SDK 层 (packages/sdk)                         │ │
   │   │                                                                  │ │
   │   │   UpClient                                                       │ │
   │   │    │                                                            │ │
   │   │    ├── createSession() ──▶ transport.request('session/create') │ │
   │   │    ├── stream()          ──▶ transport.send('run')              │ │
   │   │    ├── resumeSession()   ──▶ transport.request('session/resume')│ │
   │   │    └── close()          ──▶ transport.request('session/end')   │ │
   │   │                                                                  │ │
   │   │   SessionManager (包装层)                                         │ │
   │   │    │                                                            │ │
   │   │    ├── currentSession ──▶ 代理到 upup 的 AgentSession           │ │
   │   │    ├── messages       ──▶ 从 upup 同步                          │ │
   │   │    └── state         ──▶ 从 upup 同步                          │ │
   │   │                                                                  │ │
   │   └─────────────────────────────────────────────────────────────────┘ │
   │                               │                                        │
   │                               │ stdio (JSON-RPC)                       │
   │                               ▼                                        │
   │   ┌─────────────────────────────────────────────────────────────────┐ │
   │   │                    upup 核心层 (src/daemon)                     │ │
   │   │                                                                  │ │
   │   │   SessionManager (核心实现)                                      │ │
   │   │    │                                                            │ │
   │   │    ├── AgentSession[]                                           │ │
   │   │    ├── KVStore                                                  │ │
   │   │    ├── AbortController                                           │ │
   │   │    └── 状态机                                                    │ │
   │   │                                                                  │ │
   │   │   IPC Handler (新增)                                             │ │
   │   │    │                                                            │ │
   │   │    ├── session/create                                            │ │
   │   │    ├── session/resume                                           │ │
   │   │    ├── session/end                                              │ │
   │   │    └── session/messages (获取消息历史)                           │ │
   │   │                                                                  │ │
   │   └─────────────────────────────────────────────────────────────────┘ │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────────┐
   │                        需要新增的 JSON-RPC 接口                         │
   │                                                                         │
   │   // SDK 请求创建会话                                                   │
   │   { "method": "session/create", "params": { "context": {...} } }     │
   │   → { "result": { "id": "sess-123", ... } }                          │
   │                                                                         │
   │   // SDK 请求恢复会话                                                   │
   │   { "method": "session/resume", "params": { "id": "sess-123" } }      │
   │   → { "result": { "id": "sess-123", "messages": [...], ... } }       │
   │                                                                         │
   │   // SDK 获取会话消息历史                                               │
   │   { "method": "session/messages", "params": { "id": "sess-123" } }   │
   │   → { "result": { "messages": [...] } }                               │
   │                                                                         │
   │   // SDK 请求结束会话                                                   │
   │   { "method": "session/end", "params": { "id": "sess-123" } }        │
   │   → { "result": { "success": true } }                                  │
   │                                                                         │
   │   // SDK 获取会话状态                                                   │
   │   { "method": "session/state", "params": { "id": "sess-123" } }      │
   │   → { "result": { "state": "running", ... } }                        │
   │                                                                         │
   └─────────────────────────────────────────────────────────────────────────┘
```

### C.3 改造文件清单

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          改造文件清单                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   新增文件:
   ───────
   src/ipc/session-handler.ts          # Session 相关 IPC 处理
   packages/sdk/src/session/upup-session.ts  # SDK 包装 upup Session

   修改文件:
   ───────
   src/ipc/handler.ts                  # 注册 session 处理
   src/daemon/session.ts               # 导出 SessionManager
   packages/sdk/src/client/client.ts    # 使用新的 Session 方法
   packages/sdk/src/session/manager.ts  # 包装 upup Session
   packages/sdk/src/transport/transport.ts  # 添加 session RPC 方法
```

### C.4 最小改造步骤

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        最小改造步骤                                         │
└─────────────────────────────────────────────────────────────────────────────┘

   Phase 1: 添加 IPC 接口 (src/ipc/)
   ─────────────────────────────────
   1. 在 src/ipc/ 创建 session-handler.ts
   2. 添加 session/create, session/resume, session/messages, session/end
   3. 在 handler.ts 注册处理函数

   Phase 2: SDK 包装层 (packages/sdk/src/session/)
   ───────────────────────────────────────────────
   1. 创建 UpupSession 类，包装 upup Session 操作
   2. 添加 getMessages() 从 upup 获取消息
   3. 添加 getState() 获取状态
   4. 保持 Hook 系统用于 Stream 同步

   Phase 3: Client 集成
   ───────────────────
   1. 修改 createSession() 使用 transport.request('session/create')
   2. 修改 resumeSession() 使用 transport.request('session/resume')
   3. 修改 close() 使用 transport.request('session/end')

   Phase 4: 验证
   ───────────
   1. 运行现有测试，确保向后兼容
   2. 添加新测试验证状态同步
   3. 验证 resume 功能
```

### C.5 改造后预期效果

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        改造后预期效果                                       │
└─────────────────────────────────────────────────────────────────────────────┘

   ✅ SDK 和 upup 共享同一个 Session
   ✅ resume 功能真正恢复 upup 会话
   ✅ 状态完全同步 (SDK 和 upup 状态一致)
   ✅ 复用 upup 的 AbortController
   ✅ 复用 upup 的 KVStore 持久化
   ✅ 复用 upup 的会话超时清理
   ✅ 与 Claude SDK 实现模式一致
   ✅ 减少重复代码
```

---

## 附录 D: Claude Code Agent SDK Session 深度分析

### D.1 Claude SDK Session 设计原则

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude SDK Session 设计原则                             │
└─────────────────────────────────────────────────────────────────────────────┘

   1. Session 是 Stream 的历史
   ────────────────────────────────────────────
      每次 query() 的每个消息都会添加到 Session
      session.messages === 已消费的 Stream 消息

   2. Session 与后端共享
   ────────────────────────────────────────────
      SDK 和后端使用同一个 Session 状态
      HTTP 请求直接在同一个 Session 上操作

   3. 状态一致性
   ────────────────────────────────────────────
      SDK 获取的 Session 状态就是后端的真实状态
      不需要额外的同步机制

   4. 持久化由后端处理
   ────────────────────────────────────────────
      后端负责 Session 持久化
      SDK 只负责发送请求和接收响应
```

### D.2 Claude SDK Session 生命周期

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Claude SDK Session 生命周期                             │
└─────────────────────────────────────────────────────────────────────────────┘

   创建 Session:
   ─────────────
   const session = await client.sessions.create({
     model: 'claude-opus-4-5',
     systemPrompt: 'You are helpful assistant'
   })

   发送消息:
   ─────────────
   for await (const msg of session.send('Hello')) {
     // msg 自动添加到 session.messages
   }

   查询历史:
   ─────────────
   const history = session.messages  // === 已消费的 Stream

   暂停/恢复:
   ─────────────
   session.pause()
   // 后端保存状态

   session.resume()
   // 后端恢复状态，继续对话
```

### D.3 与 SDK 当前实现的对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SDK 当前实现 vs Claude SDK                               │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────┬─────────────────────────────────────┐
   │      SDK 当前实现               │       Claude SDK                   │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  两个独立的 Session             │  SDK 和后端共享 Session            │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  Hook 驱动消息同步              │  Stream 消息直接添加到 Session     │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  状态需要手动同步               │  状态天然一致                       │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  SDK 自己实现 SessionManager    │  SDK 包装后端 Session              │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  resume 从 SDK store 加载       │  resume 从后端恢复                 │
   └─────────────────────────────────┴─────────────────────────────────────┘
```

### D.4 SDK 改造后与 Claude SDK 对比

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SDK 改造后 vs Claude SDK                                │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────┬─────────────────────────────────────┐
   │      SDK 改造后                │       Claude SDK                   │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  SDK 包装 upup Session          │  SDK 包装后端 Session              │
   │  (通过 stdio 通信)             │  (通过 HTTP 通信)                  │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  Hook 驱动消息同步              │  Stream 消息直接添加到 Session     │
   │  (保留 Hook 系统)              │                                   │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  状态通过 IPC 同步              │  状态天然一致                       │
   │  (需要额外同步机制)             │                                   │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  upup 核心提供完整 Session 能力 │  后端提供完整 Session 能力         │
   ├─────────────────────────────────┼─────────────────────────────────────┤
   │  resume 从 upup 恢复           │  resume 从后端恢复                  │
   └─────────────────────────────────┴─────────────────────────────────────┘

   结论: 改造后的 SDK 在架构上与 Claude SDK 一致
         通过 IPC 弥补了 stdio 通信的限制
```
