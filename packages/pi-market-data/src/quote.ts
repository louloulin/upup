import { FixedWindowMarketHistoryRateLimiter, type MarketHistoryFetcher, type MarketHistoryProvider, type MarketHistoryRateLimiter } from './history';
import { currencyForMarket, normalizeMarket } from './market-utils';
import type { Market, MarketEvidence, MarketQuote } from './market-types';
import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { executeWithProviderRetry, type ProviderRetryPolicy } from '@upup/pi-observability';
import { EASTMONEY_QUOTE_URL, EASTMONEY_USER_AGENT, eastmoneyGateFor, eastmoneyQuoteUrl, eastmoneySecid, parseEastmoneyQuote } from './eastmoney';
import type { PiMarketTrendStore } from '@upup/types';

export interface NativeMarketQuote extends MarketQuote {
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
  readonly indicative: boolean;
}

export interface NativeMarketQuoteResult {
  readonly value: NativeMarketQuote;
  readonly evidence: MarketEvidence;
}

export interface NativeMarketQuoteMetrics {
  readonly requests: number;
  readonly cacheHits: number;
  readonly successes: number;
  readonly failures: number;
  readonly rateLimitFailures: number;
  readonly lastProvider?: 'yahoo' | 'tushare' | 'eastmoney';
  readonly lastLatencyMs?: number;
  readonly lastOutcome?: 'success' | 'failure' | 'cache';
  readonly lastErrorClass?: 'credentials' | 'rate_limit' | 'forbidden' | 'server_error' | 'invalid_response' | 'unsupported_symbol' | 'aborted' | 'unknown';
  readonly lastCheckedAt?: string;
  readonly successRatePct: number;
  readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  readonly recentSamples: readonly NativeMarketQuoteSample[];
  readonly trend: readonly NativeMarketQuoteTrendBucket[];
}

export interface NativeMarketQuoteSample {
  readonly provider: 'yahoo' | 'tushare' | 'eastmoney';
  readonly latencyMs: number;
  readonly outcome: 'success' | 'failure' | 'cache';
  readonly errorClass?: NonNullable<NativeMarketQuoteMetrics['lastErrorClass']>;
  readonly checkedAt: string;
}

export interface NativeMarketQuoteTrendBucket {
  readonly startAt: string;
  readonly requests: number;
  readonly cacheHits: number;
  readonly successes: number;
  readonly failures: number;
  readonly successRatePct: number;
  readonly avgLatencyMs?: number;
  readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface NativeMarketQuoteTrendStore extends PiMarketTrendStore {}

interface PersistedTrendFile {
  readonly schema: 1;
  readonly buckets: readonly NativeMarketQuoteTrendBucket[];
}

function validTrendBucket(value: unknown): value is NativeMarketQuoteTrendBucket {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Partial<NativeMarketQuoteTrendBucket>;
  return typeof bucket.startAt === 'string'
    && Number.isFinite(bucket.requests) && Number.isFinite(bucket.cacheHits)
    && Number.isFinite(bucket.successes) && Number.isFinite(bucket.failures)
    && Number.isFinite(bucket.successRatePct)
    && (bucket.avgLatencyMs === undefined || Number.isFinite(bucket.avgLatencyMs))
    && (bucket.sloStatus === 'healthy' || bucket.sloStatus === 'degraded' || bucket.sloStatus === 'unhealthy' || bucket.sloStatus === 'unknown');
}

export class JsonFileMarketQuoteTrendStore implements NativeMarketQuoteTrendStore {
  constructor(private readonly path: string) {}

  load(): readonly NativeMarketQuoteTrendBucket[] {
    if (!existsSync(this.path)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || (parsed as { schema?: unknown }).schema !== 1) return [];
      const buckets = (parsed as { buckets?: unknown }).buckets;
      return Array.isArray(buckets) ? buckets.filter(validTrendBucket).slice(-24) : [];
    } catch {
      return [];
    }
  }

