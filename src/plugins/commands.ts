/**
 * Plugin Commands (Phase 64)
 *
 * Slash commands for plugin management:
 * - /plugin list - List all plugins
 * - /plugin enable <id> - Enable a plugin
 * - /plugin disable <id> - Disable a plugin
 * - /plugin info <id> - Show plugin details
 * - /plugin errors - Show plugin errors
 *
 * Reference: loucode/src/utils/suggestions/commandSuggestions.ts
 */

import { getPluginRegistry } from './registry.js';
import type { PluginCommand, CommandResult } from './types.js';

export interface PluginCommandResult {
  type: 'success' | 'error';
  message: string;
  data?: unknown;
}

/**
 * List all plugins
 */
function listPlugins(): PluginCommandResult {
  const registry = getPluginRegistry();
  const allPlugins = registry.getAll();
  const enabledPlugins = registry.getEnabled();
  const disabledPlugins = registry.getDisabled();
  const errorPlugins = registry.getPluginsWithErrors();

  if (allPlugins.length === 0) {
    return { type: 'success', message: 'No plugins loaded.' };
  }

  const lines: string[] = [];
  lines.push(`Plugins (${allPlugins.length} total, ${enabledPlugins.length} enabled, ${disabledPlugins.length} disabled)`);
  lines.push('');

  // Group by status
  if (enabledPlugins.length > 0) {
    lines.push('### Enabled Plugins');
    for (const plugin of enabledPlugins) {
      const hasError = errorPlugins.includes(plugin.id);
      const errorMark = hasError ? ' ⚠️' : '';
      lines.push(`  • ${plugin.manifest.name} (${plugin.id})${errorMark}`);
      lines.push(`    Version: ${plugin.manifest.version}`);
      lines.push(`    Capabilities: ${plugin.manifest.capabilities.join(', ')}`);
      if (plugin.tools.length > 0) {
        lines.push(`    Tools: ${plugin.tools.map(t => t.name).join(', ')}`);
      }
      lines.push('');
    }
  }

  if (disabledPlugins.length > 0) {
    lines.push('### Disabled Plugins');
    for (const plugin of disabledPlugins) {
      const hasError = errorPlugins.includes(plugin.id);
      const errorMark = hasError ? ' ⚠️' : '';
      lines.push(`  • ${plugin.manifest.name} (${plugin.id})${errorMark}`);
      lines.push(`    Version: ${plugin.manifest.version}`);
      lines.push('');
    }
  }

  return { type: 'success', message: lines.join('\n'), data: { total: allPlugins.length } };
}

/**
 * Show plugin errors
 */
function showErrors(): PluginCommandResult {
  const registry = getPluginRegistry();
  const errors = registry.getAllErrors();

  if (errors.length === 0) {
    return { type: 'success', message: 'No plugin errors.' };
  }

  const lines: string[] = [];
  lines.push(`Plugin Errors (${errors.length})`);
  lines.push('');

  for (const { id, error } of errors) {
    lines.push(`### ${id}`);
    lines.push(`  Error: ${error.message}`);
    lines.push(`  Code: ${error.code}`);
    lines.push('');
  }

  return { type: 'success', message: lines.join('\n'), data: { count: errors.length } };
}

/**
 * Get plugin info
 */
