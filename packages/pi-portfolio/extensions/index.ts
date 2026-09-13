import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  calculateBrinsonAttribution,
  calculatePortfolioAttribution,
  calculateSectorAttribution,
  calculateStyleAttribution,
  type PortfolioBook,
  type StyleAttributionInput,
  type PortfolioAttributionInput,
  listBenchmarks,
  comparePortfolioToBenchmarks,
  calculateBenchmarkAlpha,
  convertCurrencyAmount,
  listCurrencies,
  getCurrencyRate,
  addPortfolioPosition,
  updatePortfolioPosition,
  removePortfolioPosition,
  calculatePortfolioReport,
  createInitialPortfolioState,
  type PortfolioState,
  createInitialMultiPortfolioState,
  listMultiPortfolios,
  createMultiPortfolio,
  deleteMultiPortfolio,
  switchMultiPortfolio,
  addMultiPortfolioPosition,
  removeMultiPortfolioPosition,
  calculateMultiPortfolioReport,
  type MultiPortfolioState,
  exportPortfolioState,
} from '../src/index.js';
import { DuckDBClient } from '../src/duckdb.js';

const HOSTS = '__upupPiHosts';
const PACKAGE = '@upup/pi-portfolio';
const VERSION = '0.1.0';

function registerHostTools(pi: ExtensionAPI): void {
  const hosts = (globalThis as typeof globalThis & { __upupPiHosts?: ReadonlyMap<string, { packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[]; getToolDefinitions(request: unknown): readonly unknown[] }> })[HOSTS];
  const host = hosts?.get(PACKAGE);
  if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.sessionId || !host.capabilities.includes('tool-definitions')) return;
  for (const tool of host.getToolDefinitions({ contract: 'upup.pi.host.v1', packageName: PACKAGE, packageVersion: VERSION, sessionId: host.sessionId, capability: 'tool-definitions' })) pi.registerTool(tool as never);
}

const holding = Type.Object({ sector: Type.String({ minLength: 1 }), weight: Type.Number(), return: Type.Number() });
const book = Type.Array(holding, { minItems: 1, maxItems: 500 });
const bookParameters = Type.Object({ portfolio: book, benchmark: book });
const sectorParameters = Type.Object({ portfolio: book, benchmark: book, classification: Type.Union([Type.Literal('shenwan-l1'), Type.Literal('gics-l2')]) });
const styleParameters = Type.Object({
  portfolioExposures: Type.Object({ Size: Type.Number(), Value: Type.Number(), Momentum: Type.Number(), Volatility: Type.Number() }),
  benchmarkExposures: Type.Object({ Size: Type.Number(), Value: Type.Number(), Momentum: Type.Number(), Volatility: Type.Number() }),
  factorReturns: Type.Object({ Size: Type.Number(), Value: Type.Number(), Momentum: Type.Number(), Volatility: Type.Number() }),
  activeReturn: Type.Number(),
});
const productionParameters = Type.Object({
  method: Type.Union([Type.Literal('brinson'), Type.Literal('style'), Type.Literal('sector'), Type.Literal('combined')]),
  portfolio: Type.Object({ totalReturn: Type.Number(), holdings: book }),
  benchmark: Type.Object({ totalReturn: Type.Number(), holdings: book }),
  sectorClassification: Type.Optional(Type.Union([Type.Literal('shenwan-l1'), Type.Literal('gics-l2')])),
  style: Type.Optional(Type.Object({
    portfolioExposures: Type.Object({ Size: Type.Number(), Value: Type.Number(), Momentum: Type.Number(), Volatility: Type.Number() }),
    benchmarkExposures: Type.Object({ Size: Type.Number(), Value: Type.Number(), Momentum: Type.Number(), Volatility: Type.Number() }),
    factorReturns: Type.Object({ Size: Type.Number(), Value: Type.Number(), Momentum: Type.Number(), Volatility: Type.Number() }),
  })),
});

