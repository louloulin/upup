/**
 * Tests for the UpUp web overlay's investment state store.
 *
 * The store is a tiny JSON-file backend for the /api/upup/state route.
 * Writes go through tmp + rename so an interrupted patch can't corrupt
 * the on-disk state. Reads cache in memory for the lifetime of the
 * process.
 */
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  getInvestmentState,
  patchInvestmentState,
  InvestmentStateStore,
} from '../src/investment-state';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'upup-web-state-'));
});

afterEach(() => {
  // Cleanup is automatic via mkdtemp; explicit unlink would require rm-rf.
});

describe('InvestmentStateStore', () => {
  it('returns a fresh state when no file exists yet', () => {
    const store = new InvestmentStateStore(workDir);
    const initial = store.read();
    expect(initial.ticker).toBeUndefined();
    expect(initial.sop).toBeUndefined();
    expect(initial.planId).toBeUndefined();
    expect(typeof initial.updatedAt).toBe('string');
    expect(initial.updatedAt.startsWith('1970-01-01')).toBe(true);
  });

  it('writes a JSON file on first patch and renames atomically', () => {
    const store = new InvestmentStateStore(workDir);
    const out = store.patch({ ticker: '600519.SH', sop: 'graham' });
    expect(out.ticker).toBe('600519.SH');
    expect(out.sop).toBe('graham');
    expect(existsSync(join(workDir, 'investment-state.json'))).toBe(true);
    expect(existsSync(join(workDir, 'investment-state.json.tmp'))).toBe(false);
  });

  it('persists across store instances reading the same dir', () => {
    const writer = new InvestmentStateStore(workDir);
    writer.patch({ ticker: 'AAPL', note: 'one-liner' });
    const reader = new InvestmentStateStore(workDir);
    const read = reader.read();
    expect(read.ticker).toBe('AAPL');
    expect(read.note).toBe('one-liner');
  });

  it('merges patches instead of replacing', () => {
    const store = new InvestmentStateStore(workDir);
    store.patch({ ticker: '00700.HK' });
    store.patch({ sop: 'momentum' });
    const merged = store.patch({ planId: 'plan-2026-09-17-001' });
    expect(merged.ticker).toBe('00700.HK');
    expect(merged.sop).toBe('momentum');
    expect(merged.planId).toBe('plan-2026-09-17-001');
  });

  it('updates updatedAt on every patch', async () => {
    const store = new InvestmentStateStore(workDir);
    const first = store.patch({ ticker: 'X' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = store.patch({ ticker: 'Y' });
    expect(second.updatedAt > first.updatedAt).toBe(true);
  });

  it('ignores non-string fields silently (no type coercion)', () => {
    const store = new InvestmentStateStore(workDir);
    // Patch with bogus types should drop them, not throw.
    const out = store.patch({ ticker: 123, sop: null, planId: { bad: true } });
    expect(out.ticker).toBeUndefined();
    expect(out.sop).toBeUndefined();
    expect(out.planId).toBeUndefined();
  });

  it('recovers from a corrupt JSON file', () => {
    const file = join(workDir, 'investment-state.json');
    // Seed a bad JSON file by reaching around the store.
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(file, '{ this is not json');
    const store = new InvestmentStateStore(workDir);
    const recovered = store.read();
    expect(recovered.ticker).toBeUndefined();
  });
});

describe('module-level helpers', () => {
  it('getInvestmentState returns the same shape as store.read()', () => {
    const state = getInvestmentState({ dataDir: workDir });
    expect(typeof state.updatedAt).toBe('string');
  });

  it('patchInvestmentState delegates to the store and persists', () => {
    patchInvestmentState({ dataDir: workDir }, { ticker: 'NVDA' });
    const onDisk = JSON.parse(readFileSync(join(workDir, 'investment-state.json'), 'utf8')) as { ticker?: string };
    expect(onDisk.ticker).toBe('NVDA');
  });
});
