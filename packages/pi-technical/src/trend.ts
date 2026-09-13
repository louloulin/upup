import { sma, type IndicatorBar } from './indicators.js';

export type TrendDirection = 'uptrend' | 'downtrend' | 'sideways' | 'unknown';

export interface MACrossoverEvent {
  readonly index: number;
  readonly date: string;
  readonly type: 'golden-cross' | 'death-cross';
  readonly fastMA: number;
  readonly slowMA: number;
}

export function detectMACross(closes: readonly number[], dates: readonly string[], fastPeriod: number, slowPeriod: number): readonly MACrossoverEvent[] {
  if (dates.length !== closes.length) throw new Error('closes and dates must have the same length');
  if (fastPeriod >= slowPeriod) throw new Error('fastPeriod must be less than slowPeriod');
  const fast = sma(closes, fastPeriod);
  const slow = sma(closes, slowPeriod);
  const events: MACrossoverEvent[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prevFast = fast[i - 1];
    const prevSlow = slow[i - 1];
    const curFast = fast[i];
    const curSlow = slow[i];
    if (prevFast === null || prevSlow === null || curFast === null || curSlow === null) continue;
    if (prevFast <= prevSlow && curFast > curSlow) {
      events.push({ index: i, date: dates[i]!, type: 'golden-cross', fastMA: curFast, slowMA: curSlow });
    } else if (prevFast >= prevSlow && curFast < curSlow) {
      events.push({ index: i, date: dates[i]!, type: 'death-cross', fastMA: curFast, slowMA: curSlow });
    }
  }
  return events;
}

export interface MAAlignment {
  readonly aligned: boolean;
  readonly direction: TrendDirection;
  readonly ma5?: number;
  readonly ma10?: number;
  readonly ma20?: number;
  readonly ma60?: number;
  readonly stack: readonly string[];
}

export function detectMAAlignment(closes: readonly number[], config: { ma5?: boolean; ma10?: boolean; ma20?: boolean; ma60?: boolean } = { ma5: true, ma10: true, ma20: true, ma60: true }): MAAlignment {
  const periods: number[] = [];
  const stack: string[] = [];
  if (config.ma5 !== false) periods.push(5);
  if (config.ma10 !== false) periods.push(10);
  if (config.ma20 !== false) periods.push(20);
  if (config.ma60 !== false) periods.push(60);
  const mas: Record<string, number | null> = {};
  for (const period of periods) {
    const series = sma(closes, period);
    const value = series.at(-1) ?? null;
    mas[`ma${period}`] = value;
    if (value !== null) stack.push(`ma${period}=${value.toFixed(2)}`);
  }
  const lastIndex = closes.length - 1;
  if (lastIndex < 0 || Object.values(mas).every((v) => v === null)) {
    return { aligned: false, direction: 'unknown', stack };
  }
  const numericValues = Object.values(mas).filter((v): v is number => v !== null);
  if (numericValues.length < 2) return { aligned: false, direction: 'unknown', stack };
  const isStrictlyIncreasing = numericValues.every((value, i) => i === 0 || value > numericValues[i - 1]!);
  const isStrictlyDecreasing = numericValues.every((value, i) => i === 0 || value < numericValues[i - 1]!);
  return {
    aligned: isStrictlyIncreasing || isStrictlyDecreasing,
    direction: isStrictlyIncreasing ? 'uptrend' : isStrictlyDecreasing ? 'downtrend' : 'sideways',
    ma5: mas.ma5 ?? undefined,
    ma10: mas.ma10 ?? undefined,
    ma20: mas.ma20 ?? undefined,
    ma60: mas.ma60 ?? undefined,
    stack,
  };
}

export interface SupportResistanceLevel {
  readonly price: number;
  readonly touches: number;
  readonly type: 'support' | 'resistance';
  readonly confidence: number;
}

