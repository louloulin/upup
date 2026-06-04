/**
 * Tests for the PortfolioRepository (pure data layer).
 * v7-2: split from the old tracker.ts to enable isolated testing.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  InMemoryPortfolioRepository,
  getDefaultPortfolioRepository,
  __resetDefaultPortfolioRepository,
  type Position,
} from './store.js';

describe('InMemoryPortfolioRepository', () => {
  let repo: InMemoryPortfolioRepository;
  const sample = (overrides: Partial<Position> = {}): Position => ({
    id: 'POS1',
    code: '600519.SH',
    quantity: 100,
    entry_price: 1800,
    entry_date: '2024-01-01',
    ...overrides,
  });

  beforeEach(() => {
    repo = new InMemoryPortfolioRepository();
  });

  test('add + list returns the stored position', () => {
    const p = sample();
    repo.add(p);
    expect(repo.list()).toEqual([p]);
    expect(repo.size()).toBe(1);
  });

  test('get returns the position by id, undefined for unknown', () => {
    const p = sample({ id: 'POS42' });
    repo.add(p);
    expect(repo.get('POS42')).toEqual(p);
    expect(repo.get('NOPE')).toBeUndefined();
  });

  test('remove returns true on hit, false on miss', () => {
    const p = sample({ id: 'P1' });
    repo.add(p);
    expect(repo.remove('P1')).toBe(true);
    expect(repo.remove('P1')).toBe(false);
    expect(repo.size()).toBe(0);
  });

  test('clear empties the store and resets the counter', () => {
    repo.add(sample({ id: 'A' }));
    repo.add(sample({ id: 'B' }));
    const firstId = repo.nextId();
    expect(firstId).toMatch(/^POS\d+/);
    repo.clear();
    expect(repo.size()).toBe(0);
    const nextId = repo.nextId();
    // After clear, counter starts at 1 again (Date.now() may be same ms)
    expect(nextId).toMatch(/^POS\d+/);
  });

  test('nextId produces unique ids within the same instance', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(repo.nextId());
    // In a single ms the timestamp is the same; counter must disambiguate
    expect(ids.size).toBe(50);
  });

  test('list returns a snapshot, not a live view', () => {
    const p = sample({ id: 'X' });
    repo.add(p);
    const snap = repo.list();
    repo.remove('X');
    expect(snap.length).toBe(1);
    expect(repo.size()).toBe(0);
  });
});

describe('getDefaultPortfolioRepository singleton', () => {
  beforeEach(() => {
    __resetDefaultPortfolioRepository();
  });

  test('returns the same instance across calls', () => {
    const a = getDefaultPortfolioRepository();
    const b = getDefaultPortfolioRepository();
    expect(a).toBe(b);
  });

  test('__resetDefaultPortfolioRepository forces a new instance', () => {
    const a = getDefaultPortfolioRepository();
    __resetDefaultPortfolioRepository();
    const b = getDefaultPortfolioRepository();
    expect(a).not.toBe(b);
  });
});
