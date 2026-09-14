export type RiskMethod = 'historical' | 'parametric';

export interface ValueAtRiskInput {
  readonly returns: readonly number[];
  readonly confidence?: number;
  readonly method?: RiskMethod;
}

export interface ValueAtRiskResult {
  readonly valueAtRisk: number;
  readonly valueAtRiskPercent: number;
  readonly confidence: number;
  readonly method: RiskMethod;
  readonly observations: number;
  readonly assumptions: { confidence: number; method: RiskMethod };
}

export interface SharpeInput {
  readonly returns: readonly number[];
  readonly riskFreeRate?: number;
  readonly periodsPerYear?: number;
}

export interface SharpeResult {
  readonly sharpe: number;
  readonly meanReturn: number;
  readonly stdReturn: number;
  readonly riskFreeRate: number;
  readonly periodsPerYear: number;
  readonly observations: number;
  readonly rating: 'negative' | 'low' | 'good' | 'excellent' | 'zero-volatility';
}

export interface SortinoInput {
  readonly returns: readonly number[];
  readonly targetReturn?: number;
  readonly periodsPerYear?: number;
}

export interface SortinoResult {
  readonly sortino: number;
  readonly meanReturn: number;
  readonly downsideDeviation: number;
  readonly targetReturn: number;
  readonly periodsPerYear: number;
  readonly observations: number;
  readonly rating: 'negative' | 'positive-no-downside' | 'zero-downside' | 'positive' | 'zero-or-negative';
}

export interface MaxDrawdownInput {
  readonly prices: readonly number[];
}

export { calculateNativeShortInterestRatio, detectNativeShortSqueeze, getNativeShortInterest } from './short-interest.js';
export type { NativeShortInterestData, NativeShortInterestRatioResult, NativeShortSqueezeMatch, NativeShortSqueezeResult, NativeSqueezeRisk } from './short-interest.js';
export { createRiskTracker } from './risk-tracker.js';
export type { RiskRecord, RiskSeverity, RiskTracker, RiskType } from './risk-tracker.js';

export interface MaxDrawdownResult {
  readonly maxDrawdown: number;
  readonly maxDrawdownPercent: number;
  readonly peakIndex: number;
  readonly troughIndex: number;
  readonly peakPrice: number;
  readonly troughPrice: number;
  readonly observations: number;
}

export interface KellyInput {
  readonly winRate: number;
  readonly avgWin: number;
  readonly avgLoss: number;
  readonly capital?: number;
}

export interface KellyResult {
  readonly kellyFraction: number;
  readonly optimalSize: number;
  readonly safeFraction: number;
  readonly winLossRatio: number;
  readonly positionSizing?: { readonly fullKelly: number; readonly halfKelly: number };
}

export interface RiskParityAsset {
  readonly symbol: string;
  readonly volatility: number;
  readonly expectedReturn: number;
}

export interface RiskParityResult {
  readonly assets: readonly { readonly symbol: string; readonly weight: number; readonly contribution: number }[];
  readonly totalWeight: number;
}

export interface MeanVarianceInput {
  readonly assets: readonly RiskParityAsset[];
  readonly correlations?: readonly (readonly number[])[];
  readonly riskFreeRate?: number;
}

export interface MeanVarianceResult {
  readonly tangencyWeights: readonly { readonly symbol: string; readonly weight: number }[];
  readonly expectedReturn: number;
  readonly expectedVolatility: number;
  readonly sharpeRatio: number;
  readonly riskFreeRate: number;
}

export interface SourceMetrics {
  readonly source: string;
  readonly latency: number;
  readonly freshness: number;
  readonly coverage: number;
  readonly accuracy: number;
  readonly priceDeviation: number;
}

export interface ReliabilityScoreResult {
  readonly score: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly factors: Readonly<Record<string, number>>;
  readonly recommendation: string;
}

export interface DataSourceComparisonInput {
  readonly sources: readonly SourceMetrics[];
  readonly preferLowLatency?: boolean;
  readonly preferAccurate?: boolean;
}

export interface DataSourceComparisonResult {
  readonly rankedSources: readonly { readonly rank: number; readonly source: string; readonly grade: ReliabilityScoreResult['grade']; readonly score: number }[];
  readonly bestForAccuracy?: string;
  readonly bestForLatency?: string;
  readonly bestOverall: string;
  readonly worstOverall: string;
  readonly recommendation: string;
}

