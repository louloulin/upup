/**
 * Legacy DebugLogger wrapper for the DebugPanel UI.
 * Uses @upup/utils/logging as the underlying logger and exposes a `subscribe`
 * API that yields the in-memory log buffer for live debugging.
 */
import { getLogger, type LogEntry, type LogLevel } from '@upup/utils/logging';

type LogListener = (entries: readonly LogEntry[]) => void;

class DebugLogger {
  private listeners: Set<LogListener> = new Set();

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener(this.getEntries());
    return () => this.listeners.delete(listener);
  }

  getEntries(): readonly LogEntry[] {
    return (getLogger() as { entries?: readonly LogEntry[] }).entries ?? [];
  }

  info(category: string, message: string, data?: unknown): void {
    getLogger().info(category as never, message, data);
    this.emit();
  }

  warn(category: string, message: string, data?: unknown): void {
    getLogger().warn(category as never, message, data);
    this.emit();
  }

  error(category: string, message: string, data?: unknown): void {
    getLogger().error(category as never, message, undefined, data);
    this.emit();
  }

  debug(category: string, message: string, data?: unknown): void {
    getLogger().debug(category as never, message, data);
    this.emit();
  }

  private emit(): void {
    const entries = this.getEntries();
    for (const listener of this.listeners) {
      listener(entries);
    }
  }
}

export const logger = new DebugLogger();
export type { LogEntry, LogLevel };
