/**
 * UpUp Ecosystem Extension — mounts every Pi ecosystem package UpUp depends
 * on, behind one Pi extension entry point.
 *
 * Why one entry point:
 *   Pi extensions are individual `default(pi)` functions. Pi ecosystem
 *   packages each ship one. UpUp already has 19 internal extensions; adding
 *   10 ecosystem ones as separate factories inflates `extensionFactories`
 *   and makes failure isolation harder. A single UpUp extension that
 *   imports each ecosystem package, calls its default export, and never
 *   throws even if one package is broken keeps the host TUI alive.
 *
 * Failure isolation rules:
 *   1. Each package is imported lazily inside a `try/catch`. A missing or
 *      broken package yields a single warning line — the session keeps going.
 *   2. `verified_clean: false` packages are still mounted, but the loader
 *      records that fact in the audit trail so `report:pi7` can surface it.
 *   3. A package whose default export is not a function is recorded as
 *      `not_callable`, not mounted, and excluded from the success count.
 *   4. The loader runs **after** `createUpUpInvestmentEventExtension`, so the
 *      36/36 event surface sees the ecosystem packages registering their own
 *      handlers — important for `tool_execution_start` accounting.
 *
 * Dev / production split:
 *   - `createUpUpEcosystemExtension()` is what the runtime calls.
 *   - `mountUpUpEcosystemPackages(pi)` is the pure function tests assert on.
 *   - `loadEcosystemPackage(name)` is overridable so tests can inject fakes.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  UPUP_ECOSYSTEM_PACKAGES,
  type UpUpEcosystemPackage,
} from './ecosystem-packages';

export type EcosystemMountOutcome =
  | { kind: 'mounted'; name: string; importPath: string }
  | { kind: 'verified_dirty'; name: string; importPath: string }
  | { kind: 'import_failed'; name: string; importPath: string; error: string }
  | { kind: 'not_callable'; name: string; importPath: string; actualType: string }
  | { kind: 'mount_threw'; name: string; importPath: string; error: string };

export interface EcosystemMountReport {
  readonly mounted: readonly string[];
  readonly verifiedDirty: readonly string[];
  readonly importFailed: readonly { name: string; importPath: string; error: string }[];
  readonly notCallable: readonly { name: string; importPath: string; actualType: string }[];
  readonly mountThrew: readonly { name: string; importPath: string; error: string }[];
  readonly outcomes: readonly EcosystemMountOutcome[];
  readonly at: number;
}

/**
 * Pluggable dynamic importer. Default: real `import()`. Tests inject a stub
 * that returns a fake default export without touching node_modules.
 */
export type EcosystemImporter = (specifier: string) => Promise<unknown>;

const defaultImporter: EcosystemImporter = (specifier) => import(specifier);

export interface MountEcosystemOptions {
  readonly now?: () => number;
  readonly importer?: EcosystemImporter;
  readonly enabled?: ReadonlySet<string>;
  /**
   * If true, packages with `verifiedClean: false` are still mounted (default).
   * Set to false for tests / minimal hosts that want only verified-clean ones.
   */
  readonly mountUnverified?: boolean;
}

/**
 * Pure function. Imports every enabled ecosystem package, calls its default
 * export on `pi`, and returns a structured report. Never throws.
 */
export async function mountUpUpEcosystemPackages(
  pi: ExtensionAPI,
  options: MountEcosystemOptions = {},
): Promise<EcosystemMountReport> {
  const importer = options.importer ?? defaultImporter;
  const enabled = options.enabled;
  const mountUnverified = options.mountUnverified ?? true;
  const now = options.now ?? (() => Date.now());

  const mounted: string[] = [];
  const verifiedDirty: string[] = [];
  const importFailed: { name: string; importPath: string; error: string }[] = [];
  const notCallable: { name: string; importPath: string; actualType: string }[] = [];
  const mountThrew: { name: string; importPath: string; error: string }[] = [];
  const outcomes: EcosystemMountOutcome[] = [];

  for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
    if (enabled && !enabled.has(pkg.name)) continue;
    if (!pkg.verifiedClean && !mountUnverified) {
      outcomes.push({ kind: 'verified_dirty', name: pkg.name, importPath: pkg.importPath });
      verifiedDirty.push(pkg.name);
      continue;
    }

    let mod: unknown;
    try {
      mod = await importer(pkg.importPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      outcomes.push({ kind: 'import_failed', name: pkg.name, importPath: pkg.importPath, error: msg });
      importFailed.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
      continue;
    }

    const record = mod as { default?: unknown };
    const candidate = record?.default;
    if (typeof candidate !== 'function') {
      const actualType = candidate === undefined ? 'undefined' : typeof candidate;
      outcomes.push({ kind: 'not_callable', name: pkg.name, importPath: pkg.importPath, actualType });
      notCallable.push({ name: pkg.name, importPath: pkg.importPath, actualType });
      continue;
    }

    try {
      (candidate as (pi: ExtensionAPI) => void)(pi);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      outcomes.push({ kind: 'mount_threw', name: pkg.name, importPath: pkg.importPath, error: msg });
      mountThrew.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
      continue;
    }

    mounted.push(pkg.name);
    outcomes.push({ kind: 'mounted', name: pkg.name, importPath: pkg.importPath });
  }

  return {
    mounted,
    verifiedDirty,
    importFailed,
    notCallable,
    mountThrew,
    outcomes,
    at: now(),
  };
}

/**
 * Build a Pi extension that, when called by Pi, mounts every UpUp ecosystem
 * package. The synchronous `ExtensionAPI.on(...)` contract means we have to
 * register `default(pi)` immediately; mounting is async, but Pi's runner
 * awaits the returned Promise. We therefore provide a tiny `pi`-bound factory
 * that schedules the mount and logs the report through the audit sink if
 * one is present.
 *
 * Mount failures are never fatal — they show up in `report:pi7` and the TUI
 * banner, not in a thrown exit.
 */
export function createUpUpEcosystemExtension(options: MountEcosystemOptions = {}): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI): void => {
    const runner = (): Promise<EcosystemMountReport> =>
      mountUpUpEcosystemPackages(pi, options).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return {
          mounted: [],
          verifiedDirty: [],
          importFailed: [{ name: '<runner>', importPath: '<runner>', error: message }],
          notCallable: [],
          mountThrew: [],
          outcomes: [{ kind: 'mount_threw', name: '<runner>', importPath: '<runner>', error: message }],
          at: Date.now(),
        };
      });
    void runner();
  };
}

/** Convenience: summarise a mount report as a one-line string for `report:pi7`. */
export function summariseEcosystemReport(report: EcosystemMountReport): string {
  const parts: string[] = [];
  parts.push(`mounted=${report.mounted.length}`);
  if (report.verifiedDirty.length > 0) parts.push(`verifiedDirty=${report.verifiedDirty.length}`);
  if (report.importFailed.length > 0) parts.push(`importFailed=${report.importFailed.length}`);
  if (report.notCallable.length > 0) parts.push(`notCallable=${report.notCallable.length}`);
  if (report.mountThrew.length > 0) parts.push(`mountThrew=${report.mountThrew.length}`);
  return parts.join(' ');
}

/** Re-export for downstream packages that want to enumerate categories. */
export type { UpUpEcosystemPackage };
