# SDK Session 改造计划 - 彻底集成 upup 核心

> **目标**: 彻底改造 SDK Session，完全基于 upup 核心实现
> **策略**: 不自己实现，复用 upup SessionManager 的所有能力
> **最后更新**: 2026-05-17

---

## 1. 问题分析

### 1.1 当前问题

```
当前架构问题:
┌─────────────────────────────┐
│  SDK UpupSessionManager    │
│  ├── sessionId ✓           │
│  ├── messages[] ❌ (重复)   │
│  └── tokenUsage ✓          │
└─────────────────────────────┘
           ↓ (IPC 调用, 但不完全)
┌─────────────────────────────┐
│  upup SessionManager        │
│  ├── sessions Map           │
│  ├── messages[] (真正的)   │
│  └── KV Store               │
└─────────────────────────────┘

问题: SDK 仍然维护自己的 messages[]，与 upup 核心重复
```

### 1.2 根本原因

1. SDK `UpupSessionManager` 声称基于 upup 核心，但没有真正使用 IPC
2. Stream 消息没有正确同步到 upup 核心
3. 消息存储在两个地方（SDK + upup），导致不一致

### 1.3 Claude Code query() 参考架构

```typescript
// src/query.ts:219 - 异步生成器模式
export async function* query(params: QueryParams): AsyncGenerator<...> {
  // 消息在本地累积
  let state: State = {
    messages: params.messages,  // 本地消息数组
    ...
  }

  // 流式处理
  for await (const message of deps.callModel({...})) {
    // 消息累积
    if (message.type === 'assistant') {
      assistantMessages.push(message)  // 累积
    }

    // 工具结果累积
    for await (const result of streamingToolExecutor.getCompletedResults()) {
      toolResults.push(result.message)
    }
  }

  // 工具执行后继续
  state = {
    messages: [...messagesForQuery, ...assistantMessages, ...toolResults],
    ...
  }
}
```

---

## 2. 改造方案

### 2.1 架构对比

```
SDK v4 (当前):                    SDK v5 (目标):
┌─────────────────┐               ┌─────────────────┐
│ UpClient        │               │ UpClient        │
│  ├── messages[] │               │  └── (无)       │
│  └── sessionMgr │               │       ↓         │
└────────┬────────┘               └────────┬────────┘
         ↓                               ↓
┌─────────────────┐               ┌─────────────────┐
│ SessionManager  │               │  upup Core      │
│ (SDK 自己实现)  │               │ SessionManager  │
└─────────────────┘               └─────────────────┘
         ↓                                 ↓
┌─────────────────┐               ┌─────────────────┐
│ (消息重复存储)  │               │  KV Store       │
└─────────────────┘               └─────────────────┘
```

### 2.2 核心策略

**不自己实现，完全复用 upup 核心**

1. **SDK 不存储任何消息** - 所有消息由 upup 核心存储
2. **通过 IPC 调用 upup** - 使用 `transport.request('session/xxx')`
3. **Stream 消息实时同步** - 通过 Hook 系统同步消息
4. **会话恢复从 upup 加载** - 使用 `getMessages()` 获取完整历史

### 2.3 实现步骤

```
Phase 1: 改造 UpupSessionManager
├── 1.1 移除 SDK 本地 messages[] 存储
├── 1.2 实现完整的 IPC 调用
├── 1.3 验证消息正确保存到 upup
└── 1.4 测试基本功能

Phase 2: Stream + Session 一体化
├── 2.1 Hook 系统同步 Stream 消息
├── 2.2 done 事件触发消息保存
├── 2.3 恢复会话时加载完整历史
└── 2.4 验证连续对话

Phase 3: 性能优化
├── 3.1 批量消息同步
├── 3.2 增量更新
└── 3.3 内存优化

Phase 4: 测试验证
├── 4.1 20 轮对话测试
├── 4.2 200 轮对话测试
└── 4.3 记忆验证
```

---

## 3. 具体实现

### 3.1 UpupSessionManager 改造

