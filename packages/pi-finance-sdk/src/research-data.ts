export type ResearchDataFreshness = 'realtime' | 'delayed' | 'cached';

export interface ResearchDataEnvelope {
  readonly data: unknown;
  readonly sourceUrls: readonly string[];
  readonly freshness: ResearchDataFreshness;
  readonly retrievedAt: string;
}

export interface ResearchDataClientOptions {
  readonly fetcher?: typeof fetch;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly freshness?: ResearchDataFreshness;
}

type QueryValue = string | number | readonly string[] | undefined;

const DEFAULT_BASE_URL = 'https://api.financialdatasets.ai';
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

function validateTicker(value: string): string {
  const ticker = value.trim().toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) throw new Error('ticker must be a valid US ticker');
  return ticker;
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Financial Datasets response was not an object');
  return value as Record<string, unknown>;
}

export class NativeResearchDataClient {
  private readonly fetcher: typeof fetch;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly freshness: ResearchDataFreshness;

  constructor(options: ResearchDataClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.apiKey = options.apiKey ?? process.env.FINANCIAL_DATASETS_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.freshness = options.freshness ?? 'delayed';
  }

  getStockPrice(input: { readonly ticker: string }, signal?: AbortSignal): Promise<string> {
    return this.request('/prices/snapshot/', { ticker: validateTicker(input.ticker) }, signal).then((result) => this.format(result));
  }

  getKeyRatios(input: { readonly ticker: string }, signal?: AbortSignal): Promise<string> {
    return this.request('/financial-metrics/snapshot/', { ticker: validateTicker(input.ticker) }, signal).then((result) => this.format(result));
  }

  getAnalystEstimates(input: { readonly ticker: string; readonly period?: 'annual' | 'quarterly' }, signal?: AbortSignal): Promise<string> {
    return this.request('/analyst-estimates/', { ticker: validateTicker(input.ticker), period: input.period ?? 'annual' }, signal).then((result) => this.format(result));
  }

  getEarnings(input: { readonly ticker: string }, signal?: AbortSignal): Promise<string> {
    return this.request('/earnings', { ticker: validateTicker(input.ticker) }, signal).then((result) => this.format(result));
  }

  getFilings(input: { readonly ticker: string; readonly filing_type?: readonly ('10-K' | '10-Q' | '8-K')[]; readonly limit?: number }, signal?: AbortSignal): Promise<string> {
    const ticker = validateTicker(input.ticker);
    const limit = input.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('filing limit must be an integer between 1 and 10');
    return this.request('/filings/', { ticker, filing_type: input.filing_type, limit }, signal).then((result) => this.format(result));
  }

  private async request(path: string, params: Record<string, QueryValue>, signal?: AbortSignal): Promise<{ payload: Record<string, unknown>; url: string }> {
    if (signal?.aborted) throw new Error('finance research request aborted');
    if (!this.apiKey) throw new Error('FINANCIAL_DATASETS_API_KEY is required for live finance research');
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    const response = await this.fetcher(url, { signal, headers: { 'x-api-key': this.apiKey } });
    if (!response.ok) throw new Error(`Financial Datasets research request failed: ${response.status} ${response.statusText}`);
    return { payload: objectPayload(await response.json()), url: url.toString() };
  }

  private format(result: { payload: Record<string, unknown>; url: string }): string {
    const envelope: ResearchDataEnvelope = { data: result.payload, sourceUrls: [result.url], freshness: this.freshness, retrievedAt: new Date().toISOString() };
    return JSON.stringify(envelope);
  }
}

export function createNativeResearchDataAdapters(options: ResearchDataClientOptions = {}) {
  const client = new NativeResearchDataClient(options);
  return {
    getStockPrice: { invoke: (input: unknown) => client.getStockPrice(input as { ticker: string }) },
    getKeyRatios: { invoke: (input: unknown) => client.getKeyRatios(input as { ticker: string }) },
    getAnalystEstimates: { invoke: (input: unknown) => client.getAnalystEstimates(input as { ticker: string; period?: 'annual' | 'quarterly' }) },
    getEarnings: { invoke: (input: unknown) => client.getEarnings(input as { ticker: string }) },
    getFilings: { invoke: (input: unknown) => client.getFilings(input as { ticker: string; filing_type?: readonly ('10-K' | '10-Q' | '8-K')[]; limit?: number }) },
  };
}
