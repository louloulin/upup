export interface NativeAStockFinancialPeriod {
  period: string;
  reportDate: string;
  revenue: number;
  netIncome: number;
  eps: number;
  roe: number;
  grossMargin: number;
  totalAssets: number;
  totalLiabilities: number;
  operatingCashflow: number;
}

export interface NativeAStockFinancials {
  ts_code: string;
  name: string;
  asOf: '2026-09-12';
  periods: NativeAStockFinancialPeriod[];
}

const AS_OF = '2026-09-12' as const;
const SNAPSHOTS: Readonly<Record<string, NativeAStockFinancials>> = {
  '600519.SH': { ts_code: '600519.SH', name: '贵州茅台', asOf: AS_OF, periods: [
    { period: '2025', reportDate: '2026-04-01', revenue: 1750.9, netIncome: 862.3, eps: 68.6, roe: 28.4, grossMargin: 91.2, totalAssets: 2860.4, totalLiabilities: 730.8, operatingCashflow: 942.1 },
    { period: '2024', reportDate: '2025-04-02', revenue: 1708.6, netIncome: 847.2, eps: 67.5, roe: 30.1, grossMargin: 91.4, totalAssets: 2612.5, totalLiabilities: 641.7, operatingCashflow: 911.8 },
  ] },
  '002594.SZ': { ts_code: '002594.SZ', name: '比亚迪', asOf: AS_OF, periods: [
    { period: '2025', reportDate: '2026-03-31', revenue: 8122.1, netIncome: 412.7, eps: 14.2, roe: 18.6, grossMargin: 21.8, totalAssets: 10240.5, totalLiabilities: 6941.2, operatingCashflow: 1102.4 },
    { period: '2024', reportDate: '2025-03-28', revenue: 7771.0, netIncome: 402.3, eps: 13.8, roe: 19.7, grossMargin: 20.2, totalAssets: 9367.1, totalLiabilities: 6288.4, operatingCashflow: 1088.6 },
  ] },
  '300750.SZ': { ts_code: '300750.SZ', name: '宁德时代', asOf: AS_OF, periods: [
    { period: '2025', reportDate: '2026-04-10', revenue: 4123.6, netIncome: 522.4, eps: 11.9, roe: 20.2, grossMargin: 24.7, totalAssets: 6890.3, totalLiabilities: 4031.2, operatingCashflow: 806.7 },
    { period: '2024', reportDate: '2025-04-08', revenue: 3620.1, netIncome: 507.2, eps: 11.5, roe: 22.8, grossMargin: 26.1, totalAssets: 6153.0, totalLiabilities: 3610.5, operatingCashflow: 771.4 },
  ] },
};
const NAME_TO_CODE: Readonly<Record<string, string>> = { 贵州茅台: '600519.SH', 比亚迪: '002594.SZ', 宁德时代: '300750.SZ' };

function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (NAME_TO_CODE[trimmed]) return NAME_TO_CODE[trimmed];
  if (/^\d{6}$/u.test(trimmed)) return `${trimmed}.${trimmed.startsWith('6') || trimmed.startsWith('68') ? 'SH' : 'SZ'}`;
  return trimmed.toUpperCase();
}

export function getNativeAStockFinancials(code: string, period?: string): NativeAStockFinancials | null {
  const snapshot = SNAPSHOTS[normalizeCode(code)];
  if (!snapshot) return null;
  if (!period) return { ...snapshot, periods: [...snapshot.periods] };
  const periods = snapshot.periods.filter((item) => item.period === period || item.period.startsWith(period));
  return periods.length > 0 ? { ...snapshot, periods } : null;
}

export function listNativeAStockFinancialSymbols(): readonly string[] { return Object.keys(SNAPSHOTS); }
