/**
 * Natural-language screening over real market data.
 *
 * The parser turns a query (`PE < 15 且 ROE > 20%`, `白酒 低估值`, `AAPL-like`)
 * into a filter spec, and the spec is answered by a real row loader — by
 * default the Eastmoney-backed one in `./screen-eastmoney`. There is no
 * built-in fixture universe: when the loader or the provider is unavailable the
 * caller gets an error instead of a plausible-looking table.
 */
import {
  asScreenerMarket,
  defaultEastmoneyScreenLoader,
  eastmoneyScreenUniverseFields,
  selectScreenerRows,
  ScreenerUnavailableError,
  type ScreenerFetchResult,
  type ScreenerRowLoader,
} from './screen-eastmoney';

import type { ScreenFilterClause, ScreenFilterOp, ScreenStockRow, ScreenUniverse } from './screen-types';

export type { ScreenFilterClause, ScreenFilterOp, ScreenScalar, ScreenStockRow, ScreenUniverse } from './screen-types';

export interface ScreenFilterSpec {
  universe: ScreenUniverse;
  template?: string;
  /** Sector / concept text lifted out of the query (白酒, 半导体, 银行…). */
  keywords: string[];
  filters: ScreenFilterClause[];
  sortBy?: { field: string; dir: 'asc' | 'desc' };
  limit: number;
  realtime: boolean;
}

export interface NaturalLanguageScreenMetrics {
  marketCap?: number;
  pe?: number;
  pb?: number;
  roe?: number;
  revenueGrowth?: number;
  profitGrowth?: number;
  dividendYield?: number;
  changePercent?: number;
  rsi?: number;
}

export interface NaturalLanguageScreenResult {
  ticker: string;
  name: string;
  sector: string;
  score: number;
  matchedCriteria: string[];
  metrics: NaturalLanguageScreenMetrics;
  thesis: string;
}

export interface NaturalLanguageScreenOutput {
  source: 'nl_screen';
  query: string;
  universe: ScreenUniverse;
  template?: string;
  filterCount: number;
  /** Rows this screen really evaluated (the provider sample window). */
  scannedCount: number;
  /** Size of the provider universe the window was drawn from, when the provider reports one. */
  universeCount?: number;
  matchedCount: number;
  asOf: string;
  sourceUrls: string[];
  note?: string;
  results: NaturalLanguageScreenResult[];
}

export type NaturalLanguageScreenParser = (query: string, universe: ScreenUniverse) => ScreenFilterSpec;
export interface RealtimeScreenSnapshot { rsi: number; priceChange1y: number }
export type RealtimeScreenFetcher = (tickers: string[]) => Promise<Record<string, RealtimeScreenSnapshot>>;

/** Filters the built-in provider families cannot answer; the screener refuses them instead of guessing. */
export class ScreenFilterUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenFilterUnsupportedError';
  }
}

/**
 * `\b` is not a word boundary in front of a CJK label (`股息率 > 5` would never
 * match at the start of a query), so the patterns anchor on "not preceded by an
 * ASCII alphanumeric" instead — that still refuses `cape<5`.
 */
