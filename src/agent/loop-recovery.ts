/**
 * Loop Recovery - Loucode-style agent loop recovery mechanisms
 *
 * Features:
 * - Repeated action detection
 * - State tracking and analysis
 * - Recovery strategies
 * - Circuit breaker for loops
 * - Token budget continuation
 *
 * Reference: Loucode's query.ts recovery mechanisms
 */

import { warn, info, error } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Recovery strategy
 */
export type RecoveryStrategy =
  | 'compact'        // Context compaction
  | 'restart'        // Restart from clean state
  | 'escalate'       // Escalate to user
  | 'retry'          // Retry with modifications
  | 'abort';         // Abort operation

/**
 * Loop detection result
 */
export interface LoopDetectionResult {
  /** Whether a loop was detected */
  isLooping: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Type of loop detected */
  type?: 'repeated_action' | 'repeated_output' | 'stuck' | 'oscillating';
  /** Number of repetitions */
  repetitions: number;
  /** Affected items */
  affectedItems?: string[];
}

/**
 * Recovery attempt
 */
export interface RecoveryAttempt {
  /** Strategy used */
  strategy: RecoveryStrategy;
  /** Whether recovery succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: number;
  /** Details */
  details?: string;
}

/**
 * Loop state
 */
export interface LoopState {
  /** Current repetitions */
  repetitions: number;
  /** Last action or output */
  lastAction?: string;
  /** Action history */
  actionHistory: string[];
  /** Recovery attempts */
  recoveryAttempts: RecoveryAttempt[];
  /** Circuit breaker state */
  circuitBreakerOpen: boolean;
  /** Total loop count */
  totalLoopCount: number;
}

// ============================================================================
// Loop Detector
// ============================================================================

/**
 * Configuration for loop detection
 */
export interface LoopDetectorConfig {
  /** Minimum repetitions before reporting */
  minRepetitions: number;
  /** Window size for action history */
  historyWindow: number;
  /** Threshold for loop detection */
  detectionThreshold: number;
  /** Enable circuit breaker */
  enableCircuitBreaker: boolean;
  /** Circuit breaker threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset time (ms) */
  circuitBreakerResetTime: number;
}

/**
 * Loop detector for agent operations
 */
export class LoopDetector {
  private config: LoopDetectorConfig;
  private state: LoopState;
  private actionHashes: Map<string, number> = new Map();

  constructor(config?: Partial<LoopDetectorConfig>) {
    this.config = {
      minRepetitions: config?.minRepetitions ?? 3,
      historyWindow: config?.historyWindow ?? 50,
      detectionThreshold: config?.detectionThreshold ?? 0.8,
      enableCircuitBreaker: config?.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: config?.circuitBreakerThreshold ?? 5,
      circuitBreakerResetTime: config?.circuitBreakerResetTime ?? 60000,
    };

    this.state = this.createInitialState();
  }

  /**
   * Create initial state
   */
  private createInitialState(): LoopState {
    return {
      repetitions: 0,
      actionHistory: [],
      recoveryAttempts: [],
      circuitBreakerOpen: false,
      totalLoopCount: 0,
    };
  }

  /**
   * Record an action
   */
  recordAction(action: string): void {
    // Add to history
    this.state.actionHistory.push(action);

    // Trim history if needed
    if (this.state.actionHistory.length > this.config.historyWindow) {
      this.state.actionHistory.shift();
    }

    // Check for repetition
    const currentCount = (this.actionHashes.get(action) || 0) + 1;
    this.actionHashes.set(action, currentCount);

    this.state.repetitions = currentCount;
    this.state.lastAction = action;
  }

  /**
   * Detect if we're in a loop
   */
  detect(): LoopDetectionResult {
    // Check circuit breaker
    if (this.state.circuitBreakerOpen) {
      return {
        isLooping: true,
        confidence: 1.0,
        type: 'stuck',
        repetitions: this.state.repetitions,
      };
    }

    // Check for repeated actions
    if (this.state.repetitions >= this.config.minRepetitions) {
      this.state.totalLoopCount++;

      // Determine loop type
      let type: LoopDetectionResult['type'] = 'repeated_action';
      if (this.state.actionHistory.length >= 2) {
        const last = this.state.actionHistory[this.state.actionHistory.length - 1];
        const prev = this.state.actionHistory[this.state.actionHistory.length - 2];
        if (last !== prev && this.state.repetitions > 2) {
          type = 'oscillating';
        }
      }

      const confidence = Math.min(this.state.repetitions / 10, 1.0);

      return {
        isLooping: true,
        confidence,
        type,
        repetitions: this.state.repetitions,
      };
    }

    // Check for oscillating pattern (A-B-A-B)
    const oscillating = this.detectOscillation();
    if (oscillating) {
      this.state.totalLoopCount++;

      return {
        isLooping: true,
        confidence: 0.9,
        type: 'oscillating',
        repetitions: this.state.repetitions,
      };
    }

    return {
      isLooping: false,
      confidence: 0,
      repetitions: 0,
    };
  }

  /**
   * Detect oscillation pattern
   */
  private detectOscillation(): boolean {
    const history = this.state.actionHistory;
    if (history.length < 4) return false;

    // Check last 4 for A-B-A-B pattern
    const last = history[history.length - 1];
    const secondLast = history[history.length - 2];
    const thirdLast = history[history.length - 3];
    const fourthLast = history[history.length - 4];

    return (
      last === thirdLast &&
      secondLast === fourthLast &&
      last !== secondLast
    );
  }

