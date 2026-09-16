/**
 * Real Eastmoney (东方财富) screening reads for CN / HK / US.
 *
 * The natural-language screener and the `stock_screener` / `screen_astocks`
 * tools used to answer from a hard-coded 12-row fixture. This module replaces
 * that fixture with the public endpoints that back 东方财富's own 行情 and
 * 板块 pages:
 *
 * - `push2.eastmoney.com/api/qt/clist/get` — live quote list for a market
 *   segment (`fs=m:1+t:2,m:0+t:6,…`) or a 板块/概念 (`fs=b:BK0896`). Carries the
 *   provider's own PE(TTM) `f9`, PB `f23`, 总市值 `f20`, 股息率 `f133`,
 *   change% `f3`, 成交额 `f6`, 换手率 `f8` and 行业 `f100`.
 * - `data.eastmoney.com/dataapi/xuangu/list` — 沪深选股器 fundamentals
 *   (ROE_WEIGHT and growth). It is the *row source* for a screen that filters on
 *   ROE/growth, because the 行情列表 does not carry those fields; its `filter` is
 *   passed through but every clause is re-applied client-side, and one answer is
 *   capped at ~189 rows (probed 2026-09-17: field names it does not know — e.g.
 *   `PB_MRQ`, `DIVIDEND_YIELD` — are silently ignored by both `sty` and `filter`).
 * - `push2.eastmoney.com/api/qt/ulist.np/get` — live quote fields for an explicit
 *   code list, so the 选股器 window reports the same PE/PB/股息率/换手率 as the
 *   行情列表 for exactly those names.
 * - `searchapi.eastmoney.com/api/suggest/get` — keyword → 板块 code, so a query
 *   like 白酒 screens the live BK0896 membership instead of a hand-maintained
 *   alias table.
 *
 * Every read goes through the shared per-host gate from `@upup/pi-observability`
 * because these hosts drop the connection when bursted. Nothing here
 * synthesises a fallback row: when the provider or transport is unavailable the
 * caller gets an error, and when a filter needs a field the sample does not
 * carry the caller gets a `ScreenerUnavailableError`.
 */
import { hostGateFor, isHostThrottleError, isSocketResetError } from '@upup/pi-observability';
import { EASTMONEY_MIRROR_HOST, eastmoneyMirrorUrl } from './eastmoney';
import type { ScreenFilterClause, ScreenStockRow, ScreenUniverse } from './screen-types';

export const EASTMONEY_CLIST_URL = 'https://push2.eastmoney.com/api/qt/clist/get';
export const EASTMONEY_XUANGU_URL = 'https://data.eastmoney.com/dataapi/xuangu/list';
export const EASTMONEY_ULIST_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
export const EASTMONEY_SUGGEST_URL = 'https://searchapi.eastmoney.com/api/suggest/get';
export const EASTMONEY_SCREEN_USER_AGENT = 'UpUp-Pi-Market-Data/1.0';
/** The public token 东方财富 ships in its own web pages. */
export const EASTMONEY_SUGGEST_TOKEN = 'D43BF722C8E33BDC906FB84D85E326E8';

export type ScreenerMarket = 'cn' | 'hk' | 'us';

/** Provider segments: A 股沪深主板/创业板、港股、美股. */
export const EASTMONEY_SCREEN_SEGMENTS: Readonly<Record<ScreenerMarket, string>> = {
  cn: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
  hk: 'm:116',
  us: 'm:105,m:106,m:107',
};

/** `f12` code, `f14` name, `f2` price, `f3` change%, `f6` 成交额, `f8` 换手率, `f9` PE(TTM), `f20` 总市值, `f23` PB, `f100` 行业, `f124` 行情时间, `f133` 股息率(A 股). */
export const EASTMONEY_CLIST_SCREEN_FIELDS = 'f12,f14,f2,f3,f6,f8,f9,f20,f23,f100,f124,f133';
export const EASTMONEY_XUANGU_SCREEN_FIELDS = 'SECURITY_CODE,SECURITY_NAME_ABBR,SECUCODE,NEW_PRICE,CHANGE_RATE,PE_TTM,TOTAL_MARKET_CAP,ROE_WEIGHT,TOTAL_OPERATE_INCOME_YOY,PARENT_NETPROFIT_YOY,INDUSTRY,MAX_TRADE_DATE';

/** `push2` caps one 行情 page at 100 rows; a screen scans up to 5 pages. */
export const EASTMONEY_SCREEN_PAGE_ROWS = 100;
export const EASTMONEY_SCREEN_WINDOW_ROWS = 500;
/** 选股器 one-page window (ROE / growth); the endpoint itself caps one answer at ~189 rows. */
export const EASTMONEY_XUANGU_WINDOW_ROWS = 500;
/** `ulist.np` accepts up to 100 沪深 codes per request. */
export const EASTMONEY_ULIST_BATCH_ROWS = 100;
export const EASTMONEY_SCREEN_CACHE_TTL_MS = 60_000;

