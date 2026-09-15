import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeAuth } from './auth';

let tmpDir: string;
let auditPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bridge-auth-'));
  auditPath = join(tmpDir, 'audit.log');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('BridgeAuth', () => {
  test('issueToken produces bearer string with verifiable subject', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath });
    const t = auth.issueToken('client-1');
    expect(t.startsWith('bridge.')).toBe(true);
    const verified = auth.verifyToken(t);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.clientId).toBe('client-1');
      expect(verified.expiresAt).toBeGreaterThan(Date.now());
    }
  });

  test('verifyToken rejects garbage', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath });
    expect(auth.verifyToken('nope').ok).toBe(false);
    expect(auth.verifyToken('a.b.c').ok).toBe(false);
  });

  test('verifyToken rejects wrong secret', () => {
    const a = new BridgeAuth({ secret: 'a', auditPath });
    const b = new BridgeAuth({ secret: 'b', auditPath });
    const t = a.issueToken('c1');
    expect(b.verifyToken(t).ok).toBe(false);
  });

  test('rateLimit allows up to max in window then blocks', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath, rateLimit: { windowMs: 60_000, max: 3 } });
    const ip = '127.0.0.1';
    expect(auth.rateLimit(ip).ok).toBe(true);
    expect(auth.rateLimit(ip).ok).toBe(true);
    expect(auth.rateLimit(ip).ok).toBe(true);
    const r = auth.rateLimit(ip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBeGreaterThan(0);
  });

  test('rateLimit buckets are per-IP', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath, rateLimit: { windowMs: 60_000, max: 1 } });
    expect(auth.rateLimit('1.1.1.1').ok).toBe(true);
    expect(auth.rateLimit('2.2.2.2').ok).toBe(true);
    expect(auth.rateLimit('1.1.1.1').ok).toBe(false);
  });

  test('audit log appends auth events', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath });
    auth.issueToken('client-x');
    auth.verifyToken('bad-token');
    const text = readFileSync(auditPath, 'utf8');
    expect(text).toContain('issue');
    expect(text).toContain('client-x');
    expect(text).toContain('verify-fail');
  });
});
