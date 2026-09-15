import { randomBytes } from 'node:crypto';
import { currencyForMarket, normalizeMarket, stableSeed } from './market-utils';
import type { Market, MarketBar, MarketEvidence, MarketFreshness, MarketQuote } from './market-types';

export const DRY_RUN_SOURCE_QUOTE = 'dry-run://pi-market-data/quote';
export const DRY_RUN_SOURCE_HISTORY = 'dry-run://pi-market-data/history';
export const DRY_RUN_FRESHNESS: MarketFreshness = 'offline';
export const DRY_RUN_AUDIT_TAG = 'pi-market-data.dry-run';

export interface DryRunOptions {
  readonly now?: () => string;
  readonly maxBars?: number;
  readonly seed?: number;
}

export interface DryRunQuoteSnapshot {
  readonly symbol: string;
  readonly market: Market;
  readonly price: number;
  readonly previousClose: number;
  readonly asOf: string;
}

function resolveSeed(options: DryRunOptions): number {
  if (typeof options.seed === 'number' && Number.isFinite(options.seed)) return options.seed;
  const fallback = randomBytes(4);
  return fallback.readUInt32BE(0) % 1_000_000;
}

function drift(seed: number, scale = 1): number {
  const raw = (Math.sin(seed) * 10_000) % 1;
  return Number(((Math.abs(raw) * 0.018 - 0.009) * scale).toFixed(4));
}

export function quoteMarketFromSymbol(symbol: string): Market {
  if (/^\d{6}(\.(SH|SZ|BJ))?$/.test(symbol)) return 'cn';
  if (/\.HK$/i.test(symbol)) return 'hk';
  if (/^[A-Z0-9]+-?USD$/i.test(symbol)) return 'crypto';
  return 'us';
}

export function dryRunQuoteSnapshot(symbol: string, requestedMarket: string | undefined, options: DryRunOptions = {}): DryRunQuoteSnapshot {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('symbol must not be empty');
  const resolvedMarket = requestedMarket ? normalizeMarket(requestedMarket) : quoteMarketFromSymbol(normalized);
  const seed = (stableSeed(normalized) + resolveSeed(options)) % 1_000_000;
  const basePrice = resolvedMarket === 'hk' ? 80 : resolvedMarket === 'us' ? 200 : resolvedMarket === 'crypto' ? 30_000 : 35;
  const previousClose = Number((basePrice + (seed % 1000) / 100).toFixed(2));
  const price = Number((previousClose + drift(seed, resolvedMarket === 'crypto' ? 8 : 1) * previousClose).toFixed(2));
  const asOf = (options.now ?? (() => new Date().toISOString().slice(0, 10)))();
  return { symbol: normalized, market: resolvedMarket, price: Math.max(0.01, price), previousClose: Math.max(0.01, previousClose), asOf: asOf.slice(0, 10) };
}

export interface DryRunQuoteResult {
  readonly value: MarketQuote;
  readonly evidence: MarketEvidence;
}

export function makeDryRunQuoteResult(symbol: string, requestedMarket: string | undefined, auditId: string, options: DryRunOptions = {}): DryRunQuoteResult {
  const snapshot = dryRunQuoteSnapshot(symbol, requestedMarket, options);
  const query = `${snapshot.symbol}:${snapshot.previousClose}`;
  const retrievedAt = (options.now ?? (() => new Date().toISOString()))();
  const evidence: MarketEvidence = {
    id: `market-data:${auditId}:quote`,
    source: DRY_RUN_SOURCE_QUOTE,
    provider: 'dry-run',
    retrievedAt,
    asOf: snapshot.asOf,
    query,
    dataFreshness: DRY_RUN_FRESHNESS,
    auditId,
  };
  const value: MarketQuote = {
    symbol: snapshot.symbol,
    market: snapshot.market,
    price: snapshot.price,
    currency: currencyForMarket(snapshot.market),
    asOf: snapshot.asOf,
    source: DRY_RUN_SOURCE_QUOTE,
    freshness: DRY_RUN_FRESHNESS,
  };
  return { value, evidence };
}

function* tradingDaysBetween(start: string, end: string, market: Market): Generator<string> {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return;
  for (let cursor = startMs; cursor <= endMs; cursor += 86_400_000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (market === 'cn' && date === '2026-10-01') continue;
    if (market === 'us' && (date === '2026-07-04' || date === '2026-12-25')) continue;
    yield date;
  }
}

export interface DryRunHistoryResult {
  readonly value: readonly MarketBar[];
  readonly evidence: MarketEvidence;
}