/** Quote-list sort fields, so a filtered screen scans the relevant end of the market. */
const CLIST_SORT_FIELDS: Readonly<Record<string, string>> = { pe: 'f9', pb: 'f23', marketCap: 'f20', changePercent: 'f3', dividendYield: 'f133' };
const CLIST_SORT_FIELDS_CN: Readonly<Record<string, string>> = { ...CLIST_SORT_FIELDS, dividendYield: 'f133' };
const ASCENDING_OPS = new Set(['<', '<=']);
const DESCENDING_OPS = new Set(['>', '>=']);
/**
 * Every 行情列表 field maps `po=1` to descending — except 市盈率 `f9`, which the
 * provider inverts (probed 2026-09-17: `fid=f9&po=0` starts at PE 23027 and walks
 * down, `po=1` starts at 0.85 and walks up; `f20/f23/f133/f3` follow `po=1` =
 * descending). Without this, a `PE < 15` screen scans the *highest* PE names and
 * reports zero matches.
 */
const INVERTED_SORT_FIELDS = new Set(['f9']);

/** Fields the A-share 选股器 carries and the 行情列表 does not. */
const FUNDAMENTAL_FIELDS = ['roe', 'revenueGrowth', 'profitGrowth'];
/** 选股器 field names for those fields, used by both its `st` sort and its `filter`. */
const XUANGU_FUNDAMENTAL_FIELDS: Readonly<Record<string, string>> = { roe: 'ROE_WEIGHT', revenueGrowth: 'TOTAL_OPERATE_INCOME_YOY', profitGrowth: 'PARENT_NETPROFIT_YOY' };
const XUANGU_SUPPORTED_OPS = new Set(['=', '>', '<', '>=', '<=']);

export interface ScreenerRow {
  ticker: string;
  name: string;
  market: ScreenerMarket;
  industry: string;
  price?: number;
  changePercent?: number;
  pe?: number;
  pb?: number;
  marketCap?: number;
  amount?: number;
  turnoverPercent?: number;
  dividendYield?: number;
  /** Provider-reported trade date for this row (`f124` 行情时间 / 选股器 MAX_TRADE_DATE). */
  asOf?: string;
  roe?: number;
  revenueGrowth?: number;
  profitGrowth?: number;
}

export interface ScreenerFetchResult {
  rows: ScreenerRow[];
  /** Rows this screen really evaluated (the provider sample window), never the whole-market total. */
  scannedCount: number;
  /** Size of the provider universe this window was drawn from, when the provider reports one. */
  universeCount?: number;
  asOf: string;
  sourceUrls: string[];
  note?: string;
}

export type EastmoneyScreenerFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EastmoneyScreenOptions {
  readonly fetcher?: EastmoneyScreenerFetcher;
  readonly signal?: AbortSignal;
  readonly userAgent?: string;
  readonly now?: () => Date;
}

export interface ScreenerRowRequest {
  readonly universe: ScreenUniverse;
  readonly keywords: readonly string[];
  readonly filters: readonly ScreenFilterClause[];
  readonly limit: number;
}

export type ScreenerRowLoader = (request: ScreenerRowRequest) => Promise<ScreenerFetchResult>;

export class ScreenerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenerUnavailableError';
  }
}

/** The host dropped the connection mid-read (its limiter); the caller may retry on the mirror host. */
export class EastmoneyTransportError extends ScreenerUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'EastmoneyTransportError';
  }
}

/** Discloses that the mirror host answered, so a sample is not read as the live host's. */
export function eastmoneyMirrorNote(sourceUrls: readonly string[]): string {
  return sourceUrls.some((url) => url.includes(EASTMONEY_MIRROR_HOST)) ? `行情由东方财富备用主机 ${EASTMONEY_MIRROR_HOST} 提供（主行情主机触发了限流）。` : '';
}

export function eastmoneyScreenUniverseFields(market: ScreenerMarket): ReadonlySet<string> {
  const base = ['pe', 'pb', 'marketCap', 'price', 'changePercent', 'sector'];
  return new Set(market === 'cn' ? [...base, 'dividendYield', ...FUNDAMENTAL_FIELDS] : base);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' && value.trim() !== '-' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textValue(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text !== '-' ? text : undefined;
}

function todayIso(now: () => Date): string {
  return now().toISOString().slice(0, 10);
}

/** Reads one public Eastmoney JSON document, serialized through the per-host gate. */
export async function readEastmoneyJson(url: URL, options: EastmoneyScreenOptions = {}): Promise<Record<string, unknown>> {
  if (options.signal?.aborted) throw new DOMException('Eastmoney request aborted', 'AbortError');
  const fetcher: EastmoneyScreenerFetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await hostGateFor(url).run(() => fetcher(url, {
      ...(options.signal ? { signal: options.signal } : {}),
      headers: { Accept: 'application/json', 'User-Agent': options.userAgent ?? EASTMONEY_SCREEN_USER_AGENT },
    }));
  } catch (error) {
    // The host answers a burst by dropping the connection; a raw socket error
    // tells the caller nothing, so surface the actionable shape instead.
    if (isHostThrottleError(error)) throw new EastmoneyTransportError(error.message);
    if (isSocketResetError(error)) throw new EastmoneyTransportError(`东方财富 ${url.host} 连接被重置（该数据源对密集请求会直接断开连接），请稍后重试或缩小筛选范围。`);
    throw error;
  }
  if (!response.ok) throw new ScreenerUnavailableError(`东方财富接口请求失败: ${response.status} ${response.statusText} (${url.host})`);
  const payload = await response.json().catch(() => undefined) as unknown;
  const record = asRecord(payload);
  if (!record) throw new ScreenerUnavailableError(`东方财富接口返回了非 JSON 内容 (${url.host})，可能触发了限流，请稍后重试。`);
  return record;
}

