# API Reference

> UpUp programmatic API documentation

## Overview

UpUp can be used programmatically via its API:

```typescript
import { UpUp, type RunOptions } from '@upup/sdk';

// Initialize
const agent = new UpUp({
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Run query
const result = await agent.run('Analyze stock market trends');
console.log(result.answer);
```

---

## Core Classes

### UpUp

Main agent class.

```typescript
class UpUp {
  constructor(options: UpUpOptions);
  async run(query: string, options?: RunOptions): Promise<RunResult>;
  async resume(sessionId: string): Promise<void>;
  getSession(): SessionInfo;
  cancel(): void;
}
```

#### Constructor Options

```typescript
interface UpUpOptions {
  model?: string;              // Model name (default: claude-sonnet-4)
  modelProvider?: string;       // Provider (anthropic, openai, etc.)
  apiKey?: string;             // API key
  permissionMode?: PermissionMode;
  maxIterations?: number;       // Max agent iterations
  dangerouslySkipPermissions?: boolean;
}
```

#### Run Options

```typescript
interface RunOptions {
  sessionId?: string;          // Resume session
  fork?: boolean;             // Fork existing session
  tools?: string[];           // Enable specific tools
  skills?: string[];           // Enable specific skills
  signal?: AbortSignal;        // Cancellation signal
}
```

#### Run Result

```typescript
interface RunResult {
  answer: string;              // Agent response
  sessionId: string;           // Session ID
  iterations: number;           // Agent iterations
  toolsUsed: ToolResult[];      // Tools executed
  tokens: TokenUsage;           // Token consumption
}
```

---

### ToolExecutor

Executes tools with permission handling.

```typescript
class ToolExecutor {
  constructor(
    toolMap: Map<string, StructuredToolInterface>,
    concurrencyMap: Map<string, boolean>,
    options?: ToolExecutorOptions
  );

  async *executeAll(
    response: AIMessage,
    ctx: RunContext
  ): AsyncGenerator<ToolExecutionEvent>;

  setApprovalCallback(callback: ApprovalCallback): void;
}
```

#### Options

```typescript
interface ToolExecutorOptions {
  sessionApprovedTools?: Set<string>;
  maxConcurrency?: number;        // Default: 10
  signal?: AbortSignal;
  requestToolApproval?: ApprovalRequester;
}
```

#### Events

```typescript
type ToolExecutionEvent =
  | { type: 'tool_start'; tool: string; args: unknown; toolCallId: string }
  | { type: 'tool_progress'; tool: string; message: string }
  | { type: 'tool_end'; tool: string; result: string; duration: number }
  | { type: 'tool_error'; tool: string; error: string }
  | { type: 'tool_approval'; tool: string; approved: ApprovalDecision }
  | { type: 'tool_denied'; tool: string; reason: string };
```

---

### SessionTracker

Manages session state and persistence.

```typescript
class SessionTracker {
  async startSession(sessionId: string): Promise<string>;
  getSession(): SessionTrackerState | null;
  approveTool(tool: string): void;
  denyTool(tool: string): void;
  isToolApproved(tool: string): boolean;
  recordToolCall(tool: string): void;
  getToolCallCount(tool: string): number;
}
```

#### State

```typescript
interface SessionTrackerState {
  id: string;
  sessionId: string;
  approvedTools: string[];
  deniedTools: string[];
  toolCallCounts: Record<string, number>;
  totalTokens: number;
  totalIterations: number;
  lastQuery?: string;
  lastUpdated: number;
}
```

---

### SkillExecutor

Executes skills.

```typescript
class SkillExecutor {
  constructor(skillRegistry: SkillRegistry);

  async execute(
    skill: string,
    params: Record<string, unknown>
  ): Promise<SkillResult>;

  async executePipeline(
    skills: string[],
    initialParams: Record<string, unknown>
  ): Promise<SkillResult[]>;
}
```

#### Result

```typescript
interface SkillResult {
  skill: string;
  success: boolean;
  output: unknown;
  error?: string;
  duration: number;
  tokens?: number;
}
```

---

## Types

### Permission Types

```typescript
type PermissionMode =
  | 'default'
  | '.accept-all'
  | 'bypassPermissions'
  | 'dangerously';

type ApprovalDecision =
  | 'allow-once'
  | 'allow-session'
  | 'deny';

type CommandClassification =
  | 'read'
  | 'write'
  | 'dangerous'
  | 'unknown';
```

### Tool Types

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType;
  requiresApproval: boolean;
  category: ToolCategory;
}

type ToolCategory =
  | 'bash'
  | 'filesystem'
  | 'financial'
  | 'search'
  | 'web'
  | 'development';
```

### Message Types

```typescript
interface Message {
  type: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
}

interface ToolMessage extends Message {
  type: 'tool';
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}
```

---

## Examples

### Basic Usage

```typescript
import { UpUp } from '@upup/sdk';

const agent = new UpUp({
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await agent.run('What is the current P/E ratio of Apple?');
console.log(result.answer);
```

### With Session

```typescript
// First run
const result1 = await agent.run('Analyze tech stocks');
const sessionId = result1.sessionId;

// Resume session
const result2 = await agent.run('Now compare with healthcare', {
  sessionId,
});
```

### With Tools

```typescript
const result = await agent.run('Find all TypeScript files', {
  tools: ['Read', 'Grep', 'Glob'],
});
```

### With Skills

```typescript
const result = await agent.run('Perform comprehensive analysis of TSLA', {
  skills: ['medfish', 'technical-analysis', 'risk-management'],
});
```

### Cancellation

```typescript
const controller = new AbortController();

const result = await agent.run('Long analysis...', {
  signal: controller.signal,
});

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);
```

### Custom Tool

```typescript
import { UpUp, defineTool } from '@upup/sdk';

const myTool = defineTool({
  name: 'my_analysis',
  description: 'Custom analysis tool',
  parameters: z.object({
    symbol: z.string(),
  }),
  execute: async ({ symbol }) => {
    return `Analysis for ${symbol}`;
  },
});

const agent = new UpUp({
  tools: [myTool],
});

const result = await agent.run('Use my_analysis for AAPL');
```

---

## Error Handling

```typescript
try {
  const result = await agent.run('Analyze...');
} catch (error) {
  if (error instanceof UpUpError) {
    switch (error.type) {
      case 'permission_denied':
        console.log('Permission denied:', error.tool);
        break;
      case 'rate_limit':
        console.log('Rate limited, retry after:', error.retryAfter);
        break;
      case 'model_error':
        console.log('Model error:', error.message);
        break;
    }
  }
}
```

### Error Types

```typescript
type UpUpError =
  | { type: 'permission_denied'; tool: string; reason: string }
  | { type: 'rate_limit'; tool: string; retryAfter: number }
  | { type: 'model_error'; message: string; code?: string }
  | { type: 'tool_error'; tool: string; message: string }
  | { type: 'session_error'; message: string };
```

---

## Related Documents

- [Architecture](architecture.md)
- [Skills](skills.md)
- [Permission](permission.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter
</p>
