import { describe, expect, test } from 'bun:test';
import { toPiSessionId } from './runner.js';

describe('Pi runner session identity', () => {
  test('normalizes channel-scoped keys into valid deterministic Pi IDs', () => {
    expect(toPiSessionId('whatsapp:+8613800000000')).toBe('whatsapp-8613800000000');
    expect(toPiSessionId('cron:daily-report')).toBe('cron-daily-report');
    expect(toPiSessionId('whatsapp:+8613800000000')).toBe(toPiSessionId('whatsapp:+8613800000000'));
  });

  test('hashes empty or oversized identities instead of passing invalid IDs to Pi', () => {
    expect(toPiSessionId(':::')).toMatch(/^upup-[0-9a-f]{32}$/);
    expect(toPiSessionId('x'.repeat(200))).toMatch(/^upup-[0-9a-f]{32}$/);
  });
});
