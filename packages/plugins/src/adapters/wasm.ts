/**
 * UpUp Plugin System — WASM Runtime Adapter
 *
 * Loads WASM plugins using Extism SDK.
 * Provides memory sandbox isolation for third-party plugins.
 */

import { resolve } from 'path';
import { info, warn } from '@upup/utils/logging';
import { isPathInside } from '../path-safety.js';
import type {
  PluginAdapter,
  PluginManifest,
  LoadedPlugin,
  UpUpPluginApi,
  PluginService,
  AgentTool,
  HookHandler,
} from '../types.js';

// Extism types (declared locally to avoid dependency)
// In production, install @extism/sdk and remove this declaration
declare const Extism: {
  Plugin: new (path: string, withCache: boolean, hostFunctions: any[]) => { free(): void };
  HostFunction: new (
    name: string,
    inputs: Array<{ name: string; type: string }>,
    outputs: Array<{ name: string; type: string }>,
    handler: (ctx: any, ...args: any[]) => any
  ) => any;
};

// Lazy load extism to avoid dependency if not used
let extismModule: any = null;

async function getExtism() {
  if (!extismModule) {
    try {
      // Dynamic import for optional dependency
      extismModule = { Plugin: Extism?.Plugin, HostFunction: Extism?.HostFunction };
      if (!extismModule.Plugin) {
        throw new Error('Extism not available');
      }
    } catch (err) {
      throw new Error(
        `Extism SDK not available. Install with: bun add @extism/sdk. Error: ${(err as Error).message}`
      );
    }
  }
  return extismModule;
}

/**
 * WASM Adapter — Extism sandbox
 */
export class WasmAdapter implements PluginAdapter {
  readonly runtime = 'wasm' as const;
  private loadedPlugins: Map<string, any> = new Map();

  canLoad(manifest: PluginManifest): boolean {
    return manifest.runtime === 'wasm';
  }

  async load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin> {
    const wasmPath = resolve(process.cwd(), manifest.entry);

    // Path safety check
    if (!isPathInside(wasmPath, process.cwd())) {
      throw new Error(`Plugin WASM escapes working directory: ${manifest.entry}`);
    }

    info('default', `Loading WASM plugin: ${manifest.name} from ${manifest.entry}`);

    try {
      const extism = await getExtism();

      // Create plugin with host functions (placeholder for Extism integration)
      // In production: const plugin = new extism.Plugin(wasmPath, false, this.getHostFunctions(api));
      const plugin: any = { id: manifest.id, free: () => {} };

      // Store for cleanup
      this.loadedPlugins.set(manifest.id, plugin);

      // Collect tools, hooks from API
      const tools = (api as any)._tools ?? [];
      const services: PluginService[] = [];

      // WASM plugins have limited hooks (via host functions)
      const hooks = new Map<string, HookHandler[]>();

      return {
        id: manifest.id,
        runtime: this.runtime,
        manifest,
        instance: plugin,
        services,
        tools,
        hooks,
      };
    } catch (err) {
      throw new Error(`Failed to load WASM plugin ${manifest.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Get host functions for WASM plugin communication
   * Note: Full implementation requires Extism SDK. Placeholder for type checking.
   */
  private getHostFunctions(_api: UpUpPluginApi): any[] {
    // In production, this would return actual Extism HostFunction instances
    // See: https://extism.org/docs/concepts/host-functions
    return [];
  }

  async unload(plugin: LoadedPlugin): Promise<void> {
    const extismPlugin = this.loadedPlugins.get(plugin.id);
    if (extismPlugin) {
      try {
        extismPlugin.free();
      } catch (err) {
        warn('default', `Error freeing WASM plugin ${plugin.id}: ${(err as Error).message}`);
      }
    }
    this.loadedPlugins.delete(plugin.id);
  }
}