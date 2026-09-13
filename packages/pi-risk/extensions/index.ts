import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  calculateValueAtRisk,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaxDrawdown,
  calculateKellyCriterion,
  calculateRiskParity,
  calculateMeanVariance,
  calculatePearsonCorrelation,
  calculateReliabilityScore,
  compareDataSources,
  buildCorrelationMatrix,
  getNativeShortInterest,
  calculateNativeShortInterestRatio,
  detectNativeShortSqueeze,
  createRiskTracker,
  type RiskSeverity,
  type RiskType,
  type ValueAtRiskInput,
  type SharpeInput,
  type SortinoInput,
  type MaxDrawdownInput,
  type KellyInput,
  type MeanVarianceInput,
  type RiskParityAsset,
  type SourceMetrics,
  type DataSourceComparisonInput,
} from '../src/index.js';

const HOSTS = '__upupPiHosts';
const PACKAGE = '@upup/pi-risk';
const VERSION = '0.1.0';

function registerHostTools(pi: ExtensionAPI): void {
  const hosts = (globalThis as typeof globalThis & { __upupPiHosts?: ReadonlyMap<string, { packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[]; getToolDefinitions(request: unknown): readonly unknown[] }> })[HOSTS];
  const host = hosts?.get(PACKAGE);
  if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.sessionId || !host.capabilities.includes('tool-definitions')) return;
  for (const tool of host.getToolDefinitions({ contract: 'upup.pi.host.v1', packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions' })) pi.registerTool(tool as never);
}

const varParameters = Type.Object({
  returns: Type.Array(Type.Number(), { minItems: 1, maxItems: 5000, description: 'Historical period returns as decimals (e.g., [0.01, -0.02])' }),
  confidence: Type.Optional(Type.Number({ minimum: 0.5, maximum: 0.99, description: 'Confidence level (0.5 - 0.99, default 0.95)' })),
  method: Type.Optional(Type.Union([Type.Literal('historical'), Type.Literal('parametric')], { description: 'VaR calculation method (default historical)' })),
});

const sharpeParameters = Type.Object({
  returns: Type.Array(Type.Number(), { minItems: 1, maxItems: 5000, description: 'Historical period returns as decimals' }),
  riskFreeRate: Type.Optional(Type.Number({ description: 'Annual risk-free rate as a decimal (default 0.03)' })),
  periodsPerYear: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, description: 'Number of periods per year (default 252)' })),
});

const sortinoParameters = Type.Object({
  returns: Type.Array(Type.Number(), { minItems: 1, maxItems: 5000, description: 'Historical period returns as decimals' }),
  targetReturn: Type.Optional(Type.Number({ description: 'Target return per period (default 0)' })),
  periodsPerYear: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000, description: 'Number of periods per year (default 252)' })),
});

const maxDrawdownParameters = Type.Object({
  prices: Type.Array(Type.Number(), { minItems: 1, maxItems: 50000, description: 'Historical price series in observation order' }),
});
const kellyParameters = Type.Object({
  winRate: Type.Number({ minimum: 0, maximum: 1 }),
  avgWin: Type.Number({ exclusiveMinimum: 0 }),
  avgLoss: Type.Number({ exclusiveMinimum: 0 }),
  capital: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
});
const riskAsset = Type.Object({ symbol: Type.String({ minLength: 1 }), volatility: Type.Number({ exclusiveMinimum: 0 }), expectedReturn: Type.Number() });
const riskParityParameters = Type.Object({ assets: Type.Array(riskAsset, { minItems: 2, maxItems: 20 }) });
const meanVarianceParameters = Type.Object({
  assets: Type.Array(riskAsset, { minItems: 1, maxItems: 20 }),
  correlations: Type.Optional(Type.Array(Type.Array(Type.Number({ minimum: -1, maximum: 1 })))),
  riskFreeRate: Type.Optional(Type.Number({ minimum: 0, maximum: 0.1 })),
});
const sourceMetric = Type.Object({
  source: Type.String({ minLength: 1 }), latency: Type.Number({ minimum: 0 }), freshness: Type.Number({ minimum: 0 }),
  coverage: Type.Number({ minimum: 0, maximum: 100 }), accuracy: Type.Number({ minimum: 0, maximum: 100 }), priceDeviation: Type.Number({ minimum: 0 }),
});
const sourceComparisonParameters = Type.Object({ sources: Type.Array(sourceMetric, { minItems: 1, maxItems: 10 }), preferLowLatency: Type.Optional(Type.Boolean()), preferAccurate: Type.Optional(Type.Boolean()) });
const correlationMatrixParameters = Type.Object({ returns: Type.Record(Type.String(), Type.Array(Type.Number())), symbols: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 20 }) });
const correlationParameters = Type.Object({ asset1Returns: Type.Array(Type.Number(), { minItems: 1 }), asset2Returns: Type.Array(Type.Number(), { minItems: 1 }), asset1Symbol: Type.String({ minLength: 1 }), asset2Symbol: Type.String({ minLength: 1 }) });
const shortInterestParameters = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 20 }), include_squeeze_analysis: Type.Optional(Type.Boolean()) });
const shortInterestRatioParameters = Type.Object({ symbol: Type.String({ minLength: 1, maxLength: 20 }), quantity: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), avg_cost: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) });
const shortSqueezeParameters = Type.Object({ symbols: Type.Array(Type.String({ minLength: 1, maxLength: 20 }), { minItems: 1, maxItems: 20 }), min_short_interest_ratio: Type.Optional(Type.Number({ minimum: 1, maximum: 30 })), min_short_percent_float: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })) });
const trackRiskParameters = Type.Object({
  ticker: Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
  type: Type.Union([Type.Literal('market'), Type.Literal('company'), Type.Literal('sector'), Type.Literal('portfolio')]),
  severity: Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high'), Type.Literal('critical')]),
  title: Type.String({ minLength: 1, maxLength: 160 }),
  description: Type.String({ minLength: 1, maxLength: 4000 }),
  probability: Type.Number({ minimum: 0, maximum: 1 }),
  impact: Type.Number({ minimum: 0, maximum: 1 }),
  mitigation: Type.Optional(Type.String({ maxLength: 2000 })),
});

