/**
 * Real Eastmoney (东方财富) research-data provider.
 *
 * The Pi finance client speaks the Financial Datasets URL contract
 * (`/prices/snapshot/`, `/financial-metrics/snapshot/`, `/analyst-estimates/`,
 * `/earnings`, `/filings/`). This adapter maps those paths onto the public
 * Eastmoney endpoints that need no credentials, so `market=cn`/`hk` research
 * works without a Tushare token:
 *
 * - prices → `push2.eastmoney.com` quote, falling back to the last daily close
 *   on `push2his` when the quote host refuses the connection.
 * - financial metrics / earnings → 业绩报表 (`RPT_LICO_FN_CPD`) for A-shares and
 *   主要指标 (`RPT_HKF10_FN_MAININDICATOR`) for Hong Kong.
 * - analyst estimates → broker reports (A-share only; Eastmoney publishes no
 *   Hong Kong research list, so HK returns an empty list with an explicit note).
 * - filings → 公告 announcements per `stock_list`.
 */
import {
  type EastmoneyFetcher,
  readEastmoneyJson,
  eastmoneyDatacenterUrl,
  eastmoneyRecords,
  eastmoneyNumbers,
  eastmoneyDate,
  eastmoneySecid,
} from './eastmoney-datacenter';

export type EastmoneyResearchMarket = 'cn' | 'hk';

export interface EastmoneyResearchFetcherOptions {
  readonly market?: EastmoneyResearchMarket;
  readonly fetcher?: EastmoneyFetcher;
  readonly now?: () => Date;
}

const EASTMONEY_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/stock/get';
const EASTMONEY_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const EASTMONEY_REPORTS_URL = 'https://reportapi.eastmoney.com/report/list';
const EASTMONEY_ANNOUNCEMENTS_URL = 'https://np-anotice-stock.eastmoney.com/api/security/ann';
/** f43 last, f58 name, f59 decimals, f60 previous close, f86 update time. */
const EASTMONEY_QUOTE_FIELDS = 'f43,f58,f59,f60,f86';

interface EastmoneyTarget {
  readonly ticker: string;
  readonly code: string;
  readonly secid: string;
  readonly currency: 'CNY' | 'HKD';
}

