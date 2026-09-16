import { executeWithProviderRetry, type ProviderRetryPolicy } from '@upup/pi-observability';

export type ResearchDataFreshness = 'realtime' | 'delayed' | 'cached';
export type ResearchMarket = 'cn' | 'hk' | 'us' | 'fund' | 'crypto';

export interface ResearchDataEnvelope {
  readonly data: unknown;
  readonly market: ResearchMarket;
  readonly provider: string;
  readonly sourceUrls: readonly string[];
  readonly freshness: ResearchDataFreshness;
  readonly retrievedAt: string;
  readonly retryAttempts: number;
  readonly retryMaxAttempts: number;
  readonly retryRecovered: boolean;
}

export interface ResearchDataClientOptions {
  readonly fetcher?: typeof fetch;
  readonly marketFetchers?: Partial<Record<ResearchMarket, typeof fetch>>;
  readonly marketProviders?: Partial<Record<ResearchMarket, string>>;
  readonly marketApiKeys?: Partial<Record<ResearchMarket, string>>;
  readonly marketBaseUrls?: Partial<Record<ResearchMarket, string>>;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly freshness?: ResearchDataFreshness;
  readonly retry?: Omit<ProviderRetryPolicy, 'provider' | 'operation'>;
}

type QueryValue = string | number | readonly string[] | undefined;

const DEFAULT_BASE_URL = 'https://api.financialdatasets.ai';
/**
 * Providers backed by public endpoints that authenticate nobody (Eastmoney's
 * datacenter / report / notice APIs). They are the CN/HK research path when no
 * Tushare token is configured, so they must not be asked for an API key.
 */
const CREDENTIAL_FREE_RESEARCH_PROVIDERS = new Set(['eastmoney', 'sec-edgar']);
const DEFAULT_PROVIDER_RETRY: Omit<ProviderRetryPolicy, 'provider' | 'operation'> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2_000,
};
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

function validateTicker(value: string, market: ResearchMarket = 'us'): string {
  const ticker = value.trim().toUpperCase();
  const valid = market === 'cn'
    ? /^\d{6}\.(SH|SZ|BJ)$/.test(ticker)
    : market === 'hk'
      ? /^\d{4,5}\.HK$/.test(ticker)
      : TICKER_PATTERN.test(ticker);
  if (!valid) throw new Error(`ticker must be valid for ${market} market`);
  return ticker;
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Financial Datasets response was not an object');
  return value as Record<string, unknown>;
}

export class NativeResearchDataClient {
  private readonly fetcher: typeof fetch;
  private readonly marketFetchers: Partial<Record<ResearchMarket, typeof fetch>>;
  private readonly marketProviders: Partial<Record<ResearchMarket, string>>;
  private readonly marketApiKeys: Partial<Record<ResearchMarket, string>>;
  private readonly marketBaseUrls: Partial<Record<ResearchMarket, string>>;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly freshness: ResearchDataFreshness;
  private readonly retry: ResearchDataClientOptions['retry'];

  constructor(options: ResearchDataClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.marketFetchers = options.marketFetchers ?? {};
    this.marketProviders = options.marketProviders ?? {};
    this.marketApiKeys = options.marketApiKeys ?? {};
    this.marketBaseUrls = options.marketBaseUrls ?? {};
    this.apiKey = options.apiKey ?? process.env.FINANCIAL_DATASETS_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.freshness = options.freshness ?? 'delayed';
    this.retry = options.retry ?? DEFAULT_PROVIDER_RETRY;
  }

  getStockPrice(input: { readonly ticker: string; readonly market?: ResearchMarket }, signal?: AbortSignal): Promise<string> {
    const market = input.market ?? 'us';
    return this.request('/prices/snapshot/', { ticker: validateTicker(input.ticker, market) }, signal, market).then((result) => this.format(result));
  }

  getKeyRatios(input: { readonly ticker: string; readonly market?: ResearchMarket }, signal?: AbortSignal): Promise<string> {
    const market = input.market ?? 'us';
    return this.request('/financial-metrics/snapshot/', { ticker: validateTicker(input.ticker, market) }, signal, market).then((result) => this.format(result));
  }

  getAnalystEstimates(input: { readonly ticker: string; readonly period?: 'annual' | 'quarterly'; readonly market?: ResearchMarket }, signal?: AbortSignal): Promise<string> {
    const market = input.market ?? 'us';
    return this.request('/analyst-estimates/', { ticker: validateTicker(input.ticker, market), period: input.period ?? 'annual' }, signal, market).then((result) => this.format(result));
  }

