/**
 * Sprint 1.2 投研 Coach 跨会话记忆 tests.
 *
 * 测试用 tmp dir 隔离,不影响真实 .upup/coach/memory.json。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCoachMemory,
  saveCoachMemory,
  updateCoachMemory,
  recordQuery,
  addToWatchlist,
  removeFromWatchlist,
  setPreferences,
  recordHoldings,
  consolidateMemory,
  hashUserId,
  bucketize,
  truncateQuery,
  DEFAULT_PREFERENCES,
  type CoachMemory,
  type Holding,
  type WatchlistItem,
} from './memory.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;
const ORIG_COACH = process.env.BUN_CONFIG_FEATURE_COACH_MODE;
const ORIG_RUNTIME = process.env.UPUP_COACH_MODE;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'upup-coach-mem-'));
  process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
  process.env.UPUP_COACH_MODE = '1';
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG_COACH === undefined) delete process.env.BUN_CONFIG_FEATURE_COACH_MODE;
  else process.env.BUN_CONFIG_FEATURE_COACH_MODE = ORIG_COACH;
  if (ORIG_RUNTIME === undefined) delete process.env.UPUP_COACH_MODE;
  else process.env.UPUP_COACH_MODE = ORIG_RUNTIME;
});

const opts = () => ({ baseDir: tmpDir });

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('hashUserId', () => {
  test('produces 32-char hex', () => {
    const h = hashUserId('user@example.com');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
  test('deterministic for same input', () => {
    expect(hashUserId('abc')).toBe(hashUserId('abc'));
  });
  test('different input -> different hash', () => {
    expect(hashUserId('a')).not.toBe(hashUserId('b'));
  });
  test('empty -> empty string', () => {
    expect(hashUserId('')).toBe('');
  });
});

describe('bucketize', () => {
  test('boundaries', () => {
    expect(bucketize(0)).toBe('0');
    expect(bucketize(500)).toBe('<1k');
    expect(bucketize(1_000)).toBe('1k-10k');
    expect(bucketize(9_999)).toBe('1k-10k');
    expect(bucketize(10_000)).toBe('10k-50k');
    expect(bucketize(49_999)).toBe('10k-50k');
    expect(bucketize(50_000)).toBe('50k-100k');
    expect(bucketize(99_999)).toBe('50k-100k');
    expect(bucketize(100_000)).toBe('100k-500k');
    expect(bucketize(499_999)).toBe('100k-500k');
    expect(bucketize(500_000)).toBe('500k-1m');
    expect(bucketize(999_999)).toBe('500k-1m');
    expect(bucketize(1_000_000)).toBe('>1m');
    expect(bucketize(99_999_999)).toBe('>1m');
  });
  test('negative -> 0', () => {
    expect(bucketize(-100)).toBe('0');
  });
});

describe('truncateQuery', () => {
  test('shorter than max -> unchanged', () => {
    expect(truncateQuery('hello')).toBe('hello');
  });
  test('longer than max -> truncated with ellipsis', () => {
    const long = 'x'.repeat(300);
    const out = truncateQuery(long, 200);
    expect(out.length).toBe(201);  // 200 + ellipsis
    expect(out.endsWith('…')).toBe(true);
  });
  test('empty -> empty', () => {
    expect(truncateQuery('')).toBe('');
  });
  test('default max is 200', () => {
    const out = truncateQuery('x'.repeat(250));
    expect(out.length).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Soft fallback when Coach disabled
// ---------------------------------------------------------------------------

describe('soft fallback when UPUP_COACH_MODE=0', () => {
  test('load returns null', async () => {
    process.env.UPUP_COACH_MODE = '0';
    expect(await loadCoachMemory(opts())).toBeNull();
  });
  test('save is no-op', async () => {
    process.env.UPUP_COACH_MODE = '0';
    await saveCoachMemory({ ...DEFAULT_PREFERENCES } as unknown as CoachMemory, opts());
    expect(await loadCoachMemory(opts())).toBeNull();
  });
  test('update is no-op (returns default shape)', async () => {
    process.env.UPUP_COACH_MODE = '0';
    const out = await updateCoachMemory({ holdings: [] }, opts());
    // 不抛错,返回 shape
    expect(out.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// load / save / update
// ---------------------------------------------------------------------------

describe('loadCoachMemory', () => {
  test('first time -> default shape', async () => {
    const m = await loadCoachMemory(opts());
    expect(m).not.toBeNull();
    expect(m!.schemaVersion).toBe(1);
    expect(m!.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(m!.holdings).toEqual([]);
    expect(m!.watchlist).toEqual([]);
    expect(m!.history).toEqual([]);
    expect(m!.userIdHash).toMatch(/^[0-9a-f]{32}$/);
  });
  test('returns saved memory', async () => {
    const mem: CoachMemory = {
      schemaVersion: 1,
      userIdHash: 'h'.repeat(32),
      preferences: { ...DEFAULT_PREFERENCES, persona: 'private-fund' },
      holdings: [],
      watchlist: [{ symbol: '600519', addedAt: '2026-06-01T00:00:00Z' }],
      history: [],
      updatedAt: '2026-06-01T00:00:00Z',
    };
    await saveCoachMemory(mem, opts());
    const m = await loadCoachMemory(opts());
    expect(m!.preferences.persona).toBe('private-fund');
    expect(m!.watchlist[0].symbol).toBe('600519');
  });
});

describe('updateCoachMemory merge', () => {
  test('merges preferences without losing other fields', async () => {
    const m1 = await loadCoachMemory(opts());
    await updateCoachMemory({
      preferences: { ...m1!.preferences, persona: 'enterprise' },
    }, opts());
    const m2 = await loadCoachMemory(opts());
    expect(m2!.preferences.persona).toBe('enterprise');
    expect(m2!.preferences.riskAppetite).toBe(DEFAULT_PREFERENCES.riskAppetite);
    expect(m2!.holdings).toEqual([]);
  });
  test('updates updatedAt to now', async () => {
    const before = (await loadCoachMemory(opts()))!.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    await updateCoachMemory({ holdings: [] }, opts());
    const after = (await loadCoachMemory(opts()))!.updatedAt;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
});

// ---------------------------------------------------------------------------
// recordQuery
// ---------------------------------------------------------------------------

describe('recordQuery', () => {
  test('adds entry to history', async () => {
    await recordQuery('分析 600519', ['600519'], ['financial_metrics'], opts());
    const m = await loadCoachMemory(opts());
    expect(m!.history.length).toBe(1);
    expect(m!.history[0].query).toBe('分析 600519');
    expect(m!.history[0].tickers).toEqual(['600519']);
  });
  test('truncates long query', async () => {
    await recordQuery('x'.repeat(300), [], [], opts());
    const m = await loadCoachMemory(opts());
    expect(m!.history[0].query.length).toBe(201);
  });
  test('limits tickers to 10', async () => {
    await recordQuery('q', Array.from({ length: 20 }, (_, i) => `T${i}`), [], opts());
    const m = await loadCoachMemory(opts());
    expect(m!.history[0].tickers.length).toBe(10);
  });
  test('newest first', async () => {
    await recordQuery('first', [], [], opts());
    await new Promise(r => setTimeout(r, 5));
    await recordQuery('second', [], [], opts());
    const m = await loadCoachMemory(opts());
    expect(m!.history[0].query).toBe('second');
    expect(m!.history[1].query).toBe('first');
  });
  test('rolling to HISTORY_MAX (100)', async () => {
    for (let i = 0; i < 150; i++) {
      await recordQuery(`q${i}`, [], [], opts());
    }
    const m = await loadCoachMemory(opts());
    expect(m!.history.length).toBe(100);
    expect(m!.history[0].query).toBe('q149');
    expect(m!.history[99].query).toBe('q50');
  });
});

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

describe('watchlist add/remove', () => {
  test('add new item', async () => {
    await addToWatchlist({ symbol: '600519', name: '贵州茅台', addedAt: '2026-06-01T00:00:00Z' }, opts());
    const m = await loadCoachMemory(opts());
    expect(m!.watchlist.length).toBe(1);
    expect(m!.watchlist[0].symbol).toBe('600519');
  });
  test('no duplicate', async () => {
    const item: WatchlistItem = { symbol: '600519', addedAt: '2026-06-01T00:00:00Z' };
    await addToWatchlist(item, opts());
    await addToWatchlist(item, opts());
    const m = await loadCoachMemory(opts());
    expect(m!.watchlist.length).toBe(1);
  });
  test('remove', async () => {
    await addToWatchlist({ symbol: '600519', addedAt: '2026-06-01T00:00:00Z' }, opts());
    await addToWatchlist({ symbol: '000858', addedAt: '2026-06-01T00:00:00Z' }, opts());
    await removeFromWatchlist('600519', opts());
    const m = await loadCoachMemory(opts());
    expect(m!.watchlist.length).toBe(1);
    expect(m!.watchlist[0].symbol).toBe('000858');
  });
});

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

describe('setPreferences', () => {
  test('partial update', async () => {
    await setPreferences({ persona: 'private-fund' }, opts());
    const m = await loadCoachMemory(opts());
    expect(m!.preferences.persona).toBe('private-fund');
    expect(m!.preferences.riskAppetite).toBe('balanced');
  });
  test('notifications merge', async () => {
    await setPreferences({ notifications: { morningBrief: true, afterHours: false, earningsPreview: true, policyAlerts: true } }, opts());
    const m = await loadCoachMemory(opts());
    expect(m!.preferences.notifications.morningBrief).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Holdings (cost bucketize)
// ---------------------------------------------------------------------------

describe('recordHoldings', () => {
  test('cost -> bucketize', async () => {
    await recordHoldings([
      { symbol: '600519', shares: 100, cost: 1500 },          // -> 1k-10k
      { symbol: '000858', shares: 50, cost: 80_000 },          // -> 50k-100k
      { symbol: '00700', shares: 200, cost: 350_000 },         // -> 100k-500k
    ], opts());
    const m = await loadCoachMemory(opts());
    expect(m!.holdings.length).toBe(3);
    expect(m!.holdings[0].costBucket).toBe('1k-10k');
    expect(m!.holdings[1].costBucket).toBe('50k-100k');
    expect(m!.holdings[2].costBucket).toBe('100k-500k');
  });
  test('replaces existing (not append)', async () => {
    await recordHoldings([{ symbol: 'A', shares: 1, cost: 100 }], opts());
    await recordHoldings([{ symbol: 'B', shares: 1, cost: 100 }], opts());
    const m = await loadCoachMemory(opts());
    expect(m!.holdings.length).toBe(1);
    expect(m!.holdings[0].symbol).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// Consolidate
// ---------------------------------------------------------------------------

describe('consolidateMemory', () => {
  test('replaces history + bumps count + sets consolidatedAt', async () => {
    await recordQuery('a', [], [], opts());
    await recordQuery('b', [], [], opts());
    const before = (await loadCoachMemory(opts()))!.consolidatedCount ?? 0;
    await consolidateMemory(
      [{ query: 'consolidated', tickers: [], tools: [], ts: '2026-06-01T00:00:00Z' }],
      opts(),
    );
    const m = await loadCoachMemory(opts());
    expect(m!.history.length).toBe(1);
    expect(m!.history[0].query).toBe('consolidated');
    expect(m!.consolidatedAt).toBeTruthy();
    expect(m!.consolidatedCount).toBe(before + 1);
  });
  test('rolling on consolidated history', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      query: `c${i}`, tickers: [], tools: [], ts: '2026-06-01T00:00:00Z',
    }));
    await consolidateMemory(many, opts());
    const m = await loadCoachMemory(opts());
    expect(m!.history.length).toBe(100);
  });
});
