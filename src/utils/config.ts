import {
  createConfigBackup,
  getConfigPaths,
  getEnvironmentConfigSources,
  loadConfig as loadLayeredConfig,
  listConfigBackups,
  loadFinalConfig,
  applyEnvironment,
  restoreConfigBackup,
  writeConfigToLayer,
  type ConfigRecord,
  type ConfigValue,
} from '@upup/pi-config';
import { SETTINGS_BACKUPS_DIR, SETTINGS_DIR, SETTINGS_FILE, SETTINGS_LOCAL_FILE } from './storage-paths.js';

export interface Config {
  provider?: string;
  modelId?: string;
  model?: string;
  memory?: {
    enabled?: boolean;
    embeddingProvider?: 'openai' | 'gemini' | 'ollama' | 'auto';
    embeddingModel?: string;
    maxSessionContextTokens?: number;
    memvidRag?: boolean | { enabled?: boolean; model?: string; mode?: 'auto' | 'lex' | 'sem'; k?: number; contextOnly?: boolean };
  };
  [key: string]: unknown;
}

export interface ConfigLayer { file: string; priority: number; data: Record<string, unknown> }
export interface ConfigOptions { mergeStrategy?: 'shallow' | 'deep'; enableCache?: boolean; enableWatch?: boolean }
export interface BackupInfo { path: string; timestamp: number; size: number }
export interface ConfigSourceInfo { key: string; value: unknown; source: string }

const MODEL_TO_PROVIDER_MAP: Record<string, string> = {
  'gpt-5.4': 'openai',
  'gpt-5.2': 'openai',
  'claude-sonnet-4-5': 'anthropic',
  'gemini-3': 'google',
};

const DEPRECATED_MODEL_UPGRADES: Record<string, string> = { 'gpt-5.2': 'gpt-5.4' };
const paths = getConfigPaths();
let cachedConfig: Config | undefined;

function asConfig(value: ConfigRecord): Config {
  return value as Config;
}

function cloneConfig(config: Config): Config {
  return JSON.parse(JSON.stringify(config)) as Config;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else target[key] = value;
  }
}

export function loadMergedConfig(options?: ConfigOptions): Config {
  const loaded = asConfig(loadFinalConfig(paths));
  if (options?.mergeStrategy === 'shallow') return loaded;
  return loaded;
}

export function getConfig(options?: ConfigOptions): Config {
  if (options?.enableCache !== false && cachedConfig) return cachedConfig;
  cachedConfig = loadMergedConfig(options);
  return cachedConfig;
}

export function clearConfigCache(): void { cachedConfig = undefined; }
export function reloadConfig(): Config { clearConfigCache(); return getConfig({ enableCache: false }); }
export function loadConfig(): Config { return getConfig(); }

export function saveConfig(config: Config): boolean {
  try {
    writeConfigToLayer('global', config as ConfigRecord, paths);
    clearConfigCache();
    return true;
  } catch { return false; }
}

export function saveConfigToLayer(layer: 'global' | 'local', config: Partial<Config>): boolean {
  try {
    writeConfigToLayer(layer, config as ConfigRecord, paths);
    clearConfigCache();
    return true;
  } catch { return false; }
}

export function backupConfig(): string | null { return createConfigBackup(paths) ?? null; }

export function listBackups(): BackupInfo[] {
  return listConfigBackups(paths).map((backup) => ({ path: backup.path, timestamp: backup.timestamp, size: backup.size }));
}

export function restoreFromBackup(backupPath?: string): boolean {
  const restored = restoreConfigBackup(backupPath, paths);
  if (restored) clearConfigCache();
  return restored;
}

export function getMostRecentBackup(): string | null { return listBackups().at(-1)?.path ?? null; }

export function applyEnvOverrides(config: Config): Config { return asConfig(applyEnvironment(config as ConfigRecord)); }
export function getFinalConfig(): Config { return getConfig({ enableCache: false }); }

function migrateModelToProvider(config: Config): Config {
  if (config.provider || !config.model) return config;
  const provider = MODEL_TO_PROVIDER_MAP[config.model];
  if (!provider) return config;
  const migrated = { ...config, provider };
  delete migrated.model;
  saveConfig(migrated);
  return migrated;
}

export function getSetting<T>(key: string, defaultValue: T): T {
  const config = key === 'provider' ? migrateModelToProvider(getConfig()) : getConfig();
  return (config[key] === undefined ? defaultValue : config[key]) as T;
}

export function setSetting(key: string, value: unknown): boolean {
  const config = cloneConfig(getConfig({ enableCache: false }));
  config[key] = value;
  if (key === 'provider') delete config.model;
  return saveConfig(config);
}

export function getConfiguredModelId(fallback?: string): string {
  const configured = getSetting<string | undefined>('modelId', undefined);
  if (!configured) return fallback ?? 'deepseek-v4-flash';
  const migrated = DEPRECATED_MODEL_UPGRADES[configured];
  if (migrated) { setSetting('modelId', migrated); return migrated; }
  return configured;
}

export function getConfiguredProvider(fallback?: string): string {
  return getSetting<string>('provider', fallback ?? 'deepseek');
}

export function getConfigSources(): ConfigSourceInfo[] {
  const finalConfig = getFinalConfig();
  const result: ConfigSourceInfo[] = [];
  const files = [
    { file: SETTINGS_FILE, name: 'settings.json' },
    { file: SETTINGS_LOCAL_FILE, name: 'settings.local.json' },
  ];
  for (const file of files) {
    const layer = loadLayeredConfig({ ...paths, globalFile: file.file, localFile: '', fragmentsDir: SETTINGS_DIR, backupsDir: SETTINGS_BACKUPS_DIR });
    for (const key of Object.keys(layer)) if (finalConfig[key] === layer[key]) result.push({ key, value: layer[key], source: file.name });
  }
  for (const source of getEnvironmentConfigSources()) result.push({ key: source.key, value: source.value, source: `env:${source.variable}` });
  return result;
}

export { SETTINGS_FILE, SETTINGS_LOCAL_FILE, SETTINGS_DIR, SETTINGS_BACKUPS_DIR };

export function formatConfigValue(value: unknown): string {
  if (value === undefined) return '(not set)';
  if (value === null) return 'null';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

export function getConfigValue(key?: string): string {
  if (!key) return `Configuration:\n${formatConfigValue(getFinalConfig())}`;
  let current: unknown = getFinalConfig();
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) { current = undefined; break; }
    current = (current as Record<string, unknown>)[part];
  }
  return `${key} = ${formatConfigValue(current)}`;
}

export function mergeConfig(base: Config, overlay: Config): Config {
  const result = cloneConfig(base);
  deepMerge(result, overlay);
  return result;
}
