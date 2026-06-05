/**
 * Recent Usage Tracking for Skills
 *
 * Implements 7-day half-life scoring for skill usage:
 * score = useCount * exp(-lambda * daysSinceLastUse)
 * where lambda = ln(2) / 7
 *
 * Reference: Claude Code's recent usage tracking
 */

import { homedir } from 'os';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

/**
 * Usage record for a single skill
 */
export interface UsageRecord {
  skillName: string;
  lastUsed: string;  // ISO timestamp
  useCount: number;
}

/**
 * All usage records
 */
interface UsageData {
  records: Record<string, UsageRecord>;
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

const HALF_LIFE_DAYS = 7;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;  // ln(2) / 7
const USAGE_FILE = join(homedir(), '.upup', 'recent-skills.json');

// ============================================================================
// Storage
// ============================================================================

let usageCache: UsageData | null = null;

/**
 * Load usage data from disk
 */
async function loadUsageData(): Promise<UsageData> {
  if (usageCache) {
    return usageCache;
  }

  try {
    if (existsSync(USAGE_FILE)) {
      const content = await readFile(USAGE_FILE, 'utf-8');
      usageCache = JSON.parse(content);
      return usageCache!;
    }
  } catch {
    // File doesn't exist or is corrupted, start fresh
  }

  usageCache = { records: {}, lastUpdated: new Date().toISOString() };
  return usageCache;
}

/**
 * Save usage data to disk
 */
async function saveUsageData(data: UsageData): Promise<void> {
  try {
    // Ensure directory exists
    const dir = join(homedir(), '.upup');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    data.lastUpdated = new Date().toISOString();
    await writeFile(USAGE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.warn('[recent-usage] Failed to save:', error);
  }
}

// ============================================================================
// Scoring
// ============================================================================

/**
 * Calculate half-life score for a skill
 * Higher score = more recently/frequently used
 */
export function calculateScore(record: UsageRecord): number {
  const lastUsed = new Date(record.lastUsed);
  const now = new Date();
  const daysSinceLastUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);

  // Decay with 7-day half-life
  const decay = Math.exp(-LAMBDA * daysSinceLastUse);
  return record.useCount * decay;
}

/**
 * Get score for a skill by name
 */
export function getRecentScore(skillName: string): number {
  const data = usageCache;
  if (!data) return 0;

  const record = data.records[skillName.toLowerCase()];
  if (!record) return 0;

  return calculateScore(record);
}

// ============================================================================
// Tracking
// ============================================================================

/**
 * Record skill usage
 */
export async function recordUsage(skillName: string): Promise<void> {
  const data = await loadUsageData();
  const key = skillName.toLowerCase();

  if (data.records[key]) {
    data.records[key].useCount++;
    data.records[key].lastUsed = new Date().toISOString();
  } else {
    data.records[key] = {
      skillName: key,
      lastUsed: new Date().toISOString(),
      useCount: 1,
    };
  }

  await saveUsageData(data);
}

/**
 * Get all skills with their recent usage scores
 */
export async function getAllRecentScores(): Promise<Map<string, number>> {
  const data = await loadUsageData();
  const scores = new Map<string, number>();

  for (const [key, record] of Object.entries(data.records)) {
    scores.set(key, calculateScore(record));
  }

  return scores;
}

/**
 * Clear usage data (for testing)
 */
export async function clearUsageData(): Promise<void> {
  usageCache = null;
  try {
    const { unlink } = await import('fs/promises');
    await unlink(USAGE_FILE);
  } catch {
    // File doesn't exist, ignore
  }
}

/**
 * Get usage stats
 */
export async function getUsageStats(): Promise<{
  totalSkills: number;
  mostUsed: Array<{ name: string; count: number; score: number }>;
}> {
  const data = await loadUsageData();
  const entries = Object.values(data.records)
    .map(r => ({
      name: r.skillName,
      count: r.useCount,
      score: calculateScore(r),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    totalSkills: entries.length,
    mostUsed: entries.slice(0, 10),
  };
}
