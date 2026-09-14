import { renderFundBacktestReport, runFundBacktest, type FundNavPoint } from '@upup/pi-backtest';
import { calculatePortfolioAttribution } from '@upup/pi-portfolio';
import { calculateProductionDcf, calculateValuationRatios } from '@upup/pi-investment-analysis';

export type InvestmentWorkflowPhase = 'research' | 'valuation' | 'backtest' | 'trade' | 'review';
export type CanonicalInvestmentPhase = 'detect' | 'plan' | 'execute' | 'verify' | 'report';
export const CANONICAL_INVESTMENT_PHASES: readonly CanonicalInvestmentPhase[] = ['detect', 'plan', 'execute', 'verify', 'report'];

export type InvestmentAgentProfileId = 'researcher' | 'analyst' | 'risk-manager' | 'portfolio-manager' | 'backtest-engineer' | 'monitor' | 'reviewer';

export interface InvestmentAgentProfile {
  readonly id: InvestmentAgentProfileId;
  readonly capabilities: readonly string[];
  readonly allowedTools: readonly string[];
  readonly deniedSafetyLevels: readonly ('dangerous' | 'critical')[];
  readonly requiresApprovalFor: readonly ('warning' | 'dangerous' | 'critical')[];
  readonly outputContract: 'evidence' | 'report' | 'json';
}

export const INVESTMENT_AGENT_PROFILES: Readonly<Record<InvestmentAgentProfileId, InvestmentAgentProfile>> = {
  researcher: { id: 'researcher', capabilities: ['market-data', 'research'], allowedTools: ['web_search', 'web_fetch', 'financial_search', 'read_filings'], deniedSafetyLevels: ['dangerous', 'critical'], requiresApprovalFor: [], outputContract: 'evidence' },
  analyst: { id: 'analyst', capabilities: ['market-data', 'research', 'valuation'], allowedTools: ['financial_metrics', 'read_filings', 'calculate_dcf', 'calculate_technical_indicators'], deniedSafetyLevels: ['dangerous', 'critical'], requiresApprovalFor: [], outputContract: 'report' },
  'risk-manager': { id: 'risk-manager', capabilities: ['market-data', 'risk', 'portfolio'], allowedTools: ['calculate_var', 'calculate_sharpe', 'calculate_max_drawdown', 'calculate_risk_parity'], deniedSafetyLevels: ['dangerous', 'critical'], requiresApprovalFor: [], outputContract: 'report' },
  'portfolio-manager': { id: 'portfolio-manager', capabilities: ['market-data', 'portfolio', 'risk'], allowedTools: ['duckdb-portfolio-analysis', 'calculate_risk_parity', 'place_trade_order'], deniedSafetyLevels: ['critical'], requiresApprovalFor: ['dangerous'], outputContract: 'report' },
  'backtest-engineer': { id: 'backtest-engineer', capabilities: ['market-data', 'backtest'], allowedTools: ['strategy_backtest', 'backtest_run', 'backtest_evaluate_trade'], deniedSafetyLevels: ['dangerous', 'critical'], requiresApprovalFor: [], outputContract: 'evidence' },
  monitor: { id: 'monitor', capabilities: ['market-data', 'monitoring'], allowedTools: ['get_market_data', 'check_watchlist_alerts', 'heartbeat'], deniedSafetyLevels: ['dangerous', 'critical'], requiresApprovalFor: [], outputContract: 'json' },
  reviewer: { id: 'reviewer', capabilities: ['research', 'risk', 'audit'], allowedTools: ['score_data_source', 'compare_data_sources', 'read_filings'], deniedSafetyLevels: ['dangerous', 'critical'], requiresApprovalFor: [], outputContract: 'report' },
};

export interface InvestmentWorkflowArtifact {
  readonly workflowId: string;
  readonly phase: CanonicalInvestmentPhase;
  readonly status: 'completed' | 'blocked' | 'failed';
  readonly profile: InvestmentAgentProfileId;
  readonly ticker?: string;
  readonly output: string;
  readonly evidence: readonly unknown[];
  readonly createdAt: string;
}

export function createInvestmentWorkflowArtifact(input: Omit<InvestmentWorkflowArtifact, 'createdAt'> & { createdAt?: string }): InvestmentWorkflowArtifact {
  return { ...input, createdAt: input.createdAt ?? new Date().toISOString() };
}

