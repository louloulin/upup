/**
 * VWAP algo unit tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: VWAP Algorithm
 */

import { describe, expect, test } from 'bun:test';
import { VwapAlgo } from './vwap.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';
import type { ParentOrder } from './types.js';

function shSessionMorning(): number {
  return Date.UTC(2026, 5, 4, 1, 30, 0); // 09:30 +08:00
}

describe('VwapAlgo', () => {
  test('flat volume profile produces evenly-distributed children summing to parent', () => {
    const algo = new VwapAlgo({ volumeProfile: Array(240).fill(1) });
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 2400,
      duration: { startMs: start, endMs: start + 60 * 60_000 }, // 1 hour
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    // 60 minutes = 60 children
    expect(schedule.length).toBe(60);
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(2400);
  });

  test('U-shaped profile (heavy open/close) puts more shares at the edges', () => {
    const profile: number[] = Array(240).fill(1);
    for (let m = 0; m < 15; m++) profile[m] = 4;       // 09:30-09:45 heavy
    for (let m = 225; m < 240; m++) profile[m] = 4;   // 14:45-15:00 heavy
    const algo = new VwapAlgo({ volumeProfile: profile });
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 10_000,
      duration: { startMs: start, endMs: start + 60 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    // The first 15 children (open) should have > 2x the quantity of mid-day children
    const openQty = schedule.slice(0, 15).reduce((a, c) => a + c.quantity, 0);
    const midQty = schedule.slice(50, 65).reduce((a, c) => a + c.quantity, 0);
    expect(openQty).toBeGreaterThan(midQty * 1.5);
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(10_000);
  });

  test('crosses lunch break and only emits children in active sessions', () => {
    const algo = new VwapAlgo();
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 4 * 3_600_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    const lunchStart = start + 2 * 3_600_000;       // 11:30
    const lunchEnd = start + 3 * 3_600_000 + 30 * 60_000; // 13:00
    for (const child of schedule) {
      const inLunch = child.scheduledAtMs >= lunchStart && child.scheduledAtMs < lunchEnd;
      expect(inLunch).toBe(false);
    }
  });

  test('minChildQuantity merges tiny children into prior', () => {
    const algo = new VwapAlgo();
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 100,
      duration: { startMs: start, endMs: start + 30 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
      minChildQuantity: 5,
    };
    const schedule = algo.schedule(parent);
    for (const child of schedule) {
      expect(child.quantity).toBeGreaterThanOrEqual(5);
    }
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(100);
  });

  test('default profile is used when no profile is supplied', () => {
    const algo = new VwapAlgo();
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 30 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    expect(schedule.length).toBeGreaterThan(0);
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(1000);
  });
});
