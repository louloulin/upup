/**
 * ValuationTools - Valuation analysis engine
 *
 * Provides PE/PB/PCF ratio analysis, DCF intrinsic value calculation,
 * and peer comparison tools for investment analysis.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// ============================================================================
// PE/PB/PCF Analysis
// ============================================================================

export const ValuationRatiosSchema = z.object({
  /** Stock price */
  price: z.number().positive().describe('Current stock price'),
  /** Earnings per share */
  eps: z.number().describe('Earnings per share (EPS)'),
  /** Book value per share */
  book_value_per_share: z.number().optional().describe('Book value per share'),
  /** Cash flow per share */
  cash_flow_per_share: z.number().optional().describe('Operating cash flow per share'),
  /** Total shares outstanding */
  shares_outstanding: z.number().positive().optional().describe('Total shares outstanding'),
  /** Total equity */
  total_equity: z.number().positive().optional().describe('Total shareholders equity'),
  /** Operating cash flow */
  operating_cash_flow: z.number().optional().describe('Total operating cash flow'),
});

export type ValuationRatiosInput = z.infer<typeof ValuationRatiosSchema>;

export interface ValuationRatiosResult {
  pe_ratio: number | null;
  pb_ratio: number | null;
  pcf_ratio: number | null;
  market_cap: number | null;
  price: number;
}

export function calculateValuationRatios(input: ValuationRatiosInput): ValuationRatiosResult {
  const { price, eps, book_value_per_share, cash_flow_per_share, shares_outstanding, total_equity, operating_cash_flow } = input;

  // PE Ratio: Price / EPS
  const pe_ratio = eps !== 0 ? price / eps : null;

  // PB Ratio: Price / Book Value per Share
  const bvps = book_value_per_share ?? (shares_outstanding && total_equity ? total_equity / shares_outstanding : null);
  const pb_ratio = bvps && bvps !== 0 ? price / bvps : null;

  // PCF Ratio: Price / Cash Flow per Share
  const cfps = cash_flow_per_share ?? (shares_outstanding && operating_cash_flow ? operating_cash_flow / shares_outstanding : null);
  const pcf_ratio = cfps && cfps !== 0 ? price / cfps : null;

  // Market Cap
  const market_cap = shares_outstanding ? price * shares_outstanding : null;

  return { pe_ratio, pb_ratio, pcf_ratio, market_cap, price };
}

// ============================================================================
// DCF Model
// ============================================================================

export const DcfModelSchema = z.object({
  /** Current free cash flow */
  current_fcf: z.number().describe('Current annual free cash flow'),
  /** Expected annual growth rate (decimal, e.g., 0.08 for 8%) */
  growth_rate: z.number().min(-0.5).max(1).describe('Expected annual FCF growth rate (decimal, e.g., 0.08 for 8%)'),
  /** Discount rate (decimal, e.g., 0.10 for 10%) */
  discount_rate: z.number().min(0.01).max(0.5).describe('Discount rate / WACC (decimal, e.g., 0.10 for 10%)'),
  /** Terminal growth rate (decimal, e.g., 0.03 for 3%) */
  terminal_growth_rate: z.number().min(0).max(0.1).describe('Terminal growth rate (decimal, e.g., 0.03 for 3%)'),
  /** Number of projection years */
  projection_years: z.number().int().min(1).max(30).optional().describe('Number of years to project (default: 10)'),
  /** Total shares outstanding */
  shares_outstanding: z.number().positive().optional().describe('Total shares outstanding'),
  /** Net debt */
  net_debt: z.number().optional().describe('Net debt (debt - cash)'),
});

export type DcfModelInput = z.infer<typeof DcfModelSchema>;

export interface DcfResult {
  intrinsic_value_per_share: number | null;
  enterprise_value: number;
  equity_value: number;
  projected_fcf: number[];
  terminal_value: number;
  pv_of_fcf: number[];
  pv_of_terminal: number;
  shares_outstanding: number | null;
  net_debt: number;
  assumptions: {
    growth_rate: number;
    discount_rate: number;
    terminal_growth_rate: number;
    projection_years: number;
  };
}

