/**
 * 风控校验。
 *
 * 规则：
 *   - 单次开仓 1 手
 *   - 预估亏损范围：放宽版 5 ~ 5000 元（默认）
 *   - 不在范围内不开仓
 *
 * 预估亏损 = |入场价 - 止损价| × 合约乘数 × 1手
 */
import type { RiskCheck } from "../types.js";

/** 风控区间（默认放宽版） */
export const MIN_LOSS_YUAN = 5;
export const MAX_LOSS_YUAN = 5000;

export const FIXED_QUANTITY = 1;

export function checkRisk(
  entryPrice: number,
  stopLoss: number,
  contractMultiplier: number,
  options?: {
    minLoss?: number;
    maxLoss?: number;
    quantity?: number;
  },
): RiskCheck {
  const minLoss = options?.minLoss ?? MIN_LOSS_YUAN;
  const maxLoss = options?.maxLoss ?? MAX_LOSS_YUAN;
  const quantity = options?.quantity ?? FIXED_QUANTITY;

  const perHandLoss = Math.abs(entryPrice - stopLoss) * contractMultiplier;
  const totalLoss = perHandLoss * quantity;

  if (perHandLoss < minLoss) {
    return {
      pass: false,
      quantity: 0,
      estimatedLoss: totalLoss,
      reason: `单手亏损 ${perHandLoss.toFixed(2)} 元 < ${minLoss} 元下限`,
    };
  }

  if (perHandLoss > maxLoss) {
    return {
      pass: false,
      quantity: 0,
      estimatedLoss: totalLoss,
      reason: `单手亏损 ${perHandLoss.toFixed(2)} 元 > ${maxLoss} 元上限`,
    };
  }

  return { pass: true, quantity, estimatedLoss: totalLoss };
}

/**
 * 校验入场信号的预估亏损是否在风控区间内。
 * 这是 entry-signal 工具的最后一步。
 */
export function evaluateSignalRisk(
  estimatedLoss: number | null,
  options?: { minLoss?: number; maxLoss?: number },
): { pass: boolean; reason?: string } {
  if (estimatedLoss === null) {
    return { pass: false, reason: "入场信号未生成，无法风控校验" };
  }
  const minLoss = options?.minLoss ?? MIN_LOSS_YUAN;
  const maxLoss = options?.maxLoss ?? MAX_LOSS_YUAN;
  if (estimatedLoss < minLoss) {
    return {
      pass: false,
      reason: `预估亏损 ${estimatedLoss.toFixed(2)} 元 < ${minLoss} 元下限`,
    };
  }
  if (estimatedLoss > maxLoss) {
    return {
      pass: false,
      reason: `预估亏损 ${estimatedLoss.toFixed(2)} 元 > ${maxLoss} 元上限`,
    };
  }
  return { pass: true };
}