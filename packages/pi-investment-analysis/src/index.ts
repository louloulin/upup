export interface DcfInput {
  currentFcf: number;
  growthRate: number;
  discountRate: number;
  terminalGrowthRate: number;
  projectionYears: number;
  sharesOutstanding: number;
}

export interface DcfResult {
  enterpriseValue: number;
  fairValuePerShare: number;
  projectedCashFlows: readonly number[];
  terminalValue: number;
  assumptions: DcfInput;
}

export interface AnalysisBar {
  date: string;
  close: number;
}

export interface TechnicalSignal {
  trend: 'bullish' | 'bearish' | 'neutral';
  latestClose: number;
  movingAverage: number;
  distancePercent: number;
  observations: number;
}

export function calculateDcf(input: DcfInput): DcfResult {
  if (!Number.isFinite(input.currentFcf) || input.currentFcf <= 0) throw new Error('currentFcf must be positive');
  if (!Number.isInteger(input.projectionYears) || input.projectionYears < 1 || input.projectionYears > 20) throw new Error('projectionYears must be 1-20');
  if (!Number.isFinite(input.sharesOutstanding) || input.sharesOutstanding <= 0) throw new Error('sharesOutstanding must be positive');
  if (input.discountRate <= input.terminalGrowthRate) throw new Error('discountRate must exceed terminalGrowthRate');
  const projectedCashFlows = Array.from({ length: input.projectionYears }, (_, index) => input.currentFcf * (1 + input.growthRate) ** (index + 1));
  const discountedCashFlows = projectedCashFlows.map((cashFlow, index) => cashFlow / (1 + input.discountRate) ** (index + 1));
  const terminalValue = projectedCashFlows.at(-1)! * (1 + input.terminalGrowthRate) / (input.discountRate - input.terminalGrowthRate);
  const enterpriseValue = discountedCashFlows.reduce((sum, value) => sum + value, 0) + terminalValue / (1 + input.discountRate) ** input.projectionYears;
  return {
    enterpriseValue: Number(enterpriseValue.toFixed(4)),
    fairValuePerShare: Number((enterpriseValue / input.sharesOutstanding).toFixed(4)),
    projectedCashFlows: projectedCashFlows.map((value) => Number(value.toFixed(4))),
    terminalValue: Number(terminalValue.toFixed(4)),
    assumptions: { ...input },
  };
}

export function calculateTechnicalSignal(bars: readonly AnalysisBar[]): TechnicalSignal {
  if (bars.length < 3) throw new Error('at least three observations are required');
  const latestClose = bars.at(-1)!.close;
  const movingAverage = bars.reduce((sum, bar) => sum + bar.close, 0) / bars.length;
  const distancePercent = ((latestClose - movingAverage) / movingAverage) * 100;
  const trend = distancePercent >= 2 ? 'bullish' : distancePercent <= -2 ? 'bearish' : 'neutral';
  return { trend, latestClose: Number(latestClose.toFixed(4)), movingAverage: Number(movingAverage.toFixed(4)), distancePercent: Number(distancePercent.toFixed(4)), observations: bars.length };
}
