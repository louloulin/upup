/**
 * TWAP algo unit tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 */

import { describe, expect, test } from 'bun:test';
import { TwapAlgo } from './twap.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';
import type { ParentOrder } from './types.js';

const TZ_OFFSET_MS = 8 * 3_600_000; // Asia/Shanghai is UTC+8 (no DST)

/** Build a 2026-06-04 (Thursday) Asia/Shanghai session start in UTC ms. */
function shSessionMorning(): number {
  // 2026-06-04 09:30 +08:00 = 2026-06-04 01:30 UTC
  return Date.UTC(2026, 5, 4, 1, 30, 0);
}

describe('TwapAlgo', () => {
  test('30-minute parent order produces ~30 minute-spaced child orders', () => {
    const algo = new TwapAlgo({ defaultIntervalMs: 60_000 });
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 10_000,
      duration: { startMs: start, endMs: start + 30 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    // 30 minutes / 1 minute per child = ~30 children (allow ±1)
    expect(schedule.length).toBeGreaterThanOrEqual(28);
    expect(schedule.length).toBeLessThanOrEqual(32);
    // Total quantity sums to parent
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(parent.quantity);
    // All children fall within the morning session
    const sessionEnd = start + 120 * 60_000; // 11:30 - 09:30 = 2h
    for (const child of schedule) {
      expect(child.scheduledAtMs).toBeGreaterThanOrEqual(start);
      expect(child.scheduledAtMs).toBeLessThanOrEqual(sessionEnd);
    }
  });

  test('parent that crosses lunch break is split into morning + afternoon', () => {
    const algo = new TwapAlgo({ defaultIntervalMs: 60_000 });
    // 09:30 → 14:00 covers morning (2h) + lunch (1.5h) + afternoon start
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 4 * 3_600_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    // Some children in morning, some in afternoon, none during lunch (11:30-13:00)
    const lunchStart = start + 2 * 3_600_000;  // 11:30
    const lunchEnd = start + 3 * 3_600_000 + 30 * 60_000; // 13:00
    for (const child of schedule) {
      const inLunch = child.scheduledAtMs >= lunchStart && child.scheduledAtMs < lunchEnd;
      expect(inLunch).toBe(false);
    }
    expect(schedule.length).toBeGreaterThan(5);
  });

  test('minChildQuantity merges tiny children into prior', () => {
    const algo = new TwapAlgo({ defaultIntervalMs: 60_000 });
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'sell',
      quantity: 100,
      duration: { startMs: start, endMs: start + 30 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
      minChildQuantity: 5,
    };
    const schedule = algo.schedule(parent);
    // Every remaining child should be >= 5 (or the schedule collapsed)
    for (const child of schedule) {
      expect(child.quantity).toBeGreaterThanOrEqual(5);
    }
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(100);
  });

  test('maxChildQuantity caps each child but keeps sum = parent quantity', () => {
    const algo = new TwapAlgo({ defaultIntervalMs: 60_000 });
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 10_000,
      duration: { startMs: start, endMs: start + 60 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
      maxChildQuantity: 500,
    };
    const schedule = algo.schedule(parent);
    for (const child of schedule) {
      expect(child.quantity).toBeLessThanOrEqual(500);
    }
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(10_000);
  });

  test('empty schedule when duration is zero', () => {
    const algo = new TwapAlgo();
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    expect(schedule).toHaveLength(0);
  });

  test('sequence numbers are 0-indexed and contiguous', () => {
    const algo = new TwapAlgo({ defaultIntervalMs: 60_000 });
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 30 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    for (let i = 0; i < schedule.length; i++) {
      expect(schedule[i]!.sequence).toBe(i);
    }
  });
});