export function makeDryRunHistoryResult(symbol: string, startDate: string, endDate: string, auditId: string, options: DryRunOptions = {}): DryRunHistoryResult {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('symbol must not be empty');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate + 'T00:00:00Z'))) throw new Error('startDate must be an ISO date (YYYY-MM-DD)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(endDate + 'T00:00:00Z'))) throw new Error('endDate must be an ISO date (YYYY-MM-DD)');
  if (startDate > endDate) throw new Error('startDate must not be after endDate');
  const market = quoteMarketFromSymbol(normalized);
  const seed = (stableSeed(normalized) + resolveSeed(options)) % 1_000_000;
  const days = [...tradingDaysBetween(startDate, endDate, market)];
  const maxBars = options.maxBars ?? 5_000;
  const truncated = days.slice(-maxBars);
  const bars: MarketBar[] = truncated.map((date, index) => {
    const phase = seed + index * 7;
    const open = Number((40 + (phase % 600) / 10 + drift(phase, 0.6)).toFixed(2));
    const close = Number((open + drift(phase + 1, 0.9)).toFixed(2));
    const high = Number((Math.max(open, close) + Math.abs(drift(phase + 2, 0.5))).toFixed(2));
    const low = Number((Math.min(open, close) - Math.abs(drift(phase + 3, 0.5))).toFixed(2));
    const volume = 100_000 + (phase % 9000) * 17;
    return { date, open, high, low, close, volume };
  });
  if (bars.length < 2) throw new Error(`dry-run history produced fewer than two trading-day bars for ${normalized} between ${startDate} and ${endDate}`);
  const retrievedAt = (options.now ?? (() => new Date().toISOString()))();
  const evidence: MarketEvidence = {
    id: `market-data:${auditId}:history`,
    source: DRY_RUN_SOURCE_HISTORY,
    provider: 'dry-run',
    retrievedAt,
    asOf: bars.at(-1)?.date ?? endDate,
    query: `${normalized}:${startDate}:${endDate}`,
    dataFreshness: DRY_RUN_FRESHNESS,
    auditId,
  };
  return { value: bars, evidence };
}

export function isDryRunSource(source: string | undefined): boolean {
  return typeof source === 'string' && source.startsWith('dry-run://');
}

export function shouldAutoActivateDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.UPUP_DRY_RUN ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

export interface DryRunClientMetrics {
  readonly mode: 'dry-run';
  readonly activatedBy: 'option' | 'env' | 'missing-credentials';
  readonly requests: number;
  readonly cacheHits: number;
  readonly lastSymbol?: string;
  readonly lastCheckedAt?: string;
}

interface DryRunCacheEntry {
  value: MarketQuote;
  evidence: MarketEvidence;
  expiresAt: number;
}

export class DryRunMarketQuoteClient {
  private readonly cacheTtlMs = 60_000;
  private readonly cache = new Map<string, DryRunCacheEntry>();
  private readonly activatedBy: 'option' | 'env' | 'missing-credentials';
  private readonly seed?: number;
  private readonly now: () => string;
  private requests = 0;
  private cacheHits = 0;
  private lastSymbol: string | undefined;
  private lastCheckedAt: string | undefined;

  constructor(options: { activatedBy: 'option' | 'env' | 'missing-credentials'; seed?: number; now?: () => string }) {
    this.activatedBy = options.activatedBy;
    this.seed = options.seed;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async getQuote(symbol: string, requestedMarket?: string, _signal?: AbortSignal, auditId = 'market-quote'): Promise<{ value: MarketQuote; evidence: MarketEvidence }> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new Error('symbol must not be empty');
    this.lastSymbol = normalized;
    this.lastCheckedAt = this.now();
    const cacheKey = `dry-run:${normalized}:${requestedMarket ?? ''}`;
    const nowMs = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      this.cacheHits += 1;
      return {
        value: cached.value,
        evidence: { ...cached.evidence, id: `market-data:${auditId}:quote`, auditId, source: `${cached.evidence.source}#cache`, dataFreshness: 'cached' },
      };
    }
    this.requests += 1;
    const result = makeDryRunQuoteResult(normalized, requestedMarket, auditId, { now: this.now, ...(this.seed !== undefined ? { seed: this.seed } : {}) });
    this.cache.set(cacheKey, { value: result.value, evidence: result.evidence, expiresAt: nowMs + this.cacheTtlMs });
    return result;
  }

  getMetrics(): DryRunClientMetrics {
    return {
      mode: 'dry-run',
      activatedBy: this.activatedBy,
      requests: this.requests,
      cacheHits: this.cacheHits,
      ...(this.lastSymbol ? { lastSymbol: this.lastSymbol } : {}),
      ...(this.lastCheckedAt ? { lastCheckedAt: this.lastCheckedAt } : {}),
    };
  }

  reset(): void {
    this.cache.clear();
    this.requests = 0;
    this.cacheHits = 0;
    this.lastSymbol = undefined;
    this.lastCheckedAt = undefined;
  }
}

