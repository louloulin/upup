import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import piEventCoverageExtension, {
  PI_EVENT_COVERAGE_EVENTS,
  type PiEventCoverageEvent,
} from './pi-event-coverage.ts';

/**
 * Minimal fake `ExtensionAPI` that records every event name handed to
 * `pi.on` and lets the test fire each handler with a controlled payload.
 */
interface FakePi {
  on: (event: string, handler: (event: unknown, context: unknown) => unknown) => void;
  handlers: Map<string, (event: unknown, context: unknown) => unknown>;
  call(name: string, payload: unknown, context?: unknown): unknown;
}

function makeFakePi(): FakePi {
  const handlers = new Map<string, (event: unknown, context: unknown) => unknown>();
  return {
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
    call(name, payload, context = {}) {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`no handler for ${name}`);
      return handler(payload, context);
    },
  };
}

describe('pi-event-coverage extension', () => {
  test('subscribes every documented high-value Pi event', () => {
    const fake = makeFakePi();
    piEventCoverageExtension(fake as unknown as Parameters<typeof piEventCoverageExtension>[0]);
    const subscribed = fake.handlers.size;
    // We assert on >= because Pi hosts may add their own listeners; the
    // contract is that *all* events in PI_EVENT_COVERAGE_EVENTS are wired.
    for (const event of PI_EVENT_COVERAGE_EVENTS) {
      expect(fake.handlers.has(event)).toBe(true);
    }
    expect(subscribed).toBeGreaterThanOrEqual(PI_EVENT_COVERAGE_EVENTS.length);
  });

  test('handlers persist an audit breadcrumb to the configured agent dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-event-cov-'));
    process.env['UPUP_AGENT_DIR'] = dir;
    const expectedPath = join(dir, 'state', 'pi-event-coverage.jsonl');
    try {
      const fake = makeFakePi();
      piEventCoverageExtension(fake as unknown as Parameters<typeof piEventCoverageExtension>[0]);

      // Fire one representative handler from each Pi lifecycle bucket.
      const sample: { event: PiEventCoverageEvent; payload: unknown }[] = [
        { event: 'session_before_fork', payload: { sessionId: 'sess-A' } },
        { event: 'session_compact', payload: { sessionId: 'sess-A' } },
        { event: 'agent_start', payload: { sessionId: 'sess-A' } },
        { event: 'turn_end', payload: { sessionId: 'sess-A' } },
        { event: 'message_end', payload: { sessionId: 'sess-A' } },
        { event: 'before_provider_request', payload: { sessionId: 'sess-A' } },
        { event: 'after_provider_response', payload: { sessionId: 'sess-A' } },
        { event: 'thinking_level_select', payload: { sessionId: 'sess-A' } },
        { event: 'tool_execution_start', payload: { sessionId: 'sess-A' } },
      ];
      for (const s of sample) fake.call(s.event, s.payload);

      const lines = readFileSync(expectedPath, 'utf8').trim().split('\n');
      expect(lines.length).toBe(sample.length);
      const events = lines.map((l) => JSON.parse(l).event);
      for (const s of sample) expect(events).toContain(s.event);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      delete process.env['UPUP_AGENT_DIR'];
    }
  });

  test('does not throw when the host has no `pi.on`', () => {
    expect(() =>
      piEventCoverageExtension({} as unknown as Parameters<typeof piEventCoverageExtension>[0]),
    ).not.toThrow();
  });

  test('does not throw when a handler throws', () => {
    const fake = makeFakePi();
    const originalWrite = (globalThis as { __test_write__?: () => void }).__test_write__;
    // Force the audit breadcrumb write to fail by pointing at an invalid path.
    process.env['UPUP_AGENT_DIR'] = '/this/path/definitely/does/not/exist/and/cannot/be/created/\0';
    try {
      piEventCoverageExtension(fake as unknown as Parameters<typeof piEventCoverageExtension>[0]);
      expect(() => fake.call('session_compact', { sessionId: 'sess-B' })).not.toThrow();
    } finally {
      delete process.env['UPUP_AGENT_DIR'];
      if (originalWrite !== undefined) (globalThis as { __test_write__?: () => void }).__test_write__ = originalWrite;
    }
  });

  test('event list is stable and matches the plan §1.2 contract', () => {
    expect(PI_EVENT_COVERAGE_EVENTS.length).toBe(20);
    // Each event listed in plan §1.2 must be present, in canonical form.
    const required: PiEventCoverageEvent[] = [
      'session_before_switch',
      'session_before_fork',
      'session_compact',
      'session_compact_failed',
      'session_tree',
      'agent_start',
      'agent_end',
      'agent_settled',
      'ui_prompt_start',
      'turn_start',
      'turn_end',
      'message_start',
      'message_update',
      'message_end',
      'before_provider_request',
      'after_provider_response',
      'context',
      'tool_execution_start',
      'tool_execution_end',
      'thinking_level_select',
    ];
    for (const e of required) expect(PI_EVENT_COVERAGE_EVENTS).toContain(e);
  });
});
