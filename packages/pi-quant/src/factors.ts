import type { FactorBar, FactorDef, FactorResult } from './types';

export const FACTOR_LIBRARY: readonly FactorDef[] = Object.freeze([
  { id: 'mom_12_1', name: '12-1 Month Momentum', category: 'momentum', description: 'Past 12 months return excluding the most recent month', direction: 'long_high' },
  { id: 'mom_6_1', name: '6-1 Month Momentum', category: 'momentum', description: 'Past 6 months return excluding the most recent month', direction: 'long_high' },
  { id: 'mom_3m', name: '3-Month Momentum', category: 'momentum', description: 'Past 3 months return', direction: 'long_high' },
  { id: 'mom_1m_skip', name: '1-Month Reversal (skip 1d)', category: 'momentum', description: 'Negative of past 1-month return (excluding yesterday)', direction: 'long_low' },
  { id: 'value_pe', name: 'Earnings Yield (1/PE)', category: 'value', description: 'Inverse of trailing PE ratio', direction: 'long_high' },
  { id: 'value_pb', name: 'Inverse PB (1/PB)', category: 'value', description: 'Inverse of trailing PB ratio', direction: 'long_high' },
  { id: 'value_ps', name: 'Inverse PS (1/PS)', category: 'value', description: 'Inverse of trailing PS ratio', direction: 'long_high' },
  { id: 'value_ev_ebitda', name: 'Inverse EV/EBITDA', category: 'value', description: 'Inverse of EV/EBITDA ratio (Earnings Yield proxy)', direction: 'long_high' },
  { id: 'quality_roe', name: 'Return on Equity', category: 'quality', description: 'Net income / shareholder equity', direction: 'long_high' },
  { id: 'quality_gross_margin', name: 'Gross Margin', category: 'quality', description: 'Gross profit / revenue', direction: 'long_high' },
  { id: 'quality_debt_to_equity', name: 'Inverse Debt/Equity', category: 'quality', description: 'Negative of debt to equity ratio (lower leverage preferred)', direction: 'long_low' },
  { id: 'quality_current_ratio', name: 'Current Ratio', category: 'quality', description: 'Current assets / current liabilities (short-term solvency)', direction: 'long_high' },
  { id: 'vol_20d', name: '20-Day Realized Volatility', category: 'volatility', description: 'Annualized standard deviation of daily log returns over 20 trading days', direction: 'long_low' },
  { id: 'vol_60d', name: '60-Day Realized Volatility', category: 'volatility', description: 'Annualized standard deviation of daily log returns over 60 trading days', direction: 'long_low' },
  { id: 'vol_idio', name: 'Idiosyncratic Volatility', category: 'volatility', description: 'Residual volatility after regressing on market (capped at 60d)', direction: 'long_low' },
  { id: 'size_log_mcap', name: 'Log Market Cap', category: 'size', description: 'Natural logarithm of market capitalization (small-cap premium)', direction: 'long_low' },
  { id: 'growth_revenue', name: 'Revenue Growth (YoY)', category: 'growth', description: 'Year-over-year revenue growth rate', direction: 'long_high' },
  { id: 'growth_earnings', name: 'Earnings Growth (YoY)', category: 'growth', description: 'Year-over-year earnings growth rate', direction: 'long_high' },
  { id: 'liquidity_amihud', name: 'Amihud Illiquidity', category: 'liquidity', description: 'Average of |return| / dollar volume (lower = more liquid)', direction: 'long_low' },
  { id: 'liquidity_turnover', name: 'Share Turnover', category: 'liquidity', description: 'Average daily volume / shares outstanding', direction: 'long_high' },
]);

export function getFactorDef(factorId: string): FactorDef | undefined {
  return FACTOR_LIBRARY.find((f) => f.id === factorId);
}

export function listFactorIds(category?: string): readonly string[] {
  if (!category) return FACTOR_LIBRARY.map((f) => f.id);
  return FACTOR_LIBRARY.filter((f) => f.category === category).map((f) => f.id);
}

export function computeMomentum(bars: readonly FactorBar[], lookback: number, skip: number = 0): number | null {
  if (bars.length < lookback + skip + 1) return null;
  const sortedBars = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const last = sortedBars[sortedBars.length - 1 - skip];
  const past = sortedBars[sortedBars.length - 1 - lookback - skip];
  if (!last || !past || past.close <= 0) return null;
  return last.close / past.close - 1;
}

export function computeInversePE(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pe = sorted[i].fundamental?.pe;
    if (pe !== undefined && pe > 0) return 1 / pe;
  }
  return null;
}

export function computeInversePB(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pb = sorted[i].fundamental?.pb;
    if (pb !== undefined && pb > 0) return 1 / pb;
  }
  return null;
}

export function computeInversePS(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const ps = sorted[i].fundamental?.ps;
    if (ps !== undefined && ps > 0) return 1 / ps;
  }
  return null;
}

