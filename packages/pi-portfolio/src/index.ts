export interface PortfolioHolding { readonly sector: string; readonly weight: number; readonly return: number; }
export interface PortfolioBook { readonly holdings: readonly PortfolioHolding[]; }
export interface BrinsonAttributionResult {
  readonly allocation: number; readonly selection: number; readonly interaction: number; readonly activeReturn: number;
  readonly bySector: readonly { readonly sector: string; readonly allocation: number; readonly selection: number; readonly interaction: number }[];
}
export type StyleFactorName = 'Size' | 'Value' | 'Momentum' | 'Volatility';
export interface StyleAttributionInput {
  readonly portfolioExposures: Readonly<Record<StyleFactorName, number>>;
  readonly benchmarkExposures: Readonly<Record<StyleFactorName, number>>;
  readonly factorReturns: Readonly<Record<StyleFactorName, number>>;
  readonly activeReturn: number;
}
export interface StyleAttributionResult {
  readonly factors: readonly { readonly name: StyleFactorName; readonly portfolioExposure: number; readonly benchmarkExposure: number; readonly factorReturn: number; readonly contribution: number }[];
  readonly activeReturn: number; readonly residual: number;
}
export type SectorClassification = 'shenwan-l1' | 'gics-l2';
export interface SectorAttributionResult {
  readonly classification: SectorClassification;
  readonly sectors: readonly { readonly sector: string; readonly weightDiff: number; readonly sectorReturn: number; readonly benchmarkReturn: number; readonly contribution: number }[];
  readonly activeReturn: number;
}

export interface ProductionPortfolioBook extends PortfolioBook {
  readonly totalReturn: number;
}

export interface ProductionStyleInput {
  readonly portfolioExposures: Readonly<Record<StyleFactorName, number>>;
  readonly benchmarkExposures: Readonly<Record<StyleFactorName, number>>;
  readonly factorReturns: Readonly<Record<StyleFactorName, number>>;
}

export type PortfolioAttributionMethod = 'brinson' | 'style' | 'sector' | 'combined';

export interface PortfolioAttributionInput {
  readonly method: PortfolioAttributionMethod;
  readonly portfolio: ProductionPortfolioBook;
  readonly benchmark: ProductionPortfolioBook;
  readonly sectorClassification?: SectorClassification;
  readonly style?: ProductionStyleInput;
}

export interface PortfolioAttributionResult {
  readonly method: PortfolioAttributionMethod;
  readonly activeReturn: number;
  readonly result: BrinsonAttributionResult | StyleAttributionResult | SectorAttributionResult | {
    readonly brinson: BrinsonAttributionResult;
    readonly style?: StyleAttributionResult;
    readonly sector: SectorAttributionResult;
  };
}

export interface BenchmarkDefinition { readonly symbol: string; readonly name: string; readonly annualReturn: number; readonly volatility: number; }
export interface BenchmarkComparisonResult {
  readonly portfolioReturn: number;
  readonly benchmarks: readonly { readonly symbol: string; readonly name: string; readonly return: number; readonly alpha: number }[];
  readonly winner: string;
  readonly summary: string;
}
export interface CurrencyDefinition { readonly code: string; readonly name: string; readonly flag: string; }
export interface CurrencyConversionResult { readonly amount: number; readonly from: string; readonly to: string; readonly convertedAmount: number; readonly rate: number; }

export interface PortfolioPosition { readonly symbol: string; readonly quantity: number; readonly avgCost: number; readonly purchaseDate: string; }
export type PortfolioTransactionType = 'buy' | 'sell' | 'adjust';
export interface PortfolioTransaction {
  readonly id: string; readonly date: string; readonly type: PortfolioTransactionType; readonly symbol: string;
  readonly quantity: number; readonly price: number; readonly total: number; readonly cashBalance: number;
}
export interface PortfolioState {
  readonly schema: 1;
  readonly positions: Readonly<Record<string, PortfolioPosition>>;
  readonly cash: number;
  readonly transactions: readonly PortfolioTransaction[];
}
export interface PortfolioMutationResult { readonly state: PortfolioState; readonly position?: PortfolioPosition; readonly error?: string; readonly transaction?: PortfolioTransaction; }
export interface PortfolioReportPosition extends PortfolioPosition {
  readonly currentPrice: number; readonly marketValue: number; readonly costBasis: number; readonly pnl: number; readonly pnlPercent: number;
}
export interface PortfolioReport {
  readonly positions: readonly PortfolioReportPosition[];
  readonly summary: { readonly totalPositions: number; readonly totalCost: number; readonly totalMarketValue: number; readonly totalPnl: number; readonly totalPnlPercent: number; readonly cash: number; readonly totalValue: number };
}
export type PortfolioExportFormat = 'csv' | 'json';
export interface PortfolioExportResult {
  readonly format: PortfolioExportFormat;
  readonly filename: 'portfolio_export';
  readonly status: 'success' | 'empty';
  readonly content?: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly transactions?: readonly PortfolioTransaction[];
  readonly summary: { readonly totalSymbols: number; readonly totalMarketValue: number; readonly totalPnl: number };
}

