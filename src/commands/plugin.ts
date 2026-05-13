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

  async execute(_args: string, _context: CommandContext): Promise<CommandResult> {
    const registry = getPluginRegistry();
    const allPlugins = registry.getAll();

    if (allPlugins.length === 0) {
      return { type: 'output', text: 'No plugins installed.' };
    }

    const lines: string[] = ['Installed plugins:'];

    for (const plugin of allPlugins) {
      const enabled = plugin.enabled ?? true;
      const status = enabled ? '✅' : '❌';
      const capabilities = plugin.manifest.capabilities?.join(', ') || 'none';
      lines.push(`  ${status} ${plugin.manifest.name} (${plugin.manifest.version})`);
      lines.push(`      ${plugin.manifest.description}`);
      lines.push(`      Capabilities: ${capabilities}`);
      lines.push(`      Path: ${plugin.path}`);
    }

    lines.push('');
    lines.push(`Total: ${allPlugins.length} plugin(s)`);

    return { type: 'output', text: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Info Command
// ============================================================================

export const pluginInfoCommand: Command = {
  name: 'plugin info',
  description: 'Show detailed information about a plugin',
  aliases: ['pi'],

  async execute(args: string, _context: CommandContext): Promise<CommandResult> {
    const name = args.trim();

    if (!name) {
      return { type: 'error', message: 'Usage: plugin info <name>' };
    }

    const registry = getPluginRegistry();
    const plugin = registry.get(name);

    if (!plugin) {
      // Check if it's a builtin plugin
      const builtin = getBuiltinPlugin(name);
      if (!builtin) {
        return { type: 'error', message: `Plugin "${name}" not found` };
      }

      const enabled = isBuiltinPluginEnabled(name);
      const manifest = builtin.manifest;

      return {
        type: 'output',
        text: formatPluginInfo(manifest.name, manifest, enabled),
      };
    }

    const lines = [
      formatPluginInfo(plugin.manifest.name, plugin.manifest, plugin.enabled ?? true),
    ];

    // Add tools count
    const pluginTools = registry.getToolNamesByPlugin(plugin.manifest.name);
    if (pluginTools.length > 0) {
      lines.push(`Tools: ${pluginTools.length}`);
    }

    // Add services count
    const allServices = registry.getEnrichedServices();
    const pluginServices = allServices.filter(s => s.plugin === plugin.manifest.name);
    if (pluginServices.length > 0) {
      lines.push(`Services: ${pluginServices.length}`);
    }

    return { type: 'output', text: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Enable Command
// ============================================================================

export const pluginEnableCommand: Command = {
  name: 'plugin enable',
  description: 'Enable a plugin',
  aliases: ['pen'],

  async execute(args: string, _context: CommandContext): Promise<CommandResult> {
    const name = args.trim();

    if (!name) {
      return { type: 'error', message: 'Usage: plugin enable <name>' };
    }

    const registry = getPluginRegistry();
    const plugin = registry.get(name);

    if (!plugin) {
      // Check if it's a builtin plugin
      const builtin = getBuiltinPlugin(name);
      if (!builtin) {
        return { type: 'error', message: `Plugin "${name}" not found` };
      }

      setBuiltinPluginEnabled(name, true);
      return { type: 'output', text: `Plugin "${name}" enabled.` };
    }

    // Update plugin enabled state
    plugin.enabled = true;
    return { type: 'output', text: `Plugin "${name}" enabled.` };
  },
};

// ============================================================================
// Plugin Disable Command
// ============================================================================

export const pluginDisableCommand: Command = {
  name: 'plugin disable',
  description: 'Disable a plugin',
  aliases: ['pdis'],

  async execute(args: string, _context: CommandContext): Promise<CommandResult> {
    const name = args.trim();

    if (!name) {
      return { type: 'error', message: 'Usage: plugin disable <name>' };
    }

    const registry = getPluginRegistry();
    const plugin = registry.get(name);

    if (!plugin) {
      // Check if it's a builtin plugin
      const builtin = getBuiltinPlugin(name);
      if (!builtin) {
        return { type: 'error', message: `Plugin "${name}" not found` };
      }

      setBuiltinPluginEnabled(name, false);
      return { type: 'output', text: `Plugin "${name}" disabled.` };
    }

    // Update plugin enabled state
    plugin.enabled = false;
    return { type: 'output', text: `Plugin "${name}" disabled.` };
  },
};

// ============================================================================
// Plugin Search Command
// ============================================================================

export const pluginSearchCommand: Command = {
  name: 'plugin search',
  description: 'Search plugins by name or description',
  aliases: ['ps'],

  async execute(args: string, _context: CommandContext): Promise<CommandResult> {
    const query = args.trim().toLowerCase();

    if (!query) {
      return { type: 'error', message: 'Usage: plugin search <query>' };
    }

    const registry = getPluginRegistry();
    const allPlugins = registry.getAll();

    const matches = allPlugins.filter(p => {
      const nameMatch = p.manifest.name.toLowerCase().includes(query);
      const descMatch = p.manifest.description?.toLowerCase().includes(query);
      return nameMatch || descMatch;
    });

    if (matches.length === 0) {
      return { type: 'output', text: `No plugins found matching "${query}".` };
    }

    const lines: string[] = [`Found ${matches.length} plugin(s):`];

    for (const plugin of matches) {
      const enabled = plugin.enabled ?? true;
      const status = enabled ? '✅' : '❌';
      lines.push(`  ${status} ${plugin.manifest.name}: ${plugin.manifest.description}`);
    }

    return { type: 'output', text: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Hooks Command (show hooks from plugins)
// ============================================================================

export const pluginHooksCommand: Command = {
  name: 'plugin hooks',
  description: 'List all plugin hooks',
  aliases: ['ph'],

  async execute(_args: string, _context: CommandContext): Promise<CommandResult> {
    const registry = getPluginRegistry();
    const allHooks = registry.getAllEnrichedHooks();

    if (allHooks.length === 0) {
      return { type: 'output', text: 'No hooks registered.' };
    }

    const lines: string[] = ['Registered hooks:'];

    for (const hook of allHooks) {
      lines.push(`  ${hook.plugin}: ${hook.name} (${hook.event || 'all events'})`);
    }

    lines.push('');
    lines.push(`Total: ${allHooks.length} hook(s)`);

    return { type: 'output', text: lines.join('\n') };
  },
};

// ============================================================================
// Plugin Services Command (show services from plugins)
// ============================================================================

export const pluginServicesCommand: Command = {
  name: 'plugin services',
  description: 'List all plugin services',
  aliases: ['psvc'],

  async execute(_args: string, _context: CommandContext): Promise<CommandResult> {
    const registry = getPluginRegistry();
    const services = registry.getEnrichedServices();

    if (services.length === 0) {
      return { type: 'output', text: 'No services registered.' };
    }

    const lines: string[] = ['Registered services:'];

    for (const service of services) {
      lines.push(`  ${service.plugin}: ${service.name}${service.description ? ` - ${service.description}` : ''}`);
    }

    lines.push('');
    lines.push(`Total: ${services.length} service(s)`);

    return { type: 'output', text: lines.join('\n') };
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