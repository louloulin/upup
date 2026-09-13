import { calculateTransactionCosts, type BacktestCostModel, type BacktestTransactionCosts } from './cost-model.js';
import { validateForwardBars, type BacktestDataQualityMode, type BacktestDataQualityReport } from './data-quality.js';

export interface DailyBar { readonly date: string; readonly high?: number; readonly low?: number; readonly close?: number; }
export interface BacktestConfig {
  readonly evalWindowDays: number;
  readonly neutralBandPct: number;
  readonly engineVersion: string;
  readonly dataQualityMode?: BacktestDataQualityMode;
  readonly asOfDate?: string;
  readonly requireTradingDays?: boolean;
  readonly costModel?: BacktestCostModel;
}
export type DirectionExpected = 'up' | 'down' | 'flat' | 'not_down';
export type PositionRecommendation = 'long' | 'cash';
export type Outcome = 'win' | 'loss' | 'neutral';
export interface BacktestTrade { readonly symbol: string; readonly analysisDate: string; readonly operationAdvice?: string; readonly entryPrice: number; readonly stopLoss?: number; readonly takeProfit?: number; readonly quantity: number; }
export interface EvaluationResult {
  readonly analysisDate: string; readonly evalWindowDays: number; readonly engineVersion: string; readonly evalStatus: 'completed' | 'insufficient_data' | 'error'; readonly operationAdvice?: string;
  readonly positionRecommendation: PositionRecommendation; readonly startPrice?: number; readonly endClose?: number; readonly maxHigh?: number; readonly minLow?: number; readonly stockReturnPct?: number;
  readonly directionExpected: DirectionExpected; readonly directionCorrect?: boolean; readonly outcome?: Outcome; readonly stopLoss?: number; readonly takeProfit?: number; readonly hitStopLoss?: boolean; readonly hitTakeProfit?: boolean;
  readonly firstHit?: 'stop_loss' | 'take_profit' | 'ambiguous' | 'neither' | 'not_applicable'; readonly firstHitDate?: string; readonly firstHitTradingDays?: number; readonly simulatedEntryPrice?: number; readonly simulatedExitPrice?: number; readonly simulatedExitReason?: string; readonly simulatedReturnPct?: number; readonly grossSimulatedReturnPct?: number; readonly transactionCosts?: BacktestTransactionCosts; readonly dataQuality?: BacktestDataQualityReport;
}
export interface BacktestSummary {
  readonly scope: string; readonly code?: string; readonly evalWindowDays: number; readonly engineVersion: string; readonly totalEvaluations: number; readonly completedCount: number; readonly insufficientCount: number; readonly dataQualityFailedCount: number; readonly longCount: number; readonly cashCount: number; readonly winCount: number; readonly lossCount: number; readonly neutralCount: number; readonly directionAccuracyPct?: number; readonly winRatePct?: number; readonly neutralRatePct?: number; readonly avgStockReturnPct?: number; readonly avgSimulatedReturnPct?: number; readonly avgGrossSimulatedReturnPct?: number; readonly avgTransactionCost?: number; readonly totalTransactionCost?: number; readonly stopLossTriggerRate?: number; readonly takeProfitTriggerRate?: number; readonly ambiguousRate?: number; readonly avgDaysToFirstHit?: number;
  readonly adviceBreakdown: Readonly<Record<string, { total: number; win: number; loss: number; neutral: number; winRatePct?: number }>>;
}

export interface BacktestRunInput {
  readonly trades: readonly BacktestTrade[];
  readonly forwardPriceData: Readonly<Record<string, readonly DailyBar[]>>;
  readonly evalWindowDays: number;
  readonly neutralBandPct: number;
  readonly engineVersion?: string;
  readonly dataQualityMode?: BacktestDataQualityMode;
  readonly asOfDate?: string;
  readonly requireTradingDays?: boolean;
  readonly costModel?: BacktestCostModel;
}

export interface BacktestRunResult {
  readonly summary: BacktestSummary;
  readonly results: readonly EvaluationResult[];
}

