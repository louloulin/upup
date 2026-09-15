import { describe, expect, test } from 'bun:test';
import { buildEarningsPreview } from './src/index';

test('builds a framework preview without synthesizing financial estimates', async () => {
  const preview = await buildEarningsPreview('NVDA', { offline: true, now: () => 1_700_000_000_000 });
  expect(preview).toMatchObject({ ticker: 'NVDA', source: 'framework', consensus: [], transcripts: [] });
  expect(preview.recentTweets).toEqual([]);
});

test('does not synthesize X research data when no X token is configured', async () => {
  const previous = process.env.X_BEARER_TOKEN;
  delete process.env.X_BEARER_TOKEN;
  const preview = await buildEarningsPreview('NVDA', { now: () => 1_700_000_000_000, transcriptFetcher: async () => [] });
  expect(preview.source).toBe('framework');
  expect(preview.recentTweets).toEqual([]);
  if (previous === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = previous;
});
import { fetchWebContent } from './src/index';

describe('Pi research core', () => {
  test('returns formatted JSON content and preserves redirect evidence', async () => {
    const server = Bun.serve({ port: 0, fetch(request) { return new Response(JSON.stringify({ symbol: '600519', price: 1500 }), { headers: { 'content-type': 'application/json' } }); } });
    try {
      const result = await fetchWebContent({ url: `http://127.0.0.1:${server.port}/quote`, extractMode: 'text' }, 'research-core-1', undefined, { networkPolicy: 'allow-private' });
      expect(result.value.extractor).toBe('json');
      expect(result.value.text).toContain('600519');
      expect(result.evidence).toMatchObject({ auditId: 'research-core-1', source: `http://127.0.0.1:${server.port}/quote`, dataFreshness: 'live' });
    } finally { server.stop(); }
  });

  test('refuses loopback targets under the production network policy', async () => {
    await expect(fetchWebContent({ url: 'http://127.0.0.1:18081/' }, 'research-private-1')).rejects.toThrow('private or local network target');
    await expect(fetchWebContent({ url: 'http://localhost:18081/' }, 'research-private-2')).rejects.toThrow('private or local network target');
  });
});
