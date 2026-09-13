export type ScreenerMarket = 'cn' | 'hk' | 'us';
export type ScreenerPerformance = 'gainers' | 'losers' | 'active' | 'dividends';

export interface ScreeningStock {
  symbol: string;
  name: string;
  market: ScreenerMarket;
  exchange: 'SH' | 'SZ' | 'BJ' | 'HK' | 'NASDAQ' | 'NYSE';
  sector: string;
  marketCapBillion: number;
  marketCapYi: number;
  pe: number;
  changePercent: number;
  volume: number;
  dividendYield: number;
  asOf: '2026-09-12';
}

export interface StockScreenInput {
  market?: ScreenerMarket | 'all';
  sector?: string;
  exchange?: string;
  marketCapMin?: number;
  marketCapMax?: number;
  peMin?: number;
  peMax?: number;
  performance?: ScreenerPerformance | 'volatility';
  limit?: number;
}

const SNAPSHOT_AS_OF = '2026-09-12' as const;

const STOCK_SNAPSHOT: readonly ScreeningStock[] = [
  { symbol: '600519.SH', name: '贵州茅台', market: 'cn', exchange: 'SH', sector: '白酒', marketCapBillion: 1800, marketCapYi: 18000, pe: 25.4, changePercent: 1.8, volume: 320000, dividendYield: 1.9, asOf: SNAPSHOT_AS_OF },
  { symbol: '601398.SH', name: '工商银行', market: 'cn', exchange: 'SH', sector: '银行', marketCapBillion: 2100, marketCapYi: 21000, pe: 6.2, changePercent: 0.4, volume: 850000, dividendYield: 5.8, asOf: SNAPSHOT_AS_OF },
  { symbol: '002594.SZ', name: '比亚迪', market: 'cn', exchange: 'SZ', sector: '新能源', marketCapBillion: 950, marketCapYi: 9500, pe: 22.1, changePercent: 3.6, volume: 690000, dividendYield: 0.8, asOf: SNAPSHOT_AS_OF },
  { symbol: '300750.SZ', name: '宁德时代', market: 'cn', exchange: 'SZ', sector: '新能源', marketCapBillion: 1120, marketCapYi: 11200, pe: 19.7, changePercent: -1.9, volume: 540000, dividendYield: 1.1, asOf: SNAPSHOT_AS_OF },
  { symbol: '688981.SH', name: '中芯国际', market: 'cn', exchange: 'SH', sector: '半导体', marketCapBillion: 730, marketCapYi: 7300, pe: 48.5, changePercent: 2.7, volume: 480000, dividendYield: 0.3, asOf: SNAPSHOT_AS_OF },
  { symbol: '601318.SH', name: '中国平安', market: 'cn', exchange: 'SH', sector: '保险', marketCapBillion: 920, marketCapYi: 9200, pe: 9.8, changePercent: -0.6, volume: 410000, dividendYield: 4.5, asOf: SNAPSHOT_AS_OF },
  { symbol: '000001.SZ', name: '平安银行', market: 'cn', exchange: 'SZ', sector: '银行', marketCapBillion: 185, marketCapYi: 1850, pe: 5.5, changePercent: 0.9, volume: 910000, dividendYield: 3.7, asOf: SNAPSHOT_AS_OF },
  { symbol: '00700.HK', name: '腾讯控股', market: 'hk', exchange: 'HK', sector: '互联网', marketCapBillion: 510, marketCapYi: 5100, pe: 18.3, changePercent: 2.2, volume: 12500000, dividendYield: 0.9, asOf: SNAPSHOT_AS_OF },
  { symbol: '09988.HK', name: '阿里巴巴', market: 'hk', exchange: 'HK', sector: '互联网', marketCapBillion: 280, marketCapYi: 2800, pe: 13.9, changePercent: -2.4, volume: 9800000, dividendYield: 1.2, asOf: SNAPSHOT_AS_OF },
  { symbol: 'AAPL', name: 'Apple', market: 'us', exchange: 'NASDAQ', sector: 'Technology', marketCapBillion: 3500, marketCapYi: 25000, pe: 34.2, changePercent: 1.1, volume: 52000000, dividendYield: 0.4, asOf: SNAPSHOT_AS_OF },
  { symbol: 'MSFT', name: 'Microsoft', market: 'us', exchange: 'NASDAQ', sector: 'Technology', marketCapBillion: 3100, marketCapYi: 22200, pe: 34.1, changePercent: 0.7, volume: 18000000, dividendYield: 0.7, asOf: SNAPSHOT_AS_OF },
  { symbol: 'JPM', name: 'JPMorgan Chase', market: 'us', exchange: 'NYSE', sector: 'Financials', marketCapBillion: 650, marketCapYi: 4650, pe: 12.1, changePercent: -0.2, volume: 11000000, dividendYield: 2.1, asOf: SNAPSHOT_AS_OF },
];

function matchesText(value: string, query: string | undefined): boolean {
  return !query || value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function getStockSnapshot(): readonly ScreeningStock[] { return STOCK_SNAPSHOT; }

export function screenStockSnapshot(input: StockScreenInput): ScreeningStock[] {
  const filtered = STOCK_SNAPSHOT.filter((stock) => {
    if (input.market && input.market !== 'all' && stock.market !== input.market) return false;
    if (!matchesText(stock.sector, input.sector) && !matchesText(stock.name, input.sector)) return false;
    if (input.exchange && stock.exchange !== input.exchange.trim().toUpperCase()) return false;
    const marketCap = stock.market === 'cn' ? stock.marketCapYi : stock.marketCapBillion;
    if (input.marketCapMin !== undefined && marketCap < input.marketCapMin) return false;
    if (input.marketCapMax !== undefined && marketCap > input.marketCapMax) return false;
    if (input.peMin !== undefined && stock.pe < input.peMin) return false;
    if (input.peMax !== undefined && stock.pe > input.peMax) return false;
    if (input.performance === 'gainers' && stock.changePercent <= 0) return false;
    if (input.performance === 'losers' && stock.changePercent >= 0) return false;
    if (input.performance === 'dividends' && stock.dividendYield < 3) return false;
    if (input.performance === 'volatility' && Math.abs(stock.changePercent) < 1) return false;
    return true;
  });
  const sorted = [...filtered].sort((left, right) => {
    if (input.performance === 'losers') return left.changePercent - right.changePercent;
    if (input.performance === 'active') return right.volume - left.volume;
    if (input.performance === 'dividends') return right.dividendYield - left.dividendYield;
    if (input.performance === 'volatility') return Math.abs(right.changePercent) - Math.abs(left.changePercent);
    return right.changePercent - left.changePercent;
  });
  return sorted.slice(0, Math.min(Math.max(input.limit ?? 20, 1), 100));
}

export function screenerAsOf(): '2026-09-12' { return SNAPSHOT_AS_OF; }
