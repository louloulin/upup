/**
 * UpUp Plugin System — Manifest Loading & Validation
 *
 * Loads and validates upup.plugin.json manifest files.
 * Provides JSON Schema validation for plugin configuration.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { warn, info } from '../utils/logging/logger.js';
import { pluginFileExists, isPathInside } from './path-safety.js';
import type { PluginManifest, PluginRuntime, PluginCapability } from './types.js';

// ============================================================================
// Manifest Schema (JSON Schema for validation)
// ============================================================================

const MANIFEST_SCHEMA = {
  type: 'object',
  required: ['schemaVersion', 'id', 'name', 'version', 'runtime', 'capabilities', 'entry'],
  properties: {
    schemaVersion: { type: 'string', const: '1.0' },
    id: {
      type: 'string',
      pattern: '^[a-z0-9-]+$',
      minLength: 1,
      maxLength: 64,
    },
    name: { type: 'string', minLength: 1, maxLength: 128 },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+' },
    description: { type: 'string', maxLength: 512 },
    runtime: { type: 'string', enum: ['bun', 'jiti', 'wasm', 'mcp'] },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        url: { type: 'string', format: 'uri' },
      },
    },
    license: { type: 'string' },
    homepage: { type: 'string', format: 'uri' },
    capabilities: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['data-source', 'tools', 'analysis', 'strategy', 'channel', 'service'],
      },
      minItems: 1,
    },
    entry: { type: 'string', minLength: 1 },
    hooks: { type: 'string' },
    tools: { type: 'string' },
    dependencies: { type: 'array', items: { type: 'string' } },
    peerDependencies: { type: 'object' },
    security: {
      type: 'object',
      properties: {
        sandbox: { type: 'string', enum: ['process', 'wasm', 'mcp', 'none'] },
        permissions: { type: 'array', items: { type: 'string' } },
        networkDomains: { type: 'array', items: { type: 'string' } },
        credentialScopes: { type: 'array', items: { type: 'string' } },
      },
    },
    runtimeConfig: { type: 'object' },
  },
};

// ============================================================================
// Manifest Loader
// ============================================================================

export class ManifestLoader {
  private cache = new Map<string, { manifest: PluginManifest; mtime: number }>();
  private cacheTimeout = 200; // ms

  /**
   * Load and validate a plugin manifest from a directory
   */
  load(dirPath: string, provenance?: string): PluginManifest {
    const manifestPath = resolve(dirPath, 'upup.plugin.json');

    // Check cache
    const cached = this.cache.get(manifestPath);
    if (cached && Date.now() - cached.mtime < this.cacheTimeout) {
      return cached.manifest;
    }

    // Load manifest file
    let content: string;
    try {
      content = readFileSync(manifestPath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read manifest: ${manifestPath} — ${(err as Error).message}`);
    }

    // Parse JSON
    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(content);
    } catch (err) {
      throw new Error(`Invalid JSON in manifest: ${manifestPath} — ${(err as Error).message}`);
    }

    // Validate
    this.validate(manifest, manifestPath);
    // Validate optional skills[] entries (P1.7)
    const m = manifest as unknown as Record<string, unknown>;
    if ('skills' in m) {
      validatePluginSkills(m['skills']);
    }

    // Track provenance
    if (provenance) {
      (manifest as any)._provenance = provenance;
    }

    // Cache
    const stat = require('fs').statSync(manifestPath);
    this.cache.set(manifestPath, { manifest, mtime: stat.mtimeMs });

    return manifest;
  }

  /**
   * Validate a manifest against the schema
   */
  validate(manifest: unknown, source?: string): asserts manifest is PluginManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error(`Invalid manifest: not an object${source ? ` (${source})` : ''}`);
    }

    const m = manifest as Record<string, unknown>;

    // Required fields
    if (!m.schemaVersion || m.schemaVersion !== '1.0') {
      throw new Error(`Invalid schemaVersion: expected "1.0"${source ? ` (${source})` : ''}`);
    }

    if (!m.id || typeof m.id !== 'string') {
      throw new Error(`Missing or invalid id${source ? ` (${source})` : ''}`);
    }

    if (!m.name || typeof m.name !== 'string') {
      throw new Error(`Missing or invalid name${source ? ` (${source})` : ''}`);
    }

    if (!m.version || typeof m.version !== 'string') {
      throw new Error(`Missing or invalid version${source ? ` (${source})` : ''}`);
    }

    if (!m.runtime || !['bun', 'jiti', 'wasm', 'mcp'].includes(m.runtime as string)) {
      throw new Error(`Invalid runtime: must be "bun", "jiti", "wasm", or "mcp"${source ? ` (${source})` : ''}`);
    }

    if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) {
      throw new Error(`Missing or empty capabilities${source ? ` (${source})` : ''}`);
    }

    const validCapabilities = ['data-source', 'tools', 'analysis', 'strategy', 'channel', 'service'];
    for (const cap of m.capabilities as string[]) {
      if (!validCapabilities.includes(cap)) {
        throw new Error(`Invalid capability: "${cap}"${source ? ` (${source})` : ''}`);
      }
    }

    if (!m.entry || typeof m.entry !== 'string') {
      throw new Error(`Missing or invalid entry${source ? ` (${source})` : ''}`);
    }

    if (m.security !== undefined) {
      if (!m.security || typeof m.security !== 'object' || Array.isArray(m.security)) {
        throw new Error(`Invalid security declaration${source ? ` (${source})` : ''}`);
      }
      const security = m.security as Record<string, unknown>;
      for (const field of ['permissions', 'networkDomains', 'credentialScopes']) {
        if (security[field] !== undefined && (!Array.isArray(security[field]) || security[field].some((item) => typeof item !== 'string' || !item.trim()))) {
          throw new Error(`Invalid security.${field}: expected an array of non-empty strings${source ? ` (${source})` : ''}`);
        }
      }
    }

    // Version format
    if (!/^\d+\.\d+\.\d+/.test(m.version as string)) {
      warn('default', `Version "${m.version}" doesn't follow semver format`);
    }
  }

  /**
   * Validate runtime config against manifest
   */
  validateConfig(manifest: PluginManifest, config: Record<string, unknown>): boolean {
    if (!manifest.runtimeConfig) return true;

    const required = Object.entries(manifest.runtimeConfig)
      .filter(([, v]) => (v as any).required === true)
      .map(([k]) => k);

    for (const key of required) {
      if (!(key in config)) {
        warn('default', `Missing required config key: ${key}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Clear the manifest cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cached manifest if fresh
   */
  getCached(manifestPath: string): PluginManifest | null {
    const cached = this.cache.get(manifestPath);
    if (cached && Date.now() - cached.mtime < this.cacheTimeout) {
      return cached.manifest;
    }
    return null;
  }
}

// ============================================================================
// Manifest Loader Singleton
// ============================================================================

let manifestLoader: ManifestLoader | null = null;

export function getManifestLoader(): ManifestLoader {
  if (!manifestLoader) {
    manifestLoader = new ManifestLoader();
  }
  return manifestLoader;
}

// ============================================================================
// Manifest Helpers
// ============================================================================

/**
 * Get manifest from a plugin directory
 */
export function loadPluginManifest(dirPath: string, provenance?: string): PluginManifest {
  return getManifestLoader().load(dirPath, provenance);
}

/**
 * Validate plugin skill entry shape (P1.7 — added in
 * unify-skills-and-plugins-registries).
 *
 * Plugins declare skills in their upup.plugin.json `skills` array. The
 * shape mirrors `PluginSkillEntry` in the SDK; this guard rejects
 * bad shape early (wrong field name, missing required fields, etc.)
 * so plugin authors get a clear error instead of a runtime crash.
 *
 * Not using Zod (not a project dep) — small surface area means a
 * type-guard function is fine.
 */
export function validatePluginSkills(skills: unknown): void {
  if (!Array.isArray(skills)) {
    throw new Error('Plugin manifest "skills" must be an array');
  }
  for (let i = 0; i < skills.length; i++) {
    const entry = skills[i];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Plugin skill[${i}] is not an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string' || e.name.length === 0) {
      throw new Error(`Plugin skill[${i}].name must be a non-empty string`);
    }
    if (typeof e.description !== 'string') {
      throw new Error(`Plugin skill[${i}].description must be a string`);
    }
    if (typeof e.instructions !== 'string') {
      throw new Error(`Plugin skill[${i}].instructions must be a string`);
    }
    if (e.argumentHint !== undefined && typeof e.argumentHint !== 'string') {
      throw new Error(`Plugin skill[${i}].argumentHint must be a string if present`);
    }
    if (e.aliases !== undefined) {
      if (!Array.isArray(e.aliases) || !e.aliases.every((a: unknown) => typeof a === 'string')) {
        throw new Error(`Plugin skill[${i}].aliases must be string[] if present`);
      }
    }
    if (e.model !== undefined && !['sonnet', 'haiku', 'opus', 'default'].includes(e.model as string)) {
      throw new Error(`Plugin skill[${i}].model must be sonnet|haiku|opus|default`);
    }
    if (e.context !== undefined && !['inline', 'fork'].includes(e.context as string)) {
      throw new Error(`Plugin skill[${i}].context must be inline|fork`);
    }
    if (e.userInvocable !== undefined && typeof e.userInvocable !== 'boolean') {
      throw new Error(`Plugin skill[${i}].userInvocable must be boolean if present`);
    }
  }
}

/**
 * Validate plugin config against manifest
 */
export function validatePluginConfig(manifest: PluginManifest, config: Record<string, unknown>): boolean {
  return getManifestLoader().validateConfig(manifest, config);
}