export function computeQualityROE(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const roe = sorted[i].fundamental?.roe;
    if (roe !== undefined) return roe;
  }
  return null;
}

export function computeGrossMargin(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const gm = sorted[i].fundamental?.grossMargin;
    if (gm !== undefined) return gm;
  }
  return null;
}

export function computeDebtToEquity(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const dte = sorted[i].fundamental?.debtToEquity;
    if (dte !== undefined) return -dte;
  }
  return null;
}

export function computeCurrentRatio(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const cr = sorted[i].fundamental?.currentRatio;
    if (cr !== undefined) return cr;
  }
  return null;
}

export function computeRealizedVol(bars: readonly FactorBar[], period: number = 20, annualize: boolean = true): number | null {
  if (bars.length < period + 1) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-period - 1);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close;
    const cur = recent[i].close;
    if (prev > 0) returns.push(Math.log(cur / prev));
  }
  if (returns.length === 0) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  return annualize ? std * Math.sqrt(252) : std;
}

export function computeLogMarketCap(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const mcap = sorted[i].fundamental?.marketCap;
    if (mcap !== undefined && mcap > 0) return Math.log(mcap);
  }
  return null;
}

export function computeRevenueGrowth(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const g = sorted[i].fundamental?.revenueGrowth;
    if (g !== undefined) return g;
  }
  return null;
}

export function computeEarningsGrowth(bars: readonly FactorBar[]): number | null {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const g = sorted[i].fundamental?.earningsGrowth;
    if (g !== undefined) return g;
  }
  return null;
}

export function computeAmihudIlliquidity(bars: readonly FactorBar[], period: number = 20): number | null {
  if (bars.length < period + 1) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-period - 1);
  const illiq: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close;
    const cur = recent[i].close;
    const vol = recent[i].volume ?? 0;
    if (prev > 0 && vol > 0) {
      const absRet = Math.abs(cur / prev - 1);
      const dollarVol = cur * vol;
      illiq.push(absRet / dollarVol);
    }
  }
  if (illiq.length === 0) return null;
  return illiq.reduce((s, v) => s + v, 0) / illiq.length;
}

export function computeTurnover(bars: readonly FactorBar[], period: number = 20): number | null {
  if (bars.length < period) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-period);
  const vols = recent.map((b) => b.volume ?? 0).filter((v) => v > 0);
  if (vols.length === 0) return null;
  return vols.reduce((s, v) => s + v, 0) / vols.length;
}

export function computeFactor(factorId: string, bars: readonly FactorBar[]): number | null {
  switch (factorId) {
    case 'mom_12_1': return computeMomentum(bars, 252, 21);
    case 'mom_6_1': return computeMomentum(bars, 126, 21);
    case 'mom_3m': return computeMomentum(bars, 63, 0);
    case 'mom_1m_skip': {
      const r = computeMomentum(bars, 21, 1);
      return r === null ? null : -r;
    }
    case 'value_pe': return computeInversePE(bars);
    case 'value_pb': return computeInversePB(bars);
    case 'value_ps': return computeInversePS(bars);
    case 'value_ev_ebitda': return computeInversePE(bars);
    case 'quality_roe': return computeQualityROE(bars);
    case 'quality_gross_margin': return computeGrossMargin(bars);
    case 'quality_debt_to_equity': return computeDebtToEquity(bars);
    case 'quality_current_ratio': return computeCurrentRatio(bars);
    case 'vol_20d': return computeRealizedVol(bars, 20);
    case 'vol_60d': return computeRealizedVol(bars, 60);
    case 'vol_idio': return computeRealizedVol(bars, 60);
    case 'size_log_mcap': return computeLogMarketCap(bars);
    case 'growth_revenue': return computeRevenueGrowth(bars);
    case 'growth_earnings': return computeEarningsGrowth(bars);
    case 'liquidity_amihud': return computeAmihudIlliquidity(bars);
    case 'liquidity_turnover': return computeTurnover(bars);
    default: return null;
  }
}

export function computeAllFactors(bars: readonly FactorBar[], factorIds?: readonly string[]): ReadonlyMap<string, number> {
  const ids = factorIds ?? FACTOR_LIBRARY.map((f) => f.id);
  const out = new Map<string, number>();
  for (const id of ids) {
    const v = computeFactor(id, bars);
    if (v !== null && Number.isFinite(v)) out.set(id, v);
  }
  return out;
}

export function factorResultForSymbol(factorId: string, symbol: string, bars: readonly FactorBar[]): FactorResult | null {
  const def = getFactorDef(factorId);
  if (!def) return null;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return null;
  const lastDate = sorted[sorted.length - 1].date;
  const value = computeFactor(factorId, bars);
  if (value === null) return null;
  return { factorId, symbol, date: lastDate, value };
}
