/**
 * Tests for the PortfolioService (business logic layer).
 * v7-2: split from the old tracker.ts. Uses an in-memory repo + stub price
 * provider so the test runs with no network and no tushare key.
 */

import { describe, expect, test } from 'bun:test';
import { PortfolioService, NullPriceProvider, type PriceProvider } from './service.js';
import { InMemoryPortfolioRepository } from './store.js';
import type { Position } from './store.js';

class StubPriceProvider implements PriceProvider {
  private readonly quotes = new Map<string, { price: number; name?: string; industry?: string }>();
  set(code: string, q: { price: number; name?: string; industry?: string }) {
    this.quotes.set(code, q);
  }
  async quote(code: string, _date: string) {
    return this.quotes.get(code) ?? null;
  }
}

const pos = (overrides: Partial<Position> = {}): Position => ({
  id: 'POS1',
  code: '600519.SH',
  quantity: 100,
  entry_price: 1800,
  entry_date: '2024-01-01',
  ...overrides,
});

describe('PortfolioService.add', () => {
  test('rejects missing fields', () => {
    const svc = new PortfolioService(new InMemoryPortfolioRepository(), new NullPriceProvider());
    expect(() => svc.add({ code: '', quantity: 1, entry_price: 1 } as never)).toThrow();
    expect(() => svc.add({ code: 'X', quantity: 0, entry_price: 1 } as never)).toThrow();
  });

  test('stores a position with generated id and today date', () => {
    const repo = new InMemoryPortfolioRepository();
    const svc = new PortfolioService(repo, new NullPriceProvider());
    const p = svc.add({ code: '600519.SH', quantity: 100, entry_price: 1800 });
    expect(p.id).toMatch(/^POS\d+/);
    expect(p.code).toBe('600519.SH');
    expect(repo.size()).toBe(1);
  });

  test('respects caller-provided entry_date', () => {
    const repo = new InMemoryPortfolioRepository();
    const svc = new PortfolioService(repo, new NullPriceProvider());
    const p = svc.add({ code: 'A', quantity: 1, entry_price: 1, entry_date: '2020-01-01' });
    expect(p.entry_date).toBe('2020-01-01');
  });
});

describe('PortfolioService.remove', () => {
  test('returns true on hit, false on miss', () => {
    const repo = new InMemoryPortfolioRepository();
    repo.add(pos({ id: 'X' }));
    const svc = new PortfolioService(repo, new NullPriceProvider());
    expect(svc.remove('X')).toBe(true);
    expect(svc.remove('X')).toBe(false);
  });
});

describe('PortfolioService.listWithPnl', () => {
  test('enriches positions with current price and pnl', async () => {
    const repo = new InMemoryPortfolioRepository();
    repo.add(pos({ id: 'A', code: 'X', entry_price: 100, quantity: 10 }));
    const prices = new StubPriceProvider();
    prices.set('X', { price: 110, name: 'Test Co' });
    const svc = new PortfolioService(repo, prices);
    const out = await svc.listWithPnl();
    expect(out.length).toBe(1);
    expect(out[0]?.current_price).toBe(110);
    expect(out[0]?.pnl).toBe(100);
    expect(out[0]?.pnl_pct).toBeCloseTo(10, 5);
    expect(out[0]?.name).toBe('Test Co');
  });

  test('falls back to base position when no price available', async () => {
    const repo = new InMemoryPortfolioRepository();
    repo.add(pos({ id: 'A' }));
    const svc = new PortfolioService(repo, new NullPriceProvider());
    const out = await svc.listWithPnl();
    expect(out[0]?.current_price).toBeUndefined();
    expect(out[0]?.pnl).toBeUndefined();
  });
});

describe('PortfolioService.performance', () => {
  test('aggregates total value, cost, pnl across positions', async () => {
    const repo = new InMemoryPortfolioRepository();
    repo.add(pos({ id: 'A', code: 'X', entry_price: 100, quantity: 10 }));
    repo.add(pos({ id: 'B', code: 'Y', entry_price: 50, quantity: 20 }));
    const prices = new StubPriceProvider();
    prices.set('X', { price: 110 });
    prices.set('Y', { price: 60 });
    const svc = new PortfolioService(repo, prices);
    const m = await svc.performance();
    expect(m.total_cost).toBe(100 * 10 + 50 * 20);
    expect(m.total_value).toBe(110 * 10 + 60 * 20);
    expect(m.total_pnl).toBe(m.total_value - m.total_cost);
  });

  test('empty portfolio returns zero metrics', async () => {
    const svc = new PortfolioService(new InMemoryPortfolioRepository(), new NullPriceProvider());
    const m = await svc.performance();
    expect(m.total_value).toBe(0);
    expect(m.total_cost).toBe(0);
    expect(m.total_pnl).toBe(0);
  });
});

describe('PortfolioService.summaryBySector', () => {
  test('groups by industry and computes pnl per sector', async () => {
    const repo = new InMemoryPortfolioRepository();
    repo.add(pos({ id: 'A', code: 'X', entry_price: 100, quantity: 10 }));
    repo.add(pos({ id: 'B', code: 'Y', entry_price: 50, quantity: 20 }));
    const prices = new StubPriceProvider();
    prices.set('X', { price: 120, industry: 'Tech' });
    prices.set('Y', { price: 40, industry: 'Tech' });
    const svc = new PortfolioService(repo, prices);
    const s = await svc.summaryBySector();
    expect(s.positions_count).toBe(2);
    expect(s.sectors.length).toBe(1);
    expect(s.sectors[0]?.sector).toBe('Tech');
    expect(s.sectors[0]?.value).toBe(120 * 10 + 40 * 20);
    expect(s.sectors[0]?.pnl).toBe((120 - 100) * 10 + (40 - 50) * 20);
  });

  test('positions without industry land in Unknown', async () => {
    const repo = new InMemoryPortfolioRepository();
    repo.add(pos({ id: 'A' }));
    const svc = new PortfolioService(repo, new NullPriceProvider());
    const s = await svc.summaryBySector();
    expect(s.sectors[0]?.sector).toBe('Unknown');
  });
});
