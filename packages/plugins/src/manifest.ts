/**
 * UpUp Plugin System — Manifest Loading & Validation
 *
 * Loads and validates upup.plugin.json manifest files.
 * Provides JSON Schema validation for plugin configuration.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import type { PluginManifest, PluginRuntime } from './types.js';

// ============================================================================
// Manifest Loader
// ============================================================================

const VALID_RUNTIMES: PluginRuntime[] = ['bun', 'jiti', 'wasm', 'mcp'];
const VALID_CAPABILITIES = ['data-source', 'tools', 'analysis', 'strategy', 'channel', 'service'];

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

    // Check file exists
    if (!existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
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

    // Track provenance
    if (provenance) {
      (manifest as unknown as Record<string, unknown>)._provenance = provenance;
    }

    // Cache
    try {
      const stat = statSync(manifestPath);
      this.cache.set(manifestPath, { manifest, mtime: stat.mtimeMs });
    } catch {
      // Ignore stat errors
    }

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

    // ID format: lowercase alphanumeric with hyphens
    if (!/^[a-z0-9-]+$/.test(m.id as string)) {
      throw new Error(`Invalid id format: must be lowercase alphanumeric with hyphens${source ? ` (${source})` : ''}`);
    }

    if (!m.name || typeof m.name !== 'string') {
      throw new Error(`Missing or invalid name${source ? ` (${source})` : ''}`);
    }

    if (!m.version || typeof m.version !== 'string') {
      throw new Error(`Missing or invalid version${source ? ` (${source})` : ''}`);
    }

    // Version format: semver
    if (!/^\d+\.\d+\.\d+/.test(m.version as string)) {
      throw new Error(`Invalid version format: must be semver (e.g., 1.0.0)${source ? ` (${source})` : ''}`);
    }

    if (!m.runtime || !VALID_RUNTIMES.includes(m.runtime as PluginRuntime)) {
      throw new Error(`Invalid runtime: must be one of ${VALID_RUNTIMES.join(', ')}${source ? ` (${source})` : ''}`);
    }

    if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) {
      throw new Error(`Missing or empty capabilities${source ? ` (${source})` : ''}`);
    }

    for (const cap of m.capabilities as string[]) {
      if (!VALID_CAPABILITIES.includes(cap)) {
        throw new Error(`Invalid capability: "${cap}"${source ? ` (${source})` : ''}`);
      }
    }

    if (!m.entry || typeof m.entry !== 'string') {
      throw new Error(`Missing or invalid entry${source ? ` (${source})` : ''}`);
    }
  }

  /**
   * Validate runtime config against manifest
   */
  validateConfig(manifest: PluginManifest, config: Record<string, unknown>): boolean {
    if (!manifest.runtimeConfig) return true;

    const required = Object.entries(manifest.runtimeConfig)
      .filter(([, v]) => (v as { required?: boolean }).required === true)
      .map(([k]) => k);

    for (const key of required) {
      if (!(key in config)) {
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
 * Validate plugin config against manifest
 */
export function validatePluginConfig(manifest: PluginManifest, config: Record<string, unknown>): boolean {
  return getManifestLoader().validateConfig(manifest, config);
}
