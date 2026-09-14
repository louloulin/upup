/**
 * Minimal HS256 JWT sign/verify/decode utilities.
 *
 * Used for short-lived bridge session tokens. We do NOT need to support
 * the full JWT spec — only:
 *   - decode payload (no signature check) for inspection
 *   - sign HS256 with a shared secret
 *   - verify HS256 with constant-time compare
 *
 * Tokens are NOT intended for cross-org trust — the shared secret is
 * derived from the bridge auth token. For long-lived OAuth/JWT flows
 * use a proper JWT library.
 *
 * Format: `header.payload.signature` where each segment is base64url
 * (no padding) per RFC 7519.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER_HS256 = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export interface JwtPayload {
  /** Subject (e.g. clientId, userId, deviceFingerprint). */
  sub?: string;
  /** Issued-at (Unix seconds). */
  iat?: number;
  /** Expiry (Unix seconds). */
  exp?: number;
  /** Not-before (Unix seconds). */
  nbf?: number;
  /** Issuer. */
  iss?: string;
  /** Audience. */
  aud?: string;
  /** JWT ID. */
  jti?: string;
  /** Additional custom claims. */
  [key: string]: unknown;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: JwtPayload;
  signature: string;
  raw: { header: string; payload: string; signature: string };
}

/** Encode a Buffer/string as base64url (no padding). */
export function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

/** Decode a base64url string to UTF-8. Throws on invalid input. */
export function base64urlDecode(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('base64urlDecode: input must be a string');
  }
  return Buffer.from(input, 'base64url').toString('utf8');
}

/**
 * Decode a JWT's three segments without verifying the signature.
 * Returns null if the token is malformed (not 3 segments, bad base64url,
 * or non-object JSON payload).
 */
export function decodeJwt(token: string): DecodedJwt | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerSeg, payloadSeg, signatureSeg] = parts;
  if (!headerSeg || !payloadSeg || !signatureSeg) return null;

  let header: Record<string, unknown>;
  let payload: JwtPayload;
  try {
    header = JSON.parse(base64urlDecode(headerSeg));
    payload = JSON.parse(base64urlDecode(payloadSeg));
  } catch {
    return null;
  }
  if (!header || typeof header !== 'object') return null;
  if (!payload || typeof payload !== 'object') return null;

  return {
    header,
    payload,
    signature: signatureSeg,
    raw: { header: headerSeg, payload: payloadSeg, signature: signatureSeg },
  };
}

/**
 * Decode the `exp` claim from a JWT without verifying the signature.
 * Returns the `exp` value in Unix seconds, or null if absent/unparseable.
 */
export function decodeJwtExpiry(token: string): number | null {
  const decoded = decodeJwt(token);
  if (decoded && typeof decoded.payload.exp === 'number' && Number.isFinite(decoded.payload.exp)) {
    return decoded.payload.exp;
  }
  return null;
}

/** Check whether a JWT is expired (no signature check). */
export function isJwtExpired(token: string, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  const exp = decodeJwtExpiry(token);
  if (exp === null) return false; // no exp claim → treat as not expired
  return nowSec >= exp;
}

/**
 * Sign a payload as a JWT with HS256.
 * `iat` is auto-set to now() (Unix seconds) if not provided.
 * `exp` is auto-set to now() + ttlSec if not provided and ttlSec is given.
 */
export function signJwt(payload: JwtPayload, secret: string, opts: { ttlSec?: number } = {}): string {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('signJwt: secret must be a non-empty string');
  }
  const fullPayload: JwtPayload = { ...payload };
  if (fullPayload.iat === undefined) fullPayload.iat = Math.floor(Date.now() / 1000);
  if (fullPayload.exp === undefined && typeof opts.ttlSec === 'number') {
    fullPayload.exp = fullPayload.iat + opts.ttlSec;
  }
  const payloadSeg = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${HEADER_HS256}.${payloadSeg}`;
  const sig = createHmac('sha256', secret).update(signingInput, 'utf8').digest('base64url');
  return `${signingInput}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'not-yet-valid' };

/**
 * Verify a JWT signed with HS256. Uses timingSafeEqual for the signature
 * comparison. Optionally checks `exp` and `nbf` claims.
 */
export function verifyJwt(
  token: string,
  secret: string,
  opts: { nowSec?: number; checkExp?: boolean; checkNbf?: boolean } = {},
): VerifyResult {
  const decoded = decodeJwt(token);
  if (!decoded) return { ok: false, reason: 'malformed' };

  // Re-derive signature with the given secret
  const signingInput = `${decoded.raw.header}.${decoded.raw.payload}`;
  const expected = createHmac('sha256', secret).update(signingInput, 'utf8').digest('base64url');
  const given = decoded.signature;
  if (given.length !== expected.length) {
    return { ok: false, reason: 'bad-signature' };
  }
  let equal = false;
  try {
    equal = timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
  if (!equal) return { ok: false, reason: 'bad-signature' };

  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (opts.checkExp !== false) {
    if (typeof decoded.payload.exp === 'number' && now >= decoded.payload.exp) {
      return { ok: false, reason: 'expired' };
    }
  }
  if (opts.checkNbf !== false) {
    if (typeof decoded.payload.nbf === 'number' && now < decoded.payload.nbf) {
      return { ok: false, reason: 'not-yet-valid' };
    }
  }
  return { ok: true, payload: decoded.payload };
}
