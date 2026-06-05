/**
 * Investment Status Line Tests (Sprint v8-3)
 *
 * 验证纯函数格式化器:无数据 / 部分数据 / 完整数据 / P&L 正负。
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  extractStatusLineParts,
  formatInvestmentStatusLine,
  formatInvestmentStatusLineFromMultiPortfolio,
  type StatusLineParts,
} from './investment-status-line.js';
import {
  InvestmentMemory,
  __resetInvestmentMemory,
} from '../memory/investment-memory.js';

let _now = 1700000000000;
let _idCounter = 0;
const testNow = (): number => _now;
const testId = (): string => `id-${++_idCounter}`;

function makeMemory(): InvestmentMemory {
  return new InvestmentMemory({ inMemory: true, now: testNow, generateId: testId });
}

beforeEach(() => {
  _now = 1700000000000;
  _idCounter = 0;
  __resetInvestmentMemory();
});

// ---------------------------------------------------------------------------
// 1. extractStatusLineParts
// ---------------------------------------------------------------------------

describe('extractStatusLineParts', () => {
  test('无数据时回退到 0 / undefined', () => {
    const parts: StatusLineParts = extractStatusLineParts({ memory: makeMemory() });
    expect(parts.portfolioCount).toBe(0);
    expect(parts.activePortfolio).toBeUndefined();
    expect(parts.watchlistCount).toBe(0);
    expect(parts.decisionCount).toBe(0);
    expect(parts.openDecisionCount).toBe(0);
    expect(parts.totalPnlPct).toBeUndefined();
    expect(parts.staleDossiers).toEqual([]);
  });

  test('staleDossiers 注入透传 (P3.b.1)', () => {
    const parts = extractStatusLineParts({
      memory: makeMemory(),
      staleDossiers: [
        { ticker: 'NVDA', freshnessDays: 45 },
        { ticker: 'AAPL', freshnessDays: 31 },
      ],
    });
    expect(parts.staleDossiers).toHaveLength(2);
    expect(parts.staleDossiers[0]?.ticker).toBe('NVDA');
  });

  test('含自选 + 决策 + 持仓中决策', () => {
    const m = makeMemory();
    m.addToWatchlist('NVDA');
    m.addToWatchlist('600519');
    m.recordDecision({ ticker: 'NVDA', action: 'buy', rationale: 'AI 龙头' });
    m.recordDecision({ ticker: 'AAPL', action: 'buy', rationale: 'X' });
    const d3 = m.recordDecision({ ticker: 'TSLA', action: 'buy', rationale: 'Y' });
    m.closeDecision(d3.id, { priceAtClose: 200, pnlPct: 0.05 });

    const parts = extractStatusLineParts({ memory: m });
    expect(parts.watchlistCount).toBe(2);
    expect(parts.decisionCount).toBe(3);
    expect(parts.openDecisionCount).toBe(2); // d3 closed
  });

  test('portfolio 注入生效', () => {
    const parts = extractStatusLineParts({
      memory: makeMemory(),
      portfolio: { total: 3, activeName: 'default' },
    });
    expect(parts.portfolioCount).toBe(3);
    expect(parts.activePortfolio).toBe('default');
  });

  test('withPnL=true 透传 totalPnlPct', () => {
    const parts = extractStatusLineParts({
      memory: makeMemory(),
      withPnL: true,
      totalPnlPct: 0.025,
    });
    expect(parts.totalPnlPct).toBe(0.025);
  });

  test('withPnL=false (默认) 不透传 P&L', () => {
    const parts = extractStatusLineParts({
      memory: makeMemory(),
      totalPnlPct: 0.05, // 即使传入也不透传
    });
    expect(parts.totalPnlPct).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. formatInvestmentStatusLine
// ---------------------------------------------------------------------------

describe('formatInvestmentStatusLine', () => {
  test('空状态: 组合: 0 | 自选: 0 | 决策: 0', () => {
    const text = formatInvestmentStatusLine({ memory: makeMemory() });
    expect(text).toBe('组合: 0 | 自选: 0 | 决策: 0');
  });

  test('含活跃组合名: 组合: 3 (default) | ...', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      portfolio: { total: 3, activeName: 'default' },
    });
    expect(text).toContain('组合: 3 (default)');
  });

  test('有持仓中决策时附加 N 持仓中', () => {
    const m = makeMemory();
    m.recordDecision({ ticker: 'NVDA', action: 'buy', rationale: 'A' });
    const text = formatInvestmentStatusLine({ memory: m });
    expect(text).toContain('决策: 1 (1 持仓中)');
  });

  test('全部决策已闭环时不显示持仓中', () => {
    const m = makeMemory();
    const d = m.recordDecision({ ticker: 'NVDA', action: 'buy', rationale: 'A' });
    m.closeDecision(d.id, { priceAtClose: 200, pnlPct: 0.05 });
    const text = formatInvestmentStatusLine({ memory: m });
    expect(text).toContain('决策: 1');
    expect(text).not.toContain('持仓中');
  });

  test('P&L 正数 + 符号 + 2 位小数', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      withPnL: true,
      totalPnlPct: 0.025, // +2.5%
    });
    expect(text).toContain('今日: +2.50%');
  });

  test('P&L 负数带 - 符号', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      withPnL: true,
      totalPnlPct: -0.018, // -1.8%
    });
    expect(text).toContain('今日: -1.80%');
  });

  test('P&L = 0 显示 +0.00%', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      withPnL: true,
      totalPnlPct: 0,
    });
    expect(text).toContain('今日: +0.00%');
  });

  test('完整场景: 组合 + 自选 + 决策 + P&L', () => {
    const m = makeMemory();
    m.addToWatchlist('NVDA');
    m.addToWatchlist('600519');
    m.addToWatchlist('AAPL');
    m.recordDecision({ ticker: 'NVDA', action: 'buy', rationale: 'X' });
    const text = formatInvestmentStatusLine({
      memory: m,
      portfolio: { total: 2, activeName: 'tech' },
      withPnL: true,
      totalPnlPct: 0.012,
    });
    expect(text).toBe('组合: 2 (tech) | 自选: 3 | 决策: 1 (1 持仓中) | 今日: +1.20%');
  });
});

// ---------------------------------------------------------------------------
// 4. stale-dossier segment (P3.b.1)
// ---------------------------------------------------------------------------

describe('formatInvestmentStatusLine — stale-dossier segment (P3.b.1)', () => {
  test('无 stale dossier 时不渲染过期段', () => {
    const text = formatInvestmentStatusLine({ memory: makeMemory() });
    expect(text).not.toContain('过期:');
  });

  test('单 ticker 渲染 ANSI 红色过期段', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      staleDossiers: [{ ticker: 'NVDA', freshnessDays: 45 }],
    });
    expect(text).toContain('\x1b[31m');
    expect(text).toContain('过期: NVDA(45d)');
    expect(text).toContain('\x1b[0m');
  });

  test('多 ticker 按 freshnessDays 倒序 + 超过 3 个归并为 +N', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      staleDossiers: [
        { ticker: 'A', freshnessDays: 31 },
        { ticker: 'B', freshnessDays: 90 },
        { ticker: 'C', freshnessDays: 60 },
        { ticker: 'D', freshnessDays: 120 },
        { ticker: 'E', freshnessDays: 200 },
      ],
    });
    expect(text).toContain('过期: E(200d),D(120d),B(90d) +2');
  });

  test('segment 位置: 总是最后一个 (P&L 之后)', () => {
    const text = formatInvestmentStatusLine({
      memory: makeMemory(),
      withPnL: true,
      totalPnlPct: 0.05,
      staleDossiers: [{ ticker: 'NVDA', freshnessDays: 31 }],
    });
    const pnlIdx = text.indexOf('今日:');
    const staleIdx = text.indexOf('过期:');
    expect(pnlIdx).toBeGreaterThan(-1);
    expect(staleIdx).toBeGreaterThan(pnlIdx);
  });
});

// ---------------------------------------------------------------------------
// 3. formatInvestmentStatusLineFromMultiPortfolio (async, dynamic import)
// ---------------------------------------------------------------------------

describe('formatInvestmentStatusLineFromMultiPortfolio', () => {
  test('multi-portfolio 可用时输出包含组合数', async () => {
    // 调用方不传 portfolio → 函数内部 dynamic import multi-portfolio
    // 由于 listPortfolios 可能有副作用, 我们只断言不抛错 + 字符串非空
    const text = await formatInvestmentStatusLineFromMultiPortfolio();
    expect(typeof text).toBe('string');
    expect(text).toContain('组合:');
  });

  test('withPnL 透传', async () => {
    const text = await formatInvestmentStatusLineFromMultiPortfolio({
      withPnL: true,
      totalPnlPct: 0.03,
    });
    expect(text).toContain('今日: +3.00%');
  });
});
