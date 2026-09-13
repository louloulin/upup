import { getNativeAStockFinancials } from './astock-financials.js';

export interface NativeFinancialPeriod {
  period: string;
  revenue: number;
  netIncome: number;
  eps: number;
  grossMargin: number;
  roe: number;
  totalAssets: number;
  totalLiabilities: number;
  operatingCashflow: number;
}

export interface NativeFinancialSnapshot {
  symbol: string;
  company: string;
  market: 'cn' | 'hk' | 'us';
  asOf: '2026-09-12';
  periods: NativeFinancialPeriod[];
  metrics: {
    latestRevenue: number;
    latestNetIncome: number;
    latestEps: number;
    latestRoe: number;
    latestGrossMargin: number;
    debtToAssets: number;
  };
  scope: 'historical-offline-snapshot';
}

const AS_OF = '2026-09-12' as const;

const US_SNAPSHOTS: Readonly<Record<string, Omit<NativeFinancialSnapshot, 'metrics' | 'scope'>>> = {
  AAPL: {
    symbol: 'AAPL', company: 'Apple', market: 'us', asOf: AS_OF,
    periods: [
      { period: '2025', revenue: 4161.6, netIncome: 1120.1, eps: 7.45, grossMargin: 46.9, roe: 157.4, totalAssets: 3592.0, totalLiabilities: 3080.0, operatingCashflow: 1114.0 },
      { period: '2024', revenue: 3910.4, netIncome: 937.4, eps: 6.08, grossMargin: 46.2, roe: 157.0, totalAssets: 3526.0, totalLiabilities: 2870.0, operatingCashflow: 1040.0 },
    ],
  },
  MSFT: {
    symbol: 'MSFT', company: 'Microsoft', market: 'us', asOf: AS_OF,
    periods: [
      { period: '2025', revenue: 2817.2, netIncome: 1018.3, eps: 13.66, grossMargin: 69.8, roe: 34.1, totalAssets: 6190.0, totalLiabilities: 2750.0, operatingCashflow: 1360.0 },
      { period: '2024', revenue: 2451.2, netIncome: 881.4, eps: 11.80, grossMargin: 69.5, roe: 35.2, totalAssets: 5120.0, totalLiabilities: 2430.0, operatingCashflow: 1180.0 },
    ],
  },
  TSLA: {
    symbol: 'TSLA', company: 'Tesla', market: 'us', asOf: AS_OF,
    periods: [
      { period: '2025', revenue: 1034.2, netIncome: 84.7, eps: 2.41, grossMargin: 18.7, roe: 18.9, totalAssets: 1420.0, totalLiabilities: 690.0, operatingCashflow: 162.0 },
      { period: '2024', revenue: 976.9, netIncome: 71.3, eps: 2.04, grossMargin: 19.8, roe: 20.1, totalAssets: 1190.0, totalLiabilities: 580.0, operatingCashflow: 149.0 },
    ],
  },
  NVDA: {
    symbol: 'NVDA', company: 'NVIDIA', market: 'us', asOf: AS_OF,
    periods: [
      { period: '2025', revenue: 2159.4, netIncome: 1203.0, eps: 4.88, grossMargin: 74.9, roe: 112.0, totalAssets: 1110.0, totalLiabilities: 420.0, operatingCashflow: 980.0 },
      { period: '2024', revenue: 1304.9, netIncome: 728.8, eps: 2.95, grossMargin: 72.7, roe: 91.2, totalAssets: 650.0, totalLiabilities: 270.0, operatingCashflow: 560.0 },
    ],
  },
};

const ALIASES: Readonly<Record<string, string>> = {
  apple: 'AAPL', microsoft: 'MSFT', 微软: 'MSFT', tesla: 'TSLA', 特斯拉: 'TSLA', nvidia: 'NVDA', 英伟达: 'NVDA', 苹果: 'AAPL',
  比亚迪: '002594.SZ', 贵州茅台: '600519.SH', 茅台: '600519.SH', 宁德时代: '300750.SZ',
};

function normalizeSymbol(query: string): string | undefined {
  const trimmed = query.trim();
  const alias = Object.entries(ALIASES).find(([name]) => trimmed.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  if (alias) return alias[1];
  const aStock = trimmed.match(/\b\d{6}(?:\.(?:SH|SZ|BJ))?\b/iu)?.[0];
  if (aStock) return aStock.toUpperCase().includes('.') ? aStock.toUpperCase() : `${aStock}.${aStock.startsWith('6') ? 'SH' : 'SZ'}`;
  const hk = trimmed.match(/\b\d{5}\.HK\b/iu)?.[0];
  if (hk) return hk.toUpperCase();
  const us = trimmed.match(/\b[A-Z]{1,5}\b/u)?.[0];
  return us?.toUpperCase();
}

function metrics(period: NativeFinancialPeriod[]): NativeFinancialSnapshot['metrics'] {
  const latest = period[0];
  return {
    latestRevenue: latest.revenue,
    latestNetIncome: latest.netIncome,
    latestEps: latest.eps,
    latestRoe: latest.roe,
    latestGrossMargin: latest.grossMargin,
    debtToAssets: Number((latest.totalLiabilities / latest.totalAssets).toFixed(4)),
  };
}

export function getNativeFinancialSnapshot(query: string): NativeFinancialSnapshot | null {
  const symbol = normalizeSymbol(query);
  if (!symbol) return null;
  const astock = getNativeAStockFinancials(symbol);
  if (astock) {
    const periods = astock.periods.map((period) => ({ period: period.period, revenue: period.revenue, netIncome: period.netIncome, eps: period.eps, grossMargin: period.grossMargin, roe: period.roe, totalAssets: period.totalAssets, totalLiabilities: period.totalLiabilities, operatingCashflow: period.operatingCashflow }));
    return { symbol: astock.ts_code, company: astock.name, market: 'cn', asOf: astock.asOf, periods, metrics: metrics(periods), scope: 'historical-offline-snapshot' };
  }
  const snapshot = US_SNAPSHOTS[symbol];
  if (!snapshot) return null;
  const periods = snapshot.periods.map((period) => ({ ...period }));
  return { ...snapshot, periods, metrics: metrics(periods), scope: 'historical-offline-snapshot' };
}

export function listNativeFinancialSymbols(): readonly string[] {
  return [...Object.keys(US_SNAPSHOTS), '002594.SZ', '300750.SZ', '600519.SH'].sort();
}
