export interface DcfInput {
  currentFcf: number;
  growthRate: number;
  discountRate: number;
  terminalGrowthRate: number;
  projectionYears: number;
  sharesOutstanding: number;
}

export interface DcfResult {
  enterpriseValue: number;
  fairValuePerShare: number;
  projectedCashFlows: readonly number[];
  terminalValue: number;
  assumptions: DcfInput;
}

export interface ProductionDcfInput {
  readonly current_fcf: number;
  readonly growth_rate: number;
  readonly discount_rate: number;
  readonly terminal_growth_rate: number;
  readonly projection_years?: number;
  readonly shares_outstanding?: number;
  readonly net_debt?: number;
}

export interface ProductionDcfResult {
  readonly intrinsic_value_per_share: number | null;
  readonly enterprise_value: number;
  readonly equity_value: number;
  readonly projected_fcf: readonly number[];
  readonly terminal_value: number;
  readonly pv_of_fcf: readonly number[];
  readonly pv_of_terminal: number;
  readonly shares_outstanding: number | null;
  readonly net_debt: number;
  readonly assumptions: {
    growth_rate: number;
    discount_rate: number;
    terminal_growth_rate: number;
    projection_years: number;
  };
}

export function calculateProductionDcf(input: ProductionDcfInput): ProductionDcfResult {
  const projectionYears = input.projection_years ?? 10;
  const netDebt = input.net_debt ?? 0;
  if (!Number.isFinite(input.current_fcf)) throw new Error('current_fcf must be finite');
  if (!Number.isFinite(input.growth_rate) || input.growth_rate < -0.5 || input.growth_rate > 1) throw new Error('growth_rate must be between -0.5 and 1');
  if (!Number.isFinite(input.discount_rate) || input.discount_rate < 0.01 || input.discount_rate > 0.5) throw new Error('discount_rate must be between 0.01 and 0.5');
  if (!Number.isFinite(input.terminal_growth_rate) || input.terminal_growth_rate < 0 || input.terminal_growth_rate > 0.1) throw new Error('terminal_growth_rate must be between 0 and 0.1');
  if (input.discount_rate <= input.terminal_growth_rate) throw new Error('discount_rate must exceed terminal_growth_rate');
  if (!Number.isInteger(projectionYears) || projectionYears < 1 || projectionYears > 30) throw new Error('projection_years must be 1-30');
  if (!Number.isFinite(netDebt)) throw new Error('net_debt must be finite');
  if (input.shares_outstanding !== undefined && (!Number.isFinite(input.shares_outstanding) || input.shares_outstanding <= 0)) throw new Error('shares_outstanding must be positive');
  const projectedFcf: number[] = [];
  const pvOfFcf: number[] = [];
  let fcf = input.current_fcf;
  let totalPvFcf = 0;
  for (let year = 1; year <= projectionYears; year++) {
    fcf *= 1 + input.growth_rate;
    projectedFcf.push(fcf);
    const presentValue = fcf / (1 + input.discount_rate) ** year;
    pvOfFcf.push(presentValue);
    totalPvFcf += presentValue;
  }
  const terminalValue = projectedFcf.at(-1)! * (1 + input.terminal_growth_rate) / (input.discount_rate - input.terminal_growth_rate);
  const pvOfTerminal = terminalValue / (1 + input.discount_rate) ** projectionYears;
  const enterpriseValue = totalPvFcf + pvOfTerminal;
  const equityValue = enterpriseValue - netDebt;
  return {
    intrinsic_value_per_share: input.shares_outstanding === undefined ? null : equityValue / input.shares_outstanding,
    enterprise_value: enterpriseValue,
    equity_value: equityValue,
    projected_fcf: projectedFcf,
    terminal_value: terminalValue,
    pv_of_fcf: pvOfFcf,
    pv_of_terminal: pvOfTerminal,
    shares_outstanding: input.shares_outstanding ?? null,
    net_debt: netDebt,
    assumptions: { growth_rate: input.growth_rate, discount_rate: input.discount_rate, terminal_growth_rate: input.terminal_growth_rate, projection_years: projectionYears },
  };
}

export interface ProductionDdmInput {
  readonly symbol: string;
  readonly current_dividend: number;
  readonly growth_rate: number;
  readonly required_return: number;
  readonly terminal_growth_rate: number;
  readonly projection_years?: number;
  readonly current_price?: number;
}

export interface ProductionDdmResult {
  readonly symbol: string;
  readonly target_price: number;
  readonly current_price?: number;
  readonly upside?: number;
  readonly upside_percent?: number;
  readonly projected_dividends: readonly number[];
  readonly present_value_of_dividends: number;
  readonly terminal_value: number;
  readonly present_value_of_terminal: number;
  readonly assumptions: {
    current_dividend: number;
    growth_rate: number;
    required_return: number;
    terminal_growth_rate: number;
    projection_years: number;
  };
}

