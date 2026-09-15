import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolvePiCapabilityHost, registerPiCapabilityHost } from '@upup/pi-capability-registry';
import { buildTechnicalSnapshot, createDefaultMarketQuoteClient, FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, isTradingDay, normalizeMarket, providerSla, resolveMarketHistoryClient, resolveMarketQuoteClient, JsonFileProviderSlaStore, type Market, type MarketHistoryProvider, type NativeMarketQuoteTrendStore } from '../src/index';
import { calendarTradingDays, isCalendarTradingDay, nextCalendarTradingDay, upcomingCalendarHolidays, type CalendarMarket } from '../src/calendar';
import { screenStockSnapshot, type StockScreenInput } from '../src/screener';
import { getMarketStructureSnapshot, querySectorSnapshot, type MarketStructureType, type SectorQueryType } from '../src/market-insights';
import { type TechnicalPeriod } from '../src/technical';
import { createRealtimeSubscriptionManager, type FeedSource } from '../src/realtime/index';
import { appendKairosEvent, createInitialKairosJournalState, listKairosEvents, summarizeKairos, type KairosEventKind, type NativeKairosJournalState } from '../src/kairos-journal';
import { PI_MARKET_DATA_CAPABILITY_VERSION, PI_MARKET_DATA_CAPABILITY_NAMES, type PiAuditCapability, type PiCapabilityContext, type PiEvidenceCapability } from '@upup/pi-runtime';

const PACKAGE = '@upup/pi-market-data';
const VERSION = '0.1.0';