export function calculateDCF(input: DcfModelInput): DcfResult {
  const {
    current_fcf,
    growth_rate,
    discount_rate,
    terminal_growth_rate,
    projection_years = 10,
    shares_outstanding,
    net_debt = 0,
  } = input;

  // Project FCFs and discount them
  const projected_fcf: number[] = [];
  const pv_of_fcf: number[] = [];

  let fcf = current_fcf;
  let total_pv_fcf = 0;

  for (let year = 1; year <= projection_years; year++) {
    fcf = fcf * (1 + growth_rate);
    projected_fcf.push(fcf);

    const pv = fcf / Math.pow(1 + discount_rate, year);
    pv_of_fcf.push(pv);
    total_pv_fcf += pv;
  }

  // Terminal value (Gordon Growth Model)
  const terminal_fcf = projected_fcf[projected_fcf.length - 1] * (1 + terminal_growth_rate);
  const terminal_value = terminal_fcf / (discount_rate - terminal_growth_rate);
  const pv_of_terminal = terminal_value / Math.pow(1 + discount_rate, projection_years);

  // Enterprise value
  const enterprise_value = total_pv_fcf + pv_of_terminal;

  // Equity value = Enterprise value - Net debt
  const equity_value = enterprise_value - net_debt;

  // Per share
  const intrinsic_value_per_share = shares_outstanding ? equity_value / shares_outstanding : null;

  return {
    intrinsic_value_per_share,
    enterprise_value,
    equity_value,
    projected_fcf,
    terminal_value,
    pv_of_fcf,
    pv_of_terminal,
    shares_outstanding,
    net_debt,
    assumptions: {
      growth_rate,
      discount_rate,
      terminal_growth_rate,
      projection_years,
    },
  };
}

// ============================================================================
// Peer Comparison
// ============================================================================

export const PeerComparisonSchema = z.object({
  /** Target company metrics */
  target: z.object({
    name: z.string().describe('Company name'),
    pe_ratio: z.number().nullable().optional().describe('PE ratio'),
    pb_ratio: z.number().nullable().optional().describe('PB ratio'),
    roe: z.number().nullable().optional().describe('Return on equity (decimal)'),
    revenue_growth: z.number().nullable().optional().describe('Revenue growth rate (decimal)'),
    profit_margin: z.number().nullable().optional().describe('Profit margin (decimal)'),
  }).describe('Target company metrics'),
  /** Peer company metrics */
  peers: z.array(z.object({
    name: z.string().describe('Peer company name'),
    pe_ratio: z.number().nullable().optional().describe('PE ratio'),
    pb_ratio: z.number().nullable().optional().describe('PB ratio'),
    roe: z.number().nullable().optional().describe('Return on equity (decimal)'),
    revenue_growth: z.number().nullable().optional().describe('Revenue growth rate (decimal)'),
    profit_margin: z.number().nullable().optional().describe('Profit margin (decimal)'),
  })).min(1).max(20).describe('Peer company metrics'),
});

export type PeerComparisonInput = z.infer<typeof PeerComparisonSchema>;

export interface PeerComparisonResult {
  metrics: Record<string, {
    target: number | null;
    peer_avg: number;
    peer_min: number;
    peer_max: number;
    percentile: number | null;
  }>;
  summary: string;
}

function calcPeerStats(
  targetVal: number | null | undefined,
  peerVals: (number | null | undefined)[]
): { target: number | null; peer_avg: number; peer_min: number; peer_max: number; percentile: number | null } {
  const validPeers = peerVals.filter((v): v is number => v != null);
  if (validPeers.length === 0) {
    return { target: targetVal ?? null, peer_avg: 0, peer_min: 0, peer_max: 0, percentile: null };
  }

  const avg = validPeers.reduce((a, b) => a + b, 0) / validPeers.length;
  const min = Math.min(...validPeers);
  const max = Math.max(...validPeers);

  let percentile: number | null = null;
  if (targetVal != null) {
    const below = validPeers.filter(v => v < targetVal).length;
    percentile = (below / validPeers.length) * 100;
  }

  return { target: targetVal ?? null, peer_avg: avg, peer_min: min, peer_max: max, percentile };
}