/** One provider document plus the URL that really answered (the mirror host may have served it). */
export interface EastmoneyDocument {
  payload: Record<string, unknown>;
  sourceUrl: string;
}

/** Reads a document, retrying once on 东方财富's mirror host when the live host drops the connection. */
export async function readEastmoneyDocument(url: URL, options: EastmoneyScreenOptions = {}): Promise<EastmoneyDocument> {
  try {
    return { payload: await readEastmoneyJson(url, options), sourceUrl: url.toString() };
  } catch (error) {
    const mirror = error instanceof EastmoneyTransportError ? eastmoneyMirrorUrl(url) : undefined;
    if (!mirror) throw error;
    return { payload: await readEastmoneyJson(mirror, options), sourceUrl: mirror.toString() };
  }
}

export function eastmoneyClistUrl(input: { segments: string; pageSize: number; page?: number; sortField?: string; sortDesc?: boolean; fields?: string }): URL {
  const url = new URL(EASTMONEY_CLIST_URL);
  url.searchParams.set('pn', String(input.page ?? 1));
  url.searchParams.set('pz', String(input.pageSize));
  url.searchParams.set('po', clistSortParam(input.sortField ?? 'f20', input.sortDesc !== false));
  url.searchParams.set('np', '1');
  url.searchParams.set('fltt', '2');
  url.searchParams.set('invt', '2');
  url.searchParams.set('fid', input.sortField ?? 'f20');
  url.searchParams.set('fs', input.segments);
  url.searchParams.set('fields', input.fields ?? EASTMONEY_CLIST_SCREEN_FIELDS);
  return url;
}

export function eastmoneyXuanguUrl(input: { pageSize: number; page?: number; sortField?: string; sortDesc?: boolean; filter?: string }): URL {
  const url = new URL(EASTMONEY_XUANGU_URL);
  url.searchParams.set('st', input.sortField ?? 'TOTAL_MARKET_CAP');
  url.searchParams.set('sr', input.sortDesc === false ? '1' : '-1');
  url.searchParams.set('ps', String(input.pageSize));
  url.searchParams.set('p', String(input.page ?? 1));
  url.searchParams.set('sty', EASTMONEY_XUANGU_SCREEN_FIELDS);
  if (input.filter) url.searchParams.set('filter', input.filter);
  url.searchParams.set('source', 'SELECT_SECURITIES');
  url.searchParams.set('client', 'WEB');
  return url;
}

/** Live quote fields for an explicit 沪深 code list (`secids=1.600519,0.000858`). */
export function eastmoneyUlistUrl(secids: readonly string[]): URL {
  const url = new URL(EASTMONEY_ULIST_URL);
  url.searchParams.set('fltt', '2');
  url.searchParams.set('invt', '2');
  url.searchParams.set('secids', secids.join(','));
  url.searchParams.set('fields', EASTMONEY_CLIST_SCREEN_FIELDS);
  return url;
}

/** `po` for a logical direction, honouring the fields whose direction the provider inverts. */
export function clistSortParam(sortField: string, desc: boolean): string {
  const descending = INVERTED_SORT_FIELDS.has(sortField) ? !desc : desc;
  return descending ? '1' : '0';
}

/** 沪深 `secid` for a ticker (`600519.SH` → `1.600519`); other markets have no 沪深 secid. */
export function eastmoneyQuoteSecid(ticker: string): string | undefined {
  const code = ticker.split('.')[0] ?? '';
  if (!/^\d{6}$/u.test(code)) return undefined;
  return `${code.startsWith('6') ? '1' : '0'}.${code}`;
}

export function eastmoneySuggestUrl(keyword: string): URL {
  const url = new URL(EASTMONEY_SUGGEST_URL);
  url.searchParams.set('input', keyword);
  url.searchParams.set('type', '14');
  url.searchParams.set('token', EASTMONEY_SUGGEST_TOKEN);
  url.searchParams.set('count', '10');
  return url;
}

/** Ticker for an Eastmoney row: `600519` → `600519.SH`, `00700` → `00700.HK`, `AAPL` → `AAPL`. */
export function eastmoneyScreenTicker(code: string, market: ScreenerMarket, exchange?: string): string {
  const normalized = code.trim().toUpperCase();
  if (market === 'hk') return `${normalized.padStart(5, '0')}.HK`;
  if (market === 'us') return normalized;
  if (normalized.endsWith('.SH') || normalized.endsWith('.SZ') || normalized.endsWith('.BJ')) return normalized;
  const suffix = exchange ?? (normalized.startsWith('6') ? 'SH' : normalized.startsWith('9') || normalized.startsWith('4') ? 'BJ' : 'SZ');
  return `${normalized}.${suffix}`;
}

