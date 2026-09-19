/**
 * 回测指标计算。
 *
 * 从交易序列计算：
 *   - 总盈亏、毛盈亏、总手续费
 *   - 胜率、败率、平均盈亏
 *   - 最大回撤（金额 + 百分比）
 */
import type { BacktestTrade, BacktestResult } from "../types.js";

export interface AggregateMetricsInput {
  symbol: string;
  contractMultiplier: number;
  startDate: string;
  endDate: string;
  trades: BacktestTrade[];
}

export function aggregateMetrics(input: AggregateMetricsInput): BacktestResult {
  const { symbol, contractMultiplier, startDate, endDate, trades } = input;
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.netPnl > 0).length;
  const losses = trades.filter((t) => t.netPnl < 0).length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const totalGrossPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalCommission = trades.reduce((s, t) => s + t.commission, 0);
  const totalNetPnl = trades.reduce((s, t) => s + t.netPnl, 0);
  const avgPnl = totalTrades > 0 ? totalNetPnl / totalTrades : 0;

  // 最大回撤
  const { maxDrawdown, maxDrawdownPct } = calcMaxDrawdown(trades);

  return {
    symbol,
    contractMultiplier,
    startDate,
    endDate,
    totalTrades,
    wins,
    losses,
    winRate,
    totalGrossPnl,
    totalCommission,
    totalNetPnl,
    avgPnl,
    maxDrawdown,
    maxDrawdownPct,
    trades,
  };
}

function calcMaxDrawdown(
  trades: BacktestTrade[],
): { maxDrawdown: number; maxDrawdownPct: number } {
  if (trades.length === 0) return { maxDrawdown: 0, maxDrawdownPct: 0 };

  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  let maxDDPct = 0;

  for (const t of trades) {
    equity += t.netPnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (dd > maxDD) maxDD = dd;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }
  return { maxDrawdown: maxDD, maxDrawdownPct: maxDDPct };
}

/**
 * 格式化回测结果为人类可读字符串
 */
export function formatBacktestResult(r: BacktestResult): string {
  const lines: string[] = [];
  lines.push(`===== 回测结果: ${r.symbol} =====`);
  lines.push(`区间: ${r.startDate} ~ ${r.endDate}  乘数: ${r.contractMultiplier}`);
  lines.push(`总交易: ${r.totalTrades}  胜: ${r.wins}  负: ${r.losses}  胜率: ${(r.winRate * 100).toFixed(2)}%`);
  lines.push(`毛盈亏: ${r.totalGrossPnl.toFixed(2)} 元`);
  lines.push(`总手续费: ${r.totalCommission.toFixed(2)} 元`);
  lines.push(`净盈亏: ${r.totalNetPnl.toFixed(2)} 元`);
  lines.push(`平均净盈亏: ${r.avgPnl.toFixed(2)} 元/笔`);
  lines.push(`最大回撤: ${r.maxDrawdown.toFixed(2)} 元 (${(r.maxDrawdownPct * 100).toFixed(2)}%)`);
  lines.push(``);
  lines.push(`交易明细:`);
  for (const t of r.trades) {
    const dir = t.direction === "long" ? "多" : "空";
    const reason = t.exitReason;
    lines.push(
      `  ${t.entryDate} ${dir} 入@${t.entryPrice.toFixed(2)} -> ${t.exitDate ?? "未平"} @${t.exitPrice?.toFixed(2) ?? "-"} (${reason}) 净=${t.netPnl.toFixed(2)}元`,
    );
  }
  return lines.join("\n");
}