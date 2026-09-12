import { describe, expect, it } from 'bun:test';
import {
  createPiMain,
  createFakeApi,
  createPiLoader,
  type PiLoader,
  type PiExtensionFactoryEntry,
  type PiFakeApi,
} from './pi-main.js';

describe('pi main entry', () => {
  it('exposes the built-in pi extensions', () => {
    const main = createPiMain({ extensions: [] });

    expect(main.extensions).toEqual(['realtime', 'daemon', 'config']);
    expect(typeof main.load).toBe('function');
  });

  it('loads the built-in extensions and records their registered tools/commands', () => {
    const main = createPiMain({ extensions: [] });
    const loaded = main.load();

    expect(loaded.length).toBe(3);

    const realtime = loaded.find((ext) => ext.name === 'realtime');
    const daemon = loaded.find((ext) => ext.name === 'daemon');
    const config = loaded.find((ext) => ext.name === 'config');

    expect(realtime).toBeDefined();
    expect(daemon).toBeDefined();
    expect(config).toBeDefined();

    expect(realtime!.registeredTools.map((t) => t.name)).toContain('realtime_status');
    expect(realtime!.registeredCommands.map((c) => c.name)).toContain('realtime');

    expect(daemon!.registeredTools.map((t) => t.name)).toContain('daemon_stats');
    expect(daemon!.registeredCommands.map((c) => c.name)).toContain('daemon');

    expect(config!.registeredTools.map((t) => t.name)).toEqual([
      'config_get',
      'config_set',
      'config_list',
    ]);
  });

  it('exposes Pi ExtensionFactory entries that can be loaded by a Pi loader', () => {
    const main = createPiMain({ extensions: [] });

    expect(typeof main.extensionFactories).toBe('function');

    const factories = main.extensionFactories();
    expect(factories.length).toBe(3);

    const realtime = factories.find((f) => f.name === 'realtime');
    const daemon = factories.find((f) => f.name === 'daemon');
    const config = factories.find((f) => f.name === 'config');

    expect(typeof realtime?.factory).toBe('function');
    expect(typeof daemon?.factory).toBe('function');
    expect(typeof config?.factory).toBe('function');
  });

  it('loadWith runs each built-in factory through a real Pi api and forwards the result to the loader', async () => {
    const main = createPiMain({ extensions: [] });
    const capturedApis: PiFakeApi[] = [];

    const fakeLoader: PiLoader = {
      async loadExtensionFromFactory(entry, pi) {
        capturedApis.push(pi);
        const result = await entry.factory(pi);
        return { ok: true, result };
      },
    };

    const result = await main.loadWith(fakeLoader);

    expect(result.length).toBe(3);
    expect(capturedApis.length).toBe(3);

    for (const api of capturedApis) {
      // The fake api exposes the full upup extension contract surface.
      expect(Array.isArray(api.tools)).toBe(true);
      expect(Array.isArray(api.commands)).toBe(true);
      expect(Array.isArray(api.subscribedEvents)).toBe(true);
      expect(Array.isArray(api.shortcuts)).toBe(true);
      expect(Array.isArray(api.flags)).toBe(true);
      expect(typeof api.on).toBe('function');
      expect(typeof api.registerTool).toBe('function');
      expect(typeof api.registerCommand).toBe('function');
      expect(typeof api.sendMessage).toBe('function');
      expect(typeof api.sendUserMessage).toBe('function');
      expect(typeof api.appendEntry).toBe('function');
      expect(typeof api.setSessionName).toBe('function');
      expect(typeof api.getActiveTools).toBe('function');
      expect(typeof api.getAllTools).toBe('function');
      expect(typeof api.getCommands).toBe('function');
      expect(typeof api.setModel).toBe('function');
      expect(typeof api.getThinkingLevel).toBe('function');
      expect(typeof api.setThinkingLevel).toBe('function');
      expect(typeof api.registerProvider).toBe('function');
      expect(typeof api.unregisterProvider).toBe('function');
      expect(typeof api.exec).toBe('function');
      expect(typeof api.events).toBe('object');
    }

    const allTools = new Set(
      capturedApis.flatMap((api) => api.tools.map((t) => t.name)),
    );
    const allCommands = new Set(
      capturedApis.flatMap((api) => api.commands.map((c) => c.name)),
    );

    expect(allTools.has('realtime_status')).toBe(true);
    expect(allTools.has('daemon_stats')).toBe(true);
    expect(allTools.has('config_get')).toBe(true);
    expect(allTools.has('config_set')).toBe(true);
    expect(allTools.has('config_list')).toBe(true);
    expect(allCommands.has('realtime')).toBe(true);
    expect(allCommands.has('daemon')).toBe(true);

    for (const entry of result) {
      expect(entry.ok).toBe(true);
    }
  });

  it('loadWith exposes the registered tools so a loader can invoke them end-to-end', async () => {
    const main = createPiMain({ extensions: [] });
    const toolExecutions: Array<{ name: string; resultText: string }> = [];

    const fakeLoader: PiLoader = {
      async loadExtensionFromFactory(entry, api) {
        await entry.factory(api);
        for (const tool of api.tools) {
          if (!tool.execute) continue;
          // The migrated `realtime_quote` tool has the strict 5-arg
          // `(toolCallId, params, signal, onUpdate, ctx)` signature. The
          // loose-shape tools accept whatever we pass through. We unify
          // on the strict shape here so the loader test exercises the
          // same call site pi's runtime would use.
          const result = (await (tool.execute as (
            toolCallId: string,
            params: unknown,
          ) => Promise<{ content: Array<{ type: string; text: string }> }>)(
            'loader-tool-call',
            tool.name === 'realtime_quote' ? { symbol: '600519' } : {},
          )) as {
            content: Array<{ type: string; text: string }>;
          };
          toolExecutions.push({
            name: tool.name,
            resultText: result.content[0]?.text ?? '',
          });
        }
        return { ok: true };
      },
    };

    const result = await main.loadWith(fakeLoader);
    expect(result.length).toBe(3);

    const realtime = toolExecutions.find((t) => t.name === 'realtime_quote');
    expect(realtime).toBeDefined();
    expect(realtime!.resultText).toContain('600519');
  });

  it('loadWith returns each extension with its full recorded shape', async () => {
    const main = createPiMain({ extensions: [] });

    const fakeLoader: PiLoader = {
      async loadExtensionFromFactory(entry, api) {
        await entry.factory(api);
        return {
          ok: true,
          tools: api.tools.map((t) => t.name),
          commands: api.commands.map((c) => c.name),
          events: api.subscribedEvents.map((e) => e.event),
          shortcuts: api.shortcuts.map((s) => s.shortcut),
          flags: api.flags.map((f) => f.name),
        };
      },
    };

    const result = await main.loadWith(fakeLoader);

    expect(result.length).toBe(3);

    const realtime = result.find((r) => r.name === 'realtime');
    const daemon = result.find((r) => r.name === 'daemon');
    const config = result.find((r) => r.name === 'config');

    expect(realtime).toBeDefined();
    expect(daemon).toBeDefined();
    expect(config).toBeDefined();

    expect(realtime!.tools).toContain('realtime_status');
    expect(realtime!.tools).toContain('realtime_quote');
    expect(realtime!.commands).toContain('realtime');

    expect(daemon!.tools).toContain('daemon_stats');
    expect(daemon!.commands).toContain('daemon');

    expect(config!.tools).toEqual(['config_get', 'config_set', 'config_list']);

    for (const entry of result) {
      expect(entry.ok).toBe(true);
    }
  });

  it('loadWith uses the bundled Pi loader that wraps createExtensionRuntime', async () => {
    const main = createPiMain({ extensions: [] });
    const loader = createPiLoader();

    const result = await main.loadWith(loader);

    expect(result.length).toBe(3);
    const realtime = result.find((r) => r.name === 'realtime')!;
    const daemon = result.find((r) => r.name === 'daemon')!;
    const config = result.find((r) => r.name === 'config')!;

    expect(realtime.ok).toBe(true);
    expect(realtime.tools).toContain('realtime_status');
    expect(realtime.tools).toContain('realtime_quote');
    expect(realtime.commands).toContain('realtime');

    expect(daemon.ok).toBe(true);
    expect(daemon.tools).toContain('daemon_stats');
    expect(daemon.commands).toContain('daemon');

    expect(config.ok).toBe(true);
    expect(config.tools).toEqual(['config_get', 'config_set', 'config_list']);
  });
});

