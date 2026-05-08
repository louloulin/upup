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

export {
  blackScholes,
  impliedVolatility,
  createCalculateOptionPriceTool,
  createCalculateGreeksTool,
  createCalculateImpliedVolTool,
  optionsTools,
} from './options-pricing.js';

export {
  CALCULATE_OPTION_PRICE_DESCRIPTION,
  CALCULATE_GREEKS_DESCRIPTION,
  CALCULATE_IMPLIED_VOL_DESCRIPTION,
} from './options/index.js';

export {
  calculateTax,
  createCalculateTaxTool,
  createCalculateTradesTaxTool,
  createCalculatePnLTool,
  taxTools,
} from './tax-calculator.js';

export {
  createCalculateIndicatorsTool,
  createCalculateKDJTool,
  createCalculateBOLLTool,
  technicalIndicatorTools,
} from './technical-indicators.js';

export {
  createCalculateKellyTool,
  createCalculateRiskParityTool,
  createCalculateMeanVarianceTool,
  portfolioOptimizationTools,
} from './portfolio-optimization.js';

export {
  createScoreDataSourceTool,
  createCompareDataSourcesTool,
  createCorrelationMatrixTool,
  createCalculateCorrelationTool,
  reliabilityTools,
  SCORE_DATA_SOURCE_DESCRIPTION,
  COMPARE_DATA_SOURCES_DESCRIPTION,
  CALCULATE_CORRELATION_MATRIX_DESCRIPTION,
  CALCULATE_CORRELATION_DESCRIPTION,
} from './data-reliability.js';

export const CALCULATE_TAX_DESCRIPTION = `
Estimate capital gains tax for stock positions.

## Supported Jurisdictions
- US: Short-term (up to 37%) / Long-term (20%)
- China: 20% flat rate
- Hong Kong: 0% (no CGT)
- UK: 20% / 10% / 20%

## When to Use
- Before selling positions
- Tax planning
- Year-end tax review
`.trim();

export const CALCULATE_TRADES_TAX_DESCRIPTION = `
Calculate capital gains tax for multiple completed trades.

## When to Use
- End of year tax reporting
- Portfolio tax review
- Tax loss harvesting analysis
`.trim();

export const CALCULATE_PNL_DESCRIPTION = `
Calculate profit and loss for completed trades.

## When to Use
- Performance tracking
- Trade journaling
- Simple P&L without tax
`.trim();

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

export const CALCULATE_TECHNICAL_INDICATORS_DESCRIPTION = `
Calculate technical indicators from OHLCV data.

## Indicators
- KDJ: Stochastic Oscillator (K, D, J values)
- BOLL: Bollinger Bands (upper, middle, lower, bandwidth)
- WR: Williams %R (-100 to 0 range)
- CCI: Commodity Channel Index
- ATR: Average True Range (volatility)
- OBV: On Balance Volume (accumulation/distribution)

## When to Use
- Technical analysis
- Entry/exit timing
- Volatility assessment
- Volume analysis
`.trim();

export const CALCULATE_KDJ_DESCRIPTION = `
Calculate KDJ (Stochastic Oscillator) indicator.

## Values
- K: Fast stochastic (0-100)
- D: Slow stochastic (smoothed K)
- J: 3K - 2D (sensitivity line)

## Signals
- K/D > 80: Overbought
- K/D < 20: Oversold
- K crosses above D: Buy signal
- K crosses below D: Sell signal
`.trim();

export const CALCULATE_BOLL_DESCRIPTION = `
Calculate Bollinger Bands from OHLCV data.

## Values
- Upper: SMA + 2*StdDev
- Middle: Simple Moving Average
- Lower: SMA - 2*StdDev
- Bandwidth: (Upper - Lower) / Middle
- %B: Position within bands (0-100)

## Signals
- Price above upper: Overbought
- Price below lower: Oversold
- Squeeze (low bandwidth): Breakout imminent
`.trim();

export const CALCULATE_KELLY_DESCRIPTION = `
Calculate optimal position size using Kelly Criterion.

## Formula
Kelly % = W - [(1-W) / (AvgWin/AvgLoss)]

## When to Use
- Position sizing for individual trades
- Bankroll management
- Risk management

## Returns
- Full Kelly: Theoretically optimal
- Half-Kelly: Safer, recommended for practice
`.trim();

export const CALCULATE_RISK_PARITY_DESCRIPTION = `
Calculate risk parity portfolio allocation.

## Method
Each asset weighted inversely to its volatility.
Lower volatility assets get higher weights.

## When to Use
- Diversified portfolio construction
- Equal risk contribution allocation
`.trim();

export const CALCULATE_MEAN_VARIANCE_DESCRIPTION = `
Calculate mean-variance optimized portfolio (tangency portfolio).

## Method
Maximizes Sharpe ratio given expected returns and volatilities.
Returns optimal weights for maximum risk-adjusted return.

## When to Use
- Portfolio construction
- Asset allocation optimization
- Comparing investment strategies
`.trim();
