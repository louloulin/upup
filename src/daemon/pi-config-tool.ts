/**
 * Config tools — migrated to pi-coding-agent's strict ToolDefinition shape.
 *
 * Pass 7 prototype (Batch 1 / config extension in the migration roadmap):
 *   - Uses TypeBox schemas (S2 single-field / single-optional)
 *   - Returns strict { content, details } shape
 *   - Validates the S2 composite-object path at the smallest scale
 *     (config_get: one optional string field; config_list: same;
 *      config_set: one required string + one required union value)
 *
 * The migrated factories do NOT touch the LangChain registry layer. They
 * are registered through the pi extension runtime only. The legacy
 * LangChain `createConfigGetTool` / `createConfigSetTool` /
 * `createConfigListTool` in `src/tools/config-tool.ts` stay where they
 * are for now (Batch 12 in the roadmap) and remain the path used by
 * the LangChain agent. Both shapes coexist via the widened
 * `PiFakeApi.registerTool` from `src/pi-main.ts`.
 */

import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';

import { loadConfig, saveConfig } from '../utils/config.js';
import { useDynamicConfig } from '../hooks/agent-hooks.js';

// ============================================================================
// Helpers (re-defined locally — mirror the legacy module in
// `src/tools/config-tool.ts`. They are pure functions on
// `Record<string, unknown>`, so re-implementing them here keeps the
// migrated tool independent of the legacy LangChain module's
// private helpers. When Batch 12 (system / config) migrates the
// legacy module wholesale, these can be re-pointed at the canonical
// implementation.)
// ============================================================================

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

/** Format a config value (or nested object) for human display. */
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
// TypeBox schemas
// ============================================================================

/** Permitted leaf types for `config_set`'s `value` field. */
const ConfigValueSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  Type.Record(Type.String(), Type.Unknown()),
]);

export const configGetParams = Type.Object({
  /** Configuration key in dot notation (e.g. `modelId`, `memory.enabled`). Empty/missing returns the whole config. */
  key: Type.Optional(Type.String({ description: 'Configuration key (dot notation). Empty for whole config.' })),
});

export const configSetParams = Type.Object({
  /** Configuration key in dot notation. */
  key: Type.String({ description: 'Configuration key to set (dot notation).', minLength: 1 }),
  /** Value to write — string, number, boolean, or object. */
  value: ConfigValueSchema,
});

export const configListParams = Type.Object({
  /** Optional key-prefix filter (e.g. `memory`, `model`). */
  prefix: Type.Optional(Type.String({ description: 'Filter keys by prefix.' })),
});

export type ConfigGetParams = Static<typeof configGetParams>;
export type ConfigSetParams = Static<typeof configSetParams>;
export type ConfigListParams = Static<typeof configListParams>;

// ============================================================================
// Typed details shapes (what `details` carries on each result)
// ============================================================================

export interface ConfigGetDetails {
  /** Key that was requested, or `null` for the whole config. */
  key: string | null;
  /** Resolved value, or `null` if the key was missing. */
  value: unknown;
  /** Human-readable formatting used in the `content` text. */
  text: string;
}

export interface ConfigSetDetails {
  key: string;
  /** Previous value, or `null` if the key did not exist. */
  oldValue: unknown;
  /** Newly written value. */
  newValue: unknown;
}

export interface ConfigListDetails {
  /** Prefix filter applied, or `null` for unfiltered list. */
  prefix: string | null;
  /** Snapshot of the (possibly filtered) config at the time of the call. */
  config: Record<string, unknown>;
}

// ============================================================================
// Tool factories
// ============================================================================

