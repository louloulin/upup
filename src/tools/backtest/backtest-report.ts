/**
 * Backtest Report Renderer (Gap G5 / P2.a.1)
 *
 * 把 `BacktestSummary` + methodology disclosure 序列化成 2 份可读输出:
 *   1. JSON — 给程序消费 (策略市场 / 审计 / 二次分析)
 *   2. HTML — 给人读 (合规 / 投资委员会评审)
 *
 * 设计原则 (对齐 design D-CTG-1 跨阶段 CI 门禁):
 *   - 复用 `BacktestSummary` (单一 source of truth)
 *   - 方法学披露 (factorSources / lookAheadBias / walkForward / outOfSample) 缺一不可
 *   - HTML 自包含 (无外部 CSS / JS), 可邮件 / 归档
 *   - 不引外部模板引擎 — 一段 string interpolation, 减少依赖
 *
 * 模块边界:
 *   backtest-report.ts (Layer 3) → backtest-engine.ts (Layer 3) + 无业务模块
 *   不引 agent / skills / mcp (避免反向依赖)
 */

import type { BacktestSummary } from './backtest-engine.js';

// ---------------------------------------------------------------------------
// Methodology Disclosure (P2.a.6 强制)
// ---------------------------------------------------------------------------

export interface FactorSource {
  /** 人读名 (e.g. "PE-TTM 反向", "20 日动量") */
  name: string;
  /** 来源 (e.g. "src/tools/finance/earnings-transcripts.ts", "FMP API") */
  source: string;
  /** 计算方法概述 */
  description?: string;
}

export interface WalkForwardFold {
  trainStartDate: string;
  trainEndDate: string;
  testStartDate: string;
  testEndDate: string;
  /** 该 fold 的 out-of-sample 收益率 (小数, e.g. 0.12 = 12%) */
  oosReturnPct: number;
  /** 胜率 (0-1) */
  winRatePct?: number;
}

export interface OutOfSampleResult {
  startDate: string;
  endDate: string;
  totalReturnPct: number;
  sharpeRatio?: number;
  maxDrawdownPct?: number;
  winRatePct?: number;
  tradeCount: number;
}

export interface MethodologyDisclosure {
  factorSources: FactorSource[];
  /**
   * Look-ahead bias check result. Strategies that use future data to
   * generate signals at past timestamps MUST be flagged.
   *  - 'pass'  : no look-ahead detected (default; strategy explicitly tested)
   *  - 'fail'  : look-ahead bias detected → report is RED-flagged
   *  - 'not_performed' : not run (warns but doesn't fail)
   */
  lookAheadBiasCheck: 'pass' | 'fail' | 'not_performed';
  /**
   * Walk-forward validation. Folds ≥ 3 required for confidence.
   * Each fold's OOS performance is part of the methodology trail.
   */
  walkForward: {
    trainWindowDays: number;
    testWindowDays: number;
    folds: WalkForwardFold[];
  };
  /** Out-of-sample aggregate result. Required for the "live" claim. */
  outOfSample: OutOfSampleResult;
}

// ---------------------------------------------------------------------------
// Report input
// ---------------------------------------------------------------------------

export interface BacktestReportInput {
  /** 策略人读名 (e.g. "低估值 + 高 ROE 反向") */
  strategyName: string;
  /** 策略描述 (1-3 句) */
  strategyDescription: string;
  /** 作者 (user / agent / 团队) */
  author: string;
  /** 必填 — BacktestEngine 的输出 */
  summary: BacktestSummary;
  /** 必填 — 缺一不可 (P2.a.6 /audit 检查) */
  methodology: MethodologyDisclosure;
  /**
   * Optional explicit MaxDD / Sharpe. If absent, falls back to summary fields.
   * Authored metrics override engine-computed ones.
   */
  maxDrawdownPct?: number;
  sharpeRatio?: number;
  /** 报告 ID, 用于引用 (e.g. upup://backtest-report/{id}) */
  reportId?: string;
  /** 时戳 (epoch ms) */
  generatedAt?: number;
}

export interface BacktestReport {
  /** 结构化 JSON 报告 */
  json: Record<string, unknown>;
  /** 自包含 HTML 报告 (无外部依赖) */
  html: string;
  /** 方法学披露是否完整 (P2.a.6 /audit 用) */
  methodologyComplete: boolean;
  /** 缺什么披露字段 (P2.a.6 /audit 错误信息) */
  methodologyMissing: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * 校验方法学披露是否完整 (P2.a.6)。
 * 缺 factorSources / lookAheadBias / walkForward / outOfSample 都视为不合规。
 */
export function validateMethodology(m: MethodologyDisclosure): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!m.factorSources || m.factorSources.length === 0) {
    missing.push('factorSources');
  }
  if (!m.lookAheadBiasCheck) {
    missing.push('lookAheadBiasCheck');
  } else if (m.lookAheadBiasCheck === 'fail') {
    missing.push('lookAheadBiasCheck=fail (look-ahead bias detected)');
  }
  if (!m.walkForward || !m.walkForward.folds || m.walkForward.folds.length < 3) {
    missing.push('walkForward.folds (need >= 3)');
  }
  if (!m.outOfSample) {
    missing.push('outOfSample');
  }
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// JSON renderer
// ---------------------------------------------------------------------------

