/**
 * Alt-Data tools integration tests.
 *
 * NOTE: formatToolResult wraps in { data: ... }, so every JSON.parse call
 * must drill into .data to read the actual payload.
 */

import { describe, expect, test } from 'bun:test';
import { DragonTigerAdapter } from '../../data/alt/dragon-tiger.js';
import { NorthBoundAdapter } from '../../data/alt/north-bound.js';
import { mockDragonTigerResponse, mockNorthBoundResponse } from '../../data/alt/_test-fixtures.js';
import type { NormalizedEvent } from '../../data/alt/types.js';
import { createAltDataFetchTool, createAltDataSearchTool } from './alt-data-tools.js';

const unwrap = async (raw: string | AsyncGenerator<unknown, string, unknown>): Promise<any> => {
  const str = typeof raw === 'string' ? raw : await (async () => {
    let acc = '';
    for await (const chunk of raw) acc += String(chunk);
    return acc;
  })();
  const parsed = JSON.parse(str);
  return parsed.data ?? parsed;
};

const makeDeps = () => ({
  adapters: {
    'dragon-tiger': new DragonTigerAdapter({ fetcher: async () => mockDragonTigerResponse }),
    'north-bound': new NorthBoundAdapter({ fetcher: async () => mockNorthBoundResponse }),
  },
});

describe('alt_data_fetch tool', () => {
  test('returns events filtered by symbols', async () => {
    const tool = createAltDataFetchTool(makeDeps());
    const inner = await unwrap(await tool.func({ source: 'dragon-tiger', symbols: ['600519.SH'], limit: 20 }));
    expect(inner.source).toBe('dragon-tiger');
    expect(inner.count).toBe(1);
    expect(inner.events[0].symbols).toContain('600519.SH');
  });

  test('returns friendly error when adapter not registered', async () => {
    const tool = createAltDataFetchTool({ adapters: {} });
    const inner = await unwrap(await tool.func({ source: 'dragon-tiger', limit: 20 }));
    expect(inner.error).toContain('Adapter not registered');
  });

  test('honors limit param', async () => {
    const tool = createAltDataFetchTool(makeDeps());
    const inner = await unwrap(await tool.func({ source: 'dragon-tiger', limit: 1 }));
    expect(inner.events.length).toBeLessThanOrEqual(1);
  });
});

describe('alt_data_search tool', () => {
  test('matches by symbol across 2 sources', async () => {
    const tool = createAltDataSearchTool(makeDeps());
    const inner = await unwrap(await tool.func({ query: '600519', sources: ['dragon-tiger', 'north-bound'], limit: 10 }));
    expect(inner.count).toBeGreaterThan(0);
    expect(inner.events.some((e: NormalizedEvent) => e.symbols.includes('600519.SH'))).toBe(true);
  });

  test('matches by title keyword', async () => {
    const tool = createAltDataSearchTool(makeDeps());
    const inner = await unwrap(await tool.func({ query: '沪股通', sources: ['dragon-tiger', 'north-bound'], limit: 10 }));
    expect(inner.count).toBeGreaterThan(0);
  });

  test('skips unavailable adapters silently', async () => {
    const tool = createAltDataSearchTool({ adapters: {} });
    const inner = await unwrap(await tool.func({ query: '600519', sources: ['dragon-tiger', 'north-bound'], limit: 10 }));
    expect(inner.count).toBe(0);
  });
});
