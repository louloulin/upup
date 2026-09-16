/**
 * Real Eastmoney (东方财富) market-data provider.
 *
 * `push2.eastmoney.com` (quotes) and `push2his.eastmoney.com` (daily bars) are
 * public JSON endpoints that cover A-shares and Hong Kong without credentials.
 * This is the live provider behind `provider: 'auto'` for CN/HK symbols — it
 * replaces the previous behaviour where a missing Tushare token silently
 * produced synthetic dry-run prices.
 */
import type { Market } from './market-types';

export const EASTMONEY_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/stock/get';
export const EASTMONEY_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
export const EASTMONEY_USER_AGENT = 'UpUp-Pi-Market-Data/1.0';
/** f43 last, f44 high, f45 low, f46 open, f47 volume, f48 amount, f57 code, f58 name, f59 decimals, f60 previous close, f86 update time, f169 change, f170 change % */
export const EASTMONEY_QUOTE_FIELDS = 'f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86,f169,f170';
/** kline fields1 = metadata, fields2 = 日期,开盘,收盘,最高,最低,成交量,成交额 */
export const EASTMONEY_KLINE_FIELDS1 = 'f1,f2,f3,f4,f5,f6';
export const EASTMONEY_KLINE_FIELDS2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

interface EastmoneyEnvelope<T> {
  readonly rc?: number;
  readonly data?: T | null;
}

interface EastmoneyQuoteData {
  readonly f43?: number;
  readonly f44?: number;
  readonly f45?: number;
  readonly f46?: number;
  readonly f47?: number;
  readonly f48?: number;
  readonly f57?: string;
  readonly f58?: string;
  readonly f59?: number;
  readonly f60?: number;
  readonly f86?: number;
}

interface EastmoneyKlineData {
  readonly klines?: readonly string[];
}

/**
 * Map an UpUp symbol onto Eastmoney's `secid` (`<market>.<code>`): market `1`
 * is Shanghai, `0` is Shenzhen/Beijing and `116` is Hong Kong. Bare 6-digit
 * codes are A-shares; shorter bare codes are Hong Kong tickers.
 */
export function eastmoneySecid(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (/^6\d{5}(?:\.SH)?$/.test(normalized)) return `1.${normalized.slice(0, 6)}`;
  if (/^[038]\d{5}(?:\.(?:SZ|BJ))?$/.test(normalized)) return `0.${normalized.slice(0, 6)}`;
  if (/^9\d{5}(?:\.BJ)?$/.test(normalized)) return `0.${normalized.slice(0, 6)}`;
  if (/^\d{1,5}\.HK$/.test(normalized)) return `116.${normalized.split('.')[0]!.padStart(5, '0')}`;
  if (/^\d{1,5}$/.test(normalized)) return `116.${normalized.padStart(5, '0')}`;
  throw new Error(`Eastmoney covers A-share and Hong Kong symbols only: ${symbol}`);
}

export function isEastmoneyMarketSymbol(symbol: string): boolean {
  try {
    eastmoneySecid(symbol);
    return true;
  } catch {
    return false;
  }
}

export function eastmoneyQuoteUrl(secid: string, baseUrl: string = EASTMONEY_QUOTE_URL): URL {
  const url = new URL(baseUrl);
  url.searchParams.set('secid', secid);
  url.searchParams.set('fields', EASTMONEY_QUOTE_FIELDS);
  return url;
}

export function eastmoneyKlineUrl(secid: string, startDate: string, endDate: string, baseUrl: string = EASTMONEY_KLINE_URL): URL {
  const url = new URL(baseUrl);
  url.searchParams.set('secid', secid);
  url.searchParams.set('klt', '101');
  url.searchParams.set('fqt', '1');
  url.searchParams.set('beg', startDate.replaceAll('-', ''));
  url.searchParams.set('end', endDate.replaceAll('-', ''));
  url.searchParams.set('fields1', EASTMONEY_KLINE_FIELDS1);
  url.searchParams.set('fields2', EASTMONEY_KLINE_FIELDS2);
  return url;
}

/**
 * Eastmoney reports prices as scaled integers; `f59` carries the decimal
 * places (2 for A-shares, 3 for Hong Kong). The market default is used when the
 * field is missing.
 */
function decimalPlaces(value: number | undefined, market: Market): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6 ? value : market === 'hk' ? 3 : 2;
}

/** A share is quoted in 手 (100-share lots) on Eastmoney; expose shares. */
function volumeMultiplier(market: Market): number { return market === 'cn' ? 100 : 1; }

function scaled(value: number | undefined, decimals: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value / 10 ** decimals : undefined;
}

export interface EastmoneyQuoteSnapshot {
  readonly symbol: string;
  readonly market: Market;
  readonly name?: string;
  readonly last: number;
  readonly previousClose?: number;
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
  readonly volume?: number;
  readonly asOf: string;
}

export function parseEastmoneyQuote(payload: unknown, symbol: string, market: Market, fallbackAsOf: string): EastmoneyQuoteSnapshot {
  const data = (payload as EastmoneyEnvelope<EastmoneyQuoteData> | undefined)?.data ?? undefined;
  const decimals = decimalPlaces(data?.f59, market);
  const last = scaled(data?.f43, decimals);
  if (last === undefined || last <= 0) throw new Error(`Eastmoney returned no quote for ${symbol}`);
  const updatedAtMs = typeof data?.f86 === 'number' ? data.f86 * 1000 : Number.NaN;
  const asOf = Number.isFinite(updatedAtMs) ? new Date(updatedAtMs).toISOString().slice(0, 10) : fallbackAsOf;
  return {
    symbol,
    market,
    ...(data?.f58 ? { name: data.f58 } : {}),
    last,
    ...(scaled(data?.f60, decimals) === undefined ? {} : { previousClose: scaled(data!.f60, decimals)! }),
    ...(scaled(data?.f46, decimals) === undefined ? {} : { open: scaled(data!.f46, decimals)! }),
    ...(scaled(data?.f44, decimals) === undefined ? {} : { high: scaled(data!.f44, decimals)! }),
    ...(scaled(data?.f45, decimals) === undefined ? {} : { low: scaled(data!.f45, decimals)! }),
    ...(typeof data?.f47 === 'number' && Number.isFinite(data.f47) ? { volume: data.f47 * volumeMultiplier(market) } : {}),
    asOf,
  };
}

export interface EastmoneyBar {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export function parseEastmoneyKlines(payload: unknown, symbol: string, startDate: string, endDate: string, market: Market): EastmoneyBar[] {
  const rows = (payload as EastmoneyEnvelope<EastmoneyKlineData> | undefined)?.data?.klines ?? [];
  const multiplier = volumeMultiplier(market);
  const bars: EastmoneyBar[] = [];
  for (const row of rows) {
    const [date, open, close, high, low, volume] = row.split(',');
    if (!date || date < startDate || date > endDate) continue;
    const values = [open, close, high, low, volume].map(Number);
    if (values.some((value) => !Number.isFinite(value))) continue;
    bars.push({ date, open: values[0]!, high: values[2]!, low: values[3]!, close: values[1]!, volume: values[4]! * multiplier });
  }
  if (bars.length === 0) throw new Error(`Eastmoney returned no daily bars for ${symbol} between ${startDate} and ${endDate}`);
  return bars;
}
