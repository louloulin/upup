import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  anonymizeText,
  anonymizeStack,
  anonymizeValue,
  TelemetryRecorder,
  TelemetrySink,
  hashTelemetryInput,
  buildErrorPayload,
  executeWithProviderRetry,
} from './src/index.ts';
import { isTelemetryEventKind, type TelemetryEvent } from './src/types.ts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'telemetry-test-'));
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('anonymizeText', () => {
  test('redacts emails', () => {
    const r = anonymizeText('contact alice@example.com for details');
    expect(r.text).toBe('contact [REDACTED_EMAIL] for details');
    expect(r.redactions).toBe(1);
  });

  test('redacts Chinese mobile numbers', () => {
    const r = anonymizeText('call 13800138000 today');
    expect(r.text).toBe('call [REDACTED_PHONE] today');
    expect(r.redactions).toBe(1);
  });

  test('redacts ID-card-shaped 18-digit numbers', () => {
    const r = anonymizeText('id: 110101199003078811');
    expect(r.text).toBe('id: [REDACTED_ID]');
    expect(r.redactions).toBe(1);
  });

  test('redacts bank-card-shaped 16-digit numbers', () => {
    const r = anonymizeText('card 6222021234567890 charged');
    // 16 digits → matches CARD_RE; phone/id patterns also match
    expect(r.text).toContain('[REDACTED');
    expect(r.text).not.toContain('6222021234567890');
  });

  test('redacts IPv4 addresses', () => {
    const r = anonymizeText('connect 192.168.1.100:5432');
    expect(r.text).toBe('connect [REDACTED_IP]:5432');
  });

  test('redacts API tokens (sk- prefix)', () => {
    const r = anonymizeText('key=sk-abcdefghijklmnop1234');
    expect(r.text).toContain('[REDACTED_TOKEN]');
  });

  test('redacts home directories in paths', () => {
    const r = anonymizeText('file at /Users/alice/work/foo.ts and /home/bob/x');
    expect(r.text).toBe('file at /~/work/foo.ts and /~/x');
  });

  test('handles empty string', () => {
    const r = anonymizeText('');
    expect(r.text).toBe('');
    expect(r.redactions).toBe(0);
  });

  test('counts multiple redactions', () => {
    const r = anonymizeText('a@b.com and c@d.com');
    expect(r.redactions).toBe(2);
  });
});

describe('anonymizeStack', () => {
  test('keeps only first 3 lines', () => {
    const stack = 'Error: boom\n    at foo (/Users/x/foo.ts:1:1)\n    at bar (/Users/x/bar.ts:2:2)\n    at baz (/Users/x/baz.ts:3:3)\n    at qux';
    const out = anonymizeStack(stack);
    const lines = out.split('\n');
    expect(lines.length).toBe(3);
    expect(out).toContain('Error: boom');
  });

  test('anonymizes paths in stack lines', () => {
    const stack = 'Error: x\n    at /Users/alice/foo.ts:1:1';
    const out = anonymizeStack(stack);
    expect(out).toContain('/~/foo.ts');
  });
});

describe('anonymizeValue', () => {
  test('walks objects recursively', () => {
    const v = { user: { email: 'a@b.com', name: 'alice' }, items: ['1' ] };
    const out = anonymizeValue(v) as Record<string, unknown>;
    const user = out.user as Record<string, unknown>;
    expect(user.email).toBe('[REDACTED_EMAIL]');
    expect(user.name).toBe('alice');
    expect(out.items).toEqual(['1']);
  });

  test('passes through primitives unchanged', () => {
    expect(anonymizeValue(42)).toBe(42);
    expect(anonymizeValue(true)).toBe(true);
    expect(anonymizeValue(null)).toBe(null);
  });
});

