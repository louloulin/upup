/**
 * ConfigTool - Configuration Read/Write Management
 *
 * Exposes UpUp's configuration system as a tool for:
 * - Reading configuration values
 * - Writing configuration values
 * - Listing all configuration
 *
 * Reference: Loucode's config system
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { loadConfig, saveConfig } from '@upup/utils/config';
import { useDynamicConfig } from '@upup/hooks/agent-hooks';

// ============================================================================
// Schema & Description
// ============================================================================

export const ConfigToolGetSchema = z.object({
  /** Key to get (e.g., "modelId", "memory.enabled"). Empty for all. */
  key: z.string().optional().describe('Configuration key to get (dot notation supported)'),
});

export const ConfigToolSetSchema = z.object({
  /** Key to set (e.g., "modelId", "memory.enabled") */
  key: z.string().describe('Configuration key to set (dot notation supported)'),
  /** Value to set */
  value: z.union([z.string(), z.number(), z.boolean(), z.record(z.any())]).describe('Value to set'),
});

export const ConfigToolListSchema = z.object({
  /** Filter keys by prefix (e.g., "memory", "model") */
  prefix: z.string().optional().describe('Filter keys by prefix'),
});

export type ConfigToolGetInput = z.infer<typeof ConfigToolGetSchema>;
export type ConfigToolSetInput = z.infer<typeof ConfigToolSetSchema>;
export type ConfigToolListInput = z.infer<typeof ConfigToolListSchema>;

export const CONFIG_TOOL_GET_DESCRIPTION = `
Read a configuration value from UpUp's settings.

Use this to:
- Check current model configuration
- View memory settings
- Inspect any configuration value

Dot notation is supported: "memory.enabled", "modelId", etc.

Examples:
- Get the current model ID
- Check if memory is enabled
- View embedding provider settings`;

export const CONFIG_TOOL_SET_DESCRIPTION = `
Write a configuration value to UpUp's settings.

Use this to:
- Change the model
- Enable/disable features
- Update memory settings
- Configure API providers

Dot notation is supported: "memory.enabled", "modelId", etc.

Warning: Some changes require restarting UpUp to take effect.

Examples:
- Set the model to a new value
- Enable or disable memory
- Configure embedding provider`;

export const CONFIG_TOOL_LIST_DESCRIPTION = `
List all configuration keys and values from UpUp's settings.

Use this to:
- See all available configuration options
- Find configuration keys
- Audit current settings

Examples:
- List all configuration
- List only memory-related configuration
- Find model-related settings`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a value from config using dot notation
 */
function getConfigValue(config: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = config;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a value in config using dot notation
 */
function setConfigValue(config: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current: Record<string, unknown> = config;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Format config value for display
 */
function formatValue(value: unknown, indent = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return '(not set)';
  if (typeof value === 'object') {
    const lines = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${'  '.repeat(indent + 1)}${k}: ${formatValue(v, indent + 1)}`)
      .join('\n');
    return `\n${lines}\n${'  '.repeat(indent)}`;
  }
  return String(value);
}

// ============================================================================
// Tool Factories
// ============================================================================

export function createConfigGetTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'config_get',
    description: CONFIG_TOOL_GET_DESCRIPTION,
    schema: ConfigToolGetSchema,
    async func(input): Promise<string> {
      try {
        const config = loadConfig() as Record<string, unknown>;

        if (!input.key) {
          return `Configuration:\n${formatValue(config)}`;
        }

        const value = getConfigValue(config, input.key);

        if (value === undefined) {
          return `Key "${input.key}" not found in configuration.`;
        }

        return `${input.key} = ${formatValue(value)}`;
      } catch (err) {
        return `Config read error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createConfigSetTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'config_set',
    description: CONFIG_TOOL_SET_DESCRIPTION,
    schema: ConfigToolSetSchema,
    async func(input): Promise<string> {
      try {
        const config = loadConfig() as Record<string, unknown>;
        const oldValue = getConfigValue(config, input.key);

        setConfigValue(config, input.key, input.value);
        saveConfig(config);

        // Also update the dynamic config so watchers are notified
        useDynamicConfig().set(input.key, input.value);

        const newValue = getConfigValue(config, input.key);

        return `Configuration updated.\n\n` +
          `Key: ${input.key}\n` +
          `Old value: ${formatValue(oldValue)}\n` +
          `New value: ${formatValue(newValue)}\n\n` +
          `Note: Some changes require restarting UpUp to take effect.`;
      } catch (err) {
        return `Config write error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createConfigListTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'config_list',
    description: CONFIG_TOOL_LIST_DESCRIPTION,
    schema: ConfigToolListSchema,
    async func(input): Promise<string> {
      try {
        const config = loadConfig() as Record<string, unknown>;

        if (input.prefix) {
          const filtered: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(config)) {
            if (key.startsWith(input.prefix!)) {
              filtered[key] = value;
            }
          }
          return `Configuration (prefix: ${input.prefix}):\n${formatValue(filtered)}`;
        }

        return `Configuration:\n${formatValue(config)}`;
      } catch (err) {
        return `Config list error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================

export {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
};
