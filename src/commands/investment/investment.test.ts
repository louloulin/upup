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
process.env.UPUP_DATA_DIR = TMP_ROOT;

let PLANS_DIR_LOCAL: string;
let WATCHLIST_FILE_LOCAL: string;
let SETTINGS_FILE_LOCAL: string;

beforeAll(() => {
  PLANS_DIR_LOCAL = join(TMP_ROOT, 'plans');
  WATCHLIST_FILE_LOCAL = join(TMP_ROOT, 'watchlist.json');
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
    const text = runEarningsPreview('');
    expect(text).toContain('用法');
    expect(text).toContain('示例');
  });

  test('runEarningsPreview with ticker renders framework', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = runEarningsPreview('NVDA');
    expect(text).toContain('Earnings Preview');
    expect(text).toContain('NVDA');
    expect(text).toContain('研究计划');
    expect(text).toContain('financial_metrics');
  });

  test('runEarningsPreview with A-share ticker', async () => {
    const { runEarningsPreview } = await import('./earnings-preview.js');
    const text = runEarningsPreview('600519.SH');
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
    expect(isInvestmentCommand('risk-dashboard')).toBe(true);
    expect(isInvestmentCommand('risk')).toBe(true);
    expect(isInvestmentCommand('portfolio-review')).toBe(true);
    expect(isInvestmentCommand('watchlist-edit')).toBe(true);
    expect(isInvestmentCommand('wl')).toBe(true);
    expect(isInvestmentCommand('status')).toBe(false);
    expect(isInvestmentCommand('unknown-cmd')).toBe(false);

    expect(INVESTMENT_COMMANDS.length).toBe(5);
  });

  test('runInvestmentCommand returns text for known, null for unknown', async () => {
    const { runInvestmentCommand } = await import('./registry.js');
    const text = runInvestmentCommand('morning-brief', '');
    expect(typeof text).toBe('string');
    expect(text).toContain('Morning Brief');

    expect(runInvestmentCommand('status', '')).toBeNull();
  });
});
