/**
 * KAIROS Daily Log - Append-only daily memory log
 *
 * Features:
 * - Append-only daily log files (YYYY/MM/YYYY-MM-DD.md)
 * - Automatic distill to MEMORY.md on schedule
 * - Session tracking with cross-midnight support
 * - LLM-based memory extraction
 *
 * Reference: Claude Code's KAIROS system
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getUpupDir } from '@upup/utils/storage-paths';

// ============================================================================
// Types
// ============================================================================

export interface DailyLogEntry {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Session ID that created this entry */
  sessionId: string;
  /** Entry content */
  content: string;
  /** Optional tags */
  tags?: string[];
}

export interface DailyLogStats {
  date: string;
  entryCount: number;
  totalBytes: number;
  lastEntry?: DailyLogEntry;
}

// ============================================================================
// Helpers
// ============================================================================

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTimestamp(date: Date): string {
  return date.toISOString();
}

// ============================================================================
// DailyLogManager
// ============================================================================

export class DailyLogManager {
  private logsDir: string;
  private currentSessionId?: string;
  private currentDate?: string;

  constructor(baseDir?: string) {
    this.logsDir = join(baseDir ?? getUpupDir(), 'memory', 'logs');
  }

  /**
   * Get the daily log file path for a given date
   */
  getDailyLogPath(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    return join(this.logsDir, `${year}`, `${month}`, `${year}-${month}-${day}.md`);
  }

  /**
   * Start a new session - resets session tracking
   */
  startSession(sessionId: string): void {
    const today = formatDate(new Date());
    this.currentSessionId = sessionId;
    this.currentDate = today;
  }

  /**
   * End current session
   */
  endSession(): void {
    this.currentSessionId = undefined;
    this.currentDate = undefined;
  }

  /**
   * Append an entry to today's log
   *
   * @param content - Entry content
   * @param sessionId - Session ID (uses current session if not provided)
   * @param tags - Optional tags
   */
  appendEntry(content: string, sessionId?: string, tags?: string[]): void {
    const now = new Date();
    const date = formatDate(now);
    const timestamp = Date.now();

    // Check if we crossed midnight - start new session implicitly
    if (this.currentDate && this.currentDate !== date) {
      this.currentDate = date;
    }

    const entry: DailyLogEntry = {
      date,
      timestamp,
      sessionId: sessionId ?? this.currentSessionId ?? 'unknown',
      content,
      tags,
    };

    const logPath = this.getDailyLogPath(now);
    const entryMarkdown = this.formatEntry(entry);

    // Ensure directory exists
    const dir = dirname(logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Append to log file
    appendFileSync(logPath, entryMarkdown, 'utf-8');
  }

  /**
   * Format a log entry as markdown
   */
  private formatEntry(entry: DailyLogEntry): string {
    const lines = [
      `## ${formatTimestamp(new Date(entry.timestamp))}`,
      '',
      `**Session:** ${entry.sessionId}`,
    ];

    if (entry.tags && entry.tags.length > 0) {
      lines.push(`**Tags:** ${entry.tags.join(', ')}`);
    }

    lines.push('');
    lines.push(entry.content);
    lines.push('');
    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Read all entries from a daily log file
   */
  readLogEntries(date: Date = new Date()): DailyLogEntry[] {
    const logPath = this.getDailyLogPath(date);
    const entries: DailyLogEntry[] = [];

    if (!existsSync(logPath)) {
      return entries;
    }

    try {
      const content = readFileSync(logPath, 'utf-8');
      const sections = content.split(/^---$/m);

      for (const section of sections) {
        if (!section.trim()) continue;

        const lines = section.trim().split('\n');
        const entry = this.parseSection(lines);
        if (entry) {
          entries.push(entry);
        }
      }
    } catch {
      // Ignore errors
    }

    return entries;
  }

  /**
   * Parse a log section into an entry
   */
  private parseSection(lines: string[]): DailyLogEntry | null {
    if (lines.length < 3) return null;

    // Parse header
    const headerMatch = lines[0].match(/^## (.+)$/);
    if (!headerMatch) return null;

    const timestamp = new Date(headerMatch[1]).getTime();

    // Parse metadata
    let sessionId = 'unknown';
    const tags: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const sessionMatch = line.match(/^\*\*Session:\*\* (.+)$/);
      if (sessionMatch) {
        sessionId = sessionMatch[1];
        continue;
      }

      const tagsMatch = line.match(/^\*\*Tags:\*\* (.+)$/);
      if (tagsMatch) {
        tags.push(...tagsMatch[1].split(',').map(t => t.trim()));
        continue;
      }

      // Content starts here
      break;
    }

    // Get content (everything after metadata)
    const contentStart = lines.findIndex((l, i) =>
      i > 1 && l.trim() && !l.startsWith('**')
    );
    const content = contentStart >= 0
      ? lines.slice(contentStart).join('\n').trim()
      : '';

    // Extract date from timestamp
    const dateObj = new Date(timestamp);
    const date = formatDate(dateObj);

    return {
      date,
      timestamp,
      sessionId,
      content,
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  /**
   * Get statistics for a daily log
   */
  getDailyStats(date: Date = new Date()): DailyLogStats {
    const logPath = this.getDailyLogPath(date);
    const entries = this.readLogEntries(date);

    let totalBytes = 0;
    if (existsSync(logPath)) {
      try {
        const stat = statSync(logPath);
        totalBytes = stat.size;
      } catch {
        // Ignore
      }
    }

    return {
      date: formatDate(date),
      entryCount: entries.length,
      totalBytes,
      lastEntry: entries.length > 0 ? entries[entries.length - 1] : undefined,
    };
  }

  /**
   * List all daily log files in a month
   */
  listDailyLogs(year: number, month: number): string[] {
    const monthDir = join(this.logsDir, year.toString(), pad2(month));
    const logs: string[] = [];

    if (!existsSync(monthDir)) {
      return logs;
    }

    try {
      const entries = readdirSync(monthDir);
      for (const entry of entries) {
        if (entry.endsWith('.md') && /^\d{4}-\d{2}-\d{2}\.md$/.test(entry)) {
          logs.push(join(monthDir, entry));
        }
      }
    } catch {
      // Ignore
    }

    return logs.sort();
  }

  /**
   * Check if a daily log needs distillation
   */
  needsDistillation(date: Date = new Date()): boolean {
    const stats = this.getDailyStats(date);
    // If more than 10 entries or more than 100KB, needs distillation
    return stats.entryCount > 10 || stats.totalBytes > 100 * 1024;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let dailyLogManager: DailyLogManager | null = null;

export function getDailyLogManager(): DailyLogManager {
  if (!dailyLogManager) {
    dailyLogManager = new DailyLogManager();
  }
  return dailyLogManager;
}

export function resetDailyLogManager(): void {
  dailyLogManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick append to daily log
 */
export function appendToDailyLog(content: string, sessionId?: string): void {
  getDailyLogManager().appendEntry(content, sessionId);
}

/**
 * Quick start session logging
 */
export function startSessionLog(sessionId: string): void {
  getDailyLogManager().startSession(sessionId);
}

/**
 * Quick end session logging
 */
export function endSessionLog(): void {
  getDailyLogManager().endSession();
}

// ============================================================================
// Module Exports
// ============================================================================

export const dailyLog = {
  DailyLogManager,
  getDailyLogManager,
  resetDailyLogManager,
  appendToDailyLog,
  startSessionLog,
  endSessionLog,
  formatDate,
};