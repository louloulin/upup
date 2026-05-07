/**
 * Quantitative Analysis Tools
 *
 * Exports risk metrics and quantitative analysis tools
 */

export {
  calculateVaR,
  calculateSharpe,
  calculateSortino,
  calculateMaxDrawdown,
  createCalculateVaRTool,
  createCalculateSharpeTool,
  createCalculateSortinoTool,
  createCalculateMaxDrawdownTool,
  quantTools,
} from './risk-metrics.js';

export const CALCULATE_VAR_DESCRIPTION = `
Calculate Value at Risk (VaR) for a portfolio.

## When to Use
- Assessing portfolio risk exposure
- Setting risk limits
- Stress testing

## Usage
Provide an array of historical returns (e.g., [0.01, -0.02, 0.03]).
Specify confidence level (default 95%) and method (historical or parametric).
`.trim();

export const CALCULATE_SHARPE_DESCRIPTION = `
Calculate Sharpe Ratio - risk-adjusted return metric.

## When to Use
- Comparing investment performance
- Evaluating risk-adjusted returns
- Portfolio evaluation

## Interpretation
- < 0: Returns below risk-free rate
- 0-1: Low - insufficient compensation
- 1-2: Good - acceptable returns
- > 2: Excellent - superior returns
`.trim();

export const CALCULATE_SORTINO_DESCRIPTION = `
Calculate Sortino Ratio - downside risk focused metric.

## When to Use
- Asymmetric return distributions
- Downside risk assessment
- Better than Sharpe for skewed returns
`.trim();

export const CALCULATE_MAX_DRAWDOWN_DESCRIPTION = `
Calculate Maximum Drawdown - worst peak-to-trough decline.

## When to Use
- Measuring worst-case historical loss
- Risk evaluation
- Strategy performance assessment
`.trim();
