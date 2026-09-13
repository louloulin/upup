import { getStockSnapshot, type ScreeningStock } from './screener.js';

export type SectorQueryType = 'stock' | 'concept' | 'industry';
export type MarketStructureType = 'top_list' | 'hsgt' | 'moneyflow' | 'margin';

export interface SectorSnapshot {
  code?: string;
  type: SectorQueryType;
  sector: string;
  members: ScreeningStock[];
  asOf: '2026-09-12';
}

export interface MarketStructureSnapshot {
  type: MarketStructureType;
  asOf: '2026-09-12';
  data: readonly Record<string, string | number>[];
}

const AS_OF = '2026-09-12' as const;

const SECTOR_ALIASES: Readonly<Record<string, string>> = {
  '新能源车': '新能源',
  '电动车': '新能源',
  '新能源汽车': '新能源',
  芯片: '半导体',
  人工智能: 'Technology',
  AI: 'Technology',
  互联网: '互联网',
};

const MARKET_STRUCTURE: Readonly<Record<MarketStructureType, readonly Record<string, string | number>[]>> = {
  top_list: [
    { symbol: '002594.SZ', name: '比亚迪', reason: '连续上涨', netBuy: 128.4, seats: 5 },
    { symbol: '688981.SH', name: '中芯国际', reason: '机构大额买入', netBuy: 96.2, seats: 4 },
  ],
  hsgt: [
    { symbol: '600519.SH', name: '贵州茅台', holdingChange: 1.8, netFlow: 42.6 },
    { symbol: '601318.SH', name: '中国平安', holdingChange: -0.7, netFlow: -18.4 },
  ],
  moneyflow: [
    { sector: '新能源', mainNetFlow: 86.3, retailNetFlow: -24.1, ranking: 1 },
    { sector: '半导体', mainNetFlow: 52.8, retailNetFlow: -11.7, ranking: 2 },
    { sector: '银行', mainNetFlow: -31.5, retailNetFlow: 14.9, ranking: 3 },
  ],
  margin: [
    { symbol: '601398.SH', name: '工商银行', financingBalance: 186.2, change: 2.1 },
    { symbol: '300750.SZ', name: '宁德时代', financingBalance: 142.7, change: -3.4 },
  ],
};

function canonicalSector(value: string): string {
  const normalized = value.trim();
  return SECTOR_ALIASES[normalized] ?? normalized;
}

function resolveStock(code: string): ScreeningStock | undefined {
  const normalized = code.trim().toLocaleLowerCase();
  return getStockSnapshot().find((stock) => stock.symbol.toLocaleLowerCase() === normalized || stock.name.toLocaleLowerCase() === normalized);
}

export function querySectorSnapshot(code: string | undefined, type: SectorQueryType = 'stock'): SectorSnapshot | { sectors: readonly string[]; type: SectorQueryType; asOf: '2026-09-12' } {
  const snapshot = getStockSnapshot().filter((stock) => stock.market === 'cn');
  if (!code) {
    return { type, sectors: [...new Set(snapshot.map((stock) => stock.sector))].sort(), asOf: AS_OF };
  }
  const stock = type === 'stock' ? resolveStock(code) : undefined;
  const sector = stock?.sector ?? canonicalSector(code);
  const members = snapshot.filter((candidate) => candidate.sector === sector || candidate.name.includes(code));
  return { code, type, sector, members, asOf: AS_OF };
}

export function getMarketStructureSnapshot(type: MarketStructureType): MarketStructureSnapshot {
  return { type, asOf: AS_OF, data: MARKET_STRUCTURE[type] };
}
