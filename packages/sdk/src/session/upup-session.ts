/**
 * @upup/sdk - 基于 upup 核心的 Session 实现 (SDK v5)
 *
 * 策略: SDK 只做薄包装，不自己实现 Session 逻辑
 * 所有消息存储由 upup 核心 SessionManager 管理
 * 通过 IPC 调用获取消息历史
 */

import type { SessionInfo, SessionMessage, SessionConfig } from './types.js';

// ============ Transport 接口 ============

export interface RpcTransport {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  send(message: object): Promise<void>;
}

// ============ 类型映射 ============

type UpupSessionState = 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';

interface UpupSessionMetadata {
  turnCount: number;
  toolUseCount: number;
  tokenUsage?: { input: number; output: number };
  tags?: string[];
}

// ============ UpupSessionManager 实现 (SDK v5 简化版) ============

export interface UpupSessionManagerConfig extends SessionConfig {
  transport: RpcTransport;
}

/**
 * SDK v5 Session Manager - 完全基于 upup 核心
 *
 * 简化策略:
 * 1. SDK 只追踪 sessionId，不存储消息
 * 2. 所有消息操作通过 IPC 调用 upup SessionManager
 * 3. tokenUsage 从 done 事件同步
 */
export class UpupSessionManager {
  // 唯一状态: sessionId (所有消息由 upup 核心存储)
  private sessionId: string | null = null;
  private transport: RpcTransport;
  private tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  private config: UpupSessionManagerConfig;

  constructor(config: UpupSessionManagerConfig) {
    this.transport = config.transport;
    this.config = config;
  }

  /**
   * 创建会话 - 调用 upup IPC
   */
  async create(config?: SessionConfig): Promise<SessionInfo> {
    const params = config || {};

    const result = await this.transport.request('session/create', {
      context: {
        projectSlug: (params.metadata?.projectSlug as string) || 'sdk',
        projectPath: (params.metadata?.projectPath as string) || process.cwd(),
      },
      id: params.id,
    }) as { id: string; state: UpupSessionState; createdAt: number };

    this.sessionId = result.id;

    return {
      id: result.id,
      status: this.mapState(result.state),
      createdAt: new Date(result.createdAt),
      lastActiveAt: new Date(result.createdAt),
      messageCount: 0,
      metadata: params.metadata,
    };
  }

  /**
   * 恢复会话 - 调用 upup IPC
   */
  async resume(sessionId: string): Promise<void> {
    const result = await this.transport.request('session/resume', {
      id: sessionId,
    }) as { id: string; state: UpupSessionState; metadata: UpupSessionMetadata };

    this.sessionId = result.id;
  }

  /**
   * 获取会话信息 - 调用 upup IPC
   */
  async get(): Promise<SessionInfo | null> {
    if (!this.sessionId) return null;

    const result = await this.transport.request('session/get', {
      id: this.sessionId,
    }) as { id: string; state: UpupSessionState; createdAt: number; lastActivity: number; metadata: UpupSessionMetadata } | null;

    if (!result) return null;

    return {
      id: result.id,
      status: this.mapState(result.state),
      createdAt: new Date(result.createdAt),
      lastActiveAt: new Date(result.lastActivity),
      messageCount: 0,
      metadata: result.metadata,
    };
  }

  /**
   * 获取消息历史 - 调用 upup IPC
   * SDK 不维护自己的 messages[]，直接从 upup 获取
   */
  async getMessages(): Promise<SessionMessage[]> {
    if (!this.sessionId) return [];

    const result = await this.transport.request('session/messages', {
      id: this.sessionId,
    }) as { messages: Array<{ type: string; content: string }> };

    return result.messages.map((msg) => ({
      role: this.mapRole(msg.type),
      content: msg.content,
      timestamp: new Date(),
    }));
  }

  /**
   * 更新会话状态 - 调用 upup IPC
   */
  async updateState(state: 'running' | 'waiting' | 'completed'): Promise<void> {
    if (!this.sessionId) return;

    await this.transport.request('session/update', {
      id: this.sessionId,
      state,
    });
  }

  /**
   * 添加消息 - SDK v5: 不再本地存储，消息由 upup 核心存储
   * 此方法保留用于向后兼容，但不实际存储
   */
  addMessage(_message: SessionMessage): void {
    // SDK v5: 消息由 upup 核心存储，SDK 不再维护本地副本
    // 保留此方法用于向后兼容
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): SessionInfo | null {
    if (!this.sessionId) return null;

    return {
      id: this.sessionId,
      status: 'active',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      messageCount: 0,
      tokenUsage: this.tokenUsage,
    };
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 获取会话状态
   */
  getStatus(): SessionInfo['status'] | null {
    return this.sessionId ? 'active' : null;
  }

  /**
   * 更新 token 使用量 - 从 done 事件同步
   */
  updateTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
    this.tokenUsage = usage;
  }

  /**
   * 暂停会话
   */
  async pause(): Promise<void> {
    await this.updateState('waiting');
  }

  /**
   * 继续会话
   */
  async continue(sessionId: string): Promise<void> {
    await this.resume(sessionId);
  }

  /**
   * 完成会话
   */
  async complete(): Promise<void> {
    await this.updateState('completed');
  }

  /**
   * 取消会话
   */
  async cancel(): Promise<void> {
    if (!this.sessionId) return;

    await this.transport.request('session/update', {
      id: this.sessionId,
      state: 'canceled',
    });
  }

  /**
   * 保存会话
   */
  async save(): Promise<void> {
    // Session 已通过 IPC 持久化，无需额外操作
  }

  /**
   * 关闭会话
   */
  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        await this.transport.request('session/end', {
          id: this.sessionId,
        });
      } catch {
        // 忽略错误
      }
    }

    this.sessionId = null;
    this.tokenUsage = undefined;
  }

  // ============ 辅助方法 ============

  private mapState(state: string): SessionInfo['status'] {
    const map: Record<string, SessionInfo['status']> = {
      idle: 'created', running: 'active', waiting: 'paused',
      completed: 'completed', error: 'failed', canceled: 'cancelled',
    };
    return map[state] || 'created';
  }

  private mapRole(type: string): SessionMessage['role'] {
    const map: Record<string, SessionMessage['role']> = {
      human: 'user', ai: 'assistant', system: 'system',
    };
    return map[type] || 'assistant';
  }
}
