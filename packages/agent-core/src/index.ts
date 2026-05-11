/**
 * @upup/agent-core - Agent 核心运行时
 *
 * 这个包导出 Agent 核心功能，供 @upup/sdk 和 upup-agent 使用
 */

// Re-export Agent from main application
export { Agent } from '../../../src/agent/agent.js'
export { DEFAULT_MAX_ITERATIONS } from '../../../src/agent/agent.js'
export { inspectChunkContent } from '../../../src/agent/agent.js'

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

export {
  AgentEvent,
} from '../../../src/agent/types.js'

// Re-export tool executor
export {
  AgentToolExecutor,
  DEFAULT_MAX_CONCURRENCY,
  TOOLS_REQUIRING_APPROVAL,
} from '../../../src/agent/tool-executor.js'

export type { ToolCallBatch, ToolExecutionEvent } from '../../../src/agent/tool-executor.js'

// Re-export subagent runner
export {
  SubagentRunner,
  SubagentTaskStore,
  SubagentEventEmitter,
  defaultRunner,
  getDefaultSubagentRunner,
  resetDefaultSubagentRunner,
} from '../../../src/agent/subagent-runner.js'

export type {
  SubagentParams,
  SubagentResult,
  SubagentTask,
  SubagentTaskResult,
} from '../../../src/agent/subagent-runner.js'

// Re-export registry
export {
  AgentRegistry,
  getAgentRegistry,
  getAvailableAgents,
  resetAgentRegistry,
  selectAgentForTask,
} from '../../../src/agent/registry.js'

export {
  CODING_AGENT,
  DEBUGGING_AGENT,
  DOCUMENTATION_AGENT,
  RESEARCH_AGENT,
  REVIEW_AGENT,
  TESTING_AGENT,
} from '../../../src/agent/registry.js'

export {
  AgentCapability,
  agentRegistry,
} from '../../../src/agent/registry.js'

export type {
  AgentDefinition,
  BuiltInAgentDefinition,
} from '../../../src/agent/registry.js'

// Re-export tool registry
export {
  getTools,
  getToolRegistry,
  buildCompactToolDescriptions,
  getToolConcurrencyMap,
} from '../../../src/tools/registry/index.js'

// Re-export hooks
export {
  ToolHookExecutor,
  getHookExecutor,
  resetHookExecutor,
} from '../../../src/hooks/tool-hooks.js'

export type {
  PreToolUseParams,
  PreToolModifyParams,
  PostToolUseParams,
  HookContext,
  HookDefinition,
  HookOutput,
  HookEvent,
  HookHandler,
  HookType,
  StopParams,
  PermissionRequestParams,
} from '../../../src/hooks/tool-hooks.js'
