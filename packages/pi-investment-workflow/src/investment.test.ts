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
    const { addWatchlistEntry, listWatchlistText, readWatchlist, writeWatchlist } = await import('@upup/pi-investment-workflow');
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
    const { addWatchlistEntry, writeWatchlist } = await import('@upup/pi-investment-workflow');
    writeWatchlist({ entries: {} });
    addWatchlistEntry('TSLA');
    const r2 = addWatchlistEntry('TSLA');
    expect(r2.ok).toBe(false);
    expect(r2.message).toContain('已在');
  });

  test('removeWatchlistEntry', async () => {
    const { addWatchlistEntry, removeWatchlistEntry, readWatchlist, writeWatchlist } = await import('@upup/pi-investment-workflow');
    writeWatchlist({ entries: {} });
    addWatchlistEntry('MSFT');
    addWatchlistEntry('GOOG');
    const r = removeWatchlistEntry('MSFT');
    expect(r.ok).toBe(true);
    const data = readWatchlist();
    expect(Object.keys(data.entries)).toEqual(['GOOG']);
  });

  test('parseWatchlistArgs handles aliases', async () => {
    const { parseWatchlistArgs } = await import('@upup/pi-investment-workflow');
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
    const { runWatchlistEdit, writeWatchlist } = await import('@upup/pi-investment-workflow');
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
    const { runMorningBrief } = await import('@upup/pi-investment-workflow');
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
    const { runEarningsPreview } = await import('@upup/pi-investment-workflow');
    const text = await runEarningsPreview('');
    expect(text).toContain('用法');
    expect(text).toContain('示例');
  });

  test('runEarningsPreview with ticker renders framework', async () => {
    const { runEarningsPreview } = await import('@upup/pi-investment-workflow');
    const text = await runEarningsPreview('NVDA');
    expect(text).toContain('Earnings Preview');
    expect(text).toContain('NVDA');
    expect(text).toContain('研究计划');
    expect(text).toContain('financial_metrics');
  });

  test('runEarningsPreview with A-share ticker', async () => {
    const { runEarningsPreview } = await import('@upup/pi-investment-workflow');
    const text = await runEarningsPreview('600519.SH');
    expect(text).toContain('600519.SH');
  });
});

// =====================================================================
// risk-dashboard
// =====================================================================

describe('investment: risk-dashboard', () => {
  test('runRiskDashboard with empty state', async () => {
    const { runRiskDashboard } = await import('@upup/pi-investment-workflow');
    const text = runRiskDashboard('');
    expect(text).toContain('Risk Dashboard');
    expect(text).toContain('⚙️');
    expect(text).toContain('📊');
    expect(text).toContain('Pi Risk');
  });

  test('runRiskDashboard calculates metrics only from explicit historical inputs', async () => {
    const { runRiskDashboard } = await import('@upup/pi-investment-workflow');
    const text = runRiskDashboard(JSON.stringify({ returns: [0.01, -0.02, 0.03], prices: [100, 110, 90], weights: { AAPL: 0.6, MSFT: 0.4 } }));
    expect(text).toContain('VaR (95%, 1d)');
    expect(text).toContain('Sharpe');
    expect(text).toContain('Max Drawdown');
    expect(text).toContain('集中度 HHI');
    expect(text).not.toContain('待计算');
  });
});

// =====================================================================
// portfolio-review
// =====================================================================

