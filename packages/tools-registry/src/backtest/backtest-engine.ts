/**
 * Backtesting Evaluation Engine
 *
 * Pure logic for evaluating historical investment analyses against forward price data.
 * Ported from Python daily_stock_analysis backtest_engine.py
 */

import { formatToolResult } from '../types.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface DailyBar {
  date: string;
  high?: number;
  low?: number;
  close?: number;
}

export interface EvaluationConfig {
  evalWindowDays: number;
  neutralBandPct: number;
  engineVersion: string;
}

export interface EvaluationResult {
  analysisDate: string;
  evalWindowDays: number;
  engineVersion: string;
  evalStatus: 'completed' | 'insufficient_data' | 'error';
  operationAdvice?: string;
  positionRecommendation: 'long' | 'cash';
  startPrice?: number;
  endClose?: number;
  maxHigh?: number;
  minLow?: number;
  stockReturnPct?: number;
  directionExpected: 'up' | 'down' | 'flat' | 'not_down';
  directionCorrect?: boolean;
  outcome?: 'win' | 'loss' | 'neutral';
  stopLoss?: number;
  takeProfit?: number;
  hitStopLoss?: boolean;
  hitTakeProfit?: boolean;
  firstHit?: 'stop_loss' | 'take_profit' | 'ambiguous' | 'neither' | 'not_applicable';
  firstHitDate?: string;
  firstHitTradingDays?: number;
  simulatedEntryPrice?: number;
  simulatedExitPrice?: number;
  simulatedExitReason?: string;
  simulatedReturnPct?: number;
}

export interface BacktestSummary {
  scope: string;
  code?: string;
  evalWindowDays: number;
  engineVersion: string;
  totalEvaluations: number;
  completedCount: number;
  insufficientCount: number;
  longCount: number;
  cashCount: number;
  winCount: number;
  lossCount: number;
  neutralCount: number;
  directionAccuracyPct?: number;
  winRatePct?: number;
  neutralRatePct?: number;
  avgStockReturnPct?: number;
  avgSimulatedReturnPct?: number;
  stopLossTriggerRate?: number;
  takeProfitTriggerRate?: number;
  ambiguousRate?: number;
  avgDaysToFirstHit?: number;
  adviceBreakdown: Record<string, {
    total: number;
    win: number;
    loss: number;
    neutral: number;
    winRatePct?: number;
  }>;
}

export interface BacktestTrade {
  symbol: string;
  analysisDate: string;
  operationAdvice: string;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity: number;
}

// ============================================================================
// Keyword Definitions
// ============================================================================

const BULLISH_KEYWORDS = [
  '买入', '加仓', '强烈买入', '增持', '建仓',
  'strong buy', 'buy', 'add', 'long', '做多', '开多',
];

const BEARISH_KEYWORDS = [
  '卖出', '减仓', '强烈卖出', '清仓', '平仓',
  'strong sell', 'sell', 'reduce', 'short', '做空', '开空',
];

const HOLD_KEYWORDS = ['持有', 'hold', '持仓'];

const WAIT_KEYWORDS = ['观望', '等待', 'wait', '观望中'];

const NEGATION_PATTERNS = [
  'not', "don't", 'do not', 'no', 'never', 'avoid',
  '不要', '不', '别', '勿', '没有', '无法', '不建议',
];

// ============================================================================
// Backtest Engine
// ============================================================================

export class BacktestEngine {
  /**
   * Infer expected direction from operation advice
   */
  static inferDirectionExpected(operationAdvice?: string): 'up' | 'down' | 'flat' | 'not_down' {
    const text = this.normalizeText(operationAdvice);
    if (this.matchesIntent(text, BEARISH_KEYWORDS)) return 'down';
    if (this.matchesIntent(text, WAIT_KEYWORDS)) return 'flat';
    if (this.matchesIntent(text, BULLISH_KEYWORDS)) return 'up';
    if (this.matchesIntent(text, HOLD_KEYWORDS)) return 'not_down';
    return 'flat';
  }

  /**
   * Infer position recommendation (long-only system)
   */
  static inferPositionRecommendation(operationAdvice?: string): 'long' | 'cash' {
    const text = this.normalizeText(operationAdvice);
    if (this.matchesIntent(text, BEARISH_KEYWORDS) || this.matchesIntent(text, WAIT_KEYWORDS)) {
      return 'cash';
    }
    if (this.matchesIntent(text, BULLISH_KEYWORDS) || this.matchesIntent(text, HOLD_KEYWORDS)) {
      return 'long';
    }
    return 'cash';
  }

