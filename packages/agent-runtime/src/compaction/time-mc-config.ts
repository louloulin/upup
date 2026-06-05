/**
 * Time-Based Microcompact Configuration
 *
 * Adjusts microcompact thresholds based on:
 * - Time of day (business hours vs off-hours)
 * - Conversation age (newer conversations get higher thresholds)
 * - Message count (higher counts lower thresholds for proactive cleanup)
 *
 * This ensures that during active hours and for long conversations,
 * microcompact runs more aggressively to keep context manageable.
 */

import { info } from '@upup/utils/logging';

// ============================================================================
// Types
// ============================================================================

export interface AdaptiveThreshold {
  /** The token threshold for triggering microcompact */
  threshold: number;
  /** Reason for this threshold level */
  reason: string;
  /** The adjustment factor applied (1.0 = no change) */
  factor: number;
}

export interface TimeBasedMCConfigOptions {
  /** Base token threshold (default: 4000) */
  baseThreshold: number;
  /** Minimum threshold (never go below this) */
  minThreshold: number;
  /** Maximum threshold (never exceed this) */
  maxThreshold: number;
  /** Business hours start (0-23, default: 9) */
  businessHourStart: number;
  /** Business hours end (0-23, default: 18) */
  businessHourEnd: number;
  /** Factor during business hours (default: 0.8, more aggressive) */
  businessHoursFactor: number;
  /** Factor during off-hours (default: 1.2, less aggressive) */
  offHoursFactor: number;
  /** Factor applied per hour of conversation age (default: 0.95) */
  ageDecayFactor: number;
  /** Factor applied per 50 messages (default: 0.9) */
  messageCountDecayFactor: number;
}

const DEFAULT_OPTIONS: TimeBasedMCConfigOptions = {
  baseThreshold: 4000,
  minThreshold: 1000,
  maxThreshold: 16000,
  businessHourStart: 9,
  businessHourEnd: 18,
  businessHoursFactor: 0.8,
  offHoursFactor: 1.2,
  ageDecayFactor: 0.95,
  messageCountDecayFactor: 0.9,
};

// ============================================================================
// TimeBasedMCConfig
// ============================================================================

export class TimeBasedMCConfig {
  private readonly options: TimeBasedMCConfigOptions;

  constructor(options: Partial<TimeBasedMCConfigOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get the current time-of-day factor.
   * Business hours get a lower factor (more aggressive compaction).
   */
  getTimeOfDayFactor(hourOfDay?: number): { factor: number; isBusinessHours: boolean } {
    const hour = hourOfDay ?? new Date().getHours();
    const isBusinessHours = hour >= this.options.businessHourStart && hour < this.options.businessHourEnd;
    return {
      factor: isBusinessHours ? this.options.businessHoursFactor : this.options.offHoursFactor,
      isBusinessHours,
    };
  }

  /**
   * Get the age decay factor.
   * Older conversations get lower thresholds (more aggressive).
   */
  getAgeFactor(sessionAgeMs: number): { factor: number; hoursOld: number } {
    const hoursOld = sessionAgeMs / (1000 * 60 * 60);
    // Apply decay for each hour, but only up to 24 hours
    const cappedHours = Math.min(hoursOld, 24);
    const factor = Math.pow(this.options.ageDecayFactor, cappedHours);
    return { factor, hoursOld };
  }

  /**
   * Get the message count decay factor.
   * More messages get lower thresholds (more aggressive).
   */
  getMessageCountFactor(messageCount: number): { factor: number; segments: number } {
    // Apply decay per 50-message segment
    const segments = Math.floor(messageCount / 50);
    const factor = Math.pow(this.options.messageCountDecayFactor, segments);
    return { factor, segments };
  }

  /**
   * Calculate the adaptive threshold based on time of day, session age, and message count.
   *
   * @param sessionAgeMs - Age of the conversation in milliseconds
   * @param messageCount - Number of messages in the conversation
   * @returns The adaptive threshold with explanation
   */
  getAdaptiveThreshold(sessionAgeMs: number, messageCount: number): AdaptiveThreshold {
    const timeOfDay = this.getTimeOfDayFactor();
    const age = this.getAgeFactor(sessionAgeMs);
    const msgCount = this.getMessageCountFactor(messageCount);

    // Combine factors multiplicatively
    const combinedFactor = timeOfDay.factor * age.factor * msgCount.factor;

    // Apply to base threshold
    let threshold = Math.round(this.options.baseThreshold * combinedFactor);

    // Clamp to bounds
    threshold = Math.max(this.options.minThreshold, Math.min(this.options.maxThreshold, threshold));

    const reasons: string[] = [];
    if (timeOfDay.isBusinessHours) {
      reasons.push('business hours');
    }
    if (age.hoursOld > 1) {
      reasons.push(`session ${age.hoursOld.toFixed(1)}h old`);
    }
    if (msgCount.segments > 0) {
      reasons.push(`${msgCount.segments}x50 messages`);
    }

    const reason = reasons.length > 0
      ? `adjusted: ${reasons.join(', ')}`
      : 'base threshold (no adjustments)';

    info('agent', `Adaptive MC threshold: ${threshold} (${reason}, factor: ${combinedFactor.toFixed(3)})`);

    return {
      threshold,
      reason,
      factor: combinedFactor,
    };
  }

  /**
   * Get the base threshold for reference.
   */
  get baseThreshold(): number {
    return this.options.baseThreshold;
  }

  /**
   * Get the configured options (read-only).
   */
  get config(): Readonly<TimeBasedMCConfigOptions> {
    return this.options;
  }
}
