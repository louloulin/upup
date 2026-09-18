import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { PiPackageTrustPolicy } from '@upup/pi-runtime';

import { filterBuiltinCandidatesByToggles, readUpUpPluginSettings } from "./plugin-toggles";
export interface ConfiguredPiPackageOptions {
  readonly piPackagePaths: readonly string[];
  readonly piPackageTrust: PiPackageTrustPolicy;
}

export function mergePiPackageTrust(
  base: PiPackageTrustPolicy | undefined,
  override: PiPackageTrustPolicy | undefined,
): PiPackageTrustPolicy | undefined {
  if (!base) return override;
  if (!override) return base;
  return {
    ...base,
    ...override,
    trustedPaths: override.trustedPaths,
    ...(base.allowedHashes || override.allowedHashes
      ? { allowedHashes: { ...base.allowedHashes, ...override.allowedHashes } }
      : {}),
    ...(base.pinnedPackages || override.pinnedPackages
      ? { pinnedPackages: { ...base.pinnedPackages, ...override.pinnedPackages } }
      : {}),
    ...(base.allowedSources || override.allowedSources
      ? { allowedSources: { ...base.allowedSources, ...override.allowedSources } }
      : {}),
  };
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
const SOURCE_OBSERVABILITY_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-observability',
);
const SOURCE_EVENT_ADAPTER_PACKAGE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../pi-event-adapter',
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
  const allCandidates = resolveBuiltinPackages(cwd);
  if (allCandidates.length === 0) return undefined;
  const toggles = readUpUpPluginSettings(cwd);
  const candidates = filterBuiltinCandidatesByToggles(
    allCandidates as readonly { directory: string; name: string; version: string; path: string }[],
    toggles,
  ) as readonly { directory: string; name: string; version: string; path: string }[];
  if (candidates.length === 0) return undefined;
  const packagePaths = candidates.map((candidate) => candidate.path);
  return {
    piPackagePaths: packagePaths,
    piPackageTrust: {
      trustedPaths: packagePaths,
      pinnedPackages: {
        ...Object.fromEntries(candidates.map((candidate) => [candidate.name, candidate.version])),
        ...BUILTIN_DEPENDENCY_PINS,
      },
      allowedSources: Object.fromEntries(candidates.map((candidate) => [candidate.name, [UPUP_BUILTIN_TRUST_SOURCE]])),
    },
  };
}

/**
 * UpUp 自带的 19 个 pi-* workspace package 的权威清单。
 *
 * 这些包随 UpUp 一起发布（workspace / dist / 安装根目录），不是 npm 或 git
 * 来源，所以 Pi 的 package-manager 无法发现它们 —— `settings.json.packages`
 * 里的 `builtin:@upup/<pkg>@<version>` 写法会被 Pi 的 `parseSource()` 当作相对
 * 路径静默丢弃。真正的加载通道是 Pi 的 `-e` / `--extension`（见
 * `@upup/pi-app/pi-native-cli`），本清单只负责“包在哪里 + 信任策略”。
 */