export function comparePeers(input: PeerComparisonInput): PeerComparisonResult {
  const { target, peers } = input;

  const metrics: PeerComparisonResult['metrics'] = {};

  const metricKeys = ['pe_ratio', 'pb_ratio', 'roe', 'revenue_growth', 'profit_margin'] as const;

  for (const key of metricKeys) {
    const targetVal = target[key as keyof typeof target] as number | null | undefined;
    const peerVals = peers.map(p => p[key as keyof typeof p] as number | null | undefined);
    const stats = calcPeerStats(targetVal, peerVals);
    if (stats.target !== null || stats.peer_avg !== 0) {
      metrics[key] = stats;
    }
  }

  // Summary
  const lines: string[] = [];
  for (const [key, data] of Object.entries(metrics)) {
    if (data.target != null && data.peer_avg > 0) {
      const label = key.replace(/_/g, ' ').toUpperCase();
      const vsAvg = ((data.target - data.peer_avg) / data.peer_avg * 100).toFixed(1);
      const direction = Number(vsAvg) > 0 ? 'above' : 'below';
      lines.push(`${label}: ${data.target.toFixed(2)} (${direction} peer avg by ${Math.abs(Number(vsAvg))}%)`);
    }
  }

  const summary = lines.length > 0
    ? `Peer Comparison Summary:\n${lines.join('\n')}`
    : 'Insufficient data for peer comparison.';

  return { metrics, summary };
}

// ============================================================================
// Tool Descriptions
// ============================================================================

export const VALUATION_RATIOS_DESCRIPTION = `
Calculate valuation ratios (PE, PB, PCF) and market cap from financial data.

Use this when:
- Evaluating whether a stock is overvalued or undervalued
- Comparing valuation multiples
- Quick valuation check before deeper analysis

Returns PE ratio, PB ratio, PCF ratio, and market capitalization.

Examples:
- Calculate from EPS: price: 150, eps: 10
- With full metrics: price: 150, eps: 10, book_value_per_share: 50, cash_flow_per_share: 8`;

export const DCF_MODEL_DESCRIPTION = `
Calculate intrinsic value using a Discounted Cash Flow (DCF) model.

Use this when:
- Estimating a company's fair value
- Making buy/sell decisions based on intrinsic value
- Sensitivity analysis with different growth/discount rates

The DCF projects future free cash flows, calculates a terminal value,
and discounts everything back to present value.

Examples:
- Basic DCF: current_fcf: 5e9, growth_rate: 0.08, discount_rate: 0.10, terminal_growth_rate: 0.03
- With shares: add shares_outstanding and net_debt for per-share value`;

export const PEER_COMPARISON_DESCRIPTION = `
Compare a target company's metrics against industry peers.

Use this when:
- Evaluating relative valuation
- Identifying outliers in an industry
- Finding undervalued stocks in a sector

Returns percentile rankings and deviation from peer averages.

Examples:
- Compare against 3-5 peers with PE, PB, ROE, revenue growth, and profit margin data`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createValuationRatiosTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'valuation_ratios',
    description: VALUATION_RATIOS_DESCRIPTION,
    schema: ValuationRatiosSchema,
    async func(input): Promise<string> {
      const result = calculateValuationRatios(input);

      const lines = ['=== Valuation Ratios ===\n'];
      lines.push(`Price: ${result.price.toFixed(2)}`);

      if (result.pe_ratio !== null) {
        lines.push(`PE Ratio: ${result.pe_ratio.toFixed(2)}`);
      } else {
        lines.push('PE Ratio: N/A (EPS is zero)');
      }

      if (result.pb_ratio !== null) {
        lines.push(`PB Ratio: ${result.pb_ratio.toFixed(2)}`);
      } else {
        lines.push('PB Ratio: N/A');
      }

      if (result.pcf_ratio !== null) {
        lines.push(`PCF Ratio: ${result.pcf_ratio.toFixed(2)}`);
      } else {
        lines.push('PCF Ratio: N/A');
      }

      if (result.market_cap !== null) {
        const mc = result.market_cap;
        if (mc >= 1e12) {
          lines.push(`Market Cap: ${(mc / 1e12).toFixed(2)}T`);
        } else if (mc >= 1e9) {
          lines.push(`Market Cap: ${(mc / 1e9).toFixed(2)}B`);
        } else if (mc >= 1e6) {
          lines.push(`Market Cap: ${(mc / 1e6).toFixed(2)}M`);
        } else {
          lines.push(`Market Cap: ${mc.toFixed(0)}`);
        }
      }

      return lines.join('\n');
    },
  });
}