export function calculateProductionDdm(input: ProductionDdmInput): ProductionDdmResult {
  const projectionYears = input.projection_years ?? 5;
  if (!input.symbol.trim()) throw new Error('symbol must not be empty');
  if (!Number.isFinite(input.current_dividend) || input.current_dividend <= 0) throw new Error('current_dividend must be positive');
  if (!Number.isFinite(input.growth_rate) || input.growth_rate < -0.5 || input.growth_rate > 1) throw new Error('growth_rate must be between -0.5 and 1');
  if (!Number.isFinite(input.required_return) || input.required_return <= 0 || input.required_return > 1) throw new Error('required_return must be between 0 and 1');
  if (!Number.isFinite(input.terminal_growth_rate) || input.terminal_growth_rate < -0.5 || input.terminal_growth_rate > 0.5) throw new Error('terminal_growth_rate must be between -0.5 and 0.5');
  if (input.required_return <= input.terminal_growth_rate) throw new Error('required_return must be greater than terminal_growth_rate');
  if (!Number.isInteger(projectionYears) || projectionYears < 1 || projectionYears > 50) throw new Error('projection_years must be 1-50');
  if (input.current_price !== undefined && (!Number.isFinite(input.current_price) || input.current_price <= 0)) throw new Error('current_price must be positive');
  const projectedDividends: number[] = [];
  let dividend = input.current_dividend;
  let presentValueOfDividends = 0;
  for (let year = 1; year <= projectionYears; year++) {
    dividend *= 1 + input.growth_rate;
    projectedDividends.push(dividend);
    presentValueOfDividends += dividend / (1 + input.required_return) ** year;
  }
  const terminalValue = dividend * (1 + input.terminal_growth_rate) / (input.required_return - input.terminal_growth_rate);
  const presentValueOfTerminal = terminalValue / (1 + input.required_return) ** projectionYears;
  const targetPrice = presentValueOfDividends + presentValueOfTerminal;
  const optionalPrice = input.current_price === undefined ? {} : {
    current_price: input.current_price,
    upside: Number((targetPrice - input.current_price).toFixed(2)),
    upside_percent: Number(((targetPrice / input.current_price - 1) * 100).toFixed(2)),
  };
  const result: ProductionDdmResult = {
    symbol: input.symbol,
    target_price: Number(targetPrice.toFixed(2)),
    ...optionalPrice,
    projected_dividends: projectedDividends.map((value) => Number(value.toFixed(2))),
    present_value_of_dividends: Number(presentValueOfDividends.toFixed(2)),
    terminal_value: Number(terminalValue.toFixed(2)),
    present_value_of_terminal: Number(presentValueOfTerminal.toFixed(2)),
    assumptions: { current_dividend: input.current_dividend, growth_rate: input.growth_rate, required_return: input.required_return, terminal_growth_rate: input.terminal_growth_rate, projection_years: projectionYears },
  };
  return result;
}

export interface AnalysisBar {
  date: string;
  close: number;
}

export interface TechnicalSignal {
  trend: 'bullish' | 'bearish' | 'neutral';
  latestClose: number;
  movingAverage: number;
  distancePercent: number;
  observations: number;
}

export interface ValuationRatiosInput {
  readonly price: number;
  readonly eps: number;
  readonly book_value_per_share?: number;
  readonly cash_flow_per_share?: number;
  readonly shares_outstanding?: number;
  readonly total_equity?: number;
  readonly operating_cash_flow?: number;
}

export interface ValuationRatiosResult {
  readonly pe_ratio: number | null;
  readonly pb_ratio: number | null;
  readonly pcf_ratio: number | null;
  readonly market_cap: number | null;
  readonly price: number;
}

export function calculateValuationRatios(input: ValuationRatiosInput): ValuationRatiosResult {
  if (!Number.isFinite(input.price) || input.price <= 0) throw new Error('price must be positive');
  if (!Number.isFinite(input.eps)) throw new Error('eps must be finite');
  const shares = input.shares_outstanding;
  if (shares !== undefined && (!Number.isFinite(shares) || shares <= 0)) throw new Error('shares_outstanding must be positive');
  const bookValuePerShare = input.book_value_per_share ?? (shares !== undefined && input.total_equity !== undefined ? input.total_equity / shares : undefined);
  const cashFlowPerShare = input.cash_flow_per_share ?? (shares !== undefined && input.operating_cash_flow !== undefined ? input.operating_cash_flow / shares : undefined);
  return {
    pe_ratio: input.eps !== 0 ? input.price / input.eps : null,
    pb_ratio: bookValuePerShare !== undefined && bookValuePerShare !== 0 ? input.price / bookValuePerShare : null,
    pcf_ratio: cashFlowPerShare !== undefined && cashFlowPerShare !== 0 ? input.price / cashFlowPerShare : null,
    market_cap: shares === undefined ? null : input.price * shares,
    price: input.price,
  };
}

export interface PeerMetric {
  readonly name: string;
  readonly pe_ratio?: number | null;
  readonly pb_ratio?: number | null;
  readonly roe?: number | null;
  readonly revenue_growth?: number | null;
  readonly profit_margin?: number | null;
}

export interface PeerComparisonInput {
  readonly target: PeerMetric;
  readonly peers: readonly PeerMetric[];
}

export interface PeerMetricStats {
  readonly target: number | null;
  readonly peer_avg: number;
  readonly peer_min: number;
  readonly peer_max: number;
  readonly percentile: number | null;
}

export interface PeerComparisonResult {
  readonly metrics: Readonly<Record<string, PeerMetricStats>>;
  readonly summary: string;
}

const peerMetricKeys = ['pe_ratio', 'pb_ratio', 'roe', 'revenue_growth', 'profit_margin'] as const;

export function comparePeers(input: PeerComparisonInput): PeerComparisonResult {
  if (!input.target.name.trim()) throw new Error('target.name must not be empty');
  if (input.peers.length < 1 || input.peers.length > 20) throw new Error('peers must contain 1-20 companies');
  const metrics: Record<string, PeerMetricStats> = {};
  for (const key of peerMetricKeys) {
    const targetValue = input.target[key] ?? null;
    const peerValues = input.peers.map((peer) => peer[key]).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    if (targetValue === null && peerValues.length === 0) continue;
    const average = peerValues.length ? peerValues.reduce((sum, value) => sum + value, 0) / peerValues.length : 0;
    metrics[key] = {
      target: targetValue,
      peer_avg: average,
      peer_min: peerValues.length ? Math.min(...peerValues) : 0,
      peer_max: peerValues.length ? Math.max(...peerValues) : 0,
      percentile: targetValue === null || peerValues.length === 0 ? null : (peerValues.filter((value) => value < targetValue).length / peerValues.length) * 100,
    };
  }
  const lines = Object.entries(metrics).flatMap(([key, stats]) => {
    if (stats.target === null || stats.peer_avg <= 0) return [];
    const difference = ((stats.target - stats.peer_avg) / stats.peer_avg) * 100;
    return [`${key}: ${stats.target.toFixed(2)} (${difference >= 0 ? 'above' : 'below'} peer avg by ${Math.abs(difference).toFixed(1)}%)`];
  });
  return { metrics, summary: lines.length ? `Peer Comparison Summary:\n${lines.join('\n')}` : 'Insufficient data for peer comparison.' };
}

