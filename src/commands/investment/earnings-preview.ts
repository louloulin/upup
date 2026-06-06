/**
 * /earnings-preview <TICKER>  /  /earnings <TICKER>
 *
 * v5 Sprint 2.2 + P1.a — 财报前瞻
 *
 *  P1.a.5 引入 EarningsPreview 数据类型 + buildEarningsPreview 构造器(框架模式)
 *  P1.a.1 引入 buildEarningsPreviewAsync(完整模式,接入 estimates + x-search + 8-K)
 *  P1.a.4 引入 diff_against_prior_call(对比上次财报会)
 *
 * 模块边界(关键 — 避免循环依赖):
 * - buildEarningsPreview(同步,只读 .upup/plans/)→ 零 src/tools 依赖
 * - buildEarningsPreviewAsync(异步,调用 fetchers)→ 调 src/search + src/tools/finance
 * - 不依赖 src/agent/*(避免反向)
 * - P1.a.5+ 的 EarningsPreview 暴露给 mcp/upup-resources.ts 用作 upup:// 资源
 */

import { existsSync, readdirSync } from 'node:fs';
import { PLANS_DIR } from '../../utils/storage-paths.js';
import { buildResearchPlan, extractTicker } from '../../plan/plan-builder.js';
import { loadPlan } from '../../plan/plan-executor.js';
import type { ResearchPlan } from '../../plan/research-plan.js';
import { searchX, type XSearchResult } from '../../search/x-search.js';
import {
  fetchEarningsTranscripts,
  type TranscriptFetcher,
} from '../../tools/finance/earnings-transcripts.js';
import { getAnalystEstimates } from '../../tools/finance/estimates.js';
import type { DossierStore, EarningsCallNote } from '../../memory/dossier.js';

// ---------------------------------------------------------------------------
// Public data model — exported so MCP / dossier / CLI can share
// ---------------------------------------------------------------------------

/** Source completeness — drives UI affordances and gating. */
export type EarningsPreviewSource = 'framework' | 'partial' | 'full';

/** Consensus estimate (P1.a.1: estimates.ts integration). */
export interface ConsensusEstimate {
  /** Period label, e.g. "Q3 2025" or "FY 2025". */
  period: string;
  /** Metric name, e.g. "revenue", "eps". */
  metric: string;
  /** Consensus value (units depend on metric). */
  consensus: number;
  /** Previous period actual or estimate (for context). */
  prior?: number;
  /** 30-day revision percent (positive = up, negative = down). */
  revisionPct?: number;
  /** Currency code, e.g. "USD". */
  currency?: string;
}

/** Tweet / X post (P1.a.1 x-search). */
export interface TweetRef {
  handle: string;
  tweetId: string;
  url: string;
  ts: number;
  /** Used to colour-code sentiment in CLI rendering. */
  authorKind: 'analyst-sell' | 'analyst-buy' | 'analyst-other' | 'company' | 'other';
  snippet: string;
}

/** Earnings call transcript reference (P1.a.1 8-K earnings_transcript). */
export interface TranscriptRef {
  /** 8-K filing date YYYY-MM-DD. */
  filingDate: string;
  url: string;
  /** Short excerpt, <= 240 chars. */
  excerpt: string;
  ts: number;
}

/**
 * Structured earnings preview — the single object exposed to:
 *   - /earnings-preview / /earnings CLI (renders text)
 *   - upup://earnings-preview/{ticker} MCP resource
 *   - dossier.earningsCalls[] (P1.a.4 writes a derived EarningsCallNote)
 */
export interface EarningsPreview {
  ticker: string;
  generatedAt: number;
  source: EarningsPreviewSource;
  consensus: ConsensusEstimate[];
  recentTweets: TweetRef[];
  transcripts: TranscriptRef[];
  history: ResearchPlan[];
  planFramework: ResearchPlan;
  /** Optional diff vs prior call — populated in P1.a.4. */
  diff_against_prior_call?: {
    toneDelta?: string;
    qaBalanceDelta?: string;
    lastCallTs?: number;
  };
}