export function parseEastmoneyClistRows(payload: unknown, market: ScreenerMarket): { rows: ScreenerRow[]; total: number } {
  const data = asRecord(asRecord(payload)?.data);
  const diff = data?.diff;
  const list = Array.isArray(diff) ? diff : asRecord(diff) ? Object.values(diff as Record<string, unknown>) : [];
  const rows: ScreenerRow[] = [];
  for (const entry of list) {
    const record = asRecord(entry);
    const code = textValue(record?.f12);
    const name = textValue(record?.f14);
    if (!record || !code || !name) continue;
    // 港股人民币柜台 (00700 vs 80700) 与同一标的重复，只保留主柜台。
    if (market === 'hk' && /-R$/u.test(name)) continue;
    const dividendYield = market === 'cn' ? numberValue(record.f133) : undefined;
    const quoteAt = numberValue(record.f124);
    rows.push({
      ticker: eastmoneyScreenTicker(code, market, textValue(record.f13)),
      name,
      market,
      industry: textValue(record.f100) ?? '未分类',
      ...(numberValue(record.f2) !== undefined ? { price: numberValue(record.f2)! } : {}),
      ...(numberValue(record.f3) !== undefined ? { changePercent: numberValue(record.f3)! } : {}),
      ...(numberValue(record.f9) !== undefined ? { pe: numberValue(record.f9)! } : {}),
      ...(numberValue(record.f23) !== undefined ? { pb: numberValue(record.f23)! } : {}),
      ...(numberValue(record.f20) !== undefined ? { marketCap: numberValue(record.f20)! } : {}),
      ...(numberValue(record.f6) !== undefined ? { amount: numberValue(record.f6)! } : {}),
      ...(numberValue(record.f8) !== undefined ? { turnoverPercent: numberValue(record.f8)! } : {}),
      ...(dividendYield !== undefined ? { dividendYield } : {}),
      ...(quoteAt !== undefined ? { asOf: new Date(quoteAt * 1000).toISOString().slice(0, 10) } : {}),
    });
  }
  return { rows, total: numberValue(data?.total) ?? rows.length };
}

/** 选股器 rows: the row source for ROE / growth screens and the enrichment for the quote list. */
export function parseEastmoneyXuanguRows(payload: unknown): { rows: ScreenerRow[]; count?: number; asOf?: string } {
  const result = asRecord(asRecord(payload)?.result);
  const list = Array.isArray(result?.data) ? result.data as unknown[] : [];
  const rows: ScreenerRow[] = [];
  let asOf: string | undefined;
  for (const entry of list) {
    const record = asRecord(entry);
    const code = textValue(record?.SECURITY_CODE);
    const name = textValue(record?.SECURITY_NAME_ABBR);
    if (!record || !code || !name) continue;
    const tradeDate = textValue(record.MAX_TRADE_DATE);
    if (tradeDate && (!asOf || tradeDate > asOf)) asOf = tradeDate;
    rows.push({
      ticker: textValue(record.SECUCODE) ?? eastmoneyScreenTicker(code, 'cn'),
      name,
      market: 'cn',
      industry: textValue(record.INDUSTRY) ?? '未分类',
      ...(numberValue(record.NEW_PRICE) !== undefined ? { price: numberValue(record.NEW_PRICE)! } : {}),
      ...(numberValue(record.CHANGE_RATE) !== undefined ? { changePercent: numberValue(record.CHANGE_RATE)! } : {}),
      ...(numberValue(record.PE_TTM) !== undefined ? { pe: numberValue(record.PE_TTM)! } : {}),
      ...(numberValue(record.TOTAL_MARKET_CAP) !== undefined ? { marketCap: numberValue(record.TOTAL_MARKET_CAP)! } : {}),
      ...(numberValue(record.ROE_WEIGHT) !== undefined ? { roe: numberValue(record.ROE_WEIGHT)! } : {}),
      ...(numberValue(record.TOTAL_OPERATE_INCOME_YOY) !== undefined ? { revenueGrowth: numberValue(record.TOTAL_OPERATE_INCOME_YOY)! } : {}),
      ...(numberValue(record.PARENT_NETPROFIT_YOY) !== undefined ? { profitGrowth: numberValue(record.PARENT_NETPROFIT_YOY)! } : {}),
      ...(tradeDate ? { asOf: tradeDate } : {}),
    });
  }
  const count = numberValue(result?.count);
  return { rows, ...(count !== undefined ? { count } : {}), ...(asOf ? { asOf } : {}) };
}

/** 板块 suggestions from `searchapi`; funds and warrants are dropped. */
export function parseEastmoneyBoardSuggestions(payload: unknown): { code: string; name: string }[] {
  const rows = asRecord(asRecord(payload)?.QuotationCodeTable)?.Data;
  if (!Array.isArray(rows)) return [];
  const boards: { code: string; name: string }[] = [];
  for (const entry of rows) {
    const record = asRecord(entry);
    if (!record || textValue(record.Classify) !== 'BK') continue;
    const code = textValue(record.Code);
    const name = textValue(record.Name);
    if (code && name) boards.push({ code, name });
  }
  return boards;
}

export function screenerRowToScreenStockRow(row: ScreenerRow): ScreenStockRow {
  return {
    ticker: row.ticker,
    name: row.name,
    sector: row.industry,
    market: row.market,
    ...(row.marketCap !== undefined ? { marketCap: row.marketCap } : {}),
    ...(row.pe !== undefined ? { pe: row.pe } : {}),
    ...(row.pb !== undefined ? { pb: row.pb } : {}),
    ...(row.roe !== undefined ? { roe: row.roe } : {}),
    ...(row.revenueGrowth !== undefined ? { revenueGrowth: row.revenueGrowth } : {}),
    ...(row.profitGrowth !== undefined ? { profitGrowth: row.profitGrowth } : {}),
    ...(row.price !== undefined ? { price: row.price } : {}),
    ...(row.changePercent !== undefined ? { changePercent: row.changePercent } : {}),
    ...(row.dividendYield !== undefined ? { dividendYield: row.dividendYield } : {}),
  };
}

