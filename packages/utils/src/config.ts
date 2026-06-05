/**
 * Configuration System
 *
 * Multi-layer configuration system with:
 * - Layer 1: settings.json (global base)
 * - Layer 2: settings.local.json (local override)
 * - Layer 3: settings.d/*.json (config fragments)
 * - Environment variables (highest priority)
 *
 * Features:
 * - Deep merge of config layers
 * - Automatic backup before write
 * - Config caching with file monitoring
 * - Environment variable overrides
 * - Backup and restore functionality
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { SETTINGS_FILE, SETTINGS_LOCAL_FILE, SETTINGS_DIR, SETTINGS_BACKUPS_DIR } from './storage-paths.js';

// ============================================================================
// Types
// ============================================================================

export interface Config {
  provider?: string;
  modelId?: string;
  model?: string;
  memory?: {
    enabled?: boolean;
    embeddingProvider?: 'openai' | 'gemini' | 'ollama' | 'auto';
    embeddingModel?: string;
    maxSessionContextTokens?: number;
    memvidRag?: boolean | {
      enabled?: boolean;
      model?: string;
      mode?: 'auto' | 'lex' | 'sem';
      k?: number;
      contextOnly?: boolean;
    };
  };
  [key: string]: unknown;
}

export interface ConfigLayer {
  file: string;
  priority: number;
  data: Record<string, unknown>;
}

export interface ConfigOptions {
  mergeStrategy?: 'shallow' | 'deep';
  enableCache?: boolean;
  enableWatch?: boolean;
}

export interface BackupInfo {
  path: string;
  timestamp: number;
  size: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_BACKUPS = 5;
const MIN_BACKUP_INTERVAL_MS = 60_000;

const MODEL_TO_PROVIDER_MAP: Record<string, string> = {
  'gpt-5.4': 'openai',
  'gpt-5.2': 'openai',
  'claude-sonnet-4-5': 'anthropic',
  'gemini-3': 'google',
};

const DEPRECATED_MODEL_UPGRADES: Record<string, string> = {
  'gpt-5.2': 'gpt-5.4',
};

// Environment variable mappings
const ENV_MAPPINGS: Record<string, string[]> = {
  provider: ['UPUP_PROVIDER', 'UPUP_API_PROVIDER'],
  modelId: ['UPUP_MODEL_ID', 'UPUP_MODEL'],
  debug: ['UPUP_DEBUG'],
  logLevel: ['UPUP_LOG_LEVEL'],
  theme: ['UPUP_THEME'],
};

// ============================================================================
// Config Cache
// ============================================================================

interface ConfigCache {
  config: Config | null;
  mtime: number;
  etag: string;
  timestamp: number;
}

let configCache: ConfigCache = {
  config: null,
  mtime: 0,
  etag: '',
  timestamp: 0,
};

let watchStarted = false;

// ============================================================================
// Config Loading
// ============================================================================

/**
 * Load all config layers and merge them
 */
