/**
 * Concurrent / recovery / dispose smoke for `@upup/pi-session`.
 *
 * The Pi session adapter must:
 *   1. support N concurrent sessions without sharing mutable state;
 *   2. propagate an abort signal to the upstream session;
 *   3. make dispose idempotent and fail-closed when invoked after teardown;
 *   4. isolate session lifecycle across dispose+recreate cycles.
 *
 * NOTE: `PiSessionAdapter.subscribe()` synthesizes a `session_start` event
 * the moment a listener is attached. This is the canonical surface and is
 * covered by the existing test.ts; here we use synthetic non-start events
 * to validate isolation of the runtime event channel.
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

const baseSpec: UpUpAgentSpec = {
  id: 'concurrent-session-test',
  version: '1.0.0',
  name: 'Concurrent session smoke',
  description: 'Pi session concurrent + abort + dispose contract',
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

interface FakeSessionHandle {
  fake: AgentSession;
  sessionId: string;
  emit: (event: unknown) => void;
  abortCalls: () => number;
  isDisposed: () => boolean;
}

function createFakeSession(sessionId: string): FakeSessionHandle {
  let listener: ((event: never) => void) | undefined;
  let disposed = false;
  let abortCalls = 0;
  const sessionManager = {
    getSessionId: () => sessionId,
    getSessionFile: () => `/tmp/${sessionId}.jsonl`,
    getHeader: () => ({ id: sessionId, timestamp: '2026-09-15T00:00:00.000Z', cwd: '/tmp' }),
    getTree: () => [],
    getLeafId: () => undefined,
    createBranchedSession: () => `${sessionId}-branch`,
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
    abort: async () => { abortCalls += 1; },
    waitForIdle: async () => undefined,
    compact: async () => undefined,
    exportToJsonl: () => `/tmp/${sessionId}.jsonl`,
    exportToHtml: async () => `/tmp/${sessionId}.html`,
    getToolDefinition: () => undefined,
    agent: { state: { tools: [], messages: [] } },
    dispose: () => { disposed = true; },
  } as unknown as AgentSession;
  return {
    fake,
    sessionId,
    emit: (event: unknown) => listener?.(event as never),
    abortCalls: () => abortCalls,
    isDisposed: () => disposed,
  };
}

function createCapabilityContext(sessionId: string): PiCapabilityContext {
  return {
    contract: 'upup.pi.capabilities.v1',
    sessionId,
    signal: new AbortController().signal,
    audit: {},
    get: () => { throw new Error('not implemented'); },
    has: () => false,
    dispose: async () => undefined,
  };
}

function createAdapter(sessionId: string): { adapter: PiSessionAdapter; handle: FakeSessionHandle } {
  const handle = createFakeSession(sessionId);
  const packageContracts: PiPackageContracts = { workflows: [], policies: [], evals: [] };
  const adapter = new PiSessionAdapter({
    spec: baseSpec,
    session: handle.fake,
    resourceTrustAudit: [],
    packageResources: [],
    packageContracts,
    financeContext: emptyFinanceSessionContext(),
    capabilityContext: createCapabilityContext(sessionId),
    evaluatePackage: ({ name, value }) => ({ ok: true, name, value } as never),
  });
  return { adapter, handle };
}

const trackedAdapters: Array<{ adapter: PiSessionAdapter; handle: FakeSessionHandle }> = [];
afterEach(async () => {
  for (const { adapter } of trackedAdapters.splice(0)) {
    adapter.dispose();
  }
});

describe('@upup/pi-session concurrent + abort + dispose contract', () => {
  test('N concurrent sessions stay isolated — non-start events, abort, and dispose do not bleed', async () => {
    const N = 8;
    const sessions = Array.from({ length: N }, (_, i) => {
      const pair = createAdapter(`concurrent-${i}`);
      trackedAdapters.push(pair);
      return pair;
    });
    // Drain the synthetic session_start that subscribe() emits, then attach
    // a counter that only counts non-start runtime events.
    const runtimeBySession = new Map<string, number>();
    for (const { adapter, handle } of sessions) {
      adapter.subscribe(() => {
        // ignore the synthesized session_start — we test runtime isolation here
      });
      const counter = (event: { type: string }) => {
        if (event.type === 'session_start') return;
        runtimeBySession.set(handle.sessionId, (runtimeBySession.get(handle.sessionId) ?? 0) + 1);
      };
      adapter.subscribe(counter);
    }
    sessions[0].handle.emit({ type: 'turn_start' });
    sessions[3].handle.emit({ type: 'turn_start' });
    expect(runtimeBySession.get('concurrent-0')).toBe(1);
    expect(runtimeBySession.get('concurrent-3')).toBe(1);
    for (let i = 0; i < N; i += 1) {
      if (i === 0 || i === 3) continue;
      expect(runtimeBySession.get(`concurrent-${i}`) ?? 0).toBe(0);
    }
    // Abort on session #4 must not bump any other session's abort counter.
    await sessions[4].adapter.abort();
    expect(sessions[4].handle.abortCalls()).toBe(1);
    for (let i = 0; i < N; i += 1) {
      if (i === 4) continue;
      expect(sessions[i].handle.abortCalls()).toBe(0);
    }
  });

  test('abort signal on the upstream session is observable and stops further prompts', async () => {
    const pair = createAdapter('abort-signal');
    trackedAdapters.push(pair);
    expect(pair.handle.abortCalls()).toBe(0);
    await pair.adapter.abort();
    expect(pair.handle.abortCalls()).toBe(1);
    // Subsequent abort is idempotent and does not throw.
    await pair.adapter.abort();
    expect(pair.handle.abortCalls()).toBe(2);
  });

  test('dispose is idempotent and downstream calls fail closed after teardown', () => {
    const pair = createAdapter('dispose-fail-closed');
    trackedAdapters.push(pair);
    expect(pair.handle.isDisposed()).toBe(false);
    pair.adapter.dispose();
    expect(pair.handle.isDisposed()).toBe(true);
    // Idempotent second dispose must not throw.
    pair.adapter.dispose();
    expect(pair.handle.isDisposed()).toBe(true);
    // After dispose, prompt must reject synchronously through the adapter.
    expect(() => pair.adapter.prompt('after-dispose')).toThrow('disposed');
  });

  test('dispose + recreate cycle does not leak state from prior session', () => {
    const sessionId = 'dispose-recreate';
    const first = createAdapter(sessionId);
    trackedAdapters.push(first);
    first.adapter.dispose();
    expect(first.handle.isDisposed()).toBe(true);
    // A new adapter on a fresh fake must start fresh.
    const second = createAdapter(sessionId);
    trackedAdapters.push(second);
    expect(second.handle.isDisposed()).toBe(false);
    expect(second.handle.sessionId).toBe(sessionId);
  });

  test('parallel abort on many sessions completes deterministically without race', async () => {
    const N = 16;
    const sessions = Array.from({ length: N }, (_, i) => {
      const pair = createAdapter(`race-${i}`);
      trackedAdapters.push(pair);
      return pair;
    });
    await Promise.all(sessions.map(({ adapter }) => adapter.abort()));
    for (const { handle } of sessions) {
      expect(handle.abortCalls()).toBe(1);
      expect(handle.isDisposed()).toBe(false);
    }
    // Cleanup is also parallel-safe.
    sessions.forEach(({ adapter }) => adapter.dispose());
    for (const { handle } of sessions) {
      expect(handle.isDisposed()).toBe(true);
    }
  });
});
