/**
 * Investment Memory Tests (Sprint v8-2)
 *
 * 验证 4 种记忆项 (preference / decision / watchlist / note) 的 CRUD + 便捷 API。
 * 全部内存模式, 无磁盘 IO。
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  InvestmentMemory,
  useInvestmentMemory,
  __resetInvestmentMemory,
  type InvestmentDecision,
} from '@upup/memory';

// 固定时间 + 固定 ID, 测试可重现
let _now = 1700000000000;
let _idCounter = 0;
const testNow = (): number => _now;
const testId = (): string => `id-${++_idCounter}`;

function makeMemory(): InvestmentMemory {
  return new InvestmentMemory({
    inMemory: true,
    now: testNow,
    generateId: testId,
  });
}

beforeEach(() => {
  _now = 1700000000000;
  _idCounter = 0;
  __resetInvestmentMemory();
});

// ---------------------------------------------------------------------------
// 1. CRUD
// ---------------------------------------------------------------------------

describe('InvestmentMemory CRUD', () => {
  test('add + get 返回完整 item', () => {
    const m = makeMemory();
    const item = m.add({ kind: 'note', content: 'NVDA 财报超预期' });
    expect(item.id).toBe('id-1');
    expect(item.kind).toBe('note');
    expect(item.content).toBe('NVDA 财报超预期');
    expect(item.createdAt).toBe(1700000000000);
    expect(item.updatedAt).toBe(1700000000000);

    const got = m.get('id-1');
    expect(got).toBeDefined();
    expect(got!.content).toBe('NVDA 财报超预期');
  });

  test('update 修改 content + updatedAt, 不改 createdAt/kind/id', () => {
    const m = makeMemory();
    const item = m.add({ kind: 'note', content: 'A' });
    _now = 1700000010000;
    const updated = m.update(item.id, { content: 'B' });
    expect(updated!.content).toBe('B');
    expect(updated!.updatedAt).toBe(1700000010000);
    expect(updated!.createdAt).toBe(1700000000000);
    expect(updated!.kind).toBe('note');
    expect(updated!.id).toBe('id-1');
  });

  test('update 不存在的 id 返回 undefined', () => {
    const m = makeMemory();
    expect(m.update('nope', { content: 'X' })).toBeUndefined();
  });

  test('delete 存在返回 true, 不存在返回 false', () => {
    const m = makeMemory();
    const item = m.add({ kind: 'note', content: 'X' });
    expect(m.delete(item.id)).toBe(true);
    expect(m.delete(item.id)).toBe(false);
    expect(m.get(item.id)).toBeUndefined();
  });

  test('list 按 updatedAt 倒序', () => {
    const m = makeMemory();
    m.add({ kind: 'note', content: 'A' });
    _now = 1700000020000;
    m.add({ kind: 'note', content: 'B' });
    _now = 1700000010000;
    m.add({ kind: 'note', content: 'C' });
    const list = m.list();
    expect(list.map(i => i.content)).toEqual(['B', 'C', 'A']);
  });

  test('list 按 kind 过滤', () => {
    const m = makeMemory();
    m.add({ kind: 'note', content: 'A' });
    m.add({ kind: 'preference', content: 'risk=moderate' });
    m.add({ kind: 'note', content: 'B' });
    expect(m.list({ kind: 'note' }).length).toBe(2);
    expect(m.list({ kind: 'preference' }).length).toBe(1);
  });

  test('list 按 ticker 过滤', () => {
    const m = makeMemory();
    m.add({ kind: 'note', content: 'A', ticker: 'NVDA' });
    m.add({ kind: 'note', content: 'B', ticker: '600519' });
    m.add({ kind: 'note', content: 'C', ticker: 'NVDA' });
    expect(m.list({ ticker: 'NVDA' }).length).toBe(2);
    expect(m.list({ ticker: '600519' }).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Preferences
// ---------------------------------------------------------------------------

describe('Preferences', () => {
  test('recordPreference + getPreference 闭环', () => {
    const m = makeMemory();
    m.recordPreference('risk', 'moderate');
    m.recordPreference('holding_period', 'long');
    expect(m.getPreference('risk')).toBe('moderate');
    expect(m.getPreference('holding_period')).toBe('long');
    expect(m.getPreference('not_set')).toBeUndefined();
  });

  test('同名 key 多次 record 后取最新', () => {
    const m = makeMemory();
    m.recordPreference('risk', 'aggressive');
    _now = 1700000020000;
    m.recordPreference('risk', 'moderate');
    expect(m.getPreference('risk')).toBe('moderate');
  });
});

// ---------------------------------------------------------------------------
// 3. Watchlist
// ---------------------------------------------------------------------------

describe('Watchlist', () => {
  test('addToWatchlist + getWatchlist', () => {
    const m = makeMemory();
    m.addToWatchlist('NVDA', 'AI 龙头');
    m.addToWatchlist('600519');
    const wl = m.getWatchlist();
    expect(wl.length).toBe(2);
    const tickers = wl.map(i => i.ticker).sort();
    expect(tickers).toEqual(['600519', 'NVDA']);
  });

  test('addToWatchlist 同 ticker 不重复 (update 而非 add)', () => {
    const m = makeMemory();
    m.addToWatchlist('NVDA', 'first note');
    m.addToWatchlist('NVDA', 'updated note');
    const wl = m.getWatchlist();
    expect(wl.length).toBe(1);
    expect(wl[0].content).toBe('updated note');
  });

  test('removeFromWatchlist 删除匹配的 ticker', () => {
    const m = makeMemory();
    m.addToWatchlist('NVDA');
    m.addToWatchlist('600519');
    expect(m.removeFromWatchlist('NVDA')).toBe(true);
    expect(m.getWatchlist().map(i => i.ticker)).toEqual(['600519']);
    expect(m.removeFromWatchlist('NVDA')).toBe(false); // 已删
  });
});

// ---------------------------------------------------------------------------
// 4. Decisions (含 outcome 闭环)
// ---------------------------------------------------------------------------

describe('Decisions', () => {
  test('recordDecision 含完整字段 + action/rationale 落在 metadata', () => {
    const m = makeMemory();
    const d = m.recordDecision({
      ticker: 'NVDA',
      action: 'buy',
      rationale: 'AI 算力龙头, 估值合理',
      priceAtDecision: 800,
      targetPrice: 1000,
      stopLoss: 700,
    });
    expect(d.kind).toBe('decision');
    expect(d.ticker).toBe('NVDA');
    expect(d.action).toBe('buy');
    expect(d.rationale).toBe('AI 算力龙头, 估值合理');
    expect(d.priceAtDecision).toBe(800);
    expect(d.targetPrice).toBe(1000);
    expect(d.stopLoss).toBe(700);
  });

  test('closeDecision 写入 outcome 闭环', () => {
    const m = makeMemory();
    const d = m.recordDecision({
      ticker: '600519', action: 'buy', rationale: '高端白酒龙头',
      priceAtDecision: 1500,
    });
    _now = 1700000100000;
    const closed = m.closeDecision(d.id, { priceAtClose: 1650, pnlPct: 0.10 });
    expect(closed).toBeDefined();
    expect(closed!.outcome).toBeDefined();
    expect(closed!.outcome!.priceAtClose).toBe(1650);
    expect(closed!.outcome!.pnlPct).toBe(0.10);
    expect(closed!.outcome!.closedAt).toBe(1700000100000);
  });

  test('listDecisions openOnly 过滤未闭环', () => {
    const m = makeMemory();
    const d1 = m.recordDecision({ ticker: 'NVDA', action: 'buy', rationale: 'X' });
    const d2 = m.recordDecision({ ticker: '600519', action: 'buy', rationale: 'Y' });
    m.closeDecision(d2.id, { priceAtClose: 1700, pnlPct: 0.05 });
    const open = m.listDecisions({ openOnly: true });
    expect(open.length).toBe(1);
    expect(open[0].id).toBe(d1.id);
    const all = m.listDecisions();
    expect(all.length).toBe(2);
  });

  test('listDecisions 按 ticker 过滤', () => {
    const m = makeMemory();
    m.recordDecision({ ticker: 'NVDA', action: 'buy', rationale: 'A' });
    m.recordDecision({ ticker: 'NVDA', action: 'sell', rationale: 'B' });
    m.recordDecision({ ticker: '600519', action: 'buy', rationale: 'C' });
    expect(m.listDecisions({ ticker: 'NVDA' }).length).toBe(2);
    expect(m.listDecisions({ ticker: '600519' }).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Notes
// ---------------------------------------------------------------------------

describe('Notes', () => {
  test('recordNote + list', () => {
    const m = makeMemory();
    m.recordNote('NVDA 2026Q1 营收 240 亿', { ticker: 'NVDA' });
    m.recordNote('茅台 PE 历史分位 70%', { ticker: '600519' });
    const notes = m.list({ kind: 'note' });
    expect(notes.length).toBe(2);
    expect(notes.every(n => n.kind === 'note')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Stats + Singleton
// ---------------------------------------------------------------------------

describe('Stats + Singleton', () => {
  test('count 按 kind 统计', () => {
    const m = makeMemory();
    m.add({ kind: 'note', content: 'A' });
    m.add({ kind: 'note', content: 'B' });
    m.add({ kind: 'preference', content: 'risk=mod' });
    expect(m.count()).toBe(3);
    expect(m.count({ kind: 'note' })).toBe(2);
  });

  test('clear 清空全部', () => {
    const m = makeMemory();
    m.add({ kind: 'note', content: 'A' });
    m.clear();
    expect(m.count()).toBe(0);
  });

  test('useInvestmentMemory 单例 (with __reset)', () => {
    const a = useInvestmentMemory();
    const b = useInvestmentMemory();
    expect(a).toBe(b);
    __resetInvestmentMemory();
    const c = useInvestmentMemory();
    expect(c).not.toBe(a);
  });
});
