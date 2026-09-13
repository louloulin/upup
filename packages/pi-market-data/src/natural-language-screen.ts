export type ScreenUniverse = 'us' | 'cn' | 'hk' | 'crypto';
export type ScreenFilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'between' | 'in' | 'not-in';
export type ScreenScalar = string | number;

export interface ScreenFilterClause {
  field: string;
  op: ScreenFilterOp;
  value: ScreenScalar | [ScreenScalar, ScreenScalar] | ScreenScalar[];
}

export interface ScreenFilterSpec {
  universe: ScreenUniverse;
  template?: string;
  filters: ScreenFilterClause[];
  sortBy?: { field: string; dir: 'asc' | 'desc' };
  limit: number;
  realtime: boolean;
}

export interface ScreenStockRow {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  rsi?: number;
  priceChange1y?: number;
}

export interface NaturalLanguageScreenResult {
  ticker: string;
  name: string;
  sector: string;
  score: number;
  matchedCriteria: string[];
  metrics: { marketCap: number; pe: number; pb: number; roe: number; revenueGrowth: number; rsi?: number };
  thesis: string;
}

export interface NaturalLanguageScreenOutput {
  source: 'nl_screen';
  query: string;
  universe: ScreenUniverse;
  template?: string;
  filterCount: number;
  scannedCount: number;
  matchedCount: number;
  results: NaturalLanguageScreenResult[];
}

export type NaturalLanguageScreenParser = (query: string, universe: ScreenUniverse) => ScreenFilterSpec;
export interface RealtimeScreenSnapshot { rsi: number; priceChange1y: number }
export type RealtimeScreenFetcher = (tickers: string[]) => Promise<Record<string, RealtimeScreenSnapshot>>;

export const NATURAL_LANGUAGE_SCREEN_UNIVERSE: readonly ScreenStockRow[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'tech', marketCap: 3_000e9, pe: 28, pb: 47, roe: 150, revenueGrowth: 6, profitGrowth: 8, rsi: 52, priceChange1y: 22 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'tech', marketCap: 2_800e9, pe: 35, pb: 12, roe: 35, revenueGrowth: 12, profitGrowth: 15, rsi: 58, priceChange1y: 30 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'tech', marketCap: 2_200e9, pe: 60, pb: 50, roe: 90, revenueGrowth: 100, profitGrowth: 200, rsi: 70, priceChange1y: 180 },
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'finance', marketCap: 550e9, pe: 12, pb: 1.8, roe: 16, revenueGrowth: 5, profitGrowth: 12, rsi: 48, priceChange1y: 25 },
  { ticker: 'BAC', name: 'Bank of America', sector: 'finance', marketCap: 280e9, pe: 11, pb: 1.2, roe: 10, revenueGrowth: 2, profitGrowth: -3, rsi: 45, priceChange1y: 5 },
  { ticker: 'WMT', name: 'Walmart', sector: 'consumer', marketCap: 420e9, pe: 30, pb: 7, roe: 19, revenueGrowth: 5, profitGrowth: 8, rsi: 50, priceChange1y: 20 },
  { ticker: 'COST', name: 'Costco', sector: 'consumer', marketCap: 380e9, pe: 50, pb: 17, roe: 30, revenueGrowth: 7, profitGrowth: 10, rsi: 55, priceChange1y: 35 },
  { ticker: 'PFE', name: 'Pfizer', sector: 'healthcare', marketCap: 160e9, pe: 14, pb: 1.8, roe: 12, revenueGrowth: -3, profitGrowth: -20, rsi: 30, priceChange1y: -35 },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'healthcare', marketCap: 400e9, pe: 22, pb: 5.5, roe: 22, revenueGrowth: 3, profitGrowth: 5, rsi: 45, priceChange1y: 8 },
  { ticker: 'XOM', name: 'Exxon Mobil', sector: 'energy', marketCap: 450e9, pe: 13, pb: 2, roe: 18, revenueGrowth: 8, profitGrowth: 15, rsi: 55, priceChange1y: 15 },
  { ticker: 'TSLA', name: 'Tesla', sector: 'consumer', marketCap: 700e9, pe: 65, pb: 12, roe: 20, revenueGrowth: 18, profitGrowth: -10, rsi: 38, priceChange1y: -25 },
  { ticker: 'META', name: 'Meta Platforms', sector: 'tech', marketCap: 1_300e9, pe: 25, pb: 8, roe: 30, revenueGrowth: 22, profitGrowth: 60, rsi: 62, priceChange1y: 80 },
  { ticker: 'GOOG', name: 'Alphabet', sector: 'tech', marketCap: 2_000e9, pe: 25, pb: 6.5, roe: 28, revenueGrowth: 14, profitGrowth: 25, rsi: 55, priceChange1y: 40 },
  { ticker: 'BABA', name: 'Alibaba', sector: 'tech', marketCap: 200e9, pe: 12, pb: 1.5, roe: 12, revenueGrowth: 5, profitGrowth: 8, rsi: 42, priceChange1y: -10 },
  { ticker: 'GS', name: 'Goldman Sachs', sector: 'finance', marketCap: 130e9, pe: 13, pb: 1.4, roe: 11, revenueGrowth: 4, profitGrowth: 6, rsi: 48, priceChange1y: 12 },
];

