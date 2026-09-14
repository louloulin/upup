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
} from './types.js';
export {
  filterDividends,
  totalDividends,
  dividendYieldOnDate,
  annualizedDividendYield,
  groupDividendsByYear,
} from './dividends.js';
export type { DividendFilterOptions } from './dividends.js';
export {
  splitRatio,
  isReverseSplit,
  sortSplitsChronologically,
  cumulativeSplitFactor,
  splitEventsBetween,
  adjustPriceForSplit,
} from './splits.js';
export {
  rightsSubscriptionRatio,
  rightsTheoreticalExPrice,
  rightsIssueCost,
  sortRightsChronologically,
  totalRightsCost,
} from './rights.js';
export {
  computeAdjustmentFactors,
  backAdjust,
  forwardAdjust,
  adjustBars,
  summarizeAdjustment,
} from './adjustments.js';
export type { RawBar } from './adjustments.js';
export {
  computeTotalReturn,
  aggregateActions,
} from './aggregate.js';
export type { TotalReturnOptions } from './aggregate.js';
export {
  createDryRunClient,
  dryRunEvidence,
} from './dry-run.js';
export type { DryRunFixture } from './dry-run.js';
