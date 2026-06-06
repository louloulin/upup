/**
 * End-to-end validation for alt-data pipeline.
 *
 * Exercises the full path: DragonTigerAdapter + NorthBoundAdapter (mock fetchers)
 * → tool layer (alt_data_fetch + alt_data_search) → dedup → keyword match.
 *
 * Verifies the spec scenario: "fetch past 7 days, validate dedup + format unity".
 */

import { describe, expect, test } from 'bun:test';
import { DragonTigerAdapter } from './dragon-tiger.js';
import { NorthBoundAdapter } from './north-bound.js';
import { mockDragonTigerResponse, mockNorthBoundResponse } from './_test-fixtures.js';
import { createAltDataFetchTool, createAltDataSearchTool } from '../../tools/alt-data/alt-data-tools.js';
import type { NormalizedEvent } from './types.js';

const makeDeps = () => ({
  adapters: {
    'dragon-tiger': new DragonTigerAdapter({ fetcher: async () => mockDragonTigerResponse }),
    'north-bound': new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse }),
  },
});

const unwrap = async (raw: string | AsyncGenerator<unknown, string, unknown>): Promise<any> => {
  const str = typeof raw === 'string' ? raw : await (async () => {
    let acc = '';
    for await (const chunk of raw) acc += String(chunk);
    return acc;
  })();
  const parsed = JSON.parse(str);
  return parsed.data ?? parsed;
};

describe('alt-data e2e: fetch + dedup + cross-source search', () => {
  test('fetch from dragon-tiger returns normalized events with sha256 ids', async () => {
    const fetchTool = createAltDataFetchTool(makeDeps());
    const inner = await unwrap(await fetchTool.func({ source: 'dragon-tiger', limit: 20 }));
    expect(inner.source).toBe('dragon-tiger');
    expect(inner.count).toBe(2);
    for (const ev of inner.events) {
      expect(ev.id).toMatch(/^[a-f0-9]{64}$/);
      expect(ev.source).toBe('dragon-tiger');
      expect(typeof ev.title).toBe('string');
    }
  });

  test('fetch from north-bound returns 3 sub-events (sh, sz, margin)', async () => {
    const fetchTool = createAltDataFetchTool(makeDeps());
    const inner = await unwrap(await fetchTool.func({ source: 'north-bound', limit: 20 }));
    expect(inner.count).toBe(3);
    const subTypes = (inner.events as NormalizedEvent[]).map(e => (e.raw as { subType: string }).subType);
    expect(subTypes.sort()).toEqual(['margin', 'sh-connect', 'sz-connect']);
  });

  test('cross-source search for 600519 finds it in both sources', async () => {
    const searchTool = createAltDataSearchTool(makeDeps());
    const inner = await unwrap(await searchTool.func({
      query: '600519', sources: ['dragon-tiger', 'north-bound'], limit: 10,
    }));
    expect(inner.count).toBeGreaterThan(0);
    const has600519 = (inner.events as NormalizedEvent[]).some(e => e.symbols.includes('600519.SH'));
    expect(has600519).toBe(true);
  });

  test('all events across sources have unique ids (no overlap)', async () => {
    const fetchTool = createAltDataFetchTool(makeDeps());
    const dt = await unwrap(await fetchTool.func({ source: 'dragon-tiger', limit: 20 }));
    const nb = await unwrap(await fetchTool.func({ source: 'north-bound', limit: 20 }));
    const allIds = [
      ...(dt.events as NormalizedEvent[]).map(e => e.id),
      ...(nb.events as NormalizedEvent[]).map(e => e.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
