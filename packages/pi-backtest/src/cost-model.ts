export interface BacktestCostModel {
  readonly id?: string;
  readonly commissionBps?: number;
  readonly minimumCommission?: number;
  readonly stampDutyBps?: number;
  readonly applyStampDutyOnSell?: boolean;
  readonly slippageBps?: number;
}

export interface BacktestTransactionCosts {
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly entryFillPrice: number;
  readonly exitFillPrice: number;
  readonly entryNotional: number;
  readonly exitNotional: number;
  readonly entryCommission: number;
  readonly exitCommission: number;
  readonly stampDuty: number;
  readonly slippageCost: number;
  readonly totalCost: number;
  readonly grossPnl: number;
  readonly netPnl: number;
  readonly grossReturnPct: number;
  readonly netReturnPct: number;
}

const round = (value: number, decimals = 6): number => Number(value.toFixed(decimals));

function nonNegative(value: number | undefined, name: string): number {
  const resolved = value ?? 0;
  if (!Number.isFinite(resolved) || resolved < 0) throw new Error(`${name} must be finite and non-negative`);
  return resolved;
}

function commission(notional: number, model: BacktestCostModel): number {
  const rate = nonNegative(model.commissionBps, 'commissionBps') / 10_000;
  if (rate === 0) return 0;
  return Math.max(nonNegative(model.minimumCommission, 'minimumCommission'), notional * rate);
}

export function calculateTransactionCosts(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  model: BacktestCostModel,
): BacktestTransactionCosts {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('entryPrice must be finite and positive');
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) throw new Error('exitPrice must be finite and positive');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('quantity must be finite and positive');
  const slippage = nonNegative(model.slippageBps, 'slippageBps') / 10_000;
  const entryFillPrice = entryPrice * (1 + slippage);
  const exitFillPrice = exitPrice * (1 - slippage);
  const entryNotional = entryFillPrice * quantity;
  const exitNotional = exitFillPrice * quantity;
  const entryCommission = commission(entryNotional, model);
  const exitCommission = commission(exitNotional, model);
  const stampDuty = model.applyStampDutyOnSell === false
    ? 0
    : exitNotional * nonNegative(model.stampDutyBps, 'stampDutyBps') / 10_000;
  const slippageCost = (Math.abs(entryFillPrice - entryPrice) + Math.abs(exitPrice - exitFillPrice)) * quantity;
  const grossPnl = (exitPrice - entryPrice) * quantity;
  const totalCost = entryCommission + exitCommission + stampDuty + slippageCost;
  const netPnl = grossPnl - totalCost;
  const grossReturnPct = (grossPnl / (entryPrice * quantity)) * 100;
  const netReturnPct = (netPnl / (entryPrice * quantity + entryCommission)) * 100;
  return {
    entryPrice: round(entryPrice),
    exitPrice: round(exitPrice),
    entryFillPrice: round(entryFillPrice),
    exitFillPrice: round(exitFillPrice),
    entryNotional: round(entryNotional),
    exitNotional: round(exitNotional),
    entryCommission: round(entryCommission),
    exitCommission: round(exitCommission),
    stampDuty: round(stampDuty),
    slippageCost: round(slippageCost),
    totalCost: round(totalCost),
    grossPnl: round(grossPnl),
    netPnl: round(netPnl),
    grossReturnPct: round(grossReturnPct, 4),
    netReturnPct: round(netReturnPct, 4),
  };
}

