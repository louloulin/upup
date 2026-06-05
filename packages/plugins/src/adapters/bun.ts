/**
 * UpUp Plugin System — Bun Runtime Adapter
 *
 * Loads native Bun ESM plugins directly.
 * Provides highest performance for trusted local plugins.
 */

import { resolve } from 'path';
import { info, warn, error } from '@upup/utils/logging';
import { isPathInside } from '../path-safety.js';
import type {
  PluginAdapter,
  PluginManifest,
  LoadedPlugin,
  UpUpPluginApi,
  PluginService,
  AgentTool,
  HookHandler,
} from '@upup/types';

/**
 * Bun Adapter — native ESM loading
 */
export class BunAdapter implements PluginAdapter {
  readonly runtime = 'bun' as const;
  private loadedModules: Map<string, any> = new Map();

  canLoad(manifest: PluginManifest): boolean {
    return manifest.runtime === 'bun';
  }

  async load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin> {
    const entryPath = resolve(process.cwd(), manifest.entry);

    // Path safety check
    if (!isPathInside(entryPath, process.cwd())) {
      throw new Error(`Plugin entry escapes working directory: ${manifest.entry}`);
    }

    info('default', `Loading Bun plugin: ${manifest.name} from ${manifest.entry}`);

    try {
      // Bun native import
      const module = await import(entryPath);
      const pluginModule = module.default ?? module;

      // Activate the plugin
      const activated = await this.activate(pluginModule, api, manifest);

      return activated;
    } catch (err) {
      throw new Error(`Failed to load Bun plugin ${manifest.id}: ${(err as Error).message}`);
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
    const tools: AgentTool[] = (api as any)._tools ?? [];
    const services: PluginService[] = (api as any)._services ?? [];

    // Convert hooks to Map
    const hooks = new Map<string, HookHandler[]>();
    const rawHooks = (api as any)._hooks;
    if (rawHooks) {
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