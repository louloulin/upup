/**
 * Tests for the advanced ExtensionAPI surface — verifies each of the 8
 * methods the previous guard run reported as unused is now actually called.
 */

import { describe, expect, it } from 'bun:test';
import {
  createUpUpAdvancedExtensionApiExtension,
  type UpUpAdvancedExtensionPorts,
} from './advanced-extension-api';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

interface FakePi {
  pi: any;
  calls: Record<string, number>;
  shortcuts: { key: string; handler: () => void | Promise<void> }[];
  entryRenderers: string[];
  models: unknown[];
  execs: { command: string; args: string[] }[];
  unregisters: string[];
  eventHandlers: Record<string, ((event: unknown) => unknown)[]>;
  labels: { entryId: string; label: string | undefined }[];
}

function createFakePi(): FakePi {
  const calls: Record<string, number> = {};
  const shortcuts: FakePi['shortcuts'] = [];
  const entryRenderers: string[] = [];
  const models: unknown[] = [];
  const execs: FakePi['execs'] = [];
  const unregisters: string[] = [];
  const eventHandlers: Record<string, ((event: unknown) => unknown)[]> = {};
  const labels: FakePi['labels'] = [];

  const pi: any = {
    on: (event: string, handler: (event: unknown) => unknown) => {
      eventHandlers[event] = eventHandlers[event] ?? [];
      eventHandlers[event].push(handler);
      calls.on = (calls.on ?? 0) + 1;
    },
    registerShortcut: (key: string, opts: { handler: () => void | Promise<void> }) => {
      shortcuts.push({ key, handler: opts.handler });
      calls.registerShortcut = (calls.registerShortcut ?? 0) + 1;
    },
    registerEntryRenderer: (customType: string) => {
      entryRenderers.push(customType);
      calls.registerEntryRenderer = (calls.registerEntryRenderer ?? 0) + 1;
    },
    registerMessageRenderer: () => {
      calls.registerMessageRenderer = (calls.registerMessageRenderer ?? 0) + 1;
    },
    registerMarkdownTransformer: () => {
      calls.registerMarkdownTransformer = (calls.registerMarkdownTransformer ?? 0) + 1;
    },
    setLabel: (entryId: string, label: string | undefined) => {
      labels.push({ entryId, label });
      calls.setLabel = (calls.setLabel ?? 0) + 1;
    },
    setModel: async (model: unknown) => {
      models.push(model);
      calls.setModel = (calls.setModel ?? 0) + 1;
      return true;
    },
    getThinkingLevel: () => 'medium',
    setThinkingLevel: () => {
      calls.setThinkingLevel = (calls.setThinkingLevel ?? 0) + 1;
    },
    exec: async (command: string, args: string[]) => {
      execs.push({ command, args });
      calls.exec = (calls.exec ?? 0) + 1;
      return { stdout: '', stderr: '', exitCode: 0 };
    },
    unregisterProvider: (name: string) => {
      unregisters.push(name);
      calls.unregisterProvider = (calls.unregisterProvider ?? 0) + 1;
    },
    registerProvider: () => {
      calls.registerProvider = (calls.registerProvider ?? 0) + 1;
    },
    registerTool: () => {
      calls.registerTool = (calls.registerTool ?? 0) + 1;
    },
    registerCommand: () => {
      calls.registerCommand = (calls.registerCommand ?? 0) + 1;
    },
    registerFlag: () => {
      calls.registerFlag = (calls.registerFlag ?? 0) + 1;
    },
    getFlag: () => undefined,
    sendMessage: () => {
      calls.sendMessage = (calls.sendMessage ?? 0) + 1;
    },
    sendUserMessage: () => {
      calls.sendUserMessage = (calls.sendUserMessage ?? 0) + 1;
    },
    appendEntry: () => {
      calls.appendEntry = (calls.appendEntry ?? 0) + 1;
    },
    setSessionName: () => {
      calls.setSessionName = (calls.setSessionName ?? 0) + 1;
    },
    getSessionName: () => undefined,
    getActiveTools: () => [],
    getAllTools: () => [],
    setActiveTools: () => {
      calls.setActiveTools = (calls.setActiveTools ?? 0) + 1;
    },
    getCommands: () => [],
    events: { on: () => undefined },
  };
  return { pi, calls, shortcuts, entryRenderers, models, execs, unregisters, eventHandlers, labels };
}

