import { describe, expect, test } from 'bun:test';
import { appendKairosEvent, classifyKairosTopic, createDefaultMarketQuoteClient, createEastmoneyGate, createInitialKairosJournalState, eastmoneySecid, EastmoneyThrottleError, JsonFileMarketQuoteTrendStore, listKairosEvents, createRealtimeSubscriptionManager, resetEastmoneyGates, FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, isTradingDay, NativeMarketHistoryClient, NativeMarketQuoteClient, normalizeRealtimeSymbols, summarizeKairos } from './src/index';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildTechnicalSnapshot } from './src/technical';
import { createEastmoneyScreenLoader, screenEastmoneyStocks } from './src/screen-eastmoney';
import { parseTencentKlines, tencentKlineCode, tencentKlineUrl } from './src/kline-tencent';
import { getMarketStructureSnapshot, querySectorSnapshot } from './src/market-structure-eastmoney';
import { deterministicScreenParser, extractScreenKeywords, runNaturalLanguageScreen, ScreenFilterUnsupportedError } from './src/natural-language-screen';

/** Provider-shaped doubles: the parsers under test are the real ones. */
const CLIST_CN_PAYLOAD = {
  rc: 0,
  data: {
    total: 5559,
    diff: [
      { f12: '601398', f14: '工商银行', f2: 8.11, f3: -0.25, f6: 2500000000, f8: 0.12, f9: 8.32, f20: 2890454744992, f23: 0.73, f100: '银行', f133: 3.95 },
      { f12: '600519', f14: '贵州茅台', f2: 1258, f3: -1.16, f6: 3307926407, f8: 0.26, f9: 17.66, f20: 1572602654058, f23: 6.26, f100: '白酒Ⅱ', f133: 4.14 },
    ],
  },
};
const CLIST_BOARD_PAYLOAD = {
  rc: 0,
  data: {
    total: 45,
    diff: [
      { f12: '600519', f14: '贵州茅台', f2: 1258, f3: -1.16, f6: 3307926407, f8: 0.26, f9: 17.66, f20: 1572602654058, f23: 6.26, f100: '白酒Ⅱ', f133: 4.14 },
      { f12: '000858', f14: '五 粮 液', f2: 69.26, f3: -0.63, f6: 1200000000, f8: 0.4, f9: 15.36, f20: 268840170426, f23: 2.27, f100: '白酒Ⅱ', f133: 5.1 },
      { f12: '600809', f14: '山西汾酒', f2: 112.54, f3: 0.23, f6: 800000000, f8: 0.5, f9: 10.66, f20: 137294773544, f23: 3.6, f100: '白酒Ⅱ', f133: 3.2 },
    ],
  },
};
const CLIST_US_PAYLOAD = {
  rc: 0,
  data: {
    total: 13815,
    diff: [
      { f12: 'NVDA', f14: '英伟达', f2: 213.63, f3: 0.69, f6: 5.1e10, f8: 0.6, f9: 26.69, f20: 5148483000000, f23: 22.48, f100: '信息技术', f133: '-' },
      { f12: 'AAPL', f14: '苹果', f2: 331.83, f3: 0.15, f6: 4.8e10, f8: 0.5, f9: 37.56, f20: 4842786749400, f23: 45.04, f100: '信息技术', f133: '-' },
    ],
  },
};
const CLIST_BOARD_LIST_PAYLOAD = {
  rc: 0,
  data: {
    total: 86,
    diff: [
      { f12: 'BK1201', f14: '电子', f3: 3.57, f62: 22702878720, f184: 4.23 },
      { f12: 'BK1036', f14: '半导体', f3: 4.76, f62: 13650636288, f184: 5.36 },
    ],
  },
};
const SUGGEST_BOARD_PAYLOAD = {
  QuotationCodeTable: {
    Data: [
      { Code: 'BK0896', Name: '白酒', Classify: 'BK' },
      { Code: '161725', Name: '白酒基金LOF', Classify: 'Fund' },
    ],
  },
};
const XUANGU_PAYLOAD = {
  result: {
    count: 5565,
    data: [
      { SECURITY_CODE: '600519', SECURITY_NAME_ABBR: '贵州茅台', SECUCODE: '600519.SH', NEW_PRICE: 1258, CHANGE_RATE: -1.16, PE_TTM: 17.66, TOTAL_MARKET_CAP: 1572602654058, ROE_WEIGHT: 16.75, TOTAL_OPERATE_INCOME_YOY: 6.1, PARENT_NETPROFIT_YOY: 8.2, INDUSTRY: '饮料', MAX_TRADE_DATE: '2026-09-16' },
      { SECURITY_CODE: '601398', SECURITY_NAME_ABBR: '工商银行', SECUCODE: '601398.SH', NEW_PRICE: 8.11, CHANGE_RATE: -0.25, PE_TTM: 8.32, TOTAL_MARKET_CAP: 2890454744992, ROE_WEIGHT: 9.1, TOTAL_OPERATE_INCOME_YOY: 1.2, PARENT_NETPROFIT_YOY: 0.8, INDUSTRY: '银行', MAX_TRADE_DATE: '2026-09-16' },
    ],
  },
};
const ULIST_PAYLOAD = {
  rc: 0,
  data: {
    total: 2,
    diff: [
      { f12: '600961', f14: '株冶集团', f2: 25.76, f3: 6.1, f6: 933130182, f8: 3.46, f9: 7.09, f20: 27637200829, f23: 4.72, f100: '工业金属', f124: 1789544070, f133: '-' },
      { f12: '600519', f14: '贵州茅台', f2: 1258, f3: -1.16, f6: 3307926407, f8: 0.21, f9: 17.66, f20: 1572602654058, f23: 6.26, f100: '白酒Ⅱ', f124: 1789544070, f133: 4.14 },
    ],
  },
};
const XUANGU_FUNDAMENTAL_PAYLOAD = {
  result: {
    data: [
      { SECURITY_CODE: '002289', SECURITY_NAME_ABBR: '宇顺电子', SECUCODE: '002289.SZ', NEW_PRICE: 35.54, CHANGE_RATE: 0.17, PE_TTM: 36.85, TOTAL_MARKET_CAP: 9960217671, ROE_WEIGHT: 78.71, INDUSTRY: '电子器件', MAX_TRADE_DATE: '2026-09-16' },
      { SECURITY_CODE: '600961', SECURITY_NAME_ABBR: '株冶集团', SECUCODE: '600961.SH', NEW_PRICE: 25.76, CHANGE_RATE: 6.1, PE_TTM: 11.11, TOTAL_MARKET_CAP: 27637200829, ROE_WEIGHT: 39.52, INDUSTRY: '基本金属', MAX_TRADE_DATE: '2026-09-16' },
    ],
  },
};
const ULIST_FUNDAMENTAL_PAYLOAD = {
  rc: 0,
  data: {
    total: 2,
    diff: [
      { f12: '600961', f14: '株冶集团', f2: 25.76, f3: 6.1, f6: 933130182, f8: 3.46, f9: 7.09, f20: 27637200829, f23: 4.72, f100: '工业金属', f124: 1789544070 },
      { f12: '002289', f14: '宇顺电子', f2: 35.54, f3: 0.17, f6: 103891312, f8: 1.07, f9: 17.76, f20: 9960217671, f23: 20.06, f100: '光学光电子', f124: 1789544070 },
    ],
  },
};
const KAMT_PAYLOAD = { data: { hk2sh: { status: 3, dayNetAmtIn: 0, dayAmtRemain: 0, dayAmtThreshold: 5200000, date2: '2026-09-16' }, sh2hk: { status: 3, dayNetAmtIn: 4200000, dayAmtRemain: 0, dayAmtThreshold: 4200000, date2: '2026-09-16' } } };
const TOP_LIST_PAYLOAD = { result: { data: [{ TRADE_DATE: '2026-09-16 00:00:00', SECUCODE: '300464.SZ', SECURITY_NAME_ABBR: '星徽股份', CLOSE_PRICE: 10.02, CHANGE_RATE: 20, TURNOVERRATE: 18.7, BILLBOARD_NET_AMT: 10561590925, BILLBOARD_BUY_AMT: 11630832056, BILLBOARD_SELL_AMT: 1569241131, EXPLANATION: '日涨幅偏离值达到7%' }] } };

