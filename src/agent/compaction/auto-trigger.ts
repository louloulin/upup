/**
 * AutoTrigger - Automatic threshold-based compaction triggering
 *
 * Unlike reactive compaction (which triggers on overflow), AutoTrigger
 * proactively compacts based on configurable thresholds to prevent
 * context from growing too large in the first place.
 *
 * Features:
 * - Token count thresholds
 * - Message count thresholds
 * - Turn count thresholds
 * - Time-based thresholds
 * - Configurable per-layer response
 */

import type { BaseMessage } from '@langchain/core/messages';
import { estimateTokens } from '../../utils/tokens.js';
import { info, warn } from '../../utils/logging/logger.js';

// ============================================================================
// Threshold Configuration
// ============================================================================

export interface AutoTriggerConfig {
  /** Fire microcompact when token count exceeds this */
  microcompactTokenThreshold?: number;
  /** Fire snip when token count exceeds this */
  snipTokenThreshold?: number;
  /** Fire full compact when token count exceeds this */
  compactTokenThreshold?: number;

  /** Fire microcompact when message count exceeds this */
  microcompactMessageThreshold?: number;
  /** Fire snip when message count exceeds this */
  snipMessageThreshold?: number;
  /** Fire full compact when message count exceeds this */
  compactMessageThreshold?: number;

  /** Fire full compact after this many turns without compaction */
  maxTurnsWithoutCompaction?: number;
  /** Fire microcompact after this many turns */
  microcompactTurnThreshold?: number;

  /** Minimum minutes between compactions */
  minMinutesBetweenCompaction?: number;
  /** Maximum minutes since last user message before auto-compact */
  maxMinutesIdle?: number;

  /** Enable auto-trigger */
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<AutoTriggerConfig> = {
  microcompactTokenThreshold: 60_000,
  snipTokenThreshold: 80_000,
  compactTokenThreshold: 100_000,
  microcompactMessageThreshold: 30,
  snipMessageThreshold: 40,
  compactMessageThreshold: 50,
  maxTurnsWithoutCompaction: 10,
  microcompactTurnThreshold: 5,
  minMinutesBetweenCompaction: 2,
  maxMinutesIdle: 30,
  enabled: true,
};

// ============================================================================
// AutoTrigger State
// ============================================================================

interface AutoTriggerState {
  lastCompactionTime: number | null;
  turnsSinceLastCompaction: number;
  turnsSinceLastMicrocompact: number;
  lastUserMessageTime: number | null;
  consecutiveCompactionSkips: number;
}

const globalState: AutoTriggerState = {
  lastCompactionTime: null,
  turnsSinceLastCompaction: 0,
  turnsSinceLastMicrocompact: 0,
  lastUserMessageTime: null,
  consecutiveCompactionSkips: 0,
};

// ============================================================================
// AutoTrigger Result
// ============================================================================

export type CompactionLayer = 'none' | 'snip' | 'microcompact' | 'compact';

export interface AutoTriggerResult {
  /** Which layer to apply, if any */
  action: CompactionLayer;
  /** Token count at time of check */
  tokenCount: number;
  /** Message count at time of check */
  messageCount: number;
  /** Which thresholds were exceeded */
  exceededThresholds: string[];
  /** Why compaction was skipped */
  skipReason?: string;
}

// ============================================================================
// AutoTrigger Class
// ============================================================================

export class AutoTrigger {
  private config: Required<AutoTriggerConfig>;

