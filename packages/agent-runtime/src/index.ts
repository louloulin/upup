export { Agent } from './agent.js';

export { Scratchpad } from './scratchpad.js';

export { getCurrentDate, buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from './prompts.js';

// Re-export all types from types.js so consumers can use `import type { StreamMode } from '@upup/agent-runtime'`
// and `import type { DisplayEvent } from '@upup/agent-runtime'`.
export type {
  ChannelProfile,
  ApprovalDecision,
  AgentConfig,
  Message,
  AgentEvent,
  ThinkingEvent,
  ToolStartEvent,
  ToolEndEvent,
  ToolErrorEvent,
  ToolProgressEvent,
  ToolLimitEvent,
  ToolApprovalEvent,
  ToolDeniedEvent,
  ContextClearedEvent,
  MemoryRecalledEvent,
  MemoryFlushEvent,
  StreamMode,
  StreamProgressEvent,
  TokenUsage,
  QueueDrainEvent,
  MicrocompactEvent,
  CompactionEvent,
  DoneEvent,
  DisplayEvent,
} from './types.js';

export type {
  ToolCallRecord,
  ScratchpadEntry,
  ToolLimitConfig,
  ToolUsageStatus,
} from './scratchpad.js';

// Re-export subagent types that are defined in subagent.ts
export type {
  SubagentType,
  PermissionMode,
  IsolationMode,
  SubagentConfig,
  SubagentResult,
  SubagentTaskStatus,
  SubagentTask,
  SubagentEventType,
  SubagentEvent,
  SubagentEventListener,
  SubagentRunner,
  SubagentContext,
  BuiltInAgentDefinition,
} from './subagent.js';
export { DEFAULT_SUBAGENT_CONFIG } from './subagent.js';

