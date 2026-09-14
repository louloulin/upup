import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const HOSTS = '__upupPiHosts';
const PACKAGE = '@upup/pi-quant';
const VERSION = '0.1.0';

interface PiHostRegistration {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly string[];
}

function registerHostTools(pi: ExtensionAPI): void {
  const hosts = (globalThis as typeof globalThis & { __upupPiHosts?: ReadonlyMap<string, PiHostRegistration> })[HOSTS];
  const host = hosts?.get(PACKAGE);
  if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.sessionId) return;
}

import {
  computeAllFactors,
  computeFactor,
  computeICSeries,
  createDryRunUniverse,
  dryRunEvidence,
  equalWeightWeights,
  factorReturns,
  maxDrawdown,
  orthogonalize,
  rebalanceDates,
  regress,
  runFactorBacktest,
  scoreUniverse,
  zscore,
  type FactorBar,
  type FactorSignalSeries,
  type UniverseBarSeries,
} from '../src/index.js';

const symbolParam = Type.String({ minLength: 1, maxLength: 24 });
const factorIdParam = Type.String({ minLength: 1, maxLength: 64 });

function text(value: unknown): string { return JSON.stringify(value, null, 2); }

function evidenceEnvelope<T>(payload: T): T & { evidence: { source: string; dataFreshness: 'offline' } } {
  return { ...payload, evidence: dryRunEvidence() };
}

const barSchema = Type.Object({
  date: Type.String(),
  close: Type.Number(),
  open: Type.Optional(Type.Number()),
  high: Type.Optional(Type.Number()),
  low: Type.Optional(Type.Number()),
  volume: Type.Optional(Type.Number()),
  fundamental: Type.Optional(Type.Object({
    pe: Type.Optional(Type.Number()),
    pb: Type.Optional(Type.Number()),
    ps: Type.Optional(Type.Number()),
    roe: Type.Optional(Type.Number()),
    earningsYield: Type.Optional(Type.Number()),
    marketCap: Type.Optional(Type.Number()),
    revenueGrowth: Type.Optional(Type.Number()),
    earningsGrowth: Type.Optional(Type.Number()),
    grossMargin: Type.Optional(Type.Number()),
    debtToEquity: Type.Optional(Type.Number()),
    currentRatio: Type.Optional(Type.Number()),
  })),
});

