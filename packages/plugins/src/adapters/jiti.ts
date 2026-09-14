/**
 * UpUp Plugin System — JITI Runtime Adapter
 *
 * Loads TypeScript plugins using JITI transpilation.
 * Supports .ts/.tsx files without pre-compilation.
 */

import { info, warn } from '../../utils/logging/logger.js';
import type {
  PluginAdapter,
  PluginManifest,
  LoadedPlugin,
  UpUpPluginApi,
  PluginService,
  AgentTool,
  HookHandler,
} from '../types.js';

// Lazy load jiti to avoid dependency if not used
let jitiLoader: any = null;

async function getJiti() {
  if (!jitiLoader) {
    try {
      const jiti = await import('jiti');
      jitiLoader = jiti.default ?? jiti;
    } catch (err) {
      throw new Error(
        `JITI not available. Install with: bun add jiti. Error: ${(err as Error).message}`
      );
    }
  }
  return jitiLoader;
}

/**
 * JITI Adapter — TypeScript transpilation
 */
export class JitiAdapter implements PluginAdapter {
  readonly runtime = 'jiti' as const;
  private loadedModules: Map<string, any> = new Map();

  canLoad(manifest: PluginManifest): boolean {
    return manifest.runtime === 'jiti';
  }

  async load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin> {
    const entryPath = api.resolvePath(manifest.entry);

    info('default', `Loading JITI plugin: ${manifest.name} from ${manifest.entry}`);

    try {
      const jiti = await getJiti();

      // JITI transpiles and imports TypeScript
      const module = await jiti(entryPath);
      const pluginModule = module.default ?? module;

      // Activate the plugin
      const activated = await this.activate(pluginModule, api, manifest);

      return activated;
    } catch (err) {
      throw new Error(`Failed to load JITI plugin ${manifest.id}: ${(err as Error).message}`);
    }
  }

  private async activate(
    pluginModule: any,
    api: UpUpPluginApi,
    manifest: PluginManifest
  ): Promise<LoadedPlugin> {
    const instance = pluginModule;

    // Call onLoad if present
    if (typeof instance.onLoad === 'function') {
      await instance.onLoad(api);
    }

    // Call register function if present
    if (typeof instance.register === 'function') {
      await instance.register(api);
    } else if (typeof instance.activate === 'function') {
      await instance.activate(api);
    }

    // Collect tools, hooks, services from API
    const tools = (api as any)._tools ?? [];
    const services = (api as any)._services ?? [];

    // Convert hooks to Map
    const hooks = new Map<string, HookHandler[]>();
    if ((api as any)._hooks) {
      const rawHooks = (api as any)._hooks();
      for (const [event, entries] of rawHooks) {
        hooks.set(event, entries.map((e: any) => e.handler));
      }
    }

    // Cache module
    this.loadedModules.set(manifest.id, instance);

    return {
      id: manifest.id,
      runtime: this.runtime,
      manifest,
      instance,
      services,
      tools,
      hooks,
    };
  }

  async unload(plugin: LoadedPlugin): Promise<void> {
    const instance = this.loadedModules.get(plugin.id);
    if (!instance) return;

    // Call onUnload if present
    if (typeof instance.onUnload === 'function') {
      try {
        await instance.onUnload();
      } catch (err) {
        warn('default', `Error in onUnload for ${plugin.id}: ${(err as Error).message}`);
      }
    }

    this.loadedModules.delete(plugin.id);
  }
}