/** Create a strict pi `ToolDefinition` for reading config values. */
export function createConfigGetTool() {
  return defineTool({
    name: 'config_get',
    label: 'Config Get',
    description: `Read a configuration value from UpUp settings. Use to check current model, memory, or any configuration value. Dot notation supported: 'memory.enabled', 'modelId', etc. Empty key returns whole config.`,
    promptSnippet: 'Read a configuration value by dot-notation key (e.g. modelId, memory.enabled)',
    promptGuidelines: [
      'Use config_get to inspect the current model, memory settings, or any other configuration value before deciding to change anything.',
      "When the user does not know the exact key name, call config_list first with a prefix to discover candidate keys before calling config_get.",
    ],
    parameters: configGetParams,
    async execute(
      _toolCallId,
      params: ConfigGetParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: ConfigGetDetails }> {
      let requested: string | null = null;
      try {
        const config = loadConfig() as Record<string, unknown>;
        requested = typeof params.key === 'string' && params.key.length > 0
          ? params.key
          : null;

        if (requested === null) {
          const text = `Configuration:\n${formatValue(config)}`;
          return {
            content: [{ type: 'text', text }],
            details: { key: null, value: config, text },
          };
        }

        const value = getConfigValue(config, requested);
        if (value === undefined) {
          const text = `Key "${requested}" not found in configuration.`;
          return {
            content: [{ type: 'text', text }],
            details: { key: requested, value: null, text },
          };
        }

        const text = `${requested} = ${formatValue(value)}`;
        return {
          content: [{ type: 'text', text }],
          details: { key: requested, value, text },
        };
      } catch (err) {
        const text = `Config read error: ${err instanceof Error ? err.message : String(err)}`;
        return {
          content: [{ type: 'text', text }],
          details: { key: requested, value: null, text },
        };
      }
    },
  });
}

/** Create a strict pi `ToolDefinition` for writing config values. */
export function createConfigSetTool() {
  return defineTool({
    name: 'config_set',
    label: 'Config Set',
    description: `Write a configuration value to UpUp settings. Use to change model, enable/disable features, update memory settings. Dot notation supported. Some changes require restart.`,
    promptSnippet: 'Write a configuration value (string, number, boolean, or nested object)',
    promptGuidelines: [
      'Use config_set to update a single configuration value. For multi-key changes, prefer one config_set call per key so each write is observable in the session log.',
      'Before calling config_set with a new modelId or feature flag, call config_get first to confirm the current value and surface what will change. Some changes (modelId, enable*) require UpUp to be restarted to take effect.',
    ],
    parameters: configSetParams,
    async execute(
      _toolCallId,
      params: ConfigSetParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: ConfigSetDetails }> {
      try {
        const config = loadConfig() as Record<string, unknown>;
        const oldValue = getConfigValue(config, params.key);

        setConfigValue(config, params.key, params.value);
        saveConfig(config);

        // Notify watchers so other subsystems see the change.
        useDynamicConfig().set(params.key, params.value);

        const newValue = getConfigValue(config, params.key);
        const text =
          `Configuration updated.\n\n` +
          `Key: ${params.key}\n` +
          `Old value: ${formatValue(oldValue)}\n` +
          `New value: ${formatValue(newValue)}\n\n` +
          `Note: Some changes require restarting UpUp to take effect.`;

        return {
          content: [{ type: 'text', text }],
          details: { key: params.key, oldValue, newValue },
        };
      } catch (err) {
        const text = `Config write error: ${err instanceof Error ? err.message : String(err)}`;
        return {
          content: [{ type: 'text', text }],
          details: { key: params.key, oldValue: null, newValue: null },
        };
      }
    },
  });
}

/** Create a strict pi `ToolDefinition` for listing config keys/values. */
export function createConfigListTool() {
  return defineTool({
    name: 'config_list',
    label: 'Config List',
    description: `List all configuration keys and values from UpUp settings. Use to see available options, find keys, or audit current settings. Optional prefix filter (e.g. 'memory', 'model').`,
    promptSnippet: 'List all configuration keys (with optional prefix filter)',
    promptGuidelines: [
      "Use config_list when the user wants to see what configuration is available or audit the current settings. Pass a prefix (e.g. 'memory') to narrow the result.",
    ],
    parameters: configListParams,
    async execute(
      _toolCallId,
      params: ConfigListParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: ConfigListDetails }> {
      try {
        const config = loadConfig() as Record<string, unknown>;
        const prefix = typeof params.prefix === 'string' && params.prefix.length > 0
          ? params.prefix
          : null;

        if (prefix !== null) {
          const filtered: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(config)) {
            if (key.startsWith(prefix)) {
              filtered[key] = value;
            }
          }
          const text = `Configuration (prefix: ${prefix}):\n${formatValue(filtered)}`;
          return {
            content: [{ type: 'text', text }],
            details: { prefix, config: filtered },
          };
        }

        const text = `Configuration:\n${formatValue(config)}`;
        return {
          content: [{ type: 'text', text }],
          details: { prefix: null, config },
        };
      } catch (err) {
        const text = `Config list error: ${err instanceof Error ? err.message : String(err)}`;
        return {
          content: [{ type: 'text', text }],
          details: { prefix: null, config: {} },
        };
      }
    },
  });
}
