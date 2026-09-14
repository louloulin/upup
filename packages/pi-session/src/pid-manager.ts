/**
 * PID Session Manager
 *
 * Manages PID-to-Session mapping for active session tracking.
 * Similar to Claude Code's session management in ~/.claude/sessions/{pid}.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { globalUpupPath } from '@upup/utils';

// ============================================================================
// Types
// ============================================================================

export interface SessionPidInfo {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart: string;
  version: string;
  kind?: 'interactive' | 'batch' | 'daemon';
  entrypoint?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_DIR = globalUpupPath('sessions');
const COMPACTION_LOG = 'compaction-log.txt';

// ============================================================================
// Path Utilities
// ============================================================================

function getSessionDir(): string {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  return SESSIONS_DIR;
}

function getPidFile(pid: number): string {
  return join(getSessionDir(), `${pid}.json`);
}

// ============================================================================
// PID Registration
// ============================================================================

/**
 * Register the current process with a session ID
 * Called when a new session starts
 */
export function registerSessionPid(sessionId: string, options?: { kind?: string; entrypoint?: string }): void {
  const dir = getSessionDir();
  const pidFile = getPidFile(process.pid);

  const info: SessionPidInfo = {
    pid: process.pid,
    sessionId,
    cwd: process.cwd(),
    startedAt: Date.now(),
    procStart: new Date().toLocaleString(),
    version: '2026.05.30',
    kind: options?.kind as SessionPidInfo['kind'] || 'interactive',
    entrypoint: options?.entrypoint,
  };

  writeFileSync(pidFile, JSON.stringify(info, null, 2));
}

/**
 * Unregister the current process PID
 * Called when session ends
 */
export function unregisterSessionPid(): void {
  const pidFile = getPidFile(process.pid);

  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

/**
 * Update session info for current process
 */
export function updateSessionPid(updates: Partial<SessionPidInfo>): void {
  const pidFile = getPidFile(process.pid);

  if (!existsSync(pidFile)) {
    return;
  }

  try {
    const content = readFileSync(pidFile, 'utf-8');
    const info = JSON.parse(content) as SessionPidInfo;
    const updated = { ...info, ...updates };
    writeFileSync(pidFile, JSON.stringify(updated, null, 2));
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// Session Discovery
// ============================================================================

/**
 * Get all active sessions (processes that are still running)
 */
export function getAllActiveSessions(): SessionPidInfo[] {
  const dir = getSessionDir();

  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir).filter((f: string) => f.endsWith('.json') && f !== COMPACTION_LOG);

  const sessions: SessionPidInfo[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf-8');
      const info = JSON.parse(content) as SessionPidInfo;

      // Check if process is still running
      if (isProcessRunning(info.pid)) {
        sessions.push(info);
      } else {
        // Clean up stale PID file
        unlinkSync(join(dir, file));
      }
    } catch {
      // Skip corrupted files
    }
  }

  // Sort by startedAt (most recent first)
  sessions.sort((a, b) => b.startedAt - a.startedAt);

  return sessions;
}

/**
 * Get session info by PID
 */
export function getSessionByPid(pid: number): SessionPidInfo | null {
  const pidFile = getPidFile(pid);

  if (!existsSync(pidFile)) {
    return null;
  }

  try {
    const content = readFileSync(pidFile, 'utf-8');
    return JSON.parse(content) as SessionPidInfo;
  } catch {
    return null;
  }
}

/**
 * Get session info by session ID
 */
export function getSessionBySessionId(sessionId: string): SessionPidInfo | null {
  const sessions = getAllActiveSessions();
  return sessions.find(s => s.sessionId === sessionId) || null;
}

// ============================================================================
// Process Utilities
// ============================================================================

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Signal 0 checks if process exists without sending signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get count of active sessions
 */
export function getActiveSessionCount(): number {
  return getAllActiveSessions().length;
}

/**
 * Check if there's a session for current PID
 */
export function hasCurrentSession(): boolean {
  return existsSync(getPidFile(process.pid));
}

// ============================================================================
// Compaction
// ============================================================================

/**
 * Log a compaction event
 */
export function logCompaction(action: string, count: number): void {
  const logFile = join(getSessionDir(), COMPACTION_LOG);
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${action}: ${count} sessions\n`;

  try {
    // Append to compaction log
    import('fs/promises').then(fs => {
      fs.open(logFile, 'a').then((fd: any) => {
        fd.write(entry).finally(() => fd.close());
      });
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Clean up stale sessions (processes that no longer exist)
 */
export function cleanupStaleSessions(): number {
  const dir = getSessionDir();

  if (!existsSync(dir)) {
    return 0;
  }

  const files = readdirSync(dir).filter((f: string) => f.endsWith('.json') && f !== COMPACTION_LOG);
  let cleaned = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(dir, file), 'utf-8');
      const info = JSON.parse(content) as SessionPidInfo;

      if (!isProcessRunning(info.pid)) {
        unlinkSync(join(dir, file));
        cleaned++;
      }
    } catch {
      // Skip corrupted files
    }
  }

  if (cleaned > 0) {
    logCompaction('cleanup', cleaned);
  }

  return cleaned;
}

// ============================================================================
// CLI Info
// ============================================================================

/**
 * Print session info for debugging
 */
export function printSessionInfo(): string {
  const sessions = getAllActiveSessions();

  if (sessions.length === 0) {
    return 'No active sessions';
  }

  const lines = [`Active sessions: ${sessions.length}`, ''];

  for (const session of sessions) {
    lines.push(`  PID ${session.pid}: ${session.sessionId.slice(0, 8)}...`);
    lines.push(`    CWD: ${session.cwd}`);
    lines.push(`    Started: ${session.procStart}`);
    lines.push('');
  }

  return lines.join('\n');
}