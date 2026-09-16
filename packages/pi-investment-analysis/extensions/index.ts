import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {registerPiCapabilityHost, resolvePiCapabilityHost, definePiCapabilityHost} from '@upup/pi-capability-registry';
import { calculateDcf, calculateProductionDcf, calculateProductionDdm, calculateTechnicalSignal, calculateQuickTargetPrice, calculateTargetPrice, calculateValuationRatios, comparePeers, calculateOptionPrice, calculateImpliedVolatility, calculateTechnicalIndicators, calculateKdj, calculateBoll, calculateWr, calculateCci, calculateAtr, calculateObv, calculateDecisionDashboard, parseResearchJournalState, queryResearchJournal, runResearchCoordinator, runNativeStockAnalysis, MatrixEngine, toCSV, toMarkdown, DEFAULT_TICKERS_UNIVERSE, DIMENSIONS, DIMENSION_LABELS_ZH, type MatrixCell, type Dimension, type DcfInput, type ProductionDcfInput, type ProductionDdmInput, type PeerComparisonInput, type TargetPriceInput, type ValuationRatiosInput, type OptionPricingInput, type TechnicalBar, type DecisionDashboardInput, type ResearchPhase, type ResearchTaskStatus, type ResearchRole } from '../src/index';

const PACKAGE = '@upup/pi-investment-analysis';
const VERSION = '0.1.0';

