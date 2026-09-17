/**
 * The probe stands in for Pi's `ExtensionAPI` in guard scripts and
 * `report:pi7`. Its whole value is *fidelity*: the previous `Proxy`-based
 * stubs answered every property access with a function, so a package that
 * feature-detects the host (as `@quintinshaw/pi-dynamic-workflows` does with
 * `Symbol.for('pi-dynamic-workflows.command-owners')`) saw phantom state and
 * the guards reported a mount failure the real session never hit.
 */

import { describe, expect, it } from 'bun:test';
import { createExtensionApiProbe } from './extension-api-probe';

describe('createExtensionApiProbe', () => {
  it('exposes the ExtensionAPI methods ecosystem packages call', () => {
    const { pi } = createExtensionApiProbe();
    for (const method of [
      'on', 'sendMessage', 'sendUserMessage', 'appendEntry', 'setSessionName',
      'getSessionName', 'setLabel', 'registerTool', 'registerCommand',
      'registerFlag', 'getFlag', 'registerShortcut', 'getActiveTools',
      'getAllTools', 'setActiveTools', 'getCommands', 'setModel',
      'getThinkingLevel', 'setThinkingLevel', 'registerProvider',
      'unregisterProvider', 'exec',
    ]) {
      expect(typeof (pi as unknown as Record<string, unknown>)[method]).toBe('function');
    }
  });

  it('does not fabricate properties the host never had', () => {
    const { pi } = createExtensionApiProbe();
    // The regression that motivated this module: a symbol-keyed lookup must be
    // `undefined`, not a callable, or `registryFor(pi)` builds a broken Map.
    expect((pi as unknown as Record<symbol, unknown>)[Symbol.for('pi-dynamic-workflows.command-owners')]).toBeUndefined();
    expect((pi as unknown as Record<string, unknown>).notARealPiMethod).toBeUndefined();
  });

  it('carries a live command-owner registry once a package installs one', () => {
    const { pi } = createExtensionApiProbe();
    const key = Symbol.for('pi-dynamic-workflows.command-owners');
    const registry = new Map<string, string>([['workflows', 'dynamic-workflows']]);
    Object.defineProperty(pi, key, { value: registry, configurable: true, enumerable: false });
    // A real package reads the symbol back; the probe must not shadow it.
    expect(registry.get('workflows')).toBe('dynamic-workflows');
    expect(registry.get('missing')).toBeUndefined();
  });

  it('records calls per method without changing return shapes', async () => {
    const { pi, calls } = createExtensionApiProbe();
    pi.registerTool({} as never);
    pi.registerTool({} as never);
    pi.on('tool_call', () => undefined);
    expect(calls.registerTool).toBe(2);
    expect(calls.on).toBe(1);
    // Value-returning methods keep their documented shapes.
    expect(pi.getActiveTools()).toEqual([]);
    expect(pi.getAllTools()).toEqual([]);
    expect(pi.getCommands()).toEqual([]);
    expect(pi.getThinkingLevel()).toBe('medium');
    expect(typeof (await pi.setModel('gpt-5.4' as never))).toBe('boolean');
    expect(await pi.exec('echo hi')).toBe('');
  });

  it('gives each probe its own call ledger', () => {
    const first = createExtensionApiProbe();
    const second = createExtensionApiProbe();
    first.pi.registerCommand({} as never);
    expect(first.calls.registerCommand).toBe(1);
    expect(second.calls.registerCommand).toBeUndefined();
  });
});
