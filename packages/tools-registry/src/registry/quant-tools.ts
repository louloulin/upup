/**
 * Quantitative analysis, options, tax, technical indicators,
 * portfolio optimization, data reliability, and correlation tools.
 */

import type { RegisteredTool } from '@upup/./types';
import { computationMetadata } from '@upup/./types';
import {
  createCalculateVaRTool, CALCULATE_VAR_DESCRIPTION,
  createCalculateSharpeTool, CALCULATE_SHARPE_DESCRIPTION,
  createCalculateSortinoTool, CALCULATE_SORTINO_DESCRIPTION,
  createCalculateMaxDrawdownTool, CALCULATE_MAX_DRAWDOWN_DESCRIPTION,
  createCalculateOptionPriceTool, CALCULATE_OPTION_PRICE_DESCRIPTION,
  createCalculateGreeksTool, CALCULATE_GREEKS_DESCRIPTION,
  createCalculateImpliedVolTool, CALCULATE_IMPLIED_VOL_DESCRIPTION,
  createCalculateTaxTool, CALCULATE_TAX_DESCRIPTION,
  createCalculateTradesTaxTool, CALCULATE_TRADES_TAX_DESCRIPTION,
  createCalculatePnLTool, CALCULATE_PNL_DESCRIPTION,
  createCalculateIndicatorsTool, CALCULATE_TECHNICAL_INDICATORS_DESCRIPTION,
  createCalculateKDJTool, CALCULATE_KDJ_DESCRIPTION,
  createCalculateBOLLTool, CALCULATE_BOLL_DESCRIPTION,
  createCalculateKellyTool, CALCULATE_KELLY_DESCRIPTION,
  createCalculateRiskParityTool, CALCULATE_RISK_PARITY_DESCRIPTION,
  createCalculateMeanVarianceTool, CALCULATE_MEAN_VARIANCE_DESCRIPTION,
  createScoreDataSourceTool, SCORE_DATA_SOURCE_DESCRIPTION,
  createCompareDataSourcesTool, COMPARE_DATA_SOURCES_DESCRIPTION,
  createCorrelationMatrixTool, CALCULATE_CORRELATION_MATRIX_DESCRIPTION,
  createCalculateCorrelationTool, CALCULATE_CORRELATION_DESCRIPTION,
} from '@upup/quant/index';