export type TargetPriceMethod = 'dcf' | 'pe' | 'sotp' | 'combined';
export interface TargetPriceComponent { readonly name: string; readonly value: number; readonly weight: number; }
export interface TargetPriceInput {
  readonly symbol: string;
  readonly currentPrice: number;
  readonly method?: TargetPriceMethod;
  readonly currentEps?: number;
  readonly growthRate?: number;
  readonly discountRate?: number;
  readonly terminalGrowthRate?: number;
  readonly projectionYears?: number;
  readonly forwardEps?: number;
  readonly targetPe?: number;
  readonly peYears?: number;
  readonly components?: readonly TargetPriceComponent[];
}
export interface TargetPriceResult {
  readonly symbol: string;
  readonly method: TargetPriceMethod;
  readonly currentPrice: number;
  readonly targetPrice: number;
  readonly upside: number;
  readonly upsidePercent: number;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly details: Readonly<Record<string, number>>;
}

const roundTo = (value: number, digits: number): number => Number(value.toFixed(digits));
function targetPriceFromDcf(input: Required<Pick<TargetPriceInput, 'symbol' | 'currentPrice' | 'currentEps' | 'growthRate' | 'discountRate' | 'terminalGrowthRate' | 'projectionYears'>>): TargetPriceResult {
  if (input.discountRate <= input.terminalGrowthRate) throw new Error('discountRate must exceed terminalGrowthRate');
  let projectedFcf = input.currentEps * 10;
  let presentValue = 0;
  for (let year = 1; year <= input.projectionYears; year++) {
    projectedFcf *= 1 + input.growthRate;
    presentValue += projectedFcf / (1 + input.discountRate) ** year;
  }
  const terminalValue = projectedFcf * (1 + input.terminalGrowthRate) / (input.discountRate - input.terminalGrowthRate);
  const targetPrice = presentValue + terminalValue / (1 + input.discountRate) ** input.projectionYears;
  return makeTargetPriceResult(input.symbol, input.currentPrice, 'dcf', targetPrice, input.growthRate > 0.05 && input.growthRate < 0.4 ? 'high' : input.growthRate > 0 && input.growthRate < 0.5 ? 'medium' : 'low', {
    'Current EPS': input.currentEps, 'Growth Rate': input.growthRate * 100, 'Discount Rate': input.discountRate * 100,
    'Terminal Growth': input.terminalGrowthRate * 100, 'Projection Years': input.projectionYears,
    'PV of Cash Flows': roundTo(presentValue, 2), 'PV of Terminal Value': roundTo(terminalValue / (1 + input.discountRate) ** input.projectionYears, 2),
  });
}
function targetPriceFromPe(symbol: string, currentPrice: number, currentEps: number, forwardEps: number, targetPe: number, years: number): TargetPriceResult {
  const currentPe = currentPrice / currentEps;
  const targetPrice = forwardEps * targetPe;
  return makeTargetPriceResult(symbol, currentPrice, 'pe', targetPrice, targetPe >= 10 && targetPe <= 40 ? 'high' : targetPe >= 5 && targetPe <= 60 ? 'medium' : 'low', {
    'Current PE': roundTo(currentPe, 1), 'Target PE': targetPe, 'Current EPS': currentEps, 'Forward EPS': forwardEps,
    'EPS CAGR': roundTo((Math.pow(forwardEps / currentEps, 1 / years) - 1) * 100, 1), 'Years to Target': years,
  });
}
function targetPriceFromSotp(symbol: string, currentPrice: number, components: readonly TargetPriceComponent[]): TargetPriceResult {
  if (!components.length) throw new Error('SOTP method requires components');
  const targetPrice = components.reduce((sum, component) => sum + component.value * component.weight, 0);
  return makeTargetPriceResult(symbol, currentPrice, 'sotp', targetPrice, components.length >= 3 ? 'high' : components.length >= 2 ? 'medium' : 'low', { 'Component Count': components.length, ...Object.fromEntries(components.map((component) => [component.name, component.value])) });
}
function makeTargetPriceResult(symbol: string, currentPrice: number, method: TargetPriceMethod, targetPrice: number, confidence: 'low' | 'medium' | 'high', details: Readonly<Record<string, number>>): TargetPriceResult {
  return { symbol, method, currentPrice, targetPrice: roundTo(targetPrice, 2), upside: roundTo(targetPrice - currentPrice, 2), upsidePercent: roundTo((targetPrice / currentPrice - 1) * 100, 1), confidence, details };
}
export function calculateTargetPrice(input: TargetPriceInput): TargetPriceResult {
  const symbol = input.symbol.trim();
  if (!symbol) throw new Error('symbol must not be empty');
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) throw new Error('currentPrice must be positive');
  const method = input.method ?? 'combined';
  const currentEps = input.currentEps ?? 2;
  const growthRate = input.growthRate ?? 0.15;
  const discountRate = input.discountRate ?? 0.1;
  const terminalGrowthRate = input.terminalGrowthRate ?? 0.03;
  const projectionYears = input.projectionYears ?? 5;
  const forwardEps = input.forwardEps ?? currentEps * (1 + growthRate);
  const targetPe = input.targetPe ?? 20;
  const peYears = input.peYears ?? 3;
  if (!Number.isFinite(currentEps) || currentEps <= 0) throw new Error('currentEps must be positive');
  if (!Number.isFinite(forwardEps) || forwardEps <= 0) throw new Error('forwardEps must be positive');
  if (!Number.isFinite(peYears) || peYears <= 0) throw new Error('peYears must be positive');
  const dcf = () => targetPriceFromDcf({ symbol, currentPrice: input.currentPrice, currentEps, growthRate, discountRate, terminalGrowthRate, projectionYears });
  const pe = () => targetPriceFromPe(symbol, input.currentPrice, currentEps, forwardEps, targetPe, peYears);
  if (method === 'dcf') return dcf();
  if (method === 'pe') return pe();
  if (method === 'sotp') return targetPriceFromSotp(symbol, input.currentPrice, input.components ?? []);
  const sotp = input.components?.length ? targetPriceFromSotp(symbol, input.currentPrice, input.components).targetPrice : (dcf().targetPrice + pe().targetPrice) / 2;
  const dcfTarget = dcf().targetPrice;
  const peTarget = pe().targetPrice;
  return makeTargetPriceResult(symbol, input.currentPrice, 'combined', (dcfTarget + peTarget + sotp) / 3, 'high', { 'DCF Target': dcfTarget, 'PE Target': peTarget, 'SOTP Target': sotp, 'Method Avg': roundTo((dcfTarget + peTarget + sotp) / 3, 2) });
}
export function calculateQuickTargetPrice(input: { readonly symbol: string; readonly currentPrice: number; readonly currentEps: number; readonly forwardEps: number; readonly growthRate: number }): TargetPriceResult {
  const targetPe = Math.min(Math.max((1 + input.growthRate) * 100, 10), 50);
  return targetPriceFromPe(input.symbol.trim(), input.currentPrice, input.currentEps, input.forwardEps, targetPe, 3);
}

