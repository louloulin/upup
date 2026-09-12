import type { MessageQueue } from '../../utils/message-queue.js';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

export type GroupContext = {
  groupName?: string;
  membersList?: string;
  activationMode: 'mention';
};

export interface ChannelProfile {
  label: string;
  preamble: string;
  behavior: string[];
  responseFormat: string[];
  tables: string | null;
}

export type ApprovalDecision = 'allow-once' | 'allow-session' | 'deny';

export interface AgentConfig {
  model?: string;
  modelProvider?: string;
  maxIterations?: number;
  signal?: AbortSignal;
  channel?: string;
  groupContext?: GroupContext;
  requestToolApproval?: (request: { tool: string; args: Record<string, unknown> }) => Promise<ApprovalDecision>;
  sessionApprovedTools?: Set<string>;
  onToolApproval?: (tool: string) => void;
  memoryEnabled?: boolean;
  messageQueue?: MessageQueue;
  sessionId?: string;
  toolFilter?: string[] | '*';
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ThinkingEvent { type: 'thinking'; message: string }
export interface ToolStartEvent { type: 'tool_start'; tool: string; args: Record<string, unknown>; toolCallId?: string }
export interface ToolEndEvent { type: 'tool_end'; tool: string; args: Record<string, unknown>; result: string; duration: number; toolCallId?: string }
export interface ToolErrorEvent { type: 'tool_error'; tool: string; error: string; toolCallId?: string }
export interface ToolProgressEvent { type: 'tool_progress'; tool: string; message: string }
export interface ToolLimitEvent { type: 'tool_limit'; tool: string; warning?: string; blocked: boolean }
export interface ToolApprovalEvent { type: 'tool_approval'; tool: string; args: Record<string, unknown>; approved: ApprovalDecision }
export interface ToolDeniedEvent { type: 'tool_denied'; tool: string; args: Record<string, unknown>; toolCallId?: string }
export interface ContextClearedEvent { type: 'context_cleared'; clearedCount: number; keptCount: number }
export interface MemoryRecalledEvent { type: 'memory_recalled'; filesLoaded: string[]; tokenCount: number }
export interface MemoryFlushEvent { type: 'memory_flush'; phase: 'start' | 'end'; filesWritten?: string[] }

export type StreamMode = 'requesting' | 'thinking' | 'responding' | 'tool-input' | 'tool-use';

export interface StreamProgressEvent {
  type: 'stream_progress';
  charDelta: number;
  mode: StreamMode;
  toolName?: string;
  partialJson?: string;
  toolCallId?: string;
  textContent?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface QueueDrainEvent { type: 'queue_drain'; messageCount: number; mergedText: string }
export interface MicrocompactEvent { type: 'microcompact'; cleared: number; tokensSaved: number }
export interface CompactionEvent {
  type: 'compaction';
  phase: 'start' | 'end';
  success?: boolean;
  preCompactTokens?: number;
  postCompactTokens?: number;
  compactionModel?: string;
}
export interface DoneEvent {
  type: 'done';
  answer: string;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  iterations: number;
  totalTime: number;
  tokenUsage?: TokenUsage;
  tokensPerSecond?: number;
}

export type AgentEvent =
  | ThinkingEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolEndEvent
  | ToolErrorEvent
  | ToolApprovalEvent
  | ToolDeniedEvent
  | ToolLimitEvent
  | ContextClearedEvent
  | QueueDrainEvent
  | MicrocompactEvent
  | CompactionEvent
  | MemoryRecalledEvent
  | MemoryFlushEvent
  | StreamProgressEvent
  | DoneEvent;

export interface DisplayEvent {
  id: string;
  event: AgentEvent;
  completed?: boolean;
  endEvent?: AgentEvent;
  progressMessage?: string;
}