export function asScreenerMarket(universe: ScreenUniverse): ScreenerMarket {
  if (universe === 'cn' || universe === 'hk' || universe === 'us') return universe;
  throw new ScreenerUnavailableError(`东方财富选股器暂不支持 universe=${universe}：请使用 cn / hk / us。`);
}

/** Resolves a Chinese sector/concept keyword (白酒, 半导体, 银行…) to its live 板块. */
export async function resolveEastmoneyBoard(keyword: string, options: EastmoneyScreenOptions = {}): Promise<{ code: string; name: string } | undefined> {
  const payload = await readEastmoneyJson(eastmoneySuggestUrl(keyword), options);
  const boards = parseEastmoneyBoardSuggestions(payload);
  return boards.find((board) => board.name === keyword.trim()) ?? boards[0];
}

/** The quote list is paged; one screen reads up to `EASTMONEY_SCREEN_WINDOW_ROWS` rows. */
export async function fetchEastmoneyQuoteRows(input: { segments: string; market: ScreenerMarket; rows: number; sortField?: string; sortDesc?: boolean; exclude?: (row: ScreenerRow) => boolean }, options: EastmoneyScreenOptions = {}): Promise<ScreenerFetchResult> {
  const pages = Math.max(1, Math.ceil(input.rows / EASTMONEY_SCREEN_PAGE_ROWS));
  const rows: ScreenerRow[] = [];
  const sourceUrls: string[] = [];
  let total = 0;
  for (let page = 1; page <= pages; page += 1) {
    const url = eastmoneyClistUrl({ segments: input.segments, pageSize: EASTMONEY_SCREEN_PAGE_ROWS, page, ...(input.sortField ? { sortField: input.sortField } : {}), ...(input.sortDesc === false ? { sortDesc: false } : {}) });
    const document = await readEastmoneyDocument(url, options);
    const parsed = parseEastmoneyClistRows(document.payload, input.market);
    sourceUrls.push(document.sourceUrl);
    total = parsed.total;
    rows.push(...parsed.rows);
    if (parsed.rows.length < EASTMONEY_SCREEN_PAGE_ROWS) break;
  }
  const kept = input.exclude ? rows.filter((row) => !input.exclude!(row)) : rows;
  return { rows: kept, scannedCount: kept.length, universeCount: total, asOf: providerAsOf(kept, options), sourceUrls };
}

/** The provider's own trade date when the rows carry one; the read date otherwise. */
function providerAsOf(rows: readonly ScreenerRow[], options: EastmoneyScreenOptions): string {
  let asOf: string | undefined;
  for (const row of rows) if (row.asOf && (!asOf || row.asOf > asOf)) asOf = row.asOf;
  return asOf ?? todayIso(options.now ?? (() => new Date()));
}

/** 选股器 window sorted by the fundamental the query filters on, narrowed by the clauses it can answer. */
async function fetchXuanguWindow(filters: readonly ScreenFilterClause[], options: EastmoneyScreenOptions): Promise<{ rows: ScreenerRow[]; url: string; asOf?: string; count?: number }> {
  const sort = xuanguSortFor(filters);
  const filter = xuanguFilterExpression(filters);
  const url = eastmoneyXuanguUrl({ pageSize: EASTMONEY_XUANGU_WINDOW_ROWS, sortField: sort.field, sortDesc: sort.desc, ...(filter ? { filter } : {}) });
  const document = await readEastmoneyDocument(url, options);
  const parsed = parseEastmoneyXuanguRows(document.payload);
  return { rows: parsed.rows, url: document.sourceUrl, ...(parsed.asOf ? { asOf: parsed.asOf } : {}), ...(parsed.count !== undefined ? { count: parsed.count } : {}) };
}

/** 选股器 sort: the fundamental the query filters on, descending for `>` and ascending for `<`. */
export function xuanguSortFor(filters: readonly ScreenFilterClause[]): { field: string; desc: boolean } {
  for (const filter of filters) {
    const field = XUANGU_FUNDAMENTAL_FIELDS[filter.field];
    if (!field) continue;
    return { field, desc: !ASCENDING_OPS.has(filter.op) };
  }
  return { field: 'ROE_WEIGHT', desc: true };
}

/** 选股器 `filter` expression for the fundamental clauses; unknown field names are ignored upstream, so nothing here is trusted on its own. */
export function xuanguFilterExpression(filters: readonly ScreenFilterClause[]): string | undefined {
  const clauses: string[] = [];
  for (const filter of filters) {
    const field = XUANGU_FUNDAMENTAL_FIELDS[filter.field];
    const value = Number(filter.value);
    if (!field || !Number.isFinite(value) || !XUANGU_SUPPORTED_OPS.has(filter.op)) continue;
    clauses.push(`(${field}${filter.op}${value})`);
  }
  return clauses.length > 0 ? clauses.join('') : undefined;
}

