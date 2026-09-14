/**
 * UpUp Stdio Protocol - JSON-RPC Types
 *
 * Defines the JSON-RPC 2.0 protocol for stdio communication between
 * external clients and the UpUp Pi runtime server.
 */

// ============ JSON-RPC Base Types ============

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ============ Error Codes ============

export const JsonRpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerError: -32000, // Generic server error
} as const;

// ============ Method Names ============

export const JsonRpcMethod = {
  // Lifecycle
  Initialize: 'initialize',
  Shutdown: 'shutdown',

  // Agent operations
  Run: 'run',
  Stream: 'stream',
  Cancel: 'cancel',

  // Session operations (SDK v4)
  SessionCreate: 'session/create',
  SessionResume: 'session/resume',
  SessionGet: 'session/get',
  SessionMessages: 'session/messages',
  SessionUpdate: 'session/update',
  SessionEnd: 'session/end',
  SessionCompact: 'session/compact',
  SessionFork: 'session/fork',
  SessionExport: 'session/export',

  // Events (server -> client notifications)
  Event: 'event',
  StreamDone: 'stream_done',
  Error: 'error',
} as const;

// ============ Server -> Client Events ============

export type ServerEventType =
  | 'thinking'
  | 'tool_start'
  | 'tool_progress'
  | 'tool_end'
  | 'tool_error'
  | 'tool_limit'
  | 'tool_approval'
  | 'tool_denied'
  | 'context_cleared'
  | 'memory_recalled'
  | 'memory_flush'
  | 'queue_drain'
  | 'microcompact'
  | 'compaction'
  | 'stream_progress'
  | 'done';

export interface ServerEvent {
  type: ServerEventType;
  [key: string]: unknown;
}

// Event payload wrapper
export interface EventParams {
  event: ServerEvent;
}

export interface StreamDoneParams {
  done: boolean;
  runId?: string;
}

// ============ Request/Response Types ============

export interface InitializeParams {
  clientName: string;
  clientVersion: string;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
  };
}

export interface InitializeResult {
  serverVersion: string;
  serverName: string;
  capabilities: {
    streaming: boolean;
    tools: boolean;
  };
  protocolVersion: string;
}

export interface RunParams {
  prompt: string;
  model?: string;
  maxIterations?: number;
  sessionId?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface RunResult {
  output: string;
  iterations: number;
  totalTimeMs: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface StreamParams extends RunParams {
  // Same as RunParams, streaming is indicated by the method name
}

export interface CancelParams {
  runId: string;
}

export interface CancelResult {
  cancelled: boolean;
}

// ============ Session Types (SDK v4) ============

export interface SessionContext {
  projectSlug: string;
  projectPath: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];
  userId?: string;
}

export interface SessionCreateParams {
  context?: SessionContext;
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionCreateResult {
  id: string;
  state: 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';
  createdAt: number;
}

export interface SessionResumeParams {
  id: string;
}

export interface SerializedMessage {
  type: string;
  content: string;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

export interface SessionMetadata {
  turnCount: number;
  toolUseCount: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  tags?: string[];
}

export interface SessionResumeResult {
  id: string;
  state: 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';
  messages: SerializedMessage[];
  metadata: SessionMetadata;
}

export interface SessionGetParams {
  id: string;
}

export interface SessionGetResult {
  id: string;
  state: 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';
  createdAt: number;
  lastActivity: number;
  metadata: SessionMetadata;
}

export interface SessionMessagesParams {
  id: string;
}

export interface SessionMessagesResult {
  messages: SerializedMessage[];
}

export interface SessionUpdateParams {
  id: string;
  state?: 'running' | 'waiting' | 'completed';
  metadata?: Record<string, unknown>;
}

export interface SessionUpdateResult {
  success: boolean;
}

export interface SessionEndParams {
  id: string;
}

export interface SessionEndResult {
  success: boolean;
}

export interface SessionCompactParams {
  id: string;
  instructions?: string;
}

export interface SessionForkParams {
  id: string;
  entryId?: string;
}

export interface SessionExportParams {
  id: string;
  format?: 'jsonl' | 'html';
  outputPath?: string;
}

// ============ Event Type Mapping ============

// Maps ServerEventType to the raw event data structure
export type EventDataMap = {
  thinking: { message: string };
  tool_start: { tool: string; args: Record<string, unknown>; toolCallId?: string };
  tool_progress: { tool: string; message: string };
  tool_end: { tool: string; args: Record<string, unknown>; result: string; duration: number; toolCallId?: string };
  tool_error: { tool: string; error: string; toolCallId?: string };
  tool_limit: { tool: string; warning?: string; blocked: boolean };
  tool_approval: { tool: string; args: Record<string, unknown>; approved: 'allow-once' | 'allow-session' | 'deny' };
  tool_denied: { tool: string; args: Record<string, unknown>; toolCallId?: string };
  context_cleared: { clearedCount: number; keptCount: number };
  memory_recalled: { filesLoaded: string[]; tokenCount: number };
  memory_flush: { phase: 'start' | 'end'; filesWritten?: string[] };
  queue_drain: { messageCount: number; mergedText: string };
  microcompact: { cleared: number; tokensSaved: number };
  compaction: {
    phase: 'start' | 'end';
    success?: boolean;
    preCompactTokens?: number;
    postCompactTokens?: number;
    compactionModel?: string;
  };
  stream_progress: {
    charDelta: number;
    mode: 'requesting' | 'thinking' | 'responding' | 'tool-input' | 'tool-use';
    toolName?: string;
    partialJson?: string;
    toolCallId?: string;
  };
  done: {
    answer: string;
    toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
    iterations: number;
    totalTime: number;
    tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
    tokensPerSecond?: number;
  };
};
