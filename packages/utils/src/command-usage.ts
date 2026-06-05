/**
 * Command Usage Tracking (Phase 62)
 *
 * Persists command usage scores across sessions.
 * Scores are used to sort commands by frequency.
 *
 * Reference: loucode/src/utils/suggestions/skillUsageTracking.ts
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface CommandUsageData {
  /** Command name → usage count */
  commands: Record<string, number>;
  /** Last updated timestamp */
  lastUpdated: number;
  /** Version for migration */
  version: number;
}

export interface UsageScore {
  /** Command name */
  name: string;
  /** Usage count */
  count: number;
  /** Normalized score (0-1) */
  score: number;
}

// ============================================================================
// Constants
// ============================================================================

const USAGE_FILE_VERSION = 1;
const MAX_SCORE = 1000; // Maximum usage count for normalization
const USAGE_DIR = join(homedir(), '.upup');
const USAGE_FILE = join(USAGE_DIR, 'command-usage.json');

// ============================================================================
// In-Memory Cache
// ============================================================================

let cachedData: CommandUsageData | null = null;
let cacheDirty = false;

// ============================================================================
// File Operations
// ============================================================================

/**
 * Load usage data from disk
 */
function loadUsageData(): CommandUsageData {
  if (cachedData) {
    return cachedData;
  }

  try {
    if (existsSync(USAGE_FILE)) {
      const content = readFileSync(USAGE_FILE, 'utf-8');
      const data = JSON.parse(content) as CommandUsageData;

      // Version migration
      if (data.version !== USAGE_FILE_VERSION) {
        // Migrate data if needed
        data.version = USAGE_FILE_VERSION;
        saveUsageData(data);
      }

      cachedData = data;
      return data;
    }
  } catch (error) {
    console.error('Failed to load usage data:', error);
  }

  // Return default data
  const defaultData: CommandUsageData = {
    commands: {},
    lastUpdated: Date.now(),
    version: USAGE_FILE_VERSION,
  };
  cachedData = defaultData;
  return defaultData;
}

/**
 * Save usage data to disk
 */
function saveUsageData(data: CommandUsageData): void {
  try {
    // Ensure directory exists
    if (!existsSync(USAGE_DIR)) {
      mkdirSync(USAGE_DIR, { recursive: true });
    }

    data.lastUpdated = Date.now();
    writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    cachedData = data;
    cacheDirty = false;
  } catch (error) {
    console.error('Failed to save usage data:', error);
  }
}

/**
 * Ensure data is persisted
 */
export function flushUsageData(): void {
  if (cacheDirty && cachedData) {
    saveUsageData(cachedData);
  }
}

// ============================================================================
// Usage Tracking API
// ============================================================================

/**
 * Get the usage count for a command
 */
export function getCommandUsageCount(commandName: string): number {
  const data = loadUsageData();
  return data.commands[commandName.toLowerCase()] ?? 0;
}

/**
 * Record that a command was used
 */
export function recordCommandUsage(commandName: string): void {
  const data = loadUsageData();
  const key = commandName.toLowerCase();

  data.commands[key] = (data.commands[key] ?? 0) + 1;
  cacheDirty = true;

  // Auto-save periodically (every 10 updates)
  const totalUpdates = Object.values(data.commands).reduce((a, b) => a + b, 0);
  if (totalUpdates % 10 === 0) {
    saveUsageData(data);
  }
}

/**
 * Get usage score for sorting (0-1 based on frequency)
 */
export function getUsageScore(commandName: string): number {
  const count = getCommandUsageCount(commandName);
  // Normalize to 0-1 range with logarithmic scaling
  if (count === 0) return 0;
  return Math.min(1, Math.log(count + 1) / Math.log(MAX_SCORE + 1));
}

/**
 * Get all usage scores, sorted by frequency
 */
export function getAllUsageScores(): UsageScore[] {
  const data = loadUsageData();

  const scores: UsageScore[] = Object.entries(data.commands).map(
    ([name, count]) => ({
      name,
      count,
      score: Math.min(1, Math.log(count + 1) / Math.log(MAX_SCORE + 1)),
    })
  );

  // Sort by score descending
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Get top N most used commands
 */
export function getTopUsedCommands(n = 10): UsageScore[] {
  return getAllUsageScores().slice(0, n);
}

/**
 * Reset usage data for a specific command
 */
export function resetCommandUsage(commandName: string): void {
  const data = loadUsageData();
  const key = commandName.toLowerCase();
  delete data.commands[key];
  cacheDirty = true;
  saveUsageData(data);
}

/**
 * Clear all usage data
 */
export function clearAllUsage(): void {
  const data: CommandUsageData = {
    commands: {},
    lastUpdated: Date.now(),
    version: USAGE_FILE_VERSION,
  };
  cachedData = data;
  cacheDirty = true;
  saveUsageData(data);
}

/**
 * Get usage statistics
 */
export function getUsageStats(): {
  totalCommands: number;
  totalUses: number;
  lastUpdated: number;
  topCommands: UsageScore[];
} {
  const data = loadUsageData();
  const totalUses = Object.values(data.commands).reduce((a, b) => a + b, 0);

  return {
    totalCommands: Object.keys(data.commands).length,
    totalUses,
    lastUpdated: data.lastUpdated,
    topCommands: getTopUsedCommands(5),
  };
}

// ============================================================================
// Import/Export
// ============================================================================

/**
 * Import usage data from a file
 */
export function importUsageData(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) {
      return false;
    }

    const content = readFileSync(filePath, 'utf-8');
    const imported = JSON.parse(content) as Partial<CommandUsageData>;

    if (!imported.commands || typeof imported.commands !== 'object') {
      return false;
    }

    const data = loadUsageData();

    // Merge commands (imported values win)
    for (const [name, count] of Object.entries(imported.commands)) {
      if (typeof count === 'number') {
        data.commands[name.toLowerCase()] = Math.max(
          data.commands[name.toLowerCase()] ?? 0,
          count
        );
      }
    }

    cacheDirty = true;
    saveUsageData(data);
    return true;
  } catch (error) {
    console.error('Failed to import usage data:', error);
    return false;
  }
}

/**
 * Export usage data to a file
 */
export function exportUsageData(filePath: string): boolean {
  try {
    const data = loadUsageData();
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to export usage data:', error);
    return false;
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up old commands (not used in a while)
 */
export function pruneOldCommands(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): number {
  // Note: Without timestamps per command, we can't prune by age
  // This is a placeholder for future implementation
  return 0;
}

// ============================================================================
// Initialization
// ============================================================================

// Ensure data is saved on process exit
if (typeof process !== 'undefined' && process.on) {
  process.on('beforeExit', () => {
    flushUsageData();
  });

  // Also handle SIGINT
  process.on('SIGINT', () => {
    flushUsageData();
    process.exit(0);
  });
}
