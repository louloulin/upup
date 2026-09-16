import type { MarketBar, MarketEvidence } from './market-types';
import { executeWithProviderRetry, type ProviderRetryPolicy } from '@upup/pi-observability';
import { EASTMONEY_KLINE_URL, EASTMONEY_USER_AGENT, eastmoneyKlineUrl, eastmoneySecid, parseEastmoneyKlines } from './eastmoney';

export type MarketHistoryFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type MarketHistoryProvider = 'auto' | 'yahoo' | 'tushare' | 'financial-datasets' | 'eastmoney';
type MarketHistoryMarket = 'cn' | 'hk' | 'us' | 'fund' | 'crypto';

export interface NativeMarketHistoryClientOptions {
  readonly fetcher?: MarketHistoryFetcher;
  readonly marketFetchers?: Partial<Record<'cn' | 'hk' | 'us' | 'fund' | 'crypto', MarketHistoryFetcher>>;
  readonly baseUrl?: string;
  readonly marketBaseUrls?: Partial<Record<'cn' | 'hk' | 'us' | 'fund' | 'crypto', string>>;
  readonly provider?: MarketHistoryProvider;
  readonly marketProviders?: Partial<Record<'cn' | 'hk' | 'us' | 'fund' | 'crypto', MarketHistoryProvider>>;
  readonly tushareToken?: string;
  readonly marketApiKeys?: Partial<Record<'cn' | 'hk' | 'us' | 'fund' | 'crypto', string>>;
  readonly now?: () => string;
  readonly maxBars?: number;
  readonly cache?: MarketHistoryCache;
  readonly rateLimiter?: MarketHistoryRateLimiter;
  readonly retry?: Omit<ProviderRetryPolicy, 'provider' | 'operation'>;
}

/**
 * Eastmoney throttles bursts by resetting the socket instead of answering 429,
 * so its retries back off further than the default policy.
 */
const EASTMONEY_RETRY: Omit<ProviderRetryPolicy, 'provider' | 'operation'> = {
  maxAttempts: 3,
  baseDelayMs: 600,
  maxDelayMs: 5_000,
};

const DEFAULT_PROVIDER_RETRY: Omit<ProviderRetryPolicy, 'provider' | 'operation'> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2_000,
};

export interface MarketHistoryCache {
  get(key: string, now: number): NativeMarketHistoryResult | undefined;
  set(key: string, value: NativeMarketHistoryResult, expiresAt: number): void;
}

export interface MarketHistoryRateLimiter {
  acquire(key: string, now: number): Promise<void>;
}

export interface NativeMarketHistoryResult {
  readonly value: readonly MarketBar[];
  readonly evidence: MarketEvidence;
}

export class InMemoryMarketHistoryCache implements MarketHistoryCache {
  private readonly entries = new Map<string, { value: NativeMarketHistoryResult; expiresAt: number }>();
  get(key: string, now: number): NativeMarketHistoryResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) { this.entries.delete(key); return undefined; }
    return entry.value;
  }
  set(key: string, value: NativeMarketHistoryResult, expiresAt: number): void { this.entries.set(key, { value, expiresAt }); }
}

export class FixedWindowMarketHistoryRateLimiter implements MarketHistoryRateLimiter {
  private windowStartedAt = 0;
  private requestCount = 0;
  constructor(private readonly maxRequests: number, private readonly windowMs: number) {
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error('maxRequests must be a positive integer');
    if (!Number.isInteger(windowMs) || windowMs < 1) throw new Error('windowMs must be a positive integer');
  }
  async acquire(_key: string, now: number): Promise<void> {
    if (this.windowStartedAt === 0 || now - this.windowStartedAt >= this.windowMs) { this.windowStartedAt = now; this.requestCount = 0; }
    if (this.requestCount >= this.maxRequests) throw new Error('market history provider rate limit exceeded');
    this.requestCount += 1;
  }
}