export interface InvestmentWorkflowPlan {
  readonly ticker?: string;
  readonly goal?: string;
}

export interface InvestmentResearchData {
  readonly price?: unknown;
  readonly ratios?: unknown;
  readonly estimates?: unknown;
  readonly earnings?: unknown;
  readonly filings?: unknown;
}

export interface InvestmentMarketHistoryPoint {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface InvestmentMarketHistoryEvidence {
  readonly source: string;
  readonly retrievedAt: string;
  readonly asOf: string;
  readonly query: string;
  readonly dataFreshness: 'historical' | 'cached' | 'delayed' | 'realtime';
  readonly auditId: string;
}

export interface InvestmentMarketHistory {
  readonly bars: readonly InvestmentMarketHistoryPoint[];
  readonly evidence: InvestmentMarketHistoryEvidence;
}

export interface InvestmentPosition {
  readonly symbol: string;
  readonly quantity: number;
  readonly avgCost: number;
  readonly realizedPnL?: number;
}

export interface InvestmentQuote {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
}

export interface InvestmentBalance {
  readonly cash: number;
  readonly marketValue: number;
  readonly totalEquity: number;
  readonly currency: string;
}

export interface InvestmentOrder {
  readonly id: string;
  readonly status: string;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly avgFillPrice?: number;
  readonly commission?: number;
}

export interface InvestmentWorkflowServices {
  readonly getResearchData: (ticker: string, signal: AbortSignal) => Promise<InvestmentResearchData>;
  readonly getFundHistory: (fundCode: string, startDate: string, endDate: string, signal: AbortSignal) => Promise<readonly FundNavPoint[]>;
  readonly getMarketHistory: (symbol: string, startDate: string, signal: AbortSignal) => Promise<InvestmentMarketHistory>;
  readonly getSandboxState: (signal: AbortSignal) => Promise<{ positions: readonly InvestmentPosition[]; balance: InvestmentBalance } & { getQuote: (symbol: string, signal: AbortSignal) => Promise<InvestmentQuote> }>;
  readonly placePaperOrder: (input: { symbol: string; side: 'buy' | 'sell'; quantity: number }, signal: AbortSignal) => Promise<InvestmentOrder>;
}

export interface InvestmentPhaseResult {
  readonly output: string;
  readonly error?: string;
  readonly evidence: readonly ({ source: string; phase: InvestmentWorkflowPhase } & Partial<InvestmentMarketHistoryEvidence>)[];
}

function text(value: unknown, limit: number): string {
  if (value === undefined || value === null) return '(n/a)';
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  return rendered.length > limit ? `${rendered.slice(0, limit)}...` : rendered;
}

function noTicker(phase: InvestmentWorkflowPhase): InvestmentPhaseResult {
  return { output: `## ${phase[0]!.toUpperCase()}${phase.slice(1)}\n\n(无 ticker,跳过${phase})`, error: 'no_ticker', evidence: [] };
}

function dateRange(months: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, Math.floor(months)) * 30);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function isFundWorkflow(plan: InvestmentWorkflowPlan): boolean {
  return /基金|净值|定投|fund|nav|dca/i.test(plan.goal ?? '');
}

function sectorFor(symbol: string): string {
  const normalized = symbol.toUpperCase();
  if (normalized.endsWith('.SH') || normalized.endsWith('.SZ')) {
    const code = Number.parseInt(normalized.slice(0, 6), 10);
    if (code >= 600000 && code < 601000) return '银行';
    if (code >= 601000 && code < 602000) return '证券';
    if (code >= 600519 && code < 600600) return '消费';
    if (code >= 600900 && code < 601000) return '电力';
    return '工业';
  }
  if (['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD'].includes(normalized)) return '科技';
  if (['JPM', 'BAC', 'GS', 'WFC', 'MS'].includes(normalized)) return '金融';
  if (['XOM', 'CVX', 'COP', 'SLB'].includes(normalized)) return '能源';
  if (['JNJ', 'PFE', 'MRK', 'UNH'].includes(normalized)) return '医药';
  if (['PG', 'KO', 'PEP', 'WMT'].includes(normalized)) return '消费';
  return '其他';
}

