/**
 * Session Stats System
 *
 * Implements session statistics and usage tracking:
 * - Track session duration, message counts
 * - Aggregate daily activity
 * - Store in ~/.upup/stats-cache.json
 *
 * Reference: Claude Code's src/utils/stats.ts and statsCache.ts
 */

import { globalUpupPath } from '@upup/utils';
import { getStatsDaysLimit } from './storage-adapter.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Session stats
 */
export interface SessionStats {
  /** Session ID */
  sessionId: string;
  /** Session duration in milliseconds */
  duration: number;
  /** Message count */
  messageCount: number;
  /** Created timestamp */
  timestamp: string;
}

/**
 * Daily activity
 */
export interface DailyActivity {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Number of sessions */
  sessionCount: number;
  /** Total message count */
  messageCount: number;
  /** Total duration in ms */
  duration: number;
}

/**
 * Model usage
 */
export interface ModelUsage {
  /** Model name */
  model: string;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Request count */
  requestCount: number;
}

/**
 * Daily model tokens
 */
export interface DailyModelTokens {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Model tokens per model */
  tokens: Record<string, number>;
}

/**
 * Stats cache
 */
export interface StatsCache {
  /** Cache version */
  version: number;
  /** Last computed date */
  lastComputedDate: string | null;
  /** Daily activity aggregation */
  dailyActivity: DailyActivity[];
  /** Daily model tokens */
  dailyModelTokens: DailyModelTokens[];
  /** Model usage stats */
  modelUsage: Record<string, ModelUsage>;
  /** Total session count */
  totalSessions: number;
  /** Total message count */
  totalMessages: number;
  /** Longest session */
  longestSession: SessionStats | null;
  /** First session date */
  firstSessionDate: string | null;
  /** Hour distribution */
  hourCounts: Record<number, number>;
  /** Speculation time saved */
  totalSpeculationTimeSavedMs: number;
  /** Shot distribution */
  shotDistribution?: Record<number, number>;
  /** Tool call count */
  toolCallCount: number;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get stats cache file path
 */
export function getStatsCachePath(): string {
  return globalUpupPath('stats-cache.json');
}

// ============================================================================
// Default Stats Cache
// ============================================================================

/**
 * Create default stats cache
 */
function createDefaultCache(): StatsCache {
  return {
    version: 1,
    lastComputedDate: null,
    dailyActivity: [],
    dailyModelTokens: [],
    modelUsage: {},
    totalSessions: 0,
    totalMessages: 0,
    longestSession: null,
    firstSessionDate: null,
    hourCounts: {},
    totalSpeculationTimeSavedMs: 0,
    toolCallCount: 0,
  };
}

// ============================================================================
// Stats Cache Manager
// ============================================================================

/**
 * Stats Cache Manager
 */
export class StatsCacheManager {
  private cache: StatsCache;
  private dirty: boolean = false;
  private cachePath: string;
  private saveLock: boolean = false;

  constructor() {
    this.cachePath = getStatsCachePath();
    this.cache = this.load();
  }

  /**
   * Execute function with cache lock (F27)
   */
  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    while (this.saveLock) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.saveLock = true;
    try {
      return await fn();
    } finally {
      this.saveLock = false;
    }
  }

  /**
   * Migrate cache to new format if needed (F28)
   */
  async migrateIfNeeded(): Promise<boolean> {
    // Check if cache needs migration
    if (this.cache.version === 1) {
      return false;
    }

    // Current version is 1, no migration needed
    // Future migrations would update version and transform data
    return false;
  }