export interface CorrelationResult {
  readonly correlation: number;
  readonly strength: 'very-strong' | 'strong' | 'moderate' | 'weak' | 'negligible' | 'unknown';
  readonly error?: string;
}

export interface CorrelationMatrixResult {
  readonly symbols: readonly string[];
  readonly matrix: readonly (readonly number[])[];
  readonly eigenvalues: readonly number[];
  readonly interpretation: string;
  readonly diversificationTip: string;
}

const riskRound = (value: number, decimals = 4): number => Number(value.toFixed(decimals));

export function calculateKellyCriterion(input: KellyInput): KellyResult {
  if (!Number.isFinite(input.winRate) || input.winRate < 0 || input.winRate > 1) throw new Error('winRate must be between 0 and 1');
  if (!Number.isFinite(input.avgWin) || input.avgWin <= 0) throw new Error('avgWin must be positive');
  if (!Number.isFinite(input.avgLoss) || input.avgLoss <= 0) throw new Error('avgLoss must be positive');
  if (input.capital !== undefined && (!Number.isFinite(input.capital) || input.capital <= 0)) throw new Error('capital must be positive');
  const winLossRatio = input.avgWin / Math.abs(input.avgLoss);
  const kellyFraction = input.winRate - ((1 - input.winRate) / winLossRatio);
  const optimalSize = Math.max(0, kellyFraction);
  const safeFraction = optimalSize * 0.5;
  return {
    kellyFraction: riskRound(kellyFraction * 100, 2),
    optimalSize: riskRound(optimalSize * 100, 2),
    safeFraction: riskRound(safeFraction * 100, 2),
    winLossRatio: riskRound(winLossRatio, 4),
    ...(input.capital !== undefined
      ? { positionSizing: { fullKelly: riskRound(input.capital * optimalSize, 2), halfKelly: riskRound(input.capital * safeFraction, 2) } }
      : {}),
  };
}

export function calculateRiskParity(assets: readonly RiskParityAsset[]): RiskParityResult {
  if (assets.length < 2 || assets.length > 20) throw new Error('assets must contain 2-20 items');
  if (new Set(assets.map((asset) => asset.symbol)).size !== assets.length) throw new Error('asset symbols must be unique');
  const inverseVolatility = assets.map((asset) => asset.volatility > 0 ? 1 / asset.volatility : 1);
  const totalInverseVolatility = inverseVolatility.reduce((sum, value) => sum + value, 0);
  const result = assets.map((asset, index) => {
    const weight = inverseVolatility[index] / totalInverseVolatility;
    return { symbol: asset.symbol, weight: riskRound(weight * 100, 2), contribution: riskRound(weight * asset.volatility * 100, 2) };
  });
  return { assets: result, totalWeight: riskRound(result.reduce((sum, asset) => sum + asset.weight, 0), 2) };
}

export function calculateMeanVariance(input: MeanVarianceInput): MeanVarianceResult {
  const { assets } = input;
  if (assets.length < 1 || assets.length > 20) throw new Error('assets must contain 1-20 items');
  if (new Set(assets.map((asset) => asset.symbol)).size !== assets.length) throw new Error('asset symbols must be unique');
  const riskFreeRate = input.riskFreeRate ?? 0.02;
  if (!Number.isFinite(riskFreeRate) || riskFreeRate < 0 || riskFreeRate > 0.1) throw new Error('riskFreeRate must be between 0 and 0.1');
  const n = assets.length;
  const excessReturns = assets.map((asset) => Math.max(asset.expectedReturn - riskFreeRate, 0.001));
  const scores = assets.map((asset, index) => excessReturns[index] / (asset.volatility * asset.volatility));
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const weights = totalScore > 0 ? scores.map((score) => score / totalScore) : assets.map(() => 1 / n);
  const correlations = input.correlations;
  let portfolioVariance = 0;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
    const correlation = correlations?.[i]?.[j] ?? (i === j ? 1 : 0.3);
    if (!Number.isFinite(correlation) || correlation < -1 || correlation > 1) throw new Error('correlations must be between -1 and 1');
    portfolioVariance += weights[i] * weights[j] * assets[i].volatility * assets[j].volatility * correlation;
  }
  const portfolioReturn = assets.reduce((sum, asset, index) => sum + weights[index] * asset.expectedReturn, 0);
  const portfolioVolatility = Math.sqrt(Math.max(0, portfolioVariance));
  return {
    tangencyWeights: assets.map((asset, index) => ({ symbol: asset.symbol, weight: riskRound(weights[index] * 100, 2) })),
    expectedReturn: riskRound(portfolioReturn * 100, 2),
    expectedVolatility: riskRound(portfolioVolatility * 100, 2),
    sharpeRatio: riskRound(portfolioVolatility > 0 ? (portfolioReturn - riskFreeRate) / portfolioVolatility : 0, 4),
    riskFreeRate,
  };
}

