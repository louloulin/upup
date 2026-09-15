import { describe, test, expect } from 'bun:test';
import {
  base64urlEncode,
  base64urlDecode,
  decodeJwt,
  decodeJwtExpiry,
  isJwtExpired,
  signJwt,
  verifyJwt,
  type JwtPayload,
} from './jwtUtils';

const SECRET = 'super-secret-test-key-32-bytes-min';

describe('base64urlEncode / base64urlDecode', () => {
  test('round-trips ASCII', () => {
    const original = 'hello world';
    const encoded = base64urlEncode(original);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(base64urlDecode(encoded)).toBe(original);
  });

  test('handles unicode', () => {
    const original = '你好世界 🌍';
    expect(base64urlDecode(base64urlEncode(original))).toBe(original);
  });

  test('handles empty string', () => {
    expect(base64urlEncode('')).toBe('');
    expect(base64urlDecode('')).toBe('');
  });

  test('decodes Buffer input', () => {
    const buf = Buffer.from('hello', 'utf8');
    const encoded = base64urlEncode(buf);
    expect(base64urlDecode(encoded)).toBe('hello');
  });

  test('throws on non-string input to decode', () => {
    expect(() => base64urlDecode(null as unknown as string)).toThrow();
    expect(() => base64urlDecode(123 as unknown as string)).toThrow();
  });
});

describe('decodeJwt', () => {
  const validPayload: JwtPayload = { sub: 'user-1', iat: 1_700_000_000, exp: 1_700_000_300 };
  const validToken = signJwt(validPayload, SECRET);

  test('returns parsed header + payload + signature for a valid token', () => {
    const decoded = decodeJwt(validToken);
    expect(decoded).not.toBeNull();
    expect(decoded!.header.alg).toBe('HS256');
    expect(decoded!.header.typ).toBe('JWT');
    expect(decoded!.payload.sub).toBe('user-1');
    expect(decoded!.payload.iat).toBe(1_700_000_000);
    expect(decoded!.payload.exp).toBe(1_700_000_300);
    expect(typeof decoded!.signature).toBe('string');
    expect(decoded!.signature.length).toBeGreaterThan(0);
  });

  test('returns null for null/non-string input', () => {
    expect(decodeJwt(null as unknown as string)).toBeNull();
    expect(decodeJwt(undefined as unknown as string)).toBeNull();
    expect(decodeJwt(123 as unknown as string)).toBeNull();
  });

  test('returns null for non-3-segment tokens', () => {
    expect(decodeJwt('abc')).toBeNull();
    expect(decodeJwt('a.b')).toBeNull();
    expect(decodeJwt('a.b.c.d')).toBeNull();
  });

  test('returns null for empty segments', () => {
    expect(decodeJwt('..sig')).toBeNull();
    expect(decodeJwt('hdr..sig')).toBeNull();
  });

  test('returns null for invalid base64url in payload', () => {
    // '!!!' is not valid base64url
    expect(decodeJwt('hdr.!!!.sig')).toBeNull();
  });

  test('returns null for non-JSON payload', () => {
    const bad = base64urlEncode('not json{') + '.sig';
    const headerSeg = base64urlEncode(JSON.stringify({ alg: 'HS256' }));
    expect(decodeJwt(`${headerSeg}.${bad}.sig`)).toBeNull();
  });
});

describe('decodeJwtExpiry / isJwtExpired', () => {
  test('decodeJwtExpiry returns the exp claim', () => {
    const token = signJwt({ sub: 'a', iat: 100, exp: 200 }, SECRET);
    expect(decodeJwtExpiry(token)).toBe(200);
  });

  test('decodeJwtExpiry returns null when no exp claim', () => {
    const token = signJwt({ sub: 'a', iat: 100 }, SECRET);
    expect(decodeJwtExpiry(token)).toBeNull();
  });

  test('decodeJwtExpiry returns null for malformed token', () => {
    expect(decodeJwtExpiry('not-a-jwt')).toBeNull();
  });

  test('isJwtExpired compares against now', () => {
    const expiredToken = signJwt({ sub: 'a', iat: 100, exp: 200 }, SECRET);
    expect(isJwtExpired(expiredToken, 199)).toBe(false);
    expect(isJwtExpired(expiredToken, 200)).toBe(true);
    expect(isJwtExpired(expiredToken, 201)).toBe(true);
  });

  test('isJwtExpired returns false for token without exp claim', () => {
    const token = signJwt({ sub: 'a' }, SECRET);
    expect(isJwtExpired(token, 9_999_999_999)).toBe(false);
  });
});