function portfolioNumber(value: number, name: string, positive = false): void {
  if (!Number.isFinite(value) || (positive && value <= 0)) throw new Error(`${name} must be ${positive ? 'positive' : 'finite'}`);
}
function portfolioSymbol(value: string): string { const symbol = value.trim().toUpperCase(); if (!symbol) throw new Error('symbol must not be empty'); return symbol; }
function portfolioDate(value?: string): string { return value?.trim() || new Date().toISOString().slice(0, 10); }
function copyPortfolioState(state: PortfolioState): PortfolioState { return { schema: 1, positions: { ...state.positions }, cash: state.cash, transactions: [...state.transactions] }; }
function appendPortfolioTransaction(state: PortfolioState, type: PortfolioTransactionType, symbol: string, quantity: number, price: number): { state: PortfolioState; transaction: PortfolioTransaction } {
  const transaction: PortfolioTransaction = { id: `pi-portfolio-tx-${state.transactions.length + 1}`, date: new Date().toISOString(), type, symbol, quantity, price, total: quantity * price, cashBalance: state.cash };
  return { state: { ...state, transactions: [...state.transactions, transaction] }, transaction };
}
export function createInitialPortfolioState(initialCash = 100000): PortfolioState {
  portfolioNumber(initialCash, 'initialCash');
  return { schema: 1, positions: {}, cash: initialCash, transactions: [] };
}
export function addPortfolioPosition(state: PortfolioState, input: { readonly symbol: string; readonly quantity: number; readonly avgCost: number; readonly purchaseDate?: string }): PortfolioMutationResult {
  const symbol = portfolioSymbol(input.symbol); portfolioNumber(input.quantity, 'quantity', true); portfolioNumber(input.avgCost, 'avgCost', true);
  const totalCost = input.quantity * input.avgCost;
  if (state.cash < totalCost) return { state, error: `Insufficient cash. Need ${totalCost.toFixed(2)}, available ${state.cash.toFixed(2)}` };
  const position: PortfolioPosition = { symbol, quantity: input.quantity, avgCost: input.avgCost, purchaseDate: portfolioDate(input.purchaseDate) };
  let next: PortfolioState = { ...copyPortfolioState(state), positions: { ...state.positions, [symbol]: position }, cash: state.cash - totalCost };
  const transaction = appendPortfolioTransaction(next, 'buy', symbol, input.quantity, input.avgCost);
  next = transaction.state;
  return { state: next, position, transaction: transaction.transaction };
}
export function updatePortfolioPosition(state: PortfolioState, input: { readonly symbol: string; readonly quantity?: number; readonly avgCost?: number }): PortfolioMutationResult {
  const symbol = portfolioSymbol(input.symbol); const existing = state.positions[symbol];
  if (!existing) return { state, error: `Position ${symbol} not found` };
  if (input.quantity !== undefined) portfolioNumber(input.quantity, 'quantity', true);
  if (input.avgCost !== undefined) portfolioNumber(input.avgCost, 'avgCost', true);
  const position: PortfolioPosition = { ...existing, ...(input.quantity === undefined ? {} : { quantity: input.quantity }), ...(input.avgCost === undefined ? {} : { avgCost: input.avgCost }) };
  let next: PortfolioState = { ...copyPortfolioState(state), positions: { ...state.positions, [symbol]: position } };
  const changed = position.quantity !== existing.quantity || position.avgCost !== existing.avgCost;
  if (!changed) return { state: next, position };
  const transaction = appendPortfolioTransaction(next, 'adjust', symbol, position.quantity, position.avgCost);
  return { state: transaction.state, position, transaction: transaction.transaction };
}
export function removePortfolioPosition(state: PortfolioState, input: { readonly symbol: string; readonly atPrice?: number }): PortfolioMutationResult {
  const symbol = portfolioSymbol(input.symbol); const existing = state.positions[symbol];
  if (!existing) return { state, error: `Position ${symbol} not found` };
  const price = input.atPrice ?? existing.avgCost; portfolioNumber(price, 'atPrice', true);
  let next: PortfolioState = { ...copyPortfolioState(state), positions: Object.fromEntries(Object.entries(state.positions).filter(([key]) => key !== symbol)), cash: state.cash + existing.quantity * price };
  const transaction = appendPortfolioTransaction(next, 'sell', symbol, existing.quantity, price);
  return { state: transaction.state, position: existing, transaction: transaction.transaction };
}
export function calculatePortfolioReport(state: PortfolioState, currentPrices: Readonly<Record<string, number>> = {}): PortfolioReport {
  const positions = Object.values(state.positions).map((position) => {
    const supplied = currentPrices[position.symbol] ?? currentPrices[position.symbol.toUpperCase()];
    const currentPrice = supplied ?? position.avgCost; portfolioNumber(currentPrice, `price for ${position.symbol}`, true);
    const costBasis = position.quantity * position.avgCost; const marketValue = position.quantity * currentPrice; const pnl = marketValue - costBasis;
    return { ...position, currentPrice, marketValue, costBasis, pnl, pnlPercent: costBasis > 0 ? pnl / costBasis * 100 : 0 };
  });
  const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0); const totalMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0); const totalPnl = totalMarketValue - totalCost;
  return { positions, summary: { totalPositions: positions.length, totalCost, totalMarketValue, totalPnl, totalPnlPercent: totalCost > 0 ? totalPnl / totalCost * 100 : 0, cash: state.cash, totalValue: totalMarketValue + state.cash } };
}
export function exportPortfolioState(state: PortfolioState, input: { readonly format: PortfolioExportFormat; readonly includeTransactions?: boolean; readonly prices?: Readonly<Record<string, number>> }): PortfolioExportResult {
  const report = calculatePortfolioReport(state, input.prices ?? {});
  const rows: Record<string, string | number>[] = report.positions.map((position) => ({
    Symbol: position.symbol, Quantity: position.quantity, 'Avg Cost': position.avgCost, 'Current Price': position.currentPrice,
    'Market Value': position.marketValue, 'Unrealized P&L': position.pnl, 'P&L %': position.pnlPercent, 'Added At': position.purchaseDate,
  }));
  const escape = (value: unknown): string => { const text = value === null || value === undefined ? '' : String(value); return /[,"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  const headers = Object.keys(rows[0] ?? { Symbol: '', Quantity: '', 'Avg Cost': '', 'Current Price': '', 'Market Value': '', 'Unrealized P&L': '', 'P&L %': '', 'Added At': '' });
  const content = input.format === 'csv' ? [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n') : JSON.stringify(rows, null, 2);
  return { format: input.format, filename: 'portfolio_export', status: rows.length === 0 ? 'empty' : 'success', content, rows, ...(input.includeTransactions ? { transactions: [...state.transactions] } : {}), summary: { totalSymbols: rows.length, totalMarketValue: report.summary.totalMarketValue, totalPnl: report.summary.totalPnl } };
}

export interface NamedPortfolioState {
  readonly name: string;
  readonly positions: Readonly<Record<string, PortfolioPosition>>;
  readonly cash: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface MultiPortfolioState {
  readonly schema: 1;
  readonly portfolios: Readonly<Record<string, NamedPortfolioState>>;
  readonly activePortfolio: string;
  readonly defaultCash: number;
}
export interface MultiPortfolioListItem { readonly name: string; readonly positionCount: number; readonly isActive: boolean; }
export interface MultiPortfolioMutationResult { readonly state: MultiPortfolioState; readonly portfolio?: NamedPortfolioState; readonly error?: string; readonly removed?: { readonly quantity: number; readonly proceeds: number }; }

const MULTI_DEFAULT_NAME = 'default';
function multiName(value: string, field = 'name'): string { const name = value.trim(); if (!name) throw new Error(`${field} must not be empty`); return name; }
function copyMultiState(state: MultiPortfolioState): MultiPortfolioState { return { schema: 1, portfolios: { ...state.portfolios }, activePortfolio: state.activePortfolio, defaultCash: state.defaultCash }; }
function copyNamedPortfolio(portfolio: NamedPortfolioState): NamedPortfolioState { return { ...portfolio, positions: { ...portfolio.positions } }; }
export function createInitialMultiPortfolioState(defaultCash = 100000): MultiPortfolioState { portfolioNumber(defaultCash, 'defaultCash', true); return { schema: 1, portfolios: {}, activePortfolio: MULTI_DEFAULT_NAME, defaultCash }; }
export function listMultiPortfolios(state: MultiPortfolioState): readonly MultiPortfolioListItem[] { return Object.values(state.portfolios).map((portfolio) => ({ name: portfolio.name, positionCount: Object.keys(portfolio.positions).length, isActive: portfolio.name === state.activePortfolio })); }
export function createMultiPortfolio(state: MultiPortfolioState, input: { readonly name: string; readonly initialCash?: number }): MultiPortfolioMutationResult {
  const name = multiName(input.name); if (state.portfolios[name]) return { state, error: `Portfolio "${name}" already exists` };
  const cash = input.initialCash ?? state.defaultCash; portfolioNumber(cash, 'initialCash', true); const now = new Date().toISOString();
  const portfolio: NamedPortfolioState = { name, positions: {}, cash, createdAt: now, updatedAt: now };
  const next = { ...copyMultiState(state), portfolios: { ...state.portfolios, [name]: portfolio }, activePortfolio: name };
  return { state: next, portfolio };
}
export function deleteMultiPortfolio(state: MultiPortfolioState, nameInput: string): MultiPortfolioMutationResult {
  const name = multiName(nameInput); if (!state.portfolios[name]) return { state, error: `Portfolio "${name}" not found` };
  const names = Object.keys(state.portfolios); if (names.length <= 1) return { state, error: 'Cannot delete the last portfolio' };
  const portfolios = { ...state.portfolios }; delete portfolios[name];
  return { state: { ...copyMultiState(state), portfolios, activePortfolio: state.activePortfolio === name ? Object.keys(portfolios)[0] : state.activePortfolio } };
}
export function switchMultiPortfolio(state: MultiPortfolioState, nameInput: string): MultiPortfolioMutationResult {
  const name = multiName(nameInput); if (!state.portfolios[name]) return { state, error: `Portfolio "${name}" not found` };
  return { state: { ...copyMultiState(state), activePortfolio: name }, portfolio: state.portfolios[name] };
}
function resolveMultiPortfolio(state: MultiPortfolioState, nameInput?: string): NamedPortfolioState | undefined { return state.portfolios[nameInput ?? state.activePortfolio]; }
export function addMultiPortfolioPosition(state: MultiPortfolioState, input: { readonly portfolio?: string; readonly symbol: string; readonly quantity: number; readonly avgCost: number; readonly purchaseDate?: string }): MultiPortfolioMutationResult {
  const portfolio = resolveMultiPortfolio(state, input.portfolio); if (!portfolio) return { state, error: `Portfolio "${input.portfolio ?? state.activePortfolio}" not found` };
  const symbol = portfolioSymbol(input.symbol); portfolioNumber(input.quantity, 'quantity', true); portfolioNumber(input.avgCost, 'avgCost', true); const totalCost = input.quantity * input.avgCost;
  if (portfolio.cash < totalCost) return { state, error: `Insufficient cash. Need ${totalCost.toFixed(2)}, have ${portfolio.cash.toFixed(2)}` };
  const existing = portfolio.positions[symbol]; const quantity = (existing?.quantity ?? 0) + input.quantity; const avgCost = existing ? ((existing.quantity * existing.avgCost) + totalCost) / quantity : input.avgCost;
  const nextPortfolio: NamedPortfolioState = { ...copyNamedPortfolio(portfolio), positions: { ...portfolio.positions, [symbol]: { symbol, quantity, avgCost, purchaseDate: existing?.purchaseDate ?? portfolioDate(input.purchaseDate) } }, cash: portfolio.cash - totalCost, updatedAt: new Date().toISOString() };
  const next = { ...copyMultiState(state), portfolios: { ...state.portfolios, [portfolio.name]: nextPortfolio } };
  return { state: next, portfolio: nextPortfolio };
}
export function removeMultiPortfolioPosition(state: MultiPortfolioState, input: { readonly portfolio?: string; readonly symbol: string; readonly atPrice?: number }): MultiPortfolioMutationResult {
  const portfolio = resolveMultiPortfolio(state, input.portfolio); if (!portfolio) return { state, error: `Portfolio "${input.portfolio ?? state.activePortfolio}" not found` };
  const symbol = portfolioSymbol(input.symbol); const position = portfolio.positions[symbol]; if (!position) return { state, error: `Position ${symbol} not found in portfolio "${portfolio.name}"` };
  const price = input.atPrice ?? position.avgCost; portfolioNumber(price, 'atPrice', true); const proceeds = position.quantity * price; const positions = { ...portfolio.positions }; delete positions[symbol];
  const nextPortfolio: NamedPortfolioState = { ...copyNamedPortfolio(portfolio), positions, cash: portfolio.cash + proceeds, updatedAt: new Date().toISOString() }; const next = { ...copyMultiState(state), portfolios: { ...state.portfolios, [portfolio.name]: nextPortfolio } };
  return { state: next, portfolio: nextPortfolio, removed: { quantity: position.quantity, proceeds } };
}
export function calculateMultiPortfolioReport(state: MultiPortfolioState, portfolioNameInput: string | undefined, currentPrices: Readonly<Record<string, number>> = {}): (PortfolioReport & { readonly portfolio: string; readonly isActive: boolean; readonly priceSource: 'explicit' | 'cost-basis' }) | null {
  const portfolio = resolveMultiPortfolio(state, portfolioNameInput); if (!portfolio) return null;
  const hasExplicitPrices = Object.keys(currentPrices).length > 0; const report = calculatePortfolioReport({ schema: 1, positions: portfolio.positions, cash: portfolio.cash, transactions: [] }, currentPrices);
  return { ...report, portfolio: portfolio.name, isActive: portfolio.name === state.activePortfolio, priceSource: hasExplicitPrices ? 'explicit' : 'cost-basis' };
}

const BENCHMARKS: readonly BenchmarkDefinition[] = [
  { symbol: '^GSPC', name: 'S&P 500 (SPX)', annualReturn: 10, volatility: 0.16 },
  { symbol: '^IXIC', name: 'Nasdaq 100 (NDX)', annualReturn: 15, volatility: 0.22 },
  { symbol: '000300', name: 'CSI 300 (沪深300)', annualReturn: 8, volatility: 0.20 },
  { symbol: '^HSI', name: 'Hang Seng Index (HSI)', annualReturn: 6, volatility: 0.22 },
  { symbol: '^DJI', name: 'Dow Jones (DJI)', annualReturn: 9, volatility: 0.14 },
];
const CURRENCIES: readonly CurrencyDefinition[] = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' }, { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'HKD', name: 'Hong Kong Dollar', flag: '🇭🇰' }, { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' }, { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'KRW', name: 'Korean Won', flag: '🇰🇷' }, { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' }, { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
];
const USD_RATES: Readonly<Record<string, number>> = { USD: 1, CNY: 7.24, HKD: 7.82, JPY: 149.5, EUR: 0.92, GBP: 0.79, KRW: 1320, SGD: 1.34, AUD: 1.53, CAD: 1.36, CHF: 0.88 };

function assertFiniteNumber(value: number, name: string): void { if (!Number.isFinite(value)) throw new Error(`${name} must be finite`); }
function normalizeCode(value: string, name: string): string { const code = value.trim().toUpperCase(); if (!code) throw new Error(`${name} must not be empty`); return code; }
export function listBenchmarks(): readonly BenchmarkDefinition[] { return BENCHMARKS.map((benchmark) => ({ ...benchmark })); }
export function calculateBenchmarkAlpha(portfolioReturn: number, benchmarkSymbol: string): { readonly portfolioReturn: number; readonly benchmark: string; readonly benchmarkReturn: number; readonly alpha: number; readonly infoRatio: number; readonly interpretation: string } {
  assertFiniteNumber(portfolioReturn, 'portfolioReturn');
  const symbol = benchmarkSymbol.trim(); const benchmark = BENCHMARKS.find((candidate) => candidate.symbol === symbol);
  if (!benchmark) throw new Error(`Unknown benchmark: ${benchmarkSymbol}`);
  const alpha = portfolioReturn - benchmark.annualReturn; const infoRatio = alpha / (benchmark.volatility * 100);
  return { portfolioReturn, benchmark: benchmark.name, benchmarkReturn: benchmark.annualReturn, alpha: round(alpha), infoRatio: round(infoRatio), interpretation: alpha > 5 ? 'Strong outperformance' : alpha > 0 ? 'Modest outperformance' : alpha > -5 ? 'Modest underperformance' : 'Significant underperformance' };
}
export function comparePortfolioToBenchmarks(portfolioReturn: number, benchmarkSymbols: readonly string[]): BenchmarkComparisonResult {
  assertFiniteNumber(portfolioReturn, 'portfolioReturn');
  const benchmarks = benchmarkSymbols.map((symbol) => BENCHMARKS.find((candidate) => candidate.symbol === symbol)).filter((benchmark): benchmark is BenchmarkDefinition => Boolean(benchmark)).map((benchmark) => ({ symbol: benchmark.symbol, name: benchmark.name, return: benchmark.annualReturn, alpha: round(portfolioReturn - benchmark.annualReturn) })).sort((left, right) => right.alpha - left.alpha);
  const winner = benchmarks[0] ? benchmarks[0].alpha >= 0 ? `Portfolio outperformed ${benchmarks[0].name} by ${benchmarks[0].alpha.toFixed(2)}%` : `Portfolio underperformed ${benchmarks[0].name} by ${Math.abs(benchmarks[0].alpha).toFixed(2)}%` : 'No benchmark data available';
  return { portfolioReturn, benchmarks, winner, summary: `Portfolio: ${portfolioReturn >= 0 ? '+' : ''}${portfolioReturn.toFixed(2)}% | ${benchmarks.map((benchmark) => `${benchmark.name}: ${benchmark.return >= 0 ? '+' : ''}${benchmark.return.toFixed(1)}% (α ${benchmark.alpha >= 0 ? '+' : ''}${benchmark.alpha.toFixed(2)}%)`).join(' | ')}` };
}
export function listCurrencies(): readonly CurrencyDefinition[] { return CURRENCIES.map((currency) => ({ ...currency })); }
export function getCurrencyRate(from: string, to: string): number | null {
  const source = normalizeCode(from, 'from'); const target = normalizeCode(to, 'to');
  const sourceRate = USD_RATES[source]; const targetRate = USD_RATES[target];
  if (sourceRate === undefined || targetRate === undefined) return null;
  return source === target ? 1 : targetRate / sourceRate;
}
export function convertCurrencyAmount(amount: number, from: string, to: string): CurrencyConversionResult | null {
  assertFiniteNumber(amount, 'amount'); const source = normalizeCode(from, 'from'); const target = normalizeCode(to, 'to'); const rate = getCurrencyRate(source, target);
  return rate === null ? null : { amount, from: source, to: target, convertedAmount: round(amount * rate), rate: round(rate) };
}

function assertFinite(value: number, name: string): void { if (!Number.isFinite(value)) throw new Error(`${name} must be finite`); }
function validateBook(book: PortfolioBook, name: string): void {
  if (book.holdings.length === 0) throw new Error(`${name} holdings must not be empty`);
  for (const [index, holding] of book.holdings.entries()) {
    if (!holding.sector.trim()) throw new Error(`${name} holding ${index} sector must not be empty`);
    assertFinite(holding.weight, `${name} holding ${index} weight`); assertFinite(holding.return, `${name} holding ${index} return`);
  }
}
function indexBySector(book: PortfolioBook): Map<string, PortfolioHolding> {
  const result = new Map<string, PortfolioHolding>();
  for (const holding of book.holdings) { if (result.has(holding.sector)) throw new Error(`duplicate sector holding: ${holding.sector}`); result.set(holding.sector, holding); }
  return result;
}
function allSectors(portfolio: PortfolioBook, benchmark: PortfolioBook): string[] { return [...new Set([...portfolio.holdings, ...benchmark.holdings].map((holding) => holding.sector))].sort(); }
function round(value: number): number { return Number(value.toFixed(8)); }
function activeReturn(portfolio: PortfolioBook, benchmark: PortfolioBook): number {
  return round(portfolio.holdings.reduce((sum, holding) => sum + holding.weight * holding.return, 0) - benchmark.holdings.reduce((sum, holding) => sum + holding.weight * holding.return, 0));
}

export function calculateBrinsonAttribution(portfolio: PortfolioBook, benchmark: PortfolioBook): BrinsonAttributionResult {
  validateBook(portfolio, 'portfolio'); validateBook(benchmark, 'benchmark');
  const portfolioBySector = indexBySector(portfolio); const benchmarkBySector = indexBySector(benchmark);
  let allocation = 0; let selection = 0; let interaction = 0;
  const bySector = allSectors(portfolio, benchmark).map((sector) => {
    const p = portfolioBySector.get(sector); const b = benchmarkBySector.get(sector);
    const wp = p?.weight ?? 0; const wb = b?.weight ?? 0; const rp = p?.return ?? 0; const rb = b?.return ?? 0;
    const a = (wp - wb) * rb; const s = wb * (rp - rb); const i = (wp - wb) * (rp - rb);
    allocation += a; selection += s; interaction += i;
    return { sector, allocation: round(a), selection: round(s), interaction: round(i) };
  });
  return { allocation: round(allocation), selection: round(selection), interaction: round(interaction), activeReturn: activeReturn(portfolio, benchmark), bySector };
}

const STYLE_FACTORS: readonly StyleFactorName[] = ['Size', 'Value', 'Momentum', 'Volatility'];
export function calculateStyleAttribution(input: StyleAttributionInput): StyleAttributionResult {
  assertFinite(input.activeReturn, 'activeReturn');
  const factors = STYLE_FACTORS.map((name) => {
    const portfolioExposure = input.portfolioExposures[name] ?? 0; const benchmarkExposure = input.benchmarkExposures[name] ?? 0; const factorReturn = input.factorReturns[name] ?? 0;
    assertFinite(portfolioExposure, `portfolioExposures.${name}`); assertFinite(benchmarkExposure, `benchmarkExposures.${name}`); assertFinite(factorReturn, `factorReturns.${name}`);
    return { name, portfolioExposure, benchmarkExposure, factorReturn, contribution: round((portfolioExposure - benchmarkExposure) * factorReturn) };
  });
  const explained = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  return { factors, activeReturn: round(input.activeReturn), residual: round(input.activeReturn - explained) };
}

export function calculateSectorAttribution(portfolio: PortfolioBook, benchmark: PortfolioBook, classification: SectorClassification): SectorAttributionResult {
  validateBook(portfolio, 'portfolio'); validateBook(benchmark, 'benchmark');
  const portfolioBySector = indexBySector(portfolio); const benchmarkBySector = indexBySector(benchmark);
  const sectors = allSectors(portfolio, benchmark).map((sector) => {
    const p = portfolioBySector.get(sector); const b = benchmarkBySector.get(sector); const wp = p?.weight ?? 0; const wb = b?.weight ?? 0; const rp = p?.return ?? 0; const rb = b?.return ?? 0;
    return { sector, weightDiff: round(wp - wb), sectorReturn: round(rp), benchmarkReturn: round(rb), contribution: round(wp * rp - wb * rb) };
  });
  return { classification, sectors, activeReturn: activeReturn(portfolio, benchmark) };
}

export function calculatePortfolioAttribution(input: PortfolioAttributionInput): PortfolioAttributionResult {
  assertFinite(input.portfolio.totalReturn, 'portfolio.totalReturn');
  assertFinite(input.benchmark.totalReturn, 'benchmark.totalReturn');
  const classification = input.sectorClassification ?? 'shenwan-l1';
  const brinson = calculateBrinsonAttribution(input.portfolio, input.benchmark);
  if (input.method === 'brinson') return { method: input.method, activeReturn: brinson.activeReturn, result: brinson };
  if (input.method === 'sector') {
    const sector = calculateSectorAttribution(input.portfolio, input.benchmark, classification);
    return { method: input.method, activeReturn: sector.activeReturn, result: sector };
  }
  if (input.method === 'style') {
    if (!input.style) throw new Error('style inputs are required for style attribution');
    const style = calculateStyleAttribution({ ...input.style, activeReturn: brinson.activeReturn });
    return { method: input.method, activeReturn: style.activeReturn, result: style };
  }
  const sector = calculateSectorAttribution(input.portfolio, input.benchmark, classification);
  const style = input.style ? calculateStyleAttribution({ ...input.style, activeReturn: brinson.activeReturn }) : undefined;
  return { method: input.method, activeReturn: brinson.activeReturn, result: { brinson, ...(style ? { style } : {}), sector } };
}