export function loadMergedConfig(options?: ConfigOptions): Config {
  const layers: ConfigLayer[] = [];

  // Layer 1: settings.json (priority 1)
  if (existsSync(SETTINGS_FILE)) {
    try {
      const content = readFileSync(SETTINGS_FILE, 'utf-8');
      const data = JSON.parse(content);
      layers.push({ file: SETTINGS_FILE, priority: 1, data });
    } catch { /* ignore */ }
  }

  // Layer 2: settings.local.json (priority 2)
  if (existsSync(SETTINGS_LOCAL_FILE)) {
    try {
      const content = readFileSync(SETTINGS_LOCAL_FILE, 'utf-8');
      const data = JSON.parse(content);
      layers.push({ file: SETTINGS_LOCAL_FILE, priority: 2, data });
    } catch { /* ignore */ }
  }

  // Layer 3: settings.d/*.json (priority 3)
  if (existsSync(SETTINGS_DIR)) {
    const files = readdirSync(SETTINGS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();
    for (const file of files) {
      try {
        const content = readFileSync(join(SETTINGS_DIR, file), 'utf-8');
        const data = JSON.parse(content);
        layers.push({ file, priority: 3, data });
      } catch { /* ignore */ }
    }
  }

  // Merge layers
  const strategy = options?.mergeStrategy ?? 'deep';
  return mergeConfigLayers(layers, strategy);
}

/**
 * Merge config layers (higher priority wins)
 */
function mergeConfigLayers(layers: ConfigLayer[], strategy: 'shallow' | 'deep'): Config {
  const result: Record<string, unknown> = {};

  // Sort by priority (lower first)
  layers.sort((a, b) => a.priority - b.priority);

  for (const layer of layers) {
    if (strategy === 'deep') {
      deepMerge(result, layer.data);
    } else {
      Object.assign(result, layer.data);
    }
  }

  return result as Config;
}

/**
 * Deep merge two objects
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key]) && !Array.isArray(value)) {
      deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

/**
 * Check if value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Config Caching
// ============================================================================

/**
 * Get config with caching
 */
export function getConfig(options?: ConfigOptions): Config {
  const enableCache = options?.enableCache ?? true;

  // Check cache
  if (enableCache && configCache.config && Date.now() - configCache.timestamp < 5000) {
    return configCache.config;
  }

  // Load and cache
  const config = loadMergedConfig(options);
  let mtime = 0;
  try {
    const stats = statSync(SETTINGS_FILE);
    mtime = stats.mtimeMs;
  } catch { /* ignore */ }

  configCache = {
    config,
    mtime,
    etag: generateEtag(config),
    timestamp: Date.now(),
  };

  // Start file watcher
  if (!watchStarted) {
    startConfigWatcher();
    watchStarted = true;
  }

  return config;
}

/**
 * Clear config cache
 */
export function clearConfigCache(): void {
  configCache = { config: null, mtime: 0, etag: '', timestamp: 0 };
}

/**
 * Force reload configuration from disk
 * Clears cache and returns fresh config
 */
export function reloadConfig(): Config {
  clearConfigCache();
  return getConfig();
}

/**
 * Generate ETag for config
 */
function generateEtag(config: Config): string {
  return JSON.stringify(config).slice(0, 32);
}

/**
 * Start config file watcher
 */
function startConfigWatcher(): void {
  // Simple file check every 2 seconds
  const interval = setInterval(() => {
    try {
      const stats = statSync(SETTINGS_FILE);
      if (stats.mtimeMs > configCache.mtime) {
        clearConfigCache();
      }
    } catch { /* ignore */ }
  }, 2000);

  // Cleanup on process exit
  process.on('exit', () => clearInterval(interval));
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Load config (legacy function for compatibility)
 */
export function loadConfig(): Config {
  return getConfig({ mergeStrategy: 'deep' });
}

// ============================================================================
// Config Saving
// ============================================================================

/**
 * Save config to global layer
 */
export function saveConfig(config: Config): boolean {
  return saveConfigToLayer('global', config);
}

/**
 * Save config to specific layer
 */
export function saveConfigToLayer(layer: 'global' | 'local', config: Partial<Config>): boolean {
  let targetFile: string;

  switch (layer) {
    case 'global':
      targetFile = SETTINGS_FILE;
      break;
    case 'local':
      targetFile = SETTINGS_LOCAL_FILE;
      break;
  }

  try {
    // Backup current config before writing
    if (layer === 'global' && existsSync(targetFile)) {
      backupConfig();
    }

    const dir = dirname(targetFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(targetFile, JSON.stringify(config, null, 2));
    clearConfigCache();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Backup System
// ============================================================================

/**
 * Create backup of settings.json
 */
export function backupConfig(): string | null {
  if (!existsSync(SETTINGS_FILE)) return null;

  const backupsDir = SETTINGS_BACKUPS_DIR;

  try {
    // Ensure backups directory exists
    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
    }

    // Check if recent backup exists
    const existingBackups = listBackups();
    if (existingBackups.length > 0) {
      const mostRecent = existingBackups[existingBackups.length - 1];
      if (Date.now() - mostRecent.timestamp < MIN_BACKUP_INTERVAL_MS) {
        return null; // Skip backup - too recent
      }
    }

    // Create backup
    const backupPath = join(backupsDir, `settings.json.backup.${Date.now()}`);
    copyFileSync(SETTINGS_FILE, backupPath);

    // Cleanup old backups
    cleanupOldBackups();

    return backupPath;
  } catch {
    return null;
  }
}

/**
 * List all backups
 */
export function listBackups(): BackupInfo[] {
  if (!existsSync(SETTINGS_BACKUPS_DIR)) return [];

  try {
    const files = readdirSync(SETTINGS_BACKUPS_DIR)
      .filter(f => f.startsWith('settings.json.backup.'))
      .sort();

    return files.map(f => {
      const path = join(SETTINGS_BACKUPS_DIR, f);
      const stats = statSync(path);
      const timestamp = parseInt(f.split('.backup.').pop() ?? '0');
      return {
        path,
        timestamp,
        size: stats.size,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Restore from backup
 */
export function restoreFromBackup(backupPath?: string): boolean {
  const backups = listBackups();
  if (backups.length === 0) return false;

  const targetPath = backupPath ?? backups[backups.length - 1].path;
  if (!existsSync(targetPath)) return false;

  try {
    // Backup current before restore
    if (existsSync(SETTINGS_FILE)) {
      backupConfig();
    }
    copyFileSync(targetPath, SETTINGS_FILE);
    clearConfigCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get most recent backup path
 */
export function getMostRecentBackup(): string | null {
  const backups = listBackups();
  if (backups.length === 0) return null;
  return backups[backups.length - 1].path;
}

/**
 * Cleanup old backups
 */
function cleanupOldBackups(): void {
  const backups = listBackups();
  if (backups.length <= MAX_BACKUPS) return;

  // Remove oldest backups
  const toRemove = backups.slice(0, backups.length - MAX_BACKUPS);
  for (const backup of toRemove) {
    try {
      unlinkSync(backup.path);
    } catch { /* ignore */ }
  }
}

// ============================================================================
// Environment Variables
// ============================================================================

/**
 * Apply environment variable overrides
 */
export function applyEnvOverrides(config: Config): Config {
  const result = { ...config } as Record<string, unknown>;

  for (const [configKey, envVars] of Object.entries(ENV_MAPPINGS)) {
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value !== undefined) {
        const currentValue = result[configKey];
        let parsedValue: unknown = value;

        if (typeof currentValue === 'boolean') {
          parsedValue = value === 'true' || value === '1';
        } else if (typeof currentValue === 'number') {
          parsedValue = parseFloat(value) || 0;
        } else if (typeof currentValue === 'object') {
          try {
            parsedValue = JSON.parse(value);
          } catch { /* use string */ }
        }

        result[configKey] = parsedValue;
        break;
      }
    }
  }

  return result as Config;
}

/**
 * Get final config with all layers and env overrides
 */
export function getFinalConfig(): Config {
  const baseConfig = getConfig({ mergeStrategy: 'deep' });
  return applyEnvOverrides(baseConfig);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Migrates legacy `model` setting to `provider` setting.
 */
function migrateModelToProvider(config: Config): Config {
  if (config.provider) return config;

  if (config.model) {
    const providerId = MODEL_TO_PROVIDER_MAP[config.model];
    if (providerId) {
      config.provider = providerId;
      delete config.model;
      saveConfig(config);
    }
  }

  return config;
}

/**
 * Get a specific setting value
 */
export function getSetting<T>(key: string, defaultValue: T): T {
  let config = getConfig();

  if (key === 'provider') {
    config = migrateModelToProvider(config);
  }

  const value = config[key];
  return (value !== undefined ? value : defaultValue) as T;
}

/**
 * Set a specific setting value
 */
export function setSetting(key: string, value: unknown): boolean {
  const config = getConfig();
  config[key] = value;

  if (key === 'provider' && config.model) {
    delete config.model;
  }

  return saveConfig(config);
}

/**
 * Get configured model ID
 */
export function getConfiguredModelId(fallback?: string): string {
  const config = getConfig();
  if (config.modelId) {
    // Check for deprecated model
    if (DEPRECATED_MODEL_UPGRADES[config.modelId]) {
      config.modelId = DEPRECATED_MODEL_UPGRADES[config.modelId];
      saveConfig(config);
    }
    return config.modelId;
  }
  return fallback ?? 'deepseek-v4-flash';
}

/**
 * Get configured provider
 */
export function getConfiguredProvider(fallback?: string): string {
  const config = getConfig();
  if (config.provider) {
    return config.provider;
  }
  return fallback ?? 'deepseek';
}

// ============================================================================
// Config Source Info
// ============================================================================

/**
 * Get information about where each config key comes from
 */
export interface ConfigSourceInfo {
  key: string;
  value: unknown;
  source: string;
}

export function getConfigSources(): ConfigSourceInfo[] {
  const result: ConfigSourceInfo[] = [];
  const finalConfig = getFinalConfig();

  // Check each layer for the source of each key
  const layers = [
    { file: SETTINGS_FILE, name: 'settings.json' },
    { file: SETTINGS_LOCAL_FILE, name: 'settings.local.json' },
  ];

  for (const layer of layers) {
    if (existsSync(layer.file)) {
      try {
        const data = JSON.parse(readFileSync(layer.file, 'utf-8'));
        for (const key of Object.keys(data)) {
          if (finalConfig[key] === data[key]) {
            result.push({ key, value: data[key], source: layer.name });
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Check settings.d/
  if (existsSync(SETTINGS_DIR)) {
    const files = readdirSync(SETTINGS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const path = join(SETTINGS_DIR, file);
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        for (const key of Object.keys(data)) {
          if (finalConfig[key] === data[key]) {
            result.push({ key, value: data[key], source: `settings.d/${file}` });
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Check environment variables
  for (const [, envVars] of Object.entries(ENV_MAPPINGS)) {
    for (const envVar of envVars) {
      if (process.env[envVar] !== undefined) {
        const configKey = Object.keys(ENV_MAPPINGS).find(
          k => ENV_MAPPINGS[k].includes(envVar)
        );
        if (configKey && finalConfig[configKey] !== undefined) {
          result.push({
            key: configKey,
            value: process.env[envVar],
            source: `env:${envVar}`,
          });
        }
      }
    }
  }

  return result;
}