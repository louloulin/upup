/**
 * Real 腾讯财经 (gtimg) daily-bar reader — the fallback for 东方财富 daily bars.
 *
 * 东方财富 answers a burst on `push2his/api/qt/stock/kline/get` by dropping the
 * connection: measured 2026-09-17 the reset outlived a 20-minute window, and the
 * `push2delay` mirror that serves the quote payloads answers the kline path with
 * `dktotal: 0` / `klines: []`. CN/HK history therefore falls back to this public
 * endpoint, which serves the same forward-adjusted (前复权) daily series — never
 * to synthetic bars.
 *
 * Probed 2026-09-17: `qfq` rows match 东方财富 `fqt=1` bar for bar (600519.SH
 * 2026-09-16 → open 1273.93 / high 1274.98 / low 1254.10 / close 1258.00,
 * 26235 手 on both hosts).
 */
import type { Market, MarketBar } from './market-types';
import { volumeMultiplier } from './eastmoney';

export const TENCENT_KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
export const TENCENT_USER_AGENT = 'UpUp-Pi-Market-Data/1.0';
/** `param=<code>,day,,,<count>,qfq` is capped server-side at 640 rows. */
export const TENCENT_KLINE_MAX_ROWS = 640;

/**
 * Map an UpUp symbol onto 腾讯's code (`sh600519` / `sz000001` / `bj920002` /
 * `hk00700`) with the same market classification as `eastmoneySecid`.
 */
export function tencentKlineCode(symbol: string, market: Market): string {
  const normalized = symbol.trim().toUpperCase();
  const bareCode = normalized.replace(/\.HK$/u, '');
  if (market === 'hk' || (market === 'cn' && /^\d{1,5}$/u.test(bareCode))) {
    if (!/^\d{1,5}$/u.test(bareCode)) throw new Error(`腾讯财经日线仅覆盖 A 股 / 港股代码：${symbol}`);
    return `hk${bareCode.padStart(5, '0')}`;
  }
  const code = normalized.replace(/\.(?:SH|SZ|BJ)$/u, '');
  if (!/^\d{6}$/u.test(code)) throw new Error(`腾讯财经日线仅覆盖 A 股 / 港股代码：${symbol}`);
  if (code.startsWith('6')) return `sh${code}`;
  if (/^(?:0|3)/u.test(code)) return `sz${code}`;
  if (/^(?:4|8|9)/u.test(code)) return `bj${code}`;
  throw new Error(`腾讯财经日线未覆盖该 A 股代码段：${symbol}`);
}

/** 腾讯 returns the last `rows` bars ending at the latest trading day. */
export function tencentKlineUrl(code: string, rows: number = TENCENT_KLINE_MAX_ROWS): URL {
  const url = new URL(TENCENT_KLINE_URL);
  url.searchParams.set('param', `${code},day,,,${Math.min(Math.max(Math.trunc(rows), 1), TENCENT_KLINE_MAX_ROWS)},qfq`);
  return url;
}

interface TencentKlineEntry {
  readonly qfqday?: readonly (readonly unknown[])[];
  readonly day?: readonly (readonly unknown[])[];
}

interface TencentKlineEnvelope {
  readonly data?: Record<string, TencentKlineEntry | undefined> | null;
}

/** Rows are `[日期, 开盘, 收盘, 最高, 最低, 成交量]`, the same order as 东方财富's. */
export function parseTencentKlines(payload: unknown, code: string, symbol: string, startDate: string, endDate: string, market: Market): MarketBar[] {
  const entry = (payload as TencentKlineEnvelope | undefined)?.data?.[code];
  // `qfq` is answered as `qfqday`; markets without 复权 support (HK) answer `day`.
  const rows = entry?.qfqday ?? entry?.day ?? [];
  const multiplier = volumeMultiplier(market);
  const bars: MarketBar[] = [];
  for (const row of rows) {
    const [date, open, close, high, low, volume] = row;
    if (typeof date !== 'string' || date < startDate || date > endDate) continue;
    const values = [open, close, high, low, volume].map(Number);
    if (values.some((value) => !Number.isFinite(value))) continue;
    bars.push({ date, open: values[0]!, high: values[2]!, low: values[3]!, close: values[1]!, volume: values[4]! * multiplier });
  }
  if (bars.length === 0) throw new Error(`腾讯财经未返回 ${symbol} 的日线（${startDate} → ${endDate}）`);
  return bars;
}
