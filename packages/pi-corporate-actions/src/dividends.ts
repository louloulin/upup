import type { DividendEvent } from './types.js';

export interface DividendFilterOptions {
  readonly startDate?: string;
  readonly endDate?: string;
  readonly minAmount?: number;
  readonly currency?: string;
}

export function filterDividends(
  dividends: readonly DividendEvent[],
  options: DividendFilterOptions = {},
): DividendEvent[] {
  return dividends.filter((d) => {
    if (options.startDate && d.exDate < options.startDate) return false;
    if (options.endDate && d.exDate > options.endDate) return false;
    if (options.minAmount !== undefined && d.amountPerShare < options.minAmount) return false;
    if (options.currency && d.currency !== options.currency) return false;
    return true;
  });
}

export function totalDividends(dividends: readonly DividendEvent[]): number {
  return dividends.reduce((sum, d) => sum + d.amountPerShare, 0);
}

export function dividendYieldOnDate(
  dividends: readonly DividendEvent[],
  exDate: string,
  pricePerShare: number,
): number {
  if (pricePerShare <= 0) return 0;
  const matching = dividends.filter((d) => d.exDate === exDate);
  if (matching.length === 0) return 0;
  const sum = matching.reduce((s, d) => s + d.amountPerShare, 0);
  return sum / pricePerShare;
}

export function annualizedDividendYield(
  dividends: readonly DividendEvent[],
  pricePerShare: number,
  lookbackDays: number = 365,
): number {
  if (pricePerShare <= 0 || dividends.length === 0) return 0;
  const sorted = [...dividends].sort((a, b) => a.exDate.localeCompare(b.exDate));
  const last = sorted[sorted.length - 1];
  const cutoffDate = subtractDays(last.exDate, lookbackDays);
  const trailing = sorted.filter((d) => d.exDate >= cutoffDate);
  const total = trailing.reduce((s, d) => s + d.amountPerShare, 0);
  return total / pricePerShare;
}

function subtractDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function groupDividendsByYear(
  dividends: readonly DividendEvent[],
): ReadonlyMap<number, DividendEvent[]> {
  const out = new Map<number, DividendEvent[]>();
  for (const d of dividends) {
    const year = Number.parseInt(d.exDate.slice(0, 4), 10);
    if (!Number.isFinite(year)) continue;
    const bucket = out.get(year);
    if (bucket) bucket.push(d);
    else out.set(year, [d]);
  }
  return out;
}