export interface BuildEarningsPreviewOptions {
  /** Override PLANS_DIR for tests. */
  plansDir?: string;
  /** Inject clock for tests. */
  now?: () => number;
  /**
   * Optional dossier store — when provided, the sync builder reads
   * the most recent prior earnings call from `dossier.earningsCalls[]`
   * and populates `diff_against_prior_call`. P1.a.4.
   */
  dossiers?: DossierStore;
  /**
   * `true` skips any network-touching data sources.
   * P1.a.1 default: false (try the real APIs).
   * Tests should pass true to keep the suite hermetic.
   */
  offline?: boolean;
  /**
   * Inject a transcript fetcher (default = live 8-K via financial_datasets).
   * P1.a.1: tests inject a mock to avoid network calls.
   */
  transcriptFetcher?: TranscriptFetcher;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTicker(args: string): string | undefined {
  const raw = args.trim();
  if (!raw) return undefined;
  return extractTicker(raw) ?? raw.split(/\s+/)[0]?.toUpperCase();
}

/** Load this ticker's prior research plans from .upup/plans/. */
function loadTickerHistory(ticker: string, plansDir: string): ResearchPlan[] {
  if (!existsSync(plansDir)) return [];
  const plans: ResearchPlan[] = [];
  try {
    const files = readdirSync(plansDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      const p = loadPlan(id);
      if (p?.ticker === ticker) plans.push(p);
    }
  } catch {
    // ignore — best-effort read
  }
  return plans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Convert an XSearchResult to our TweetRef (shape is identical). */
function toTweetRef(r: XSearchResult): TweetRef {
  return {
    handle: r.handle,
    tweetId: r.tweetId,
    url: r.url,
    ts: r.ts,
    authorKind: r.authorKind,
    snippet: r.snippet,
  };
}

// ---------------------------------------------------------------------------
// Async fetchers (P1.a.1)
// ---------------------------------------------------------------------------

/**
 * Pull consensus estimates via the existing getAnalystEstimates tool.
 * Returns [] on error or missing API key — best-effort, never throws.
 */
async function fetchConsensus(
  ticker: string,
  offline: boolean,
): Promise<ConsensusEstimate[]> {
  if (offline) return [];
  if (!process.env['FINANCIAL_DATASETS_API_KEY']) return [];
  try {
    const raw = await getAnalystEstimates.invoke({ ticker, period: 'quarterly' });
    return parseAnalystEstimates(raw);
  } catch {
    return [];
  }
}

interface AnalystEstimateRow {
  period?: string;
  estimated_revenue?: number;
  estimated_eps?: number;
  estimated_ebitda?: number;
  estimated_net_income?: number;
  revenue_estimate?: number;
  eps_estimate?: number;
  revenue?: number;
  eps?: number;
  consensus?: number;
  prior_period_value?: number;
  revision_pct?: number;
  currency?: string;
}

function parseAnalystEstimates(raw: unknown): ConsensusEstimate[] {
  let rows: AnalystEstimateRow[] = [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) rows = parsed as AnalystEstimateRow[];
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { analyst_estimates?: unknown[] }).analyst_estimates)) {
        rows = (parsed as { analyst_estimates: AnalystEstimateRow[] }).analyst_estimates;
      }
    } catch { return []; }
  } else if (Array.isArray(raw)) {
    rows = raw as AnalystEstimateRow[];
  }
  const out: ConsensusEstimate[] = [];
  for (const r of rows.slice(0, 4)) {
    const period = r.period ?? '?';
    if (typeof r.estimated_revenue === 'number' || typeof r.revenue_estimate === 'number' || typeof r.revenue === 'number') {
      out.push({
        period,
        metric: 'revenue',
        consensus: r.estimated_revenue ?? r.revenue_estimate ?? r.revenue ?? 0,
        prior: r.prior_period_value,
        revisionPct: r.revision_pct,
        currency: r.currency ?? 'USD',
      });
    }
    if (typeof r.estimated_eps === 'number' || typeof r.eps_estimate === 'number' || typeof r.eps === 'number') {
      out.push({
        period,
        metric: 'eps',
        consensus: r.estimated_eps ?? r.eps_estimate ?? r.eps ?? 0,
        prior: r.prior_period_value,
        revisionPct: r.revision_pct,
        currency: r.currency ?? 'USD',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff + persistence helpers (P1.a.4)
// ---------------------------------------------------------------------------

/**
 * Pure diff computation. Derives a `toneDelta` string from the current
 * preview's tweets (buy/sell/other). `qaBalanceDelta` is intentionally
 * left undefined — Q&A text is not in the data layer yet; that gap
 * belongs to a future transcript-summariser step. `lastCallTs` echoes
 * the prior call's timestamp so consumers can compute "X days since
 * the prior call".
 */
export function computeEarningsDiff(
  prior: EarningsCallNote,
  current: { recentTweets: TweetRef[]; transcripts: TranscriptRef[] },
): NonNullable<EarningsPreview['diff_against_prior_call']> {
  let buy = 0;
  let sell = 0;
  for (const t of current.recentTweets) {
    if (t.authorKind === 'analyst-buy') buy += 1;
    else if (t.authorKind === 'analyst-sell') sell += 1;
  }
  const total = current.recentTweets.length;
  const net = buy - sell;
  const label = net > 0 ? '净买入' : net < 0 ? '净卖出' : '中性';
  const toneDelta = total === 0
    ? undefined
    : `${label} ${net > 0 ? '+' : ''}${net} (${buy} 买 / ${sell} 卖 / ${total} 总)`;
  return {
    toneDelta,
    qaBalanceDelta: undefined,
    lastCallTs: prior.callTs,
  };
}

/**
 * Populate `preview.diff_against_prior_call` from the dossier's last
 * earnings call. Pure (does not mutate dossier); mutates the preview
 * in place for convenience and returns it. No-op when dossier is
 * missing or has no prior calls.
 */
export function populateEarningsDiff(
  preview: EarningsPreview,
  dossiers: DossierStore | undefined,
): EarningsPreview {
  if (!dossiers) return preview;
  const d = dossiers.read(preview.ticker);
  if (!d || d.earningsCalls.length === 0) return preview;
  const prior = d.earningsCalls[d.earningsCalls.length - 1]!;
  preview.diff_against_prior_call = computeEarningsDiff(prior, {
    recentTweets: preview.recentTweets,
    transcripts: preview.transcripts,
  });
  return preview;
}

/**
 * Persist the just-built preview to the dossier as a new
 * `EarningsCallNote`. Creates the dossier first if it does not exist
 * (with a minimal snapshot). No-op when:
 *   - source === 'framework' (no real data)
 *   - transcripts is empty (nothing to reference)
 *
 * Returns the updated dossier for caller convenience.
 */
export function persistEarningsCallToDossier(
  dossiers: DossierStore,
  preview: EarningsPreview,
): void {
  if (preview.source === 'framework') return;
  if (preview.transcripts.length === 0) return;
  let d = dossiers.read(preview.ticker);
  if (!d) {
    d = dossiers.create(preview.ticker, {
      name: preview.ticker,
      oneLiner: 'auto-created from earnings-preview',
    });
  }
  const callId = `ec-${preview.ticker}-${preview.generatedAt}`;
  const transcriptRefs = preview.transcripts.map(t => t.url);
  const note: Omit<EarningsCallNote, 'callTs'> & { callTs?: number } = {
    callId,
    transcriptRefs,
    ...(preview.diff_against_prior_call?.toneDelta !== undefined && {
      toneDelta: preview.diff_against_prior_call.toneDelta,
    }),
    ...(preview.diff_against_prior_call?.qaBalanceDelta !== undefined && {
      qaBalanceDelta: preview.diff_against_prior_call.qaBalanceDelta,
    }),
  };
  dossiers.appendEarningsCall(preview.ticker, note);
}

// ---------------------------------------------------------------------------
// Core builder (sync, framework-only — P1.a.5)
// ---------------------------------------------------------------------------

/**
 * Build a framework-only preview — fast, no I/O beyond .upup/plans/.
 * The MCP resource reader and CLI runner fall back to this if data fetchers
 * fail. Source marker is always 'framework' here.
 */
export function buildEarningsPreview(
  ticker: string,
  opts: BuildEarningsPreviewOptions = {},
): EarningsPreview {
  const plansDir = opts.plansDir ?? PLANS_DIR;
  const now = opts.now ?? (() => Date.now());

  const preview: EarningsPreview = {
    ticker,
    generatedAt: now(),
    source: 'framework',
    consensus: [],
    recentTweets: [],
    transcripts: [],
    history: loadTickerHistory(ticker, plansDir),
    planFramework: buildResearchPlan(`分析 ${ticker} 估值与财报`, {
      description: `财报前瞻: 下次财报日期 + 共识预期 + 历史 surprise 平均`,
      ticker,
      phases: ['research', 'valuation'],
    }),
  };
  // P1.a.4: read last prior call from dossier (sync, in-memory) and
  // stamp the diff field. No-op when dossiers is not provided.
  populateEarningsDiff(preview, opts.dossiers);
  return preview;
}

// ---------------------------------------------------------------------------
// Core builder (async, with data — P1.a.1)
// ---------------------------------------------------------------------------

/**
 * Build the full preview by running fetchers in parallel:
 *   - consensus: getAnalystEstimates (network)
 *   - recentTweets: searchX (mock by default — see src/search/x-search.ts)
 *   - transcripts: fetchEarningsTranscripts (network; injectable for tests)
 *
 * Errors in any fetcher degrade that field to [] — the preview is still
 * returned. `source` reflects the highest tier reached:
 *   - 'full'    = all 3 fetchers returned data
 *   - 'partial' = at least 1 fetcher returned data
 *   - 'framework' = no fetchers returned data
 */
export async function buildEarningsPreviewAsync(
  ticker: string,
  opts: BuildEarningsPreviewOptions = {},
): Promise<EarningsPreview> {
  const base = buildEarningsPreview(ticker, opts);
  const now = opts.now ?? (() => Date.now());

  const upper = ticker.toUpperCase();

  const offline = opts.offline ?? false;
  const [consensus, tweets, transcripts] = await Promise.all([
    fetchConsensus(upper, offline),
    offline
      ? Promise.resolve([] as TweetRef[])
      : searchX(upper, { now: opts.now }).then(rs => rs.map(toTweetRef)).catch(() => [] as TweetRef[]),
    // transcripts: always call fetchEarningsTranscripts (which itself is
    // hermetic with a no-op default fetcher when no API key is set, and
    // an injected fetcher lets tests provide canned data even when offline).
    fetchEarningsTranscripts(upper, {
      fetcher: opts.transcriptFetcher,
      limit: 4,
      windowDays: 90,
    }),
  ]);

  const reached = [consensus.length > 0, tweets.length > 0, transcripts.length > 0].filter(Boolean).length;
  const source: EarningsPreviewSource =
    reached === 3 ? 'full' : reached >= 1 ? 'partial' : 'framework';

  return {
    ...base,
    generatedAt: now(),
    source,
    consensus,
    recentTweets: tweets,
    transcripts,
  };
}

// ---------------------------------------------------------------------------
// Text rendering (CLI)
// ---------------------------------------------------------------------------

function renderPlanFramework(plan: ResearchPlan): string {
  const lines: string[] = [
    '',
    '  📋 推荐研究计划(本地生成,无 LLM)',
    `  Plan ID: ${plan.id.slice(0, 8)}  (目标 ticker: ${plan.ticker ?? '?'})`,
    '',
    `  ${'#'.padStart(3)}  ${'Phase'.padEnd(10)} ${'Tool'.padEnd(25)} Expected Output`,
    '  ' + '─'.repeat(80),
  ];
  let i = 1;
  for (const step of plan.steps) {
    const binding = plan.toolBindings[step.id];
    const tool = binding?.tool ?? '?';
    const expected = binding?.expectedOutput ?? '?';
    const phase = plan.phases[Math.min(i - 1, plan.phases.length - 1)] ?? '?';
    lines.push(`  ${String(i).padStart(3)}  ${phase.padEnd(10)} ${tool.padEnd(25)} ${expected.slice(0, 40)}`);
    i += 1;
  }
  return lines.join('\n');
}

function renderHistory(plans: ResearchPlan[]): string[] {
  if (plans.length === 0) return ['  (无历史 plan)'];
  const lines: string[] = [`  共 ${plans.length} 条:`];
  for (const p of plans.slice(0, 5)) {
    const date = p.createdAt.toISOString().slice(0, 10);
    const phase = p.phase;
    const steps = p.steps.length;
    lines.push(`    • ${date}  [${phase.padEnd(8)}]  ${steps} 步  — ${p.goal.slice(0, 30)}`);
  }
  return lines;
}

function renderConsensusSection(preview: EarningsPreview): string[] {
  if (preview.consensus.length === 0) {
    return [
      '',
      '  📊 共识预期',
      '    (无数据 — 需 FINANCIAL_DATASETS_API_KEY 或离线模式)',
    ];
  }
  const lines: string[] = ['', '  📊 共识预期'];
  for (const c of preview.consensus) {
    const rev = c.revisionPct === undefined ? '' : ` (${c.revisionPct >= 0 ? '+' : ''}${c.revisionPct.toFixed(1)}% 30d)`;
    const prior = c.prior === undefined ? '' : ` / 上次 ${c.prior}`;
    lines.push(`    ${c.period.padEnd(10)} ${c.metric.padEnd(8)} ${c.consensus} ${c.currency ?? ''}${rev}${prior}`);
  }
  return lines;
}

function renderTweetsSection(preview: EarningsPreview): string[] {
  if (preview.recentTweets.length === 0) {
    return ['', '  🐦 卖方 / 买方近 7d 推文', '    (无数据)'];
  }
  const lines: string[] = ['', '  🐦 卖方 / 买方近 7d 推文'];
  for (const t of preview.recentTweets) {
    const tag = t.authorKind === 'analyst-sell' ? '🔻'
              : t.authorKind === 'analyst-buy'  ? '🟢'
              : t.authorKind === 'company'     ? '🏢'
              : '·';
    lines.push(`    ${tag} @${t.handle}  ${new Date(t.ts).toISOString().slice(0, 10)}`);
    lines.push(`       ${t.snippet.slice(0, 80)}`);
  }
  return lines;
}

function renderTranscriptsSection(preview: EarningsPreview): string[] {
  if (preview.transcripts.length === 0) {
    return ['', '  📜 8-K 电话会底稿', '    (无数据)'];
  }
  const lines: string[] = ['', '  📜 8-K 电话会底稿'];
  for (const r of preview.transcripts) {
    lines.push(`    • ${r.filingDate}  ${r.url}`);
    lines.push(`        ${r.excerpt.slice(0, 100)}`);
  }
  return lines;
}

function renderDiffSection(preview: EarningsPreview): string[] {
  if (!preview.diff_against_prior_call) return [];
  const d = preview.diff_against_prior_call;
  const lines: string[] = ['', '  🔁 QoQ 差分(对比上次财报会)'];
  if (d.toneDelta) lines.push(`    语气差:     ${d.toneDelta}`);
  if (d.qaBalanceDelta) lines.push(`    Q&A 平衡:   ${d.qaBalanceDelta}`);
  if (d.lastCallTs) lines.push(`    上次时间:   ${new Date(d.lastCallTs).toISOString().slice(0, 10)}`);
  if (lines.length === 1) lines.push('    (无 diff 数据,P1.a.4 启用)');
  return lines;
}

// ---------------------------------------------------------------------------
// CLI entry — used by both /earnings-preview and /earnings
// ---------------------------------------------------------------------------

/**
 * Async CLI runner — uses the full async builder when possible, falls
 * back to the framework-only sync builder. Always returns a string.
 */
export async function runEarningsPreview(args: string): Promise<string> {
  const ticker = parseTicker(args);
  if (!ticker) {
    return [
      '',
      '  用法: /earnings-preview <TICKER>  (alias: /earnings)',
      '  示例: /earnings-preview NVDA',
      '         /earnings 600519',
      '         /earnings 600519.SH',
      '',
    ].join('\n');
  }

  let preview: EarningsPreview;
  try {
    preview = await buildEarningsPreviewAsync(ticker);
  } catch {
    preview = buildEarningsPreview(ticker);
  }

  return [
    '',
    '═══════════════════════════════════════',
    `  Earnings Preview — ${ticker}`,
    '═══════════════════════════════════════',
    '',
    `  数据源: ${preview.source}  ·  生成时间: ${new Date(preview.generatedAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    '  📊 历史 plan(本地 .upup/plans/)',
    ...renderHistory(preview.history),
    ...renderConsensusSection(preview),
    ...renderTweetsSection(preview),
    ...renderTranscriptsSection(preview),
    ...renderDiffSection(preview),
    renderPlanFramework(preview.planFramework),
    '',
    `  MCP 资源: upup://earnings-preview/${ticker}`,
    '',
  ].join('\n');
}
