# Hook System

> Event-driven extensibility framework

## Overview

UpUp implements a comprehensive hook system for event-driven extensibility. Hooks allow plugins and internal systems to intercept, modify, and respond to various events during the agent lifecycle.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Hook System Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Hook Executor                             │    │
│  │                                                              │    │
│  │  • Event routing                                           │    │
│  │  • Priority-based execution                                │    │
│  │  • Output merging                                          │    │
│  │  • Error handling                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Tool      │      │  Session    │      │  System     │     │
│  │   Hooks     │      │   Hooks     │      │   Hooks     │     │
│  │             │      │             │      │             │     │
│  │ • PreToolUse│      │ • SessionStart│   │ • CwdChanged │   │
│  │ • PostToolUse│    │ • SessionEnd │    │ • FileChanged │   │
│  │ • Stop      │      │             │      │ • ConfigChange│    │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Hook Events

### Tool Lifecycle Hooks

| Event | Description | Parameters |
|-------|-------------|------------|
| `PreToolModify` | Before PreToolUse, allows modifying tool arguments | `PreToolModifyParams` |
| `PreToolUse` | Before tool execution | `PreToolUseParams` |
| `PostToolUse` | After successful tool execution | `PostToolUseParams` |
| `PostToolUseFailure` | After tool execution failure | `PostToolUseFailureParams` |

### Session Hooks

| Event | Description | Parameters |
|-------|-------------|------------|
| `SessionStart` | When session begins | `SessionStartParams` |
| `SessionEnd` | When session ends | `SessionEndParams` |

### Turn Hooks

| Event | Description | Parameters |
|-------|-------------|------------|
| `Stop` | At turn end | `StopParams` |
| `StopFailure` | When turn fails | `StopParams` |
| `UserPromptSubmit` | When user submits input | - |

### Context Hooks

| Event | Description | Parameters |
|-------|-------------|------------|
| `PreCompact` | Before message compaction | `CompactParams` |
| `PostCompact` | After message compaction | `CompactParams` |

### Permission Hooks

| Event | Description | Parameters |
|-------|-------------|------------|
| `PermissionRequest` | When permission is requested | `PermissionRequestParams` |
| `PermissionDenied` | When permission is denied | - |

### System Hooks

| Event | Description | Parameters |
|-------|-------------|------------|
| `CwdChanged` | When working directory changes | - |
| `FileChanged` | When a file is modified | - |
| `ConfigChange` | When configuration changes | - |
| `Notification` | System notifications | - |

---

## Hook Types

```typescript
export type HookType = 'command' | 'function' | 'http' | 'prompt';
```

### Function Hooks

JavaScript functions that process hook events:

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

### Command Hooks

Shell commands executed with stdin/stdout:

```typescript
// Exit code 0: continue
// Exit code 2: block (for PreToolUse) or continue conversation (for Stop)
// Other: warning but continue
```

---

## Hook Output

```typescript
interface HookOutput {
  continue?: boolean;           // Continue execution
  suppressOutput?: boolean;     // Hide stdout
  stopReason?: string;          // Stop message
  decision?: 'approve' | 'block' | 'allow' | 'deny' | 'ask';
  reason?: string;             // Decision reason
  systemMessage?: string;       // System message
  exitCode?: number;            // Exit code (command hooks)
  blocked?: boolean;            // Whether blocked
  hookSpecificOutput?: HookSpecificOutput;
}
```

---

## Hook Executor

### Basic Usage

```typescript
import { getHookExecutor } from './tool-hooks.ts';

const executor = getHookExecutor();

// Register a hook
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

// Execute hooks for an event
const result = await executor.preToolUse({
  toolName: 'Bash',
  args: { command: 'ls' },
  toolCallId: 'tool_123',
});
```

### PreToolModify Hook

Allows modifying tool arguments before execution:

```typescript
// Register a PreToolModify hook
executor.register({
  id: 'arg-modifier',
  name: 'Argument Modifier',
  event: 'PreToolModify',
  type: 'function',
  handler: async (params, context) => {
    const args = params.args as Record<string, unknown>;

    // Modify arguments
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

// Execute with args modification
const { args, blocked } = await executor.preToolModify({
  toolName: 'Bash',
  args: { command: 'ls' },
});
console.log('New command:', args.command); // "Modified: ls"
```

---

## Hook Context

```typescript
interface HookContext {
  sessionId: string;       // Session ID
  turnCount: number;       // Current turn
  cwd: string;             // Working directory
  timestamp: number;        // Event timestamp
  [key: string]: unknown;  // Custom context
}
```

### Setting Global Context

```typescript
executor.setGlobalContext({
  sessionId: 'session-123',
  turnCount: 5,
  cwd: '/project',
});
```

---

## Built-in Hooks

### Logging Hook

```typescript
import { createLoggingHook } from './tool-hooks.ts';

const hook = createLoggingHook('PreToolUse');
executor.register(hook);
```

### Stop on Error

```typescript
import { createStopOnErrorHook } from './tool-hooks.ts';

const hook = createStopOnErrorHook();
executor.register(hook);
```

### Memory Save

```typescript
import { createMemorySaveHook } from './tool-hooks.ts';

const hook = createMemorySaveHook();
executor.register(hook);
```

---

## Plugin Hooks

Plugins can register hooks during `onLoad`:

```typescript
export default {
  onLoad(api: UpUpPluginApi) {
    api.registerHook(['PreToolUse'], async (ctx) => {
      // Log all tool uses
      console.log('Tool:', ctx.data?.toolName);
      return { allowed: true };
    });
  },
};
```

---

## Rate Limiter

The hooks module includes rate limiting support:

```typescript
import {
  checkRateLimit,
  recordRateLimit,
  getRateLimitStatus,
} from '@upup/hooks';

// Check before API call
const status = await checkRateLimit('openai', 'gpt-4');
if (!status.allowed) {
  console.log(`Rate limited. Retry after ${status.retryAfter}s`);
}

// Record usage
await recordRateLimit('openai', 'gpt-4');
```

---

## Related Documents

- [Architecture](architecture.md)
- [Plugin System](plugins.md)
- [API Reference](api.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>