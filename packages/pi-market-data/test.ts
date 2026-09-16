import { describe, expect, test } from 'bun:test';
import { appendKairosEvent, classifyKairosTopic, createDefaultMarketQuoteClient, createInitialKairosJournalState, eastmoneySecid, JsonFileMarketQuoteTrendStore, listKairosEvents, createRealtimeSubscriptionManager, FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, isTradingDay, NativeMarketHistoryClient, NativeMarketQuoteClient, normalizeRealtimeSymbols, summarizeKairos } from './src/index';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { screenStockSnapshot } from './src/screener';
import { getMarketStructureSnapshot, querySectorSnapshot } from './src/market-insights';
import { makeTechnicalSnapshot } from './src/technical';
import { executeNaturalLanguageScreen, NATURAL_LANGUAGE_SCREEN_UNIVERSE, runNaturalLanguageScreen } from './src/natural-language-screen';

function sseResponse(frames: readonly string[], signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      if (!signal) {
        controller.close();
        return;
      }
      // A real Eastmoney stream keeps the connection open after the day's rows,
      // so the harness must too: closing it would flip `isConnected` to false
      // before the caller can observe a live subscription.
      const close = () => { try { controller.close(); } catch { /* already closed */ } };
      if (signal.aborted) {
        close();
        return;
      }
      signal.addEventListener('abort', close, { once: true });
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function trendFrame(rows: readonly string[]): string {
  return `data: ${JSON.stringify({ rc: 0, data: { code: '600519', market: 1, trends: rows } })}\n\n`;
}

describe('pi-market-data', () => {
  test('runs the package-owned natural-language screener', async () => {
    const result = await runNaturalLanguageScreen('PE < 15 且 ROE > 10%');
    expect(result.source).toBe('nl_screen');
    expect(result.results.map((item) => item.ticker)).toContain('BABA');
    expect(result.results.every((item) => item.metrics.pe < 15 && item.metrics.roe > 10)).toBe(true);
  });

  test('keeps realtime stale-row gating inside the package', async () => {
    const result = await executeNaturalLanguageScreen(
      { universe: 'us', filters: [], limit: 50, realtime: true },
      [NATURAL_LANGUAGE_SCREEN_UNIVERSE[0]!],
      async () => ({}),
    );
    expect(result).toEqual([]);
  });

  test('maps A-share and Hong Kong symbols onto Eastmoney secids', () => {
    expect(eastmoneySecid('600519.SH')).toBe('1.600519');
    expect(eastmoneySecid('000001.SZ')).toBe('0.000001');
    expect(eastmoneySecid('00700.HK')).toBe('116.00700');
    expect(() => eastmoneySecid('AAPL')).toThrow(/A-share and Hong Kong/);
  });

  test('auto-routes an A-share quote to the live Eastmoney provider, not a synthetic price', async () => {
    let requested = '';
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        requested = String(input);
        return new Response(JSON.stringify({
          rc: 0,
          data: { f43: 125800, f44: 127498, f45: 125410, f46: 127393, f47: 26235, f48: 3307926407, f57: '600519', f58: '贵州茅台', f59: 2, f60: 127275, f86: Date.parse('2026-09-16T07:00:00Z') / 1000 },
        }), { status: 200 });
      },
    });
    const quote = await client.getQuote('600519.SH', 'cn', undefined, 'test-quote');
    expect(requested).toContain('secid=1.600519');
    expect(quote.value).toMatchObject({ symbol: '600519.SH', market: 'cn', currency: 'CNY', last: 1258, price: 1258, asOf: '2026-09-16' });
    expect(quote.evidence).toMatchObject({ id: 'market-data:test-quote:quote', source: 'https://push2.eastmoney.com/api/qt/stock/get', provider: 'eastmoney' });
    expect(quote.value.source.startsWith('dry-run://')).toBe(false);
  });

  test('auto-routes A-share daily bars to Eastmoney with provider-real OHLC', async () => {
    const client = new NativeMarketHistoryClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        expect(String(input)).toContain('secid=1.600519');
        return new Response(JSON.stringify({
          rc: 0,
          data: { code: '600519', klines: [
            '2026-08-03,1350.60,1358.98,1363.35,1346.00,36147,4898665275.00',
            '2026-08-04,1350.06,1328.36,1350.94,1328.36,37450,5004070406.00',
          ] },
        }), { status: 200 });
      },
    });
    const result = await client.getHistory('600519.SH', '2026-08-01', '2026-08-05', undefined, 'test-history', 'cn');
    expect(result.value).toEqual([
      { date: '2026-08-03', open: 1350.6, high: 1363.35, low: 1346, close: 1358.98, volume: 3_614_700 },
      { date: '2026-08-04', open: 1350.06, high: 1350.94, low: 1328.36, close: 1328.36, volume: 3_745_000 },
    ]);
    expect(result.evidence).toMatchObject({ provider: 'eastmoney', query: '600519.SH:cn:2026-08-01:2026-08-05' });
  });

  test('handles market calendar boundaries', () => {
    expect(isTradingDay('2026-09-12', 'cn')).toBe(false);
    expect(isTradingDay('2026-09-14', 'cn')).toBe(true);
    expect(isTradingDay('2026-10-01', 'cn')).toBe(false);
  });

  test('screens only the declared historical snapshot', () => {
    const result = screenStockSnapshot({ market: 'cn', performance: 'active', limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].volume).toBeGreaterThanOrEqual(result[1].volume);
    expect(result.every((stock) => stock.market === 'cn' && stock.asOf === '2026-09-12')).toBe(true);
  });

  test('resolves sector metadata and structure snapshots deterministically', () => {
    expect(querySectorSnapshot('002594.SZ', 'stock')).toMatchObject({ sector: '新能源', asOf: '2026-09-12' });
    expect(getMarketStructureSnapshot('moneyflow')).toMatchObject({ type: 'moneyflow', asOf: '2026-09-12' });
    expect(getMarketStructureSnapshot('moneyflow').data.length).toBeGreaterThan(0);
  });

  test('calculates bounded historical technical indicators', () => {
    const result = makeTechnicalSnapshot('比亚迪', 'daily');
    expect(result).toMatchObject({ source: 'upup-pi://market-data/technical-data', ts_code: '002594.SZ', period: 'daily', count: 40, asOf: '2026-09-12' });
    expect(result.data.at(-1)).toMatchObject({ trade_date: '20260912' });
    expect(result.data.slice(19).every((bar) => bar.ma20 !== null)).toBe(true);
    expect(result.data.slice(25).every((bar) => bar.macd_dif !== null && bar.macd_dea !== null)).toBe(true);
    expect(result.data.every((bar) => bar.high >= bar.close && bar.close >= bar.low && bar.vol > 0)).toBe(true);
  });

  test('normalizes and bounds realtime symbols', () => {
    expect(normalizeRealtimeSymbols([' aapl ', 'AAPL', '600519'])).toEqual(['AAPL', '600519']);
    expect(() => normalizeRealtimeSymbols([])).toThrow();
    expect(() => normalizeRealtimeSymbols(['bad symbol'])).toThrow();
  });

  test('tracks realtime subscriptions over the live Eastmoney SSE transport', async () => {
    const manager = createRealtimeSubscriptionManager({
      now: () => 1_700_000_000_000,
      fetcher: async (input, init) => {
        expect(String(input)).toContain('secid=1.600519');
        return sseResponse([trendFrame(['2026-09-16 09:30,1273.93,1273.93,1273.98,1273.70', '2026-09-16 09:31,1274.52,1271.90,1274.98,1266.70'])], init?.signal ?? undefined);
      },
    });
    const subscription = await manager.subscribe({ symbols: ['600519'], aggregateMs: 5_000 });
    expect(subscription).toMatchObject({ id: 'sub-1', symbols: ['600519'], source: 'eastmoney', connected: true });
    expect(manager.list()).toHaveLength(1);
    expect(await manager.unsubscribe(subscription.id)).toMatchObject({ ok: true, subscriptionId: 'sub-1' });
    expect(manager.list()).toEqual([]);
    await manager.close();
  });

  test('forwards real provider quotes from the SSE stream to the session callback', async () => {
    const quotes: { symbol: string; last: number }[] = [];
    const manager = createRealtimeSubscriptionManager({
      fetcher: async () => sseResponse([trendFrame(['2026-09-16 09:30,1273.93,1273.93,1273.98,1273.70', '2026-09-16 09:31,1274.52,1271.90,1274.98,1266.70'])]),
      onQuote: (quote) => quotes.push({ symbol: quote.symbol, last: quote.last }),
    });
    const subscription = await manager.subscribe({ symbols: ['600519'], throttleMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(quotes).toEqual([{ symbol: '600519', last: 1271.9 }]);
    await manager.unsubscribe(subscription.id);
    await manager.close();
  });

  test('fails closed when the realtime stream is unavailable', async () => {
    const manager = createRealtimeSubscriptionManager({ fetcher: async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' }) });
    await expect(manager.subscribe({ symbols: ['600519'] })).rejects.toThrow(/Eastmoney realtime stream failed for 600519/);
    expect(manager.list()).toEqual([]);
    await manager.close();
  });

  test('journals and summarizes Kairos events with bounded immutable history', () => {
    expect(classifyKairosTopic('kairos.opportunity.breakout')).toBe('opportunity');
    expect(classifyKairosTopic('kairos.position.alert')).toBe('position-alert');
    expect(classifyKairosTopic('kairos.scanner.volume-spike')).toBe('scanner');
    expect(classifyKairosTopic('unrelated.topic')).toBeUndefined();
    let state = createInitialKairosJournalState();
    state = appendKairosEvent(state, { topic: 'kairos.opportunity.breakout', payload: { symbol: '600519' }, timestamp: 10 });
    state = appendKairosEvent(state, { topic: 'kairos.position.alert', payload: { symbol: '600519', severity: 'warning' }, timestamp: 11 });
    const opportunities = listKairosEvents(state, 'opportunity', 20);
    expect(opportunities).toMatchObject([{ seq: 1, topic: 'kairos.opportunity.breakout', payload: { symbol: '600519' } }]);
    opportunities[0]!.payload = { symbol: 'changed' };
    expect(listKairosEvents(state, 'opportunity', 20)[0]!.payload).toEqual({ symbol: '600519' });
    expect(summarizeKairos(state, 3)).toMatchObject({ opportunity: { count: 1 }, 'position-alert': { count: 1 }, scanner: { count: 0 }, realtime: { count: 0 } });
  });
});

test('loads and audits native historical bars through the Pi market package', async () => {
  const timestamps = [Date.parse('2026-01-02T00:00:00Z') / 1000, Date.parse('2026-01-05T00:00:00Z') / 1000];
  const client = new NativeMarketHistoryClient({
    now: () => '2026-09-14T00:00:00.000Z',
    fetcher: async (input) => {
      expect(String(input)).toContain('AAPL');
      return new Response(JSON.stringify({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }], adjclose: [{ adjclose: [100.5, 101.5] }] } }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await client.getHistory('AAPL', '2026-01-01', '2026-01-31', undefined, 'native-test');
  expect(result.value).toEqual([
    { date: '2026-01-02', open: 100, high: 102, low: 99, close: 100.5, volume: 1000 },
    { date: '2026-01-05', open: 101, high: 103, low: 100, close: 101.5, volume: 1100 },
  ]);
  expect(result.evidence).toMatchObject({ source: 'https://query1.finance.yahoo.com/v8/finance/chart', asOf: '2026-01-05', auditId: 'native-test', dataFreshness: 'historical' });
});

test('selects Tushare explicitly and normalizes its response without fallback', async () => {
  const client = new NativeMarketHistoryClient({ provider: 'tushare', tushareToken: 'test-token', now: () => '2026-09-14T00:00:00.000Z', fetcher: async (input, init) => {
    expect(String(input)).toBe('https://api.tushare.pro');
    expect(JSON.parse(String(init?.body))).toMatchObject({ api_name: 'daily', token: 'test-token', params: { ts_code: '600519.SH', start_date: '20260101', end_date: '20260131' } });
    return new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'], items: [['600519.SH', '20260105', '100', '102', '99', '101', '1000'], ['600519.SH', '20260106', '101', '103', '100', '102', '1100']] } }), { status: 200 });
  } });
  const result = await client.getHistory('600519', '2026-01-01', '2026-01-31', undefined, 'tushare-test');
  expect(result.value).toMatchObject([{ date: '2026-01-05', close: 101, volume: 1000 }, { date: '2026-01-06', close: 102, volume: 1100 }]);
  expect(result.evidence).toMatchObject({ source: 'https://api.tushare.pro', auditId: 'tushare-test' });
});

test('uses an explicit market to select and audit the history provider', async () => {
  const urls: string[] = [];
  const client = new NativeMarketHistoryClient({ provider: 'auto', tushareToken: 'fixture-token', fetcher: async (input) => {
    urls.push(String(input));
    if (String(input).includes('api.tushare.pro')) return new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'], items: [['600519.SH', '20260130', 1, 2, 0.5, 1.5, 100], ['600519.SH', '20260131', 1.5, 2.5, 1, 2, 120]] } }), { status: 200 });
    return new Response(JSON.stringify({ chart: { result: [{ timestamp: [Date.parse('2026-01-30T00:00:00Z') / 1000, Date.parse('2026-01-31T00:00:00Z') / 1000], indicators: { quote: [{ open: [1, 2], high: [2, 3], low: [0.5, 1], close: [1.5, 2.5], volume: [100, 120] }] } }] } }), { status: 200 });
  } });
  const cn = await client.getHistory('600519.SH', '2026-01-01', '2026-01-31', undefined, 'explicit-cn', 'cn');
  const hk = await client.getHistory('00700.HK', '2026-01-01', '2026-01-31', undefined, 'explicit-hk', 'hk');
  expect(cn.evidence.source).toContain('tushare');
  expect(cn.evidence.query).toContain(':cn:');
  expect(hk.evidence.source).toContain('tushare');
  expect(hk.evidence.query).toContain(':hk:');
  expect(urls.some((url) => url.includes('api.tushare.pro'))).toBe(true);
});

test('routes Hong Kong history to hk_daily with market-scoped configuration', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> | undefined;
  const client = new NativeMarketHistoryClient({
    provider: 'auto',
    marketProviders: { hk: 'tushare' },
    marketApiKeys: { hk: 'hk-token' },
    marketBaseUrls: { hk: 'https://tushare.test/pro' },
    marketFetchers: { hk: async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'], items: [['00700.HK', '20260130', 10, 11, 9, 10.5, 100], ['00700.HK', '20260131', 10.5, 11.5, 10, 11, 120]] } }), { status: 200 });
    } },
  });
  const result = await client.getHistory('00700.HK', '2026-01-01', '2026-01-31', undefined, 'hk-history', 'hk');
  expect(requestUrl).toBe('https://tushare.test/pro');
  expect(requestBody).toMatchObject({ api_name: 'hk_daily', token: 'hk-token', params: { ts_code: '00700.HK' } });
  expect(result.evidence).toMatchObject({ source: 'https://tushare.test/pro', query: '00700.HK:hk:2026-01-01:2026-01-31' });
});

test('routes US history to Financial Datasets when explicitly configured', async () => {
  const client = new NativeMarketHistoryClient({
    provider: 'financial-datasets',
    marketApiKeys: { us: 'fds-token' },
    marketBaseUrls: { us: 'https://datasets.test' },
    marketFetchers: { us: async (input, init) => {
      expect(String(input)).toContain('https://datasets.test/prices/historical/?ticker=AAPL');
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('fds-token');
      return new Response(JSON.stringify({ historical_prices: [
        { date: '2026-01-30', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { date: '2026-01-31', open: 101, high: 103, low: 100, close: 102, volume: 1100 },
      ] }), { status: 200 });
    } },
  });
  const result = await client.getHistory('AAPL', '2026-01-01', '2026-01-31', undefined, 'fds-history', 'us');
  expect(result.evidence).toMatchObject({ provider: 'financial-datasets', source: 'https://datasets.test/prices/historical/?ticker=AAPL&start_date=2026-01-01&end_date=2026-01-31', query: 'AAPL:us:2026-01-01:2026-01-31' });
  expect(result.value).toHaveLength(2);
});

test('enforces explicit cache and rate-limit policy', async () => {
  let calls = 0;
  const client = new NativeMarketHistoryClient({ cache: new InMemoryMarketHistoryCache(), rateLimiter: new FixedWindowMarketHistoryRateLimiter(1, 60_000), fetcher: async () => { calls += 1; return new Response(JSON.stringify({ chart: { result: [{ timestamp: [1_767_312_000, 1_767_398_400], indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }] } }] } }), { status: 200 }); } });
  await client.getHistory('AAPL', '2026-01-01', '2026-01-31', undefined, 'cache-1');
  await client.getHistory('AAPL', '2026-01-01', '2026-01-31', undefined, 'cache-2');
  expect(calls).toBe(1);
  await expect(client.getHistory('MSFT', '2026-01-01', '2026-01-31', undefined, 'limit-1')).rejects.toThrow(/rate limit/i);
});