function registerHostTools(pi: ExtensionAPI): void {
  registerPiCapabilityHost(pi, PACKAGE, (host) => {
    if (host.packageVersion !== VERSION || !host.sessionId || !host.capabilities.includes('tool-definitions')) return;
    for (const tool of host.providers.tools.getToolDefinitions({ contract: 'upup.pi.host.v1', packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions' })) pi.registerTool(tool as never);
  });
}
const dcfParameters = Type.Object({
  currentFcf: Type.Number({ exclusiveMinimum: 0, description: 'Current free cash flow' }),
  growthRate: Type.Number({ description: 'Annual growth rate as a decimal' }),
  discountRate: Type.Number({ description: 'Discount rate as a decimal' }),
  terminalGrowthRate: Type.Number({ description: 'Terminal growth rate as a decimal' }),
  projectionYears: Type.Integer({ minimum: 1, maximum: 20 }),
  sharesOutstanding: Type.Number({ exclusiveMinimum: 0 }),
});
const technicalSignalParameters = Type.Object({
  bars: Type.Array(Type.Object({ date: Type.String(), close: Type.Number() }), { minItems: 3, maxItems: 200 }),
});
const researchTasksParameters = Type.Object({
  phase: Type.Optional(Type.Union([Type.Literal('research'), Type.Literal('synthesis'), Type.Literal('implementation'), Type.Literal('verification')])),
  status: Type.Optional(Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed'), Type.Literal('failed'), Type.Literal('blocked')])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});
const analyzeSymbolParameters = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
  question: Type.String({ minLength: 1, maxLength: 2_000 }),
  workers: Type.Optional(Type.Array(Type.Union([
    Type.Literal('technical-analysis'), Type.Literal('fundamental-analysis'), Type.Literal('capital-flow'), Type.Literal('sentiment-analysis'),
  ]), { minItems: 1, maxItems: 4 })),
});
const stockAnalysisParameters = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 32 }),
  name: Type.String({ minLength: 1, maxLength: 160 }),
  depth: Type.Optional(Type.Union([Type.Literal('basic'), Type.Literal('detailed'), Type.Literal('comprehensive')])),
});
const productionDcfParameters = Type.Object({
  current_fcf: Type.Number({ description: 'Current annual free cash flow' }),
  growth_rate: Type.Number({ minimum: -0.5, maximum: 1, description: 'Expected annual FCF growth rate' }),
  discount_rate: Type.Number({ minimum: 0.01, maximum: 0.5, description: 'Discount rate / WACC' }),
  terminal_growth_rate: Type.Number({ minimum: 0, maximum: 0.1, description: 'Terminal growth rate' }),
  projection_years: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
  shares_outstanding: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  net_debt: Type.Optional(Type.Number()),
});
const ddmParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  current_dividend: Type.Number({ exclusiveMinimum: 0 }),
  growth_rate: Type.Number({ minimum: -0.5, maximum: 1 }),
  required_return: Type.Number({ exclusiveMinimum: 0, maximum: 1 }),
  terminal_growth_rate: Type.Number({ minimum: -0.5, maximum: 0.5 }),
  projection_years: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  current_price: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
});
const valuationRatiosParameters = Type.Object({
  price: Type.Number({ exclusiveMinimum: 0 }),
  eps: Type.Number(),
  book_value_per_share: Type.Optional(Type.Number()),
  cash_flow_per_share: Type.Optional(Type.Number()),
  shares_outstanding: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  total_equity: Type.Optional(Type.Number()),
  operating_cash_flow: Type.Optional(Type.Number()),
});
const peerMetric = Type.Object({
  name: Type.String({ minLength: 1 }),
  pe_ratio: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  pb_ratio: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  roe: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  revenue_growth: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  profit_margin: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
});
const peerComparisonParameters = Type.Object({ target: peerMetric, peers: Type.Array(peerMetric, { minItems: 1, maxItems: 20 }) });
const targetComponent = Type.Object({ name: Type.String({ minLength: 1 }), value: Type.Number(), weight: Type.Number({ minimum: 0, maximum: 1 }) });
const targetPriceParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }), currentPrice: Type.Number({ exclusiveMinimum: 0 }),
  method: Type.Optional(Type.Union([Type.Literal('dcf'), Type.Literal('pe'), Type.Literal('sotp'), Type.Literal('combined')])),
  currentEps: Type.Optional(Type.Number()), growthRate: Type.Optional(Type.Number()), discountRate: Type.Optional(Type.Number()), terminalGrowthRate: Type.Optional(Type.Number()),
  projectionYears: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })), forwardEps: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), targetPe: Type.Optional(Type.Number()), peYears: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), components: Type.Optional(Type.Array(targetComponent)),
});
const quickTargetPriceParameters = Type.Object({ symbol: Type.String({ minLength: 1 }), currentPrice: Type.Number({ exclusiveMinimum: 0 }), currentEps: Type.Number({ exclusiveMinimum: 0 }), forwardEps: Type.Number({ exclusiveMinimum: 0 }), growthRate: Type.Number() });
const optionParameters = Type.Object({
  spotPrice: Type.Number({ exclusiveMinimum: 0 }),
  strikePrice: Type.Number({ exclusiveMinimum: 0 }),
  timeToExpiry: Type.Number({ exclusiveMinimum: 0, description: 'Time to expiry in calendar days' }),
  riskFreeRate: Type.Number({ description: 'Annual risk-free rate as a decimal' }),
  volatility: Type.Number({ exclusiveMinimum: 0, description: 'Annualized volatility as a decimal' }),
  optionType: Type.Union([Type.Literal('call'), Type.Literal('put')]),
});
const impliedVolatilityParameters = Type.Object({
  marketPrice: Type.Number({ exclusiveMinimum: 0 }),
  spotPrice: Type.Number({ exclusiveMinimum: 0 }),
  strikePrice: Type.Number({ exclusiveMinimum: 0 }),
  timeToExpiry: Type.Number({ exclusiveMinimum: 0 }),
  riskFreeRate: Type.Number(),
  optionType: Type.Union([Type.Literal('call'), Type.Literal('put')]),
});
const technicalBar = Type.Object({ date: Type.String(), open: Type.Number(), high: Type.Number(), low: Type.Number(), close: Type.Number(), volume: Type.Number() });
const technicalParameters = Type.Object({ data: Type.Array(technicalBar, { minItems: 20 }), indicators: Type.Optional(Type.Array(Type.String())) });
const singleTechnicalParameters = Type.Object({ data: Type.Array(technicalBar, { minItems: 20 }) });
const decisionDashboardParameters = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 20 }),
  technical: Type.Optional(Type.Object({
    trend: Type.Optional(Type.Union([Type.Literal('uptrend'), Type.Literal('downtrend'), Type.Literal('sideways')])),
    rsi: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
    macd_signal: Type.Optional(Type.Union([Type.Literal('bullish'), Type.Literal('bearish'), Type.Literal('neutral')])),
    support_distance_pct: Type.Optional(Type.Number()),
  })),
  fundamental: Type.Optional(Type.Object({
    pe_ratio: Type.Optional(Type.Number()), pb_ratio: Type.Optional(Type.Number()), roe: Type.Optional(Type.Number()),
    revenue_growth: Type.Optional(Type.Number()), profit_margin: Type.Optional(Type.Number()),
  })),
  sentiment: Type.Optional(Type.Object({
    news_sentiment: Type.Optional(Type.Union([Type.Literal('positive'), Type.Literal('negative'), Type.Literal('neutral')])),
    analyst_rating: Type.Optional(Type.Union([Type.Literal('strong_buy'), Type.Literal('buy'), Type.Literal('hold'), Type.Literal('sell'), Type.Literal('strong_sell')])),
    social_buzz: Type.Optional(Type.Union([Type.Literal('bullish'), Type.Literal('bearish'), Type.Literal('neutral')])),
  })),
  risk: Type.Optional(Type.Object({
    volatility: Type.Optional(Type.Number()), beta: Type.Optional(Type.Number()), max_drawdown: Type.Optional(Type.Number()), debt_to_equity: Type.Optional(Type.Number()),
  })),
});
const matrixParameters = Type.Object({
  tickers: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 32 }), { minItems: 1, maxItems: 100 })),
  dimensions: Type.Optional(Type.Array(Type.Union([Type.Literal('technical'), Type.Literal('fundamental'), Type.Literal('flow'), Type.Literal('sentiment')]), { minItems: 1, maxItems: 4 })),
  cells: Type.Optional(Type.Array(Type.Object({
    ticker: Type.String({ minLength: 1, maxLength: 32 }),
    dimension: Type.Union([Type.Literal('technical'), Type.Literal('fundamental'), Type.Literal('flow'), Type.Literal('sentiment')]),
    metrics: Type.Record(Type.String(), Type.Union([Type.Number(), Type.String()])),
    verdict: Type.Optional(Type.String()), polarity: Type.Optional(Type.Number({ minimum: -1, maximum: 1 })), confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    sources: Type.Optional(Type.Array(Type.Object({ kind: Type.String(), ref: Type.String(), ts: Type.Optional(Type.String()) }))),
  }), { maxItems: 400 })),
  format: Type.Optional(Type.Union([Type.Literal('json'), Type.Literal('csv'), Type.Literal('markdown')])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 400 })),
});