const listBenchmarksParameters = Type.Object({});
const compareBenchmarksParameters = Type.Object({ portfolioReturn: Type.Number(), benchmarks: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 10 }) });
const alphaParameters = Type.Object({ portfolioReturn: Type.Number(), benchmarkSymbol: Type.String({ minLength: 1 }) });
const conversionParameters = Type.Object({ amount: Type.Number(), from: Type.String({ minLength: 1 }), to: Type.String({ minLength: 1 }) });
const listCurrenciesParameters = Type.Object({});
const rateParameters = Type.Object({ from: Type.String({ minLength: 1 }), to: Type.String({ minLength: 1 }) });
const addPositionParameters = Type.Object({ symbol: Type.String({ minLength: 1 }), quantity: Type.Number({ exclusiveMinimum: 0 }), avgCost: Type.Number({ exclusiveMinimum: 0 }), purchaseDate: Type.Optional(Type.String({ minLength: 1 })) });
const updatePositionParameters = Type.Object({ symbol: Type.String({ minLength: 1 }), quantity: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), avgCost: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) });
const removePositionParameters = Type.Object({ symbol: Type.String({ minLength: 1 }), atPrice: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) });
const getPortfolioParameters = Type.Object({ prices: Type.Optional(Type.Record(Type.String(), Type.Number({ exclusiveMinimum: 0 }))) });
const duckdbQueryParameters = Type.Object({ sql: Type.String({ minLength: 1, maxLength: 100_000 }) });
const duckdbPathParameters = Type.Object({ path: Type.String({ minLength: 1 }), tableName: Type.String({ minLength: 1, maxLength: 128 }) });
const duckdbCsvParameters = Type.Object({ path: Type.String({ minLength: 1 }), tableName: Type.String({ minLength: 1, maxLength: 128 }), header: Type.Optional(Type.Boolean()), delimiter: Type.Optional(Type.String({ minLength: 1, maxLength: 1 })) });
const duckdbTimeseriesParameters = Type.Object({ table: Type.String({ minLength: 1 }), dateColumn: Type.String({ minLength: 1 }), valueColumn: Type.String({ minLength: 1 }), interval: Type.Union([Type.Literal('day'), Type.Literal('week'), Type.Literal('month'), Type.Literal('quarter'), Type.Literal('year')]), aggregation: Type.Optional(Type.Union([Type.Literal('sum'), Type.Literal('avg'), Type.Literal('min'), Type.Literal('max'), Type.Literal('count'), Type.Literal('std'), Type.Literal('var')])), startDate: Type.Optional(Type.String()), endDate: Type.Optional(Type.String()) });
const duckdbPortfolioParameters = Type.Object({ table: Type.String({ minLength: 1 }), returnsColumn: Type.Optional(Type.String()), weightsColumn: Type.Optional(Type.String()), analysisType: Type.Union([Type.Literal('returns'), Type.Literal('volatility'), Type.Literal('correlation'), Type.Literal('sharpe'), Type.Literal('var')]) });

