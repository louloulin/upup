import { describe, expect, test } from 'bun:test';
import marketDataExtension from './index';
import { resetEastmoneyGates } from '../src/index';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { publishPiCapabilityHosts } from '@upup/pi-capability-registry';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPiCapabilityContext,
  PI_MARKET_DATA_CAPABILITY_VERSION,
  PI_MARKET_DATA_CAPABILITY_NAMES,
  type PiAuditCapability,
  type PiEvidenceCapability,
} from '@upup/pi-runtime';


/** Provider-shaped doubles for the live screener / 板块 reads. */
const SCREEN_SUGGEST_PAYLOAD = { QuotationCodeTable: { Data: [{ Code: 'BK1029', Name: '新能源', Classify: 'BK' }, { Code: 'BK0896', Name: '白酒', Classify: 'BK' }] } };
const SCREEN_BOARD_PAYLOAD = {
  rc: 0,
  data: {
    total: 45,
    diff: [
      { f12: '002594', f14: '比亚迪', f2: 83.96, f3: 3.6, f6: 5000000000, f8: 1.2, f9: 22.1, f20: 765479907557, f23: 3.19, f100: '新能源', f133: 0.8 },
      { f12: '300750', f14: '宁德时代', f2: 300, f3: -1.9, f6: 4000000000, f8: 0.9, f9: 19.7, f20: 1120000000000, f23: 4.1, f100: '新能源', f133: 1.1 },
    ],
  },
};
const SCREEN_CN_QUOTE_PAYLOAD = {
  rc: 0,
  data: {
    total: 5559,
    diff: [
      { f12: '601398', f14: '工商银行', f2: 8.11, f3: -0.25, f6: 2500000000, f8: 0.12, f9: 8.32, f20: 2890454744992, f23: 0.73, f100: '银行', f133: 3.95 },
      { f12: '600519', f14: '贵州茅台', f2: 1258, f3: -1.16, f6: 3307926407, f8: 0.26, f9: 17.66, f20: 1572602654058, f23: 6.26, f100: '白酒Ⅱ', f133: 4.14 },
    ],
  },
};
const SCREEN_XUANGU_PAYLOAD = {
  result: {
    count: 5565,
    data: [
      { SECURITY_CODE: '600519', SECURITY_NAME_ABBR: '贵州茅台', SECUCODE: '600519.SH', NEW_PRICE: 1258, CHANGE_RATE: -1.16, PE_TTM: 17.66, TOTAL_MARKET_CAP: 1572602654058, ROE_WEIGHT: 16.75, INDUSTRY: '饮料', MAX_TRADE_DATE: '2026-09-16' },
      { SECURITY_CODE: '601398', SECURITY_NAME_ABBR: '工商银行', SECUCODE: '601398.SH', NEW_PRICE: 8.11, CHANGE_RATE: -0.25, PE_TTM: 8.32, TOTAL_MARKET_CAP: 2890454744992, ROE_WEIGHT: 9.1, INDUSTRY: '银行', MAX_TRADE_DATE: '2026-09-16' },
    ],
  },
};
const SCREEN_BOARD_LIST_PAYLOAD = { rc: 0, data: { total: 86, diff: [{ f12: 'BK1201', f14: '电子', f3: 3.57, f62: 22702878720, f184: 4.23 }] } };
const SCREEN_KAMT_PAYLOAD = { data: { hk2sh: { status: 3, dayNetAmtIn: 0, dayAmtRemain: 0, dayAmtThreshold: 5200000, date2: '2026-09-16' }, sh2hk: { status: 3, dayNetAmtIn: 4200000, dayAmtRemain: 0, dayAmtThreshold: 4200000, date2: '2026-09-16' } } };
const SCREEN_TOPLIST_PAYLOAD = { result: { data: [{ TRADE_DATE: '2026-09-16 00:00:00', SECUCODE: '300464.SZ', SECURITY_NAME_ABBR: '星徽股份', CLOSE_PRICE: 10.02, CHANGE_RATE: 20, TURNOVERRATE: 18.7, BILLBOARD_NET_AMT: 10561590925, EXPLANATION: '日涨幅偏离值达到7%' }] } };

