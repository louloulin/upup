/**
 * Session Restore Module
 *
 * Handles restoring session state from stored session data.
 * Mirrors Claude Code's sessionRestore.ts patterns.
 *
 * Features:
 * - Restore full conversation from JSONL storage
 * - Restore file history snapshots
 * - Detect mid-turn interruption
 * - Extract todos from transcript
 * - Worktree support for cross-project resume
 */

import type { SessionData, SessionMessage, FileHistorySnapshot } from '@upup/pi-session';
import { getSession } from './storage.js';
import { SESSIONS_DIR } from '../utils/storage-paths.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ResumeResult {
  sessionId: string;
  sessionData: SessionData;
  wasInterrupted: boolean;
  interruptedAt?: number;
}

export interface ProcessedResume {
  sessionId: string;
  messages: SessionMessage[];
  fileSnapshots: FileHistorySnapshot[];
  todos: TodoItem[];
  agentContext?: AgentContext;
  worktreePath?: string;
  wasInterrupted: boolean;
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'completed' | 'in_progress';
  createdAt: number;
  completedAt?: number;
}

export interface AgentContext {
  agentId?: string;
  mode?: string;
}

// ============================================================================
// Session Restore
// ============================================================================

/**
 * Load session data for resume
 */
export async function loadSessionForResume(sessionId: string): Promise<ResumeResult | null> {
  // First try with default directory
  let sessionData = await getSession(sessionId);

  // If not found, search in project subdirectories
  if (!sessionData) {
    sessionData = await findSessionInProjects(sessionId);
  }

  if (!sessionData) return null;

  // Check for mid-turn interruption
  const wasInterrupted = detectInterruptedSession(sessionData.messages);

  return {
    sessionId,
    sessionData,
    wasInterrupted,
    interruptedAt: wasInterrupted ? Date.now() : undefined,
  };
}

/**
 * Search for session in project subdirectories
 */
async function findSessionInProjects(sessionId: string): Promise<SessionData | null> {
  if (!existsSync(SESSIONS_DIR)) return null;

  let entries;
  try {
    entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return null;
  }

  const projectDirs = entries
    .filter(d => d.isDirectory())
    .map(d => join(SESSIONS_DIR, d.name));

  for (const projectDir of projectDirs) {
    // Try looking for the session file directly
    const baseName = sessionId.startsWith('session_') ? sessionId : `session_${sessionId}`;
    const sessionPath = join(projectDir, `${baseName}.jsonl`);

    if (existsSync(sessionPath)) {
      // Found it! Use getSession with the projectDir
      const sessionData = await getSession(sessionId, projectDir);
      if (sessionData) return sessionData;
    }
  }

  return null;
}

/**
 * Detect if a session was interrupted mid-turn
 * An interrupted session has a message that was cut off
 */
