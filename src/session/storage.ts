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
import { globalUpupPath, upupPath, ensureDir } from '../utils/paths.js';
import { SESSIONS_DIR, PID_SESSIONS_DIR, getProjectSessionsDir, sanitizePath } from '../utils/storage-paths.js';

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_DIR_DEFAULT = SESSIONS_DIR;  // Use SESSIONS_DIR: ~/.upup/data/sessions/
const SESSION_FILE_PREFIX = 'session_';
const SESSION_FILE_SUFFIX = '.jsonl';
const MAX_SESSION_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the sessions directory path
 * If projectPath is provided, returns project-specific directory
 * Otherwise falls back to SESSIONS_DIR for backward compatibility
 */
export function getSessionsDir(projectPath?: string): string {
  if (!projectPath) {
    return SESSIONS_DIR_DEFAULT;
  }

  // Check if projectPath is already a sessions directory
  // (ends with data/sessions or sessions)
  if (projectPath.includes('data/sessions') || projectPath.endsWith('sessions')) {
    return projectPath;
  }

  // Otherwise treat as project path and convert to sessions directory
  return getProjectSessionsDir(projectPath);
}

/**
 * Get the path for a specific session file
 * Handles both formats:
 * - UUID format (no prefix): adds session_ prefix
 * - session_xxxx format (already has prefix): no prefix added, just suffix
 *
 * @param sessionId - The session ID
 * @param projectPath - Optional project path for project-isolated storage
 */