export function calculateDcf(input: DcfInput): DcfResult {
  if (!Number.isFinite(input.currentFcf) || input.currentFcf <= 0) throw new Error('currentFcf must be positive');
  if (!Number.isInteger(input.projectionYears) || input.projectionYears < 1 || input.projectionYears > 20) throw new Error('projectionYears must be 1-20');
  if (!Number.isFinite(input.sharesOutstanding) || input.sharesOutstanding <= 0) throw new Error('sharesOutstanding must be positive');
  if (input.discountRate <= input.terminalGrowthRate) throw new Error('discountRate must exceed terminalGrowthRate');
  const projectedCashFlows = Array.from({ length: input.projectionYears }, (_, index) => input.currentFcf * (1 + input.growthRate) ** (index + 1));
  const discountedCashFlows = projectedCashFlows.map((cashFlow, index) => cashFlow / (1 + input.discountRate) ** (index + 1));
  const terminalValue = projectedCashFlows.at(-1)! * (1 + input.terminalGrowthRate) / (input.discountRate - input.terminalGrowthRate);
  const enterpriseValue = discountedCashFlows.reduce((sum, value) => sum + value, 0) + terminalValue / (1 + input.discountRate) ** input.projectionYears;
  return {
    enterpriseValue: Number(enterpriseValue.toFixed(4)),
    fairValuePerShare: Number((enterpriseValue / input.sharesOutstanding).toFixed(4)),
    projectedCashFlows: projectedCashFlows.map((value) => Number(value.toFixed(4))),
    terminalValue: Number(terminalValue.toFixed(4)),
    assumptions: { ...input },
  };
}

export function calculateTechnicalSignal(bars: readonly AnalysisBar[]): TechnicalSignal {
  if (bars.length < 3) throw new Error('at least three observations are required');
  const latestClose = bars.at(-1)!.close;
  const movingAverage = bars.reduce((sum, bar) => sum + bar.close, 0) / bars.length;
  const distancePercent = ((latestClose - movingAverage) / movingAverage) * 100;
  const trend = distancePercent >= 2 ? 'bullish' : distancePercent <= -2 ? 'bearish' : 'neutral';
  return { trend, latestClose: Number(latestClose.toFixed(4)), movingAverage: Number(movingAverage.toFixed(4)), distancePercent: Number(distancePercent.toFixed(4)), observations: bars.length };
}

export interface OptionPricingInput {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiry: number;
  readonly riskFreeRate: number;
  readonly volatility: number;
  readonly optionType: 'call' | 'put';
}

export interface OptionPricingResult {
  readonly price: number;
  readonly delta: number;
  readonly gamma: number;
  readonly theta: number;
  readonly vega: number;
  readonly rho: number;
}

function normalCdf(value: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + p * scaled);
  const polynomial = (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t);
  return 0.5 * (1 + sign * (1 - polynomial * Math.exp(-scaled * scaled)));
}

function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function validateOptionInput(input: OptionPricingInput): void {
  for (const [name, value] of Object.entries(input)) {
    if (name === 'optionType') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  }
  if (input.spotPrice <= 0 || input.strikePrice <= 0 || input.timeToExpiry <= 0 || input.volatility <= 0) throw new Error('spotPrice, strikePrice, timeToExpiry, and volatility must be positive');
}

export function calculateOptionPrice(input: OptionPricingInput): OptionPricingResult {
  validateOptionInput(input);
  const time = input.timeToExpiry / 365;
  const rootTime = Math.sqrt(time);
  const d1 = (Math.log(input.spotPrice / input.strikePrice) + (input.riskFreeRate + 0.5 * input.volatility ** 2) * time) / (input.volatility * rootTime);
  const d2 = d1 - input.volatility * rootTime;
  const nd1 = normalPdf(d1);
  const callPrice = input.spotPrice * normalCdf(d1) - input.strikePrice * Math.exp(-input.riskFreeRate * time) * normalCdf(d2);
  const putPrice = input.strikePrice * Math.exp(-input.riskFreeRate * time) * normalCdf(-d2) - input.spotPrice * normalCdf(-d1);
  const discount = Math.exp(-input.riskFreeRate * time);
  const call = input.optionType === 'call';
  return {
    price: call ? callPrice : putPrice,
    delta: call ? normalCdf(d1) : normalCdf(d1) - 1,
    gamma: nd1 / (input.spotPrice * input.volatility * rootTime),
    theta: (-input.spotPrice * nd1 * input.volatility / (2 * rootTime) - input.riskFreeRate * input.strikePrice * discount * (call ? normalCdf(d2) : normalCdf(-d2))) / 365,
    vega: input.spotPrice * nd1 * rootTime / 100,
    rho: input.strikePrice * time * discount * (call ? normalCdf(d2) : -normalCdf(-d2)) / 100,
  };
}

