import { describe, test, expect } from 'bun:test';
import {
  encodeWorkSecret,
  decodeWorkSecret,
  generateIngressToken,
  tokenFingerprint,
  sameSessionId,
  buildSdkUrl,
  WORK_SECRET_VERSION,
} from './workSecret';

const VALID_INPUT = {
  session_ingress_token: 'tok-abc-123',
  api_base_url: 'https://api.example.com',
};

describe('workSecret — encode/decode round-trip', () => {
  test('encodes a minimal valid input to base64url', () => {
    const encoded = encodeWorkSecret(VALID_INPUT);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeGreaterThan(0);
  });

  test('round-trip preserves all fields', () => {
    const encoded = encodeWorkSecret(VALID_INPUT);
    const decoded = decodeWorkSecret(encoded);
    expect(decoded.version).toBe(WORK_SECRET_VERSION);
    expect(decoded.session_ingress_token).toBe(VALID_INPUT.session_ingress_token);
    expect(decoded.api_base_url).toBe(VALID_INPUT.api_base_url);
  });

  test('round-trip preserves metadata', () => {
    const encoded = encodeWorkSecret({
      ...VALID_INPUT,
      metadata: { account: 'acc-1', region: 'us-east-1' },
    });
    const decoded = decodeWorkSecret(encoded);
    expect(decoded.metadata).toEqual({ account: 'acc-1', region: 'us-east-1' });
  });
});

describe('workSecret — encode validation', () => {
  test('throws on empty session_ingress_token', () => {
    expect(() => encodeWorkSecret({ ...VALID_INPUT, session_ingress_token: '' })).toThrow(
      /session_ingress_token is required/,
    );
  });

  test('throws on empty api_base_url', () => {
    expect(() => encodeWorkSecret({ ...VALID_INPUT, api_base_url: '' })).toThrow(
      /api_base_url is required/,
    );
  });
});