  getEarnings(input: { readonly ticker: string; readonly market?: ResearchMarket }, signal?: AbortSignal): Promise<string> {
    const market = input.market ?? 'us';
    return this.request('/earnings', { ticker: validateTicker(input.ticker, market) }, signal, market).then((result) => this.format(result));
  }

  getFilings(input: { readonly ticker: string; readonly filing_type?: readonly ('10-K' | '10-Q' | '8-K')[]; readonly limit?: number; readonly market?: ResearchMarket }, signal?: AbortSignal): Promise<string> {
    const market = input.market ?? 'us';
    const ticker = validateTicker(input.ticker, market);
    const limit = input.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('filing limit must be an integer between 1 and 10');
    return this.request('/filings/', { ticker, filing_type: input.filing_type, limit }, signal, market).then((result) => this.format(result));
  }

  private async request(path: string, params: Record<string, QueryValue>, signal: AbortSignal | undefined, market: ResearchMarket): Promise<{ payload: Record<string, unknown>; url: string; retryAttempts: number; retryMaxAttempts: number; market: ResearchMarket; provider: string }> {
    if (signal?.aborted) throw new Error('finance research request aborted');
    const fetcher = this.marketFetchers[market] ?? (market === 'us' ? this.fetcher : undefined);
    if (!fetcher) throw new Error(`research provider unavailable for market ${market}; configure an explicit market provider`);
    const provider = this.marketProviders[market] ?? (market === 'us' ? 'financial-datasets' : `configured-${market}-research`);
    const apiKey = this.marketApiKeys[market] ?? this.apiKey;
    if (!apiKey && !CREDENTIAL_FREE_RESEARCH_PROVIDERS.has(provider)) {
      throw new Error(market === 'us' ? 'FINANCIAL_DATASETS_API_KEY is required for live finance research' : `research credentials are required for live ${market} finance research`);
    }
    const baseUrl = (this.marketBaseUrls[market] ?? this.baseUrl).replace(/\/$/, '');
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    const request = async (retrySignal?: AbortSignal): Promise<Record<string, unknown>> => {
      const response = await fetcher(url, { ...(retrySignal ? { signal: retrySignal } : { ...(signal ? { signal } : {}) }), headers: { ...(apiKey ? { 'x-api-key': apiKey } : {}) } });
      if (!response.ok) throw new Error(`Financial Datasets research request failed: ${response.status} ${response.statusText}`);
      return objectPayload(await response.json());
    };
    const retryResult = await executeWithProviderRetry((_, retrySignal) => request(retrySignal), {
      provider,
      operation: path,
      signal,
      ...this.retry,
    });
    return {
      payload: retryResult.value,
      url: url.toString(),
      retryAttempts: retryResult.attempts,
      retryMaxAttempts: Math.max(1, Math.floor(this.retry?.maxAttempts ?? 3)),
      market,
      provider,
    };
  }