function detectInterruptedSession(messages: SessionMessage[]): boolean {
  if (messages.length === 0) return false;

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return false;

  // If last assistant message ends with incomplete content
  if (lastMessage.type === 'assistant') {
    const content = lastMessage.content.trim();
    // Check for common incomplete patterns
    const incompletePatterns = [
      / I'm still/,
      / Let me/,
      / I'm going to/,
      / I'll/,
      / Now I'll/,
      / Let me check/,
      / First,? let me/,
      /^$/, // Empty or whitespace only
    ];

    for (const pattern of incompletePatterns) {
      if (pattern.test(content)) return true;
    }

    // Check if it ends mid-sentence
    if (content.length > 0 && !/[.!?]$/.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Deserialize messages from stored format
 * Filters out incomplete/placeholder messages
 */
export function deserializeMessages(messages: SessionMessage[]): SessionMessage[] {
  return messages.filter(msg => {
    // Skip empty messages
    if (!msg.content || msg.content.trim().length === 0) return false;

    // Skip tool messages with no result
    if (msg.type === 'tool' && !msg.toolResult) return false;

    return true;
  });
}

/**
 * Process a resumed conversation
 */
export async function processResumedConversation(
  sessionId: string,
  options?: { fork?: boolean }
): Promise<ProcessedResume | null> {
  const result = await loadSessionForResume(sessionId);
  if (!result) return null;

  const { sessionData } = result;
  const messages = deserializeMessages(sessionData.messages);

  // Extract file history snapshots
  const fileSnapshots = extractFileSnapshots(messages);

  // Extract todos from transcript
  const todos = extractTodosFromTranscript(messages);

  // Extract agent context
  const agentContext = extractAgentContext(sessionData);

  return {
    sessionId: options?.fork ? generateNewSessionId() : sessionId,
    messages,
    fileSnapshots,
    todos,
    agentContext,
    worktreePath: sessionData.metadata.gitBranch ? undefined : undefined, // Reserved for worktree support
    wasInterrupted: result.wasInterrupted,
  };
}

// ============================================================================
// File History Snapshots
// ============================================================================

/**
 * Extract file history snapshots from messages
 */
function extractFileSnapshots(messages: SessionMessage[]): FileHistorySnapshot[] {
  const snapshots: FileHistorySnapshot[] = [];

  for (const msg of messages) {
    // Look for file write events
    if (msg.type === 'tool' && msg.toolName === 'write_file') {
      try {
        // Parse the tool call args to get path and content
        const args = JSON.parse(msg.content);
        if (args.path) {
          snapshots.push({
            path: args.path,
            timestamp: msg.timestamp,
            content: args.content,
          });
        }
      } catch {
        // Not a parseable write_file call
      }
    }
  }

  return snapshots;
}

// ============================================================================
// Todo Extraction
// ============================================================================

/**
 * Extract todos from transcript
 * Looks for TodoWrite tool_use blocks
 */
function extractTodosFromTranscript(messages: SessionMessage[]): TodoItem[] {
  const todos: TodoItem[] = [];

  for (const msg of messages) {
    if (msg.type === 'tool' && msg.toolName === 'TodoWrite') {
      try {
        const todoData = JSON.parse(msg.toolResult || msg.content);
        if (Array.isArray(todoData.todos)) {
          for (const todo of todoData.todos) {
            todos.push({
              id: todo.id || `todo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              content: todo.content || '',
              status: mapTodoStatus(todo.status),
              createdAt: todo.createdAt || Date.now(),
              completedAt: todo.completedAt,
            });
          }
        }
      } catch {
        // Not a parseable TodoWrite result
      }
    }
  }

  return todos;
}

function mapTodoStatus(status: string): TodoItem['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'in_progress') return 'in_progress';
  return 'pending';
}

// ============================================================================
// Agent Context
// ============================================================================

/**
 * Extract agent context from session data
 */
function extractAgentContext(sessionData: SessionData): AgentContext {
  return {
    agentId: undefined,
    mode: undefined,
  };
}

// ============================================================================
// Resume by Various Criteria
// ============================================================================

/**
 * Parse resume argument and return session ID
 * Supports:
 * - session_ prefix format: session_xxxxxx (exact match from session-persistence.ts)
 * - UUID format: exact session ID match
 * - Partial ID match: session ID contains the argument
 * - Title format: custom title search
 * - Partial match: fuzzy title search
 *
 * When searching by session ID, project path filter is NOT applied.
 * When searching by title/tag, project path filter is applied.
 */
export async function resolveResumeTarget(
  arg?: string,
  currentProjectPath?: string
): Promise<string | null> {
  if (!arg) return null;

  // Load storage module once
  const storage = await import('./storage.js');

  // First, search by session ID without project filter (ID searches should be global)
  // Check if it's a session_ prefix format (exact match)
  const sessionPrefixRegex = /^session_[a-zA-Z0-9]+$/;
  if (sessionPrefixRegex.test(arg)) {
    // Verify the session exists
    const sessionData = await storage.getSession(arg);
    if (sessionData) return arg;
  }

  // Check if it's a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(arg)) {
    // Verify the session exists
    const sessionData = await storage.getSession(arg);
    if (sessionData) return arg;
  }

  // Load sessions for title/tag search (apply project filter)
  const sessions = await storage.getSessionSummaries({ projectPath: currentProjectPath });

  // Also get all sessions for partial ID match (global search)
  const allSessions = await storage.getSessionSummaries();

  // Try partial ID match from all sessions (global search)
  const partialIdMatch = allSessions.find(
    s => s.id.toLowerCase().includes(arg.toLowerCase())
  );
  if (partialIdMatch) return partialIdMatch.id;

  // Exact title match (filtered by project)
  const exactMatch = sessions.find(
    s => s.customTitle?.toLowerCase() === arg.toLowerCase()
  );
  if (exactMatch) return exactMatch.id;

  // Partial title match (filtered by project)
  const partialMatch = sessions.find(
    s =>
      s.customTitle?.toLowerCase().includes(arg.toLowerCase()) ||
      s.title.toLowerCase().includes(arg.toLowerCase())
  );
  if (partialMatch) return partialMatch.id;

  // Tag match (filtered by project)
  const tagMatch = sessions.find(s => s.tag?.toLowerCase() === arg.toLowerCase());
  if (tagMatch) return tagMatch.id;

  return null;
}

/**
 * Get the most recent session for current project
 */
export async function getMostRecentSession(projectPath?: string): Promise<string | null> {
  const { getSessionSummaries } = await import('./storage.js');
  const sessions = await getSessionSummaries({ projectPath });
  return sessions.length > 0 ? sessions[0].id : null;
}

// ============================================================================
// Helpers
// ============================================================================

function generateNewSessionId(): string {
  const { randomUUID } = require('crypto');
  return randomUUID();
}