const FILTER_PATTERNS: readonly [RegExp, string][] = [
  [/(?<![A-Za-z0-9])(?:pe|p\/e|市盈率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i, 'pe'],
  [/(?<![A-Za-z0-9])(?:pb|p\/b|市净率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i, 'pb'],
  [/(?<![A-Za-z0-9])(?:roe)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i, 'roe'],
  [/(?<![A-Za-z0-9])(?:rsi)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i, 'rsi'],
  [/(?<![A-Za-z0-9])(?:revenue[\s_-]*growth|营收增长)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i, 'revenueGrowth'],
  [/(?<![A-Za-z0-9])(?:dividend[\s_-]*yield|股息率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i, 'dividendYield'],
];

const TEMPLATE_WORDS = /AAPL[-_ ]?like|类似\s*AAPL|momentum|动量|复利|compound|value|价值|成长|growth/gi;

/**
 * Query tokens that are template words, filter syntax, or filler rather than a
 * sector / concept name. Anything else is a keyword the loader may resolve
 * against a live provider 板块.
 */
const KEYWORD_STOP_WORDS = new Set([
  'aapl', 'like', 'value', 'growth', 'momentum', 'compound', 'tech', 'finance', 'healthcare', 'energy', 'consumer',
  'pe', 'pb', 'roe', 'rsi', 'p', 'e', 'b', 'ex', 'low', 'high', 'cap', 'large', 'small', 'mid', 'realtime', 'universe', 'true', 'false', 'yes', 'no',
  '且', '和', '与', '或', '或者', '的', '我', '想要', '请', '找', '帮我', '看看', '筛选', '选股', '要求', '股票', '股', '标',
  '价值', '成长', '成长股', '价值股', '复利', '复利型', '动量', '低估', '低估值', '高估', '便宜', '贵', '白马', '蓝筹', '龙头',
  '小盘', '中盘', '大盘', '市值', '美元', '组合', '投资', '主题', '板块', '行业', '概念', '跌深', '实时', '排除', '非金融', '金融',
  '市盈率', '市净率', '营收增长', '股息率', '增长',
]);

export function extractScreenKeywords(query: string): string[] {
  const withoutFilters = query
    .replace(TEMPLATE_WORDS, ' ')
    .replace(/(?<![A-Za-z0-9])(?:pe|p\/e|市盈率|pb|p\/b|市净率|roe|rsi|revenue[\s_-]*growth|营收增长|dividend[\s_-]*yield|股息率)\s*[<>=!]+\s*\d+(?:\.\d+)?\s*%?/gi, ' ')
    .replace(/市值\s*\$?\d+(?:\.\d+)?\s*B?(?:\s*-\s*\$?\d+(?:\.\d+)?\s*B?)?/gi, ' ')
    .replace(/\b\w+\s*=\s*[\w-]+/g, ' ')
    .replace(/[$%]/g, ' ');
  const tokens = withoutFilters.split(/[\s,，、;；:：/|()（）【】\[\]"'“”‘’!！?？。]+|[-–—+]/u);
  const keywords: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed.length < 2) continue;
    if (/^\d+(?:\.\d+)?[A-Za-z]*$/u.test(trimmed)) continue;
    if (KEYWORD_STOP_WORDS.has(trimmed.toLocaleLowerCase())) continue;
    if (/^(?:pe|pb|roe|rsi|eps|ma\d*)$/i.test(trimmed)) continue;
    if (!keywords.includes(trimmed)) keywords.push(trimmed);
  }
  return keywords;
}

export const deterministicScreenParser: NaturalLanguageScreenParser = (query, universe) => {
  const filters: ScreenFilterClause[] = [];
  let template: string | undefined;
  if (/AAPL[-_ ]?like|类似\s*AAPL/i.test(query)) template = 'AAPL-like';
  else if (/momentum|动量/i.test(query)) template = 'momentum';
  else if (/复利|compound/i.test(query)) template = 'compound';
  else if (/\bvalue\b|价值|低估/i.test(query) && !/growth/i.test(query)) template = 'value';
  else if (/\bgrowth\b|成长/i.test(query) && !/value/i.test(query)) template = 'growth';
  for (const [pattern, field] of FILTER_PATTERNS) {
    const match = query.match(pattern);
    if (match) filters.push({ field, op: match[1] as ScreenFilterOp, value: Number(match[2]) });
  }
  const range = query.match(/市值\s*\$?(\d+(?:\.\d+)?)B?\s*-\s*\$?(\d+(?:\.\d+)?)B/i);
  if (range) filters.push({ field: 'marketCap', op: 'between', value: [Number(range[1]) * 1e9, Number(range[2]) * 1e9] });
  else {
    const large = query.match(/市值\s*>\s*\$?(\d+(?:\.\d+)?)\s*B|大市值|large[\s_-]*cap/i);
    if (large) filters.push({ field: 'marketCap', op: '>', value: large[1] ? Number(large[1]) * 1e9 : 10e9 });
    const small = query.match(/市值\s*<\s*\$?(\d+(?:\.\d+)?)\s*B|小市值|small[\s_-]*cap/i);
    if (small) filters.push({ field: 'marketCap', op: '<', value: small[1] ? Number(small[1]) * 1e9 : 2e9 });
  }
  if (/跌深|deep[\s_-]*pullback|pullback/i.test(query)) filters.push({ field: 'priceChange1y', op: '<', value: -30 });
  if (/ex[-_ ]?金融|exclude\s*finance|非金融/i.test(query)) filters.push({ field: 'sector', op: '!=', value: 'finance' });
  return { universe, ...(template ? { template } : {}), keywords: extractScreenKeywords(query), filters, sortBy: { field: 'score', dir: 'desc' }, limit: 50, realtime: false };
};

export function evaluateScreenFilter(row: ScreenStockRow, clause: ScreenFilterClause): boolean {
  const value = row[clause.field as keyof ScreenStockRow];
  if (value === undefined || value === null) return false;
  const values = Array.isArray(clause.value) ? clause.value : [clause.value];
  if (typeof value === 'string' || typeof clause.value === 'string') {
    const current = String(value);
    if (clause.op === '=') return current === String(clause.value);
    if (clause.op === '!=') return current !== String(clause.value);
    if (clause.op === 'in') return values.some(item => String(item) === current);
    if (clause.op === 'not-in') return values.every(item => String(item) !== current);
    return false;
  }
  const current = Number(value);
  if (clause.op === '=') return current === Number(clause.value);
  if (clause.op === '!=') return current !== Number(clause.value);
  if (clause.op === '>') return current > Number(clause.value);
  if (clause.op === '<') return current < Number(clause.value);
  if (clause.op === '>=') return current >= Number(clause.value);
  if (clause.op === '<=') return current <= Number(clause.value);
  if (clause.op === 'between' && values.length === 2) return current >= Number(values[0]) && current <= Number(values[1]);
  if (clause.op === 'in') return values.some(item => current === Number(item));
  if (clause.op === 'not-in') return values.every(item => current !== Number(item));
  return false;
}

function score(row: ScreenStockRow, template: string | undefined, filterCount: number): number {
  let result = 50;
  if (template === 'AAPL-like') { if (row.sector === 'tech' || /信息|软件|半导体|电子/u.test(row.sector)) result += 15; if ((row.roe ?? 0) > 25) result += 10; if ((row.marketCap ?? 0) > 1e12) result += 10; }
  else if (template === 'momentum') { if ((row.rsi ?? 0) > 50) result += 15; if ((row.priceChange1y ?? 0) > 20) result += 15; }
  else if (template === 'value') { if (row.pe !== undefined && row.pe > 0 && row.pe < 20) result += 15; if (row.pb !== undefined && row.pb < 3) result += 10; }
  else if (template === 'growth') { if ((row.revenueGrowth ?? 0) > 15) result += 15; if ((row.profitGrowth ?? 0) > 20) result += 15; }
  else if (template === 'compound') { if ((row.roe ?? 0) > 15) result += 10; if ((row.revenueGrowth ?? 0) > 10) result += 10; if ((row.profitGrowth ?? 0) > 10) result += 10; }
  return Math.max(0, Math.min(100, Math.round(result + Math.min(20, filterCount * 5))));
}

function formatMarketCap(value: number, market: string | undefined): string {
  return market === 'us' ? `$${(value / 1e9).toFixed(1)}B` : `${(value / 1e8).toFixed(0)}亿元`;
}

function thesis(row: ScreenStockRow): string {
  const parts: string[] = [];
  if (row.marketCap !== undefined) parts.push(`市值 ${formatMarketCap(row.marketCap, row.market)}`);
  if (row.pe !== undefined) parts.push(`PE ${row.pe.toFixed(1)}`);
  if (row.pb !== undefined) parts.push(`PB ${row.pb.toFixed(2)}`);
  if (row.roe !== undefined) parts.push(`ROE ${row.roe.toFixed(1)}%`);
  if (row.dividendYield !== undefined) parts.push(`股息率 ${row.dividendYield.toFixed(2)}%`);
  if (row.revenueGrowth !== undefined) parts.push(`营收增速 ${row.revenueGrowth.toFixed(1)}%`);
  if (row.profitGrowth !== undefined) parts.push(`净利增速 ${row.profitGrowth.toFixed(1)}%`);
  if (row.changePercent !== undefined) parts.push(`涨跌 ${row.changePercent.toFixed(2)}%`);
  if (row.rsi !== undefined) parts.push(`RSI ${row.rsi}`);
  return `${row.name} (${row.ticker}) — ${row.sector}${parts.length > 0 ? ` | ${parts.join(' · ')}` : ''}`;
}

function metricsOf(row: ScreenStockRow): NaturalLanguageScreenMetrics {
  return {
    ...(row.marketCap !== undefined ? { marketCap: row.marketCap } : {}),
    ...(row.pe !== undefined ? { pe: row.pe } : {}),
    ...(row.pb !== undefined ? { pb: row.pb } : {}),
    ...(row.roe !== undefined ? { roe: row.roe } : {}),
    ...(row.revenueGrowth !== undefined ? { revenueGrowth: row.revenueGrowth } : {}),
    ...(row.profitGrowth !== undefined ? { profitGrowth: row.profitGrowth } : {}),
    ...(row.dividendYield !== undefined ? { dividendYield: row.dividendYield } : {}),
    ...(row.changePercent !== undefined ? { changePercent: row.changePercent } : {}),
    ...(row.rsi !== undefined ? { rsi: row.rsi } : {}),
  };
}

/** Refuses filters the selected universe genuinely cannot answer, instead of returning a silent empty table. */
export function assertScreenFiltersSupported(spec: ScreenFilterSpec): void {
  const market = asScreenerMarket(spec.universe);
  const fields = eastmoneyScreenUniverseFields(market);
  const unsupported = [...new Set(spec.filters.map((filter) => filter.field).filter((field) => !fields.has(field)))];
  if (unsupported.length === 0) return;
  const hint = unsupported.some((field) => field === 'rsi' || field === 'priceChange1y')
    ? '请改用 get_technical_data / 实时行情工具。'
    : market === 'cn' ? '请检查字段名。' : `东方财富 ${market} 行情列表不提供该字段，请改用 universe=cn。`;
  throw new ScreenFilterUnsupportedError(`选股器不支持字段 ${unsupported.join(' / ')}：${hint}`);
}

export interface ExecuteScreenOptions {
  readonly loader?: ScreenerRowLoader;
  readonly limit?: number;
}

/**
 * Runs one real screening pass: the loader fetches provider rows, the spec
 * narrows them, then they are scored. No row is invented when the loader fails.
 */
export async function executeNaturalLanguageScreen(spec: ScreenFilterSpec, options: ExecuteScreenOptions = {}): Promise<{ results: NaturalLanguageScreenResult[]; fetched: ScreenerFetchResult }> {
  assertScreenFiltersSupported(spec);
  const loader = options.loader ?? defaultEastmoneyScreenLoader();
  const limit = options.limit ?? spec.limit;
  const fetched = await loader({ universe: spec.universe, keywords: spec.keywords, filters: spec.filters, limit });
  const selected = selectScreenerRows(fetched, { keywords: spec.keywords, filters: spec.filters, limit }, evaluateScreenFilter);
  const results = selected.rows
    .map((row) => ({
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      score: score(row, spec.template, spec.filters.length),
      matchedCriteria: spec.filters.filter((filter) => evaluateScreenFilter(row, filter)).map((filter) => `${filter.field} ${filter.op} ${JSON.stringify(filter.value)}`),
      metrics: metricsOf(row),
      thesis: thesis(row),
    }))
    .sort((left, right) => right.score - left.score);
  return { results, fetched: { ...fetched, rows: [], scannedCount: selected.scannedCount, ...(selected.universeCount !== undefined ? { universeCount: selected.universeCount } : {}), asOf: selected.asOf, sourceUrls: selected.sourceUrls, ...(selected.note ? { note: selected.note } : {}) } };
}

export async function runNaturalLanguageScreen(query: string, options: { universe?: ScreenUniverse; limit?: number; realtime?: boolean; parser?: NaturalLanguageScreenParser; loader?: ScreenerRowLoader } = {}): Promise<NaturalLanguageScreenOutput> {
  const universe = options.universe ?? 'us';
  const spec = { ...(options.parser ?? deterministicScreenParser)(query, universe), limit: options.limit ?? 50, realtime: options.realtime ?? false };
  const { results, fetched } = await executeNaturalLanguageScreen(spec, { ...(options.loader ? { loader: options.loader } : {}), limit: spec.limit });
  return {
    source: 'nl_screen',
    query,
    universe,
    ...(spec.template ? { template: spec.template } : {}),
    filterCount: spec.filters.length,
    scannedCount: fetched.scannedCount,
    ...(fetched.universeCount !== undefined ? { universeCount: fetched.universeCount } : {}),
    matchedCount: results.length,
    asOf: fetched.asOf,
    sourceUrls: fetched.sourceUrls,
    ...(fetched.note ? { note: fetched.note } : {}),
    results,
  };
}

export { ScreenerUnavailableError };