export function loadQuantTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  const quantMetadata = computationMetadata();

  // Risk metrics
  tools.push({ name: 'calculate_var', tool: createCalculateVaRTool(), description: CALCULATE_VAR_DESCRIPTION, compactDescription: 'Calculate Value at Risk (VaR) for portfolio risk assessment', concurrencySafe: true, concurrencyMetadata: quantMetadata });
  tools.push({ name: 'calculate_sharpe', tool: createCalculateSharpeTool(), description: CALCULATE_SHARPE_DESCRIPTION, compactDescription: 'Calculate Sharpe Ratio for risk-adjusted return measurement', concurrencySafe: true });
  tools.push({ name: 'calculate_sortino', tool: createCalculateSortinoTool(), description: CALCULATE_SORTINO_DESCRIPTION, compactDescription: 'Calculate Sortino Ratio for downside risk focus', concurrencySafe: true });
  tools.push({ name: 'calculate_max_drawdown', tool: createCalculateMaxDrawdownTool(), description: CALCULATE_MAX_DRAWDOWN_DESCRIPTION, compactDescription: 'Calculate Maximum Drawdown for worst-case loss measurement', concurrencySafe: true });

  // Options pricing (Black-Scholes)
  tools.push({ name: 'calculate_option_price', tool: createCalculateOptionPriceTool(), description: CALCULATE_OPTION_PRICE_DESCRIPTION, compactDescription: 'Calculate Black-Scholes option price for calls and puts', concurrencySafe: true });
  tools.push({ name: 'calculate_option_greeks', tool: createCalculateGreeksTool(), description: CALCULATE_GREEKS_DESCRIPTION, compactDescription: 'Calculate option Greeks (Delta, Gamma, Theta, Vega, Rho)', concurrencySafe: true });
  tools.push({ name: 'calculate_implied_volatility', tool: createCalculateImpliedVolTool(), description: CALCULATE_IMPLIED_VOL_DESCRIPTION, compactDescription: 'Calculate implied volatility from market option price', concurrencySafe: true });

  // Tax calculation
  tools.push({ name: 'calculate_capital_gains_tax', tool: createCalculateTaxTool(), description: CALCULATE_TAX_DESCRIPTION, compactDescription: 'Estimate capital gains tax for US, China, HK, UK', concurrencySafe: true });
  tools.push({ name: 'calculate_trades_tax', tool: createCalculateTradesTaxTool(), description: CALCULATE_TRADES_TAX_DESCRIPTION, compactDescription: 'Calculate tax for multiple completed trades', concurrencySafe: true });
  tools.push({ name: 'calculate_pnl', tool: createCalculatePnLTool(), description: CALCULATE_PNL_DESCRIPTION, compactDescription: 'Calculate profit and loss for trades', concurrencySafe: true });

  // Technical indicators
  tools.push({ name: 'calculate_technical_indicators', tool: createCalculateIndicatorsTool(), description: CALCULATE_TECHNICAL_INDICATORS_DESCRIPTION, compactDescription: 'Calculate KDJ/BOLL/WR/CCI/ATR/OBV technical indicators from OHLCV data', concurrencySafe: true });
  tools.push({ name: 'calculate_kdj', tool: createCalculateKDJTool(), description: CALCULATE_KDJ_DESCRIPTION, compactDescription: 'Calculate KDJ Stochastic Oscillator from OHLCV', concurrencySafe: true });
  tools.push({ name: 'calculate_boll', tool: createCalculateBOLLTool(), description: CALCULATE_BOLL_DESCRIPTION, compactDescription: 'Calculate Bollinger Bands from OHLCV', concurrencySafe: true });

  // Portfolio optimization
  tools.push({ name: 'calculate_kelly', tool: createCalculateKellyTool(), description: CALCULATE_KELLY_DESCRIPTION, compactDescription: 'Calculate optimal position size using Kelly Criterion', concurrencySafe: true });
  tools.push({ name: 'calculate_risk_parity', tool: createCalculateRiskParityTool(), description: CALCULATE_RISK_PARITY_DESCRIPTION, compactDescription: 'Calculate risk parity portfolio allocation', concurrencySafe: true });
  tools.push({ name: 'calculate_mean_variance', tool: createCalculateMeanVarianceTool(), description: CALCULATE_MEAN_VARIANCE_DESCRIPTION, compactDescription: 'Calculate mean-variance optimized portfolio (tangency)', concurrencySafe: true });

  // Data reliability & correlation
  tools.push({ name: 'score_data_source', tool: createScoreDataSourceTool(), description: SCORE_DATA_SOURCE_DESCRIPTION, compactDescription: 'Score data source reliability with A-F grade (latency/freshness/coverage/accuracy)', concurrencySafe: true });
  tools.push({ name: 'compare_data_sources', tool: createCompareDataSourcesTool(), description: COMPARE_DATA_SOURCES_DESCRIPTION, compactDescription: 'Compare multiple data sources side-by-side with reliability scores', concurrencySafe: true });
  tools.push({ name: 'calculate_correlation_matrix', tool: createCorrelationMatrixTool(), description: CALCULATE_CORRELATION_MATRIX_DESCRIPTION, compactDescription: 'Calculate Pearson correlation matrix for multiple assets', concurrencySafe: true });
  tools.push({ name: 'calculate_correlation', tool: createCalculateCorrelationTool(), description: CALCULATE_CORRELATION_DESCRIPTION, compactDescription: 'Calculate Pearson correlation between two asset return series', concurrencySafe: true });

  return tools;
}
