/**
 * Ephemeral Messages Filter
 *
 * Provides utilities for filtering transient UI messages that should not be persisted.
 * Based on Claude Code's EPHEMERAL_PROGRESS_TYPES pattern.
 *
 * These are high-frequency, UI-only messages that create noise in the transcript
 * and are not meaningful for session resumption.
 */

import type { SessionMessage } from './session-types.js';

/**
 * Ephemeral message types - UI-only, not persisted to disk.
 * These types are filtered out during session save and resume.
 */
export const EPHEMERAL_TYPES: ReadonlySet<string> = new Set([
  'progress',         // Generic progress updates
  'bash_progress',    // Bash command progress (high frequency: 1/sec)
  'sleep_progress',   // Sleep command progress
  'mcp_progress',     // MCP server progress updates
] as const);

/**
 * Check if a message is ephemeral (UI-only, not persisted).
 */
export function isEphemeralMessage(entry: SessionMessage): boolean {
  // Check explicit flag first
  if (entry.isEphemeral === true) {
    return true;
  }

  // Check type against known ephemeral types
  return EPHEMERAL_TYPES.has(entry.type);
}

/**
 * Filter ephemeral messages from a message array.
 * Returns only messages that should be persisted.
 */
export function filterEphemeralMessages<T extends SessionMessage>(
  messages: T[]
): T[] {
  return messages.filter(msg => !isEphemeralMessage(msg));
}

/**
 * Check if a message type is ephemeral.
 */
export function isEphemeralType(type: string): boolean {
  return EPHEMERAL_TYPES.has(type);
}

/**
 * Get all known ephemeral types.
 */
export function getEphemeralTypes(): string[] {
  return Array.from(EPHEMERAL_TYPES);
}

/**
 * Categorize messages into persistent vs ephemeral.
 * Useful for debugging and analytics.
 */
export function categorizeMessages(messages: SessionMessage[]): {
  persistent: SessionMessage[];
  ephemeral: SessionMessage[];
} {
  const persistent: SessionMessage[] = [];
  const ephemeral: SessionMessage[] = [];

  for (const msg of messages) {
    if (isEphemeralMessage(msg)) {
      ephemeral.push(msg);
    } else {
      persistent.push(msg);
    }
  }

  return { persistent, ephemeral };
}

/**
 * Count ephemeral messages in a message array.
 */
export function countEphemeralMessages(messages: SessionMessage[]): number {
  return messages.filter(msg => isEphemeralMessage(msg)).length;
}

/**
 * Get the ratio of ephemeral to total messages.
 * Useful for understanding session noise levels.
 */
export function getEphemeralRatio(messages: SessionMessage[]): number {
  if (messages.length === 0) return 0;
  return countEphemeralMessages(messages) / messages.length;
}

/**
 * Create an ephemeral message wrapper.
 * Utility for marking messages as ephemeral during runtime.
 */
export function markAsEphemeral<T extends SessionMessage>(msg: T): T {
  return {
    ...msg,
    isEphemeral: true,
  };
}

/**
 * Remove ephemeral flag from a message.
 * Utility for testing and debugging.
 */
export function unmarkEphemeral<T extends SessionMessage>(msg: T): T {
  const { isEphemeral, ...rest } = msg;
  return rest as T;
}

/**
 * Ephemeral message statistics for debugging.
 */
export interface EphemeralStats {
  total: number;
  persistent: number;
  ephemeral: number;
  ratio: number;
  byType: Record<string, number>;
}

/**
 * Get detailed statistics about ephemeral messages.
 */
export function getEphemeralStats(messages: SessionMessage[]): EphemeralStats {
  const stats: EphemeralStats = {
    total: messages.length,
    persistent: 0,
    ephemeral: 0,
    ratio: 0,
    byType: {},
  };

  // Initialize counts for all types
  for (const type of EPHEMERAL_TYPES) {
    stats.byType[type] = 0;
  }

  for (const msg of messages) {
    if (isEphemeralMessage(msg)) {
      stats.ephemeral++;
      if (stats.byType[msg.type] !== undefined) {
        stats.byType[msg.type]++;
      }
    } else {
      stats.persistent++;
    }
  }

  stats.ratio = stats.total > 0 ? stats.ephemeral / stats.total : 0;

  return stats;
}