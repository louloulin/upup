import { createHash } from 'node:crypto';

export type NativeAltDataSource = 'dragon-tiger' | 'north-bound';
export type NativeAltDataSentiment = 'positive' | 'neutral' | 'negative' | null;
export interface NativeAltDataEvent { readonly id: string; readonly title: string; readonly source: NativeAltDataSource; readonly url: string; readonly publishedAt: number; readonly symbols: readonly string[]; readonly sentiment: NativeAltDataSentiment; readonly raw: Readonly<Record<string, unknown>>; }
export interface NativeAltDataInput { readonly source: NativeAltDataSource; readonly symbols?: readonly string[]; readonly dateRange?: readonly [number, number]; readonly limit?: number; }
export interface NativeAltDataSearchInput { readonly query: string; readonly sources?: readonly NativeAltDataSource[]; readonly limit?: number; }
export type NativeAltDataFetcher = (url: string, init: { signal?: AbortSignal; headers: Readonly<Record<string, string>> }) => Promise<unknown>;
export interface NativeAltDataClientOptions { readonly fetcher?: NativeAltDataFetcher; readonly dragonTigerKey?: string; readonly northBoundKey?: string; }

const DRAGON_TIGER_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MARGIN_STOCK';
const NORTH_BOUND_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_STOCK_HOLDRANKS';
const SOURCES: readonly NativeAltDataSource[] = ['dragon-tiger', 'north-bound'];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const abortIfNeeded = (signal: AbortSignal | undefined): void => { if (signal?.aborted) throw new Error('alternative data request aborted'); };
function assertSource(value: string): asserts value is NativeAltDataSource { if (!SOURCES.includes(value as NativeAltDataSource)) throw new Error(`unsupported alternative data source: ${value}`); }
function symbols(value?: readonly string[]): readonly string[] | undefined { if (!value) return undefined; if (value.length > 50 || value.some((item) => !/^[A-Za-z0-9.-]{1,20}$/.test(item))) throw new Error('symbols must contain at most 50 valid identifiers'); return [...new Set(value.map((item) => item.trim().toUpperCase()))]; }
function range(value?: readonly [number, number]): readonly [number, number] | undefined { if (!value) return undefined; if (value.length !== 2 || !value.every(Number.isFinite) || value[0] > value[1]) throw new Error('dateRange must contain finite ascending timestamps'); return value; }
function limit(value: number | undefined, max: number): number { const result = value ?? max; if (!Number.isInteger(result) || result < 1 || result > max) throw new Error(`limit must be an integer between 1 and ${max}`); return result; }
function makeEvent(source: NativeAltDataSource, title: string, url: string, publishedAt: number, relatedSymbols: readonly string[], sentiment: NativeAltDataSentiment, raw: Readonly<Record<string, unknown>>, subtype: string): NativeAltDataEvent { const id = createHash('sha256').update(`${source}|${url}|${publishedAt}|${subtype}`).digest('hex'); return { id, title, source, url, publishedAt, symbols: [...relatedSymbols], sentiment, raw: { ...raw } }; }

