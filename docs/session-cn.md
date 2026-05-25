# 会话管理

> 会话状态、持久化和恢复

## 概述

UpUp 实现了完整的会话管理系统，提供：

- **会话状态追踪**: idle/running/requires_action 状态管理
- **会话持久化**: 会话状态和历史消息的持久化存储
- **工具权限追踪**: 会话级别的工具授权/拒绝状态
- **权限模式管理**: 多种权限模式支持

```
┌─────────────────────────────────────────────────────────────────────┐
│                       会话管理架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   会话状态管理器                             │    │
│  │                                                              │    │
│  │  • 状态追踪 (idle/running/requires_action)                │    │
│  │  • 元数据同步                                              │    │
│  │  • 权限模式管理                                            │    │
│  │  • 事件监听                                                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   会话追踪器                                 │    │
│  │                                                              │    │
│  │  • 工具授权/拒绝                                          │    │
│  │  • 工具调用计数                                           │    │
│  │  • Token 使用统计                                         │    │
│  │  • 状态持久化                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 会话状态

### 状态类型

```typescript
type SessionState = 'idle' | 'running' | 'requires_action';
```

| 状态 | 描述 |
|------|------|
| `idle` | 会话空闲，等待用户输入 |
| `running` | 会话正在运行，智能体正在执行 |
| `requires_action` | 需要用户操作（如授权） |

### 状态管理

```typescript
import {
  getSessionState,
  isSessionRunning,
  isSessionRequiresAction,
  notifySessionStateChanged,
} from './session-state';

// 获取当前状态
const state = getSessionState();

// 检查状态
if (isSessionRunning()) {
  console.log('会话正在运行');
}

// 状态变更监听
setSessionStateChangedListener((state, details) => {
  if (state === 'requires_action') {
    console.log('需要授权:', details?.tool_name);
  }
});
```

---

## 会话追踪器

会话追踪器 (`SessionTracker`) 提供会话级别的状态追踪和持久化。

### 核心功能

```typescript
const tracker = getSessionTracker();

// 启动会话
await tracker.startSession('session-123');

// 检查工具授权
if (tracker.isToolApproved('Bash')) {
  console.log('Bash 工具已授权');
}

// 授权工具
tracker.approveTool('Bash');

// 拒绝工具
tracker.denyTool('Bash');

// 记录工具调用
tracker.recordToolCall('Read');

// 更新 Token 统计
tracker.updateTokens(1500);
```

### 状态结构

```typescript
interface SessionTrackerState {
  id: string;
  sessionId: string;
  approvedTools: string[];        // 已授权工具
  deniedTools: string[];          // 已拒绝工具
  toolCallCounts: Record<string, number>;  // 工具调用计数
  totalTokens: number;           // 总 Token 数
  totalIterations: number;        // 总迭代次数
  lastQuery?: string;            // 最后查询
  lastUpdated: number;           // 最后更新时间
}
```

### 持久化

会话追踪状态存储在 `~/.upup/cache/session-tracker/` 目录：

```
~/.upup/cache/session-tracker/
├── tracker_session-123.json
├── tracker_session-456.json
└── ...
```

每个会话一个 JSON 文件，包含完整的追踪状态。

---

## 权限模式

### 可用模式

```typescript
type PermissionMode =
  | 'default'           // 标准权限检查
  | '.accept-all'       // 接受所有提示
  | 'acceptEdits'       // 自动接受编辑
  | 'bypassPermissions' // 绕过所有权限检查
  | 'dangerously'       // 允许危险操作
  | 'dontAsk'          // 不询问
  | 'plan'             // 计划模式（只读）
  | 'auto'             // 自动模式
  | 'bubble';         // 气泡模式
```

### 模式检查

```typescript
import {
  getPermissionMode,
  isDangerousMode,
  isAcceptAllMode,
  isPlanMode,
  isAcceptEditsMode,
} from './session-state';

// 获取当前模式
const mode = getPermissionMode();

// 检查特定模式
if (isDangerousMode()) {
  console.log('危险模式已启用');
}

if (isPlanMode()) {
  console.log('计划模式：只读操作');
}
```

### 模式标签

```typescript
import { getPermissionModeLabel } from './session-state';

const label = getPermissionModeLabel();
// 返回如: '[BYPASS]', '[DANGEROUS]', '[PLAN]' 等
```

---

## 需要操作状态

当智能体需要用户操作（如工具授权）时使用 `requires_action` 状态。

### 设置待处理操作

```typescript
import { setPendingAction, clearPendingAction } from './session-state';

setPendingAction({
  tool_name: 'Bash',
  action_description: '执行命令: rm -rf temp/',
  tool_use_id: 'tool_123',
  request_id: 'req_456',
  input: { command: 'rm -rf temp/' }
});
```

### 获取待处理操作

```typescript
import { getPendingAction } from './session-state';

const pending = getPendingAction();
if (pending) {
  console.log(`需要授权: ${pending.tool_name}`);
  console.log(`操作: ${pending.action_description}`);
}
```

### 清除待处理操作

```typescript
clearPendingAction();  // 状态变为 'idle'
```

---

## 事件监听

### 状态变更监听

```typescript
setSessionStateChangedListener((state, details) => {
  console.log(`状态变为: ${state}`);
  if (details) {
    console.log(`详情: ${JSON.stringify(details)}`);
  }
});
```

### 元数据变更监听

```typescript
setSessionMetadataChangedListener((metadata) => {
  console.log('元数据更新:', metadata);
});
```

### 权限模式变更监听

```typescript
setPermissionModeChangedListener((mode) => {
  console.log(`权限模式变为: ${mode}`);
});
```

---

## 会话恢复

### 列出所有会话

```typescript
const tracker = getSessionTracker();
const sessions = await tracker.listSessions();

for (const session of sessions) {
  console.log(`会话: ${session.sessionId}`);
  console.log(`更新时间: ${new Date(session.lastUpdated)}`);
  console.log(`已授权工具: ${session.approvedTools.join(', ')}`);
}
```

### 恢复会话状态

```typescript
const tracker = getSessionTracker();
await tracker.startSession('session-123');

const state = tracker.getSession();
console.log('已授权工具:', state?.approvedTools);
console.log('工具调用:', state?.toolCallCounts);
```

---

## 单例模式

```typescript
import { getSessionTracker, resetSessionTracker } from './session-tracker';

// 获取全局单例
const tracker = getSessionTracker();

// 重置单例（测试用）
resetSessionTracker();
```

---

## 重置所有状态

```typescript
import { resetAllSessionState, removeAllListeners } from './session-state';

// 重置所有会话状态
resetAllSessionState();

// 移除所有监听器
removeAllListeners();
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [权限系统](permission-cn.md)
- [API 参考](api-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