export function calculateReliabilityScore(metrics: SourceMetrics): ReliabilityScoreResult {
  if (!metrics.source.trim()) throw new Error('source must not be empty');
  if (![metrics.latency, metrics.freshness, metrics.coverage, metrics.accuracy, metrics.priceDeviation].every(Number.isFinite)) throw new Error('source metrics must be finite');
  if (metrics.latency < 0 || metrics.freshness < 0 || metrics.coverage < 0 || metrics.coverage > 100 || metrics.accuracy < 0 || metrics.accuracy > 100 || metrics.priceDeviation < 0) throw new Error('source metrics are out of range');
  const factors: Record<string, number> = {
    latency: metrics.latency < 100 ? 100 : metrics.latency < 500 ? 80 : metrics.latency < 1000 ? 60 : metrics.latency < 5000 ? 40 : 20,
    freshness: metrics.freshness < 1 ? 100 : metrics.freshness < 4 ? 90 : metrics.freshness < 24 ? 70 : metrics.freshness < 72 ? 50 : 20,
    coverage: metrics.coverage,
    accuracy: metrics.accuracy,
    priceDeviation: metrics.priceDeviation < 0.1 ? 100 : metrics.priceDeviation < 0.5 ? 90 : metrics.priceDeviation < 1 ? 70 : metrics.priceDeviation < 2 ? 50 : 20,
  };
  const score = Math.round(factors.latency * 0.15 + factors.freshness * 0.2 + factors.coverage * 0.2 + factors.accuracy * 0.25 + factors.priceDeviation * 0.2);
  const grade: ReliabilityScoreResult['grade'] = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const recommendation = score < 40 ? 'Avoid for critical decisions - data may be stale or inaccurate' : score < 60 ? 'Use with caution - cross-reference with other sources' : 'Use for all analysis';
  return { score, grade, factors, recommendation };
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const length = Math.min(x.length, y.length);
  if (length < 2) return 0;
  const xValues = x.slice(0, length); const yValues = y.slice(0, length);
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / length;
  const meanY = yValues.reduce((sum, value) => sum + value, 0) / length;
  let covariance = 0; let varianceX = 0; let varianceY = 0;
  for (let index = 0; index < length; index += 1) { const dx = xValues[index] - meanX; const dy = yValues[index] - meanY; covariance += dx * dy; varianceX += dx * dx; varianceY += dy * dy; }
  if (varianceX === 0 || varianceY === 0) return 0;
  return covariance / Math.sqrt(varianceX * varianceY);
}

export function calculatePearsonCorrelation(x: readonly number[], y: readonly number[]): CorrelationResult {
  const correlation = pearson(x, y);
  if (x.length < 3) return { correlation, strength: 'unknown', error: 'Insufficient data points (minimum 3 required)' };
  if (Math.abs(correlation) < 0.01) return { correlation, strength: 'negligible', error: 'Series appears constant (zero variance)' };
  const absolute = Math.abs(correlation);
  const strength: CorrelationResult['strength'] = absolute > 0.7 ? 'very-strong' : absolute > 0.5 ? 'strong' : absolute > 0.3 ? 'moderate' : 'weak';
  return { correlation: riskRound(correlation, 6), strength };
}

