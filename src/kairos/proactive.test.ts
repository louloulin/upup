/**
 * Tests for the proactive opportunity discovery engine.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      (Requirement: Proactive Opportunity Discovery)
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { createEventBus, type EventBus } from '../core/event-bus.js';
import {
  _internal,
  createProactiveScanner,
  type MarketSnapshot,
  type ScanResult,
} from './proactive.js';
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

describe('proactive scanner', () => {
  let bus: EventBus;
  const received: Array<{ topic: string; payload: Opportunity }> = [];

  beforeEach(() => {
    bus = createEventBus();
    received.length = 0;
    // Subscribe to every kairos.opportunity.* topic
    bus.on<Opportunity>('kairos.opportunity.*', (e) => {
      received.push({ topic: e.topic, payload: e.payload });
    });
  });

  test('skips scan when user is not idle', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 0,
      now: () => FIXED_NOW,
    });
    const result = await scanner.scan();
    expect(result.skipped).toBe(true);
    expect(result.emitted).toBe(0);
    expect(received.length).toBe(0);
  });

  test('skips scan when idle is below threshold (default 1h)', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [snap({ symbol: 'AAPL' })],
      getIdleMs: () => 30 * 60 * 1000, // 30 min
      now: () => FIXED_NOW,
    });
    const result = await scanner.scan();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/below threshold/);
  });

  test('breakout detector fires on gap + volume surge', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        snap({ symbol: 'X', last: 110, prevClose: 100, volume: 3_000_000, avgVolume20d: 1_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
      now: () => FIXED_NOW,
    });
    const result: ScanResult = await scanner.scan();
    expect(result.skipped).toBe(false);
    expect(result.emitted).toBe(1);
    const opp = result.opportunities[0]!;
    expect(opp.kind).toBe('technical-breakout');
    expect(opp.confidence).toBeGreaterThan(0.5);
    expect(opp.headline).toMatch(/breakout/);
    expect(received.length).toBe(1);
    expect(received[0]!.topic).toBe('kairos.opportunity.technical-breakout');
  });

  test('breakout detector does not fire on low volume even with gap', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        snap({ symbol: 'X', last: 110, prevClose: 100, volume: 1_000_000, avgVolume20d: 1_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
    });
    const result = await scanner.scan();
    expect(result.emitted).toBe(0);
  });

  test('valuation re-rating detector fires when PE diverges from sector', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        snap({ symbol: 'V', pe: 8, sectorPe: 15 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
    });
    const result = await scanner.scan();
    expect(result.opportunities.some((o) => o.kind === 'valuation-rerating')).toBe(true);
  });

  test('sentiment shift detector fires on strong negative or positive sentiment', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        snap({ symbol: 'S', sentiment: 0.8 }),
        snap({ symbol: 'S2', sentiment: -0.7 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
    });
    const result = await scanner.scan();
    const sentiments = result.opportunities.filter((o) => o.kind === 'sentiment-shift');
    expect(sentiments.length).toBe(2);
  });

  test('flow anomaly detector fires on large inflow or outflow', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        snap({ symbol: 'F', netInflow: 500_000_000 }),
        snap({ symbol: 'F2', netInflow: -300_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
    });
    const result = await scanner.scan();
    const flows = result.opportunities.filter((o) => o.kind === 'capital-flow-anomaly');
    expect(flows.length).toBe(2);
  });

  test('opportunities are ranked by confidence desc', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        // High confidence: huge gap + 5x volume
        snap({ symbol: 'A', last: 130, prevClose: 100, volume: 5_000_000, avgVolume20d: 1_000_000 }),
        // Lower confidence: just above threshold
        snap({ symbol: 'B', last: 102, prevClose: 100, volume: 2_200_000, avgVolume20d: 1_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
    });
    const result = await scanner.scan();
    expect(result.opportunities.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.opportunities.length; i++) {
      expect(result.opportunities[i - 1]!.confidence).toBeGreaterThanOrEqual(
        result.opportunities[i]!.confidence,
      );
    }
  });

  test('caps emitted opportunities at maxPerScan', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => {
        const arr: MarketSnapshot[] = [];
        for (let i = 0; i < 50; i++) {
          arr.push(
            snap({
              symbol: `S${i}`,
              last: 110 + i,
              prevClose: 100,
              volume: 3_000_000,
              avgVolume20d: 1_000_000,
            }),
          );
        }
        return arr;
      },
      getIdleMs: () => 2 * 60 * 60 * 1000,
      config: { maxPerScan: 5 },
    });
    const result = await scanner.scan();
    expect(result.opportunities.length).toBe(5);
    expect(received.length).toBe(5);
  });

  test('minConfidence filter drops low-confidence opportunities', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [
        // Just over gap + just over volume — borderline confidence ~0.5
        snap({ symbol: 'M', last: 102, prevClose: 100, volume: 2.1_000_000, avgVolume20d: 1_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
      config: { minConfidence: 0.99 },
    });
    const result = await scanner.scan();
    expect(result.opportunities.length).toBe(0);
  });

  test('emits to topicPrefix.kind topic', async () => {
    const customBus = createEventBus();
    const topics: string[] = [];
    customBus.on('alerts.*', (e) => topics.push(e.topic));
    const scanner = createProactiveScanner({
      bus: customBus,
      fetchSnapshots: async () => [
        snap({ symbol: 'C', last: 110, prevClose: 100, volume: 3_000_000, avgVolume20d: 1_000_000 }),
      ],
      getIdleMs: () => 2 * 60 * 60 * 1000,
      config: { topicPrefix: 'alerts' },
    });
    await scanner.scan();
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]).toBe('alerts.technical-breakout');
  });

  test('handles empty snapshot list', async () => {
    const scanner = createProactiveScanner({
      bus,
      fetchSnapshots: async () => [],
      getIdleMs: () => 2 * 60 * 60 * 1000,
    });
    const result = await scanner.scan();
    expect(result.scanned).toBe(0);
    expect(result.emitted).toBe(0);
  });

  test('detector unit: valuation re-rating does not fire when divergence < threshold', () => {
    const opp = _internal.detectValuationRerating(snap({ pe: 14, sectorPe: 15 }), FIXED_NOW);
    // divergence = (15-14)/15 = 0.067 < 0.3 threshold
    expect(opp).toBeNull();
  });

  test('detector unit: flow anomaly does not fire below threshold', () => {
    const opp = _internal.detectFlowAnomaly(snap({ netInflow: 50_000_000 }), FIXED_NOW);
    expect(opp).toBeNull();
  });

  test('detector unit: sentiment does not fire when neutral', () => {
    const opp = _internal.detectSentimentShift(snap({ sentiment: 0.1 }), FIXED_NOW);
    expect(opp).toBeNull();
  });
});
