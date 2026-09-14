/**
 * recent-usage tests — verify getAllRecentCounts() returns raw use
 * counts (no decay) and that calculateScore() applies the 7-day
 * half-life correctly.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  calculateScore,
  clearUsageData,
  getAllRecentCounts,
  getAllRecentScores,
  recordUsage,
  type UsageRecord,
} from '@upup/skills';

describe('recent-usage (P1.7 round 3)', () => {
  beforeEach(async () => {
    await clearUsageData();
  });

  afterEach(async () => {
    await clearUsageData();
  });

  test('getAllRecentCounts returns raw counts, no decay', async () => {
    await recordUsage('foo');
    await recordUsage('foo');
    await recordUsage('foo');
    await recordUsage('bar');
    const counts = await getAllRecentCounts();
    expect(counts.get('foo')).toBe(3);
    expect(counts.get('bar')).toBe(1);
  });

  test('getAllRecentScores applies half-life decay', async () => {
    await recordUsage('foo');
    await recordUsage('foo');
    await recordUsage('foo');
    const scores = await getAllRecentScores();
    const count = (await getAllRecentCounts()).get('foo')!;
    const score = scores.get('foo')!;
    // Score should be count * exp(-λ * 0) ≈ count, slightly less
    // (no time has passed in the test).
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(count);
  });

  test('calculateScore with explicit record', () => {
    const record: UsageRecord = {
      skillName: 'test',
      lastUsed: new Date().toISOString(),
      useCount: 10,
    };
    const score = calculateScore(record);
    // Just-used record: score ≈ 10, very close (tiny time delta)
    expect(score).toBeGreaterThan(9.99);
    expect(score).toBeLessThanOrEqual(10);
  });

  test('calculateScore with old record decays', () => {
    const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const record: UsageRecord = {
      skillName: 'test',
      lastUsed: oldDate.toISOString(),
      useCount: 10,
    };
    const score = calculateScore(record);
    // 7-day half-life: score ≈ 10 * 0.5 = 5
    expect(score).toBeGreaterThan(4.5);
    expect(score).toBeLessThan(5.5);
  });

  test('empty usage data returns empty maps', async () => {
    const counts = await getAllRecentCounts();
    const scores = await getAllRecentScores();
    expect(counts.size).toBe(0);
    expect(scores.size).toBe(0);
  });
});