export class NativeAltDataClient {
  private readonly fetcher: NativeAltDataFetcher;
  private readonly keys: Readonly<Record<NativeAltDataSource, string>>;
  constructor(options: NativeAltDataClientOptions = {}) {
    this.fetcher = options.fetcher ?? (async (url, init) => { const response = await fetch(url, init); if (!response.ok) throw new Error(`alternative data request failed: ${response.status} ${response.statusText}`); return response.json(); });
    this.keys = { 'dragon-tiger': options.dragonTigerKey ?? process.env.EAST_MONEY_LHB_KEY ?? '', 'north-bound': options.northBoundKey ?? process.env.HKEX_CONNECT_KEY ?? '' };
  }
  async fetch(input: NativeAltDataInput, signal?: AbortSignal): Promise<{ source: NativeAltDataSource; count: number; events: readonly NativeAltDataEvent[] }> {
    abortIfNeeded(signal); assertSource(input.source); const selected = symbols(input.symbols); const dates = range(input.dateRange); const take = limit(input.limit, 100); const key = this.keys[input.source];
    if (!key) throw new Error(`${input.source === 'dragon-tiger' ? 'EAST_MONEY_LHB_KEY' : 'HKEX_CONNECT_KEY'} is required for ${input.source}`);
    const payload = await this.fetcher(input.source === 'dragon-tiger' ? DRAGON_TIGER_URL : NORTH_BOUND_URL, { signal, headers: { Authorization: `Bearer ${key}` } }); abortIfNeeded(signal);
    const events = input.source === 'dragon-tiger' ? this.dragonTigerEvents(payload) : this.northBoundEvents(payload);
    const filtered = events.filter((item) => (!selected || item.symbols.some((symbol) => selected.includes(symbol))) && (!dates || (item.publishedAt >= dates[0] && item.publishedAt <= dates[1]))).slice(0, take);
    return { source: input.source, count: filtered.length, events: filtered };
  }
  async search(input: NativeAltDataSearchInput, signal?: AbortSignal): Promise<{ query: string; count: number; events: readonly NativeAltDataEvent[] }> {
    abortIfNeeded(signal); if (!input.query.trim() || input.query.length > 200) throw new Error('query must contain between 1 and 200 characters'); const sources = input.sources ?? SOURCES; sources.forEach(assertSource); const take = limit(input.limit, 50); const all: NativeAltDataEvent[] = [];
    for (const source of [...new Set(sources)]) { try { all.push(...(await this.fetch({ source, limit: 100 }, signal)).events); } catch (error) { if (error instanceof Error && /required/.test(error.message)) continue; throw error; } }
    const query = input.query.toLowerCase(); const events = all.filter((item) => item.title.toLowerCase().includes(query) || item.symbols.some((symbol) => symbol.toLowerCase().includes(query))).slice(0, take); return { query: input.query, count: events.length, events };
  }
  private dragonTigerEvents(payload: unknown): NativeAltDataEvent[] { if (!isRecord(payload) || !Array.isArray(payload.items)) throw new Error('dragon-tiger response is invalid'); return payload.items.flatMap((item: unknown) => { if (!isRecord(item) || typeof item.symbol !== 'string' || typeof item.branch !== 'string' || !['buy', 'sell'].includes(String(item.action)) || typeof item.amount !== 'number' || typeof item.url !== 'string' || typeof item.publishedAt !== 'number') return []; const action = item.action as 'buy' | 'sell'; return [makeEvent('dragon-tiger', `${item.branch} ${action === 'buy' ? '买入' : '卖出'} ${item.symbol} ${(item.amount / 1e8).toFixed(2)}亿`, item.url, item.publishedAt, [item.symbol.toUpperCase()], action === 'buy' ? 'positive' : 'negative', { branch: item.branch, action, amount: item.amount }, 'trade')]; }); }
  private northBoundEvents(payload: unknown): NativeAltDataEvent[] { if (!isRecord(payload) || typeof payload.date !== 'number' || !isRecord(payload.shConnect) || !isRecord(payload.szConnect) || !isRecord(payload.marginBalance)) throw new Error('north-bound response is invalid'); const sh = payload.shConnect; const sz = payload.szConnect; const margin = payload.marginBalance; if (typeof sh.netInflow !== 'number' || !Array.isArray(sh.topBuys) || typeof sz.netInflow !== 'number' || !Array.isArray(sz.topBuys) || typeof margin.total !== 'number' || typeof margin.change !== 'number') throw new Error('north-bound response fields are invalid'); const shFlow = sh.netInflow; const szFlow = sz.netInflow; const marginFlow = margin.change; const make = (type: string, title: string, related: readonly unknown[], flow: number, raw: Readonly<Record<string, unknown>>) => makeEvent('north-bound', title, `${NORTH_BOUND_URL}#${type}`, payload.date as number, related.map(String), flow > 0 ? 'positive' : flow < 0 ? 'negative' : 'neutral', raw, type); return [make('sh-connect', `沪股通净流入 ${(shFlow / 1e8).toFixed(2)}亿`, sh.topBuys, shFlow, { subType: 'sh-connect', netInflow: shFlow, topBuys: sh.topBuys }), make('sz-connect', `深股通净流入 ${(szFlow / 1e8).toFixed(2)}亿`, sz.topBuys, szFlow, { subType: 'sz-connect', netInflow: szFlow, topBuys: sz.topBuys }), make('margin', `融资融券余额变化 ${(marginFlow / 1e8).toFixed(2)}亿`, [], marginFlow, { subType: 'margin', total: margin.total, change: marginFlow })]; }
}