/** Live quote fields (PE / PB / 市值 / 股息率 / 换手率 / 行业) for exactly the rows in hand. */
async function fetchEastmoneyQuoteSnapshot(rows: readonly ScreenerRow[], options: EastmoneyScreenOptions): Promise<{ rows: ScreenerRow[]; sourceUrls: string[] }> {
  const secids = new Map<string, string>();
  for (const row of rows) {
    const secid = eastmoneyQuoteSecid(row.ticker);
    if (secid) secids.set(row.ticker, secid);
  }
  const quotes = new Map<string, ScreenerRow>();
  const sourceUrls: string[] = [];
  const tickers = [...secids.keys()];
  for (let offset = 0; offset < tickers.length; offset += EASTMONEY_ULIST_BATCH_ROWS) {
    const batch = tickers.slice(offset, offset + EASTMONEY_ULIST_BATCH_ROWS);
    const url = eastmoneyUlistUrl(batch.map((ticker) => secids.get(ticker)!));
    const document = await readEastmoneyDocument(url, options);
    for (const quote of parseEastmoneyClistRows(document.payload, 'cn').rows) quotes.set(quote.ticker, quote);
    sourceUrls.push(document.sourceUrl);
  }
  return {
    rows: rows.map((row) => {
      const quote = quotes.get(row.ticker);
      if (!quote) return row;
      return {
        ...quote,
        name: row.name,
        ...(row.roe !== undefined ? { roe: row.roe } : {}),
        ...(row.revenueGrowth !== undefined ? { revenueGrowth: row.revenueGrowth } : {}),
        ...(row.profitGrowth !== undefined ? { profitGrowth: row.profitGrowth } : {}),
      };
    }),
    sourceUrls,
  };
}

/**
 * A screen whose filters need ROE / growth. The 行情列表 cannot answer those
 * fields and the 选股器 answers at most ~189 rows per query, so the 选股器 window
 * (sorted by the filtered fundamental) is the row source, and each row is then
 * enriched with the live quote snapshot. The window size is disclosed as the sample.
 */
async function fetchEastmoneyFundamentalScreen(request: ScreenerRowRequest, options: EastmoneyScreenOptions): Promise<ScreenerFetchResult> {
  const window = await fetchXuanguWindow(request.filters, options);
  const enriched = await fetchEastmoneyQuoteSnapshot(window.rows, options);
  const sort = xuanguSortFor(request.filters);
  return {
    rows: enriched.rows,
    scannedCount: enriched.rows.length,
    ...(window.count !== undefined ? { universeCount: window.count } : {}),
    asOf: providerAsOf(enriched.rows, options),
    sourceUrls: [window.url, ...enriched.sourceUrls],
    note: `样本：东方财富沪深选股器「${sort.field} ${sort.desc ? '降序' : '升序'}」窗口 ${window.rows.length} 行（该接口单次最多返回约 189 行），PE/PB/股息率来自同一批标的的行情快照。${request.keywords.length > 0 ? `查询词「${request.keywords.join('、')}」按行业 / 名称在该窗口内匹配。` : ''}`,
  };
}

function mergeFundamentals(rows: readonly ScreenerRow[], fundamentals: readonly ScreenerRow[]): ScreenerRow[] {
  const byCode = new Map(fundamentals.map((row) => [row.ticker.split('.')[0] ?? row.ticker, row]));
  return rows.map((row) => {
    const extra = byCode.get(row.ticker.split('.')[0] ?? row.ticker);
    if (!extra) return row;
    return {
      ...row,
      ...(extra.roe !== undefined ? { roe: extra.roe } : {}),
      ...(extra.revenueGrowth !== undefined ? { revenueGrowth: extra.revenueGrowth } : {}),
      ...(extra.profitGrowth !== undefined ? { profitGrowth: extra.profitGrowth } : {}),
    };
  });
}

/**
 * Quote-list sort that matches the query, so a filtered screen scans the
 * relevant end of the market (lowest PE first for `PE < 15`, highest 市值 first
 * for `市值 > x`) instead of an arbitrary slice.
 */
/** Human-readable label for a 行情列表 sort field, so a note names the slice that was read. */
const SORT_FIELD_LABELS: Readonly<Record<string, string>> = { f9: 'PE', f23: 'PB', f20: '市值', f3: '涨跌', f133: '股息率' };

export function describeScreenSort(sort: { field: string; desc: boolean }): string {
  return `${SORT_FIELD_LABELS[sort.field] ?? sort.field}${sort.desc ? '降序' : '升序'}`;
}

export function clistSortFor(filters: readonly ScreenFilterClause[], market: ScreenerMarket = 'cn'): { field: string; desc: boolean } {
  const fields = market === 'cn' ? CLIST_SORT_FIELDS_CN : CLIST_SORT_FIELDS;
  for (const filter of filters) {
    const field = fields[filter.field];
    if (!field) continue;
    if (ASCENDING_OPS.has(filter.op)) return { field, desc: false };
    if (DESCENDING_OPS.has(filter.op)) return { field, desc: true };
  }
  return { field: 'f20', desc: true };
}

/**
 * One real screening read.
 *
 * A Chinese sector keyword resolves to a live 板块, whose membership is exact.
 * A filter on ROE / growth is answered from the 沪深选股器 window (see
 * `fetchEastmoneyFundamentalScreen`). Everything else scans the 行情 list
 * (sorted to match the query) and enriches it with 选股器 ROE / growth; HK and US
 * only have the 行情 list. The scanned window is reported to the caller so it can
 * disclose the sample instead of implying a whole-market pass.
 */
