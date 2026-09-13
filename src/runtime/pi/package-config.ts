import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { PiPluginTrustPolicy } from './plugin-trust.js';

export interface ConfiguredPiPackageOptions {
  readonly piPackagePaths: readonly string[];
  readonly piPackageTrust: PiPluginTrustPolicy;
}

interface ProjectPiPackageSettings {
  readonly packages?: readonly (string | { readonly source?: unknown })[];
  readonly upupPiPackages?: {
    readonly trustedPaths?: unknown;
    readonly pinnedPackages?: unknown;
    readonly allowedSources?: unknown;
  };
}

const SOURCE_FINANCE_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/pi-finance-sdk',
);

function builtinFinancePackageCandidates(cwd: string): string[] {
  const executableDirectory = dirname(process.execPath);
  return [
    resolve(cwd, 'packages/pi-finance-sdk'),
    resolve(cwd, 'dist/pi-finance-sdk'),
    resolve(executableDirectory, 'pi-finance-sdk'),
    resolve(executableDirectory, '../share/upup/pi-finance-sdk'),
    SOURCE_FINANCE_PACKAGE_PATH,
  ];
}

export function getBuiltinPiPackageOptions(cwd = process.cwd()): ConfiguredPiPackageOptions | undefined {
  const packagePath = builtinFinancePackageCandidates(cwd).find((candidate) => existsSync(join(candidate, 'package.json')));
  if (!packagePath) return undefined;
  return {
    piPackagePaths: [packagePath],
    piPackageTrust: {
      trustedPaths: [packagePath],
      pinnedPackages: {
        '@upup/pi-finance-sdk': '0.1.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
        typebox: '1.3.7',
      },
      allowedSources: { '@upup/pi-finance-sdk': ['builtin:upup'] },
    },
  };
}

function parseList(name: string): string[] {
  const value = process.env[name]?.trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new Error(`${name} must be a JSON array of non-empty strings`);
    }
    return parsed.map((item) => item.trim());
  }
  return value.split(delimiter).map((item) => item.trim()).filter(Boolean);
}

function parsePinnedPackages(): Readonly<Record<string, string>> {
  const value = process.env.UPUP_PI_PINNED_PACKAGES?.trim();
  if (!value) throw new Error('UPUP_PI_PINNED_PACKAGES is required when UPUP_PI_PACKAGE_PATHS is configured');
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('UPUP_PI_PINNED_PACKAGES must be a JSON object of package names to exact versions');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.some(([name, version]) => !name.trim() || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))) {
    throw new Error('UPUP_PI_PINNED_PACKAGES values must be exact semver versions');
  }
  return Object.fromEntries(entries) as Readonly<Record<string, string>>;
}

function parseAllowedSources(): Readonly<Record<string, readonly string[]>> {
  const value = process.env.UPUP_PI_ALLOWED_SOURCES?.trim();
  if (!value) throw new Error('UPUP_PI_ALLOWED_SOURCES is required when UPUP_PI_PACKAGE_PATHS is configured');
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('UPUP_PI_ALLOWED_SOURCES must be a JSON object of package names to source identifiers');
  }
  const entries = Object.entries(parsed as Record<string, unknown>).map(([name, source]) => {
    const sources = typeof source === 'string' ? [source] : source;
    if (!name.trim() || !Array.isArray(sources) || sources.length === 0 || sources.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new Error('UPUP_PI_ALLOWED_SOURCES values must be non-empty source identifier strings');
    }
    return [name, sources.map((item) => item.trim())] as const;
  });
  return Object.fromEntries(entries);
}