function nativeEvidence(toolCallId: string) {
  const retrievedAt = new Date().toISOString();
  return { id: `investment-analysis:${toolCallId}:dcf`, source: 'upup-pi://investment-analysis/dcf', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'dcf_model', dataFreshness: 'historical' as const, auditId: toolCallId };
}
function ddmEvidence(toolCallId: string) {
  const retrievedAt = new Date().toISOString();
  return { id: `investment-analysis:${toolCallId}:ddm`, source: 'upup-pi://investment-analysis/ddm', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'ddm_model', dataFreshness: 'historical' as const, auditId: toolCallId };
}

export default function investmentAnalysisExtension(pi: ExtensionAPI): void {
  // Sprint D: self-publish the capability host so the extension is
  // self-contained (resolvable via `resolvePiCapabilityHost` without the
  // agent-session-factory side-channel). Session-level providers still flow
  // through the orchestrator's later publish — both publishers coexist and
  // last-write-wins. The host we publish here is metadata-only.
  definePiCapabilityHost(pi, {
    packageName: PACKAGE,
    packageVersion: VERSION,
        capabilities: ['research-worker', 'tool-definitions'] as readonly string[],
    providers: {},
    register: () => undefined,
  });

  registerHostTools(pi);
  const runtimeHost = resolvePiCapabilityHost<{ packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[]; providers: { workers?: { runResearchWorker?: (request: unknown, signal: AbortSignal | undefined) => Promise<{ role: ResearchRole; output: string; evidence: readonly unknown[]; sessionId?: string }> } } }>(pi.events, PACKAGE, undefined);
  const platformHost = resolvePiCapabilityHost<{ packageName: string; capabilities: readonly string[]; providers: { workers?: { runAgentWorker?: (request: unknown, signal: AbortSignal | undefined) => Promise<{ agentId: string; output: string; sessionId: string }> } } }>(pi.events, '@upup/pi-platform', undefined);
  const RESEARCH_ENTRY = 'upup_pi_research_tasks';
  let researchState = parseResearchJournalState(undefined);
  const readResearchState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }) => {
    const entry = [...(context?.sessionManager?.getEntries() ?? [])].reverse().find((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const value = candidate as { type?: unknown; customType?: unknown };
      return value.type === 'custom' && value.customType === RESEARCH_ENTRY;
    }) as { data?: unknown } | undefined;
    researchState = parseResearchJournalState(entry?.data);
    return researchState;
  };
  if (typeof pi.on === 'function') pi.on('session_start', (_event, context) => { readResearchState(context); });
  pi.registerTool({
    name: 'matrix_analysis',
    label: 'Investment Matrix Analysis',
    description: 'Build a deterministic cross-ticker and cross-dimension investment matrix from explicit cells. This tool does not fetch data or generate investment advice.',
    parameters: matrixParameters,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'matrix_analysis request aborted' }], isError: true, details: { auditId: toolCallId } };
      try {
        const spec = { tickers: params.tickers ?? DEFAULT_TICKERS_UNIVERSE, dimensions: (params.dimensions ?? [...DIMENSIONS]) as Dimension[] };
        const engine = new MatrixEngine(spec);
        const allowedTickers = new Set(spec.tickers);
        const allowedDimensions = new Set(spec.dimensions);
        for (const cell of params.cells ?? []) {
          if (!allowedTickers.has(cell.ticker) || !allowedDimensions.has(cell.dimension as Dimension)) continue;
          engine.setCell({ ticker: cell.ticker, dimension: cell.dimension as Dimension, metrics: cell.metrics, verdict: cell.verdict ?? '', polarity: cell.polarity ?? 0, confidence: cell.confidence ?? 0.5, sources: cell.sources ?? [] } as MatrixCell);
        }
        const result = await engine.build();
        if (params.limit && result.cells.length > params.limit) result.cells = result.cells.slice(0, params.limit);
        const value = params.format === 'csv' ? toCSV(result) : params.format === 'markdown' ? toMarkdown(result) : { spec: result.spec, summary: result.summary, generatedAt: result.generatedAt, cells: result.cells.map((cell) => ({ ...cell, dimensionZh: DIMENSION_LABELS_ZH[cell.dimension] })) };
        return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], details: { auditId: toolCallId, dataFreshness: 'historical', evidence: [{ id: `pi-investment-analysis:${toolCallId}:matrix`, source: 'upup-pi://investment-analysis/matrix', retrievedAt: new Date().toISOString(), asOf: new Date().toISOString().slice(0, 10), query: 'matrix_analysis' }] } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });
  pi.registerTool({
    name: 'stock_analysis',
    label: 'Stock Analysis',
    description: 'Run a Pi-native parallel stock analysis with independent fundamental, financial, and portfolio-advisor workers. Requires the trusted Platform agent-worker capability.',
    parameters: stockAnalysisParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'stock_analysis request aborted' }], isError: true, details: { auditId: toolCallId } };
      if (!platformHost || platformHost.packageName !== '@upup/pi-platform' || !platformHost.capabilities?.includes('agent-worker') || !platformHost.providers.workers?.runAgentWorker) {
        return { content: [{ type: 'text', text: 'agent-worker capability is unavailable; stock_analysis is fail-closed' }], isError: true, details: { auditId: toolCallId, capability: 'agent-worker', policy: 'fail-closed' } };
      }
      try {
        const runWorker = platformHost.providers.workers.runAgentWorker;
        const value = await runNativeStockAnalysis(params, async (request, workerSignal) => {
          const worker = await runWorker(request, workerSignal);
          if (!worker) throw new Error('Pi platform agent worker returned no result; stock_analysis is fail-closed');
          return worker;
        }, signal);
        const manager = context?.sessionManager as { appendCustomEntry?: (customType: string, data?: unknown) => void } | undefined;
        manager?.appendCustomEntry?.('upup_pi_stock_analysis', { schema: 1, toolCallId, value });
        const retrievedAt = new Date().toISOString();
        const evidence = { id: `investment-analysis:${toolCallId}:stock-analysis`, source: 'upup-pi://investment-analysis/stock-analysis', retrievedAt, asOf: retrievedAt.slice(0, 10), query: params.symbol, dataFreshness: 'live' as const, auditId: toolCallId };
        return { content: [{ type: 'text', text: JSON.stringify(value) }], details: { auditId: toolCallId, evidence: [evidence], dataFreshness: 'live', workerSessions: value.workerSessions ?? [], journal: 'pi-session' } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, capability: 'agent-worker' } };
      }
    },
  });
  pi.registerTool({
    name: 'analyze_symbol',
    label: 'Analyze Symbol',
    description: 'Run real Pi-backed parallel technical, fundamental, capital-flow, and sentiment research workers for a symbol. Fails closed when the runtime worker capability is unavailable.',
    parameters: analyzeSymbolParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'analyze_symbol request aborted' }], isError: true, details: { auditId: toolCallId } };
      const host = runtimeHost;
      if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.capabilities.includes('research-worker') || !host.providers.workers?.runResearchWorker) {
        return { content: [{ type: 'text', text: 'research-worker capability is unavailable; analyze_symbol is fail-closed' }], isError: true, details: { auditId: toolCallId, capability: 'research-worker', policy: 'fail-closed' } };
      }
      try {
        const result = await runResearchCoordinator(params.symbol, params.question, host.providers.workers.runResearchWorker as never, { workers: params.workers as ResearchRole[] | undefined, signal });
        const tasks = result.workers.map((worker) => ({ id: `research:${toolCallId}:${worker.role}`, title: `${params.symbol} ${worker.role}`, phase: 'research' as const, status: worker.status === 'completed' ? 'completed' as const : worker.status, assignee: worker.role, notes: worker.error ?? worker.output?.slice(0, 4_000), artifacts: worker.sessionId ? [worker.sessionId] : [], createdAt: worker.startedAt, updatedAt: worker.completedAt ?? worker.startedAt }));
        const manager = context?.sessionManager as { appendCustomEntry?: (customType: string, data?: unknown) => void } | undefined;
        manager?.appendCustomEntry?.(RESEARCH_ENTRY, { schema: 1, tasks });
        const retrievedAt = new Date().toISOString();
        const evidence = { id: `investment-analysis:${toolCallId}:analyze-symbol`, source: 'upup-pi://investment-analysis/analyze-symbol', retrievedAt, asOf: retrievedAt.slice(0, 10), query: params.question, dataFreshness: 'live' as const, auditId: toolCallId };
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { auditId: toolCallId, evidence: [evidence, ...result.evidence], dataFreshness: 'live', workers: result.workers.length, failedWorkers: result.failedWorkers } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId, capability: 'research-worker' } };
      }
    },
  });
  pi.registerTool({
    name: 'list_research_tasks',
    label: 'List Research Tasks',
    description: 'Read the current Pi session research task journal. This tool is read-only and does not access the legacy Coordinator singleton.',
    parameters: researchTasksParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'list_research_tasks request aborted' }], isError: true, details: { auditId: toolCallId } };
      try {
        const state = context ? readResearchState(context) : researchState;
        const result = queryResearchJournal(state, params);
        const retrievedAt = new Date().toISOString();
        const evidence = { id: `investment-analysis:${toolCallId}:research-tasks`, source: 'upup-pi://investment-analysis/research-tasks', retrievedAt, asOf: retrievedAt.slice(0, 10), query: JSON.stringify(params), dataFreshness: 'historical' as const, auditId: toolCallId };
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId, journal: 'pi-session' } };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } };
      }
    },
  });
  pi.registerTool({
    name: 'dcf_model',
    label: 'DCF Model',
    description: 'Calculate a discounted cash flow valuation with explicit assumptions, net debt, and optional per-share value.',
    parameters: productionDcfParameters,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'dcf_model request aborted' }], isError: true, details: undefined };
      const result = calculateProductionDcf(params as ProductionDcfInput);
      const evidence = nativeEvidence(toolCallId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: result.assumptions, auditId: toolCallId } };
    },
  });
  pi.registerTool({ name: 'valuation_ratios', label: 'Valuation Ratios', description: 'Calculate PE, PB, PCF and market capitalization from explicit financial inputs.', parameters: valuationRatiosParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'valuation_ratios request aborted' }], isError: true, details: undefined };
    const result = calculateValuationRatios(params as ValuationRatiosInput);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:valuation-ratios`, source: 'upup-pi://investment-analysis/valuation-ratios', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'valuation_ratios', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'peer_comparison', label: 'Peer Comparison', description: 'Compare target company valuation and operating metrics with a peer set using deterministic statistics.', parameters: peerComparisonParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'peer_comparison request aborted' }], isError: true, details: undefined };
    const result = comparePeers(params as PeerComparisonInput);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:peer-comparison`, source: 'upup-pi://investment-analysis/peer-comparison', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'peer_comparison', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_target_price', label: 'Calculate Target Price', description: 'Calculate a target price using DCF, PE, SOTP, or combined valuation methods.', parameters: targetPriceParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_target_price request aborted' }], isError: true, details: undefined };
    const result = calculateTargetPrice(params as TargetPriceInput);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:target-price`, source: 'upup-pi://investment-analysis/target-price', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'calculate_target_price', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'quick_target_price', label: 'Quick Target Price', description: 'Estimate a target price from current and forward EPS plus growth using a bounded PEG-derived PE multiple.', parameters: quickTargetPriceParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'quick_target_price request aborted' }], isError: true, details: undefined };
    const result = calculateQuickTargetPrice(params);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:quick-target-price`, source: 'upup-pi://investment-analysis/quick-target-price', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'quick_target_price', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_option_price', label: 'Option Price', description: 'Calculate Black-Scholes price and Greeks for a European call or put option.', parameters: optionParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_option_price request aborted' }], isError: true, details: undefined };
    const result = calculateOptionPrice(params as OptionPricingInput);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:option-price`, source: 'upup-pi://investment-analysis/option-price', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'calculate_option_price', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: params, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_option_greeks', label: 'Option Greeks', description: 'Calculate option Greeks using the Black-Scholes model.', parameters: optionParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_option_greeks request aborted' }], isError: true, details: undefined };
    const { price: _price, ...greeks } = calculateOptionPrice(params as OptionPricingInput);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:option-greeks`, source: 'upup-pi://investment-analysis/option-greeks', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'calculate_option_greeks', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(greeks) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: params, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_implied_volatility', label: 'Implied Volatility', description: 'Solve implied volatility from a European option market price using Black-Scholes.', parameters: impliedVolatilityParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_implied_volatility request aborted' }], isError: true, details: undefined };
    const impliedVolatility = calculateImpliedVolatility(params);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:implied-volatility`, source: 'upup-pi://investment-analysis/implied-volatility', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'calculate_implied_volatility', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify({ impliedVolatility }) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: params, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_technical_indicators', label: 'Technical Indicators', description: 'Calculate native KDJ, Bollinger Bands, Williams %R, CCI, ATR, and OBV indicators from historical OHLCV data.', parameters: technicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_technical_indicators request aborted' }], isError: true, details: undefined };
    const result = calculateTechnicalIndicators(params.data as TechnicalBar[], params.indicators);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:technical-indicators`, source: 'upup-pi://investment-analysis/technical-indicators', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_technical_indicators', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: { indicators: params.indicators ?? ['kdj', 'boll', 'wr', 'cci', 'atr', 'obv'] }, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_kdj', label: 'KDJ', description: 'Calculate the native KDJ stochastic oscillator from historical OHLCV data.', parameters: singleTechnicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_kdj request aborted' }], isError: true, details: undefined };
    const result = calculateKdj(params.data as TechnicalBar[]);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:kdj`, source: 'upup-pi://investment-analysis/kdj', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_kdj', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_boll', label: 'Bollinger Bands', description: 'Calculate native Bollinger Bands from historical OHLCV data.', parameters: singleTechnicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_boll request aborted' }], isError: true, details: undefined };
    const result = calculateBoll(params.data as TechnicalBar[]);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:boll`, source: 'upup-pi://investment-analysis/boll', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_boll', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_wr', label: 'Williams %R', description: 'Calculate native Williams %R from historical OHLCV data.', parameters: singleTechnicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_wr request aborted' }], isError: true, details: undefined };
    const result = calculateWr(params.data as TechnicalBar[]);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:wr`, source: 'upup-pi://investment-analysis/wr', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_wr', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_cci', label: 'CCI', description: 'Calculate native Commodity Channel Index from historical OHLCV data.', parameters: singleTechnicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_cci request aborted' }], isError: true, details: undefined };
    const result = calculateCci(params.data as TechnicalBar[]);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:cci`, source: 'upup-pi://investment-analysis/cci', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_cci', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_atr', label: 'ATR', description: 'Calculate native Average True Range from historical OHLCV data.', parameters: singleTechnicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_atr request aborted' }], isError: true, details: undefined };
    const result = calculateAtr(params.data as TechnicalBar[]);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:atr`, source: 'upup-pi://investment-analysis/atr', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_atr', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'calculate_obv', label: 'OBV', description: 'Calculate native On Balance Volume from historical OHLCV data.', parameters: singleTechnicalParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'calculate_obv request aborted' }], isError: true, details: undefined };
    const result = calculateObv(params.data as TechnicalBar[]);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:obv`, source: 'upup-pi://investment-analysis/obv', retrievedAt, asOf: params.data.at(-1)?.date ?? retrievedAt.slice(0, 10), query: 'calculate_obv', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'decision_dashboard', label: 'Decision Dashboard', description: 'Generate a deterministic four-dimension investment decision dashboard from explicit technical, fundamental, sentiment, and risk inputs.', parameters: decisionDashboardParameters, async execute(toolCallId, params, signal, _onUpdate, _ctx) {
    if (signal?.aborted) return { content: [{ type: 'text', text: 'decision_dashboard request aborted' }], isError: true, details: undefined };
    const result = calculateDecisionDashboard(params as DecisionDashboardInput);
    const retrievedAt = new Date().toISOString();
    const evidence = { id: `investment-analysis:${toolCallId}:decision-dashboard`, source: 'upup-pi://investment-analysis/decision-dashboard', retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'decision_dashboard', dataFreshness: 'historical' as const, auditId: toolCallId };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: params, auditId: toolCallId } };
  } });
  pi.registerTool({
    name: 'ddm_model',
    label: 'DDM Model',
    description: 'Calculate a dividend discount valuation with explicit forecast and Gordon-growth assumptions.',
    parameters: ddmParameters,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'ddm_model request aborted' }], isError: true, details: undefined };
      const result = calculateProductionDdm(params as ProductionDdmInput);
      const evidence = ddmEvidence(toolCallId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: result.assumptions, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'investment_dcf',
    label: 'Investment DCF',
    description: 'Calculate a deterministic DCF valuation and expose assumptions for review.',
    parameters: dcfParameters,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'DCF request aborted' }], isError: true, details: undefined };
      const result = calculateDcf(params as DcfInput);
      const evidence = { id: `investment-analysis:${toolCallId}:dcf`, source: 'upup-fixture://investment-analysis/dcf', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-13', query: 'investment_dcf', dataFreshness: 'historical', auditId: toolCallId } as const;
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: result.assumptions, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'investment_technical_signal',
    label: 'Investment technical signal',
    description: 'Classify a deterministic moving-average trend from historical bars.',
    parameters: technicalSignalParameters,
    async execute(toolCallId, params, signal, _onUpdate, _ctx) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'Technical signal request aborted' }], isError: true, details: undefined };
      const result = calculateTechnicalSignal(params.bars);
      const evidence = { id: `investment-analysis:${toolCallId}:technical`, source: 'upup-fixture://investment-analysis/technical', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: params.bars.at(-1)?.date ?? 'unknown', query: 'investment_technical_signal', dataFreshness: 'historical', auditId: toolCallId } as const;
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
    },
  });
}
