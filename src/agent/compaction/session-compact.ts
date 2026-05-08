/**
 * Session Memory Compact - Session-level memory compression
 *
 * Compresses the long-term memory aspect of a session, focusing on:
 * - User preferences and patterns
 * - Tool usage history
 * - Topic continuity across sessions
 * - Learned facts and context
 *
 * This is different from context compaction which operates on the
 * message history. Session memory compact operates on the persistent
 * memory layer.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { info, warn } from '../../utils/logging/logger.js';

// ============================================================================
// Session Memory Types
// ============================================================================

export interface SessionMemoryEntry {
  id: string;
  type: 'preference' | 'fact' | 'pattern' | 'context' | 'tool_usage';
  content: string;
  confidence: number;
  lastUpdated: number;
  accessCount: number;
  tags: string[];
}

export interface SessionMemoryStats {
  totalEntries: number;
  byType: Record<string, number>;
  oldestEntry: number;
  newestEntry: number;
  averageConfidence: number;
}

// ============================================================================
// Session Memory Store
// ============================================================================

export class SessionMemoryStore {
  private entries: Map<string, SessionMemoryEntry> = new Map();
  private accessLog: Map<string, number> = new Map();

  /**
   * Add a new entry
   */
  addEntry(entry: Omit<SessionMemoryEntry, 'accessCount'>): void {
    this.entries.set(entry.id, { ...entry, accessCount: 0 });
  }

  /**
   * Get an entry by ID
   */
  getEntry(id: string): SessionMemoryEntry | undefined {
    const entry = this.entries.get(id);
    if (entry) {
      const count = this.accessLog.get(id) ?? 0;
      this.accessLog.set(id, count + 1);
      entry.accessCount = count + 1;
    }
    return entry;
  }

  /**
   * List all entries
   */
  listEntries(): SessionMemoryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * List entries by type
   */
  listEntriesByType(type: SessionMemoryEntry['type']): SessionMemoryEntry[] {
    return this.listEntries().filter(e => e.type === type);
  }

  /**
   * Update an entry
   */
  updateEntry(id: string, updates: Partial<SessionMemoryEntry>): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    this.entries.set(id, { ...entry, ...updates, lastUpdated: Date.now() });
    return true;
  }

  /**
   * Remove an entry
   */
  removeEntry(id: string): boolean {
    return this.entries.delete(id);
  }

  /**
   * Get entries by age (older entries are candidates for compression)
   */
  getEntriesByAge(maxAgeMs: number): SessionMemoryEntry[] {
    const cutoff = Date.now() - maxAgeMs;
    return this.listEntries().filter(e => e.lastUpdated < cutoff);
  }

  /**
   * Get entries by access count (low-access entries are candidates)
   */
  getLowAccessEntries(maxAccess = 2): SessionMemoryEntry[] {
    return this.listEntries().filter(e => e.accessCount <= maxAccess);
  }

  /**
   * Get statistics
   */
  getStats(): SessionMemoryStats {
    const entries = this.listEntries();
    const now = Date.now();

    const byType: Record<string, number> = {};
    let totalConfidence = 0;
    let oldest = now;
    let newest = 0;

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
      totalConfidence += entry.confidence;
      oldest = Math.min(oldest, entry.lastUpdated);
      newest = Math.max(newest, entry.lastUpdated);
    }

    return {
      totalEntries: entries.length,
      byType,
      oldestEntry: oldest === now ? 0 : oldest,
      newestEntry: newest,
      averageConfidence: entries.length > 0 ? totalConfidence / entries.length : 0,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    this.accessLog.clear();
  }
}

// ============================================================================
// Session Memory Compactor
// ============================================================================

export interface SessionCompactConfig {
  /** Maximum entries to keep */
  maxEntries?: number;
  /** Minimum confidence to keep */
  minConfidence?: number;
  /** Maximum age in days before compression */
  maxAgeDays?: number;
  /** Compact entries with access count below this */
  minAccessCount?: number;
}

const DEFAULT_CONFIG: Required<SessionCompactConfig> = {
  maxEntries: 100,
  minConfidence: 0.3,
  maxAgeDays: 7,
  minAccessCount: 1,
};

export interface SessionCompactResult {
  /** Entries removed */
  removed: number;
  /** Entries merged */
  merged: number;
  /** Entries kept */
  kept: number;
  /** Types affected */
  affectedTypes: string[];
  /** Reasons for removal */
  removalReasons: Array<{ id: string; reason: string }>;
}

export class SessionMemoryCompact {
  private store: SessionMemoryStore;
  private config: Required<SessionCompactConfig>;