test('loads and audits native delayed quotes from Yahoo', async () => {
  const client = new NativeMarketQuoteClient({ now: () => '2026-09-14T00:00:00.000Z', fetcher: async (input) => {
    expect(String(input)).toContain('AAPL');
    return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000, chartPreviousClose: 198 } }] } }), { status: 200 });
  } });
  const result = await client.getQuote('AAPL', 'us', undefined, 'quote-test');
  expect(result.value).toMatchObject({ symbol: 'AAPL', market: 'us', last: 200, bid: 200, ask: 200, freshness: 'delayed', indicative: true });
  expect(result.evidence).toMatchObject({ source: 'https://query1.finance.yahoo.com/v8/finance/chart', asOf: '2026-09-13', auditId: 'quote-test' });
});

test('aggregates redacted provider trend buckets without retaining financial payloads', async () => {
  let responseCount = 0;
  const client = new NativeMarketQuoteClient({ now: () => responseCount === 0 ? '2026-09-14T09:10:00.000Z' : '2026-09-14T09:20:00.000Z', fetcher: async () => {
    responseCount += 1;
    return responseCount === 1
      ? new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: 1_757_808_000, chartPreviousClose: 198 } }] } }), { status: 200 })
      : new Response('forbidden', { status: 403 });
  } });
  await client.getQuote('AAPL', 'us', undefined, 'trend-success');
  await expect(client.getQuote('MSFT', 'us', undefined, 'trend-failure')).rejects.toThrow('403');
  const metrics = client.getMetrics();
  expect(metrics.trend).toHaveLength(1);
  expect(metrics.trend[0]).toMatchObject({ requests: 2, successes: 1, failures: 1, successRatePct: 50, sloStatus: 'degraded' });
  expect(JSON.stringify(metrics)).not.toContain('AAPL');
  expect(JSON.stringify(metrics)).not.toContain('200');
});

