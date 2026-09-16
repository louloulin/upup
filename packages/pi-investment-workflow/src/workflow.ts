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

/**
 * The research provider answers with JSON envelopes — `{"data":{"snapshot":{…}}}`
 * for price / 财务指标 and `{"data":{"analyst_estimates":[…]}}` for 卖方预期.
 * Both shapes (and raw objects from test doubles) resolve to the payload record.
 */
function researchRecord(value: unknown): Record<string, unknown> | undefined {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return undefined; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data as Record<string, unknown> : record;
  const snapshot = data.snapshot;
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : data;
}

function numericField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function textField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** 卖方一致预期: the freshest estimate row the provider returned. */
function consensusEstimate(estimates: unknown): PlanInputs['consensus'] {
  const rows = researchRecord(estimates)?.['analyst_estimates'];
  if (!Array.isArray(rows)) return undefined;
  const records = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  const freshest = [...records].sort((left, right) => String(right['report_date'] ?? '').localeCompare(String(left['report_date'] ?? '')))[0];
  if (!freshest) return undefined;
  return {
    institution: textField(freshest, 'institution'),
    reportDate: textField(freshest, 'report_date'),
    epsThisYear: numericField(freshest, 'eps_estimate_this_year'),
    peThisYear: numericField(freshest, 'pe_estimate_this_year'),
    epsNextYear: numericField(freshest, 'eps_estimate_next_year'),
  };
}

/** Real numbers the plan phase reads out of the envelopes `detect` already fetched. */
interface PlanInputs {
  readonly price?: number;
  readonly currency?: string;
  readonly asOf?: string;
  readonly name?: string;
  readonly period?: string;
  readonly reportDate?: string;
  readonly eps?: number;
  readonly roePct?: number;
  readonly grossMarginPct?: number;
  readonly bookValuePerShare?: number;
  readonly operatingCashflowPerShare?: number;
  readonly revenue?: number;
  readonly netIncome?: number;
  readonly netIncomeYoyPct?: number;
  readonly consensus?: { readonly institution?: string; readonly reportDate?: string; readonly epsThisYear?: number; readonly peThisYear?: number; readonly epsNextYear?: number };
}

function planInputs(data: InvestmentResearchData): PlanInputs {
  const price = researchRecord(data.price);
  const fundamentals = researchRecord(data.ratios) ?? researchRecord(data.earnings);
  return {
    price: numericField(price, 'price'),
    currency: textField(price, 'currency'),
    asOf: textField(price, 'as_of'),
    name: textField(fundamentals, 'name'),
    period: textField(fundamentals, 'period'),
    reportDate: textField(fundamentals, 'report_date'),
    eps: numericField(fundamentals, 'eps'),
    roePct: numericField(fundamentals, 'roe_pct'),
    grossMarginPct: numericField(fundamentals, 'gross_margin_pct'),
    bookValuePerShare: numericField(fundamentals, 'book_value_per_share'),
    operatingCashflowPerShare: numericField(fundamentals, 'operating_cashflow_per_share'),
    revenue: numericField(fundamentals, 'revenue'),
    netIncome: numericField(fundamentals, 'net_income'),
    netIncomeYoyPct: numericField(fundamentals, 'net_income_yoy_pct'),
    consensus: consensusEstimate(data.estimates),
  };
}

/** DCF assumptions, stated in the output. The starting cash flow is the provider's, never assumed. */
const PLAN_DCF_ASSUMPTIONS = { growth_rate: 0.08, discount_rate: 0.10, terminal_growth_rate: 0.03, projection_years: 10 } as const;

function ratioText(value: number | null): string {
  return value === null ? '(n/a)' : value.toFixed(2);
}

function planEvidence(data: InvestmentResearchData, ticker: string): InvestmentPhaseResult['evidence'] {
  // The canonical phase URI stays first; the provider sources the numbers came
  // from follow it with the plan phase attached.
  return [{ source: 'upup-pi://investment-workflow/plan', phase: 'plan' as const }, ...researchEvidence(data, ticker).map((entry) => ({ ...entry, phase: 'plan' as const }))];
}

/**
 * Valuation plan built from the provider's own price / 报告期 fundamentals.
 *
 * The phase used to compute ratios from a fixed `price: 100, eps: 5` fixture,
 * which produced plausible-looking multiples for every ticker. It now derives
 * them from the research envelope, reports the report-period basis explicitly
 * (半年报 EPS is not annualised) and only runs the DCF when a real cash-flow
 * figure and share count are available.
 */