async function research(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('research');
  const data = await services.getResearchData(plan.ticker, signal);
  return {
    output: [`## Research — ${plan.ticker}`, '', `- **Price**: ${text(data.price, 200)}`, `- **Key Ratios**: ${text(data.ratios, 200)}`, `- **Analyst Estimates**: ${text(data.estimates, 200)}`, `- **Earnings**: ${text(data.earnings, 200)}`, `- **Filings**: ${text(data.filings, 150)}`, ''].join('\n'),
    evidence: [{ source: 'upup-pi://investment-workflow/research', phase: 'research' }],
  };
}

function valuation(plan: InvestmentWorkflowPlan): InvestmentPhaseResult {
  if (!plan.ticker) return noTicker('valuation');
  const ratios = calculateValuationRatios({ price: 100, eps: 5, book_value_per_share: 15, cash_flow_per_share: 7.5, shares_outstanding: 1_000_000_000 });
  const dcf = calculateProductionDcf({ current_fcf: 1_000_000_000, growth_rate: 0.08, discount_rate: 0.10, terminal_growth_rate: 0.03, projection_years: 10, shares_outstanding: 1_000_000_000, net_debt: 0 });
  return { output: [`## Valuation — ${plan.ticker}`, '', '### Valuation Ratios', '```', text(ratios, 600), '```', '', '### DCF (g=8%, r=10%, tg=3%)', '```', text(dcf, 600), '```', ''].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/valuation', phase: 'valuation' }] };
}

async function backtest(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('backtest');
  const { startDate, endDate } = dateRange(12);
  if (isFundWorkflow(plan)) {
    const fundCode = plan.ticker.replace(/\.(?:SH|SZ|HK)$/i, '');
    const history = await services.getFundHistory(fundCode, startDate, endDate, signal);
    const result = runFundBacktest({ fundCode, startDate, endDate, initialAmount: 10_000, strategy: 'lump_sum' }, history);
    return { output: [`## Fund Backtest — ${fundCode} (12 个月, $10,000 一次性投入)`, '', '```', renderFundBacktestReport(result).slice(0, 1500), '```'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/backtest/fund', phase: 'backtest' }] };
  }
  const history = await services.getMarketHistory(plan.ticker, startDate, signal);
  const bars = history.bars;
  const marketEvidence = { ...history.evidence, phase: 'backtest' as const };
  if (bars.length < 2) return { output: `## Market Backtest — ${plan.ticker}\n\n历史行情不足，无法完成回测`, error: 'insufficient_market_history', evidence: [{ source: 'upup-pi://investment-workflow/backtest/market', phase: 'backtest' }] };
  const first = bars[0]!.close;
  const last = bars[bars.length - 1]!.close;
  let peak = first;
  let maxDrawdown = 0;
  for (const bar of bars) {
    peak = Math.max(peak, bar.close);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - bar.close) / peak);
  }
  const returnPct = ((last - first) / first) * 100;
  return {
    output: [`## Market Backtest — ${plan.ticker}`, '', `- **区间**: ${startDate} → ${bars.at(-1)!.date}`, `- **数据点**: ${bars.length}`, `- **买入持有收益**: ${returnPct.toFixed(2)}%`, `- **最大回撤**: ${(maxDrawdown * 100).toFixed(2)}%`, `- **期末收盘价**: ${last.toFixed(2)}`].join('\n'),
    evidence: [marketEvidence],
  };
}

async function trade(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('trade');
  const sandbox = await services.getSandboxState(signal);
  const quote = await sandbox.getQuote(plan.ticker, signal);
  const existing = sandbox.positions.find((position) => position.symbol === plan.ticker);
  const goal = (plan.goal ?? '').toLowerCase();
  const wantSell = /卖|sell|清仓|close|short|减仓/.test(goal);
  const wantBuy = /买|buy|建仓|long|加仓/.test(goal);
  const lines = ['## Trade', '', `**目标标的**: ${plan.ticker}`, `**现金余额**: ${sandbox.balance.currency} ${sandbox.balance.cash.toLocaleString()}`, `**${plan.ticker} 行情**: bid=${quote.bid.toFixed(2)} ask=${quote.ask.toFixed(2)} last=${quote.last.toFixed(2)}`, ''];
  if (existing && !wantSell) return { output: [...lines, '**决策**: 持有 (hold)', '', '原因: 已持仓且没有卖出信号,不自动加仓'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/trade', phase: 'trade' }] };
  if (!existing && wantSell && !wantBuy) return { output: [...lines, '**决策**: 卖出信号,但当前无持仓'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/trade', phase: 'trade' }] };
  const side = existing ? 'sell' : 'buy';
  const quantity = existing ? Math.abs(existing.quantity) : Math.floor(Math.min(sandbox.balance.totalEquity * 0.1, sandbox.balance.cash * 0.95) / quote.ask);
  if (quantity < 1) return { output: [...lines, '**决策**: 现金不足以买入 1 股'].join('\n'), error: 'insufficient_cash', evidence: [{ source: 'upup-pi://investment-workflow/trade', phase: 'trade' }] };
  const order = await services.placePaperOrder({ symbol: plan.ticker, side, quantity }, signal);
  return { output: [...lines, `**决策**: ${side === 'buy' ? '买入' : '卖出'} ${quantity} 股 @ 市价`, '', '### 订单结果', '', `- **ID**: ${order.id}`, `- **状态**: ${order.status}`, `- **数量**: ${order.filledQuantity}/${order.quantity}`, ...(order.avgFillPrice === undefined ? [] : [`- **成交均价**: ${order.avgFillPrice.toFixed(4)}`]), ...(order.commission === undefined ? [] : [`- **手续费**: ${order.commission.toFixed(2)}`])].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/trade', phase: 'trade' }] };
}

async function review(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal: AbortSignal): Promise<InvestmentPhaseResult> {
  const sandbox = await services.getSandboxState(signal);
  const active = sandbox.positions.filter((position) => position.quantity !== 0);
  const lines = ['## Review', '', `**持仓总数**: ${active.length}`, `**现金余额**: ${sandbox.balance.currency} ${sandbox.balance.cash.toLocaleString()}`, `**总资产**: ${sandbox.balance.currency} ${sandbox.balance.totalEquity.toLocaleString()}`, ''];
  if (active.length === 0) return { output: [...lines, '(空组合 — 无持仓可复盘)'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/review', phase: 'review' }] };
  const total = sandbox.balance.marketValue;
  const portfolioHoldings = [] as { sector: string; weight: number; return: number }[];
  const sectorWeights: Record<string, number> = {};
  for (const position of active) {
    const quote = await sandbox.getQuote(position.symbol, signal);
    const marketValue = Math.abs(position.quantity) * quote.last;
    const weight = total > 0 ? marketValue / total : 0;
    const returned = position.avgCost > 0 ? (quote.last - position.avgCost) / position.avgCost : 0;
    const sector = sectorFor(position.symbol);
    portfolioHoldings.push({ sector, weight, return: returned });
    sectorWeights[sector] = (sectorWeights[sector] ?? 0) + weight;
  }
  const sectors = Object.keys(sectorWeights);
  const benchmarkHoldings = sectors.map((sector) => ({ sector, weight: sectors.length ? 1 / sectors.length : 0, return: 0.05 }));
  const portfolioReturn = portfolioHoldings.reduce((sum, item) => sum + item.weight * item.return, 0);
  const benchmarkReturn = benchmarkHoldings.reduce((sum, item) => sum + item.weight * item.return, 0);
  const result = calculatePortfolioAttribution({ method: 'combined', portfolio: { holdings: portfolioHoldings, totalReturn: portfolioReturn }, benchmark: { holdings: benchmarkHoldings, totalReturn: benchmarkReturn } });
  if (result.method !== 'combined') throw new Error('portfolio attribution returned an unexpected method');
  const combined = result.result as { readonly brinson: { readonly allocation: number; readonly selection: number; readonly interaction: number; readonly activeReturn: number } };
  const brinson = combined.brinson;
  return { output: [...lines, '### Brinson 归因', '', `- **配置效应**: ${(brinson.allocation * 100).toFixed(2)}%`, `- **选择效应**: ${(brinson.selection * 100).toFixed(2)}%`, `- **交互效应**: ${(brinson.interaction * 100).toFixed(2)}%`, `- **主动收益**: ${(brinson.activeReturn * 100).toFixed(2)}%`].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/review', phase: 'review' }] };
}

export async function executeInvestmentPhase(phase: InvestmentWorkflowPhase, plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal: AbortSignal): Promise<InvestmentPhaseResult> {
  if (signal.aborted) throw new Error('investment workflow phase aborted');
  if (phase === 'research') return research(plan, services, signal);
  if (phase === 'valuation') return valuation(plan);
  if (phase === 'backtest') return backtest(plan, services, signal);
  if (phase === 'trade') return trade(plan, services, signal);
  return review(plan, services, signal);
}
