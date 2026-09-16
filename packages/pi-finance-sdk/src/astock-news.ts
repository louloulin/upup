/**
 * Real A-share announcements and market headlines from Eastmoney.
 *
 * A symbol query reads the public 公告接口 (`np-anotice-stock`), which returns
 * the exchange filings for that `stock_list` (`ann_type=A`). The `market` query
 * reads the 7×24 快讯 list (`np-listapi`). The previous implementation served a
 * seven-row fixture table under `upup-fixture://`; this one returns whatever the
 * provider published, with the request URLs recorded as evidence.
 */
import { type EastmoneyFetcher, EASTMONEY_ANNOUNCEMENTS_URL, EASTMONEY_FAST_NEWS_URL, eastmoneyDate, readEastmoneyJson } from './eastmoney-datacenter';
import { normalizeNativeAStockCode } from './astock-financials';

export type NativeAStockNewsKind = 'announcement' | 'market';

export interface NativeAStockNewsItem {
  id: string;
  tsCode?: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  kind: NativeAStockNewsKind;
  url?: string;
}

export interface NativeAStockNewsQuery {
  code?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface NativeAStockNewsOptions {
  readonly fetcher?: EastmoneyFetcher;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

export interface NativeAStockNewsResult {
  type: NativeAStockNewsKind;
  tsCode?: string;
  asOf: string;
  count: number;
  items: NativeAStockNewsItem[];
  sourceUrls: readonly string[];
}

function normalizeDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new Error(`${field} must be an ISO date (YYYY-MM-DD) or compact date (YYYYMMDD)`);
  }
  return normalized;
}

export async function fetchNativeAStockNews(query: NativeAStockNewsQuery = {}, options: NativeAStockNewsOptions = {}): Promise<NativeAStockNewsResult> {
  const startDate = normalizeDate(query.startDate, 'startDate');
  const endDate = normalizeDate(query.endDate, 'endDate');
  if (startDate && endDate && startDate > endDate) throw new Error('startDate must not be after endDate');
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const now = options.now ?? (() => new Date());
  const today = now().toISOString().slice(0, 10);
  const requested = query.code?.trim();
  const isMarket = !requested || requested.toLowerCase() === 'market';
  const read = (url: URL) => readEastmoneyJson(url, { ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.signal ? { signal: options.signal } : {}) });
  const keep = (item: NativeAStockNewsItem): boolean =>
    (!startDate || item.publishedAt >= startDate) && (!endDate || item.publishedAt <= endDate);

  if (isMarket) {
    const url = new URL(EASTMONEY_FAST_NEWS_URL);
    url.searchParams.set('client', 'web');
    url.searchParams.set('biz', 'web_724');
    url.searchParams.set('fastColumn', '102');
    url.searchParams.set('sortEnd', '');
    url.searchParams.set('pageSize', String(Math.min(limit * 2, 100)));
    url.searchParams.set('req_trace', '1');
    const payload = await read(url);
    const list = (payload as { data?: { fastNewsList?: unknown } }).data?.fastNewsList;
    const items = (Array.isArray(list) ? list : [])
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        const id = typeof row.code === 'string' ? row.code : '';
        return {
          id,
          title: typeof row.title === 'string' ? row.title : '',
          summary: typeof row.summary === 'string' ? row.summary : '',
          source: 'eastmoney',
          publishedAt: eastmoneyDate(typeof row.showTime === 'string' ? row.showTime.replace(' ', 'T') : undefined, today),
          kind: 'market' as const,
        };
      })
      .filter((item) => item.id !== '' && item.title !== '')
      .filter(keep)
      .slice(0, limit);
    return { type: 'market', asOf: items[0]?.publishedAt ?? today, count: items.length, items, sourceUrls: [url.toString()] };
  }

  const ticker = normalizeNativeAStockCode(requested!);
  if (!ticker) throw new Error(`get_astock_news 的 code 需要 A 股代码（如 600519.SH）、中文名或 market，收到：${requested}`);
  const url = new URL(EASTMONEY_ANNOUNCEMENTS_URL);
  url.searchParams.set('sr', '-1');
  url.searchParams.set('page_size', String(Math.min(limit * 2, 100)));
  url.searchParams.set('page_index', '1');
  url.searchParams.set('ann_type', 'A');
  url.searchParams.set('client_source', 'web');
  url.searchParams.set('stock_list', ticker.slice(0, 6));
  const payload = await read(url);
  const list = (payload as { data?: { list?: unknown } }).data?.list;
  const items = (Array.isArray(list) ? list : [])
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const artCode = typeof row.art_code === 'string' ? row.art_code : '';
      const columns = Array.isArray(row.columns) ? row.columns as readonly Record<string, unknown>[] : [];
      const category = columns[0]?.column_name;
      return {
        id: artCode,
        tsCode: ticker,
        title: typeof row.title === 'string' ? row.title : '',
        summary: typeof category === 'string' ? category : (typeof row.title === 'string' ? row.title : ''),
        source: 'eastmoney',
        publishedAt: eastmoneyDate(row.notice_date, today),
        kind: 'announcement' as const,
        ...(artCode ? { url: `https://data.eastmoney.com/notices/detail/${ticker.slice(0, 6)}/${artCode}.html` } : {}),
      };
    })
    .filter((item) => item.id !== '' && item.title !== '')
    .filter(keep)
    .slice(0, limit);
  return { type: 'announcement', tsCode: ticker, asOf: items[0]?.publishedAt ?? today, count: items.length, items, sourceUrls: [url.toString()] };
}
