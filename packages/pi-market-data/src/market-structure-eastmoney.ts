/**
 * Real Eastmoney 板块 / 资金面 reads.
 *
 * `get_sector_data` and `get_market_structure` used to answer from hard-coded
 * arrays. They now read the live public endpoints behind 东方财富's 板块 and
 * 数据中心 pages:
 *
 * - `push2.eastmoney.com/api/qt/clist/get?fs=m:90+t:2|t:3` — 行业 / 概念板块列表
 *   (also carries 主力净流入 `f62` and 净占比 `f184`).
 * - `push2.eastmoney.com/api/qt/stock/get?fields=f127` — a single stock's 行业.
 * - `push2.eastmoney.com/api/qt/kamt/get` — 沪深港通 当日资金.
 * - `datacenter-web.eastmoney.com/api/data/v1/get` — 龙虎榜 / 融资融券 明细.
 *
 * Every read is serialized through the shared per-host gate, retried once on
 * 东方财富's mirror host when the live host drops the connection, and nothing is
 * synthesised when a host is unavailable.
 */
import { eastmoneySecid } from './eastmoney';
import {
  eastmoneyClistUrl,
  eastmoneyScreenTicker,
  eastmoneySuggestUrl,
  parseEastmoneyClistRows,
  readEastmoneyDocument,
  resolveEastmoneyBoard,
  type EastmoneyScreenOptions,
} from './screen-eastmoney';

export const EASTMONEY_DATACENTER_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
export const EASTMONEY_KAMT_URL = 'https://push2.eastmoney.com/api/qt/kamt/get';
export const EASTMONEY_STOCK_DETAIL_URL = 'https://push2.eastmoney.com/api/qt/stock/get';
export const EASTMONEY_STOCK_INDUSTRY_FIELDS = 'f57,f58,f127,f128';
export const EASTMONEY_BOARD_FIELDS = 'f12,f14,f3,f62,f184';
export const EASTMONEY_KAMT_FIELDS1 = 'f1,f2,f3,f4';
export const EASTMONEY_KAMT_FIELDS2 = 'f51,f52,f53,f54,f55,f56';
export const EASTMONEY_TOP_LIST_REPORT = 'RPT_DAILYBILLBOARD_DETAILSNEW';
export const EASTMONEY_MARGIN_REPORT = 'RPTA_WEB_RZRQ_GGMX';

export type SectorQueryType = 'stock' | 'concept' | 'industry';
export type MarketStructureType = 'top_list' | 'hsgt' | 'moneyflow' | 'margin';

/** 行业板块 (t:2) 与 概念板块 (t:3). */
export const EASTMONEY_BOARD_SEGMENTS: Readonly<Record<SectorQueryType, string>> = {
  stock: 'm:90+t:2',
  industry: 'm:90+t:2',
  concept: 'm:90+t:3',
};

export interface BoardRow {
  code: string;
  name: string;
  changePercent?: number;
  mainNetInflow?: number;
  mainNetRatio?: number;
}

export interface SectorMember {
  ticker: string;
  name: string;
  industry: string;
  price?: number;
  changePercent?: number;
  pe?: number;
  pb?: number;
  marketCap?: number;
}

export interface SectorSnapshot {
  code?: string;
  type: SectorQueryType;
  sector: string;
  members: SectorMember[];
  asOf: string;
  sourceUrls: string[];
}

export interface SectorListSnapshot {
  type: SectorQueryType;
  sectors: string[];
  asOf: string;
  sourceUrls: string[];
}

export interface MarketStructureSnapshot {
  type: MarketStructureType;
  asOf: string;
  data: readonly Record<string, string | number>[];
  sourceUrls: string[];
}

export interface MarketStructureParams {
  readonly trade_date?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly limit?: number;
}

export class MarketStructureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketStructureUnavailableError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function num(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' && value.trim() !== '-' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function str(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text !== '-' ? text : undefined;
}

function isoDay(value: () => Date): string {
  return value().toISOString().slice(0, 10);
}

function rowsOf(payload: unknown): readonly Record<string, unknown>[] {
  const data = asRecord(asRecord(payload)?.result)?.data;
  return Array.isArray(data) ? data.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
}

function clistRowsOf(payload: unknown): { rows: readonly Record<string, unknown>[]; total: number } {
  const data = asRecord(asRecord(payload)?.data);
  const diff = data?.diff;
  const rows = Array.isArray(diff) ? diff.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
  return { rows, total: num(data?.total) ?? rows.length };
}