function nativeEvidence(toolCallId: string, query: string, path: string) {
  const retrievedAt = new Date().toISOString();
  return {
    id: `pi-risk:${toolCallId}:${query}`,
    source: `upup-pi://risk/${path}`,
    retrievedAt,
    asOf: retrievedAt.slice(0, 10),
    query,
    dataFreshness: 'historical' as const,
    auditId: toolCallId,
  };
}

function nativeResult(toolCallId: string, query: string, path: string, value: unknown, details: Record<string, unknown> = {}) {
  const evidence = nativeEvidence(toolCallId, query, path);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId, ...details },
  };
}

export default function riskExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);
  const riskTracker = createRiskTracker();
  pi.registerTool({
    name: 'track_risk',
    label: 'Track Investment Risk',
    description: 'Record an identified investment risk in the current Pi session. This is a session journal, not a live alert or professional investment advice.',
    parameters: trackRiskParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'track_risk request aborted' }], isError: true };
      try {
        const risk = riskTracker.add({
          ticker: params.ticker,
          type: params.type as RiskType,
          severity: params.severity as RiskSeverity,
          title: params.title,
          description: params.description,
          probability: params.probability,
          impact: params.impact,
          mitigation: params.mitigation,
        });
        return nativeResult(toolCallId, 'track_risk', 'risk-tracker', { success: true, risk, trackedCount: riskTracker.list().length }, { journal: 'pi-session' });
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });
  pi.registerTool({
    name: 'calculate_var',
    label: 'Portfolio Value at Risk',
    description: 'Calculate historical or parametric Value at Risk for a return series with auditable assumptions and observations.',
    parameters: varParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_var request aborted' }], isError: true };
      const result = calculateValueAtRisk(params as ValueAtRiskInput);
      return nativeResult(toolCallId, 'calculate_var', 'var', result, { assumptions: result.assumptions });
    },
  });
  pi.registerTool({
    name: 'get_short_interest',
    label: 'Short Interest',
    description: 'Read deterministic historical short-interest and squeeze-risk metrics. This offline fixture is not real-time market data or investment advice.',
    parameters: shortInterestParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'get_short_interest request aborted' }], isError: true };
      const value = getNativeShortInterest(params.symbol);
      const result = params.include_squeeze_analysis === false ? { ...value, squeezeScore: undefined, squeezeRisk: undefined } : value;
      return nativeResult(toolCallId, 'get_short_interest', 'short-interest', result, { assumptions: { includeSqueezeAnalysis: params.include_squeeze_analysis !== false } });
    },
  });
  pi.registerTool({
    name: 'calculate_short_interest_ratio',
    label: 'Short Interest Ratio',
    description: 'Calculate deterministic days-to-cover and optional position squeeze exposure from the historical short-interest fixture.',
    parameters: shortInterestRatioParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_short_interest_ratio request aborted' }], isError: true };
      const result = calculateNativeShortInterestRatio({ symbol: params.symbol, quantity: params.quantity, avgCost: params.avg_cost });
      return nativeResult(toolCallId, 'calculate_short_interest_ratio', 'short-interest-ratio', result);
    },
  });
  pi.registerTool({
    name: 'detect_short_squeeze',
    label: 'Short Squeeze Screening',
    description: 'Screen a bounded symbol set for deterministic historical short-squeeze signals; results are screening evidence only.',
    parameters: shortSqueezeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'detect_short_squeeze request aborted' }], isError: true };
      const result = detectNativeShortSqueeze({ symbols: params.symbols, minShortInterestRatio: params.min_short_interest_ratio, minShortPercentFloat: params.min_short_percent_float });
      return nativeResult(toolCallId, 'detect_short_squeeze', 'short-squeeze', result);
    },
  });

  pi.registerTool({
    name: 'calculate_sharpe',
    label: 'Sharpe Ratio',
    description: 'Calculate annualized Sharpe ratio and classify the rating band (negative, low, good, excellent, zero-volatility).',
    parameters: sharpeParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_sharpe request aborted' }], isError: true };
      const result = calculateSharpeRatio(params as SharpeInput);
      return nativeResult(toolCallId, 'calculate_sharpe', 'sharpe', result, { rating: result.rating });
    },
  });

  pi.registerTool({
    name: 'calculate_sortino',
    label: 'Sortino Ratio',
    description: 'Calculate annualized Sortino ratio using only downside deviation, exposing target return and downside deviation.',
    parameters: sortinoParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_sortino request aborted' }], isError: true };
      const result = calculateSortinoRatio(params as SortinoInput);
      return nativeResult(toolCallId, 'calculate_sortino', 'sortino', result, { rating: result.rating });
    },
  });

  pi.registerTool({
    name: 'calculate_max_drawdown',
    label: 'Maximum Drawdown',
    description: 'Compute the worst peak-to-trough decline of a price series and return peak/trough indices and percentages.',
    parameters: maxDrawdownParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_max_drawdown request aborted' }], isError: true };
      const result = calculateMaxDrawdown(params as MaxDrawdownInput);
      return nativeResult(toolCallId, 'calculate_max_drawdown', 'max-drawdown', result, { peakIndex: result.peakIndex, troughIndex: result.troughIndex });
    },
  });
  pi.registerTool({ name: 'calculate_kelly', label: 'Kelly Criterion', description: 'Calculate full Kelly, half-Kelly, and optional capital position sizing from historical win/loss assumptions.', parameters: kellyParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_kelly request aborted' }], isError: true };
    const result = calculateKellyCriterion(params as KellyInput);
    return nativeResult(toolCallId, 'calculate_kelly', 'kelly', result, { assumptions: { winRate: params.winRate, avgWin: params.avgWin, avgLoss: params.avgLoss } });
  } });
  pi.registerTool({ name: 'calculate_risk_parity', label: 'Risk Parity Allocation', description: 'Calculate inverse-volatility risk parity weights and risk contributions for a bounded asset set.', parameters: riskParityParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_risk_parity request aborted' }], isError: true };
    const result = calculateRiskParity(params.assets as RiskParityAsset[]);
    return nativeResult(toolCallId, 'calculate_risk_parity', 'risk-parity', result);
  } });
  pi.registerTool({ name: 'calculate_mean_variance', label: 'Mean Variance Optimization', description: 'Calculate a deterministic tangency-style portfolio using excess-return to variance scores and an optional correlation matrix.', parameters: meanVarianceParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_mean_variance request aborted' }], isError: true };
    const result = calculateMeanVariance(params as MeanVarianceInput);
    return nativeResult(toolCallId, 'calculate_mean_variance', 'mean-variance', result, { assumptions: { riskFreeRate: result.riskFreeRate } });
  } });
  pi.registerTool({ name: 'score_data_source', label: 'Score Data Source', description: 'Score a market data source from latency, freshness, coverage, accuracy, and price deviation.', parameters: sourceMetric, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'score_data_source request aborted' }], isError: true };
    const result = calculateReliabilityScore(params as SourceMetrics);
    return nativeResult(toolCallId, 'score_data_source', 'data-source-score', result, { source: params.source });
  } });
  pi.registerTool({ name: 'compare_data_sources', label: 'Compare Data Sources', description: 'Rank multiple market data sources by reliability, latency, accuracy, or overall score.', parameters: sourceComparisonParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'compare_data_sources request aborted' }], isError: true };
    const result = compareDataSources(params as DataSourceComparisonInput);
    return nativeResult(toolCallId, 'compare_data_sources', 'data-source-comparison', result);
  } });
  pi.registerTool({ name: 'calculate_correlation_matrix', label: 'Correlation Matrix', description: 'Calculate a deterministic Pearson correlation matrix and diversification interpretation for multiple assets.', parameters: correlationMatrixParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_correlation_matrix request aborted' }], isError: true };
    const result = buildCorrelationMatrix(params.returns, params.symbols);
    return nativeResult(toolCallId, 'calculate_correlation_matrix', 'correlation-matrix', result);
  } });
  pi.registerTool({ name: 'calculate_correlation', label: 'Asset Correlation', description: 'Calculate Pearson correlation and strength between two historical return series.', parameters: correlationParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_correlation request aborted' }], isError: true };
    const result = calculatePearsonCorrelation(params.asset1Returns, params.asset2Returns);
    return nativeResult(toolCallId, 'calculate_correlation', 'correlation', { ...result, pair: `${params.asset1Symbol}/${params.asset2Symbol}` });
  } });
}
