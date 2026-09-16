import { describe, expect, test } from 'bun:test';
import { NativeMarketQuoteClient } from './quote';

describe('pi-market-data quote provider auto-selection', () => {
  test('auto + CN symbol + TUSHARE_TOKEN → tushare (no actionable error, mock fetcher)', async () => {
    let lastUrl = '';
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      lastUrl = String(input);
      return new Response(JSON.stringify({
        code: 0,
        data: {
          fields: ['ts_code', 'trade_date', 'close', 'pre_close'],
          items: [['600519.SH', '20260313', 1680.5, 1672.0]],
        },
      }), { status: 200 });
    };
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: 'fake-token-for-test',
      fetcher,
    });
    const result = await client.getQuote('600519.SH');
    // Confirm we hit Tushare (not Yahoo) by URL.
    expect(lastUrl).toBe('https://api.tushare.pro');
    expect(result.value.last).toBe(1680.5);
    expect(result.evidence.source).toMatch(/tushare/);
  });

  test('auto + CN symbol + NO token → live Eastmoney quote (no synthetic fallback)', async () => {
    let requested = '';
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        requested = String(input);
        return new Response(JSON.stringify({ rc: 0, data: { f43: 125800, f57: '600519', f58: '贵州茅台', f59: 2, f60: 127275, f86: 1789573200 } }), { status: 200 });
      },
    });
    const result = await client.getQuote('600519.SH', 'cn');
    expect(requested).toContain('secid=1.600519');
    expect(result.value).toMatchObject({ last: 1258, price: 1258, market: 'cn', currency: 'CNY' });
    expect(result.evidence).toMatchObject({ provider: 'eastmoney' });
    expect(result.evidence.source.startsWith('https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519')).toBe(true);
    expect(result.evidence.source.startsWith('dry-run://')).toBe(false);
  });

  test('auto + HK symbol + NO token → Eastmoney Hong Kong secid with 3-decimal scaling', async () => {
    let requested = '';
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        requested = String(input);
        return new Response(JSON.stringify({ rc: 0, data: { f43: 433400, f57: '00700', f58: '腾讯控股', f59: 3, f60: 438800, f86: 1789573200 } }), { status: 200 });
      },
    });
    const result = await client.getQuote('00700.HK', 'hk');
    expect(requested).toContain('secid=116.00700');
    expect(result.value).toMatchObject({ last: 433.4, market: 'hk', currency: 'HKD' });
    expect(result.evidence.provider).toBe('eastmoney');
  });

  test('auto + CN symbol + provider outage → error, never a fabricated price', async () => {
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
    });
    await expect(client.getQuote('600519.SH', 'cn')).rejects.toThrow(/eastmoney market quote request failed: 403/);
  });

  test('auto + US symbol + NO token → falls back to yahoo (no actionable error)', async () => {
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async () => new Response(JSON.stringify({
        chart: { result: [{ meta: { regularMarketPrice: 123.45, regularMarketTime: Math.floor(Date.now() / 1000) } }] },
      }), { status: 200 }),
    });
    const result = await client.getQuote('AAPL');
    expect(result.value.last).toBe(123.45);
    expect(result.evidence.source).toMatch(/yahoo/);
  });

  test('explicit provider=tushare + NO token → error from tushare branch', async () => {
    const client = new NativeMarketQuoteClient({ provider: 'tushare', tushareToken: '' });
    let caught: Error | undefined;
    try {
      await client.getQuote('600519.SH');
    } catch (error) {
      caught = error instanceof Error ? error : new Error(String(error));
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/Tushare provider requires TUSHARE_TOKEN/);
  });
});