function registerHostTools(pi: ExtensionAPI): void {
  registerPiCapabilityHost(pi, PACKAGE, (host) => {
    if (host.packageVersion !== VERSION || !host.sessionId || !host.capabilities.includes('tool-definitions')) return;
    for (const tool of host.providers.tools.getToolDefinitions({ contract: 'upup.pi.host.v1', packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions' })) pi.registerTool(tool as never);
  });
}

function capability<T>(context: PiCapabilityContext | undefined, name: string): T | undefined {
  return context?.has(name, PI_MARKET_DATA_CAPABILITY_VERSION)
    ? context.get<T>(name, PI_MARKET_DATA_CAPABILITY_VERSION)
    : undefined;
}

function hostTransport(events: { emit(channel: string, data: unknown): void; on(channel: string, handler: (data: unknown) => void): () => void }): { context?: PiCapabilityContext; history?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; quote?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; trendStore?: NativeMarketQuoteTrendStore } {
  const host = resolvePiCapabilityHost<{ packageName: string; packageVersion: string; capabilities: readonly string[]; providers: { marketData?: { capabilityContext?: PiCapabilityContext; getMarketHistoryFetcher?: () => (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; getMarketQuoteFetcher?: () => (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; getMarketQuoteTrendStore?: () => NativeMarketQuoteTrendStore } } }>(events, PACKAGE, undefined);
  if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.capabilities.includes('market-data-transport')) return {};
  return { context: host.providers.marketData?.capabilityContext, history: host.providers.marketData?.getMarketHistoryFetcher?.(), quote: host.providers.marketData?.getMarketQuoteFetcher?.(), trendStore: host.providers.marketData?.getMarketQuoteTrendStore?.() };
}

const quoteParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or fund identifier' }),
  market: Type.Optional(Type.String({ description: 'cn, hk, us, fund, or crypto' })),
  provider: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('yahoo'), Type.Literal('tushare')])),
});
const providerHealthParameters = Type.Object({
  provider: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('yahoo'), Type.Literal('tushare')])),
  symbol: Type.Optional(Type.String({ minLength: 1, maxLength: 24, description: 'Probe symbol; defaults to 600519.SH for auto/tushare and AAPL for yahoo.' })),
  market: Type.Optional(Type.String({ description: 'cn, hk, us, fund, or crypto' })),
});
const providerSlaParameters = Type.Object({
  action: Type.Union([Type.Literal('list'), Type.Literal('add'), Type.Literal('update'), Type.Literal('remove'), Type.Literal('run')]),
  jobId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  provider: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('yahoo'), Type.Literal('tushare')])),
  probe: Type.Optional(Type.Union([Type.Literal('default'), Type.Literal('us'), Type.Literal('cn'), Type.Literal('hk')])),
  everyMs: Type.Optional(Type.Integer({ minimum: 60_000 })),
  enabled: Type.Optional(Type.Boolean()),
});
const marketQueryParameters = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 500, description: 'Natural-language market data query' }),
});
const astockParameters = Type.Object({
  code: Type.String({ minLength: 1, description: 'A-share/HK code or company name' }),
  period: Type.Optional(Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')])),
  start_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  end_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  provider: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('yahoo'), Type.Literal('tushare')])),
});
const historyParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or fund identifier' }),
  startDate: Type.String({ minLength: 10, maxLength: 10, description: 'ISO start date' }),
  endDate: Type.Optional(Type.String({ minLength: 10, maxLength: 10, description: 'ISO end date; defaults to today' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30, description: 'Number of daily bars' })),
  provider: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('yahoo'), Type.Literal('tushare')])) ,
});
const tradingDayParameters = Type.Object({
  date: Type.String({ minLength: 10, maxLength: 10, description: 'ISO calendar date' }),
  market: Type.Optional(Type.String({ description: 'cn, hk, us, fund, or crypto' })),
});
const calendarCheckParameters = Type.Object({
  date: Type.String({ minLength: 10, maxLength: 10, description: 'Date in YYYY-MM-DD format' }),
  market: Type.Optional(Type.Union([Type.Literal('us'), Type.Literal('china'), Type.Literal('hk'), Type.Literal('all')])),
});
const upcomingHolidayParameters = Type.Object({
  market: Type.Optional(Type.Union([Type.Literal('us'), Type.Literal('china'), Type.Literal('hk')])),
  startDate: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
});
const nextTradingDayParameters = Type.Object({
  fromDate: Type.String({ minLength: 10, maxLength: 10 }),
  market: Type.Optional(Type.Union([Type.Literal('us'), Type.Literal('china'), Type.Literal('hk')])),
  skipDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
});
const tradingDaysParameters = Type.Object({
  startDate: Type.String({ minLength: 10, maxLength: 10 }),
  endDate: Type.String({ minLength: 10, maxLength: 10 }),
  market: Type.Optional(Type.Union([Type.Literal('us'), Type.Literal('china'), Type.Literal('hk')])),
});
const stockScreenerParameters = Type.Object({
  market: Type.Optional(Type.Union([Type.Literal('cn'), Type.Literal('hk'), Type.Literal('us'), Type.Literal('all')])),
  sector: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  exchange: Type.Optional(Type.String({ minLength: 2, maxLength: 8 })),
  market_cap_min: Type.Optional(Type.Number({ minimum: 0 })),
  market_cap_max: Type.Optional(Type.Number({ minimum: 0 })),
  pe_min: Type.Optional(Type.Number({ minimum: 0 })),
  pe_max: Type.Optional(Type.Number({ minimum: 0 })),
  performance: Type.Optional(Type.Union([Type.Literal('gainers'), Type.Literal('losers'), Type.Literal('active'), Type.Literal('dividends')])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});
const astockScreenerParameters = Type.Object({
  sector: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  exchange: Type.Optional(Type.Union([Type.Literal('SH'), Type.Literal('SZ'), Type.Literal('BJ')])),
  market_cap_min: Type.Optional(Type.Number({ minimum: 0 })),
  market_cap_max: Type.Optional(Type.Number({ minimum: 0 })),
  pe_min: Type.Optional(Type.Number({ minimum: 0 })),
  pe_max: Type.Optional(Type.Number({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});
const sectorDataParameters = Type.Object({
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  type: Type.Optional(Type.Union([Type.Literal('stock'), Type.Literal('concept'), Type.Literal('industry')])),
});
const marketStructureParameters = Type.Object({
  type: Type.Union([Type.Literal('top_list'), Type.Literal('hsgt'), Type.Literal('moneyflow'), Type.Literal('margin')]),
  trade_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  start_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  end_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
});
const technicalDataParameters = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 40, description: 'A-share code or supported company name' }),
  start_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  end_date: Type.Optional(Type.String({ minLength: 8, maxLength: 10 })),
  period: Type.Optional(Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')])),
  provider: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('yahoo'), Type.Literal('tushare')])),
});
const realtimeSubscribeParameters = Type.Object({
  symbols: Type.Array(Type.String({ minLength: 1, maxLength: 24 }), { minItems: 1, maxItems: 50, description: 'Symbols to subscribe to.' }),
  throttleMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 600000, description: 'Per-symbol throttle window in milliseconds.' })),
  aggregateMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 86400000, description: 'OHLC aggregation period in milliseconds.' })),
  source: Type.Optional(Type.Union([Type.Literal('mock'), Type.Literal('eastmoney')])),
});
const realtimeUnsubscribeParameters = Type.Object({ subscriptionId: Type.String({ minLength: 1, maxLength: 64 }) });
const realtimeListParameters = Type.Object({});
const kairosLimitParameters = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) });
const kairosSummaryParameters = Type.Object({ recentsPerKind: Type.Optional(Type.Integer({ minimum: 0, maximum: 10 })) });
const providerTrendParameters = Type.Object({});

