/**
 * Backtest Tools for UpUp
 *
 * Provides backtesting evaluation for investment analysis strategies.
 * Based on daily_stock_analysis backtest architecture.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { BacktestEngine, DailyBar, EvaluationConfig, BacktestTrade, BacktestSummary, EvaluationResult } from './backtest-engine.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const evaluateTradeSchema = z.object({
  symbol: z.string().describe('Stock symbol (e.g., AAPL, 600519, 0700.HK)'),
  analysisDate: z.string().describe('Analysis date in YYYY-MM-DD format'),
  operationAdvice: z.string().describe('Investment advice text (e.g., "买入", "持有", "卖出", "观望")'),
  entryPrice: z.number().positive().describe('Entry price per share'),
  stopLoss: z.number().positive().optional().describe('Stop loss price (optional)'),
  takeProfit: z.number().positive().optional().describe('Take profit price (optional)'),
  quantity: z.number().positive().int().default(100).describe('Number of shares'),
  forwardBars: z.array(z.object({
    date: z.string().describe('Date in YYYY-MM-DD format'),
    high: z.number().positive().optional(),
    low: z.number().positive().optional(),
    close: z.number().positive().optional(),
  })).min(1).describe('Forward price bars (OHLC data)'),
  evalWindowDays: z.number().int().positive().default(30).describe('Evaluation window in trading days'),
  neutralBandPct: z.number().positive().default(2.0).describe('Neutral band percentage for win/loss classification'),
});

const runBacktestSchema = z.object({
  trades: z.array(z.object({
    symbol: z.string().describe('Stock symbol'),
    analysisDate: z.string().describe('Analysis date'),
    operationAdvice: z.string().describe('Investment advice'),
    entryPrice: z.number().positive(),
    stopLoss: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    quantity: z.number().positive().int().default(100),
  })).min(1).describe('Array of historical trades to backtest'),
  forwardPriceData: z.record(z.string(), z.array(z.object({
    date: z.string(),
    high: z.number().optional(),
    low: z.number().optional(),
    close: z.number().optional(),
  }))).describe('Forward price data keyed by symbol'),
  evalWindowDays: z.number().int().positive().default(30).describe('Evaluation window in trading days'),
  neutralBandPct: z.number().positive().default(2.0).describe('Neutral band percentage'),
});

const getBacktestSummarySchema = z.object({
  scope: z.enum(['overall', 'stock', 'strategy']).default('overall').describe('Summary scope'),
  symbol: z.string().optional().describe('Stock symbol for stock-scoped summary'),
  strategyId: z.string().optional().describe('Strategy ID for strategy-scoped summary'),
  evalWindowDays: z.number().int().positive().default(30).describe('Evaluation window in trading days'),
});

const calculateWinRateSchema = z.object({
  outcomes: z.array(z.enum(['win', 'loss', 'neutral'])).describe('Array of trade outcomes'),
  includeNeutral: z.boolean().default(false).describe('Include neutral trades in win rate calculation'),
});

// ============================================================================
// Tool Handlers
// ============================================================================

function handleEvaluateTrade(params: z.infer<typeof evaluateTradeSchema>) {
  const config: EvaluationConfig = {
    evalWindowDays: params.evalWindowDays,
    neutralBandPct: params.neutralBandPct,
    engineVersion: 'v1',
  };

  const trade: BacktestTrade = {
    symbol: params.symbol,
    analysisDate: params.analysisDate,
    operationAdvice: params.operationAdvice,
    entryPrice: params.entryPrice,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
    quantity: params.quantity,
  };

  const result = BacktestEngine.simulateTrade(trade, params.forwardBars as DailyBar[], config);

  // Calculate P&L
  const pnl = result.simulatedReturnPct !== undefined
    ? (result.simulatedReturnPct / 100) * params.entryPrice * params.quantity
    : undefined;

  const interpretation = getInterpretation(result);

  return formatToolResult({
    type: 'Backtest Evaluation',
    symbol: params.symbol,
    analysisDate: params.analysisDate,
    operationAdvice: params.operationAdvice,
    position: result.positionRecommendation,
    direction: result.directionExpected,
    evalStatus: result.evalStatus,
    outcome: result.outcome,
    directionCorrect: result.directionCorrect,
    stockReturnPct: result.stockReturnPct?.toFixed(2) + '%',
    simulatedReturnPct: result.simulatedReturnPct?.toFixed(2) + '%',
    entryPrice: params.entryPrice.toFixed(2),
    exitPrice: result.simulatedExitPrice?.toFixed(2),
    exitReason: result.simulatedExitReason,
    stopLoss: params.stopLoss?.toFixed(2),
    takeProfit: params.takeProfit?.toFixed(2),
    hitStopLoss: result.hitStopLoss,
    hitTakeProfit: result.hitTakeProfit,
    firstHit: result.firstHit,
    pnl: pnl !== undefined ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : 'N/A',
    quantity: params.quantity,
    interpretation,
  });
}

function handleRunBacktest(params: z.infer<typeof runBacktestSchema>) {
  const config: EvaluationConfig = {
    evalWindowDays: params.evalWindowDays,
    neutralBandPct: params.neutralBandPct,
    engineVersion: 'v1',
  };

  const results: EvaluationResult[] = [];

  for (const trade of params.trades) {
    const forwardBars = params.forwardPriceData[trade.symbol];
    if (!forwardBars || forwardBars.length < params.evalWindowDays) {
      results.push({
        analysisDate: trade.analysisDate,
        evalWindowDays: params.evalWindowDays,
        engineVersion: 'v1',
        evalStatus: 'insufficient_data',
        operationAdvice: trade.operationAdvice,
        positionRecommendation: BacktestEngine.inferPositionRecommendation(trade.operationAdvice),
        directionExpected: BacktestEngine.inferDirectionExpected(trade.operationAdvice),
      });
      continue;
    }

    const result = BacktestEngine.simulateTrade(
      {
        symbol: trade.symbol,
        analysisDate: trade.analysisDate,
        operationAdvice: trade.operationAdvice,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        quantity: trade.quantity,
      },
      forwardBars as DailyBar[],
      config
    );
    results.push(result);
  }

  const summary = BacktestEngine.computeSummary(
    results,
    'batch',
    params.evalWindowDays,
    'v1'
  );

  return formatToolResult({
    type: 'Backtest Results',
    totalTrades: params.trades.length,
    completedCount: summary.completedCount,
    summary: {
      winRatePct: summary.winRatePct,
      directionAccuracyPct: summary.directionAccuracyPct,
      avgStockReturnPct: summary.avgStockReturnPct?.toFixed(2) + '%',
      avgSimulatedReturnPct: summary.avgSimulatedReturnPct?.toFixed(2) + '%',
      stopLossTriggerRate: summary.stopLossTriggerRate,
      takeProfitTriggerRate: summary.takeProfitTriggerRate,
    },
    breakdown: {
      long: summary.longCount,
      cash: summary.cashCount,
      win: summary.winCount,
      loss: summary.lossCount,
      neutral: summary.neutralCount,
    },
    adviceBreakdown: summary.adviceBreakdown,
    individualResults: results.map(r => ({
      symbol: params.trades[results.indexOf(r)]?.symbol,
      date: r.analysisDate,
      advice: r.operationAdvice,
      outcome: r.outcome,
      returnPct: r.stockReturnPct?.toFixed(2) + '%',
      directionCorrect: r.directionCorrect,
    })),
  });
}

function handleGetSummary(params: z.infer<typeof getBacktestSummarySchema>) {
  // For a stateless implementation, we return guidance on how to interpret results
  const interpretation = getSummaryInterpretation(params.scope, params.evalWindowDays);

  return formatToolResult({
    type: 'Backtest Summary Guidance',
    scope: params.scope,
    symbol: params.symbol,
    strategyId: params.strategyId,
    evalWindowDays: params.evalWindowDays,
    note: 'This is a stateless backtest tool. For actual backtesting results, use run_backtest to evaluate historical trades.',
    interpretation,
    metrics: {
      winRate: 'Percentage of trades with returns beyond neutral band in expected direction',
      directionAccuracy: 'Percentage of predictions where direction was correct',
      avgReturn: 'Average return across all evaluated trades',
      stopLossRate: 'Percentage of long positions that hit stop loss',
      takeProfitRate: 'Percentage of long positions that hit take profit',
    },
    neutralBand: `${params.evalWindowDays} trading days`,
  });
}

function handleCalculateWinRate(params: z.infer<typeof calculateWinRateSchema>) {
  const filteredOutcomes = params.includeNeutral
    ? params.outcomes
    : params.outcomes.filter(o => o !== 'neutral');

  const wins = filteredOutcomes.filter(o => o === 'win').length;
  const total = filteredOutcomes.length;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  const lossRate = total > 0 ? (filteredOutcomes.filter(o => o === 'loss').length / total) * 100 : 0;
  const neutralRate = params.includeNeutral
    ? (params.outcomes.filter(o => o === 'neutral').length / params.outcomes.length) * 100
    : undefined;

  return formatToolResult({
    type: 'Win Rate Calculation',
    totalTrades: params.outcomes.length,
    evaluatedTrades: total,
    wins,
    losses: filteredOutcomes.filter(o => o === 'loss').length,
    neutrals: params.includeNeutral ? params.outcomes.filter(o => o === 'neutral').length : undefined,
    winRatePct: winRate.toFixed(2) + '%',
    lossRatePct: lossRate.toFixed(2) + '%',
    neutralRatePct: neutralRate !== undefined ? neutralRate.toFixed(2) + '%' : undefined,
    interpretation: getWinRateInterpretation(winRate),
  });
}

// ============================================================================
// Interpretation Helpers
// ============================================================================

function getInterpretation(result: EvaluationResult): string {
  if (result.evalStatus !== 'completed') {
    return `Status: ${result.evalStatus}. Unable to complete evaluation.`;
  }

  const parts: string[] = [];

  // Direction accuracy
  if (result.directionCorrect === true) {
    parts.push('✅ Direction correct');
  } else if (result.directionCorrect === false) {
    parts.push('❌ Direction incorrect');
  }

  // Outcome
  if (result.outcome === 'win') {
    parts.push(`📈 Win (+${result.stockReturnPct?.toFixed(2)}%)`);
  } else if (result.outcome === 'loss') {
    parts.push(`📉 Loss (${result.stockReturnPct?.toFixed(2)}%)`);
  } else {
    parts.push('⚪ Neutral');
  }

  // Stop loss / Take profit
  if (result.firstHit === 'stop_loss') {
    parts.push('🛑 Stop loss triggered');
  } else if (result.firstHit === 'take_profit') {
    parts.push('🎯 Take profit hit');
  }

  // Position recommendation
  if (result.positionRecommendation === 'long') {
    parts.push('Position: Long');
  } else {
    parts.push('Position: Cash');
  }

  return parts.join(' | ');
}

function getSummaryInterpretation(scope: string, windowDays: number): Record<string, string> {
  return {
    overview: `Backtest evaluates ${scope} strategies over ${windowDays} trading days.`,
    winRate: 'Win rate = (wins) / (wins + losses). Excludes neutral outcomes by default.',
    directionAccuracy: 'Percentage of predictions where actual direction matched expected direction.',
    avgReturn: 'Average return across all completed evaluations.',
    riskMetrics: 'Stop loss and take profit rates show how often risk management triggers fires.',
    adviceBreakdown: 'Groups performance by the type of advice given (e.g., "买入" vs "持有").',
  };
}

function getWinRateInterpretation(winRate: number): string {
  if (winRate >= 70) return 'Excellent - Strong winning strategy';
  if (winRate >= 55) return 'Good - Profitable with positive expectancy';
  if (winRate >= 45) return 'Average - Borderline, consider optimization';
  if (winRate >= 30) return 'Below average - Strategy needs improvement';
  return 'Poor - Negative expectancy, review approach';
}

// ============================================================================
// Tool Factories
// ============================================================================

export function createEvaluateTradeTool() {
  return new DynamicStructuredTool({
    name: 'evaluate_trade',
    description: 'Evaluate a single historical trade analysis against forward price data. Calculate win/loss, direction accuracy, and simulate stop-loss/take-profit outcomes.',
    schema: evaluateTradeSchema,
    func: async (params) => handleEvaluateTrade(params),
  });
}

export function createRunBacktestTool() {
  return new DynamicStructuredTool({
    name: 'run_backtest',
    description: 'Run batch backtest on multiple historical trades. Evaluate strategy performance with win rate, direction accuracy, and risk metrics.',
    schema: runBacktestSchema,
    func: async (params) => handleRunBacktest(params),
  });
}

export function createGetBacktestSummaryTool() {
  return new DynamicStructuredTool({
    name: 'get_backtest_summary',
    description: 'Get guidance on backtest summary metrics and interpretation. Learn what win rate, direction accuracy, and risk metrics mean.',
    schema: getBacktestSummarySchema,
    func: async (params) => handleGetSummary(params),
  });
}

export function createCalculateWinRateTool() {
  return new DynamicStructuredTool({
    name: 'calculate_win_rate',
    description: 'Calculate win rate and related statistics from a list of trade outcomes.',
    schema: calculateWinRateSchema,
    func: async (params) => handleCalculateWinRate(params),
  });
}

export const backtestTools = [
  createEvaluateTradeTool(),
  createRunBacktestTool(),
  createGetBacktestSummaryTool(),
  createCalculateWinRateTool(),
];
