/**
 * Post-Compact Cleanup - Post-compaction message cleanup
 *
 * Called after compaction completes to clean up:
 * - Duplicate tool results
 * - Orphaned tool calls
 * - Empty marker messages
 * - Message sequence gaps
 * - Conversation drift markers
 *
 * Reference: Loucode's postCompactCleanup service
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { info } from '../../utils/logging/logger.js';

// ============================================================================
// Cleanup Options
// ============================================================================

export interface PostCleanupConfig {
  /** Remove duplicate tool results */
  removeDuplicates?: boolean;
  /** Remove orphaned tool calls */
  removeOrphans?: boolean;
  /** Remove empty marker messages */
  removeEmptyMarkers?: boolean;
  /** Remove message sequence gaps */
  fixSequenceGaps?: boolean;
  /** Maximum consecutive tool messages */
  maxConsecutiveToolMessages?: number;
}

const DEFAULT_CONFIG: Required<PostCleanupConfig> = {
  removeDuplicates: true,
  removeOrphans: true,
  removeEmptyMarkers: true,
  fixSequenceGaps: true,
  maxConsecutiveToolMessages: 8,
};

// ============================================================================
// Cleanup Result
// ============================================================================

export interface PostCleanupResult {
  /** Messages after cleanup */
  messages: BaseMessage[];
  /** Total messages removed */
  removed: number;
  /** Breakdown of what was removed */
  removedByType: {
    duplicates: number;
    orphans: number;
    emptyMarkers: number;
    sequenceGaps: number;
    consecutiveTools: number;
  };
  /** IDs of removed messages (for debugging) */
  removedIds: string[];
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Normalize tool result for comparison
 */
function normalizeForComparison(content: string | object): string {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  // Remove timestamps, IDs, and other noise
  return text
    .replace(/\d{13}/g, 'TIMESTAMP') // Epoch timestamps
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID') // UUIDs
    .replace(/[ \t]+/g, ' ') // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Find duplicate tool results
 */
function findDuplicates(messages: BaseMessage[]): number[] {
  const seen = new Map<string, number>();
  const duplicateIndices: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg._getType() !== 'tool') continue;

    const toolMsg = msg as ToolMessage;
    const key = `${toolMsg.name}:${normalizeForComparison(toolMsg.content)}`;

    if (seen.has(key)) {
      // Keep the first occurrence, mark others as duplicates
      duplicateIndices.push(i);
    } else {
      seen.set(key, i);
    }
  }

  return duplicateIndices;
}

// ============================================================================
// Orphan Detection
// ============================================================================

/**
 * Find orphaned tool calls (tool messages without matching tool call in preceding AI message)
 */
function findOrphans(messages: BaseMessage[]): number[] {
  const orphanIndices: number[] = [];
  const toolCallIds = new Set<string>();

  // Collect all tool call IDs from AI messages
  for (const msg of messages) {
    if (msg instanceof AIMessage && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id) {
          toolCallIds.add(tc.id);
        }
      }
    }
  }

  // Find tool messages whose tool_call_id is not in the set
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg instanceof ToolMessage) {
      if (!toolCallIds.has(msg.tool_call_id)) {
        orphanIndices.push(i);
      }
    }
  }

  return orphanIndices;
}

// ============================================================================
// Empty Marker Detection
// ============================================================================

/**
 * Find empty or marker-only messages
 */
function findEmptyMarkers(messages: BaseMessage[]): number[] {
  const emptyIndices: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);

    // Check for cleared/marker content
    const markerPatterns = [
      '[Old tool result content cleared]',
      '[content truncated]',
      '[compacted]',
      '""',
      "''",
    ];

    const isMarker = markerPatterns.some(p => content.includes(p));
    const isEmpty = content.trim().length < 5;

    if (isMarker || isEmpty) {
      emptyIndices.push(i);
    }
  }

  return emptyIndices;
}

// ============================================================================
// Consecutive Tool Message Detection
// ============================================================================

/**
 * Find indices of tool messages that exceed max consecutive limit
 */
function findExcessiveConsecutiveTools(messages: BaseMessage[], maxConsecutive: number): number[] {
  const indicesToRemove: number[] = [];

  let consecutiveCount = 0;
  let consecutiveStart = -1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isTool = msg._getType() === 'tool';

    if (isTool) {
      if (consecutiveStart === -1) {
        consecutiveStart = i;
      }
      consecutiveCount++;

      // If we've exceeded the limit, mark all but the first `maxConsecutive` for removal
      if (consecutiveCount > maxConsecutive) {
        indicesToRemove.push(i);
      }
    } else {
      consecutiveCount = 0;
      consecutiveStart = -1;
    }
  }

  return indicesToRemove;
}