function text(value: unknown): string { return JSON.stringify(value); }
function nativeEvidence(toolCallId: string, query: string, path: string, asOf?: string, evidenceCapability?: PiEvidenceCapability, auditCapability?: PiAuditCapability) {
  const retrievedAt = new Date().toISOString();
  const auditId = auditCapability?.({ auditId: toolCallId, tool: path, query }) ?? toolCallId;
  return evidenceCapability
    ? evidenceCapability({ id: `market-data:${toolCallId}:${path}`, source: `upup-pi://market-data/${path}`, retrievedAt, asOf: asOf ?? retrievedAt.slice(0, 10), query, dataFreshness: 'historical', auditId })
    : {
      id: `market-data:${toolCallId}:${path}`,
      source: `upup-pi://market-data/${path}`,
      retrievedAt,
      asOf: asOf ?? retrievedAt.slice(0, 10),
      query,
      dataFreshness: 'historical' as const,
      auditId,
    };
}
function nativeResult(toolCallId: string, query: string, path: string, value: unknown, extra: Record<string, unknown> = {}, asOf?: string, evidenceCapability?: PiEvidenceCapability, auditCapability?: PiAuditCapability) {
  const evidence = nativeEvidence(toolCallId, query, path, asOf, evidenceCapability, auditCapability);
  return { content: [{ type: 'text' as const, text: text(value) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: evidence.auditId, ...extra } };
}
function normalizeInstrumentCode(code: string): { symbol: string; market: Market } {
  const trimmed = code.trim();
  if (/^(?:\d{5,6})(?:\.(?:SH|SZ|BJ|HK))?$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    if (upper.endsWith('.HK') || /^\d{4,5}\.HK$/i.test(upper)) return { symbol: upper, market: 'hk' };
    return { symbol: upper.includes('.') ? upper : `${upper}.${upper.startsWith('6') || upper.startsWith('68') ? 'SH' : upper.startsWith('9') ? 'BJ' : 'SZ'}`, market: 'cn' };
  }
  if (/^[A-Z][A-Z0-9.-]{0,9}$/i.test(trimmed)) return { symbol: trimmed.toUpperCase(), market: 'us' };
  const known: Record<string, string> = { '贵州茅台': '600519.SH', '比亚迪': '002594.SZ', '宁德时代': '300750.SZ', '腾讯': '00700.HK', '腾讯控股': '00700.HK' };
  const resolved = known[trimmed] ?? trimmed;
  return normalizeInstrumentCode(resolved);
}
function isoDaysAgo(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}
function calendarResult(toolCallId: string, query: string, value: unknown, evidenceCapability?: PiEvidenceCapability, auditCapability?: PiAuditCapability) {
  const evidence = nativeEvidence(toolCallId, query, 'calendar', '2026-09-13', evidenceCapability, auditCapability);
  return { content: [{ type: 'text' as const, text: text(value) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: evidence.auditId } };
}

export default function marketDataExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);
  const transport = hostTransport(pi.events);
  const context = transport.context;
  const contextHistory = capability<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(context, PI_MARKET_DATA_CAPABILITY_NAMES.historyFetcher);
  const contextQuote = capability<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(context, PI_MARKET_DATA_CAPABILITY_NAMES.quoteFetcher);
  const contextTrendStore = capability<NativeMarketQuoteTrendStore>(context, PI_MARKET_DATA_CAPABILITY_NAMES.quoteTrendStore);
  const evidenceCapability = capability<PiEvidenceCapability>(context, PI_MARKET_DATA_CAPABILITY_NAMES.evidence);
  const auditCapability = capability<PiAuditCapability>(context, PI_MARKET_DATA_CAPABILITY_NAMES.audit);
  const historyClients = new Map<MarketHistoryProvider, ReturnType<typeof resolveMarketHistoryClient>>();
  const quoteClients = new Map<MarketHistoryProvider, ReturnType<typeof resolveMarketQuoteClient>>();
  const nativeEvidenceResult = (toolCallId: string, query: string, path: string, value: unknown, extra: Record<string, unknown> = {}, asOf?: string) => nativeResult(toolCallId, query, path, value, extra, asOf, evidenceCapability, auditCapability);
  const getHistoryClient = (provider: MarketHistoryProvider) => {
    const existing = historyClients.get(provider);
    if (existing) return existing.client;
    const created = resolveMarketHistoryClient({
      provider,
      fetcher: contextHistory ?? transport.history,
    });
    historyClients.set(provider, created);
    return created.client;
  };
  const getQuoteClient = (provider: MarketHistoryProvider) => {
    const existing = quoteClients.get(provider);
    if (existing) return existing.client;
    const created = resolveMarketQuoteClient({
      provider,
      fetcher: contextQuote ?? transport.quote,
      trendStore: contextTrendStore ?? transport.trendStore,
    });
    quoteClients.set(provider, created);
    return created.client;
  };
  let recordKairosEvent: ((topic: string, payload: unknown, timestamp?: number) => void) | undefined;
  const realtime = createRealtimeSubscriptionManager({
    onQuote: (quote) => recordKairosEvent?.('realtime.quote', quote, quote.timestamp),
    onBar: (bar) => recordKairosEvent?.('realtime.bar', bar, bar.end),
  });
  if (typeof pi.on === 'function') pi.on('session_shutdown', () => { void realtime.close(); });
  const KAIROS_ENTRY = 'upup_pi_market_data_kairos_journal';
  let kairosState: NativeKairosJournalState | undefined;
  const readKairosState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }): NativeKairosJournalState => {
    if (kairosState) return kairosState;
    const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const value = candidate as { type?: unknown; customType?: unknown; data?: unknown };
      return value.type === 'custom' && value.customType === KAIROS_ENTRY && value.data && typeof value.data === 'object';
    }) as { data?: unknown } | undefined;
    const data = entry?.data as NativeKairosJournalState | undefined;
    kairosState = data?.schema === 1 && Array.isArray(data.events) ? data : createInitialKairosJournalState();
    return kairosState;
  };
  const recordKairos = (state: NativeKairosJournalState): void => { kairosState = state; if (typeof pi.appendEntry === 'function') pi.appendEntry(KAIROS_ENTRY, state); };
  recordKairosEvent = (topic, payload, timestamp) => recordKairos(appendKairosEvent(readKairosState(), { topic, payload, timestamp }));
  if (typeof pi.on === 'function') pi.on('session_start', (_event, context) => { kairosState = undefined; readKairosState(context); });
  const registerKairosRead = (name: string, kind: KairosEventKind, description: string) => pi.registerTool({
    name, label: name, description, parameters: kairosLimitParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: `${name} request aborted` }], isError: true };
      const events = listKairosEvents(readKairosState(context), kind, params.limit ?? 20);
      return nativeEvidenceResult(toolCallId, kind, `kairos/${kind}`, { count: events.length, events }, { warning: 'Session-scoped KAIROS journal; this tool does not trigger scans or fetch live data.' });
    },
  });
  registerKairosRead('kairos_recent_opportunities', 'opportunity', 'Read recent opportunity events recorded in the current Pi Session. This is read-only and does not trigger a scan.');
  registerKairosRead('kairos_recent_position_alerts', 'position-alert', 'Read recent position alerts recorded in the current Pi Session. This is read-only and does not trigger a scan.');
  registerKairosRead('kairos_recent_scanner_events', 'scanner', 'Read recent scanner events recorded in the current Pi Session. This is read-only and does not trigger a scan.');
  pi.registerTool({
    name: 'kairos_summary', label: 'kairos_summary', description: 'Summarize KAIROS events recorded in the current Pi Session without triggering scans.', parameters: kairosSummaryParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'kairos_summary request aborted' }], isError: true };
      const summary = summarizeKairos(readKairosState(context), params.recentsPerKind ?? 3);
      return nativeEvidenceResult(toolCallId, 'summary', 'kairos/summary', summary, { warning: 'Session-scoped KAIROS journal; this tool does not trigger scans or fetch live data.' });
    },
  });
  pi.registerTool({
    name: 'get_market_data',
    label: 'Market Data',
    description: 'Read an auditable deterministic market snapshot from an explicit market query.',
    parameters: marketQueryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'get_market_data request aborted' }], isError: true };
      const token = params.query.match(/[A-Za-z]{1,6}(?:\.[A-Za-z]{1,3})?|\d{6}(?:\.(?:SH|SZ|BJ))?/i)?.[0] ?? params.query.trim().slice(0, 32);
      const instrument = normalizeInstrumentCode(token);
      try {
        const quote = await getQuoteClient((params.provider ?? 'auto') as MarketHistoryProvider).getQuote(instrument.symbol, instrument.market, signal, toolCallId);
        const value = { query: params.query, ...quote.value };
        return { content: [{ type: 'text', text: text(value) }], details: { evidence: [quote.evidence], dataFreshness: quote.evidence.dataFreshness, auditId: toolCallId, source: 'native-provider' } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, source: 'native-provider', policy: 'no-synthetic-fallback' } };
      }
    },
  });
  pi.registerTool({
    name: 'realtime_subscribe',
    label: 'Realtime Subscribe',
    description: 'Open a session-scoped realtime market-data subscription. Mock is deterministic and offline; Eastmoney requires an explicitly injected socket in the host.',
    parameters: realtimeSubscribeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Realtime subscription request aborted' }], isError: true };
      try {
        const result = await realtime.subscribe({ symbols: params.symbols, throttleMs: params.throttleMs, aggregateMs: params.aggregateMs, source: params.source as FeedSource | undefined });
        return nativeEvidenceResult(toolCallId, JSON.stringify(params), 'realtime/subscribe', { ...result, note: result.source === 'mock' ? 'Deterministic mock feed; no external network.' : 'Eastmoney source requires host-injected socket and remains explicitly opt-in.' }, {}, new Date(result.createdAt).toISOString().slice(0, 10));
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Realtime subscription failed' }], isError: true };
      }
    },
  });
  pi.registerTool({
    name: 'realtime_unsubscribe',
    label: 'Realtime Unsubscribe',
    description: 'Close a realtime subscription owned by the current Pi session.',
    parameters: realtimeUnsubscribeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Realtime unsubscribe request aborted' }], isError: true };
      const result = await realtime.unsubscribe(params.subscriptionId);
      return nativeEvidenceResult(toolCallId, params.subscriptionId, 'realtime/unsubscribe', result);
    },
  });
  pi.registerTool({
    name: 'realtime_list_subscriptions',
    label: 'Realtime Subscriptions',
    description: 'List realtime subscriptions owned by the current Pi session.',
    parameters: realtimeListParameters,
    async execute(toolCallId, _params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Realtime list request aborted' }], isError: true };
      return nativeEvidenceResult(toolCallId, 'current-session', 'realtime/list', { subscriptions: realtime.list() });
    },
  });
  pi.registerTool({
    name: 'get_sector_data',
    label: 'A-share Sector Data',
    description: 'Read an auditable historical A-share sector snapshot. This tool is offline and does not query Tushare.',
    parameters: sectorDataParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Sector data request aborted' }], isError: true };
      const type = params.type ?? 'stock';
      const value = querySectorSnapshot(params.code, type as SectorQueryType);
      return nativeEvidenceResult(toolCallId, JSON.stringify(params), 'sector-data', { source: 'upup-pi://market-data/sector-data', freshness: 'historical', ...value, warning: '离线历史快照，不是实时板块行情或投资建议。' }, {}, '2026-09-12');
    },
  });
  pi.registerTool({
    name: 'get_market_structure',
    label: 'A-share Market Structure',
    description: 'Read an auditable historical A-share market-structure snapshot for dragon-tiger, northbound flow, money flow, or margin data.',
    parameters: marketStructureParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Market structure request aborted' }], isError: true };
      const value = getMarketStructureSnapshot(params.type as MarketStructureType);
      return nativeEvidenceResult(toolCallId, JSON.stringify(params), 'market-structure', { source: 'upup-pi://market-data/market-structure', freshness: 'historical', ...value, requestedDates: { trade_date: params.trade_date, start_date: params.start_date, end_date: params.end_date }, warning: '离线历史快照，不是实时资金流或交易建议。' }, {}, '2026-09-12');
    },
  });
  pi.registerTool({
    name: 'stock_screener',
    label: 'Stock Screener',
    description: 'Screen a bounded historical stock snapshot. Results are offline/historical and are not real-time quotes.',
    parameters: stockScreenerParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Stock screener request aborted' }], isError: true };
      const input: StockScreenInput = {
        market: params.market,
        sector: params.sector,
        exchange: params.exchange,
        marketCapMin: params.market_cap_min,
        marketCapMax: params.market_cap_max,
        peMin: params.pe_min,
        peMax: params.pe_max,
        performance: params.performance,
        limit: params.limit,
      };
      const data = screenStockSnapshot(input);
      return nativeEvidenceResult(toolCallId, JSON.stringify(params), 'stock-screener', { source: 'upup-pi://market-data/stock-snapshot', freshness: 'historical', asOf: '2026-09-12', criteria: params, count: data.length, data, warning: '离线历史快照，不是实时行情或投资建议。' }, {}, '2026-09-12');
    },
  });
  pi.registerTool({
    name: 'screen_astocks',
    label: 'A-share Screener',
    description: 'Screen a bounded historical A-share snapshot. Results are offline/historical and do not query Tushare or Eastmoney.',
    parameters: astockScreenerParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'A-share screener request aborted' }], isError: true };
      const data = screenStockSnapshot({ market: 'cn', sector: params.sector, exchange: params.exchange, marketCapMin: params.market_cap_min, marketCapMax: params.market_cap_max, peMin: params.pe_min, peMax: params.pe_max, limit: params.limit });
      return nativeEvidenceResult(toolCallId, JSON.stringify(params), 'astock-screener', { source: 'upup-pi://market-data/stock-snapshot', freshness: 'historical', asOf: '2026-09-12', criteria: params, count: data.length, data, warning: '离线历史快照，不是实时行情或投资建议。' }, {}, '2026-09-12');
    },
  });
  pi.registerTool({
    name: 'get_astock_price',
    label: 'A-share Price',
    description: 'Read an auditable A-share or Hong Kong price from the selected native market-data provider.',
    parameters: astockParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'get_astock_price request aborted' }], isError: true };
      const instrument = normalizeInstrumentCode(params.code);
      try {
        const quote = await getQuoteClient((params.provider ?? 'auto') as MarketHistoryProvider).getQuote(instrument.symbol, instrument.market, signal, toolCallId);
        const value = { source: 'upup-pi://market-data/astock-price', period: params.period ?? 'daily', ts_code: instrument.symbol, count: 1, data: [{ ts_code: instrument.symbol, trade_date: quote.value.asOf.replaceAll('-', ''), close: quote.value.last, market: instrument.market, currency: quote.value.currency, freshness: quote.value.freshness }] };
        return { content: [{ type: 'text' as const, text: text(value) }], details: { evidence: [quote.evidence], dataFreshness: quote.evidence.dataFreshness, auditId: toolCallId, source: 'native-provider', resolvedSymbol: instrument.symbol } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, source: 'native-provider', policy: 'no-synthetic-fallback', resolvedSymbol: instrument.symbol } };
      }
    },
  });
  pi.registerTool({
    name: 'get_technical_data',
    label: 'A-share Technical Data',
    description: 'Read native historical K-line data and derive MA5/10/20, RSI6/12, and MACD indicators.',
    parameters: technicalDataParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Technical data request aborted' }], isError: true };
      const instrument = normalizeInstrumentCode(params.code);
      const period = params.period as TechnicalPeriod | undefined ?? 'daily';
      const endDate = params.end_date ?? new Date().toISOString().slice(0, 10);
      const startDate = params.start_date ?? isoDaysAgo(endDate, period === 'daily' ? 120 : 720);
      try {
        const history = await getHistoryClient((params.provider ?? 'auto') as MarketHistoryProvider).getHistory(instrument.symbol, startDate, endDate, signal, toolCallId);
        const value = buildTechnicalSnapshot(instrument.symbol, history.value, period);
        return { content: [{ type: 'text' as const, text: text({ ...value, requestedDates: { start_date: startDate, end_date: endDate }, freshness: history.evidence.dataFreshness }) }], details: { evidence: [history.evidence], dataFreshness: history.evidence.dataFreshness, auditId: toolCallId, source: 'native-provider', resolvedSymbol: instrument.symbol } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, source: 'native-provider', policy: 'no-synthetic-fallback', resolvedSymbol: instrument.symbol } };
      }
    },
  });
  pi.registerTool({
    name: 'market_data_quote',
    label: 'Market data quote',
    description: 'Read a market quote with an auditable as-of date and data source.',
    parameters: quoteParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Market quote request aborted' }], isError: true };
      try {
        const result = await getQuoteClient((params.provider ?? 'auto') as MarketHistoryProvider).getQuote(params.symbol, params.market, signal, toolCallId);
        return { content: [{ type: 'text', text: text(result.value) }], details: { evidence: [result.evidence], dataFreshness: result.evidence.dataFreshness, auditId: toolCallId, source: 'native-provider' } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, source: 'native-provider', policy: 'no-synthetic-fallback' } };
      }
    },
  });
  pi.registerTool({
    name: 'market_data_provider_health',
    label: 'Market provider health',
    description: 'Probe a configured market-data provider with a real quote request. Returns only redacted health, latency, freshness, and evidence metadata; never returns credentials or raw provider payloads.',
    parameters: providerHealthParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Market provider health request aborted' }], isError: true };
      const requestedProvider = (params.provider ?? 'auto') as MarketHistoryProvider;
      const symbol = params.symbol ?? (requestedProvider === 'yahoo' ? 'AAPL' : '600519.SH');
      const startedAt = Date.now();
      try {
        const result = await getQuoteClient(requestedProvider).getQuote(symbol, params.market, signal, toolCallId);
        const provider = result.evidence.source.includes('tushare') ? 'tushare' : 'yahoo';
        const value = { ok: true, provider, requestedProvider, symbol: result.value.symbol, latencyMs: Date.now() - startedAt, source: result.evidence.source, asOf: result.evidence.asOf, freshness: result.evidence.dataFreshness, indicative: result.value.indicative, metrics: getQuoteClient(requestedProvider).getMetrics() };
        return { content: [{ type: 'text', text: text(value) }], details: { auditId: toolCallId, health: 'healthy', source: 'native-provider', provider, dataFreshness: result.evidence.dataFreshness, evidence: [result.evidence] } };
      } catch (error) {
        const raw = error instanceof Error ? error.message : 'market provider health probe failed';
        const token = process.env.TUSHARE_TOKEN?.trim();
        const safeError = raw.replace(token || '\u0000', '[REDACTED]').slice(0, 240);
        const value = { ok: false, provider: requestedProvider, requestedProvider, symbol, latencyMs: Date.now() - startedAt, policy: 'no-synthetic-fallback', error: safeError, metrics: getQuoteClient(requestedProvider).getMetrics() };
        return { content: [{ type: 'text', text: text(value) }], isError: true, details: { auditId: toolCallId, health: 'unhealthy', source: 'native-provider', provider: requestedProvider, policy: 'no-synthetic-fallback' } };
      }
    },
  });
  pi.registerTool({
    name: 'market_data_provider_trend',
    label: 'Market provider trend',
    description: 'Read redacted provider SLA trend buckets from the current Pi Session. This tool never performs a network request.',
    parameters: providerTrendParameters,
    async execute(toolCallId, _params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Market provider trend request aborted' }], isError: true };
      const metrics = getQuoteClient('auto').getMetrics();
      return nativeEvidenceResult(toolCallId, 'provider-trend', 'market-data/provider-trend', { trend: metrics.trend, sloStatus: metrics.sloStatus, successRatePct: metrics.successRatePct, sampleCount: metrics.recentSamples.length });
    },
  });
  pi.registerTool({
    name: 'market_data_provider_sla',
    label: 'Market provider SLA scheduler',
    description: 'Manage a silent Pi-native provider SLA sampler. Runs real provider probes, records redacted trend data, and never sends messages or creates synthetic market data.',
    parameters: providerSlaParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Market provider SLA request aborted' }], isError: true };
      try {
        const output = await providerSla(params, (provider) => getQuoteClient(provider), new JsonFileProviderSlaStore(), signal);
        return nativeEvidenceResult(toolCallId, 'provider-sla', 'market-data/provider-sla', output);
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, source: 'native-provider-sla', policy: 'no-synthetic-fallback' } };
      }
    },
  });
  pi.registerTool({
    name: 'market_data_history',
    label: 'Market data history',
    description: 'Read historical daily bars from the Pi market-data provider with an auditable source and as-of date. Network failures are returned as errors; no synthetic bars are substituted.',
    parameters: historyParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Historical data request aborted' }], isError: true };
      try {
        const result = await getHistoryClient((params.provider ?? 'auto') as MarketHistoryProvider).getHistory(params.symbol, params.startDate, params.endDate ?? new Date().toISOString().slice(0, 10), signal, toolCallId);
        const bars = params.limit === undefined ? result.value : result.value.slice(-params.limit);
        return { content: [{ type: 'text', text: text(bars) }], details: { evidence: [result.evidence], dataFreshness: result.evidence.dataFreshness, auditId: toolCallId, source: 'native-provider' } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, source: 'native-provider', policy: 'no-synthetic-fallback' } };
      }
    },
  });
  pi.registerTool({
    name: 'market_trading_day',
    label: 'Market trading day',
    description: 'Check whether a date is a trading day for a selected market.',
    parameters: tradingDayParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Trading day request aborted' }], isError: true };
      const market = normalizeMarket(params.market) as Market;
      const value = { date: params.date, market, isTradingDay: isTradingDay(params.date, market) };
      const evidence = { id: `market-data:${toolCallId}:calendar`, source: 'upup-fixture://market-data/calendar', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: params.date, query: `${market}:${params.date}`, dataFreshness: 'historical', auditId: toolCallId } as const;
      return { content: [{ type: 'text', text: text(value) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({ name: 'check_trading_day', label: 'Check Trading Day', description: 'Check whether a date is a trading day for US, China, or Hong Kong markets.', parameters: calendarCheckParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'check_trading_day request aborted' }], isError: true };
    const market = params.market ?? 'us';
    if (market === 'all') {
      const value = { date: params.date, markets: Object.fromEntries((['us', 'china', 'hk'] as const).map((candidate) => [candidate, { isTradingDay: isCalendarTradingDay(params.date, candidate) }])) };
      return calendarResult(toolCallId, `all:${params.date}`, value, evidenceCapability, auditCapability);
    }
    return calendarResult(toolCallId, `${market}:${params.date}`, { date: params.date, market: market.toUpperCase(), isTradingDay: isCalendarTradingDay(params.date, market as CalendarMarket) }, evidenceCapability, auditCapability);
  } });
  pi.registerTool({ name: 'get_upcoming_holidays', label: 'Upcoming Market Holidays', description: 'List upcoming holidays for a selected market.', parameters: upcomingHolidayParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'get_upcoming_holidays request aborted' }], isError: true };
    const market = params.market ?? 'us';
    const holidays = upcomingCalendarHolidays(params.startDate, market, params.count ?? 5);
    return calendarResult(toolCallId, `${market}:${params.startDate ?? 'default'}`, { market: market.toUpperCase(), holidays: holidays ?? [], count: holidays?.length ?? 0 }, evidenceCapability, auditCapability);
  } });
  pi.registerTool({ name: 'get_next_trading_day', label: 'Next Trading Day', description: 'Find the next trading day after a date.', parameters: nextTradingDayParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'get_next_trading_day request aborted' }], isError: true };
    const market = params.market ?? 'us';
    const targetTradingDay = nextCalendarTradingDay(params.fromDate, market, params.skipDays ?? 1);
    return calendarResult(toolCallId, `${market}:${params.fromDate}`, { fromDate: params.fromDate, market: market.toUpperCase(), skipDays: params.skipDays ?? 1, targetTradingDay }, evidenceCapability, auditCapability);
  } });
  pi.registerTool({ name: 'get_trading_days', label: 'Trading Days', description: 'List trading days in an inclusive date range.', parameters: tradingDaysParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'get_trading_days request aborted' }], isError: true };
    const market = params.market ?? 'us';
    const tradingDays = calendarTradingDays(params.startDate, params.endDate, market);
    return calendarResult(toolCallId, `${market}:${params.startDate}:${params.endDate}`, { startDate: params.startDate, endDate: params.endDate, market: market.toUpperCase(), tradingDays: tradingDays ?? [], totalDays: tradingDays?.length ?? 0 }, evidenceCapability, auditCapability);
  } });
}
