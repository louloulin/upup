import { describe, expect, test } from 'bun:test';
import { defaultPiCapabilityRegistry, PiCapabilityRegistry, registerPiCapabilityHost } from './src/index.js';

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
    const restore = defaultPiCapabilityRegistry.registerSession('active', new Map([[host.packageName, host]]));
    const registered: unknown[] = [];
    registerPiCapabilityHost({ registerTool: () => {}, on: () => {} }, host.packageName, (value) => registered.push(value));
    expect(registered).toEqual([host]);
    restore();
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
    expect(registry.resolve(undefined, hostB.packageName)).toBe(hostB);

    restoreB();
    expect(registry.resolve(undefined, hostA.packageName)).toBe(hostA);
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
    expect(registry.resolve(undefined, hostB.packageName)).toBe(hostB);
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
