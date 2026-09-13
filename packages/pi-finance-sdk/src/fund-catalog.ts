export interface NativeFundCatalogEntry {
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly scale?: number;
  readonly netGrowth12?: number;
  readonly detail?: NativeFundDetailSnapshot;
}

export interface NativeFundPerformanceSnapshot {
  readonly oneMonth?: number;
  readonly threeMonths?: number;
  readonly sixMonths?: number;
  readonly oneYear?: number;
  readonly threeYears?: number;
  readonly fiveYears?: number;
  readonly yearToDate?: number;
  readonly sinceInception?: number;
}

export interface NativeFundHoldingSnapshot {
  readonly stockCode: string;
  readonly stockName: string;
  readonly holdingPercent: number;
  readonly valuePercent: number;
}

export interface NativeFundManagerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly tenureYears: number;
  readonly funds: readonly string[];
  readonly totalScale: number;
  readonly avgReturn1Y?: number;
  readonly avgReturn3Y?: number;
}

export interface NativeFundDetailSnapshot {
  readonly establishment?: string;
  readonly company?: string;
  readonly manager?: string;
  readonly rating?: string;
  readonly unitValue?: number;
  readonly accumulatedValue?: number;
  readonly performance?: NativeFundPerformanceSnapshot;
  readonly holdings?: readonly NativeFundHoldingSnapshot[];
  readonly managerProfile?: NativeFundManagerSnapshot;
}

export const NATIVE_FUND_SNAPSHOT_AS_OF = '2026-09-12';

function toCatalogSummary(fund: NativeFundCatalogEntry): Omit<NativeFundCatalogEntry, 'detail'> {
  const { detail: _detail, ...summary } = fund;
  return summary;
}