test('persists only redacted trend buckets across quote client lifetimes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'upup-market-trend-'));
  const path = join(root, 'provider-trend.json');
  try {
    const first = new NativeMarketQuoteClient({
      trendStore: new JsonFileMarketQuoteTrendStore(path),
      now: () => '2026-09-14T09:10:00.000Z',
      fetcher: async () => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: 1_757_808_000, chartPreviousClose: 198 } }] } }), { status: 200 }),
    });
    await first.getQuote('AAPL', 'us', undefined, 'persisted-trend');
    const second = new NativeMarketQuoteClient({ trendStore: new JsonFileMarketQuoteTrendStore(path), now: () => '2026-09-14T09:20:00.000Z' });
    expect(second.getMetrics()).toMatchObject({ requests: 0, trend: [{ requests: 1, successes: 1, failures: 0, successRatePct: 100, sloStatus: 'healthy' }] });
    const persisted = readFileSync(path, 'utf8');
    expect(persisted).not.toContain('AAPL');
    expect(persisted).not.toContain('200');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refreshes persisted trend data for a management-style client without probing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'upup-market-trend-refresh-'));
  const path = join(root, 'provider-trend.json');
  try {
    const store = new JsonFileMarketQuoteTrendStore(path);
    const producer = new NativeMarketQuoteClient({ trendStore: store, fetcher: async () => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 200, regularMarketTime: 1_757_808_000 } }] } }), { status: 200 }) });
    await producer.getQuote('AAPL', 'us', undefined, 'trend-producer');
    const observer = new NativeMarketQuoteClient({ trendStore: store, fetcher: async () => { throw new Error('must not probe'); } });
    expect(observer.getMetrics().trend).toMatchObject([{ requests: 1, successes: 1, failures: 0 }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores malformed trend files without blocking provider startup', () => {
  const root = mkdtempSync(join(tmpdir(), 'upup-market-trend-invalid-'));
  const path = join(root, 'provider-trend.json');
  try {
    writeFileSync(path, '{ not-json');
    expect(new JsonFileMarketQuoteTrendStore(path).load()).toEqual([]);
    writeFileSync(path, JSON.stringify({ schema: 99, buckets: [] }));
    expect(new JsonFileMarketQuoteTrendStore(path).load()).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not expose persisted buckets older than the 24-hour SLA window', () => {
  const store: import('./src/index').NativeMarketQuoteTrendStore = {
    load: () => [{ startAt: '2026-09-12T08:00:00.000Z', requests: 1, cacheHits: 0, successes: 1, failures: 0, successRatePct: 100, avgLatencyMs: 3, sloStatus: 'healthy' }],
    save: () => undefined,
  };
  const client = new NativeMarketQuoteClient({ trendStore: store, now: () => '2026-09-14T09:00:00.000Z' });
  expect(client.getMetrics().trend).toEqual([]);
});