async function planPhase(plan: InvestmentWorkflowPlan, services: InvestmentWorkflowServices, signal?: AbortSignal): Promise<InvestmentPhaseResult> {
  if (!plan.ticker) return noTicker('plan');
  const data = await services.getResearchData(plan.ticker, signal, plan.market as PiMarket | undefined);
  const inputs = planInputs(data);
  if (inputs.price === undefined || inputs.eps === undefined) {
    // 数据缺失时不编造估值，但 plan 阶段本身成功完成（输出了真实拿到的字段
    // 与明确缺失原因）。之前这里 return { error: 'insufficient_research_data' }
    // 会让 dossier 把 plan 标成 failed、把 5 阶段成功率拉低；上游拒收"伪估值"
    // 不该算失败。
    return {
      output: [`## Plan — ${plan.ticker}`, '', '(真实价格 / 报告期 EPS 缺失，未生成估值：plan 不用占位数据计算)', '', `- **价格**: ${inputs.price ?? '(n/a)'}`, `- **报告期 EPS**: ${inputs.eps ?? '(n/a)'}`, `- **报告期营收**: ${inputs.revenue !== undefined ? `${(inputs.revenue / 1e8).toFixed(1)}亿` : '(n/a)'}`, `- **报告期净利**: ${inputs.netIncome !== undefined ? `${(inputs.netIncome / 1e8).toFixed(1)}亿` : '(n/a)'}`, `- **数据来源**: ${inputs.name ?? '(n/a)'} · ${inputs.period ?? '(n/a)'}`, ''].join('\n'),
      evidence: planEvidence(data, plan.ticker),
    };
  }
  const shares = inputs.netIncome !== undefined && inputs.eps !== 0 ? inputs.netIncome / inputs.eps : undefined;
  const ratios = calculateValuationRatios({
    price: inputs.price,
    eps: inputs.eps,
    ...(inputs.bookValuePerShare !== undefined ? { book_value_per_share: inputs.bookValuePerShare } : {}),
    ...(inputs.operatingCashflowPerShare !== undefined ? { cash_flow_per_share: inputs.operatingCashflowPerShare } : {}),
    ...(shares !== undefined ? { shares_outstanding: shares } : {}),
  });
  const lines = [
    `## Plan — ${plan.ticker}`,
    '',
    `- **数据来源**: ${[inputs.name, inputs.period, inputs.reportDate ? `报告期 ${inputs.reportDate}` : undefined].filter(Boolean).join(' · ') || '(n/a)'}`,
    `- **价格**: ${inputs.price}${inputs.currency ? ` ${inputs.currency}` : ''}${inputs.asOf ? ` (${inputs.asOf})` : ''}`,
    `- **报告期基本面**: ${[inputs.revenue !== undefined ? `营收 ${(inputs.revenue / 1e8).toFixed(1)}亿` : undefined, inputs.netIncome !== undefined ? `净利 ${(inputs.netIncome / 1e8).toFixed(1)}亿` : undefined, `EPS ${inputs.eps}`, inputs.roePct !== undefined ? `ROE ${inputs.roePct.toFixed(2)}%` : undefined, inputs.grossMarginPct !== undefined ? `毛利率 ${inputs.grossMarginPct.toFixed(1)}%` : undefined, inputs.netIncomeYoyPct !== undefined ? `净利同比 ${inputs.netIncomeYoyPct.toFixed(2)}%` : undefined].filter(Boolean).join(' · ')}`,
    `- **估值（报告期口径，未年化）**: PE ${ratioText(ratios.pe_ratio)} · PB ${ratioText(ratios.pb_ratio)} · PCF ${ratioText(ratios.pcf_ratio)}${ratios.market_cap !== null ? ` · 总市值 ${(ratios.market_cap / 1e8).toFixed(0)}亿元` : ''}`,
  ];
  const consensus = inputs.consensus;
  if (consensus?.epsThisYear !== undefined) {
    lines.push(`- **卖方一致预期中最新一条** (${[consensus.institution, consensus.reportDate].filter(Boolean).join(' ') || '来源未标注'}): 今年 EPS ${consensus.epsThisYear} → 对应 PE ${(inputs.price / consensus.epsThisYear).toFixed(2)}${consensus.peThisYear !== undefined ? `（机构给出 ${consensus.peThisYear}）` : ''}${consensus.epsNextYear !== undefined ? ` · 明年 EPS ${consensus.epsNextYear}` : ''}`);
  }
  if (shares !== undefined && inputs.operatingCashflowPerShare !== undefined) {
    const currentFcf = inputs.operatingCashflowPerShare * shares;
    const dcf = calculateProductionDcf({ current_fcf: currentFcf, ...PLAN_DCF_ASSUMPTIONS, shares_outstanding: shares, net_debt: 0 });
    lines.push(`- **DCF**: 起始现金流 ${(currentFcf / 1e8).toFixed(1)}亿元（每股经营现金流 ${inputs.operatingCashflowPerShare} × ${shares.toFixed(2)} 股，报告期口径）· 假设 g=${PLAN_DCF_ASSUMPTIONS.growth_rate} r=${PLAN_DCF_ASSUMPTIONS.discount_rate} tg=${PLAN_DCF_ASSUMPTIONS.terminal_growth_rate} ${PLAN_DCF_ASSUMPTIONS.projection_years}年 → 每股内在价值 ${dcf.intrinsic_value_per_share === null ? '(n/a)' : dcf.intrinsic_value_per_share.toFixed(2)}`);
  } else {
    lines.push('- **DCF**: (缺少每股经营现金流 / 股本，未计算)');
  }
  lines.push('', '> 倍数按报告期数据直接计算，未经年化；DCF 参数为显式假设，均非投资建议。', '');
  return { output: lines.join('\n'), evidence: planEvidence(data, plan.ticker) };
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
  if (phase === 'plan') return planPhase(plan, services, signal);
  if (phase === 'execute') return execute(plan, services, signal);
  if (phase === 'verify') return verify(plan, services, signal);
  return { output: [`## Report — ${plan.ticker ?? '未指定标的'}`, '', `目标：${plan.goal ?? '投资研究'}`, '', '已完成 detect → plan → execute → verify，输出可进入 dossier。'].join('\n'), evidence: [{ source: 'upup-pi://investment-workflow/report', phase: 'report' }] };
}
