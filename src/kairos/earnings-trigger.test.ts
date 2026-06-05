/**
 * earnings-trigger tests (P1.a.3)
 *
 * Coverage:
 *  - daysUntil helper: positive / negative / fractional / zero
 *  - run() emits one event per upcoming earnings within window
 *  - past earnings (within window) are still emitted with inPast=true
 *  - earnings outside window are skipped
 *  - ticker uppercased
 *  - isDossierStale=false → ticker skipped, recorded in skippedFresh
 *  - stable sort: nearest first, then ticker alphabetical
 *  - bus receives events with correct topic and payload
 *  - empty calendar → no events emitted
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createEventBus, type EventBus } from '../core/event-bus.js';
import {
  createEarningsTrigger,
  daysUntil,
  type EarningsCalendarEntry,
  type EarningsTriggerConfig,
  type EarningsUpcomingEvent,
} from './earnings-trigger.js';

const FIXED_NOW = 1_700_000_000_000; // 2023-11-14T22:13:20Z
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOffset(daysFromNow: number): number {
  return FIXED_NOW + daysFromNow * DAY_MS;
}

describe('daysUntil', () => {
  test('returns whole days, rounded toward zero', () => {
    expect(daysUntil(dateOffset(0), FIXED_NOW)).toBe(0);
    expect(daysUntil(dateOffset(7), FIXED_NOW)).toBe(7);
    expect(daysUntil(dateOffset(-3), FIXED_NOW)).toBe(-3);
    // 12 hours = 0.5 day → truncated to 0
    expect(daysUntil(FIXED_NOW + 12 * 60 * 60 * 1000, FIXED_NOW)).toBe(0);
    // 36 hours = 1.5 day → truncated to 1
    expect(daysUntil(FIXED_NOW + 36 * 60 * 60 * 1000, FIXED_NOW)).toBe(1);
  });
});

describe('createEarningsTrigger', () => {
  let bus: EventBus;
  let captured: EarningsUpcomingEvent[];
  let unsub: () => void;

  beforeEach(() => {
    bus = createEventBus({ bufferSize: 200 });
    captured = [];
    unsub = bus.on<EarningsUpcomingEvent>('kairos.scanner.earnings-upcoming', (e) => {
      captured.push(e.payload);
    });
  });

  function buildTrigger(opts: {
    calendar: EarningsCalendarEntry[];
    config?: EarningsTriggerConfig;
  }) {
    return createEarningsTrigger({
      bus,
      fetchCalendar: async () => opts.calendar,
      config: { now: () => FIXED_NOW, ...opts.config },
    });
  }

  test('emits one event per upcoming earnings within window', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'NVDA', earningsDate: dateOffset(5), session: 'post-market' },
        { ticker: 'AAPL', earningsDate: dateOffset(1), session: 'post-market' },
        { ticker: 'TSLA', earningsDate: dateOffset(15), session: 'post-market' }, // outside window
      ],
    });
    const result = await trigger.run();
    expect(result.scanned).toBe(3);
    expect(result.fired).toHaveLength(2);
    expect(result.fired.map(e => e.ticker).sort()).toEqual(['AAPL', 'NVDA']);
  });

  test('past earnings (within window) are still emitted with inPast=true', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'X', earningsDate: dateOffset(-3), session: 'post-market' },
      ],
    });
    const result = await trigger.run();
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0]!.inPast).toBe(true);
    expect(result.fired[0]!.daysUntil).toBe(-3);
  });

  test('ticker is uppercased', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'nvda', earningsDate: dateOffset(2), session: 'post-market' },
      ],
    });
    const result = await trigger.run();
    expect(result.fired[0]!.ticker).toBe('NVDA');
  });

  test('earnings outside window are skipped', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'A', earningsDate: dateOffset(8), session: 'post-market' },
        { ticker: 'B', earningsDate: dateOffset(-8), session: 'post-market' },
      ],
    });
    const result = await trigger.run();
    expect(result.fired).toHaveLength(0);
  });

  test('isDossierStale=false → ticker skipped and recorded in skippedFresh', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'FRESH', earningsDate: dateOffset(3), session: 'post-market' },
        { ticker: 'STALE', earningsDate: dateOffset(3), session: 'post-market' },
      ],
      config: {
        isDossierStale: (t) => t !== 'FRESH',
      },
    });
    const result = await trigger.run();
    expect(result.fired.map(e => e.ticker)).toEqual(['STALE']);
    expect(result.skippedFresh).toEqual(['FRESH']);
  });

  test('dossierStale=true on the emitted event reflects the isDossierStale check', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'STALE', earningsDate: dateOffset(3), session: 'post-market' },
      ],
      config: { isDossierStale: () => true },
    });
    const result = await trigger.run();
    expect(result.fired[0]!.dossierStale).toBe(true);
  });

  test('stable sort: nearest earnings first, then ticker alphabetical', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'Z', earningsDate: dateOffset(2), session: 'post-market' },
        { ticker: 'A', earningsDate: dateOffset(2), session: 'post-market' },
        { ticker: 'M', earningsDate: dateOffset(5), session: 'post-market' },
      ],
    });
    const result = await trigger.run();
    expect(result.fired.map(e => `${e.ticker}-${e.daysUntil}`)).toEqual([
      'A-2', 'Z-2', 'M-5',
    ]);
  });

  test('emits the correct topic and payload on the bus', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'NVDA', earningsDate: dateOffset(3), session: 'post-market', estimatedEps: 5.2, estimatedRevenue: 22_000_000_000 },
      ],
    });
    await trigger.run();
    expect(captured).toHaveLength(1);
    expect(captured[0]!.ticker).toBe('NVDA');
    expect(captured[0]!.estimatedEps).toBe(5.2);
    expect(captured[0]!.daysUntil).toBe(3);
    expect(captured[0]!.inPast).toBe(false);
  });

  test('empty calendar → no events, empty result', async () => {
    const trigger = buildTrigger({ calendar: [] });
    const result = await trigger.run();
    expect(result.scanned).toBe(0);
    expect(result.fired).toEqual([]);
    expect(result.skippedFresh).toEqual([]);
    expect(captured).toEqual([]);
  });

  test('custom triggerWindowDays is respected', async () => {
    const trigger = buildTrigger({
      calendar: [
        { ticker: 'NEAR', earningsDate: dateOffset(2), session: 'post-market' },
        { ticker: 'FAR', earningsDate: dateOffset(4), session: 'post-market' },
      ],
      config: { triggerWindowDays: 3 },
    });
    const result = await trigger.run();
    expect(result.fired.map(e => e.ticker)).toEqual(['NEAR']);
  });

  test('custom topicPrefix changes the emitted topic', async () => {
    const customCaptured: EarningsUpcomingEvent[] = [];
    bus.on<EarningsUpcomingEvent>('custom.earnings-upcoming', (e) => {
      customCaptured.push(e.payload);
    });
    const trigger = createEarningsTrigger({
      bus,
      fetchCalendar: async () => [
        { ticker: 'X', earningsDate: dateOffset(2), session: 'post-market' },
      ],
      config: { now: () => FIXED_NOW, topicPrefix: 'custom' },
    });
    await trigger.run();
    expect(customCaptured).toHaveLength(1);
    expect(captured).toEqual([]); // default topic not fired
  });
});