describe('pi fake api', () => {
  it('implements the full upup extension contract as a recording test double', () => {
    const api = createFakeApi();

    // Event subscription
    const handler = () => {};
    api.on('session_start', handler);
    api.on('tool_call', () => {});

    // Tool registration
    api.registerTool({
      name: 'my_tool',
      label: 'My Tool',
      description: 'desc',
      parameters: {},
      execute: () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    // Command registration
    api.registerCommand('my_cmd', { description: 'cmd', handler: () => {} });

    // Shortcut + flag
    api.registerShortcut('ctrl+x', { description: 'shortcut' });
    api.registerFlag('my-flag', { type: 'boolean', default: false });
    expect(api.getFlag('my-flag')).toBe(false);

    // Session messaging
    api.sendMessage({ customType: 'x', content: 'm', display: true });
    api.sendUserMessage('hello');
    api.appendEntry('my-state', { count: 1 });
    api.setSessionName('Session 1');
    expect(api.getSessionName()).toBe('Session 1');

    // Tools introspection
    expect(api.getActiveTools()).toContain('my_tool');
    expect(api.getAllTools().length).toBeGreaterThan(0);
    expect(api.getCommands().length).toBeGreaterThan(0);

    // Model + thinking level
    void api.setModel({ id: 'm', name: 'm', api: 'openai', provider: 'p', baseUrl: 'https://x', contextWindow: 1, maxTokens: 1, cost: { input: 0, output: 0 }, capabilities: [] });
    api.setThinkingLevel('high');
    expect(api.getThinkingLevel()).toBe('high');

    // Provider registration
    api.registerProvider('my-proxy', { baseUrl: 'https://proxy' });
    api.unregisterProvider('my-proxy');

    // Exec (returns a synthetic BashResult-shaped object)
    void api.exec('echo', ['hi']);

    // Shared event bus exists and is observable
    expect(typeof api.events).toBe('object');
    expect(typeof (api.events as { on?: unknown }).on).toBe('function');
    expect(typeof (api.events as { emit?: unknown }).emit).toBe('function');

    // Recorded snapshots are frozen
    expect(Object.isFrozen(api.tools)).toBe(true);
    expect(Object.isFrozen(api.commands)).toBe(true);
    expect(Object.isFrozen(api.subscribedEvents)).toBe(true);
    expect(Object.isFrozen(api.shortcuts)).toBe(true);
    expect(Object.isFrozen(api.flags)).toBe(true);
    expect(Object.isFrozen(api.messages)).toBe(true);
    expect(Object.isFrozen(api.userMessages)).toBe(true);
    expect(Object.isFrozen(api.appendedEntries)).toBe(true);
    expect(Object.isFrozen(api.providers)).toBe(true);

    // Recorded state matches the recorded calls
    expect(api.subscribedEvents.map((e) => e.event)).toEqual([
      'session_start',
      'tool_call',
    ]);
    expect(api.tools[0]?.name).toBe('my_tool');
    expect(api.commands[0]?.name).toBe('my_cmd');
    expect(api.shortcuts[0]?.shortcut).toBe('ctrl+x');
    expect(api.flags[0]?.name).toBe('my-flag');
    expect(api.messages.length).toBe(1);
    expect(api.userMessages.length).toBe(1);
    expect(api.appendedEntries[0]?.customType).toBe('my-state');
    expect(api.sessionNameChanges.length).toBe(1);
    expect(api.thinkingChanges.length).toBe(1);
    expect(api.providers.length).toBe(0); // unregistered at the end
  });

  it('captures lifecycle event subscriptions for real-time extensions', () => {
    const api = createFakeApi();
    api.on('session_start', async () => {});
    api.on('session_shutdown', async () => {});

    expect(api.subscribedEvents.length).toBe(2);
    expect(api.subscribedEvents[0]?.event).toBe('session_start');
    expect(api.subscribedEvents[1]?.event).toBe('session_shutdown');
  });

  it('accepts a real pi ToolDefinition (defineTool + TypeBox schema) via registerTool', async () => {
    // This is the prototype migration proof: the fake api accepts a tool
    // built with pi's `defineTool()` and a TypeBox parameters schema — the
    // exact shape pi-coding-agent's runtime expects. The migrated
    // `daemon_stats` tool from src/daemon/pi-daemon-stats-tool.ts is the
    // exemplar; the same call site works for any future TypeBox-migrated
    // upup tool.
    const { daemonStatsTool } = await import('./daemon/pi-daemon-stats-tool.js');
    const api = createFakeApi();

    api.registerTool(daemonStatsTool);

    expect(api.tools.length).toBe(1);
    const recorded = api.tools[0]!;
    expect(recorded.name).toBe('daemon_stats');
    expect(recorded.label).toBe('Daemon Stats');
    expect(recorded.description).toContain('supervisor');
    expect(recorded.parameters).toBeDefined();

    // Invoke via the strict 5-arg pi signature — verifies the recorded tool
    // still exposes the real `execute` function with the right arity.
    const result = await (recorded.execute as (
      toolCallId: string,
      params: unknown,
    ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>)(
      'tool-call-1',
      {},
    );
    expect(result.content[0]?.type).toBe('text');
    const stats = JSON.parse(result.content[0]!.text);
    expect(stats).toHaveProperty('queueSize');
    expect(stats).toHaveProperty('activeTasks');
    expect(stats).toHaveProperty('workers');
    expect(result.details).toEqual(stats);
  });

  it('accepts a real pi ToolDefinition with a non-empty TypeBox schema', async () => {
    // The second migration: `realtime_quote` takes a required
    // `symbol: string` parameter. The fake api records both the tool
    // shape AND its non-empty schema — and the strict 5-arg invocation
    // returns the `{ content, details }` shape with typed `details`.
    const { createRealtimeQuoteTool } = await import(
      './realtime/pi-realtime-quote-tool.js'
    );
    const tool = createRealtimeQuoteTool();
    const api = createFakeApi();

    api.registerTool(tool);

    expect(api.tools.length).toBe(1);
    expect(api.tools[0]?.name).toBe('realtime_quote');
    expect(api.tools[0]?.parameters).toBeDefined();

    const result = await (api.tools[0]!.execute as (
      toolCallId: string,
      params: { symbol: string },
    ) => Promise<{ content: Array<{ type: string; text: string }>; details: unknown }>)(
      'tool-call-2',
      { symbol: '600519' },
    );

    expect(result.content[0]?.type).toBe('text');
    expect((result.details as { symbol: string }).symbol).toBe('600519');
    expect((result.details as { quote: { last: number } | null }).quote?.last).toBe(100);
  });
});