export function createDCFTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'dcf_model',
    description: DCF_MODEL_DESCRIPTION,
    schema: DcfModelSchema,
    async func(input): Promise<string> {
      const result = calculateDCF(input);

      const fmt = (n: number): string => {
        if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
        if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
        if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
        return n.toFixed(0);
      };

      const lines = [
        '=== DCF Valuation ===',
        '',
        `Assumptions:`,
        `  Growth Rate: ${(result.assumptions.growth_rate * 100).toFixed(1)}%`,
        `  Discount Rate: ${(result.assumptions.discount_rate * 100).toFixed(1)}%`,
        `  Terminal Growth: ${(result.assumptions.terminal_growth_rate * 100).toFixed(1)}%`,
        `  Projection: ${result.assumptions.projection_years} years`,
        '',
        `Results:`,
        `  Enterprise Value: ${fmt(result.enterprise_value)}`,
        `  - Net Debt: ${fmt(result.net_debt)}`,
        `  = Equity Value: ${fmt(result.equity_value)}`,
        `  Terminal Value: ${fmt(result.terminal_value)}`,
        `  PV of Terminal: ${fmt(result.pv_of_terminal)}`,
      ];

      if (result.intrinsic_value_per_share !== null) {
        lines.push(`  Intrinsic Value/Share: ${result.intrinsic_value_per_share.toFixed(2)}`);
      }

      // Show projected FCFs
      lines.push('');
      lines.push('Projected FCF:');
      for (let i = 0; i < Math.min(result.projected_fcf.length, 5); i++) {
        lines.push(`  Year ${i + 1}: ${fmt(result.projected_fcf[i])} (PV: ${fmt(result.pv_of_fcf[i])})`);
      }
      if (result.projected_fcf.length > 5) {
        lines.push(`  ... and ${result.projected_fcf.length - 5} more years`);
      }

      return lines.join('\n');
    },
  });
}

export function createPeerComparisonTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'peer_comparison',
    description: PEER_COMPARISON_DESCRIPTION,
    schema: PeerComparisonSchema,
    async func(input): Promise<string> {
      const result = comparePeers(input);

      const lines = [
        `=== Peer Comparison: ${input.target.name} ===`,
        `Peers: ${input.peers.map(p => p.name).join(', ')}`,
        '',
      ];

      for (const [key, data] of Object.entries(result.metrics)) {
        const label = key.replace(/_/g, ' ').toUpperCase();
        lines.push(`${label}:`);
        if (data.target !== null) {
          lines.push(`  Target: ${data.target.toFixed(4)}`);
        }
        lines.push(`  Peer Avg: ${data.peer_avg.toFixed(4)}`);
        lines.push(`  Peer Range: ${data.peer_min.toFixed(4)} - ${data.peer_max.toFixed(4)}`);
        if (data.percentile !== null) {
          lines.push(`  Percentile: ${data.percentile.toFixed(1)}th`);
        }
        lines.push('');
      }

      lines.push(result.summary);

      return lines.join('\n');
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
