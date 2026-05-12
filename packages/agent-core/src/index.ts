/**
 * @upup/agent-core - Agent Core Runtime
 *
 * This package exports Agent core functionality for use by adapters and SDK consumers.
 */

// Re-export Agent from main application
export { Agent } from '../../../src/agent/agent.js'

// Re-export types
export type {
  AgentConfig,
  Message,
  TokenUsage,
  ApprovalDecision,
  StreamMode,
  StreamProgressEvent,
  ThinkingEvent,
  ToolStartEvent,
  ToolEndEvent,
  ToolErrorEvent,
  ToolLimitEvent,
  ToolProgressEvent,
  ToolApprovalEvent,
  ToolDeniedEvent,
  DoneEvent,
  DisplayEvent,
  MemoryFlushEvent,
  MemoryRecalledEvent,
  CompactionEvent,
  MicrocompactEvent,
  QueueDrainEvent,
  ContextClearedEvent,
  ChannelProfile,
} from '../../../src/agent/types.js'

export type {
  AgentEvent,
} from '../../../src/agent/types.js'