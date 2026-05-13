/**
 * Session Storage Layer
 *
 * Handles persistence of session data including messages, metadata, and state.
 * Implements JSONL-based storage similar to Claude Code's sessionStorage.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { createHash, randomUUID } from 'crypto';
import { homedir } from 'os';
import type {
  SessionMetadata,
  SessionData,
  SessionMessage,
  SessionFilter,
  SessionSummary,
  CreateSessionParams,
} from './types.js';
import { upupPath, ensureDir } from '../utils/paths.js';

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_DIR = 'sessions';
const SESSION_FILE_PREFIX = 'session_';
const SESSION_FILE_SUFFIX = '.jsonl';
const MAX_SESSION_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the sessions directory path
 */
export function getSessionsDir(): string {
  return join(upupPath('data'), SESSIONS_DIR);
}

/**
 * Get the path for a specific session file
 */
export function getSessionPath(sessionId: string): string {
  return join(getSessionsDir(), `${SESSION_FILE_PREFIX}${sessionId}${SESSION_FILE_SUFFIX}`);
}

/**
 * Generate a new session ID
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Generate a short hash for session IDs
 */
export function generateShortId(): string {
  return createHash('sha256')
    .update(Date.now().toString() + Math.random())
    .digest('hex')
    .slice(0, 16);
}

// ============================================================================
// Session CRUD Operations
// ============================================================================

/**
 * Ensure the sessions directory exists
 */
export function ensureSessionsDir(): void {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a new session
 */
export async function createSession(params: CreateSessionParams): Promise<SessionMetadata> {
  ensureSessionsDir();

  const sessionId = params.id || generateSessionId();
  const now = Date.now();

  const metadata: SessionMetadata = {
    id: sessionId,
    customTitle: params.customTitle,
    tag: params.tag,
    firstPrompt: params.firstPrompt,
    createdAt: now,
    modifiedAt: now,
    messageCount: 0,
    projectPath: params.projectPath,
    gitBranch: params.gitBranch,
    resumeCount: 0,
  };

  const sessionData: SessionData = {
    metadata,
    messages: [],
  };

  const sessionPath = getSessionPath(sessionId);
  writeFileSync(sessionPath, JSON.stringify(sessionData) + '\n');

  return metadata;
}

/**
 * Get session metadata by ID
 */
export async function getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
  const sessionPath = getSessionPath(sessionId);
  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    const data = JSON.parse(lines[0]) as SessionData;
    return data.metadata;
  } catch {
    return null;
  }
}

/**
 * Get full session data by ID
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  const sessionPath = getSessionPath(sessionId);
  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    const data = JSON.parse(lines[0]) as SessionData;
    return data;
  } catch {
    return null;
  }
}

/**
 * Update session metadata
 */