const PORTFOLIO_STATE_ENTRY = 'upup_pi_portfolio_state';
const MULTI_PORTFOLIO_STATE_ENTRY = 'upup_pi_multi_portfolio_state';
function readPortfolioState(context?: { sessionManager?: { getEntries(): readonly unknown[] } }): PortfolioState {
  if (!context?.sessionManager) return createInitialPortfolioState();
  const entry = [...context.sessionManager.getEntries()].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === PORTFOLIO_STATE_ENTRY;
  }) as { data?: unknown } | undefined;
  const data = entry?.data;
  if (data && typeof data === 'object' && (data as { schema?: unknown }).schema === 1) return data as PortfolioState;
  return createInitialPortfolioState();
}
function persistPortfolioState(pi: ExtensionAPI, state: PortfolioState): void { if (typeof pi.appendEntry === 'function') pi.appendEntry(PORTFOLIO_STATE_ENTRY, state); }
function nativePortfolioResult(toolCallId: string, query: string, value: unknown, state?: PortfolioState) {
  const audit = makeEvidence(toolCallId, query);
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId, ...(state ? { portfolioState: { schema: state.schema, cash: state.cash, positionCount: Object.keys(state.positions).length } } : {}) } };
}
function readMultiPortfolioState(context?: { sessionManager?: { getEntries(): readonly unknown[] } }): MultiPortfolioState {
  if (!context?.sessionManager) return createInitialMultiPortfolioState();
  const entry = [...context.sessionManager.getEntries()].reverse().find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; customType?: unknown };
    return value.type === 'custom' && value.customType === MULTI_PORTFOLIO_STATE_ENTRY;
  }) as { data?: unknown } | undefined;
  const data = entry?.data;
  if (data && typeof data === 'object' && (data as { schema?: unknown }).schema === 1) return data as MultiPortfolioState;
  return createInitialMultiPortfolioState();
}
function multiPortfolioResult(toolCallId: string, query: string, value: unknown, state: MultiPortfolioState) {
  const audit = makeEvidence(toolCallId, query);
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId, multiPortfolioState: { schema: state.schema, activePortfolio: state.activePortfolio, portfolioCount: Object.keys(state.portfolios).length } } };
}

function makeEvidence(toolCallId: string, query: string) {
  const path = query === 'portfolio_attribution' ? 'attribution' : query.replaceAll('_', '-');
  return {
    id: `pi-portfolio:${toolCallId}`,
    source: `upup-pi://portfolio/${path}`,
    retrievedAt: new Date().toISOString(),
    asOf: new Date().toISOString().slice(0, 10),
    query,
    dataFreshness: 'historical' as const,
    auditId: toolCallId,
  };
}

