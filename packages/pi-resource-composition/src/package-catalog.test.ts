import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PiPackageCatalog } from './package-catalog.js';

function makePackage(version: string, command = 'fixture-research'): { root: string; hash: string } {
  const root = mkdtempSync(join(tmpdir(), 'upup-pi-package-'));
  mkdirSync(join(root, 'extensions'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@upup/fixture-package', version, peerDependencies: { '@earendil-works/pi-coding-agent': '0.84.3' }, pi: { source: 'fixture:test', commands: [command], extensions: ['./extensions'], workflows: ['./workflow.md'], policies: ['./policy.md'], evals: ['./eval.json'] } }));
  writeFileSync(join(root, 'extensions', 'index.ts'), `export default ${JSON.stringify(version)};`);
  writeFileSync(join(root, 'workflow.md'), '# Workflow\n\nUse phases: detect, plan, execute, verify, report.');
  writeFileSync(join(root, 'policy.md'), '# Policy\n\n- Read-only tools require evidence.');
  writeFileSync(join(root, 'eval.json'), JSON.stringify({ name: 'fixture-eval', version: '1', cases: [{ id: 'evidence', requires: ['evidence'] }] }));
  const hash = createHash('sha256');
  hash.update('package.json'); hash.update('\0'); hash.update(read(root, 'package.json')); hash.update('\0');
  hash.update('extensions'); hash.update('\0'); hash.update(read(root, 'extensions/index.ts')); hash.update('\0');
  return { root, hash: hash.digest('hex') };
}

function read(root: string, path: string): Buffer { return readFileSync(join(root, path)); }

describe('PiPackageCatalog', () => {
  test('accepts foundational packages with explicitly empty resource arrays', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: Record<string, unknown> };
    manifest.pi.commands = [];
    for (const key of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) manifest.pi[key] = [];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const catalog = new PiPackageCatalog();
    const record = catalog.register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    });
    expect(record.manifest.extensions).toEqual([]);
    expect(catalog.resources()).toEqual({ extensions: [], skills: [], prompts: [], workflows: [], policies: [], evals: [] });
  });

  test('retains manifest-declared host capabilities for runtime binding', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: Record<string, unknown> };
    manifest.pi.hostCapabilities = ['agent-worker', 'mcp-resources'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const catalog = new PiPackageCatalog();
    const record = catalog.register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    });
    expect(record.manifest.hostCapabilities).toEqual(['agent-worker', 'mcp-resources']);
  });

  test('loads manifest-owned side-effect declarations for runtime policy binding', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: Record<string, unknown> };
    manifest.pi.tools = ['fixture_write'];
    manifest.pi.sideEffects = [{ tools: ['fixture_write'], effect: 'filesystem-write', safetyLevel: 'dangerous' }];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const catalog = new PiPackageCatalog();
    const record = catalog.register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    });
    expect(record.manifest.sideEffects).toEqual([{ tools: ['fixture_write'], effect: 'filesystem-write', safetyLevel: 'dangerous' }]);
  });

  test('pins, audits, disables and rolls back a Pi package', () => {
    const first = makePackage('1.0.0');
    const second = makePackage('1.1.0');
    const catalog = new PiPackageCatalog();
    const trust = { trustedPaths: [first.root, second.root], pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' }, allowedSources: { '@upup/fixture-package': ['fixture:test'] } };
    const record = catalog.register(first.root, trust);
    expect(record.manifest.version).toBe('1.0.0');
    expect(record.manifest.commands).toEqual(['fixture-research']);
    expect(record.manifest.workflows).toEqual(['./workflow.md']);
    expect(record.manifest.policies).toEqual(['./policy.md']);
    expect(record.manifest.evals).toEqual(['./eval.json']);
    expect(catalog.resources().workflows).toHaveLength(1);
    expect(catalog.resources().policies).toHaveLength(1);
    expect(catalog.resources().evals).toHaveLength(1);
    const loaded = catalog.readResources();
    expect(loaded.map((resource) => resource.kind)).toEqual(['extension', 'workflow', 'policy', 'eval']);
    expect(loaded.find((resource) => resource.kind === 'extension')?.content).toContain('1.0.0');
    expect(loaded.find((resource) => resource.kind === 'workflow')?.content).toContain('detect');
    const contracts = catalog.contracts();
    expect(contracts.workflows[0]?.phases).toEqual(['detect', 'plan', 'execute', 'verify', 'report']);
    expect(contracts.policies[0]?.rules).toEqual(['Read-only tools require evidence.']);
    expect(contracts.evals[0]?.name).toBe('fixture-eval');
    catalog.disable(record.manifest.name);
    expect(catalog.listEnabled()).toHaveLength(0);
    expect(catalog.readResources()).toHaveLength(0);
    expect(() => catalog.rollback(record.manifest.name, second.root, trust)).toThrow('pinned');
    expect(catalog.get(record.manifest.name)?.manifest.version).toBe('1.0.0');
    catalog.enable(record.manifest.name);
    expect(catalog.getResource(record.manifest.name, 'workflow', './workflow.md')?.content).toContain('detect');
    catalog.disable(record.manifest.name);
    expect(catalog.getResource(record.manifest.name, 'workflow', './workflow.md')).toBeUndefined();
  });

  test('requires an explicit allowlisted source', () => {
    const packageFixture = makePackage('1.0.0');
    const catalog = new PiPackageCatalog();
    expect(() => catalog.register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
    })).toThrow('source is not allowlisted');
  });

  test('rejects same-name packages from different roots unless explicitly rolling back', () => {
    const first = makePackage('1.0.0');
    const second = makePackage('1.0.0');
    const catalog = new PiPackageCatalog();
    const trust = { trustedPaths: [first.root, second.root], pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' }, allowedSources: { '@upup/fixture-package': ['fixture:test'] } };

    catalog.register(first.root, trust);
    expect(() => catalog.register(second.root, trust)).toThrow('already registered from a different root');
    expect(catalog.get('@upup/fixture-package')?.manifest.root).toBe(first.root);

    catalog.disable('@upup/fixture-package');
    const rolledBack = catalog.rollback('@upup/fixture-package', second.root, trust);
    expect(rolledBack.manifest.root).toBe(second.root);
    expect(rolledBack.enabled).toBe(false);
    expect(catalog.get('@upup/fixture-package')?.manifest.version).toBe('1.0.0');
  });

  test('rejects duplicate slash commands across enabled packages transactionally', () => {
    const first = makePackage('1.0.0');
    const second = makePackage('1.0.0');
    const secondManifestPath = join(second.root, 'package.json');
    const secondManifest = JSON.parse(readFileSync(secondManifestPath, 'utf8')) as { name: string; pi: { commands: string[] } };
    secondManifest.name = '@upup/second-fixture-package';
    secondManifest.pi.commands = ['fixture-research'];
    writeFileSync(secondManifestPath, JSON.stringify(secondManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [first.root, second.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/second-fixture-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: {
        '@upup/fixture-package': ['fixture:test'],
        '@upup/second-fixture-package': ['fixture:test'],
      },
    };
    catalog.register(first.root, trust);
    expect(() => catalog.register(second.root, trust)).toThrow('declared by multiple enabled packages');
    expect(catalog.get('@upup/second-fixture-package')).toBeUndefined();
    expect(catalog.get('@upup/fixture-package')?.enabled).toBe(true);
  });

  test('allows deferred command validation until an explicit Package selection', () => {
    const first = makePackage('1.0.0');
    const second = makePackage('1.0.0');
    const secondManifestPath = join(second.root, 'package.json');
    const secondManifest = JSON.parse(readFileSync(secondManifestPath, 'utf8')) as { name: string };
    secondManifest.name = '@upup/deferred-second-package';
    writeFileSync(secondManifestPath, JSON.stringify(secondManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [first.root, second.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/deferred-second-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: {
        '@upup/fixture-package': ['fixture:test'],
        '@upup/deferred-second-package': ['fixture:test'],
      },
    };
    catalog.register(first.root, trust, process.cwd(), { deferCommandValidation: true });
    catalog.register(second.root, trust, process.cwd(), { deferCommandValidation: true });
    expect(() => catalog.select(['@upup/fixture-package'])).not.toThrow();
    expect(catalog.get('@upup/deferred-second-package')?.enabled).toBe(false);
    expect(() => catalog.select(['@upup/fixture-package', '@upup/deferred-second-package'])).toThrow('declared by multiple enabled packages');
    expect(catalog.get('@upup/fixture-package')?.enabled).toBe(true);
    expect(catalog.get('@upup/deferred-second-package')?.enabled).toBe(false);
  });

  test('rejects non-exact package dependency ranges', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.dependencies = { '@upup/unsafe-range': '^1.0.0' };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('exact semver');
  });

  test('requires every declared dependency to be explicitly pinned', () => {
    const packageFixture = makePackage('1.0.0');
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('dependency is not pinned as expected');
  });

  test('requires loaded UpUp runtime dependencies, not only pinned versions', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.dependencies = { '@upup/missing-package': '1.0.0' };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const catalog = new PiPackageCatalog();
    catalog.register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/missing-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    });
    expect(() => catalog.validateDependencies()).toThrow('dependency is not loaded');
  });

  test('negotiates required and optional capabilities fail-closed', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: Record<string, unknown> };
    manifest.pi.capabilities = [
      { name: 'quote-provider', version: '1.0.0' },
      { name: 'optional-news', version: '1.0.0', optional: true },
    ];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const trust = {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    };
    const catalog = new PiPackageCatalog();
    catalog.register(packageFixture.root, trust);
    expect(() => catalog.negotiateCapabilities()).toThrow('quote-provider@1.0.0');
    const resolutions = catalog.negotiateCapabilities({ 'quote-provider': '1.0.0' });
    expect(resolutions).toEqual([
      { packageName: '@upup/fixture-package', capability: 'quote-provider', version: '1.0.0', optional: false, resolved: true },
      { packageName: '@upup/fixture-package', capability: 'optional-news', version: '1.0.0', optional: true, resolved: false },
    ]);
  });

  test('negotiates capability scope, trust, and lifecycle contracts', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: Record<string, unknown> };
    manifest.pi.capabilities = [{ name: 'storage.session', version: '1.0.0', scope: 'session', trust: { mode: 'builtin', filesystem: true }, lifecycle: { scope: 'session' } }];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const trust = { trustedPaths: [packageFixture.root], pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' }, allowedSources: { '@upup/fixture-package': ['fixture:test'] } };
    const catalog = new PiPackageCatalog();
    catalog.register(packageFixture.root, trust);
    expect(catalog.negotiateCapabilityCatalog([{ name: 'storage.session', version: '1.0.0', scope: 'session', trust: { mode: 'builtin', filesystem: true }, lifecycle: { scope: 'session' } }])).toMatchObject([{ resolved: true, capability: 'storage.session' }]);
    expect(() => catalog.negotiateCapabilityCatalog([{ name: 'storage.session', version: '1.0.0', scope: 'runtime', trust: { mode: 'builtin' }, lifecycle: { scope: 'runtime' } }])).toThrow('capability contract is unavailable');
  });

  test('rejects reload lifecycle without initialize', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: Record<string, unknown> };
    manifest.pi.lifecycle = { scope: 'session', reload: './index.ts#reload' };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).not.toThrow();
    const catalog = new PiPackageCatalog();
    catalog.register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    });
    expect(() => catalog.validateLifecycleContracts()).toThrow('requires initialize');
  });

  test('accepts an explicitly loaded exact-version UpUp dependency graph', () => {
    const dependency = makePackage('1.0.0', 'fixture-dependency');
    const dependent = makePackage('1.0.0', 'fixture-dependent');
    const dependentManifestPath = join(dependent.root, 'package.json');
    const dependentManifest = JSON.parse(readFileSync(dependentManifestPath, 'utf8')) as Record<string, unknown>;
    dependentManifest.name = '@upup/dependent-package';
    dependentManifest.dependencies = { '@upup/fixture-package': '1.0.0' };
    writeFileSync(dependentManifestPath, JSON.stringify(dependentManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [dependency.root, dependent.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/dependent-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: {
        '@upup/fixture-package': ['fixture:test'],
        '@upup/dependent-package': ['fixture:test'],
      },
    };
    catalog.register(dependency.root, trust);
    catalog.register(dependent.root, trust);
    expect(() => catalog.validateDependencies()).not.toThrow();
  });

  test('selects only an explicit package allowlist and retains its dependency closure', () => {
    const dependency = makePackage('1.0.0', 'fixture-dependency');
    const selected = makePackage('1.0.0', 'fixture-selected');
    const unrelated = makePackage('1.0.0', 'fixture-unrelated');
    const selectedManifestPath = join(selected.root, 'package.json');
    const unrelatedManifestPath = join(unrelated.root, 'package.json');
    const selectedManifest = JSON.parse(readFileSync(selectedManifestPath, 'utf8')) as Record<string, unknown>;
    const unrelatedManifest = JSON.parse(readFileSync(unrelatedManifestPath, 'utf8')) as Record<string, unknown>;
    selectedManifest.name = '@upup/selected-package';
    selectedManifest.dependencies = { '@upup/fixture-package': '1.0.0' };
    unrelatedManifest.name = '@upup/unrelated-package';
    writeFileSync(selectedManifestPath, JSON.stringify(selectedManifest));
    writeFileSync(unrelatedManifestPath, JSON.stringify(unrelatedManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [dependency.root, selected.root, unrelated.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/selected-package': '1.0.0',
        '@upup/unrelated-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: {
        '@upup/fixture-package': ['fixture:test'],
        '@upup/selected-package': ['fixture:test'],
        '@upup/unrelated-package': ['fixture:test'],
      },
    };
    catalog.register(dependency.root, trust);
    catalog.register(selected.root, trust);
    catalog.register(unrelated.root, trust);
    catalog.select(['@upup/selected-package']);
    expect(catalog.listEnabled().map((record) => record.manifest.name)).toEqual(['@upup/fixture-package', '@upup/selected-package']);
    expect(catalog.get('@upup/unrelated-package')?.enabled).toBe(false);
  });

  test('rejects conflicting versions declared in different dependency sections', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.dependencies = { '@upup/conflicting-package': '1.0.0' };
    manifest.peerDependencies = { '@upup/conflicting-package': '2.0.0', '@earendil-works/pi-coding-agent': '0.84.3' };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/conflicting-package': '2.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('conflicting exact versions');
  });

  test('rejects cycles in the internal UpUp dependency graph', () => {
    const first = makePackage('1.0.0', 'fixture-cycle-a');
    const second = makePackage('1.0.0', 'fixture-cycle-b');
    const firstManifestPath = join(first.root, 'package.json');
    const secondManifestPath = join(second.root, 'package.json');
    const firstManifest = JSON.parse(readFileSync(firstManifestPath, 'utf8')) as Record<string, unknown>;
    const secondManifest = JSON.parse(readFileSync(secondManifestPath, 'utf8')) as Record<string, unknown>;
    firstManifest.name = '@upup/cycle-a';
    firstManifest.dependencies = { '@upup/cycle-b': '1.0.0' };
    secondManifest.name = '@upup/cycle-b';
    secondManifest.dependencies = { '@upup/cycle-a': '1.0.0' };
    writeFileSync(firstManifestPath, JSON.stringify(firstManifest));
    writeFileSync(secondManifestPath, JSON.stringify(secondManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [first.root, second.root],
      pinnedPackages: {
        '@upup/cycle-a': '1.0.0',
        '@upup/cycle-b': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: { '@upup/cycle-a': ['fixture:test'], '@upup/cycle-b': ['fixture:test'] },
    };
    catalog.register(first.root, trust);
    catalog.register(second.root, trust);
    expect(() => catalog.validateDependencies()).toThrow('dependency cycle detected');
  });

  test('rejects an internal dependency that is registered but disabled', () => {
    const dependency = makePackage('1.0.0', 'fixture-dependency');
    const dependent = makePackage('1.0.0', 'fixture-dependent');
    const dependentManifestPath = join(dependent.root, 'package.json');
    const dependentManifest = JSON.parse(readFileSync(dependentManifestPath, 'utf8')) as Record<string, unknown>;
    dependentManifest.name = '@upup/dependent-package';
    dependentManifest.dependencies = { '@upup/fixture-package': '1.0.0' };
    writeFileSync(dependentManifestPath, JSON.stringify(dependentManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [dependency.root, dependent.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/dependent-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: {
        '@upup/fixture-package': ['fixture:test'],
        '@upup/dependent-package': ['fixture:test'],
      },
    };
    catalog.register(dependency.root, trust);
    catalog.register(dependent.root, trust);
    catalog.disable('@upup/fixture-package');
    expect(() => catalog.validateDependencies()).toThrow('dependency is not loaded');
  });

  test('keeps the current package when rollback would break its dependency graph', () => {
    const current = makePackage('1.0.0');
    const replacement = makePackage('1.0.0');
    const replacementManifestPath = join(replacement.root, 'package.json');
    const replacementManifest = JSON.parse(readFileSync(replacementManifestPath, 'utf8')) as Record<string, unknown>;
    replacementManifest.dependencies = { '@upup/missing-package': '1.0.0' };
    writeFileSync(replacementManifestPath, JSON.stringify(replacementManifest));
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [current.root, replacement.root],
      pinnedPackages: {
        '@upup/fixture-package': '1.0.0',
        '@upup/missing-package': '1.0.0',
        '@earendil-works/pi-coding-agent': '0.84.3',
      },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    };
    catalog.register(current.root, trust);
    expect(() => catalog.rollback('@upup/fixture-package', replacement.root, trust)).toThrow('dependency is not loaded');
    expect(catalog.get('@upup/fixture-package')?.manifest.root).toBe(current.root);
  });

  test('requires the package itself to be explicitly pinned', () => {
    const packageFixture = makePackage('1.0.0');
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('package version is not pinned as expected');
  });

  test('rejects non-exact package versions', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.version = '^1.0.0';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('name/version is invalid');
  });

  test('rejects malformed, escaping, and duplicate resource declarations', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: { extensions: string[] } };
    const trust = {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    };
    manifest.pi.extensions = ['../outside.ts'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, trust)).toThrow('escapes the package root');

    manifest.pi.extensions = [''];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, trust)).toThrow('resources are invalid');

    manifest.pi.extensions = ['./extensions', './extensions'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, trust)).toThrow('contain duplicates');
  });

  test('rejects malformed or duplicate Pi command declarations', () => {
    const packageFixture = makePackage('1.0.0');
    const manifestPath = join(packageFixture.root, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi: { commands: string[] } };
    manifest.pi.commands = ['valid-command', 'valid-command'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('duplicates');

    manifest.pi.commands = ['not valid'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => new PiPackageCatalog().register(packageFixture.root, {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    })).toThrow('invalid');
  });

  test('requires every declared package command to be registered by a loaded extension', () => {
    const packageFixture = makePackage('1.0.0', 'fixture-command');
    const catalog = new PiPackageCatalog();
    const trust = {
      trustedPaths: [packageFixture.root],
      pinnedPackages: { '@upup/fixture-package': '1.0.0', '@earendil-works/pi-coding-agent': '0.84.3' },
      allowedSources: { '@upup/fixture-package': ['fixture:test'] },
    };
    catalog.register(packageFixture.root, trust);
    expect(() => catalog.validateExtensionLoad({
      extensions: [{ path: join(packageFixture.root, 'extensions', 'index.ts'), resolvedPath: join(packageFixture.root, 'extensions', 'index.ts'), commands: new Map() }],
      errors: [],
    })).toThrow('commands were not registered');
    expect(() => catalog.validateExtensionLoad({
      extensions: [],
      errors: [{ path: join(packageFixture.root, 'extensions', 'index.ts'), error: 'syntax error' }],
    })).toThrow('extension failed to load');
  });
});
