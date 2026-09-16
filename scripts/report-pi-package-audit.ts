import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { getBuiltinPiPackageOptions } from '@upup/pi-resource-composition';
import { PI_RUNTIME_CONTRACT, validatePiPackageManifest, type PiPackageManifestContract } from '@upup/pi-runtime';

const root = process.cwd();
const packagesRoot = resolve(root, 'packages');
const srcRoot = resolve(root, 'src');
const foundationPackages = new Set([
  '@upup/pi-runtime', '@upup/pi-event-adapter', '@upup/pi-observability',
  '@upup/pi-capability-registry', '@upup/pi-resource-composition', '@upup/pi-session',
  '@upup/pi-planning', '@upup/utils', '@upup/types', '@upup/memory', '@upup/pi-storage', 'zod',
]);

interface PackageRecord {
  name: string;
  version: string;
  path: string;
  manifestValid: boolean;
  manifestError?: string;
  trust?: unknown;
  lifecycle?: unknown;
  resources: Record<string, { declared: string[]; missing: string[] }>;
  dependencies: Record<string, string>;
  missingDependencies: string[];
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [path] : [];
  });
}

function production(files: readonly string[]): string[] {
  return files.filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file));
}

function isAuditSource(file: string): boolean {
  return /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(file) || /(^|\/)(examples?|fixtures?|scripts?)\//.test(file);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function exactDependencies(manifest: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    for (const [name, version] of Object.entries(objectRecord(manifest[section]))) {
      if (typeof version === 'string') result[name] = version;
    }
  }
  const pi = objectRecord(manifest.pi);
  for (const [name, version] of Object.entries(objectRecord(pi.dependencies))) {
    if (typeof version === 'string') result[name] = version;
  }
  return result;
}