function liveScreenFetcher(): (input: RequestInfo | URL) => Promise<Response> {
  return async (input) => {
    const url = String(input);
    if (url.includes('suggest/get')) return new Response(JSON.stringify(SCREEN_SUGGEST_PAYLOAD), { status: 200 });
    if (url.includes('xuangu/list')) return new Response(JSON.stringify(SCREEN_XUANGU_PAYLOAD), { status: 200 });
    if (url.includes('kamt/get')) return new Response(JSON.stringify(SCREEN_KAMT_PAYLOAD), { status: 200 });
    if (url.includes('datacenter-web')) return new Response(JSON.stringify(SCREEN_TOPLIST_PAYLOAD), { status: 200 });
    if (url.includes('fs=b%3A')) return new Response(JSON.stringify(SCREEN_BOARD_PAYLOAD), { status: 200 });
    if (url.includes('clist/get')) return new Response(JSON.stringify(SCREEN_CN_QUOTE_PAYLOAD), { status: 200 });
    throw new Error(`unexpected request in test double: ${url}`);
  };
}
type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

function makeHost() {
  const tools = new Map<string, RegisteredTool>();
  const events = createEventBus();
  return { host: { events, registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool) } as never, tools };
}

describe('Pi market-data extension', () => {
  test('prefers session capabilities and applies evidence and audit capabilities', async () => {
    const tools = new Map<string, RegisteredTool>();
    const legacyFetch = (async () => {
      throw new Error('legacy transport must not be called');
    }) as typeof fetch;
    const contextFetch = (async (input) => {
      const url = String(input);
      if (url.includes('xuangu/list')) return new Response(JSON.stringify(SCREEN_XUANGU_PAYLOAD), { status: 200 });
      if (url.includes('clist/get')) return new Response(JSON.stringify(SCREEN_CN_QUOTE_PAYLOAD), { status: 200 });
      expect(url).toContain('AAPL');
      return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 210, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000, chartPreviousClose: 205 } }] } }), { status: 200 });
    }) as typeof fetch;
    const evidenceCapability: PiEvidenceCapability = (input) => ({
      ...input,
      source: `capability://${input.source}`,
      id: `evidence:${input.id}`,
    });
    const auditCapability: PiAuditCapability = (input) => `audit:${input.auditId}`;
    const context = createPiCapabilityContext({
      sessionId: 'market-data-test-session',
      capabilities: {
        [PI_MARKET_DATA_CAPABILITY_NAMES.quoteFetcher]: { version: PI_MARKET_DATA_CAPABILITY_VERSION, value: contextFetch },
        [PI_MARKET_DATA_CAPABILITY_NAMES.evidence]: { version: PI_MARKET_DATA_CAPABILITY_VERSION, value: evidenceCapability },
        [PI_MARKET_DATA_CAPABILITY_NAMES.audit]: { version: PI_MARKET_DATA_CAPABILITY_VERSION, value: auditCapability },
      },
    });
    const events = createEventBus();
    const dispose = publishPiCapabilityHosts(events, 'market-data-test-session', new Map([
      ['@upup/pi-market-data', {
        contract: 'upup.pi.host.v1',
        packageName: '@upup/pi-market-data',
        packageVersion: '0.1.0',
        sessionId: 'market-data-test-session',
        capabilities: ['market-data-transport'],
        providers: { marketData: { capabilityContext: context, getMarketQuoteFetcher: () => legacyFetch } },
      }],
    ]));
    try {
      marketDataExtension({ events, registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool) } as never);
      const result = await tools.get('market_data_quote')!.execute('quote-context-1', { symbol: 'AAPL', market: 'us', provider: 'yahoo' }, new AbortController().signal);
      expect(JSON.parse(result.content[0].text)).toMatchObject({ symbol: 'AAPL', last: 210 });
      expect(result.details).toMatchObject({ auditId: 'quote-context-1', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] });
      const screened = await tools.get('stock_screener')!.execute('screen-context-1', { market: 'cn', pe_max: 10, limit: 1 }, new AbortController().signal);
      expect(JSON.parse(screened.content[0].text)).toMatchObject({ count: 1, scannedCount: 2, universeCount: 5559, data: [{ ticker: '601398.SH', pe: 8.32, roe: 9.1 }] });
      expect(screened.details).toMatchObject({ auditId: 'audit:screen-context-1', dataFreshness: 'delayed', evidence: [{ id: 'evidence:market-data:screen-context-1:stock-screener' }] });
      expect((screened.details as { evidence: { source: string }[] }).evidence[0]!.source).toStartWith('capability://https://push2.eastmoney.com/api/qt/clist/get');
    } finally {
      dispose();
      await context.dispose();
    }
  });

  test('registers native auditable market tools', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    expect([...tools.keys()]).toEqual(['kairos_recent_opportunities', 'kairos_recent_position_alerts', 'kairos_recent_scanner_events', 'kairos_summary', 'get_market_data', 'realtime_subscribe', 'realtime_unsubscribe', 'realtime_list_subscriptions', 'get_sector_data', 'get_market_structure', 'stock_screener', 'screen_astocks', 'get_astock_price', 'get_technical_data', 'market_data_quote', 'market_data_provider_health', 'market_data_provider_trend', 'market_data_provider_sla', 'market_data_history', 'market_trading_day', 'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days']);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain('600519');
      return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: '600519.SS', regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000, chartPreviousClose: 1590 } }] } }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await tools.get('market_data_quote')!.execute('quote-1', { symbol: '600519.SH', market: 'cn', provider: 'yahoo' }, new AbortController().signal);
      expect(JSON.parse(result.content[0].text)).toMatchObject({ symbol: '600519.SH', market: 'cn', currency: 'CNY', last: 1600 });
      expect(result.details).toMatchObject({ auditId: 'quote-1', dataFreshness: 'delayed', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('screens the live 板块 membership with auditable provider evidence', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = liveScreenFetcher() as typeof fetch;
    try {
      const result = await tools.get('stock_screener')!.execute('screen-1', { market: 'cn', sector: '新能源', performance: 'gainers', limit: 10 }, new AbortController().signal);
      const value = JSON.parse(result.content[0].text);
      expect(value).toMatchObject({ freshness: 'delayed', asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), count: 1, scannedCount: 2, universeCount: 45 });
      expect(value.data[0]).toMatchObject({ ticker: '002594.SZ', industry: '新能源', pe: 22.1 });
      expect(result.details).toMatchObject({ auditId: 'screen-1', dataFreshness: 'delayed' });
      expect(result.details.evidence[0].source).toContain('push2.eastmoney.com/api/qt/clist/get');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('screens A-shares from the live 行情列表 and fails closed without a provider', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = liveScreenFetcher() as typeof fetch;
    try {
      const result = await tools.get('screen_astocks')!.execute('screen-a-1', { exchange: 'SH', pe_max: 10, limit: 10 }, new AbortController().signal);
      const value = JSON.parse(result.content[0].text);
      expect(value.data.length).toBe(1);
      expect(value.data.every((stock: { ticker: string; pe: number }) => stock.ticker.endsWith('.SH') && stock.pe <= 10)).toBe(true);
      expect(value.sources.some((source: string) => source.includes('data.eastmoney.com/dataapi/xuangu/list'))).toBe(true);
      expect(result.details.evidence[0].source).toContain('push2.eastmoney.com/api/qt/clist/get');
    } finally {
      globalThis.fetch = previousFetch;
    }
    globalThis.fetch = (async () => new Response('upstream unavailable', { status: 503 })) as typeof fetch;
    try {
      const failed = await tools.get('screen_astocks')!.execute('screen-a-2', { limit: 5 }, new AbortController().signal);
      expect(failed.isError).toBe(true);
      expect(failed.details).toMatchObject({ policy: 'no-synthetic-fallback' });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('returns live 板块 and 资金面 snapshots', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = liveScreenFetcher() as typeof fetch;
    try {
      const sector = await tools.get('get_sector_data')!.execute('sector-1', { code: '白酒', type: 'concept' }, new AbortController().signal);
      expect(JSON.parse(sector.content[0].text)).toMatchObject({ code: 'BK0896', sector: '白酒' });
      expect(JSON.parse(sector.content[0].text).members.map((member: { ticker: string }) => member.ticker)).toEqual(['002594.SZ', '300750.SZ']);
      expect(sector.details).toMatchObject({ auditId: 'sector-1' });
      expect(sector.details.evidence[0].source).toContain('fs=b%3ABK0896');
      const structure = await tools.get('get_market_structure')!.execute('structure-1', { type: 'hsgt' }, new AbortController().signal);
      expect(JSON.parse(structure.content[0].text)).toMatchObject({ type: 'hsgt', asOf: '2026-09-16' });
      expect(JSON.parse(structure.content[0].text).data).toContainEqual(expect.objectContaining({ channel: '港股通(沪)' }));
      expect(structure.details.evidence[0].source).toContain('kamt/get');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('returns native historical technical data with evidence', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ chart: { result: [{ timestamp: Array.from({ length: 40 }, (_, index) => Date.parse('2026-08-09T00:00:00Z') / 1000 - (39 - index) * 86_400), indicators: { quote: [{ open: Array(40).fill(100), high: Array(40).fill(102), low: Array(40).fill(99), close: Array.from({ length: 40 }, (_, index) => 100 + index), volume: Array(40).fill(1000) }] } }] } }), { status: 200 })) as typeof fetch;
    try {
      const result = await tools.get('get_technical_data')!.execute('technical-1', { code: '比亚迪', period: 'daily', start_date: '2026-07-01', end_date: '2026-08-09', provider: 'yahoo' }, new AbortController().signal);
      const value = JSON.parse(result.content[0].text);
      expect(value).toMatchObject({ ts_code: '002594.SZ', period: 'daily', count: 40, asOf: '2026-08-09', freshness: 'historical' });
      expect(value.data.at(-1)).toMatchObject({ trade_date: '20260809' });
      expect(result.details).toMatchObject({ auditId: 'technical-1', dataFreshness: 'historical', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('get_market_data and get_astock_price return native auditable results', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: '600519.SS', regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000, chartPreviousClose: 1590 } }] } }), { status: 200 })) as typeof fetch;
    try {
      const marketResult = await tools.get('get_market_data')!.execute('market-native-1', { query: '贵州茅台 600519.SH price', provider: 'yahoo' }, new AbortController().signal);
      expect(JSON.parse(marketResult.content[0].text)).toMatchObject({ symbol: '600519.SH', market: 'cn', currency: 'CNY', last: 1600 });
      expect(marketResult.details).toMatchObject({ auditId: 'market-native-1', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] });
    const astockResult = await tools.get('get_astock_price')!.execute('astock-native-1', { code: '贵州茅台', provider: 'yahoo' }, new AbortController().signal);
    expect(JSON.parse(astockResult.content[0].text)).toMatchObject({ ts_code: '600519.SH', count: 1 });
    expect(astockResult.details).toMatchObject({ auditId: 'astock-native-1', dataFreshness: 'cached', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart#cache' }] });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('registers the calendar vertical slice without registry host injection', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('check_trading_day')!.execute('calendar-1', { date: '2026-09-14', market: 'us' }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ date: '2026-09-14', market: 'US', isTradingDay: true });
    expect(result.details).toMatchObject({ auditId: 'calendar-1', evidence: [{ source: 'upup-pi://market-data/calendar' }] });
    expect(tools.has('get_upcoming_holidays')).toBe(true);
    expect(tools.has('get_next_trading_day')).toBe(true);
    expect(tools.has('get_trading_days')).toBe(true);
  });

  test('honors abort signals before doing work', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const controller = new AbortController();
    controller.abort();
    const result = await tools.get('market_data_history')!.execute('history-1', { symbol: 'AAPL', startDate: '2026-09-01', limit: 3 }, controller.signal);
    expect(result.isError).toBe(true);
  });

  test('uses the native historical provider and never substitutes synthetic bars on failure', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain('AAPL');
      return new Response(JSON.stringify({ chart: { result: [{ timestamp: [Date.parse('2026-01-02T00:00:00Z') / 1000, Date.parse('2026-01-05T00:00:00Z') / 1000], indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }] } }] } }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await tools.get('market_data_history')!.execute('history-native-1', { symbol: 'AAPL', startDate: '2026-01-01', endDate: '2026-01-31' }, new AbortController().signal);
      expect(JSON.parse(result.content[0].text)).toHaveLength(2);
      expect(result.details).toMatchObject({ source: 'native-provider', evidence: [{ auditId: 'history-native-1', dataFreshness: 'historical' }] });
    } finally {
      globalThis.fetch = previousFetch;
    }
    globalThis.fetch = (async () => new Response('upstream unavailable', { status: 503 })) as typeof fetch;
    try {
      const result = await tools.get('market_data_history')!.execute('history-native-2', { symbol: 'AAPL', startDate: '2026-02-01', endDate: '2026-02-28' }, new AbortController().signal);
      expect(result.isError).toBe(true);
      expect(result.details).toMatchObject({ source: 'native-provider', policy: 'no-synthetic-fallback' });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('reports redacted provider health without synthetic fallback', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain('600519');
      return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000 } }] } }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await tools.get('market_data_provider_health')!.execute('health-1', { provider: 'yahoo', symbol: '600519.SH', market: 'cn' }, new AbortController().signal);
      expect(JSON.parse(result.content[0].text)).toMatchObject({ ok: true, provider: 'yahoo', symbol: '600519.SH', freshness: 'delayed' });
      expect(result.details).toMatchObject({ auditId: 'health-1', health: 'healthy', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] });
      expect(result.content[0].text).not.toContain('regularMarketPrice');
    } finally {
      globalThis.fetch = previousFetch;
    }
    globalThis.fetch = (async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' })) as typeof fetch;
    try {
      const result = await tools.get('market_data_provider_health')!.execute('health-2', { provider: 'yahoo', symbol: 'AAPL', market: 'us' }, new AbortController().signal);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text)).toMatchObject({ ok: false, policy: 'no-synthetic-fallback' });
      expect(result.details).toMatchObject({ auditId: 'health-2', health: 'unhealthy', policy: 'no-synthetic-fallback' });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('records provider latency, outcome, and redacted error class in session metrics', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' })) as typeof fetch;
    try {
      const result = await tools.get('market_data_provider_health')!.execute('health-metrics-1', { provider: 'yahoo', symbol: 'AAPL', market: 'us' }, new AbortController().signal);
      const value = JSON.parse(result.content[0].text);
      expect(value).toMatchObject({ ok: false, policy: 'no-synthetic-fallback', metrics: { requests: 1, failures: 1, lastProvider: 'yahoo', lastOutcome: 'failure', lastErrorClass: 'forbidden', successRatePct: 0, sloStatus: 'unhealthy', recentSamples: [{ provider: 'yahoo', outcome: 'failure', errorClass: 'forbidden' }] } });
      expect(value.metrics.lastLatencyMs).toBeGreaterThanOrEqual(0);
      expect(value.metrics.lastCheckedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.content[0].text).not.toContain('TUSHARE_TOKEN');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('reads provider trend without invoking fetch', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const result = await tools.get('market_data_provider_trend')!.execute('trend-1', {}, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ trend: [], sloStatus: 'unknown', successRatePct: 0, sampleCount: 0 });
    expect(result.details).toMatchObject({ auditId: 'trend-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://market-data/market-data/provider-trend' }] });
  });

  test('manages provider SLA jobs through the Pi extension without messaging', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-market-sla-extension-'));
    const previous = process.env.UPUP_PROVIDER_SLA_STORE;
    process.env.UPUP_PROVIDER_SLA_STORE = join(root, 'jobs.json');
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' })) as typeof fetch;
    try {
      const added = await tools.get('market_data_provider_sla')!.execute('sla-add', { action: 'add', name: 'Yahoo probe', provider: 'yahoo', probe: 'us', everyMs: 60_000 }, new AbortController().signal);
      const jobId = JSON.parse(added.content[0].text).jobId;
      const run = await tools.get('market_data_provider_sla')!.execute('sla-run', { action: 'run', jobId }, new AbortController().signal);
      expect(JSON.parse(run.content[0].text)).toMatchObject({ jobId, status: 'error', errorClass: 'forbidden', policy: 'no-synthetic-fallback' });
      expect(run.details).toMatchObject({ auditId: 'sla-run', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://market-data/market-data/provider-sla' }] });
    } finally {
      globalThis.fetch = previousFetch;
      if (previous === undefined) delete process.env.UPUP_PROVIDER_SLA_STORE; else process.env.UPUP_PROVIDER_SLA_STORE = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  test('manages session-scoped realtime subscriptions over the live SSE transport', async () => {
    // The per-host gate is process-wide, so a cooldown armed elsewhere must not leak in.
    resetEastmoneyGates();
    const { host, tools } = makeHost();
    const previousFetch = globalThis.fetch;
    let streamedUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      streamedUrl = String(input);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream<Uint8Array>({
        // One frame, then stay open: the subscription must report a live stream.
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ rc: 0, data: { code: '600519', market: 1, trends: ['2026-09-16 09:30,1273.93,1273.93,1273.98,1273.70'] } })}\n\n`));
        },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as typeof fetch;
    try {
      marketDataExtension(host);
      const signal = new AbortController().signal;
      const subscribed = await tools.get('realtime_subscribe')!.execute('realtime-1', { symbols: ['600519', '600519'], throttleMs: 500, aggregateMs: 5000 }, signal);
      const value = JSON.parse(subscribed.content[0].text);
      expect(streamedUrl).toContain('secid=1.600519');
      expect(value).toMatchObject({ id: 'sub-1', symbols: ['600519'], source: 'eastmoney', throttleMs: 500, aggregateMs: 5000, connected: true });
      expect(subscribed.details).toMatchObject({ auditId: 'realtime-1', evidence: [{ source: 'upup-pi://market-data/realtime/subscribe' }] });
      const listed = await tools.get('realtime_list_subscriptions')!.execute('realtime-2', {}, signal);
      expect(JSON.parse(listed.content[0].text).subscriptions).toHaveLength(1);
      const removed = await tools.get('realtime_unsubscribe')!.execute('realtime-3', { subscriptionId: 'sub-1' }, signal);
      expect(JSON.parse(removed.content[0].text)).toMatchObject({ ok: true, subscriptionId: 'sub-1' });
    } finally {
      globalThis.fetch = previousFetch;
      resetEastmoneyGates();
    }
  });

  test('reads Kairos events from the current Pi Session journal', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const context = { sessionManager: { getEntries: () => [{ type: 'custom', customType: 'upup_pi_market_data_kairos_journal', data: { schema: 1, nextSeq: 3, events: [
      { topic: 'kairos.opportunity.breakout', kind: 'opportunity', payload: { symbol: '600519' }, timestamp: 10, seq: 1 },
      { topic: 'kairos.scanner.volume-spike', kind: 'scanner', payload: { symbol: '000001' }, timestamp: 11, seq: 2 },
    ] } }] } };
    const result = await tools.get('kairos_recent_opportunities')!.execute('kairos-1', { limit: 20 }, new AbortController().signal, undefined, context);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ count: 1, events: [{ topic: 'kairos.opportunity.breakout', kind: 'opportunity' }] });
    expect(result.details).toMatchObject({ auditId: 'kairos-1', evidence: [{ source: 'upup-pi://market-data/kairos/opportunity' }] });
    const summary = await tools.get('kairos_summary')!.execute('kairos-2', { recentsPerKind: 1 }, new AbortController().signal, undefined, context);
    expect(JSON.parse(summary.content[0].text).scanner.count).toBe(1);
  });

  test('fails closed when the live realtime stream is unavailable', async () => {
    const { host, tools } = makeHost();
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('forbidden', { status: 403, statusText: 'Forbidden' })) as typeof fetch;
    try {
      marketDataExtension(host);
      const result = await tools.get('realtime_subscribe')!.execute('realtime-eastmoney', { symbols: ['600519'] }, new AbortController().signal);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Eastmoney realtime stream failed for 600519/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe('Pi market-data extension dry-run smoke', () => {
  test('market_data_quote returns dry-run fixture when UPUP_DRY_RUN=1 is set', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const previousEnv = process.env.UPUP_DRY_RUN;
    const previousFetch = globalThis.fetch;
    process.env.UPUP_DRY_RUN = '1';
    globalThis.fetch = (async () => {
      throw new Error('fetch must not be called in dry-run mode');
    }) as typeof fetch;
    try {
      marketDataExtension({ events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
      const tool = tools.get('market_data_quote');
      expect(tool).toBeDefined();
      const result = await tool!.execute('quote-dry-1', { symbol: '600519.SH', market: 'cn' }, new AbortController().signal);
      const value = JSON.parse(result.content[0].text);
      expect(value.symbol).toBe('600519.SH');
      expect(value.market).toBe('cn');
      expect(value.currency).toBe('CNY');
      expect(value.price).toBeGreaterThan(0);
      expect(result.details).toMatchObject({ auditId: 'quote-dry-1' });
      expect(result.details.evidence[0].source).toMatch(/^dry-run:\/\//);
      expect(result.details.evidence[0].dataFreshness).toBe('offline');
    } finally {
      if (previousEnv === undefined) delete process.env.UPUP_DRY_RUN;
      else process.env.UPUP_DRY_RUN = previousEnv;
      globalThis.fetch = previousFetch;
    }
  });

  test('market_data_history returns dry-run fixture when UPUP_DRY_RUN=1 is set', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const previousEnv = process.env.UPUP_DRY_RUN;
    const previousFetch = globalThis.fetch;
    process.env.UPUP_DRY_RUN = '1';
    globalThis.fetch = (async () => {
      throw new Error('fetch must not be called in dry-run mode');
    }) as typeof fetch;
    try {
      marketDataExtension({ events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
      const tool = tools.get('market_data_history');
      expect(tool).toBeDefined();
      const result = await tool!.execute('history-dry-1', { symbol: '600519.SH', startDate: '2026-09-07', endDate: '2026-09-13' }, new AbortController().signal);
      const value = JSON.parse(result.content[0].text);
      expect(Array.isArray(value)).toBe(true);
      expect(value.length).toBeGreaterThanOrEqual(2);
      for (const bar of value) {
        expect(bar.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(bar.close).toBeGreaterThan(0);
        expect(bar.high).toBeGreaterThanOrEqual(bar.low);
      }
      expect(result.details.evidence[0].source).toMatch(/^dry-run:\/\//);
      expect(result.details.evidence[0].dataFreshness).toBe('offline');
    } finally {
      if (previousEnv === undefined) delete process.env.UPUP_DRY_RUN;
      else process.env.UPUP_DRY_RUN = previousEnv;
      globalThis.fetch = previousFetch;
    }
  });
});
