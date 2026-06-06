/**
 * Portfolio attribution tool registration.
 *
 * Tools:
 *  - portfolio_attribution (computation - Brinson / Style / Sector / Combined)
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/portfolio-attribution
 * Design: docs/superpowers/specs/2026-06-04-top-tier-investment-assistant-v2-design.md D19
 */

import { tool } from 'langchain';
import { z } from 'zod';
import { attribution } from './portfolio/attribution.js';
import type { PortfolioLike as Portfolio, BenchmarkLike as Benchmark } from './types';
import { computationMetadata } from './types.js';
import type { RegisteredTool } from './types.js';

const HoldingSchema = z.object({
  sector: z.string().describe('Sector / industry key (e.g. shenwan-l1: 食品饮料)'),
  weight: z.number().describe('Weight 0..1 (or 0..100, see normalize in impl)'),
  return: z.number().describe('Period return as decimal (0.05 = +5%)'),
});

const PortfolioSchema = z.object({
  totalReturn: z.number().describe('Period total return as decimal (informational; recomputed from holdings)'),
  holdings: z.array(HoldingSchema),
});

const StyleExposuresSchema = z.object({
  portfolioExposures: z.object({
    Size: z.number(), Value: z.number(), Momentum: z.number(), Volatility: z.number(),
  }),
  benchmarkExposures: z.object({
    Size: z.number(), Value: z.number(), Momentum: z.number(), Volatility: z.number(),
  }),
  factorReturns: z.object({
    Size: z.number(), Value: z.number(), Momentum: z.number(), Volatility: z.number(),
  }),
});

export function loadPortfolioTools(): RegisteredTool[] {
  const compute = computationMetadata();

  const portfolioAttribution = tool(
    async (params) => {
      const portfolio: Portfolio = params.portfolio;
      const benchmark: Benchmark = params.benchmark;
      // Cast to attribution's input union: Zod runtime validation already
      // enforced shape, attribution() narrows on method internally.
      const result = attribution({
        method: params.method,
        portfolio,
        benchmark,
        sectorClassification: params.sectorClassification ?? 'shenwan-l1',
        style: params.style,
      } as Parameters<typeof attribution>[0]);
      return JSON.stringify(result);
    },
    {
      name: 'portfolio_attribution',
      description:
        "Decompose a portfolio's active return into Brinson 3-factor, Barra-style 4-factor, " +
        'or per-sector contributions. Methods: brinson | style | sector | combined. ' +
        'Math identities (allocation + selection + interaction = active return; sector sum = active return; ' +
        'style sum + residual = active return) are guaranteed by recomputing active return from weighted holdings.',
      schema: z.object({
        method: z.enum(['brinson', 'style', 'sector', 'combined']),
        portfolio: PortfolioSchema,
        benchmark: PortfolioSchema,
        sectorClassification: z.enum(['shenwan-l1', 'gics-l2']).optional(),
        style: StyleExposuresSchema.optional(),
      }),
    },
  );

  return [
    {
      name: 'portfolio_attribution',
      tool: portfolioAttribution,
      description:
        'Decompose a portfolio\'s active return into Brinson 3-factor (allocation/selection/interaction), ' +
        'Barra-style 4-factor (Size/Value/Momentum/Volatility), or per-sector contributions (申万一级 / GICS L2). ' +
        'Supports combined mode that returns all three in one response.',
      compactDescription: '组合归因(Brinson/Barra/行业)',
      concurrencySafe: true,
      concurrencyMetadata: compute,
    },
  ];
}
