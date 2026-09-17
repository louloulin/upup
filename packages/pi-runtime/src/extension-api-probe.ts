/**
 * Canonical fake `ExtensionAPI` for guard scripts, `report:pi7` and tests.
 *
 * Why this is shared rather than duplicated:
 *   Three call sites used to each build their own stand-in — a `Proxy` in
 *   `scripts/check-pi-ecosystem-deps.ts`, another in
 *   `scripts/report-pi7-architecture.ts`, and a plain object in
 *   `ecosystem-extension.test.ts`. The two `Proxy` versions answered *every*
 *   property access with a function, which is not a valid `ExtensionAPI`:
 *   `registryFor(pi)` in `@quintinshaw/pi-dynamic-workflows` reads
 *   `carrier[Symbol.for('pi-dynamic-workflows.command-owners')]` and got a
 *   truthy function back instead of `undefined`, then crashed on
 *   `registry.get(name)`. The guards therefore reported a mount failure for a
 *   package that mounts fine in the real session, and the registry was
 *   "verified" against a stub nobody ships.
 *
 *   Building the stand-in from the real method list keeps every consumer
 *   honest: a package that only works because an unexpected property existed
 *   now fails the guard instead of the session.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Per-method call counters, so tests can assert what a package registered. */
export type ExtensionApiProbeCalls = Record<string, number>;

export interface ExtensionApiProbe {
  readonly pi: ExtensionAPI;
  readonly calls: ExtensionApiProbeCalls;
}

/**
 * Build a fake `ExtensionAPI` whose methods are all real, own properties.
 *
 * Methods that Pi's `ExtensionAPI` contract says return a value return a
 * benign value (`[]`, `undefined`, `'medium'`); every mutator records a call
 * count. Unknown properties are *absent* — matching a real API object, so
 * feature detection such as `typeof pi.someNewHook === 'function'` behaves
 * the way it does at runtime.
 */
export function createExtensionApiProbe(): ExtensionApiProbe {
  const calls: ExtensionApiProbeCalls = {};
  const record = (name: string): void => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const noop = (name: string) => (): void => { record(name); };

  const pi = {
    on: noop('on'),
    sendMessage: noop('sendMessage'),
    sendUserMessage: noop('sendUserMessage'),
    appendEntry: noop('appendEntry'),
    setSessionName: noop('setSessionName'),
    getSessionName: () => undefined,
    setLabel: noop('setLabel'),
    registerTool: noop('registerTool'),
    registerCommand: noop('registerCommand'),
    registerFlag: noop('registerFlag'),
    getFlag: () => undefined,
    registerShortcut: noop('registerShortcut'),
    registerMarkdownTransformer: noop('registerMarkdownTransformer'),
    registerMessageRenderer: noop('registerMessageRenderer'),
    registerEntryRenderer: noop('registerEntryRenderer'),
    getActiveTools: () => [],
    getAllTools: () => [],
    setActiveTools: noop('setActiveTools'),
    getCommands: () => [],
    setModel: async () => true,
    getThinkingLevel: () => 'medium' as const,
    setThinkingLevel: noop('setThinkingLevel'),
    registerProvider: noop('registerProvider'),
    unregisterProvider: noop('unregisterProvider'),
    events: { on: noop('events.on') },
    exec: async () => '',
  } as unknown as ExtensionAPI;

  return { pi, calls };
}
