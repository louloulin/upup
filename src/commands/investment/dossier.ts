/**
 * /dossier <TICKER> — one-pager persistent research dossier (Gap G2)
 *
 * Reads the per-ticker dossier from src/memory/dossier.ts and renders:
 *   - Company snapshot (name / sector / market cap / one-liner)
 *   - Freshness (days since last update + versionHash)
 *   - Most recent 3 theses (with claim counts, evidence refs, confidence)
 *   - Active watch triggers
 *   - Earnings call history (most recent first, with QoQ delta when present)
 *
 * 模块边界:
 *   dossier.ts (Layer 3) → memory/dossier.ts (Layer 2) + utils/storage-paths (Layer 1)
 *   不依赖 src/tools/*(避免反向),不依赖 src/runtime/pi/* 内部实现(避免反向)
 *
 * 用法:
 *   /dossier NVDA
 *   /dossier 600519.SH
 */

import { DossierStore, type Dossier } from '../../memory/dossier.js';

function parseTicker(args: string): string | undefined {
  const trimmed = args.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/\s+/)[0]?.toUpperCase();
}

function formatTs(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

function formatMarketCap(n: number | undefined): string {
  if (n === undefined) return '?';
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return String(n);
}

function renderSnapshot(d: ReturnType<DossierStore['read']>): string[] {
  if (!d) return [];
  const s = d.snapshot;
  return [
    `  公司画像`,
    `    名称:    ${s.name}`,
    `    行业:    ${s.sector ?? '?'}`,
    `    市值:    ${formatMarketCap(s.marketCap)}`,
    `    一句话:  ${s.oneLiner ?? '(无)'}`,
  ];
}

function renderFreshness(d: ReturnType<DossierStore['read']>): string[] {
  if (!d) return [];
  const days = Math.floor((Date.now() - d.freshnessTs) / (24 * 60 * 60 * 1000));
  const ageLabel = days === 0 ? '< 1 天' : `${days} 天前`;
  return [
    '',
    `  Freshness`,
    `    最后更新: ${ageLabel} (${formatTs(d.freshnessTs)})`,
    `    version:   ${d.versionHash}`,
    `    theses:    ${d.theses.length}`,
    `    metrics:   ${d.metricsHistory.length}`,
    `    triggers:  ${d.watchTriggers.length}`,
  ];
}

function renderRecentTheses(d: ReturnType<DossierStore['read']>): string[] {
  if (!d) return [];
  if (d.theses.length === 0) return ['', '  最近论点: (无)'];
  const recent = d.theses.slice(-3).reverse();
  const lines = ['', `  最近 ${recent.length} 次论点`];
  for (const t of recent) {
    lines.push(`    • [${t.author}] ${formatTs(t.createdTs)} (conf ${(t.confidence * 100).toFixed(0)}%)`);
    for (const c of t.claims.slice(0, 3)) {
      lines.push(`        - ${c}`);
    }
    if (t.evidenceRefs.length > 0) {
      lines.push(`        引用: [src:${t.evidenceRefs.join('], [src:')}]`);
    }
  }
  return lines;
}

function renderTriggers(d: ReturnType<DossierStore['read']>): string[] {
  if (!d || d.watchTriggers.length === 0) return [];
  const lines = ['', `  盯盘触发器 (${d.watchTriggers.length})`];
  for (const tr of d.watchTriggers) {
    const cond = tr.condition.metric
      ? `${tr.condition.metric} ${tr.condition.op ?? '?'} ${tr.condition.value ?? '?'}`
      : '(无条件)';
    lines.push(`    • ${tr.description}  [${cond}]`);
  }
  return lines;
}

function renderEarningsCalls(d: ReturnType<DossierStore['read']>): string[] {
  if (!d || d.earningsCalls.length === 0) return [];
  const lines = ['', `  历次财报电话会 (${d.earningsCalls.length})`];
  for (const c of d.earningsCalls.slice(-3).reverse()) {
    lines.push(`    • ${formatTs(c.callTs)}  transcript-refs: ${c.transcriptRefs.length}`);
    if (c.toneDelta) lines.push(`        语气差: ${c.toneDelta}`);
    if (c.qaBalanceDelta) lines.push(`        Q&A 平衡: ${c.qaBalanceDelta}`);
  }
  return lines;
}

/** CLI 入口 — 与其他 investment 命令风格对齐 */
export function runDossier(args: string, store: DossierStore = new DossierStore()): string {
  const ticker = parseTicker(args);
  if (!ticker) {
    return [
      '',
      '  用法: /dossier <TICKER>',
      '  示例: /dossier NVDA',
      '         /dossier 600519.SH',
      '',
    ].join('\n');
  }

  const d = store.read(ticker);

  if (!d) {
    return [
      '',
      `  ✗ 暂无 ${ticker} 的 dossier`,
      `  提示: 先跑一次分析(例如 /invest ${ticker}),会自动创建 dossier`,
      '',
    ].join('\n');
  }

  const lines = [
    '',
    '═══════════════════════════════════════',
    `  Dossier: ${d.ticker}`,
    '═══════════════════════════════════════',
    ...renderSnapshot(d),
    ...renderFreshness(d),
    ...renderRecentTheses(d),
    ...renderTriggers(d),
    ...renderEarningsCalls(d),
    '',
    `  MCP 资源: upup://dossier/${d.ticker}`,
    '',
  ];
  return lines.join('\n');
}