  /**
   * Load cache from file
   */
  private load(): StatsCache {
    if (!fs.existsSync(this.cachePath)) {
      return createDefaultCache();
    }

    try {
      const content = fs.readFileSync(this.cachePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return createDefaultCache();
    }
  }

  /**
   * Save cache to file
   */
  private save(): void {
    if (!this.dirty) return;

    const dir = path.dirname(this.cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    this.dirty = false;
  }

  /**
   * Mark cache as dirty (needs save)
   */
  private markDirty(): void {
    this.dirty = true;
  }

  /**
   * Get current cache
   */
  getCache(): StatsCache {
    return { ...this.cache };
  }

  /**
   * Record a session
   */
  recordSession(stats: SessionStats): void {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hour = now.getHours();

    // Update totals
    this.cache.totalSessions++;
    this.cache.totalMessages += stats.messageCount;

    // Update hour counts
    this.cache.hourCounts[hour] = (this.cache.hourCounts[hour] || 0) + 1;

    // Update longest session
    if (!this.cache.longestSession || stats.duration > this.cache.longestSession.duration) {
      this.cache.longestSession = stats;
    }

    // Update first session date
    if (!this.cache.firstSessionDate) {
      this.cache.firstSessionDate = dateStr;
    }

    // Update daily activity
    const daily = this.cache.dailyActivity.find(d => d.date === dateStr);
    if (daily) {
      daily.sessionCount++;
      daily.messageCount += stats.messageCount;
      daily.duration += stats.duration;
    } else {
      this.cache.dailyActivity.push({
        date: dateStr,
        sessionCount: 1,
        messageCount: stats.messageCount,
        duration: stats.duration,
      });
    }

    // Keep only last configured days
    const daysLimit = getStatsDaysLimit();
    if (this.cache.dailyActivity.length > daysLimit) {
      this.cache.dailyActivity = this.cache.dailyActivity.slice(-daysLimit);
    }

    // Update last computed date
    this.cache.lastComputedDate = dateStr;

    this.markDirty();
    this.save();
  }

  /**
   * Record model usage
   */
  recordModelUsage(model: string, inputTokens: number, outputTokens: number): void {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Update model usage
    if (!this.cache.modelUsage[model]) {
      this.cache.modelUsage[model] = {
        model,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
      };
    }

    const usage = this.cache.modelUsage[model];
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.requestCount++;

    // Update daily model tokens
    const daily = this.cache.dailyModelTokens.find(d => d.date === dateStr);
    const totalTokens = inputTokens + outputTokens;

    if (daily) {
      daily.tokens[model] = (daily.tokens[model] || 0) + totalTokens;
    } else {
      this.cache.dailyModelTokens.push({
        date: dateStr,
        tokens: { [model]: totalTokens },
      });
    }

    // Keep only last configured days
    const daysLimit = getStatsDaysLimit();
    if (this.cache.dailyModelTokens.length > daysLimit) {
      this.cache.dailyModelTokens = this.cache.dailyModelTokens.slice(-daysLimit);
    }

    this.markDirty();
    this.save();
  }

  /**
   * Record speculation time saved
   */
  recordSpeculationTimeSaved(ms: number): void {
    this.cache.totalSpeculationTimeSavedMs += ms;
    this.markDirty();
    this.save();
  }

  /**
   * Get activity for date range
   */
  getActivityForRange(startDate: string, endDate: string): DailyActivity[] {
    return this.cache.dailyActivity.filter(
      d => d.date >= startDate && d.date <= endDate
    );
  }

  /**
   * Get total activity
   */
  getTotalActivity(): {
    totalSessions: number;
    totalMessages: number;
    totalDuration: number;
    averageSessionLength: number;
  } {
    const totalDuration = this.cache.dailyActivity.reduce(
      (sum, d) => sum + d.duration,
      0
    );

    return {
      totalSessions: this.cache.totalSessions,
      totalMessages: this.cache.totalMessages,
      totalDuration,
      averageSessionLength:
        this.cache.totalSessions > 0
          ? totalDuration / this.cache.totalSessions
          : 0,
    };
  }

  /**
   * Get hourly distribution
   */
  getHourlyDistribution(): Record<number, number> {
    return { ...this.cache.hourCounts };
  }

  /**
   * Get most active hours
   */
  getMostActiveHours(count: number = 3): number[] {
    const entries = Object.entries(this.cache.hourCounts);
    return entries
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([hour]) => parseInt(hour));
  }

  /**
   * Get model usage summary
   */
  getModelUsageSummary(): ModelUsage[] {
    return Object.values(this.cache.modelUsage);
  }

  /**
   * Get top models by usage
   */
  getTopModels(count: number = 5): ModelUsage[] {
    return Object.values(this.cache.modelUsage)
      .sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
      .slice(0, count);
  }

  // ============================================================================
  // Peak Analysis (F15)
  // ============================================================================

  /**
   * Get peak activity day (most sessions)
   */
  getPeakActivityDay(): { date: string; sessionCount: number } | null {
    if (this.cache.dailyActivity.length === 0) {
      return null;
    }

    const peak = this.cache.dailyActivity.reduce(
      (max, day) => (day.sessionCount > max.sessionCount ? day : max),
      this.cache.dailyActivity[0]
    );

    return {
      date: peak.date,
      sessionCount: peak.sessionCount,
    };
  }

  /**
   * Get peak activity hour (most usage)
   */
  getPeakActivityHour(): { hour: number; count: number } | null {
    const entries = Object.entries(this.cache.hourCounts);
    if (entries.length === 0) {
      return null;
    }

    const peak = entries.reduce(
      (max, [hour, count]) => (count > max.count ? { hour: parseInt(hour), count } : max),
      { hour: 0, count: 0 }
    );

    return peak.count > 0 ? peak : null;
  }

  // ============================================================================
  // Stat Aggregation (F18)
  // ============================================================================

  /**
   * Aggregate stats for a date range
   */
  aggregateForRange(startDate: string, endDate: string): {
    totalSessions: number;
    totalMessages: number;
    totalDuration: number;
    daysActive: number;
  } {
    const activity = this.getActivityForRange(startDate, endDate);

    return {
      totalSessions: activity.reduce((sum, d) => sum + d.sessionCount, 0),
      totalMessages: activity.reduce((sum, d) => sum + d.messageCount, 0),
      totalDuration: activity.reduce((sum, d) => sum + d.duration, 0),
      daysActive: activity.length,
    };
  }

  /**
   * Calculate streaks (consecutive active days)
   */
  calculateStreaks(): { currentStreak: number; longestStreak: number } {
    if (this.cache.dailyActivity.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    // Sort by date
    const sortedDays = [...this.cache.dailyActivity].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 1;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Check if most recent day is today or yesterday (streak is active)
    const mostRecent = sortedDays[sortedDays.length - 1];
    const isRecent = mostRecent.date === today || mostRecent.date === yesterday;

    for (let i = sortedDays.length - 1; i > 0; i--) {
      const current = new Date(sortedDays[i].date);
      const prev = new Date(sortedDays[i - 1].date);
      const diff = (current.getTime() - prev.getTime()) / 86400000;

      if (diff === 1) {
        streak++;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, streak);
    currentStreak = isRecent ? streak : 0;

    return { currentStreak, longestStreak };
  }

  /**
   * Estimate cost in USD (rough estimation based on model)
   */
  estimateCostUSD(): number {
    // Rough estimation: $3.5/1M input tokens, $14/1M output tokens
    const INPUT_COST_PER_M = 3.5;
    const OUTPUT_COST_PER_M = 14;

    let totalCost = 0;
    for (const usage of Object.values(this.cache.modelUsage)) {
      totalCost += (usage.inputTokens / 1_000_000) * INPUT_COST_PER_M;
      totalCost += (usage.outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
    }

    return Math.round(totalCost * 100) / 100;
  }

  // ============================================================================
  // Shot Count Extraction (F22)
  // ============================================================================

  /**
   * Extract shot count from messages (F22)
   * Counts how many assistant responses were generated
   */
  extractShotCountFromMessages(messages: Array<{ role: string; content?: string }>): number {
    return messages.filter(m => m.role === 'assistant' && m.content).length;
  }

  /**
   * Record shot count distribution (F22)
   */
  recordShotCount(shotCount: number): void {
    if (!this.cache.shotDistribution) {
      this.cache.shotDistribution = {};
    }
    this.cache.shotDistribution[shotCount] = (this.cache.shotDistribution[shotCount] || 0) + 1;
    this.markDirty();
    this.save();
  }

  /**
   * Get shot distribution stats (F22)
   */
  getShotDistribution(): Record<number, number> {
    return this.cache.shotDistribution ? { ...this.cache.shotDistribution } : {};
  }

  /**
   * Record tool call count (F)
   */
  recordToolCall(): void {
    this.cache.toolCallCount = (this.cache.toolCallCount || 0) + 1;
    this.markDirty();
    this.save();
  }

  /**
   * Get tool call count
   */
  getToolCallCount(): number {
    return this.cache.toolCallCount || 0;
  }

  /**
   * Reset all stats
   */
  reset(): void {
    this.cache = createDefaultCache();
    this.markDirty();
    this.save();
  }

  /**
   * Force save
   */
  flush(): void {
    this.save();
  }

  /**
   * Get statistics
   */
  getStats(): {
    version: number;
    totalSessions: number;
    totalMessages: number;
    modelCount: number;
    lastComputedDate: string | null;
    cacheDirty: boolean;
  } {
    return {
      version: this.cache.version,
      totalSessions: this.cache.totalSessions,
      totalMessages: this.cache.totalMessages,
      modelCount: Object.keys(this.cache.modelUsage).length,
      lastComputedDate: this.cache.lastComputedDate,
      cacheDirty: this.dirty,
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalManager: StatsCacheManager | null = null;

export function getStatsCacheManager(): StatsCacheManager {
  if (!globalManager) {
    globalManager = new StatsCacheManager();
  }
  return globalManager;
}

export function resetStatsCacheManager(): void {
  if (globalManager) {
    globalManager.flush();
    globalManager = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Record session stats
 */
export function recordSessionStats(stats: SessionStats): void {
  const manager = getStatsCacheManager();
  manager.recordSession(stats);
}

/**
 * Record model usage
 */
export function recordModelUsage(model: string, inputTokens: number, outputTokens: number): void {
  const manager = getStatsCacheManager();
  manager.recordModelUsage(model, inputTokens, outputTokens);
}

/**
 * Get session statistics
 */
export function getSessionStatistics(): ReturnType<StatsCacheManager['getTotalActivity']> {
  const manager = getStatsCacheManager();
  return manager.getTotalActivity();
}

/**
 * Get model usage summary
 */
export function getModelUsage(): ModelUsage[] {
  const manager = getStatsCacheManager();
  return manager.getModelUsageSummary();
}