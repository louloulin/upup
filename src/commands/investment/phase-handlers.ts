/**
 * Investment Workflow Phase Handlers
 *
 * v7 Sprint 3 — trade + review phase 真实接通 sandbox-engine + attribution
 *
 * 5 步 phase 真实工具映射:
 *   research  → getStockPrice + getKeyRatios + getAnalystEstimates + getEarnings + getFilings
 *   valuation → calculateValuationRatios + calculateDCF (stub FCF, 真实函数)
 *   backtest  → backtestLumpSum(ticker, 12, 10000) + generateBacktestReport
 *   trade     → SandboxBroker.placeOrder() 真实 paper trade + sandbox.getPositions/getBalance/getQuote
 *   review    → attribution({method:'combined'}) 真实 Brinson + Style + Sector 归因
 *
 * 模块边界(关键 — 零循环):
 *   - 位于 src/commands/investment/ (Layer 6),允许 import src/tools/* (Layer 4)
 *   - 不 import src/agent/* 内部实现(避免反向引用)
 *   - 不 import packages/commands/* (避免跨包)
 *   - 工具调用全部 try/catch 隔离,失败回退到优雅的占位输出
 *
 * 决策逻辑 (trade phase):
 *   - 无 ticker → graceful placeholder
 *   - 已持仓 + plan.goal 无卖出信号 → hold (不自动加仓)
 *   - 无持仓 + plan.goal 有卖出信号 + 无买入信号 → sell 信号但无仓,跳过
 *   - 无持仓 + (有买入信号 或 无明确信号) → 买入 10% 总资产市值,market 单
 *   - 已持仓 + plan.goal 有卖出信号 → 卖出全部持仓,market 单
 *
 * 用法:
 *   const handlers = createPhaseHandlers();
 *   await runInvestmentWorkflow('分析 NVDA', { ticker: 'NVDA', phaseHandler: handlers.research });
 */

import {
  getStockPrice,
  getKeyRatios,
  getAnalystEstimates,
  getEarnings,
  getFilings,
} from './phase-finance-dependencies.js';
import {
  calculateValuationRatios,
  calculateDCF,
} from './phase-valuation-dependencies.js';
import {
  backtestLumpSum,
  generateBacktestReport,
} from './phase-fund-dependencies.js';
import { SandboxBroker } from './phase-trading-dependencies.js';
import { attribution } from './phase-portfolio-dependencies.js';
import type {
  Holding,
  Portfolio,
  Benchmark,
} from '../../tools/portfolio/types.js';
import type { ResearchPhase, ResearchPlan } from '../../plan/research-plan.js';
import type { PhaseHandler } from '../../runtime/pi/investment-workflow.js';

// ---------------------------------------------------------------------------
// Sandbox singleton (mirrors pattern from src/tools/trading/sandbox-tools.ts)
// ---------------------------------------------------------------------------

let sandboxInstance: SandboxBroker | null = null;

/** 获取共享的 sandbox broker 实例(loadState 仅首次调用) */
async function getSandbox(): Promise<SandboxBroker> {
  if (!sandboxInstance) {
    sandboxInstance = new SandboxBroker();
    await sandboxInstance.loadState();
  }
  return sandboxInstance;
}

/** 测试辅助:重置 sandbox singleton 避免跨测试状态污染 */
export function __resetSandboxForTests(): void {
  sandboxInstance = null;
}

export interface PhaseHandlerDependencies {
  getStockPrice: typeof getStockPrice;
  getKeyRatios: typeof getKeyRatios;
  getAnalystEstimates: typeof getAnalystEstimates;
  getEarnings: typeof getEarnings;
  getFilings: typeof getFilings;
  calculateValuationRatios: typeof calculateValuationRatios;
  calculateDCF: typeof calculateDCF;
  backtestLumpSum: typeof backtestLumpSum;
  generateBacktestReport: typeof generateBacktestReport;
  getSandbox: () => Promise<SandboxBroker>;
  attribution: typeof attribution;
}

