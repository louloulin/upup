/**
 * Strategy Store tests (P2.a.2)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StrategyStore, type StrategyRecordInput } from './strategy-store.js';

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
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier.js');
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
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier.js');
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
    const { canonicalJson } = require('./dossier.js') as typeof import('./dossier.js');
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