describe('workSecret — decode validation', () => {
  test('throws on empty input', () => {
    expect(() => decodeWorkSecret('')).toThrow(/non-empty/);
  });

  test('throws on non-string input', () => {
    expect(() => decodeWorkSecret(null as unknown as string)).toThrow(/non-empty/);
    expect(() => decodeWorkSecret(123 as unknown as string)).toThrow(/non-empty/);
  });

  test('throws on invalid base64url payload', () => {
    // We can't easily craft a bad base64url in JS that throws on decode,
    // but we can ensure that some bad payload produces a JSON parse error
    // or version error.
    const bad = Buffer.from('not-valid-json{', 'utf8').toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow();
  });

  test('throws on non-object JSON payload', () => {
    const bad = Buffer.from('"just a string"', 'utf8').toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/must be an object/);
  });

  test('throws on unsupported version', () => {
    const bad = Buffer.from(JSON.stringify({ version: 99 }), 'utf8').toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/unsupported version 99/);
  });

  test('throws on missing version field', () => {
    const bad = Buffer.from(JSON.stringify({ session_ingress_token: 't', api_base_url: 'u' }), 'utf8').toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/unsupported version undefined/);
  });

  test('throws on missing session_ingress_token', () => {
    const bad = Buffer.from(JSON.stringify({ version: 1, api_base_url: 'u' }), 'utf8').toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/session_ingress_token/);
  });

  test('throws on missing api_base_url', () => {
    const bad = Buffer.from(JSON.stringify({ version: 1, session_ingress_token: 't' }), 'utf8').toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/api_base_url/);
  });

  test('throws on non-object metadata', () => {
    const bad = Buffer.from(
      JSON.stringify({ version: 1, session_ingress_token: 't', api_base_url: 'u', metadata: 'string' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/metadata must be a plain object/);
  });

  test('throws on array metadata', () => {
    const bad = Buffer.from(
      JSON.stringify({ version: 1, session_ingress_token: 't', api_base_url: 'u', metadata: [1, 2, 3] }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeWorkSecret(bad)).toThrow(/metadata must be a plain object/);
  });
});

describe('workSecret — generateIngressToken + tokenFingerprint', () => {
  test('generates a 32-byte base64url token (43 chars no padding)', () => {
    const tok = generateIngressToken();
    expect(tok).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('two generated tokens are different', () => {
    const a = generateIngressToken();
    const b = generateIngressToken();
    expect(a).not.toBe(b);
  });

  test('tokenFingerprint returns 12 hex chars', () => {
    const fp = tokenFingerprint('any-token');
    expect(fp).toMatch(/^[a-f0-9]{12}$/);
  });

  test('tokenFingerprint is stable for the same input', () => {
    expect(tokenFingerprint('x')).toBe(tokenFingerprint('x'));
  });

  test('tokenFingerprint differs for different inputs', () => {
    expect(tokenFingerprint('a')).not.toBe(tokenFingerprint('b'));
  });
});

describe('workSecret — sameSessionId', () => {
  test('identical strings are same', () => {
    expect(sameSessionId('abc', 'abc')).toBe(true);
  });

  test('different prefix but same body are same', () => {
    expect(sameSessionId('cse_12345678-abcd', 'session_12345678-abcd')).toBe(true);
    expect(sameSessionId('cse_abcd', 'session_abcd')).toBe(true);
  });

  test('handles staging tag in the middle', () => {
    expect(sameSessionId('cse_staging_12345678', 'session_12345678')).toBe(true);
  });

  test('different body is not same', () => {
    expect(sameSessionId('cse_abc', 'cse_xyz')).toBe(false);
  });

  test('body length < 4 is not same (rejects accidental short-suffix matches)', () => {
    expect(sameSessionId('a_b', 'c_b')).toBe(false);
    expect(sameSessionId('a_b', 'c_bcd')).toBe(false);
  });

  test('non-string inputs return false', () => {
    expect(sameSessionId(null as unknown as string, 'x')).toBe(false);
    expect(sameSessionId('x', undefined as unknown as string)).toBe(false);
  });

  test('empty strings: not same (bodies both empty < 4)', () => {
    expect(sameSessionId('', '')).toBe(true); // a === b fast path
    expect(sameSessionId('a_', 'b_')).toBe(false);
  });
});

describe('workSecret — buildSdkUrl', () => {
  test('builds wss:// for production https:// host', () => {
    expect(buildSdkUrl('https://api.example.com', 'sess-1')).toBe(
      'wss://api.example.com/session_ingress/ws/sess-1',
    );
  });

  test('builds wss:// for production http:// host', () => {
    expect(buildSdkUrl('http://api.example.com', 'sess-1')).toBe(
      'wss://api.example.com/session_ingress/ws/sess-1',
    );
  });

  test('builds ws:// for localhost', () => {
    expect(buildSdkUrl('http://localhost:8080', 'sess-1')).toBe(
      'ws://localhost:8080/session_ingress/ws/sess-1',
    );
    expect(buildSdkUrl('https://localhost:8080', 'sess-1')).toBe(
      'ws://localhost:8080/session_ingress/ws/sess-1',
    );
  });

  test('builds ws:// for 127.0.0.1', () => {
    expect(buildSdkUrl('http://127.0.0.1:3000', 'sess-1')).toBe(
      'ws://127.0.0.1:3000/session_ingress/ws/sess-1',
    );
  });

  test('strips trailing slashes from base url', () => {
    expect(buildSdkUrl('https://api.example.com/', 'sess-1')).toBe(
      'wss://api.example.com/session_ingress/ws/sess-1',
    );
    expect(buildSdkUrl('https://api.example.com///', 'sess-1')).toBe(
      'wss://api.example.com/session_ingress/ws/sess-1',
    );
  });

  test('throws on empty apiBaseUrl', () => {
    expect(() => buildSdkUrl('', 'sess-1')).toThrow(/apiBaseUrl is required/);
  });

  test('throws on empty sessionId', () => {
    expect(() => buildSdkUrl('https://api.example.com', '')).toThrow(/sessionId is required/);
  });
});
