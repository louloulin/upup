import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { calculateWinRate, computeSummary, evaluateTrade, renderFundBacktestReport, runBacktest, runFundBacktest, type BacktestConfig, type BacktestCostModel, type BacktestTrade, type DailyBar, type FundBacktestConfig, type FundNavPoint } from '../src/index.js';

const HOSTS = '__upupPiHosts';
const PACKAGE = '@upup/pi-backtest';
const VERSION = '0.1.0';

function registerHostTools(pi: ExtensionAPI): void {
  const hosts = (globalThis as typeof globalThis & { __upupPiHosts?: ReadonlyMap<string, { packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[]; getToolDefinitions(request: unknown): readonly unknown[] }> })[HOSTS];
  const host = hosts?.get(PACKAGE);
  if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.sessionId || !host.capabilities.includes('tool-definitions')) return;
  for (const tool of host.getToolDefinitions({ contract: 'upup.pi.host.v1', packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions' })) pi.registerTool(tool as never);
}

const bar = Type.Object({ date: Type.String(), high: Type.Optional(Type.Number()), low: Type.Optional(Type.Number()), close: Type.Optional(Type.Number()) });
const trade = Type.Object({ symbol: Type.String(), analysisDate: Type.String(), operationAdvice: Type.Optional(Type.String()), entryPrice: Type.Number({ exclusiveMinimum: 0 }), stopLoss: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), takeProfit: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), quantity: Type.Integer({ minimum: 1 }) });
const costModel = Type.Object({ id: Type.Optional(Type.String({ maxLength: 64 })), commissionBps: Type.Optional(Type.Number({ minimum: 0, maximum: 1000 })), minimumCommission: Type.Optional(Type.Number({ minimum: 0, maximum: 1_000_000 })), stampDutyBps: Type.Optional(Type.Number({ minimum: 0, maximum: 1000 })), applyStampDutyOnSell: Type.Optional(Type.Boolean()), slippageBps: Type.Optional(Type.Number({ minimum: 0, maximum: 1000 })) });
const qualityParameters = { dataQualityMode: Type.Optional(Type.Union([Type.Literal('strict'), Type.Literal('permissive')])), asOfDate: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })), requireTradingDays: Type.Optional(Type.Boolean()), costModel: Type.Optional(costModel) };
const evaluateParameters = Type.Object({ ...trade.properties, forwardBars: Type.Array(bar, { minItems: 1, maxItems: 10000 }), evalWindowDays: Type.Integer({ minimum: 1, maximum: 10000 }), neutralBandPct: Type.Number({ minimum: 0 }), ...qualityParameters });
const batchParameters = Type.Object({ trades: Type.Array(trade, { minItems: 1, maxItems: 1000 }), forwardPriceData: Type.Record(Type.String(), Type.Array(bar)), evalWindowDays: Type.Integer({ minimum: 1, maximum: 10000 }), neutralBandPct: Type.Number({ minimum: 0 }), ...qualityParameters });
const winRateParameters = Type.Object({ outcomes: Type.Array(Type.Union([Type.Literal('win'), Type.Literal('loss'), Type.Literal('neutral')]), { minItems: 1 }), includeNeutral: Type.Boolean() });
const summaryParameters = Type.Object({
  scope: Type.Optional(Type.Union([Type.Literal('overall'), Type.Literal('stock'), Type.Literal('strategy')])),
  symbol: Type.Optional(Type.String()),
  strategyId: Type.Optional(Type.String()),
  evalWindowDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
});
const fundNav = Type.Object({ date: Type.String({ minLength: 10, maxLength: 10 }), nav: Type.Number({ exclusiveMinimum: 0 }) });
const fundBaseParameters = {
  fundCode: Type.String({ minLength: 1, maxLength: 32 }),
  fundName: Type.Optional(Type.String({ maxLength: 128 })),
  startDate: Type.String({ minLength: 10, maxLength: 10 }),
  endDate: Type.String({ minLength: 10, maxLength: 10 }),
  initialAmount: Type.Number({ exclusiveMinimum: 0 }),
  fundType: Type.Optional(Type.String({ maxLength: 32 })),
  history: Type.Array(fundNav, { minItems: 2, maxItems: 10000 }),
};
const fundLumpSumParameters = Type.Object(fundBaseParameters);
const fundDcaParameters = Type.Object({ ...fundBaseParameters, frequency: Type.Union([Type.Literal('weekly'), Type.Literal('monthly')]), amount: Type.Number({ exclusiveMinimum: 0 }), dayOfWeek: Type.Optional(Type.Integer({ minimum: 0, maximum: 6 })), dayOfMonth: Type.Optional(Type.Integer({ minimum: 1, maximum: 31 })) });
const fundThresholdParameters = Type.Object({ ...fundBaseParameters, buyBelowNav: Type.Number({ exclusiveMinimum: 0 }), sellAboveNav: Type.Number({ exclusiveMinimum: 0 }), buyPercent: Type.Number({ minimum: 0, maximum: 1 }), sellPercent: Type.Number({ minimum: 0, maximum: 1 }) });
function audit(id: string, query: string) { return { id: `pi-backtest:${id}`, source: 'upup-fixture://pi-backtest/historical', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-13', query, dataFreshness: 'historical' as const, auditId: id }; }
function nativeEvidence(id: string, query: string, path: string) { const retrievedAt = new Date().toISOString(); return { id: `pi-backtest:${id}:${query}`, source: `upup-pi://backtest/${path}`, retrievedAt, asOf: retrievedAt.slice(0, 10), query, dataFreshness: 'historical' as const, auditId: id }; }
function nativeResult(id: string, query: string, path: string, value: unknown, details: Record<string, unknown> = {}) { const evidence = nativeEvidence(id, query, path); return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: id, ...details } }; }
export default function backtestExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);
  pi.registerTool({ name: 'evaluate_trade', label: 'Evaluate Historical Trade', description: 'Evaluate one historical investment analysis against forward daily bars with explicit stop-loss and take-profit semantics.', parameters: evaluateParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'evaluate_trade request aborted' }], isError: true };
    const config: BacktestConfig = { evalWindowDays: params.evalWindowDays, neutralBandPct: params.neutralBandPct, engineVersion: 'v1', dataQualityMode: params.dataQualityMode ?? 'strict', asOfDate: params.asOfDate, requireTradingDays: params.requireTradingDays, costModel: params.costModel as BacktestCostModel | undefined };
    const result = evaluateTrade(params as BacktestTrade & { forwardBars: DailyBar[] }, params.forwardBars as DailyBar[], config);
    return nativeResult(toolCallId, 'evaluate_trade', 'evaluation', result);
  } });
  pi.registerTool({ name: 'run_backtest', label: 'Run Historical Backtest', description: 'Run a deterministic batch backtest on historical trades and forward price bars, returning individual outcomes and an aggregate summary.', parameters: batchParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'run_backtest request aborted' }], isError: true };
    const result = runBacktest({
      trades: params.trades as BacktestTrade[],
      forwardPriceData: params.forwardPriceData as Record<string, DailyBar[]>,
      evalWindowDays: params.evalWindowDays,
      neutralBandPct: params.neutralBandPct,
      dataQualityMode: params.dataQualityMode ?? 'strict',
      asOfDate: params.asOfDate,
      requireTradingDays: params.requireTradingDays,
      costModel: params.costModel as BacktestCostModel | undefined,
    });
    return nativeResult(toolCallId, 'run_backtest', 'run', result, { summary: result.summary });
  } });
  pi.registerTool({ name: 'get_backtest_summary', label: 'Backtest Summary Guidance', description: 'Explain the meaning and limitations of historical backtest summary metrics without fabricating a result.', parameters: summaryParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'get_backtest_summary request aborted' }], isError: true };
    const result = {
      scope: params.scope ?? 'overall',
      symbol: params.symbol,
      strategyId: params.strategyId,
      evalWindowDays: params.evalWindowDays ?? 30,
      stateless: true,
      note: 'This tool provides metric guidance only. Use run_backtest for historical evaluation results.',
      metrics: {
        winRatePct: 'Completed wins divided by completed wins plus losses; neutrals are excluded unless explicitly included.',
        directionAccuracyPct: 'Completed directional predictions classified as correct.',
        avgStockReturnPct: 'Average forward return across completed evaluations.',
        avgSimulatedReturnPct: 'Return under the configured long-position target and stop-loss simulation.',
        stopLossTriggerRate: 'Share of applicable long evaluations that hit the stop-loss level.',
        takeProfitTriggerRate: 'Share of applicable long evaluations that hit the take-profit level.',
      },
    };
    return nativeResult(toolCallId, 'get_backtest_summary', 'summary', result);
  } });
  pi.registerTool({ name: 'calculate_win_rate', label: 'Calculate Backtest Win Rate', description: 'Calculate win, loss, and neutral rates from historical backtest outcomes.', parameters: winRateParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_win_rate request aborted' }], isError: true };
    return nativeResult(toolCallId, 'calculate_win_rate', 'win-rate', calculateWinRate(params.outcomes, params.includeNeutral));
  } });
  pi.registerTool({ name: 'backtest_lumpsum', label: 'Fund Lump Sum Backtest', description: 'Run a historical fund lump-sum backtest on caller-provided NAV history. No network or synthetic history is used.', parameters: fundLumpSumParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'backtest_lumpsum request aborted' }], isError: true };
    const config: FundBacktestConfig = { fundCode: params.fundCode, ...(params.fundName ? { fundName: params.fundName } : {}), startDate: params.startDate, endDate: params.endDate, initialAmount: params.initialAmount, strategy: 'lump_sum', ...(params.fundType ? { fundType: params.fundType } : {}) };
    const result = runFundBacktest(config, params.history as FundNavPoint[]);
    return nativeResult(toolCallId, 'backtest_lumpsum', 'fund-lump-sum', result, { report: renderFundBacktestReport(result) });
  } });
  pi.registerTool({ name: 'backtest_dca', label: 'Fund DCA Backtest', description: 'Run a historical fund DCA backtest on caller-provided NAV history. No network or synthetic history is used.', parameters: fundDcaParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'backtest_dca request aborted' }], isError: true };
    const config: FundBacktestConfig = { fundCode: params.fundCode, ...(params.fundName ? { fundName: params.fundName } : {}), startDate: params.startDate, endDate: params.endDate, initialAmount: params.initialAmount, strategy: 'dca', ...(params.fundType ? { fundType: params.fundType } : {}), dca: { frequency: params.frequency, amount: params.amount, ...(params.dayOfWeek !== undefined ? { dayOfWeek: params.dayOfWeek } : {}), ...(params.dayOfMonth !== undefined ? { dayOfMonth: params.dayOfMonth } : {}) } };
    const result = runFundBacktest(config, params.history as FundNavPoint[]);
    return nativeResult(toolCallId, 'backtest_dca', 'fund-dca', result, { report: renderFundBacktestReport(result) });
  } });
  pi.registerTool({ name: 'backtest_threshold', label: 'Fund Threshold Backtest', description: 'Run a historical fund threshold backtest on caller-provided NAV history. No network or synthetic history is used.', parameters: fundThresholdParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'backtest_threshold request aborted' }], isError: true };
    const config: FundBacktestConfig = { fundCode: params.fundCode, ...(params.fundName ? { fundName: params.fundName } : {}), startDate: params.startDate, endDate: params.endDate, initialAmount: params.initialAmount, strategy: 'threshold', ...(params.fundType ? { fundType: params.fundType } : {}), threshold: { buyBelowNav: params.buyBelowNav, sellAboveNav: params.sellAboveNav, buyPercent: params.buyPercent, sellPercent: params.sellPercent } };
    const result = runFundBacktest(config, params.history as FundNavPoint[]);
    return nativeResult(toolCallId, 'backtest_threshold', 'fund-threshold', result, { report: renderFundBacktestReport(result) });
  } });
  pi.registerTool({ name: 'backtest_evaluate_trade', label: 'Backtest Evaluate Trade', description: 'Evaluate one historical investment analysis against forward daily bars with explicit stop-loss and take-profit semantics.', parameters: evaluateParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'backtest_evaluate_trade request aborted' }], isError: true };
    const config: BacktestConfig = { evalWindowDays: params.evalWindowDays, neutralBandPct: params.neutralBandPct, engineVersion: 'v1', dataQualityMode: params.dataQualityMode ?? 'strict', asOfDate: params.asOfDate, requireTradingDays: params.requireTradingDays, costModel: params.costModel as BacktestCostModel | undefined };
    const result = evaluateTrade(params as BacktestTrade & { forwardBars: DailyBar[] }, params.forwardBars as DailyBar[], config);
    const evidence = audit(toolCallId, 'backtest_evaluate_trade');
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'backtest_run', label: 'Run Historical Backtest', description: 'Run a deterministic batch backtest over historical trades and forward price bars.', parameters: batchParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'backtest_run request aborted' }], isError: true };
    const config: BacktestConfig = { evalWindowDays: params.evalWindowDays, neutralBandPct: params.neutralBandPct, engineVersion: 'v1', dataQualityMode: params.dataQualityMode ?? 'strict', asOfDate: params.asOfDate, requireTradingDays: params.requireTradingDays, costModel: params.costModel as BacktestCostModel | undefined };
    const results = (params.trades as BacktestTrade[]).map((trade) => evaluateTrade(trade, (params.forwardPriceData[trade.symbol] ?? []) as DailyBar[], config));
    const result = computeSummary(results, 'batch', config.evalWindowDays, config.engineVersion);
    const evidence = audit(toolCallId, 'backtest_run');
    return { content: [{ type: 'text', text: JSON.stringify({ summary: result, results }) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
  pi.registerTool({ name: 'backtest_win_rate', label: 'Backtest Win Rate', description: 'Calculate win, loss, and neutral rates from historical backtest outcomes.', parameters: winRateParameters, async execute(toolCallId, params, signal) {
    if (signal.aborted) return { content: [{ type: 'text', text: 'backtest_win_rate request aborted' }], isError: true };
    const result = calculateWinRate(params.outcomes, params.includeNeutral); const evidence = audit(toolCallId, 'backtest_win_rate');
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
  } });
}