export function calculateImpliedVolatility(input: Omit<OptionPricingInput, 'volatility'> & { readonly marketPrice: number }): number {
  if (!Number.isFinite(input.marketPrice) || input.marketPrice <= 0) throw new Error('marketPrice must be positive');
  let volatility = 0.3;
  for (let iteration = 0; iteration < 100; iteration++) {
    const priced = calculateOptionPrice({ ...input, volatility });
    const difference = input.marketPrice - priced.price;
    if (Math.abs(difference) < 0.001) return volatility;
    if (priced.vega <= 1e-8) break;
    volatility = Math.min(5, Math.max(0.001, volatility + difference / (priced.vega * 100)));
  }
  return volatility;
}

export interface TechnicalBar {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface TechnicalIndicatorResult {
  readonly indicator: string;
  readonly values: readonly { readonly date: string; readonly value: number | Readonly<Record<string, number>> }[];
  readonly signal: string;
}

function roundIndicator(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateTechnicalBars(data: readonly TechnicalBar[], minimum = 14): void {
  if (data.length < minimum) throw new Error(`at least ${minimum} OHLCV observations are required`);
  for (const bar of data) {
    if (!bar.date || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)) throw new Error('OHLCV data must contain finite values');
    if (bar.high < bar.low || bar.volume < 0) throw new Error('OHLCV high/low and volume values are invalid');
  }
}

export function calculateKdj(data: readonly TechnicalBar[]): TechnicalIndicatorResult {
  validateTechnicalBars(data, 9);
  const values: { date: string; value: Record<string, number> }[] = [];
  let previousK = 50;
  let previousD = 50;
  for (let index = 8; index < data.length; index++) {
    const window = data.slice(index - 8, index + 1);
    const high = Math.max(...window.map((bar) => bar.high));
    const low = Math.min(...window.map((bar) => bar.low));
    const rsv = high === low ? 50 : ((data[index].close - low) / (high - low)) * 100;
    const k = (2 * previousK + rsv) / 3;
    const d = (2 * previousD + k) / 3;
    previousK = k;
    previousD = d;
    values.push({ date: data[index].date, value: { K: roundIndicator(k), D: roundIndicator(d), J: roundIndicator(3 * k - 2 * d) } });
  }
  const latest = values.at(-1)?.value;
  const signal = !latest ? 'NEUTRAL' : latest.K > 80 && latest.D > 80 ? 'OVERBOUGHT' : latest.K < 20 && latest.D < 20 ? 'OVERSOLD' : latest.K > latest.D ? 'BULLISH' : 'BEARISH';
  return { indicator: 'KDJ', values: values.slice(-20), signal };
}

export function calculateBoll(data: readonly TechnicalBar[]): TechnicalIndicatorResult {
  validateTechnicalBars(data, 20);
  const values: { date: string; value: Record<string, number> }[] = [];
  for (let index = 19; index < data.length; index++) {
    const closes = data.slice(index - 19, index + 1).map((bar) => bar.close);
    const middle = closes.reduce((sum, value) => sum + value, 0) / closes.length;
    const deviation = Math.sqrt(closes.reduce((sum, value) => sum + (value - middle) ** 2, 0) / closes.length);
    const upper = middle + 2 * deviation;
    const lower = middle - 2 * deviation;
    values.push({ date: data[index].date, value: { upper: roundIndicator(upper), middle: roundIndicator(middle), lower: roundIndicator(lower), bandwidth: roundIndicator(middle === 0 ? 0 : ((upper - lower) / middle) * 100), percentB: roundIndicator(upper === lower ? 50 : ((data[index].close - lower) / (upper - lower)) * 100) } });
  }
  const latest = values.at(-1)?.value;
  const signal = !latest ? 'NEUTRAL' : latest.percentB > 100 ? 'ABOVE_UPPER_BAND' : latest.percentB < 0 ? 'BELOW_LOWER_BAND' : latest.bandwidth < 5 ? 'SQUEEZE' : 'NEUTRAL';
  return { indicator: 'BOLL', values: values.slice(-20), signal };
}

export function calculateWr(data: readonly TechnicalBar[]): TechnicalIndicatorResult {
  validateTechnicalBars(data, 14);
  const values: { date: string; value: number }[] = [];
  for (let index = 13; index < data.length; index++) {
    const window = data.slice(index - 13, index + 1);
    const high = Math.max(...window.map((bar) => bar.high));
    const low = Math.min(...window.map((bar) => bar.low));
    values.push({ date: data[index].date, value: roundIndicator(high === low ? -50 : ((high - data[index].close) / (high - low)) * -100) });
  }
  const latest = values.at(-1)?.value;
  return { indicator: 'WR', values: values.slice(-20), signal: latest === undefined ? 'NEUTRAL' : latest > -20 ? 'OVERBOUGHT' : latest < -80 ? 'OVERSOLD' : 'NEUTRAL' };
}

export function calculateCci(data: readonly TechnicalBar[]): TechnicalIndicatorResult {
  validateTechnicalBars(data, 20);
  const values: { date: string; value: number }[] = [];
  const typical = data.map((bar) => (bar.high + bar.low + bar.close) / 3);
  for (let index = 19; index < data.length; index++) {
    const window = typical.slice(index - 19, index + 1);
    const average = window.reduce((sum, value) => sum + value, 0) / window.length;
    const meanDeviation = window.reduce((sum, value) => sum + Math.abs(value - average), 0) / window.length;
    values.push({ date: data[index].date, value: roundIndicator(meanDeviation === 0 ? 0 : (typical[index] - average) / (0.015 * meanDeviation)) });
  }
  const latest = values.at(-1)?.value;
  return { indicator: 'CCI', values: values.slice(-20), signal: latest === undefined ? 'NEUTRAL' : latest > 100 ? 'OVERBOUGHT' : latest < -100 ? 'OVERSOLD' : 'NEUTRAL' };
}

export function calculateAtr(data: readonly TechnicalBar[]): TechnicalIndicatorResult {
  validateTechnicalBars(data, 14);
  const values: { date: string; value: number }[] = [];
  const ranges = data.map((bar, index) => index === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - data[index - 1].close), Math.abs(bar.low - data[index - 1].close)));
  let average = ranges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
  values.push({ date: data[13].date, value: average });
  for (let index = 14; index < data.length; index++) {
    average = (average * 13 + ranges[index]) / 14;
    values.push({ date: data[index].date, value: average });
  }
  const recent = values.slice(-20).map((item) => ({ ...item, value: roundIndicator(item.value) }));
  const latest = recent.at(-1)?.value ?? 0;
  const baseline = recent.reduce((sum, item) => sum + item.value, 0) / recent.length;
  return { indicator: 'ATR', values: recent, signal: latest > baseline * 1.5 ? 'HIGH_VOLATILITY' : latest < baseline * 0.5 ? 'LOW_VOLATILITY' : 'NORMAL' };
}