const BUILTIN_PI_PACKAGES: readonly {
  readonly directory: string;
  readonly name: string;
  readonly version: string;
  readonly sourcePath: string;
}[] = [
  { directory: 'pi-finance-sdk', name: '@upup/pi-finance-sdk', version: '0.1.0', sourcePath: SOURCE_FINANCE_PACKAGE_PATH },
  { directory: 'pi-market-data', name: '@upup/pi-market-data', version: '0.1.0', sourcePath: SOURCE_MARKET_DATA_PACKAGE_PATH },
  { directory: 'pi-investment-analysis', name: '@upup/pi-investment-analysis', version: '0.1.0', sourcePath: SOURCE_INVESTMENT_ANALYSIS_PACKAGE_PATH },
  { directory: 'pi-risk', name: '@upup/pi-risk', version: '0.1.0', sourcePath: SOURCE_RISK_PACKAGE_PATH },
  { directory: 'pi-portfolio', name: '@upup/pi-portfolio', version: '0.1.0', sourcePath: SOURCE_PORTFOLIO_PACKAGE_PATH },
  { directory: 'pi-backtest', name: '@upup/pi-backtest', version: '0.1.0', sourcePath: SOURCE_BACKTEST_PACKAGE_PATH },
  { directory: 'pi-platform', name: '@upup/pi-platform', version: '0.1.0', sourcePath: SOURCE_PLATFORM_PACKAGE_PATH },
  { directory: 'pi-research', name: '@upup/pi-research', version: '0.1.0', sourcePath: SOURCE_RESEARCH_PACKAGE_PATH },
  { directory: 'pi-browser', name: '@upup/pi-browser', version: '0.1.0', sourcePath: SOURCE_BROWSER_PACKAGE_PATH },
  { directory: 'pi-config', name: '@upup/pi-config', version: '0.1.0', sourcePath: SOURCE_CONFIG_PACKAGE_PATH },
  { directory: 'pi-cache', name: '@upup/pi-cache', version: '0.1.0', sourcePath: SOURCE_CACHE_PACKAGE_PATH },
  { directory: 'pi-notify', name: '@upup/pi-notify', version: '0.1.0', sourcePath: SOURCE_NOTIFY_PACKAGE_PATH },
  { directory: 'pi-investment-workflow', name: '@upup/pi-investment-workflow', version: '0.1.0', sourcePath: SOURCE_INVESTMENT_WORKFLOW_PACKAGE_PATH },
  { directory: 'pi-management', name: '@upup/pi-management', version: '0.1.0', sourcePath: SOURCE_MANAGEMENT_PACKAGE_PATH },
  { directory: 'pi-technical', name: '@upup/pi-technical', version: '0.1.0', sourcePath: SOURCE_TECHNICAL_PACKAGE_PATH },
  { directory: 'pi-corporate-actions', name: '@upup/pi-corporate-actions', version: '0.1.0', sourcePath: SOURCE_CORPORATE_ACTIONS_PACKAGE_PATH },
  { directory: 'pi-quant', name: '@upup/pi-quant', version: '0.1.0', sourcePath: SOURCE_QUANT_PACKAGE_PATH },
  { directory: 'pi-event-adapter', name: '@upup/pi-event-adapter', version: '0.1.0', sourcePath: SOURCE_EVENT_ADAPTER_PACKAGE_PATH },
  { directory: 'pi-observability', name: '@upup/pi-observability', version: '0.1.0', sourcePath: SOURCE_OBSERVABILITY_PACKAGE_PATH },
];

/** Trust-policy 里 UpUp 自带包的 source 标识。 */
export const UPUP_BUILTIN_TRUST_SOURCE = 'builtin:upup';

/**
 * Pi 基础依赖 + 与 UpUp 自带包同名但在依赖树里另有版本的包。信任策略要求
 * 每个出现在 manifest 里的包都被 pin，所以这里集中声明，避免散落多处。
 */
const BUILTIN_DEPENDENCY_PINS: Readonly<Record<string, string>> = {
  '@earendil-works/pi-ai': '0.85.1',
  '@earendil-works/pi-coding-agent': '0.85.1',
  '@upup/pi-runtime': '0.1.0',
  '@upup/utils': '0.2.0',
  '@upup/types': '0.2.0',
  '@upup/memory': '0.2.0',
  '@upup/pi-storage': '0.2.0',
  '@upup/pi-planning': '0.1.0',
  '@upup/pi-session': '0.1.0',
  '@upup/pi-resource-composition': '0.1.0',
  zod: '3.25.76',
  typebox: '1.3.7',
};

export interface BuiltinPackageSource {
  readonly source: string;
  readonly name: string;
  readonly version: string;
  readonly directory: string;
  readonly path: string;
}

/** 解析出本机实际存在的 UpUp 自带 Pi package（workspace / dist / 安装根目录）。 */
function resolveBuiltinPackages(cwd: string): readonly { directory: string; name: string; version: string; path: string }[] {
  const found: { directory: string; name: string; version: string; path: string }[] = [];
  for (const candidate of BUILTIN_PI_PACKAGES) {
    const path = builtinPackageCandidates(cwd, candidate.directory, candidate.sourcePath).find((p) => existsSync(join(p, 'package.json')));
    if (!path) continue;
    found.push({ directory: candidate.directory, name: candidate.name, version: candidate.version, path });
  }
  return found;
}