export function eastmoneyKamtUrl(): URL {
  const url = new URL(EASTMONEY_KAMT_URL);
  url.searchParams.set('fields1', EASTMONEY_KAMT_FIELDS1);
  url.searchParams.set('fields2', EASTMONEY_KAMT_FIELDS2);
  return url;
}

export function eastmoneyStockDetailUrl(secid: string): URL {
  const url = new URL(EASTMONEY_STOCK_DETAIL_URL);
  url.searchParams.set('secid', secid);
  url.searchParams.set('fields', EASTMONEY_STOCK_INDUSTRY_FIELDS);
  return url;
}

export function eastmoneyDatacenterUrl(input: { reportName: string; pageSize: number; sortColumns: string; filter?: string }): URL {
  const url = new URL(EASTMONEY_DATACENTER_URL);
  url.searchParams.set('reportName', input.reportName);
  url.searchParams.set('columns', 'ALL');
  if (input.filter) url.searchParams.set('filter', input.filter);
  url.searchParams.set('pageSize', String(input.pageSize));
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('sortColumns', input.sortColumns);
  url.searchParams.set('sortTypes', '-1');
  url.searchParams.set('source', 'WEB');
  url.searchParams.set('client', 'WEB');
  return url;
}

export function parseEastmoneyBoardRows(payload: unknown): { rows: BoardRow[]; total: number } {
  const { rows, total } = clistRowsOf(payload);
  const boards: BoardRow[] = [];
  for (const row of rows) {
    const code = str(row.f12);
    const name = str(row.f14);
    if (!code || !name) continue;
    boards.push({
      code,
      name,
      ...(num(row.f3) !== undefined ? { changePercent: num(row.f3)! } : {}),
      ...(num(row.f62) !== undefined ? { mainNetInflow: num(row.f62)! } : {}),
      ...(num(row.f184) !== undefined ? { mainNetRatio: num(row.f184)! } : {}),
    });
  }
  return { rows: boards, total };
}

/** `kamt/get` pays 沪深港通 in 万元. */
export function parseEastmoneyKamt(payload: unknown): Record<string, string | number>[] {
  const data = asRecord(asRecord(payload)?.data);
  if (!data) return [];
  const channels: readonly [string, string][] = [['hk2sh', '沪股通(北向)'], ['hk2sz', '深股通(北向)'], ['sh2hk', '港股通(沪)'], ['sz2hk', '港股通(深)']];
  const rows: Record<string, string | number>[] = [];
  for (const [key, label] of channels) {
    const entry = asRecord(data[key]);
    if (!entry) continue;
    const date = str(entry.date2) ?? '';
    rows.push({
      channel: label,
      date,
      净买入万元: num(entry.dayNetAmtIn) ?? 0,
      额度余额万元: num(entry.dayAmtRemain) ?? 0,
      额度上限万元: num(entry.dayAmtThreshold) ?? 0,
      状态: num(entry.status) ?? 0,
    });
  }
  return rows;
}

export function parseEastmoneyTopList(payload: unknown): Record<string, string | number>[] {
  return rowsOf(payload).map((row) => ({
    symbol: str(row.SECUCODE) ?? str(row.SECURITY_CODE) ?? '',
    name: str(row.SECURITY_NAME_ABBR) ?? '',
    date: (str(row.TRADE_DATE) ?? '').slice(0, 10),
    close: num(row.CLOSE_PRICE) ?? 0,
    changePercent: num(row.CHANGE_RATE) ?? 0,
    turnoverPercent: num(row.TURNOVERRATE) ?? 0,
    netBuyAmount: num(row.BILLBOARD_NET_AMT) ?? 0,
    buyAmount: num(row.BILLBOARD_BUY_AMT) ?? 0,
    sellAmount: num(row.BILLBOARD_SELL_AMT) ?? 0,
    reason: str(row.EXPLANATION) ?? str(row.EXPLAIN) ?? '',
  }));
}

export function parseEastmoneyMargin(payload: unknown): Record<string, string | number>[] {
  return rowsOf(payload).map((row) => ({
    market: str(row.MARKET) ?? '',
    symbol: str(row.SCODE) ?? '',
    name: str(row.SECNAME) ?? '',
    date: (str(row.DATE) ?? '').slice(0, 10),
    marginBalance: num(row.RZRQYE) ?? 0,
    marginBuy: num(row.RZMRE) ?? 0,
    marginRepay: num(row.RZCHE) ?? 0,
    marginNetBuy: num(row.RZJME) ?? 0,
    shortBalance: num(row.RQYE) ?? 0,
    close: num(row.SPJ) ?? 0,
    changePercent: num(row.ZDF) ?? 0,
  }));
}