function isInside(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

function parseProjectSettings(cwd: string): ProjectPiPackageSettings | undefined {
  const settingsPath = join(cwd, '.pi', 'settings.json');
  if (!existsSync(settingsPath)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid .pi/settings.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('.pi/settings.json must contain a JSON object');
  }
  return parsed as ProjectPiPackageSettings;
}

function projectPackagePaths(settings: ProjectPiPackageSettings, cwd: string): string[] {
  if (settings.packages === undefined) return [];
  if (!Array.isArray(settings.packages) || settings.packages.length === 0) {
    throw new Error('.pi/settings.json packages must be a non-empty array when configured');
  }
  return settings.packages.map((entry) => {
    const source = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof entry.source === 'string' ? entry.source : undefined;
    if (!source?.trim()) throw new Error('.pi/settings.json package sources must be non-empty local paths');
    if (/^(?:npm:|git:|https?:|ssh:|github:)/i.test(source.trim())) {
      throw new Error(`Remote Pi package sources are disabled in .pi/settings.json: ${source}`);
    }
    const path = resolve(cwd, source.trim());
    if (!isInside(path, cwd)) throw new Error(`Pi package path escapes the project root: ${path}`);
    return path;
  });
}

function projectTrustPolicy(settings: ProjectPiPackageSettings, packagePaths: readonly string[], cwd: string): PiPluginTrustPolicy {
  const trust = settings.upupPiPackages;
  if (!trust || !Array.isArray(trust.trustedPaths) || trust.trustedPaths.length === 0) {
    throw new Error('.pi/settings.json upupPiPackages.trustedPaths is required for project Pi packages');
  }
  const trustedPaths = trust.trustedPaths.map((value) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('upupPiPackages.trustedPaths must contain non-empty paths');
    const path = resolve(cwd, value);
    if (!isInside(path, cwd)) throw new Error(`Pi trusted path escapes the project root: ${path}`);
    return path;
  });
  if (!trust.pinnedPackages || typeof trust.pinnedPackages !== 'object' || Array.isArray(trust.pinnedPackages)) {
    throw new Error('.pi/settings.json upupPiPackages.pinnedPackages is required');
  }
  const pinnedPackages = Object.fromEntries(Object.entries(trust.pinnedPackages as Record<string, unknown>).map(([name, version]) => {
    if (!name.trim() || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('upupPiPackages.pinnedPackages values must be exact semver versions');
    return [name, version];
  }));
  if (!trust.allowedSources || typeof trust.allowedSources !== 'object' || Array.isArray(trust.allowedSources)) {
    throw new Error('.pi/settings.json upupPiPackages.allowedSources is required');
  }
  const allowedSources = Object.fromEntries(Object.entries(trust.allowedSources as Record<string, unknown>).map(([name, value]) => {
    const sources = typeof value === 'string' ? [value] : value;
    if (!name.trim() || !Array.isArray(sources) || sources.length === 0 || sources.some((source) => typeof source !== 'string' || !source.trim())) {
      throw new Error('upupPiPackages.allowedSources values must be non-empty source identifiers');
    }
    return [name, sources.map((source) => source.trim())];
  }));
  for (const path of packagePaths) {
    if (!trustedPaths.some((trustedPath) => isInside(path, trustedPath))) {
      throw new Error(`Project Pi package is not covered by trustedPaths: ${path}`);
    }
  }
  return { trustedPaths, pinnedPackages, allowedSources };
}

export function getProjectPiPackageOptions(cwd = process.cwd()): ConfiguredPiPackageOptions | undefined {
  const settings = parseProjectSettings(resolve(cwd));
  if (!settings) return undefined;
  const piPackagePaths = projectPackagePaths(settings, resolve(cwd));
  if (piPackagePaths.length === 0) return undefined;
  return { piPackagePaths, piPackageTrust: projectTrustPolicy(settings, piPackagePaths, resolve(cwd)) };
}

export function resolveConfiguredPiPackages(cwd = process.cwd()): ConfiguredPiPackageOptions | undefined {
  const piPackagePaths = parseList('UPUP_PI_PACKAGE_PATHS');
  if (piPackagePaths.length === 0) return getProjectPiPackageOptions(cwd) ?? getBuiltinPiPackageOptions(cwd);
  const trustedPaths = parseList('UPUP_PI_TRUSTED_PATHS');
  if (trustedPaths.length === 0) throw new Error('UPUP_PI_TRUSTED_PATHS is required when UPUP_PI_PACKAGE_PATHS is configured');
  return {
    piPackagePaths,
    piPackageTrust: {
      trustedPaths,
      pinnedPackages: parsePinnedPackages(),
      allowedSources: parseAllowedSources(),
    },
  };
}
