/**
 * Tests for the Worker XML Injection Protocol.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D2)
 */

import { describe, expect, test } from 'bun:test';
import {
  type ArtifactKind,
  type TaskNotification,
  type TaskStatus,
  extractTaskNotifications,
  parseTaskNotification,
  serializeTaskNotification,
  wrapWorkerResult,
} from './worker-xml.js';

const baseNotification: TaskNotification = {
  taskId: 'research-technical-analysis-600519',
  workerRole: 'technical-analysis',
  status: 'completed',
  attempts: 1,
  summary: '技术面看多,短期支撑 1650,阻力 1750',
  result: 'trend=up; rsi=58; macd=positive',
  artifacts: [
    { path: '/tmp/600519-chart.png', kind: 'chart' },
    { path: '/tmp/600519-data.csv', kind: 'data' },
  ],
  usage: { totalTokens: 1234, durationMs: 5000 },
  verification: { ok: true, notes: 'all checks passed' },
};

describe('serializeTaskNotification / parseTaskNotification round-trip', () => {
  test('round-trip preserves all fields (happy path)', () => {
    const xml = serializeTaskNotification(baseNotification);
    const parsed = parseTaskNotification(xml);
    expect(parsed).toEqual(baseNotification);
  });

  test('round-trip with empty artifacts', () => {
    const n: TaskNotification = { ...baseNotification, artifacts: [] };
    const xml = serializeTaskNotification(n);
    expect(xml).toContain('<artifacts></artifacts>');
    expect(parseTaskNotification(xml)).toEqual(n);
  });

  test('round-trip with no verification (optional field)', () => {
    const n: TaskNotification = { ...baseNotification };
    delete n.verification;
    const xml = serializeTaskNotification(n);
    expect(xml).not.toContain('<verification');
    expect(parseTaskNotification(xml)).toEqual(n);
  });

  test('round-trip with verification but no notes', () => {
    const n: TaskNotification = {
      ...baseNotification,
      verification: { ok: false },
    };
    const xml = serializeTaskNotification(n);
    expect(parseTaskNotification(xml)).toEqual(n);
  });

  test('all 4 statuses round-trip', () => {
    for (const status of ['completed', 'failed', 'killed', 'timeout'] as TaskStatus[]) {
      const n: TaskNotification = { ...baseNotification, status };
      const xml = serializeTaskNotification(n);
      const parsed = parseTaskNotification(xml);
      expect(parsed.status).toBe(status);
    }
  });

  test('all 5 artifact kinds round-trip', () => {
    for (const kind of ['report', 'code', 'data', 'chart', 'log'] as ArtifactKind[]) {
      const n: TaskNotification = {
        ...baseNotification,
        artifacts: [{ path: '/x', kind }],
      };
      const xml = serializeTaskNotification(n);
      const parsed = parseTaskNotification(xml);
      expect(parsed.artifacts[0]?.kind).toBe(kind);
    }
  });

  test('attempts defaults to 1 when missing on the wire', () => {
    const xml = serializeTaskNotification({ ...baseNotification, attempts: 1 });
    // Strip the attempts attribute manually
    const stripped = xml.replace(/ attempts="1"/, '');
    const parsed = parseTaskNotification(stripped);
    expect(parsed.attempts).toBe(1);
  });
});

describe('XML escaping', () => {
  test('escapes <, >, & in result text', () => {
    const n: TaskNotification = {
      ...baseNotification,
      result: '5 < 10 && 10 > 5; <xml>not a tag</xml>',
    };
    const xml = serializeTaskNotification(n);
    expect(xml).not.toContain('5 < 10');
    expect(xml).toContain('5 &lt; 10 &amp;&amp; 10 &gt; 5');
    expect(parseTaskNotification(xml).result).toBe(n.result);
  });

  test('escapes & in summary', () => {
    const n: TaskNotification = {
      ...baseNotification,
      summary: 'Q&A: buyer & seller dynamics',
    };
    const xml = serializeTaskNotification(n);
    expect(xml).toContain('Q&amp;A: buyer &amp; seller');
    expect(parseTaskNotification(xml).summary).toBe(n.summary);
  });

  test('escapes " in attribute values (path, notes)', () => {
    const n: TaskNotification = {
      ...baseNotification,
      artifacts: [{ path: '/path with "quotes" and space.txt', kind: 'log' }],
      verification: { ok: false, notes: 'failed: said "no" to test' },
    };
    const xml = serializeTaskNotification(n);
    // Quotes must be escaped as &quot; inside attribute values.
    expect(xml).toContain('&quot;quotes&quot;');
    expect(xml).toContain('&quot;no&quot;');
    const parsed = parseTaskNotification(xml);
    expect(parsed.artifacts[0]?.path).toBe('/path with "quotes" and space.txt');
    expect(parsed.verification?.notes).toBe('failed: said "no" to test');
  });

  test('result containing task-notification-like substring does not confuse the parser', () => {
    const n: TaskNotification = {
      ...baseNotification,
      result: 'inner <task-notification task-id="x">oops</task-notification> end',
    };
    const xml = serializeTaskNotification(n);
    // The inner is escaped to entity, so the parser sees one root.
    const parsed = parseTaskNotification(xml);
    expect(parsed.result).toBe(n.result);
    expect(parsed.taskId).toBe(baseNotification.taskId);
  });
});