/** Resolves a symbol or company name to its Eastmoney `secid` via searchapi. */
export async function resolveEastmoneySecurity(code: string, options: EastmoneyScreenOptions = {}): Promise<{ secid: string; name: string } | undefined> {
  const trimmed = code.trim();
  if (/^\d{5,6}(?:\.(?:SH|SZ|BJ|HK))?$/iu.test(trimmed)) {
    const secid = eastmoneySecid(trimmed);
    const payload = (await readEastmoneyDocument(eastmoneyStockDetailUrl(secid), options)).payload;
    return { secid, name: str(asRecord(payload.data)?.f58) ?? trimmed };
  }
  const suggest = (await readEastmoneyDocument(eastmoneySuggestUrl(trimmed), options)).payload;
  const entries = asRecord(asRecord(suggest.QuotationCodeTable)?.Data);
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    const record = asRecord(entry);
    const quoteId = str(record?.QuoteID);
    const classify = str(record?.Classify) ?? '';
    if (quoteId && quoteId.includes('.') && /stock/i.test(classify)) return { secid: quoteId, name: str(record?.Name) ?? trimmed };
  }
  return undefined;
}

/** Real single-stock 行业/板块 read (`f127` 行业, `f128` 地域板块). */
export async function fetchEastmoneyStockIndustry(code: string, options: EastmoneyScreenOptions = {}): Promise<{ ticker: string; name: string; industry: string }> {
  const resolved = await resolveEastmoneySecurity(code, options);
  if (!resolved) throw new MarketStructureUnavailableError(`无法在东方财富解析「${code}」：请给出 6 位代码（如 600519.SH）或公司简称。`);
  const payload = (await readEastmoneyDocument(eastmoneyStockDetailUrl(resolved.secid), options)).payload;
  const data = asRecord(payload.data);
  const industry = str(data?.f127) ?? str(data?.f128);
  if (!industry) throw new MarketStructureUnavailableError(`东方财富未返回「${code}」的行业字段 (f127)。`);
  return { ticker: eastmoneyScreenTicker(str(data?.f57) ?? resolved.secid.split('.')[1] ?? code, 'cn'), name: str(data?.f58) ?? resolved.name, industry };
}

async function fetchBoardMembers(boardCode: string, limit: number, options: EastmoneyScreenOptions): Promise<{ members: SectorMember[]; url: string }> {
  const url = eastmoneyClistUrl({ segments: `b:${boardCode}`, pageSize: Math.max(1, Math.min(limit, 100)), fields: 'f12,f14,f2,f3,f9,f20,f23,f100' });
  const document = await readEastmoneyDocument(url, options);
  const { rows } = parseEastmoneyClistRows(document.payload, 'cn');
  const members: SectorMember[] = rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    industry: row.industry,
    ...(row.price !== undefined ? { price: row.price } : {}),
    ...(row.changePercent !== undefined ? { changePercent: row.changePercent } : {}),
    ...(row.pe !== undefined ? { pe: row.pe } : {}),
    ...(row.pb !== undefined ? { pb: row.pb } : {}),
    ...(row.marketCap !== undefined ? { marketCap: row.marketCap } : {}),
  }));
  return { members, url: document.sourceUrl };
}

export async function fetchEastmoneyBoardList(type: SectorQueryType, options: EastmoneyScreenOptions & { limit?: number } = {}): Promise<{ boards: BoardRow[]; total: number; url: string }> {
  const url = eastmoneyClistUrl({ segments: EASTMONEY_BOARD_SEGMENTS[type], pageSize: Math.min(100, Math.max(options.limit ?? 50, 50)), sortField: 'f62', fields: EASTMONEY_BOARD_FIELDS });
  const document = await readEastmoneyDocument(url, options);
  const parsed = parseEastmoneyBoardRows(document.payload);
  return { boards: parsed.rows, total: parsed.total, url: document.sourceUrl };
}