  constructor(config: AutoTriggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if any compaction layer should trigger
   */
  check(messages: BaseMessage[]): AutoTriggerResult {
    if (!this.config.enabled) {
      return {
        action: 'none',
        tokenCount: 0,
        messageCount: 0,
        exceededThresholds: [],
        skipReason: 'AutoTrigger disabled',
      };
    }

    const tokenCount = estimateTokens(messages);
    const messageCount = messages.length;
    const exceededThresholds: string[] = [];

    // Check time-based skip
    const skipReason = this.checkTimeConstraints();
    if (skipReason) {
      return {
        action: 'none',
        tokenCount,
        messageCount,
        exceededThresholds,
        skipReason,
      };
    }

    // Priority 1: Check full compact thresholds (highest)
    if (tokenCount >= this.config.compactTokenThreshold) {
      exceededThresholds.push(`tokens:${tokenCount}>=${this.config.compactTokenThreshold}`);
    }
    if (messageCount >= this.config.compactMessageThreshold) {
      exceededThresholds.push(`messages:${messageCount}>=${this.config.compactMessageThreshold}`);
    }
    if (globalState.turnsSinceLastCompaction >= this.config.maxTurnsWithoutCompaction) {
      exceededThresholds.push(`turns:${globalState.turnsSinceLastCompaction}>=${this.config.maxTurnsWithoutCompaction}`);
    }

    if (exceededThresholds.length > 0) {
      this.recordCompactionAttempt();
      return {
        action: 'compact',
        tokenCount,
        messageCount,
        exceededThresholds,
      };
    }

    // Priority 2: Check microcompact thresholds
    if (tokenCount >= this.config.microcompactTokenThreshold) {
      exceededThresholds.push(`tokens:${tokenCount}>=${this.config.microcompactTokenThreshold}`);
    }
    if (messageCount >= this.config.microcompactMessageThreshold) {
      exceededThresholds.push(`messages:${messageCount}>=${this.config.microcompactMessageThreshold}`);
    }
    if (globalState.turnsSinceLastMicrocompact >= this.config.microcompactTurnThreshold) {
      exceededThresholds.push(`turns:${globalState.turnsSinceLastMicrocompact}>=${this.config.microcompactTurnThreshold}`);
    }

    if (exceededThresholds.length > 0) {
      this.recordMicrocompactAttempt();
      return {
        action: 'microcompact',
        tokenCount,
        messageCount,
        exceededThresholds,
      };
    }

    // Priority 3: Check snip thresholds
    if (tokenCount >= this.config.snipTokenThreshold) {
      exceededThresholds.push(`tokens:${tokenCount}>=${this.config.snipTokenThreshold}`);
    }
    if (messageCount >= this.config.snipMessageThreshold) {
      exceededThresholds.push(`messages:${messageCount}>=${this.config.snipMessageThreshold}`);
    }

    if (exceededThresholds.length > 0) {
      return {
        action: 'snip',
        tokenCount,
        messageCount,
        exceededThresholds,
      };
    }

    return {
      action: 'none',
      tokenCount,
      messageCount,
      exceededThresholds: [],
    };
  }

  /**
   * Check time-based constraints
   */
  private checkTimeConstraints(): string | undefined {
    const now = Date.now();

    // Check minimum time between compactions
    if (globalState.lastCompactionTime !== null) {
      const minutesSinceLast = (now - globalState.lastCompactionTime) / 60000;
      if (minutesSinceLast < this.config.minMinutesBetweenCompaction) {
        return `Too soon since last compaction (${minutesSinceLast.toFixed(1)}m < ${this.config.minMinutesBetweenCompaction}m)`;
      }
    }

    // Check idle timeout
    if (globalState.lastUserMessageTime !== null) {
      const minutesIdle = (now - globalState.lastUserMessageTime) / 60000;
      if (minutesIdle > this.config.maxMinutesIdle) {
        warn('compaction', `Idle timeout approaching: ${minutesIdle.toFixed(1)} minutes`);
      }
    }

    // Check consecutive skip limit
    if (globalState.consecutiveCompactionSkips >= 3) {
      return `Too many consecutive skips (${globalState.consecutiveCompactionSkips})`;
    }

    return undefined;
  }

  /**
   * Record a full compaction attempt
   */
  recordCompactionAttempt(): void {
    globalState.lastCompactionTime = Date.now();
    globalState.turnsSinceLastCompaction = 0;
    globalState.turnsSinceLastMicrocompact = 0;
    globalState.consecutiveCompactionSkips = 0;
  }

  /**
   * Record a microcompact attempt
   */
  recordMicrocompactAttempt(): void {
    globalState.turnsSinceLastMicrocompact = 0;
    globalState.turnsSinceLastCompaction++;
  }

  /**
   * Record a skipped compaction (not yet needed)
   */
  recordSkip(): void {
    globalState.turnsSinceLastCompaction++;
    globalState.turnsSinceLastMicrocompact++;
    globalState.consecutiveCompactionSkips++;
  }

  /**
   * Record a user message (resets idle timer)
   */
  recordUserMessage(): void {
    globalState.lastUserMessageTime = Date.now();
    globalState.consecutiveCompactionSkips = 0;
  }

  /**
   * Record a turn (increments counters)
   */
  recordTurn(): void {
    globalState.turnsSinceLastCompaction++;
    globalState.turnsSinceLastMicrocompact++;
  }

  /**
   * Get current state for debugging
   */
  getState(): AutoTriggerState {
    return { ...globalState };
  }

  /**
   * Reset state (useful for testing)
   */
  reset(): void {
    globalState.lastCompactionTime = null;
    globalState.turnsSinceLastCompaction = 0;
    globalState.turnsSinceLastMicrocompact = 0;
    globalState.lastUserMessageTime = null;
    globalState.consecutiveCompactionSkips = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoTriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

let globalTrigger: AutoTrigger | null = null;

export function getAutoTrigger(config?: AutoTriggerConfig): AutoTrigger {
  if (!globalTrigger) {
    globalTrigger = new AutoTrigger(config);
  }
  return globalTrigger;
}

export function resetAutoTrigger(): void {
  if (globalTrigger) {
    globalTrigger.reset();
    globalTrigger = null;
  }
}
