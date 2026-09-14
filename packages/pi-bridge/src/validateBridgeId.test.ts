import { describe, test, expect } from 'bun:test';
import { validateBridgeId, isValidBridgeId } from './validateBridgeId.js';

describe('validateBridgeId', () => {
  test('accepts alphanumeric IDs', () => {
    expect(validateBridgeId('abc123', 'sessionId')).toBe('abc123');
    expect(validateBridgeId('XYZ789', 'envId')).toBe('XYZ789');
  });

  test('accepts IDs with hyphens and underscores', () => {
    expect(validateBridgeId('session-abc-123', 'sid')).toBe('session-abc-123');
    expect(validateBridgeId('env_42_x', 'eid')).toBe('env_42_x');
    expect(validateBridgeId('a_b-c_d', 'id')).toBe('a_b-c_d');
  });

  test('returns the input on success', () => {
    expect(validateBridgeId('valid', 'label')).toBe('valid');
  });

  test('rejects empty string', () => {
    expect(() => validateBridgeId('', 'sessionId')).toThrow(/non-empty/);
  });

  test('rejects path traversal sequences', () => {
    expect(() => validateBridgeId('../admin', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('a/../b', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('..', 'id')).toThrow(/unsafe/);
  });

  test('rejects slashes and dots', () => {
    expect(() => validateBridgeId('a/b', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('a.b', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('a\\b', 'id')).toThrow(/unsafe/);
  });

  test('rejects query strings and fragments', () => {
    expect(() => validateBridgeId('id?foo=bar', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id#frag', 'id')).toThrow(/unsafe/);
  });

  test('rejects whitespace and control chars', () => {
    expect(() => validateBridgeId('id with space', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id\tnewline', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id\nline', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id\0null', 'id')).toThrow(/unsafe/);
  });

  test('rejects shell metacharacters', () => {
    expect(() => validateBridgeId('id;rm', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id&bg', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id|pipe', 'id')).toThrow(/unsafe/);
    expect(() => validateBridgeId('id$var', 'id')).toThrow(/unsafe/);
  });

  test('rejects IDs exceeding max length', () => {
    const long = 'a'.repeat(257);
    expect(() => validateBridgeId(long, 'id')).toThrow(/exceeds max/);
  });

  test('accepts IDs exactly at max length', () => {
    const atLimit = 'a'.repeat(256);
    expect(validateBridgeId(atLimit, 'id')).toBe(atLimit);
  });

  test('rejects non-string input', () => {
    expect(() => validateBridgeId(null, 'id')).toThrow(/must be a string/);
    expect(() => validateBridgeId(undefined, 'id')).toThrow(/must be a string/);
    expect(() => validateBridgeId(42, 'id')).toThrow(/must be a string/);
    expect(() => validateBridgeId({}, 'id')).toThrow(/must be a string/);
    expect(() => validateBridgeId([], 'id')).toThrow(/must be a string/);
  });

  test('error message includes the label', () => {
    expect(() => validateBridgeId('', 'sessionId')).toThrow(/sessionId/);
    expect(() => validateBridgeId('../bad', 'environmentId')).toThrow(/environmentId/);
  });
});

describe('isValidBridgeId (non-throwing)', () => {
  test('returns true for valid IDs', () => {
    expect(isValidBridgeId('abc')).toBe(true);
    expect(isValidBridgeId('a-b_c')).toBe(true);
  });

  test('returns false for invalid IDs', () => {
    expect(isValidBridgeId('')).toBe(false);
    expect(isValidBridgeId('../bad')).toBe(false);
    expect(isValidBridgeId('a/b')).toBe(false);
    expect(isValidBridgeId('a.b')).toBe(false);
    expect(isValidBridgeId(null)).toBe(false);
    expect(isValidBridgeId(undefined)).toBe(false);
    expect(isValidBridgeId(42)).toBe(false);
    expect(isValidBridgeId('a'.repeat(257))).toBe(false);
  });

  test('boundary: 256 chars valid, 257 invalid', () => {
    expect(isValidBridgeId('a'.repeat(256))).toBe(true);
    expect(isValidBridgeId('a'.repeat(257))).toBe(false);
  });
});