describe('hashTelemetryInput', () => {
  test('produces stable hash for same input', () => {
    const a = hashTelemetryInput({ foo: 1, bar: 'x' });
    const b = hashTelemetryInput({ foo: 1, bar: 'x' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  test('produces different hash for different input', () => {
    expect(hashTelemetryInput({ foo: 1 })).not.toBe(hashTelemetryInput({ foo: 2 }));
  });

  test('anonymizes before hashing (PII cannot leak via hash collision check)', () => {
    const a = hashTelemetryInput({ email: 'alice@example.com' });
    const b = hashTelemetryInput({ email: 'alice@example.com' });
    expect(a).toBe(b);
  });
});

describe('isTelemetryEventKind', () => {
  test('accepts known kinds', () => {
    for (const k of ['tool_call', 'decision', 'feature_gate', 'error', 'latency']) {
      expect(isTelemetryEventKind(k)).toBe(true);
    }
  });
  test('rejects unknown', () => {
    expect(isTelemetryEventKind('foo')).toBe(false);
  });
});

describe('buildErrorPayload', () => {
  test('captures code + message + stack head', () => {
    const e = new Error('boom from /Users/alice/foo.ts');
    const p = buildErrorPayload('TEST_CODE', e);
    expect(p.code).toBe('TEST_CODE');
    expect(p.message).toContain('boom from /~/foo.ts');
    expect(p.stackHead).toBeDefined();
  });

  test('handles non-Error throws', () => {
    const p = buildErrorPayload('X', 'a string');
    expect(p.message).toBe('a string');
  });

  test('truncates long messages to 500 chars', () => {
    const e = new Error('x'.repeat(1000));
    const p = buildErrorPayload('X', e);
    expect(p.message?.length).toBeLessThanOrEqual(500);
  });
});

describe('TelemetrySink', () => {
  test('writes events to a JSONL file', async () => {
    const sink = new TelemetrySink({ dir: tmpDir, flushEveryNEvents: 1, flushEveryMs: 10 });
    const event: TelemetryEvent = {
      ts: 1700000000000,
      sessionId: 's-abc',
      runId: 'r-1',
      kind: 'tool_call',
      tool: 'echo',
      inputHash: 'deadbeef',
      outputBytes: 12,
      durationMs: 5,
      ok: true,
    };
    sink.write(event);
    await sink.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    expect(files.length).toBeGreaterThan(0);
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.kind).toBe('tool_call');
    expect(parsed.tool).toBe('echo');
  });

  test('prunes files older than retentionDays', async () => {
    const sink = new TelemetrySink({ dir: tmpDir, retentionDays: 0 });
    sink.write({
      ts: 1700000000000,
      sessionId: 's',
      runId: 'r',
      kind: 'latency',
      op: 'x',
      durationMs: 1,
    });
    await sink.flush();
    expect(readdirSync(tmpDir).filter((f) => f.startsWith('events-')).length).toBe(1);
    const removed = await sink.prune();
    expect(removed).toBe(1);
    expect(readdirSync(tmpDir).filter((f) => f.startsWith('events-')).length).toBe(0);
  });

  test('debounces flush via timer', async () => {
    const sink = new TelemetrySink({ dir: tmpDir, flushEveryNEvents: 1000, flushEveryMs: 20 });
    sink.write({
      ts: 1,
      sessionId: 's',
      runId: 'r',
      kind: 'latency',
      op: 'x',
      durationMs: 1,
    });
    // Don't await flush — let the timer fire
    await new Promise((r) => setTimeout(r, 60));
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    expect(files.length).toBeGreaterThan(0);
  });

  test('currentFilePath helper', () => {
    const sink = new TelemetrySink({ dir: tmpDir });
    expect(sink.currentFilePath('2026-06-04', 0)).toContain('events-2026-06-04.jsonl');
    expect(sink.currentFilePath('2026-06-04', 2)).toContain('events-2026-06-04.2.jsonl');
  });
});

describe('TelemetryRecorder', () => {
  test('is no-op when disabled', async () => {
    const rec = new TelemetryRecorder({ enabled: false, sinkConfig: { dir: tmpDir } });
    rec.recordToolCall({
      tool: 'echo',
      inputHash: 'x',
      outputBytes: 0,
      durationMs: 1,
      ok: true,
    });
    await rec.flush();
    expect(readdirSync(tmpDir).filter((f) => f.startsWith('events-')).length).toBe(0);
  });

  test('emits all 5 event kinds when enabled', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    rec.recordToolCall({ tool: 't', inputHash: 'h', outputBytes: 10, durationMs: 5, ok: true });
    rec.recordDecision({ decision: 'buy', target: 'AAPL', confidence: 0.8, rationaleHash: 'rh' });
    rec.recordFeatureGate({ feature: 'X', value: true, source: 'env' });
    rec.recordError({ code: 'E', message: 'oops' });
    rec.recordLatency({ op: 'agent_iter', durationMs: 100 });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    expect(files.length).toBe(1);
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(5);
    const kinds = lines.map((l) => JSON.parse(l).kind).sort();
    expect(kinds).toEqual(['decision', 'error', 'feature_gate', 'latency', 'tool_call']);
  });

  test('newRun changes the runId', () => {
    const rec = new TelemetryRecorder({ enabled: false });
    const r1 = rec.getRunId();
    const r2 = rec.newRun();
    expect(r1).not.toBe(r2);
    expect(rec.getRunId()).toBe(r2);
  });

  test('sessionId is stable across runs', () => {
    const rec = new TelemetryRecorder({ enabled: false });
    const s1 = rec.getSessionId();
    rec.newRun();
    expect(rec.getSessionId()).toBe(s1);
  });
});

describe('provider retry contract', () => {
  test('retries transient errors with deterministic exponential backoff and records serializable audit', async () => {
    const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 100 } });
    const delays: number[] = [];
    let calls = 0;
    const result = await executeWithProviderRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('temporary network timeout');
        return 'ok';
      },
      { provider: 'fixture', operation: 'quote', maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, recorder, sleep: async (delay) => { delays.push(delay); } },
    );
    expect(result).toEqual({ value: 'ok', attempts: 3 });
    expect(delays).toEqual([10, 20]);
    await recorder.flush();
    const file = readdirSync(tmpDir).find((name) => name.startsWith('events-'))!;
    const events = readFileSync(join(tmpDir, file), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.map((event) => [event.kind, event.outcome])).toEqual([
      ['provider_retry', 'retry_scheduled'],
      ['provider_retry', 'retry_scheduled'],
      ['provider_retry', 'succeeded'],
    ]);
    expect(events[0]).toMatchObject({ schema: 'upup.pi.provider-retry.v1', provider: 'fixture', operation: 'quote', attempt: 1, delayMs: 10 });
  });

  test('treats dropped-socket transport errors as transient and retries them', async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await executeWithProviderRetry(
      async () => {
        calls++;
        if (calls < 2) {
          const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
          throw new TypeError('The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()', { cause });
        }
        return 'ok';
      },
      { provider: 'eastmoney', operation: 'history', maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50, sleep: async (delay) => { delays.push(delay); } },
    );
    expect(result).toEqual({ value: 'ok', attempts: 2 });
    expect(delays).toEqual([10]);
  });

  test('does not retry permanent errors and records the terminal classification', async () => {
    const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    await expect(executeWithProviderRetry(async () => { throw new Error('invalid symbol'); }, { provider: 'fixture', operation: 'filing', recorder, sleep: async () => {} })).rejects.toThrow('invalid symbol');
    await recorder.flush();
    const file = readdirSync(tmpDir).find((name) => name.startsWith('events-'))!;
    const event = JSON.parse(readFileSync(join(tmpDir, file), 'utf8').trim());
    expect(event).toMatchObject({ kind: 'provider_retry', classification: 'permanent', outcome: 'failed', attempt: 1, delayMs: 0 });
  });

  test('stops on abort during backoff and emits an abort audit without leaking secrets', async () => {
    const recorder = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    const controller = new AbortController();
    let calls = 0;
    await expect(executeWithProviderRetry(async () => {
      calls++;
      throw new Error('temporary token=sk-abcdefghijklmnop1234');
    }, {
      provider: 'fixture', operation: 'history', maxAttempts: 3, recorder,
      sleep: async () => { controller.abort(); }, signal: controller.signal,
    })).rejects.toThrow();
    expect(calls).toBe(1);
    await recorder.flush();
    const file = readdirSync(tmpDir).find((name) => name.startsWith('events-'))!;
    const text = readFileSync(join(tmpDir, file), 'utf8');
    expect(text).not.toContain('sk-abcdefghijklmnop1234');
    expect(text).toContain('provider_retry');
  });
});
