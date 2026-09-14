/**
 * Audit Chain Tests (Gap C2 / D-CTG-7)
 *
 * Coverage:
 *  - generate key pair + sign / verify round-trip
 *  - append creates prevHash-chained records
 *  - verify passes on intact chain
 *  - tampering (any field, signature, or order) breaks verification
 *  - persistence: append + reload from disk
 *  - getByIntent returns most recent match
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { AuditChain, type AuditRecord } from './audit-signing.js';
import { canonicalJson } from './dossier.js';

const TMP = join(tmpdir(), `upup-audit-test-${process.pid}-${Date.now()}`);
const FILE = join(TMP, 'audit-chain.jsonl');
const KEY = join(TMP, 'audit-key.json');

let fixedNow = 1_000_000;
function newChain(): AuditChain {
  return new AuditChain({ filePath: FILE, keyPath: KEY, inMemory: false, now: () => fixedNow });
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  fixedNow = 1_000_000;
});
afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe('AuditChain — append + sign', () => {
  test('first record uses genesis prevHash', () => {
    const c = newChain();
    const r = c.append({
      intentId: 'i1',
      author: 'user',
      action: 'BUY',
      ticker: 'NVDA',
      evidenceRefs: ['1'],
    });
    expect(r.prevHash).toBe('0'.repeat(64));
    expect(r.signature).toBeTruthy();
    expect(r.payload).toBe(canonicalJson({
      id: r.id,
      intentId: 'i1',
      ts: 1_000_000,
      author: 'user',
      ticker: 'NVDA',
      action: 'BUY',
      evidenceRefs: ['1'],
      agentChain: [],
    }));
  });

  test('second record prevHash = sha256(canonical of first)', () => {
    const c = newChain();
    const r1 = c.append({ intentId: 'i1', author: 'user', action: 'BUY', ticker: 'AAPL' });
    const r2 = c.append({ intentId: 'i2', author: 'agent', action: 'SELL', ticker: 'AAPL' });
    // expected prevHash for r2
    const expectedPrev = createHash('sha256').update(canonicalJson(r1)).digest('hex');
    expect(r2.prevHash).toBe(expectedPrev);
  });

  test('list + getByIntent work', () => {
    const c = newChain();
    c.append({ intentId: 'i1', author: 'user', action: 'BUY', ticker: 'NVDA' });
    c.append({ intentId: 'i1', author: 'user', action: 'BUY', ticker: 'NVDA' }); // duplicate intent
    c.append({ intentId: 'i2', author: 'agent', action: 'HOLD' });
    expect(c.list()).toHaveLength(3);
    const got = c.getByIntent('i1');
    expect(got).toBeDefined();
    expect(got!.action).toBe('BUY');
  });
});

describe('AuditChain — verify', () => {
  test('intact chain verifies', () => {
    const c = newChain();
    c.append({ intentId: 'i1', author: 'user', action: 'BUY', ticker: 'NVDA' });
    c.append({ intentId: 'i2', author: 'agent', action: 'SELL', ticker: 'NVDA' });
    c.append({ intentId: 'i3', author: 'user', action: 'COVER', ticker: 'NVDA' });
    const r = c.verify(c.getPublicKey());
    expect(r.valid).toBe(true);
    expect(r.brokenAt).toBeUndefined();
  });

  test('tampering with action field breaks signature', () => {
    const c = newChain();
    c.append({ intentId: 'i1', author: 'user', action: 'BUY', ticker: 'NVDA' });
    // Tamper after the fact
    const recs = c.list();
    recs[0]!.action = 'SELL';
    // Bypass list() safety: write directly to internal array
    (c as any).records[0].action = 'SELL';
    const r = c.verify(c.getPublicKey());
    expect(r.valid).toBe(false);
    expect(r.brokenAt).toBe(0);
    expect(r.reason).toBe('signature-mismatch');
  });

  test('deleting a record breaks prevHash chain', () => {
    const c = newChain();
    c.append({ intentId: 'i1', author: 'user', action: 'BUY' });
    c.append({ intentId: 'i2', author: 'user', action: 'BUY' });
    c.append({ intentId: 'i3', author: 'user', action: 'BUY' });
    (c as any).records.splice(1, 1); // remove middle
    const r = c.verify(c.getPublicKey());
    expect(r.valid).toBe(false);
    expect(r.brokenAt).toBe(1);
    expect(r.reason).toBe('prevHash-mismatch');
  });

  test('reordering records breaks chain', () => {
    const c = newChain();
    c.append({ intentId: 'i1', author: 'user', action: 'BUY' });
    c.append({ intentId: 'i2', author: 'user', action: 'SELL' });
    const [a, b] = (c as any).records;
    (c as any).records[0] = b;
    (c as any).records[1] = a;
    const r = c.verify(c.getPublicKey());
    expect(r.valid).toBe(false);
  });
});

describe('AuditChain — persistence', () => {
  test('reload from disk restores chain', () => {
    const c1 = newChain();
    c1.append({ intentId: 'i1', author: 'user', action: 'BUY' });
    c1.append({ intentId: 'i2', author: 'user', action: 'SELL' });
    const c2 = newChain();
    expect(c2.list()).toHaveLength(2);
    expect(c2.list()[0]!.intentId).toBe('i1');
    const r = c2.verify(c2.getPublicKey());
    expect(r.valid).toBe(true);
  });
});

// generateKeyPair is the test helper. If we don't have it, expose one.
// end

// ---------------------------------------------------------------------------
// P3.b.2 + P3.b.3 — append-only API surface regression (B.5)
// ---------------------------------------------------------------------------

describe('AuditChain — append-only API surface (P3.b.2 / P3.b.3)', () => {
  test('public API does not expose edit / delete / overwrite methods', () => {
    // P3.b.2 威胁模型 B.5: 公开接口必须 append-only, 不允许篡改/删除/重写。
    // 这一条是 C2 审计链完整性的"架构层"防线, 与签名/链式 hash 互补。
    const c = newChain();
    const api = new Set(Object.getOwnPropertyNames(Object.getPrototypeOf(c)));
    for (const forbidden of ['edit', 'delete', 'remove', 'update', 'overwrite', 'rewrite']) {
      expect(api.has(forbidden)).toBe(false);
    }
    // 白名单: 仅 append / list / getByIntent / verify / getPublicKey
    expect(api.has('append')).toBe(true);
    expect(api.has('list')).toBe(true);
    expect(api.has('getByIntent')).toBe(true);
    expect(api.has('verify')).toBe(true);
    expect(api.has('getPublicKey')).toBe(true);
  });

  test('repeated verify on intact chain returns valid=true', () => {
    // P3.b.3 回归: 完整链路在多次 verify 下保持稳定 (idempotency)。
    const c = newChain();
    c.append({ intentId: 'i1', author: 'user', action: 'BUY' });
    c.append({ intentId: 'i2', author: 'user', action: 'SELL' });
    c.append({ intentId: 'i3', author: 'user', action: 'HOLD' });
    const pub = c.getPublicKey();
    expect(c.verify(pub).valid).toBe(true);
    expect(c.verify(pub).valid).toBe(true);
    expect(c.verify(pub).valid).toBe(true);
  });

  test('key rotation: inMemory chains with distinct keys fail cross-verify', () => {
    // P3.b.3 回归: 私钥轮换后旧签名全部失效。用 inMemory 模式生成两条独立 chain,
    // 用 keyB 的公钥验 keyA 签的链, 应当失败。
    // 之所以不用 newChain(): 它从 KEY 文件 load, 两条 chain 会共享同一 key,
    // 测不出"轮换失效"的语义。
    const tmpA = '/tmp/audit-p3b3-rot-a.jsonl';
    const tmpB = '/tmp/audit-p3b3-rot-b.jsonl';
    const cA = new AuditChain({
      filePath: tmpA, keyPath: '/tmp/audit-p3b3-rot-a.key',
      inMemory: true, now: () => fixedNow,
    });
    cA.append({ intentId: 'i1', author: 'user', action: 'BUY' });
    const cB = new AuditChain({
      filePath: tmpB, keyPath: '/tmp/audit-p3b3-rot-b.key',
      inMemory: true, now: () => fixedNow,
    });
    // cA 用 keyA 签了 1 条; cB 拿 keyB 的公钥来验, 应当失败
    const r = cA.verify(cB.getPublicKey());
    expect(r.valid).toBe(false);
  });
});
