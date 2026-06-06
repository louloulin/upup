/**
 * @upup/plugin-sdk - Plugin Manifest
 *
 * Plugin manifest schema and validation utilities.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConfigSchemaField } from './index.js';

/**
 * Plugin manifest definition
 */
export interface PluginManifest {
  /** Unique plugin identifier (kebab-case) */
  id: string;
  /** Human-readable plugin name */
  name: string;
  /** Plugin version */
  version?: string;
  /** Plugin description */
  description?: string;
  /** Main entry file */
  main: string;
  /** Runtime environment */
  runtime?: 'node' | 'bun' | 'deno';
  /** Configuration schema */
  configSchema?: Record<string, ConfigSchemaField>;
  /** Plugin capabilities */
  capabilities?: PluginCapability[];
  /** MCP channels */
  channels?: string[];
  /** Hook events to register */
  hooks?: string[];
  /** Tool names to register */
  tools?: string[];
}

/**
 * Plugin capability types
 */
export type PluginCapability =
  | 'tool'
  | 'hook'
  | 'channel'
  | 'provider'
  | 'cli';

/**
 * Result of loading a plugin manifest
 */
export interface PluginManifestLoadResult {
  ok: true;
  manifest: PluginManifest;
  manifestPath: string;
}

/**
 * Error result of loading a plugin manifest
 */
export interface PluginManifestLoadError {
  ok: false;
  error: string;
  manifestPath: string;
}

/**
 * Validate a plugin manifest
 */
export function validateManifest(manifest: unknown): {
  valid: boolean;
  errors?: string[];
} {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Record<string, unknown>;
  const errors: string[] = [];

  // Required fields
  if (!m.id || typeof m.id !== 'string' || !m.id.trim()) {
    errors.push('id is required and must be a non-empty string');
  } else if (!/^[a-z0-9-]+$/.test(m.id)) {
    errors.push('id must be lowercase alphanumeric with hyphens (kebab-case)');
  }

  if (!m.name || typeof m.name !== 'string' || !m.name.trim()) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!m.main || typeof m.main !== 'string' || !m.main.trim()) {
    errors.push('main is required and must be a non-empty string');
  }

  // Optional field validation
  if (m.version && typeof m.version !== 'string') {
    errors.push('version must be a string');
  }

  if (m.description && typeof m.description !== 'string') {
    errors.push('description must be a string');
  }

  if (m.runtime && !['node', 'bun', 'deno'].includes(m.runtime as string)) {
    errors.push('runtime must be one of: node, bun, deno');
  }

  if (m.configSchema && (typeof m.configSchema !== 'object' || m.configSchema === null)) {
    errors.push('configSchema must be an object');
  }

  if (m.capabilities && !Array.isArray(m.capabilities)) {
    errors.push('capabilities must be an array');
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Load and validate a plugin manifest from a directory
 */
export async function loadManifest(
  pluginDir: string
): Promise<PluginManifestLoadResult | PluginManifestLoadError> {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const manifestPath = path.join(pluginDir, 'upup.plugin.json');

  try {
    // Check if file exists
    await fs.promises.access(manifestPath);

    // Read and parse
    const content = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as PluginManifest;

    // Validate
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Invalid manifest: ${validation.errors?.join(', ')}`,
        manifestPath,
      };
    }

    return { ok: true, manifest, manifestPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ENOENT') || message.includes('no such file')) {
      return {
        ok: false,
        error: `Plugin manifest not found: ${manifestPath}`,
        manifestPath,
      };
    }

    if (message.includes('JSON')) {
      return {
        ok: false,
        error: `Failed to parse manifest: ${message}`,
        manifestPath,
      };
    }

    return {
      ok: false,
      error: `Failed to load manifest: ${message}`,
      manifestPath,
    };
  }
}

/**
 * Load manifest synchronously
 */
export function loadManifestSync(
  pluginDir: string
): PluginManifestLoadResult | PluginManifestLoadError {
  const manifestPath = path.join(pluginDir, 'upup.plugin.json');

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as PluginManifest;

    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Invalid manifest: ${validation.errors?.join(', ')}`,
        manifestPath,
      };
    }

    return { ok: true, manifest, manifestPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ENOENT') || message.includes('no such file')) {
      return {
        ok: false,
        error: `Plugin manifest not found: ${manifestPath}`,
        manifestPath,
      };
    }

    return {
      ok: false,
      error: `Failed to load manifest: ${message}`,
      manifestPath,
    };
  }
}


/**
 * Skill manifest entry (P1.7 — added in unify-skills-and-plugins-registries).
 * Plugins can declare skills in their upup.plugin.json instead of forking
 * the codebase. The shape is a strict subset of SkillMetadata; the
 * runtime API (`PluginAPI.registerSkill`) accepts the same fields plus
 * a few extras.
 */
export interface PluginSkillEntry {
  /** Unique skill name (lowercase, hyphenated) */
  name: string;
  /** Short description shown in autocomplete + system prompt */
  description: string;
  /** Optional argument hint (e.g. "<ticker>") */
  argumentHint?: string;
  /** Optional slash command triggers (e.g. ["my", "ma"]) */
  aliases?: string[];
  /** Preferred model for this skill (sonnet | haiku | opus | default) */
  model?: 'sonnet' | 'haiku' | 'opus' | 'default';
  /** Whether this skill is user-invocable (default: true) */
  userInvocable?: boolean;
  /** Execution mode */
  context?: 'inline' | 'fork';
  /** Allowed tools */
  allowedTools?: string[];
  /** Markdown body — full instructions loaded into the skill */
  instructions: string;
}

/**
 * Skill registration input for the runtime API.
 * Mirrors PluginSkillEntry but is the canonical shape the host accepts.
 */
export interface PluginSkillRegistration {
  name: string;
  description: string;
  instructions: string;
  argumentHint?: string;
  aliases?: string[];
  model?: 'sonnet' | 'haiku' | 'opus' | 'default';
  context?: 'inline' | 'fork';
  allowedTools?: string[];
  userInvocable?: boolean;
}