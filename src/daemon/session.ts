/**
 * Session Manager - Loucode-style agent session management
 *
 * Features:
 * - Session creation with abort controller
 * - Session serialization for persistence
 * - Session resume capability
 * - State tracking (idle/running/waiting/completed/error/canceled)
 * - KV store integration
 *
 * Reference: Loucode's src/daemon/session/AgentSession.ts
 */

import { info, warn, error } from '../utils/logging/logger.js';
import type { BaseMessage } from '@langchain/core/messages';

// ============================================================================
// Types
// ============================================================================

/**
 * Session state
 */
export type SessionState =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'error'
  | 'canceled';

/**
 * Session context
 */
export interface SessionContext {
  projectSlug: string;
  projectPath: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[];
  userId?: string;
}

/**
 * Agent session interface
 */
export interface AgentSession {
  id: string;
  state: SessionState;
  createdAt: number;
  lastActivity: number;
  messages: SerializedMessage[];
  context: SessionContext;
  metadata: SessionMetadata;
  abortReason?: string;
}

/**
 * Serialized message for persistence
 */
export interface SerializedMessage {
  type: string;
  content: string;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  turnCount: number;
  toolUseCount: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  tags?: string[];
}

/**
 * Create session params
 */
export interface CreateSessionParams {
  id?: string;
  context: SessionContext;
  messages?: SerializedMessage[];
  metadata?: Partial<SessionMetadata>;
}

/**
 * Serialized session for storage
 */
export interface SerializedSession {
  id: string;
  state: SessionState;
  createdAt: number;
  lastActivity: number;
  messages: SerializedMessage[];
  context: SessionContext;
  metadata: SessionMetadata;
  abortReason?: string;
}

// ============================================================================
// KV Store Interface
// ============================================================================

/**
 * KV Store interface for persistence
 */
export interface KVStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  keys(prefix?: string): Promise<string[]>;
}

// ============================================================================
// Memory KV Store (in-memory implementation)
// ============================================================================

/**
 * In-memory KV store (for development/testing)
 */
export class MemoryKVStore implements KVStore {
  private store: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    if (prefix) {
      return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
    }
    return Array.from(this.store.keys());
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager {
  private sessions: Map<string, AgentSession> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private kv: KVStore;
  private eventHandlers: Map<string, Set<(session: AgentSession, event: string) => void>> = new Map();
  private sessionTimeout: number;  // ms, 30 min default
  private cleanupTimer?: NodeJS.Timeout;

  constructor(kv?: KVStore, sessionTimeout = 30 * 60 * 1000) {
    this.kv = kv || new MemoryKVStore();
    this.sessionTimeout = sessionTimeout;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start session manager
   */
  async start(): Promise<void> {
    // Load existing sessions from KV
    await this.loadFromKV();

    // Start cleanup timer
    this.startCleanupTimer();

    info('daemon', `Session Manager started (${this.sessions.size} sessions loaded)`);
  }

  /**
   * Stop session manager
   */
  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Abort all running sessions
    for (const [id, controller] of this.abortControllers) {
      if (!controller.signal.aborted) {
        controller.abort('Session manager stopping');
        const session = this.sessions.get(id);
        if (session) {
          session.state = 'canceled';
          session.abortReason = 'Session manager stopping';
        }
      }
    }

    // Save all sessions
    await this.saveToKV();

    info('daemon', 'Session Manager stopped');
  }

  // -------------------------------------------------------------------------
  // Session CRUD
  // -------------------------------------------------------------------------

  /**
   * Create a new session
   */
  async create(params: CreateSessionParams): Promise<AgentSession> {
    const id = params.id || this.generateId();
    const now = Date.now();

    const session: AgentSession = {
      id,
      state: 'idle',
      createdAt: now,
      lastActivity: now,
      messages: params.messages || [],
      context: params.context,
      metadata: {
        turnCount: 0,
        toolUseCount: 0,
        ...params.metadata,
      },
    };

    const controller = new AbortController();
    controller.signal.addEventListener('abort', () => {
      this.handleAbort(id, controller.signal.reason);
    });

    this.sessions.set(id, session);
    this.abortControllers.set(id, controller);
    await this.kv.set(`session:${id}`, this.serializeSession(session));

    this.emit(id, 'created');
    info('daemon', `Session created: ${id}`);

    return session;
  }

  /**
   * Get session by ID
   */
  get(id: string): AgentSession | null {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session || null;
  }

  /**
   * Get abort controller for session
   */
  getAbortController(id: string): AbortController | undefined {
    return this.abortControllers.get(id);
  }

  /**
   * Update session
   */
  async update(id: string, updates: Partial<AgentSession>): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    Object.assign(session, updates, { lastActivity: Date.now() });
    await this.kv.set(`session:${id}`, this.serializeSession(session));
  }

