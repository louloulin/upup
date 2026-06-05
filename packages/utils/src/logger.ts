/**
 * Logger Adapter - Bridges unified logging to CLI/TUI
 *
 * This module provides backward compatibility for components that use the old logger API.
 * CLI logger does NOT output to console (TUI handles its own output).
 * Only writes to file via unified logging system.
 */

import { createLogger, type LogLevel, type LogCategory, type LogEntry } from './logging/logger.js';

// Create a silent logger for CLI (no console output, only file)
const silentLogger = createLogger({
  enableConsole: false,  // CLI/TUI handles its own output
  enableFile: true,
  enableMemory: false,
});

type LogSubscriber = (logs: LogEntry[]) => void;

class DebugLogger {
  private logs: LogEntry[] = [];
  private subscribers: Set<LogSubscriber> = new Set();
  private maxLogs = 50;

  private emit() {
    this.subscribers.forEach(fn => fn([...this.logs]));
  }

  debug(message: string, data?: unknown) {
    // Write to file only
    silentLogger.debug('default', message, data);
    this.addLog('debug', message, data);
  }

  info(message: string, data?: unknown) {
    // Write to file only
    silentLogger.info('default', message, data);
    this.addLog('info', message, data);
  }

  warn(message: string, data?: unknown) {
    // Write to file only
    silentLogger.warn('default', message, data);
    this.addLog('warn', message, data);
  }

  error(message: string, data?: unknown) {
    // Write to file only as error
    silentLogger.error('default', message);
    this.addLog('error', message, data);
  }

  private addLog(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      category: 'default',
      message,
      data,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    this.emit();
  }

  subscribe(fn: LogSubscriber): () => void {
    this.subscribers.add(fn);
    fn([...this.logs]);
    return () => this.subscribers.delete(fn);
  }

  clear() {
    this.logs = [];
    this.emit();
  }
}

// Singleton instance
export const logger = new DebugLogger();
export type { LogEntry, LogLevel };
