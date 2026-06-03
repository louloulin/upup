/**
 * NorthBoundAdapter unit tests.
 */

import { describe, expect, test } from 'bun:test';
import { NorthBoundAdapter } from './north-bound.js';
import { mockNorthBoundResponse } from './_test-fixtures.js';

describe('NorthBoundAdapter', () => {
  test('fetches 3 sub-events (sh, sz, margin)', async () => {
    const adapter = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const events = await adapter.fetch({});
    expect(events.length).toBe(3);
    const subTypes = events.map(e => (e.raw as { subType: string }).subType);
    expect(subTypes.sort()).toEqual(['margin', 'sh-connect', 'sz-connect']);
  });

  test('positive netInflow maps to positive sentiment', async () => {
    const adapter = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const events = await adapter.fetch({});
    const sh = events.find(e => (e.raw as { subType: string }).subType === 'sh-connect');
    expect(sh).toBeDefined();
    expect(sh!.sentiment).toBe('positive');
  });

  test('negative margin change maps to negative sentiment', async () => {
    const adapter = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const events = await adapter.fetch({});
    const margin = events.find(e => (e.raw as { subType: string }).subType === 'margin');
    expect(margin).toBeDefined();
    expect(margin!.sentiment).toBe('negative');
  });

  test('throws NO_CREDENTIALS when no fetcher and no apiKey', async () => {
    const adapter = new NorthBoundAdapter({});
    await expect(adapter.fetch({})).rejects.toThrow('HKEX_CONNECT_KEY not set');
  });

  test('filters by symbols (sh topBuys must contain 600519.SH)', async () => {
    const adapter = new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse });
    const events = await adapter.fetch({ symbols: ['600519.SH'] });
    // sh-connect: symbols=['600519.SH',...] → included
    // sz-connect: symbols=['000001.SZ',...] → not included
    // margin: symbols=[] → not included
    expect(events.length).toBe(1);
    expect((events[0].raw as { subType: string }).subType).toBe('sh-connect');
  });
});
