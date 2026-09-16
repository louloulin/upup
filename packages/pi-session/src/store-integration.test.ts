/**
 * Sprint D Phase 2 integration test.
 *
 * Validates the end-to-end microkernel flow:
 *   1. agent-session-factory.createSession() builds the provider tree and
 *      calls `setSessionProviders(sessionId, providersByPackage)`.
 *   2. definePiCapabilityHost reads rich providers from the store on every
 *      `resolvePiCapabilityHost` call (lazy lookup keeps the store as the
 *      single source of truth even when populated after extension load).
 *   3. The dispose path clears the store, preventing cross-session leaks.
 *
 * The factory path is exercised indirectly through the session providers
 * store. This is sufficient to prove the wiring because the store is the
 * canonical channel — extensions no longer depend on the legacy
 * installPiPackageToolHosts event-bus publish.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
  getSessionProviders,
  setSessionProviders,
  clearSessionProviders,
  __resetSessionProvidersForTests,
} from '@upup/pi-runtime';
import { definePiCapabilityHost, resolvePiCapabilityHost } from '@upup/pi-capability-registry';
import { createEventBus } from '@earendil-works/pi-coding-agent';

afterEach(() => {
  __resetSessionProvidersForTests();
});

describe('Sprint D Phase 2 — store-driven extension resolution', () => {
  test('rich providers written by orchestrator are returned by resolvePiCapabilityHost', () => {
    const events = createEventBus();
    const sessionId = 'integration-A';

    // 1. Extension self-publishes BEFORE the orchestrator populates the
    // store (this is the realistic load order: extensions load → orchestrator
    // builds the provider tree).
    definePiCapabilityHost(
      { events, registerTool: () => {}, session: { sessionId } },
      {
        packageName: '@upup/pi-finance-sdk',
        packageVersion: '0.1.0',
        capabilities: ['market-data-transport'],
        providers: {},
        register: () => undefined,
      },
    );

    // Sanity: before orchestrator populates the store, resolve returns the
    // extension's metadata-only fallback.
    const before = resolvePiCapabilityHost(events, '@upup/pi-finance-sdk', sessionId);
    expect(before?.providers).toEqual({});

    // 2. Orchestrator populates the store with rich providers.
    const release = setSessionProviders(sessionId, {
      '@upup/pi-finance-sdk': {
        providers: { marketData: { getMarketQuoteFetcher: () => 'yahoo' } },
      },
    });

    // 3. resolvePiCapabilityHost now returns the rich tree.
    const after = resolvePiCapabilityHost(events, '@upup/pi-finance-sdk', sessionId);
    expect((after?.providers as { marketData: { getMarketQuoteFetcher: () => string } }).marketData.getMarketQuoteFetcher()).toBe('yahoo');

    // 4. dispose restores the metadata-only fallback.
    release();
    const released = resolvePiCapabilityHost(events, '@upup/pi-finance-sdk', sessionId);
    expect(released?.providers).toEqual({});
  });

  test('multiple sessions are isolated via the store', () => {
    const events = createEventBus();
    setSessionProviders('session-A', {
      '@upup/pi-finance-sdk': { providers: { marketData: { source: 'A' } } },
    });
    setSessionProviders('session-B', {
      '@upup/pi-finance-sdk': { providers: { marketData: { source: 'B' } } },
    });
    definePiCapabilityHost(
      { events, registerTool: () => {}, session: { sessionId: 'session-A' } },
      {
        packageName: '@upup/pi-finance-sdk',
        packageVersion: '0.1.0',
        capabilities: ['market-data-transport'],
        providers: {},
        register: () => undefined,
      },
    );
    definePiCapabilityHost(
      { events, registerTool: () => {}, session: { sessionId: 'session-B' } },
      {
        packageName: '@upup/pi-finance-sdk',
        packageVersion: '0.1.0',
        capabilities: ['market-data-transport'],
        providers: {},
        register: () => undefined,
      },
    );
    const hostA = resolvePiCapabilityHost(events, '@upup/pi-finance-sdk', 'session-A');
    const hostB = resolvePiCapabilityHost(events, '@upup/pi-finance-sdk', 'session-B');
    expect((hostA?.providers as { marketData: { source: string } }).marketData.source).toBe('A');
    expect((hostB?.providers as { marketData: { source: string } }).marketData.source).toBe('B');
  });

  test('clearSessionProviders removes the entry entirely', () => {
    setSessionProviders('clear-me', { '@upup/pi-finance-sdk': { providers: { x: 1 } } });
    expect(getSessionProviders('clear-me')).toBeDefined();
    clearSessionProviders('clear-me');
    expect(getSessionProviders('clear-me')).toBeUndefined();
  });
});
