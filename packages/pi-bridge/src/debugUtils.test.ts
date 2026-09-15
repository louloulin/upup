import { describe, test, expect } from 'bun:test';
import { redactSecrets, debugTruncate, debugBody, formatDuration } from './debugUtils';

describe('redactSecrets', () => {
  test('redacts long session_ingress_token with prefix/suffix preserved', () => {
    const input = `"session_ingress_token":"abcdefghijklmnopqrstuvwxyz123456"`;
    const result = redactSecrets(input);
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(result).toContain('abcd...3456');
  });

  test('redacts long access_token', () => {
    const input = `"access_token":"1234567890abcdef1234567890abcdef"`;
    const result = redactSecrets(input);
    expect(result).not.toContain('1234567890abcdef1234567890abcdef');
    expect(result).toContain('1234...cdef');
  });

  test('fully redacts short secret values', () => {
    const input = `"token":"short"`;
    expect(redactSecrets(input)).toBe(`"token":"[REDACTED]"`);
  });

  test('redacts multiple secret fields in one string', () => {
    const input = `{"token":"1234567890abcdef1234","password":"longpassword1234567890"}`;
    const result = redactSecrets(input);
    expect(result).not.toContain('1234567890abcdef1234');
    expect(result).not.toContain('longpassword1234567890');
  });

  test('does not touch non-secret fields', () => {
    const input = `{"name":"alice","count":42,"enabled":true}`;
    expect(redactSecrets(input)).toBe(input);
  });

  test('handles empty string', () => {
    expect(redactSecrets('')).toBe('');
  });

  test('handles non-secret JSON', () => {
    const input = `{"foo":"bar","baz":"qux"}`;
    expect(redactSecrets(input)).toBe(input);
  });

  test('preserves exact value boundary at 16 chars', () => {
    // 16 chars exactly → use prefix/suffix form
    const input = `"token":"1234567890123456"`;
    const result = redactSecrets(input);
    expect(result).toContain('1234...3456');
  });

  test('handles 15 chars → fully redacted', () => {
    const input = `"token":"123456789012345"`;
    expect(redactSecrets(input)).toBe(`"token":"[REDACTED]"`);
  });

  test('redacts trusted_device_token field', () => {
    const input = `"trusted_device_token":"abcdefghijklmnop1234567890"`;
    const result = redactSecrets(input);
    expect(result).not.toContain('abcdefghijklmnop1234567890');
    expect(result).toContain('abcd...7890');
  });
});

describe('debugTruncate', () => {
  test('returns short string unchanged', () => {
    expect(debugTruncate('hello', 100)).toBe('hello');
  });

  test('flattens newlines to \\n', () => {
    expect(debugTruncate('line1\nline2\r\nline3', 100)).toBe('line1\\nline2\\nline3');
  });

  test('truncates with ellipsis at limit', () => {
    const result = debugTruncate('a'.repeat(100), 10);
    expect(result).toBe('aaaaaaa...');
    expect(result.length).toBe(10);
  });

  test('respects custom limit', () => {
    const result = debugTruncate('a'.repeat(100), 5);
    expect(result).toBe('aa...');
  });

  test('limit 0 returns empty', () => {
    expect(debugTruncate('hello', 0)).toBe('');
  });

  test('limit 1 returns first char', () => {
    expect(debugTruncate('hello', 1)).toBe('h');
  });

  test('limit 2 returns first 2 chars (no room for ellipsis)', () => {
    expect(debugTruncate('hello', 2)).toBe('he');
  });

  test('limit 3 returns first 3 chars (no ellipsis — ellipsis itself is 3 chars)', () => {
    expect(debugTruncate('hello', 3)).toBe('hel');
  });

  test('limit 4 returns first 1 + ellipsis', () => {
    expect(debugTruncate('hello', 4)).toBe('h...');
  });

  test('default limit is 2000', () => {
    const short = 'x'.repeat(1000);
    expect(debugTruncate(short)).toBe(short);
    const long = 'y'.repeat(3000);
    const result = debugTruncate(long);
    expect(result.length).toBe(2000);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('debugBody', () => {
  test('passes through strings through redact+truncate', () => {
    const result = debugBody('hello\nworld', 100);
    expect(result).toBe('hello\\nworld');
  });

  test('JSON-stringifies objects, then redacts+truncates', () => {
    const result = debugBody({ name: 'alice', token: '1234567890123456' }, 1000);
    expect(result).toContain('"name":"alice"');
    expect(result).toContain('1234...3456');
  });

  test('handles null', () => {
    expect(debugBody(null)).toBe('null');
  });

  test('handles primitives', () => {
    expect(debugBody(42)).toBe('42');
    expect(debugBody(true)).toBe('true');
  });

  test('falls back on circular refs', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(debugBody(obj)).toBe('[unserializable]');
  });

  test('truncates long JSON output', () => {
    const big = { data: 'x'.repeat(5000) };
    const result = debugBody(big, 100);
    expect(result.length).toBe(100);
  });
});

describe('formatDuration', () => {
  test('formats sub-second as ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  test('formats 1-60s as seconds with decimal', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(59_000)).toBe('59.0s');
  });

  test('formats minutes+seconds', () => {
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(330_000)).toBe('5m 30s');
  });

  test('handles invalid input', () => {
    expect(formatDuration(NaN)).toBe('invalid');
    expect(formatDuration(-1)).toBe('invalid');
    expect(formatDuration(Infinity)).toBe('invalid');
  });
});
