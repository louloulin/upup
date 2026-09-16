import { describe, expect, test } from 'bun:test';
import { PiCapabilityRegistry, publishPiCapabilityHosts, registerPiCapabilityHost, resolvePiCapabilityHost } from './src/index';
import { createEventBus } from '@earendil-works/pi-coding-agent';

describe('@upup/pi-capability-registry', () => {
  test('isolates sessions and restores previous registration on dispose', () => {
    const registry = new PiCapabilityRegistry();
    const host = { contract: 'upup.pi.host.v1', packageName: '@upup/test', packageVersion: '0.1.0', sessionId: 'a', capabilities: ['tool-definitions'] };
    const restore = registry.registerSession('a', new Map([[host.packageName, host]]));
    expect(registry.resolve('a', host.packageName)).toBe(host);
    expect(registry.resolve('b', host.packageName)).toBeUndefined();
    expect(registry.snapshot('a').packages[0]).toMatchObject({ name: host.packageName, version: host.packageVersion });
    restore();
    expect(registry.resolve('a', host.packageName)).toBeUndefined();
  });

  test('binds an already active explicit session before session_start', () => {
    const host = { contract: 'upup.pi.host.v1', packageName: '@upup/test', packageVersion: '0.1.0', sessionId: 'active', capabilities: ['tool-definitions'] };
    const events = createEventBus();
    const restore = registerCapabilityHosts(events, 'active', host);
    const registered: unknown[] = [];
    registerPiCapabilityHost({ registerTool: () => {}, events, on: () => {} }, host.packageName, (value) => registered.push(value));
    expect(registered).toEqual([host]);
    restore();
  });

  test('uses event-bus scope instead of process-global active session state', () => {
    const hostA = { contract: 'upup.pi.host.v1', packageName: '@upup/a', packageVersion: '0.1.0', sessionId: 'a', capabilities: ['a'] };
    const hostB = { contract: 'upup.pi.host.v1', packageName: '@upup/a', packageVersion: '0.1.0', sessionId: 'b', capabilities: ['b'] };
    const eventsA = createEventBus();
    const eventsB = createEventBus();
    const releaseA = registerCapabilityHosts(eventsA, 'a', hostA);
    const releaseB = registerCapabilityHosts(eventsB, 'b', hostB);
    expect(resolveCapabilityHost(eventsA, '@upup/a', 'a')).toBe(hostA);
    expect(resolveCapabilityHost(eventsA, '@upup/a', 'b')).toBeUndefined();
    expect(resolveCapabilityHost(eventsB, '@upup/a', 'b')).toBe(hostB);
    releaseA();
    releaseB();
  });

  test('keeps concurrent sessions isolated while active session changes', () => {
    const registry = new PiCapabilityRegistry();
    const hostA = { contract: 'upup.pi.host.v1', packageName: '@upup/a', packageVersion: '0.1.0', sessionId: 'a', capabilities: ['a'] };
    const hostB = { contract: 'upup.pi.host.v1', packageName: '@upup/b', packageVersion: '0.1.0', sessionId: 'b', capabilities: ['b'] };
    const restoreA = registry.registerSession('a', new Map([[hostA.packageName, hostA]]));
    const restoreB = registry.registerSession('b', new Map([[hostB.packageName, hostB]]));

    expect(registry.resolve('a', hostA.packageName)).toBe(hostA);
    expect(registry.resolve('a', hostB.packageName)).toBeUndefined();
    expect(registry.resolve('b', hostB.packageName)).toBe(hostB);
    expect(registry.resolve('b', hostB.packageName)).toBe(hostB);

    restoreB();
    expect(registry.resolve('a', hostA.packageName)).toBe(hostA);
    expect(registry.resolve('b', hostB.packageName)).toBeUndefined();
    restoreA();
    expect(registry.snapshot('a').packages).toEqual([]);
  });

  test('keeps a remaining session active when sessions dispose out of order', () => {
    const registry = new PiCapabilityRegistry();
    const hostA = { contract: 'upup.pi.host.v1', packageName: '@upup/a', packageVersion: '0.1.0', sessionId: 'a', capabilities: ['a'] };
    const hostB = { contract: 'upup.pi.host.v1', packageName: '@upup/b', packageVersion: '0.1.0', sessionId: 'b', capabilities: ['b'] };
    const restoreA = registry.registerSession('a', new Map([[hostA.packageName, hostA]]));
    const restoreB = registry.registerSession('b', new Map([[hostB.packageName, hostB]]));

    restoreA();
    expect(registry.resolve('b', hostB.packageName)).toBe(hostB);
    restoreB();
    expect(registry.resolve(undefined, hostB.packageName)).toBeUndefined();
  });

  test('rejects host records registered under the wrong session or package', () => {
    const registry = new PiCapabilityRegistry();
    expect(() => registry.registerSession('session-a', new Map([
      ['@upup/test', { contract: 'upup.pi.host.v1', packageName: '@upup/other', packageVersion: '0.1.0', sessionId: 'session-a', capabilities: [] }],
    ]))).toThrow('identity mismatch');
    expect(() => registry.registerSession('session-a', new Map([
      ['@upup/test', { contract: 'upup.pi.host.v1', packageName: '@upup/test', packageVersion: '0.1.0', sessionId: 'session-b', capabilities: [] }],
    ]))).toThrow('identity mismatch');
  });
});