/** `600519.SH` → `1.600519`, `00700.HK` → `116.00700`. */
export function eastmoneyResearchTarget(ticker: string, market: EastmoneyResearchMarket): EastmoneyTarget {
  const normalized = ticker.trim().toUpperCase();
  if (market === 'hk' || normalized.endsWith('.HK')) {
    const code = normalized.replace(/\.HK$/u, '').padStart(5, '0');
    return { ticker: `${code}.HK`, code, secid: eastmoneySecid(`${code}.HK`), currency: 'HKD' };
  }
  const [rawCode = '', rawSuffix] = normalized.split('.');
  const exchange = rawSuffix ?? (rawCode.startsWith('6') ? 'SH' : 'SZ');
  const code = `${rawCode}.${exchange}`;
  return { ticker: code, code: rawCode, secid: eastmoneySecid(code), currency: 'CNY' };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/** Adapts the public Eastmoney research endpoints to the market fetch contract. */
export function createEastmoneyResearchDataFetcher(options: EastmoneyResearchFetcherOptions = {}): typeof fetch {
  const market = options.market ?? 'cn';
  const now = options.now ?? (() => new Date());
  const today = (): string => now().toISOString().slice(0, 10);
  const read = (url: URL, signal?: AbortSignal): Promise<Record<string, unknown>> =>
    readEastmoneyJson(url, { ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(signal ? { signal } : {}) });

  const financialRows = async (target: EastmoneyTarget, pageSize: number, signal?: AbortSignal): Promise<{ rows: readonly Record<string, unknown>[]; sourceUrl: string }> => {
    const url = market === 'hk'
      ? eastmoneyDatacenterUrl('RPT_HKF10_FN_MAININDICATOR', `(SECUCODE="${target.ticker}")`, 'STD_REPORT_DATE', pageSize)
      : eastmoneyDatacenterUrl('RPT_LICO_FN_CPD', `(SECUCODE="${target.ticker}")`, 'REPORTDATE', pageSize);
    const payload = await read(url, signal);
    const rows = eastmoneyRecords(payload).map((row) => market === 'hk'
      ? {
        ticker: target.ticker,
        name: row.SECURITY_NAME_ABBR,
        report_date: eastmoneyDate(row.STD_REPORT_DATE, eastmoneyDate(row.REPORT_DATE, today())),
        period: row.REPORT_TYPE,
        ...eastmoneyNumbers({
          revenue: row.OPERATE_INCOME,
          net_income: row.HOLDER_PROFIT,
          eps: row.BASIC_EPS,
          gross_margin_pct: row.GROSS_PROFIT_RATIO,
          book_value_per_share: row.BPS,
          revenue_yoy_pct: row.OPERATE_INCOME_YOY,
          net_income_yoy_pct: row.HOLDER_PROFIT_YOY,
          operating_cashflow_per_share: row.PER_NETCASH_OPERATE,
        }),
        source: 'eastmoney',
      }
      : {
        ticker: target.ticker,
        name: row.SECURITY_NAME_ABBR,
        report_date: eastmoneyDate(row.REPORTDATE, today()),
        period: row.DATATYPE ?? row.DATEMMDD,
        industry: row.BOARD_NAME ?? row.PUBLISHNAME,
        ...eastmoneyNumbers({
          revenue: row.TOTAL_OPERATE_INCOME,
          net_income: row.PARENT_NETPROFIT,
          eps: row.BASIC_EPS,
          roe_pct: row.WEIGHTAVG_ROE,
          gross_margin_pct: row.XSMLL,
          book_value_per_share: row.BPS,
          operating_cashflow_per_share: row.MGJYXJJE,
          revenue_yoy_pct: row.YSTZ,
          net_income_yoy_pct: row.SJLTZ,
        }),
        source: 'eastmoney',
      });
    return { rows, sourceUrl: url.toString() };
  };

  const priceSnapshot = async (target: EastmoneyTarget, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    // 实时行情 (`push2`) 与日线 (`push2his`) 是同一机房同 IP 段；任一被该机
    // 房限流后，另一接口往往也会触发 ECONNRESET。`getResearchData` 把价格/
    // 比率/研报/财报/公告 5 个调用 `Promise.all`，单接口失败会让其它 4 个
    // 已成功的调用也一起作废。两接口都不可用时返回带 `note` 的空快照，
    // 让上层工作流继续拿到财务/公告等关键数据，价空缺只在 dossier 里显眼。
    const quoteAttempt = async (): Promise<Record<string, unknown> | undefined> => {
      const quoteUrl = new URL(EASTMONEY_QUOTE_URL);
      quoteUrl.searchParams.set('secid', target.secid);
      quoteUrl.searchParams.set('fields', EASTMONEY_QUOTE_FIELDS);
      const payload = await read(quoteUrl, signal);
      const data = (payload as { data?: Record<string, unknown> | null }).data ?? undefined;
      const decimals = eastmoneyNumbers({ decimals: data?.f59 }).decimals ?? 2;
      const scale = (value: unknown): number | undefined => {
        const raw = eastmoneyNumbers({ raw: value }).raw;
        return raw === undefined ? undefined : Number((raw / 10 ** decimals).toFixed(6));
      };
      const price = scale(data?.f43);
      if (price === undefined || price <= 0) return undefined;
      return {
        snapshot: {
          ticker: target.ticker,
          price,
          currency: target.currency,
          name: data?.f58,
          ...eastmoneyNumbers({ previous_close: scale(data?.f60) }),
          as_of: eastmoneyDate(new Date((eastmoneyNumbers({ at: data?.f86 }).at ?? 0) * 1000).toISOString(), today()),
          provider: 'eastmoney',
          source_url: quoteUrl.toString(),
        },
        sourceUrls: [quoteUrl.toString()],
      };
    };
    const klineAttempt = async (): Promise<Record<string, unknown> | undefined> => {
      const klineUrl = new URL(EASTMONEY_KLINE_URL);
      klineUrl.searchParams.set('secid', target.secid);
      klineUrl.searchParams.set('klt', '101');
      klineUrl.searchParams.set('fqt', '1');
      klineUrl.searchParams.set('beg', '0');
      klineUrl.searchParams.set('end', '20500101');
      klineUrl.searchParams.set('lmt', '1');
      klineUrl.searchParams.set('fields1', 'f1');
      klineUrl.searchParams.set('fields2', 'f51,f53');
      const payload = await read(klineUrl, signal);
      const row = ((payload as { data?: { klines?: readonly string[] } | null }).data?.klines ?? []).at(-1) ?? '';
      const [date, close] = row.split(',');
      const price = eastmoneyNumbers({ price: close }).price;
      if (price === undefined || price <= 0) return undefined;
      return {
        snapshot: {
          ticker: target.ticker,
          price,
          currency: target.currency,
          as_of: eastmoneyDate(date, today()),
          provider: 'eastmoney',
          source_url: klineUrl.toString(),
          note: '行情接口不可用，退回最近一个交易日收盘价。',
        },
        sourceUrls: [klineUrl.toString()],
      };
    };
    try {
      const fromQuote = await quoteAttempt();
      if (fromQuote) return fromQuote;
    } catch {
      // Quote host dropped the connection; fall through to the kline host.
    }
    try {
      const fromKline = await klineAttempt();
      if (fromKline) return fromKline;
    } catch {
      // Both hosts rejected us. Return an empty snapshot so the parallel
      // getResearchData call still surfaces keyRatios/earnings/filings.
    }
    return {
      snapshot: {
        ticker: target.ticker,
        price: null,
        currency: target.currency,
        as_of: today(),
        provider: 'eastmoney',
        source_url: '',
        note: '行情接口（push2 + push2his）当前均处于限流冷却，价格快照暂不可用；财务与公告仍可访问。',
      },
      sourceUrls: [],
    };
  };

  const analystEstimates = async (target: EastmoneyTarget, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    if (market === 'hk') return { analyst_estimates: [], note: '东方财富研报接口仅覆盖 A 股，港股暂无券商一致预期。', sourceUrls: [] };
    const url = new URL(EASTMONEY_REPORTS_URL);
    const end = now();
    const begin = new Date(end.getTime() - 366 * 24 * 60 * 60 * 1000);
    url.searchParams.set('pageSize', '5');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('qType', '0');
    url.searchParams.set('code', target.code);
    url.searchParams.set('beginTime', begin.toISOString().slice(0, 10));
    url.searchParams.set('endTime', end.toISOString().slice(0, 10));
    const payload = await read(url, signal);
    const rows = (payload as { data?: unknown }).data;
    const estimates = (Array.isArray(rows) ? rows : []).map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        ticker: target.ticker,
        report_date: eastmoneyDate(row.publishDate, today()),
        institution: row.orgSName,
        title: row.title,
        rating: row.emRatingName,
        analyst: row.researcher,
        industry: row.indvInduName,
        ...eastmoneyNumbers({
          eps_estimate_this_year: row.predictThisYearEps,
          pe_estimate_this_year: row.predictThisYearPe,
          eps_estimate_next_year: row.predictNextYearEps,
          pe_estimate_next_year: row.predictNextYearPe,
        }),
        source: 'eastmoney',
      };
    });
    return { analyst_estimates: estimates, sourceUrls: [url.toString()], ...(estimates.length === 0 ? { note: '东方财富研报接口最近一年没有该标的的券商研报。' } : {}) };
  };

  const filings = async (target: EastmoneyTarget, limit: number, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    if (market === 'hk') return { filings: [], note: '东方财富公告接口仅覆盖 A 股，港股公告请以交易所披露为准。', sourceUrls: [] };
    const url = new URL(EASTMONEY_ANNOUNCEMENTS_URL);
    url.searchParams.set('sr', '-1');
    url.searchParams.set('page_size', String(Math.min(Math.max(limit, 1), 50)));
    url.searchParams.set('page_index', '1');
    url.searchParams.set('ann_type', 'A');
    url.searchParams.set('client_source', 'web');
    url.searchParams.set('stock_list', target.code);
    const payload = await read(url, signal);
    const list = (payload as { data?: { list?: unknown } }).data?.list;
    const items = (Array.isArray(list) ? list : []).map((entry) => {
      const row = entry as Record<string, unknown>;
      const artCode = typeof row.art_code === 'string' ? row.art_code : '';
      const columns = Array.isArray(row.columns) ? row.columns as readonly Record<string, unknown>[] : [];
      return {
        ticker: target.ticker,
        id: artCode,
        title: row.title,
        category: columns[0]?.column_name,
        published_at: eastmoneyDate(row.notice_date, today()),
        type: 'announcement',
        url: artCode ? `https://data.eastmoney.com/notices/detail/${target.code}/${artCode}.html` : undefined,
        source: 'eastmoney',
      };
    });
    return { filings: items, sourceUrls: [url.toString()] };
  };

  const request: typeof fetch = (async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const signal = init?.signal ?? undefined;
    const target = eastmoneyResearchTarget(url.searchParams.get('ticker') ?? '', market);
    const limit = eastmoneyNumbers({ limit: url.searchParams.get('limit') }).limit ?? 10;
    const pathname = url.pathname.replace(/\/+$/u, '');
    if (signal?.aborted) throw new DOMException('Eastmoney research request aborted', 'AbortError');
    if (pathname === '/prices/snapshot') return jsonResponse(await priceSnapshot(target, signal));
    if (pathname === '/financial-metrics/snapshot') {
      const { rows, sourceUrl } = await financialRows(target, 5, signal);
      return jsonResponse({ snapshot: rows[0] ?? null, financial_metrics: rows, sourceUrls: [sourceUrl] });
    }
    if (pathname === '/earnings') {
      const { rows, sourceUrl } = await financialRows(target, 5, signal);
      return jsonResponse({ snapshot: rows[0] ?? null, earnings: rows, sourceUrls: [sourceUrl] });
    }
    if (pathname === '/analyst-estimates') return jsonResponse(await analystEstimates(target, signal));
    if (pathname === '/filings') return jsonResponse(await filings(target, limit, signal));
    return jsonResponse({ error: `Eastmoney research adapter does not implement ${pathname}`, ticker: target.ticker }, 404);
  }) as typeof fetch;
  return request;
}
