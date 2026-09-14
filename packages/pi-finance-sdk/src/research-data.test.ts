import { describe, expect, test } from 'bun:test';
import { createTushareResearchDataFetcher, NativeResearchDataClient } from './research-data.js';

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
    expect(envelope).toMatchObject({ retryAttempts: 1, retryMaxAttempts: 3, retryRecovered: false });
  });

  test('routes explicit markets to their declared provider and fails closed without one', async () => {
    const requests: string[] = [];
    const client = new NativeResearchDataClient({
      apiKey: 'test-key',
      baseUrl: 'https://fixture.invalid',
      marketFetchers: { cn: async (input) => { requests.push(String(input)); return response({ market: 'cn' }); } },
      marketProviders: { cn: 'fixture-cn' },
    });
    const envelope = JSON.parse(await client.getStockPrice({ ticker: '600519.SH', market: 'cn' })) as { market: string; provider: string };
    expect(envelope).toMatchObject({ market: 'cn', provider: 'fixture-cn' });
    expect(requests[0]).toContain('ticker=600519.SH');
    await expect(client.getStockPrice({ ticker: '00700.HK', market: 'hk' })).rejects.toThrow('provider unavailable for market hk');
  });

  test('preserves market and provider in every research envelope', async () => {
    const client = new NativeResearchDataClient({
      apiKey: 'test-key',
      baseUrl: 'https://fixture.invalid',
      marketFetchers: { hk: async () => response({ rows: [{ ticker: '00700.HK' }] }) },
      marketProviders: { hk: 'fixture-hk' },
    });
    const envelope = JSON.parse(await client.getKeyRatios({ ticker: '00700.HK', market: 'hk' })) as { market: string; provider: string; data: { rows: { ticker: string }[] } };
    expect(envelope).toMatchObject({ market: 'hk', provider: 'fixture-hk', data: { rows: [{ ticker: '00700.HK' }] } });
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

  test('adapts read-only Tushare research requests and preserves provider errors', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = createTushareResearchDataFetcher({
      token: 'tushare-test-token',
      now: () => new Date('2026-09-15T00:00:00.000Z'),
      fetcher: async (input, init) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code'], items: [['600519.SH']] } }), { status: 200 });
      },
    });
    const client = new NativeResearchDataClient({
      apiKey: 'unused-us-key',
      marketFetchers: { cn: fetcher },
      marketProviders: { cn: 'tushare' },
      marketApiKeys: { cn: 'tushare-test-token' },
      marketBaseUrls: { cn: 'https://api.tushare.pro' },
    });
    const envelope = JSON.parse(await client.getStockPrice({ ticker: '600519.SH', market: 'cn' })) as { market: string; provider: string; sourceUrls: string[]; data: { data: { items: string[][] } } };
    expect(envelope).toMatchObject({ market: 'cn', provider: 'tushare', data: { data: { items: [['600519.SH']] } } });
    expect(envelope.sourceUrls[0]).toContain('api.tushare.pro');
    expect(requests[0]).toMatchObject({ url: 'https://api.tushare.pro', body: { api_name: 'daily', token: 'tushare-test-token', params: { ts_code: '600519.SH' } } });

    const hkRequests: Array<Record<string, unknown>> = [];
    const hkFetcher = createTushareResearchDataFetcher({
      token: 'tushare-test-token',
      market: 'hk',
      fetcher: async (_input, init) => {
        hkRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code'], items: [['00700.HK']] } }), { status: 200 });
      },
    });
    const hkClient = new NativeResearchDataClient({ marketFetchers: { hk: hkFetcher }, marketProviders: { hk: 'tushare' }, marketApiKeys: { hk: 'tushare-test-token' }, marketBaseUrls: { hk: 'https://api.tushare.pro' } });
    await hkClient.getEarnings({ ticker: '00700.HK', market: 'hk' });
    expect(hkRequests[0]).toMatchObject({ api_name: 'hk_income', token: 'tushare-test-token', params: { ts_code: '00700.HK' } });

    const errorFetcher = createTushareResearchDataFetcher({ token: 'tushare-test-token', fetcher: async () => new Response(JSON.stringify({ code: -1, msg: 'bad token' }), { status: 200 }) });
    const errorClient = new NativeResearchDataClient({ marketFetchers: { cn: errorFetcher }, marketProviders: { cn: 'tushare' }, marketApiKeys: { cn: 'tushare-test-token' }, marketBaseUrls: { cn: 'https://api.tushare.pro' } });
    await expect(errorClient.getStockPrice({ ticker: '600519.SH', market: 'cn' })).rejects.toThrow('502');
  });

  test('retries transient research provider failures and stops on permanent failures', async () => {
    let transientCalls = 0;
    const transient = new NativeResearchDataClient({
      apiKey: 'test-key',
      baseUrl: 'https://fixture.invalid',
      retry: { maxAttempts: 3, baseDelayMs: 1, sleep: async () => {} },
      fetcher: async () => {
        transientCalls += 1;
        return transientCalls < 3 ? response('temporarily unavailable', false) : response({ snapshot: { ticker: 'AAPL', close: 123 } });
      },
    });
    const recovered = JSON.parse(await transient.getStockPrice({ ticker: 'AAPL' })) as { retryAttempts: number; retryMaxAttempts: number; retryRecovered: boolean };
    expect(recovered).toMatchObject({ retryAttempts: 3, retryMaxAttempts: 3, retryRecovered: true });
    expect(transientCalls).toBe(3);

    let permanentCalls = 0;
    const permanent = new NativeResearchDataClient({
      apiKey: 'test-key',
      baseUrl: 'https://fixture.invalid',
      retry: { maxAttempts: 3, baseDelayMs: 1, sleep: async () => {} },
      fetcher: async () => {
        permanentCalls += 1;
        return new Response('forbidden', { status: 403, statusText: 'Forbidden' });
      },
    });
    await expect(permanent.getStockPrice({ ticker: 'AAPL' })).rejects.toThrow(/403/);
    expect(permanentCalls).toBe(1);
  });
});