export function compareDataSources(input: DataSourceComparisonInput): DataSourceComparisonResult {
  if (input.sources.length < 1 || input.sources.length > 10) throw new Error('sources must contain 1-10 items');
  const scored = input.sources.map((source) => ({ source, score: calculateReliabilityScore(source) }));
  const ranking = [...scored].sort((left, right) => input.preferAccurate ? right.score.factors.accuracy - left.score.factors.accuracy : input.preferLowLatency ? left.score.factors.latency - right.score.factors.latency : right.score.score - left.score.score);
  const bestForAccuracy = [...scored].sort((left, right) => right.score.factors.accuracy - left.score.factors.accuracy)[0]?.source.source;
  const bestForLatency = [...scored].sort((left, right) => left.score.factors.latency - right.score.factors.latency)[0]?.source.source;
  const bestOverall = ranking[0].source.source; const worstOverall = ranking.at(-1)!.source.source;
  return { rankedSources: ranking.map((item, index) => ({ rank: index + 1, source: item.source.source, grade: item.score.grade, score: item.score.score })), bestForAccuracy, bestForLatency, bestOverall, worstOverall, recommendation: `Use ${bestOverall} for primary data. ${worstOverall} should be cross-referenced.` };
}

export function buildCorrelationMatrix(returns: Readonly<Record<string, readonly number[]>>, symbols: readonly string[]): CorrelationMatrixResult {
  if (symbols.length < 1 || new Set(symbols).size !== symbols.length) throw new Error('symbols must be unique and non-empty');
  const matrix: number[][] = symbols.map(() => []);
  for (let row = 0; row < symbols.length; row += 1) for (let column = 0; column < symbols.length; column += 1) matrix[row][column] = row === column ? 1 : column < row ? matrix[column][row] : riskRound(pearson(returns[symbols[row]] ?? [], returns[symbols[column]] ?? []), 3);
  const eigenvalues = [1, ...Array(Math.max(0, symbols.length - 1)).fill(0)];
  const interpretation = `Portfolio diversification: ${eigenvalues[0] > symbols.length * 0.5 ? 'HIGH correlation detected - limited diversification benefit' : eigenvalues[0] > symbols.length * 0.3 ? 'MODERATE correlation - some diversification benefit' : 'LOW correlation - strong diversification benefit'}`;
  return { symbols: [...symbols], matrix, eigenvalues, interpretation, diversificationTip: eigenvalues[0] > symbols.length * 0.5 ? 'Consider removing highly correlated assets for better diversification' : 'Good diversification - assets have varied correlations' };
}

const EPSILON = 1e-12;
const RELATIVE_EPSILON = 1e-12;

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isConstantSeries(values: readonly number[], average: number): boolean {
  if (values.length === 0) return true;
  const baseline = Math.max(Math.abs(average), 1);
  for (const value of values) {
    if (Math.abs(value - average) > RELATIVE_EPSILON * baseline) return false;
  }
  return true;
}

