/**
 * Benchmark Comparison Tools
 *
 * Compare portfolio performance against market benchmarks:
 * - SPX (S&P 500)
 * - CSI300 (沪深300)
 * - NDX (Nasdaq 100)
 * - Relative performance (alpha)
 * - Tracking error
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface BenchmarkReturn {
  symbol: string;
  startPrice: number;
  endPrice: number;
  periodReturn: number; // percentage
}

export interface PortfolioBenchmarkComparison {
  portfolioPnlPercent: number;
  benchmarks: {
    symbol: string;
    name: string;
    return: number;
    alpha: number; // portfolio return - benchmark return
  }[];
  winner: string;
  summary: string;
}

const BENCHMARK_DATA: Record<string, { name: string; approxAnnualReturn: number }> = {
  '^GSPC': { name: 'S&P 500 (SPX)', approxAnnualReturn: 0.10 },
  '^IXIC': { name: 'Nasdaq 100 (NDX)', approxAnnualReturn: 0.15 },
  '000300': { name: 'CSI 300 (沪深300)', approxAnnualReturn: 0.08 },
  '^HSI': { name: 'Hang Seng Index (HSI)', approxAnnualReturn: 0.06 },
  '^DJI': { name: 'Dow Jones (DJI)', approxAnnualReturn: 0.09 },
};

// Average annual volatility by benchmark
const BENCHMARK_VOLATILITY: Record<string, number> = {
  '^GSPC': 0.16,
  '^IXIC': 0.22,
  '000300': 0.20,
  '^HSI': 0.22,
  '^DJI': 0.14,
};

export function getAvailableBenchmarks(): { symbol: string; name: string }[] {
  return Object.entries(BENCHMARK_DATA).map(([symbol, data]) => ({
    symbol,
    name: data.name,
  }));
}

export function calculateAlpha(
  portfolioReturn: number,
  benchmarkReturn: number,
): number {
  return portfolioReturn - benchmarkReturn;
}

export function calculateTrackingError(
  portfolioReturns: number[],
  benchmarkReturns: number[],
): number {
  if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
    return 0;
  }

  const diffs = portfolioReturns.map((p, i) => p - benchmarkReturns[i]);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / diffs.length;
  return Math.sqrt(variance);
}

export function calculateInformationRatio(
  alpha: number,
  trackingError: number,
): number {
  if (trackingError === 0) return 0;
  return alpha / trackingError;
}

export function compareToBenchmarks(
  portfolioPnlPercent: number,
  benchmarkSymbols: string[],
): PortfolioBenchmarkComparison {
  const results: PortfolioBenchmarkComparison['benchmarks'] = [];

  for (const symbol of benchmarkSymbols) {
    const data = BENCHMARK_DATA[symbol];
    if (!data) continue;

    const alpha = calculateAlpha(portfolioPnlPercent, data.approxAnnualReturn * 100);

    results.push({
      symbol,
      name: data.name,
      return: data.approxAnnualReturn * 100,
      alpha,
    });
  }

  // Sort by alpha descending
  results.sort((a, b) => b.alpha - a.alpha);

  const winner = results[0]
    ? results[0].alpha >= 0
      ? `Portfolio outperformed ${results[0].name} by ${results[0].alpha.toFixed(2)}%`
      : `Portfolio underperformed ${results[0].name} by ${Math.abs(results[0].alpha).toFixed(2)}%`
    : 'No benchmark data available';

  const summary = `Portfolio: ${portfolioPnlPercent >= 0 ? '+' : ''}${portfolioPnlPercent.toFixed(2)}% | ${results.map(r => `${r.name}: ${r.return >= 0 ? '+' : ''}${r.return.toFixed(1)}% (α ${r.alpha >= 0 ? '+' : ''}${r.alpha.toFixed(2)}%)`).join(' | ')}`;

  return {
    portfolioPnlPercent,
    benchmarks: results,
    winner,
    summary,
  };
}

// --- Tool Definitions ---

const listBenchmarksSchema = z.object({});

export function createListBenchmarksTool() {
  return new DynamicStructuredTool({
    name: 'list_benchmarks',
    description: 'List available market benchmarks for performance comparison.',
    schema: listBenchmarksSchema,
    func: async () => {
      const benchmarks = getAvailableBenchmarks();
      return JSON.stringify({
        benchmarks,
        count: benchmarks.length,
        message: `Available benchmarks: ${benchmarks.map(b => `${b.symbol} (${b.name})`).join(', ')}`,
      });
    },
  });
}

const compareBenchmarkSchema = z.object({
  portfolioPnlPercent: z.number().describe('Portfolio return as percentage (e.g., 12.5 for 12.5%)'),
  benchmarks: z.array(z.string()).describe('Benchmark symbols to compare against (e.g., ["^GSPC", "000300"])'),
});

export function createCompareBenchmarkTool() {
  return new DynamicStructuredTool({
    name: 'compare_to_benchmark',
    description: 'Compare portfolio performance against market benchmarks to measure alpha.',
    schema: compareBenchmarkSchema,
    func: async ({ portfolioPnlPercent, benchmarks }) => {
      const result = compareToBenchmarks(portfolioPnlPercent, benchmarks);

      const lines = [
        '## Portfolio vs Benchmark Comparison',
        '',
        `**Portfolio Return**: ${portfolioPnlPercent >= 0 ? '+' : ''}${portfolioPnlPercent.toFixed(2)}%`,
        '',
        '| Benchmark | Return | Alpha |',
        '|-----------|--------|-------|',
        ...result.benchmarks.map(b =>
          `| ${b.name} | ${b.return >= 0 ? '+' : ''}${b.return.toFixed(2)}% | ${b.alpha >= 0 ? '+' : ''}${b.alpha.toFixed(2)}% |`
        ),
        '',
        `**${result.winner}**`,
        '',
        `Summary: ${result.summary}`,
      ];

      return lines.join('\n');
    },
  });
}

const calculateAlphaSchema = z.object({
  portfolioReturn: z.number().describe('Portfolio return as percentage'),
  benchmarkSymbol: z.string().describe('Benchmark symbol (e.g., ^GSPC for SPX)'),
});

export function createCalculateAlphaTool() {
  return new DynamicStructuredTool({
    name: 'calculate_alpha',
    description: 'Calculate portfolio alpha (excess return) relative to a benchmark.',
    schema: calculateAlphaSchema,
    func: async ({ portfolioReturn, benchmarkSymbol }) => {
      const data = BENCHMARK_DATA[benchmarkSymbol];
      if (!data) {
        return JSON.stringify({
          error: `Unknown benchmark: ${benchmarkSymbol}`,
          available: Object.keys(BENCHMARK_DATA),
        });
      }

      const benchmarkReturn = data.approxAnnualReturn * 100;
      const alpha = calculateAlpha(portfolioReturn, benchmarkReturn);
      const info = alpha / (BENCHMARK_VOLATILITY[benchmarkSymbol] || 0.2);

      return JSON.stringify({
        portfolioReturn,
        benchmark: data.name,
        benchmarkReturn,
        alpha: Math.round(alpha * 100) / 100,
        interpretation:
          alpha > 5
            ? 'Strong outperformance'
            : alpha > 0
              ? 'Modest outperformance'
              : alpha > -5
                ? 'Modest underperformance'
                : 'Significant underperformance',
        infoRatio: Math.round(info * 100) / 100,
      });
    },
  });
}

// --- Export ---

export const benchmarkTools = [
  createListBenchmarksTool(),
  createCompareBenchmarkTool(),
  createCalculateAlphaTool(),
];
