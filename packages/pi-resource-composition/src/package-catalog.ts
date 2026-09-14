import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PiPluginTrustPolicy, PiResourceTrustAudit } from './plugin-trust.js';
import { verifyPiResourceTrust } from './plugin-trust.js';
import { loadPiPackageContracts, type PiPackageContracts } from './package-contracts.js';
import { PI_RUNTIME_CONTRACT, validatePiPackageManifest, type PiPackageManifestContract } from '@upup/pi-runtime';

export type { PiPluginTrustPolicy } from './plugin-trust.js';

// Foundation packages that may be declared as runtimeDependencies without being
// loaded as Pi Packages. These are runtime contracts and capability context
// packages that don't ship extensions/skills/prompts.
const RUNTIME_FOUNDATION_PACKAGES: ReadonlySet<string> = new Set([
  '@upup/pi-runtime',
  '@upup/pi-capability-registry',
  '@upup/pi-planning',
  '@upup/utils',
  'zod',
]);

export interface PiPackageManifest {
  readonly name: string;
  readonly version: string;
  readonly contract: string;
  readonly source: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly runtimeDependencies: Readonly<Record<string, string>>;
  readonly commands: readonly string[];
  readonly root: string;
  readonly extensions: readonly string[];
  readonly skills: readonly string[];
  readonly prompts: readonly string[];
  readonly workflows: readonly string[];
  readonly policies: readonly string[];
  readonly evals: readonly string[];
  readonly extension?: string;
  readonly capabilities: readonly { readonly name: string; readonly version: string; readonly optional?: boolean }[];
  readonly trust: { readonly mode: 'builtin' | 'trusted' | 'sandboxed'; readonly network?: boolean; readonly credentials?: boolean; readonly filesystem?: boolean };
  readonly lifecycle: { readonly scope: 'runtime' | 'session' | 'process'; readonly initialize?: string; readonly reload?: string; readonly dispose?: string };
}

export interface PiPackageRecord {
  readonly manifest: PiPackageManifest;
  readonly enabled: boolean;
  readonly audits: readonly PiResourceTrustAudit[];
}

export interface PiPackageResources {
  readonly extensions: readonly string[];
  readonly skills: readonly string[];
  readonly prompts: readonly string[];
  readonly workflows: readonly string[];
  readonly policies: readonly string[];
  readonly evals: readonly string[];
}

export interface PiPackageResourceSnapshot {
  readonly path: string;
  readonly content: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly kind: 'extension' | 'skill' | 'prompt' | 'workflow' | 'policy' | 'eval';
}

export type PiPackageResourceKind = PiPackageResourceSnapshot['kind'];

export interface PiPackageExtensionLoadResult {
  readonly extensions: readonly {
    readonly path: string;
    readonly resolvedPath: string;
    readonly commands: ReadonlyMap<string, unknown>;
  }[];
  readonly errors: readonly { readonly path: string; readonly error: string }[];
}

