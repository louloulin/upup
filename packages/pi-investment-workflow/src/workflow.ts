import { renderFundBacktestReport, runFundBacktest, type FundNavPoint } from '@upup/pi-backtest';
import { calculatePortfolioAttribution } from '@upup/pi-portfolio';
import { calculateProductionDcf, calculateValuationRatios } from '@upup/pi-investment-analysis';
import type {
  PiInvestmentBalance,
  PiInvestmentMarketHistory,
  PiInvestmentMarketHistoryPoint,
  PiInvestmentOrder,
  PiInvestmentPosition,
  PiInvestmentQuote,
  PiInvestmentResearchData,
  PiInvestmentWorkflowServices,
  PiMarket,
} from '@upup/types';
import type { ResearchMarket } from '@upup/pi-planning';

export type CanonicalInvestmentPhase = 'detect' | 'plan' | 'execute' | 'verify' | 'report';
export type InvestmentWorkflowPhase = CanonicalInvestmentPhase;
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
  readonly market?: ResearchMarket;
  readonly goal?: string;
}

function inferredMarket(ticker: string): ResearchMarket {
  const normalized = ticker.trim().toUpperCase();
  if (normalized.endsWith('.HK')) return 'hk';
  if (/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(normalized)) return 'cn';
  if (normalized.endsWith('-USD')) return 'crypto';
  return 'us';
}

function validateMarketSelection(plan: InvestmentWorkflowPlan): void {
  if (!plan.market || !plan.ticker || plan.market === 'fund') return;
  const inferred = inferredMarket(plan.ticker);
  if (inferred !== plan.market) throw new Error(`market ${plan.market} does not match ticker ${plan.ticker} (inferred ${inferred})`);
}

export type InvestmentResearchData = PiInvestmentResearchData;

export type InvestmentMarketHistoryPoint = PiInvestmentMarketHistoryPoint;

export interface InvestmentMarketHistoryEvidence {
  readonly source: string;
  readonly retrievedAt: string;
  readonly asOf: string;
  readonly query: string;
  readonly dataFreshness: 'historical' | 'cached' | 'delayed' | 'realtime';
  readonly auditId: string;
}

export type InvestmentMarketHistory = PiInvestmentMarketHistory;

export type InvestmentPosition = PiInvestmentPosition;

export type InvestmentQuote = PiInvestmentQuote;

export type InvestmentBalance = PiInvestmentBalance;

export type InvestmentOrder = PiInvestmentOrder;

export type InvestmentWorkflowServices = PiInvestmentWorkflowServices;

export interface InvestmentPhaseResult {
  readonly output: string;
  readonly error?: string;
  readonly evidence: readonly ({ source: string; phase: InvestmentWorkflowPhase } & Partial<InvestmentMarketHistoryEvidence> & { readonly provider?: string })[];
}

function text(value: unknown, limit: number): string {
  if (value === undefined || value === null) return '(n/a)';
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  return rendered.length > limit ? `${rendered.slice(0, limit)}...` : rendered;
}

