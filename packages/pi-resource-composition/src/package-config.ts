import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { PiPluginTrustPolicy } from '@upup/pi-resource-composition';

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
  '../../pi-finance-sdk',
);
const SOURCE_MARKET_DATA_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-market-data',
);
const SOURCE_INVESTMENT_ANALYSIS_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-investment-analysis',
);
const SOURCE_RISK_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-risk',
);
const SOURCE_PORTFOLIO_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-portfolio',
);
const SOURCE_BACKTEST_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-backtest',
);
const SOURCE_PLATFORM_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-platform',
);
const SOURCE_RESEARCH_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-research',
);
const SOURCE_BROWSER_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-browser',
);
const SOURCE_CONFIG_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-config',
);
const SOURCE_CACHE_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-cache',
);
const SOURCE_NOTIFY_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-notify',
);
const SOURCE_INVESTMENT_WORKFLOW_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-investment-workflow',
);
const SOURCE_MANAGEMENT_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-management',
);
const SOURCE_TECHNICAL_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-technical',
);
const SOURCE_CORPORATE_ACTIONS_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-corporate-actions',
);
const SOURCE_QUANT_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-quant',
);

function builtinPackageCandidates(cwd: string, packageName: string, sourcePath: string): string[] {
  const executableDirectory = dirname(process.execPath);
  return [
    resolve(cwd, `packages/${packageName}`),
    resolve(cwd, `dist/${packageName}`),
    resolve(executableDirectory, packageName),
    resolve(executableDirectory, `../share/upup/${packageName}`),
    sourcePath,
  ];
}

export function getBuiltinPiPackageOptions(cwd = process.cwd()): ConfiguredPiPackageOptions | undefined {
  const candidates = [
    { directory: 'pi-finance-sdk', name: '@upup/pi-finance-sdk', version: '0.1.0', sourcePath: SOURCE_FINANCE_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-market-data', name: '@upup/pi-market-data', version: '0.1.0', sourcePath: SOURCE_MARKET_DATA_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-investment-analysis', name: '@upup/pi-investment-analysis', version: '0.1.0', sourcePath: SOURCE_INVESTMENT_ANALYSIS_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-risk', name: '@upup/pi-risk', version: '0.1.0', sourcePath: SOURCE_RISK_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-portfolio', name: '@upup/pi-portfolio', version: '0.1.0', sourcePath: SOURCE_PORTFOLIO_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-backtest', name: '@upup/pi-backtest', version: '0.1.0', sourcePath: SOURCE_BACKTEST_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-platform', name: '@upup/pi-platform', version: '0.1.0', sourcePath: SOURCE_PLATFORM_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-research', name: '@upup/pi-research', version: '0.1.0', sourcePath: SOURCE_RESEARCH_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-browser', name: '@upup/pi-browser', version: '0.1.0', sourcePath: SOURCE_BROWSER_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-config', name: '@upup/pi-config', version: '0.1.0', sourcePath: SOURCE_CONFIG_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-cache', name: '@upup/pi-cache', version: '0.1.0', sourcePath: SOURCE_CACHE_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-notify', name: '@upup/pi-notify', version: '0.1.0', sourcePath: SOURCE_NOTIFY_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-investment-workflow', name: '@upup/pi-investment-workflow', version: '0.1.0', sourcePath: SOURCE_INVESTMENT_WORKFLOW_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-management', name: '@upup/pi-management', version: '0.1.0', sourcePath: SOURCE_MANAGEMENT_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-technical', name: '@upup/pi-technical', version: '0.1.0', sourcePath: SOURCE_TECHNICAL_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-corporate-actions', name: '@upup/pi-corporate-actions', version: '0.1.0', sourcePath: SOURCE_CORPORATE_ACTIONS_PACKAGE_PATH, source: 'builtin:upup' },
    { directory: 'pi-quant', name: '@upup/pi-quant', version: '0.1.0', sourcePath: SOURCE_QUANT_PACKAGE_PATH, source: 'builtin:upup' },
  ].map((candidate) => ({
    ...candidate,
    path: builtinPackageCandidates(cwd, candidate.directory, candidate.sourcePath).find((path) => existsSync(join(path, 'package.json'))),
  })).filter((candidate): candidate is typeof candidate & { path: string } => Boolean(candidate.path));
  if (candidates.length === 0) return undefined;
  const packagePaths = candidates.map((candidate) => candidate.path);
  return {
    piPackagePaths: packagePaths,
    piPackageTrust: {
      trustedPaths: packagePaths,
      pinnedPackages: {
        ...Object.fromEntries(candidates.map((candidate) => [candidate.name, candidate.version])),
        '@earendil-works/pi-coding-agent': '0.84.3',
        '@upup/pi-runtime': '0.1.0',
        '@upup/utils': '0.2.0',
        '@upup/types': '0.2.0',
        '@upup/memory': '0.2.0',
        
        '@upup/pi-storage': '0.2.0',
        '@upup/pi-planning': '0.1.0',
        '@upup/pi-research': '0.1.0',
        '@upup/pi-market-data': '0.1.0',
        zod: '3.25.76',
        typebox: '1.3.7',
      },
      allowedSources: Object.fromEntries(candidates.map((candidate) => [candidate.name, [candidate.source]])),
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