const productionDependencies: PhaseHandlerDependencies = {
  getStockPrice,
  getKeyRatios,
  getAnalystEstimates,
  getEarnings,
  getFilings,
  calculateValuationRatios,
  calculateDCF,
  backtestLumpSum,
  generateBacktestReport,
  getSandbox,
  attribution,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 安全调用 PiTool: 失败返回 null,永不抛出 */
async function safeInvoke<T = unknown>(
  tool: { invoke: (input: unknown) => Promise<T> } | undefined,
  input: unknown,
): Promise<T | null> {
  if (!tool) return null;
  try {
    return await tool.invoke(input);
  } catch {
    return null;
  }
}

/** 截断字符串到 N 字符,带省略号 */
function truncate(s: unknown, n: number): string {
  if (s == null) return '(n/a)';
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str.length > n ? str.slice(0, n) + '...' : str;
}

/** 提取 plan 中的 ticker(可选) */
function planTicker(plan: ResearchPlan): string | undefined {
  return plan.ticker;
}

/** 简单 sector 推断(Shenwan L1 粗分类,production 应接 sector map) */
function guessSector(symbol: string): string {
  if (symbol.endsWith('.SH') || symbol.endsWith('.SZ')) {
    const code = parseInt(symbol.slice(0, 6), 10);
    if (code >= 600000 && code < 601000) return '银行';
    if (code >= 601000 && code < 602000) return '证券';
    if (code >= 600519 && code < 600600) return '消费';
    if (code >= 600000 && code < 600100) return '能源';
    if (code >= 600900 && code < 601000) return '电力';
    return '工业';
  }
  if (/^[A-Z]+$/.test(symbol)) {
    if (['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD'].includes(symbol)) return '科技';
    if (['JPM', 'BAC', 'GS', 'WFC', 'MS'].includes(symbol)) return '金融';
    if (['XOM', 'CVX', 'COP', 'SLB'].includes(symbol)) return '能源';
    if (['JNJ', 'PFE', 'MRK', 'UNH'].includes(symbol)) return '医药';
    if (['PG', 'KO', 'PEP', 'WMT'].includes(symbol)) return '消费';
    return '其他';
  }
  return '其他';
}

// ---------------------------------------------------------------------------
// Phase 1: research — 收集财务数据
// ---------------------------------------------------------------------------

async function researchHandler(
  plan: ResearchPlan,
  _phase: ResearchPhase,
  deps: PhaseHandlerDependencies,
): Promise<{ output: string; error?: string }> {
  const ticker = planTicker(plan);
  if (!ticker) {
    return { output: '## Research\n\n(无 ticker,跳过数据收集)', error: 'no_ticker' };
  }

  const [price, ratios, estimates, earnings, filings] = await Promise.all([
    safeInvoke(deps.getStockPrice as any, { ticker }),
    safeInvoke(deps.getKeyRatios as any, { ticker }),
    safeInvoke(deps.getAnalystEstimates as any, { ticker }),
    safeInvoke(deps.getEarnings as any, { ticker }),
    safeInvoke(deps.getFilings as any, { ticker }),
  ]);

  const lines: string[] = [
    `## Research — ${ticker}`,
    '',
    `- **Price**: ${truncate(price, 200)}`,
    `- **Key Ratios**: ${truncate(ratios, 200)}`,
    `- **Analyst Estimates**: ${truncate(estimates, 200)}`,
    `- **Earnings**: ${truncate(earnings, 200)}`,
    `- **Filings**: ${truncate(filings, 150)}`,
    '',
  ];

  return { output: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Phase 2: valuation — DCF + 可比公司估值
// ---------------------------------------------------------------------------

async function valuationHandler(
  plan: ResearchPlan,
  _phase: ResearchPhase,
  deps: PhaseHandlerDependencies,
): Promise<{ output: string; error?: string }> {
  const ticker = planTicker(plan);
  if (!ticker) {
    return { output: '## Valuation\n\n(无 ticker,跳过估值)', error: 'no_ticker' };
  }

  const stubFcf = 1_000_000_000;
  const stubEps = 5;
  const stubPrice = 100;

  const lines: string[] = [
    `## Valuation — ${ticker}`,
    '',
  ];

  try {
    const ratios = deps.calculateValuationRatios({
      price: stubPrice,
      eps: stubEps,
      book_value_per_share: stubEps * 3,
      cash_flow_per_share: stubEps * 1.5,
      shares_outstanding: 1_000_000_000,
    });
    lines.push(`### Valuation Ratios (price=$${stubPrice}, EPS=$${stubEps})`);
    lines.push('');
    lines.push('```');
    lines.push(truncate(ratios, 600));
    lines.push('```');
    lines.push('');
  } catch (e) {
    lines.push(`### Valuation Ratios: 错误 — ${e instanceof Error ? e.message : String(e)}`);
    lines.push('');
  }

  try {
    const dcf = deps.calculateDCF({
      current_fcf: stubFcf,
      growth_rate: 0.08,
      discount_rate: 0.10,
      terminal_growth_rate: 0.03,
      projection_years: 10,
      shares_outstanding: 1_000_000_000,
      net_debt: 0,
    });
    lines.push(`### DCF (FCF=$${stubFcf.toLocaleString()}, g=8%, r=10%, tg=3%)`);
    lines.push('');
    lines.push('```');
    lines.push(truncate(dcf, 600));
    lines.push('```');
    lines.push('');
  } catch (e) {
    lines.push(`### DCF: 错误 — ${e instanceof Error ? e.message : String(e)}`);
    lines.push('');
  }

  return { output: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Phase 3: backtest — 12 个月定投回测
// ---------------------------------------------------------------------------

async function backtestHandler(
  plan: ResearchPlan,
  _phase: ResearchPhase,
  deps: PhaseHandlerDependencies,
): Promise<{ output: string; error?: string }> {
  const ticker = planTicker(plan);
  if (!ticker) {
    return { output: '## Backtest\n\n(无 ticker,跳过回测)', error: 'no_ticker' };
  }

  const lines: string[] = [
    `## Backtest — ${ticker} (12 个月, $10,000 定投)`,
    '',
  ];

  try {
    const result = await deps.backtestLumpSum(ticker, 12, 10_000);
    const report = deps.generateBacktestReport(result);
    lines.push('```');
    lines.push(report.slice(0, 1500));
    lines.push('```');
  } catch (e) {
    lines.push(`回测失败: ${e instanceof Error ? e.message : String(e)}`);
    lines.push('');
    lines.push('(可能原因: 该 ticker 不在 fund 库,或数据不足)');
  }

  return { output: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Phase 4: trade — 真实接通 SandboxBroker.placeOrder()
// ---------------------------------------------------------------------------

async function tradeHandler(
  plan: ResearchPlan,
  _phase: ResearchPhase,
  deps: PhaseHandlerDependencies,
): Promise<{ output: string; error?: string }> {
  const ticker = planTicker(plan);
  if (!ticker) {
    return { output: '## Trade\n\n(无 ticker,跳过交易)', error: 'no_ticker' };
  }

  const lines: string[] = [
    '## Trade',
    '',
    `**目标标的**: ${ticker}`,
  ];

  let sandbox: SandboxBroker;
  try {
    sandbox = await deps.getSandbox();
  } catch (e) {
    lines.push('');
    lines.push(`Sandbox 初始化失败: ${e instanceof Error ? e.message : String(e)}`);
    return { output: lines.join('\n'), error: 'sandbox_init_failed' };
  }

  let positions: Awaited<ReturnType<SandboxBroker['getPositions']>>;
  let balance: Awaited<ReturnType<SandboxBroker['getBalance']>>;
  let quote: Awaited<ReturnType<SandboxBroker['getQuote']>>;
  try {
    [positions, balance, quote] = await Promise.all([
      sandbox.getPositions(),
      sandbox.getBalance(),
      sandbox.getQuote(ticker),
    ]);
  } catch (e) {
    lines.push('');
    lines.push(`Sandbox 状态读取失败: ${e instanceof Error ? e.message : String(e)}`);
    return { output: lines.join('\n'), error: 'sandbox_read_failed' };
  }

  const existingPos = positions.find(p => p.symbol === ticker);
  const goalLower = (plan.goal ?? '').toLowerCase();
  const wantSell = /卖|sell|清仓|close|short|减仓/.test(goalLower);
  const wantBuy = /买|buy|建仓|long|加仓/.test(goalLower);

  lines.push(`**现金余额**: ${balance.currency} ${balance.cash.toLocaleString()}`);
  lines.push(`**${ticker} 行情**: bid=${quote.bid.toFixed(2)} ask=${quote.ask.toFixed(2)} last=${quote.last.toFixed(2)}`);
  lines.push(`**当前持仓数**: ${positions.length}`);
  if (existingPos) {
    lines.push(`**${ticker} 持仓**: ${existingPos.quantity} 股 @ ${existingPos.avgCost.toFixed(2)}`);
  }
  lines.push('');

  if (existingPos && !wantSell) {
    lines.push('**决策**: 持有 (hold)');
    lines.push('');
    lines.push('原因: 已持仓,且 plan.goal 未包含卖出/清仓/减仓信号 — 不自动加仓,需用户主动确认');
    return { output: lines.join('\n') };
  }

  if (!existingPos && wantSell && !wantBuy) {
    lines.push('**决策**: 卖出信号 (sell) — 但当前无持仓');
    lines.push('');
    lines.push('原因: plan.goal 包含卖出信号,但 sandbox 中无对应持仓 — 无需下单');
    return { output: lines.join('\n') };
  }

  const side: 'buy' | 'sell' = existingPos ? 'sell' : 'buy';
  let order: Awaited<ReturnType<SandboxBroker['placeOrder']>>;
  try {
    if (side === 'buy') {
      const alloc = Math.min(balance.totalEquity * 0.1, balance.cash * 0.95);
      const qty = Math.floor(alloc / quote.ask);
      if (qty < 1) {
        lines.push(`**决策**: 现金不足以买入 1 股 ${ticker} (需要 ${quote.ask.toFixed(2)}, 分配 ${alloc.toFixed(2)})`);
        return { output: lines.join('\n'), error: 'insufficient_cash' };
      }
      order = await sandbox.placeOrder({
        symbol: ticker,
        side: 'buy',
        type: 'market',
        quantity: qty,
      });
      lines.push(`**决策**: 买入 ${qty} 股 @ 市价 (≈${balance.currency} ${(qty * quote.ask).toFixed(2)})`);
    } else {
      const qty = Math.abs(existingPos!.quantity);
      order = await sandbox.placeOrder({
        symbol: ticker,
        side: 'sell',
        type: 'market',
        quantity: qty,
      });
      lines.push(`**决策**: 卖出 ${qty} 股 @ 市价`);
    }
  } catch (e) {
    lines.push('');
    lines.push(`下单失败: ${e instanceof Error ? e.message : String(e)}`);
    return { output: lines.join('\n'), error: 'order_failed' };
  }

  lines.push('');
  lines.push('### 订单结果');
  lines.push('');
  lines.push(`- **ID**: ${order.id}`);
  lines.push(`- **状态**: ${order.status}`);
  lines.push(`- **数量**: ${order.filledQuantity}/${order.quantity}`);
  if (order.avgFillPrice != null) {
    lines.push(`- **成交均价**: ${order.avgFillPrice.toFixed(4)}`);
  }
  if (order.commission != null) {
    lines.push(`- **手续费**: ${order.commission.toFixed(2)}`);
  }
  lines.push('');

  try {
    const [newPositions, newBalance] = await Promise.all([
      sandbox.getPositions(),
      sandbox.getBalance(),
    ]);
    const updated = newPositions.find(p => p.symbol === ticker);
    lines.push('### 更新后状态');
    lines.push('');
    lines.push(`- **现金**: ${newBalance.currency} ${newBalance.cash.toLocaleString()}`);
    lines.push(`- **总资产**: ${newBalance.currency} ${newBalance.totalEquity.toLocaleString()}`);
    if (updated) {
      lines.push(`- **${ticker} 持仓**: ${updated.quantity} 股 @ ${updated.avgCost.toFixed(4)}`);
    } else {
      lines.push(`- **${ticker} 持仓**: 已清空`);
    }
  } catch {
    // 忽略 refresh 失败
  }

  return { output: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Phase 5: review — 真实接通 attribution({method:'combined'})
// ---------------------------------------------------------------------------

async function reviewHandler(
  plan: ResearchPlan,
  _phase: ResearchPhase,
  deps: PhaseHandlerDependencies,
): Promise<{ output: string; error?: string }> {
  const lines: string[] = [
    '## Review',
    '',
  ];

  let sandbox: SandboxBroker;
  try {
    sandbox = await deps.getSandbox();
  } catch (e) {
    lines.push(`Sandbox 初始化失败: ${e instanceof Error ? e.message : String(e)}`);
    return { output: lines.join('\n'), error: 'sandbox_init_failed' };
  }

  let positions: Awaited<ReturnType<SandboxBroker['getPositions']>>;
  let balance: Awaited<ReturnType<SandboxBroker['getBalance']>>;
  try {
    [positions, balance] = await Promise.all([
      sandbox.getPositions(),
      sandbox.getBalance(),
    ]);
  } catch (e) {
    lines.push(`Sandbox 状态读取失败: ${e instanceof Error ? e.message : String(e)}`);
    return { output: lines.join('\n'), error: 'sandbox_read_failed' };
  }

  const activePositions = positions.filter(p => p.quantity !== 0);

  lines.push(`**持仓总数**: ${activePositions.length}`);
  lines.push(`**现金余额**: ${balance.currency} ${balance.cash.toLocaleString()}`);
  lines.push(`**总资产**: ${balance.currency} ${balance.totalEquity.toLocaleString()}`);
  lines.push('');

  if (activePositions.length === 0) {
    lines.push('(空组合 — 无持仓可复盘)');
    lines.push('');
    lines.push('提示: 用 sandbox.placeTradeOrder 建仓后,review 阶段会自动计算归因:');
    lines.push('  - Brinson 归因(配置效应 + 选择效应 + 交互效应)');
    lines.push('  - 风格归因(Size/Value/Momentum/Volatility)');
    lines.push('  - 行业归因(Shenwan L1 行业贡献)');
    return { output: lines.join('\n') };
  }

  const totalMv = balance.marketValue;
  const portfolioHoldings: Holding[] = [];
  const sectorWeights: Record<string, number> = {};

  for (const pos of activePositions) {
    const quote = await sandbox.getQuote(pos.symbol);
    const mv = Math.abs(pos.quantity) * quote.last;
    const weight = totalMv > 0 ? mv / totalMv : 0;
    const ret = pos.avgCost > 0 ? (quote.last - pos.avgCost) / pos.avgCost : 0;
    const sector = guessSector(pos.symbol);
    portfolioHoldings.push({ sector, weight, return: ret });
    sectorWeights[sector] = (sectorWeights[sector] ?? 0) + weight;
  }

  const sectorList = Object.keys(sectorWeights);
  const benchmarkWeight = sectorList.length > 0 ? 1 / sectorList.length : 0;
  const benchmarkHoldings: Holding[] = sectorList.map(sector => ({
    sector,
    weight: benchmarkWeight,
    return: 0.05,
  }));

  const portReturn = portfolioHoldings.reduce((s, h) => s + h.weight * h.return, 0);
  const benchReturn = benchmarkHoldings.reduce((s, h) => s + h.weight * h.return, 0);

  const portfolio: Portfolio = { holdings: portfolioHoldings, totalReturn: portReturn };
  const benchmark: Benchmark = { holdings: benchmarkHoldings, totalReturn: benchReturn };

  try {
    const result = deps.attribution({ method: 'combined', portfolio, benchmark });

    if (result.method === 'combined') {
      const b = result.result.brinson;
      lines.push('### Brinson 归因');
      lines.push('');
      lines.push(`- **配置效应** (allocation): ${(b.allocation * 100).toFixed(2)}%`);
      lines.push(`- **选择效应** (selection): ${(b.selection * 100).toFixed(2)}%`);
      lines.push(`- **交互效应** (interaction): ${(b.interaction * 100).toFixed(2)}%`);
      lines.push(`- **主动收益** (active return): ${(b.activeReturn * 100).toFixed(2)}%`);
      lines.push('');

      lines.push('### 风格归因 (Size/Value/Momentum/Volatility)');
      lines.push('');
      for (const f of result.result.style.factors) {
        lines.push(
          `- ${f.name}: 暴露 ${f.portfolioExposure.toFixed(2)} / 基准 ${f.benchmarkExposure.toFixed(2)} / 因子收益 ${(f.factorReturn * 100).toFixed(2)}% / 贡献 ${(f.contribution * 100).toFixed(2)}%`,
        );
      }
      lines.push('');

      lines.push('### 行业归因 (Shenwan L1)');
      lines.push('');
      for (const s of result.result.sector.sectors) {
        lines.push(
          `- ${s.sector}: 权重差 ${(s.weightDiff * 100).toFixed(2)}% / 行业收益 ${(s.sectorReturn * 100).toFixed(2)}% / 贡献 ${(s.contribution * 100).toFixed(2)}%`,
        );
      }
    }
  } catch (e) {
    lines.push(`归因失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { output: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PhaseHandlers {
  research: PhaseHandler;
  valuation: PhaseHandler;
  backtest: PhaseHandler;
  trade: PhaseHandler;
  review: PhaseHandler;
}

export function createPhaseHandlers(overrides: Partial<PhaseHandlerDependencies> = {}): PhaseHandlers {
  const deps = { ...productionDependencies, ...overrides };
  return {
    research: (plan, phase) => researchHandler(plan, phase, deps),
    valuation: (plan, phase) => valuationHandler(plan, phase, deps),
    backtest: (plan, phase) => backtestHandler(plan, phase, deps),
    trade: (plan, phase) => tradeHandler(plan, phase, deps),
    review: (plan, phase) => reviewHandler(plan, phase, deps),
  };
}

export function createPhaseHandlerMap(overrides: Partial<PhaseHandlerDependencies> = {}): Partial<Record<ResearchPhase, PhaseHandler>> {
  const h = createPhaseHandlers(overrides);
  return {
    research: h.research,
    valuation: h.valuation,
    backtest: h.backtest,
    trade: h.trade,
    review: h.review,
  };
}