export default function portfolioExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);
  const duckdb = new DuckDBClient();
  if (typeof pi.on === 'function') pi.on('session_shutdown', () => { void duckdb.close(); });
  const nativeDuckDBResult = (toolCallId: string, query: string, value: unknown) => {
    const audit = makeEvidence(toolCallId, query);
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: { evidence: [{ ...audit, source: `upup-pi://portfolio/duckdb/${query}` }], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
  };
  const duckdbError = (toolCallId: string, error: unknown) => ({ content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true, details: { auditId: toolCallId } });
  let portfolioState: PortfolioState | undefined;
  let multiPortfolioState: MultiPortfolioState | undefined;
  const getState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }): PortfolioState => {
    portfolioState ??= readPortfolioState(context);
    return portfolioState;
  };
  const commitState = (state: PortfolioState): void => { portfolioState = state; persistPortfolioState(pi, state); };
  const commitMultiState = (state: MultiPortfolioState): void => { multiPortfolioState = state; if (typeof pi.appendEntry === 'function') pi.appendEntry(MULTI_PORTFOLIO_STATE_ENTRY, state); };
  if (typeof pi.on === 'function') pi.on('session_start', (_event, context) => { portfolioState = readPortfolioState(context); multiPortfolioState = readMultiPortfolioState(context); });
  const getMultiState = (context?: { sessionManager?: { getEntries(): readonly unknown[] } }): MultiPortfolioState => { multiPortfolioState ??= readMultiPortfolioState(context); return multiPortfolioState; };
  pi.registerTool({
    name: 'duckdb-query', label: 'DuckDB Query', description: 'Run one bounded, read-only SQL query in the Pi portfolio analytics database.', parameters: duckdbQueryParameters,
    async execute(toolCallId, params, signal) { try { return nativeDuckDBResult(toolCallId, 'duckdb-query', await duckdb.query(params.sql, signal)); } catch (error) { return duckdbError(toolCallId, error); } },
  });
  pi.registerTool({
    name: 'duckdb-register-parquet', label: 'DuckDB Register Parquet', description: 'Register an absolute Parquet file inside the configured working-directory roots as a DuckDB table.', parameters: duckdbPathParameters,
    async execute(toolCallId, params, signal) { try { return nativeDuckDBResult(toolCallId, 'duckdb-register-parquet', await duckdb.registerParquet(params.path, params.tableName, signal)); } catch (error) { return duckdbError(toolCallId, error); } },
  });
  pi.registerTool({
    name: 'duckdb-list-tables', label: 'DuckDB List Tables', description: 'List tables and columns available in the current Pi portfolio DuckDB session.', parameters: Type.Object({}),
    async execute(toolCallId, _params, signal) { try { return nativeDuckDBResult(toolCallId, 'duckdb-list-tables', await duckdb.listTables(signal)); } catch (error) { return duckdbError(toolCallId, error); } },
  });
  pi.registerTool({
    name: 'duckdb-timeseries', label: 'DuckDB Time Series', description: 'Aggregate a validated DuckDB table column by day, week, month, quarter, or year.', parameters: duckdbTimeseriesParameters,
    async execute(toolCallId, params, signal) { try { return nativeDuckDBResult(toolCallId, 'duckdb-timeseries', await duckdb.timeseries({ ...params, aggregation: params.aggregation ?? 'sum' }, signal)); } catch (error) { return duckdbError(toolCallId, error); } },
  });
  pi.registerTool({
    name: 'duckdb-portfolio-analysis', label: 'DuckDB Portfolio Analysis', description: 'Calculate returns, volatility, correlation, Sharpe ratio, or historical VaR from a DuckDB table.', parameters: duckdbPortfolioParameters,
    async execute(toolCallId, params, signal) { try { return nativeDuckDBResult(toolCallId, 'duckdb-portfolio-analysis', await duckdb.portfolioAnalysis(params, signal)); } catch (error) { return duckdbError(toolCallId, error); } },
  });
  pi.registerTool({
    name: 'duckdb-import-csv', label: 'DuckDB Import CSV', description: 'Import an absolute CSV file inside the configured working-directory roots into a DuckDB table.', parameters: duckdbCsvParameters,
    async execute(toolCallId, params, signal) { try { return nativeDuckDBResult(toolCallId, 'duckdb-import-csv', await duckdb.importCsv(params.path, params.tableName, params.header ?? true, params.delimiter ?? ',', signal)); } catch (error) { return duckdbError(toolCallId, error); } },
  });
  pi.registerTool({
    name: 'export_portfolio', label: 'Export Portfolio', description: 'Export the current Pi session portfolio as auditable CSV or JSON content.', parameters: Type.Object({ format: Type.Optional(Type.Union([Type.Literal('csv'), Type.Literal('json')])), includeTransactions: Type.Optional(Type.Boolean()), prices: Type.Optional(Type.Record(Type.String(), Type.Number({ exclusiveMinimum: 0 }))) }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'export_portfolio request aborted' }], isError: true };
      const state = getState(context); return nativePortfolioResult(toolCallId, 'export_portfolio', exportPortfolioState(state, { format: params.format ?? 'csv', includeTransactions: params.includeTransactions ?? false, prices: params.prices ?? {} }), state);
    },
  });
  pi.registerTool({
    name: 'list_portfolios', label: 'List Portfolios', description: 'List named portfolios and identify the active portfolio in the current Pi session.', parameters: Type.Object({}),
    async execute(toolCallId, _params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'list_portfolios request aborted' }], isError: true };
      const state = getMultiState(context); return multiPortfolioResult(toolCallId, 'list_portfolios', { activePortfolio: state.activePortfolio, portfolios: listMultiPortfolios(state), count: Object.keys(state.portfolios).length }, state);
    },
  });
  pi.registerTool({
    name: 'create_portfolio', label: 'Create Portfolio', description: 'Create and activate a named portfolio with an optional initial cash balance.', parameters: Type.Object({ name: Type.String({ minLength: 1 }), initialCash: Type.Optional(Type.Number({ exclusiveMinimum: 0 })) }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'create_portfolio request aborted' }], isError: true };
      const state = getMultiState(context); const result = createMultiPortfolio(state, params); if (result.error) return multiPortfolioResult(toolCallId, 'create_portfolio', { error: result.error }, state); commitMultiState(result.state); return multiPortfolioResult(toolCallId, 'create_portfolio', { portfolio: result.portfolio, activePortfolio: result.state.activePortfolio }, result.state);
    },
  });
  pi.registerTool({
    name: 'delete_portfolio', label: 'Delete Portfolio', description: 'Delete a named portfolio only after explicit confirmation; the last portfolio cannot be deleted.', parameters: Type.Object({ name: Type.String({ minLength: 1 }), confirm: Type.Boolean() }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'delete_portfolio request aborted' }], isError: true };
      const state = getMultiState(context); if (!params.confirm) return multiPortfolioResult(toolCallId, 'delete_portfolio', { error: 'Must confirm deletion by setting confirm=true' }, state); const result = deleteMultiPortfolio(state, params.name); if (result.error) return multiPortfolioResult(toolCallId, 'delete_portfolio', { error: result.error }, state); commitMultiState(result.state); return multiPortfolioResult(toolCallId, 'delete_portfolio', { deleted: params.name, activePortfolio: result.state.activePortfolio }, result.state);
    },
  });
  pi.registerTool({
    name: 'switch_portfolio', label: 'Switch Portfolio', description: 'Switch the active named portfolio for subsequent Pi portfolio operations.', parameters: Type.Object({ name: Type.String({ minLength: 1 }) }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'switch_portfolio request aborted' }], isError: true };
      const state = getMultiState(context); const result = switchMultiPortfolio(state, params.name); if (result.error) return multiPortfolioResult(toolCallId, 'switch_portfolio', { error: result.error }, state); commitMultiState(result.state); return multiPortfolioResult(toolCallId, 'switch_portfolio', { activePortfolio: result.state.activePortfolio }, result.state);
    },
  });
  pi.registerTool({
    name: 'add_position_multi', label: 'Add Multi-Portfolio Position', description: 'Add or average into a position in a named portfolio, defaulting to the active portfolio.', parameters: Type.Object({ symbol: Type.String({ minLength: 1 }), quantity: Type.Number({ exclusiveMinimum: 0 }), avgCost: Type.Number({ exclusiveMinimum: 0 }), purchaseDate: Type.Optional(Type.String({ minLength: 1 })), portfolio: Type.Optional(Type.String({ minLength: 1 })) }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'add_position_multi request aborted' }], isError: true };
      const state = getMultiState(context); const result = addMultiPortfolioPosition(state, params); if (result.error) return multiPortfolioResult(toolCallId, 'add_position_multi', { error: result.error }, state); commitMultiState(result.state); return multiPortfolioResult(toolCallId, 'add_position_multi', { portfolio: result.portfolio }, result.state);
    },
  });
  pi.registerTool({
    name: 'remove_position_multi', label: 'Remove Multi-Portfolio Position', description: 'Remove a position from a named portfolio and credit proceeds to its cash balance.', parameters: Type.Object({ symbol: Type.String({ minLength: 1 }), atPrice: Type.Optional(Type.Number({ exclusiveMinimum: 0 })), portfolio: Type.Optional(Type.String({ minLength: 1 })) }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'remove_position_multi request aborted' }], isError: true };
      const state = getMultiState(context); const result = removeMultiPortfolioPosition(state, params); if (result.error) return multiPortfolioResult(toolCallId, 'remove_position_multi', { error: result.error }, state); commitMultiState(result.state); return multiPortfolioResult(toolCallId, 'remove_position_multi', { portfolio: result.portfolio?.name, removed: result.removed }, result.state);
    },
  });
  pi.registerTool({
    name: 'get_portfolio_multi', label: 'Get Multi-Portfolio', description: 'Read a named portfolio with optional explicit prices and deterministic P&L; defaults to the active portfolio.', parameters: Type.Object({ portfolio: Type.Optional(Type.String({ minLength: 1 })), prices: Type.Optional(Type.Record(Type.String(), Type.Number({ exclusiveMinimum: 0 }))) }),
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'get_portfolio_multi request aborted' }], isError: true };
      const state = getMultiState(context); const result = calculateMultiPortfolioReport(state, params.portfolio, params.prices ?? {}); if (!result) return multiPortfolioResult(toolCallId, 'get_portfolio_multi', { error: `Portfolio "${params.portfolio ?? state.activePortfolio}" not found` }, state); return multiPortfolioResult(toolCallId, 'get_portfolio_multi', result, state);
    },
  });
  pi.registerTool({
    name: 'add_position', label: 'Add Position', description: 'Add a position to the Pi session portfolio and deduct its cost from cash.', parameters: addPositionParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'add_position request aborted' }], isError: true };
      const current = getState(context); const result = addPortfolioPosition(current, params);
      if (result.error) return nativePortfolioResult(toolCallId, 'add_position', { error: result.error }, current);
      commitState(result.state); return nativePortfolioResult(toolCallId, 'add_position', { position: result.position, cash: result.state.cash, transaction: result.transaction }, result.state);
    },
  });
  pi.registerTool({
    name: 'update_position', label: 'Update Position', description: 'Update a Pi session portfolio position quantity or average cost.', parameters: updatePositionParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'update_position request aborted' }], isError: true };
      const current = getState(context); const result = updatePortfolioPosition(current, params);
      if (result.error) return nativePortfolioResult(toolCallId, 'update_position', { error: result.error }, current);
      commitState(result.state); return nativePortfolioResult(toolCallId, 'update_position', { position: result.position, cash: result.state.cash, transaction: result.transaction }, result.state);
    },
  });
  pi.registerTool({
    name: 'remove_position', label: 'Remove Position', description: 'Remove a Pi session portfolio position and credit proceeds to cash.', parameters: removePositionParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'remove_position request aborted' }], isError: true };
      const current = getState(context); const result = removePortfolioPosition(current, params);
      if (result.error) return nativePortfolioResult(toolCallId, 'remove_position', { error: result.error }, current);
      commitState(result.state); return nativePortfolioResult(toolCallId, 'remove_position', { position: result.position, cash: result.state.cash, transaction: result.transaction }, result.state);
    },
  });
  pi.registerTool({
    name: 'get_portfolio', label: 'Get Portfolio', description: 'Read the Pi session portfolio with deterministic cost basis and optional current-price P&L.', parameters: getPortfolioParameters,
    async execute(toolCallId, params, signal, _onUpdate, context) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'get_portfolio request aborted' }], isError: true };
      const current = getState(context); return nativePortfolioResult(toolCallId, 'get_portfolio', calculatePortfolioReport(current, params.prices ?? {}), current);
    },
  });
  pi.registerTool({
    name: 'list_benchmarks', label: 'List Benchmarks', description: 'List deterministic market benchmarks available for portfolio comparison.', parameters: listBenchmarksParameters,
    async execute(toolCallId, _params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'list_benchmarks request aborted' }], isError: true };
      const result = { benchmarks: listBenchmarks(), count: listBenchmarks().length };
      const audit = makeEvidence(toolCallId, 'list_benchmarks');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'compare_to_benchmark', label: 'Compare To Benchmark', description: 'Compare portfolio return with one or more market benchmarks and calculate alpha.', parameters: compareBenchmarksParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compare_to_benchmark request aborted' }], isError: true };
      const result = comparePortfolioToBenchmarks(params.portfolioReturn, params.benchmarks);
      const audit = makeEvidence(toolCallId, 'compare_to_benchmark');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'calculate_alpha', label: 'Calculate Alpha', description: 'Calculate portfolio excess return and information ratio against a benchmark.', parameters: alphaParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'calculate_alpha request aborted' }], isError: true };
      const result = calculateBenchmarkAlpha(params.portfolioReturn, params.benchmarkSymbol);
      const audit = makeEvidence(toolCallId, 'calculate_alpha');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'convert_currency', label: 'Convert Currency', description: 'Convert an amount between supported fiat currencies using deterministic USD-base rates.', parameters: conversionParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'convert_currency request aborted' }], isError: true };
      const result = convertCurrencyAmount(params.amount, params.from, params.to);
      if (!result) return { content: [{ type: 'text', text: JSON.stringify({ error: `Conversion not available for ${params.from} to ${params.to}`, supported: listCurrencies().map((currency) => currency.code) }) }], isError: true };
      const audit = makeEvidence(toolCallId, 'convert_currency');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'list_currencies', label: 'List Currencies', description: 'List supported currencies for investment calculations.', parameters: listCurrenciesParameters,
    async execute(toolCallId, _params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'list_currencies request aborted' }], isError: true };
      const result = { currencies: listCurrencies(), count: listCurrencies().length };
      const audit = makeEvidence(toolCallId, 'list_currencies');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'get_exchange_rate', label: 'Get Exchange Rate', description: 'Get the deterministic exchange rate between two supported fiat currencies.', parameters: rateParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'get_exchange_rate request aborted' }], isError: true };
      const rate = getCurrencyRate(params.from, params.to);
      if (rate === null) return { content: [{ type: 'text', text: JSON.stringify({ error: `Rate not available for ${params.from} to ${params.to}` }) }], isError: true };
      const audit = makeEvidence(toolCallId, 'get_exchange_rate');
      return { content: [{ type: 'text', text: JSON.stringify({ from: params.from.toUpperCase(), to: params.to.toUpperCase(), rate, inverse: 1 / rate }) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'portfolio_attribution',
    label: 'Portfolio Attribution',
    description: 'Decompose active portfolio return using Brinson, style, sector, or combined attribution.',
    parameters: productionParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'portfolio_attribution request aborted' }], isError: true };
      const result = calculatePortfolioAttribution(params as PortfolioAttributionInput);
      const audit = makeEvidence(toolCallId, 'portfolio_attribution');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'portfolio_brinson_attribution',
    label: 'Portfolio Brinson Attribution',
    description: 'Compute deterministic Brinson allocation, selection, and interaction effects from portfolio and benchmark holdings.',
    parameters: bookParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'portfolio_brinson_attribution request aborted' }], isError: true };
      const result = calculateBrinsonAttribution({ holdings: params.portfolio as PortfolioBook['holdings'] }, { holdings: params.benchmark as PortfolioBook['holdings'] });
      const audit = makeEvidence(toolCallId, 'portfolio_brinson_attribution');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'portfolio_style_attribution',
    label: 'Portfolio Style Attribution',
    description: 'Compute deterministic factor exposure contributions and residual active return.',
    parameters: styleParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'portfolio_style_attribution request aborted' }], isError: true };
      const result = calculateStyleAttribution(params as StyleAttributionInput);
      const audit = makeEvidence(toolCallId, 'portfolio_style_attribution');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'portfolio_sector_attribution',
    label: 'Portfolio Sector Attribution',
    description: 'Compute deterministic sector contribution and active return using an explicit classification.',
    parameters: sectorParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'portfolio_sector_attribution request aborted' }], isError: true };
      const result = calculateSectorAttribution({ holdings: params.portfolio as PortfolioBook['holdings'] }, { holdings: params.benchmark as PortfolioBook['holdings'] }, params.classification);
      const audit = makeEvidence(toolCallId, 'portfolio_sector_attribution');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [audit], dataFreshness: audit.dataFreshness, auditId: toolCallId } };
    },
  });
}