describe('extractTaskNotifications', () => {
  test('returns [] for empty input', () => {
    expect(extractTaskNotifications('')).toEqual([]);
  });

  test('returns [] for input with no task-notification', () => {
    expect(extractTaskNotifications('just some plain text')).toEqual([]);
  });

  test('extracts a single block from surrounding text', () => {
    const xml = serializeTaskNotification(baseNotification);
    const text = `Some intro text.\n\n${xml}\n\nClosing thoughts.`;
    const out = extractTaskNotifications(text);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(baseNotification);
  });

  test('extracts multiple blocks in order', () => {
    const a = serializeTaskNotification({ ...baseNotification, taskId: 'a' });
    const b = serializeTaskNotification({ ...baseNotification, taskId: 'b' });
    const c = serializeTaskNotification({ ...baseNotification, taskId: 'c' });
    const text = `${a}\nseparator\n${b}\nseparator\n${c}`;
    const out = extractTaskNotifications(text);
    expect(out.map((n) => n.taskId)).toEqual(['a', 'b', 'c']);
  });

  test('skips malformed blocks (bad status) but keeps good ones', () => {
    // Realistic failure mode: the block is well-formed XML but parseTaskNotification
    // throws on the body (e.g. unknown status). The extractor must catch and skip
    // without dropping the surrounding good blocks.
    const good1 = serializeTaskNotification({ ...baseNotification, taskId: 'good1' });
    const malformed =
      '<task-notification task-id="bad" worker-role="r" status="WAT" attempts="1">' +
      '<summary>s</summary><result>r</result>' +
      '<artifacts></artifacts><usage><total_tokens>0</total_tokens><duration_ms>0</duration_ms></usage>' +
      '</task-notification>';
    const good2 = serializeTaskNotification({ ...baseNotification, taskId: 'good2' });
    const text = `${good1}\n${malformed}\n${good2}`;
    const out = extractTaskNotifications(text);
    expect(out.map((n) => n.taskId)).toEqual(['good1', 'good2']);
  });
});

describe('parseTaskNotification error cases', () => {
  test('throws on missing root element', () => {
    expect(() => parseTaskNotification('<other>stuff</other>')).toThrow(/task-notification/);
  });

  test('throws on bad status', () => {
    const xml =
      '<task-notification task-id="x" worker-role="r" status="WAT" attempts="1">' +
      '<summary>s</summary><result>r</result>' +
      '<artifacts></artifacts><usage><total_tokens>0</total_tokens><duration_ms>0</duration_ms></usage>' +
      '</task-notification>';
    expect(() => parseTaskNotification(xml)).toThrow(/bad status/);
  });

  test('throws on missing worker-role', () => {
    const xml =
      '<task-notification task-id="x" status="completed" attempts="1">' +
      '<summary>s</summary><result>r</result>' +
      '<artifacts></artifacts><usage><total_tokens>0</total_tokens><duration_ms>0</duration_ms></usage>' +
      '</task-notification>';
    expect(() => parseTaskNotification(xml)).toThrow(/worker-role/);
  });

  test('throws on missing task-id', () => {
    const xml =
      '<task-notification worker-role="r" status="completed" attempts="1">' +
      '<summary>s</summary><result>r</result>' +
      '<artifacts></artifacts><usage><total_tokens>0</total_tokens><duration_ms>0</duration_ms></usage>' +
      '</task-notification>';
    expect(() => parseTaskNotification(xml)).toThrow(/task-id/);
  });
});

describe('wrapWorkerResult', () => {
  test('produces a parseable block with sensible defaults', () => {
    const xml = wrapWorkerResult({
      taskId: 't-1',
      workerRole: 'r',
      summary: 'ok',
      result: 'some result',
    });
    const parsed = parseTaskNotification(xml);
    expect(parsed.taskId).toBe('t-1');
    expect(parsed.workerRole).toBe('r');
    expect(parsed.status).toBe('completed');
    expect(parsed.attempts).toBe(1);
    expect(parsed.summary).toBe('ok');
    expect(parsed.result).toBe('some result');
    expect(parsed.artifacts).toEqual([]);
    expect(parsed.usage).toEqual({ totalTokens: 0, durationMs: 0 });
    expect(parsed.verification).toBeUndefined();
  });

  test('passes through status, attempts, artifacts, usage, verification', () => {
    const xml = wrapWorkerResult({
      taskId: 't-2',
      workerRole: 'r',
      status: 'failed',
      attempts: 3,
      summary: 'bad',
      result: 'r',
      artifacts: [{ path: '/p', kind: 'report' }],
      usage: { totalTokens: 100, durationMs: 50 },
      verification: { ok: false, notes: 'tests failed' },
    });
    const parsed = parseTaskNotification(xml);
    expect(parsed.status).toBe('failed');
    expect(parsed.attempts).toBe(3);
    expect(parsed.artifacts).toEqual([{ path: '/p', kind: 'report' }]);
    expect(parsed.usage).toEqual({ totalTokens: 100, durationMs: 50 });
    expect(parsed.verification).toEqual({ ok: false, notes: 'tests failed' });
  });
});