function routedFetcher(routes: readonly [string, unknown][]): (input: RequestInfo | URL) => Promise<Response> {
  return async (input) => {
    const url = String(input);
    for (const [needle, payload] of routes) {
      if (url.includes(needle)) return new Response(JSON.stringify(payload), { status: 200 });
    }
    throw new Error(`unexpected request in test double: ${url}`);
  };
}

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
  test('screens the live A-share 行情列表 and reports provider provenance', async () => {
    const result = await screenEastmoneyStocks({ market: 'cn', peMax: 10, limit: 5 }, { fetcher: routedFetcher([['clist/get', CLIST_CN_PAYLOAD], ['xuangu/list', XUANGU_PAYLOAD]]) });
    expect(result.rows.map((row) => row.ticker)).toEqual(['601398.SH']);
    expect(result.rows[0]).toMatchObject({ name: '工商银行', industry: '银行', pe: 8.32, pb: 0.73, roe: 9.1, dividendYield: 3.95, market: 'cn' });
    expect(result.scannedCount).toBe(2);
    expect(result.universeCount).toBe(5559);
    expect(decodeURIComponent(result.sourceUrls[0]!)).toContain('fid=f9');
    // PE is the one field where the provider reaches the low end through po=1.
    expect(decodeURIComponent(result.sourceUrls[0]!)).toContain('po=1');
    expect(result.sourceUrls.some((url) => url.includes('xuangu/list'))).toBe(true);
    expect(result.note).toContain('样本');
  });

  test('keeps Hong Kong RMB counters out and screens the US list', async () => {
    const hkPayload = { rc: 0, data: { total: 17985, diff: [
      { f12: '00700', f14: '腾讯控股', f2: 433.4, f3: -1.23, f9: 14.77, f20: 3941810269366, f23: 3.01, f100: '软件服务', f133: '-' },
      { f12: '80700', f14: '腾讯控股-R', f2: 370.8, f3: -1.23, f9: 14.32, f20: 3372457886204, f23: 2.97, f100: '软件服务', f133: '-' },
    ] } };
    const hk = await screenEastmoneyStocks({ market: 'hk', limit: 5 }, { fetcher: routedFetcher([['clist/get', hkPayload]]) });
    expect(hk.rows.map((row) => row.ticker)).toEqual(['00700.HK']);
    const us = await screenEastmoneyStocks({ market: 'us', limit: 5 }, { fetcher: routedFetcher([['clist/get', CLIST_US_PAYLOAD]]) });
    expect(us.rows.map((row) => row.ticker)).toEqual(['NVDA', 'AAPL']);
    expect(us.rows[0]!.dividendYield).toBeUndefined();
    expect(us.note).toContain('美股');
  });

  test('resolves a Chinese sector keyword to the live 板块 membership', async () => {
    const result = await screenEastmoneyStocks({ market: 'cn', sector: '白酒', peMax: 20, limit: 10 }, { fetcher: routedFetcher([['suggest/get', SUGGEST_BOARD_PAYLOAD], ['fs=b%3ABK0896', CLIST_BOARD_PAYLOAD]]) });
    expect(result.rows.map((row) => row.ticker)).toEqual(['600519.SH', '000858.SZ', '600809.SH']);
    expect(result.scannedCount).toBe(3);
    expect(result.universeCount).toBe(45);
    expect(result.note).toContain('板块');
    expect(result.sourceUrls[0]).toContain('fs=b%3ABK0896');
    expect(result.rows[0]!.dividendYield).toBe(4.14);
  });

  test('drives an ROE screen from the 选股器 window plus the live 行情快照, not from a quote-list intersection', async () => {
    const fetcher = routedFetcher([['ulist.np/get', ULIST_FUNDAMENTAL_PAYLOAD], ['xuangu/list', XUANGU_FUNDAMENTAL_PAYLOAD]]);
    const result = await screenEastmoneyStocks({ market: 'cn', peMax: 15, roeMin: 15, limit: 10 }, { fetcher });
    expect(result.rows.map((row) => row.ticker)).toEqual(['600961.SH']);
    expect(result.rows[0]).toMatchObject({ name: '株冶集团', industry: '工业金属', pe: 7.09, pb: 4.72, roe: 39.52, market: 'cn' });
    expect(result.scannedCount).toBe(2);
    expect(result.universeCount).toBeUndefined();
    expect(result.asOf).toBe('2026-09-16');
    const window = decodeURIComponent(result.sourceUrls[0]!);
    expect(window).toContain('st=ROE_WEIGHT');
    expect(window).toContain('filter=(ROE_WEIGHT>=15)');
    expect(result.sourceUrls[1]).toContain('ulist.np/get');
    expect(result.note).toContain('选股器');
  });

  test('answers a natural-language PE 且 ROE screen from the real provider rows', async () => {
    const out = await runNaturalLanguageScreen('低估值 PE < 15 且 ROE > 15', {
      universe: 'cn',
      loader: createEastmoneyScreenLoader({ fetcher: routedFetcher([['ulist.np/get', ULIST_FUNDAMENTAL_PAYLOAD], ['xuangu/list', XUANGU_FUNDAMENTAL_PAYLOAD]]), now: () => new Date('2026-09-17T02:00:00Z') }),
    });
    expect(out.matchedCount).toBe(1);
    expect(out.results[0]!.ticker).toBe('600961.SH');
    expect(out.results[0]!.metrics).toMatchObject({ pe: 7.09, pb: 4.72, roe: 39.52 });
    expect(out.sourceUrls.some((url) => url.includes('data.eastmoney.com/dataapi/xuangu/list'))).toBe(true);
    expect(out.note).toContain('选股器');
  });

  test('scores and ranks the rows a real loader returns', async () => {
    const out = await runNaturalLanguageScreen('低估值 PE < 20', {
      universe: 'cn',
      loader: async () => ({
        rows: [
          { ticker: '600519.SH', name: '贵州茅台', market: 'cn', industry: '白酒Ⅱ', pe: 17.66, pb: 6.26, marketCap: 1572602654058, roe: 16.75, dividendYield: 4.14 },
          { ticker: '601398.SH', name: '工商银行', market: 'cn', industry: '银行', pe: 8.32, pb: 0.73, marketCap: 2890454744992, roe: 9.1, dividendYield: 3.95 },
        ],
        scannedCount: 2,
        asOf: '2026-09-16',
        sourceUrls: ['https://data.eastmoney.com/dataapi/xuangu/list'],
      }),
    });
    expect(out.source).toBe('nl_screen');
    expect(out.template).toBe('value');
    expect(out.asOf).toBe('2026-09-16');
    expect(out.sourceUrls).toEqual(['https://data.eastmoney.com/dataapi/xuangu/list']);
    expect(out.matchedCount).toBe(2);
    expect(out.results[0]).toMatchObject({ ticker: '601398.SH', metrics: { pe: 8.32, pb: 0.73, roe: 9.1 } });
    expect(out.results[0]!.thesis).toContain('工商银行');
  });

  test('falls back to the mirror 行情 host when the live host drops the connection', async () => {
    resetEastmoneyGates();
    const hosts: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      hosts.push(new URL(url).host);
      if (url.includes('push2.eastmoney.com')) throw new TypeError('The socket connection was closed unexpectedly');
      if (url.includes('xuangu/list')) return new Response(JSON.stringify(XUANGU_PAYLOAD), { status: 200 });
      return new Response(JSON.stringify(CLIST_CN_PAYLOAD), { status: 200 });
    };
    const result = await screenEastmoneyStocks({ market: 'cn', peMax: 10, limit: 5 }, { fetcher });
    expect(hosts).toContain('push2delay.eastmoney.com');
    expect(result.sourceUrls[0]).toContain('push2delay.eastmoney.com');
    expect(result.note).toContain('push2delay');
    expect(result.rows.map((row) => row.ticker)).toEqual(['601398.SH']);
    resetEastmoneyGates();
  });

  test('reports a dropped connection as an actionable provider error', async () => {
    resetEastmoneyGates();
    const fetcher = async () => { throw new TypeError('The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()'); };
    await expect(screenEastmoneyStocks({ market: 'cn', peMax: 10, limit: 5 }, { fetcher })).rejects.toThrow(/连接被重置/);
    resetEastmoneyGates();
  });

  test('parses Chinese filter labels that start a query', () => {
    expect(deterministicScreenParser('股息率 > 5', 'cn').filters).toEqual([{ field: 'dividendYield', op: '>', value: 5 }]);
    expect(deterministicScreenParser('市盈率 < 20', 'cn').filters).toEqual([{ field: 'pe', op: '<', value: 20 }]);
    expect(deterministicScreenParser('营收增长 > 20%', 'cn').filters).toEqual([{ field: 'revenueGrowth', op: '>', value: 20 }]);
    expect(deterministicScreenParser('cape<5', 'cn').filters).toEqual([]);
  });

  test('refuses filters the selected universe cannot answer', async () => {
    const loader = async () => ({ rows: [], scannedCount: 0, asOf: '2026-09-16', sourceUrls: [] });
    await expect(runNaturalLanguageScreen('RSI < 35', { universe: 'cn', loader })).rejects.toThrow(ScreenFilterUnsupportedError);
    await expect(runNaturalLanguageScreen('PE < 15 且 ROE > 20%', { universe: 'us', loader })).rejects.toThrow(/roe/i);
    expect(extractScreenKeywords('白酒 低估值')).toEqual(['白酒']);
    expect(extractScreenKeywords('PE < 15 且 ROE > 20%')).toEqual([]);
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
    expect(quote.evidence).toMatchObject({ id: 'market-data:test-quote:quote', provider: 'eastmoney' });
    expect(quote.evidence.source.startsWith('https://push2.eastmoney.com/api/qt/stock/get?secid=1.600519')).toBe(true);
    expect(quote.value.source.startsWith('dry-run://')).toBe(false);
  });

  test('retries an A-share quote on the delayed host when push2 drops the connection', async () => {
    resetEastmoneyGates();
    const hosts: string[] = [];
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        const url = String(input);
        hosts.push(new URL(url).host);
        if (url.includes('push2.eastmoney.com')) throw new TypeError('The socket connection was closed unexpectedly');
        return new Response(JSON.stringify({
          rc: 0,
          data: { f43: 125800, f44: 127498, f45: 125410, f46: 127393, f47: 26235, f48: 3307926407, f57: '600519', f58: '贵州茅台', f59: 2, f60: 127275, f86: Date.parse('2026-09-16T07:00:00Z') / 1000 },
        }), { status: 200 });
      },
    });
    const quote = await client.getQuote('600519.SH', 'cn', undefined, 'test-quote-mirror');
    expect(hosts).toContain('push2delay.eastmoney.com');
    expect(quote.value).toMatchObject({ last: 1258, asOf: '2026-09-16' });
    expect(quote.evidence.source).toContain('push2delay.eastmoney.com');
    expect(quote.evidence.note).toContain('备用主机');
    resetEastmoneyGates();
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

  test('falls back to the real 腾讯 daily series when push2his drops the connection', async () => {
    resetEastmoneyGates();
    const hosts: string[] = [];
    const client = new NativeMarketHistoryClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        const url = String(input);
        hosts.push(new URL(url).host);
        if (url.includes('push2his.eastmoney.com')) throw new TypeError('The socket connection was closed unexpectedly');
        return new Response(JSON.stringify({ code: 0, data: { sh600519: { qfqday: [
          ['2026-08-03', '1350.600', '1358.980', '1363.350', '1346.000', '36147.000'],
          ['2026-08-04', '1350.060', '1328.360', '1350.940', '1328.360', '37450.000'],
        ] } } }), { status: 200 });
      },
    });
    const result = await client.getHistory('600519.SH', '2026-08-01', '2026-08-05', undefined, 'test-history-fallback', 'cn');
    expect(hosts).toContain('web.ifzq.gtimg.cn');
    expect(result.value).toEqual([
      { date: '2026-08-03', open: 1350.6, high: 1363.35, low: 1346, close: 1358.98, volume: 3_614_700 },
      { date: '2026-08-04', open: 1350.06, high: 1350.94, low: 1328.36, close: 1328.36, volume: 3_745_000 },
    ]);
    expect(result.evidence).toMatchObject({ provider: 'tencent', query: '600519.SH:cn:2026-08-01:2026-08-05' });
    expect(result.evidence.source).toContain('web.ifzq.gtimg.cn');
    expect(result.evidence.note).toContain('腾讯财经');
    resetEastmoneyGates();
  });

  test('treats an empty 东方财富 kline answer as unavailable instead of fabricating bars', async () => {
    resetEastmoneyGates();
    const client = new NativeMarketHistoryClient({
      provider: 'auto',
      tushareToken: '',
      fetcher: async (input) => {
        if (String(input).includes('push2his.eastmoney.com')) return new Response(JSON.stringify({ rc: 0, data: { code: '600519', market: 1, dktotal: 0, klines: [] } }), { status: 200 });
        throw new TypeError('The socket connection was closed unexpectedly');
      },
    });
    await expect(client.getHistory('600519.SH', '2026-08-01', '2026-08-05', undefined, 'test-history-empty', 'cn')).rejects.toThrow(/日线数据不可用/);
    resetEastmoneyGates();
  });

  test('maps CN/HK symbols onto 腾讯 codes and parses both kline shapes', () => {
    expect(tencentKlineCode('600519.SH', 'cn')).toBe('sh600519');
    expect(tencentKlineCode('000001.SZ', 'cn')).toBe('sz000001');
    expect(tencentKlineCode('920002.BJ', 'cn')).toBe('bj920002');
    expect(tencentKlineCode('00700.HK', 'hk')).toBe('hk00700');
    expect(() => tencentKlineCode('AAPL', 'cn')).toThrow(/腾讯财经/);
    expect(tencentKlineUrl('sh600519').searchParams.get('param')).toBe('sh600519,day,,,640,qfq');
    const bars = parseTencentKlines({ data: { hk00700: { day: [
      ['2026-09-14', '423.800', '430.600', '435.400', '423.800', '11363985.000', { cqr: '2026-09-14' }],
      ['2026-09-15', '430.000', '428.000', '431.000', '427.000', '-'],
    ] } } }, 'hk00700', '00700.HK', '2026-09-01', '2026-09-17', 'hk');
    expect(bars).toEqual([{ date: '2026-09-14', open: 423.8, high: 435.4, low: 423.8, close: 430.6, volume: 11_363_985 }]);
    expect(() => parseTencentKlines({ data: {} }, 'sh600519', '600519.SH', '2026-08-01', '2026-08-05', 'cn')).toThrow(/腾讯财经未返回/);
  });

  test('handles market calendar boundaries', () => {
    expect(isTradingDay('2026-09-12', 'cn')).toBe(false);
    expect(isTradingDay('2026-09-14', 'cn')).toBe(true);
    expect(isTradingDay('2026-10-01', 'cn')).toBe(false);
  });

  test('reads real 板块 lists and 资金面 snapshots', async () => {
    const fetcher = routedFetcher([
      ['suggest/get', SUGGEST_BOARD_PAYLOAD],
      ['fs=b%3ABK0896', CLIST_BOARD_PAYLOAD],
      ['clist/get', CLIST_BOARD_LIST_PAYLOAD],
      ['kamt/get', KAMT_PAYLOAD],
      ['datacenter-web', TOP_LIST_PAYLOAD],
    ]);
    const sectors = await querySectorSnapshot(undefined, 'industry', { fetcher });
    expect(sectors).toMatchObject({ type: 'industry', sectors: ['电子', '半导体'] });
    const board = await querySectorSnapshot('白酒', 'concept', { fetcher });
    expect(board).toMatchObject({ code: 'BK0896', sector: '白酒' });
    expect((board as { members: { ticker: string }[] }).members.map((member) => member.ticker)).toEqual(['600519.SH', '000858.SZ', '600809.SH']);
    const hsgt = await getMarketStructureSnapshot('hsgt', {}, { fetcher });
    expect(hsgt.data).toContainEqual(expect.objectContaining({ channel: '港股通(沪)', 净买入万元: 4200000 }));
    const topList = await getMarketStructureSnapshot('top_list', { trade_date: '2026-09-16' }, { fetcher });
    expect(topList).toMatchObject({ type: 'top_list', asOf: '2026-09-16', data: [{ symbol: '300464.SZ', netBuyAmount: 10561590925 }] });
    expect(topList.sourceUrls[0]).toContain(`TRADE_DATE`);
  });

  test('screens the live board through the injected provider rows only', async () => {
    const fetcher = routedFetcher([['suggest/get', SUGGEST_BOARD_PAYLOAD], ['clist/get', CLIST_BOARD_PAYLOAD]]);
    const result = await screenEastmoneyStocks({ market: 'cn', sector: '白酒', performance: 'losers', limit: 2 }, { fetcher });
    expect(result.rows.map((row) => row.ticker)).toEqual(['600519.SH', '000858.SZ']);
    expect(result.rows.every((row) => (row.changePercent ?? 0) < 0)).toBe(true);
  });

  test('derives indicators from the bars the provider returned', () => {
    const bars = Array.from({ length: 40 }, (_, index) => ({ date: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000 + index }));
    const result = buildTechnicalSnapshot('600519.SH', bars, 'daily');
    expect(result).toMatchObject({ ts_code: '600519.SH', period: 'daily', count: 40 });
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

describe('eastmoney request gate', () => {
  test('serializes requests and spaces their starts', async () => {
    let clock = 0;
    const slept: number[] = [];
    const gate = createEastmoneyGate({ host: 'gate-unit', minIntervalMs: 500, now: () => clock, sleep: async (ms) => { slept.push(ms); clock += ms; } });
    const order: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const run = (label: string) => gate.run(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(label);
      inFlight -= 1;
      return label;
    });
    expect(await Promise.all([run('a'), run('b')])).toEqual(['a', 'b']);
    expect(order).toEqual(['a', 'b']);
    expect(maxInFlight).toBe(1);
    // The second request waited out exactly one interval before starting.
    expect(slept).toEqual([500]);
    // Once the interval has elapsed the gate does not wait again.
    clock += 600;
    expect(await run('c')).toBe('c');
    expect(slept).toEqual([500]);
  });

  test('fails fast with an actionable message after consecutive connection resets', async () => {
    const gate = createEastmoneyGate({ host: 'push2.test', minIntervalMs: 0, cooldownMs: 30_000, sleep: async () => {} });
    const reset = () => Promise.reject(new TypeError('The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()'));
    await expect(gate.run(reset)).rejects.toThrow(/socket connection was closed/);
    await expect(gate.run(reset)).rejects.toBeInstanceOf(EastmoneyThrottleError);
    expect(gate.retryAfterMs()).toBe(30_000);
    let calls = 0;
    await expect(gate.run(async () => { calls += 1; return 'ok'; })).rejects.toThrow(/已重置连接/);
    expect(calls).toBe(0);
    gate.reset();
    expect(await gate.run(async () => 'recovered')).toBe('recovered');
  });

  test('surfaces the throttle message instead of the raw socket error on a burst', async () => {
    resetEastmoneyGates();
    let calls = 0;
    const client = new NativeMarketQuoteClient({
      provider: 'auto',
      tushareToken: '',
      baseUrl: 'https://push2.gate-test.invalid/api/qt/stock/get',
      fetcher: async () => { calls += 1; throw new TypeError('The socket connection was closed unexpectedly'); },
    });
    await expect(client.getQuote('600519.SH', 'cn', undefined, 'gate-quote')).rejects.toThrow(/push2\.gate-test\.invalid 已重置连接/);
    // Two resets arm the cooldown; the retry policy stops instead of burning a third attempt.
    expect(calls).toBe(2);
    resetEastmoneyGates();
  });
});