  /**
   * Evaluate a single historical analysis against forward daily bars
   */
  static evaluateSingle(params: {
    operationAdvice?: string;
    analysisDate: string;
    startPrice: number;
    forwardBars: DailyBar[];
    stopLoss?: number;
    takeProfit?: number;
    config: EvaluationConfig;
  }): EvaluationResult {
    const { operationAdvice, analysisDate, startPrice, forwardBars, stopLoss, takeProfit, config } = params;

    if (!startPrice || startPrice <= 0) {
      return {
        analysisDate,
        evalWindowDays: config.evalWindowDays,
        engineVersion: config.engineVersion,
        evalStatus: 'error',
        operationAdvice,
        positionRecommendation: this.inferPositionRecommendation(operationAdvice),
        directionExpected: this.inferDirectionExpected(operationAdvice),
      };
    }

    if (forwardBars.length < config.evalWindowDays) {
      return {
        analysisDate,
        evalWindowDays: config.evalWindowDays,
        engineVersion: config.engineVersion,
        evalStatus: 'insufficient_data',
        operationAdvice,
        positionRecommendation: this.inferPositionRecommendation(operationAdvice),
        directionExpected: this.inferDirectionExpected(operationAdvice),
      };
    }

    const windowBars = forwardBars.slice(0, config.evalWindowDays);
    const endClose = windowBars[windowBars.length - 1].close;
    const highs = windowBars.filter(b => b.high !== undefined).map(b => b.high!);
    const lows = windowBars.filter(b => b.low !== undefined).map(b => b.low!);
    const maxHigh = highs.length > 0 ? Math.max(...highs) : undefined;
    const minLow = lows.length > 0 ? Math.min(...lows) : undefined;

    const stockReturnPct = endClose !== undefined
      ? ((endClose - startPrice) / startPrice) * 100
      : undefined;

    const directionExpected = this.inferDirectionExpected(operationAdvice);
    const position = this.inferPositionRecommendation(operationAdvice);

    const { outcome, directionCorrect } = this.classifyOutcome(
      stockReturnPct,
      directionExpected,
      config.neutralBandPct
    );

    const {
      hitStopLoss,
      hitTakeProfit,
      firstHit,
      firstHitDate,
      firstHitDays,
      simulatedExitPrice,
      simulatedExitReason,
    } = this.evaluateTargets(position, stopLoss, takeProfit, windowBars, endClose);

    const simulatedEntryPrice = position === 'long' ? startPrice : undefined;
    let simulatedReturnPct: number | undefined;
    if (position !== 'long') {
      simulatedReturnPct = 0;
    } else if (simulatedExitPrice === undefined) {
      simulatedReturnPct = undefined;
    } else {
      simulatedReturnPct = ((simulatedExitPrice - startPrice) / startPrice) * 100;
    }

    return {
      analysisDate,
      evalWindowDays: config.evalWindowDays,
      engineVersion: config.engineVersion,
      evalStatus: 'completed',
      operationAdvice,
      positionRecommendation: position,
      startPrice,
      endClose,
      maxHigh,
      minLow,
      stockReturnPct,
      directionExpected,
      directionCorrect,
      outcome,
      stopLoss,
      takeProfit,
      hitStopLoss,
      hitTakeProfit,
      firstHit,
      firstHitDate,
      firstHitTradingDays: firstHitDays,
      simulatedEntryPrice,
      simulatedExitPrice,
      simulatedExitReason,
      simulatedReturnPct,
    };
  }

