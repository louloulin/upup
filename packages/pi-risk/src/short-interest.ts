export type NativeSqueezeRisk = 'low' | 'medium' | 'high';

export interface NativeShortInterestData {
  symbol: string;
  shortInterest: number;
  avgDailyVolume: number;
  shortInterestRatio: number;
  previousMonthChange: number;
  shortExemptVolume: number;
  totalFloat: number;
  shortPercentFloat: number;
  borrowCost: number;
  squeezeScore: number;
  squeezeRisk: NativeSqueezeRisk;
}

export interface NativeShortInterestRatioResult {
  symbol: string;
  marketShortInterest: {
    shortInterest: number;
    avgDailyVolume: number;
    daysToCover: number;
  };
  positionAnalysis?: {
    sharesHeld: number;
    avgCost: number;
    positionValue: number;
    buyingPressurePercent: number;
    estimatedCoveringDays: number;
    riskLevel: NativeSqueezeRisk;
  };
}

export interface NativeShortSqueezeMatch {
  symbol: string;
  shortInterest: number;
  daysToCover: number;
  shortPercentFloat: number;
  borrowCost: number;
  squeezeScore: number;
  riskLevel: Uppercase<NativeSqueezeRisk>;
}

export interface NativeShortSqueezeResult {
  screeningCriteria: {
    minDaysToCover: number;
    minShortPercentFloat: number;
    symbolsScreened: number;
    matchesFound: number;
  };
  highRiskStocks: NativeShortSqueezeMatch[];
  mediumRiskStocks: NativeShortSqueezeMatch[];
  allMatches: NativeShortSqueezeMatch[];
  disclaimer: string;
}

const LOW_COVER = 3;
const HIGH_COVER = 10;
const LOW_FLOAT = 5;
const HIGH_FLOAT = 10;
const LOW_BORROW_COST = 5;
const HIGH_BORROW_COST = 20;

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error('symbol must not be empty');
  return normalized;
}

function scoreBand(value: number, low: number, high: number): number {
  if (value <= low) return (value / low) * 25;
  if (value <= high) return 25 + ((value - low) / (high - low)) * 50;
  return 75 + Math.min(((value - high) / 10) * 25, 25);
}

function generateSnapshot(symbol: string): NativeShortInterestData {
  const baseFloat = symbol.length * 1_000_000;
  const seed = [...symbol].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const shortPercentFloat = 5 + (seed % 20);
  const totalFloat = baseFloat;
  const shortInterest = Math.round(totalFloat * shortPercentFloat / 100);
  const avgDailyVolume = Math.round(baseFloat * (0.08 + (seed % 5) / 100));
  const previousShortInterest = Math.round(shortInterest * 0.9);
  const borrowCost = 3 + (seed % 50);
  const shortInterestRatio = shortInterest / avgDailyVolume;
  const previousMonthChange = ((shortInterest - previousShortInterest) / previousShortInterest) * 100;
  const trendScore = Math.min(previousMonthChange * 2, 100);
  const score = Math.round(Math.min(
    scoreBand(shortInterestRatio, LOW_COVER, HIGH_COVER) * 0.25
      + scoreBand(shortPercentFloat, LOW_FLOAT, HIGH_FLOAT) * 0.4
      + trendScore * 0.2
      + scoreBand(borrowCost, LOW_BORROW_COST, HIGH_BORROW_COST) * 0.15,
    100,
  ));
  const squeezeRisk: NativeSqueezeRisk = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  return {
    symbol,
    shortInterest,
    avgDailyVolume,
    shortInterestRatio: Number(shortInterestRatio.toFixed(4)),
    previousMonthChange: Number(previousMonthChange.toFixed(4)),
    shortExemptVolume: Math.round(baseFloat * 0.01),
    totalFloat,
    shortPercentFloat,
    borrowCost,
    squeezeScore: score,
    squeezeRisk,
  };
}

export function getNativeShortInterest(symbol: string): NativeShortInterestData {
  return { ...generateSnapshot(normalizeSymbol(symbol)) };
}

export function calculateNativeShortInterestRatio(input: {
  symbol: string;
  quantity?: number;
  avgCost?: number;
}): NativeShortInterestRatioResult {
  const data = getNativeShortInterest(input.symbol);
  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || input.quantity <= 0)) throw new Error('quantity must be positive');
  if (input.avgCost !== undefined && (!Number.isFinite(input.avgCost) || input.avgCost <= 0)) throw new Error('avgCost must be positive');
  const result: NativeShortInterestRatioResult = {
    symbol: data.symbol,
    marketShortInterest: {
      shortInterest: data.shortInterest,
      avgDailyVolume: data.avgDailyVolume,
      daysToCover: data.shortInterestRatio,
    },
  };
  if (input.quantity !== undefined && input.avgCost !== undefined) {
    result.positionAnalysis = {
      sharesHeld: input.quantity,
      avgCost: input.avgCost,
      positionValue: Number((input.quantity * input.avgCost).toFixed(4)),
      buyingPressurePercent: Number((data.shortInterestRatio * 100).toFixed(4)),
      estimatedCoveringDays: data.shortInterestRatio,
      riskLevel: data.squeezeRisk,
    };
  }
  return result;
}

export function detectNativeShortSqueeze(input: {
  symbols: readonly string[];
  minShortInterestRatio?: number;
  minShortPercentFloat?: number;
}): NativeShortSqueezeResult {
  if (input.symbols.length < 1 || input.symbols.length > 20) throw new Error('symbols must contain between 1 and 20 items');
  const minDaysToCover = input.minShortInterestRatio ?? 5;
  const minShortPercentFloat = input.minShortPercentFloat ?? 5;
  if (!Number.isFinite(minDaysToCover) || minDaysToCover < 1 || minDaysToCover > 30) throw new Error('minShortInterestRatio must be between 1 and 30');
  if (!Number.isFinite(minShortPercentFloat) || minShortPercentFloat < 1 || minShortPercentFloat > 50) throw new Error('minShortPercentFloat must be between 1 and 50');
  const allMatches = input.symbols.map((symbol) => getNativeShortInterest(symbol)).filter((data) => data.shortInterestRatio >= minDaysToCover && data.shortPercentFloat >= minShortPercentFloat).map((data) => ({
    symbol: data.symbol,
    shortInterest: data.shortInterest,
    daysToCover: data.shortInterestRatio,
    shortPercentFloat: data.shortPercentFloat,
    borrowCost: data.borrowCost,
    squeezeScore: data.squeezeScore,
    riskLevel: data.squeezeRisk.toUpperCase() as Uppercase<NativeSqueezeRisk>,
  })).sort((left, right) => right.squeezeScore - left.squeezeScore || left.symbol.localeCompare(right.symbol));
  return {
    screeningCriteria: { minDaysToCover, minShortPercentFloat, symbolsScreened: input.symbols.length, matchesFound: allMatches.length },
    highRiskStocks: allMatches.filter((item) => item.riskLevel === 'HIGH'),
    mediumRiskStocks: allMatches.filter((item) => item.riskLevel === 'MEDIUM'),
    allMatches,
    disclaimer: 'Deterministic historical fixture for screening only; short-squeeze potential does not guarantee an outcome and is not investment advice.',
  };
}