const FUND_CATALOG: readonly NativeFundCatalogEntry[] = [
  {
    code: '005827', name: '易方达蓝筹精选混合', type: '混合型', scale: 210, netGrowth12: 13.6,
    detail: {
      establishment: '2018-09-05', company: '易方达基金', manager: '张坤', rating: '五星', unitValue: 1.2345, accumulatedValue: 2.3456,
      performance: { oneMonth: 2.1, threeMonths: 5.6, sixMonths: 8.4, oneYear: 13.6, threeYears: -4.2, fiveYears: 42.8, yearToDate: 6.3, sinceInception: 134.56 },
      holdings: [
        { stockCode: '600519.SH', stockName: '贵州茅台', holdingPercent: 8.2, valuePercent: 8.2 },
        { stockCode: '000858.SZ', stockName: '五粮液', holdingPercent: 6.4, valuePercent: 6.4 },
        { stockCode: '00700.HK', stockName: '腾讯控股', holdingPercent: 5.9, valuePercent: 5.9 },
      ],
      managerProfile: { id: 'manager-zhangkun', name: '张坤', company: '易方达基金', tenureYears: 8.1, funds: ['005827', '110022'], totalScale: 680, avgReturn1Y: 13.6, avgReturn3Y: -4.2 },
    },
  },
  {
    code: '110022', name: '易方达消费行业股票', type: '股票型', scale: 180, netGrowth12: 15.2,
    detail: {
      establishment: '2010-08-20', company: '易方达基金', manager: '萧楠', rating: '五星', unitValue: 4.1234, accumulatedValue: 4.9876,
      performance: { oneMonth: 1.8, threeMonths: 6.2, sixMonths: 9.7, oneYear: 15.2, threeYears: 2.4, fiveYears: 68.1, yearToDate: 7.1, sinceInception: 312.4 },
      holdings: [
        { stockCode: '600519.SH', stockName: '贵州茅台', holdingPercent: 9.1, valuePercent: 9.1 },
        { stockCode: '000858.SZ', stockName: '五粮液', holdingPercent: 7.3, valuePercent: 7.3 },
        { stockCode: '603288.SH', stockName: '海天味业', holdingPercent: 5.5, valuePercent: 5.5 },
      ],
      managerProfile: { id: 'manager-xiaonan', name: '萧楠', company: '易方达基金', tenureYears: 10.4, funds: ['110022'], totalScale: 180, avgReturn1Y: 15.2, avgReturn3Y: 2.4 },
    },
  },
  {
    code: '161725', name: '招商中证白酒指数', type: '指数型', scale: 520, netGrowth12: 8.5,
    detail: {
      establishment: '2015-05-27', company: '招商基金', manager: '侯昊', rating: '四星', unitValue: 1.0456, accumulatedValue: 1.6789,
      performance: { oneMonth: 0.8, threeMonths: 3.4, sixMonths: 5.6, oneYear: 8.5, threeYears: -12.1, fiveYears: 35.6, yearToDate: 4.2, sinceInception: 67.89 },
      holdings: [
        { stockCode: '600519.SH', stockName: '贵州茅台', holdingPercent: 14.8, valuePercent: 14.8 },
        { stockCode: '000858.SZ', stockName: '五粮液', holdingPercent: 14.1, valuePercent: 14.1 },
        { stockCode: '002304.SZ', stockName: '洋河股份', holdingPercent: 8.7, valuePercent: 8.7 },
      ],
      managerProfile: { id: 'manager-houhao', name: '侯昊', company: '招商基金', tenureYears: 7.2, funds: ['161725'], totalScale: 520, avgReturn1Y: 8.5, avgReturn3Y: -12.1 },
    },
  },
  {
    code: '163406', name: '兴全合润混合', type: '混合型', scale: 280, netGrowth12: 12.8,
    detail: {
      establishment: '2010-04-22', company: '兴证全球基金', manager: '谢治宇', rating: '五星', unitValue: 1.8765, accumulatedValue: 4.321, 
      performance: { oneMonth: 2.4, threeMonths: 4.8, sixMonths: 7.9, oneYear: 12.8, threeYears: 1.6, fiveYears: 54.2, yearToDate: 5.9, sinceInception: 332.1 },
      holdings: [
        { stockCode: '601318.SH', stockName: '中国平安', holdingPercent: 6.8, valuePercent: 6.8 },
        { stockCode: '600036.SH', stockName: '招商银行', holdingPercent: 6.1, valuePercent: 6.1 },
        { stockCode: '300750.SZ', stockName: '宁德时代', holdingPercent: 5.7, valuePercent: 5.7 },
      ],
      managerProfile: { id: 'manager-xiezhiyu', name: '谢治宇', company: '兴证全球基金', tenureYears: 9.6, funds: ['163406'], totalScale: 280, avgReturn1Y: 12.8, avgReturn3Y: 1.6 },
    },
  },
  { code: '005911', name: '广发双擎升级混合', type: '混合型', scale: 150, netGrowth12: 18.5 },
  { code: '003095', name: '中欧医疗健康混合', type: '混合型', scale: 420, netGrowth12: -5.2 },
  { code: '320007', name: '诺安成长混合', type: '混合型', scale: 200, netGrowth12: 22.1 },
  { code: '260108', name: '景顺长城新兴成长', type: '混合型', scale: 160, netGrowth12: 9.8 },
  { code: '001071', name: '华安媒体互联网', type: '混合型', scale: 80, netGrowth12: 25.3 },
  { code: '001513', name: '富国新动力灵活配置', type: '混合型', scale: 60, netGrowth12: 16.4 },
  { code: '002001', name: '华夏回报混合', type: '混合型', scale: 140, netGrowth12: 11.2 },
  { code: '000961', name: '天弘安康颐养', type: '混合型', scale: 45, netGrowth12: 6.8 },
  { code: '110001', name: '易方达价值精选', type: '混合型', scale: 95, netGrowth12: 10.5 },
  { code: '000031', name: '华夏大盘精选混合', type: '混合型' },
  { code: '000300', name: '华夏沪深300指数', type: '指数型' },
  { code: '159915', name: '易方达创业板ETF', type: '指数型' },
  { code: '159920', name: '华夏恒生ETF', type: '指数型' },
  { code: '000001', name: '华夏成长混合', type: '混合型' },
  { code: '100032', name: '富国中证红利指数', type: '指数型' },
  { code: '110003', name: '易方达上证50指数', type: '指数型' },
  { code: '159941', name: '纳指100ETF', type: '指数型' },
  { code: '163402', name: '兴全趋势投资', type: '混合型' },
  { code: '519767', name: '交银成长混合', type: '混合型' },
  { code: '040004', name: '华安宝利配置混合', type: '混合型' },
  { code: '070032', name: '嘉实优化红利混合', type: '混合型' },
  { code: '510300', name: '华泰柏瑞沪深300ETF', type: '指数型' },
];

export function searchNativeFunds(keyword: string): readonly NativeFundCatalogEntry[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) throw new Error('keyword must not be empty');
  return FUND_CATALOG.filter((fund) =>
    fund.code.includes(normalized) || fund.name.toLowerCase().includes(normalized) || fund.type.includes(normalized),
  ).slice(0, 20).map(toCatalogSummary);
}

export interface NativeFundScreenInput {
  readonly type?: string;
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly minReturn?: number;
  readonly sortBy?: 'return' | 'scale' | 'rating' | 'name';
  readonly limit?: number;
}

