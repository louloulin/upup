import type { ApprovalDecision, StreamMode, TokenUsage, UpUpAgentEvent } from '@upup/pi-runtime';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { MessageQueue } from '@upup/utils';

export type { ApprovalDecision, StreamMode, TokenUsage, UpUpAgentEvent } from '@upup/pi-runtime';


export interface AgentConfig {
  model?: string;
  modelProvider?: string;
  maxIterations?: number;
  signal?: AbortSignal;
  requestToolApproval?: (request: { tool: string; args: Record<string, unknown> }) => Promise<ApprovalDecision>;
  sessionApprovedTools?: Set<string>;
  onToolApproval?: (tool: string) => void;
  messageQueue?: MessageQueue;
  modelInstance?: Model<any>;
  modelRuntime?: ModelRuntime;
  toolFilter?: string[] | '*';
}

export type UiEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; toolCallId?: string }
  | { type: 'tool_progress'; tool: string; message: string }
  | { type: 'tool_end'; tool: string; args: Record<string, unknown>; result: string; duration: number; toolCallId?: string }
  | { type: 'tool_error'; tool: string; error: string; toolCallId?: string }
  | { type: 'tool_approval'; tool: string; args: Record<string, unknown>; approved: ApprovalDecision }
  | { type: 'tool_denied'; tool: string; args: Record<string, unknown>; toolCallId?: string }
  | { type: 'tool_limit'; tool: string; warning?: string; blocked: boolean }
  | { type: 'context_cleared'; clearedCount: number; keptCount: number }
  | { type: 'memory_recalled'; filesLoaded: string[]; tokenCount: number }
  | { type: 'memory_flush'; phase: 'start' | 'end'; filesWritten?: string[] }
  | { type: 'stream_progress'; charDelta: number; mode: StreamMode; toolName?: string; partialJson?: string; toolCallId?: string; textContent?: string }
  | { type: 'queue_drain'; messageCount: number; mergedText: string }
  | { type: 'microcompact'; cleared: number; tokensSaved: number }
  | { type: 'compaction'; phase: 'start' | 'end'; success?: boolean; preCompactTokens?: number; postCompactTokens?: number; compactionModel?: string }
  | { type: 'done'; answer: string; toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>; iterations: number; totalTime: number; tokenUsage?: TokenUsage; tokensPerSecond?: number };

export type DoneEvent = Extract<UiEvent, { type: 'done' }>;

export interface DisplayEvent {
  id: string;
  event: UiEvent;
  completed?: boolean;
  endEvent?: UiEvent;
  progressMessage?: string;
}


export type WorkingState =
  | { status: 'idle' }
  | { status: 'thinking' }
  | { status: 'tool'; toolName: string }
  | { status: 'approval'; toolName: string };

export type HistoryItemStatus = 'processing' | 'complete' | 'error' | 'interrupted';

export interface HistoryItem {
  id: string;
  query: string;
  events: DisplayEvent[];
  answer: string;
  status: HistoryItemStatus;
  activeToolId?: string;
  startTime?: number;
  duration?: number;
  tokenUsage?: TokenUsage;
  tokensPerSecond?: number;
}