  /**
   * Delete session
   */
  async delete(id: string): Promise<void> {
    const controller = this.abortControllers.get(id);
    if (controller && !controller.signal.aborted) {
      controller.abort('Session deleted');
    }

    this.abortControllers.delete(id);
    this.sessions.delete(id);
    await this.kv.delete(`session:${id}`);

    this.emit(id, 'deleted');
    info('daemon', `Session deleted: ${id}`);
  }

  /**
   * List all sessions
   */
  list(filter?: {
    state?: SessionState;
    projectSlug?: string;
    olderThan?: number;
  }): AgentSession[] {
    let sessions = Array.from(this.sessions.values());

    if (filter?.state) {
      sessions = sessions.filter(s => s.state === filter.state);
    }
    if (filter?.projectSlug) {
      sessions = sessions.filter(s => s.context.projectSlug === filter.projectSlug);
    }
    if (filter?.olderThan) {
      const cutoff = Date.now() - filter.olderThan;
      sessions = sessions.filter(s => s.lastActivity < cutoff);
    }

    return sessions;
  }

  // -------------------------------------------------------------------------
  // Session State
  // -------------------------------------------------------------------------

  /**
   * Start session
   */
  async start(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    session.state = 'running';
    session.lastActivity = Date.now();
    await this.kv.set(`session:${id}`, this.serializeSession(session));

    this.emit(id, 'started');
    info('daemon', `Session started: ${id}`);
  }

  /**
   * Pause session (waiting for user input)
   */
  async pause(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    session.state = 'waiting';
    session.lastActivity = Date.now();
    await this.kv.set(`session:${id}`, this.serializeSession(session));

    this.emit(id, 'paused');
  }

  /**
   * Complete session
   */
  async complete(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    session.state = 'completed';
    session.lastActivity = Date.now();
    await this.kv.set(`session:${id}`, this.serializeSession(session));

    this.emit(id, 'completed');
    info('daemon', `Session completed: ${id}`);
  }

  /**
   * Error session
   */
  async error(id: string, errorMessage: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    session.state = 'error';
    session.abortReason = errorMessage;
    session.lastActivity = Date.now();
    await this.kv.set(`session:${id}`, this.serializeSession(session));

    this.emit(id, 'error');
    warn('daemon', `Session error: ${id} - ${errorMessage}`);
  }

  /**
   * Cancel session
   */
  async cancel(id: string, reason?: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    const controller = this.abortControllers.get(id);
    if (controller && !controller.signal.aborted) {
      controller.abort(reason || 'Session canceled');
    }

    session.state = 'canceled';
    session.abortReason = reason;
    session.lastActivity = Date.now();
    await this.kv.set(`session:${id}`, this.serializeSession(session));

    this.emit(id, 'canceled');
    info('daemon', `Session canceled: ${id}`);
  }

  // -------------------------------------------------------------------------
  // Abort Handling
  // -------------------------------------------------------------------------

  /**
   * Handle abort signal
   */
  private handleAbort(id: string, reason?: string): void {
    const session = this.sessions.get(id);
    if (session && session.state === 'running') {
      session.state = 'canceled';
      session.abortReason = reason;
      this.emit(id, 'aborted');
    }
  }

  /**
   * Check if session is aborted
   */
  isAborted(id: string): boolean {
    const controller = this.abortControllers.get(id);
    return controller?.signal.aborted ?? true;
  }

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  /**
   * Serialize session for storage
   */
  private serializeSession(session: AgentSession): SerializedSession {
    return {
      id: session.id,
      state: session.state,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      messages: session.messages,
      context: session.context,
      metadata: session.metadata,
      abortReason: session.abortReason,
    };
  }

