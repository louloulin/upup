import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const PI_CONFIG_PACKAGE_NAME = '@upup/pi-config' as const;
export const PI_CONFIG_PACKAGE_VERSION = '0.1.0' as const;

export type ConfigValue = string | number | boolean | Record<string, unknown> | unknown[] | null;
export type ConfigRecord = Record<string, ConfigValue>;

export interface ConfigPaths {
  readonly globalFile: string;
  readonly localFile: string;
  readonly fragmentsDir: string;
  readonly backupsDir: string;
}

export interface ConfigLayer { readonly file: string; readonly priority: number; readonly data: ConfigRecord }

const ENV_MAPPINGS: Record<string, string[]> = {
  provider: ['UPUP_PROVIDER', 'UPUP_API_PROVIDER'],
  modelId: ['UPUP_MODEL_ID', 'UPUP_MODEL'],
  debug: ['UPUP_DEBUG'],
  logLevel: ['UPUP_LOG_LEVEL'],
  theme: ['UPUP_THEME'],
};

export function getConfigPaths(home = homedir()): ConfigPaths {
  const root = join(home, '.upup');
  return { globalFile: join(root, 'settings.json'), localFile: join(root, 'settings.local.json'), fragmentsDir: join(root, 'settings.d'), backupsDir: join(root, 'backups') };
}

export function getConfigPathsFromRoot(root: string): ConfigPaths {
  return { globalFile: join(root, 'settings.json'), localFile: join(root, 'settings.local.json'), fragmentsDir: join(root, 'settings.d'), backupsDir: join(root, 'backups') };
}

function isRecord(value: unknown): value is Record<string, ConfigValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseFile(path: string): ConfigRecord | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isRecord(parsed) ? parsed : undefined;
  } catch { return undefined; }
}

function mergeInto(target: Record<string, ConfigValue>, source: ConfigRecord): void {
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(target[key])) mergeInto(target[key] as Record<string, ConfigValue>, value);
    else target[key] = value;
  }
}

export function loadConfig(paths = getConfigPaths()): ConfigRecord {
  const layers: ConfigLayer[] = [];
  const global = parseFile(paths.globalFile);
  if (global) layers.push({ file: paths.globalFile, priority: 1, data: global });
  const local = parseFile(paths.localFile);
  if (local) layers.push({ file: paths.localFile, priority: 2, data: local });
  if (existsSync(paths.fragmentsDir)) {
    for (const file of readdirSync(paths.fragmentsDir).filter((name) => name.endsWith('.json')).sort()) {
      const data = parseFile(join(paths.fragmentsDir, file));
      if (data) layers.push({ file, priority: 3, data });
    }
  }
  const result: ConfigRecord = {};
  for (const layer of layers.sort((left, right) => left.priority - right.priority)) mergeInto(result, layer.data);
  return result;
}

export function loadFinalConfig(paths = getConfigPaths(), environment: NodeJS.ProcessEnv = process.env): ConfigRecord {
  return applyEnvironment(loadConfig(paths), environment);
}

export function applyEnvironment(config: ConfigRecord, environment: NodeJS.ProcessEnv = process.env): ConfigRecord {
  const result = { ...config } as ConfigRecord;
  for (const [key, variables] of Object.entries(ENV_MAPPINGS)) {
    const variable = variables.find((name) => environment[name] !== undefined);
    if (!variable) continue;
    const raw = environment[variable]!;
    const current = result[key];
    let value: ConfigValue = raw;
    if (typeof current === 'boolean') value = raw === 'true' || raw === '1';
    else if (typeof current === 'number') value = Number(raw);
    else if (current && typeof current === 'object') {
      try { value = JSON.parse(raw) as ConfigValue; } catch { /* keep string */ }
    }
    result[key] = value;
  }
  return result;
}

export function getEnvironmentConfigSources(environment: NodeJS.ProcessEnv = process.env): readonly { key: string; variable: string; value: string }[] {
  return Object.entries(ENV_MAPPINGS).flatMap(([key, variables]) => {
    const variable = variables.find((name) => environment[name] !== undefined);
    return variable ? [{ key, variable, value: environment[variable]! }] : [];
  });
}

