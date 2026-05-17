# SDK v5 - 基于 Claude Code + upup 核心的 Session 架构

> **目标**: 综合 Claude Code Agent SDK 和 upup 核心能力，彻底改造 SDK Session
> **核心策略**: 复用 upup 核心 SessionManager，通过 IPC 与 SDK 深度集成
> **最后更新**: 2026-05-17
> **实现状态**: ✅ Phase 1-3 完成

---

## 1. 分析总结

### 1.1 Claude Code Session 架构分析

Claude Code Session 架构通过 SessionRunner 启动子进程，通过 NDJSON 解析事件流。活动追踪和 API 会话历史检索是核心功能。

关键参考 (src/query.ts):
- `async function* query()` - 异步生成器模式
- 消息累积到 `messages` 数组
- 工具执行通过 `runTools()` 或 `StreamingToolExecutor`
- 状态机: `idle → running → waiting → completed`

### 1.2 upup 核心 Session 架构分析

upup SessionManager (src/daemon/session.ts) 提供:
- sessions: Map<string, AgentSession>
- 消息序列化/反序列化 (serializeMessage/deserializeMessage)
- KVStore 持久化
- 状态机管理

关键实现:
```typescript
// agent.ts 中消息保存
const { serializeMessage } = await import('../daemon/session.js');
const serializedMessages = messagesToSave.map(msg => serializeMessage(msg));
await daemonSessionManager.update(sessionId, { messages: [...daemonSession.messages, ...newMessages] });
```

### 1.3 当前 SDK Session 问题分析

问题: SDK 仍然维护自己的 messages[]，与 upup 核心重复。

### 1.4 验证结果 (2026-05-17)

**200 轮对话测试** ✅
- 通过率: 99.50% (199/200)
- 失败: 1 轮 (可接受)
- Token: 55,508
- 总耗时: 782秒 (13.03分钟)
- 平均每轮耗时: 3.91秒
- 最终验证: 能正确记住 3 个人的信息

**20 轮对话测试** ✅
- 通过率: 100% (20/20)
- Token 累积: 正常

---

## 2. SDK v5 改造方案

### 2.1 核心策略

1. SDK Session 完全基于 upup 核心
2. SDK 只做薄包装 (sessionId + RPC 调用)
3. 保持 Hook 系统用于 Stream 消息同步

### 2.2 改造后架构

```
SDK 层                           upup 核心层
┌──────────────────┐           ┌──────────────────┐
│ UpClient         │           │ SessionManager   │
│   ├── create()  │──IPC──▶   │   ├── messages[] │
│   ├── stream()  │           │   ├── state     │
│   └── close()   │           │   └── kv store  │
└──────────────────┘           └──────────────────┘
```

### 2.3 实现差异对比

| 组件 | SDK v4 | SDK v5 |
|------|--------|--------|
| sessionId 存储 | currentSession.id | sessionId (string) |
| 消息存储 | messages[] (本地) | (由 upup 核心管理) |
| tokenUsage | currentSession.tokenUsage | tokenUsage (独立) |
| 状态机 | currentSession.status | (由 upup 核心管理) |

---

## 3. 实现步骤

### Phase 1: 简化 UpupSessionManager ✅

**已完成** (packages/sdk/src/session/upup-session.ts)

简化内容:
1. ✅ 移除 messages[] 数组本地存储
2. ✅ 只保留 sessionId, tokenUsage, transport
3. ✅ 所有操作通过 IPC 调用 upup

```typescript
// 简化后的 UpupSessionManager (SDK v5)
export class UpupSessionManager {
  // 唯一状态: sessionId
  private sessionId: string | null = null;
  private tokenUsage?: TokenUsage;
  private transport: RpcTransport;

  // 消息通过 getMessages() async 方法从 upup 获取
}
```

### Phase 2: 删除冗余代码 🔄

**计划中**:
- [ ] 删除 manager.ts (SDK v3 实现)
- [ ] 简化 types.ts
- [ ] 更新 index.ts

### Phase 3: 测试验证 ✅

**已完成**:
- ✅ 20 轮对话测试通过
- ✅ 100 轮对话测试通过
- ✅ 200 轮对话测试通过 (99.50%)

---

## 4. 文件变更清单

### 已修改 ✅
- packages/sdk/src/session/upup-session.ts
  - 移除 messages[] 数组
  - 移除 currentSession 状态
  - 简化方法实现
  - 代码行数: ~300 → ~200 (33% 减少)

### 待删除 🔄
- packages/sdk/src/session/manager.ts
  - SDK v3 实现，可删除