export async function updateSessionMetadata(
  sessionId: string,
  updates: Partial<SessionMetadata>
): Promise<void> {
  const sessionPath = getSessionPath(sessionId);
  if (!existsSync(sessionPath)) {
    return;
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return;

    const data = JSON.parse(lines[0]) as SessionData;
    const metadata = { ...data.metadata, ...updates, modifiedAt: Date.now() };
    const updatedData: SessionData = { ...data, metadata };

    // Preserve existing messages
    const messages = lines.slice(1).map(line => JSON.parse(line));
    const allLines = [JSON.stringify(updatedData), ...messages.map(m => JSON.stringify(m))];
    writeFileSync(sessionPath, allLines.join('\n') + '\n');
  } catch {
    // Ignore errors
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const sessionPath = getSessionPath(sessionId);
  if (!existsSync(sessionPath)) {
    return false;
  }

  try {
    unlinkSync(sessionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all sessions with optional filtering
 */
export async function listSessions(filter?: SessionFilter): Promise<SessionMetadata[]> {
  ensureSessionsDir();

  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const sessions: SessionMetadata[] = [];

  for (const file of files) {
    try {
      const sessionPath = join(dir, file);
      const content = readFileSync(sessionPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) continue;

      const data = JSON.parse(lines[0]) as SessionData;
      const metadata = data.metadata;

      // Apply filters
      if (filter?.projectPath && metadata.projectPath !== filter.projectPath) {
        continue;
      }
      if (filter?.tag && metadata.tag !== filter.tag) {
        continue;
      }
      if (filter?.gitBranch && metadata.gitBranch !== filter.gitBranch) {
        continue;
      }

      sessions.push(metadata);
    } catch {
      // Skip corrupted files
    }
  }

  // Sort by modified date (most recent first)
  sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // Apply limit
  if (filter?.limit && filter.limit > 0) {
    return sessions.slice(0, filter.limit);
  }

  return sessions;
}

/**
 * Add a message to a session
 */
export async function addSessionMessage(
  sessionId: string,
  message: Omit<SessionMessage, 'id' | 'timestamp'>
): Promise<void> {
  const sessionPath = getSessionPath(sessionId);
  if (!existsSync(sessionPath)) {
    return;
  }

  try {
    const fullMessage: SessionMessage = {
      ...message,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    // Append message to JSONL
    const line = JSON.stringify(fullMessage);
    await appendToFile(sessionPath, line + '\n');

    // Update message count
    const metadata = await getSessionMetadata(sessionId);
    if (metadata) {
      await updateSessionMetadata(sessionId, {
        messageCount: metadata.messageCount + 1,
        lastQuery: message.type === 'user' ? message.content.slice(0, 200) : metadata.lastQuery,
      });
    }
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// Session Summary (LogOption equivalent)
// ============================================================================

/**
 * Convert SessionMetadata to SessionSummary for display
 */
export function toSessionSummary(metadata: SessionMetadata): SessionSummary {
  const title = metadata.customTitle ||
    metadata.firstPrompt?.slice(0, 60) ||
    metadata.lastQuery?.slice(0, 60) ||
    'Untitled session';

  return {
    id: metadata.id,
    title,
    modified: new Date(metadata.modifiedAt),
    created: new Date(metadata.createdAt),
    firstPrompt: metadata.firstPrompt,
    customTitle: metadata.customTitle,
    tag: metadata.tag,
    projectPath: metadata.projectPath,
    gitBranch: metadata.gitBranch,
    messageCount: metadata.messageCount,
    isSidechain: metadata.isSidechain,
  };
}

/**
 * Get session summaries for display
 */
export async function getSessionSummaries(filter?: SessionFilter): Promise<SessionSummary[]> {
  const sessions = await listSessions(filter);
  return sessions.map(toSessionSummary);
}

/**
 * Filter resumable sessions (exclude current session)
 */
export function filterResumableSessions(
  sessions: SessionSummary[],
  currentSessionId?: string
): SessionSummary[] {
  return sessions.filter(s =>
    !s.isSidechain && s.id !== currentSessionId
  );
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Rename a session (set custom title)
 */
export async function renameSession(sessionId: string, title: string): Promise<void> {
  await updateSessionMetadata(sessionId, { customTitle: title });
}

/**
 * Tag a session
 */
export async function tagSession(sessionId: string, tag: string | null): Promise<void> {
  await updateSessionMetadata(sessionId, { tag: tag ?? undefined });
}

/**
 * Get unique tags from all sessions
 */
export async function getUniqueTags(): Promise<string[]> {
  const sessions = await listSessions();
  const tags = new Set<string>();

  for (const session of sessions) {
    if (session.tag) {
      tags.add(session.tag);
    }
  }

  return Array.from(tags).sort();
}

/**
 * Search sessions by title
 */
export async function searchSessionsByTitle(query: string): Promise<SessionSummary[]> {
  const sessions = await getSessionSummaries();
  const lowerQuery = query.toLowerCase();

  return sessions.filter(s =>
    s.title.toLowerCase().includes(lowerQuery) ||
    s.customTitle?.toLowerCase().includes(lowerQuery) ||
    s.tag?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Export session to JSON
 */
export async function exportSessionToJson(sessionId: string): Promise<string | null> {
  const data = await getSession(sessionId);
  if (!data) return null;
  return JSON.stringify(data, null, 2);
}

/**
 * Export session to Markdown
 */
export async function exportSessionToMarkdown(sessionId: string): Promise<string | null> {
  const data = await getSession(sessionId);
  if (!data) return null;

  const lines: string[] = [];

  // Header
  const title = data.metadata.customTitle || data.metadata.firstPrompt?.slice(0, 60) || 'Session';
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Session ID:** ${data.metadata.id}`);
  lines.push(`**Project:** ${data.metadata.projectPath}`);
  lines.push(`**Created:** ${new Date(data.metadata.createdAt).toISOString()}`);
  lines.push(`**Modified:** ${new Date(data.metadata.modifiedAt).toISOString()}`);
  lines.push(`**Messages:** ${data.metadata.messageCount}`);
  if (data.metadata.tag) {
    lines.push(`**Tag:** ${data.metadata.tag}`);
  }
  if (data.metadata.gitBranch) {
    lines.push(`**Branch:** ${data.metadata.gitBranch}`);
  }
  lines.push('');
  lines.push('## Messages');
  lines.push('');

  // Messages
  for (const msg of data.messages) {
    const role = msg.type === 'user' ? '**You:**' : msg.type === 'assistant' ? '**Claude:**' : msg.toolName ? `**${msg.toolName}:**` : '**System:**';
    lines.push(`${role}`);
    lines.push(msg.content);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Append content to a file
 */
async function appendToFile(filePath: string, content: string): Promise<void> {
  const fd = await import('fs/promises').then(m => m.open(filePath, 'a'));
  try {
    await fd.write(content);
  } finally {
    await fd.close();
  }
}

/**
 * Get session file size
 */
export function getSessionFileSize(sessionId: string): number {
  const sessionPath = getSessionPath(sessionId);
  if (!existsSync(sessionPath)) {
    return 0;
  }

  try {
    const stat = statSync(sessionPath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Prune old sessions, keeping only the most recent N
 */
export async function pruneSessions(keepCount: number = 50): Promise<number> {
  const sessions = await listSessions();
  if (sessions.length <= keepCount) return 0;

  const toDelete = sessions.slice(keepCount);
  let deleted = 0;

  for (const session of toDelete) {
    const success = await deleteSession(session.id);
    if (success) deleted++;
  }

  return deleted;
}

/**
 * Fork a session - create a copy with a new ID
 * This allows branching off a conversation without modifying the original
 */
export async function forkSession(sessionId: string): Promise<string | null> {
  const original = await getSession(sessionId);
  if (!original) return null;

  const newId = generateSessionId();
  const now = Date.now();

  const forkedMetadata: SessionMetadata = {
    ...original.metadata,
    id: newId,
    createdAt: now,
    modifiedAt: now,
    customTitle: original.metadata.customTitle
      ? `${original.metadata.customTitle} (fork)`
      : undefined,
  };

  const forkedData: SessionData = {
    metadata: forkedMetadata,
    messages: [...original.messages],
  };

  const sessionPath = getSessionPath(newId);
  writeFileSync(sessionPath, JSON.stringify(forkedData) + '\n');

  return newId;
}