const bullish = ['买入', '加仓', '强烈买入', '增持', '建仓', 'strong buy', 'buy', 'add', 'long', '做多', '开多'];
const bearish = ['卖出', '减仓', '强烈卖出', '清仓', '平仓', 'strong sell', 'sell', 'reduce', 'short', '做空', '开空'];
const hold = ['持有', 'hold', '持仓'];
const wait = ['观望', '等待', 'wait', '观望中'];
const negations = ['not', "don't", 'do not', 'no', 'never', 'avoid', '不要', '不', '别', '勿', '没有', '无法', '不建议'];
const round = (value: number, decimals = 4): number => Number(value.toFixed(decimals));
const normalize = (value?: string): string => (value ?? '').trim().toLowerCase();
function matches(text: string, keywords: readonly string[]): boolean { return keywords.some((keyword) => { const index = text.indexOf(keyword); return (text === keyword || index >= 0) && !negations.some((negation) => text.slice(0, index).trimEnd().endsWith(negation)); }); }
export function inferDirection(operationAdvice?: string): DirectionExpected { const text = normalize(operationAdvice); if (matches(text, bearish)) return 'down'; if (matches(text, wait)) return 'flat'; if (matches(text, bullish)) return 'up'; if (matches(text, hold)) return 'not_down'; return 'flat'; }
export function inferPosition(operationAdvice?: string): PositionRecommendation { const text = normalize(operationAdvice); return matches(text, bearish) || matches(text, wait) ? 'cash' : matches(text, bullish) || matches(text, hold) ? 'long' : 'cash'; }
function classify(stockReturnPct: number | undefined, direction: DirectionExpected, band: number): { outcome?: Outcome; directionCorrect?: boolean } {
  if (stockReturnPct === undefined) return {};
  const returnPct = stockReturnPct; const neutralBand = Math.abs(band);
  if (direction === 'up') return returnPct >= neutralBand ? { outcome: 'win', directionCorrect: true } : returnPct <= -neutralBand ? { outcome: 'loss', directionCorrect: false } : { outcome: 'neutral' };
  if (direction === 'down') return returnPct <= -neutralBand ? { outcome: 'win', directionCorrect: true } : returnPct >= neutralBand ? { outcome: 'loss', directionCorrect: false } : { outcome: 'neutral' };
  if (direction === 'not_down') return returnPct >= 0 ? { outcome: 'win', directionCorrect: true } : returnPct <= -neutralBand ? { outcome: 'loss', directionCorrect: false } : { outcome: 'neutral' };
  return Math.abs(returnPct) <= neutralBand ? { outcome: 'win', directionCorrect: true } : { outcome: 'loss', directionCorrect: false };
}
function targets(position: PositionRecommendation, stopLoss: number | undefined, takeProfit: number | undefined, bars: readonly DailyBar[], endClose: number | undefined) {
  if (position !== 'long') return { firstHit: 'not_applicable' as const, simulatedExitReason: 'cash' };
  if (stopLoss === undefined && takeProfit === undefined) return { firstHit: 'neither' as const, simulatedExitPrice: endClose, simulatedExitReason: 'window_end' };
  let hitStopLoss: boolean | undefined = stopLoss === undefined ? undefined : false; let hitTakeProfit: boolean | undefined = takeProfit === undefined ? undefined : false;
  let firstHit: 'stop_loss' | 'take_profit' | 'ambiguous' | 'neither' = 'neither'; let firstHitDate: string | undefined; let firstHitTradingDays: number | undefined; let simulatedExitPrice = endClose; let simulatedExitReason = 'window_end';
  for (let index = 0; index < bars.length; index += 1) { const bar = bars[index]; const stopHit = stopLoss !== undefined && bar.low !== undefined && bar.low <= stopLoss; const takeHit = takeProfit !== undefined && bar.high !== undefined && bar.high >= takeProfit; if (stopHit) hitStopLoss = true; if (takeHit) hitTakeProfit = true; if (!stopHit && !takeHit) continue; firstHitDate = bar.date; firstHitTradingDays = index + 1; if (stopHit && takeHit) { firstHit = 'ambiguous'; simulatedExitPrice = stopLoss; simulatedExitReason = 'ambiguous_stop_loss'; } else if (stopHit) { firstHit = 'stop_loss'; simulatedExitPrice = stopLoss; simulatedExitReason = 'stop_loss'; } else { firstHit = 'take_profit'; simulatedExitPrice = takeProfit; simulatedExitReason = 'take_profit'; } break; }
  return { hitStopLoss, hitTakeProfit, firstHit, firstHitDate, firstHitTradingDays, simulatedExitPrice, simulatedExitReason };
}
export function evaluateTrade(trade: BacktestTrade, forwardBars: readonly DailyBar[], config: BacktestConfig): EvaluationResult {
  const positionRecommendation = inferPosition(trade.operationAdvice); const directionExpected = inferDirection(trade.operationAdvice);
  if (!Number.isFinite(trade.entryPrice) || trade.entryPrice <= 0) return { analysisDate: trade.analysisDate, evalWindowDays: config.evalWindowDays, engineVersion: config.engineVersion, evalStatus: 'error', operationAdvice: trade.operationAdvice, positionRecommendation, directionExpected };
  const dataQuality = config.dataQualityMode ? validateForwardBars(trade.analysisDate, forwardBars, { mode: config.dataQualityMode, asOfDate: config.asOfDate, requireTradingDays: config.requireTradingDays }) : undefined;
  if (dataQuality?.status === 'failed') return { analysisDate: trade.analysisDate, evalWindowDays: config.evalWindowDays, engineVersion: config.engineVersion, evalStatus: 'error', operationAdvice: trade.operationAdvice, positionRecommendation, directionExpected, dataQuality };
  if (forwardBars.length < config.evalWindowDays) return { analysisDate: trade.analysisDate, evalWindowDays: config.evalWindowDays, engineVersion: config.engineVersion, evalStatus: 'insufficient_data', operationAdvice: trade.operationAdvice, positionRecommendation, directionExpected, dataQuality };
  const bars = forwardBars.slice(0, config.evalWindowDays); const endClose = bars.at(-1)?.close; const highs = bars.flatMap((bar) => bar.high === undefined ? [] : [bar.high]); const lows = bars.flatMap((bar) => bar.low === undefined ? [] : [bar.low]);
  const stockReturnPct = endClose === undefined ? undefined : ((endClose - trade.entryPrice) / trade.entryPrice) * 100; const outcome = classify(stockReturnPct, directionExpected, config.neutralBandPct); const targetResult = targets(positionRecommendation, trade.stopLoss, trade.takeProfit, bars, endClose);
  const transactionCosts = positionRecommendation === 'long' && targetResult.simulatedExitPrice !== undefined ? calculateTransactionCosts(trade.entryPrice, targetResult.simulatedExitPrice, trade.quantity, config.costModel ?? {}) : undefined;
  const simulatedReturnPct = positionRecommendation !== 'long' ? 0 : transactionCosts?.netReturnPct;
  return { analysisDate: trade.analysisDate, evalWindowDays: config.evalWindowDays, engineVersion: config.engineVersion, evalStatus: 'completed', operationAdvice: trade.operationAdvice, positionRecommendation, startPrice: trade.entryPrice, endClose, maxHigh: highs.length ? Math.max(...highs) : undefined, minLow: lows.length ? Math.min(...lows) : undefined, stockReturnPct, directionExpected, ...outcome, stopLoss: trade.stopLoss, takeProfit: trade.takeProfit, ...targetResult, simulatedEntryPrice: positionRecommendation === 'long' ? trade.entryPrice : undefined, simulatedReturnPct, grossSimulatedReturnPct: transactionCosts?.grossReturnPct, transactionCosts, dataQuality };
}
function average(values: readonly (number | undefined)[]): number | undefined { const filtered = values.filter((value): value is number => value !== undefined); return filtered.length ? round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length) : undefined; }
export function computeSummary(results: readonly EvaluationResult[], scope: string, evalWindowDays: number, engineVersion: string, code?: string): BacktestSummary {
  const completed = results.filter((result) => result.evalStatus === 'completed'); const wins = completed.filter((result) => result.outcome === 'win').length; const losses = completed.filter((result) => result.outcome === 'loss').length; const neutrals = completed.filter((result) => result.outcome === 'neutral').length; const directionResults = completed.filter((result) => result.directionCorrect !== undefined); const targetsApplied = completed.filter((result) => result.positionRecommendation === 'long' && (result.hitStopLoss !== undefined || result.hitTakeProfit !== undefined));
  const adviceBreakdown: Record<string, { total: number; win: number; loss: number; neutral: number; winRatePct?: number }> = {};
  for (const result of results) { const advice = result.operationAdvice?.trim() || '(unknown)'; const bucket = adviceBreakdown[advice] ?? { total: 0, win: 0, loss: 0, neutral: 0 }; bucket.total += 1; if (result.outcome === 'win') bucket.win += 1; else if (result.outcome === 'loss') bucket.loss += 1; else if (result.outcome === 'neutral') bucket.neutral += 1; adviceBreakdown[advice] = bucket; }
  for (const bucket of Object.values(adviceBreakdown)) { if (bucket.win + bucket.loss) bucket.winRatePct = round((bucket.win / (bucket.win + bucket.loss)) * 100, 2); }
  const stopApplicable = completed.filter((result) => result.positionRecommendation === 'long' && result.hitStopLoss !== undefined); const takeApplicable = completed.filter((result) => result.positionRecommendation === 'long' && result.hitTakeProfit !== undefined); const firstHitDays = targetsApplied.flatMap((result) => result.firstHitTradingDays !== undefined && ['stop_loss', 'take_profit', 'ambiguous'].includes(result.firstHit ?? '') ? [result.firstHitTradingDays] : []);
  const costResults = completed.flatMap((result) => result.transactionCosts ? [result.transactionCosts] : []);
  return { scope, code, evalWindowDays, engineVersion, totalEvaluations: results.length, completedCount: completed.length, insufficientCount: results.filter((result) => result.evalStatus === 'insufficient_data').length, dataQualityFailedCount: results.filter((result) => result.dataQuality?.status === 'failed').length, longCount: completed.filter((result) => result.positionRecommendation === 'long').length, cashCount: completed.filter((result) => result.positionRecommendation === 'cash').length, winCount: wins, lossCount: losses, neutralCount: neutrals, directionAccuracyPct: directionResults.length ? round((directionResults.filter((result) => result.directionCorrect).length / directionResults.length) * 100, 2) : undefined, winRatePct: wins + losses ? round((wins / (wins + losses)) * 100, 2) : undefined, neutralRatePct: completed.length ? round((neutrals / completed.length) * 100, 2) : undefined, avgStockReturnPct: average(completed.map((result) => result.stockReturnPct)), avgSimulatedReturnPct: average(completed.map((result) => result.simulatedReturnPct)), avgGrossSimulatedReturnPct: average(completed.map((result) => result.grossSimulatedReturnPct)), avgTransactionCost: costResults.length ? round(costResults.reduce((sum, cost) => sum + cost.totalCost, 0) / costResults.length) : undefined, totalTransactionCost: costResults.length ? round(costResults.reduce((sum, cost) => sum + cost.totalCost, 0)) : undefined, stopLossTriggerRate: stopApplicable.length ? round((stopApplicable.filter((result) => result.hitStopLoss).length / stopApplicable.length) * 100, 2) : undefined, takeProfitTriggerRate: takeApplicable.length ? round((takeApplicable.filter((result) => result.hitTakeProfit).length / takeApplicable.length) * 100, 2) : undefined, ambiguousRate: targetsApplied.length ? round((targetsApplied.filter((result) => result.firstHit === 'ambiguous').length / targetsApplied.length) * 100, 2) : undefined, avgDaysToFirstHit: average(firstHitDays), adviceBreakdown };
}

