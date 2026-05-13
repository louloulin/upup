/**
 * Session Persistence Module
 *
 * Handles session storage for conversation history, tool usage,
 * permission denials, and other session-scoped data.
 *
 * Features:
 * - Full transcript persistence with message history
 * - Session resume functionality (--resume flag)
 * - Message deduplication and compression
 * - Tool approval/denial tracking
 *
 * Reference: Claude Code's sessionStorage pattern
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { upupPath, ensureDir } from '../utils/paths.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Session metadata
 */
export interface SessionMetadata {
  id: string;
  createdAt: string;
  updatedAt: string;
  queryCount: number;
  totalIterations: number;
  totalTokens: number;
  model?: string;
  channel?: string;
  /** Whether this session was resumed from a previous one */
  resumed?: boolean;
  /** Parent session ID if this was resumed */
  resumedFrom?: string;
}

/**
 * Transcript message types
 */
export type TranscriptRole = 'user' | 'assistant' | 'system' | 'tool' | 'result';

/**
 * Transcript message
 */
export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  content: string;
  timestamp: string;
  /** Tool name if role is 'tool' */
  toolName?: string;
  /** Tool result if role is 'tool' */
  toolResult?: string;
  /** Whether this message was compressed */
  compressed?: boolean;
}

/**
 * Session data
 */
export interface SessionData {
  metadata: SessionMetadata;
  approvedTools: string[];
  deniedTools: string[];
  toolCallCounts: Record<string, number>;
  lastQuery?: string;
  /** Full message transcript */
  transcript?: TranscriptMessage[];
  /** Transcript stats */
  transcriptStats?: {
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    toolMessageCount: number;
  };
}

// ============================================================================
// Session Manager
// ============================================================================

const SESSION_DIR = 'sessions';

/**
 * Session Manager for persisting session data across CLI invocations.
 *
 * Features:
 * - Session metadata (creation time, token counts, tool usage)
 * - Approved/denied tool tracking (session-scoped permissions)
 * - Session listing and cleanup
 */
export class SessionManager {
  private readonly sessionDir: string;
  private sessionData: SessionData | null = null;
  private currentSessionId: string | null = null;

  constructor() {
    this.sessionDir = join(upupPath('data'), SESSION_DIR);
    ensureDir(this.sessionDir);
  }

  /**
   * Create or resume a session.
   */
  async startSession(metadata?: Partial<SessionMetadata>): Promise<string> {
    // Resume the most recent session instead of always creating a new one.
    // This preserves approved tools across restarts.
    const recent = await this.getMostRecentSession();
    if (recent && !metadata?.model) {
      this.currentSessionId = recent.metadata.id;
      this.sessionData = recent;
      this.sessionData.metadata.queryCount++;
      this.sessionData.metadata.updatedAt = new Date().toISOString();
      if (metadata?.model) this.sessionData.metadata.model = metadata.model;
      if (metadata?.channel) this.sessionData.metadata.channel = metadata.channel;
      await this.saveSession();
      return this.currentSessionId;
    }

    // No recent session — create a new one
    const sessionId = this.createSessionId();
    this.currentSessionId = sessionId;
    this.sessionData = {
      metadata: {
        id: sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queryCount: 1,
        totalIterations: 0,
        totalTokens: 0,
        model: metadata?.model,
        channel: metadata?.channel,
      },
      approvedTools: [],
      deniedTools: [],
      toolCallCounts: {},
    };
    await this.saveSession();
    return sessionId;
  }

  /**
   * Get current session data.
   */
  getSession(): SessionData | null {
    return this.sessionData ? { ...this.sessionData } : null;
  }

  /**
   * Get the current session ID.
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Approve a tool for the session.
   */
  approveTool(toolName: string): void {
    if (!this.sessionData) return;
    if (!this.sessionData.approvedTools.includes(toolName)) {
      this.sessionData.approvedTools.push(toolName);
    }
    // Remove from denied if it was there
    this.sessionData.deniedTools = this.sessionData.deniedTools.filter(t => t !== toolName);
    this.scheduleSave();
  }

  /** Approve a tool and flush to disk immediately (bypasses debounce). */
  approveToolSync(toolName: string): void {
    if (!this.sessionData) return;
    if (!this.sessionData.approvedTools.includes(toolName)) {
      this.sessionData.approvedTools.push(toolName);
    }
    this.sessionData.deniedTools = this.sessionData.deniedTools.filter(t => t !== toolName);
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saveSession().catch(() => {/* ignore */});
  }

  /**
   * Deny a tool for the session.
   */
  denyTool(toolName: string): void {
    if (!this.sessionData) return;
    if (!this.sessionData.deniedTools.includes(toolName)) {
      this.sessionData.deniedTools.push(toolName);
    }
    // Remove from approved if it was there
    this.sessionData.approvedTools = this.sessionData.approvedTools.filter(t => t !== toolName);
    this.scheduleSave();
  }