/** 板块成员 / 板块列表 — the real backing for `get_sector_data`. */
export async function querySectorSnapshot(code: string | undefined, type: SectorQueryType = 'stock', options: EastmoneyScreenOptions & { limit?: number } = {}): Promise<SectorSnapshot | SectorListSnapshot> {
  const now = options.now ?? (() => new Date());
  if (!code) {
    const { boards, url } = await fetchEastmoneyBoardList(type, options);
    return { type, sectors: boards.map((board) => board.name), asOf: isoDay(now), sourceUrls: [url] };
  }
  const board = await resolveEastmoneyBoard(code, options);
  if (board) {
    const { members, url } = await fetchBoardMembers(board.code, options.limit ?? 50, options);
    return { code: board.code, type, sector: board.name, members, asOf: isoDay(now), sourceUrls: [url] };
  }
  const stock = await fetchEastmoneyStockIndustry(code, options);
  const industryBoard = await resolveEastmoneyBoard(stock.industry, options);
  if (!industryBoard) throw new MarketStructureUnavailableError(`东方财富没有与行业「${stock.industry}」对应的板块。`);
  const { members, url } = await fetchBoardMembers(industryBoard.code, options.limit ?? 50, options);
  return { code, type, sector: stock.industry, members, asOf: isoDay(now), sourceUrls: [url] };
}

/** 龙虎榜 / 沪深港通 / 板块资金流 / 融资融券 — the real backing for `get_market_structure`. */
export async function getMarketStructureSnapshot(type: MarketStructureType, params: MarketStructureParams = {}, options: EastmoneyScreenOptions = {}): Promise<MarketStructureSnapshot> {
  const now = options.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
  if (type === 'moneyflow') {
    const url = eastmoneyClistUrl({ segments: EASTMONEY_BOARD_SEGMENTS.industry, pageSize: limit, sortField: 'f62', fields: EASTMONEY_BOARD_FIELDS });
    const document = await readEastmoneyDocument(url, options);
    const { rows } = parseEastmoneyBoardRows(document.payload);
    const data = rows.map((row) => ({
      sector: row.name,
      boardCode: row.code,
      ...(row.changePercent !== undefined ? { changePercent: row.changePercent } : {}),
      ...(row.mainNetInflow !== undefined ? { mainNetInflow: row.mainNetInflow } : {}),
      ...(row.mainNetRatio !== undefined ? { mainNetRatio: row.mainNetRatio } : {}),
    }));
    return { type, asOf: isoDay(now), data, sourceUrls: [document.sourceUrl] };
  }
  if (type === 'hsgt') {
    const url = eastmoneyKamtUrl();
    const document = await readEastmoneyDocument(url, options);
    const data = parseEastmoneyKamt(document.payload);
    const asOf = data.map((row) => String(row.date ?? '')).filter(Boolean).sort().at(-1) ?? isoDay(now);
    return { type, asOf, data, sourceUrls: [document.sourceUrl] };
  }
  if (type === 'top_list') {
    const tradeDate = params.trade_date;
    // Without a 交易日 the report is 日期降序 — sorting the whole history by 净买额
    // would surface 2015 rows as the "latest" 龙虎榜 (measured 2026-09-17).
    const url = eastmoneyDatacenterUrl({ reportName: EASTMONEY_TOP_LIST_REPORT, pageSize: limit, sortColumns: tradeDate ? 'BILLBOARD_NET_AMT' : 'TRADE_DATE', ...(tradeDate ? { filter: `(TRADE_DATE='${tradeDate}')` } : {}) });
    const document = await readEastmoneyDocument(url, options);
    const data = parseEastmoneyTopList(document.payload);
    const asOf = data.map((row) => String(row.date ?? '')).filter(Boolean).sort().at(-1) ?? isoDay(now);
    return { type, asOf, data, sourceUrls: [document.sourceUrl] };
  }
  const filter = params.trade_date ? `(DATE='${params.trade_date}')` : params.start_date ? `(DATE>='${params.start_date}')` : undefined;
  const url = eastmoneyDatacenterUrl({ reportName: EASTMONEY_MARGIN_REPORT, pageSize: limit, sortColumns: 'DATE', ...(filter ? { filter } : {}) });
  const document = await readEastmoneyDocument(url, options);
  const data = parseEastmoneyMargin(document.payload);
  const asOf = data.map((row) => String(row.date ?? '')).filter(Boolean).sort().at(-1) ?? isoDay(now);
  return { type, asOf, data, sourceUrls: [document.sourceUrl] };
}