export async function fetchEastmoneyScreenRows(request: ScreenerRowRequest & { market: ScreenerMarket }, options: EastmoneyScreenOptions = {}): Promise<ScreenerFetchResult> {
  const { market } = request;
  const rows = Math.max(EASTMONEY_SCREEN_PAGE_ROWS, Math.min((request.limit + 1) * EASTMONEY_SCREEN_PAGE_ROWS, EASTMONEY_SCREEN_WINDOW_ROWS));
  const sort = clistSortFor(request.filters, market);
  const wantsFundamentals = request.filters.some((filter) => FUNDAMENTAL_FIELDS.includes(filter.field));
  if (market === 'cn' && wantsFundamentals) return fetchEastmoneyFundamentalScreen(request, options);
  if (market === 'cn' && request.keywords.length > 0) {
    const board = await resolveEastmoneyBoard(request.keywords[0]!, options);
    if (board) {
      const members = await fetchEastmoneyQuoteRows({ segments: `b:${board.code}`, market, rows }, options);
      return { ...members, note: `样本：东方财富板块「${board.name}」实时成员 ${members.rows.length} 只。` };
    }
  }
  const quotes = await fetchEastmoneyQuoteRows({ segments: EASTMONEY_SCREEN_SEGMENTS[market], market, rows, sortField: sort.field, sortDesc: sort.desc }, options);
  if (market !== 'cn') {
    return { ...quotes, note: `样本：东方财富${market === 'hk' ? '港股' : '美股'}行情列表按${describeScreenSort(sort)}前 ${quotes.rows.length} 名。` };
  }
  const fundamentals = await fetchXuanguWindow([], options);
  return {
    ...quotes,
    rows: mergeFundamentals(quotes.rows, fundamentals.rows),
    sourceUrls: [...quotes.sourceUrls, fundamentals.url],
    note: `样本：沪深行情列表按${describeScreenSort(sort)}前 ${quotes.rows.length} 名（全市场 ${quotes.universeCount ?? '未知'} 只，仅该窗口被筛选）；ROE 等基本面只覆盖与选股器窗口（${fundamentals.rows.length} 行）的交集。`,
  };
}

/** Applies keyword narrowing, the spec filters, sort and limit to real rows. */
export function selectScreenerRows(result: ScreenerFetchResult, request: { keywords: readonly string[]; filters: readonly ScreenFilterClause[]; limit: number }, evaluate: (row: ScreenStockRow, clause: ScreenFilterClause) => boolean): { rows: ScreenStockRow[]; scannedCount: number; universeCount?: number; asOf: string; sourceUrls: string[]; note?: string } {
  const rows = result.rows
    .filter((row) => matchesKeyword(row, request.keywords))
    .map(screenerRowToScreenStockRow)
    .filter((row) => request.filters.every((filter) => evaluate(row, filter)))
    .sort((left, right) => (right.marketCap ?? 0) - (left.marketCap ?? 0))
    .slice(0, request.limit);
  const note = `${result.note ?? ''}${eastmoneyMirrorNote(result.sourceUrls)}`;
  return { rows, scannedCount: result.scannedCount, ...(result.universeCount !== undefined ? { universeCount: result.universeCount } : {}), asOf: result.asOf, sourceUrls: result.sourceUrls, ...(note ? { note } : {}) };
}

function matchesKeyword(row: ScreenerRow, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return true;
  const industry = row.industry.toLocaleLowerCase();
  const name = row.name.toLocaleLowerCase();
  return keywords.some((keyword) => {
    const needle = keyword.trim().toLocaleLowerCase();
    return needle.length > 0 && (industry.includes(needle) || name.includes(needle));
  });
}