function getPluginInfo(pluginId: string): PluginCommandResult {
  const registry = getPluginRegistry();
  const plugin = registry.get(pluginId);

  if (!plugin) {
    return { type: 'error', message: `Plugin not found: ${pluginId}` };
  }

  const error = registry.getError(pluginId);
  const isEnabled = registry.isEnabled(pluginId);

  const lines: string[] = [];
  lines.push(`### ${plugin.manifest.name}`);
  lines.push(`ID: ${plugin.id}`);
  lines.push(`Version: ${plugin.manifest.version}`);
  lines.push(`Runtime: ${plugin.runtime}`);
  lines.push(`Status: ${isEnabled ? 'Enabled' : 'Disabled'}${error ? ' ⚠️ Error' : ''}`);
  lines.push(`Capabilities: ${plugin.manifest.capabilities.join(', ')}`);

  if (plugin.manifest.description) {
    lines.push(`Description: ${plugin.manifest.description}`);
  }

  if (plugin.manifest.author) {
    lines.push(`Author: ${plugin.manifest.author.name}`);
  }

  lines.push('');
  lines.push('### Tools');
  if (plugin.tools.length > 0) {
    for (const tool of plugin.tools) {
      lines.push(`  • ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
    }
  } else {
    lines.push('  (none)');
  }

  lines.push('');
  lines.push('### Services');
  if (plugin.services.length > 0) {
    for (const service of plugin.services) {
      lines.push(`  • ${service.name}`);
    }
  } else {
    lines.push('  (none)');
  }

  if (error) {
    lines.push('');
    lines.push('### Error');
    lines.push(`  ${error.message}`);
    lines.push(`  Code: ${error.code}`);
  }

  return { type: 'success', message: lines.join('\n'), data: { pluginId, isEnabled } };
}

/**
 * Enable a plugin
 */
function enablePlugin(pluginId: string): PluginCommandResult {
  const registry = getPluginRegistry();
  const plugin = registry.get(pluginId);

  if (!plugin) {
    return { type: 'error', message: `Plugin not found: ${pluginId}` };
  }

  if (registry.isEnabled(pluginId)) {
    return { type: 'success', message: `Plugin already enabled: ${pluginId}` };
  }

  const success = registry.enable(pluginId);
  if (success) {
    return { type: 'success', message: `Plugin enabled: ${pluginId}` };
  } else {
    return { type: 'error', message: `Failed to enable plugin: ${pluginId}` };
  }
}

/**
 * Disable a plugin
 */
function disablePlugin(pluginId: string): PluginCommandResult {
  const registry = getPluginRegistry();
  const plugin = registry.get(pluginId);

  if (!plugin) {
    return { type: 'error', message: `Plugin not found: ${pluginId}` };
  }

  if (!registry.isEnabled(pluginId)) {
    return { type: 'success', message: `Plugin already disabled: ${pluginId}` };
  }

  const success = registry.disable(pluginId);
  if (success) {
    return { type: 'success', message: `Plugin disabled: ${pluginId}` };
  } else {
    return { type: 'error', message: `Failed to disable plugin: ${pluginId}` };
  }
}

// ============================================================================
// Plugin Commands Registry
// ============================================================================

export const pluginCommands: Record<string, PluginCommand> = {
  list: {
    name: 'plugin',
    description: 'List all plugins',
    aliases: ['plugins'],
    execute: async (_args: string[]): Promise<CommandResult> => {
      const result = listPlugins();
      if (result.type === 'success') {
        return { type: 'output', text: result.message };
      }
      return { type: 'error', message: result.message };
    },
  },

  enable: {
    name: 'plugin-enable',
    description: 'Enable a plugin',
    aliases: ['plugin-enable', 'enable-plugin'],
    execute: async (args: string[]): Promise<CommandResult> => {
      const pluginId = args.join(' ').trim();
      if (!pluginId) {
        return { type: 'error', message: 'Usage: /plugin-enable <plugin-id>' };
      }
      const result = enablePlugin(pluginId);
      if (result.type === 'success') {
        return { type: 'output', text: result.message };
      }
      return { type: 'error', message: result.message };
    },
  },

  disable: {
    name: 'plugin-disable',
    description: 'Disable a plugin',
    aliases: ['plugin-disable', 'disable-plugin'],
    execute: async (args: string[]): Promise<CommandResult> => {
      const pluginId = args.join(' ').trim();
      if (!pluginId) {
        return { type: 'error', message: 'Usage: /plugin-disable <plugin-id>' };
      }
      const result = disablePlugin(pluginId);
      if (result.type === 'success') {
        return { type: 'output', text: result.message };
      }
      return { type: 'error', message: result.message };
    },
  },

  info: {
    name: 'plugin-info',
    description: 'Show plugin details',
    aliases: ['plugin-info', 'plugin-show'],
    execute: async (args: string[]): Promise<CommandResult> => {
      const pluginId = args.join(' ').trim();
      if (!pluginId) {
        return { type: 'error', message: 'Usage: /plugin-info <plugin-id>' };
      }
      const result = getPluginInfo(pluginId);
      if (result.type === 'success') {
        return { type: 'output', text: result.message };
      }
      return { type: 'error', message: result.message };
    },
  },

  errors: {
    name: 'plugin-errors',
    description: 'Show plugin errors',
    aliases: ['plugin-errors', 'plugin-error'],
    execute: async (_args: string[]): Promise<CommandResult> => {
      const result = showErrors();
      if (result.type === 'success') {
        return { type: 'output', text: result.message };
      }
      return { type: 'error', message: result.message };
    },
  },
};
