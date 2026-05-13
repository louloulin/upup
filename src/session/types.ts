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
 * Session message for persistence
 */
export interface SessionMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
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
