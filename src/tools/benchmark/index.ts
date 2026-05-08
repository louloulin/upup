/**
 * Benchmark Comparison Tools
 */

export {
  getAvailableBenchmarks,
  calculateAlpha,
  calculateTrackingError,
  calculateInformationRatio,
  compareToBenchmarks,
  createListBenchmarksTool,
  createCompareBenchmarkTool,
  createCalculateAlphaTool,
  benchmarkTools,
} from './benchmark-tools.js';

export const LIST_BENCHMARKS_DESCRIPTION = `
List available market benchmarks for performance comparison.

## Available Benchmarks
- ^GSPC: S&P 500 (SPX)
- ^IXIC: Nasdaq 100 (NDX)
- 000300: CSI 300 (沪深300)
- ^HSI: Hang Seng Index
- ^DJI: Dow Jones
`.trim();

export const COMPARE_BENCHMARK_DESCRIPTION = `
Compare portfolio performance against market benchmarks to calculate alpha.

## When to Use
- After getting portfolio return
- Measuring investment performance vs market
- Quarterly/annual performance review

## Benchmarks
Provide benchmark symbols and get alpha (excess return) calculation.
`.trim();

export const CALCULATE_ALPHA_DESCRIPTION = `
Calculate portfolio alpha (excess return) relative to a benchmark.

## Alpha Interpretation
- Alpha > 5%: Strong outperformance
- Alpha > 0%: Modest outperformance
- Alpha > -5%: Modest underperformance
- Alpha <= -5%: Significant underperformance

## Info Ratio
Sharpe-like measure of risk-adjusted alpha (tracking error denominator).
`.trim();