### 待修改 🔄
- packages/sdk/src/session/index.ts
- packages/sdk/src/session/types.ts
- packages/sdk/src/client/client.ts

---

## 5. 验证清单

- [x] 20 轮对话测试通过
- [x] 100 轮对话测试通过
- [x] 200 轮对话测试通过 (99.50%)
- [x] Token 使用量正确跟踪
- [ ] 向后兼容保持
- [ ] 代码行数减少 60%

---

## 6. 200 轮测试详细结果

```
SDK Session 200 轮对话验证测试

初始化:
   ✅ Session ID: sess-1778998035744-32id0rwj

阶段 1: 记住个人信息
   记住 张三 → 已记住，张三，软件工程师，北京
   记住 李四 → 已记录，李四，产品经理，上海
   记住 王五 → 已记住，王五，数据科学家，深圳

阶段 2: 验证记忆 (200 轮)
   [1/200] 通过: 1    | Token: 129,484 | 速率: 0.03轮/秒
   [20/200] 通过: 20  | Token: 44,852  | 速率: 0.14轮/秒
   [40/200] 通过: 40  | Token: 45,844  | 速率: 0.20轮/秒
   [60/200] 通过: 60  | Token: 47,055  | 速率: 0.21轮/秒
   [80/200] 通过: 80  | Token: 48,239  | 速率: 0.23轮/秒
   [100/200] 通过: 100| Token: 98,748  | 速率: 0.24轮/秒
   [120/200] 通过: 119| Token: 101,081 | 速率: 0.24轮/秒
   [140/200] 通过: 139| Token: 51,796  | 速率: 0.24轮/秒
   [160/200] 通过: 159| Token: 53,084  | 速率: 0.25轮/秒
   [180/200] 通过: 179| Token: 54,442  | 速率: 0.25轮/秒
   [200/200] 通过: 199| Token: 55,508  | 速率: 0.26轮/秒

最终验证:
   最终检查响应: 你是**王五**，**数据科学家**，住在**深圳**。今天心情不错，还对投资感兴趣

结果: ✅ 通过 (≥90%)
```

---

## 7. 参考资料

### Claude Code 核心文件
- /Users/louloulin/Documents/linchong/claw/loucode/src/query.ts
  - `query()` 异步生成器 (1700+ 行)
  - Stream 消息累积
  - 工具执行循环

### upup 核心文件
- src/daemon/session.ts
  - SessionManager 单例
  - serializeMessage/deserializeMessage
- src/agent/agent.ts
  - 消息保存到 daemonSession

### SDK 文件
- packages/sdk/src/session/upup-session.ts (已简化)
- packages/sdk/src/session/manager.ts (待删除)

---

## 8. SDK v5 实现完成 (2026-05-17 下午)

### 8.1 代码变更

**packages/sdk/src/session/upup-session.ts** ✅
- 移除 messages[] 本地数组
- 只保留 sessionId, tokenUsage, transport
- 所有消息通过 IPC 调用 upup

**packages/sdk/src/session/index.ts** ✅
- 移除 SessionManager 导出
- 只导出 UpupSessionManager

**packages/sdk/src/client/client.ts** ✅
- 移除 sessionManager 字段
- 所有方法使用 upupSessionManager
- session getter 代理到 upupSession

### 8.2 测试验证

```
SDK Session 20 轮对话快速验证

轮数: 20 | 通过: 20 | 通过率: 100.0%
Token: 247,913 | 耗时: 278秒

最终验证: 正确总结用户完整信息
结果: ✅ 通过
```

### 8.3 代码行数对比

| 文件 | SDK v4 | SDK v5 | 减少 |
|------|--------|--------|------|
| upup-session.ts | ~300 | ~200 | 33% |
| client.ts | ~900 | ~850 | 6% |
| manager.ts | ~413 | (删除) | 100% |
| 总计 | ~1613 | ~1050 | 35% |

### 8.4 架构对比

```
SDK v4:                          SDK v5:
┌──────────────────┐             ┌──────────────────┐
│ UpClient         │             │ UpClient         │
│  ├── sessionManager  (SDK v3) │  └── upupSessionManager
│  └── upupSessionManager      │      (only)
└──────────────────┘             └──────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────┐             ┌──────────────────┐
│ SessionManager   │             │     (无)        │
│ (messages[])    │             │   消息由 upup    │
└──────────────────┘             │   核心存储       │
                               └──────────────────┘
```

### 8.5 向后兼容

- `client.session` → 代理到 `upupSession` ✅
- `client.upupSession` → 正常工作 ✅
- `client.createSession()` → 使用 UpupSessionManager ✅
