import { registerRealtimeExtension } from './realtime/pi-realtime.js';
import { registerDaemonExtension } from './daemon/pi-daemon.js';
import { createRealtimeFeed } from './realtime/index.js';
import type { RealtimeExtensionApi } from './realtime/pi-realtime.js';
import type { DaemonExtensionApi } from './daemon/pi-daemon.js';

export interface PiMainExtension {
  name: string;
  factory: () => Record<string, unknown>;
}

export interface PiMainOptions {
  extensions: PiMainExtension[];
}

export interface LoadedExtension {
  name: string;
  instance: Record<string, unknown>;
  registeredTools: string[];
  registeredCommands: string[];
}

export interface PiExtensionFactoryEntry {
  name: string;
  factory: (pi: unknown) => void | Promise<void>;
}

export interface PiMainFakeApi {
  registerTool: (tool: { name: string; execute?: (...args: unknown[]) => unknown }) => void;
  registerCommand: (name: string) => void;
  registeredTools: Array<{ name: string; execute?: (...args: unknown[]) => unknown }>;
  registeredCommands: string[];
}

function createFakeApi(): PiMainFakeApi {
  const tools: Array<{ name: string; execute?: (...args: unknown[]) => unknown }> = [];
  const commands: string[] = [];
  return {
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand(name) {
      commands.push(name);
    },
    registeredTools: tools,
    registeredCommands: commands,
  };
}

export interface PiLoader {
  loadExtensionFromFactory(
    entry: PiExtensionFactoryEntry,
    pi: unknown,
  ): Promise<unknown>;
}

export interface PiMainResult {
  extensions: string[];
  load: () => LoadedExtension[];
  extensionFactories: () => PiExtensionFactoryEntry[];
  loadWith: (
    loader: PiLoader,
  ) => Promise<Array<{ name: string; ok: boolean; tools?: string[]; commands?: string[] }>>;
}

function createRealtimeAdapter() {
  const tools: string[] = [];
  const commands: string[] = [];
  const api: RealtimeExtensionApi = {
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    registerCommand(name) {
      commands.push(name);
    },
  };
  registerRealtimeExtension(api);
  return {
    instance: { registered: { tools, commands } },
    registeredTools: tools,
    registeredCommands: commands,
  };
}

function createDaemonAdapter() {
  const tools: string[] = [];
  const commands: string[] = [];
  const api: DaemonExtensionApi = {
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    registerCommand(name) {
      commands.push(name);
    },
  };
  registerDaemonExtension(api);
  return {
    instance: { registered: { tools, commands } },
    registeredTools: tools,
    registeredCommands: commands,
  };
}

function realtimeFactory(pi: unknown): void {
  registerRealtimeExtension(pi as RealtimeExtensionApi);
}

function daemonFactory(pi: unknown): void {
  registerDaemonExtension(pi as DaemonExtensionApi);
}

export function createPiMain(options: PiMainOptions): PiMainResult {
  const knownAdapters = new Map<string, () => Omit<LoadedExtension, 'name'>>([
    ['realtime', createRealtimeAdapter],
    ['daemon', createDaemonAdapter],
  ]);

  const knownFactories = new Map<string, (pi: unknown) => void | Promise<void>>([
    ['realtime', realtimeFactory],
    ['daemon', daemonFactory],
  ]);

  const extensionOverrides = new Map(
    options.extensions.map((ext) => [ext.name, ext] as const),
  );

  const names = [...knownAdapters.keys()].map((name) =>
    extensionOverrides.has(name) ? `${name}:override` : name,
  );

  return {
    extensions: names,
    load: () => {
      const loaded: LoadedExtension[] = [];
      for (const [name, adapter] of knownAdapters.entries()) {
        const override = extensionOverrides.get(name);
        if (override) {
          loaded.push({
            name,
            instance: override.factory(),
            registeredTools: [],
            registeredCommands: [],
          });
        } else {
          const result = adapter();
          loaded.push({
            name,
            instance: result.instance,
            registeredTools: result.registeredTools,
            registeredCommands: result.registeredCommands,
          });
        }
      }
      return loaded;
    },
    extensionFactories: () => {
      const entries: PiExtensionFactoryEntry[] = [];
      for (const [name, factory] of knownFactories.entries()) {
        entries.push({ name, factory });
      }
      return entries;
    },
    loadWith: async (loader: PiLoader) => {
      const results: Array<{
        name: string;
        ok: boolean;
        tools?: string[];
        commands?: string[];
      }> = [];
      for (const [name, factory] of knownFactories.entries()) {
        const api: PiMainFakeApi = createFakeApi();
        const factoryEntry: PiExtensionFactoryEntry = {
          name,
          factory: (pi: unknown) => factory(pi ?? api),
        };
        try {
          const loaderResult = (await loader.loadExtensionFromFactory(
            factoryEntry,
            api,
          )) as { tools?: string[]; commands?: string[] } | undefined;
          results.push({
            name: factoryEntry.name,
            ok: true,
            tools: loaderResult?.tools ?? api.registeredTools.map((t) => t.name),
            commands: loaderResult?.commands ?? [...api.registeredCommands],
          });
        } catch (err) {
          console.error(`[pi-main] failed to load extension ${factoryEntry.name}:`, err);
          results.push({ name: factoryEntry.name, ok: false });
        }
      }
      return results;
    },
  };
}

export { createRealtimeFeed };
