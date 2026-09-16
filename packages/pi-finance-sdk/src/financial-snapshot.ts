/**
 * Real company financial statements for `get_financials`.
 *
 * A-shares read the 东方财富数据中心 income / balance / cash-flow reports
 * (`fetchNativeAStockFinancials`), Hong Kong reads the 主要指标 report through the
 * shared Eastmoney research adapter. US statements come from Financial Datasets,
 * which needs `FINANCIAL_DATASETS_API_KEY`; without it the tool fails closed with
 * an actionable message instead of returning a fixture.
 */
import { fetchNativeAStockFinancials, normalizeNativeAStockCode } from './astock-financials';
import { createEastmoneyResearchDataFetcher } from './eastmoney-research';
import type { EastmoneyFetcher } from './eastmoney-datacenter';

export interface NativeFinancialPeriod {
  period: string;
  reportDate: string;
  revenue?: number;
  netIncome?: number;
  eps?: number;
  grossMargin?: number;
  roe?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  operatingCashflow?: number;
}

export interface NativeFinancialSnapshot {
  symbol: string;
  company: string;
  market: 'cn' | 'hk' | 'us';
  asOf: string;
  periods: NativeFinancialPeriod[];
  metrics: {
    latestRevenue?: number;
    latestNetIncome?: number;
    latestEps?: number;
    latestRoe?: number;
    latestGrossMargin?: number;
    debtToAssets?: number;
  };
  scope: 'eastmoney-public-reports';
  sourceUrls: readonly string[];
}

export interface NativeFinancialSnapshotOptions {
  readonly fetcher?: EastmoneyFetcher;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

/** Company-name aliases resolved before the tool hits the network. */
const ALIASES: Readonly<Record<string, string>> = {
  apple: 'AAPL', 苹果: 'AAPL', microsoft: 'MSFT', 微软: 'MSFT', tesla: 'TSLA', 特斯拉: 'TSLA', nvidia: 'NVDA', 英伟达: 'NVDA',
  比亚迪: '002594.SZ', 贵州茅台: '600519.SH', 茅台: '600519.SH', 宁德时代: '300750.SZ', 腾讯: '00700.HK', 腾讯控股: '00700.HK',
};

export function normalizeNativeFinancialSymbol(query: string): string | undefined {
  const trimmed = query.trim();
  const alias = Object.entries(ALIASES).find(([name]) => trimmed.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  if (alias) return alias[1];
  const aStock = trimmed.match(/\b\d{6}(?:\.(?:SH|SZ|BJ))?\b/u)?.[0];
  if (aStock) return normalizeNativeAStockCode(aStock);
  const hk = trimmed.match(/\b\d{4,5}\.HK\b/iu)?.[0];
  if (hk) return hk.toUpperCase();
  return trimmed.match(/\b[A-Z]{1,5}\b/u)?.[0];
}

function metricsOf(periods: readonly NativeFinancialPeriod[]): NativeFinancialSnapshot['metrics'] {
  const latest = periods[0];
  if (!latest) return {};
  const debtToAssets = latest.totalAssets && latest.totalLiabilities !== undefined
    ? Number((latest.totalLiabilities / latest.totalAssets).toFixed(4))
    : undefined;
  return {
    ...(latest.revenue === undefined ? {} : { latestRevenue: latest.revenue }),
    ...(latest.netIncome === undefined ? {} : { latestNetIncome: latest.netIncome }),
    ...(latest.eps === undefined ? {} : { latestEps: latest.eps }),
    ...(latest.roe === undefined ? {} : { latestRoe: latest.roe }),
    ...(latest.grossMargin === undefined ? {} : { latestGrossMargin: latest.grossMargin }),
    ...(debtToAssets === undefined ? {} : { debtToAssets }),
  };
}

export async function fetchNativeFinancialSnapshot(query: string, options: NativeFinancialSnapshotOptions = {}): Promise<NativeFinancialSnapshot> {
  const symbol = normalizeNativeFinancialSymbol(query);
  if (!symbol) throw new Error(`get_financials 无法从 “${query}” 解析出证券代码；请给出代码（如 600519.SH / 00700.HK）或公司名。`);
  const now = options.now ?? (() => new Date());
  const today = now().toISOString().slice(0, 10);
  const aStock = normalizeNativeAStockCode(symbol);
  if (aStock) {
    const financials = await fetchNativeAStockFinancials(aStock, { ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.signal ? { signal: options.signal } : {}), now, limit: 4 });
    return {
      symbol: financials.ts_code,
      company: financials.name,
      market: 'cn',
      asOf: financials.asOf,
      periods: financials.periods.map((period) => ({ ...period, reportDate: period.reportDate })),
      metrics: metricsOf(financials.periods),
      scope: 'eastmoney-public-reports',
      sourceUrls: financials.sourceUrls,
    };
  }
  if (symbol.endsWith('.HK')) {
    const adapter = createEastmoneyResearchDataFetcher({ market: 'hk', ...(options.fetcher ? { fetcher: options.fetcher } : {}), now });
    const response = await adapter(`https://api.financialdatasets.ai/financial-metrics/snapshot/?ticker=${encodeURIComponent(symbol)}`, { ...(options.signal ? { signal: options.signal } : {}) });
    const payload = await response.json() as { financial_metrics?: readonly Record<string, unknown>[] };
    const rows = payload.financial_metrics ?? [];
    if (rows.length === 0) throw new Error(`东方财富财报接口没有 ${symbol} 的报告数据`);
    const periods: NativeFinancialPeriod[] = rows.map((row) => ({
      period: String(row.report_date ?? today).slice(0, 4),
      reportDate: String(row.report_date ?? today),
      ...(typeof row.revenue === 'number' ? { revenue: row.revenue } : {}),
      ...(typeof row.net_income === 'number' ? { netIncome: row.net_income } : {}),
      ...(typeof row.eps === 'number' ? { eps: row.eps } : {}),
      ...(typeof row.gross_margin_pct === 'number' ? { grossMargin: row.gross_margin_pct } : {}),
    }));
    return {
      symbol,
      company: typeof rows[0]?.name === 'string' ? rows[0].name : symbol,
      market: 'hk',
      asOf: periods[0]!.reportDate,
      periods,
      metrics: metricsOf(periods),
      scope: 'eastmoney-public-reports',
      sourceUrls: [`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_HKF10_FN_MAININDICATOR&filter=(SECUCODE="${symbol}")`],
    };
  }
  throw new Error(
    `${symbol} 是美股代码：美股财务报表需要 FINANCIAL_DATASETS_API_KEY（当前未配置）。` +
    'A 股 / 港股财务数据由东方财富公开财报提供，可直接查询；美股可先用 get_filings / web_search 获取披露。',
  );
}
