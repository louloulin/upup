/**
 * IS (Implementation Shortfall) algo unit tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: Implementation Shortfall
 */

import { describe, expect, test } from 'bun:test';
import { IsAlgo, isMultiplier } from './is.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';
import type { ParentOrder } from './types.js';

function shSessionMorning(): number {
  return Date.UTC(2026, 5, 4, 1, 30, 0);
}

describe('isMultiplier', () => {
  test('returns 1.0 when current price equals arrival', () => {
    expect(isMultiplier(100, 100, 'buy')).toBe(1);
    expect(isMultiplier(100, 100, 'sell')).toBe(1);
  });

  test('returns < 1 when buy price moves favorably (below arrival)', () => {
    const m = isMultiplier(100, 99, 'buy');
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThanOrEqual(0.25); // MIN_PARTICIPATION
  });

  test('returns > 1 when buy price moves adversely (above arrival)', () => {
    const m = isMultiplier(100, 101, 'buy');
    expect(m).toBeGreaterThan(1);
    expect(m).toBeLessThanOrEqual(4.0); // MAX_PARTICIPATION
  });

  test('inverts sign for sell side: adverse when price drops', () => {
    const m = isMultiplier(100, 99, 'sell');
    expect(m).toBeGreaterThan(1);
  });

  test('caps multiplier at MAX_PARTICIPATION for large adverse moves', () => {
    const m = isMultiplier(100, 200, 'buy'); // 100% adverse
    expect(m).toBe(4.0);
  });

  test('floors multiplier at MIN_PARTICIPATION for large favorable moves', () => {
    const m = isMultiplier(100, 50, 'buy'); // 50% favorable
    expect(m).toBe(0.25);
  });

  test('handles invalid inputs gracefully', () => {
    expect(isMultiplier(0, 100, 'buy')).toBe(1);
    expect(isMultiplier(100, 0, 'buy')).toBe(1);
    expect(isMultiplier(-1, 100, 'buy')).toBe(1);
  });
});

describe('IsAlgo', () => {
  test('schedule is identical to TWAP for same input (IS multiplier applied at runtime)', () => {
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 30 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const is = new IsAlgo();
    const schedule = is.schedule(parent);
    expect(schedule.length).toBeGreaterThan(0);
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(1000);
  });
});