// ============================================================================
// Sequence Gap Detection
// ============================================================================

/**
 * Find sequence gaps (adjacent messages of the same type that could be merged)
 */
function findSequenceGaps(messages: BaseMessage[]): number[] {
  const gapIndices: number[] = [];

  for (let i = 1; i < messages.length - 1; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];
    const next = messages[i + 1];

    // Find AI messages between tool messages with no meaningful content
    if (
      curr instanceof AIMessage &&
      prev._getType() === 'tool' &&
      next._getType() === 'tool'
    ) {
      const content = typeof curr.content === 'string'
        ? curr.content
        : JSON.stringify(curr.content);

      // If the AI message is just a filler/continuation
      const fillerPatterns = [
        /^(Let me|I'?ll|Processing|Analyzing|Searching|Fetching)/i,
        /^Okay,? (here'?s|let'?s|I)/,
        /^Here'?s (the|what)/,
      ];

      if (fillerPatterns.some(p => p.test(content.trim()))) {
        // Check if next tool message handles what this AI message was "about"
        const nextTool = next as ToolMessage;
        const nextName = nextTool.name ?? '';

        if (
          content.includes('result') ||
          content.includes(nextName) ||
          content.length < 50
        ) {
          gapIndices.push(i);
        }
      }
    }
  }

  return gapIndices;
}

// ============================================================================
// PostCleanup Class
// ============================================================================

export class PostCleanup {
  private config: Required<PostCleanupConfig>;

  constructor(config: PostCleanupConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run post-compaction cleanup
   */
  cleanup(messages: BaseMessage[]): PostCleanupResult {
    const result: PostCleanupResult = {
      messages: [...messages],
      removed: 0,
      removedByType: {
        duplicates: 0,
        orphans: 0,
        emptyMarkers: 0,
        sequenceGaps: 0,
        consecutiveTools: 0,
      },
      removedIds: [],
    };

    const toRemove = new Set<number>();

    // Phase 1: Find all issues
    if (this.config.removeDuplicates) {
      const dupes = findDuplicates(result.messages);
      for (const idx of dupes) {
        toRemove.add(idx);
        result.removedByType.duplicates++;
      }
    }

    if (this.config.removeOrphans) {
      const orphans = findOrphans(result.messages);
      for (const idx of orphans) {
        toRemove.add(idx);
        result.removedByType.orphans++;
      }
    }

    if (this.config.removeEmptyMarkers) {
      const empty = findEmptyMarkers(result.messages);
      for (const idx of empty) {
        toRemove.add(idx);
        result.removedByType.emptyMarkers++;
      }
    }

    if (this.config.fixSequenceGaps) {
      const gaps = findSequenceGaps(result.messages);
      for (const idx of gaps) {
        toRemove.add(idx);
        result.removedByType.sequenceGaps++;
      }
    }

    if (this.config.maxConsecutiveToolMessages) {
      const excessive = findExcessiveConsecutiveTools(
        result.messages,
        this.config.maxConsecutiveToolMessages
      );
      for (const idx of excessive) {
        toRemove.add(idx);
        result.removedByType.consecutiveTools++;
      }
    }

    // Phase 2: Remove identified messages (in reverse order to preserve indices)
    if (toRemove.size > 0) {
      const sortedIndices = Array.from(toRemove).sort((a, b) => b - a);

      for (const idx of sortedIndices) {
        const removed = result.messages.splice(idx, 1)[0];
        result.removedIds.push(
          (removed as { id?: string }).id ?? `msg-${idx}`
        );
        result.removed++;
      }
    }

    if (result.removed > 0) {
      info('post-cleanup', `Removed ${result.removed} messages: ${JSON.stringify(result.removedByType)}`);
    }

    return result;
  }

  /**
   * Quick cleanup (single pass, most common issues)
   */
  quickCleanup(messages: BaseMessage[]): BaseMessage[] {
    return this.cleanup(messages).messages;
  }

  /**
   * Get cleanup statistics without modifying
   */
  analyze(messages: BaseMessage[]): PostCleanupResult {
    return this.cleanup([...messages]);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PostCleanupConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

let globalPostCleanup: PostCleanup | null = null;

export function getPostCleanup(config?: PostCleanupConfig): PostCleanup {
  if (!globalPostCleanup) {
    globalPostCleanup = new PostCleanup(config);
  }
  return globalPostCleanup;
}

export function resetPostCleanup(): void {
  globalPostCleanup = null;
}
