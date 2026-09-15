export type {
  ActionType,
  Currency,
  CorporateAction,
  DividendEvent,
  SplitEvent,
  RightsIssueEvent,
  AdjustedPriceBar,
  PriceAdjustmentOptions,
  TotalReturnBreakdown,
  CorporateActionsClient,
  CorporateActionsEvidence,
} from './types';
export {
  filterDividends,
  totalDividends,
  dividendYieldOnDate,
  annualizedDividendYield,
  groupDividendsByYear,
} from './dividends';
export type { DividendFilterOptions } from './dividends';
export {
  splitRatio,
  isReverseSplit,
  sortSplitsChronologically,
  cumulativeSplitFactor,
  splitEventsBetween,
  adjustPriceForSplit,
} from './splits';
export {
  rightsSubscriptionRatio,
  rightsTheoreticalExPrice,
  rightsIssueCost,
  sortRightsChronologically,
  totalRightsCost,
} from './rights';
export {
  computeAdjustmentFactors,
  backAdjust,
  forwardAdjust,
  adjustBars,
  summarizeAdjustment,
} from './adjustments';
export type { RawBar } from './adjustments';
export {
  computeTotalReturn,
  aggregateActions,
} from './aggregate';
export type { TotalReturnOptions } from './aggregate';
export {
  createDryRunClient,
  dryRunEvidence,
} from './dry-run';
export type { DryRunFixture } from './dry-run';