const packageDirectories = readdirSync(packagesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const packageNames = new Set<string>();
const packageVersions = new Map<string, string>();
const records: PackageRecord[] = [];
const globalErrors: string[] = [];

for (const directory of packageDirectories) {
  const manifestPath = join(packagesRoot, directory.name, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  const name = typeof manifest.name === 'string' ? manifest.name : `@upup/${directory.name}`;
  const version = typeof manifest.version === 'string' ? manifest.version : '';
  packageNames.add(name);
  packageVersions.set(name, version);
}

for (const directory of packageDirectories) {
  const packageRoot = join(packagesRoot, directory.name);
  const manifestPath = join(packageRoot, 'package.json');
  if (!existsSync(manifestPath)) {
    continue;
  }
  const manifest = readJson(manifestPath);
  const name = typeof manifest.name === 'string' ? manifest.name : `@upup/${directory.name}`;
  const version = typeof manifest.version === 'string' ? manifest.version : '';
  const pi = objectRecord(manifest.pi);
  const resources: Record<string, { declared: string[]; missing: string[] }> = {};
  for (const kind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    const declared = Array.isArray(pi[kind]) ? pi[kind].filter((item): item is string => typeof item === 'string') : [];
    resources[kind] = { declared, missing: declared.filter((item) => !existsSync(resolve(packageRoot, item))) };
  }
  const resolvedDependencies = exactDependencies(manifest);
  for (const [dependency, dependencyVersion] of Object.entries(resolvedDependencies)) {
    if (dependencyVersion === 'workspace:*' && packageVersions.has(dependency)) {
      resolvedDependencies[dependency] = packageVersions.get(dependency)!;
    }
  }
  let manifestValid = true;
  let manifestError: string | undefined;
  try {
    validatePiPackageManifest({
      name,
      version,
      contract: pi.contract ?? PI_RUNTIME_CONTRACT,
      source: typeof pi.source === 'string' ? pi.source : '',
      dependencies: resolvedDependencies,
      extension: typeof pi.extension === 'string' ? pi.extension : undefined,
      capabilities: Array.isArray(pi.capabilities) ? pi.capabilities : [],
      trust: pi.trust,
      lifecycle: pi.lifecycle,
      resources: {
        extensions: resources.extensions.declared,
        skills: resources.skills.declared,
        prompts: resources.prompts.declared,
        workflows: resources.workflows.declared,
        policies: resources.policies.declared,
        evals: resources.evals.declared,
      },
    } as PiPackageManifestContract);
  } catch (error) {
    manifestValid = false;
    manifestError = error instanceof Error ? error.message : String(error);
  }
  const dependencies = resolvedDependencies;
  records.push({
    name,
    version,
    path: relative(root, packageRoot),
    manifestValid,
    ...(manifestError ? { manifestError } : {}),
    trust: pi.trust,
    lifecycle: pi.lifecycle,
    resources,
    dependencies,
    missingDependencies: Object.entries(dependencies)
      .filter(([dependency, dependencyVersion]) => dependency.startsWith('@upup/') && !foundationPackages.has(dependency) && (!packageNames.has(dependency) || packageVersions.get(dependency) !== dependencyVersion))
      .map(([dependency, dependencyVersion]) => `${dependency}@${dependencyVersion}`),
  });
}

// Resolve the builtin catalog independently from Session creation so this report
// proves the actual default package set and its pinned versions.
const builtin = getBuiltinPiPackageOptions(root);
const defaultPackages = (builtin?.piPackagePaths ?? []).map((path) => {
  const manifestPath = join(path, 'package.json');
  if (!existsSync(manifestPath)) return { path: relative(root, path), name: undefined, version: undefined, missing: true };
  const manifest = readJson(manifestPath);
  return { path: relative(root, path), name: manifest.name, version: manifest.version, missing: false };
});
const defaultMissingPins = defaultPackages.flatMap((entry) => entry.name && entry.version && builtin?.piPackageTrust.pinnedPackages?.[entry.name] !== entry.version ? [`${String(entry.name)}@${String(entry.version)}`] : []);

const rootProductionFiles = production(walk(srcRoot));
const rootAllowlist = [/^src\/index\.tsx$/, /^src\/bootstrap\//];
const rootAllowlistViolations = rootProductionFiles.map((file) => relative(root, file).replaceAll('\\', '/')).filter((file) => !rootAllowlist.some((pattern) => pattern.test(file)));
const packageToRootImports: string[] = [];
for (const record of records) {
  for (const file of production(walk(resolve(root, record.path))).filter((candidate) => !isAuditSource(candidate))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier === '@/' || specifier.startsWith('@/') || specifier === 'src' || specifier.startsWith('src/')) {
        packageToRootImports.push(`${relative(root, file)} -> ${specifier}`);
      }
    }
  }
}
const productionFiles = [...rootProductionFiles, ...records.flatMap((record) => production(walk(resolve(root, record.path))).filter((file) => !isAuditSource(file)))];
const distForbiddenArtifacts = records.flatMap((record) => {
  const distRoot = resolve(root, record.path, 'dist');
  if (!existsSync(distRoot)) return [];
  return walk(distRoot)
    .map((file) => relative(root, file).replaceAll('\\', '/'))
    .filter((file) => /(?:^|\/)dist\/runtime\/pi\//.test(file) || /(?:^|\/)dist\/src\/(?:runtime\/pi|tools|skills|commands|memory|mcp|plugins|gateway|bridge|stdio|cron|daemon)\//.test(file) || /(?:^|\/)dist\/legacy-events\./.test(file));
});
const readProduction = (pattern: RegExp): string[] => productionFiles.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const legacyInventory = {
  legacyEvents: readProduction(/legacy-events/),
  globalCapabilityRegistry: readProduction(/globalThis\.__upup(PiHosts|AgentPorts)/),
  skillsRegistry: readProduction(/(?:SkillsRegistry|getGlobalSkillsRegistry|loadAllSkills)/),
  commandRegistry: readProduction(/(?:UnifiedCommandRegistry|getUnifiedCommandRegistry|new CommandRegistry)/),
  toolRegistry: readProduction(/(?:class ToolRegistry|new ToolRegistry)/).filter((file) => !file.startsWith('packages/sdk/')),
};
const sdkToolConfiguration = production(walk(resolve(root, 'packages/sdk')))
  .filter((file) => /(?:class ToolRegistry|new ToolRegistry)/.test(readFileSync(file, 'utf8')))
  .map((file) => relative(root, file));
const errors = [
  ...globalErrors,
  ...records.filter((record) => !record.manifestValid).map((record) => `${record.path}: ${record.manifestError}`),
  ...records.flatMap((record) => Object.entries(record.resources).flatMap(([kind, resource]) => resource.missing.map((path) => `${record.name} ${kind} resource missing: ${path}`))),
  ...records.flatMap((record) => record.missingDependencies.map((dependency) => `${record.name} dependency closure missing: ${dependency}`)),
  ...defaultPackages.filter((entry) => entry.missing).map((entry) => `default package path missing: ${entry.path}`),
  ...defaultMissingPins.map((entry) => `default package pin mismatch: ${entry}`),
  ...rootAllowlistViolations.map((file) => `${file}: outside root allowlist`),
  ...packageToRootImports.map((file) => `${file}: package imports root src`),
  ...legacyInventory.legacyEvents.map((file) => `${file}: production legacy-events consumer`),
  ...legacyInventory.globalCapabilityRegistry.map((file) => `${file}: production global capability registry consumer`),
  ...legacyInventory.skillsRegistry.map((file) => `${file}: production legacy SkillsRegistry consumer`),
  ...distForbiddenArtifacts.map((file) => `${file}: package dist contains a forbidden root implementation artifact`),
];

console.log(JSON.stringify({
  schema: 'upup.pi.package-audit.v1',
  generatedAt: new Date().toISOString(),
  contract: PI_RUNTIME_CONTRACT,
  packages: {
    workspaceCount: records.length,
    piManifestCount: records.filter((record) => record.manifestValid).length,
    records,
  },
  defaultCatalog: {
    count: defaultPackages.length,
    packages: defaultPackages,
    pinnedVersions: builtin?.piPackageTrust.pinnedPackages ?? {},
    trust: builtin?.piPackageTrust ?? null,
  },
  root: {
    productionFiles: rootProductionFiles.map((file) => relative(root, file)),
    allowlistViolations: rootAllowlistViolations,
    packageToRootImports,
  },
  legacyInventory,
  distForbiddenArtifacts,
  sdkToolConfiguration,
  closure: {
    dependencyErrors: records.flatMap((record) => record.missingDependencies),
    defaultMissingPins,
  },
  errors,
  status: errors.length === 0 ? 'passed' : 'failed',
}, null, 2));

if (process.env.UPUP_PI_PACKAGE_AUDIT_STRICT === '1' && errors.length > 0) process.exitCode = 1;
