import { describe, test, expect } from 'bun:test';
import {
  normalizeWebhook,
  sanitizeWebhookUrl,
  MAX_WEBHOOK_PAYLOAD_BYTES,
} from './webhookSanitizer';

describe('sanitizeWebhookUrl', () => {
  test('accepts http and https URLs unchanged (modulo userinfo strip)', () => {
    expect(sanitizeWebhookUrl('https://api.example.com/hook')).toBe('https://api.example.com/hook');
    expect(sanitizeWebhookUrl('http://localhost:3000/hook')).toBe('http://localhost:3000/hook');
  });

  test('strips userinfo (credentials)', () => {
    expect(sanitizeWebhookUrl('https://user:pass@api.example.com/hook')).toBe('https://api.example.com/hook');
    expect(sanitizeWebhookUrl('https://token@api.example.com/hook')).toBe('https://api.example.com/hook');
  });

  test('strips fragment', () => {
    expect(sanitizeWebhookUrl('https://api.example.com/hook#frag')).toBe('https://api.example.com/hook');
  });

  test('rejects non-http/https schemes', () => {
    expect(sanitizeWebhookUrl('ftp://example.com/file')).toBeNull();
    expect(sanitizeWebhookUrl('file:///etc/passwd')).toBeNull();
    expect(sanitizeWebhookUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeWebhookUrl('data:text/plain,foo')).toBeNull();
  });

  test('rejects malformed URLs', () => {
    expect(sanitizeWebhookUrl('not a url')).toBeNull();
    expect(sanitizeWebhookUrl('')).toBeNull();
    expect(sanitizeWebhookUrl('http://')).toBeNull();
  });

  test('rejects URLs exceeding 2048 chars', () => {
    const long = 'https://example.com/' + 'a'.repeat(2100);
    expect(sanitizeWebhookUrl(long)).toBeNull();
  });

  test('preserves query params (caller decides what is sensitive)', () => {
    expect(sanitizeWebhookUrl('https://api.example.com/hook?token=abc&page=1')).toBe(
      'https://api.example.com/hook?token=abc&page=1',
    );
  });
});

describe('normalizeWebhook', () => {
  test('returns null for invalid input', () => {
    expect(normalizeWebhook(null as unknown as Parameters<typeof normalizeWebhook>[0])).toBeNull();
    expect(normalizeWebhook(undefined as unknown as Parameters<typeof normalizeWebhook>[0])).toBeNull();
    expect(normalizeWebhook({} as Parameters<typeof normalizeWebhook>[0])).toBeNull();
  });

  test('returns null for missing event', () => {
    expect(normalizeWebhook({ event: '', payload: {} })).toBeNull();
  });

  test('returns null for event names exceeding 256 chars', () => {
    expect(normalizeWebhook({ event: 'x'.repeat(257), payload: {} })).toBeNull();
  });

  test('normalizes a minimal valid webhook', () => {
    const result = normalizeWebhook({ event: 'price_alert.fired', payload: { symbol: 'AAPL', price: 150 } });
    expect(result).not.toBeNull();
    expect(result!.event).toBe('price_alert.fired');
    expect(result!.summary).toBe('Webhook event: price_alert.fired');
    expect(result!.payload).toContain('"symbol":"AAPL"');
  });

  test('redacts secrets in payload', () => {
    const result = normalizeWebhook({
      event: 'auth.refresh',
      payload: { session_ingress_token: 'abcdefghijklmnop1234567890', user: 'alice' },
    });
    expect(result).not.toBeNull();
    expect(result!.payload).not.toContain('abcdefghijklmnop1234567890');
    expect(result!.payload).toContain('"user":"alice"');
  });

  test('preserves custom summary, truncated to 200 chars', () => {
    const long = 'x'.repeat(500);
    const result = normalizeWebhook({ event: 'a', summary: long, payload: {} });
    expect(result!.summary.length).toBeLessThanOrEqual(200);
  });

  test('accepts timestamp as a positive finite number', () => {
    const result = normalizeWebhook({ event: 'a', timestampMs: 1_700_000_000_000, payload: {} });
    expect(result!.timestampMs).toBe(1_700_000_000_000);
  });

  test('rejects negative or non-finite timestamps', () => {
    expect(normalizeWebhook({ event: 'a', timestampMs: -1, payload: {} })!.timestampMs).toBeUndefined();
    expect(normalizeWebhook({ event: 'a', timestampMs: NaN, payload: {} })!.timestampMs).toBeUndefined();
    expect(normalizeWebhook({ event: 'a', timestampMs: Infinity, payload: {} })!.timestampMs).toBeUndefined();
  });

  test('rejects payloads exceeding MAX_WEBHOOK_PAYLOAD_BYTES', () => {
    const big = { data: 'x'.repeat(MAX_WEBHOOK_PAYLOAD_BYTES + 1) };
    expect(normalizeWebhook({ event: 'big', payload: big })).toBeNull();
  });

  test('accepts payloads at exactly MAX_WEBHOOK_PAYLOAD_BYTES', () => {
    // Build a string payload that, when JSON-encoded, is ≤ MAX_WEBHOOK_PAYLOAD_BYTES.
    const str = 'x'.repeat(MAX_WEBHOOK_PAYLOAD_BYTES - 2); // minus quotes
    const result = normalizeWebhook({ event: 'a', payload: str });
    expect(result).not.toBeNull();
  });

  test('accepts payload as a pre-stringified string', () => {
    const result = normalizeWebhook({ event: 'a', payload: '{"k":"v"}' });
    expect(result!.payload).toBe('{"k":"v"}');
  });

  test('handles unserializable payloads by returning null', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(normalizeWebhook({ event: 'a', payload: obj })).toBeNull();
  });

  test('source/externalId are optional and accept strings only', () => {
    const r1 = normalizeWebhook({ event: 'a', payload: {}, source: 'eastmoney' });
    expect(r1!.source).toBe('eastmoney');

    const r2 = normalizeWebhook({ event: 'a', payload: {}, source: 123 as unknown as string });
    expect(r2!.source).toBeUndefined();

    const r3 = normalizeWebhook({ event: 'a', payload: {}, externalId: 'evt-123' });
    expect(r3!.externalId).toBe('evt-123');
  });

  test('sourceUrl is sanitized (userinfo stripped)', () => {
    const result = normalizeWebhook({
      event: 'a',
      payload: {},
      sourceUrl: 'https://user:pass@api.example.com/hook',
    });
    expect(result!.sourceUrl).toBe('https://api.example.com/hook');
  });

  test('returns null when sourceUrl is invalid', () => {
    expect(normalizeWebhook({ event: 'a', payload: {}, sourceUrl: 'ftp://x' })).toBeNull();
    expect(normalizeWebhook({ event: 'a', payload: {}, sourceUrl: 'not a url' })).toBeNull();
  });
});