export const deterministicScreenParser: NaturalLanguageScreenParser = (query, universe) => {
  const filters: ScreenFilterClause[] = [];
  let template: string | undefined;
  if (/AAPL[-_ ]?like|类似\s*AAPL/i.test(query)) template = 'AAPL-like';
  else if (/momentum|动量/i.test(query)) template = 'momentum';
  else if (/复利|compound/i.test(query)) template = 'compound';
  else if (/\bvalue\b|价值/i.test(query) && !/growth/i.test(query)) template = 'value';
  else if (/\bgrowth\b|成长/i.test(query) && !/value/i.test(query)) template = 'growth';
  const numeric = (pattern: RegExp, field: string) => {
    const match = query.match(pattern);
    if (match) filters.push({ field, op: match[1] as ScreenFilterOp, value: Number(match[2]) });
  };
  numeric(/\b(?:pe|p\/e|市盈率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i, 'pe');
  numeric(/\b(?:pb|p\/b|市净率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i, 'pb');
  numeric(/\b(?:roe)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i, 'roe');
  numeric(/\b(?:rsi)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i, 'rsi');
  numeric(/\b(?:revenue[\s_-]*growth|营收增长)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i, 'revenueGrowth');
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
  return { universe, ...(template ? { template } : {}), filters, sortBy: { field: 'score', dir: 'desc' }, limit: 50, realtime: false };
};

function evaluate(row: ScreenStockRow, clause: ScreenFilterClause): boolean {
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
  if (template === 'AAPL-like') { if (row.sector === 'tech') result += 15; if (row.roe > 25) result += 10; if (row.marketCap > 1e12) result += 10; }
  else if (template === 'momentum') { if ((row.rsi ?? 0) > 50) result += 15; if ((row.priceChange1y ?? 0) > 20) result += 15; }
  else if (template === 'value') { if (row.pe > 0 && row.pe < 20) result += 15; if (row.pb < 3) result += 10; }
  else if (template === 'growth') { if (row.revenueGrowth > 15) result += 15; if (row.profitGrowth > 20) result += 15; }
  else if (template === 'compound') { if (row.roe > 15) result += 10; if (row.revenueGrowth > 10) result += 10; if (row.profitGrowth > 10) result += 10; }
  return Math.max(0, Math.min(100, Math.round(result + Math.min(20, filterCount * 5))));
}

function thesis(row: ScreenStockRow, template: string | undefined): string {
  const marketCap = (row.marketCap / 1e9).toFixed(1);
  if (template === 'AAPL-like') return `${row.name} — large-cap ${row.sector} leader, ROE ${row.roe.toFixed(1)}% (mcap $${marketCap}B).`;
  if (template === 'momentum') return `${row.name} — RSI ${row.rsi ?? '?'} with 1y price change ${row.priceChange1y ?? '?'}%.`;
  if (template === 'value') return `${row.name} — PE ${row.pe.toFixed(1)} / PB ${row.pb.toFixed(1)} at ${row.roe.toFixed(1)}% ROE.`;
  if (template === 'growth') return `${row.name} — revenue growth ${row.revenueGrowth.toFixed(1)}%, profit growth ${row.profitGrowth.toFixed(1)}%.`;
  if (template === 'compound') return `${row.name} — 复利型: ROE ${row.roe.toFixed(1)}% + revenue ${row.revenueGrowth.toFixed(1)}% + profit ${row.profitGrowth.toFixed(1)}%.`;
  return `${row.name} (${row.ticker}) — ${row.sector} | mcap $${marketCap}B, ROE ${row.roe.toFixed(1)}%, PE ${row.pe.toFixed(1)}.`;
}

export async function executeNaturalLanguageScreen(spec: ScreenFilterSpec, universe: readonly ScreenStockRow[] = NATURAL_LANGUAGE_SCREEN_UNIVERSE, realtimeFetcher?: RealtimeScreenFetcher): Promise<NaturalLanguageScreenResult[]> {
  let rows: ScreenStockRow[];
  if (spec.realtime) {
    const fetcher = realtimeFetcher ?? (async (tickers: string[]) => Object.fromEntries(tickers.map(ticker => {
      const row = universe.find(item => item.ticker === ticker);
      return row?.rsi !== undefined && row.priceChange1y !== undefined ? [ticker, { rsi: row.rsi, priceChange1y: row.priceChange1y }] : [];
    })));
    const snapshots = await fetcher(universe.map(row => row.ticker));
    rows = universe.filter(row => snapshots[row.ticker]).map(row => ({ ...row, ...snapshots[row.ticker] }));
  } else rows = universe.filter(row => row.rsi !== undefined);
  return rows.flatMap(row => {
    const matchedCriteria = spec.filters.filter(filter => evaluate(row, filter)).map(filter => `${filter.field} ${filter.op} ${JSON.stringify(filter.value)}`);
    if (matchedCriteria.length !== spec.filters.length) return [];
    return [{ ticker: row.ticker, name: row.name, sector: row.sector, score: score(row, spec.template, spec.filters.length), matchedCriteria, metrics: { marketCap: row.marketCap, pe: row.pe, pb: row.pb, roe: row.roe, revenueGrowth: row.revenueGrowth, rsi: row.rsi }, thesis: thesis(row, spec.template) }];
  }).sort((left, right) => right.score - left.score).slice(0, spec.limit);
}

export async function runNaturalLanguageScreen(query: string, options: { universe?: ScreenUniverse; limit?: number; realtime?: boolean; parser?: NaturalLanguageScreenParser; stockUniverse?: readonly ScreenStockRow[]; realtimeFetcher?: RealtimeScreenFetcher } = {}): Promise<NaturalLanguageScreenOutput> {
  const universe = options.universe ?? 'us';
  const spec = { ...(options.parser ?? deterministicScreenParser)(query, universe), limit: options.limit ?? 50, realtime: options.realtime ?? false };
  const results = await executeNaturalLanguageScreen(spec, options.stockUniverse, options.realtimeFetcher);
  return { source: 'nl_screen', query, universe, ...(spec.template ? { template: spec.template } : {}), filterCount: spec.filters.length, scannedCount: (options.stockUniverse ?? NATURAL_LANGUAGE_SCREEN_UNIVERSE).length, matchedCount: results.length, results };
}
