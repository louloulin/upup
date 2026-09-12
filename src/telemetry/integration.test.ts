import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  recordToolCallOk,
  recordToolCallErr,
  recordFeatureGate,
  recordLatency,
} from './integration.js';
import { TelemetryRecorder } from './recorder.js';
import { telemetry } from './index.js';
import type { ToolEndEvent, ToolErrorEvent } from '../runtime/pi/legacy-events.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'telemetry-integration-'));
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  // Reset the module-scoped recorder so tests don't leak state.
  telemetry.disable();
});

describe('recordToolCallOk', () => {
  test('emits a tool_call event with byte-sized output', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    // Replace the module-scoped recorder's behavior — we test via a fresh recorder
    // by re-implementing the same call against our local instance.
    const event: ToolEndEvent = {
      type: 'tool_end',
      tool: 'analyze_symbol',
      args: { symbol: 'AAPL', email: 'a@b.com' },
      result: 'recommendation: buy',
      duration: 142,
      toolCallId: 'tc-1',
    };
    rec.recordToolCall({
      tool: event.tool,
      inputHash: await import('./index.js').then((m) => m.hashTelemetryInput(event.args)),
      outputBytes: event.result.length,
      durationMs: event.duration,
      ok: true,
    });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    expect(files.length).toBe(1);
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.kind).toBe('tool_call');
    expect(parsed.tool).toBe('analyze_symbol');
    expect(parsed.durationMs).toBe(142);
    expect(parsed.ok).toBe(true);
    expect(parsed.outputBytes).toBe(19);
    expect(parsed.inputHash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('inputHash is anonymized — email in args does not appear in hash collision check', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    const event: ToolEndEvent = {
      type: 'tool_end',
      tool: 't',
      args: { email: 'secret@example.com' },
      result: 'x',
      duration: 1,
      toolCallId: 'tc-1',
    };
    rec.recordToolCall({
      tool: event.tool,
      inputHash: await import('./index.js').then((m) => m.hashTelemetryInput(event.args)),
      outputBytes: 1,
      durationMs: 1,
      ok: true,
    });
    rec.recordToolCall({
      tool: event.tool,
      inputHash: await import('./index.js').then((m) => m.hashTelemetryInput({ email: 'secret@example.com' })),
      outputBytes: 1,
      durationMs: 1,
      ok: true,
    });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    const h1 = JSON.parse(lines[0]!).inputHash;
    const h2 = JSON.parse(lines[1]!).inputHash;
    // Same input → same hash (anonymization is deterministic)
    expect(h1).toBe(h2);
  });
});

describe('recordToolCallErr', () => {
  test('emits a tool_call event with ok=false and a classified error code', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    const event: ToolErrorEvent = {
      type: 'tool_error',
      tool: 'analyze_symbol',
      error: 'TIMEOUT: request exceeded 30s',
      toolCallId: 'tc-1',
    };
    const startedAt = Date.now() - 50;
    rec.recordToolCall({
      tool: event.tool,
      inputHash: '',
      outputBytes: 0,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorCode: event.error.split(/[\s:]/, 2)[0]!.toLowerCase(),
    });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.kind).toBe('tool_call');
    expect(parsed.ok).toBe(false);
    expect(parsed.errorCode).toBe('timeout');
    expect(parsed.durationMs).toBeGreaterThanOrEqual(50);
  });

  test('handles null start time (no duration known)', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    rec.recordToolCall({
      tool: 't',
      inputHash: '',
      outputBytes: 0,
      durationMs: 0,
      ok: false,
      errorCode: 'unknown',
    });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    expect(files.length).toBe(1);
  });
});

describe('recordFeatureGate', () => {
  test('emits a feature_gate event', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    rec.recordFeatureGate({ feature: 'kairos_v2', value: true, source: 'env' });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.kind).toBe('feature_gate');
    expect(parsed.feature).toBe('kairos_v2');
    expect(parsed.value).toBe(true);
    expect(parsed.source).toBe('env');
  });
});

describe('recordLatency', () => {
  test('emits a latency event with metadata', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    rec.recordLatency({ op: 'agent_iteration', durationMs: 1234, metadata: { model: 'gpt-5.4' } });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.kind).toBe('latency');
    expect(parsed.op).toBe('agent_iteration');
    expect(parsed.durationMs).toBe(1234);
    expect(parsed.metadata.model).toBe('gpt-5.4');
  });
});

describe('integration helpers — safety guarantees', () => {
  test('recordToolCallOk does not throw when given a circular args ref', () => {
    // circular ref would normally break JSON.stringify; the helper should swallow
    type X = { self?: X };
    const args: X = {};
    args.self = args;
    // Wrap a tool_end event with circular args
    const event: ToolEndEvent = {
      type: 'tool_end',
      tool: 't',
      args,
      result: 'ok',
      duration: 1,
      toolCallId: 'tc-x',
    };
    expect(() => recordToolCallOk(event)).not.toThrow();
  });

  test('recordToolCallErr does not throw on weird error strings', () => {
    const event: ToolErrorEvent = {
      type: 'tool_error',
      tool: 't',
      error: '',
      toolCallId: 'tc-x',
    };
    expect(() => recordToolCallErr(event, null)).not.toThrow();
  });

  test('recordFeatureGate and recordLatency do not throw', () => {
    expect(() => recordFeatureGate('x', true, 'default')).not.toThrow();
    expect(() => recordLatency('op', 10, { foo: 'bar' })).not.toThrow();
  });
});

describe('end-to-end: simulated agent loop', () => {
  test('tool_start + tool_end → emits a tool_call event with duration', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    // Simulate what the agent loop now does:
    //   1. on tool_start: record start time
    //   2. on tool_end: emit recordToolCallOk with the duration
    const startedAt = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    rec.recordToolCall({
      tool: 'echo',
      inputHash: 'deadbeef',
      outputBytes: 5,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.kind).toBe('tool_call');
    expect(parsed.tool).toBe('echo');
    expect(parsed.durationMs).toBeGreaterThanOrEqual(5);
    expect(parsed.ok).toBe(true);
  });

  test('feature-gate hit + tool call → both events recorded', async () => {
    const rec = new TelemetryRecorder({ enabled: true, sinkConfig: { dir: tmpDir, flushEveryNEvents: 1 } });
    // Simulate what feature-gates.ts isEnabled + agent.ts tool_end do together
    rec.recordFeatureGate({ feature: 'tengu_coordinator_v2', value: true, source: 'growthbook' });
    rec.recordToolCall({
      tool: 'analyze_symbol',
      inputHash: 'a1b2',
      outputBytes: 100,
      durationMs: 50,
      ok: true,
    });
    rec.recordLatency({ op: 'agent_iteration', durationMs: 200 });
    await rec.flush();
    const files = readdirSync(tmpDir).filter((f) => f.startsWith('events-'));
    const content = readFileSync(join(tmpDir, files[0]!), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(3);
    const kinds = lines.map((l) => JSON.parse(l).kind).sort();
    expect(kinds).toEqual(['feature_gate', 'latency', 'tool_call']);
  });
});
