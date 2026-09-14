/**
 * Technical indicators computed from price series.
 * All inputs are expected to be ordered from oldest to newest.
 * All outputs are ordered to match the input order; null values are returned
 * for indices where the indicator requires more data than is available.
 */

export interface IndicatorBar {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function ema(values: readonly number[], period: number): (number | null)[] {
  if (period < 1) throw new Error('EMA period must be >= 1');
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === undefined || !finite(value)) { out.push(null); continue; }
    if (prev === null) {
      prev = value;
      out.push(i === period - 1 ? round(value) : null);
    } else {
      prev = value * k + prev * (1 - k);
      out.push(round(prev));
    }
  }
  return out;
}

export function sma(values: readonly number[], period: number): (number | null)[] {
  if (period < 1) throw new Error('SMA period must be >= 1');
  const out: (number | null)[] = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === undefined || !finite(value)) { out.push(null); continue; }
    sum += value;
    count += 1;
    if (count > period) sum -= values[i - period]!;
    out.push(count >= period ? round(sum / period) : null);
  }
  return out;
}

export interface MACDResult {
  readonly dif: (number | null)[];
  readonly dea: (number | null)[];
  readonly histogram: (number | null)[];
}

export function computeMACD(closes: readonly number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult {
  if (fastPeriod < 1 || slowPeriod < 1 || signalPeriod < 1) throw new Error('MACD periods must be positive');
  if (fastPeriod >= slowPeriod) throw new Error('fastPeriod must be strictly less than slowPeriod');
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const dif: (number | null)[] = closes.map((_, index) => {
    const f = fast[index];
    const s = slow[index];
    return f !== null && s !== null ? round(f - s) : null;
  });
  const difNumeric = dif.map((value) => value ?? 0);
  const deaRaw = ema(difNumeric, signalPeriod);
  const dea: (number | null)[] = deaRaw.map((value, index) => (dif[index] === null ? null : value));
  const histogram: (number | null)[] = dif.map((d, index) => {
    const e = dea[index];
    if (d === null || e === null) return null;
    return round((d - e) * 2);
  });
  return { dif, dea, histogram };
}

export interface KDJResult {
  readonly k: (number | null)[];
  readonly d: (number | null)[];
  readonly j: (number | null)[];
}

export function computeKDJ(bars: readonly IndicatorBar[], n = 9, kSmooth = 3, dSmooth = 3): KDJResult {
  if (bars.length === 0 || n < 1 || kSmooth < 1 || dSmooth < 1) throw new Error('KDJ periods must be positive and bars non-empty');
  const rsv: number[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < n - 1) { rsv.push(0); continue; }
    let lowMin = Infinity;
    let highMax = -Infinity;
    for (let j = i - n + 1; j <= i; j += 1) {
      const b = bars[j]!;
      if (b.low < lowMin) lowMin = b.low;
      if (b.high > highMax) highMax = b.high;
    }
    const close = bars[i]!.close;
    const range = highMax - lowMin;
    rsv.push(range === 0 ? 50 : ((close - lowMin) / range) * 100);
  }
  const k: (number | null)[] = [];
  const d: (number | null)[] = [];
  const j: (number | null)[] = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < bars.length; i += 1) {
    if (i < n - 1) { k.push(null); d.push(null); j.push(null); continue; }
    const curK = (prevK * (kSmooth - 1) + rsv[i]!) / kSmooth;
    const curD = (prevD * (dSmooth - 1) + curK) / dSmooth;
    const curJ = 3 * curK - 2 * curD;
    k.push(round(curK, 2));
    d.push(round(curD, 2));
    j.push(round(curJ, 2));
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
}

export interface BOLLResult {
  readonly upper: (number | null)[];
  readonly middle: (number | null)[];
  readonly lower: (number | null)[];
  readonly bandwidth: (number | null)[];
}