interface YahooChartPayload {
  readonly chart?: {
    readonly result?: readonly ({
      readonly timestamp?: readonly number[];
      readonly indicators?: {
        readonly quote?: readonly [{
          readonly open?: readonly (number | null)[];
          readonly high?: readonly (number | null)[];
          readonly low?: readonly (number | null)[];
          readonly close?: readonly (number | null)[];
          readonly volume?: readonly (number | null)[];
        }];
        readonly adjclose?: readonly [{ readonly adjclose?: readonly (number | null)[] }];
      };
    } | null)[];
    readonly error?: { readonly description?: string } | null;
  };
}

interface TusharePayload {
  readonly code?: number;
  readonly msg?: string;
  readonly data?: { readonly fields?: readonly string[]; readonly items?: readonly (readonly unknown[])[] } | null;
}

interface FinancialDatasetsPayload {
  readonly data?: unknown;
  readonly historical_prices?: unknown;
}

function assertIsoDate(value: string, name: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be an ISO date (YYYY-MM-DD)`);
  }
}

function yahooSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('symbol must not be empty');
  if (/^\d{6}\.SH$/.test(normalized)) return normalized.replace('.SH', '.SS');
  if (/^\d{6}\.(SZ|BJ)$/.test(normalized)) return normalized;
  if (/^\d{1,5}\.HK$/.test(normalized)) {
    const [code] = normalized.split('.');
    return `${code.padStart(4, '0')}.HK`;
  }
  if (/^6\d{5}$/.test(normalized)) return `${normalized}.SS`;
  if (/^[03]\d{5}$/.test(normalized)) return `${normalized}.SZ`;
  if (/^[A-Z0-9]+\.US$/.test(normalized)) return normalized.slice(0, -3);
  if (/^[A-Z0-9]+$/.test(normalized) && normalized.length <= 8 && normalized !== 'USD') return normalized;
  if (/^[A-Z0-9]+(?:-USD)?$/.test(normalized) && normalized.endsWith('-USD')) return normalized;
  throw new Error(`unsupported market symbol: ${symbol}`);
}

function tushareSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(normalized)) return normalized;
  if (/^6\d{5}$/.test(normalized)) return `${normalized}.SH`;
  if (/^[03]\d{5}$/.test(normalized)) return `${normalized}.SZ`;
  if (/^8\d{5}$/.test(normalized)) return `${normalized}.BJ`;
  throw new Error(`Tushare requires an A-share symbol with exchange suffix: ${symbol}`);
}

function tushareHongKongSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (/^\d{1,5}\.HK$/.test(normalized)) return normalized;
  if (/^\d{1,5}$/.test(normalized)) return `${normalized}.HK`;
  throw new Error(`unsupported Hong Kong market symbol: ${symbol}`);
}

function yyyymmdd(value: string): string { return value.replaceAll('-', ''); }

function dateFromUnixSeconds(value: number): string {
  return new Date(value * 1000).toISOString().slice(0, 10);
}

function nextDay(value: string): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export class NativeMarketHistoryClient {
  private readonly fetcher: MarketHistoryFetcher;
  private readonly marketFetchers: NativeMarketHistoryClientOptions['marketFetchers'];
  private readonly baseUrl: string;
  private readonly marketBaseUrls: NativeMarketHistoryClientOptions['marketBaseUrls'];
  private readonly provider: MarketHistoryProvider;
  private readonly marketProviders: NativeMarketHistoryClientOptions['marketProviders'];
  private readonly tushareToken: string;
  private readonly marketApiKeys: NativeMarketHistoryClientOptions['marketApiKeys'];
  private readonly now: () => string;
  private readonly maxBars: number;
  private readonly cache?: MarketHistoryCache;
  private readonly rateLimiter?: MarketHistoryRateLimiter;
  private readonly cacheTtlMs: number;
  private readonly retry?: NativeMarketHistoryClientOptions['retry'];

  constructor(options: NativeMarketHistoryClientOptions = {}) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.marketFetchers = options.marketFetchers ?? {};
    this.baseUrl = (options.baseUrl ?? 'https://query1.finance.yahoo.com/v8/finance/chart').replace(/\/$/, '');
    this.marketBaseUrls = options.marketBaseUrls ?? {};
    this.provider = options.provider ?? 'auto';
    this.marketProviders = options.marketProviders ?? {};
    this.tushareToken = options.tushareToken ?? process.env.TUSHARE_TOKEN ?? '';
    this.marketApiKeys = options.marketApiKeys ?? {};
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxBars = options.maxBars ?? 5_000;
    this.cache = options.cache;
    this.rateLimiter = options.rateLimiter;
    this.cacheTtlMs = 60_000;
    this.retry = options.retry ?? DEFAULT_PROVIDER_RETRY;
    if (!Number.isInteger(this.maxBars) || this.maxBars < 2 || this.maxBars > 20_000) throw new Error('maxBars must be an integer between 2 and 20000');
  }

  async getHistory(symbol: string, startDate: string, endDate: string, signal?: AbortSignal, auditId = 'market-history', requestedMarket?: string): Promise<NativeMarketHistoryResult> {
    assertIsoDate(startDate, 'startDate');
    assertIsoDate(endDate, 'endDate');
    if (startDate > endDate) throw new Error('startDate must not be after endDate');
    if (signal?.aborted) throw new Error('market history request aborted');
    const normalizedMarket = requestedMarket?.trim().toLowerCase();
    if (normalizedMarket !== undefined && !['cn', 'hk', 'us', 'fund', 'crypto'].includes(normalizedMarket)) throw new Error(`unsupported market: ${requestedMarket}`);
    const isChinaMarket = normalizedMarket === 'cn' || (normalizedMarket === undefined && /^(?:\d{6}(?:\.(?:SH|SZ|BJ))?|[0368]\d{5})$/i.test(symbol.trim()));
    const marketKey = (normalizedMarket ?? (isChinaMarket ? 'cn' : undefined)) as MarketHistoryMarket | undefined;
    const configuredProvider = marketKey ? this.marketProviders?.[marketKey] : undefined;
    const marketToken = marketKey ? this.marketApiKeys?.[marketKey] ?? this.tushareToken : this.tushareToken;
    // Auto routing: CN/HK go to Tushare when a token exists and to the real
    // Eastmoney provider otherwise (no credentials, live daily bars); US stays
    // on financial-datasets/yahoo.
    const selectedProvider = configuredProvider ?? (this.provider === 'auto' && (isChinaMarket || marketKey === 'hk')
      ? marketToken ? 'tushare' : 'eastmoney'
      : this.provider === 'auto' && marketKey === 'us' && marketToken ? 'financial-datasets' : this.provider === 'auto' ? 'yahoo' : this.provider);
    if (selectedProvider === 'tushare' && normalizedMarket !== undefined && normalizedMarket !== 'cn' && normalizedMarket !== 'hk') throw new Error(`Tushare history requires market=cn or market=hk, received ${normalizedMarket}`);
    if (selectedProvider === 'tushare' && !marketToken) throw new Error(`Tushare history requires a token for market=${marketKey ?? 'cn'}`);
    if (selectedProvider === 'eastmoney' && normalizedMarket !== undefined && normalizedMarket !== 'cn' && normalizedMarket !== 'hk') throw new Error(`Eastmoney history requires market=cn or market=hk, received ${normalizedMarket}`);
    if (selectedProvider === 'financial-datasets' && !marketToken) throw new Error('Financial Datasets history requires FINANCIAL_DATASETS_API_KEY');
    const requestFetcher = marketKey ? this.marketFetchers?.[marketKey] ?? this.fetcher : this.fetcher;
    const requestBaseUrl = selectedProvider === 'tushare'
      ? (marketKey ? this.marketBaseUrls?.[marketKey] : undefined) ?? 'https://api.tushare.pro'
      : selectedProvider === 'eastmoney'
        ? (marketKey ? this.marketBaseUrls?.[marketKey] : undefined) ?? EASTMONEY_KLINE_URL
        : (marketKey ? this.marketBaseUrls?.[marketKey] : undefined) ?? this.baseUrl;
    const cacheKey = `${selectedProvider}:${normalizedMarket ?? 'inferred'}:${symbol}:${startDate}:${endDate}`;
    const now = Date.now();
    const cached = this.cache?.get(cacheKey, now);
    if (cached) return { value: cached.value, evidence: { ...cached.evidence, auditId, query: cached.evidence.query, source: `${cached.evidence.source}#cache`, dataFreshness: 'cached' } };
    await this.rateLimiter?.acquire(selectedProvider, now);
    if (selectedProvider === 'tushare') return this.getTushareHistory(symbol, startDate, endDate, signal, auditId, cacheKey, marketKey === 'hk' ? 'hk' : 'cn', marketToken, requestFetcher, requestBaseUrl);
    if (selectedProvider === 'financial-datasets') return this.getFinancialDatasetsHistory(symbol, startDate, endDate, signal, auditId, cacheKey, marketToken, requestFetcher, requestBaseUrl);
    if (selectedProvider === 'eastmoney') return this.getEastmoneyHistory(symbol, startDate, endDate, signal, auditId, cacheKey, marketKey === 'hk' || /\.HK$/i.test(symbol.trim()) ? 'hk' : 'cn', requestFetcher, requestBaseUrl);
    const resolvedSymbol = yahooSymbol(symbol);
    const url = new URL(`${requestBaseUrl}/${encodeURIComponent(resolvedSymbol)}`);
    url.searchParams.set('period1', String(Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000)));
    url.searchParams.set('period2', String(Math.floor(Date.parse(`${nextDay(endDate)}T00:00:00Z`) / 1000)));
    url.searchParams.set('interval', '1d');
    url.searchParams.set('events', 'history');
    url.searchParams.set('includeAdjustedClose', 'true');
    const response = await this.fetchWithRetry(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' },
    }, 'yahoo', 'history', signal, requestFetcher);
    if (!response.ok) throw new Error(`market history request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as YahooChartPayload;
    const chart = payload.chart?.result?.[0];
    if (!chart) throw new Error(payload.chart?.error?.description ?? `market history returned no chart for ${resolvedSymbol}`);
    const timestamps = chart.timestamp ?? [];
    const quote = chart.indicators?.quote?.[0];
    const adjusted = chart.indicators?.adjclose?.[0]?.adjclose;
    if (!quote) throw new Error(`market history returned no quote series for ${resolvedSymbol}`);
    const bars: MarketBar[] = [];
    for (let index = 0; index < timestamps.length && bars.length < this.maxBars; index += 1) {
      const date = dateFromUnixSeconds(timestamps[index]!);
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = adjusted?.[index] ?? quote.close?.[index];
      const volume = quote.volume?.[index] ?? 0;
      if (date < startDate || date > endDate || !finite(open) || !finite(high) || !finite(low) || !finite(close) || !finite(volume)) continue;
      bars.push({ date, open, high, low, close, volume });
    }
    if (bars.length < 2) throw new Error(`market history returned fewer than two complete bars for ${resolvedSymbol}`);
    const retrievedAt = this.now();
    const result: NativeMarketHistoryResult = {
      value: bars,
      evidence: {
        id: `market-data:${auditId}:history`,
        source: requestBaseUrl,
        provider: 'yahoo',
        retrievedAt,
        asOf: bars.at(-1)!.date,
        query: `${resolvedSymbol}:${normalizedMarket ?? 'inferred'}:${startDate}:${endDate}`,
        dataFreshness: 'historical' as const,
        auditId,
      },
    };
    this.cache?.set(cacheKey, result, now + this.cacheTtlMs);
    return result;
  }

  /**
   * Live daily bars from `push2his.eastmoney.com` (forward-adjusted, `fqt=1`),
   * the real replacement for the previous synthetic fallback.
   */
  private async getEastmoneyHistory(symbol: string, startDate: string, endDate: string, signal: AbortSignal | undefined, auditId: string, cacheKey: string, market: 'cn' | 'hk', requestFetcher: MarketHistoryFetcher, requestBaseUrl: string): Promise<NativeMarketHistoryResult> {
    const resolvedSymbol = eastmoneySecid(symbol);
    const url = eastmoneyKlineUrl(resolvedSymbol, startDate, endDate, requestBaseUrl);
    const response = await this.fetchWithRetry(url, { signal, headers: { Accept: 'application/json', 'User-Agent': EASTMONEY_USER_AGENT } }, 'eastmoney', 'history', signal, requestFetcher, EASTMONEY_RETRY);
    if (!response.ok) throw new Error(`Eastmoney market history request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as unknown;
    const bars = parseEastmoneyKlines(payload, symbol, startDate, endDate, market).slice(-this.maxBars);
    if (bars.length < 2) throw new Error(`Eastmoney returned fewer than two complete bars for ${symbol}`);
    const retrievedAt = this.now();
    const result: NativeMarketHistoryResult = {
      value: bars,
      evidence: {
        id: `market-data:${auditId}:history`,
        source: requestBaseUrl,
        provider: 'eastmoney',
        retrievedAt,
        asOf: bars.at(-1)!.date,
        query: `${symbol}:${market}:${startDate}:${endDate}`,
        dataFreshness: 'historical',
        auditId,
      },
    };
    this.cache?.set(cacheKey, result, Date.now() + this.cacheTtlMs);
    return result;
  }

  private async getTushareHistory(symbol: string, startDate: string, endDate: string, signal: AbortSignal | undefined, auditId: string, cacheKey: string, market: 'cn' | 'hk', token: string, requestFetcher: MarketHistoryFetcher, requestBaseUrl: string): Promise<NativeMarketHistoryResult> {
    const resolvedSymbol = market === 'hk' ? tushareHongKongSymbol(symbol) : tushareSymbol(symbol);
    const endpoint = market === 'hk' ? 'hk_daily' : 'daily';
    const response = await this.fetchWithRetry(requestBaseUrl, {
      method: 'POST',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' },
      body: JSON.stringify({ api_name: endpoint, token, params: { ts_code: resolvedSymbol, start_date: yyyymmdd(startDate), end_date: yyyymmdd(endDate) }, fields: 'ts_code,trade_date,open,high,low,close,vol' }),
    }, 'tushare', 'history', signal, requestFetcher);
    if (!response.ok) throw new Error(`Tushare market history request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as TusharePayload;
    if (payload.code !== 0) throw new Error(`Tushare market history request failed: ${payload.msg ?? `code ${payload.code ?? 'unknown'}`}`);
    const fields = payload.data?.fields ?? [];
    const fieldIndex = new Map(fields.map((field, index) => [field, index]));
    const bars = (payload.data?.items ?? []).map((item) => {
      const value = (name: string): number | undefined => {
        const index = fieldIndex.get(name);
        const parsed = index === undefined ? Number.NaN : Number(item[index]);
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      const rawDate = String(item[fieldIndex.get('trade_date') ?? -1] ?? '');
      const date = rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}` : rawDate;
      const open = value('open'); const high = value('high'); const low = value('low'); const close = value('close'); const volume = value('vol') ?? 0;
      return date >= startDate && date <= endDate && open !== undefined && high !== undefined && low !== undefined && close !== undefined ? { date, open, high, low, close, volume } : undefined;
    }).filter((bar): bar is MarketBar => Boolean(bar)).sort((left, right) => left.date.localeCompare(right.date)).slice(-this.maxBars);
    if (bars.length < 2) throw new Error(`Tushare returned fewer than two complete bars for ${resolvedSymbol}`);
    const retrievedAt = this.now();
    const result: NativeMarketHistoryResult = {
      value: bars,
      evidence: {
        id: `market-data:${auditId}:history`, source: requestBaseUrl, provider: 'tushare', retrievedAt, asOf: bars.at(-1)!.date,
        query: `${resolvedSymbol}:${market}:${startDate}:${endDate}`, dataFreshness: 'historical', auditId,
      },
    };
    this.cache?.set(cacheKey, result, Date.now() + this.cacheTtlMs);
    return result;
  }

  private async getFinancialDatasetsHistory(symbol: string, startDate: string, endDate: string, signal: AbortSignal | undefined, auditId: string, cacheKey: string, apiKey: string, requestFetcher: MarketHistoryFetcher, requestBaseUrl: string): Promise<NativeMarketHistoryResult> {
    const ticker = symbol.trim().toUpperCase().replace(/\.US$/, '');
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error(`unsupported US market symbol: ${symbol}`);
    const url = new URL(`${requestBaseUrl.replace(/\/$/, '')}/prices/historical/`);
    url.searchParams.set('ticker', ticker);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);
    const response = await this.fetchWithRetry(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0', 'x-api-key': apiKey },
    }, 'financial-datasets', 'history', signal, requestFetcher);
    const payload = await response.json() as FinancialDatasetsPayload;
    const rows = Array.isArray(payload.historical_prices) ? payload.historical_prices : Array.isArray(payload.data) ? payload.data : [];
    const toNumber = (value: unknown): number | undefined => {
      const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
      return Number.isFinite(number) ? number : undefined;
    };
    const toDate = (value: unknown): string | undefined => {
      if (typeof value === 'string') return value.slice(0, 10);
      if (typeof value === 'number' && Number.isFinite(value)) return dateFromUnixSeconds(value > 10_000_000_000 ? value / 1000 : value);
      return undefined;
    };
    const bars = rows.map((row): MarketBar | undefined => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined;
      const record = row as Record<string, unknown>;
      const date = toDate(record.date ?? record.timestamp ?? record.datetime);
      const open = toNumber(record.open);
      const high = toNumber(record.high);
      const low = toNumber(record.low);
      const close = toNumber(record.close ?? record.adj_close ?? record.adjusted_close);
      const volume = toNumber(record.volume) ?? 0;
      if (!date || date < startDate || date > endDate || open === undefined || high === undefined || low === undefined || close === undefined) return undefined;
      return { date, open, high, low, close, volume };
    }).filter((bar): bar is MarketBar => Boolean(bar)).sort((left, right) => left.date.localeCompare(right.date)).slice(-this.maxBars);
    if (bars.length < 2) throw new Error(`Financial Datasets returned fewer than two complete bars for ${ticker}`);
    const retrievedAt = this.now();
    const result: NativeMarketHistoryResult = {
      value: bars,
      evidence: {
        id: `market-data:${auditId}:history`, source: url.toString(), provider: 'financial-datasets', retrievedAt, asOf: bars.at(-1)!.date,
        query: `${ticker}:us:${startDate}:${endDate}`, dataFreshness: 'historical', auditId,
      },
    };
    this.cache?.set(cacheKey, result, Date.now() + this.cacheTtlMs);
    return result;
  }

  private async fetchWithRetry(input: RequestInfo | URL, init: RequestInit, provider: MarketHistoryProvider, operation: string, signal?: AbortSignal, requestFetcher: MarketHistoryFetcher = this.fetcher, retryOverride?: Omit<ProviderRetryPolicy, 'provider' | 'operation'>): Promise<Response> {
    const execute = async (retrySignal?: AbortSignal) => {
      const response = await requestFetcher(input, { ...init, ...(retrySignal ? { signal: retrySignal } : {}) });
      if (!response.ok) throw new Error(`${provider} market ${operation} request failed: ${response.status} ${response.statusText}`);
      return response;
    };
    const policy = retryOverride ?? this.retry;
    if (!policy) return execute(signal);
    return (await executeWithProviderRetry((_, retrySignal) => execute(retrySignal), {
      provider,
      operation,
      signal,
      ...policy,
    })).value;
  }
}

export async function getNativeMarketHistoryForRange(
  symbol: string,
  startDate: string,
  endDate: string,
  options: NativeMarketHistoryClientOptions & { readonly signal?: AbortSignal; readonly auditId?: string } = {},
): Promise<NativeMarketHistoryResult> {
  return new NativeMarketHistoryClient(options).getHistory(symbol, startDate, endDate, options.signal, options.auditId);
}
