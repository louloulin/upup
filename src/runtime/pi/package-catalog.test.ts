import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PiPackageCatalog } from './package-catalog.js';

function makePackage(version: string): { root: string; hash: string } {
  const root = mkdtempSync(join(tmpdir(), 'upup-pi-package-'));
  mkdirSync(join(root, 'extensions'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@upup/fixture-package', version, pi: { extensions: ['./extensions'], workflows: ['./workflow.md'], policies: ['./policy.md'], evals: ['./eval.json'] } }));
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
  test('pins, audits, disables and rolls back a Pi package', () => {
    const first = makePackage('1.0.0');
    const second = makePackage('1.1.0');
    const catalog = new PiPackageCatalog();
    const trust = { trustedPaths: [first.root, second.root], pinnedPackages: { '@upup/fixture-package': '1.0.0' } };
    const record = catalog.register(first.root, trust);
    expect(record.manifest.version).toBe('1.0.0');
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
});