export function computeBOLL(closes: readonly number[], period = 20, stdDevMultiplier = 2): BOLLResult {
  if (period < 2 || stdDevMultiplier <= 0) throw new Error('BOLL period must be >= 2 and stdDevMultiplier > 0');
  const middle = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < period - 1) { upper.push(null); lower.push(null); bandwidth.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1) as number[];
    const mean = middle[i]!;
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(round(mean + stdDevMultiplier * sd));
    lower.push(round(mean - stdDevMultiplier * sd));
    const mid = middle[i]!;
    bandwidth.push(mid === 0 ? null : round(((upper[i]! - lower[i]!) / mid) * 100, 2));
  }
  return { upper, middle, lower, bandwidth };
}

export function computeATR(bars: readonly IndicatorBar[], period = 14): (number | null)[] {
  if (period < 1) throw new Error('ATR period must be >= 1');
  if (bars.length === 0) return [];
  const tr: number[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const prevClose = i > 0 ? bars[i - 1]!.close : bar.close;
    const trueRange = Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
    tr.push(trueRange);
  }
  return ema(tr, period);
}

export function computeRSI(closes: readonly number[], period = 14): (number | null)[] {
  if (period < 1) throw new Error('RSI period must be >= 1');
  if (closes.length === 0) return [];
  const out: (number | null)[] = [];
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) { out.push(null); continue; }
    const change = closes[i]! - closes[i - 1]!;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      gainSum += gain;
      lossSum += loss;
      if (i === period) {
        const avgGain = gainSum / period;
        const avgLoss = lossSum / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push(round(100 - 100 / (1 + rs)));
      } else {
        out.push(null);
      }
    } else {
      const prevAvgGain = gainSum / period;
      const prevAvgLoss = lossSum / period;
      const newAvgGain = (prevAvgGain * (period - 1) + gain) / period;
      const newAvgLoss = (prevAvgLoss * (period - 1) + loss) / period;
      gainSum = newAvgGain * period;
      lossSum = newAvgLoss * period;
      const rs = newAvgLoss === 0 ? 100 : newAvgGain / newAvgLoss;
      out.push(round(100 - 100 / (1 + rs)));
    }
  }
  return out;
}

export function computeOBV(bars: readonly IndicatorBar[]): number[] {
  if (bars.length === 0) return [];
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (i === 0) { out.push(0); continue; }
    const bar = bars[i]!;
    const prevClose = bars[i - 1]!.close;
    if (bar.close > prevClose) prev += bar.volume;
    else if (bar.close < prevClose) prev -= bar.volume;
    out.push(prev);
  }
  return out;
}

export interface CCIResult {
  readonly cci: (number | null)[];
}

export function computeCCI(bars: readonly IndicatorBar[], period = 20, constant = 0.015): CCIResult {
  if (period < 1 || constant <= 0) throw new Error('CCI period must be >= 1 and constant > 0');
  const tp: number[] = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const smaTp = sma(tp, period);
  const cci: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < period - 1) { cci.push(null); continue; }
    const slice = tp.slice(i - period + 1, i + 1) as number[];
    const mean = smaTp[i]!;
    const meanDeviation = slice.reduce((acc, v) => acc + Math.abs(v - mean), 0) / period;
    cci.push(meanDeviation === 0 ? 0 : round((tp[i]! - mean) / (constant * meanDeviation)));
  }
  return { cci };
}

export interface IndicatorSuite {
  readonly macd: MACDResult;
  readonly kdj: KDJResult;
  readonly boll: BOLLResult;
  readonly atr: (number | null)[];
  readonly rsi: (number | null)[];
  readonly obv: number[];
  readonly cci: CCIResult;
}

export function computeAllIndicators(bars: readonly IndicatorBar[]): IndicatorSuite {
  if (bars.length === 0) throw new Error('bars must be non-empty');
  const closes = bars.map((bar) => bar.close);
  return {
    macd: computeMACD(closes),
    kdj: computeKDJ(bars),
    boll: computeBOLL(closes),
    atr: computeATR(bars),
    rsi: computeRSI(closes),
    obv: computeOBV(bars),
    cci: computeCCI(bars),
  };
}
