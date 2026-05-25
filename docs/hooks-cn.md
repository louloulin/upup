# 钩子系统

> 事件驱动扩展框架

## 概述

UpUp 实现了全面的钩子系统，支持事件驱动的扩展性。钩子允许插件和内部系统在智能体生命周期中拦截、修改和响应各种事件。

```
┌─────────────────────────────────────────────────────────────────────┐
│                       钩子系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    钩子执行器                                 │    │
│  │                                                              │    │
│  │  • 事件路由                                               │    │
│  │  • 优先级执行                                             │    │
│  │  • 输出合并                                               │    │
│  │  • 错误处理                                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   工具      │      │  会话      │      │  系统      │     │
│  │   钩子      │      │   钩子    │      │   钩子    │     │
│  │             │      │             │      │             │     │
│  │ • PreToolUse│    │ • SessionStart│   │ • CwdChanged │  │
│  │ • PostToolUse│   │ • SessionEnd │    │ • FileChanged │  │
│  │ • Stop      │      │             │      │ • ConfigChange│   │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 钩子事件

### 工具生命周期钩子

| 事件 | 描述 | 参数 |
|------|------|------|
| `PreToolModify` | PreToolUse 之前，允许修改工具参数 | `PreToolModifyParams` |
| `PreToolUse` | 工具执行前 | `PreToolUseParams` |
| `PostToolUse` | 工具执行成功后 | `PostToolUseParams` |
| `PostToolUseFailure` | 工具执行失败后 | `PostToolUseFailureParams` |

### 会话钩子

| 事件 | 描述 | 参数 |
|------|------|------|
| `SessionStart` | 会话开始时 | `SessionStartParams` |
| `SessionEnd` | 会话结束时 | `SessionEndParams` |

### 轮次钩子

| 事件 | 描述 | 参数 |
|------|------|------|
| `Stop` | 轮次结束时 | `StopParams` |
| `StopFailure` | 轮次失败时 | `StopParams` |
| `UserPromptSubmit` | 用户提交输入时 | - |

### 上下文钩子

| 事件 | 描述 | 参数 |
|------|------|------|
| `PreCompact` | 消息压缩前 | `CompactParams` |
| `PostCompact` | 消息压缩后 | `CompactParams` |

### 权限钩子

| 事件 | 描述 | 参数 |
|------|------|------|
| `PermissionRequest` | 请求权限时 | `PermissionRequestParams` |
| `PermissionDenied` | 权限被拒绝时 | - |

### 系统钩子

| 事件 | 描述 | 参数 |
|------|------|------|
| `CwdChanged` | 工作目录变更时 | - |
| `FileChanged` | 文件被修改时 | - |
| `ConfigChange` | 配置变更时 | - |
| `Notification` | 系统通知 | - |

---

## 钩子类型

```typescript
export type HookType = 'command' | 'function' | 'http' | 'prompt';
```

### 函数钩子

处理钩子事件的 JavaScript 函数：

```typescript
const myHook: HookDefinition = {
  id: 'my-hook',
  name: 'My Hook',
  event: 'PreToolUse',
  type: 'function',
  priority: 100,
  handler: async (params, context) => {
    console.log('Tool:', params.toolName);
    return { continue: true };
  },
};
```

### 命令钩子

通过 stdin/stdout 执行的 shell 命令：

```typescript
// 退出码 0: 继续
// 退出码 2: 阻止 (PreToolUse) 或继续对话 (Stop)
// 其他: 警告但继续
```

---

## 钩子输出

```typescript
interface HookOutput {
  continue?: boolean;           // 继续执行
  suppressOutput?: boolean;    // 隐藏 stdout
  stopReason?: string;         // 停止原因
  decision?: 'approve' | 'block' | 'allow' | 'deny' | 'ask';
  reason?: string;            // 决策原因
  systemMessage?: string;     // 系统消息
  exitCode?: number;           // 退出码 (命令钩子)
  blocked?: boolean;            // 是否被阻止
  hookSpecificOutput?: HookSpecificOutput;
}
```

---

## 钩子执行器

### 基础用法

```typescript
import { getHookExecutor } from './tool-hooks.ts';

const executor = getHookExecutor();

// 注册钩子
executor.register({
  id: 'my-logger',
  name: 'My Logger',
  event: 'PreToolUse',
  type: 'function',
  handler: async (params) => {
    console.log('Tool:', params.toolName);
    return { continue: true };
  },
});

// 执行事件的钩子
const result = await executor.preToolUse({
  toolName: 'Bash',
  args: { command: 'ls' },
  toolCallId: 'tool_123',
});
```

### PreToolModify 钩子

允许在执行前修改工具参数：

```typescript
// 注册 PreToolModify 钩子
executor.register({
  id: 'arg-modifier',
  name: '参数修改器',
  event: 'PreToolModify',
  type: 'function',
  handler: async (params, context) => {
    const args = params.args as Record<string, unknown>;

    // 修改参数
    if (args.command) {
      args.command = `echo "Modified: ${args.command}"`;
    }

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolModify',
        updatedInput: args,
      },
    };
  },
});

// 执行参数修改
const { args, blocked } = await executor.preToolModify({
  toolName: 'Bash',
  args: { command: 'ls' },
});
console.log('New command:', args.command); // "Modified: ls"
```

---

## 钩子上下文

```typescript
interface HookContext {
  sessionId: string;       // 会话 ID
  turnCount: number;       // 当前轮次
  cwd: string;           // 工作目录
  timestamp: number;       // 事件时间戳
  [key: string]: unknown;  // 自定义上下文
}
```

### 设置全局上下文

```typescript
executor.setGlobalContext({
  sessionId: 'session-123',
  turnCount: 5,
  cwd: '/project',
});
```

---

## 内置钩子

### 日志钩子

```typescript
import { createLoggingHook } from './tool-hooks.ts';

const hook = createLoggingHook('PreToolUse');
executor.register(hook);
```

### 错误停止钩子

```typescript
import { createStopOnErrorHook } from './tool-hooks.ts';

const hook = createStopOnErrorHook();
executor.register(hook);
```

### 内存保存钩子

```typescript
import { createMemorySaveHook } from './tool-hooks.ts';

const hook = createMemorySaveHook();
executor.register(hook);
```

---

## 插件钩子

插件可以在 `onLoad` 期间注册钩子：

```typescript
export default {
  onLoad(api: UpUpPluginApi) {
    api.registerHook(['PreToolUse'], async (ctx) => {
      // 记录所有工具使用
      console.log('Tool:', ctx.data?.toolName);
      return { allowed: true };
    });
  },
};
```

---

## 速率限制器

钩子模块包含速率限制支持：

```typescript
import {
  checkRateLimit,
  recordRateLimit,
  getRateLimitStatus,
} from '@upup/hooks';

// API 调用前检查
const status = await checkRateLimit('openai', 'gpt-4');
if (!status.allowed) {
  console.log(`速率限制。请在 ${status.retryAfter} 秒后重试`);
}

// 记录使用
await recordRateLimit('openai', 'gpt-4');
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [插件系统](plugins-cn.md)
- [API 参考](api-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
