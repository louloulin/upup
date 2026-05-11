/**
 * @upup/sdk - Type definitions
 * 对外 SDK 公共类型
 */

// ============ 核心类型 ============

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCallId?: string
  toolName?: string
  metadata?: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface RunParams {
  messages: Message[]
  model?: string
  maxTokens?: number
  systemPrompt?: string
  tools?: ToolDefinition[]
}

export interface RunResult {
  output: string
  messages: Message[]
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

// ============ 工具类型 ============

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler?: ToolHandler
  concurrency?: 'serial' | 'concurrent'
}

export interface ToolContext {
  toolCallId: string
  sessionId?: string
  userId?: string
  metadata?: Record<string, unknown>
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>

export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  default?: unknown
  enum?: unknown[]
}

// ============ Agent 配置 ============

export interface AgentConfig {
  model?: string
  maxTokens?: number
  maxIterations?: number
  systemPrompt?: string
  tools?: ToolDefinition[]
  hooks?: HookMap
}

export interface HookMap {
  [event: string]: HookHandler[]
}

// ============ Hooks 类型 ============

export type HookEvent =
  | 'pre_tool_use'
  | 'pre_tool_modify'
  | 'post_tool_use'
  | 'llm_output'
  | 'stop'
  | 'message_start'
  | 'message_end'
  | 'error'

export interface HookContext {
  event: HookEvent
  toolName?: string
  args?: Record<string, unknown>
  result?: ToolResult
  messages?: Message[]
  metadata?: Record<string, unknown>
}

export type HookResult =
  | { action: 'continue' }
  | { action: 'modify'; args: Record<string, unknown> }
  | { action: 'stop'; reason?: string }
  | { action: 'block'; reason: string }

export type HookHandler = (context: HookContext) => Promise<HookResult | void>

// ============ 流式事件 ============

export type StreamEventType =
  | 'thinking'
  | 'message_start'
  | 'content_delta'
  | 'message_delta'
  | 'message_complete'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'tool_call_complete'
  | 'tool_result'
  | 'error'
  | 'done'

export interface StreamEvent {
  type: StreamEventType
  data: unknown
}

// ============ 子代理 ============

export interface SubagentConfig {
  name: string
  instructions: string
  tools?: ToolDefinition[]
  model?: string
}

export interface HandoffResult {
  agent: string
  input: string
  output: unknown
}

// ============ 会话 ============

export interface SessionConfig {
  sessionId?: string
  persistence?: 'memory' | 'file' | 'database'
  storagePath?: string
}