import { definePiCapabilityHost } from './src/index';

describe('definePiCapabilityHost (Sprint D self-publish)', () => {
  test('synchronously publishes host and binds providers when pi.session is available', () => {
    const events = createEventBus();
    let registered: { sessionId: string; providers: { tools: string[] } } | undefined;
    definePiCapabilityHost(
      {
        events,
        registerTool: () => {},
        session: { sessionId: 'sync-session' },
      },
      {
        packageName: '@upup/pi-finance-sdk',
        packageVersion: '0.1.0',
        capabilities: ['market-data-transport', 'tool-definitions'],
        providers: { tools: ['financial_search'] },
        register: (services) => { registered = services; },
      },
    );
    expect(registered).toEqual({ sessionId: 'sync-session', providers: { tools: ['financial_search'] } });
    const resolved = resolvePiCapabilityHost(events, '@upup/pi-finance-sdk', 'sync-session');
    expect(resolved?.capabilities).toEqual(['market-data-transport', 'tool-definitions']);
    expect(resolved?.providers).toEqual({ tools: ['financial_search'] });
  });

  test('publishes host after session_start fires when no session id is available', () => {
    const events = createEventBus();
    const sessionStartHandlers: Array<(event: unknown, context: { sessionManager: { getSessionId(): string } }) => void> = [];
    let registered: { sessionId: string; providers: Record<string, unknown> } | undefined;
    definePiCapabilityHost(
      {
        events,
        registerTool: () => {},
        on: (name, handler) => {
          if (name === 'session_start') sessionStartHandlers.push(handler);
          return () => undefined;
        },
      },
      {
        packageName: '@upup/pi-market-data',
        packageVersion: '0.1.0',
        capabilities: ['market-data'],
        providers: { getQuote: () => 42 },
        register: (services) => { registered = services; },
      },
    );
    expect(registered).toBeUndefined();
    sessionStartHandlers[0]?.({}, { sessionManager: { getSessionId: () => 'deferred-session' } });
    expect(registered?.sessionId).toBe('deferred-session');
    const resolved = resolvePiCapabilityHost(events, '@upup/pi-market-data', 'deferred-session');
    expect(resolved?.providers.getQuote()).toBe(42);
  });

  test('idempotent: subsequent session_start events do not re-publish', () => {
    const events = createEventBus();
    const handlers: Array<(event: unknown, context: { sessionManager: { getSessionId(): string } }) => void> = [];
    let callCount = 0;
    definePiCapabilityHost(
      {
        events,
        registerTool: () => {},
        on: (name, handler) => { if (name === 'session_start') handlers.push(handler); return () => undefined; },
      },
      {
        packageName: '@upup/pi-risk',
        packageVersion: '0.1.0',
        capabilities: ['risk'],
        providers: { evaluateRisk: () => 'low' },
        register: () => { callCount += 1; },
      },
    );
    handlers[0]?.({}, { sessionManager: { getSessionId: () => 's1' } });
    handlers[0]?.({}, { sessionManager: { getSessionId: () => 's2' } });
    expect(callCount).toBe(1);
  });

  test('gracefully skips when neither pi.session nor pi.on is available', () => {
    const events = createEventBus();
    let registerCalled = false;
    const dispose = definePiCapabilityHost(
      { events, registerTool: () => {} },
      {
        packageName: '@upup/pi-portfolio',
        packageVersion: '0.1.0',
        capabilities: ['portfolio'],
        providers: {},
        register: () => { registerCalled = true; },
      },
    );
    // Without lifecycle hooks, the host is NOT published and `register`
    // is NOT invoked. This lets unit tests stub `pi` without a session
    // and still have the extension factory run.
    expect(registerCalled).toBe(false);
    expect(typeof dispose).toBe('function');
    expect(resolvePiCapabilityHost(events, '@upup/pi-portfolio', undefined)).toBeUndefined();
  });

  test('uses provided contract id when supplied', () => {
    const events = createEventBus();
    definePiCapabilityHost(
      { events, registerTool: () => {}, session: { sessionId: 'c-session' } },
      {
        packageName: '@upup/pi-investment-workflow',
        packageVersion: '0.1.0',
        capabilities: ['investment-workflow'],
        contract: 'upup.pi.workflow.v1',
        providers: { run: () => undefined },
        register: () => undefined,
      },
    );
    const resolved = resolvePiCapabilityHost(events, '@upup/pi-investment-workflow', 'c-session');
    expect(resolved?.contract).toBe('upup.pi.workflow.v1');
  });
});

function registerCapabilityHosts(events: ReturnType<typeof createEventBus>, sessionId: string, host: { contract: string; packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[] }): () => void {
  return publishPiCapabilityHosts(events, sessionId, new Map([[host.packageName, host]]));
}

function resolveCapabilityHost(events: ReturnType<typeof createEventBus>, packageName: string, sessionId: string): unknown {
  return resolvePiCapabilityHost(events, packageName, sessionId);
}