describe('investment: portfolio-review', () => {
  test('runPortfolioReview with empty state', async () => {
    const { runPortfolioReview } = await import('@upup/pi-investment-workflow');
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
    const { isInvestmentCommand, runInvestmentCommand, INVESTMENT_COMMANDS } = await import('@upup/pi-investment-workflow');
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
    expect(isInvestmentCommand('invest')).toBe(true);
    expect(isInvestmentCommand('inv')).toBe(true);
    expect(isInvestmentCommand('sop')).toBe(true);
    expect(isInvestmentCommand('sops')).toBe(true);
    expect(isInvestmentCommand('status')).toBe(false);
    expect(isInvestmentCommand('unknown-cmd')).toBe(false);

    // Single source of truth: `invest` is declared here too (it delegates to the
    // handler injected by @upup/pi-app), so the Pi extension registers the whole
    // family from this registry instead of keeping a second copy.
    // P2.a.5 adds /strategy (alias /strat); the SOP engine adds /sop (alias /sops).
    expect(INVESTMENT_COMMANDS.length).toBe(10);
  });

  test('runInvestmentCommand returns text for known, null for unknown', async () => {
    const { runInvestmentCommand } = await import('@upup/pi-investment-workflow');
    const text = await runInvestmentCommand('morning-brief', '');
    expect(typeof text).toBe('string');
    expect(text).toContain('Morning Brief');

    expect(await runInvestmentCommand('status', '')).toBeNull();
  });

  test('runInvestmentCommand dispatches /earnings alias to runEarningsPreview', async () => {
    const { runInvestmentCommand } = await import('@upup/pi-investment-workflow');
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
    const { runDossier } = await import('@upup/pi-investment-workflow');
    const { DossierStore } = await import('@upup/memory');
    const tmpStore = new DossierStore({ inMemory: true });
    const text = runDossier('', tmpStore);
    expect(text).toContain('用法: /dossier <TICKER>');
  });

  test('unknown ticker shows helpful empty-state', async () => {
    const { runDossier } = await import('@upup/pi-investment-workflow');
    const { DossierStore } = await import('@upup/memory');
    const emptyStore = new DossierStore({ inMemory: true });
    const text = runDossier('ZZZZZ', emptyStore);
    expect(text).toContain('✗ 暂无 ZZZZZ 的 dossier');
    expect(text).toContain('/invest ZZZZZ');
  });

  test('renders snapshot + freshness + theses for an existing dossier', async () => {
    const { runDossier } = await import('@upup/pi-investment-workflow');
    const { DossierStore } = await import('@upup/memory');
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


// ---------------------------------------------------------------------
// /screen provider doubles: the CLI reads live Eastmoney data, so the
// tests stub the transport with provider-shaped payloads.
// ---------------------------------------------------------------------
const SCREEN_US_LIST = {
  rc: 0,
  data: {
    total: 13815,
    diff: [
      { f12: 'NVDA', f14: '英伟达', f2: 213.63, f3: 0.69, f6: 5.1e10, f8: 0.6, f9: 26.69, f20: 5148483000000, f23: 22.48, f100: '信息技术', f133: '-' },
      { f12: 'AAPL', f14: '苹果', f2: 331.83, f3: 0.15, f6: 4.8e10, f8: 0.5, f9: 37.56, f20: 4842786749400, f23: 45.04, f100: '信息技术', f133: '-' },
    ],
  },
};
const SCREEN_CN_LIST = {
  rc: 0,
  data: {
    total: 5559,
    diff: [
      { f12: '601398', f14: '工商银行', f2: 8.11, f3: -0.25, f6: 2.5e9, f8: 0.12, f9: 8.32, f20: 2890454744992, f23: 0.73, f100: '银行', f133: 3.95 },
      { f12: '600519', f14: '贵州茅台', f2: 1258, f3: -1.16, f6: 3.3e9, f8: 0.26, f9: 17.66, f20: 1572602654058, f23: 6.26, f100: '白酒Ⅱ', f133: 4.14 },
    ],
  },
};
const SCREEN_CN_XUANGU = {
  result: {
    count: 5565,
    data: [
      { SECURITY_CODE: '601398', SECURITY_NAME_ABBR: '工商银行', SECUCODE: '601398.SH', NEW_PRICE: 8.11, CHANGE_RATE: -0.25, PE_TTM: 8.32, TOTAL_MARKET_CAP: 2890454744992, ROE_WEIGHT: 9.1, INDUSTRY: '银行', MAX_TRADE_DATE: '2026-09-16' },
      { SECURITY_CODE: '600519', SECURITY_NAME_ABBR: '贵州茅台', SECUCODE: '600519.SH', NEW_PRICE: 1258, CHANGE_RATE: -1.16, PE_TTM: 17.66, TOTAL_MARKET_CAP: 1572602654058, ROE_WEIGHT: 16.75, INDUSTRY: '饮料', MAX_TRADE_DATE: '2026-09-16' },
    ],
  },
};

function stubScreenFetch(): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('xuangu/list')) return new Response(JSON.stringify(SCREEN_CN_XUANGU), { status: 200 });
    if (url.includes('clist/get')) return new Response(JSON.stringify(url.includes('m%3A116') || url.includes('m%3A105') ? SCREEN_US_LIST : SCREEN_CN_LIST), { status: 200 });
    throw new Error(`unexpected request in test double: ${url}`);
  }) as typeof fetch;
  return () => { globalThis.fetch = previous; };
}

