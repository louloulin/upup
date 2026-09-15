import type { RightsIssueEvent } from './types';

export function rightsSubscriptionRatio(r: RightsIssueEvent): number {
  if (r.ratioFrom <= 0) return 0;
  return r.ratioTo / r.ratioFrom;
}

export function rightsTheoreticalExPrice(
  r: RightsIssueEvent,
  lastClose: number,
): number {
  const ratio = rightsSubscriptionRatio(r);
  if (ratio === 0) return lastClose;
  return (lastClose + ratio * r.pricePerShare) / (1 + ratio);
}

export function rightsIssueCost(
  sharesHeld: number,
  r: RightsIssueEvent,
): number {
  const ratio = rightsSubscriptionRatio(r);
  return sharesHeld * ratio * r.pricePerShare;
}

export function sortRightsChronologically(events: readonly RightsIssueEvent[]): RightsIssueEvent[] {
  return [...events].sort((a, b) => a.exDate.localeCompare(b.exDate));
}

export function totalRightsCost(
  sharesHeld: number,
  events: readonly RightsIssueEvent[],
): number {
  return sortRightsChronologically(events).reduce(
    (acc, e) => acc + rightsIssueCost(sharesHeld, e),
    0,
  );
}
