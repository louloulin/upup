export type NativeTaxJurisdiction = 'us' | 'china' | 'hongkong' | 'uk';

export interface NativeTaxInput {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  purchaseDate: string;
  asOf: string;
  jurisdiction: NativeTaxJurisdiction;
}

export interface NativeTaxEstimate {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPercent: number;
  holdingPeriodDays: number;
  isLongTerm: boolean;
  taxRate: number;
  estimatedTax: number;
  netProceeds: number;
  jurisdiction: NativeTaxJurisdiction;
  asOf: string;
}

export interface NativeTradeTaxInput {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  sellPrice: number;
  purchaseDate: string;
  sellDate: string;
}

export interface NativeTradesTaxResult {
  jurisdiction: NativeTaxJurisdiction;
  tradeCount: number;
  summary: {
    totalGain: number;
    totalEstimatedTax: number;
    effectiveTaxRate: number;
    longTermTrades: number;
    shortTermTrades: number;
  };
  trades: NativeTaxEstimate[];
  errors: readonly string[];
}

export interface NativePnlTradeInput {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  sellPrice: number;
}

export interface NativePnlTrade {
  symbol: string;
  quantity: number;
  costBasis: number;
  proceeds: number;
  pnl: number;
  pnlPercent: number;
  isProfit: boolean;
}

export interface NativePnlResult {
  currency: string;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  trades: NativePnlTrade[];
}

const TAX_RATES: Readonly<Record<NativeTaxJurisdiction, { shortTerm: number; longTerm: number }>> = {
  us: { shortTerm: 0.37, longTerm: 0.20 },
  china: { shortTerm: 0.20, longTerm: 0.20 },
  hongkong: { shortTerm: 0, longTerm: 0 },
  uk: { shortTerm: 0.20, longTerm: 0.20 },
};

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error(`Invalid date: ${value}`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
  return timestamp;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
}

export function calculateNativeTax(input: NativeTaxInput): NativeTaxEstimate {
  assertPositive('quantity', input.quantity);
  assertPositive('purchasePrice', input.purchasePrice);
  assertPositive('currentPrice', input.currentPrice);
  const purchaseTimestamp = parseDate(input.purchaseDate);
  const asOfTimestamp = parseDate(input.asOf);
  const holdingPeriodDays = Math.floor((asOfTimestamp - purchaseTimestamp) / 86_400_000);
  if (holdingPeriodDays < 0) throw new Error('purchaseDate must not be after asOf');
  const costBasis = input.quantity * input.purchasePrice;
  const marketValue = input.quantity * input.currentPrice;
  const gain = marketValue - costBasis;
  const isLongTerm = holdingPeriodDays >= 365;
  const taxRate = isLongTerm ? TAX_RATES[input.jurisdiction].longTerm : TAX_RATES[input.jurisdiction].shortTerm;
  const estimatedTax = gain > 0 ? gain * taxRate : 0;
  return {
    symbol: input.symbol,
    quantity: input.quantity,
    purchasePrice: input.purchasePrice,
    currentPrice: input.currentPrice,
    costBasis,
    marketValue,
    gain,
    gainPercent: costBasis > 0 ? (gain / costBasis) * 100 : 0,
    holdingPeriodDays,
    isLongTerm,
    taxRate,
    estimatedTax,
    netProceeds: marketValue - estimatedTax,
    jurisdiction: input.jurisdiction,
    asOf: input.asOf,
  };
}

export function calculateNativeTradesTax(input: { trades: readonly NativeTradeTaxInput[]; jurisdiction: NativeTaxJurisdiction }): NativeTradesTaxResult {
  const trades: NativeTaxEstimate[] = [];
  const errors: string[] = [];
  for (const trade of input.trades) {
    try {
      trades.push(calculateNativeTax({
        symbol: trade.symbol,
        quantity: trade.quantity,
        purchasePrice: trade.purchasePrice,
        currentPrice: trade.sellPrice,
        purchaseDate: trade.purchaseDate,
        asOf: trade.sellDate,
        jurisdiction: input.jurisdiction,
      }));
    } catch (error) {
      errors.push(`${trade.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const totalGain = trades.reduce((sum, trade) => sum + trade.gain, 0);
  const totalEstimatedTax = trades.reduce((sum, trade) => sum + trade.estimatedTax, 0);
  return {
    jurisdiction: input.jurisdiction,
    tradeCount: trades.length,
    summary: {
      totalGain,
      totalEstimatedTax,
      effectiveTaxRate: totalGain > 0 ? (totalEstimatedTax / totalGain) * 100 : 0,
      longTermTrades: trades.filter((trade) => trade.isLongTerm).length,
      shortTermTrades: trades.filter((trade) => !trade.isLongTerm).length,
    },
    trades,
    errors,
  };
}

export function calculateNativePnl(input: { trades: readonly NativePnlTradeInput[]; currency: string }): NativePnlResult {
  const trades = input.trades.map((trade) => {
    assertPositive('quantity', trade.quantity);
    assertPositive('purchasePrice', trade.purchasePrice);
    assertPositive('sellPrice', trade.sellPrice);
    const costBasis = trade.quantity * trade.purchasePrice;
    const proceeds = trade.quantity * trade.sellPrice;
    const pnl = proceeds - costBasis;
    return { symbol: trade.symbol, quantity: trade.quantity, costBasis, proceeds, pnl, pnlPercent: (pnl / costBasis) * 100, isProfit: pnl > 0 };
  });
  const winningTrades = trades.filter((trade) => trade.isProfit).length;
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  return { currency: input.currency, tradeCount: trades.length, winningTrades, losingTrades: trades.length - winningTrades, winRate: trades.length > 0 ? (winningTrades / trades.length) * 100 : 0, totalPnl, trades };
}
