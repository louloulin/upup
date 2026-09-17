import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createEventAuditSink, eventAuditPath, formatEventAuditLine, isEventAuditEnabled } from './event-audit-sink';
import type { PiEventAuditRecord } from './event-surface';

const record: PiEventAuditRecord = {
  at: Date.parse('2026-09-17T02:00:00.000Z'),
  event: 'turn_end',
  role: 'turn',
  outcome: 'ok',
  durationMs: 42,
  sessionId: 'sess-1',
  fields: { toolResults: 3 },
};

let tmp: string;
let origEnv: Record<string, string | undefined>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'upup-audit-'));
  origEnv = {
    UPUP_HOME: process.env.UPUP_HOME,
    UPUP_TELEMETRY: process.env.UPUP_TELEMETRY,
    UPUP_PI_EVENT_AUDIT: process.env.UPUP_PI_EVENT_AUDIT,
    UPUP_PI_EVENT_AUDIT_PATH: process.env.UPUP_PI_EVENT_AUDIT_PATH,
    HOME: process.env.HOME,
  };
  delete process.env.UPUP_TELEMETRY;
  delete process.env.UPUP_PI_EVENT_AUDIT;
  delete process.env.UPUP_PI_EVENT_AUDIT_PATH;
});

afterEach(() => {
  for (const [key, value] of Object.entries(origEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('eventAuditPath', () => {
  it('honours $UPUP_HOME', () => {
    expect(eventAuditPath({ UPUP_HOME: '/tmp/iso' } as NodeJS.ProcessEnv)).toBe('/tmp/iso/telemetry/pi-events.jsonl');
  });

  it('falls back to ~/.upup', () => {
    expect(eventAuditPath({ HOME: '/home/u' } as NodeJS.ProcessEnv)).toBe('/home/u/.upup/telemetry/pi-events.jsonl');
  });

  it('allows a dedicated path override', () => {
    expect(eventAuditPath({ UPUP_PI_EVENT_AUDIT_PATH: '/tmp/x.jsonl' } as NodeJS.ProcessEnv)).toBe('/tmp/x.jsonl');
  });
});

describe('isEventAuditEnabled', () => {
  it('is off by default and follows the telemetry opt-in', () => {
    expect(isEventAuditEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isEventAuditEnabled({ UPUP_TELEMETRY: '1' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('can be forced on and off independently', () => {
    expect(isEventAuditEnabled({ UPUP_PI_EVENT_AUDIT: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isEventAuditEnabled({ UPUP_TELEMETRY: '1', UPUP_PI_EVENT_AUDIT: '0' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('formatEventAuditLine', () => {
  it('emits one JSON object per line with a stable key order', () => {
    const line = formatEventAuditLine(record);
    expect(line.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(line))).toEqual(['ts', 'event', 'role', 'outcome', 'sessionId', 'durationMs', 'fields']);
    expect(JSON.parse(line).ts).toBe('2026-09-17T02:00:00.000Z');
  });

  it('records the error message when a handler failed', () => {
    const parsed = JSON.parse(formatEventAuditLine({ ...record, outcome: 'error', errorMessage: 'boom' }));
    expect(parsed.error).toBe('boom');
  });
});

describe('createEventAuditSink', () => {
  it('writes nothing when disabled', () => {
    const sink = createEventAuditSink({ path: join(tmp, 'a.jsonl'), enabled: false });
    sink.record(record);
    expect(sink.written()).toBe(0);
    expect(() => readFileSync(join(tmp, 'a.jsonl'), 'utf-8')).toThrow();
  });

  it('creates the directory and appends one line per record', () => {
    const path = join(tmp, 'nested', 'pi-events.jsonl');
    const sink = createEventAuditSink({ path, enabled: true });
    sink.record(record);
    sink.record({ ...record, event: 'agent_start', role: 'agent' });
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string).event).toBe('turn_end');
    expect(sink.written()).toBe(2);
  });

  it('rotates to a single previous generation past maxBytes', () => {
    const path = join(tmp, 'rot.jsonl');
    const first = createEventAuditSink({ path, enabled: true, maxBytes: 10 });
    first.record(record);
    first.record(record);
    const second = createEventAuditSink({ path, enabled: true, maxBytes: 10 });
    second.record(record);
    expect(readFileSync(`${path}.1`, 'utf-8').trim().split('\n').length).toBeGreaterThanOrEqual(2);
    expect(readFileSync(path, 'utf-8').trim().split('\n')).toHaveLength(1);
  });

  it('never throws when the writer fails', () => {
    const sink = createEventAuditSink({
      path: join(tmp, 'x.jsonl'),
      enabled: true,
      write: () => {
        throw new Error('ENOSPC');
      },
    });
    expect(() => sink.record(record)).not.toThrow();
    expect(sink.written()).toBe(0);
  });

  it('uses $UPUP_HOME by default', () => {
    process.env.UPUP_HOME = tmp;
    const sink = createEventAuditSink({ enabled: true });
    expect(sink.path).toBe(join(tmp, 'telemetry', 'pi-events.jsonl'));
    sink.record(record);
    expect(readFileSync(sink.path, 'utf-8')).toContain('"event":"turn_end"');
  });
});
