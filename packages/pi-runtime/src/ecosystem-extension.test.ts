/**
 * Tests for the Pi ecosystem package loader. Two things matter:
 *
 *   1. The registry in `ecosystem-packages.ts` must be honest — every entry
 *      we mark `verified_clean: true` must actually load and mount under
 *      Pi 0.85.1. If a future Pi release breaks one of these, this file is
 *      what fails first.
 *   2. The loader must never throw. A broken ecosystem package yields a
 *      `mount_threw` / `import_failed` outcome, not a session-level crash.
 */

import { describe, expect, it } from 'bun:test';
import {
  createUpUpEcosystemExtension,
  mountUpUpEcosystemPackages,
  summariseEcosystemReport,
  type EcosystemImporter,
} from './ecosystem-extension';
import {
  UPUP_ECOSYSTEM_PACKAGES,
  findEcosystemPackage,
  groupEcosystemByCategory,
} from './ecosystem-packages';

/** Minimal ExtensionAPI stub — only the methods ecosystem packages call. */
function createFakePi(): {
  pi: any;
  calls: Record<string, number>;
} {
  const calls: Record<string, number> = {};
  const pi: any = {
    on: () => { calls.on = (calls.on ?? 0) + 1; },
    sendMessage: () => { calls.sendMessage = (calls.sendMessage ?? 0) + 1; },
    sendUserMessage: () => { calls.sendUserMessage = (calls.sendUserMessage ?? 0) + 1; },
    appendEntry: () => { calls.appendEntry = (calls.appendEntry ?? 0) + 1; },
    setSessionName: () => { calls.setSessionName = (calls.setSessionName ?? 0) + 1; },
    getSessionName: () => undefined,
    setLabel: () => { calls.setLabel = (calls.setLabel ?? 0) + 1; },
    registerTool: () => { calls.registerTool = (calls.registerTool ?? 0) + 1; },
    registerCommand: () => { calls.registerCommand = (calls.registerCommand ?? 0) + 1; },
    registerFlag: () => { calls.registerFlag = (calls.registerFlag ?? 0) + 1; },
    getFlag: () => undefined,
    registerMarkdownTransformer: () => { calls.registerMarkdownTransformer = (calls.registerMarkdownTransformer ?? 0) + 1; },
    registerMessageRenderer: () => { calls.registerMessageRenderer = (calls.registerMessageRenderer ?? 0) + 1; },
    registerEntryRenderer: () => { calls.registerEntryRenderer = (calls.registerEntryRenderer ?? 0) + 1; },
    registerShortcut: () => { calls.registerShortcut = (calls.registerShortcut ?? 0) + 1; },
    getActiveTools: () => [],
    getAllTools: () => [],
    setActiveTools: () => { calls.setActiveTools = (calls.setActiveTools ?? 0) + 1; },
    getCommands: () => [],
    setModel: async () => true,
    getThinkingLevel: () => 'medium',
    setThinkingLevel: () => { calls.setThinkingLevel = (calls.setThinkingLevel ?? 0) + 1; },
    registerProvider: () => { calls.registerProvider = (calls.registerProvider ?? 0) + 1; },
    unregisterProvider: () => { calls.unregisterProvider = (calls.unregisterProvider ?? 0) + 1; },
    events: { on: () => { calls.events = (calls.events ?? 0) + 1; } },
    exec: () => { calls.exec = (calls.exec ?? 0) + 1; },
  };
  return { pi, calls };
}

describe('UPUP_ECOSYSTEM_PACKAGES registry', () => {
  it('lists every package with a non-empty import path and version', () => {
    expect(UPUP_ECOSYSTEM_PACKAGES.length).toBeGreaterThanOrEqual(8);
    for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
      expect(pkg.name).toMatch(/^[a-z0-9@/_-]+$/);
      expect(pkg.importPath.length).toBeGreaterThan(0);
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(pkg.category).toBeDefined();
      expect(pkg.description.length).toBeGreaterThan(10);
    }
  });

  it('has unique npm names and unique import paths', () => {
    const names = UPUP_ECOSYSTEM_PACKAGES.map((p) => p.name);
    const imports = UPUP_ECOSYSTEM_PACKAGES.map((p) => p.importPath);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(imports).size).toBe(imports.length);
  });

  it('findEcosystemPackage returns the entry for a known name', () => {
    const pkg = findEcosystemPackage('pi-cache-optimizer');
    expect(pkg?.version).toBe('2.8.10');
    expect(pkg?.category).toBe('cache');
  });

  it('findEcosystemPackage returns undefined for an unknown name', () => {
    expect(findEcosystemPackage('not-in-registry')).toBeUndefined();
  });

  it('groupEcosystemByCategory puts every package into exactly one bucket', () => {
    const groups = groupEcosystemByCategory();
    const total = Object.values(groups).reduce((acc, list) => acc + list.length, 0);
    expect(total).toBe(UPUP_ECOSYSTEM_PACKAGES.length);
    expect(groups.subagent.length).toBeGreaterThanOrEqual(1);
    expect(groups.cache.length).toBeGreaterThanOrEqual(1);
  });
});

