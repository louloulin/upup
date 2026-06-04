/**
 * End-to-end test for ProactiveState + scanner integration.
 *
 * Wires the 6-property state machine into the existing proactive
 * scanner and verifies that:
 *   - inactive state → scanner skips without touching fetchSnapshots
 *   - active + paused → scanner skips
 *   - active + context-blocked → scanner skips
 *   - active + unpaused + unblocked + snapshots present → scanner emits
 *   - state changes during a scan batch → subsequent scans reflect
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { createEventBus, type EventBus } from '../core/event-bus.js';
import { createProactiveScanner, type MarketSnapshot } from './proactive.js';
import { ProactiveState } from './proactiveState.js';
import type { Opportunity } from './types.js';

const FIXED_NOW = 1_700_000_000_000;

function snap(over: Partial<MarketSnapshot>): MarketSnapshot {
  return {
    symbol: 'AAPL',
    last: 100,
    prevClose: 100,
    volume: 1_000_000,
    avgVolume20d: 1_000_000,
    ...over,
  };
}

describe('proactive + state E2E', () => {
  let bus: EventBus;
  let state: ProactiveState;
  const received: Opportunity[] = [];

  beforeEach(() => {
    bus = createEventBus();
    state = new ProactiveState();
    received.length = 0;
    bus.on<Opportunity>('kairos.opportunity.*', (e) => {
      received.push(e.payload);
    });
  });

  test('inactive state: scanner skips and reports skip reason', async () => {
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default // well above any threshold
      now: () => FIXED_NOW,
    });

    // state is inactive by default
    expect(state.shouldRun()).toBe(false);
    const result = await scanner.scan();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('proactive inactive');
    expect(result.opportunities).toEqual([]);
    expect(received).toEqual([]);
  });

  test('active + paused: scanner skips with paused reason', async () => {
    state.activate('cli-flag');
    state.pause();
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });
    const result = await scanner.scan();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('proactive paused');
  });

  test('active + context-blocked: scanner skips with context-blocked reason', async () => {
    state.activate('cli-flag');
    state.setContextBlocked(true);
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });
    const result = await scanner.scan();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('context-blocked');
  });

  test('active + clean state: scanner runs and emits opportunities', async () => {
    state.activate('cli-flag');
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [
        snap({ symbol: 'AAPL', last: 110, prevClose: 100, volume: 5_000_000, avgVolume20d: 1_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });
    const result = await scanner.scan();
    expect(result.skipped).toBe(false);
    expect(result.scanned).toBe(1);
    expect(result.emitted).toBeGreaterThan(0);
    expect(received.length).toBe(result.emitted);
    // The emitted opportunity is a technical-breakout
    expect(received[0]!.kind).toBe('technical-breakout');
    expect(received[0]!.symbol).toBe('AAPL');
  });

  test('state transition during scanner lifetime is reflected in next scan', async () => {
    state.activate('cli-flag');
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL', last: 110, prevClose: 100, volume: 5_000_000, avgVolume20d: 1_000_000 })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });

    // First scan: should run
    const r1 = await scanner.scan();
    expect(r1.skipped).toBe(false);
    expect(r1.emitted).toBeGreaterThan(0);
    const firstEmitted = r1.emitted;
    received.length = 0; // clear

    // Pause state
    state.pause();

    // Second scan: should skip
    const r2 = await scanner.scan();
    expect(r2.skipped).toBe(true);
    expect(r2.skipReason).toBe('proactive paused');
    expect(received.length).toBe(0);

    // Resume state
    state.resume();

    // Third scan: should run again
    const r3 = await scanner.scan();
    expect(r3.skipped).toBe(false);
    expect(r3.emitted).toBe(firstEmitted);
  });

  test('setNextTickAt does not block immediate scans (separate from state gate)', async () => {
    state.activate('cli-flag');
    state.setNextTickAt(FIXED_NOW + 1_000);
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL', last: 110, prevClose: 100, volume: 5_000_000, avgVolume20d: 1_000_000 })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });
    const result = await scanner.scan();
    expect(result.skipped).toBe(false);
    expect(state.getNextTickAt()).toBe(FIXED_NOW + 1_000);
  });

  test('deactivate stops scanner immediately', async () => {
    state.activate('cli-flag');
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });
    // First scan runs
    const r1 = await scanner.scan();
    expect(r1.skipped).toBe(false);

    // Deactivate
    state.deactivate();

    // Next scan skips
    const r2 = await scanner.scan();
    expect(r2.skipped).toBe(true);
    expect(r2.skipReason).toBe('proactive inactive');
  });

  test('state machine listeners see activate → scan → pause transitions', async () => {
    const transitions: string[] = [];
    state.subscribe((snap) => {
      transitions.push(`active=${snap.active} paused=${snap.paused} blocked=${snap.contextBlocked}`);
    });
    state.activate('cli-flag');
    const scanner = createProactiveScanner({
      bus,
      state,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 2 * 60 * 60 * 1000, // 2 hours, above 1h default
      now: () => FIXED_NOW,
    });
    await scanner.scan();
    state.pause();
    await scanner.scan();
    state.deactivate();
    await scanner.scan();

    // Expect transitions: activate → pause → deactivate
    expect(transitions).toContain('active=true paused=false blocked=false');
    expect(transitions).toContain('active=true paused=true blocked=false');
    expect(transitions).toContain('active=false paused=false blocked=false');
  });
});