export function runBacktest(input: BacktestRunInput): BacktestRunResult {
  const engineVersion = input.engineVersion ?? 'v1';
  const config: BacktestConfig = {
    evalWindowDays: input.evalWindowDays,
    neutralBandPct: input.neutralBandPct,
    engineVersion,
    dataQualityMode: input.dataQualityMode ?? 'strict',
    asOfDate: input.asOfDate,
    requireTradingDays: input.requireTradingDays,
    costModel: input.costModel,
  };
  const results = input.trades.map((trade) => evaluateTrade(
    trade,
    input.forwardPriceData[trade.symbol] ?? [],
    config,
  ));
  return {
    summary: computeSummary(results, 'batch', config.evalWindowDays, config.engineVersion),
    results,
  };
}

export function calculateWinRate(outcomes: readonly Outcome[], includeNeutral = false): { wins: number; losses: number; neutrals: number; total: number; winRatePct: number; lossRatePct: number; neutralRatePct?: number } { const filtered = includeNeutral ? outcomes : outcomes.filter((outcome) => outcome !== 'neutral'); const wins = filtered.filter((outcome) => outcome === 'win').length; const losses = filtered.filter((outcome) => outcome === 'loss').length; const neutrals = outcomes.filter((outcome) => outcome === 'neutral').length; return { wins, losses, neutrals, total: filtered.length, winRatePct: filtered.length ? round((wins / filtered.length) * 100, 2) : 0, lossRatePct: filtered.length ? round((losses / filtered.length) * 100, 2) : 0, neutralRatePct: includeNeutral && outcomes.length ? round((neutrals / outcomes.length) * 100, 2) : undefined }; }

export { validateMethodology } from './methodology.js';
export type { FactorSource, MethodologyDisclosure, MethodologyValidation, OutOfSampleResult, WalkForwardFold } from './methodology.js';
export { calculateTransactionCosts } from './cost-model.js';
export type { BacktestCostModel, BacktestTransactionCosts } from './cost-model.js';
export { validateForwardBars } from './data-quality.js';
export type { BacktestDataQualityMode, BacktestDataQualityOptions, BacktestDataQualityReport } from './data-quality.js';
export { fundSubscriptionFee, renderFundBacktestReport, runFundBacktest } from './fund-backtest.js';
export type { FundBacktestConfig, FundBacktestResult, FundBacktestSnapshot, FundBacktestStrategy, FundNavPoint, FundType } from './fund-backtest.js';
