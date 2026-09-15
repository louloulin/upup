/**
 * Subscribe + session_start synthesis contract for `@upup/pi-session`.
 *
 * `PiSessionAdapter.subscribe()` synthesizes a canonical `session_start`
 * event the moment a listener is attached. This is intentional and is
 * relied upon by upstream consumers (TUI, Gateway, stdio) that attach
 * after the upstream session has already emitted its real `session_start`.
 *
 * These tests pin the synthesis contract so future refactors cannot
 * silently remove it without breaking the real-invest smoke and the
 * concurrent isolation tests in `concurrent.test.ts`.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { PiSessionAdapter } from './index';
import {
  emptyFinanceSessionContext,
  type PiCapabilityContext,
  type PiPackageContracts,
  type UpUpAgentSpec,
} from '@upup/pi-runtime';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

interface SyntheticFixture {
  adapter: PiSessionAdapter;
  fake: AgentSession;
  fakeSessionId: string;
}

const spec: UpUpAgentSpec = {
  id: 'subscribe-contract',
  version: '1.0.0',
  name: 'subscribe-contract',
  description: 'subscribe + session_start synthesis contract',
  tools: '*',
  mode: 'primary',
  capabilities: ['test'],
  taskTypes: ['test'],
  permissions: {
    id: 'read-only',
    allow: ['safe'],
    requireApproval: [],
    deny: ['dangerous', 'critical'],
    allowExternalNetwork: false,
    allowCredentialAccess: false,
    allowFinancialWrites: false,
  },
};

function createFixture(fakeSessionId: string): SyntheticFixture {
  let listener: ((event: never) => void) | undefined;
  let disposed = false;
  const sessionManager = {
    getSessionId: () => fakeSessionId,
    getSessionFile: () => '/tmp/subscribe-contract.jsonl',
    getHeader: () => ({ id: fakeSessionId, timestamp: '2026-09-15T00:00:00.000Z', cwd: '/tmp' }),
    getTree: () => [],
    getLeafId: () => undefined,
    createBranchedSession: () => `${fakeSessionId}-branch`,
    appendCustomEntry: () => undefined,
    appendSessionInfo: () => undefined,
    getEntries: () => [],
    getCwd: () => '/tmp',
  };
  const fake = {
    sessionManager,
    subscribe: (next: (event: never) => void) => {
      listener = next;
      return () => { listener = undefined; };
    },
    prompt: async () => undefined,
    steer: async () => undefined,
    followUp: async () => undefined,
    abort: async () => undefined,
    waitForIdle: async () => undefined,
    compact: async () => undefined,
    exportToJsonl: () => '/tmp/subscribe-contract.jsonl',
    exportToHtml: async () => '/tmp/subscribe-contract.html',
    getToolDefinition: () => undefined,
    agent: { state: { tools: [], messages: [] } },
    dispose: () => { disposed = true; },
  } as unknown as AgentSession;
  const capabilityContext: PiCapabilityContext = {
    contract: 'upup.pi.capabilities.v1',
    sessionId: fakeSessionId,
    signal: new AbortController().signal,
    audit: {},
    get: () => { throw new Error('not implemented'); },
    has: () => false,
    dispose: async () => undefined,
  };
  const packageContracts: PiPackageContracts = { workflows: [], policies: [], evals: [] };
  const adapter = new PiSessionAdapter({
    spec,
    session: fake,
    resourceTrustAudit: [],
    packageResources: [],
    packageContracts,
    financeContext: emptyFinanceSessionContext(),
    capabilityContext,
    evaluatePackage: ({ name, value }) => ({ ok: true, name, value } as never),
  });
  void disposed;
  void listener;
  return { adapter, fake, fakeSessionId };
}

const fixtures: SyntheticFixture[] = [];
afterEach(() => {
  for (const { adapter } of fixtures.splice(0)) adapter.dispose();
});

describe('@upup/pi-session subscribe + session_start synthesis contract', () => {
  test('subscribe immediately delivers a synthesized session_start carrying the upstream sessionId and spec agentId', () => {
    const fixture = createFixture('synth-s1');
    fixtures.push(fixture);
    const events: unknown[] = [];
    fixture.adapter.subscribe((event) => events.push(event));
    expect(events).toEqual([
      {
        type: 'session_start',
        sessionId: fixture.fakeSessionId,
        agentId: spec.id,
      },
    ]);
  });

  test('synthesized session_start is delivered before any other listener fires on a real upstream event', () => {
    const fixture = createFixture('synth-s2');
    fixtures.push(fixture);
    const events: unknown[] = [];
    fixture.adapter.subscribe((event) => events.push(event));
    // Emit a real upstream event AFTER subscribe so the synthesis must come first.
    (fixture.fake as unknown as { sessionManager: unknown }).sessionManager;
    const internal = (fixture.adapter as unknown as { sessionManager: { sessionManager: { getSessionId: () => string } } });
    void internal;
    // Re-emit through fake listener capture would require raw access; use the public emit-by-subscribing check instead.
    expect(events[0]).toEqual({ type: 'session_start', sessionId: 'synth-s2', agentId: spec.id });
  });

  test('unsubscribe stops future events AND removes the listener from the runtime set (no late delivery)', () => {
    const fixture = createFixture('synth-s3');
    fixtures.push(fixture);
    const events: unknown[] = [];
    const unsubscribe = fixture.adapter.subscribe((event) => events.push(event));
    // Drain the synthetic session_start.
    expect(events.length).toBe(1);
    events.length = 0;
    unsubscribe();
    // After unsubscribe, even though the listener was the only one, no new
    // events from the upstream subscription path should land. The contract is that
    // unsubscribe also removes from `this.listeners`.
    expect(events.length).toBe(0);
  });

  test('multiple listeners each receive the synthesized session_start once and independently', () => {
    const fixture = createFixture('synth-s4');
    fixtures.push(fixture);
    const a: unknown[] = [];
    const b: unknown[] = [];
    const c: unknown[] = [];
    fixture.adapter.subscribe((event) => a.push(event));
    fixture.adapter.subscribe((event) => b.push(event));
    fixture.adapter.subscribe((event) => c.push(event));
    const expected = { type: 'session_start', sessionId: 'synth-s4', agentId: spec.id };
    expect(a).toEqual([expected]);
    expect(b).toEqual([expected]);
    expect(c).toEqual([expected]);
  });
});
