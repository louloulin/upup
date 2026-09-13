export type NativeAStockNewsKind = 'announcement' | 'market';

export interface NativeAStockNewsItem {
  id: string;
  tsCode?: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  kind: NativeAStockNewsKind;
}

export interface NativeAStockNewsQuery {
  code?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface NativeAStockNewsResult {
  type: NativeAStockNewsKind;
  tsCode?: string;
  asOf: '2026-09-12';
  count: number;
  items: NativeAStockNewsItem[];
}

const AS_OF = '2026-09-12' as const;

const NEWS: readonly NativeAStockNewsItem[] = [
  { id: 'news-002594-20260911-1', tsCode: '002594.SZ', title: '比亚迪发布新能源业务经营进展快照', summary: '离线样本记录销量、产能和海外业务跟踪主题。', source: 'upup-fixture', publishedAt: '2026-09-11', kind: 'announcement' },
  { id: 'news-002594-20260910-1', tsCode: '002594.SZ', title: '比亚迪产业链观察', summary: '离线样本记录电池材料与汽车产业链变化主题。', source: 'upup-fixture', publishedAt: '2026-09-10', kind: 'announcement' },
  { id: 'news-600519-20260911-1', tsCode: '600519.SH', title: '贵州茅台渠道与库存观察', summary: '离线样本记录白酒渠道、库存和现金流跟踪主题。', source: 'upup-fixture', publishedAt: '2026-09-11', kind: 'announcement' },
  { id: 'news-600519-20260909-1', tsCode: '600519.SH', title: '消费行业历史快照更新', summary: '离线样本记录消费行业景气度和估值观察主题。', source: 'upup-fixture', publishedAt: '2026-09-09', kind: 'announcement' },
  { id: 'news-300750-20260910-1', tsCode: '300750.SZ', title: '宁德时代电池产业链观察', summary: '离线样本记录电池技术、原材料和资本开支主题。', source: 'upup-fixture', publishedAt: '2026-09-10', kind: 'announcement' },
  { id: 'news-market-20260912-1', title: 'A 股市场结构历史快照', summary: '离线样本记录指数、行业轮动和成交主题。', source: 'upup-fixture', publishedAt: '2026-09-12', kind: 'market' },
  { id: 'news-market-20260911-1', title: '宏观与风险偏好历史快照', summary: '离线样本记录利率、汇率和风险偏好主题。', source: 'upup-fixture', publishedAt: '2026-09-11', kind: 'market' },
];

const NAME_TO_CODE: Readonly<Record<string, string>> = {
  比亚迪: '002594.SZ',
  贵州茅台: '600519.SH',
  茅台: '600519.SH',
  宁德时代: '300750.SZ',
};

function normalizeCode(value: string): string {
  const trimmed = value.trim();
  if (NAME_TO_CODE[trimmed]) return NAME_TO_CODE[trimmed];
  if (/^\d{6}$/u.test(trimmed)) return `${trimmed}.${trimmed.startsWith('6') || trimmed.startsWith('68') ? 'SH' : 'SZ'}`;
  return trimmed.toUpperCase();
}

function normalizeDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new Error(`${field} must be an ISO date (YYYY-MM-DD) or compact date (YYYYMMDD)`);
  }
  return normalized;
}

export function getNativeAStockNews(query: NativeAStockNewsQuery = {}): NativeAStockNewsResult | null {
  const startDate = normalizeDate(query.startDate, 'startDate');
  const endDate = normalizeDate(query.endDate, 'endDate');
  if (startDate && endDate && startDate > endDate) throw new Error('startDate must not be after endDate');
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const isMarket = !query.code || query.code.trim().toLowerCase() === 'market';
  const tsCode = isMarket ? undefined : normalizeCode(query.code!);
  if (tsCode && !NEWS.some((item) => item.tsCode === tsCode)) return null;
  const items = NEWS
    .filter((item) => (isMarket ? item.kind === 'market' : item.tsCode === tsCode))
    .filter((item) => !startDate || item.publishedAt >= startDate)
    .filter((item) => !endDate || item.publishedAt <= endDate)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((item) => ({ ...item }));
  return { type: isMarket ? 'market' : 'announcement', ...(tsCode ? { tsCode } : {}), asOf: AS_OF, count: items.length, items };
}

export function listNativeAStockNewsSymbols(): readonly string[] {
  return [...new Set(NEWS.flatMap((item) => item.tsCode ? [item.tsCode] : []))].sort();
}
