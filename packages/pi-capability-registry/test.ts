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

function registerCapabilityHosts(events: ReturnType<typeof createEventBus>, sessionId: string, host: { contract: string; packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[] }): () => void {
  return publishPiCapabilityHosts(events, sessionId, new Map([[host.packageName, host]]));
}

function resolveCapabilityHost(events: ReturnType<typeof createEventBus>, packageName: string, sessionId: string): unknown {
  return resolvePiCapabilityHost(events, packageName, sessionId);
}
