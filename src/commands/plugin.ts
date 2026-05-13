/**
 * Plugin CLI Commands
 *
 * CLI commands for managing plugins:
 * - plugin list - List all plugins
 * - plugin enable <name> - Enable a plugin
 * - plugin disable <name> - Disable a plugin
 * - plugin info <name> - Show plugin details
 * - plugin search <query> - Search plugins
 */

import { Command, CommandContext, CommandResult } from '@upup/commands';
import { getPluginRegistry } from '../plugins/registry.js';
import { isBuiltinPluginEnabled, setBuiltinPluginEnabled, getBuiltinPlugin, getAllBuiltinPlugins } from '../plugins/builtin-plugins.js';
import type { PluginManifest, PluginCapability } from '../plugins/types.js';

// ============================================================================
// Plugin List Command
// ============================================================================

export const pluginListCommand: Command = {
  name: 'plugin list',
  description: 'List all installed plugins with their status',
  aliases: ['plugins', 'pl'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const registry = getPluginRegistry();
    const allPlugins = registry.getAll();

    if (allPlugins.length === 0) {
      return { success: true, output: 'No plugins installed.' };
    }

    const lines: string[] = ['Installed plugins:'];

    for (const plugin of allPlugins) {
      const enabled = plugin.enabled ?? true;
      const status = enabled ? '✅' : '❌';
      const capabilities = plugin.capabilities?.join(', ') || 'none';
      lines.push(`  ${status} ${plugin.name} (${plugin.version})`);
      lines.push(`      ${plugin.description}`);
      lines.push(`      Capabilities: ${capabilities}`);
      lines.push(`      Path: ${plugin.path}`);
    }

    lines.push('');
    lines.push(`Total: ${allPlugins.length} plugin(s)`);

    return { success: true, output: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Info Command
// ============================================================================

export const pluginInfoCommand: Command = {
  name: 'plugin info',
  description: 'Show detailed information about a plugin',
  aliases: ['pi'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const name = context.args[0];

    if (!name) {
      return { success: false, error: 'Usage: plugin info <name>' };
    }

    const registry = getPluginRegistry();
    const plugin = registry.get(name);

    if (!plugin) {
      // Check if it's a builtin plugin
      const builtin = getBuiltinPlugin(name);
      if (!builtin) {
        return { success: false, error: `Plugin "${name}" not found` };
      }

      const enabled = isBuiltinPluginEnabled(name);
      const manifest = builtin.manifest;

      return {
        success: true,
        output: formatPluginInfo(manifest.name, manifest, enabled),
      };
    }

    const lines = [
      formatPluginInfo(plugin.name, plugin.manifest || {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description || '',
        capabilities: plugin.capabilities || [],
      }, plugin.enabled ?? true),
    ];

    // Add tools count
    const tools = registry.getByCapability('tool');
    const pluginTools = tools.filter(t => t.startsWith(`${plugin.name}:`));
    if (pluginTools.length > 0) {
      lines.push(`Tools: ${pluginTools.length}`);
    }

    // Add services count
    const services = registry.getServices();
    const pluginServices = services.filter(s => s.plugin === plugin.name);
    if (pluginServices.length > 0) {
      lines.push(`Services: ${pluginServices.length}`);
    }

    return { success: true, output: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Enable Command
// ============================================================================

export const pluginEnableCommand: Command = {
  name: 'plugin enable',
  description: 'Enable a plugin',
  aliases: ['pen'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const name = context.args[0];

    if (!name) {
      return { success: false, error: 'Usage: plugin enable <name>' };
    }

    const registry = getPluginRegistry();
    const plugin = registry.get(name);

    if (!plugin) {
      // Check if it's a builtin plugin
      const builtin = getBuiltinPlugin(name);
      if (!builtin) {
        return { success: false, error: `Plugin "${name}" not found` };
      }

      setBuiltinPluginEnabled(name, true);
      return { success: true, output: `Plugin "${name}" enabled.` };
    }

    // Update plugin enabled state
    plugin.enabled = true;
    return { success: true, output: `Plugin "${name}" enabled.` };
  },
};

// ============================================================================
// Plugin Disable Command
// ============================================================================

export const pluginDisableCommand: Command = {
  name: 'plugin disable',
  description: 'Disable a plugin',
  aliases: ['pdis'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const name = context.args[0];

    if (!name) {
      return { success: false, error: 'Usage: plugin disable <name>' };
    }

    const registry = getPluginRegistry();
    const plugin = registry.get(name);

    if (!plugin) {
      // Check if it's a builtin plugin
      const builtin = getBuiltinPlugin(name);
      if (!builtin) {
        return { success: false, error: `Plugin "${name}" not found` };
      }

      setBuiltinPluginEnabled(name, false);
      return { success: true, output: `Plugin "${name}" disabled.` };
    }

    // Update plugin enabled state
    plugin.enabled = false;
    return { success: true, output: `Plugin "${name}" disabled.` };
  },
};

// ============================================================================
// Plugin Search Command
// ============================================================================

export const pluginSearchCommand: Command = {
  name: 'plugin search',
  description: 'Search plugins by name or description',
  aliases: ['ps'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const query = context.args[0]?.toLowerCase();

    if (!query) {
      return { success: false, error: 'Usage: plugin search <query>' };
    }

    const registry = getPluginRegistry();
    const allPlugins = registry.getAll();

    const matches = allPlugins.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(query);
      const descMatch = p.description?.toLowerCase().includes(query);
      return nameMatch || descMatch;
    });

    if (matches.length === 0) {
      return { success: true, output: `No plugins found matching "${query}".` };
    }

    const lines: string[] = [`Found ${matches.length} plugin(s):`];

    for (const plugin of matches) {
      const enabled = plugin.enabled ?? true;
      const status = enabled ? '✅' : '❌';
      lines.push(`  ${status} ${plugin.name}: ${plugin.description}`);
    }

    return { success: true, output: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Hooks Command (show hooks from plugins)
// ============================================================================

export const pluginHooksCommand: Command = {
  name: 'plugin hooks',
  description: 'List all plugin hooks',
  aliases: ['ph'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const registry = getPluginRegistry();
    const allHooks = registry.getHooks();

    if (allHooks.length === 0) {
      return { success: true, output: 'No hooks registered.' };
    }

    const lines: string[] = ['Registered hooks:'];

    for (const hook of allHooks) {
      lines.push(`  ${hook.plugin}: ${hook.name} (${hook.event || 'all events'})`);
    }

    lines.push('');
    lines.push(`Total: ${allHooks.length} hook(s)`);

    return { success: true, output: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Services Command (show services from plugins)
// ============================================================================

export const pluginServicesCommand: Command = {
  name: 'plugin services',
  description: 'List all plugin services',
  aliases: ['psvc'],

  async execute(context: CommandContext): Promise<CommandResult> {
    const registry = getPluginRegistry();
    const services = registry.getServices();

    if (services.length === 0) {
      return { success: true, output: 'No services registered.' };
    }

    const lines: string[] = ['Registered services:'];

    for (const service of services) {
      lines.push(`  ${service.plugin}: ${service.name} - ${service.description}`);
    }

    lines.push('');
    lines.push(`Total: ${services.length} service(s)`);

    return { success: true, output: lines.join('\n') };
  },
};

// ============================================================================
// Register Plugin Commands
// ============================================================================

export function registerPluginCommands(): void {
  const { registerCommand } = require('@upup/commands');

  registerCommand(pluginListCommand);
  registerCommand(pluginInfoCommand);
  registerCommand(pluginEnableCommand);
  registerCommand(pluginDisableCommand);
  registerCommand(pluginSearchCommand);
  registerCommand(pluginHooksCommand);
  registerCommand(pluginServicesCommand);
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatPluginInfo(
  name: string,
  manifest: { description?: string; capabilities?: PluginCapability[]; version?: string },
  enabled: boolean
): string {
  const status = enabled ? '✅ Enabled' : '❌ Disabled';
  const capabilities = manifest.capabilities?.join(', ') || 'none';

  return [
    `Plugin: ${name}`,
    `Status: ${status}`,
    `Version: ${manifest.version || 'unknown'}`,
    `Description: ${manifest.description || 'none'}`,
    `Capabilities: ${capabilities}`,
  ].join('\n');
}