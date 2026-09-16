/**
 * Real A-share financial statements from the public 东方财富数据中心 reports.
 *
 * Income (`RPT_LICO_FN_CPD`), balance sheet (`RPT_DMSK_FN_BALANCE`) and cash flow
 * (`RPT_DMSK_FN_CASHFLOW`) are joined on the report date, so a period carries
 * revenue, net income, EPS, ROE, gross margin, assets, liabilities and operating
 * cash flow exactly as the exchange published them. The previous implementation
 * returned a three-symbol fixture table (贵州茅台/比亚迪/宁德时代) with invented
 * numbers; this one answers for any listed A-share code.
 */
import { type EastmoneyFetcher, eastmoneyDatacenterUrl, eastmoneyRecords, eastmoneyNumbers, eastmoneyDate, readEastmoneyJson } from './eastmoney-datacenter';

export interface NativeAStockFinancialPeriod {
  /** Report year, e.g. `2026`. */
  period: string;
  reportType?: string;
  reportDate: string;
  revenue?: number;
  netIncome?: number;
  eps?: number;
  roe?: number;
  grossMargin?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  operatingCashflow?: number;
}

export interface NativeAStockFinancials {
  ts_code: string;
  name: string;
  asOf: string;
  periods: NativeAStockFinancialPeriod[];
  sourceUrls: readonly string[];
}

export interface NativeAStockFinancialsOptions {
  readonly fetcher?: EastmoneyFetcher;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
  /** Report year filter, e.g. `2026`. */
  readonly period?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  /** How many report dates to keep. */
  readonly limit?: number;
}

/** Chinese name aliases for the codes users type most often. */
const NAME_TO_CODE: Readonly<Record<string, string>> = {
  贵州茅台: '600519.SH',
  茅台: '600519.SH',
  比亚迪: '002594.SZ',
  宁德时代: '300750.SZ',
};

/** `贵州茅台` / `600519` / `600519.SH` → `600519.SH`; undefined for non A-share input. */
export function normalizeNativeAStockCode(code: string): string | undefined {
  const trimmed = code.trim();
  const alias = NAME_TO_CODE[trimmed];
  if (alias) return alias;
  const normalized = trimmed.toUpperCase();
  if (/^\d{6}\.(?:SH|SZ|BJ)$/u.test(normalized)) return normalized;
  if (/^\d{6}$/u.test(normalized)) return `${normalized}.${normalized.startsWith('6') ? 'SH' : 'SZ'}`;
  return undefined;
}

export async function fetchNativeAStockFinancials(code: string, options: NativeAStockFinancialsOptions = {}): Promise<NativeAStockFinancials> {
  const ticker = normalizeNativeAStockCode(code);
  if (!ticker) throw new Error(`get_astock_financials 目前只支持 A 股代码（如 600519.SH 或 贵州茅台），收到：${code}`);
  const now = options.now ?? (() => new Date());
  const limit = Math.min(Math.max(options.limit ?? 4, 1), 12);
  const pageSize = Math.min(Math.max(limit * 3, 6), 30);
  const filter = `(SECUCODE="${ticker}")`;
  const read = (reportName: string, sortColumn: string): Promise<{ rows: readonly Record<string, unknown>[]; url: string }> => {
    const url = eastmoneyDatacenterUrl(reportName, filter, sortColumn, pageSize);
    return readEastmoneyJson(url, { ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.signal ? { signal: options.signal } : {}) })
      .then((payload) => ({ rows: eastmoneyRecords(payload), url: url.toString() }));
  };
  const [income, balance, cashflow] = await Promise.all([
    read('RPT_LICO_FN_CPD', 'REPORTDATE'),
    read('RPT_DMSK_FN_BALANCE', 'REPORT_DATE'),
    read('RPT_DMSK_FN_CASHFLOW', 'REPORT_DATE'),
  ]);
  if (income.rows.length === 0) throw new Error(`东方财富财报接口没有 ${ticker} 的报告数据`);
  const byDate = (rows: readonly Record<string, unknown>[], column: string): Map<string, Record<string, unknown>> =>
    new Map(rows.flatMap((row) => {
      const date = eastmoneyDate(row[column], '');
      return date === '' ? [] : [[date, row] as [string, Record<string, unknown>]];
    }));
  const balances = byDate(balance.rows, 'REPORT_DATE');
  const cashflows = byDate(cashflow.rows, 'REPORT_DATE');
  const today = now().toISOString().slice(0, 10);
  const periods: NativeAStockFinancialPeriod[] = [];
  for (const row of income.rows) {
    const reportDate = eastmoneyDate(row.REPORTDATE, '');
    if (reportDate === '') continue;
    if (options.period && !reportDate.startsWith(options.period)) continue;
    if (options.startDate && reportDate < options.startDate) continue;
    if (options.endDate && reportDate > options.endDate) continue;
    const balanceRow = balances.get(reportDate) ?? {};
    const cashflowRow = cashflows.get(reportDate) ?? {};
    periods.push({
      period: reportDate.slice(0, 4),
      ...(typeof row.DATATYPE === 'string' ? { reportType: row.DATATYPE } : {}),
      reportDate,
      ...eastmoneyNumbers({
        revenue: row.TOTAL_OPERATE_INCOME,
        netIncome: row.PARENT_NETPROFIT,
        eps: row.BASIC_EPS,
        roe: row.WEIGHTAVG_ROE,
        grossMargin: row.XSMLL,
        totalAssets: balanceRow.TOTAL_ASSETS,
        totalLiabilities: balanceRow.TOTAL_LIABILITIES,
        operatingCashflow: cashflowRow.NETCASH_OPERATE,
      }),
    });
    if (periods.length >= limit) break;
  }
  if (periods.length === 0) throw new Error(`东方财富财报接口没有 ${ticker} ${options.period ?? ''} 的报告数据`.trim());
  const latest = income.rows[0] ?? {};
  return {
    ts_code: ticker,
    name: typeof latest.SECURITY_NAME_ABBR === 'string' ? latest.SECURITY_NAME_ABBR : ticker,
    asOf: periods[0]!.reportDate || today,
    periods,
    sourceUrls: [income.url, balance.url, cashflow.url],
  };
}
