/**
 * @upup/sdk - 会话类型定义
 */

// ============ 会话状态 ============

/**
 * 会话状态
 */
export type SessionStatus =
  | 'created'     // 已创建
  | 'active'      // 活动中
  | 'paused'       // 已暂停
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'cancelled'   // 已取消

// ============ 会话信息 ============

/**
 * 会话信息
 */
export interface SessionInfo {
  /** 会话 ID */
  id: string
  /** 会话状态 */
  status: SessionStatus
  /** 创建时间 */
  createdAt: Date
  /** 最后活动时间 */
  lastActiveAt: Date
  /** 消息数量 */
  messageCount: number
  /** Token 使用量 */
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  /** 元数据 */
  metadata?: Record<string, unknown>
}

// ============ 会话配置 ============

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 会话 ID (可选，自动生成) */
  id?: string
  /** 继续的会话 ID */
  resumeFrom?: string
  /** 最大消息数 */
  maxMessages?: number
  /** 最大 Token 数 */
  maxTokens?: number
  /** 会话超时 (ms) */
  timeout?: number
  /** 元数据 */
  metadata?: Record<string, unknown>
}

// ============ 会话存储 ============

/**
 * 会话存储接口
 */
export interface SessionStore {
  /** 保存会话 */
  save(session: SessionInfo, messages: SessionMessage[]): Promise<void>
  /** 加载会话 */
  load(sessionId: string): Promise<{ session: SessionInfo; messages: SessionMessage[] } | null>
  /** 删除会话 */
  delete(sessionId: string): Promise<void>
  /** 列出所有会话 */
  list(): Promise<SessionInfo[]>
  /** 检查会话是否存在 */
  exists(sessionId: string): Promise<boolean>
}

// ============ 会话消息 ============

/**
 * 会话消息
 */
export interface SessionMessage {
  /** 角色 */
  role: 'user' | 'assistant' | 'system'
  /** 内容 */
  content: string
  /** 时间戳 */
  timestamp: Date
  /** Token 数 */
  tokens?: number
  /** 工具调用 (可选) */
  toolCalls?: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }>
  /** 工具结果 (可选) */
  toolResults?: Array<{
    toolCallId: string
    result: unknown
  }>
}

// ============ 会话事件 ============

/**
 * 会话事件类型
 */
export type SessionEvent =
  | 'start'
  | 'message'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'error'
  | 'timeout'

/**
 * 会话事件
 */
export interface SessionEventData {
  type: SessionEvent
  sessionId: string
  timestamp: Date
  data?: unknown
}