  constructor(store?: SessionMemoryStore, config?: SessionCompactConfig) {
    this.store = store ?? new SessionMemoryStore();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compact the session memory store
   */
  compact(): SessionCompactResult {
    const entries = this.store.listEntries();
    const removalReasons: Array<{ id: string; reason: string }> = [];
    const affectedTypes: Set<string> = new Set();

    let removed = 0;
    let merged = 0;
    let kept = 0;

    // Phase 1: Remove entries that fail quality gates
    for (const entry of entries) {
      let shouldRemove = false;
      let reason = '';

      // Age check
      const ageDays = (Date.now() - entry.lastUpdated) / (1000 * 60 * 60 * 24);
      if (ageDays > this.config.maxAgeDays && entry.accessCount < this.config.minAccessCount) {
        shouldRemove = true;
        reason = `Too old (${ageDays.toFixed(1)}d) and low access`;
      }

      // Confidence check
      if (entry.confidence < this.config.minConfidence) {
        shouldRemove = true;
        reason = `Low confidence (${entry.confidence.toFixed(2)})`;
      }

      // Access count check
      if (entry.accessCount < this.config.minAccessCount && ageDays > 1) {
        shouldRemove = true;
        reason = `Low access (${entry.accessCount})`;
      }

      if (shouldRemove) {
        this.store.removeEntry(entry.id);
        removalReasons.push({ id: entry.id, reason });
        affectedTypes.add(entry.type);
        removed++;
      } else {
        kept++;
      }
    }

    // Phase 2: Merge similar entries
    const mergedThisRound = new Set<string>();
    for (const entry of this.store.listEntries()) {
      if (mergedThisRound.has(entry.id)) continue;

      const similar = this.store.listEntries().filter(
        e =>
          e.id !== entry.id &&
          !mergedThisRound.has(e.id) &&
          e.type === entry.type &&
          this.calculateSimilarity(entry.content, e.content) > 0.8
      );

      if (similar.length > 0) {
        // Mark all as merged
        mergedThisRound.add(entry.id);
        similar.forEach(e => mergedThisRound.add(e.id));

        // Merge: keep highest confidence, update content
        const all = [entry, ...similar];
        const best = all.reduce((a, b) => (a.confidence > b.confidence ? a : b));
        const toRemove = all.filter(e => e.id !== best.id);
        const mergedContent = this.mergeContent(all.map(e => e.content));

        // Update best entry
        this.store.updateEntry(best.id, {
          content: mergedContent,
          confidence: Math.max(...all.map(e => e.confidence)),
        });

        // Remove duplicates (not the best)
        for (const e of toRemove) {
          this.store.removeEntry(e.id);
        }

        merged++;
      }
    }

    // Phase 3: Enforce max entries limit
    const remaining = this.store.listEntries();
    if (remaining.length > this.config.maxEntries) {
      // Sort by: confidence * accessCount, descending
      const sorted = remaining.sort(
        (a, b) => b.confidence * b.accessCount - a.confidence * a.accessCount
      );

      const toRemove = sorted.slice(this.config.maxEntries);
      for (const entry of toRemove) {
        this.store.removeEntry(entry.id);
        removalReasons.push({ id: entry.id, reason: 'Max entries exceeded' });
        affectedTypes.add(entry.type);
        removed++;
        kept--;
      }
    }

    if (removed > 0 || merged > 0) {
      info('session-compact', `Compacted: ${removed} removed, ${merged} merged, ${kept} kept`);
    }

    return {
      removed,
      merged,
      kept,
      affectedTypes: Array.from(affectedTypes),
      removalReasons,
    };
  }

  /**
   * Calculate content similarity (simple overlap-based)
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Merge content from multiple entries
   */
  private mergeContent(contents: string[]): string {
    // Simple merge: take the longest/most complete content
    return contents.sort((a, b) => b.length - a.length)[0];
  }

  /**
   * Add entries from message history
   */
  addFromMessages(messages: BaseMessage[]): void {
    for (const msg of messages) {
      const type = msg._getType();
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);

      if (content.length > 50) {
        // Estimate type based on content
        const entryType = this.inferEntryType(type, content);
        if (entryType) {
          this.store.addEntry({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: entryType,
            content: content.slice(0, 500), // Truncate for storage
            confidence: 0.5,
            lastUpdated: Date.now(),
            tags: [type],
          });
        }
      }
    }
  }

  /**
   * Infer entry type from message type and content
   */
  private inferEntryType(
    msgType: string,
    content: string
  ): SessionMemoryEntry['type'] | null {
    const lower = content.toLowerCase();

    if (lower.includes('prefer') || lower.includes('like') || lower.includes('always')) {
      return 'preference';
    }

    if (lower.includes('remember') || lower.includes('fact') || lower.includes('know')) {
      return 'fact';
    }

    if (msgType === 'tool') {
      return 'tool_usage';
    }

    if (lower.includes('pattern') || lower.includes('usually') || lower.includes('typically')) {
      return 'pattern';
    }

    return 'context';
  }

  /**
   * Get the underlying store
   */
  getStore(): SessionMemoryStore {
    return this.store;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SessionCompactConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

let globalSessionCompact: SessionMemoryCompact | null = null;

export function getSessionMemoryCompact(): SessionMemoryCompact {
  if (!globalSessionCompact) {
    globalSessionCompact = new SessionMemoryCompact();
  }
  return globalSessionCompact;
}

export function resetSessionMemoryCompact(): void {
  globalSessionCompact = null;
}