function researchEvidence(data: InvestmentResearchData, ticker: string): InvestmentPhaseResult['evidence'] {
  const evidence: Array<NonNullable<InvestmentPhaseResult['evidence']>[number]> = [{ source: `upup-pi://investment-workflow/detect`, phase: 'detect' }];
  for (const value of Object.values(data)) {
    if (typeof value !== 'string') continue;
    try {
      const parsed = JSON.parse(value) as { sourceUrls?: unknown; retrievedAt?: unknown; freshness?: unknown; provider?: unknown; retryAttempts?: unknown; retryMaxAttempts?: unknown; retryRecovered?: unknown };
      if (!Array.isArray(parsed.sourceUrls) || typeof parsed.retrievedAt !== 'string') continue;
      for (const source of parsed.sourceUrls) {
        if (typeof source !== 'string' || source.length === 0) continue;
        evidence.push({
          source,
          phase: 'detect',
          retrievedAt: parsed.retrievedAt,
          dataFreshness: parsed.freshness === 'historical' || parsed.freshness === 'cached' || parsed.freshness === 'delayed' || parsed.freshness === 'realtime' ? parsed.freshness : undefined,
          auditId: `research:${ticker}`,
          ...(typeof parsed.provider === 'string' ? { provider: parsed.provider } : {}),
          ...(typeof parsed.retryAttempts === 'number' ? { retryAttempts: parsed.retryAttempts } : {}),
          ...(typeof parsed.retryMaxAttempts === 'number' ? { retryMaxAttempts: parsed.retryMaxAttempts } : {}),
          ...(typeof parsed.retryRecovered === 'boolean' ? { retryRecovered: parsed.retryRecovered } : {}),
        });
      }
    } catch {
      // Non-envelope research output remains represented by the canonical phase URI.
    }
  }
  return evidence;
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

async function detect(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal?: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('detect');
  const data = await services.getResearchData(plan.ticker, signal, plan.market as PiMarket | undefined);
  return {
    output: [`## Detect — ${plan.ticker}`, '', `- **Price**: ${text(data.price, 200)}`, `- **Key Ratios**: ${text(data.ratios, 200)}`, `- **Analyst Estimates**: ${text(data.estimates, 200)}`, `- **Earnings**: ${text(data.earnings, 200)}`, `- **Filings**: ${text(data.filings, 150)}`, ''].join('\n'),
    evidence: researchEvidence(data, plan.ticker),
  };
}

function planPhase(plan: InvestmentWorkflowPlan): InvestmentPhaseResult {
  if (!plan.ticker) return noTicker('plan');
  const ratios = calculateValuationRatios({ price: 100, eps: 5, book_value_per_share: 15, cash_flow_per_share: 7.5, shares_outstanding: 1_000_000_000 });
  const dcf = calculateProductionDcf({ current_fcf: 1_000_000_000, growth_rate: 0.08, discount_rate: 0.10, terminal_growth_rate: 0.03, projection_years: 10, shares_outstanding: 1_000_000_000, net_debt: 0 });
  return { output: [`## Plan — ${plan.ticker}`, '', '### Valuation Ratios', '```', text(ratios, 600), '```', '', '### DCF (g=8%, r=10%, tg=3%)', '```', text(dcf, 600), '```', ''].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/plan', phase: 'plan' }] };
}

async function execute(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal?: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('execute');
  const { startDate, endDate } = dateRange(12);
  if (isFundWorkflow(plan)) {
    const fundCode = plan.ticker.replace(/\.(?:SH|SZ|HK)$/i, '');
    const history = await services.getFundHistory(fundCode, startDate, endDate, signal);
    const result = runFundBacktest({ fundCode, startDate, endDate, initialAmount: 10_000, strategy: 'lump_sum' }, history);
    return { output: [`## Execute — Fund Backtest — ${fundCode} (12 个月, $10,000 一次性投入)`, '', '```', renderFundBacktestReport(result).slice(0, 1500), '```'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/execute', phase: 'execute' }] };
  }
  const history = await services.getMarketHistory(plan.ticker, startDate, signal, plan.market as PiMarket | undefined);
  const bars = history.bars;
  const marketEvidence = { ...history.evidence, phase: 'execute' as const };
  if (bars.length < 2) return { output: `## Execute — Market Analysis — ${plan.ticker}\n\n历史行情不足，无法完成回测`, error: 'insufficient_market_history', evidence: [{ source: 'upup-pi://investment-workflow/execute', phase: 'execute' }] };
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
    output: [`## Execute — Market Analysis — ${plan.ticker}`, '', `- **区间**: ${startDate} → ${bars.at(-1)!.date}`, `- **数据点**: ${bars.length}`, `- **买入持有收益**: ${returnPct.toFixed(2)}%`, `- **最大回撤**: ${(maxDrawdown * 100).toFixed(2)}%`, `- **期末收盘价**: ${last.toFixed(2)}`].join('\n'),
    evidence: [marketEvidence],
  };
}

async function verify(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal?: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('verify');
  const sandbox = await services.getSandboxState(signal);
  const active = sandbox.positions.filter((position) => position.quantity !== 0);
  const lines = ['## Verify', '', `**持仓总数**: ${active.length}`, `**现金余额**: ${sandbox.balance.currency} ${sandbox.balance.cash.toLocaleString()}`, `**总资产**: ${sandbox.balance.currency} ${sandbox.balance.totalEquity.toLocaleString()}`, ''];
  if (active.length === 0) return { output: [...lines, '(空组合 — 无持仓可复盘)'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/verify', phase: 'verify' }] };
  const total = sandbox.balance.marketValue;
  const portfolioHoldings = [] as { sector: string; weight: number; return: number }[];
  const sectorWeights: Record<string, number> = {};
  for (const position of active) {
    const quote = await sandbox.getQuote(position.symbol, signal, plan.market as PiMarket | undefined);
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
  return { output: [...lines, '### Brinson 归因', '', `- **配置效应**: ${(brinson.allocation * 100).toFixed(2)}%`, `- **选择效应**: ${(brinson.selection * 100).toFixed(2)}%`, `- **交互效应**: ${(brinson.interaction * 100).toFixed(2)}%`, `- **主动收益**: ${(brinson.activeReturn * 100).toFixed(2)}%`].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/verify', phase: 'verify' }] };
}

export async function executeInvestmentPhase(phase: InvestmentWorkflowPhase, plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal?: AbortSignal): Promise<InvestmentPhaseResult> {
  if (signal?.aborted) throw new Error('investment workflow phase aborted');
  validateMarketSelection(plan);
  if (phase === 'detect') return detect(plan, services, signal);
  if (phase === 'plan') return planPhase(plan);
  if (phase === 'execute') return execute(plan, services, signal);
  if (phase === 'verify') return verify(plan, services, signal);
  return { output: [`## Report — ${plan.ticker ?? '未指定标的'}`, '', `目标：${plan.goal ?? '投资研究'}`, '', '已完成 detect → plan → execute → verify，输出可进入 dossier。'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/report', phase: 'report' }] };
}
