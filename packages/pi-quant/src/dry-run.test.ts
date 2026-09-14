import { describe, expect, test } from 'bun:test';
import { createDryRunUniverse, dryRunEvidence } from './dry-run.js';

describe('createDryRunUniverse', () => {
  test('returns 10 symbols by default', () => {
    const universe = createDryRunUniverse();
    expect(universe.symbols.length).toBe(10);
  });
  test('every symbol has bar series', () => {
    const universe = createDryRunUniverse();
    for (const sym of universe.symbols) {
      const bars = universe.bars.get(sym);
      expect(bars).toBeDefined();
      expect(bars!.length).toBeGreaterThan(0);
    }
  });
  test('bars include OHLCV + fundamentals', () => {
    const universe = createDryRunUniverse();
    const first = universe.bars.get(universe.symbols[0])![0];
    expect(first.open).toBeDefined();
    expect(first.high).toBeDefined();
    expect(first.low).toBeDefined();
    expect(first.close).toBeGreaterThan(0);
    expect(first.volume).toBeGreaterThan(0);
    expect(first.fundamental?.pe).toBeDefined();
  });
});

describe('dryRunEvidence', () => {
  test('reports dry-run source', () => {
    expect(dryRunEvidence().source).toBe('dry-run://pi-quant');
    expect(dryRunEvidence().dataFreshness).toBe('offline');
  });
});
