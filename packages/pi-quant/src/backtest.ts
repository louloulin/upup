import type { FactorBacktestOptions, FactorBacktestResult } from './types.js';
import { rankDesc } from './normalize.js';

export interface UniverseBarSeries {
  readonly date: string;
  readonly symbolPrices: ReadonlyMap<string, number>;
}

export interface FactorSignalSeries {
  readonly date: string;
  readonly factorValues: ReadonlyMap<string, number>;
}

export function rebalanceDates(
  startDate: string,
  endDate: string,
  freq: 'daily' | 'weekly' | 'monthly',
): readonly string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (end < start) return [];
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    if (freq === 'daily') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (freq === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export function runFactorBacktest(
  factorId: string,
  signals: readonly FactorSignalSeries[],
  prices: readonly UniverseBarSeries[],
  options: FactorBacktestOptions,
): FactorBacktestResult {
  const rebalanceSet = new Set(rebalanceDates(options.startDate, options.endDate, options.rebalanceFreq));
  const sortedSignals = [...signals].sort((a, b) => a.date.localeCompare(b.date));
  const sortedPrices = [...prices].sort((a, b) => a.date.localeCompare(b.date));

  const equityCurve: { date: string; equity: number }[] = [];
  const dateUnion = new Set<string>();
  for (const s of sortedSignals) dateUnion.add(s.date);
  for (const p of sortedPrices) dateUnion.add(p.date);
  const allDates = [...dateUnion].sort();

  let equity = 1;
  let lastLongSymbols: string[] = [];
  let lastShortSymbols: string[] = [];
  let turnoverCount = 0;
  const returns: number[] = [];

  for (const date of allDates) {
    if (rebalanceSet.has(date)) {
      const signal = sortedSignals.find((s) => s.date === date);
      if (signal) {
        const sortedSyms = [...signal.factorValues.entries()]
          .sort((a, b) => b[1] - a[1])
          .map((e) => e[0]);
        const newLong = sortedSyms.slice(0, options.topN);
        const newShort = options.longShort ? sortedSyms.slice(-options.bottomN).reverse() : [];
        if (lastLongSymbols.length > 0) {
          const changed = symDiff(newLong, lastLongSymbols);
          turnoverCount += changed;
        }
        lastLongSymbols = newLong;
        lastShortSymbols = newShort;
      }
    }
    const priceRow = sortedPrices.find((p) => p.date === date);
    const prevPriceRow = sortedPrices[sortedPrices.indexOf(priceRow!) - 1];
    if (!priceRow) continue;

    let dailyReturn = 0;
    if (prevPriceRow && lastLongSymbols.length > 0) {
      const longReturns = lastLongSymbols.map((sym) => {
        const cur = priceRow.symbolPrices.get(sym);
        const prev = prevPriceRow.symbolPrices.get(sym);
        if (cur === undefined || prev === undefined || prev <= 0) return 0;
        return cur / prev - 1;
      });
      const longAvg = longReturns.length === 0 ? 0 : longReturns.reduce((s, v) => s + v, 0) / longReturns.length;
      let shortAvg = 0;
      if (options.longShort && lastShortSymbols.length > 0) {
        const shortReturns = lastShortSymbols.map((sym) => {
          const cur = priceRow.symbolPrices.get(sym);
          const prev = prevPriceRow.symbolPrices.get(sym);
          if (cur === undefined || prev === undefined || prev <= 0) return 0;
          return cur / prev - 1;
        });
        shortAvg = shortReturns.length === 0 ? 0 : shortReturns.reduce((s, v) => s + v, 0) / shortReturns.length;
        dailyReturn = longAvg - shortAvg;
      } else {
        dailyReturn = longAvg;
      }
    }
    equity *= 1 + dailyReturn;
    returns.push(dailyReturn);
    equityCurve.push({ date, equity });
  }

  const longReturn = equity - 1;
  const shortReturn = 0;
  const longShortReturn = longReturn;
  const meanR = returns.length === 0 ? 0 : returns.reduce((s, v) => s + v, 0) / returns.length;
  const stdR = returns.length === 0 ? 0 : Math.sqrt(returns.reduce((s, v) => s + (v - meanR) ** 2, 0) / Math.max(1, returns.length));
  const sharpe = stdR === 0 ? 0 : (meanR / stdR) * Math.sqrt(252);
  const mdd = maxDrawdownFromEquity(equityCurve.map((e) => e.equity));

  return {
    factorId,
    longReturn,
    shortReturn,
    longShortReturn,
    sharpe,
    maxDrawdown: mdd,
    turnover: turnoverCount,
    equity: equityCurve,
  };
}

function symDiff(a: readonly string[], b: readonly string[]): number {
  const sb = new Set(b);
  let diff = 0;
  for (const x of a) if (!sb.has(x)) diff++;
  return diff;
}

function maxDrawdownFromEquity(equity: readonly number[]): number {
  if (equity.length === 0) return 0;
  let peak = equity[0];
  let mdd = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    if (peak > 0) {
      const dd = (peak - e) / peak;
      if (dd > mdd) mdd = dd;
    }
  }
  return mdd;
}

export function topBottomSymbols(
  factorValues: ReadonlyMap<string, number>,
  topN: number,
  bottomN: number,
): { top: readonly string[]; bottom: readonly string[] } {
  const sorted = [...factorValues.entries()].sort((a, b) => b[1] - a[1]);
  return {
    top: sorted.slice(0, topN).map((e) => e[0]),
    bottom: sorted.slice(-bottomN).reverse().map((e) => e[0]),
  };
}