  /**
   * Attempt recovery
   */
  attemptRecovery(strategy: RecoveryStrategy): RecoveryAttempt {
    const attempt: RecoveryAttempt = {
      strategy,
      success: false,
      timestamp: Date.now(),
    };

    try {
      switch (strategy) {
        case 'compact':
          // Context compaction would happen here
          this.compactContext();
          attempt.success = true;
          attempt.details = 'Context compacted';
          break;

        case 'restart':
          // Restart would happen here
          this.restartLoop();
          attempt.success = true;
          attempt.details = 'Loop restarted';
          break;

        case 'retry':
          // Retry with modifications
          this.retryWithModifications();
          attempt.success = true;
          attempt.details = 'Retrying with modifications';
          break;

        case 'escalate':
          // Escalate to user
          this.escalateToUser();
          attempt.success = true;
          attempt.details = 'Escalated to user';
          break;

        case 'abort':
          // Abort operation
          this.abort();
          attempt.success = true;
          attempt.details = 'Operation aborted';
          break;
      }

      // Update circuit breaker
      if (attempt.success && this.config.enableCircuitBreaker) {
        this.resetCircuitBreaker();
      }
    } catch (err) {
      attempt.details = `Recovery failed: ${err}`;
      error('agent', `Loop recovery failed: ${err}`);

      // Trip circuit breaker on failure
      if (this.config.enableCircuitBreaker) {
        this.tripCircuitBreaker();
      }
    }

    this.state.recoveryAttempts.push(attempt);
    return attempt;
  }

  /**
   * Compact context
   */
  private compactContext(): void {
    warn('agent', 'Performing context compaction');
    // In real implementation, this would compact the conversation context
    this.clearHistory();
  }

  /**
   * Restart loop
   */
  private restartLoop(): void {
    warn('agent', 'Restarting agent loop');
    this.clearHistory();
    this.state.circuitBreakerOpen = false;
  }

  /**
   * Retry with modifications
   */
  private retryWithModifications(): void {
    info('agent', 'Retrying with modifications');
    // In real implementation, this would retry with different parameters
    this.clearHistory();
  }

  /**
   * Escalate to user
   */
  private escalateToUser(): void {
    warn('agent', 'Escalating to user');
    // In real implementation, this would prompt the user
  }

  /**
   * Abort operation
   */
  private abort(): void {
    error('agent', 'Aborting operation due to loop detection');
    this.state.circuitBreakerOpen = true;
  }

  /**
   * Trip circuit breaker
   */
  private tripCircuitBreaker(): void {
    const recentAttempts = this.state.recoveryAttempts.slice(-this.config.circuitBreakerThreshold);
    const recentFailures = recentAttempts.filter(a => !a.success).length;

    if (recentFailures >= this.config.circuitBreakerThreshold) {
      warn('agent', 'Circuit breaker tripped');
      this.state.circuitBreakerOpen = true;

      // Schedule reset
      setTimeout(() => {
        this.resetCircuitBreaker();
      }, this.config.circuitBreakerResetTime);
    }
  }

  /**
   * Reset circuit breaker
   */
  private resetCircuitBreaker(): void {
    this.state.circuitBreakerOpen = false;
    info('agent', 'Circuit breaker reset');
  }

  /**
   * Clear action history
   */
  private clearHistory(): void {
    this.state.actionHistory = [];
    this.state.repetitions = 0;
    this.actionHashes.clear();
  }

  /**
   * Get current state
   */
  getState(): LoopState {
    return { ...this.state };
  }

  /**
   * Reset detector
   */
  reset(): void {
    this.state = this.createInitialState();
    this.actionHashes.clear();
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    return this.state.circuitBreakerOpen;
  }

  /**
   * Get total loop count
   */
  getTotalLoopCount(): number {
    return this.state.totalLoopCount;
  }
}

// ============================================================================
// Recovery Strategy Selector
// ============================================================================

/**
 * Select recovery strategy based on loop type
 */
export function selectRecoveryStrategy(
  loopType: LoopDetectionResult['type'],
  attempts: RecoveryAttempt[]
): RecoveryStrategy {
  // Don't retry same strategy if it failed
  const failedStrategies = attempts
    .filter(a => !a.success)
    .map(a => a.strategy);

  // Check recovery history - only if there are 2+ recent failures
  const recentAttempts = attempts.slice(-3);
  const recentFailing = recentAttempts.length >= 2 && recentAttempts.every(a => !a.success);

  if (recentFailing) {
    // If recent attempts all failed, escalate
    if (!failedStrategies.includes('escalate')) {
      return 'escalate';
    }
    return 'abort';
  }

  // Select based on loop type
  switch (loopType) {
    case 'repeated_action':
      if (!failedStrategies.includes('compact')) {
        return 'compact';
      }
      if (!failedStrategies.includes('retry')) {
        return 'retry';
      }
      return 'escalate';

    case 'oscillating':
      if (!failedStrategies.includes('retry')) {
        return 'retry';
      }
      return 'escalate';

    case 'stuck':
      return 'abort';

    case 'repeated_output':
      if (!failedStrategies.includes('compact')) {
        return 'compact';
      }
      return 'restart';

    default:
      return 'escalate';
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let loopDetector: LoopDetector | null = null;

export function getLoopDetector(config?: Partial<LoopDetectorConfig>): LoopDetector {
  if (!loopDetector) {
    loopDetector = new LoopDetector(config);
  }
  return loopDetector;
}

export function resetLoopDetector(): void {
  if (loopDetector) {
    loopDetector.reset();
  }
  loopDetector = null;
}

/**
 * Check if current operation should be aborted
 */
export function shouldAbortOperation(): boolean {
  return getLoopDetector().isCircuitBreakerOpen();
}

// ============================================================================
// Module Exports
// ============================================================================

export const loopRecovery = {
  LoopDetector,
  selectRecoveryStrategy,
  getLoopDetector,
  resetLoopDetector,
  shouldAbortOperation,
};