interface DryRunHistoryCacheEntry {
  value: readonly MarketBar[];
  evidence: MarketEvidence;
  expiresAt: number;
}

export class DryRunMarketHistoryClient {
  private readonly cacheTtlMs = 60_000;
  private readonly cache = new Map<string, DryRunHistoryCacheEntry>();
  private readonly activatedBy: 'option' | 'env' | 'missing-credentials';
  private readonly seed?: number;
  private readonly now: () => string;
  private readonly maxBars: number;
  private requests = 0;
  private cacheHits = 0;
  private lastSymbol: string | undefined;
  private lastCheckedAt: string | undefined;

  constructor(options: { activatedBy: 'option' | 'env' | 'missing-credentials'; seed?: number; now?: () => string; maxBars?: number }) {
    this.activatedBy = options.activatedBy;
    this.seed = options.seed;
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxBars = options.maxBars ?? 5_000;
  }

  async getHistory(symbol: string, startDate: string, endDate: string, _signal?: AbortSignal, auditId = 'market-history'): Promise<{ value: readonly MarketBar[]; evidence: MarketEvidence }> {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) throw new Error('symbol must not be empty');
    this.lastSymbol = normalized;
    this.lastCheckedAt = this.now();
    const cacheKey = `dry-run:${normalized}:${startDate}:${endDate}`;
    const nowMs = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      this.cacheHits += 1;
      return {
        value: cached.value,
        evidence: { ...cached.evidence, id: `market-data:${auditId}:history`, auditId, source: `${cached.evidence.source}#cache`, dataFreshness: 'cached' },
      };
    }
    this.requests += 1;
    const result = makeDryRunHistoryResult(normalized, startDate, endDate, auditId, {
      now: this.now,
      maxBars: this.maxBars,
      ...(this.seed !== undefined ? { seed: this.seed } : {}),
    });
    this.cache.set(cacheKey, { value: result.value, evidence: result.evidence, expiresAt: nowMs + this.cacheTtlMs });
    return result;
  }

  getMetrics(): DryRunClientMetrics {
    return {
      mode: 'dry-run',
      activatedBy: this.activatedBy,
      requests: this.requests,
      cacheHits: this.cacheHits,
      ...(this.lastSymbol ? { lastSymbol: this.lastSymbol } : {}),
      ...(this.lastCheckedAt ? { lastCheckedAt: this.lastCheckedAt } : {}),
    };
  }

  reset(): void {
    this.cache.clear();
    this.requests = 0;
    this.cacheHits = 0;
    this.lastSymbol = undefined;
    this.lastCheckedAt = undefined;
  }
}

export interface DryRunActivationContext {
  readonly explicitOption?: boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly hasTushareToken: boolean;
  readonly hasYahooAccess: boolean;
  readonly provider: 'auto' | 'yahoo' | 'tushare' | 'financial-datasets';
}

export function resolveDryRunActivation(context: DryRunActivationContext): { active: boolean; activatedBy: 'option' | 'env' | 'missing-credentials' | undefined } {
  if (context.explicitOption === true) return { active: true, activatedBy: 'option' };
  if (context.explicitOption === false) return { active: false, activatedBy: undefined };
  if (shouldAutoActivateDryRun(context.env)) return { active: true, activatedBy: 'env' };
  if (context.provider === 'tushare' && !context.hasTushareToken) return { active: true, activatedBy: 'missing-credentials' };
  if (context.provider === 'auto' && !context.hasYahooAccess && !context.hasTushareToken) return { active: true, activatedBy: 'missing-credentials' };
  return { active: false, activatedBy: undefined };
}

import { InMemoryMarketQuoteCache, JsonFileMarketQuoteTrendStore, NativeMarketQuoteClient, type MarketQuoteCache, type NativeMarketQuoteClientOptions, type NativeMarketQuoteTrendStore } from "./quote";
import { FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, NativeMarketHistoryClient, type MarketHistoryCache, type MarketHistoryRateLimiter, type NativeMarketHistoryClientOptions } from "./history";

export interface ResolvedMarketQuoteClient {
  readonly client: NativeMarketQuoteClient | DryRunMarketQuoteClient;
  readonly dryRun: boolean;
  readonly activatedBy: 'option' | 'env' | 'missing-credentials' | undefined;
}

export interface ResolvedMarketHistoryClient {
  readonly client: NativeMarketHistoryClient | DryRunMarketHistoryClient;
  readonly dryRun: boolean;
  readonly activatedBy: 'option' | 'env' | 'missing-credentials' | undefined;
}

