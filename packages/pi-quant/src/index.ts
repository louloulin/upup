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
} from './types.js';
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
} from './factors.js';
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
} from './normalize.js';
export {
  pearsonIC,
  spearmanIC,
  correlation,
  computeICSeries,
  icDecay,
} from './ic.js';
export {
  factorReturns,
  compoundReturn,
  maxDrawdown,
  annualizedSharpe,
  annualizedReturn,
  quintileAssignment,
} from './returns.js';
export type { RegressionResult } from './orthogonalize.js';
export {
  regress,
  orthogonalize,
  neutralizeIndustryMomentum,
} from './orthogonalize.js';
export type { FactorWeight } from './score.js';
export {
  combineFactors,
  scoreUniverse,
  equalWeightWeights,
} from './score.js';
export type { UniverseBarSeries, FactorSignalSeries } from './backtest.js';
export {
  rebalanceDates,
  runFactorBacktest,
  topBottomSymbols,
} from './backtest.js';
export type { DryRunUniverse } from './dry-run.js';
export {
  createDryRunUniverse,
  dryRunEvidence,
} from './dry-run.js';
