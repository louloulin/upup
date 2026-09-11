import { describe, expect, it } from 'bun:test';
import { createPiMain, type PiLoader, type PiExtensionFactoryEntry } from './pi-main.js';

describe('pi main entry', () => {
  it('exposes the built-in pi extensions', () => {
    const main = createPiMain({ extensions: [] });

    expect(main.extensions).toEqual(['realtime', 'daemon']);
    expect(typeof main.load).toBe('function');
  });

  it('loads the built-in extensions and records their registered tools/commands', () => {
    const main = createPiMain({ extensions: [] });
    const loaded = main.load();

    expect(loaded.length).toBe(2);

    const realtime = loaded.find((ext) => ext.name === 'realtime');
    const daemon = loaded.find((ext) => ext.name === 'daemon');

    expect(realtime).toBeDefined();
    expect(daemon).toBeDefined();

    expect(realtime!.registeredTools).toContain('realtime_status');
    expect(realtime!.registeredCommands).toContain('realtime');

    expect(daemon!.registeredTools).toContain('daemon_stats');
    expect(daemon!.registeredCommands).toContain('daemon');
  });

  it('exposes Pi ExtensionFactory entries that can be loaded by a Pi loader', () => {
    const main = createPiMain({ extensions: [] });

    expect(typeof main.extensionFactories).toBe('function');

    const factories = main.extensionFactories();
    expect(factories.length).toBe(2);

    const realtime = factories.find((f) => f.name === 'realtime');
    const daemon = factories.find((f) => f.name === 'daemon');

    expect(typeof realtime?.factory).toBe('function');
    expect(typeof daemon?.factory).toBe('function');
  });

  it('loadWith runs each built-in factory through a real Pi api and forwards the result to the loader', async () => {
    const main = createPiMain({ extensions: [] });
    const capturedApis: unknown[] = [];

    const fakeLoader: PiLoader = {
      async loadExtensionFromFactory(entry, api) {
        capturedApis.push(api);
        const result = await entry.factory(api);
        return { ok: true, result };
      },
    };

    const result = await main.loadWith(fakeLoader);

    expect(result.length).toBe(2);
    expect(capturedApis.length).toBe(2);

    for (const api of capturedApis) {
      const recorded = api as {
        registeredTools: Array<{ name: string; execute?: (...args: unknown[]) => unknown }>;
        registeredCommands: string[];
      };
      expect(Array.isArray(recorded.registeredTools)).toBe(true);
      expect(Array.isArray(recorded.registeredCommands)).toBe(true);
    }

    const realtimeApi = capturedApis[0] as {
      registeredTools: Array<{ name: string }>;
      registeredCommands: string[];
    };
    const daemonApi = capturedApis[1] as {
      registeredTools: Array<{ name: string }>;
      registeredCommands: string[];
    };

    const realtimeTools = new Set([
      ...realtimeApi.registeredTools.map((t) => t.name),
      ...daemonApi.registeredTools.map((t) => t.name),
    ]);
    const realtimeCommands = new Set([
      ...realtimeApi.registeredCommands,
      ...daemonApi.registeredCommands,
    ]);

    expect(realtimeTools.has('realtime_status')).toBe(true);
    expect(realtimeTools.has('daemon_stats')).toBe(true);
    expect(realtimeCommands.has('realtime')).toBe(true);
    expect(realtimeCommands.has('daemon')).toBe(true);

    for (const entry of result) {
      expect(entry.ok).toBe(true);
    }
  });

  it('loadWith exposes the registered tools so a loader can invoke them end-to-end', async () => {
    const main = createPiMain({ extensions: [] });
    const toolExecutions: Array<{ name: string; resultText: string }> = [];

    const fakeLoader: PiLoader = {
      async loadExtensionFromFactory(entry, api) {
        const recorded = api as {
          registeredTools: Array<{ name: string; execute: (...args: unknown[]) => Promise<{ content: Array<{ type: string; text: string }> }> }>;
        };
        await entry.factory(api);
        for (const tool of recorded.registeredTools) {
          const result = await tool.execute({ symbol: '600519' });
          toolExecutions.push({ name: tool.name, resultText: result.content[0]?.text ?? '' });
        }
        return { ok: true };
      },
    };

    const result = await main.loadWith(fakeLoader);
    expect(result.length).toBe(2);

    const realtime = toolExecutions.find((t) => t.name === 'realtime_quote');
    expect(realtime).toBeDefined();
    expect(realtime!.resultText).toContain('600519');
  });

  it('loadWith returns each extension with its registered tools and commands', async () => {
    const main = createPiMain({ extensions: [] });

    const fakeLoader: PiLoader = {
      async loadExtensionFromFactory(entry, api) {
        const recorded = api as {
          registeredTools: Array<{ name: string }>;
          registeredCommands: string[];
        };
        await entry.factory(api);
        return {
          ok: true,
          tools: recorded.registeredTools.map((t) => t.name),
          commands: [...recorded.registeredCommands],
        };
      },
    };

    const result = await main.loadWith(fakeLoader);

    expect(result.length).toBe(2);

    const realtime = result.find((r) => r.name === 'realtime');
    const daemon = result.find((r) => r.name === 'daemon');

    expect(realtime).toBeDefined();
    expect(daemon).toBeDefined();

    expect(realtime!.tools).toContain('realtime_status');
    expect(realtime!.tools).toContain('realtime_quote');
    expect(realtime!.commands).toContain('realtime');

    expect(daemon!.tools).toContain('daemon_stats');
    expect(daemon!.commands).toContain('daemon');

    for (const entry of result) {
      expect(entry.ok).toBe(true);
    }
  });
});