  /**
   * Adapters that proxy a different upstream than `baseUrl` (e.g. Eastmoney)
   * declare the URLs they actually read via `sourceUrls`, so the evidence
   * envelope never claims `api.financialdatasets.ai` served CN/HK rows.
   */
  private sourceUrlsOf(payload: Record<string, unknown>, fallback: string): readonly string[] {
    if (!Array.isArray(payload.sourceUrls)) return [fallback];
    // An explicit (possibly empty) list wins: a provider that served nothing
    // must not be credited with the request URL.
    return payload.sourceUrls.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private format(result: { payload: Record<string, unknown>; url: string; market: ResearchMarket; provider: string }): string {
    const retryAttempts = 'retryAttempts' in result && typeof result.retryAttempts === 'number' ? result.retryAttempts : 1;
    const retryMaxAttempts = 'retryMaxAttempts' in result && typeof result.retryMaxAttempts === 'number' ? result.retryMaxAttempts : 1;
    const envelope: ResearchDataEnvelope = {
      data: result.payload,
      market: result.market,
      provider: result.provider,
      sourceUrls: this.sourceUrlsOf(result.payload, result.url),
      freshness: this.freshness,
      retrievedAt: new Date().toISOString(),
      retryAttempts,
      retryMaxAttempts,
      retryRecovered: retryAttempts > 1,
    };
    return JSON.stringify(envelope);
  }
}

export interface TushareResearchFetcherOptions {
  readonly token: string;
  readonly market?: 'cn' | 'hk';
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

/**
 * Adapt the read-only Tushare Pro API to the market fetch contract used by
 * NativeResearchDataClient. The adapter deliberately exposes raw Tushare
 * rows; the evidence envelope is still owned by the Pi finance client.
 */
export function createTushareResearchDataFetcher(options: TushareResearchFetcherOptions): typeof fetch {
  const token = options.token.trim();
  if (!token) throw new Error('Tushare research adapter requires TUSHARE_TOKEN');
  const market = options.market ?? 'cn';
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const request: typeof fetch = (async (input, init) => {
    const requestUrl = new URL(String(input));
    const ticker = requestUrl.searchParams.get('ticker') ?? '';
    const pathname = requestUrl.pathname;
    const endDate = now().toISOString().slice(0, 10).replaceAll('-', '');
    const start = new Date(now().getTime() - 366 * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().slice(0, 10).replaceAll('-', '');
    const endpoint = market === 'hk'
      ? pathname.includes('financial-metrics') ? 'hk_fina_indicator'
        : pathname.includes('analyst-estimates') ? 'hk_forecast'
          : pathname.includes('earnings') ? 'hk_income'
            : pathname.includes('filings') ? 'hk_fina_audit'
              : 'hk_daily'
      : pathname.includes('financial-metrics') ? 'daily_basic'
        : pathname.includes('analyst-estimates') ? 'forecast'
          : pathname.includes('earnings') ? 'income'
            : pathname.includes('filings') ? 'disclosure_date'
              : 'daily';
    const fields = endpoint === 'daily' || endpoint === 'hk_daily'
      ? 'ts_code,trade_date,open,high,low,close,vol,amount'
      : endpoint === 'daily_basic'
        ? 'ts_code,trade_date,turnover_rate,pe,pb,ps,total_mv,circ_mv'
        : endpoint === 'hk_fina_indicator'
          ? 'ts_code,end_date,roe,roa,grossprofit_margin,netprofit_margin,eps'
          : endpoint === 'forecast' || endpoint === 'hk_forecast'
            ? 'ts_code,ann_date,end_date,type,p_change_min,p_change_max,net_profit_min,net_profit_max'
            : endpoint === 'income' || endpoint === 'hk_income'
              ? 'ts_code,ann_date,f_ann_date,end_date,revenue,n_income,n_income_attr_p'
              : endpoint === 'hk_fina_audit'
                ? 'ts_code,ann_date,end_date,audit_result,audit_agency'
                : 'ts_code,ann_date,end_date,pre_date';
    const params: Record<string, string> = { ts_code: ticker, start_date: startDate, end_date: endDate };
    if (endpoint === 'disclosure_date') delete params.start_date;
    const response = await fetcher('https://api.tushare.pro', {
      ...init,
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      body: JSON.stringify({ api_name: endpoint, token, params, fields }),
    });
    if (!response.ok) return response;
    const payload = await response.json() as { code?: number; msg?: string; data?: unknown };
    if (payload.code !== undefined && payload.code !== 0) {
      return new Response(JSON.stringify({ code: payload.code, msg: payload.msg ?? 'Tushare request failed', data: payload.data }), { status: 502, statusText: 'Bad Gateway' });
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return request;
}

export function createNativeResearchDataAdapters(options: ResearchDataClientOptions = {}) {
  const client = new NativeResearchDataClient(options);
  return {
    getStockPrice: { invoke: (input: unknown) => client.getStockPrice(input as { ticker: string; market?: ResearchMarket }) },
    getKeyRatios: { invoke: (input: unknown) => client.getKeyRatios(input as { ticker: string; market?: ResearchMarket }) },
    getAnalystEstimates: { invoke: (input: unknown) => client.getAnalystEstimates(input as { ticker: string; period?: 'annual' | 'quarterly'; market?: ResearchMarket }) },
    getEarnings: { invoke: (input: unknown) => client.getEarnings(input as { ticker: string; market?: ResearchMarket }) },
    getFilings: { invoke: (input: unknown) => client.getFilings(input as { ticker: string; filing_type?: readonly ('10-K' | '10-Q' | '8-K')[]; limit?: number; market?: ResearchMarket }) },
  };
}
