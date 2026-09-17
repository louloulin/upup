import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  PI_CANONICAL_EVENT_NAMES,
  UPUP_EVENT_SURFACE,
  describeUpUpEventSurface,
  mountUpUpEventSurface,
  upupEventRole,
  type PiEventAuditRecord,
  type PiEventSurfaceLike,
} from './event-surface';

/** Minimal recorder standing in for Pi's ExtensionAPI. */
function createFakePi(): PiEventSurfaceLike & { readonly subscriptions: Map<string, ((event: unknown, context: unknown) => unknown)[]> } {
  const subscriptions = new Map<string, ((event: unknown, context: unknown) => unknown)[]>();
  return {
    subscriptions,
    on(event, handler) {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
  };
}

const PI_TYPES = resolve(import.meta.dir, '../../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts');

/** Authoritative event list straight from the installed Pi SDK. */
function piEventNamesFromSdk(): string[] {
  const text = readFileSync(PI_TYPES, 'utf-8');
  const api = text.slice(text.indexOf('export interface ExtensionAPI'));
  return [...api.matchAll(/on\(event: "([a-z_]+)"/g)].map((match) => match[1] as string);
}

describe('PI_CANONICAL_EVENT_NAMES', () => {
  it('matches the installed Pi SDK exactly (no drift)', () => {
    expect([...PI_CANONICAL_EVENT_NAMES]).toEqual(piEventNamesFromSdk());
  });

  it('has no duplicates', () => {
    expect(new Set(PI_CANONICAL_EVENT_NAMES).size).toBe(PI_CANONICAL_EVENT_NAMES.length);
  });
});

describe('UPUP_EVENT_SURFACE', () => {
  it('declares one spec per Pi event', () => {
    expect(UPUP_EVENT_SURFACE.map((spec) => spec.name)).toEqual([...PI_CANONICAL_EVENT_NAMES]);
  });

  it('gives every event a role and a stated use', () => {
    for (const spec of UPUP_EVENT_SURFACE) {
      expect(spec.role.length).toBeGreaterThan(0);
      expect(spec.upupUse.length).toBeGreaterThan(0);
    }
  });

  it('marks the events owned elsewhere as observe-only', () => {
    for (const owned of ['session_before_compact', 'tool_call', 'tool_result'] as const) {
      expect(UPUP_EVENT_SURFACE.find((spec) => spec.name === owned)?.behavior).toBe(false);
    }
  });

  it('reports behaviour vs observe counts', () => {
    const summary = describeUpUpEventSurface();
    expect(summary.total).toBe(36);
    expect(summary.behaviorBacked + summary.observeOnly).toBe(36);
    expect(summary.behaviorBacked).toBeGreaterThanOrEqual(25);
    expect(Object.values(summary.byRole).reduce((sum, count) => sum + count, 0)).toBe(36);
  });

  it('resolves roles by name with a fallback for unknown future events', () => {
    expect(upupEventRole('model_select')).toBe('model');
    expect(upupEventRole('brand_new_pi_event')).toBe('session');
  });
});

describe('mountUpUpEventSurface', () => {
  it('subscribes to all 36 events', () => {
    const pi = createFakePi();
    const result = mountUpUpEventSurface(pi, {});
    expect(result.mounted).toHaveLength(36);
    expect([...pi.subscriptions.keys()].sort()).toEqual([...PI_CANONICAL_EVENT_NAMES].sort());
  });

  it('records one audit entry per fired event and forwards results', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    const result = mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      behaviors: { 'model_select': () => ({ model: 'gpt-5.4' }) },
    });
    expect(result.behaviorBacked).toEqual(['model_select']);
    expect(result.auditOnly).toHaveLength(35);

    const handler = pi.subscriptions.get('model_select')?.[0];
    const returned = handler?.({ model: { id: 'gpt-5.4' } }, {});
    expect(returned).toEqual({ model: 'gpt-5.4' });
    expect(records).toEqual([
      expect.objectContaining({ event: 'model_select', role: 'model', outcome: 'ok' }),
    ]);
  });

  it('isolates a throwing handler and keeps the session alive', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    const errors: string[] = [];
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      onHandlerError: (event) => errors.push(event),
      behaviors: {
        'agent_start': () => {
          throw new Error('boom');
        },
      },
    });
    const handler = pi.subscriptions.get('agent_start')?.[0];
    expect(() => handler?.({}, {})).not.toThrow();
    expect(handler?.({}, {})).toBeUndefined();
    expect(errors).toEqual(['agent_start', 'agent_start']);
    expect(records.every((record) => record.outcome === 'error')).toBe(true);
    expect(records[0]?.errorMessage).toBe('boom');
  });

  it('isolates a rejected async handler', async () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      behaviors: {
        'turn_end': async () => {
          throw new Error('async boom');
        },
      },
    });
    const handler = pi.subscriptions.get('turn_end')?.[0];
    await expect(handler?.({}, {})).resolves.toBeUndefined();
    expect(records[0]?.outcome).toBe('error');
    expect(records[0]?.errorMessage).toBe('async boom');
  });

  it('keeps a broken describe() from breaking the event', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      describe: {
        context: () => {
          throw new Error('descriptor boom');
        },
      },
    });
    const handler = pi.subscriptions.get('context')?.[0];
    expect(() => handler?.({ messages: [] }, {})).not.toThrow();
    expect(records[0]?.outcome).toBe('ok');
  });

  it('attaches the session id and structured fields from describe()', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      describe: { 'tool_execution_start': () => ({ market: 'cn' }) },
      now: (() => {
        let tick = 1000;
        return () => (tick += 5);
      })(),
    });
    pi.subscriptions.get('tool_execution_start')?.[0]?.({}, { sessionManager: { getSessionId: () => 'sess-1' } });
    expect(records[0]).toMatchObject({ sessionId: 'sess-1', fields: { market: 'cn' }, event: 'tool_execution_start', outcome: 'ok' });
    expect(records[0]?.durationMs).toBeGreaterThan(0);
  });

  it('drops a behavior result for a result-contract event it does not own', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    // `before_provider_request` replaces the provider payload. A behavior that
    // returns metadata here would silently rewrite the request.
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      behaviors: { before_provider_request: () => ({ payloadBytes: 12 }) },
    });
    const returned = pi.subscriptions.get('before_provider_request')?.[0]?.({ payload: { a: 1 } }, {});
    expect(returned).toBeUndefined();
    expect(records[0]?.fields).toMatchObject({ contractViolation: true });
  });

  it('forwards a result-contract event when the behavior is declared as its owner', () => {
    const pi = createFakePi();
    mountUpUpEventSurface(pi, {
      contractBehaviors: {
        'resources_discover': () => ({ skillPaths: ['/x/skills'] }),
      },
    });
    const returned = pi.subscriptions.get('resources_discover')?.[0]?.({ cwd: '/x' }, {});
    expect(returned).toEqual({ skillPaths: ['/x/skills'] });
  });

  it('records a plain-object return from a void-return event as audit fields', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      behaviors: { 'model_select': () => ({ model: 'gpt-5.4', persisted: true }) },
    });
    pi.subscriptions.get('model_select')?.[0]?.({}, {});
    expect(records[0]?.fields).toMatchObject({ model: 'gpt-5.4', persisted: true });
  });

  it('merges describe() output on top of the returned fields', () => {
    const pi = createFakePi();
    const records: PiEventAuditRecord[] = [];
    mountUpUpEventSurface(pi, {
      sink: (record) => records.push(record),
      behaviors: { 'turn_end': () => ({ durationMs: 5 }) },
      describe: { 'turn_end': () => ({ market: 'cn' }) },
    });
    pi.subscriptions.get('turn_end')?.[0]?.({}, {});
    expect(records[0]?.fields).toEqual({ market: 'cn', durationMs: 5 });
  });

  it('works without a sink (no crash, nothing recorded)', () => {
    const pi = createFakePi();
    const result = mountUpUpEventSurface(pi);
    expect(result.mounted).toHaveLength(36);
    expect(() => pi.subscriptions.get('input')?.[0]?.({ text: 'hi' }, {})).not.toThrow();
  });
});