export function detectSupportResistance(bars: readonly IndicatorBar[], config: { windowSize?: number; tolerancePct?: number; minTouches?: number } = {}): readonly SupportResistanceLevel[] {
  const windowSize = config.windowSize ?? 5;
  const tolerancePct = config.tolerancePct ?? 1.5;
  const minTouches = config.minTouches ?? 3;
  if (bars.length < windowSize * 2 + 1) return [];
  const pivots: Array<{ index: number; price: number; type: 'high' | 'low' }> = [];
  for (let i = windowSize; i < bars.length - windowSize; i += 1) {
    const bar = bars[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - windowSize; j <= i + windowSize; j += 1) {
      if (j === i) continue;
      const other = bars[j]!;
      if (bar.high <= other.high) isHigh = false;
      if (bar.low >= other.low) isLow = false;
    }
    if (isHigh) pivots.push({ index: i, price: bar.high, type: 'high' });
    if (isLow) pivots.push({ index: i, price: bar.low, type: 'low' });
  }
  const clusters = new Map<string, { type: 'support' | 'resistance'; prices: number[]; touches: number }>();
  for (const pivot of pivots) {
    let matched = false;
    for (const [key, cluster] of clusters.entries()) {
      const basePrice = cluster.prices[0]!;
      const tolerance = (basePrice * tolerancePct) / 100;
      if (Math.abs(pivot.price - basePrice) <= tolerance) {
        cluster.prices.push(pivot.price);
        cluster.touches += 1;
        matched = true;
        if (cluster.type === 'resistance' && pivot.type === 'low') cluster.type = 'resistance';
        if (cluster.type === 'support' && pivot.type === 'high') cluster.type = 'support';
        void key;
        break;
      }
    }
    if (!matched) {
      const aggregatePrice = pivots.filter((p) => Math.abs(p.price - pivot.price) <= (pivot.price * tolerancePct) / 100);
      clusters.set(`c-${pivot.index}-${pivot.type}`, {
        type: pivot.type === 'high' ? 'resistance' : 'support',
        prices: aggregatePrice.map((p) => p.price),
        touches: aggregatePrice.length,
      });
    }
  }
  const out: SupportResistanceLevel[] = [];
  for (const cluster of clusters.values()) {
    if (cluster.touches < minTouches) continue;
    const avg = cluster.prices.reduce((a, b) => a + b, 0) / cluster.prices.length;
    out.push({
      price: Number(avg.toFixed(4)),
      touches: cluster.touches,
      type: cluster.type,
      confidence: Number(Math.min(1, cluster.touches / 10).toFixed(2)),
    });
  }
  return out.sort((a, b) => b.touches - a.touches);
}

export interface TrendSummary {
  readonly direction: TrendDirection;
  readonly strength: number;
  readonly latestClose: number;
  readonly ma20Slope?: number;
  readonly macdHistogram?: number | null;
  readonly rsi?: number | null;
}

export function summarizeTrend(bars: readonly IndicatorBar(), indicator: { rsi?: (number | null)[]; macdHistogram?: (number | null)[]; ma20SlopeWindow?: number } = {}): TrendSummary {
  const closes = bars.map((bar) => bar.close);
  const ma20 = sma(closes, 20);
  const latestClose = closes.at(-1) ?? 0;
  const ma20Value = ma20.at(-1) ?? null;
  const ma20Prev = ma20.at(-2) ?? null;
  const ma20Slope = ma20Value !== null && ma20Prev !== null ? Number((ma20Value - ma20Prev).toFixed(4)) : undefined;
  const rsi = indicator.rsi?.at(-1) ?? null;
  const macdHistogram = indicator.macdHistogram?.at(-1) ?? null;
  let direction: TrendDirection = 'unknown';
  if (ma20Value !== null && ma20Slope !== undefined) {
    if (ma20Slope > 0 && latestClose > ma20Value) direction = 'uptrend';
    else if (ma20Slope < 0 && latestClose < ma20Value) direction = 'downtrend';
    else if (Math.abs(ma20Slope) < 1e-6) direction = 'sideways';
  }
  const slopeMag = ma20Slope === undefined ? 0 : Math.min(1, Math.abs(ma20Slope) / Math.max(0.01, latestClose) * 100);
  const rsiSignal = rsi === null ? 0 : (rsi > 50 ? 0.2 : rsi < 50 ? -0.2 : 0);
  const macdSignal = macdHistogram === null || macdHistogram === undefined ? 0 : Math.sign(macdHistogram) * 0.2;
  const strength = Number(Math.min(1, Math.max(0, slopeMag + Math.abs(rsiSignal) + Math.abs(macdSignal) / 2)).toFixed(2));
  return {
    direction,
    strength,
    latestClose,
    ...(ma20Slope !== undefined ? { ma20Slope } : {}),
    ...(rsi !== null ? { rsi } : {}),
    ...(macdHistogram !== undefined ? { macdHistogram } : {}),
  };
}
