/**
 * /earnings-preview <TICKER>  /  /earnings <TICKER>
 *
 * v5 Sprint 2.2 + P1.a.5 — 财报前瞻
 * 优先用 plan-builder 启发式生成"财报前瞻 plan"展示研究框架;
 * 当 .upup/plans/<ticker>.json 缓存存在时,展示历史记录。
 *
 * P1.a.5 升级: 引入 EarningsPreview 数据类型 + buildEarningsPreview 构造器。
 *   - 早期(P1.a.5): 框架只包含 planFramework + history(本地 .upup/plans/)
 *   - 中期(P1.a.1): 接入 estimates + x-search + 8-K transcript
 *   - 长期(P1.a.4): 加 diff_against_prior_call, 历次底稿写入 dossier.earningsCalls[]
 *
 * 模块边界(关键 — 避免循环依赖):
 * - 只依赖 src/plan/plan-builder(无 src/tools 依赖) + src/utils/storage-paths
 * - 不依赖 src/tools/*(避免 finance → agent 反向引用循环)
 * - 不依赖 src/agent/*(避免反向)
 * - P1.a.5 的 EarningsPreview 暴露给 mcp/upup-resources.ts 用作 upup:// 资源
 */

import { existsSync, readdirSync } from 'node:fs';
import { PLANS_DIR } from '../../utils/storage-paths.js';
import { buildResearchPlan, extractTicker } from '../../plan/plan-builder.js';
import { loadPlan } from '../../plan/plan-executor.js';
import type { ResearchPlan } from '../../plan/research-plan.js';

// ---------------------------------------------------------------------------
// Public data model — exported so MCP / dossier / CLI can share
// ---------------------------------------------------------------------------

/** Source completeness — drives UI affordances and gating. */
export type EarningsPreviewSource = 'framework' | 'partial' | 'full';

/** Consensus estimate (will be populated by P1.a.1 estimates.ts integration). */
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
 *
 * The shape is forward-compatible: P1.a.5 produces {consensus:[], recentTweets:[],
 * transcripts:[]} with `source: 'framework'`. P1.a.1 lifts the source to 'partial'
 * or 'full' once real data is wired in.
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
   * `true` skips any network-touching data sources.
   * P1.a.5 always behaves as offline (the data sources aren't wired yet),
   * but the flag is plumbed for P1.a.1 to use for fallback decisions.
   */
  offline?: boolean;
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

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

/**
 * Build the structured earnings preview for a ticker.
 * Pure function — no I/O beyond reading .upup/plans/. P1.a.1 will add
 * optional async data sources behind the same interface.
 */
export function buildEarningsPreview(
  ticker: string,
  opts: BuildEarningsPreviewOptions = {},
): EarningsPreview {
  const plansDir = opts.plansDir ?? PLANS_DIR;
  const now = opts.now ?? (() => Date.now());

  return {
    ticker,
    generatedAt: now(),
    // P1.a.5 is framework-only. P1.a.1 flips to 'partial' / 'full' when real
    // data sources succeed.
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
      '  📊 共识预期 (P1.a.5 占位)',
      '    (P1.a.1 接入 estimates 后填充)',
    ];
  }
  const lines: [string, string][] = [['期间', 'metric · consensus · revision']];
  for (const c of preview.consensus) {
    const rev = c.revisionPct === undefined ? '' : ` (${c.revisionPct >= 0 ? '+' : ''}${c.revisionPct.toFixed(1)}% 30d)`;
    lines.push([c.period, `${c.metric} · ${c.consensus}${c.currency ? ' ' + c.currency : ''}${rev}`]);
  }
  return ['', '  📊 共识预期', ...lines.map(([a, b]) => `    ${a.padEnd(10)} ${b}`)];
}

function renderTweetsSection(preview: EarningsPreview): string[] {
  if (preview.recentTweets.length === 0) {
    return ['', '  🐦 卖方 / 买方近 7d 推文 (P1.a.5 占位)', '    (P1.a.1 接入 x-search 后填充)'];
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
    return ['', '  📜 8-K 电话会底稿 (P1.a.5 占位)', '    (P1.a.1 接入 read-filings.earnings_transcript 后填充)'];
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

export function runEarningsPreview(args: string): string {
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

  const preview = buildEarningsPreview(ticker);

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
    '  ⚠ 实际财报日期/共识预期需接入 Tushare/FINANCIAL_DATASETS_API',
    '  框架就绪,接入后自动填充数字。',
    '',
    `  MCP 资源: upup://earnings-preview/${ticker}`,
    '',
  ].join('\n');
}