  /**
   * Deserialize session from storage
   */
  private deserializeSession(data: SerializedSession): AgentSession {
    const controller = new AbortController();
    controller.signal.addEventListener('abort', () => {
      this.handleAbort(data.id, controller.signal.reason);
    });

    this.abortControllers.set(data.id, controller);

    return {
      ...data,
      abortReason: data.abortReason,
    };
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Load sessions from KV store
   */
  private async loadFromKV(): Promise<void> {
    try {
      const keys = await this.kv.keys('session:');
      for (const key of keys) {
        const data = await this.kv.get<SerializedSession>(key);
        if (data) {
          const session = this.deserializeSession(data);
          this.sessions.set(session.id, session);
        }
      }
    } catch (err) {
      warn('daemon', `Failed to load sessions from KV: ${err}`);
    }
  }

  /**
   * Save all sessions to KV store
   */
  private async saveToKV(): Promise<void> {
    try {
      for (const session of this.sessions.values()) {
        await this.kv.set(`session:${session.id}`, this.serializeSession(session));
      }
    } catch (err) {
      error('daemon', `Failed to save sessions to KV: ${err}`);
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const cutoff = Date.now() - this.sessionTimeout;
    const expired = Array.from(this.sessions.values())
      .filter(s => s.lastActivity < cutoff && s.state !== 'running');

    for (const session of expired) {
      await this.delete(session.id);
    }

    if (expired.length > 0) {
      info('daemon', `Cleaned up ${expired.length} expired sessions`);
    }
  }

  // -------------------------------------------------------------------------
  // Resume
  // -------------------------------------------------------------------------

  /**
   * Resume session (from storage)
   */
  async resume(id: string): Promise<AgentSession> {
    // Check if already loaded
    let session = this.sessions.get(id);
    if (session) {
      // Reset state
      session.state = 'idle';
      session.lastActivity = Date.now();
      return session;
    }

    // Load from KV
    const data = await this.kv.get<SerializedSession>(`session:${id}`);
    if (!data) {
      throw new Error(`Session not found: ${id}`);
    }

    session = this.deserializeSession(data);
    session.state = 'idle';
    session.lastActivity = Date.now();
    this.sessions.set(id, session);

    info('daemon', `Session resumed: ${id}`);
    return session;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /**
   * Subscribe to session events
   */
  on(sessionId: string, event: string, handler: (session: AgentSession) => void): () => void {
    const key = `${sessionId}:${event}`;
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set());
    }
    this.eventHandlers.get(key)!.add(handler as (session: AgentSession, event: string) => void);

    return () => {
      this.eventHandlers.get(key)?.delete(handler as (session: AgentSession, event: string) => void);
    };
  }

  /**
   * Emit session event
   */
  private emit(sessionId: string, event: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const key = `${sessionId}:${event}`;
    const handlers = this.eventHandlers.get(key);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(session, event);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  /**
   * Get session stats
   */
  getStats(): {
    total: number;
    byState: Record<SessionState, number>;
    oldestActive?: number;
    totalTurns: number;
    totalToolUses: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const byState: Record<SessionState, number> = {
      idle: 0,
      running: 0,
      waiting: 0,
      completed: 0,
      error: 0,
      canceled: 0,
    };

    for (const session of sessions) {
      byState[session.state]++;
    }

    const running = sessions.filter(s => s.state === 'running');
    const oldestActive = running.length > 0
      ? Math.min(...running.map(s => s.createdAt))
      : undefined;

    return {
      total: sessions.length,
      byState,
      oldestActive,
      totalTurns: sessions.reduce((sum, s) => sum + s.metadata.turnCount, 0),
      totalToolUses: sessions.reduce((sum, s) => sum + s.metadata.toolUseCount, 0),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate session ID
   */
  private generateId(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serialize a LangChain message to storable format
 */
export function serializeMessage(message: BaseMessage): SerializedMessage {
  return {
    type: message._getType(),
    content: typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content),
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
  };
}

/**
 * Deserialize a message from storage
 */
export function deserializeMessage(data: SerializedMessage): BaseMessage {
  // This would need to return the correct LangChain message type
  // For now, return a generic structure
  return {
    _getType: () => data.type,
    content: data.content,
    additional_kwargs: data.additional_kwargs || {},
    response_metadata: data.response_metadata || {},
  } as unknown as BaseMessage;
}

// ============================================================================
// Singleton
// ============================================================================

let sessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}

export function resetSessionManager(): void {
  if (sessionManager) {
    sessionManager.stop();
    sessionManager = null;
  }
}