describe('signJwt', () => {
  test('produces a 3-segment base64url token', () => {
    const token = signJwt({ sub: 'a' }, SECRET);
    expect(token.split('.').length).toBe(3);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test('auto-sets iat if not provided', () => {
    const token = signJwt({ sub: 'a' }, SECRET);
    const decoded = decodeJwt(token)!;
    expect(typeof decoded.payload.iat).toBe('number');
  });

  test('auto-sets exp from ttlSec', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: 'a' }, SECRET, { ttlSec: 60 });
    const after = Math.floor(Date.now() / 1000);
    const decoded = decodeJwt(token)!;
    expect(decoded.payload.exp).toBeGreaterThanOrEqual(before + 60);
    expect(decoded.payload.exp).toBeLessThanOrEqual(after + 60);
  });

  test('does not override explicitly-set iat and exp', () => {
    const token = signJwt(
      { sub: 'a', iat: 100, exp: 200 },
      SECRET,
      { ttlSec: 9999 }, // should be ignored
    );
    const decoded = decodeJwt(token)!;
    expect(decoded.payload.iat).toBe(100);
    expect(decoded.payload.exp).toBe(200);
  });

  test('preserves custom claims', () => {
    const token = signJwt(
      { sub: 'a', role: 'admin', scope: ['read', 'write'] },
      SECRET,
    );
    const decoded = decodeJwt(token)!;
    expect(decoded.payload.role).toBe('admin');
    expect(decoded.payload.scope).toEqual(['read', 'write']);
  });

  test('throws on empty secret', () => {
    expect(() => signJwt({ sub: 'a' }, '')).toThrow(/non-empty string/);
  });
});

describe('verifyJwt', () => {
  test('verifies a valid signed token', () => {
    const token = signJwt({ sub: 'user-1' }, SECRET, { ttlSec: 60 });
    const result = verifyJwt(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe('user-1');
    }
  });

  test('rejects with bad signature when secret differs', () => {
    const token = signJwt({ sub: 'a' }, SECRET);
    const result = verifyJwt(token, 'wrong-secret');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-signature');
  });

  test('rejects malformed token', () => {
    const result = verifyJwt('not-a-jwt', SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  test('rejects expired token by default (checkExp=true)', () => {
    const expired = signJwt({ sub: 'a', iat: 100, exp: 200 }, SECRET);
    const result = verifyJwt(expired, SECRET, { nowSec: 300 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  test('accepts expired token when checkExp=false', () => {
    const expired = signJwt({ sub: 'a', iat: 100, exp: 200 }, SECRET);
    const result = verifyJwt(expired, SECRET, { nowSec: 300, checkExp: false });
    expect(result.ok).toBe(true);
  });

  test('rejects nbf in the future (checkNbf=true)', () => {
    const future = signJwt({ sub: 'a', iat: 100, nbf: 500 }, SECRET);
    const result = verifyJwt(future, SECRET, { nowSec: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-yet-valid');
  });

  test('accepts nbf token when checkNbf=false', () => {
    const future = signJwt({ sub: 'a', iat: 100, nbf: 500 }, SECRET);
    const result = verifyJwt(future, SECRET, { nowSec: 100, checkNbf: false });
    expect(result.ok).toBe(true);
  });

  test('rejects signature length mismatch', () => {
    const token = signJwt({ sub: 'a' }, SECRET);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.AAAA`;
    const result = verifyJwt(tampered, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-signature');
  });

  test('round-trips custom claims', () => {
    const token = signJwt(
      { sub: 'a', role: 'admin', level: 5, tags: ['x', 'y'] },
      SECRET,
    );
    const result = verifyJwt(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.role).toBe('admin');
      expect(result.payload.level).toBe(5);
      expect(result.payload.tags).toEqual(['x', 'y']);
    }
  });
});
