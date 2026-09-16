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

  test('auto + CN symbol + NO token → actionable error (not silent Yahoo 403)', async () => {
    const client = new NativeMarketQuoteClient({ provider: 'auto', tushareToken: '' });
    let caught: Error | undefined;
    try {
      await client.getQuote('600519.SH');
    } catch (error) {
      caught = error instanceof Error ? error : new Error(String(error));
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/600519\.SH requires TUSHARE_TOKEN/);
    expect(caught!.message).toMatch(/Yahoo Finance does not cover A-shares/);
    expect(caught!.message).toMatch(/~\/.upup\/.env or process\.env/);
  });

  test('auto + HK symbol + NO token → actionable error (HK is grouped with CN)', async () => {
    const client = new NativeMarketQuoteClient({ provider: 'auto', tushareToken: '' });
    let caught: Error | undefined;
    try {
      await client.getQuote('00700.HK');
    } catch (error) {
      caught = error instanceof Error ? error : new Error(String(error));
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/00700\.HK requires TUSHARE_TOKEN/);
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