export function getSessionPath(sessionId: string, projectPath?: string): string {
  const sessionsDir = getSessionsDir(projectPath);
  // If already has session_ prefix, just add the suffix
  if (sessionId.startsWith(SESSION_FILE_PREFIX)) {
    return join(sessionsDir, `${sessionId}${SESSION_FILE_SUFFIX}`);
  }
  // No prefix, add it
  return join(sessionsDir, `${SESSION_FILE_PREFIX}${sessionId}${SESSION_FILE_SUFFIX}`);
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
 * @param projectPath - Optional project path for project-isolated storage
 */
export function ensureSessionsDir(projectPath?: string): void {
  const dir = getSessionsDir(projectPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a new session
 */
export async function createSession(params: CreateSessionParams): Promise<SessionMetadata> {
  // Use project-specific directory if projectPath is provided
  const projectPath = params.projectPath || process.cwd();
  ensureSessionsDir(projectPath);

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

  const sessionPath = getSessionPath(sessionId, projectPath);
  writeFileSync(sessionPath, JSON.stringify(sessionData) + '\n');

  return metadata;
}

/**
 * Get session metadata by ID
 * @param sessionId - The session ID
 * @param projectPath - Optional project path for project-isolated storage
 */
export async function getSessionMetadata(sessionId: string, projectPath?: string): Promise<SessionMetadata | null> {
  const sessionPath = getSessionPath(sessionId, projectPath);
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
 * Supports both JSON and JSONL formats
 * @param sessionId - The session ID
 * @param projectPath - Optional project path for project-isolated storage
 */
export async function getSession(sessionId: string, projectPath?: string): Promise<SessionData | null> {
  // Build base path (without extension) to support both .json and .jsonl
  const sessionsDir = getSessionsDir(projectPath);
  const baseName = sessionId.startsWith(SESSION_FILE_PREFIX)
    ? sessionId  // Already has prefix
    : `${SESSION_FILE_PREFIX}${sessionId}`;  // Add prefix

  const pathWithJsonl = join(sessionsDir, `${baseName}.jsonl`);
  const pathWithJson = join(sessionsDir, `${baseName}.json`);

  let sessionPath: string;
  if (existsSync(pathWithJsonl)) {
    sessionPath = pathWithJsonl;
  } else if (existsSync(pathWithJson)) {
    sessionPath = pathWithJson;
  } else {
    // No file found
    return null;
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    // Check if it's JSONL format (single line with full object)
    // or simple JSON format (pretty-printed multi-line JSON)
    let data: SessionData;

    // Check if first line looks like the start of a JSON object
    const firstLine = lines[0].trim();
    const startsWithObject = firstLine === '{';

    if (startsWithObject && lines.length > 1) {
      // This is a pretty-printed JSON file (multi-line)
      // Parse the entire content
      try {
        const wholeParsed = JSON.parse(content);
        if (wholeParsed.metadata) {
          // Simple JSON format from session-persistence.ts
          const meta = wholeParsed.metadata as Record<string, unknown>;
          data = {
            metadata: {
              id: (meta?.id as string) || sessionId,
              createdAt: typeof meta?.createdAt === 'string'
                ? new Date(meta.createdAt as string).getTime()
                : (meta?.createdAt as number) || Date.now(),
              modifiedAt: typeof meta?.updatedAt === 'string'
                ? new Date(meta.updatedAt as string).getTime()
                : (meta?.updatedAt as number) || Date.now(),
              projectPath: (meta?.projectPath as string) || '',
              messageCount: (meta?.queryCount as number) || 0,
              customTitle: meta?.customTitle as string | undefined,
              tag: meta?.tag as string | undefined,
            },
            messages: [],
          };
        } else {
          data = wholeParsed as SessionData;
        }
      } catch {
        return null;
      }
    } else {
      // JSONL format: first line is metadata, subsequent lines are messages
      try {
        const parsed = JSON.parse(firstLine);
        if (parsed.metadata !== undefined) {
          // Parse metadata from first line
          const metadata = parsed.metadata as SessionMetadata;
          // Parse messages from remaining lines (JSONL format)
          const messages: SessionMessage[] = [];
          for (let i = 1; i < lines.length; i++) {
            try {
              const msg = JSON.parse(lines[i]);
              messages.push(msg as SessionMessage);
            } catch {
              // Skip malformed message lines
            }
          }
          data = { metadata, messages };
        } else {
          // Parse the whole content as fallback
          const wholeParsed = JSON.parse(content);
          data = wholeParsed as SessionData;
        }
      } catch {
        return null;
      }
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Update session metadata
 * @param sessionId - The session ID
 * @param updates - Metadata updates
 * @param projectPath - Optional project path for project-isolated storage
 */
export async function updateSessionMetadata(
  sessionId: string,
  updates: Partial<SessionMetadata>,
  projectPath?: string
): Promise<void> {
  const sessionPath = getSessionPath(sessionId, projectPath);
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
 * @param sessionId - The session ID
 * @param projectPath - Optional project path for project-isolated storage
 */
export async function deleteSession(sessionId: string, projectPath?: string): Promise<boolean> {
  const sessionPath = getSessionPath(sessionId, projectPath);
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
 * Scans both new SESSIONS_DIR (data/sessions/) and old PID_SESSIONS_DIR (sessions/)
 * for backward compatibility with legacy session files.
 * @param filter - Filter options including projectPath
 */
export async function listSessions(filter?: SessionFilter): Promise<SessionMetadata[]> {
  const projectPath = filter?.projectPath;
  ensureSessionsDir(projectPath);

  const sessions: SessionMetadata[] = [];
  const seenIds = new Set<string>(); // Avoid duplicates across directories

  // Scan new sessions directory (data/sessions/)
  const baseDir = SESSIONS_DIR;  // ~/.upup/data/sessions/

  // Helper to scan a directory for sessions
  const scanDir = (dir: string, recursive: boolean = false) => {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && recursive) {
        // Recursively scan project directories
        scanDir(fullPath, false);
      } else if (file.endsWith('.jsonl') || file.endsWith('.json')) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.trim().split('\n').filter(Boolean);
          if (lines.length === 0) return;

          let metadata: SessionMetadata;

          if (file.endsWith('.jsonl')) {
            // JSONL format: first line is the metadata object
            const data = JSON.parse(lines[0]) as SessionData;
            metadata = data.metadata;
          } else {
            // JSON format: parse the whole file (old format from session-persistence.ts)
            const data = JSON.parse(content) as Record<string, unknown>;
            const raw = data.metadata as Record<string, unknown>;
            // Convert old format fields to new SessionMetadata format
            metadata = {
              id: (raw.id as string) || '',
              createdAt: typeof raw.createdAt === 'string'
                ? new Date(raw.createdAt as string).getTime()
                : (raw.createdAt as number) || Date.now(),
              modifiedAt: typeof raw.updatedAt === 'string'
                ? new Date(raw.updatedAt as string).getTime()
                : (raw.updatedAt as number) || Date.now(),
              projectPath: (raw.projectPath as string) || '',
              messageCount: (raw.queryCount as number) || 0,
            };
          }

          // Avoid duplicates
          if (!seenIds.has(metadata.id)) {
            seenIds.add(metadata.id);

            // Apply project filter if specified
            if (projectPath && metadata.projectPath && metadata.projectPath !== projectPath) {
              return;
            }

            sessions.push(metadata);
          }
        } catch {
          // Skip corrupted files
        }
      }
    }
  };

  // Scan project-specific directory or base directory
  if (projectPath) {
    scanDir(getProjectSessionsDir(projectPath), false);
  } else {
    // Scan base sessions directory with recursion for project directories
    scanDir(baseDir, true);
  }

  // Scan old sessions directory for backward compatibility (only if no project filter)
  if (!projectPath && existsSync(PID_SESSIONS_DIR)) {
    const oldFiles = readdirSync(PID_SESSIONS_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.jsonl'));
    for (const file of oldFiles) {
      try {
        const sessionPath = join(PID_SESSIONS_DIR, file);
        const content = readFileSync(sessionPath, 'utf-8');
        const data = JSON.parse(content) as Record<string, unknown>;
        const raw = data.metadata as Record<string, unknown>;

        const metadata: SessionMetadata = {
          id: (raw.id as string) || '',
          createdAt: typeof raw.createdAt === 'string'
            ? new Date(raw.createdAt as string).getTime()
            : (raw.createdAt as number) || Date.now(),
          modifiedAt: typeof raw.updatedAt === 'string'
            ? new Date(raw.updatedAt as string).getTime()
            : (raw.updatedAt as number) || Date.now(),
          projectPath: (raw.projectPath as string) || '',
          messageCount: (raw.queryCount as number) || 0,
        };

        // Avoid duplicates
        if (!seenIds.has(metadata.id)) {
          seenIds.add(metadata.id);
          sessions.push(metadata);
        }
      } catch {
        // Skip corrupted files
      }
    }
  }

  // Apply additional filters (tag, gitBranch)
  const filtered = sessions.filter(s => {
    if (filter?.tag && s.tag !== filter.tag) return false;
    if (filter?.gitBranch && s.gitBranch !== filter.gitBranch) return false;
    return true;
  });

  // Sort by modified date (most recent first)
  filtered.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // Apply limit
  if (filter?.limit && filter.limit > 0) {
    return filtered.slice(0, filter.limit);
  }

  return filtered;
}

/**
 * Add a message to a session
 * @param sessionId - The session ID
 * @param message - Message to add
 * @param projectPath - Optional project path for project-isolated storage
 */
export async function addSessionMessage(
  sessionId: string,
  message: Omit<SessionMessage, 'id' | 'timestamp'>,
  projectPath?: string
): Promise<void> {
  const sessionPath = getSessionPath(sessionId, projectPath);
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
    const metadata = await getSessionMetadata(sessionId, projectPath);
    if (metadata) {
      await updateSessionMetadata(sessionId, {
        messageCount: metadata.messageCount + 1,
        lastQuery: message.type === 'user' ? message.content.slice(0, 200) : metadata.lastQuery,
      }, projectPath);
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

  // Handle createdAt and modifiedAt which might be strings or numbers
  const createdAtMs = typeof metadata.createdAt === 'string'
    ? new Date(metadata.createdAt).getTime()
    : (metadata.createdAt || Date.now());
  const modifiedAtMs = typeof metadata.modifiedAt === 'string'
    ? new Date(metadata.modifiedAt).getTime()
    : (metadata.modifiedAt || Date.now());

  return {
    id: metadata.id,
    title,
    modified: new Date(modifiedAtMs),
    created: new Date(createdAtMs),
    firstPrompt: metadata.firstPrompt,
    customTitle: metadata.customTitle,
    tag: metadata.tag,
    projectPath: metadata.projectPath || '',
    gitBranch: metadata.gitBranch,
    messageCount: metadata.messageCount || 0,
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