export function calculateObv(data: readonly TechnicalBar[]): TechnicalIndicatorResult {
  validateTechnicalBars(data, 2);
  let obv = 0;
  const values: { date: string; value: number }[] = [];
  for (let index = 0; index < data.length; index++) {
    if (index === 0) obv = data[index].volume;
    else if (data[index].close > data[index - 1].close) obv += data[index].volume;
    else if (data[index].close < data[index - 1].close) obv -= data[index].volume;
    values.push({ date: data[index].date, value: roundIndicator(obv) });
  }
  const recent = values.slice(-5);
  const signal = recent.length < 2 ? 'NEUTRAL' : recent.at(-1)!.value > recent[0].value ? 'BULLISH_DIVERGENCE' : 'BEARISH_DIVERGENCE';
  return { indicator: 'OBV', values: values.slice(-20), signal };
}

export interface DecisionDashboardInput {
  readonly symbol: string;
  readonly technical?: {
    readonly trend?: 'uptrend' | 'downtrend' | 'sideways';
    readonly rsi?: number;
    readonly macd_signal?: 'bullish' | 'bearish' | 'neutral';
    readonly support_distance_pct?: number;
  };
  readonly fundamental?: {
    readonly pe_ratio?: number;
    readonly pb_ratio?: number;
    readonly roe?: number;
    readonly revenue_growth?: number;
    readonly profit_margin?: number;
  };
  readonly sentiment?: {
    readonly news_sentiment?: 'positive' | 'negative' | 'neutral';
    readonly analyst_rating?: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
    readonly social_buzz?: 'bullish' | 'bearish' | 'neutral';
  };
  readonly risk?: {
    readonly volatility?: number;
    readonly beta?: number;
    readonly max_drawdown?: number;
    readonly debt_to_equity?: number;
  };
}

export interface DecisionDimensionScore {
  readonly label: string;
  readonly score: number;
  readonly weight: number;
  readonly details: readonly string[];
}

export interface DecisionDashboardResult {
  readonly symbol: string;
  readonly signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  readonly overall_score: number;
  readonly dimensions: readonly DecisionDimensionScore[];
  readonly recommendation: string;
  readonly report: string;
}

function clampDecisionScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function scoreDecisionTechnical(input: NonNullable<DecisionDashboardInput['technical']>): DecisionDimensionScore {
  const details: string[] = [];
  let score = 50;
  if (input.trend === 'uptrend') { score += 15; details.push('Uptrend (+15)'); }
  else if (input.trend === 'downtrend') { score -= 15; details.push('Downtrend (-15)'); }
  else if (input.trend === 'sideways') details.push('Sideways (0)');
  if (input.rsi !== undefined) {
    if (input.rsi < 30) { score += 20; details.push(`RSI ${input.rsi.toFixed(1)} oversold (+20)`); }
    else if (input.rsi < 40) { score += 10; details.push(`RSI ${input.rsi.toFixed(1)} approaching oversold (+10)`); }
    else if (input.rsi > 70) { score -= 20; details.push(`RSI ${input.rsi.toFixed(1)} overbought (-20)`); }
    else if (input.rsi > 60) { score -= 5; details.push(`RSI ${input.rsi.toFixed(1)} elevated (-5)`); }
    else details.push(`RSI ${input.rsi.toFixed(1)} neutral (0)`);
  }
  if (input.macd_signal === 'bullish') { score += 10; details.push('MACD bullish (+10)'); }
  else if (input.macd_signal === 'bearish') { score -= 10; details.push('MACD bearish (-10)'); }
  if (input.support_distance_pct !== undefined) {
    if (input.support_distance_pct < 2) { score += 5; details.push('Near support (+5)'); }
    else if (input.support_distance_pct > 15) { score -= 5; details.push('Far from support (-5)'); }
  }
  return { label: 'Technical', score: clampDecisionScore(score), weight: 0.25, details };
}