/** 公开 API：UpUp 自带 Pi package 的位置与版本（供 plugin list / 审计使用）。 */
export function getBuiltinPackageSources(cwd = process.cwd()): readonly BuiltinPackageSource[] {
  return resolveBuiltinPackages(cwd).map((entry) => ({ ...entry, source: UPUP_BUILTIN_TRUST_SOURCE }));
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

/**
 * Project-scoped Pi package settings.
 *
 * UpUp's own project config lives in `<cwd>/.upup/settings.json`; that file
 * wins. `<cwd>/.pi/settings.json` is still read as a compatibility fallback so
 * a repo prepared for the upstream Pi CLI keeps working — but UpUp never
 * writes `.pi/`, so the two never fight over the same file.
 */
const PROJECT_SETTINGS_RELATIVE_PATHS = [join('.upup', 'settings.json'), join('.pi', 'settings.json')] as const;

interface ResolvedProjectSettings {
  readonly path: string;
  readonly label: string;
  readonly settings: ProjectPiPackageSettings;
}

function readProjectSettingsFile(cwd: string): ResolvedProjectSettings | undefined {
  for (const relative of PROJECT_SETTINGS_RELATIVE_PATHS) {
    const settingsPath = join(cwd, relative);
    if (!existsSync(settingsPath)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid ${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${relative} must contain a JSON object`);
    }
    return { path: settingsPath, label: relative, settings: parsed as ProjectPiPackageSettings };
  }
  return undefined;
}

function projectPackagePaths(settings: ProjectPiPackageSettings, cwd: string, label: string): string[] {
  if (settings.packages === undefined) return [];
  if (!Array.isArray(settings.packages) || settings.packages.length === 0) {
    throw new Error(`${label} packages must be a non-empty array when configured`);
  }
  return settings.packages.map((entry) => {
    const source = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof entry.source === 'string' ? entry.source : undefined;
    if (!source?.trim()) throw new Error(`${label} package sources must be non-empty local paths`);
    if (/^(?:npm:|git:|https?:|ssh?:|github:)/i.test(source.trim())) {
      throw new Error(`Remote Pi package sources are disabled in ${label}: ${source}`);
    }
    const path = resolve(cwd, source.trim());
    if (!isInside(path, cwd)) throw new Error(`Pi package path escapes the project root: ${path}`);
    return path;
  });
}

function projectTrustPolicy(settings: ProjectPiPackageSettings, packagePaths: readonly string[], cwd: string, label: string): PiPackageTrustPolicy {
  const trust = settings.upupPiPackages;
  if (!trust || !Array.isArray(trust.trustedPaths) || trust.trustedPaths.length === 0) {
    throw new Error(`${label} upupPiPackages.trustedPaths is required for project Pi packages`);
  }
  const trustedPaths = trust.trustedPaths.map((value) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('upupPiPackages.trustedPaths must contain non-empty paths');
    const path = resolve(cwd, value);
    if (!isInside(path, cwd)) throw new Error(`Pi trusted path escapes the project root: ${path}`);
    return path;
  });
  if (!trust.pinnedPackages || typeof trust.pinnedPackages !== 'object' || Array.isArray(trust.pinnedPackages)) {
    throw new Error(`${label} upupPiPackages.pinnedPackages is required`);
  }
  const pinnedPackages = Object.fromEntries(Object.entries(trust.pinnedPackages as Record<string, unknown>).map(([name, version]) => {
    if (!name.trim() || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('upupPiPackages.pinnedPackages values must be exact semver versions');
    return [name, version];
  }));
  if (!trust.allowedSources || typeof trust.allowedSources !== 'object' || Array.isArray(trust.allowedSources)) {
    throw new Error(`${label} upupPiPackages.allowedSources is required`);
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
  const resolved = readProjectSettingsFile(resolve(cwd));
  if (!resolved) return undefined;
  const { settings, label } = resolved;
  const piPackagePaths = projectPackagePaths(settings, resolve(cwd), label);
  if (piPackagePaths.length === 0) return undefined;
  return { piPackagePaths, piPackageTrust: projectTrustPolicy(settings, piPackagePaths, resolve(cwd), label) };
}

/**
 * 单一 Pi package 解析入口：环境变量 -> 项目级 `.upup/settings.json` -> UpUp
 * 自带的 pi-* workspace package。
 */
export function resolveConfiguredPiPackages(cwd = process.cwd()): ConfiguredPiPackageOptions | undefined {
  const piPackagePaths = parseList('UPUP_PI_PACKAGE_PATHS');
  if (piPackagePaths.length === 0) {
    // 顺序：项目级 `.upup/settings.json` 显式声明 -> UpUp 自带的 pi-* workspace
    // package。UpUp 自带包通过 Pi 的 `-e` 通道加载（见
    // `@upup/pi-app/pi-native-cli`），Pi 的 package-manager 本身无法发现它们。
    return getProjectPiPackageOptions(cwd) ?? getBuiltinPiPackageOptions(cwd);
  }
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
