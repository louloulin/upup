import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PiPluginTrustPolicy, PiResourceTrustAudit } from './plugin-trust.js';
import { verifyPiResourceTrust } from './plugin-trust.js';
import { loadPiPackageContracts, type PiPackageContracts } from './package-contracts.js';

export type { PiPluginTrustPolicy } from './plugin-trust.js';

export interface PiPackageManifest {
  readonly name: string;
  readonly version: string;
  readonly root: string;
  readonly extensions: readonly string[];
  readonly skills: readonly string[];
  readonly prompts: readonly string[];
  readonly workflows: readonly string[];
  readonly policies: readonly string[];
  readonly evals: readonly string[];
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

export class PiPackageCatalog {
  private readonly records = new Map<string, PiPackageRecord>();

  register(root: string, trust: PiPluginTrustPolicy, cwd = process.cwd()): PiPackageRecord {
    const resolvedRoot = resolve(cwd, root);
    const parsed = JSON.parse(readFileSync(join(resolvedRoot, 'package.json'), 'utf8')) as {
      name?: unknown; version?: unknown; pi?: {
        extensions?: unknown[]; skills?: unknown[]; prompts?: unknown[];
        workflows?: unknown[]; policies?: unknown[]; evals?: unknown[];
      };
    };
    if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string') throw new Error(`Pi package manifest is invalid: ${resolvedRoot}`);
    const relativeResources = (key: 'extensions' | 'skills' | 'prompts' | 'workflows' | 'policies' | 'evals'): string[] => (parsed.pi?.[key] ?? []).filter((item): item is string => typeof item === 'string');
    const extensions = relativeResources('extensions');
    const skills = relativeResources('skills');
    const prompts = relativeResources('prompts');
    const workflows = relativeResources('workflows');
    const policies = relativeResources('policies');
    const evals = relativeResources('evals');
    const resources = [...extensions, ...skills, ...prompts, ...workflows, ...policies, ...evals].map((resource) => resolve(resolvedRoot, resource));
    const trustResult = verifyPiResourceTrust([resolvedRoot, ...resources], trust, cwd);
    const manifest: PiPackageManifest = { name: parsed.name, version: parsed.version, root: resolvedRoot, extensions, skills, prompts, workflows, policies, evals };
    const record: PiPackageRecord = { manifest, enabled: true, audits: trustResult.audits };
    this.records.set(parsed.name, record);
    return record;
  }

  enable(name: string): void {
    const record = this.records.get(name);
    if (!record) throw new Error(`Pi package is not registered: ${name}`);
    this.records.set(name, { ...record, enabled: true });
  }

  disable(name: string): void {
    const record = this.records.get(name);
    if (!record) throw new Error(`Pi package is not registered: ${name}`);
    this.records.set(name, { ...record, enabled: false });
  }

  rollback(name: string, previousRoot: string, trust: PiPluginTrustPolicy, cwd = process.cwd()): PiPackageRecord {
    const current = this.records.get(name);
    try {
      const previous = this.register(previousRoot, trust, cwd);
      if (previous.manifest.name !== name) throw new Error(`Pi package rollback name mismatch: ${previous.manifest.name}`);
      return previous;
    } catch (error) {
      if (current) this.records.set(name, current);
      else this.records.delete(name);
      throw error;
    }
  }

  get(name: string): PiPackageRecord | undefined { return this.records.get(name); }
  listEnabled(): PiPackageRecord[] { return Array.from(this.records.values()).filter((record) => record.enabled); }

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
