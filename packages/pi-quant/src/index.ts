export type {
  FactorCategory,
  NormalizationMethod,
  FactorBar,
  FactorDef,
  FactorResult,
  FactorSeries,
  FactorSnapshot,
  UniverseSnapshot,
  ICResult,
  FactorReturnsResult,
  FactorScore,
  FactorBacktestOptions,
  FactorBacktestResult,
  QuantEvidence,
} from './types';
export {
  FACTOR_LIBRARY,
  getFactorDef,
  listFactorIds,
  computeMomentum,
  computeInversePE,
  computeInversePB,
  computeInversePS,
  computeQualityROE,
  computeGrossMargin,
  computeDebtToEquity,
  computeCurrentRatio,
  computeRealizedVol,
  computeLogMarketCap,
  computeRevenueGrowth,
  computeEarningsGrowth,
  computeAmihudIlliquidity,
  computeTurnover,
  computeFactor,
  computeAllFactors,
  factorResultForSymbol,
} from './factors';
export {
  mean,
  stddev,
  zscore,
  rankAsc,
  rankDesc,
  winsorize,
  minmax,
  normalize,
  standardizeWithRef,
} from './normalize';
export {
  pearsonIC,
  spearmanIC,
  correlation,
  computeICSeries,
  icDecay,
} from './ic';
export {
  factorReturns,
  compoundReturn,
  maxDrawdown,
  annualizedSharpe,
  annualizedReturn,
  quintileAssignment,
} from './returns';
export type { RegressionResult } from './orthogonalize';
export {
  regress,
  orthogonalize,
  neutralizeIndustryMomentum,
} from './orthogonalize';
export type { FactorWeight } from './score';
export {
  combineFactors,
  scoreUniverse,
  equalWeightWeights,
} from './score';
export type { UniverseBarSeries, FactorSignalSeries } from './backtest';
export {
  rebalanceDates,
  runFactorBacktest,
  topBottomSymbols,
} from './backtest';
export type { DryRunUniverse } from './dry-run';
export {
  createDryRunUniverse,
  dryRunEvidence,
} from './dry-run';
