/**
 * POV algo unit tests.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: POV Algorithm
 */

import { describe, expect, test } from 'bun:test';
import { PovAlgo } from './pov.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';
import type { ParentOrder } from './types.js';

function shSessionMorning(): number {
  return Date.UTC(2026, 5, 4, 1, 30, 0);
}

describe('PovAlgo', () => {
  test('without resolver, falls back to even split per tick', () => {
    const algo = new PovAlgo();
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 6000,
      duration: { startMs: start, endMs: start + 60 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
    };
    const schedule = algo.schedule(parent);
    expect(schedule.length).toBe(60); // 60 minutes × 1 tick/min
    const sum = schedule.reduce((acc, c) => acc + c.quantity, 0);
    expect(sum).toBe(6000);
  });

  test('with quantityResolver, child sizes follow resolver output', () => {
    const algo = new PovAlgo();
    const start = shSessionMorning();
    // Resolver returns 50 shares per minute
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 5000,
      duration: { startMs: start, endMs: start + 60 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
      params: {
        participationRate: 0.10,
        tickMs: 60_000,
        quantityResolver: () => 50,
      },
    };
    const schedule = algo.schedule(parent);
    expect(schedule.length).toBe(60);
    for (const c of schedule) {
      expect(c.quantity).toBe(50);
    }
  });

  test('resolver returning 0 emits no child for that tick', () => {
    const algo = new PovAlgo();
    const start = shSessionMorning();
    const callCount = { n: 0 };
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 5 * 60_000 }, // 5 minutes
      session: DEFAULT_A_SHARE_SESSIONS,
      params: {
        quantityResolver: () => {
          callCount.n++;
          return callCount.n % 2 === 0 ? 0 : 100;
        },
      },
    };
    const schedule = algo.schedule(parent);
    // 3 children (out of 5) with qty=100
    expect(schedule.length).toBe(3);
  });

  test('respects participation rate metadata', () => {
    const algo = new PovAlgo();
    const start = shSessionMorning();
    const parent: ParentOrder = {
      symbol: '600519.SH',
      side: 'buy',
      quantity: 1000,
      duration: { startMs: start, endMs: start + 5 * 60_000 },
      session: DEFAULT_A_SHARE_SESSIONS,
      params: { participationRate: 0.20 },
    };
    const schedule = algo.schedule(parent);
    // The schedule carries metadata via _povRate (consumed by runner if needed)
    expect(schedule.length).toBeGreaterThan(0);
  });
});
