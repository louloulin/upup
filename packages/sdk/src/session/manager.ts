/**
 * @upup/sdk - 会话管理器
 *
 * 管理会话的创建、继续和恢复
 * 支持 Stream + Session 一体架构
 */

import { randomUUID } from 'crypto'
import type {
  SessionInfo,
  SessionConfig,
  SessionStore,
  SessionMessage,
  SessionStatus,
  SessionEvent,
  SessionEventData,
} from './types.js'
import type { HookExecutor, HookInput } from '../hooks/types.js'

/**
 * 会话管理器
 *
 * @example
 * ```typescript
 * const manager = new SessionManager()
 *
 * // 创建新会话
 * const session = await manager.create({ maxMessages: 100 })
 *
 * // 继续会话
 * await manager.continue(session.id)
 *
 * // 保存会话
 * await manager.save()
 *
 * // 恢复会话
 * const resumed = await manager.resume(session.id)
 * ```
 */
export class SessionManager {
  private currentSession: SessionInfo | null = null
  private messages: SessionMessage[] = []
  private store?: SessionStore
  private eventHandlers: Map<SessionEvent, Set<(event: SessionEventData) => void>> = new Map()
  private config: SessionConfig
  // Stream + Session 一体架构
  private hookExecutor?: HookExecutor
  private autoSync: boolean = true

  constructor(config: SessionConfig = {}, store?: SessionStore) {
    this.config = config
    this.store = store
    this.autoSync = config.autoSync ?? true
  }

  /**
   * 绑定 HookExecutor 并注册内置同步 Hook
   * 用于 Stream + Session 一体架构
   */
  bindHookExecutor(executor: HookExecutor): void {
    this.hookExecutor = executor

    // 注册内置 StreamMessage Hook - 自动同步消息
    executor.register('StreamMessage', {
      hooks: [async (input: HookInput) => {
        if (this.autoSync) {
          await this._syncFromStream(input)
        }
        return { continue: true }
      }]
    })

    // 注册内置 StreamEnd Hook - 更新 token 使用量
    executor.register('StreamEnd', {
      hooks: [async (input: HookInput) => {
        if (input.token_usage) {
          this.updateTokenUsage(input.token_usage)
        }
        return { continue: true }
      }]
    })
  }

  /**
   * 从 Stream 消息同步到 Session
   * 内部方法，由 StreamMessage Hook 调用
   */
  private async _syncFromStream(input: HookInput): Promise<void> {
    const msg = input.stream_message
    if (!msg || !this.currentSession) return

    const { type, event } = msg as { type: string; event?: Record<string, unknown> }

    let sessionMsg: SessionMessage | null = null

    if (event?.type === 'stream_progress') {
      sessionMsg = {
        role: 'assistant',
        content: (event.content as string) || '',
        timestamp: new Date(),
        metadata: { subType: 'stream_progress' }
      }
    } else if (event?.type === 'tool_use') {
      sessionMsg = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [{
          id: (event.tool_use_id as string) || `tool-${Date.now()}`,
          name: event.tool_name as string,
          input: (event.tool_input as Record<string, unknown>) || {}
        }],
        metadata: { subType: 'tool_use' }
      }
    } else if (event?.type === 'tool_result') {
      sessionMsg = {
        role: 'system',
        content: '',
        timestamp: new Date(),
        toolResults: [{
          toolCallId: event.tool_use_id as string,
          result: event.result
        }],
        metadata: { subType: 'tool_result' }
      }
    } else if (event?.type === 'done') {
      // done 事件更新 token 使用量
      if (event.tokenUsage) {
        this.updateTokenUsage(event.tokenUsage as { inputTokens: number; outputTokens: number; totalTokens: number })
      }
      return // done 不记录为消息
    }

