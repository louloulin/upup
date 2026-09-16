/**
 * Real Nasdaq daily-bar reader — the fallback for US symbols.
 *
 * Yahoo (`query1.finance.yahoo.com`) answers this machine with a 429 / a 403
 * HTML challenge (measured 2026-09-17: `Edge: Too Many Requests` without a UA,
 * Yahoo's "not a robot" page with one, on both the `range=` and the
 * `period1/period2` forms), so US history needs a second real source. Nasdaq's
 * public quote API serves the same unadjusted daily bars: probed 2026-09-17 it
 * answered 250 rows for a one-year range and caps one answer at 500 rows.
 * Nothing here synthesises a bar.
 */
import type { MarketBar } from './market-types';

export const NASDAQ_HISTORICAL_URL = 'https://api.nasdaq.com/api/quote';
/** Nasdaq answers the default Node/Bun UA with `{}`; its own web app UA works. */
export const NASDAQ_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** One answer is capped at 500 rows (probed: `limit=1000` still returned 500). */
export const NASDAQ_KLINE_MAX_ROWS = 500;
export type NasdaqAssetClass = 'stocks' | 'etf';

/**
 * Nasdaq's public history endpoint only serves windows that reach into roughly
 * the last 12 months: probed 2026-09-17 a request ending 2026-01-31 with a
 * `fromdate` inside that window answered rows, while `2025-01-01 → 2025-06-30`
 * and every older window answered `totalRecords: 0`. Callers check the range
 * first so an old backtest window fails with an actionable message instead of a
 * silently empty series.
 */
export const NASDAQ_HISTORY_WINDOW_DAYS = 370;

/** Whether Nasdaq can answer a window that ends at `endDate` on `today`. */
export function nasdaqCoversRange(startDate: string, endDate: string, today: string): boolean {
  const requested = Date.parse(`${startDate}T00:00:00Z`);
  const requestedEnd = Date.parse(`${endDate}T00:00:00Z`);
  const reference = Date.parse(`${today}T00:00:00Z`);
  if (![requested, requestedEnd, reference].every((value) => Number.isFinite(value))) return false;
  const earliest = reference - NASDAQ_HISTORY_WINDOW_DAYS * 86_400_000;
  return requestedEnd >= earliest && requested <= reference;
}

/** Nasdaq quotes plain US tickers (`AAPL`, `BRK.B`), not Yahoo's `.US` form. */
export function nasdaqTicker(symbol: string): string {
  const ticker = symbol.trim().toUpperCase().replace(/\.US$/u, '');
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/u.test(ticker)) throw new Error(`Nasdaq 日线仅覆盖美股代码：${symbol}`);
  return ticker;
}

export function nasdaqHistoricalUrl(ticker: string, startDate: string, endDate: string, assetClass: NasdaqAssetClass = 'stocks', rows: number = NASDAQ_KLINE_MAX_ROWS): URL {
  const url = new URL(`${NASDAQ_HISTORICAL_URL}/${encodeURIComponent(ticker.trim().toUpperCase())}/historical`);
  url.searchParams.set('assetclass', assetClass);
  url.searchParams.set('fromdate', startDate);
  url.searchParams.set('todate', endDate);
  url.searchParams.set('limit', String(Math.min(Math.max(Math.trunc(rows), 1), NASDAQ_KLINE_MAX_ROWS)));
  return url;
}

interface NasdaqHistoricalPayload {
  readonly data?: {
    readonly totalRecords?: number;
    readonly tradesTable?: { readonly rows?: readonly Record<string, unknown>[] | null } | null;
  } | null;
}

/** Nasdaq renders numbers as `$331.34` / `31,748,180` / `757.39`. */
function numericText(value: unknown): number {
  const text = typeof value === 'string' ? value.replace(/[$,\s]/gu, '') : String(value ?? '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Nasdaq dates are `MM/DD/YYYY`. */
function isoDate(value: unknown): string | undefined {
  const match = typeof value === 'string' ? /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value.trim()) : null;
  return match ? `${match[3]}-${match[1]}-${match[2]}` : undefined;
}

/** Rows come newest-first and carry unadjusted OHLCV. */
export function parseNasdaqKlines(payload: unknown, ticker: string, startDate: string, endDate: string): MarketBar[] {
  const rows = (payload as NasdaqHistoricalPayload | undefined)?.data?.tradesTable?.rows ?? [];
  const bars: MarketBar[] = [];
  for (const row of rows) {
    const date = isoDate(row?.['date']);
    if (!date || date < startDate || date > endDate) continue;
    const open = numericText(row?.['open']);
    const high = numericText(row?.['high']);
    const low = numericText(row?.['low']);
    const close = numericText(row?.['close']);
    const volume = numericText(row?.['volume']);
    if (![open, high, low, close, volume].every((value) => Number.isFinite(value))) continue;
    bars.push({ date, open, high, low, close, volume });
  }
  return bars.sort((left, right) => left.date.localeCompare(right.date));
}
