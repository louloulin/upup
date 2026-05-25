# API 参考文档

> UpUp 程序化 API 文档

## 概述

UpUp 可以通过其 API 以编程方式使用：

```typescript
import { UpUp, type RunOptions } from '@upup/sdk';

// 初始化
const agent = new UpUp({
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 运行查询
const result = await agent.run('分析股票市场趋势');
console.log(result.answer);
```

---

## 核心类

### UpUp

主智能体类。

```typescript
class UpUp {
  constructor(options: UpUpOptions);
  async run(query: string, options?: RunOptions): Promise<RunResult>;
  async resume(sessionId: string): Promise<void>;
  getSession(): SessionInfo;
  cancel(): void;
}
```

#### 构造函数选项

```typescript
interface UpUpOptions {
  model?: string;              // 模型名称 (默认: claude-sonnet-4)
  modelProvider?: string;       // 提供商 (anthropic, openai 等)
  apiKey?: string;             // API 密钥
  permissionMode?: PermissionMode;
  maxIterations?: number;       // 最大智能体迭代次数
  dangerouslySkipPermissions?: boolean;
}
```

#### 运行选项

```typescript
interface RunOptions {
  sessionId?: string;          // 恢复会话
  fork?: boolean;             // 分叉现有会话
  tools?: string[];           // 启用特定工具
  skills?: string[];           // 启用特定技能
  signal?: AbortSignal;        // 取消信号
}
```

#### 运行结果

```typescript
interface RunResult {
  answer: string;              // 智能体响应
  sessionId: string;           // 会话 ID
  iterations: number;         // 智能体迭代次数
  toolsUsed: ToolResult[];    // 执行的工具
  tokens: TokenUsage;        // Token 消耗
}
```

---

### ToolExecutor

执行带有权限处理的工具。

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

#### 选项

```typescript
interface ToolExecutorOptions {
  sessionApprovedTools?: Set<string>;
  maxConcurrency?: number;        // 默认: 10
  signal?: AbortSignal;
  requestToolApproval?: ApprovalRequester;
}
```

#### 事件

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

管理会话状态和持久化。

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

#### 状态

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

执行技能。

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

#### 结果

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

## 类型定义

### 权限类型

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

### 工具类型

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

### 消息类型

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

## 使用示例

### 基础用法

```typescript
import { UpUp } from '@upup/sdk';

const agent = new UpUp({
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await agent.run('苹果当前的市盈率是多少？');
console.log(result.answer);
```

### 使用会话

```typescript
// 首次运行
const result1 = await agent.run('分析科技股');
const sessionId = result1.sessionId;

// 恢复会话
const result2 = await agent.run('现在与医疗行业比较', {
  sessionId,
});
```

### 使用工具

```typescript
const result = await agent.run('查找所有 TypeScript 文件', {
  tools: ['Read', 'Grep', 'Glob'],
});
```

### 使用技能

```typescript
const result = await agent.run('对特斯拉进行全面分析', {
  skills: ['medfish', 'technical-analysis', 'risk-management'],
});
```

### 取消操作

```typescript
const controller = new AbortController();

const result = await agent.run('长期分析...', {
  signal: controller.signal,
});

// 30秒后取消
setTimeout(() => controller.abort(), 30000);
```

### 自定义工具

```typescript
import { UpUp, defineTool } from '@upup/sdk';

const myTool = defineTool({
  name: 'my_analysis',
  description: '自定义分析工具',
  parameters: z.object({
    symbol: z.string(),
  }),
  execute: async ({ symbol }) => {
    return `对 ${symbol} 的分析`;
  },
});

const agent = new UpUp({
  tools: [myTool],
});

const result = await agent.run('使用 my_analysis 分析苹果');
```

---

## 错误处理

```typescript
try {
  const result = await agent.run('分析...');
} catch (error) {
  if (error instanceof UpUpError) {
    switch (error.type) {
      case 'permission_denied':
        console.log('权限被拒绝:', error.tool);
        break;
      case 'rate_limit':
        console.log('速率限制, 重试时间:', error.retryAfter);
        break;
      case 'model_error':
        console.log('模型错误:', error.message);
        break;
    }
  }
}
```

### 错误类型

```typescript
type UpUpError =
  | { type: 'permission_denied'; tool: string; reason: string }
  | { type: 'rate_limit'; tool: string; retryAfter: number }
  | { type: 'model_error'; message: string; code?: string }
  | { type: 'tool_error'; tool: string; message: string }
  | { type: 'session_error'; message: string };
```

---

## 相关文档

- [架构设计](architecture-cn.md)
- [技能系统](skills-cn.md)
- [权限系统](permission-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
