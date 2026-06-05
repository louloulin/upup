/**
 * Tombstone Handler - Loucode-style orphan message handling
 *
 * Features:
 * - Mark failed streaming messages as tombstones
 * - Prevent API errors from corrupting context
 * - Filter tombstones during retrieval
 * - Orphan detection on streaming failure
 *
 * Reference: Loucode's tombstone handling in query loop
 */

import { info, warn } from '@upup/utils/logging';

// ============================================================================
// Types
// ============================================================================

/**
 * Tombstone reasons
 */
export type TombstoneReason =
  | 'streaming_failed'   // Streaming error occurred
  | 'orphaned'          // Message lost during processing
  | 'obsolete'          // Outdated/duplicate message
  | 'cancelled'         // Cancelled by user/abort
  | 'context_overflow'; // Removed due to context limit

/**
 * Tombstone message
 */
export interface TombstoneMessage {
  type: 'tombstone';
  originalId: string;
  reason: TombstoneReason;
  timestamp: number;
  metadata?: {
    toolName?: string;
    errorMessage?: string;
    originalContent?: string;
  };
}

/**
 * Message with optional tombstone
 */
export interface MessageWithTombstone {
  id: string;
  type: string;
  tombstone?: TombstoneMessage;
  content?: string;
}

/**
 * Streaming failure context
 */
export interface StreamingFailureContext {
  messageId: string;
  toolName?: string;
  partialContent?: string;
  error: Error;
}

// ============================================================================
// Tombstone Creation
// ============================================================================

/**
 * Create a tombstone for a failed message
 */
export function createTombstone(
  originalId: string,
  reason: TombstoneReason,
  metadata?: TombstoneMessage['metadata']
): TombstoneMessage {
  return {
    type: 'tombstone',
    originalId,
    reason,
    timestamp: Date.now(),
    metadata,
  };
}

/**
 * Create tombstone for streaming failure
 */
export function createStreamingTombstone(
  context: StreamingFailureContext
): TombstoneMessage {
  return createTombstone(context.messageId, 'streaming_failed', {
    toolName: context.toolName,
    errorMessage: context.error.message,
    originalContent: context.partialContent,
  });
}

/**
 * Create tombstone for orphaned message
 */
export function createOrphanedTombstone(
  messageId: string,
  reason: string = 'orphaned'
): TombstoneMessage {
  return createTombstone(messageId, 'orphaned', {
    errorMessage: reason,
  });
}

// ============================================================================
// Tombstone Filtering
// ============================================================================

/**
 * Filter tombstones from messages (for display)
 */
export function filterTombstones<T extends { id: string; tombstone?: TombstoneMessage }>(
  messages: T[]
): T[] {
  return messages.filter(msg => {
    if (msg.tombstone) {
      // Keep streaming_failed tombstones for debugging
      if (msg.tombstone.reason === 'streaming_failed') {
        warn('agent', `Filtered tombstone: ${msg.id} (${msg.tombstone.reason})`);
      }
      return false;
    }
    return true;
  });
}

/**
 * Extract tombstones from messages
 */
export function extractTombstones<T extends { id: string; tombstone?: TombstoneMessage }>(
  messages: T[]
): TombstoneMessage[] {
  return messages
    .filter(msg => msg.tombstone !== undefined)
    .map(msg => msg.tombstone!);
}

/**
 * Check if message is a tombstone
 */
export function isTombstone<T extends { tombstone?: TombstoneMessage }>(msg: T): boolean {
  return msg.tombstone !== undefined;
}

// ============================================================================
// Tombstone Statistics
// ============================================================================

/**
 * Get tombstone statistics
 */
export function getTombstoneStats(
  tombstones: TombstoneMessage[]
): {
  total: number;
  byReason: Record<TombstoneReason, number>;
  oldest?: number;
  newest?: number;
} {
  const byReason: Record<TombstoneReason, number> = {
    streaming_failed: 0,
    orphaned: 0,
    obsolete: 0,
    cancelled: 0,
    context_overflow: 0,
  };

  let oldest: number | undefined;
  let newest: number | undefined;

  for (const t of tombstones) {
    byReason[t.reason]++;
    if (!oldest || t.timestamp < oldest) oldest = t.timestamp;
    if (!newest || t.timestamp > newest) newest = t.timestamp;
  }

  return {
    total: tombstones.length,
    byReason,
    oldest,
    newest,
  };
}

// ============================================================================
// Tombstone Registry
// ============================================================================

/**
 * Registry for tracking tombstones across a session
 */
export class TombstoneRegistry {
  private tombstones: Map<string, TombstoneMessage> = new Map();
  private maxTombstones = 100;

  /**
   * Add a tombstone
   */
  add(tombstone: TombstoneMessage): void {
    this.tombstones.set(tombstone.originalId, tombstone);

    // Cleanup old tombstones
    if (this.tombstones.size > this.maxTombstones) {
      const oldest = Array.from(this.tombstones.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        this.tombstones.delete(oldest[0]);
      }
    }

    info('agent', `Tombstone added: ${tombstone.originalId} (${tombstone.reason})`);
  }

  /**
   * Get a tombstone by original ID
   */
  get(originalId: string): TombstoneMessage | undefined {
    return this.tombstones.get(originalId);
  }

  /**
   * Check if an ID has a tombstone
   */
  has(originalId: string): boolean {
    return this.tombstones.has(originalId);
  }

  /**
   * Get all tombstones
   */
  getAll(): TombstoneMessage[] {
    return Array.from(this.tombstones.values());
  }

  /**
   * Get tombstone count
   */
  get count(): number {
    return this.tombstones.size;
  }

  /**
   * Clear all tombstones
   */
  clear(): void {
    this.tombstones.clear();
  }

  /**
   * Remove tombstones older than timestamp
   */
  removeOlderThan(timestamp: number): number {
    let removed = 0;
    for (const [id, t] of this.tombstones) {
      if (t.timestamp < timestamp) {
        this.tombstones.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let tombstoneRegistry: TombstoneRegistry | null = null;

export function getTombstoneRegistry(): TombstoneRegistry {
  if (!tombstoneRegistry) {
    tombstoneRegistry = new TombstoneRegistry();
  }
  return tombstoneRegistry;
}

export function resetTombstoneRegistry(): void {
  tombstoneRegistry = null;
}
