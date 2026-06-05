/**
 * Session Types
 *
 * Type definitions for session management, mirroring Claude Code's patterns.
 */

import type { BaseMessage } from '@langchain/core/messages';

/**
 * Session metadata - lightweight summary for listing
 */
export interface SessionMetadata {
  id: string;
  customTitle?: string;
  tag?: string;
  firstPrompt?: string;
  createdAt: number;
  modifiedAt: number;
  messageCount: number;
  projectPath: string;
  gitBranch?: string;
  totalTokens?: number;
  lastQuery?: string;
  isSidechain?: boolean;
  resumeCount?: number;
}

/**
 * Full session data stored in JSONL
 */
export interface SessionData {
  metadata: SessionMetadata;
  messages: SessionMessage[];
}

/**
 * Entry type for session messages (mirroring Claude Code patterns)
 */
export type EntryType =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'tool_use'
  | 'tool_result'
  | 'progress'
  | 'bash_progress'
  | 'system'
  | 'error'
  | 'context_collapse_snapshot'
  | 'file_history_snapshot';

/**
 * Session message for persistence
 * Extended with Claude Code's message chain support
 */
export interface SessionMessage {
  id: string;
  type: EntryType;
  content: string;
  timestamp: number;

  // Message chain support (parentUuid pattern)
  parentUuid?: string;

  // Tool association (tool_result links to tool_use)
  toolUseId?: string;

  // Ephemeral flag (UI-only messages, not persisted)
  isEphemeral?: boolean;

  // Tool-specific fields
  toolName?: string;
  toolResult?: string;

  // Flexible metadata storage
  metadata?: Record<string, unknown>;
}

/**
 * File history snapshot for resume
 */
export interface FileHistorySnapshot {
  path: string;
  timestamp: number;
  content?: string;
}

/**
 * Session filter options
 */
export interface SessionFilter {
  projectPath?: string;
  tag?: string;
  gitBranch?: string;
  limit?: number;
}

/**
 * Session summary for display (LogOption equivalent)
 */
export interface SessionSummary {
  id: string;
  title: string;
  modified: Date;
  created: Date;
  firstPrompt?: string;
  customTitle?: string;
  tag?: string;
  projectPath: string;
  gitBranch?: string;
  messageCount: number;
  isSidechain?: boolean;
}

/**
 * Resume options
 */
export interface ResumeOptions {
  sessionId?: string;
  title?: string;
  fork?: boolean;
}

/**
 * Create session parameters
 */
export interface CreateSessionParams {
  id?: string;
  projectPath: string;
  gitBranch?: string;
  firstPrompt?: string;
  customTitle?: string;
  tag?: string;
}

/**
 * Session state
 */
export type SessionState = 'idle' | 'running' | 'waiting' | 'completed' | 'error' | 'canceled';

/**
 * Session info for display
 */
export interface SessionInfo {
  id: string;
  state: SessionState;
  createdAt: number;
  lastActivity: number;
  context: SessionContext;
  metadata: SessionMetadata;
  abortReason?: string;
}

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
