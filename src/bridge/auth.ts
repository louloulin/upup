import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync } from 'node:fs';

export interface BridgeAuthConfig {
  secret: string;
  auditPath: string;
  tokenTtlMs?: number;
  rateLimit?: { windowMs: number; max: number };
}

export type VerifyResult =
  | { ok: true; clientId: string; expiresAt: number }
  | { ok: false; reason: 'malformed' | 'expired' | 'bad-signature' };

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

interface Bucket {
  count: number;
  resetAt: number;
}

export class BridgeAuth {
  private readonly secret: string;
  private readonly auditPath: string;
  private readonly tokenTtlMs: number;
  private readonly rate: { windowMs: number; max: number };
  private readonly buckets = new Map<string, Bucket>();

  constructor(cfg: BridgeAuthConfig) {
    this.secret = cfg.secret;
    this.auditPath = cfg.auditPath;
    this.tokenTtlMs = cfg.tokenTtlMs ?? 5 * 60 * 1000;
    this.rate = cfg.rateLimit ?? { windowMs: 60_000, max: 60 };
  }

  issueToken(clientId: string): string {
    const expiresAt = Date.now() + this.tokenTtlMs;
    const payload = Buffer.from(
      JSON.stringify({ c: clientId, e: expiresAt, n: randomBytes(8).toString('hex') }),
    ).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    this.audit('issue', { clientId, expiresAt });
    return `bridge.${payload}.${sig}`;
  }

  verifyToken(token: string): VerifyResult {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'bridge') {
      this.audit('verify-fail', { reason: 'malformed' });
      return { ok: false, reason: 'malformed' };
    }
    const [, payload, sig] = parts;
    const expected = createHmac('sha256', this.secret).update(payload).digest('base64url');
    if (sig.length !== expected.length) {
      this.audit('verify-fail', { reason: 'bad-signature' });
      return { ok: false, reason: 'bad-signature' };
    }
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      this.audit('verify-fail', { reason: 'bad-signature' });
      return { ok: false, reason: 'bad-signature' };
    }
    let parsed: { c?: unknown; e?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      this.audit('verify-fail', { reason: 'malformed' });
      return { ok: false, reason: 'malformed' };
    }
    if (typeof parsed.c !== 'string' || typeof parsed.e !== 'number') {
      this.audit('verify-fail', { reason: 'malformed' });
      return { ok: false, reason: 'malformed' };
    }
    if (Date.now() > parsed.e) {
      this.audit('verify-fail', { reason: 'expired' });
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, clientId: parsed.c, expiresAt: parsed.e };
  }

  rateLimit(ip: string): RateLimitResult {
    const now = Date.now();
    let b = this.buckets.get(ip);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + this.rate.windowMs };
      this.buckets.set(ip, b);
    }
    b.count += 1;
    if (b.count > this.rate.max) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
    }
    return { ok: true };
  }

  private audit(event: string, data: Record<string, unknown>): void {
    const line = JSON.stringify({ t: new Date().toISOString(), event, ...data }) + '\n';
    try {
      appendFileSync(this.auditPath, line);
    } catch {
      // best-effort; never throw from audit
    }
  }
}