  /**
   * Check if a tool is approved for this session.
   */
  isToolApproved(toolName: string): boolean {
    return this.sessionData?.approvedTools.includes(toolName) ?? false;
  }

  /**
   * Check if a tool is denied for this session.
   */
  isToolDenied(toolName: string): boolean {
    return this.sessionData?.deniedTools.includes(toolName) ?? false;
  }

  /**
   * Increment tool call count.
   */
  recordToolCall(toolName: string): void {
    if (!this.sessionData) return;
    this.sessionData.toolCallCounts[toolName] =
      (this.sessionData.toolCallCounts[toolName] ?? 0) + 1;
    this.scheduleSave();
  }

  /**
   * Update total iterations.
   */
  updateIterations(iterations: number): void {
    if (!this.sessionData) return;
    this.sessionData.metadata.totalIterations += iterations;
    this.scheduleSave();
  }

  /**
   * Update total tokens.
   */
  updateTokens(tokens: number): void {
    if (!this.sessionData) return;
    this.sessionData.metadata.totalTokens += tokens;
    this.scheduleSave();
  }

  /**
   * Update last query.
   */
  updateLastQuery(query: string): void {
    if (!this.sessionData) return;
    this.sessionData.lastQuery = query.length > 200 ? query.substring(0, 200) + '...' : query;
    this.scheduleSave();
  }

  /**
   * Check if a tool has been denied in this session (should skip).
   */
  shouldSkipTool(toolName: string): boolean {
    return this.isToolDenied(toolName);
  }

  // ============================================================================
  // Transcript Methods
  // ============================================================================

