/**
 * UpUp Unified Logging System
 *
 * Features:
 * - Multiple log levels (debug, info, warn, error)
 * - Category-based logging (memory, agent, tools, subagent, etc.)
 * - File rotation (daily + size-based)
 * - Console output with colors
 * - JSON structured logging for file output
 * - In-memory log buffer for debugging
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getUpupDir } from '../paths.js';

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'memory' | 'agent' | 'tools' | 'subagent' | 'mcp' | 'daemon' | 'system' | 'default' | 'compaction' | 'orchestrator' | 'post-cleanup' | 'session-compact' | 'bash' | 'hooks';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
  duration?: number; // For performance tracking
  error?: {
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableMemory: boolean;
  logDir: string;
  maxFileSizeMB: number;
  maxFiles: number;
  categories: Record<LogCategory, boolean>;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_DIR = join(getUpupDir(), 'logs');
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  enableConsole: false,  // Default to silent - CLI/TUI handles output
  enableFile: true,
  enableMemory: true,
  logDir: LOG_DIR,
  maxFileSizeMB: 10,
  maxFiles: 5,
  categories: {
    memory: true,
    agent: true,
    tools: true,
    subagent: true,
    mcp: true,
    daemon: true,
    system: true,
    default: true,
    compaction: true,
    orchestrator: true,
    'post-cleanup': true,
    'session-compact': true,
    bash: true,
    hooks: true,
  },
};

// ============================================================================
// Formatters
// ============================================================================

function formatTimestamp(date: Date): string {
  return date.toISOString();
}

function formatConsoleMessage(entry: LogEntry): string {
  const timestamp = entry.timestamp.slice(11, 19); // HH:mm:ss
  const category = entry.category.toUpperCase().padEnd(8);
  const level = entry.level.toUpperCase().padEnd(5);
  const color = getLevelColor(entry.level);

  let msg = `${color}${timestamp} [${category}] ${level} ${entry.message}${getResetColor()}`;

  if (entry.data !== undefined) {
    const dataStr = typeof entry.data === 'object'
      ? JSON.stringify(entry.data)
      : String(entry.data);
    msg += ` ${color}${dataStr}${getResetColor()}`;
  }

  if (entry.error) {
    msg += `\n${color}  Error: ${entry.error.message}${getResetColor()}`;
    if (entry.error.stack) {
      msg += `\n${color}  Stack: ${entry.error.stack.slice(0, 500)}${getResetColor()}`;
    }
  }

  if (entry.duration !== undefined) {
    msg += ` ${color}(${entry.duration}ms)${getResetColor()}`;
  }

  return msg;
}

function formatJsonMessage(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'debug': return '\x1b[36m';  // Cyan
    case 'info': return '\x1b[32m';   // Green
    case 'warn': return '\x1b[33m';  // Yellow
    case 'error': return '\x1b[31m'; // Red
  }
}

function getResetColor(): string {
  return '\x1b[0m';
}

// ============================================================================
// File Manager
// ============================================================================

class LogFileManager {
  private config: LoggerConfig;
  private currentFile: string = '';
  private currentFileSize: number = 0;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private getLogFilename(date: Date): string {
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    return join(this.config.logDir, `upup-${dateStr}.log`);
  }

  private rotateIfNeeded(): void {
    const today = new Date();
    const newFile = this.getLogFilename(today);

    if (newFile !== this.currentFile) {
      this.currentFile = newFile;
      this.currentFileSize = 0;
      this.cleanOldFiles();
    }

    const maxSize = this.config.maxFileSizeMB * 1024 * 1024;
    if (this.currentFileSize > maxSize) {
      this.rotateFile();
    }
  }

  private rotateFile(): void {
    const date = new Date();
    const timestamp = date.toISOString().replace(/[:.]/g, '-');
    const rotatedFile = this.currentFile.replace('.log', `-${timestamp}.log`);

    // Note: In production, we'd move/rename the file
    this.currentFile = rotatedFile;
    this.currentFileSize = 0;
  }

  private cleanOldFiles(): void {
    // Note: In production, implement file cleanup based on maxFiles
  }

  write(entry: LogEntry): void {
    if (!this.config.enableFile) return;

    this.rotateIfNeeded();

    const line = formatJsonMessage(entry) + '\n';
    try {
      appendFileSync(this.currentFile, line, 'utf-8');
      this.currentFileSize += line.length;
    } catch (e) {
      console.error('[Logger] Failed to write to file:', e);
    }
  }
}

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private config: LoggerConfig;
  private fileManager: LogFileManager;
  private memoryLogs: LogEntry[] = [];
  private maxMemoryLogs = 500;
  private logIdCounter = 0;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fileManager = new LogFileManager(this.config);
  }

  private shouldLog(level: LogLevel, category: LogCategory): boolean {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return false;
    }
    if (!this.config.categories[category]) {
      return false;
    }
    return true;
  }

  createEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: unknown,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      id: `log-${++this.logIdCounter}-${Date.now()}`,
      timestamp: formatTimestamp(new Date()),
      level,
      category,
      message,
      data,
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level, entry.category)) {
      return;
    }

    // Console output
    if (this.config.enableConsole) {
      console.log(formatConsoleMessage(entry));
    }

    // File output
    this.fileManager.write(entry);

    // Memory buffer
    if (this.config.enableMemory) {
      this.memoryLogs.push(entry);
      if (this.memoryLogs.length > this.maxMemoryLogs) {
        this.memoryLogs = this.memoryLogs.slice(-this.maxMemoryLogs);
      }
    }
  }

  // Public API
  debug(category: LogCategory, message: string, data?: unknown): void {
    this.log(this.createEntry('debug', category, message, data));
  }

  info(category: LogCategory, message: string, data?: unknown): void {
    this.log(this.createEntry('info', category, message, data));
  }

  warn(category: LogCategory, message: string, data?: unknown): void {
    this.log(this.createEntry('warn', category, message, data));
  }

  error(category: LogCategory, message: string, error?: Error, data?: unknown): void {
    this.log(this.createEntry('error', category, message, data, error));
  }

  // Performance logging
  perf(category: LogCategory, message: string, durationMs: number, data?: unknown): void {
    const entry = this.createEntry('info', category, message, data);
    entry.duration = durationMs;
    this.log(entry);
  }

  // Get recent logs
  getLogs(options?: {
    level?: LogLevel;
    category?: LogCategory;
    limit?: number;
  }): LogEntry[] {
    let logs = this.memoryLogs;

    if (options?.level) {
      logs = logs.filter(l => l.level === options.level);
    }
    if (options?.category) {
      logs = logs.filter(l => l.category === options.category);
    }
    if (options?.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  // Clear logs
  clear(): void {
    this.memoryLogs = [];
  }

  // Update config
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setCategory(category: LogCategory, enabled: boolean): void {
    this.config.categories[category] = enabled;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

export function createLogger(config: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function log(
  category: LogCategory,
  level: LogLevel,
  message: string,
  data?: unknown
): void {
  getLogger().log(getLogger().createEntry(level, category, message, data));
}

export function debug(category: LogCategory, message: string, data?: unknown): void {
  getLogger().debug(category, message, data);
}

export function info(category: LogCategory, message: string, data?: unknown): void {
  getLogger().info(category, message, data);
}

export function warn(category: LogCategory, message: string, data?: unknown): void {
  getLogger().warn(category, message, data);
}

export function error(category: LogCategory, message: string, error?: Error, data?: unknown): void {
  getLogger().error(category, message, error, data);
}

export function perf(category: LogCategory, message: string, durationMs: number, data?: unknown): void {
  getLogger().perf(category, message, durationMs, data);
}


