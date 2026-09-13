export interface BacktestCostModel {
  readonly id?: string;
  readonly commissionBps?: number;
  readonly minimumCommission?: number;
  readonly stampDuty?: BacktestStampDuty;
  readonly slippageBps?: number;
}

export interface BacktestLegacyStampDuty { readonly stampDutyBps?: number; readonly applyStampDutyOnSell?: boolean }
export type BacktestCostModelInput = BacktestCostModel & BacktestLegacyStampDuty;
export type BacktestStampDutyRegime = 'cn_a_share' | 'hk' | 'none';

export interface BacktestStampDuty {
  readonly regime?: BacktestStampDutyRegime;
  readonly buyBps?: number;
  readonly sellBps?: number;
  readonly buyOnly?: boolean;
}

export interface BacktestStampDutyBreakdown {
  readonly regime: BacktestStampDutyRegime;
  readonly buyBps: number;
  readonly sellBps: number;
  readonly buyDuty: number;
  readonly sellDuty: number;
}

export const DEFAULT_STAMP_DUTY: Readonly<Record<BacktestStampDutyRegime, { buyBps: number; sellBps: number }>> = {
  cn_a_share: { buyBps: 0, sellBps: 5 },
  hk: { buyBps: 13, sellBps: 13 },
  none: { buyBps: 0, sellBps: 0 },
};

export interface BacktestTransactionCosts {
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly entryFillPrice: number;
  readonly exitFillPrice: number;
  readonly entryNotional: number;
  readonly exitNotional: number;
  readonly entryCommission: number;
  readonly exitCommission: number;
  readonly stampDuty: BacktestStampDutyBreakdown;
  readonly entryStampDuty: number;
  readonly exitStampDuty: number;
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
  model: BacktestCostModelInput,
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
  const stampDutyField = (model.stampDuty ?? model) as BacktestStampDuty & BacktestLegacyStampDuty;
  const stampDuty = resolveStampDuty(stampDutyField, entryNotional, exitNotional);
  const slippageCost = (Math.abs(entryFillPrice - entryPrice) + Math.abs(exitPrice - exitFillPrice)) * quantity;
  const grossPnl = (exitPrice - entryPrice) * quantity;
  const totalCost = entryCommission + exitCommission + stampDuty.buyDuty + stampDuty.sellDuty + slippageCost;
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
    stampDuty,
    entryStampDuty: round(stampDuty.buyDuty),
    exitStampDuty: round(stampDuty.sellDuty),
    slippageCost: round(slippageCost),
    totalCost: round(totalCost),
    grossPnl: round(grossPnl),
    netPnl: round(netPnl),
    grossReturnPct: round(grossReturnPct, 4),
    netReturnPct: round(netReturnPct, 4),
  };
}

export function resolveStampDuty(model: BacktestStampDuty | BacktestLegacyStampDuty | undefined, entryNotional: number, exitNotional: number): BacktestStampDutyBreakdown {
  const input = (model ?? {}) as BacktestStampDuty & BacktestLegacyStampDuty;
  const hasNewDuty = input && typeof input === 'object' && 'regime' in input && input.regime !== undefined;
  const legacyBps = input.stampDutyBps;
  const regime: BacktestStampDutyRegime = hasNewDuty ? input.regime as BacktestStampDutyRegime : (legacyBps === undefined ? 'none' : (input.applyStampDutyOnSell === false ? 'cn_a_share' : 'cn_a_share'));
  const defaults = DEFAULT_STAMP_DUTY[regime];
  const buyBps = nonNegative(hasNewDuty ? input.buyBps ?? defaults.buyBps : 0, 'stampDuty.buyBps');
  const sellBps = nonNegative(hasNewDuty ? input.sellBps ?? defaults.sellBps : legacyBps ?? defaults.sellBps, 'stampDuty.sellBps');
  const buyOnly = input.buyOnly === true || (legacyBps !== undefined && input.applyStampDutyOnSell === false);
  const buyDuty = buyOnly ? 0 : entryNotional * buyBps / 10_000;
  const sellDuty = exitNotional * sellBps / 10_000;
  return { regime, buyBps, sellBps, buyDuty: round(buyDuty), sellDuty: round(sellDuty) };
}