function getValue(config: ConfigRecord, key: string): ConfigValue | undefined {
  if (!key) return config;
  let current: unknown = config;
  for (const part of key.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current as ConfigValue | undefined;
}

function setValue(config: ConfigRecord, key: string, value: ConfigValue): void {
  const parts = key.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('configuration key must not be empty');
  let current: Record<string, ConfigValue> = config;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!isRecord(existing)) current[part] = {};
    current = current[part] as Record<string, ConfigValue>;
  }
  current[parts.at(-1)!] = value;
}

function display(value: unknown): string {
  if (value === undefined) return '(not set)';
  if (value === null) return 'null';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

export function getConfig(key?: string, paths?: ConfigPaths): string {
  const config = loadConfig(paths);
  return key ? `${key} = ${display(getValue(config, key))}` : `Configuration:\n${display(config)}`;
}

export function setConfig(key: string, value: ConfigValue, paths = getConfigPaths()): { oldValue: ConfigValue | undefined; newValue: ConfigValue } {
  const config = loadConfig(paths);
  const oldValue = getValue(config, key);
  setValue(config, key, value);
  mkdirSync(dirname(paths.globalFile), { recursive: true });
  writeConfigToLayer('global', config, paths);
  return { oldValue, newValue: getValue(config, key)! };
}

export function writeConfigToLayer(layer: 'global' | 'local', config: ConfigRecord, paths = getConfigPaths()): void {
  const target = layer === 'global' ? paths.globalFile : paths.localFile;
  mkdirSync(dirname(target), { recursive: true });
  if (layer === 'global' && existsSync(target)) createConfigBackup(paths);
  writeFileSync(target, JSON.stringify(config, null, 2));
}

export interface ConfigBackup { readonly path: string; readonly timestamp: number; readonly size: number }

export function listConfigBackups(paths = getConfigPaths()): ConfigBackup[] {
  if (!existsSync(paths.backupsDir)) return [];
  return readdirSync(paths.backupsDir)
    .filter((file) => file.startsWith('settings.json.backup.'))
    .sort()
    .map((file) => {
      const path = join(paths.backupsDir, file);
      const timestamp = Number(file.split('.backup.').at(-1) ?? 0);
      return { path, timestamp, size: statSync(path).size };
    });
}

export function createConfigBackup(paths = getConfigPaths()): string | undefined {
  if (!existsSync(paths.globalFile)) return undefined;
  mkdirSync(paths.backupsDir, { recursive: true });
  const path = join(paths.backupsDir, `settings.json.backup.${Date.now()}`);
  copyFileSync(paths.globalFile, path);
  return path;
}

export function restoreConfigBackup(backupPath: string | undefined, paths = getConfigPaths()): boolean {
  const backup = backupPath ?? listConfigBackups(paths).at(-1)?.path;
  if (!backup || !existsSync(backup)) return false;
  mkdirSync(dirname(paths.globalFile), { recursive: true });
  if (existsSync(paths.globalFile)) createConfigBackup(paths);
  copyFileSync(backup, paths.globalFile);
  return true;
}

export function listConfig(prefix?: string, paths?: ConfigPaths): ConfigRecord {
  const config = loadConfig(paths);
  if (!prefix) return config;
  return Object.fromEntries(Object.entries(config).filter(([key]) => key.startsWith(prefix))) as ConfigRecord;
}

export function configSourceFiles(paths = getConfigPaths()): readonly string[] {
  const files = [paths.globalFile, paths.localFile];
  if (existsSync(paths.fragmentsDir)) files.push(...readdirSync(paths.fragmentsDir).filter((file) => file.endsWith('.json')).map((file) => join(paths.fragmentsDir, file)));
  return files.filter((file) => existsSync(file) && statSync(file).isFile());
}

export { display as formatConfigValue };
