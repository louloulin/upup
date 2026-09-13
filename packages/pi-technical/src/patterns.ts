import type { IndicatorBar } from './indicators.js';

export type CandlePatternKind =
  | 'doji'
  | 'hammer'
  | 'inverted-hammer'
  | 'shooting-star'
  | 'bullish-engulfing'
  | 'bearish-engulfing'
  | 'morning-star'
  | 'evening-star'
  | 'three-white-soldiers'
  | 'three-black-crows'
  | 'spinning-top'
  | 'marubozu';

export interface CandlePattern {
  readonly kind: CandlePatternKind;
  readonly index: number;
  readonly date: string;
  readonly bias: 'bullish' | 'bearish' | 'neutral';
  readonly strength: number;
  readonly confidence: number;
  readonly description: string;
}

function body(bar: IndicatorBar): number { return Math.abs(bar.close - bar.open); }
function range(bar: IndicatorBar): number { return bar.high - bar.low; }
function upperShadow(bar: IndicatorBar): number { return bar.high - Math.max(bar.open, bar.close); }
function lowerShadow(bar: IndicatorBar): number { return Math.min(bar.open, bar.close) - bar.low; }
function isBullish(bar: IndicatorBar): boolean { return bar.close > bar.open; }
function isBearish(bar: IndicatorBar): boolean { return bar.close < bar.open; }

const PATTERN_DEFINITIONS: Record<CandlePatternKind, { bias: CandlePattern['bias']; description: string }> = {
  doji: { bias: 'neutral', description: 'Open and close are nearly equal; market indecision' },
  hammer: { bias: 'bullish', description: 'Small body at the top with a long lower shadow; potential reversal up' },
  'inverted-hammer': { bias: 'bullish', description: 'Small body at the bottom with a long upper shadow; potential reversal up' },
  'shooting-star': { bias: 'bearish', description: 'Small body at the bottom with a long upper shadow; potential reversal down' },
  'bullish-engulfing': { bias: 'bullish', description: 'Bullish candle fully engulfs prior bearish candle' },
  'bearish-engulfing': { bias: 'bearish', description: 'Bearish candle fully engulfs prior bullish candle' },
  'morning-star': { bias: 'bullish', description: 'Three-candle bullish reversal pattern' },
  'evening-star': { bias: 'bearish', description: 'Three-candle bearish reversal pattern' },
  'three-white-soldiers': { bias: 'bullish', description: 'Three consecutive bullish candles with rising closes' },
  'three-black-crows': { bias: 'bearish', description: 'Three consecutive bearish candles with falling closes' },
  'spinning-top': { bias: 'neutral', description: 'Small body with roughly equal upper and lower shadows' },
  marubozu: { bias: 'bullish', description: 'Bullish candle with no upper or lower shadow; strong continuation' },
};

