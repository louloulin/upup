/**
 * DragonTigerAdapter unit tests.
 */

import { describe, expect, test } from 'bun:test';
import { DragonTigerAdapter } from './dragon-tiger.js';
import { mockDragonTigerResponse } from './_test-fixtures.js';

describe('DragonTigerAdapter', () => {
  test('fetches and normalizes dragon-tiger events', async () => {
    const adapter = new DragonTigerAdapter({ fetcher: async () => mockDragonTigerResponse });
    const events = await adapter.fetch({ symbols: ['600519.SH'] });
    expect(events.length).toBe(1);
    expect(events[0].source).toBe('dragon-tiger');
    expect(events[0].symbols).toContain('600519.SH');
    expect(events[0].sentiment).toBe('positive');
  });

  test('throws NO_CREDENTIALS when no fetcher and no apiKey', async () => {
    const adapter = new DragonTigerAdapter({});
    await expect(adapter.fetch({})).rejects.toThrow('EAST_MONEY_LHB_KEY not set');
  });

  test('dedup by id (sha256) when same event appears twice', async () => {
    const dupResponse = {
      items: [...mockDragonTigerResponse.items, ...mockDragonTigerResponse.items],
    };
    const adapter = new DragonTigerAdapter({ fetcher: async () => dupResponse });
    const events = await adapter.fetch({});
    const ids = new Set(events.map(e => e.id));
    expect(ids.size).toBe(events.length);
  });

  test('filters by dateRange', async () => {
    const adapter = new DragonTigerAdapter({ fetcher: async () => mockDragonTigerResponse });
    const events = await adapter.fetch({ dateRange: [1717484400000, 1717484400000] });
    expect(events.length).toBe(1);
    expect(events[0].symbols).toContain('000001.SZ');
  });
});