```typescript
// packages/sdk/src/session/upup-session.ts

export class UpupSessionManager {
  private sessionId: string | null = null;
  private transport: RpcTransport;

  /**
   * 创建会话 - 完全通过 upup IPC
   */
  async create(config?: SessionConfig): Promise<SessionInfo> {
    const result = await this.transport.request('session/create', {
      context: {
        projectSlug: config?.metadata?.projectSlug || 'sdk',
        projectPath: config?.metadata?.projectPath || process.cwd(),
      },
      id: config?.id,
    }) as { id: string; state: string; createdAt: number };

    this.sessionId = result.id;

    return {
      id: result.id,
      status: this.mapState(result.state),
      createdAt: new Date(result.createdAt),
      lastActiveAt: new Date(result.createdAt),
      messageCount: 0,
    };
  }

  /**
   * 获取消息 - 从 upup 核心获取
   */
  async getMessages(): Promise<SessionMessage[]> {
    if (!this.sessionId) return [];

    const result = await this.transport.request('session/messages', {
      id: this.sessionId,
    }) as { messages: SerializedMessage[] };

    return result.messages.map(msg => ({
      role: this.mapRole(msg.type),
      content: msg.content,
      timestamp: new Date(),
    }));
  }

  /**
   * 添加消息 - 同步到 upup 核心
   */
  async addMessage(message: SessionMessage): Promise<void> {
    if (!this.sessionId) return;

    await this.transport.request('session/addMessage', {
      id: this.sessionId,
      message: {
        type: message.role,
        content: message.content,
      },
    });
  }

  // ... 其他方法类似
}
```

### 3.2 Client stream() 改造

```typescript
// packages/sdk/src/client/client.ts

async *stream(query: string, options?: PromptOptions): AsyncGenerator<SDKMessage> {
  const sessionId = this.upupSessionManager?.getSessionId();

  // 1. 发送请求到 upup (通过 StdioTransport)
  this.transport.send({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'run',
    params: {
      prompt: query,
      sessionId,
    },
  });

  // 2. 接收消息并同步到 upup 核心
  for await (const msg of this.transport.messages()) {
    // 通过 Hook 同步消息到 upup
    await this.hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      session_id: sessionId,
      stream_message: msg,
    });

    // done 事件时同步到 upup
    if (msg.type === 'event' && msg.event?.type === 'done') {
      await this.syncToUpupSession(msg);
    }

    yield msg;

    if (msg.type === 'result') break;
  }
}

private async syncToUpupSession(msg: SDKMessage): Promise<void> {
  if (!this.upupSessionManager) return;

  const event = msg.event as Record<string, unknown>;

  // 同步 token 使用量
  if (event.tokenUsage) {
    this.upupSessionManager.updateTokenUsage(event.tokenUsage as TokenUsage);
  }

  // 同步最终答案
  if (event.answer) {
    await this.upupSessionManager.addMessage({
      role: 'assistant',
      content: event.answer as string,
      timestamp: new Date(),
    });
  }
}
```

### 3.3 IPC 方法映射

| SDK 方法 | upup IPC 方法 | 说明 |
|----------|---------------|------|
| create() | session/create | 创建新会话 |
| resume() | session/resume | 恢复会话 |
| getMessages() | session/messages | 获取消息历史 |
| addMessage() | session/addMessage | 添加消息 |
| updateState() | session/update | 更新会话状态 |
| close() | session/end | 结束会话 |

---

## 4. upup 核心需要支持的方法

### 4.1 IPC 方法列表

```typescript
// 需要在 upup 核心 (src/daemon/session.ts) 中添加的 IPC 方法

// 1. session/create - 创建会话
// 2. session/resume - 恢复会话
// 3. session/get - 获取会话信息
// 4. session/messages - 获取消息历史
// 5. session/addMessage - 添加消息
// 6. session/update - 更新会话状态
// 7. session/end - 结束会话
```

### 4.2 消息序列化

```typescript
// 使用 upup 的 serializeMessage/deserializeMessage

import { serializeMessage, deserializeMessage } from '../../daemon/session.js';

// 添加消息
await daemonSessionManager.update(sessionId, {
  messages: [...daemonSession.messages, serializeMessage(newMessage)]
});

// 获取消息
const messages = daemonSession.messages.map(deserializeMessage);
```

---

## 5. 测试验证清单

- [ ] 20 轮对话测试通过
- [ ] 200 轮对话测试通过 (≥90%)
- [ ] 记忆验证正确
- [ ] Token 使用量正确跟踪
- [ ] 会话恢复功能正常
- [ ] 代码行数减少 30%+

---

## 6. 参考资料

- Claude Code query.ts: 异步生成器模式
- upup src/daemon/session.ts: SessionManager 单例
- SDK packages/sdk/src/client/client.ts: 当前实现
- SDK packages/sdk/src/session/upup-session.ts: 当前简化版

---

## 7. 执行时间表

| Phase | 任务 | 时间 |
|-------|------|------|
| 1 | 改造 UpupSessionManager | 2小时 |
| 2 | Stream + Session 一体化 | 2小时 |
| 3 | 测试验证 | 1小时 |
| 4 | 更新文档 | 30分钟 |

**总计**: ~5.5 小时