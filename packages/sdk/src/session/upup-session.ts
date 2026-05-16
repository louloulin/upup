/**
 * @upup/sdk - 基于 upup 核心的 Session 实现
 *
 * 通过 stdio JSON-RPC 调用 upup SessionManager
 */

import type { SessionInfo, SessionMessage, SessionConfig } from './types.js';

// ============ Transport 接口 ============

export interface RpcTransport {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  send(message: object): Promise<void>;
}

// ============ 类型映射 ============

type UpupSessionState = 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';

interface UpupSerializedMessage {
  type: string;
  content: string;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

interface UpupSessionMetadata {
  turnCount: number;
  toolUseCount: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  tags?: string[];
}

// ============ UpupSessionManager 实现 ============

export interface UpupSessionManagerConfig extends SessionConfig {
  transport: RpcTransport;
}

export class UpupSessionManager {
  private transport: RpcTransport;
  private currentSession: SessionInfo | null = null;
  private messages: SessionMessage[] = [];
  private config: UpupSessionManagerConfig;

  constructor(config: UpupSessionManagerConfig) {
    this.transport = config.transport;
    this.config = config;
  }

  /**
   * 创建会话 (调用 upup SessionManager)
   */
  async create(config?: SessionConfig): Promise<SessionInfo> {
    const params = config || {};

    const result = await this.transport.request('session/create', {
      context: {
        projectSlug: (params.metadata?.projectSlug as string) || 'sdk',
        projectPath: (params.metadata?.projectPath as string) || process.cwd(),
      },
      id: params.id,
    }) as {
      id: string;
      state: UpupSessionState;
      createdAt: number;
    };

    this.currentSession = {
      id: result.id,
      status: this.mapUpupState(result.state),
      createdAt: new Date(result.createdAt),
      lastActiveAt: new Date(result.createdAt),
      messageCount: 0,
      metadata: params.metadata,
    };

    this.messages = [];
    return this.currentSession;
  }

  /**
   * 恢复会话 (调用 upup SessionManager)
   */
  async resume(sessionId: string): Promise<void> {
    const result = await this.transport.request('session/resume', {
      id: sessionId,
    }) as {
      id: string;
      state: UpupSessionState;
      messages: UpupSerializedMessage[];
      metadata: UpupSessionMetadata;
    };

    this.currentSession = {
      id: result.id,
      status: this.mapUpupState(result.state),
      createdAt: new Date(),
      lastActiveAt: new Date(),
      messageCount: result.messages.length,
      metadata: result.metadata,
    };

    this.messages = result.messages.map((msg) => ({
      role: this.mapMessageRole(msg.type),
      content: msg.content,
      timestamp: new Date(),
    }));
  }

  /**
   * 获取会话
   */
  async get(sessionId: string): Promise<SessionInfo | null> {
    const result = await this.transport.request('session/get', {
      id: sessionId,
    }) as {
      id: string;
      state: UpupSessionState;
      createdAt: number;
      lastActivity: number;
      metadata: UpupSessionMetadata;
    } | null;

    if (!result) return null;

    return {
      id: result.id,
      status: this.mapUpupState(result.state),
      createdAt: new Date(result.createdAt),
      lastActiveAt: new Date(result.lastActivity),
      messageCount: 0,
      metadata: result.metadata,
    };
  }

  /**
   * 通过 IPC 获取消息历史
   */
  async fetchMessages(sessionId: string): Promise<SessionMessage[]> {
    const result = await this.transport.request('session/messages', {
      id: sessionId,
    }) as { messages: UpupSerializedMessage[] };

    return result.messages.map((msg) => ({
      role: this.mapMessageRole(msg.type),
      content: msg.content,
      timestamp: new Date(),
    }));
  }

  /**
   * 更新会话状态
   */
  async updateState(state: 'running' | 'waiting' | 'completed'): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    await this.transport.request('session/update', {
      id: this.currentSession.id,
      state,
    });

    this.currentSession.status = this.mapUpupState(state);
  }

  /**
   * 添加消息
   */
  addMessage(message: SessionMessage): void {
    // 如果没有当前 session，先创建一个
    if (!this.currentSession) {
      this.currentSession = {
        id: `sdk-session-${Date.now()}`,
        status: 'active',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        messageCount: 0,
      };
    }

    this.messages.push(message);
    this.currentSession.messageCount++;
    this.currentSession.lastActiveAt = new Date();
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * 获取消息历史
   */
  getMessages(): SessionMessage[] {
    return [...this.messages];
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.currentSession?.id || null;
  }

  /**
   * 获取会话状态
   */
  getStatus(): SessionInfo['status'] | null {
    return this.currentSession?.status || null;
  }

  /**
   * 更新 token 使用量
   */
  updateTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
    if (this.currentSession) {
      this.currentSession.tokenUsage = usage;
    }
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
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    await this.transport.request('session/update', {
      id: this.currentSession.id,
      state: 'canceled',
    });

    this.currentSession.status = 'cancelled';
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
    if (this.currentSession) {
      try {
        await this.transport.request('session/end', {
          id: this.currentSession.id,
        });
      } catch {
        // 忽略错误
      }
    }

    this.currentSession = null;
    this.messages = [];
  }

  // ============ 辅助方法 ============

  private mapUpupState(state: UpupSessionState): SessionInfo['status'] {
    const stateMap: Record<UpupSessionState, SessionInfo['status']> = {
      idle: 'created',
      running: 'active',
      waiting: 'paused',
      completed: 'completed',
      error: 'failed',
      canceled: 'cancelled',
    };
    return stateMap[state] || 'created';
  }

  private mapMessageRole(type: string): SessionMessage['role'] {
    const roleMap: Record<string, SessionMessage['role']> = {
      human: 'user',
      ai: 'assistant',
      system: 'system',
    };
    return roleMap[type] || 'assistant';
  }
}
