export type NativeFilingType = '10-K' | '10-Q' | '8-K';

export interface NativeReadFilingsInput {
  readonly query: string;
  readonly ticker?: string;
  readonly filing_types?: readonly NativeFilingType[];
  readonly limit?: number;
  readonly items?: readonly string[];
}

export interface NativeFilingRecord {
  readonly accession_number?: string;
  readonly filing_type?: NativeFilingType;
  readonly filing_date?: string;
  readonly [key: string]: unknown;
}

export interface NativeReadFilingsResult {
  readonly ticker: string;
  readonly filingTypes: readonly NativeFilingType[];
  readonly filings: readonly NativeFilingRecord[];
  readonly content: readonly Record<string, unknown>[];
  readonly sourceUrls: readonly string[];
  readonly fetchedAt: string;
}

export interface NativeFilingsClientOptions {
  readonly fetcher?: typeof fetch;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

const BASE_URL = 'https://api.financialdatasets.ai';
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;
const ACCESSION_PATTERN = /^[0-9]{10}-[0-9]{2}-[0-9]{6}$/;
const ITEM_PATTERN = /^(?:Item-[0-9]{1,2}[A-Z]?|Part-[12],Item-[0-9]{1,2}[A-Z]?)$/;
const ALL_TYPES: readonly NativeFilingType[] = ['10-K', '10-Q', '8-K'];

const ALIASES: Readonly<Record<string, string>> = {
  apple: 'AAPL', tesla: 'TSLA', microsoft: 'MSFT', amazon: 'AMZN',
  google: 'GOOGL', alphabet: 'GOOGL', meta: 'META', facebook: 'META', nvidia: 'NVDA',
};

function fail(message: string): never { throw new Error(message); }

function normalizeTicker(input: string): string {
  const trimmed = input.trim();
  const alias = ALIASES[trimmed.toLowerCase()];
  const ticker = (alias ?? trimmed).toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) fail('ticker must be a valid US ticker or supported company name');
  return ticker;
}

function inferTicker(query: string): string {
  const words = query.match(/[A-Za-z][A-Za-z0-9.-]{0,9}/g) ?? [];
  for (const word of words) {
    const alias = ALIASES[word.toLowerCase()];
    if (alias) return alias;
    const candidate = word.toUpperCase();
    if (TICKER_PATTERN.test(candidate) && /[A-Z]/.test(candidate) && candidate.length <= 5) return candidate;
  }
  fail('ticker is required; provide ticker explicitly or include a supported company/ticker in query');
}

function inferFilingTypes(query: string, requested?: readonly NativeFilingType[]): readonly NativeFilingType[] {
  if (requested?.length) {
    const unique = [...new Set(requested)];
    if (unique.some((value) => !ALL_TYPES.includes(value))) fail('filing_types contains an unsupported filing type');
    return unique;
  }
  const value = query.toLowerCase();
  const result: NativeFilingType[] = [];
  if (/(quarter|quarterly|10-q|季度|季报)/.test(value)) result.push('10-Q');
  if (/(current event|material event|acquisition|8-k|重大事件|收购|公告)/.test(value)) result.push('8-K');
  if (/(annual|annual report|10-k|risk factor|business description|md&a|年报|风险因素|业务描述)/.test(value)) result.push('10-K');
  return result.length ? result : ['10-K', '10-Q', '8-K'];
}

function inferItems(query: string, filingType: NativeFilingType, explicit?: readonly string[]): readonly string[] | undefined {
  if (filingType === '8-K') return undefined;
  if (explicit?.length) {
    const items = [...new Set(explicit)];
    if (items.length > 10 || items.some((item) => !ITEM_PATTERN.test(item))) fail('items contains an unsupported filing item');
    return items;
  }
  const value = query.toLowerCase();
  if (/(risk|风险)/.test(value)) return filingType === '10-K' ? ['Item-1A'] : ['Part-2,Item-1A'];
  if (/(business|operations|业务|经营)/.test(value)) return filingType === '10-K' ? ['Item-1'] : ['Part-1,Item-1'];
  if (/(management|md&a|经营分析|管理层)/.test(value)) return filingType === '10-K' ? ['Item-7'] : ['Part-1,Item-2'];
  if (/(financial statement|财务报表|financials)/.test(value)) return filingType === '10-K' ? ['Item-8'] : ['Part-1,Item-1'];
  return filingType === '10-K' ? ['Item-1', 'Item-1A', 'Item-7'] : ['Part-1,Item-1', 'Part-1,Item-2'];
}

function validateInput(input: NativeReadFilingsInput): { ticker: string; filingTypes: readonly NativeFilingType[]; limit: number } {
  if (!input.query.trim() || input.query.length > 500) fail('query must contain between 1 and 500 characters');
  const ticker = input.ticker ? normalizeTicker(input.ticker) : inferTicker(input.query);
  const filingTypes = inferFilingTypes(input.query, input.filing_types);
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) fail('limit must be an integer between 1 and 10');
  return { ticker, filingTypes, limit };
}

export class NativeFilingsClient {
  private readonly fetcher: typeof fetch;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: NativeFilingsClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.apiKey = options.apiKey ?? process.env.FINANCIAL_DATASETS_API_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/$/, '');
  }

  async read(input: NativeReadFilingsInput, signal?: AbortSignal): Promise<NativeReadFilingsResult> {
    if (signal?.aborted) fail('read_filings request aborted');
    const { ticker, filingTypes, limit } = validateInput(input);
    if (!this.apiKey) fail('FINANCIAL_DATASETS_API_KEY is required for read_filings');
    const metadataUrl = this.url('/filings/', { ticker, filing_type: filingTypes, limit });
    const metadata = await this.request(metadataUrl, signal);
    const filings = Array.isArray(metadata.filings) ? metadata.filings.slice(0, limit) as NativeFilingRecord[] : [];
    const content: Record<string, unknown>[] = [];
    const sourceUrls = [metadataUrl];
    for (const filing of filings.slice(0, 3)) {
      if (signal?.aborted) fail('read_filings request aborted');
      const filingType = filing.filing_type;
      const accession = filing.accession_number;
      if (!filingType || !ALL_TYPES.includes(filingType) || !accession || !ACCESSION_PATTERN.test(accession)) continue;
      const items = inferItems(input.query, filingType, input.items);
      const contentUrl = this.url('/filings/items/', { ticker, filing_type: filingType, accession_number: accession, item: items });
      const payload = await this.request(contentUrl, signal);
      content.push({ accession_number: accession, filing_type: filingType, data: payload });
      sourceUrls.push(contentUrl);
    }
    return { ticker, filingTypes, filings, content, sourceUrls, fetchedAt: new Date().toISOString() };
  }

  private url(path: string, params: Record<string, string | number | readonly string[] | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
    return url.toString();
  }

  private async request(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await this.fetcher(url, { signal, headers: { 'x-api-key': this.apiKey } });
    if (!response.ok) throw new Error(`Financial Datasets filing request failed: ${response.status} ${response.statusText}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Financial Datasets filing response was not an object');
    return value as Record<string, unknown>;
  }
}

export function readNativeFilings(input: NativeReadFilingsInput, signal?: AbortSignal, options?: NativeFilingsClientOptions): Promise<NativeReadFilingsResult> {
  return new NativeFilingsClient(options).read(input, signal);
}
