/**
 * Memory Access Audit Logger
 *
 * Provides audit trail for memory access operations (read/write/search).
 * Required for investment research compliance and security tracking.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { upupPath } from '../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Audit log entry for memory operations
 */
export interface MemoryAuditEntry {
  timestamp: string;
  operation: 'read' | 'write' | 'search' | 'update' | 'delete';
  category?: string;
  query?: string;
  resultCount?: number;
  sessionId?: string;
  toolName?: string;
}

/**
 * Audit logger for memory access operations
 */
export class MemoryAuditLogger {
  private auditPath: string;

  constructor(auditPath?: string) {
    const baseDir = auditPath
      ? dirname(auditPath)
      : join(process.cwd(), '.upup', 'logs');
    const fileName = auditPath
      ? auditPath
      : join(baseDir, 'memory-audit.log');

    this.auditPath = fileName;

    // Ensure directory exists
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
  }

  /**
   * Log a memory read operation
   */
  logRead(
    category?: string,
    resultCount?: number,
    sessionId?: string,
    toolName?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      operation: 'read',
      category,
      resultCount,
      sessionId,
      toolName,
    });
  }

  /**
   * Log a memory search operation
   */
  logSearch(
    query?: string,
    resultCount?: number,
    sessionId?: string,
    toolName?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      operation: 'search',
      query,
      resultCount,
      sessionId,
      toolName,
    });
  }

  /**
   * Log a memory write operation
   */
  logWrite(
    category?: string,
    sessionId?: string,
    toolName?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      operation: 'write',
      category,
      sessionId,
      toolName,
    });
  }

  /**
   * Log a memory update operation
   */
  logUpdate(
    category?: string,
    sessionId?: string,
    toolName?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      operation: 'update',
      category,
      sessionId,
      toolName,
    });
  }

  /**
   * Log a memory delete operation
   */
  logDelete(
    category?: string,
    sessionId?: string,
    toolName?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      operation: 'delete',
      category,
      sessionId,
      toolName,
    });
  }

  /**
   * Write an audit entry to the log file
   */
  private log(entry: MemoryAuditEntry): void {
    const line = JSON.stringify(entry) + '\n';
    try {
      appendFileSync(this.auditPath, line, 'utf-8');
    } catch (error) {
      // Silently fail if we can't write to audit log (don't block memory operations)
      console.error('Failed to write memory audit log:', error);
    }
  }

  /**
   * Read audit log entries (for admin/debugging)
   */
  readAuditLog(limit?: number): MemoryAuditEntry[] {
    try {
      if (!existsSync(this.auditPath)) {
        return [];
      }

      const content = readFileSync(this.auditPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      const entries = lines.map(line => {
        try {
          return JSON.parse(line) as MemoryAuditEntry;
        } catch {
          return null;
        }
      }).filter((e): e is MemoryAuditEntry => e !== null);

      return limit ? entries.slice(-limit) : entries;
    } catch {
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  getStats(): { totalOperations: number; byOperation: Record<string, number> } {
    const entries = this.readAuditLog();
    const byOperation: Record<string, number> = {};

    for (const entry of entries) {
      byOperation[entry.operation] = (byOperation[entry.operation] || 0) + 1;
    }

    return {
      totalOperations: entries.length,
      byOperation,
    };
  }
}

// Global audit logger instance
let auditLogger: MemoryAuditLogger | null = null;

/**
 * Get the global audit logger instance
 */
export function getAuditLogger(): MemoryAuditLogger {
  if (!auditLogger) {
    auditLogger = new MemoryAuditLogger();
  }
  return auditLogger;
}

/**
 * Reset the audit logger (for testing)
 */
export function resetAuditLogger(): void {
  auditLogger = null;
}