  /**
   * Compute summary metrics from multiple backtest results
   */
  static computeSummary(results: EvaluationResult[], scope: string, evalWindowDays: number, engineVersion: string, code?: string): BacktestSummary {
    const total = results.length;
    const completed = results.filter(r => r.evalStatus === 'completed');
    const insufficientCount = results.filter(r => r.evalStatus === 'insufficient_data').length;

    const longCount = completed.filter(r => r.positionRecommendation === 'long').length;
    const cashCount = completed.filter(r => r.positionRecommendation === 'cash').length;

    const winCount = completed.filter(r => r.outcome === 'win').length;
    const lossCount = completed.filter(r => r.outcome === 'loss').length;
    const neutralCount = completed.filter(r => r.outcome === 'neutral').length;

    const directionDenominator = completed.filter(r => r.directionCorrect !== undefined).length;
    const directionNumerator = completed.filter(r => r.directionCorrect === true).length;
    const directionAccuracyPct = directionDenominator > 0
      ? Math.round((directionNumerator / directionDenominator) * 10000) / 100
      : undefined;

    const winLossDenominator = winCount + lossCount;
    const winRatePct = winLossDenominator > 0
      ? Math.round((winCount / winLossDenominator) * 10000) / 100
      : undefined;

    const neutralRatePct = completed.length > 0
      ? Math.round((neutralCount / completed.length) * 10000) / 100
      : undefined;

    const avgStockReturnPct = this.average(completed.map(r => r.stockReturnPct));
    const avgSimulatedReturnPct = this.average(completed.map(r => r.simulatedReturnPct));

    const stopApplicable = completed.filter(
      r => r.positionRecommendation === 'long' && r.hitStopLoss !== undefined
    );
    const stopLossTriggerRate = stopApplicable.length > 0
      ? Math.round((stopApplicable.filter(r => r.hitStopLoss).length / stopApplicable.length) * 10000) / 100
      : undefined;

    const tpApplicable = completed.filter(
      r => r.positionRecommendation === 'long' && r.hitTakeProfit !== undefined
    );
    const takeProfitTriggerRate = tpApplicable.length > 0
      ? Math.round((tpApplicable.filter(r => r.hitTakeProfit).length / tpApplicable.length) * 10000) / 100
      : undefined;

    const anyTargetApplicable = completed.filter(
      r => r.positionRecommendation === 'long' &&
        (r.hitStopLoss !== undefined || r.hitTakeProfit !== undefined)
    );
    const ambiguousRate = anyTargetApplicable.length > 0
      ? Math.round((anyTargetApplicable.filter(r => r.firstHit === 'ambiguous').length / anyTargetApplicable.length) * 10000) / 100
      : undefined;

    const firstHitDays = anyTargetApplicable
      .filter(r => r.firstHitTradingDays !== undefined && ['stop_loss', 'take_profit', 'ambiguous'].includes(r.firstHit || ''))
      .map(r => r.firstHitTradingDays!);
    const avgDaysToFirstHit = firstHitDays.length > 0 ? this.average(firstHitDays) : undefined;

    const adviceBreakdown = this.computeAdviceBreakdown(results);

    return {
      scope,
      code,
      evalWindowDays,
      engineVersion,
      totalEvaluations: total,
      completedCount: completed.length,
      insufficientCount,
      longCount,
      cashCount,
      winCount,
      lossCount,
      neutralCount,
      directionAccuracyPct,
      winRatePct,
      neutralRatePct,
      avgStockReturnPct,
      avgSimulatedReturnPct,
      stopLossTriggerRate,
      takeProfitTriggerRate,
      ambiguousRate,
      avgDaysToFirstHit,
      adviceBreakdown,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private static normalizeText(value?: string): string {
    return (value || '').trim().toLowerCase();
  }

  private static matchesIntent(text: string, keywords: string[]): boolean {
    if (!text) return false;

    // Tier 1: exact match
    for (const kw of keywords) {
      if (text === kw) return true;
    }

    // Tier 2: substring match with negation guard
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx === -1) continue;
      if (!this.isNegated(text.substring(0, idx))) return true;
    }

    return false;
  }

  private static isNegated(prefix: string): boolean {
    const stripped = prefix.trimEnd();
    return NEGATION_PATTERNS.some(neg => stripped.endsWith(neg));
  }

  private static classifyOutcome(
    stockReturnPct: number | undefined,
    directionExpected: string,
    neutralBandPct: number
  ): { outcome?: 'win' | 'loss' | 'neutral'; directionCorrect?: boolean } {
    if (stockReturnPct === undefined) {
      return { outcome: undefined, directionCorrect: undefined };
    }

    const band = Math.abs(neutralBandPct);
    const r = stockReturnPct;

    if (directionExpected === 'up') {
      if (r >= band) return { outcome: 'win', directionCorrect: true };
      if (r <= -band) return { outcome: 'loss', directionCorrect: false };
      return { outcome: 'neutral', directionCorrect: undefined };
    }

    if (directionExpected === 'down') {
      if (r <= -band) return { outcome: 'win', directionCorrect: true };
      if (r >= band) return { outcome: 'loss', directionCorrect: false };
      return { outcome: 'neutral', directionCorrect: undefined };
    }

    if (directionExpected === 'not_down') {
      if (r >= 0) return { outcome: 'win', directionCorrect: true };
      if (r <= -band) return { outcome: 'loss', directionCorrect: false };
      return { outcome: 'neutral', directionCorrect: undefined };
    }

    // flat
    if (Math.abs(r) <= band) return { outcome: 'win', directionCorrect: true };
    return { outcome: 'loss', directionCorrect: false };
  }

