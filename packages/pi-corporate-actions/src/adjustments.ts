import type {
  AdjustedPriceBar,
  CorporateAction,
  PriceAdjustmentOptions,
} from './types.js';
import { sortSplitsChronologically, splitRatio } from './splits.js';

export interface RawBar {
  readonly date: string;
  readonly close: number;
}

export function computeAdjustmentFactors(
  actions: readonly CorporateAction[],
): Map<string, number> {
  const sorted = [...actions]
    .filter((a) => a.type === 'split')
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  const factors = new Map<string, number>();
  let cumulative = 1;
  for (const a of sorted) {
    if (a.type === 'split' && a.ratioFrom && a.ratioTo) {
      cumulative *= a.ratioTo / a.ratioFrom;
    }
    factors.set(a.exDate, cumulative);
  }
  return factors;
}

export function backAdjust(
  options: PriceAdjustmentOptions,
  rawBars: readonly RawBar[],
): AdjustedPriceBar[] {
  if (options.method !== 'back-adjust') {
    throw new Error(`backAdjust called with method=${options.method}`);
  }
  const factors = computeAdjustmentFactors(options.actions);
  const sortedFactors = [...factors.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const sortedBars = [...rawBars].sort((a, b) => a.date.localeCompare(b.date));

  const out: AdjustedPriceBar[] = [];
  for (const bar of sortedBars) {
    let cumulative = 1;
    for (const [exDate, factor] of sortedFactors) {
      if (exDate > bar.date) break;
      cumulative = factor;
    }
    out.push({
      date: bar.date,
      unadjustedClose: bar.close,
      adjustedClose: bar.close * cumulative,
      adjustmentFactor: cumulative,
    });
  }
  return out;
}

export function forwardAdjust(
  options: PriceAdjustmentOptions,
  rawBars: readonly RawBar[],
): AdjustedPriceBar[] {
  if (options.method !== 'forward-adjust') {
    throw new Error(`forwardAdjust called with method=${options.method}`);
  }
  const sortedActions = [...options.actions]
    .filter((a) => a.type === 'split')
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  const factors = computeAdjustmentFactors(options.actions);
  const latestFactor = sortedActions.length === 0
    ? 1
    : factors.get(sortedActions[sortedActions.length - 1].exDate) ?? 1;
  const sortedBars = [...rawBars].sort((a, b) => a.date.localeCompare(b.date));

  // Chinese 前复权 convention: latest bar stays at unadjusted close, older bars are
  // divided by cumulative split factor so the price action is preserved relative to
  // the latest market price. factor(t) = cumulative_back(latest) / cumulative_back(t).
  return sortedBars.map((bar) => {
    let cumulativeBack = 1;
    for (const a of sortedActions) {
      if (a.exDate > bar.date) break;
      if (a.type === 'split' && a.ratioFrom && a.ratioTo) {
        cumulativeBack *= a.ratioTo / a.ratioFrom;
      }
    }
    const factor = cumulativeBack === 0 ? 1 : latestFactor / cumulativeBack;
    return {
      date: bar.date,
      unadjustedClose: bar.close,
      adjustedClose: bar.close * factor,
      adjustmentFactor: factor,
    };
  });
}

export function adjustBars(
  options: PriceAdjustmentOptions,
  rawBars: readonly RawBar[],
): AdjustedPriceBar[] {
  if (rawBars.length === 0) return [];
  if (options.method === 'back-adjust') return backAdjust(options, rawBars);
  if (options.method === 'forward-adjust') return forwardAdjust(options, rawBars);
  throw new Error(`unknown adjustment method: ${options.method as string}`);
}

export function summarizeAdjustment(bars: readonly AdjustedPriceBar[]): {
  readonly minFactor: number;
  readonly maxFactor: number;
  readonly adjustmentEvents: number;
} {
  if (bars.length === 0) {
    return { minFactor: 1, maxFactor: 1, adjustmentEvents: 0 };
  }
  let minFactor = bars[0].adjustmentFactor;
  let maxFactor = bars[0].adjustmentFactor;
  let events = 0;
  for (let i = 1; i < bars.length; i++) {
    const f = bars[i].adjustmentFactor;
    if (f < minFactor) minFactor = f;
    if (f > maxFactor) maxFactor = f;
    if (bars[i].adjustmentFactor !== bars[i - 1].adjustmentFactor) events++;
  }
  return { minFactor, maxFactor, adjustmentEvents: events };
}