    if (sessionMsg) {
      this.addMessage(sessionMsg)
    }
  }

  /**
   * 设置自动同步模式
   */
  setAutoSync(enabled: boolean): void {
    this.autoSync = enabled
  }

  /**
   * 检查是否启用自动同步
   */
  isAutoSyncEnabled(): boolean {
    return this.autoSync
  }

  /**
   * 创建新会话
   */
  async create(config?: SessionConfig): Promise<SessionInfo> {
    const sessionConfig = { ...this.config, ...config }

    this.currentSession = {
      id: sessionConfig.id || randomUUID(),
      status: 'created',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      messageCount: 0,
      metadata: sessionConfig.metadata,
    }

    this.messages = []

    // 如果需要继续之前的会话
    if (sessionConfig.resumeFrom) {
      await this.resume(sessionConfig.resumeFrom)
    }

    this.emit('start', { sessionId: this.currentSession.id })

    return this.currentSession
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.currentSession?.id || null
  }

  /**
   * 获取会话状态
   */
  getStatus(): SessionStatus | null {
    return this.currentSession?.status || null
  }

  /**
   * 添加消息
   */
  addMessage(message: SessionMessage): void {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    this.messages.push(message)
    this.currentSession.messageCount++
    this.currentSession.lastActiveAt = new Date()

    this.emit('message', {
      sessionId: this.currentSession.id,
      data: message,
    })
  }

  /**
   * 获取消息历史
   */
  getMessages(): SessionMessage[] {
    return [...this.messages]
  }

  /**
   * 更新 Token 使用量
   */
  updateTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
    if (this.currentSession) {
      this.currentSession.tokenUsage = usage
    }
  }

  /**
   * 暂停会话
   */
  async pause(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    this.currentSession.status = 'paused'
    this.currentSession.lastActiveAt = new Date()

    // 保存到存储
    if (this.store) {
      await this.store.save(this.currentSession, this.messages)
    }

    this.emit('pause', { sessionId: this.currentSession.id })
  }

  /**
   * 继续会话
   */
  async continue(sessionId: string): Promise<void> {
    const session = await this.load(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    this.currentSession = session.session
    this.messages = session.messages
    this.currentSession.status = 'active'
    this.currentSession.lastActiveAt = new Date()

    this.emit('resume', { sessionId: this.currentSession.id })
  }

  /**
   * 完成会话
   */
  async complete(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    this.currentSession.status = 'completed'
    this.currentSession.lastActiveAt = new Date()

    // 保存到存储
    if (this.store) {
      await this.store.save(this.currentSession, this.messages)
    }

    this.emit('complete', { sessionId: this.currentSession.id })
  }

  /**
   * 取消会话
   */
  async cancel(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    this.currentSession.status = 'cancelled'
    this.currentSession.lastActiveAt = new Date()

    this.emit('error', {
      sessionId: this.currentSession.id,
      data: 'Session cancelled',
    })
  }

  /**
   * 保存会话
   */
  async save(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    this.currentSession.lastActiveAt = new Date()

    if (this.store) {
      await this.store.save(this.currentSession, this.messages)
    }
  }

  /**
   * 加载会话
   */
  async load(sessionId: string): Promise<{ session: SessionInfo; messages: SessionMessage[] } | null> {
    if (this.store) {
      return this.store.load(sessionId)
    }
    return null
  }

  /**
   * 删除会话
   */
  async delete(sessionId: string): Promise<void> {
    if (this.store) {
      await this.store.delete(sessionId)
    }
  }

  /**
   * 列出所有会话
   */
  async list(): Promise<SessionInfo[]> {
    if (this.store) {
      return this.store.list()
    }
    return []
  }

  /**
   * 检查会话是否存在
   */
  async exists(sessionId: string): Promise<boolean> {
    if (this.store) {
      return this.store.exists(sessionId)
    }
    return false
  }

  /**
   * 注册事件处理器
   */
  on(event: SessionEvent, handler: (event: SessionEventData) => void): void {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler)
  }

  /**
   * 移除事件处理器
   */
  off(event: SessionEvent, handler: (event: SessionEventData) => void): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  /**
   * 触发事件
   */
  private emit(event: SessionEvent, data: { sessionId: string; data?: unknown }): void {
    const eventData: SessionEventData = {
      type: event,
      sessionId: data.sessionId,
      timestamp: new Date(),
      data: data.data,
    }

    const handlers = this.eventHandlers.get(event)
    handlers?.forEach((handler) => {
      try {
        handler(eventData)
      } catch (error) {
        console.error('Session event handler error:', error)
      }
    })
  }

  /**
   * 关闭会话管理器
   */
  async close(): Promise<void> {
    if (this.currentSession && this.currentSession.status === 'active') {
      await this.save()
    }
    this.eventHandlers.clear()
    this.currentSession = null
    this.messages = []
  }
}