export interface ResolveMarketQuoteClientOptions {
  readonly dryRun?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly cache?: MarketQuoteCache;
  readonly rateLimiter?: MarketHistoryRateLimiter;
  readonly trendStore?: NativeMarketQuoteTrendStore;
  readonly fetcher?: NativeMarketQuoteClientOptions['fetcher'];
  readonly provider?: NativeMarketQuoteClientOptions['provider'];
  readonly tushareToken?: NativeMarketQuoteClientOptions['tushareToken'];
  readonly now?: () => string;
  readonly seed?: number;
}

export interface ResolveMarketHistoryClientOptions {
  readonly dryRun?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly cache?: MarketHistoryCache;
  readonly rateLimiter?: MarketHistoryRateLimiter;
  readonly fetcher?: NativeMarketHistoryClientOptions['fetcher'];
  readonly baseUrl?: NativeMarketHistoryClientOptions['baseUrl'];
  readonly provider?: NativeMarketHistoryClientOptions['provider'];
  readonly tushareToken?: NativeMarketHistoryClientOptions['tushareToken'];
  readonly now?: () => string;
  readonly maxBars?: number;
  readonly seed?: number;
}



export function resolveMarketQuoteClient(options: ResolveMarketQuoteClientOptions = {}): ResolvedMarketQuoteClient {
  const env = options.env ?? process.env;
  const tushareToken = options.tushareToken ?? env.TUSHARE_TOKEN ?? '';
  const hasYahooAccess = Boolean(options.fetcher) || env.UPUP_YAHOO_DISABLED !== '1';
  const hasTushareToken = Boolean(tushareToken);
  const provider = options.provider ?? 'auto';
  const activation = resolveDryRunActivation({
    explicitOption: options.dryRun,
    env,
    hasTushareToken,
    hasYahooAccess,
    provider,
  });
  if (activation.active) {
    return {
      client: new DryRunMarketQuoteClient({
        activatedBy: activation.activatedBy ?? 'option',
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.now ? { now: options.now } : {}),
      }),
      dryRun: true,
      activatedBy: activation.activatedBy,
    };
  }
  return {
    client: new NativeMarketQuoteClient({
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      provider,
      tushareToken,
      ...(options.now ? { now: options.now } : {}),
      cache: options.cache ?? new InMemoryMarketQuoteCache(),
      rateLimiter: options.rateLimiter ?? new FixedWindowMarketHistoryRateLimiter(60, 60_000),
      trendStore: options.trendStore ?? (env.UPUP_PROVIDER_METRICS_PATH?.trim() ? new JsonFileMarketQuoteTrendStore(env.UPUP_PROVIDER_METRICS_PATH.trim()) : undefined),
    }),
    dryRun: false,
    activatedBy: undefined,
  };
}

export function resolveMarketHistoryClient(options: ResolveMarketHistoryClientOptions = {}): ResolvedMarketHistoryClient {
  const env = options.env ?? process.env;
  const tushareToken = options.tushareToken ?? env.TUSHARE_TOKEN ?? '';
  const hasYahooAccess = Boolean(options.fetcher) || env.UPUP_YAHOO_DISABLED !== '1';
  const hasTushareToken = Boolean(tushareToken);
  const provider = options.provider ?? 'auto';
  const activation = resolveDryRunActivation({
    explicitOption: options.dryRun,
    env,
    hasTushareToken,
    hasYahooAccess,
    provider,
  });
  if (activation.active) {
    return {
      client: new DryRunMarketHistoryClient({
        activatedBy: activation.activatedBy ?? 'option',
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        ...(options.now ? { now: options.now } : {}),
        ...(options.maxBars !== undefined ? { maxBars: options.maxBars } : {}),
      }),
      dryRun: true,
      activatedBy: activation.activatedBy,
    };
  }
  return {
    client: new NativeMarketHistoryClient({
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      provider,
      tushareToken,
      ...(options.now ? { now: options.now } : {}),
      ...(options.maxBars !== undefined ? { maxBars: options.maxBars } : {}),
      cache: options.cache,
      rateLimiter: options.rateLimiter,
    }),
    dryRun: false,
    activatedBy: undefined,
  };
}

export function isResolvedMarketQuoteDryRun(client: ResolvedMarketQuoteClient | NativeMarketQuoteClient): boolean {
  if (client instanceof DryRunMarketQuoteClient) return true;
  return 'dryRun' in client && client.dryRun === true;
}

export function isResolvedMarketHistoryDryRun(client: ResolvedMarketHistoryClient | NativeMarketHistoryClient): boolean {
  if (client instanceof DryRunMarketHistoryClient) return true;
  return 'dryRun' in client && client.dryRun === true;
}