/**
 * 序列化为 JSON-safe 对象。Number / String / 嵌套 Object 都直传,
 * 故意不走 JSON.stringify(支持后续扩展 schema versioning)。
 */
export function renderBacktestReportJson(input: BacktestReportInput): Record<string, unknown> {
  const generatedAt = input.generatedAt ?? Date.now();
  const reportId = input.reportId ?? `br-${generatedAt.toString(36)}`;
  const validation = validateMethodology(input.methodology);

  return {
    schemaVersion: 1,
    reportId,
    reportType: 'backtest',
    generatedAt,
    strategy: {
      name: input.strategyName,
      description: input.strategyDescription,
      author: input.author,
    },
    metrics: {
      scope: input.summary.scope,
      code: input.summary.code,
      totalEvaluations: input.summary.totalEvaluations,
      completedCount: input.summary.completedCount,
      winRatePct: input.summary.winRatePct,
      neutralRatePct: input.summary.neutralRatePct,
      avgStockReturnPct: input.summary.avgStockReturnPct,
      avgSimulatedReturnPct: input.summary.avgSimulatedReturnPct,
      directionAccuracyPct: input.summary.directionAccuracyPct,
      stopLossTriggerRate: input.summary.stopLossTriggerRate,
      takeProfitTriggerRate: input.summary.takeProfitTriggerRate,
      avgDaysToFirstHit: input.summary.avgDaysToFirstHit,
      // Authored metrics (Sharpe / MaxDD) override engine defaults
      sharpeRatio: input.sharpeRatio,
      maxDrawdownPct: input.maxDrawdownPct ?? input.summary.ambiguousRate,
    },
    adviceBreakdown: input.summary.adviceBreakdown,
    methodology: input.methodology,
    methodologyComplete: validation.ok,
    methodologyMissing: validation.missing,
  };
}

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------

