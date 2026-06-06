/**
 * Investment Commands Tests
 *
 * v5 Sprint 2 — 5 个 fast lane 投资 CLI
 * 全部测试用临时目录隔离,不污染 .upup/ 真实状态
 *
 * 覆盖:
 * - watchlist-edit: add / remove / list / 持久化 / parseArgs
 * - morning-brief: 收集 plan briefs / watchlist / audit
 * - earnings-preview: parseTicker / 框架生成 / 历史 plan 加载
 * - risk-dashboard: 收集 active plans / 渲染
 * - portfolio-review: 收集 completed plans / 渲染
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP_ROOT = join(tmpdir(), `upup-investment-test-${Date.now()}`);
// env var 覆盖避免污染真实 ~/.upup/(plan-executor + watchlist-edit 都支持)
process.env['UPUP_PLANS_DIR'] = join(TMP_ROOT, 'plans');
process.env['UPUP_WATCHLIST_FILE'] = join(TMP_ROOT, 'watchlist.json');

let PLANS_DIR_LOCAL: string;
let WATCHLIST_FILE_LOCAL: string;
let SETTINGS_FILE_LOCAL: string;

beforeAll(() => {
  PLANS_DIR_LOCAL = process.env['UPUP_PLANS_DIR']!;
  WATCHLIST_FILE_LOCAL = process.env['UPUP_WATCHLIST_FILE']!;
  SETTINGS_FILE_LOCAL = join(TMP_ROOT, 'settings.json');
  mkdirSync(PLANS_DIR_LOCAL, { recursive: true });
});

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// =====================================================================
// watchlist-edit
// =====================================================================

describe('investment: watchlist-edit', () => {
  test('addWatchlistEntry + listWatchlistText', async () => {
    const { addWatchlistEntry, listWatchlistText, readWatchlist, writeWatchlist } = await import('./watchlist-edit.js');
    // 清空测试隔离
    writeWatchlist({ entries: {} });

    const r1 = addWatchlistEntry('NVDA', '观察 Blackwell 出货');
    expect(r1.ok).toBe(true);

    const r2 = addWatchlistEntry('AAPL');
    expect(r2.ok).toBe(true);

    const data = readWatchlist();
    expect(Object.keys(data.entries).length).toBe(2);
    expect(data.entries['NVDA']?.note).toBe('观察 Blackwell 出货');

    const text = listWatchlistText();
    expect(text).toContain('NVDA');
    expect(text).toContain('AAPL');
    expect(text).toContain('共 2 项');
  });

  test('addWatchlistEntry dedup', async () => {
    const { addWatchlistEntry, writeWatchlist } = await import('./watchlist-edit.js');
    writeWatchlist({ entries: {} });
    addWatchlistEntry('TSLA');
    const r2 = addWatchlistEntry('TSLA');
    expect(r2.ok).toBe(false);
    expect(r2.message).toContain('已在');
  });

  test('removeWatchlistEntry', async () => {
    const { addWatchlistEntry, removeWatchlistEntry, readWatchlist, writeWatchlist } = await import('./watchlist-edit.js');
    writeWatchlist({ entries: {} });
    addWatchlistEntry('MSFT');
    addWatchlistEntry('GOOG');
    const r = removeWatchlistEntry('MSFT');
    expect(r.ok).toBe(true);
    const data = readWatchlist();
    expect(Object.keys(data.entries)).toEqual(['GOOG']);
  });

  test('parseWatchlistArgs handles aliases', async () => {
    const { parseWatchlistArgs } = await import('./watchlist-edit.js');
    expect(parseWatchlistArgs('').sub).toBe('list');
    expect(parseWatchlistArgs('list').sub).toBe('list');
    expect(parseWatchlistArgs('add NVDA note').sub).toBe('add');
    expect(parseWatchlistArgs('+ NVDA').sub).toBe('add');
    expect(parseWatchlistArgs('rm NVDA').sub).toBe('remove');
    expect(parseWatchlistArgs('- NVDA').sub).toBe('remove');
    expect(parseWatchlistArgs('remove NVDA').ticker).toBe('NVDA');
    expect(parseWatchlistArgs('add NVDA some note here').note).toBe('some note here');
  });

  test('runWatchlistEdit add/remove/list/text', async () => {
    const { runWatchlistEdit, writeWatchlist } = await import('./watchlist-edit.js');
    writeWatchlist({ entries: {} });
    expect(runWatchlistEdit('add NVDA 测试')).toContain('✓');
    expect(runWatchlistEdit('list')).toContain('NVDA');
    expect(runWatchlistEdit('remove NVDA')).toContain('✓');
    expect(runWatchlistEdit('list')).toContain('为空');
  });
});

// =====================================================================
// morning-brief
// =====================================================================

describe('investment: morning-brief', () => {
  test('runMorningBrief returns structured output with empty state', async () => {
    const { runMorningBrief } = await import('./morning-brief.js');
    const text = runMorningBrief('');
    expect(text).toContain('Morning Brief');
    expect(text).toContain('📋');
    expect(text).toContain('👀');
    expect(text).toContain('📜');
  });
});

// =====================================================================
// earnings-preview
// =====================================================================

describe('investment: earnings-preview', () => {
  test('runEarningsPreview without ticker shows usage', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('');
    expect(text).toContain('用法');
    expect(text).toContain('示例');
  });

  test('runEarningsPreview with ticker renders framework', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('NVDA');
    expect(text).toContain('Earnings Preview');
    expect(text).toContain('NVDA');
    expect(text).toContain('研究计划');
    expect(text).toContain('financial_metrics');
  });

  test('runEarningsPreview with A-share ticker', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = await runEarningsPreview('600519.SH');
    expect(text).toContain('600519.SH');
  });
});

// =====================================================================
// risk-dashboard
// =====================================================================

describe('investment: risk-dashboard', () => {
  test('runRiskDashboard with empty state', async () => {
    const { runRiskDashboard } = await import('./risk-dashboard.js');
    const text = runRiskDashboard('');
    expect(text).toContain('Risk Dashboard');
    expect(text).toContain('⚙️');
    expect(text).toContain('📊');
    expect(text).toContain('框架指标');
  });
});

// =====================================================================
// portfolio-review
// =====================================================================

describe('investment: portfolio-review', () => {
  test('runPortfolioReview with empty state', async () => {
    const { runPortfolioReview } = await import('./portfolio-review.js');
    const text = runPortfolioReview('');
    expect(text).toContain('Portfolio Review');
    expect(text).toContain('Brinson');
    expect(text).toContain('Allocation Effect');
  });
});

// =====================================================================
// registry
// =====================================================================

describe('investment: registry', () => {
  test('isInvestmentCommand recognizes names and aliases', async () => {
    const { isInvestmentCommand, runInvestmentCommand, INVESTMENT_COMMANDS } = await import('./registry.js');
    expect(isInvestmentCommand('morning-brief')).toBe(true);
    expect(isInvestmentCommand('mb')).toBe(true);
    expect(isInvestmentCommand('brief')).toBe(true);
    expect(isInvestmentCommand('earnings-preview')).toBe(true);
    expect(isInvestmentCommand('ep')).toBe(true);
    expect(isInvestmentCommand('earnings')).toBe(true);
    expect(isInvestmentCommand('risk-dashboard')).toBe(true);
    expect(isInvestmentCommand('risk')).toBe(true);
    expect(isInvestmentCommand('portfolio-review')).toBe(true);
    expect(isInvestmentCommand('watchlist-edit')).toBe(true);
    expect(isInvestmentCommand('wl')).toBe(true);
    expect(isInvestmentCommand('dossier')).toBe(true);
    expect(isInvestmentCommand('doss')).toBe(true);
    expect(isInvestmentCommand('strategy')).toBe(true);
    expect(isInvestmentCommand('strat')).toBe(true);
    expect(isInvestmentCommand('status')).toBe(false);
    expect(isInvestmentCommand('unknown-cmd')).toBe(false);

    expect(INVESTMENT_COMMANDS.length).toBe(9);  // 8 + /strategy (P2.a.5)
    // P2.a.5 adds /strategy as a new top-level command with alias /strat.
  });

  test('runInvestmentCommand returns text for known, null for unknown', async () => {
    const { runInvestmentCommand } = await import('./registry.js');
    const text = await runInvestmentCommand('morning-brief', '');
    expect(typeof text).toBe('string');
    expect(text).toContain('Morning Brief');

    expect(await runInvestmentCommand('status', '')).toBeNull();
  });

  test('runInvestmentCommand dispatches /earnings alias to runEarningsPreview', async () => {
    const { runInvestmentCommand } = await import('./registry.js');
    const text = await runInvestmentCommand('earnings', 'NVDA');
    expect(typeof text).toBe('string');
    expect(text).toContain('Earnings Preview');
    expect(text).toContain('NVDA');
    expect(text).toContain('upup://earnings-preview/NVDA');
  });
});

// =====================================================================
// /dossier (P0.5)
// =====================================================================

describe('investment: /dossier', () => {
  test('without args shows usage', async () => {
    const { runDossier } = await import('./dossier.js');
    const { DossierStore } = await import('../../memory/dossier.js');
    const tmpStore = new DossierStore({ inMemory: true });
    const text = runDossier('', tmpStore);
    expect(text).toContain('用法: /dossier <TICKER>');
  });

  test('unknown ticker shows helpful empty-state', async () => {
    const { runDossier } = await import('./dossier.js');
    const { DossierStore } = await import('../../memory/dossier.js');
    const emptyStore = new DossierStore({ inMemory: true });
    const text = runDossier('ZZZZZ', emptyStore);
    expect(text).toContain('✗ 暂无 ZZZZZ 的 dossier');
    expect(text).toContain('/invest ZZZZZ');
  });

  test('renders snapshot + freshness + theses for an existing dossier', async () => {
    const { runDossier } = await import('./dossier.js');
    const { DossierStore } = await import('../../memory/dossier.js');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const path = join(tmpdir(), `upup-dossier-cmd-test-${Date.now()}.jsonl`);
    const s = new DossierStore({ filePath: path, inMemory: false, now: () => 1_000_000 });
    s.create('NVDA', { name: 'NVIDIA', sector: 'Tech', marketCap: 3_000_000_000_000, oneLiner: 'AI 加速器龙头' });
    s.appendThesis('NVDA', {
      author: 'agent',
      intent: '分析 NVDA',
      claims: ['AI 需求强劲', '毛利率扩张'],
      evidenceRefs: ['1', '2'],
      confidence: 0.85,
    });
    s.addTrigger('NVDA', { description: '股价破 200', condition: { metric: 'price', op: '<', value: 200 } });

    const text = runDossier('NVDA', s);
    expect(text).toContain('Dossier: NVDA');
    expect(text).toContain('NVIDIA');
    expect(text).toContain('AI 加速器龙头');
    expect(text).toContain('AI 需求强劲');
    expect(text).toContain('盯盘触发器');
    expect(text).toContain('upup://dossier/NVDA');
  });
});

// =====================================================================
// screen (P1.b.4)
// =====================================================================

describe('investment: screen', () => {
  test('runScreen without args shows usage', async () => {
    const { runScreen } = await import('./screen.js');
    const text = await runScreen('');
    expect(text).toContain('用法');
    expect(text).toContain('/screen');
  });

  test('runScreen with NL query renders results table', async () => {
    const { runScreen } = await import('./screen.js');
    const text = await runScreen('AAPL-like');
    expect(text).toContain('/screen');
    expect(text).toContain('AAPL');
    expect(text).toContain('Source');
    expect(text).toContain('Universe');
  });

  test('runScreen parses universe=cn flag', async () => {
    const { runScreen } = await import('./screen.js');
    const text = await runScreen('universe=cn PE < 15');
    expect(text).toContain('Universe: cn');
  });

  test('runScreen parses realtime=true flag', async () => {
    const { runScreen } = await import('./screen.js');
    const text = await runScreen('realtime=true RSI < 50');
    // realtime=true is plumbed to the tool but doesn't change text output
    // beyond the result count — just verify no error / no usage prompt.
    expect(text).toContain('/screen');
    expect(text).not.toContain('用法');
  });

  test('runScreen with no matches renders empty-message', async () => {
    const { runScreen } = await import('./screen.js');
    // No real ticker matches market cap $1B-$2B in the default universe
    const text = await runScreen('市值 $1B-$2B');
    expect(text).toContain('(无结果');
  });

  test('INVESTMENT_COMMANDS includes screen (P1.b.4 follow-up)', async () => {
    const { INVESTMENT_COMMANDS } = await import('./registry.js');
    const screen = INVESTMENT_COMMANDS.find(c => c.name === 'screen');
    expect(screen).toBeDefined();
    expect(screen?.aliases).toContain('scr');
  });

  test('runInvestmentCommand dispatches screen (P1.b.4 integration)', async () => {
    const { runInvestmentCommand } = await import('./registry.js');
    const text = await runInvestmentCommand('screen', 'AAPL-like');
    expect(text).toContain('/screen');
    expect(text).toContain('AAPL');
  });
});