export default function quantExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);

  pi.registerTool({
    name: 'quant_factor_library',
    label: 'List factor library',
    description: 'List the 20+ alpha factors available in the quant library, organized by category (momentum/value/quality/volatility/size/growth/liquidity).',
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: 'Filter by category: momentum / value / quality / volatility / size / growth / liquidity' })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_library aborted' }], isError: true };
      const { FACTOR_LIBRARY } = await import('../src/factors.js');
      const filtered = params.category
        ? FACTOR_LIBRARY.filter((f) => f.category === params.category)
        : FACTOR_LIBRARY;
      const value = evidenceEnvelope({ count: filtered.length, factors: filtered });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, count: filtered.length },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_compute',
    label: 'Compute factors for a symbol',
    description: 'Compute one or all factor values for a symbol from a bar series (with optional fundamentals). Returns per-factor value + direction.',
    parameters: Type.Object({
      symbol: symbolParam,
      bars: Type.Array(barSchema, { minItems: 1, maxItems: 5000 }),
      factorIds: Type.Optional(Type.Array(factorIdParam, { description: 'Subset of factor ids; default = all' })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_compute aborted' }], isError: true };
      const facs = computeAllFactors(params.bars as readonly FactorBar[], params.factorIds);
      const lastDate = params.bars[params.bars.length - 1].date;
      const out: { factorId: string; value: number }[] = [];
      for (const [id, v] of facs.entries()) out.push({ factorId: id, value: v });
      const value = evidenceEnvelope({ symbol: params.symbol, date: lastDate, count: out.length, factors: out });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol, count: out.length },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_normalize',
    label: 'Normalize factor values',
    description: 'Normalize a list of factor values using z-score / rank / winsorize-zscore / min-max.',
    parameters: Type.Object({
      values: Type.Array(Type.Number(), { minItems: 1 }),
      method: Type.Union([
        Type.Literal('zscore'),
        Type.Literal('rank'),
        Type.Literal('winsorize-zscore'),
        Type.Literal('minmax'),
      ]),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_normalize aborted' }], isError: true };
      const { normalize } = await import('../src/normalize.js');
      const out = normalize(params.values, params.method);
      const value = evidenceEnvelope({ method: params.method, count: out.length, normalized: out });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, method: params.method },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_ic',
    label: 'Compute factor IC series',
    description: 'Compute Information Coefficient (IC) time series between factor values and forward returns across the universe. Returns mean / std / IR plus the per-period series.',
    parameters: Type.Object({
      factorId: factorIdParam,
      dates: Type.Array(Type.String(), { minItems: 1 }),
      factorValuesByDate: Type.Array(Type.Array(Type.Number()), { minItems: 1 }),
      forwardReturnsByDate: Type.Array(Type.Array(Type.Number()), { minItems: 1 }),
      method: Type.Optional(Type.Union([Type.Literal('pearson'), Type.Literal('spearman')])),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_ic aborted' }], isError: true };
      const result = computeICSeries(
        params.factorValuesByDate,
        params.forwardReturnsByDate,
        params.dates,
        params.method ?? 'spearman',
      );
      const out = { ...result, factorId: params.factorId };
      const value = evidenceEnvelope(out);
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, factorId: params.factorId },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_returns',
    label: 'Factor quintile returns',
    description: 'Compute long / short / long-short returns for a factor given top-quintile and bottom-quintile per-period returns.',
    parameters: Type.Object({
      factorId: factorIdParam,
      dates: Type.Array(Type.String(), { minItems: 1 }),
      topQuintileReturns: Type.Array(Type.Array(Type.Number()), { minItems: 1 }),
      bottomQuintileReturns: Type.Array(Type.Array(Type.Number()), { minItems: 1 }),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_returns aborted' }], isError: true };
      const out = factorReturns(params.topQuintileReturns, params.bottomQuintileReturns, params.dates);
      out.long.factorId = params.factorId;
      out.short.factorId = params.factorId;
      out.longShort.factorId = params.factorId;
      const value = evidenceEnvelope(out);
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, factorId: params.factorId },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_orthogonalize',
    label: 'Orthogonalize factor vs reference',
    description: 'Run OLS regression of target factor on reference factors and return residuals (industry-neutralized factor).',
    parameters: Type.Object({
      target: Type.Array(Type.Number(), { minItems: 2 }),
      referenceFactors: Type.Array(Type.Array(Type.Number()), { minItems: 0 }),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_orthogonalize aborted' }], isError: true };
      const result = regress(params.target, params.referenceFactors);
      const value = evidenceEnvelope({
        intercept: result.intercept,
        coefficients: result.coefficients,
        rSquared: result.rSquared,
        residuals: result.residuals,
        orthogonalized: orthogonalize(params.target, params.referenceFactors),
      });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, n: params.target.length },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_score',
    label: 'Combine factors into alpha score',
    description: 'Combine multiple factor values for a universe into a single alpha score, with z-score normalization and rank output.',
    parameters: Type.Object({
      date: Type.String(),
      symbols: Type.Array(symbolParam, { minItems: 1 }),
      factorMatrix: Type.Object({
        valuesBySymbol: Type.Array(Type.Object({
          symbol: symbolParam,
          factors: Type.Array(Type.Object({
            factorId: factorIdParam,
            value: Type.Number(),
          })),
        })),
      }),
      weights: Type.Optional(Type.Array(Type.Object({
        factorId: factorIdParam,
        weight: Type.Number(),
      }))),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_score aborted' }], isError: true };
      const matrix = new Map<string, ReadonlyMap<string, number>>();
      for (const entry of params.factorMatrix.valuesBySymbol) {
        const facs = new Map<string, number>();
        for (const f of entry.factors) facs.set(f.factorId, f.value);
        matrix.set(entry.symbol, facs);
      }
      const factorIds = [...new Set(params.factorMatrix.valuesBySymbol.flatMap((e) => e.factors.map((f) => f.factorId)))];
      const weights = params.weights ?? equalWeightWeights(factorIds);
      const scores = scoreUniverse(params.symbols, matrix, weights, params.date);
      const value = evidenceEnvelope({ date: params.date, count: scores.length, scores });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, count: scores.length },
      };
    },
  });

  pi.registerTool({
    name: 'quant_factor_backtest',
    label: 'Factor backtest',
    description: 'Run a long / long-short backtest using factor signals on a universe of price bars, with daily / weekly / monthly rebalance and configurable top/bottom N.',
    parameters: Type.Object({
      factorId: factorIdParam,
      startDate: Type.String(),
      endDate: Type.String(),
      rebalanceFreq: Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')]),
      topN: Type.Integer({ minimum: 1, maximum: 1000 }),
      bottomN: Type.Integer({ minimum: 0, maximum: 1000 }),
      longShort: Type.Boolean(),
      signals: Type.Array(Type.Object({
        date: Type.String(),
        factorValues: Type.Array(Type.Object({
          symbol: symbolParam,
          value: Type.Number(),
        })),
      }), { minItems: 0 }),
      prices: Type.Array(Type.Object({
        date: Type.String(),
        symbolPrices: Type.Array(Type.Object({
          symbol: symbolParam,
          price: Type.Number(),
        })),
      }), { minItems: 1 }),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'quant_factor_backtest aborted' }], isError: true };
      const signals: FactorSignalSeries[] = params.signals.map((s) => {
        const fv = new Map<string, number>();
        for (const e of s.factorValues) fv.set(e.symbol, e.value);
        return { date: s.date, factorValues: fv };
      });
      const prices: UniverseBarSeries[] = params.prices.map((p) => {
        const sp = new Map<string, number>();
        for (const e of p.symbolPrices) sp.set(e.symbol, e.price);
        return { date: p.date, symbolPrices: sp };
      });
      const result = runFactorBacktest(params.factorId, signals, prices, {
        startDate: params.startDate,
        endDate: params.endDate,
        rebalanceFreq: params.rebalanceFreq,
        topN: params.topN,
        bottomN: params.bottomN,
        longShort: params.longShort,
      });
      const maxDD = result.maxDrawdown;
      const value = evidenceEnvelope({
        factorId: result.factorId,
        longReturn: result.longReturn,
        shortReturn: result.shortReturn,
        longShortReturn: result.longShortReturn,
        sharpe: result.sharpe,
        maxDrawdown: maxDD,
        turnover: result.turnover,
        equityPoints: result.equity.length,
      });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, factorId: params.factorId },
      };
    },
  });
}

// Surface helper exports for the bundle audit in check:pi-packages.
export const _rebalanceDates = rebalanceDates;
export const _maxDrawdown = maxDrawdown;
export const _computeFactor = computeFactor;
export const _zscore = zscore;
export const _createDryRunUniverse = createDryRunUniverse;