  save(buckets: readonly NativeMarketQuoteTrendBucket[]): void {
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true });
    const temporary = `${this.path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
    writeFileSync(temporary, JSON.stringify({ schema: 1, buckets: buckets.slice(-24) } satisfies PersistedTrendFile));
    renameSync(temporary, this.path);
  }
}

export interface MarketQuoteCache {
  get(key: string, now: number): NativeMarketQuoteResult | undefined;
  set(key: string, value: NativeMarketQuoteResult, expiresAt: number): void;
}

export class InMemoryMarketQuoteCache implements MarketQuoteCache {
  private readonly entries = new Map<string, { value: NativeMarketQuoteResult; expiresAt: number }>();
  get(key: string, now: number): NativeMarketQuoteResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) { this.entries.delete(key); return undefined; }
    return entry.value;
  }
  set(key: string, value: NativeMarketQuoteResult, expiresAt: number): void { this.entries.set(key, { value, expiresAt }); }
}

export interface NativeMarketQuoteClientOptions {
  readonly fetcher?: MarketHistoryFetcher;
  readonly provider?: MarketHistoryProvider;
  readonly tushareToken?: string;
  /** Eastmoney CN/HK quote endpoint; override to point at a mirror or a test double. */
  readonly baseUrl?: string;
  readonly now?: () => string;
  readonly cache?: MarketQuoteCache;
  readonly rateLimiter?: MarketHistoryRateLimiter;
  readonly trendStore?: NativeMarketQuoteTrendStore;
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

interface YahooQuotePayload {
  readonly chart?: {
    readonly result?: readonly ({
      readonly meta?: ({
        readonly symbol?: string;
        readonly currency?: string;
        readonly regularMarketPrice?: number;
        readonly regularMarketTime?: number;
        readonly chartPreviousClose?: number;
      } | null);
    } | null)[];
    readonly error?: { readonly description?: string } | null;
  };
}

interface TusharePayload {
  readonly code?: number;
  readonly msg?: string;
  readonly data?: { readonly fields?: readonly string[]; readonly items?: readonly (readonly unknown[])[] } | null;
}

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

function classifyQuoteError(error: unknown): NonNullable<NativeMarketQuoteMetrics['lastErrorClass']> {
  const message = error instanceof Error ? error.message : String(error);
  if (/TUSHARE_TOKEN|requires Tushare provider/i.test(message)) return 'credentials';
  if (/rate limit/i.test(message)) return 'rate_limit';
  if (/\b403\b|forbidden/i.test(message)) return 'forbidden';
  if (/\b5\d\d\b|server error/i.test(message)) return 'server_error';
  if (/unsupported market symbol|requires an A-share symbol/i.test(message)) return 'unsupported_symbol';
  if (/aborted|abort/i.test(message)) return 'aborted';
  if (/no price|no valid quote|returned no|invalid/i.test(message)) return 'invalid_response';
  return 'unknown';
}

function isChinaSymbol(symbol: string): boolean {
  // CN A-share (6 digits + optional .SH/.SZ/.BJ) OR HK ticker (5 digits, often
  // explicitly suffixed .HK). Yahoo Finance never covers these, so we route
  // them all through Tushare Pro.
  const s = symbol.trim().toUpperCase();
  return /^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(s) || /^[0368]\d{4}\.?HK$/.test(s);
}

function yahooSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
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
  throw new Error(`unsupported market symbol: ${symbol}`);
}

function tushareSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(normalized)) return normalized;
  if (/^6\d{5}$/.test(normalized)) return `${normalized}.SH`;
  if (/^[03]\d{5}$/.test(normalized)) return `${normalized}.SZ`;
  if (/^8\d{5}$/.test(normalized)) return `${normalized}.BJ`;
  // Tushare Pro HK daily series uses the .HK suffix directly (separate API
  // family — requires explicit Pro permission for HK endpoints).
  if (/^[0368]\d{4}\.HK$/.test(normalized)) return normalized;
  if (/^[0368]\d{5}$/.test(normalized)) return `${normalized}.HK`;
  throw new Error(`Tushare requires an A-share or Hong Kong symbol with exchange suffix: ${symbol}`);
}

function dateFromUnixSeconds(value: number, fallback: string): string { return finite(value) ? new Date(value * 1000).toISOString().slice(0, 10) : fallback; }

function quoteMarket(symbol: string, requested?: string): Market {
  if (requested) return normalizeMarket(requested);
  if (isChinaSymbol(symbol)) return 'cn';
  if (/\.HK$/i.test(symbol)) return 'hk';
  return 'us';
}

function result(value: NativeMarketQuote, source: string, query: string, retrievedAt: string, auditId: string, provider?: 'yahoo' | 'tushare' | 'eastmoney'): NativeMarketQuoteResult {
  return {
    value,
    evidence: {
      id: `market-data:${auditId}:quote`,
      source,
      ...(provider ? { provider } : {}),
      retrievedAt,
      asOf: value.asOf,
      query,
      dataFreshness: value.freshness,
      auditId,
    },
  };
}

export class NativeMarketQuoteClient {
  private readonly fetcher: MarketHistoryFetcher;
  private readonly provider: MarketHistoryProvider;
  private readonly tushareToken: string;
  private readonly eastmoneyBaseUrl: string;
  private readonly now: () => string;
  private readonly cache?: MarketQuoteCache;
  private readonly rateLimiter?: MarketHistoryRateLimiter;
  private readonly cacheTtlMs = 15_000;
  private requests = 0;
  private cacheHits = 0;
  private successes = 0;
  private failures = 0;
  private rateLimitFailures = 0;
  private lastProvider: 'yahoo' | 'tushare' | 'eastmoney' | undefined;
  private lastLatencyMs: number | undefined;
  private lastOutcome: NativeMarketQuoteMetrics['lastOutcome'];
  private lastErrorClass: NativeMarketQuoteMetrics['lastErrorClass'];
  private lastCheckedAt: string | undefined;
  private readonly recentSamples: NativeMarketQuoteSample[] = [];
  private readonly trendBuckets = new Map<string, { requests: number; cacheHits: number; successes: number; failures: number; latencyTotalMs: number; sampleCount: number }>();
  private readonly trendStore?: NativeMarketQuoteTrendStore;
  private readonly retry?: NativeMarketQuoteClientOptions['retry'];

  constructor(options: NativeMarketQuoteClientOptions = {}) {
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.provider = options.provider ?? 'auto';
    this.tushareToken = options.tushareToken ?? process.env.TUSHARE_TOKEN ?? '';
    this.eastmoneyBaseUrl = options.baseUrl ?? EASTMONEY_QUOTE_URL;
    this.now = options.now ?? (() => new Date().toISOString());
    this.cache = options.cache;
    this.rateLimiter = options.rateLimiter;
    this.trendStore = options.trendStore ?? (process.env.UPUP_PROVIDER_METRICS_PATH?.trim() ? new JsonFileMarketQuoteTrendStore(process.env.UPUP_PROVIDER_METRICS_PATH.trim()) : undefined);
    this.retry = options.retry ?? DEFAULT_PROVIDER_RETRY;
    for (const bucket of this.trendStore?.load() ?? []) {
      this.trendBuckets.set(bucket.startAt, {
        requests: bucket.requests,
        cacheHits: bucket.cacheHits,
        successes: bucket.successes,
        failures: bucket.failures,
        latencyTotalMs: (bucket.avgLatencyMs ?? 0) * (bucket.requests + bucket.cacheHits),
        sampleCount: bucket.requests + bucket.cacheHits,
      });
    }
  }

  getMetrics(): NativeMarketQuoteMetrics {
    this.refreshTrendStore();
    this.pruneTrendBuckets(Date.parse(this.now()));
    const successRatePct = this.requests === 0 ? 0 : Math.round((this.successes / this.requests) * 10000) / 100;
    const sloStatus = this.requests === 0 ? 'unknown' : this.successes === 0 ? 'unhealthy' : this.failures > 0 ? 'degraded' : 'healthy';
    return {
      requests: this.requests,
      cacheHits: this.cacheHits,
      successes: this.successes,
      failures: this.failures,
      rateLimitFailures: this.rateLimitFailures,
      ...(this.lastProvider ? { lastProvider: this.lastProvider } : {}),
      ...(this.lastLatencyMs === undefined ? {} : { lastLatencyMs: this.lastLatencyMs }),
      ...(this.lastOutcome ? { lastOutcome: this.lastOutcome } : {}),
      ...(this.lastErrorClass ? { lastErrorClass: this.lastErrorClass } : {}),
      ...(this.lastCheckedAt ? { lastCheckedAt: this.lastCheckedAt } : {}),
      successRatePct,
      sloStatus,
      recentSamples: this.recentSamples.map((sample) => ({ ...sample })),
      trend: this.getTrend(),
    };
  }

  private refreshTrendStore(): void {
    for (const bucket of this.trendStore?.load() ?? []) {
      this.trendBuckets.set(bucket.startAt, {
        requests: bucket.requests,
        cacheHits: bucket.cacheHits,
        successes: bucket.successes,
        failures: bucket.failures,
        latencyTotalMs: (bucket.avgLatencyMs ?? 0) * (bucket.requests + bucket.cacheHits),
        sampleCount: bucket.requests + bucket.cacheHits,
      });
    }
  }

  private pruneTrendBuckets(referenceMs: number): void {
    if (!Number.isFinite(referenceMs)) return;
    const cutoff = referenceMs - 24 * 60 * 60 * 1000;
    for (const key of this.trendBuckets.keys()) {
      if (Date.parse(key) < cutoff) this.trendBuckets.delete(key);
    }
  }

  private recordSample(sample: NativeMarketQuoteSample): void {
    this.recentSamples.push(sample);
    if (this.recentSamples.length > 20) this.recentSamples.shift();
    const checkedAtMs = Date.parse(sample.checkedAt);
    if (!Number.isFinite(checkedAtMs)) return;
    const bucketMs = 60 * 60 * 1000;
    const startAt = new Date(Math.floor(checkedAtMs / bucketMs) * bucketMs).toISOString();
    const bucket = this.trendBuckets.get(startAt) ?? { requests: 0, cacheHits: 0, successes: 0, failures: 0, latencyTotalMs: 0, sampleCount: 0 };
    bucket.latencyTotalMs += sample.latencyMs;
    bucket.sampleCount += 1;
    if (sample.outcome === 'cache') bucket.cacheHits += 1;
    else if (sample.outcome === 'success') { bucket.requests += 1; bucket.successes += 1; }
    else { bucket.requests += 1; bucket.failures += 1; }
    this.trendBuckets.set(startAt, bucket);
    this.pruneTrendBuckets(checkedAtMs);
    try { this.trendStore?.save(this.getTrend()); } catch { /* telemetry persistence must never break quote delivery */ }
  }

  private getTrend(): NativeMarketQuoteTrendBucket[] {
    return [...this.trendBuckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([startAt, bucket]) => ({
      startAt,
      requests: bucket.requests,
      cacheHits: bucket.cacheHits,
      successes: bucket.successes,
      failures: bucket.failures,
      successRatePct: bucket.requests === 0 ? 0 : Math.round((bucket.successes / bucket.requests) * 10000) / 100,
      ...(bucket.sampleCount === 0 ? {} : { avgLatencyMs: Math.round((bucket.latencyTotalMs / bucket.sampleCount) * 100) / 100 }),
      sloStatus: bucket.requests === 0 ? 'unknown' : bucket.successes === 0 ? 'unhealthy' : bucket.failures > 0 ? 'degraded' : 'healthy',
    }));
  }

  async getQuote(symbol: string, requestedMarket?: string, signal?: AbortSignal, auditId = 'market-quote'): Promise<NativeMarketQuoteResult> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new Error('symbol must not be empty');
    if (signal?.aborted) throw new Error('market quote request aborted');
    // Auto provider resolution:
    //   - CN/HK symbol + TUSHARE_TOKEN → tushare (covers SH/SZ/BJ + HK tickers).
    //   - CN/HK symbol + no token      → eastmoney (live quotes, no credentials).
    //   - Otherwise                    → yahoo (US/global default).
    let selectedProvider: 'yahoo' | 'tushare' | 'eastmoney' = 'yahoo';
    if (this.provider === 'auto') {
      if (isChinaSymbol(normalized)) selectedProvider = this.tushareToken ? 'tushare' : 'eastmoney';
      else selectedProvider = 'yahoo';
    } else {
      // financial-datasets is history-only, so it still resolves to yahoo here.
      selectedProvider = this.provider === 'tushare' ? 'tushare' : this.provider === 'eastmoney' ? 'eastmoney' : 'yahoo';
    }
    const startedAt = Date.now();
    this.lastProvider = selectedProvider;
    this.lastCheckedAt = this.now();
    const key = `${selectedProvider}:${normalized}:${requestedMarket ?? ''}`;
    const nowMs = Date.now();
    const cached = this.cache?.get(key, nowMs);
    if (cached) {
      this.cacheHits += 1;
      this.lastLatencyMs = Math.max(0, Date.now() - startedAt);
      this.lastOutcome = 'cache';
      this.lastErrorClass = undefined;
      this.recordSample({ provider: selectedProvider, latencyMs: this.lastLatencyMs, outcome: 'cache', checkedAt: this.lastCheckedAt });
      return { value: cached.value, evidence: { ...cached.evidence, id: `market-data:${auditId}:quote`, auditId, source: `${cached.evidence.source}#cache`, dataFreshness: 'cached' } };
    }
    this.requests += 1;
    try {
      await this.rateLimiter?.acquire(selectedProvider, nowMs);
      const output = selectedProvider === 'tushare'
        ? await this.getTushareQuote(normalized, requestedMarket, signal, auditId, key)
        : selectedProvider === 'eastmoney'
          ? await this.getEastmoneyQuote(normalized, requestedMarket, signal, auditId, key)
          : await this.getYahooQuote(normalized, requestedMarket, signal, auditId, key);
      this.successes += 1;
      this.lastLatencyMs = Math.max(0, Date.now() - startedAt);
      this.lastOutcome = 'success';
      this.lastErrorClass = undefined;
      this.recordSample({ provider: selectedProvider, latencyMs: this.lastLatencyMs, outcome: 'success', checkedAt: this.lastCheckedAt });
      return output;
    } catch (error) {
      this.failures += 1;
      if (error instanceof Error && /rate limit/i.test(error.message)) this.rateLimitFailures += 1;
      this.lastLatencyMs = Math.max(0, Date.now() - startedAt);
      this.lastOutcome = 'failure';
      this.lastErrorClass = classifyQuoteError(error);
      this.recordSample({ provider: selectedProvider, latencyMs: this.lastLatencyMs, outcome: 'failure', errorClass: this.lastErrorClass, checkedAt: this.lastCheckedAt });
      throw error;
    }
  }

  private async getYahooQuote(symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string, key: string): Promise<NativeMarketQuoteResult> {
    const resolved = yahooSymbol(symbol);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(resolved)}`);
    url.searchParams.set('range', '5d');
    url.searchParams.set('interval', '1d');
    const response = await this.fetchWithRetry(url, { signal, headers: { Accept: 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' } }, 'yahoo', 'quote', signal);
    if (!response.ok) throw new Error(`market quote request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as YahooQuotePayload;
    const meta = payload.chart?.result?.[0]?.meta;
    const last = meta?.regularMarketPrice;
    if (!finite(last) || last <= 0) throw new Error(payload.chart?.error?.description ?? `market quote returned no price for ${resolved}`);
    const previous = finite(meta?.chartPreviousClose) && meta.chartPreviousClose > 0 ? meta.chartPreviousClose : last;
    const asOf = dateFromUnixSeconds(meta?.regularMarketTime ?? Number.NaN, this.now().slice(0, 10));
    const market = quoteMarket(symbol, requestedMarket);
    const value: NativeMarketQuote = { symbol, market, price: last, bid: last, ask: last, last, currency: currencyForMarket(market), asOf, source: 'https://query1.finance.yahoo.com/v8/finance/chart', freshness: 'delayed', indicative: true };
    const native = result(value, value.source, `${resolved}:${previous}`, this.now(), auditId);
    this.cache?.set(key, native, Date.now() + this.cacheTtlMs);
    return native;
  }

  /** Live quote from `push2.eastmoney.com`; the real CN/HK provider. */
  private async getEastmoneyQuote(symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string, key: string): Promise<NativeMarketQuoteResult> {
    const market = quoteMarket(symbol, requestedMarket);
    const url = eastmoneyQuoteUrl(eastmoneySecid(symbol), this.eastmoneyBaseUrl);
    const response = await this.fetchWithRetry(url, { signal, headers: { Accept: 'application/json', 'User-Agent': EASTMONEY_USER_AGENT } }, 'eastmoney', 'quote', signal, EASTMONEY_RETRY);
    if (!response.ok) throw new Error(`Eastmoney market quote request failed: ${response.status} ${response.statusText}`);
    const snapshot = parseEastmoneyQuote(await response.json() as unknown, symbol, market, this.now().slice(0, 10));
    const value: NativeMarketQuote = {
      symbol,
      market,
      price: snapshot.last,
      bid: snapshot.last,
      ask: snapshot.last,
      last: snapshot.last,
      currency: currencyForMarket(market),
      asOf: snapshot.asOf,
      source: this.eastmoneyBaseUrl,
      freshness: 'delayed',
      indicative: true,
    };
    const output = result(value, value.source, `${symbol}:${snapshot.previousClose ?? snapshot.last}`, this.now(), auditId, 'eastmoney');
    this.cache?.set(key, output, Date.now() + this.cacheTtlMs);
    return output;
  }

  private async getTushareQuote(symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string, key: string): Promise<NativeMarketQuoteResult> {
    if (!this.tushareToken) throw new Error('Tushare provider requires TUSHARE_TOKEN');
    const resolved = tushareSymbol(symbol);
    const response = await this.fetchWithRetry('https://api.tushare.pro', { method: 'POST', signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'UpUp-Pi-Market-Data/1.0' }, body: JSON.stringify({ api_name: 'daily', token: this.tushareToken, params: { ts_code: resolved }, fields: 'ts_code,trade_date,close,pre_close' }) }, 'tushare', 'quote', signal);
    if (!response.ok) throw new Error(`Tushare market quote request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as TusharePayload;
    if (payload.code !== 0) throw new Error(`Tushare market quote request failed: ${payload.msg ?? `code ${payload.code ?? 'unknown'}`}`);
    const fields = payload.data?.fields ?? [];
    const index = new Map(fields.map((field, position) => [field, position]));
    const row = payload.data?.items?.[0];
    const valueAt = (field: string): unknown => row?.[index.get(field) ?? -1];
    const last = Number(valueAt('close'));
    const previous = Number(valueAt('pre_close'));
    const rawDate = String(valueAt('trade_date') ?? '');
    const asOf = rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}` : rawDate;
    if (!Number.isFinite(last) || last <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`Tushare returned no valid quote for ${resolved}`);
    const market = quoteMarket(symbol, requestedMarket);
    const native: NativeMarketQuote = { symbol, market, price: last, bid: last, ask: last, last, currency: currencyForMarket(market), asOf, source: 'https://api.tushare.pro', freshness: 'delayed', indicative: true };
    const output = result(native, native.source, `${resolved}:${Number.isFinite(previous) ? previous : last}`, this.now(), auditId);
    this.cache?.set(key, output, Date.now() + this.cacheTtlMs);
    return output;
  }

  private async fetchWithRetry(input: RequestInfo | URL, init: RequestInit, provider: MarketHistoryProvider, operation: string, signal?: AbortSignal, retryOverride?: Omit<ProviderRetryPolicy, 'provider' | 'operation'>): Promise<Response> {
    const execute = async (retrySignal?: AbortSignal) => {
      const request = () => this.fetcher(input, { ...init, ...(retrySignal ? { signal: retrySignal } : {}) });
      // Eastmoney resets connections when a client bursts, so its requests are
      // serialized and spaced through the shared per-host gate.
      const response = provider === 'eastmoney' ? await eastmoneyGateFor(input).run(request) : await request();
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

export function createDefaultMarketQuoteClient(options: NativeMarketQuoteClientOptions = {}): NativeMarketQuoteClient {
  return new NativeMarketQuoteClient({ ...options, cache: options.cache ?? new InMemoryMarketQuoteCache(), rateLimiter: options.rateLimiter ?? new FixedWindowMarketHistoryRateLimiter(60, 60_000) });
}