  /**
   * Add a message to the transcript.
   */
  addTranscriptMessage(
    role: TranscriptRole,
    content: string,
    options?: {
      toolName?: string;
      toolResult?: string;
    }
  ): void {
    if (!this.sessionData) return;

    // Initialize transcript if needed
    if (!this.sessionData.transcript) {
      this.sessionData.transcript = [];
      this.sessionData.transcriptStats = {
        messageCount: 0,
        userMessageCount: 0,
        assistantMessageCount: 0,
        toolMessageCount: 0,
      };
    }

    // Create message with unique ID
    const message: TranscriptMessage = {
      id: this.createMessageId(),
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    if (options?.toolName) {
      message.toolName = options.toolName;
    }
    if (options?.toolResult) {
      message.toolResult = options.toolResult;
    }

    // Add to transcript
    this.sessionData.transcript.push(message);
    this.updateTranscriptStats();

    this.scheduleSave();
  }

  /**
   * Get full transcript for current session.
   */
  getTranscript(): TranscriptMessage[] {
    return this.sessionData?.transcript ?? [];
  }

  /**
   * Get transcript in a format suitable for resuming.
   */
  getTranscriptForResume(): TranscriptMessage[] {
    const transcript = this.getTranscript();
    // Return decompressed version for resume
    return transcript.map(msg => ({
      ...msg,
      compressed: false,
    }));
  }

  /**
   * Resume a session from a previous session ID.
   * Loads the transcript from the previous session.
   */
  async resumeFrom(sessionId: string): Promise<boolean> {
    const previousSession = await this.loadSession(sessionId);
    if (!previousSession) {
      return false;
    }

    if (!this.sessionData) {
      await this.startSession({ resumed: true, resumedFrom: sessionId });
    }

    if (this.sessionData) {
      // Copy transcript from previous session
      this.sessionData.transcript = previousSession.transcript ?? [];
      this.sessionData.transcriptStats = previousSession.transcriptStats;
      this.sessionData.metadata.resumed = true;
      this.sessionData.metadata.resumedFrom = sessionId;

      // Copy tool approvals/denials from previous session
      this.sessionData.approvedTools = [...previousSession.approvedTools];
      this.sessionData.deniedTools = [...previousSession.deniedTools];

      await this.saveSession();
    }

    return true;
  }

  /**
   * Compress transcript by removing redundant messages.
   * Keeps the most recent N messages and summarizes older ones.
   */
  compressTranscript(keepRecent: number = 50): void {
    if (!this.sessionData?.transcript || this.sessionData.transcript.length <= keepRecent) {
      return;
    }

    const recent = this.sessionData.transcript.slice(-keepRecent);
    const older = this.sessionData.transcript.slice(0, -keepRecent);

    // Create a summary of older messages
    const summary = this.summarizeMessages(older);

    // Mark older messages as compressed
    const compressedSummary: TranscriptMessage = {
      id: this.createMessageId(),
      role: 'system',
      content: `[Previous ${older.length} messages summarized]: ${summary}`,
      timestamp: older[0]?.timestamp ?? new Date().toISOString(),
      compressed: true,
    };

    this.sessionData.transcript = [compressedSummary, ...recent];
    this.scheduleSave();
  }

  /**
   * Deduplicate consecutive messages with the same content.
   */
  deduplicateTranscript(): void {
    if (!this.sessionData?.transcript) return;

    const deduplicated: TranscriptMessage[] = [];
    let lastContent = '';

    for (const msg of this.sessionData.transcript) {
      // Skip consecutive messages with identical content
      if (msg.content === lastContent && msg.role !== 'tool') {
        continue;
      }
      deduplicated.push(msg);
      lastContent = msg.content;
    }

    this.sessionData.transcript = deduplicated;
    this.updateTranscriptStats();
    this.scheduleSave();
  }

  /**
   * Clear the transcript for the current session.
   */
  clearTranscript(): void {
    if (!this.sessionData) return;
    this.sessionData.transcript = [];
    this.sessionData.transcriptStats = {
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      toolMessageCount: 0,
    };
    this.scheduleSave();
  }

  /**
   * Export transcript as a readable format.
   */
  exportTranscript(): string {
    const transcript = this.getTranscript();
    const lines: string[] = [];

    for (const msg of transcript) {
      const prefix = `[${msg.timestamp}] ${msg.role.toUpperCase()}`;
      if (msg.toolName) {
        lines.push(`${prefix} [${msg.toolName}]: ${msg.content}`);
      } else {
        lines.push(`${prefix}: ${msg.content}`);
      }
    }

    return lines.join('\n');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create a unique message ID.
   */
  private createMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Update transcript statistics.
   */
  private updateTranscriptStats(): void {
    if (!this.sessionData?.transcript) return;

    const stats = this.sessionData.transcriptStats ?? {
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      toolMessageCount: 0,
    };

    stats.messageCount = this.sessionData.transcript.length;
    stats.userMessageCount = this.sessionData.transcript.filter(m => m.role === 'user').length;
    stats.assistantMessageCount = this.sessionData.transcript.filter(m => m.role === 'assistant').length;
    stats.toolMessageCount = this.sessionData.transcript.filter(m => m.role === 'tool').length;

    this.sessionData.transcriptStats = stats;
  }

  /**
   * Summarize older messages for compression.
   */
  private summarizeMessages(messages: TranscriptMessage[]): string {
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const toolCalls = messages.filter(m => m.role === 'tool');

    const parts: string[] = [];
    if (userMsgs.length > 0) {
      parts.push(`${userMsgs.length} user messages`);
    }
    if (assistantMsgs.length > 0) {
      parts.push(`${assistantMsgs.length} assistant responses`);
    }
    if (toolCalls.length > 0) {
      parts.push(`${toolCalls.length} tool calls`);
    }

    return parts.join(', ');
  }

  /**
   * List all sessions.
   */
  async listSessions(): Promise<SessionMetadata[]> {
    if (!existsSync(this.sessionDir)) {
      return [];
    }

    const sessions: SessionMetadata[] = [];
    const files = readdirSync(this.sessionDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = readFileSync(join(this.sessionDir, file), 'utf-8');
        const data = JSON.parse(content) as SessionData;
        sessions.push(data.metadata);
      } catch {
        // Skip corrupted session files
      }
    }

    // Sort by most recent first
    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Delete old sessions, keeping only the most recent N.
   */
  async pruneSessions(keepCount: number = 10): Promise<number> {
    const sessions = await this.listSessions();
    if (sessions.length <= keepCount) return 0;

    const toDelete = sessions.slice(keepCount);
    let deleted = 0;

    for (const session of toDelete) {
      const filePath = this.getSessionFilePath(session.id);
      try {
        unlinkSync(filePath);
        deleted++;
      } catch {
        // Skip if already deleted
      }
    }

    return deleted;
  }

  /**
   * Get the most recent session.
   */
  async getMostRecentSession(): Promise<SessionData | null> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) return null;

    return await this.loadSession(sessions[0].id);
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private createSessionId(): string {
    const hash = createHash('sha256')
      .update(new Date().toISOString() + Math.random())
      .digest('hex')
      .slice(0, 16);
    return `session_${hash}`;
  }

  private getSessionFilePath(sessionId: string): string {
    return join(this.sessionDir, `${sessionId}.json`);
  }

  private async saveSession(): Promise<void> {
    if (!this.sessionData || !this.currentSessionId) return;

    const filePath = this.getSessionFilePath(this.currentSessionId);
    writeFileSync(filePath, JSON.stringify(this.sessionData, null, 2));
  }

  private async loadSession(sessionId: string): Promise<SessionData | null> {
    const filePath = this.getSessionFilePath(sessionId);
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleSave(): void {
    // Debounce saves to avoid excessive disk writes
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveSession().catch(() => {/* ignore */});
    }, 500);
  }

  /**
   * Immediately persist session data to disk (bypasses debounce).
   * Called after each tool execution for crash recovery.
   */
  async persist(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveSession();
  }
}

// ============================================================================
// Module-level Singleton
// ============================================================================

let _sessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager();
  }
  return _sessionManager;
}

export function resetSessionManager(): void {
  _sessionManager = null;
}
