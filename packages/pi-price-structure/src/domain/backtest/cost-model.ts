/**
 * 成本模型。
 *
 * 国内期货常见费率：
 *   - 佣金：万分之 0.5 ~ 万分之 2.5
 *   - 最低佣金：5 元/手
 *   - 滑点：1-5 bps（看品种）
 *   - 印花税：0（期货无）
 *   - 平今仓：部分品种有（暂未实现）
 */
import type { CostModel } from "../types.js";

export interface CommissionInput {
  price: number;
  contractMultiplier: number;
  quantity: number;
  cost: CostModel;
}

/** 计算单边手续费 */
export function calcCommission(input: CommissionInput): number {
  const { price, contractMultiplier, quantity, cost } = input;
  const perUnit = (price * contractMultiplier * cost.commissionBps) / 10000;
  return Math.max(perUnit, cost.minCommission) * quantity;
}

/** 计算双边手续费（开仓 + 平仓） */
export function calcRoundTripCommission(
  entryPrice: number,
  exitPrice: number,
  contractMultiplier: number,
  quantity: number,
  cost: CostModel,
): number {
  return (
    calcCommission({ price: entryPrice, contractMultiplier, quantity, cost }) +
    calcCommission({ price: exitPrice, contractMultiplier, quantity, cost })
  );
}

/** 计算滑点成本（按 bps 计入成交价） */
export interface SlippageInput {
  price: number;
  direction: "long" | "short";
  side: "entry" | "exit";
  cost: CostModel;
}

export function applySlippage(input: SlippageInput): number {
  const { price, direction, side, cost } = input;
  const slip = (price * cost.slippageBps) / 10000;
  if (direction === "long") {
    // 做多：买时加滑点，卖时减滑点
    return side === "entry" ? price + slip : price - slip;
  }
  // 做空：卖时减滑点，买回时加滑点
  return side === "entry" ? price - slip : price + slip;
}