export function createEastmoneyScreenLoader(options: EastmoneyScreenOptions = {}): ScreenerRowLoader {
  const cache = new Map<string, { at: number; result: ScreenerFetchResult }>();
  return async (request) => {
    const market = asScreenerMarket(request.universe);
    const key = `${market}|${request.keywords.join(',')}|${request.filters.map((filter) => `${filter.field}${filter.op}${JSON.stringify(filter.value)}`).join(',')}|${request.limit}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < EASTMONEY_SCREEN_CACHE_TTL_MS) return cached.result;
    const result = await fetchEastmoneyScreenRows({ ...request, market }, options);
    cache.set(key, { at: Date.now(), result });
    return result;
  };
}

let defaultLoader: ScreenerRowLoader | undefined;

/** Process-wide loader so repeated /screen calls share the per-query cache. */
export function defaultEastmoneyScreenLoader(): ScreenerRowLoader {
  defaultLoader ??= createEastmoneyScreenLoader();
  return defaultLoader;
}

export function resetEastmoneyScreenLoader(): void {
  defaultLoader = undefined;
}

export interface StockScreenInput {
  market?: ScreenerMarket | 'all';
  sector?: string;
  exchange?: string;
  marketCapMin?: number;
  marketCapMax?: number;
  peMin?: number;
  peMax?: number;
  /** A-share ROE / 净资产收益率 bounds; answered from the 沪深选股器 window. */
  roeMin?: number;
  roeMax?: number;
  performance?: 'gainers' | 'losers' | 'active' | 'dividends';
  limit?: number;
}

export interface StockScreenResult {
  rows: ScreenerRow[];
  scannedCount: number;
  universeCount?: number;
  asOf: string;
  sourceUrls: string[];
  criteria: StockScreenInput;
  note?: string;
}

function inputFilters(input: StockScreenInput): ScreenFilterClause[] {
  const filters: ScreenFilterClause[] = [];
  if (input.marketCapMin !== undefined) filters.push({ field: 'marketCap', op: '>=', value: input.marketCapMin });
  if (input.marketCapMax !== undefined) filters.push({ field: 'marketCap', op: '<=', value: input.marketCapMax });
  if (input.peMin !== undefined) filters.push({ field: 'pe', op: '>=', value: input.peMin });
  if (input.peMax !== undefined) filters.push({ field: 'pe', op: '<=', value: input.peMax });
  if (input.roeMin !== undefined) filters.push({ field: 'roe', op: '>=', value: input.roeMin });
  if (input.roeMax !== undefined) filters.push({ field: 'roe', op: '<=', value: input.roeMax });
  if (input.performance === 'dividends') filters.push({ field: 'dividendYield', op: '>=', value: 3 });
  return filters;
}

function exchangeOf(ticker: string): string {
  return ticker.includes('.') ? ticker.split('.').at(-1)!.toUpperCase() : 'US';
}

function applyPerformance(rows: readonly ScreenerRow[], performance: StockScreenInput['performance']): ScreenerRow[] {
  const copy = [...rows];
  if (performance === 'gainers') return copy.filter((row) => (row.changePercent ?? 0) > 0).sort((left, right) => (right.changePercent ?? 0) - (left.changePercent ?? 0));
  if (performance === 'losers') return copy.filter((row) => (row.changePercent ?? 0) < 0).sort((left, right) => (left.changePercent ?? 0) - (right.changePercent ?? 0));
  if (performance === 'active') return copy.sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0) || (right.turnoverPercent ?? 0) - (left.turnoverPercent ?? 0));
  return copy.sort((left, right) => (right.marketCap ?? 0) - (left.marketCap ?? 0));
}

/** Clause evaluation over raw provider rows (same semantics as the NL screener). */
export function evaluateScreenerRow(row: ScreenerRow, clause: ScreenFilterClause): boolean {
  const value = row[clause.field as keyof ScreenerRow];
  if (typeof value !== 'number') return false;
  const target = Number(clause.value);
  if (clause.op === '>') return value > target;
  if (clause.op === '<') return value < target;
  if (clause.op === '>=') return value >= target;
  if (clause.op === '<=') return value <= target;
  if (clause.op === '=') return value === target;
  if (clause.op === '!=') return value !== target;
  return false;
}

/**
 * Real screening for the `stock_screener` / `screen_astocks` tools: live
 * 东方财富 行情列表 / 板块成员, plus 选股器 ROE for A 股. Fails closed when the
 * provider or the transport is unavailable — no snapshot rows are substituted.
 */
export async function screenEastmoneyStocks(input: StockScreenInput, options: EastmoneyScreenOptions = {}): Promise<StockScreenResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const filters = inputFilters(input);
  const keywords = input.sector ? [input.sector] : [];
  const needsFundamentals = filters.some((filter) => FUNDAMENTAL_FIELDS.includes(filter.field));
  if (needsFundamentals && input.market && input.market !== 'cn' && input.market !== 'all') {
    throw new ScreenerUnavailableError('ROE 等基本面筛选仅支持 A 股（universe=cn）：港美股行情列表不提供这些字段。');
  }
  const markets: ScreenerMarket[] = input.market && input.market !== 'all' ? [input.market] : needsFundamentals ? ['cn'] : ['cn', 'hk', 'us'];
  const collected: ScreenerRow[] = [];
  const sourceUrls: string[] = [];
  let scannedCount = 0;
  let universeCount = 0;
  let asOf = todayIso(options.now ?? (() => new Date()));
  const notes: string[] = needsFundamentals && (!input.market || input.market === 'all') ? ['ROE 等基本面筛选只对 A 股生效，已限定 universe=cn。'] : [];
  for (const market of markets) {
    const result = await fetchEastmoneyScreenRows({ universe: market, keywords: market === 'cn' ? keywords : [], filters, limit, market }, options);
    sourceUrls.push(...result.sourceUrls);
    scannedCount += result.scannedCount;
    universeCount += result.universeCount ?? 0;
    if (result.asOf > asOf) asOf = result.asOf;
    if (result.note) notes.push(result.note);
    collected.push(...result.rows);
  }
  const screened = collected
    .filter((row) => !input.exchange || exchangeOf(row.ticker) === input.exchange.trim().toUpperCase())
    .filter((row) => filters.every((filter) => evaluateScreenerRow(row, filter)));
  if (input.performance === 'dividends' && markets.some((market) => market !== 'cn')) notes.push('股息率筛选只对 A 股生效。');
  if (eastmoneyMirrorNote(sourceUrls)) notes.push(eastmoneyMirrorNote(sourceUrls));
  const rows = applyPerformance(screened, input.performance).slice(0, limit);
  return { rows, scannedCount, ...(universeCount > 0 ? { universeCount } : {}), asOf, sourceUrls, criteria: input, ...(notes.length > 0 ? { note: notes.join(' ') } : {}) };
}
