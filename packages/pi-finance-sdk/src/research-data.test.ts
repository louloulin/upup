import { describe, expect, test } from 'bun:test';
import { NativeResearchDataClient } from './research-data.js';

function response(value: unknown, ok = true): Response {
  return new Response(JSON.stringify(value), { status: ok ? 200 : 500, statusText: ok ? 'OK' : 'Error', headers: { 'content-type': 'application/json' } });
}

describe('NativeResearchDataClient', () => {
  test('keeps network research explicit and auditable', async () => {
    const requests: Array<{ url: string; key: string | null }> = [];
    const client = new NativeResearchDataClient({ apiKey: 'test-key', baseUrl: 'https://fixture.invalid', freshness: 'cached', fetcher: async (input, init) => {
      requests.push({ url: String(input), key: new Headers(init?.headers).get('x-api-key') });
      return response({ snapshot: { ticker: 'AAPL', close: 123 } });
    } });
    const envelope = JSON.parse(await client.getStockPrice({ ticker: ' aapl ' })) as { data: { snapshot: { close: number } }; sourceUrls: string[]; freshness: string };
    expect(envelope.data.snapshot.close).toBe(123);
    expect(envelope.freshness).toBe('cached');
    expect(envelope.sourceUrls[0]).toContain('/prices/snapshot/?ticker=AAPL');
    expect(requests[0]).toMatchObject({ key: 'test-key' });
  });

  test('supports estimates, earnings, and filing metadata with bounded inputs', async () => {
    const paths: string[] = [];
    const client = new NativeResearchDataClient({ apiKey: 'test-key', baseUrl: 'https://fixture.invalid', fetcher: async (input) => { paths.push(new URL(String(input)).pathname); return response({ rows: [] }); } });
    await client.getAnalystEstimates({ ticker: 'MSFT', period: 'quarterly' });
    await client.getEarnings({ ticker: 'MSFT' });
    await client.getFilings({ ticker: 'MSFT', filing_type: ['10-K'], limit: 2 });
    expect(paths).toEqual(['/analyst-estimates/', '/earnings', '/filings/']);
    expect(() => client.getFilings({ ticker: 'MSFT', limit: 11 })).toThrow('between 1 and 10');
  });

  test('fails closed without credentials or after cancellation', async () => {
    const noKey = new NativeResearchDataClient({ baseUrl: 'https://fixture.invalid', fetcher: async () => response({}) });
    await expect(noKey.getKeyRatios({ ticker: 'AAPL' })).rejects.toThrow('FINANCIAL_DATASETS_API_KEY');
    const controller = new AbortController();
    controller.abort();
    const client = new NativeResearchDataClient({ apiKey: 'test-key', fetcher: async () => response({}) });
    await expect(client.getEarnings({ ticker: 'AAPL' }, controller.signal)).rejects.toThrow('aborted');
  });
});
