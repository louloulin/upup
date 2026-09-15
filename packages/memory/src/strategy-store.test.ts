/**
 * Strategy Store tests (P2.a.2)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StrategyStore, computeStrategyPrevHash, type StrategyRecordInput } from '@upup/memory';

const TMP = join(tmpdir(), `upup-strategy-test-${process.pid}-${Date.now()}`);

function makeInput(over: Partial<StrategyRecordInput> = {}): StrategyRecordInput {
  return {
    name: 'test-strategy',
    author: 'tester',
    code: 'export function run() { return 1; }',
    methodology: {
      factorSources: [{ name: 'PE-TTM', source: 'src/tools/finance/metrics.ts' }],
      lookAheadBiasCheck: 'pass',
      walkForward: { trainWindowDays: 252, testWindowDays: 63, folds: [] },
      outOfSample: { startDate: '2024-01-01', endDate: '2024-12-31', totalReturnPct: 0.1, tradeCount: 5 },
    },
    version: 1,
    prevHash: '0'.repeat(64),
    description: 'A test strategy',
    ...over,
  };
}

let fixedNow = 1_700_000_000_000;
function newStore(): StrategyStore {
  return new StrategyStore({
    filePath: join(TMP, 'strategies.jsonl'),
    keyPath: join(TMP, 'strategy-key.json'),
    inMemory: true,
    now: () => fixedNow,
  });
}

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  fixedNow = 1_700_000_000_000;
});

describe('StrategyStore — publish + version chain (P2.a.2)', () => {
  test('publish v1 → 自动 id + ts + signature', () => {
    const s = newStore();
    const r = s.publish(makeInput());
    expect(r.id).toMatch(/^s-[0-9a-z]+-[0-9a-z]+$/);
    expect(r.ts).toBe(fixedNow);
    expect(r.signature).toBeTruthy();
    expect(r.signature.length).toBeGreaterThan(20);
  });

  test('完整 publish v1 → v2 → v3 + verifyChain valid', () => {
    const s = newStore();
    const v1 = s.publish(makeInput({ version: 1, prevHash: '0'.repeat(64) }));
    // We need v2's prevHash to be the sha256 of v1 (with empty signature slot).
    // Use the store's internal pattern: compute the hash from the stored v1.
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier');
    const v1Hash = crypto.createHash('sha256').update(canonicalJson({ ...v1, signature: '' })).digest('hex');
    const v2 = s.publish(makeInput({ version: 2, prevHash: v1Hash }));
    const v2Hash = crypto.createHash('sha256').update(canonicalJson({ ...v2, signature: '' })).digest('hex');
    const v3 = s.publish(makeInput({ version: 3, prevHash: v2Hash }));
    const r = s.verifyChain();
    expect(r.valid).toBe(true);
    expect(v1.id).not.toBe(v2.id);
    expect(v2.id).not.toBe(v3.id);
  });

  test('篡改 v2 code → verifyChain 失败', () => {
    const s = newStore();
    const v1 = s.publish(makeInput({ version: 1, prevHash: '0'.repeat(64) }));
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier');
    const v1Hash = crypto.createHash('sha256').update(canonicalJson({ ...v1, signature: '' })).digest('hex');
    s.publish(makeInput({ version: 2, prevHash: v1Hash }));
    // Tamper: change the second record's code
    const all = s.list();
    all[1]!.code = 'export function run() { return 999; }';
    const r = s.verifyChain();
    expect(r.valid).toBe(false);
    expect(r.brokenAt?.id).toBe(all[1]!.id);
  });
});

describe('StrategyStore — input validation (P2.a.6)', () => {
  test('name 空 → throw', () => {
    const s = newStore();
    expect(() => s.publish(makeInput({ name: '' }))).toThrow(/name required/);
  });
  test('code 空 → throw', () => {
    const s = newStore();
    expect(() => s.publish(makeInput({ code: '' }))).toThrow(/code required/);
  });
  test('methodology 缺 → throw', () => {
    const s = newStore();
    expect(() => s.publish(makeInput({ methodology: undefined as unknown as never }))).toThrow(/methodology required/);
  });
  test('version < 1 → throw', () => {
    const s = newStore();
    expect(() => s.publish(makeInput({ version: 0 }))).toThrow(/version must be/);
  });
  test('prevHash 非法 → throw', () => {
    const s = newStore();
    expect(() => s.publish(makeInput({ prevHash: '0x123' }))).toThrow(/prevHash must be/);
  });
});

describe('StrategyStore — getById / getVersions / getLatest (P2.a.2)', () => {
  test('getById 命中 + 未命中 undefined', () => {
    const s = newStore();
    const v1 = s.publish(makeInput());
    expect(s.getById(v1.id)?.name).toBe('test-strategy');
    expect(s.getById('not-real')).toBeUndefined();
  });

  test('getVersions 按 version 升序', () => {
    const s = newStore();
    const v1 = s.publish(makeInput({ version: 1, prevHash: '0'.repeat(64) }));
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier');
    const v1Hash = crypto.createHash('sha256').update(canonicalJson({ ...v1, signature: '' })).digest('hex');
    const v2 = s.publish(makeInput({ version: 2, prevHash: v1Hash }));
    const v2Hash = crypto.createHash('sha256').update(canonicalJson({ ...v2, signature: '' })).digest('hex');
    const v3 = s.publish(makeInput({ version: 3, prevHash: v2Hash }));
    const versions = s.getVersions('test-strategy');
    expect(versions.map(v => v.version)).toEqual([1, 2, 3]);
    expect(s.getLatest('test-strategy')?.id).toBe(v3.id);
    expect(s.getByNameAndVersion('test-strategy', 2)?.id).toBe(v2.id);
  });
});


describe('computeStrategyPrevHash (P2.a.5 refactor)', () => {
  test('produces 64-hex sha256 over canonicalJson of the predecessor with empty signature', () => {
    const s = new StrategyStore({ inMemory: true });
    const v1 = s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'v1',
      methodology: { source: 'handwritten' },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'v1',
    });
    // Reproduce the rule inline (this is the same path publish() takes).
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier');
    const expected = createHash('sha256')
      .update(canonicalJson({ ...v1, signature: '' }))
      .digest('hex');
    expect(computeStrategyPrevHash(v1)).toBe(expected);
    expect(computeStrategyPrevHash(v1)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is sensitive to all predecessor fields (changes when code changes)', () => {
    const s = new StrategyStore({ inMemory: true });
    const rec = s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'v1',
      methodology: { source: 'handwritten' },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'v1',
    });
    const before = computeStrategyPrevHash(rec);
    const mutated = { ...rec, code: 'v1-mutated' };
    const after = computeStrategyPrevHash(mutated);
    expect(after).not.toBe(before);
  });

  test('is independent of the signature field (signature is stripped before hashing)', () => {
    // This is the key invariant: two records with identical content but
    // different signatures must produce the same prevHash for the next
    // record, so the chain rule is reproducible from the predecessor's
    // content alone.
    const s = new StrategyStore({ inMemory: true });
    const rec = s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'v1',
      methodology: { source: 'handwritten' },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'v1',
    });
    const withOriginalSig = computeStrategyPrevHash(rec);
    const withBlankSig = computeStrategyPrevHash({ ...rec, signature: '' });
    expect(withBlankSig).toBe(withOriginalSig);
  });
});

describe('StrategyStore.latestPerName (P2.a.4/P2.a.5 refactor)', () => {
  test('returns the highest-version record per name', () => {
    const s = new StrategyStore({ inMemory: true });
    // Two names, three versions total (low-pe v1+v2, low-roe v1).
    s.publish({
      name: 'low-pe', author: 'a', code: 'a', methodology: { source: 'h' },
      version: 1, prevHash: '0'.repeat(64), description: 'a',
    });
    const v1 = s.getLatest('low-pe')!;
    s.publish({
      name: 'low-pe', author: 'a', code: 'b', methodology: { source: 'h' },
      version: 2, prevHash: computeStrategyPrevHash(v1), description: 'b',
    });
    s.publish({
      name: 'low-roe', author: 'b', code: 'c', methodology: { source: 'h' },
      version: 1, prevHash: '0'.repeat(64), description: 'c',
    });
    const latests = s.latestPerName();
    const byName = new Map(latests.map((r) => [r.name, r]));
    expect(latests).toHaveLength(2);
    expect(byName.get('low-pe')?.version).toBe(2);
    expect(byName.get('low-roe')?.version).toBe(1);
  });

  test('returns [] on an empty store', () => {
    const s = new StrategyStore({ inMemory: true });
    expect(s.latestPerName()).toEqual([]);
  });

  test('accepts an external list (used by the CLI to group a snapshot of the store)', () => {
    const s = new StrategyStore({ inMemory: true });
    s.publish({
      name: 'a', author: 'x', code: 'a', methodology: { source: 'h' },
      version: 1, prevHash: '0'.repeat(64), description: 'a',
    });
    const a1 = s.getLatest('a')!;
    s.publish({
      name: 'a', author: 'x', code: 'b', methodology: { source: 'h' },
      version: 2, prevHash: computeStrategyPrevHash(a1), description: 'b',
    });
    // External list: only v1 should appear as the latest of that name.
    const latests = s.latestPerName([a1]);
    expect(latests).toHaveLength(1);
    expect(latests[0]?.version).toBe(1);
  });
});
