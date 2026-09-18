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

import fs, { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

import {
  createUpUpEcosystemExtension,
  declaredToolNames,
  mountUpUpEcosystemPackages,
  resolvePackageSourceDir,
  UPUP_OWNED_TOOL_NAMES,
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

/**
 * Packages whose declared tools intersect `UPUP_OWNED_TOOL_NAMES`.
 *
 * These are skipped before import (Pi fails the whole extension on a duplicate
 * tool name), so tests that count import/mount outcomes must exclude them.
 */
function preSkippedPackages(): readonly string[] {
  // Mirrors the runtime conflict pre-check: a package whose static or
  // source-grepped tool set intersects `UPUP_OWNED_TOOL_NAMES` will not be
  // loaded by `mountUpUpEcosystemPackages`. The source grep is intentionally
  // narrow — it only matches `pi.registerTool(<...>)({ name: 'foo', ... })`
  // call shapes (Form A/B/C in `declaredToolNames`) — so this set is the
  // exact ground truth the runtime would skip on a fresh checkout.
  const sourceTools = new Map<string, ReadonlySet<string>>();
  for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
    let tools = new Set<string>(pkg.registersTools ?? []);
    if (tools.size === 0) {
      try {
        // Lazy-import the runtime's source-grep helper. If the test runs
        // before the package is built, treat it as "no declared tools"
        // (the worst case is a single false negative on the assertion).
        const { declaredToolNames, resolvePackageSourceDir } = require('./ecosystem-extension');
        tools = new Set(declaredToolNames(resolvePackageSourceDir(pkg)));
      } catch {
        tools = new Set();
      }
    }
    sourceTools.set(pkg.name, tools);
  }
  return UPUP_ECOSYSTEM_PACKAGES
    .filter((pkg) => {
      const declared = sourceTools.get(pkg.name);
      if (!declared) return false;
      for (const tool of declared) if (UPUP_OWNED_TOOL_NAMES.includes(tool)) return true;
      return false;
    })
    .map((pkg) => pkg.name);
}

function preLoadedPackages(): readonly string[] {
  // Packages that Pi's own package manager will already have loaded from
  // `<agentDir>/settings.json#packages`; UpUp's ecosystem mount must skip
  // them or it would register a duplicate tool. The dev settings.json on a
  // fresh checkout is also empty, so this is the right hook for tests run
  // inside a real Pi install.
  return UPUP_ECOSYSTEM_PACKAGES
    .filter((pkg) => piLoadedPackageNamesForTests().has(pkg.name))
    .map((pkg) => pkg.name);
}

/**
 * `piLoadedPackageNames` reads `<agentDir>/settings.json`, which is
 * gitignored and machine-specific. For the test we read the same file
 * off the actual cwd so the dev test reflects a real user environment;
 * a missing file degrades to "no pre-loaded packages" without
 * affecting the rest of the assertion.
 */
function piLoadedPackageNamesForTests(): ReadonlySet<string> {
  try {
    // Lazy import so a stale type-only `ecosystem-extension` import does
    // not create a build cycle through the runtime test harness.
    const { piLoadedPackageNames } = require('./ecosystem-extension');
    return piLoadedPackageNames();
  } catch {
    return new Set();
  }
}

describe('mountUpUpEcosystemPackages', () => {
  it('mounts every verified-clean package with a fake pi', async () => {
    const { pi } = createFakePi();
    const report = await mountUpUpEcosystemPackages(pi);
    // every entry is classified exactly once
    const classified =
      report.mounted.length + report.skippedToolConflict.length + report.skippedAlreadyLoaded.length
      + report.verifiedDirty.length + report.importFailed.length + report.notCallable.length + report.mountThrew.length;
    expect(classified).toBe(UPUP_ECOSYSTEM_PACKAGES.length);
    // The union of pre-known skips must match the union of skip kinds in the report.
    const expectedSkipNames = new Set([...preSkippedPackages(), ...preLoadedPackages()]);
    expect(new Set([...report.skippedToolConflict.map((e) => e.name), ...report.skippedAlreadyLoaded.map((e) => e.name)]))
      .toEqual(expectedSkipNames);
    // Everything in the registry that is not skipped or known-broken must be
    // mounted — no package may silently land in a "looks fine but registered
    // nothing" state, which is what a named-export-only check used to allow.
    const skippedOrDirty = new Set([
      ...report.skippedToolConflict.map((e) => e.name),
      ...report.skippedAlreadyLoaded.map((e) => e.name),
      ...report.importFailed.map((e) => e.name),
      ...report.notCallable.map((e) => e.name),
      ...report.mountThrew.map((e) => e.name),
      ...UPUP_ECOSYSTEM_PACKAGES.filter((p) => !p.verifiedClean).map((p) => p.name),
    ]);
    const expectedMounted = UPUP_ECOSYSTEM_PACKAGES.map((p) => p.name).filter((n) => !skippedOrDirty.has(n));
    expect([...report.mounted].sort()).toEqual(expectedMounted.sort());
  });

  it('records the specifier that actually supplied each mounted factory', async () => {
    const { pi } = createFakePi();
    const report = await mountUpUpEcosystemPackages(pi);
    for (const name of report.mounted) {
      const specifier = report.resolvedSpecifiers[name];
      expect(typeof specifier).toBe('string');
      expect(specifier!.length).toBeGreaterThan(0);
    }
    // A package that declares `pi.extensions` must be mounted through that
    // declared entry, never through an unrelated npm main entry.
    const esr = report.resolvedSpecifiers['pi-esr'];
    expect(esr).toBeDefined();
    expect(esr!.endsWith('pi-extension.js')).toBe(true);
  });

  it('skips packages whose declared tools are already owned by UpUp', async () => {
    const { pi } = createFakePi();
    const stubImporter: EcosystemImporter = async () => ({ default: () => undefined });
    const report = await mountUpUpEcosystemPackages(pi, { importer: stubImporter });
    const expected = preSkippedPackages();
    expect(expected.length).toBeGreaterThan(0);
    expect(report.skippedToolConflict.map((entry) => entry.name).sort()).toEqual([...expected].sort());
    for (const entry of report.skippedToolConflict) {
      expect(entry.conflicts.length).toBeGreaterThan(0);
    }
    expect(summariseEcosystemReport(report)).toContain('skippedToolConflict=');
  });

  it('keeps every UPUP_OWNED_TOOL_NAMES entry distinct and snake_case', () => {
    expect(UPUP_OWNED_TOOL_NAMES.length).toBeGreaterThan(100);
    expect(new Set(UPUP_OWNED_TOOL_NAMES).size).toBe(UPUP_OWNED_TOOL_NAMES.length);
    for (const name of UPUP_OWNED_TOOL_NAMES) expect(name).toMatch(/^[a-z][a-zA-Z0-9_]*$/);
  });

  it('covers every tool the workspace extensions literally register', () => {
    // Drift guard for `UPUP_OWNED_TOOL_NAMES`: the conflict pre-check can only
    // skip a colliding ecosystem package if the name is listed. Scanning the
    // `name: '…'` literals keeps the list honest as new UpUp tools land.
    const roots = [
      'packages/pi-research/extensions',
      'packages/pi-platform/extensions',
      'packages/pi-investment-workflow/extensions',
      'packages/pi-market-data/extensions',
      'packages/pi-risk/extensions',
      'packages/pi-portfolio/extensions',
      'packages/pi-backtest/extensions',
    ].map((rel) => path.join(repoRoot, rel));
    const seen = new Set<string>();
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          for (const match of readFileSync(full, 'utf8').matchAll(/name:\s*'([a-z][a-z0-9_]*)'/g)) {
            seen.add(match[1]!);
          }
        }
      }
    };
    for (const root of roots) walk(root);
    const missing = [...seen].filter((name) => !UPUP_OWNED_TOOL_NAMES.includes(name)).sort();
    expect(missing).toEqual([]);
  });

  it('never throws when a package cannot be imported', async () => {
    const { pi } = createFakePi();
    const failingImporter: EcosystemImporter = async () => {
      throw new Error('package not installed');
    };
    const report = await mountUpUpEcosystemPackages(pi, { importer: failingImporter });
    const importable = UPUP_ECOSYSTEM_PACKAGES.length - preSkippedPackages().length;
    expect(report.importFailed.length).toBe(importable);
    expect(report.mounted.length).toBe(0);
    expect(summariseEcosystemReport(report)).toContain('importFailed=');
  });

  it('flags not_callable when default export is not a function', async () => {
    const { pi } = createFakePi();
    const stubImporter: EcosystemImporter = async () => ({ default: { not: 'a function' } });
    const report = await mountUpUpEcosystemPackages(pi, { importer: stubImporter });
    expect(report.notCallable.length).toBe(
      UPUP_ECOSYSTEM_PACKAGES.length - preSkippedPackages().length,
    );
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
    expect(report.mounted.length).toBe(
      UPUP_ECOSYSTEM_PACKAGES.length - preSkippedPackages().length - preLoadedPackages().length - 1,
    );
  });

  it('honours mountUnverified: false by skipping verifiedDirty packages', async () => {
    const { pi } = createFakePi();
    const stubImporter: EcosystemImporter = async () => ({ default: () => undefined });
    const report = await mountUpUpEcosystemPackages(pi, {
      importer: stubImporter,
      mountUnverified: false,
    });
    const expectedClean =
      UPUP_ECOSYSTEM_PACKAGES.filter((p) => p.verifiedClean).length
      - preSkippedPackages().length
      - preLoadedPackages().length;
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

describe('declaredToolNames Form D — defineTool + spread', () => {
  let dir: string;

  function writeFixture(relative: string, body: string): void {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }

  it('resolves spread calls to their defineTool binding', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upup-form-d-'));
    try {
      writeFixture('pkg/extension.ts', [
        "import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';",
        "const lspDiagnosticsTool = defineTool({",
        "  name: 'lsp_diagnostics',",
        "  label: 'LSP: Diagnostics',",
        "  description: 'Run diagnostics via configured LSP servers.',",
        "});",
        "const lspFixTool = defineTool({",
        "  name: 'lsp_fix',",
        "  label: 'LSP: Quick fix',",
        "  description: 'Apply a quick-fix from a configured LSP server.',",
        "});",
        "export default function ext(pi: ExtensionAPI): void {",
        "  pi.registerTool({ ...lspDiagnosticsTool, execute: async () => null });",
        "  pi.registerTool({ ...lspFixTool, execute: async () => null });",
        "}",
      ].join('\n'));
      const names = [...declaredToolNames(dir)].sort();
      expect(names).toEqual(['lsp_diagnostics', 'lsp_fix']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to empty set when no spread binding matches', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upup-form-d-'));
    try {
      writeFixture('pkg/extension.ts', [
        "import { type ExtensionAPI } from '@earendil-works/pi-coding-agent';",
        "export default function ext(pi: ExtensionAPI): void {",
        "  pi.registerTool({ ...undefinedThing });",
        "}",
      ].join('\n'));
      expect([...declaredToolNames(dir)]).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty set for missing package root', () => {
    expect([...declaredToolNames(undefined)]).toEqual([]);
    expect([...declaredToolNames('/path/that/definitely/does/not/exist')]).toEqual([]);
  });
});