function scoreDecisionFundamental(input: NonNullable<DecisionDashboardInput['fundamental']>): DecisionDimensionScore {
  const details: string[] = [];
  let score = 50;
  if (input.pe_ratio !== undefined) {
    if (input.pe_ratio < 0) { score -= 10; details.push(`PE ${input.pe_ratio.toFixed(1)} negative (-10)`); }
    else if (input.pe_ratio < 10) { score += 15; details.push(`PE ${input.pe_ratio.toFixed(1)} cheap (+15)`); }
    else if (input.pe_ratio < 20) { score += 5; details.push(`PE ${input.pe_ratio.toFixed(1)} fair (+5)`); }
    else if (input.pe_ratio < 35) { score -= 5; details.push(`PE ${input.pe_ratio.toFixed(1)} elevated (-5)`); }
    else { score -= 15; details.push(`PE ${input.pe_ratio.toFixed(1)} expensive (-15)`); }
  }
  if (input.pb_ratio !== undefined) {
    if (input.pb_ratio < 1) { score += 10; details.push(`PB ${input.pb_ratio.toFixed(2)} below book (+10)`); }
    else if (input.pb_ratio < 3) details.push(`PB ${input.pb_ratio.toFixed(2)} fair (0)`);
    else { score -= 10; details.push(`PB ${input.pb_ratio.toFixed(2)} expensive (-10)`); }
  }
  if (input.roe !== undefined) {
    if (input.roe > 0.2) { score += 15; details.push(`ROE ${(input.roe * 100).toFixed(1)}% excellent (+15)`); }
    else if (input.roe > 0.1) { score += 5; details.push(`ROE ${(input.roe * 100).toFixed(1)}% good (+5)`); }
    else if (input.roe > 0) details.push(`ROE ${(input.roe * 100).toFixed(1)}% low (0)`);
    else { score -= 10; details.push(`ROE ${(input.roe * 100).toFixed(1)}% negative (-10)`); }
  }
  if (input.revenue_growth !== undefined) {
    if (input.revenue_growth > 0.2) { score += 10; details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% high (+10)`); }
    else if (input.revenue_growth > 0.05) { score += 5; details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% moderate (+5)`); }
    else if (input.revenue_growth > 0) details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% slow (0)`);
    else { score -= 10; details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% declining (-10)`); }
  }
  if (input.profit_margin !== undefined) {
    if (input.profit_margin > 0.2) { score += 10; details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% strong (+10)`); }
    else if (input.profit_margin > 0.1) { score += 5; details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% decent (+5)`); }
    else if (input.profit_margin > 0) details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% thin (0)`);
    else { score -= 15; details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% negative (-15)`); }
  }
  return { label: 'Fundamental', score: clampDecisionScore(score), weight: 0.35, details };
}

function scoreDecisionSentiment(input: NonNullable<DecisionDashboardInput['sentiment']>): DecisionDimensionScore {
  const details: string[] = [];
  let score = 50;
  if (input.news_sentiment === 'positive') { score += 15; details.push('News positive (+15)'); }
  else if (input.news_sentiment === 'negative') { score -= 15; details.push('News negative (-15)'); }
  else if (input.news_sentiment === 'neutral') details.push('News neutral (0)');
  if (input.analyst_rating === 'strong_buy') { score += 20; details.push('Analysts: Strong Buy (+20)'); }
  else if (input.analyst_rating === 'buy') { score += 10; details.push('Analysts: Buy (+10)'); }
  else if (input.analyst_rating === 'sell') { score -= 15; details.push('Analysts: Sell (-15)'); }
  else if (input.analyst_rating === 'strong_sell') { score -= 20; details.push('Analysts: Strong Sell (-20)'); }
  else if (input.analyst_rating === 'hold') details.push('Analysts: Hold (0)');
  if (input.social_buzz === 'bullish') { score += 5; details.push('Social bullish (+5)'); }
  else if (input.social_buzz === 'bearish') { score -= 5; details.push('Social bearish (-5)'); }
  return { label: 'Sentiment', score: clampDecisionScore(score), weight: 0.15, details };
}

function scoreDecisionRisk(input: NonNullable<DecisionDashboardInput['risk']>): DecisionDimensionScore {
  const details: string[] = [];
  let score = 50;
  if (input.volatility !== undefined) {
    if (input.volatility < 0.15) { score += 15; details.push(`Volatility ${(input.volatility * 100).toFixed(1)}% low (+15)`); }
    else if (input.volatility < 0.3) details.push(`Volatility ${(input.volatility * 100).toFixed(1)}% moderate (0)`);
    else { score -= 15; details.push(`Volatility ${(input.volatility * 100).toFixed(1)}% high (-15)`); }
  }
  if (input.beta !== undefined) {
    if (input.beta < 0.8) { score += 10; details.push(`Beta ${input.beta.toFixed(2)} defensive (+10)`); }
    else if (input.beta < 1.2) details.push(`Beta ${input.beta.toFixed(2)} market-like (0)`);
    else { score -= 10; details.push(`Beta ${input.beta.toFixed(2)} aggressive (-10)`); }
  }
  if (input.max_drawdown !== undefined) {
    const drawdown = Math.abs(input.max_drawdown);
    if (drawdown < 0.1) { score += 10; details.push(`Max DD ${(drawdown * 100).toFixed(1)}% shallow (+10)`); }
    else if (drawdown < 0.3) details.push(`Max DD ${(drawdown * 100).toFixed(1)}% moderate (0)`);
    else { score -= 15; details.push(`Max DD ${(drawdown * 100).toFixed(1)}% severe (-15)`); }
  }
  if (input.debt_to_equity !== undefined) {
    if (input.debt_to_equity < 0.3) { score += 10; details.push(`D/E ${input.debt_to_equity.toFixed(2)} low (+10)`); }
    else if (input.debt_to_equity < 1) details.push(`D/E ${input.debt_to_equity.toFixed(2)} moderate (0)`);
    else { score -= 10; details.push(`D/E ${input.debt_to_equity.toFixed(2)} high (-10)`); }
  }
  return { label: 'Risk', score: clampDecisionScore(score), weight: 0.25, details };
}

