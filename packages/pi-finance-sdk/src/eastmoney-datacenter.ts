/**
 * Shared plumbing for the public Eastmoney (东方财富) data endpoints.
 *
 * `datacenter-web.eastmoney.com` (financial reports), `np-anotice-stock`
 * (announcements) and `np-listapi` (market news) are queried by the finance
 * tools for CN/HK research. Every read goes through the shared per-host gate
 * from `@upup/pi-observability`: bursting these hosts makes them drop the
 * connection for minutes instead of answering an HTTP error.
 */
import { hostGateFor } from '@upup/pi-observability';

export const EASTMONEY_DATACENTER_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
export const EASTMONEY_ANNOUNCEMENTS_URL = 'https://np-anotice-stock.eastmoney.com/api/security/ann';
export const EASTMONEY_FAST_NEWS_URL = 'https://np-listapi.eastmoney.com/comm/web/getFastNewsList';
export const EASTMONEY_USER_AGENT = 'UpUp-Pi-Finance/1.0';

export type EastmoneyFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EastmoneyReadOptions {
  readonly fetcher?: EastmoneyFetcher;
  readonly signal?: AbortSignal;
  readonly userAgent?: string;
}

/** Reads one public Eastmoney JSON document, serialized through the host gate. */
export async function readEastmoneyJson(url: URL, options: EastmoneyReadOptions = {}): Promise<Record<string, unknown>> {
  if (options.signal?.aborted) throw new DOMException('Eastmoney request aborted', 'AbortError');
  const fetcher: EastmoneyFetcher = options.fetcher ?? fetch;
  const gate = hostGateFor(url);
  const response = await gate.run(() => fetcher(url, {
    ...(options.signal ? { signal: options.signal } : {}),
    headers: { Accept: 'application/json', 'User-Agent': options.userAgent ?? EASTMONEY_USER_AGENT },
  }));
  if (!response.ok) throw new Error(`Eastmoney request failed: ${response.status} ${response.statusText} (${url.host}${url.pathname})`);
  return await response.json() as Record<string, unknown>;
}

/** Builds a 东方财富数据中心 report query sorted newest-first. */
export function eastmoneyDatacenterUrl(reportName: string, filter: string, sortColumn: string, pageSize: number): URL {
  const url = new URL(EASTMONEY_DATACENTER_URL);
  url.searchParams.set('reportName', reportName);
  url.searchParams.set('columns', 'ALL');
  url.searchParams.set('filter', filter);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('sortColumns', sortColumn);
  url.searchParams.set('sortTypes', '-1');
  url.searchParams.set('source', 'WEB');
  url.searchParams.set('client', 'WEB');
  return url;
}

/** Rows of a `{ result: { data: [...] } }` datacenter payload. */
export function eastmoneyRecords(payload: unknown): readonly Record<string, unknown>[] {
  const data = (payload as { result?: { data?: unknown } } | undefined)?.result?.data;
  return Array.isArray(data) ? (data as readonly Record<string, unknown>[]) : [];
}

export function eastmoneyNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Keeps only the present numbers, so absent upstream fields stay absent. */
export function eastmoneyNumbers<K extends string>(spec: Record<K, unknown>): Partial<Record<K, number>> {
  const output: Partial<Record<K, number>> = {};
  for (const [key, value] of Object.entries(spec)) {
    const parsed = eastmoneyNumber(value);
    if (parsed !== undefined) output[key as K] = parsed;
  }
  return output;
}

export function eastmoneyDate(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/u.test(text) ? text : fallback;
}

/** A-share `600519.SH` → `1.600519`, Hong Kong `00700.HK` → `116.00700`. */
export function eastmoneySecid(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  if (normalized.endsWith('.HK')) return `116.${normalized.replace(/\.HK$/u, '').padStart(5, '0')}`;
  const [code = '', suffix] = normalized.split('.');
  const exchange = suffix ?? (code.startsWith('6') ? 'SH' : 'SZ');
  return `${exchange === 'SH' ? '1' : '0'}.${code}`;
}