  private static evaluateTargets(
    position: string,
    stopLoss?: number,
    takeProfit?: number,
    windowBars?: DailyBar[],
    endClose?: number
  ): {
    hitStopLoss?: boolean;
    hitTakeProfit?: boolean;
    firstHit?: 'stop_loss' | 'take_profit' | 'ambiguous' | 'neither' | 'not_applicable';
    firstHitDate?: string;
    firstHitDays?: number;
    simulatedExitPrice?: number;
    simulatedExitReason?: string;
  } {
    if (position !== 'long') {
      return {
        hitStopLoss: undefined,
        hitTakeProfit: undefined,
        firstHit: 'not_applicable',
        firstHitDate: undefined,
        firstHitDays: undefined,
        simulatedExitPrice: undefined,
        simulatedExitReason: 'cash',
      };
    }

    const hasAnyTarget = stopLoss !== undefined || takeProfit !== undefined;
    if (!hasAnyTarget) {
      return {
        hitStopLoss: undefined,
        hitTakeProfit: undefined,
        firstHit: 'neither',
        firstHitDate: undefined,
        firstHitDays: undefined,
        simulatedExitPrice: endClose,
        simulatedExitReason: 'window_end',
      };
    }

    let hitSl: boolean | undefined = stopLoss !== undefined ? false : undefined;
    let hitTp: boolean | undefined = takeProfit !== undefined ? false : undefined;
    let firstHit: 'stop_loss' | 'take_profit' | 'ambiguous' | 'neither' = 'neither';
    let firstHitDate: string | undefined;
    let firstHitDays: number | undefined;
    let exitPrice: number | undefined = endClose;
    let exitReason = 'window_end';

    if (!windowBars) {
      return {
        hitStopLoss: hitSl ?? undefined,
        hitTakeProfit: hitTp ?? undefined,
        firstHit,
        firstHitDate,
        firstHitDays,
        simulatedExitPrice: exitPrice,
        simulatedExitReason: exitReason,
      };
    }

    for (let idx = 0; idx < windowBars.length; idx++) {
      const bar = windowBars[idx];
      const low = bar.low;
      const high = bar.high;
      const stopHit = stopLoss !== undefined && low !== undefined && low <= stopLoss;
      const tpHit = takeProfit !== undefined && high !== undefined && high >= takeProfit;

      if (stopHit) hitSl = true;
      if (tpHit) hitTp = true;

      if (!stopHit && !tpHit) continue;

      firstHitDate = bar.date;
      firstHitDays = idx + 1;

      if (stopHit && tpHit) {
        firstHit = 'ambiguous';
        exitPrice = stopLoss;
        exitReason = 'ambiguous_stop_loss';
        break;
      }

      if (stopHit) {
        firstHit = 'stop_loss';
        exitPrice = stopLoss;
        exitReason = 'stop_loss';
        break;
      }

      firstHit = 'take_profit';
      exitPrice = takeProfit;
      exitReason = 'take_profit';
      break;
    }

    return {
      hitStopLoss: hitSl ?? undefined,
      hitTakeProfit: hitTp ?? undefined,
      firstHit,
      firstHitDate,
      firstHitDays,
      simulatedExitPrice: exitPrice,
      simulatedExitReason: exitReason,
    };
  }

  private static average(values: (number | undefined)[]): number | undefined {
    const items = values.filter((v): v is number => v !== undefined);
    if (items.length === 0) return undefined;
    return Math.round((items.reduce((a, b) => a + b, 0) / items.length) * 10000) / 10000;
  }

  private static computeAdviceBreakdown(results: EvaluationResult[]): Record<string, {
    total: number;
    win: number;
    loss: number;
    neutral: number;
    winRatePct?: number;
  }> {
    const breakdown: Record<string, { total: number; win: number; loss: number; neutral: number }> = {};

    for (const row of results) {
      const advice = (row.operationAdvice || '(unknown)').trim() || '(unknown)';
      const bucket = breakdown[advice] || { total: 0, win: 0, loss: 0, neutral: 0 };
      bucket.total += 1;
      if (row.outcome === 'win') bucket.win += 1;
      else if (row.outcome === 'loss') bucket.loss += 1;
      else if (row.outcome === 'neutral') bucket.neutral += 1;
      breakdown[advice] = bucket;
    }

    const enriched: Record<string, typeof breakdown[string] & { winRatePct?: number }> = {};
    for (const [advice, bucket] of Object.entries(breakdown)) {
      const winRatePct = (bucket.win + bucket.loss) > 0
        ? Math.round((bucket.win / (bucket.win + bucket.loss)) * 10000) / 100
        : undefined;
      enriched[advice] = { ...bucket, winRatePct };
    }
    return enriched;
  }

  /**
   * Simulate a trade and evaluate performance
   */
  static simulateTrade(trade: BacktestTrade, forwardBars: DailyBar[], config: EvaluationConfig): EvaluationResult {
    return this.evaluateSingle({
      operationAdvice: trade.operationAdvice,
      analysisDate: trade.analysisDate,
      startPrice: trade.entryPrice,
      forwardBars,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      config,
    });
  }
}
