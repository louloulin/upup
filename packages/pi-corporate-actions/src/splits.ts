import type { SplitEvent } from './types.js';

export function splitRatio(s: SplitEvent): number {
  if (s.ratioFrom <= 0) return 1;
  return s.ratioTo / s.ratioFrom;
}

export function isReverseSplit(s: SplitEvent): boolean {
  return s.ratioTo < s.ratioFrom;
}

export function sortSplitsChronologically(splits: readonly SplitEvent[]): SplitEvent[] {
  return [...splits].sort((a, b) => a.exDate.localeCompare(b.exDate));
}

export function cumulativeSplitFactor(splits: readonly SplitEvent[]): number {
  return sortSplitsChronologically(splits).reduce((acc, s) => acc * splitRatio(s), 1);
}

export function splitEventsBetween(
  splits: readonly SplitEvent[],
  startDate: string,
  endDate: string,
): SplitEvent[] {
  return sortSplitsChronologically(splits).filter(
    (s) => s.exDate >= startDate && s.exDate <= endDate,
  );
}

export function adjustPriceForSplit(unadjustedPrice: number, splitsBefore: readonly SplitEvent[]): number {
  return unadjustedPrice * cumulativeSplitFactor(splitsBefore);
}
