import type { MarketBar } from './market-types';

export type TechnicalPeriod = 'daily' | 'weekly' | 'monthly';

export interface TechnicalBar {
  trade_date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  vol: number;
  amount: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  rsi6: number | null;
  rsi12: number | null;
  macd_dif: number | null;
  macd_dea: number | null;
  macd_histogram: number | null;
}

export interface TechnicalSnapshot {
  source: 'upup-pi://market-data/technical-data';
  ts_code: string;
  period: TechnicalPeriod;
  count: number;
  asOf: string;
  data: TechnicalBar[];
}

function round(value: number): number { return Math.round(value * 100) / 100; }

function normalizeCode(code: string): string {
  const trimmed = code.trim();
  const known: Readonly<Record<string, string>> = {
    贵州茅台: '600519.SH',
    比亚迪: '002594.SZ',
    宁德时代: '300750.SZ',
    腾讯: '00700.HK',
    腾讯控股: '00700.HK',
  };
  if (known[trimmed]) return known[trimmed];
  if (/^\d{6}$/u.test(trimmed)) {
    return `${trimmed}.${trimmed.startsWith('6') || trimmed.startsWith('68') ? 'SH' : 'SZ'}`;
  }
  return trimmed.toUpperCase();
}

function movingAverage(values: readonly number[], period: number): (number | null)[] {
  return values.map((_, index) => index < period - 1 ? null : round(values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period));
}

function relativeStrengthIndex(values: readonly number[], period: number): (number | null)[] {
  const result: (number | null)[] = Array.from({ length: values.length }, () => null);
  for (let index = period; index < values.length; index += 1) {
    let gains = 0;
    let losses = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const change = values[cursor] - values[cursor - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }
    result[index] = losses === 0 ? 100 : round(100 - 100 / (1 + gains / losses));
  }
  return result;
}

function exponentialMovingAverage(values: readonly number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier));
  }
  return result;
}

function macd(values: readonly number[]): { dif: (number | null)[]; dea: (number | null)[]; histogram: (number | null)[] } {
  const dif: (number | null)[] = Array.from({ length: values.length }, () => null);
  const dea: (number | null)[] = Array.from({ length: values.length }, () => null);
  const histogram: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (values.length < 26) return { dif, dea, histogram };
  const fast = exponentialMovingAverage(values, 12);
  const slow = exponentialMovingAverage(values, 26);
  const differences = fast.map((value, index) => value - slow[index]);
  const signal = exponentialMovingAverage(differences, 9);
  for (let index = 25; index < values.length; index += 1) {
    dif[index] = round(differences[index]);
    dea[index] = round(signal[index]);
    histogram[index] = round((differences[index] - signal[index]) * 2);
  }
  return { dif, dea, histogram };
}

function aggregateBars(bars: readonly MarketBar[], period: TechnicalPeriod): MarketBar[] {
  if (period === 'daily') return [...bars];
  const groups = new Map<string, MarketBar>();
  for (const bar of bars) {
    const date = new Date(`${bar.date}T00:00:00Z`);
    const key = period === 'monthly'
      ? bar.date.slice(0, 7)
      : `${date.getUTCFullYear()}-${String(Math.floor((date.getUTCDate() - 1) / 7)).padStart(2, '0')}-${date.getUTCMonth()}`;
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...bar });
      continue;
    }
    previous.high = Math.max(previous.high, bar.high);
    previous.low = Math.min(previous.low, bar.low);
    previous.close = bar.close;
    previous.volume += bar.volume;
    previous.date = bar.date;
  }
  return [...groups.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildTechnicalSnapshot(code: string, bars: readonly MarketBar[], period: TechnicalPeriod = 'daily'): TechnicalSnapshot {
  const sourceBars = aggregateBars(bars, period);
  if (sourceBars.length < 2) throw new Error('technical analysis requires at least two complete market bars');
  const closes = sourceBars.map((bar) => bar.close);
  const ma5 = movingAverage(closes, 5);
  const ma10 = movingAverage(closes, 10);
  const ma20 = movingAverage(closes, 20);
  const rsi6 = relativeStrengthIndex(closes, 6);
  const rsi12 = relativeStrengthIndex(closes, 12);
  const macdValues = macd(closes);
  const data = sourceBars.map((bar, index) => ({
    trade_date: bar.date.replaceAll('-', ''),
    close: round(bar.close),
    open: round(bar.open),
    high: round(bar.high),
    low: round(bar.low),
    vol: bar.volume,
    amount: round(bar.close * bar.volume),
    ma5: ma5[index],
    ma10: ma10[index],
    ma20: ma20[index],
    rsi6: rsi6[index],
    rsi12: rsi12[index],
    macd_dif: macdValues.dif[index],
    macd_dea: macdValues.dea[index],
    macd_histogram: macdValues.histogram[index],
  }));
  return { source: 'upup-pi://market-data/technical-data', ts_code: normalizeCode(code), period, count: data.length, asOf: sourceBars.at(-1)!.date, data };
}
