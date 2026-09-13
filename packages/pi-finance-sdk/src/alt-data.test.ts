import { describe, expect, test } from 'bun:test';
import { NativeAltDataClient } from './alt-data.js';

const dragon = { items: [{ symbol: '600519.SH', branch: '机构专用', action: 'buy', amount: 100000000, url: 'https://fixture/1', publishedAt: 1720000000000 }] };
const north = { date: 1720000000000, shConnect: { netInflow: 100000000, topBuys: ['600519.SH'] }, szConnect: { netInflow: -20000000, topBuys: ['000858.SZ'] }, marginBalance: { total: 1e12, change: 2e9 } };

describe('Finance Pi native alternative data', () => {
  test('normalizes dragon-tiger and north-bound responses with stable ids', async () => {
    const client = new NativeAltDataClient({ dragonTigerKey: 'dt', northBoundKey: 'nb', fetcher: async (url) => url.includes('MUTUAL') ? north : dragon });
    const dt = await client.fetch({ source: 'dragon-tiger' }, new AbortController().signal);
    const nb = await client.fetch({ source: 'north-bound' }, new AbortController().signal);
    expect(dt.count).toBe(1); expect(dt.events[0]?.id).toMatch(/^[a-f0-9]{64}$/); expect(nb.count).toBe(3);
    expect(nb.events.map((item) => item.raw.subType).sort()).toEqual(['margin', 'sh-connect', 'sz-connect']);
  });
  test('filters and searches without silently hiding transport failures', async () => {
    const client = new NativeAltDataClient({ dragonTigerKey: 'dt', northBoundKey: 'nb', fetcher: async (url) => url.includes('MUTUAL') ? north : dragon });
    expect((await client.fetch({ source: 'dragon-tiger', symbols: ['600519.SH'], limit: 1 }, new AbortController().signal)).count).toBe(1);
    expect((await client.search({ query: '600519', sources: ['dragon-tiger', 'north-bound'] }, new AbortController().signal)).count).toBeGreaterThan(0);
    await expect(new NativeAltDataClient({ fetcher: async () => dragon }).fetch({ source: 'dragon-tiger' }, new AbortController().signal)).rejects.toThrow('EAST_MONEY_LHB_KEY');
  });
});
