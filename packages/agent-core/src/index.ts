/**
 * @upup/agent-core - Pi Runtime Compatibility Types
 *
 * The production agent executor is Pi (`@earendil-works/pi-agent-core` and
 * `@earendil-works/pi-coding-agent`). This package remains only as a small
 * compatibility surface for adapters that consume the historical DTO shapes.
 */

// Re-export from @upup/types
export type {
  Message,
  ProviderConfig,
  LlmOptions,
  LlmResponse,
  SessionConfig,
  Session,
} from '@upup/types';

// ===== Compatibility DTOs (no execution semantics) =====

export type StreamMode = 'delta' | 'full';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  modifiedArgs?: Record<string, unknown>;
}

export type AgentEvent =
  | StreamProgressEvent
  | ThinkingEvent
  | ToolStartEvent
  | ToolEndEvent
  | ToolErrorEvent
  | ToolLimitEvent
  | ToolProgressEvent
  | ToolApprovalEvent
  | ToolDeniedEvent
  | DoneEvent
  | DisplayEvent
  | MemoryFlushEvent
  | MemoryRecalledEvent
  | CompactionEvent
  | MicrocompactEvent
  | QueueDrainEvent
  | ContextClearedEvent;

export interface ChannelProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamProgressEvent {
  type: 'stream_progress';
  delta: string;
}

export interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

export interface ToolStartEvent {
  type: 'tool_start';
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolEndEvent {
  type: 'tool_end';
  tool: string;
  result: unknown;
  duration?: number;
}

export interface ToolErrorEvent {
  type: 'tool_error';
  tool: string;
  error: string;
}

export interface ToolLimitEvent {
  type: 'tool_limit';
  tool: string;
  limit: number;
  current: number;
}

export interface ToolProgressEvent {
  type: 'tool_progress';
  tool: string;
  progress: string;
}

export interface ToolApprovalEvent {
  type: 'tool_approval';
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolDeniedEvent {
  type: 'tool_denied';
  tool: string;
  reason: string;
}

export interface DoneEvent {
  type: 'done';
  result: string;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface DisplayEvent {
  type: 'display';
  content: string;
}

export interface MemoryFlushEvent {
  type: 'memory_flush';
  entriesRemoved: number;
}

export interface MemoryRecalledEvent {
  type: 'memory_recalled';
  entriesAdded: number;
}

export interface CompactionEvent {
  type: 'compaction';
  oldSize: number;
  newSize: number;
}

export interface MicrocompactEvent {
  type: 'microcompact';
  chunksProcessed: number;
}

export interface QueueDrainEvent {
  type: 'queue_drain';
  itemsProcessed: number;
}

export interface ContextClearedEvent {
  type: 'context_cleared';
  reason: string;
}

export interface AgentConfig {
  model?: string;
  provider?: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: import('@upup/types').AgentTool[];
  streamMode?: StreamMode;
  approvalMode?: 'auto' | 'manual' | 'tool_call';
  toolLimits?: Record<string, number>;
}