function escapeHtml(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPct(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function renderMetricsTable(summary: BacktestSummary, sharpe?: number, maxDd?: number): string {
  const rows: Array<[string, string]> = [
    ['Sample size', `${summary.completedCount} / ${summary.totalEvaluations} completed`],
    ['Window (days)', String(summary.evalWindowDays)],
    ['Engine', escapeHtml(summary.engineVersion)],
    ['Long / Cash', `${summary.longCount} / ${summary.cashCount}`],
    ['Win / Loss / Neutral', `${summary.winCount} / ${summary.lossCount} / ${summary.neutralCount}`],
    ['Win rate', fmtPct(summary.winRatePct)],
    ['Direction accuracy', fmtPct(summary.directionAccuracyPct)],
    ['Avg stock return', fmtPct(summary.avgStockReturnPct)],
    ['Avg simulated return', fmtPct(summary.avgSimulatedReturnPct)],
    ['Stop-loss trigger rate', fmtPct(summary.stopLossTriggerRate)],
    ['Take-profit trigger rate', fmtPct(summary.takeProfitTriggerRate)],
    ['Avg days to first hit', summary.avgDaysToFirstHit?.toFixed(1) ?? '—'],
    ['Sharpe (authored)', sharpe !== undefined ? sharpe.toFixed(2) : '—'],
    ['Max drawdown (authored)', fmtPct(maxDd)],
  ];
  return '<table class="metrics">' +
    rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${v}</td></tr>`).join('') +
    '</table>';
}

function renderMethodologyTable(m: MethodologyDisclosure, validation: { ok: boolean; missing: string[] }): string {
  const flag = validation.ok
    ? '<span class="badge pass">PASS</span>'
    : `<span class="badge fail">FAIL — missing: ${escapeHtml(validation.missing.join(', '))}</span>`;
  const factorRows = m.factorSources
    .map(f => `<tr><td>${escapeHtml(f.name)}</td><td><code>${escapeHtml(f.source)}</code></td><td>${escapeHtml(f.description ?? '')}</td></tr>`)
    .join('') || '<tr><td colspan="3"><em>no factor sources disclosed</em></td></tr>';
  const foldRows = m.walkForward.folds
    .map(f => `<tr><td>${escapeHtml(f.trainStartDate)} → ${escapeHtml(f.trainEndDate)}</td>` +
      `<td>${escapeHtml(f.testStartDate)} → ${escapeHtml(f.testEndDate)}</td>` +
      `<td>${fmtPct(f.oosReturnPct)}</td>` +
      `<td>${f.winRatePct !== undefined ? fmtPct(f.winRatePct) : '—'}</td></tr>`)
    .join('') || '<tr><td colspan="4"><em>no walk-forward folds</em></td></tr>';

  return `
    <h2>Methodology Disclosure</h2>
    <p>${flag}</p>
    <h3>Factor sources</h3>
    <table class="methodology">
      <thead><tr><th>Factor</th><th>Source</th><th>Description</th></tr></thead>
      <tbody>${factorRows}</tbody>
    </table>
    <h3>Look-ahead bias check</h3>
    <p>${escapeHtml(m.lookAheadBiasCheck)}</p>
    <h3>Walk-forward (${m.walkForward.trainWindowDays}d train / ${m.walkForward.testWindowDays}d test, ${m.walkForward.folds.length} folds)</h3>
    <table class="methodology">
      <thead><tr><th>Train</th><th>Test (OOS)</th><th>OOS return</th><th>OOS win rate</th></tr></thead>
      <tbody>${foldRows}</tbody>
    </table>
    <h3>Out-of-sample (${escapeHtml(m.outOfSample.startDate)} → ${escapeHtml(m.outOfSample.endDate)})</h3>
    <table class="metrics">
      <tr><th>Total return</th><td>${fmtPct(m.outOfSample.totalReturnPct)}</td></tr>
      <tr><th>Sharpe</th><td>${m.outOfSample.sharpeRatio?.toFixed(2) ?? '—'}</td></tr>
      <tr><th>Max drawdown</th><td>${fmtPct(m.outOfSample.maxDrawdownPct)}</td></tr>
      <tr><th>Win rate</th><td>${fmtPct(m.outOfSample.winRatePct)}</td></tr>
      <tr><th>Trade count</th><td>${m.outOfSample.tradeCount}</td></tr>
    </table>
  `;
}

export function renderBacktestReportHtml(input: BacktestReportInput): string {
  const generatedAt = input.generatedAt ?? Date.now();
  const reportId = input.reportId ?? `br-${generatedAt.toString(36)}`;
  const validation = validateMethodology(input.methodology);
  const body = `
    <header>
      <h1>${escapeHtml(input.strategyName)}</h1>
      <p class="subtitle">${escapeHtml(input.strategyDescription)}</p>
      <p class="meta">Author: <code>${escapeHtml(input.author)}</code> · ID: <code>${escapeHtml(reportId)}</code> · Generated: ${new Date(generatedAt).toISOString()}</p>
    </header>
    <section>
      <h2>Headline metrics</h2>
      ${renderMetricsTable(input.summary, input.sharpeRatio, input.maxDrawdownPct)}
    </section>
    <section>
      ${renderMethodologyTable(input.methodology, validation)}
    </section>
    <section>
      <h2>Advice breakdown</h2>
      <table class="methodology">
        <thead><tr><th>Advice</th><th>Total</th><th>Win</th><th>Loss</th><th>Neutral</th><th>Win rate</th></tr></thead>
        <tbody>
          ${Object.entries(input.summary.adviceBreakdown).map(([k, v]) =>
            `<tr><td>${escapeHtml(k)}</td><td>${v.total}</td><td>${v.win}</td><td>${v.loss}</td><td>${v.neutral}</td><td>${fmtPct(v.winRatePct)}</td></tr>`
          ).join('') || '<tr><td colspan="6"><em>no advice breakdown</em></td></tr>'}
        </tbody>
      </table>
    </section>
    <footer>
      <p>Generated by UpUp backtest report renderer · P2.a.1 / P2.a.6</p>
    </footer>
  `;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.strategyName)} — backtest report</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, sans-serif; max-width: 900px; margin: 24px auto; padding: 0 16px; color: #222; }
  h1 { margin: 0 0 4px; }
  h2 { border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 32px; }
  h3 { margin-top: 20px; color: #444; }
  .subtitle { color: #666; margin: 0 0 8px; }
  .meta { color: #888; font-size: 12px; }
  code { background: #f4f4f4; padding: 1px 4px; border-radius: 3px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee; }
  th { font-weight: 600; background: #fafafa; }
  table.metrics th { width: 220px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-weight: 600; font-size: 12px; }
  .badge.pass { background: #d4f4dd; color: #1e6e2a; }
  .badge.fail { background: #fbd7d7; color: #8a1f1f; }
  footer { margin-top: 40px; color: #999; font-size: 11px; text-align: center; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * 主入口 — 同时返回 JSON + HTML 报告, 满足 P2.a.1 "JSON + HTML 两份"。
 */
export function renderBacktestReport(input: BacktestReportInput): BacktestReport {
  const validation = validateMethodology(input.methodology);
  return {
    json: renderBacktestReportJson(input),
    html: renderBacktestReportHtml(input),
    methodologyComplete: validation.ok,
    methodologyMissing: validation.missing,
  };
}
