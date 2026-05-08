/**
 * Backtest Tools
 *
 * Exports backtesting tools for investment strategy evaluation
 */

export {
  BacktestEngine,
  type DailyBar,
  type EvaluationConfig,
  type EvaluationResult,
  type BacktestSummary,
  type BacktestTrade,
} from './backtest-engine.js';

export {
  createEvaluateTradeTool,
  createRunBacktestTool,
  createGetBacktestSummaryTool,
  createCalculateWinRateTool,
  backtestTools,
} from './backtest-tools.js';

export const EVALUATE_TRADE_DESCRIPTION = `
Evaluate a single historical trade analysis against forward price data.

## What It Does
- Calculates actual return vs expected direction
- Evaluates stop-loss and take-profit hit rates
- Determines win/loss/neutral outcome

## Input Required
- Historical trade details (entry price, date, advice)
- Forward price bars (OHLC data)
- Optional stop-loss and take-profit levels

## Output
- Win/loss classification
- Direction accuracy
- Simulated exit price and reason
- P&L calculation

## When to Use
- After collecting historical analyses
- Strategy performance evaluation
- Risk management assessment
`.trim();

export const RUN_BACKTEST_DESCRIPTION = `
Run batch backtest on multiple historical trades.

## What It Does
- Evaluates all trades in one call
- Computes aggregate performance metrics
- Groups results by advice type

## Metrics
- Win rate (excluding neutrals)
- Direction accuracy percentage
- Average return
- Stop-loss / take-profit trigger rates

## When to Use
- Strategy validation
- Historical performance review
- Comparing multiple time periods
`.trim();

export const GET_BACKTEST_SUMMARY_DESCRIPTION = `
Get guidance on interpreting backtest summary metrics.

## Metrics Explained
- Win Rate: % of trades beyond neutral band in expected direction
- Direction Accuracy: % of correct directional predictions
- Avg Return: Mean return across evaluated trades
- Stop Loss Rate: % of long positions stopped out
- Take Profit Rate: % of long positions hitting target

## Interpretation Guide
- > 60% win rate: Strong strategy
- 45-60%: Average, room for improvement
- < 45%: Weak, needs review
`.trim();

export const CALCULATE_WIN_RATE_DESCRIPTION = `
Calculate win rate from trade outcomes.

## Input
- Array of outcomes: 'win', 'loss', 'neutral'

## Options
- Include neutral: Count neutrals in denominator

## Interpretation
- > 70%: Excellent
- 55-70%: Good
- 45-55%: Average
- < 45%: Poor
`.trim();