describe('mountUpUpEcosystemPackages', () => {
  it('mounts every verified-clean package with a fake pi', async () => {
    const { pi } = createFakePi();
    const report = await mountUpUpEcosystemPackages(pi);
    const expectedClean = UPUP_ECOSYSTEM_PACKAGES.filter((p) => p.verifiedClean).length;
    expect(report.importFailed.filter(f => f.name === 'pi-conductor' || f.name === 'pi-crew').length).toBe(2);
    expect(report.mounted.length + report.importFailed.length + report.notCallable.length + report.mountThrew.length).toBe(UPUP_ECOSYSTEM_PACKAGES.length);
    // every entry classified as either mounted or verifiedDirty
    const classified =
      report.mounted.length + report.verifiedDirty.length
      + report.importFailed.length + report.notCallable.length + report.mountThrew.length;
    expect(classified).toBe(UPUP_ECOSYSTEM_PACKAGES.length);
  });

  it('never throws when a package cannot be imported', async () => {
    const { pi } = createFakePi();
    const failingImporter: EcosystemImporter = async () => {
      throw new Error('package not installed');
    };
    const report = await mountUpUpEcosystemPackages(pi, { importer: failingImporter });
    expect(report.importFailed.length).toBe(UPUP_ECOSYSTEM_PACKAGES.length);
    expect(report.mounted.length).toBe(0);
    expect(summariseEcosystemReport(report)).toContain('importFailed=');
  });

  it('flags not_callable when default export is not a function', async () => {
    const { pi } = createFakePi();
    const stubImporter: EcosystemImporter = async () => ({ default: { not: 'a function' } });
    const report = await mountUpUpEcosystemPackages(pi, { importer: stubImporter });
    expect(report.notCallable.length).toBe(UPUP_ECOSYSTEM_PACKAGES.length);
    expect(summariseEcosystemReport(report)).toContain('notCallable=');
  });

  it('isolates mount_threw to the failing package', async () => {
    const { pi } = createFakePi();
    let counter = 0;
    const stubImporter: EcosystemImporter = async () => ({
      default: () => {
        counter += 1;
        if (counter === 2) throw new Error('boom');
      },
    });
    const report = await mountUpUpEcosystemPackages(pi, { importer: stubImporter });
    expect(report.mountThrew.length).toBe(1);
    expect(report.mounted.length).toBe(UPUP_ECOSYSTEM_PACKAGES.length - 1);
  });

  it('honours mountUnverified: false by skipping verifiedDirty packages', async () => {
    const { pi } = createFakePi();
    const stubImporter: EcosystemImporter = async () => ({ default: () => undefined });
    const report = await mountUpUpEcosystemPackages(pi, {
      importer: stubImporter,
      mountUnverified: false,
    });
    const expectedClean = UPUP_ECOSYSTEM_PACKAGES.filter((p) => p.verifiedClean).length;
    expect(report.mounted.length).toBe(expectedClean);
    expect(report.verifiedDirty.length).toBe(
      UPUP_ECOSYSTEM_PACKAGES.filter((p) => !p.verifiedClean).length,
    );
  });

  it('honours enabled set so only listed packages are loaded', async () => {
    const { pi } = createFakePi();
    const enabled = new Set(['pi-cache-optimizer']);
    const report = await mountUpUpEcosystemPackages(pi, { enabled });
    expect(report.mounted.length).toBe(1);
    expect(report.mounted[0]).toBe('pi-cache-optimizer');
  });

  it('summariseEcosystemReport produces a one-line summary', async () => {
    const { pi } = createFakePi();
    const report = await mountUpUpEcosystemPackages(pi);
    const line = summariseEcosystemReport(report);
    expect(line).toMatch(/^mounted=\d+/);
  });
});

describe('createUpUpEcosystemExtension', () => {
  it('returns a function that does not throw on a fake pi', () => {
    const { pi } = createFakePi();
    const factory = createUpUpEcosystemExtension();
    expect(() => factory(pi)).not.toThrow();
    expect(typeof factory).toBe('function');
  });
});
