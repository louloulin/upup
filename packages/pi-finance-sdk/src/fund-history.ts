export interface NativeFundHistoryPoint {
  readonly date: string;
  readonly nav: number;
  readonly accumulated: number;
  readonly dailyReturn: number;
}

export interface NativeFundHistoryClientOptions {
  readonly fetcher?: typeof fetch;
  readonly baseUrl?: string;
  readonly pageSize?: number;
  readonly interPageDelayMs?: number;
}

interface FundHistoryItem {
  readonly FSRQ?: unknown;
  readonly DWJZ?: unknown;
  readonly LJJZ?: unknown;
  readonly JZZZL?: unknown;
}

interface FundHistoryResponse {
  readonly Data?: {
    readonly LSJZList?: readonly FundHistoryItem[];
  };
}

function fundCode(value: string): string {
  const normalized = value.trim();
  if (!/^\d{6}$/.test(normalized)) throw new Error('fundCode must be a six-digit fund code');
  return normalized;
}

function numberValue(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePoint(item: FundHistoryItem): NativeFundHistoryPoint | undefined {
  const date = typeof item.FSRQ === 'string' ? item.FSRQ : '';
  const nav = numberValue(item.DWJZ);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || nav <= 0) return undefined;
  return { date, nav, accumulated: numberValue(item.LJJZ), dailyReturn: numberValue(item.JZZZL) };
}

export class NativeFundHistoryClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly interPageDelayMs: number;

  constructor(options: NativeFundHistoryClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = (options.baseUrl ?? 'https://api.fund.eastmoney.com/f10/lsjz').replace(/\/$/, '');
    this.pageSize = options.pageSize ?? 20;
    this.interPageDelayMs = options.interPageDelayMs ?? 100;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 100) throw new Error('pageSize must be an integer between 1 and 100');
    if (!Number.isInteger(this.interPageDelayMs) || this.interPageDelayMs < 0 || this.interPageDelayMs > 10_000) throw new Error('interPageDelayMs must be between 0 and 10000');
  }

  async getPage(code: string, pageIndex = 1, signal?: AbortSignal): Promise<readonly NativeFundHistoryPoint[]> {
    const normalizedCode = fundCode(code);
    if (!Number.isInteger(pageIndex) || pageIndex < 1 || pageIndex > 10_000) throw new Error('pageIndex must be an integer between 1 and 10000');
    if (signal?.aborted) throw new Error('fund history request aborted');
    const url = new URL(this.baseUrl);
    url.searchParams.set('fundCode', normalizedCode);
    url.searchParams.set('pageIndex', String(pageIndex));
    url.searchParams.set('pageSize', String(this.pageSize));
    const response = await this.fetcher(url, {
      signal,
      headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': 'UpUp-Pi-Finance/1.0' },
    });
    if (!response.ok) throw new Error(`fund history request failed: ${response.status} ${response.statusText}`);
    const payload = await response.json() as FundHistoryResponse;
    return (payload.Data?.LSJZList ?? []).map(normalizePoint).filter((point): point is NativeFundHistoryPoint => Boolean(point));
  }

  async getFullHistory(code: string, maxPages = 10, signal?: AbortSignal): Promise<readonly NativeFundHistoryPoint[]> {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('maxPages must be an integer between 1 and 100');
    const result: NativeFundHistoryPoint[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const points = await this.getPage(code, page, signal);
      result.push(...points);
      if (points.length < this.pageSize || page === maxPages) break;
      if (this.interPageDelayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, this.interPageDelayMs));
    }
    return result;
  }
}

export async function getNativeFundHistoryForRange(
  code: string,
  startDate: string,
  endDate: string,
  options: NativeFundHistoryClientOptions & { readonly signal?: AbortSignal } = {},
): Promise<readonly NativeFundHistoryPoint[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error('startDate and endDate must be ordered ISO dates');
  const history = await new NativeFundHistoryClient(options).getFullHistory(code, 10, options.signal);
  return history.filter((point) => point.date >= startDate && point.date <= endDate);
}