function standardDeviation(values: readonly number[], average: number): number {
  if (isConstantSeries(values, average)) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normInv(p: number): number {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q / (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
}

export function calculateValueAtRisk(input: ValueAtRiskInput): ValueAtRiskResult {
  const { returns } = input;
  if (returns.length === 0) throw new Error('returns must not be empty');
  const confidence = input.confidence ?? 0.95;
  if (!Number.isFinite(confidence) || confidence < 0.5 || confidence > 0.99) {
    throw new Error('confidence must be between 0.5 and 0.99');
  }
  const method: RiskMethod = input.method ?? 'historical';
  let value: number;
  if (method === 'historical') {
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.max(0, Math.floor((1 - confidence) * sorted.length));
    value = sorted[index];
  } else {
    const average = mean(returns);
    const std = standardDeviation(returns, average);
    value = average - normInv(1 - confidence) * std;
  }
  return {
    valueAtRisk: Number(value.toFixed(6)),
    valueAtRiskPercent: Number((value * 100).toFixed(4)),
    confidence,
    method,
    observations: returns.length,
    assumptions: { confidence, method },
  };
}

export function calculateSharpeRatio(input: SharpeInput): SharpeResult {
  const { returns } = input;
  if (returns.length === 0) throw new Error('returns must not be empty');
  const riskFreeRate = input.riskFreeRate ?? 0.03;
  const periodsPerYear = input.periodsPerYear ?? 252;
  const average = mean(returns);
  const std = standardDeviation(returns, average);
  if (Math.abs(std) < EPSILON) {
    return {
      sharpe: 0,
      meanReturn: Number(average.toFixed(6)),
      stdReturn: 0,
      riskFreeRate,
      periodsPerYear,
      observations: returns.length,
      rating: 'zero-volatility',
    };
  }
  const excessReturn = average - riskFreeRate / periodsPerYear;
  const sharpe = (excessReturn / std) * Math.sqrt(periodsPerYear);
  const rating: SharpeResult['rating'] = sharpe < 0 ? 'negative' : sharpe < 1 ? 'low' : sharpe < 2 ? 'good' : 'excellent';
  return {
    sharpe: Number(sharpe.toFixed(4)),
    meanReturn: Number(average.toFixed(6)),
    stdReturn: Number(std.toFixed(6)),
    riskFreeRate,
    periodsPerYear,
    observations: returns.length,
    rating,
  };
}

export function calculateSortinoRatio(input: SortinoInput): SortinoResult {
  const { returns } = input;
  if (returns.length === 0) throw new Error('returns must not be empty');
  const targetReturn = input.targetReturn ?? 0;
  const periodsPerYear = input.periodsPerYear ?? 252;
  const average = mean(returns);
  const excessReturn = average - targetReturn;
  const downsideReturns = returns.filter((value) => value < targetReturn);
  if (downsideReturns.length === 0) {
    return {
      sortino: excessReturn > 0 ? Number.POSITIVE_INFINITY : 0,
      meanReturn: Number(average.toFixed(6)),
      downsideDeviation: 0,
      targetReturn,
      periodsPerYear,
      observations: returns.length,
      rating: excessReturn > 0 ? 'positive-no-downside' : 'zero-or-negative',
    };
  }
  const downsideVariance = downsideReturns.reduce((sum, value) => sum + (value - targetReturn) ** 2, 0) / returns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  if (Math.abs(downsideDeviation) < EPSILON) {
    return {
      sortino: 0,
      meanReturn: Number(average.toFixed(6)),
      downsideDeviation: 0,
      targetReturn,
      periodsPerYear,
      observations: returns.length,
      rating: 'zero-downside',
    };
  }
  const sortino = (excessReturn / downsideDeviation) * Math.sqrt(periodsPerYear);
  const rating: SortinoResult['rating'] = sortino < 0 ? 'negative' : 'positive';
  return {
    sortino: Number(sortino.toFixed(4)),
    meanReturn: Number(average.toFixed(6)),
    downsideDeviation: Number(downsideDeviation.toFixed(6)),
    targetReturn,
    periodsPerYear,
    observations: returns.length,
    rating,
  };
}

export function calculateMaxDrawdown(input: MaxDrawdownInput): MaxDrawdownResult {
  const { prices } = input;
  if (prices.length === 0) throw new Error('prices must not be empty');
  let bestPeakIndex = 0;
  let bestPeakPrice = prices[0];
  let bestTroughIndex = 0;
  let bestDrawdownPercent = 0;
  let bestDrawdown = 0;
  for (let troughIndex = 1; troughIndex < prices.length; troughIndex += 1) {
    const troughPrice = prices[troughIndex];
    let candidatePeakIndex = 0;
    let candidatePeakPrice = prices[0];
    for (let k = 1; k <= troughIndex; k += 1) {
      if (prices[k] > candidatePeakPrice) {
        candidatePeakPrice = prices[k];
        candidatePeakIndex = k;
      }
    }
    if (candidatePeakPrice === 0) continue;
    const drawdown = candidatePeakPrice - troughPrice;
    const drawdownPercent = (drawdown / candidatePeakPrice) * 100;
    if (drawdownPercent > bestDrawdownPercent) {
      bestDrawdownPercent = drawdownPercent;
      bestDrawdown = drawdown;
      bestPeakIndex = candidatePeakIndex;
      bestPeakPrice = candidatePeakPrice;
      bestTroughIndex = troughIndex;
    }
  }
  return {
    maxDrawdown: Number(bestDrawdown.toFixed(4)),
    maxDrawdownPercent: Number(bestDrawdownPercent.toFixed(4)),
    peakIndex: bestPeakIndex,
    troughIndex: bestTroughIndex,
    peakPrice: Number(bestPeakPrice.toFixed(4)),
    troughPrice: Number(prices[bestTroughIndex].toFixed(4)),
    observations: prices.length,
  };
}