// =====================================================================
// screen (P1.b.4)
// =====================================================================

describe('investment: screen', () => {
  test('runScreen without args shows usage', async () => {
    const { runScreen } = await import('@upup/pi-investment-workflow');
    const text = await runScreen('');
    expect(text).toContain('用法');
    expect(text).toContain('/screen');
  });

  test('runScreen with NL query renders the live provider table', async () => {
    const { resetEastmoneyGates, resetEastmoneyScreenLoader } = await import('@upup/pi-market-data');
    const restore = stubScreenFetch();
    try {
      resetEastmoneyGates();
      resetEastmoneyScreenLoader();
      const { runScreen } = await import('@upup/pi-investment-workflow');
      const text = await runScreen('AAPL-like');
      expect(text).toContain('/screen');
      expect(text).toContain('AAPL');
      expect(text).toContain('Source');
      expect(text).toContain('Universe');
      expect(text).toContain('Provider: https://push2.eastmoney.com/api/qt/clist/get');
      expect(text).toContain('苹果');
    } finally {
      restore();
    }
  });

  test('runScreen parses universe=cn flag against the live A-share list', async () => {
    const { resetEastmoneyGates, resetEastmoneyScreenLoader } = await import('@upup/pi-market-data');
    const restore = stubScreenFetch();
    try {
      resetEastmoneyGates();
      resetEastmoneyScreenLoader();
      const { runScreen } = await import('@upup/pi-investment-workflow');
      const text = await runScreen('universe=cn PE < 15');
      expect(text).toContain('Universe: cn');
      expect(text).toContain('工商银行');
      expect(text).toContain('data.eastmoney.com/dataapi/xuangu/list');
      expect(text).not.toContain('苹果');
    } finally {
      restore();
    }
  });

  test('runScreen reports filters the universe cannot answer instead of fabricating rows', async () => {
    const { runScreen } = await import('@upup/pi-investment-workflow');
    const text = await runScreen('realtime=true RSI < 50');
    expect(text).toContain('/screen 执行失败');
    expect(text).toContain('rsi');
    expect(text).not.toContain('用法');
  });

  test('runScreen with no matches renders empty-message', async () => {
    const { resetEastmoneyGates, resetEastmoneyScreenLoader } = await import('@upup/pi-market-data');
    const restore = stubScreenFetch();
    try {
      resetEastmoneyGates();
      resetEastmoneyScreenLoader();
      const { runScreen } = await import('@upup/pi-investment-workflow');
      const text = await runScreen('universe=cn 市值 $1B-$2B');
      expect(text).toContain('(无结果');
    } finally {
      restore();
    }
  });

  test('INVESTMENT_COMMANDS includes screen (P1.b.4 follow-up)', async () => {
    const { INVESTMENT_COMMANDS } = await import('@upup/pi-investment-workflow');
    const screen = INVESTMENT_COMMANDS.find(c => c.name === 'screen');
    expect(screen).toBeDefined();
    expect(screen?.aliases).toContain('scr');
  });

  test('runInvestmentCommand dispatches screen (P1.b.4 integration)', async () => {
    const { resetEastmoneyGates, resetEastmoneyScreenLoader } = await import('@upup/pi-market-data');
    const restore = stubScreenFetch();
    try {
      resetEastmoneyGates();
      resetEastmoneyScreenLoader();
      const { runInvestmentCommand } = await import('@upup/pi-investment-workflow');
      const text = await runInvestmentCommand('screen', 'AAPL-like');
      expect(text).toContain('/screen');
      expect(text).toContain('AAPL');
    } finally {
      restore();
    }
  });
});