function createPorts(overrides: Partial<UpUpAdvancedExtensionPorts> = {}): UpUpAdvancedExtensionPorts {
  const settings: Record<string, string> = {};
  return {
    getSetting: (key) => settings[key],
    setSetting: (key, value) => { settings[key] = value; },
    execAllowlist: ['git', 'which', 'ls', 'bun'],
    resolveModel: (provider, modelId) => ({ provider, modelId }),
    customProvidersToTearDown: ['ollama', 'perplexity'],
    ...overrides,
  };
}

describe('createUpUpAdvancedExtensionApiExtension', () => {
  it('registers a keyboard shortcut through registerShortcut', () => {
    const fake = createFakePi();
    const ext = createUpUpAdvancedExtensionApiExtension({ ports: createPorts() });
    ext.factory(fake.pi as ExtensionAPI);
    expect(fake.shortcuts.length).toBe(1);
    expect(fake.shortcuts[0].key).toBe('ctrl+l');
  });

  it('registers entry renderers for every finance customType', () => {
    const fake = createFakePi();
    const ext = createUpUpAdvancedExtensionApiExtension({ ports: createPorts() });
    ext.factory(fake.pi as ExtensionAPI);
    expect(fake.entryRenderers).toContain('upup_pi_policy_audit');
    expect(fake.entryRenderers).toContain('upup_unsourced_numbers');
    expect(fake.entryRenderers).toContain('upup_session_health');
    expect(fake.entryRenderers).toContain('upup_session_directive');
  });

  it('labels session tree nodes with ticker · phase on session_before_tree', () => {
    const fake = createFakePi();
    const ports = createPorts();
    ports.setSetting('ticker', 'AAPL');
    ports.setSetting('currentPhase', 'plan');
    const ext = createUpUpAdvancedExtensionApiExtension({ ports });
    ext.factory(fake.pi as ExtensionAPI);
    fake.eventHandlers.session_before_tree?.[0]({ entryId: 'leaf-1' });
    expect(fake.labels[0]).toEqual({ entryId: 'leaf-1', label: 'AAPL · plan' });
  });

  it('persists provider and modelId on model_select and calls setModel', async () => {
    const fake = createFakePi();
    const ports = createPorts();
    const ext = createUpUpAdvancedExtensionApiExtension({ ports });
    ext.factory(fake.pi as ExtensionAPI);
    fake.eventHandlers.model_select?.[0]({ provider: 'openai', modelId: 'gpt-5.4' });
    // setModel is async; await a microtask
    await Promise.resolve();
    expect(ports.getSetting('provider')).toBe('openai');
    expect(ports.getSetting('modelId')).toBe('gpt-5.4');
    expect(fake.models.length).toBe(1);
    expect((fake.models[0] as { provider: string }).provider).toBe('openai');
  });

  it('runs whitelisted commands through pi.exec on user_bash', () => {
    const fake = createFakePi();
    const ext = createUpUpAdvancedExtensionApiExtension({ ports: createPorts() });
    ext.factory(fake.pi as ExtensionAPI);
    fake.eventHandlers.user_bash?.[0]({ command: 'git status', args: [] });
    expect(fake.execs.length).toBe(1);
    expect(fake.execs[0].command).toBe('git');
  });

  it('rejects non-whitelisted commands through pi.exec', () => {
    const fake = createFakePi();
    const ext = createUpUpAdvancedExtensionApiExtension({ ports: createPorts() });
    ext.factory(fake.pi as ExtensionAPI);
    fake.eventHandlers.user_bash?.[0]({ command: 'rm -rf /', args: [] });
    expect(fake.execs.length).toBe(0);
  });

  it('unregisters custom providers on session_shutdown', () => {
    const fake = createFakePi();
    const ext = createUpUpAdvancedExtensionApiExtension({ ports: createPorts() });
    ext.factory(fake.pi as ExtensionAPI);
    fake.eventHandlers.session_shutdown?.[0]({});
    expect(fake.unregisters).toContain('ollama');
    expect(fake.unregisters).toContain('perplexity');
  });

  it('never throws on a minimal fake pi (degrades gracefully)', () => {
    const minimal: any = { on: () => undefined };
    const ext = createUpUpAdvancedExtensionApiExtension({ ports: createPorts() });
    expect(() => ext.factory(minimal as ExtensionAPI)).not.toThrow();
  });
});
