import { describe, expect, test } from 'bun:test';
import marketDataExtension from './index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

function makeHost() {
  const tools = new Map<string, RegisteredTool>();
  return { host: { registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool) } as never, tools };
}

describe('Pi market-data extension', () => {
  test('registers native auditable market tools', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
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

  test('screens the historical snapshot with auditable evidence', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const result = await tools.get('stock_screener')!.execute('screen-1', { market: 'cn', sector: '新能源', performance: 'gainers', limit: 10 }, new AbortController().signal);
    const value = JSON.parse(result.content[0].text);
    expect(value).toMatchObject({ asOf: '2026-09-12', freshness: 'historical', count: 1 });
    expect(value.data[0]).toMatchObject({ symbol: '002594.SZ', sector: '新能源' });
    expect(result.details).toMatchObject({ auditId: 'screen-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://market-data/stock-screener', asOf: '2026-09-12' }] });
  });

  test('screens A-shares without external registry or network access', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const result = await tools.get('screen_astocks')!.execute('screen-a-1', { exchange: 'SH', pe_max: 10, limit: 10 }, new AbortController().signal);
    const value = JSON.parse(result.content[0].text);
    expect(value.data.every((stock: { market: string; exchange: string }) => stock.market === 'cn' && stock.exchange === 'SH')).toBe(true);
    expect(result.details.evidence[0]).toMatchObject({ source: 'upup-pi://market-data/astock-screener', asOf: '2026-09-12' });
  });

  test('returns native sector and market-structure snapshots', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const sector = await tools.get('get_sector_data')!.execute('sector-1', { code: '002594.SZ', type: 'stock' }, new AbortController().signal);
    expect(JSON.parse(sector.content[0].text)).toMatchObject({ sector: '新能源', asOf: '2026-09-12', freshness: 'historical' });
    expect(sector.details).toMatchObject({ auditId: 'sector-1', evidence: [{ source: 'upup-pi://market-data/sector-data', asOf: '2026-09-12' }] });
    const structure = await tools.get('get_market_structure')!.execute('structure-1', { type: 'moneyflow' }, new AbortController().signal);
    expect(JSON.parse(structure.content[0].text)).toMatchObject({ type: 'moneyflow', asOf: '2026-09-12' });
    expect(JSON.parse(structure.content[0].text).data.length).toBeGreaterThan(0);
    expect(structure.details).toMatchObject({ auditId: 'structure-1', evidence: [{ source: 'upup-pi://market-data/market-structure' }] });
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
      const marketResult = await tools.get('get_market_data')!.execute('market-native-1', { query: '贵州茅台 600519.SH price' }, new AbortController().signal);
      expect(JSON.parse(marketResult.content[0].text)).toMatchObject({ symbol: '600519.SH', market: 'cn', currency: 'CNY', last: 1600 });
      expect(marketResult.details).toMatchObject({ auditId: 'market-native-1', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart' }] });
    const astockResult = await tools.get('get_astock_price')!.execute('astock-native-1', { code: '贵州茅台' }, new AbortController().signal);
    expect(JSON.parse(astockResult.content[0].text)).toMatchObject({ ts_code: '600519.SH', count: 1 });
    expect(astockResult.details).toMatchObject({ auditId: 'astock-native-1', dataFreshness: 'cached', source: 'native-provider', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart#cache' }] });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test('registers the calendar vertical slice without registry host injection', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('check_trading_day')!.execute('calendar-1', { date: '2026-09-14', market: 'us' }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ date: '2026-09-14', market: 'US', isTradingDay: true });
    expect(result.details).toMatchObject({ auditId: 'calendar-1', evidence: [{ source: 'upup-pi://market-data/calendar' }] });
    expect(tools.has('get_upcoming_holidays')).toBe(true);
    expect(tools.has('get_next_trading_day')).toBe(true);
    expect(tools.has('get_trading_days')).toBe(true);
  });

  test('honors abort signals before doing work', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const controller = new AbortController();
    controller.abort();
    const result = await tools.get('market_data_history')!.execute('history-1', { symbol: 'AAPL', startDate: '2026-09-01', limit: 3 }, controller.signal);
    expect(result.isError).toBe(true);
  });

  test('uses the native historical provider and never substitutes synthetic bars on failure', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
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

  test('manages session-scoped realtime subscriptions with evidence', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const signal = new AbortController().signal;
    const subscribed = await tools.get('realtime_subscribe')!.execute('realtime-1', { symbols: ['600519', '600519'], throttleMs: 500, aggregateMs: 5000, source: 'mock' }, signal);
    const value = JSON.parse(subscribed.content[0].text);
    expect(value).toMatchObject({ id: 'sub-1', symbols: ['600519'], source: 'mock', throttleMs: 500, aggregateMs: 5000 });
    expect(subscribed.details).toMatchObject({ auditId: 'realtime-1', evidence: [{ source: 'upup-pi://market-data/realtime/subscribe' }] });
    const listed = await tools.get('realtime_list_subscriptions')!.execute('realtime-2', {}, signal);
    expect(JSON.parse(listed.content[0].text).subscriptions).toHaveLength(1);
    const removed = await tools.get('realtime_unsubscribe')!.execute('realtime-3', { subscriptionId: 'sub-1' }, signal);
    expect(JSON.parse(removed.content[0].text)).toMatchObject({ ok: true, subscriptionId: 'sub-1' });
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

  test('fails closed for an external source without an injected socket', async () => {
    const { host, tools } = makeHost();
    marketDataExtension(host);
    const result = await tools.get('realtime_subscribe')!.execute('realtime-eastmoney', { symbols: ['600519'], source: 'eastmoney' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/socket factory/i);
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
      marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
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
      marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
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
