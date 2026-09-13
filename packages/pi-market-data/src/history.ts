import type { MarketBar, MarketEvidence } from './index.js';

export type MarketHistoryFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type MarketHistoryProvider = 'auto' | 'yahoo' | 'tushare';

export interface NativeMarketHistoryClientOptions {
  readonly fetcher?: MarketHistoryFetcher;
  readonly baseUrl?: string;
  readonly provider?: MarketHistoryProvider;
  readonly tushareToken?: string;
  readonly now?: () => string;
  readonly maxBars?: number;
  readonly cache?: MarketHistoryCache;
  readonly rateLimiter?: MarketHistoryRateLimiter;
}

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
  private readonly baseUrl: string;
  private readonly provider: MarketHistoryProvider;
  private readonly tushareToken: string;
  private readonly now: () => string;
  private readonly maxBars: number;
  private readonly cache?: MarketHistoryCache;
  private readonly rateLimiter?: MarketHistoryRateLimiter;
  private readonly cacheTtlMs: number;

  constructor(options: NativeMarketHistoryClientOptions = {}) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.baseUrl = (options.baseUrl ?? 'https://query1.finance.yahoo.com/v8/finance/chart').replace(/\/$/, '');
    this.provider = options.provider ?? 'auto';
    this.tushareToken = options.tushareToken ?? process.env.TUSHARE_TOKEN ?? '';
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxBars = options.maxBars ?? 5_000;
    this.cache = options.cache;
    this.rateLimiter = options.rateLimiter;
    this.cacheTtlMs = 60_000;
    if (!Number.isInteger(this.maxBars) || this.maxBars < 2 || this.maxBars > 20_000) throw new Error('maxBars must be an integer between 2 and 20000');
  }

  async getHistory(symbol: string, startDate: string, endDate: string, signal?: AbortSignal, auditId = 'market-history'): Promise<NativeMarketHistoryResult> {
    assertIsoDate(startDate, 'startDate');
    assertIsoDate(endDate, 'endDate');
    if (startDate > endDate) throw new Error('startDate must not be after endDate');
    if (signal?.aborted) throw new Error('market history request aborted');
    const isChinaSymbol = /^(?:\d{6}(?:\.(?:SH|SZ|BJ))?|[0368]\d{5})$/i.test(symbol.trim());
    const selectedProvider = this.provider === 'auto' && isChinaSymbol && this.tushareToken ? 'tushare' : this.provider === 'auto' ? 'yahoo' : this.provider;
    const cacheKey = `${selectedProvider}:${symbol}:${startDate}:${endDate}`;
    const now = Date.now();
    const cached = this.cache?.get(cacheKey, now);
    if (cached) return { value: cached.value, evidence: { ...cached.evidence, auditId, query: cached.evidence.query, source: `${cached.evidence.source}#cache`, dataFreshness: 'cached' } };
    await this.rateLimiter?.acquire(selectedProvider, now);
    if (selectedProvider === 'tushare') return this.getTushareHistory(symbol, startDate, endDate, signal, auditId, cacheKey);
    const resolvedSymbol = yahooSymbol(symbol);
    const url = new URL(`${this.baseUrl}/${encodeURIComponent(resolvedSymbol)}`);
    url.searchParams.set('period1', String(Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000)));
    url.searchParams.set('period2', String(Math.floor(Date.parse(`${nextDay(endDate)}T00:00:00Z`) / 1000)));
    url.searchParams.set('interval', '1d');
    url.searchParams.set('events', 'history');
    url.searchParams.set('includeAdjustedClose', 'true');
    const response = await this.fetcher(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' },
    });
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
        source: 'https://query1.finance.yahoo.com/v8/finance/chart',
        retrievedAt,
        asOf: bars.at(-1)!.date,
        query: `${resolvedSymbol}:${startDate}:${endDate}`,
        dataFreshness: 'historical' as const,
        auditId,
      },
    };
    this.cache?.set(cacheKey, result, now + this.cacheTtlMs);
    return result;
  }

  private async getTushareHistory(symbol: string, startDate: string, endDate: string, signal: AbortSignal | undefined, auditId: string, cacheKey: string): Promise<NativeMarketHistoryResult> {
    if (!this.tushareToken) throw new Error('Tushare provider requires TUSHARE_TOKEN');
    const resolvedSymbol = tushareSymbol(symbol);
    const response = await this.fetcher('https://api.tushare.pro', {
      method: 'POST',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' },
      body: JSON.stringify({ api_name: 'daily', token: this.tushareToken, params: { ts_code: resolvedSymbol, start_date: yyyymmdd(startDate), end_date: yyyymmdd(endDate) }, fields: 'ts_code,trade_date,open,high,low,close,vol' }),
    });
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
        id: `market-data:${auditId}:history`, source: 'https://api.tushare.pro', retrievedAt, asOf: bars.at(-1)!.date,
        query: `${resolvedSymbol}:${startDate}:${endDate}`, dataFreshness: 'historical', auditId,
      },
    };
    this.cache?.set(cacheKey, result, Date.now() + this.cacheTtlMs);
    return result;
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