function readResource(path: string): string {
  const stat = statSync(path);
  if (stat.isFile()) return readFileSync(path, 'utf8');
  return readdirSync(path, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${entry.name}\n${readResource(join(path, entry.name))}`)
    .join('\n');
}

function resourceFiles(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => resourceFiles(join(path, entry.name)));
}

function isInside(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

function exactSemver(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

export class PiPackageCatalog {
  private readonly records = new Map<string, PiPackageRecord>();

  register(root: string, trust: PiPluginTrustPolicy, cwd = process.cwd(), options: { deferCommandValidation?: boolean } = {}): PiPackageRecord {
    return this.registerAtRoot(root, trust, cwd, options);
  }

  private registerAtRoot(
    root: string,
    trust: PiPluginTrustPolicy,
    cwd: string,
    options: { allowReplacement?: boolean; expectedName?: string; deferCommandValidation?: boolean } = {},
  ): PiPackageRecord {
    const resolvedRoot = resolve(cwd, root);
    const parsed = JSON.parse(readFileSync(join(resolvedRoot, 'package.json'), 'utf8')) as {
      name?: unknown; version?: unknown; dependencies?: unknown; devDependencies?: unknown; peerDependencies?: unknown; optionalDependencies?: unknown; pi?: {
        contract?: unknown; extension?: unknown; capabilities?: unknown[]; trust?: unknown; lifecycle?: unknown;
        source?: unknown;
        commands?: unknown[];
        extensions?: unknown[]; skills?: unknown[]; prompts?: unknown[];
        workflows?: unknown[]; policies?: unknown[]; evals?: unknown[];
      };
    };
    if (typeof parsed.name !== 'string' || !parsed.name.trim() || !exactSemver(parsed.version)) {
      throw new Error(`Pi package manifest name/version is invalid: ${resolvedRoot}`);
    }
    if (options.expectedName !== undefined && parsed.name !== options.expectedName) {
      throw new Error(`Pi package rollback name mismatch: ${parsed.name}`);
    }
    if (trust.pinnedPackages?.[parsed.name] !== parsed.version) {
      throw new Error(`Pi package version is not pinned as expected: ${parsed.name}@${parsed.version}`);
    }
    const existing = this.records.get(parsed.name);
    if (existing && existing.manifest.root !== resolvedRoot && !options.allowReplacement) {
      throw new Error(`Pi package is already registered from a different root: ${parsed.name}`);
    }
    if (typeof parsed.pi?.source !== 'string' || !parsed.pi.source.trim()) throw new Error(`Pi package source is missing: ${resolvedRoot}`);
    const dependencySections = [
      ['dependencies', parsed.dependencies, true],
      ['devDependencies', parsed.devDependencies, false],
      ['peerDependencies', parsed.peerDependencies, true],
      ['optionalDependencies', parsed.optionalDependencies, true],
    ] as const;
    const dependencies: Record<string, string> = {};
    const runtimeDependencies: Record<string, string> = {};
    const dependencyOrigins = new Map<string, string>();
    for (const [sectionName, section, isRuntime] of dependencySections) {
      if (section === undefined) continue;
      if (!section || typeof section !== 'object' || Array.isArray(section)) throw new Error(`Pi package dependencies are invalid: ${resolvedRoot}`);
      for (const [name, range] of Object.entries(section as Record<string, unknown>)) {
        if (typeof range !== 'string' || !/^\d+\.\d+\.\d+$/.test(range)) {
          throw new Error(`Pi package dependency ${name} must use an exact semver: ${resolvedRoot}`);
        }
        const previous = dependencies[name];
        if (previous !== undefined && previous !== range) {
          throw new Error(`Pi package dependency ${name} has conflicting exact versions: ${previous} in ${dependencyOrigins.get(name)} vs ${range} in ${sectionName}`);
        }
        dependencies[name] = range;
        dependencyOrigins.set(name, sectionName);
        if (isRuntime) runtimeDependencies[name] = range;
      }
    }
    for (const [name, version] of Object.entries(dependencies)) {
      if (RUNTIME_FOUNDATION_PACKAGES.has(name)) continue;
      if (trust.pinnedPackages?.[name] !== version) {
        throw new Error(`Pi package dependency is not pinned as expected: ${name}@${version}`);
      }
    }
    const allowedSources = trust.allowedSources?.[parsed.name];
    if (!allowedSources?.includes(parsed.pi.source)) {
      throw new Error(`Pi package source is not allowlisted: ${parsed.name}@${parsed.pi.source}`);
    }
    const relativeResources = (key: 'extensions' | 'skills' | 'prompts' | 'workflows' | 'policies' | 'evals'): string[] => {
      const declared = parsed.pi?.[key];
      if (declared === undefined) return [];
      if (!Array.isArray(declared) || declared.length === 0 || declared.some((item) => typeof item !== 'string' || !item.trim())) {
        throw new Error(`Pi package ${key} resources are invalid: ${resolvedRoot}`);
      }
      const resources = declared as string[];
      for (const resource of resources) {
        const resourcePath = resolve(resolvedRoot, resource);
        if (!isInside(resourcePath, resolvedRoot)) {
          throw new Error(`Pi package ${key} resource escapes the package root: ${resource}`);
        }
      }
      return resources;
    };
    const rawCommands = parsed.pi?.commands ?? [];
    if (!Array.isArray(rawCommands) || rawCommands.some((item) => typeof item !== 'string' || !/^[a-z][a-z0-9-]*$/.test(item))) {
      throw new Error(`Pi package commands are invalid: ${resolvedRoot}`);
    }
    const commands = rawCommands as string[];
    if (new Set(commands).size !== commands.length) throw new Error(`Pi package commands contain duplicates: ${resolvedRoot}`);
    const extensions = relativeResources('extensions');
    const skills = relativeResources('skills');
    const prompts = relativeResources('prompts');
    const workflows = relativeResources('workflows');
    const policies = relativeResources('policies');
    const evals = relativeResources('evals');
    const declaredResources = [...extensions, ...skills, ...prompts, ...workflows, ...policies, ...evals];
    const normalizedResources = declaredResources.map((resource) => resolve(resolvedRoot, resource));
    if (new Set(normalizedResources).size !== normalizedResources.length) {
      throw new Error(`Pi package resources contain duplicates: ${resolvedRoot}`);
    }
    const resources = normalizedResources;
    const trustResult = verifyPiResourceTrust([resolvedRoot, ...resources], trust, cwd);
    const contract = typeof parsed.pi.contract === 'string' ? parsed.pi.contract : PI_RUNTIME_CONTRACT;
    const capabilities = Array.isArray(parsed.pi.capabilities) ? parsed.pi.capabilities : [];
    const trustContract = parsed.pi.trust && typeof parsed.pi.trust === 'object' ? parsed.pi.trust : { mode: 'builtin' };
    const lifecycle = parsed.pi.lifecycle && typeof parsed.pi.lifecycle === 'object' ? parsed.pi.lifecycle : { scope: 'session' };
    validatePiPackageManifest({
      name: parsed.name,
      version: parsed.version,
      contract,
      source: parsed.pi.source,
      dependencies,
      extension: typeof parsed.pi.extension === 'string' ? parsed.pi.extension : undefined,
      capabilities: capabilities as PiPackageManifestContract['capabilities'],
      trust: trustContract as PiPackageManifestContract['trust'],
      lifecycle: lifecycle as PiPackageManifestContract['lifecycle'],
      resources: { extensions, skills, prompts, workflows, policies, evals },
    });
    const manifest: PiPackageManifest = { name: parsed.name, version: parsed.version, contract, source: parsed.pi.source, dependencies, runtimeDependencies, commands, root: resolvedRoot, extensions, skills, prompts, workflows, policies, evals, extension: typeof parsed.pi.extension === 'string' ? parsed.pi.extension : undefined, capabilities: capabilities as PiPackageManifest['capabilities'], trust: trustContract as PiPackageManifest['trust'], lifecycle: lifecycle as PiPackageManifest['lifecycle'] };
    const record: PiPackageRecord = { manifest, enabled: true, audits: trustResult.audits };
    const previousRecord = this.records.get(parsed.name);
    this.records.set(parsed.name, record);
    try {
      if (!options.deferCommandValidation) this.validateCommands();
      return record;
    } catch (error) {
      if (previousRecord) this.records.set(parsed.name, previousRecord);
      else this.records.delete(parsed.name);
      throw error;
    }
  }

  enable(name: string): void {
    const record = this.records.get(name);
    if (!record) throw new Error(`Pi package is not registered: ${name}`);
    this.records.set(name, { ...record, enabled: true });
    try {
      this.validateCommands();
    } catch (error) {
      this.records.set(name, record);
      throw error;
    }
  }

  disable(name: string): void {
    const record = this.records.get(name);
    if (!record) throw new Error(`Pi package is not registered: ${name}`);
    this.records.set(name, { ...record, enabled: false });
  }

  rollback(name: string, previousRoot: string, trust: PiPluginTrustPolicy, cwd = process.cwd()): PiPackageRecord {
    const current = this.records.get(name);
    try {
      const previous = this.registerAtRoot(previousRoot, trust, cwd, { allowReplacement: true, expectedName: name });
      if (current && !current.enabled) {
        this.records.set(name, { ...previous, enabled: false });
      }
      this.validateDependencies();
      return this.records.get(name)!;
    } catch (error) {
      if (current) this.records.set(name, current);
      else this.records.delete(name);
      throw error;
    }
  }

  get(name: string): PiPackageRecord | undefined { return this.records.get(name); }
  listEnabled(): PiPackageRecord[] { return Array.from(this.records.values()).filter((record) => record.enabled); }

  select(names: readonly string[]): void {
    const before = new Map(this.records);
    try {
      const selected = new Set<string>();
      const visit = (name: string): void => {
        if (selected.has(name)) return;
        const record = this.records.get(name);
        if (!record) throw new Error(`Pi package is not registered: ${name}`);
        selected.add(name);
        for (const dependencyName of Object.keys(record.manifest.runtimeDependencies)) {
          if (RUNTIME_FOUNDATION_PACKAGES.has(dependencyName)) continue;
          if (dependencyName.startsWith('@upup/')) visit(dependencyName);
        }
      };
      for (const name of names) visit(name);
      for (const [name, record] of this.records) {
        this.records.set(name, { ...record, enabled: selected.has(name) });
      }
      this.validateCommands();
      this.validateDependencies();
    } catch (error) {
      this.records.clear();
      for (const [name, record] of before) this.records.set(name, record);
      throw error;
    }
  }

  validateDependencies(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (packageName: string): void => {
      if (visited.has(packageName)) return;
      if (visiting.has(packageName)) throw new Error(`Pi package dependency cycle detected: ${packageName}`);
      const record = this.records.get(packageName);
      if (!record || !record.enabled) return;
      visiting.add(packageName);
      for (const dependencyName of Object.keys(record.manifest.runtimeDependencies)) {
        if (!dependencyName.startsWith('@upup/')) continue;
        if (RUNTIME_FOUNDATION_PACKAGES.has(dependencyName)) continue;
        const dependency = this.records.get(dependencyName);
        if (!dependency || !dependency.enabled || dependency.manifest.version !== record.manifest.runtimeDependencies[dependencyName]) {
          throw new Error(`Pi package dependency is not loaded: ${record.manifest.name} requires ${dependencyName}@${record.manifest.runtimeDependencies[dependencyName]}`);
        }
        visit(dependencyName);
      }
      visiting.delete(packageName);
      visited.add(packageName);
    };
    for (const record of this.records.values()) {
      visit(record.manifest.name);
    }
  }

  validateCommands(): void {
    const owners = new Map<string, string>();
    for (const record of this.records.values()) {
      if (!record.enabled) continue;
      for (const command of record.manifest.commands) {
        const owner = owners.get(command);
        if (owner && owner !== record.manifest.name) {
          throw new Error(`Pi package command is declared by multiple enabled packages: /${command} (${owner}, ${record.manifest.name})`);
        }
        owners.set(command, record.manifest.name);
      }
    }
  }

  resources(): PiPackageResources {
    const enabled = this.listEnabled();
    return {
      extensions: enabled.flatMap(({ manifest }) => manifest.extensions.map((path) => resolve(manifest.root, path))),
      skills: enabled.flatMap(({ manifest }) => manifest.skills.map((path) => resolve(manifest.root, path))),
      prompts: enabled.flatMap(({ manifest }) => manifest.prompts.map((path) => resolve(manifest.root, path))),
      workflows: enabled.flatMap(({ manifest }) => manifest.workflows.map((path) => resolve(manifest.root, path))),
      policies: enabled.flatMap(({ manifest }) => manifest.policies.map((path) => resolve(manifest.root, path))),
      evals: enabled.flatMap(({ manifest }) => manifest.evals.map((path) => resolve(manifest.root, path))),
    };
  }

  readResources(): readonly PiPackageResourceSnapshot[] {
    const kinds = ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals'] as const;
    return this.listEnabled().flatMap(({ manifest }) => kinds.flatMap((kind) => manifest[kind].flatMap((resource) => {
      const path = resolve(manifest.root, resource);
      const paths = kind === 'workflows' || kind === 'policies' || kind === 'evals' ? resourceFiles(path) : [path];
      return paths.map((filePath) => ({
        path: filePath,
        content: readResource(filePath),
        packageName: manifest.name,
        packageVersion: manifest.version,
        kind: ({ extensions: 'extension', skills: 'skill', prompts: 'prompt', workflows: 'workflow', policies: 'policy', evals: 'eval' } as const)[kind],
      }));
    })));
  }

  contracts(): PiPackageContracts {
    return loadPiPackageContracts(this.readResources());
  }

  validateExtensionLoad(result: PiPackageExtensionLoadResult, cwd = process.cwd()): void {
    for (const record of this.listEnabled()) {
      const extensionRoots = record.manifest.extensions.map((resource) => resolve(record.manifest.root, resource));
      const belongsToPackage = (path: string): boolean => {
        const resolved = resolve(cwd, path);
        return extensionRoots.some((root) => resolved === root || isInside(resolved, root));
      };
      const packageErrors = result.errors.filter((error) => belongsToPackage(error.path));
      if (packageErrors.length > 0) {
        throw new Error(`Pi package extension failed to load: ${record.manifest.name}: ${packageErrors.map((error) => error.error).join('; ')}`);
      }
      if (extensionRoots.length === 0) {
        if (record.manifest.commands.length > 0) {
          throw new Error(`Pi package declares commands without an extension: ${record.manifest.name}`);
        }
        continue;
      }
      const loadedExtensions = result.extensions.filter((extension) => belongsToPackage(extension.resolvedPath));
      if (loadedExtensions.length === 0) {
        throw new Error(`Pi package extension was not loaded: ${record.manifest.name}`);
      }
      const registeredCommands = new Set(loadedExtensions.flatMap((extension) => [...extension.commands.keys()]));
      const missingCommands = record.manifest.commands.filter((command) => !registeredCommands.has(command));
      if (missingCommands.length > 0) {
        throw new Error(`Pi package commands were not registered by its extensions: ${record.manifest.name} (${missingCommands.map((command) => `/${command}`).join(', ')})`);
      }
    }
  }

  getResource(name: string, kind: PiPackageResourceKind, relativePath: string): PiPackageResourceSnapshot | undefined {
    const record = this.records.get(name);
    if (!record?.enabled) return undefined;
    const resource = record.manifest[kind === 'extension' ? 'extensions' : kind === 'skill' ? 'skills' : kind === 'prompt' ? 'prompts' : kind === 'workflow' ? 'workflows' : kind === 'policy' ? 'policies' : 'evals']
      .find((candidate) => candidate === relativePath || resolve(record.manifest.root, candidate) === resolve(record.manifest.root, relativePath));
    if (!resource) return undefined;
    const path = resolve(record.manifest.root, resource);
    const audit = record.audits.find((item) => item.path === path || item.path === record.manifest.root);
    if (!audit) throw new Error(`Pi package resource was not audited: ${path}`);
    return {
      path,
      content: readResource(path),
      packageName: record.manifest.name,
      packageVersion: record.manifest.version,
      kind,
    };
  }
}