export function screenNativeFunds(input: NativeFundScreenInput = {}): readonly NativeFundCatalogEntry[] {
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be an integer between 1 and 50');
  for (const [name, value] of [['minScale', input.minScale], ['maxScale', input.maxScale], ['minReturn', input.minReturn]] as const) {
    if (value !== undefined && !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  }
  if (input.minScale !== undefined && input.maxScale !== undefined && input.minScale > input.maxScale) throw new Error('minScale must not exceed maxScale');
  let results = FUND_CATALOG.filter((fund) => fund.scale !== undefined && fund.netGrowth12 !== undefined);
  if (input.type) results = results.filter((fund) => fund.type === input.type);
  if (input.minScale !== undefined) results = results.filter((fund) => fund.scale! >= input.minScale!);
  if (input.maxScale !== undefined) results = results.filter((fund) => fund.scale! <= input.maxScale!);
  if (input.minReturn !== undefined) results = results.filter((fund) => fund.netGrowth12! >= input.minReturn!);
  const sortBy = input.sortBy ?? 'return';
  results = [...results].sort((left, right) => {
    if (sortBy === 'scale') return right.scale! - left.scale!;
    if (sortBy === 'name') return left.name.localeCompare(right.name, 'zh-CN');
    return right.netGrowth12! - left.netGrowth12!;
  });
  return results.slice(0, limit).map(toCatalogSummary);
}

export function getTopNativeFunds(limit = 10): readonly NativeFundCatalogEntry[] {
  return screenNativeFunds({ limit, sortBy: 'return' });
}

function findNativeFund(fundCode: string): NativeFundCatalogEntry | undefined {
  const normalized = fundCode.trim();
  if (!normalized) throw new Error('fundCode must not be empty');
  return FUND_CATALOG.find((fund) => fund.code === normalized);
}

export interface NativeFundDetailResult {
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly scale?: number;
  readonly snapshot: NativeFundDetailSnapshot;
  readonly asOf: string;
}

export function getNativeFundDetail(fundCode: string): NativeFundDetailResult | null {
  const fund = findNativeFund(fundCode);
  if (!fund) return null;
  return { code: fund.code, name: fund.name, type: fund.type, scale: fund.scale, snapshot: fund.detail ?? {}, asOf: NATIVE_FUND_SNAPSHOT_AS_OF };
}

export interface NativeFundPerformanceResult {
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly performance: NativeFundPerformanceSnapshot;
  readonly asOf: string;
}

export function getNativeFundPerformance(fundCode: string): NativeFundPerformanceResult | null {
  const detail = getNativeFundDetail(fundCode);
  if (!detail) return null;
  return { code: detail.code, name: detail.name, type: detail.type, performance: detail.snapshot.performance ?? {}, asOf: detail.asOf };
}

export interface NativeFundHoldingsResult {
  readonly code: string;
  readonly name: string;
  readonly holdings: readonly NativeFundHoldingSnapshot[];
  readonly asOf: string;
}

export function getNativeFundHoldings(fundCode: string): NativeFundHoldingsResult | null {
  const detail = getNativeFundDetail(fundCode);
  if (!detail) return null;
  return { code: detail.code, name: detail.name, holdings: detail.snapshot.holdings ?? [], asOf: detail.asOf };
}

export interface NativeFundManagerResult {
  readonly code: string;
  readonly fundName: string;
  readonly manager: NativeFundManagerSnapshot | null;
  readonly asOf: string;
}

export type NativeFundComparisonPeriod = '1M' | '3M' | '6M' | '1Y' | '3Y';

export interface NativeFundComparisonItem {
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly manager?: string;
  readonly returnPct?: number;
  readonly scale?: number;
}

export interface NativeFundComparisonResult {
  readonly period: NativeFundComparisonPeriod;
  readonly funds: readonly NativeFundComparisonItem[];
  readonly missingCodes: readonly string[];
  readonly asOf: string;
}

export function getNativeFundManager(fundCode: string): NativeFundManagerResult | null {
  const detail = getNativeFundDetail(fundCode);
  if (!detail) return null;
  return { code: detail.code, fundName: detail.name, manager: detail.snapshot.managerProfile ?? null, asOf: detail.asOf };
}

export function compareNativeFunds(
  fundCodes: readonly string[],
  period: NativeFundComparisonPeriod = '1Y',
): NativeFundComparisonResult {
  if (!Array.isArray(fundCodes) || fundCodes.length < 2 || fundCodes.length > 10) {
    throw new Error('fundCodes must contain between 2 and 10 fund codes');
  }
  const uniqueCodes = [...new Set(fundCodes.map((code) => code.trim()).filter(Boolean))];
  if (uniqueCodes.length !== fundCodes.length) throw new Error('fundCodes must contain unique non-empty codes');
  const performanceKey: Record<NativeFundComparisonPeriod, keyof NativeFundPerformanceSnapshot> = {
    '1M': 'oneMonth', '3M': 'threeMonths', '6M': 'sixMonths', '1Y': 'oneYear', '3Y': 'threeYears',
  };
  const key = performanceKey[period];
  if (!key) throw new Error(`unsupported comparison period: ${period}`);
  const funds: NativeFundComparisonItem[] = [];
  const missingCodes: string[] = [];
  for (const code of uniqueCodes) {
    const detail = getNativeFundDetail(code);
    if (!detail) {
      missingCodes.push(code);
      continue;
    }
    funds.push({
      code: detail.code,
      name: detail.name,
      type: detail.type,
      manager: detail.snapshot.manager,
      returnPct: detail.snapshot.performance?.[key],
      scale: detail.scale,
    });
  }
  funds.sort((left, right) => (right.returnPct ?? Number.NEGATIVE_INFINITY) - (left.returnPct ?? Number.NEGATIVE_INFINITY));
  return { period, funds, missingCodes, asOf: NATIVE_FUND_SNAPSHOT_AS_OF };
}
