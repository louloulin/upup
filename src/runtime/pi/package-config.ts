import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { PiPluginTrustPolicy } from './plugin-trust.js';

export interface ConfiguredPiPackageOptions {
  readonly piPackagePaths: readonly string[];
  readonly piPackageTrust: PiPluginTrustPolicy;
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
      pinnedPackages: { '@upup/pi-finance-sdk': '0.1.0' },
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

export function resolveConfiguredPiPackages(): ConfiguredPiPackageOptions | undefined {
  const piPackagePaths = parseList('UPUP_PI_PACKAGE_PATHS');
  if (piPackagePaths.length === 0) return getBuiltinPiPackageOptions();
  const trustedPaths = parseList('UPUP_PI_TRUSTED_PATHS');
  if (trustedPaths.length === 0) throw new Error('UPUP_PI_TRUSTED_PATHS is required when UPUP_PI_PACKAGE_PATHS is configured');
  return {
    piPackagePaths,
    piPackageTrust: {
      trustedPaths,
      pinnedPackages: parsePinnedPackages(),
    },
  };
}