function decisionSignal(score: number): DecisionDashboardResult['signal'] {
  if (score >= 80) return 'STRONG_BUY';
  if (score >= 65) return 'BUY';
  if (score >= 40) return 'HOLD';
  if (score >= 25) return 'SELL';
  return 'STRONG_SELL';
}

function decisionRecommendation(signal: DecisionDashboardResult['signal']): string {
  if (signal === 'STRONG_BUY') return 'Strong conviction to buy. Multiple factors aligned positively.';
  if (signal === 'BUY') return 'Moderate conviction to buy. Most factors are positive.';
  if (signal === 'HOLD') return 'No strong signal. Maintain current position and monitor.';
  if (signal === 'SELL') return 'Moderate conviction to sell. Several factors are negative.';
  return 'Strong conviction to sell. Multiple risks identified.';
}

function decisionReport(result: Omit<DecisionDashboardResult, 'report'>): string {
  const icons: Record<DecisionDashboardResult['signal'], string> = { STRONG_BUY: '🟢🟢', BUY: '🟢', HOLD: '🟡', SELL: '🔴', STRONG_SELL: '🔴🔴' };
  const lines = [`# ${result.symbol} Decision Dashboard`, '', `## Signal: ${icons[result.signal]} ${result.signal}`, `**Overall Score: ${result.overall_score.toFixed(1)}/100**`, '', '---', ''];
  for (const dimension of result.dimensions) {
    const blocks = Math.round(dimension.score / 10);
    const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
    const icon = dimension.score >= 65 ? '✅' : dimension.score >= 40 ? '⚠️' : '❌';
    lines.push(`### ${icon} ${dimension.label} (${dimension.score.toFixed(1)}/100, weight: ${(dimension.weight * 100).toFixed(0)}%)`, `[${bar}]`);
    for (const detail of dimension.details) lines.push(`  - ${detail}`);
    lines.push('');
  }
  lines.push('---', '', `**Recommendation:** ${result.recommendation}`);
  return lines.join('\n');
}

export function calculateDecisionDashboard(input: DecisionDashboardInput): DecisionDashboardResult {
  const symbol = input.symbol.trim();
  if (!symbol || symbol.length > 20) throw new Error('symbol must contain 1-20 non-whitespace characters');
  const dimensions = [
    scoreDecisionTechnical(input.technical ?? {}),
    scoreDecisionFundamental(input.fundamental ?? {}),
    scoreDecisionSentiment(input.sentiment ?? {}),
    scoreDecisionRisk(input.risk ?? {}),
  ];
  const overall_score = dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0);
  const signal = decisionSignal(overall_score);
  const result = { symbol, signal, overall_score, dimensions, recommendation: decisionRecommendation(signal) };
  return { ...result, report: decisionReport(result) };
}

export function calculateTechnicalIndicators(data: readonly TechnicalBar[], indicators: readonly string[] = ['kdj', 'boll', 'wr', 'cci', 'atr', 'obv']): Readonly<Record<string, unknown>> {
  validateTechnicalBars(data, 20);
  const results: Readonly<Record<string, unknown>>[] = [];
  if (indicators.includes('kdj')) { const result = calculateKdj(data); results.push({ indicator: 'KDJ (Stochastic)', signal: result.signal, latestValues: result.values.at(-1)?.value, description: 'K > 80/D > 80 = Overbought; K < 20/D < 20 = Oversold' }); }
  if (indicators.includes('boll')) { const result = calculateBoll(data); results.push({ indicator: 'BOLL (Bollinger Bands)', signal: result.signal, latestValues: result.values.at(-1)?.value, description: 'Price near upper band = Overbought; near lower = Oversold; Squeeze = Breakout imminent' }); }
  if (indicators.includes('wr')) { const result = calculateWr(data); results.push({ indicator: 'WR (Williams %R)', signal: result.signal, latestValue: result.values.at(-1)?.value, description: 'WR > -20 = Overbought; WR < -80 = Oversold' }); }
  if (indicators.includes('cci')) { const result = calculateCci(data); results.push({ indicator: 'CCI (Commodity Channel Index)', signal: result.signal, latestValue: result.values.at(-1)?.value, description: 'CCI > 100 = Overbought; CCI < -100 = Oversold' }); }
  if (indicators.includes('atr')) { const result = calculateAtr(data); results.push({ indicator: 'ATR (Average True Range)', signal: result.signal, latestValue: result.values.at(-1)?.value, description: 'Higher ATR = Higher volatility; used for stop-loss placement' }); }
  if (indicators.includes('obv')) { const result = calculateObv(data); results.push({ indicator: 'OBV (On Balance Volume)', signal: result.signal, latestValue: result.values.at(-1)?.value, description: 'Rising OBV = Accumulation; Falling OBV = Distribution' }); }
  return { type: 'Technical Indicators', dataPoints: data.length, indicatorsCalculated: results.length, results, summary: results.map((result) => `${String(result.indicator)}: ${String(result.signal)}`).join(' | ') };
}

export { createInitialResearchJournalState, parseResearchJournalState, queryResearchJournal } from './research-journal.js';
export type { NativeResearchTask, NativeResearchJournalState, ResearchJournalQuery, ResearchPhase, ResearchTaskStatus } from './research-journal.js';
export { createResearchWorkerRequest, researchRoles, runResearchCoordinator } from './research-coordinator.js';
export type { ResearchRole, ResearchWorkerRequest, ResearchWorkerResult, ResearchWorkerRunner, ResearchWorkerRecord, ResearchCoordinatorResult } from './research-coordinator.js';
export { runNativeStockAnalysis } from './stock-analysis.js';
export type { StockAnalysisInput, StockAnalysisResult, StockAnalysisWorker, StockAnalysisWorkerRequest, StockAnalysisWorkerResult } from './stock-analysis.js';
export * from './matrix.js';