export function recognizePatterns(bars: readonly IndicatorBar[], options: { minStrength?: number } = {}): readonly CandlePattern[] {
  const minStrength = options.minStrength ?? 0.5;
  const out: CandlePattern[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const r = range(bar);
    if (r === 0) continue;
    const b = body(bar);
    const us = upperShadow(bar);
    const ls = lowerShadow(bar);
    const bodyPct = b / r;

    if (bodyPct < 0.1) {
      out.push({ kind: 'doji', index: i, date: bar.date, bias: 'neutral', strength: 1 - bodyPct, confidence: 0.7, description: PATTERN_DEFINITIONS.doji.description });
      continue;
    }

    if (us < r * 0.05 && ls < r * 0.05) {
      out.push({ kind: 'marubozu', index: i, date: bar.date, bias: isBullish(bar) ? 'bullish' : 'bearish', strength: 0.8, confidence: 0.9, description: PATTERN_DEFINITIONS.marubozu.description });
      continue;
    }

    if (bodyPct < 0.35) {
      out.push({ kind: 'spinning-top', index: i, date: bar.date, bias: 'neutral', strength: 0.6, confidence: 0.65, description: PATTERN_DEFINITIONS.spinning-top.description });
      continue;
    }

    if (ls > r * 0.6 && us < r * 0.2 && bodyPct < 0.4) {
      out.push({ kind: 'hammer', index: i, date: bar.date, bias: 'bullish', strength: 0.8, confidence: 0.75, description: PATTERN_DEFINITIONS.hammer.description });
      continue;
    }
    if (us > r * 0.6 && ls < r * 0.2 && bodyPct < 0.4) {
      out.push({ kind: 'inverted-hammer', index: i, date: bar.date, bias: 'bullish', strength: 0.6, confidence: 0.6, description: PATTERN_DEFINITIONS['inverted-hammer'].description });
      continue;
    }
    if (us > r * 0.6 && ls < r * 0.2 && bodyPct < 0.4 && i > 0) {
      const prev = bars[i - 1]!;
      if (isBullish(prev)) {
        out.push({ kind: 'shooting-star', index: i, date: bar.date, bias: 'bearish', strength: 0.75, confidence: 0.7, description: PATTERN_DEFINITIONS['shooting-star'].description });
        continue;
      }
    }

    if (i >= 1) {
      const prev = bars[i - 1]!;
      if (isBearish(prev) && isBullish(bar) && bar.open < prev.close && bar.close > prev.open) {
        out.push({ kind: 'bullish-engulfing', index: i, date: bar.date, bias: 'bullish', strength: 0.85, confidence: 0.8, description: PATTERN_DEFINITIONS['bullish-engulfing'].description });
        continue;
      }
      if (isBullish(prev) && isBearish(bar) && bar.open > prev.close && bar.close < prev.open) {
        out.push({ kind: 'bearish-engulfing', index: i, date: bar.date, bias: 'bearish', strength: 0.85, confidence: 0.8, description: PATTERN_DEFINITIONS['bearish-engulfing'].description });
        continue;
      }
    }

    if (i >= 2) {
      const first = bars[i - 2]!;
      const middle = bars[i - 1]!;
      if (isBearish(first) && body(middle) / range(middle) < 0.3 && isBullish(bar) && middle.low < first.close && middle.low < bar.open) {
        out.push({ kind: 'morning-star', index: i, date: bar.date, bias: 'bullish', strength: 0.9, confidence: 0.75, description: PATTERN_DEFINITIONS['morning-star'].description });
        continue;
      }
      if (isBullish(first) && body(middle) / range(middle) < 0.3 && isBearish(bar) && middle.high > first.close && middle.high > bar.open) {
        out.push({ kind: 'evening-star', index: i, date: bar.date, bias: 'bearish', strength: 0.9, confidence: 0.75, description: PATTERN_DEFINITIONS['evening-star'].description });
        continue;
      }
    }

    if (i >= 2) {
      const a = bars[i - 2]!;
      const b = bars[i - 1]!;
      if (isBullish(a) && isBullish(b) && isBullish(bar) && a.close < b.close && b.close < bar.close) {
        out.push({ kind: 'three-white-soldiers', index: i, date: bar.date, bias: 'bullish', strength: 0.95, confidence: 0.85, description: PATTERN_DEFINITIONS['three-white-soldiers'].description });
        continue;
      }
      if (isBearish(a) && isBearish(b) && isBearish(bar) && a.close > b.close && b.close > bar.close) {
        out.push({ kind: 'three-black-crows', index: i, date: bar.date, bias: 'bearish', strength: 0.95, confidence: 0.85, description: PATTERN_DEFINITIONS['three-black-crows'].description });
        continue;
      }
    }
  }
  return out.filter((pattern) => pattern.strength >= minStrength);
}

export function listPatternKinds(): readonly CandlePatternKind[] {
  return Object.keys(PATTERN_DEFINITIONS) as CandlePatternKind[];
}

export function describePattern(kind: CandlePatternKind): string {
  return PATTERN_DEFINITIONS[kind].description;
}
