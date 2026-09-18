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
 * Resolution scope:
 *   Packages load through `createEcosystemImporter()` (see
 *   `ecosystem-resolver.ts`), which prefers the UpUp home
 *   (`~/.upup/agent/npm`, where `upup plugin install` downloads) and falls
 *   back to the bundled workspace. Without that indirection a user-installed
 *   plugin sat on disk but never loaded, because a bare `import()` only ever
 *   searched this repository's `node_modules`.
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
 * Subagent registration:
 *   After every package's `default(pi)` returns, we also call
 *   `registerUpUpFinanceSubagents(pi)` so UpUp's four canonical subagents
 *   (`bull`, `bear`, `synthesizer`, `risk`) are available to SOPs that
 *   use `pi-subagents`'s DAG scheduler (e.g. `sops/debate.yaml`).
 *
 * Dev / production split:
 *   - `createUpUpEcosystemExtension()` is what the runtime calls.
 *   - `mountUpUpEcosystemPackages(pi)` is the pure function tests assert on.
 *   - `loadEcosystemPackage(name)` is overridable so tests can inject fakes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  UPUP_ECOSYSTEM_PACKAGES,
  type UpUpEcosystemPackage,
} from './ecosystem-packages';
import { createEcosystemImporter, resolveEcosystemSpecifier, resolvePiExtensionEntriesByRoot } from './ecosystem-resolver';
import { applyProperLockfileBunShim } from './proper-lockfile-bun-shim';
// Internal alias so the in-file references (e.g. `piLoadedPackageNames()`
// passed as the default to `options.piLoadedPackages`) resolve without
// going through the public re-export. The re-export below remains the
// public surface for external callers.
import { piLoadedPackageNames as readPiLoadedPackageNames } from './ecosystem-loaded-packages';

export type EcosystemMountOutcome =
  | { kind: 'mounted'; name: string; importPath: string; resolvedSpecifier: string }
  | { kind: 'skipped_tool_conflict'; name: string; importPath: string; conflicts: readonly string[] }
  | { kind: 'skipped_already_loaded'; name: string; importPath: string; reason: string }
  | { kind: 'verified_dirty'; name: string; importPath: string }
  | { kind: 'import_failed'; name: string; importPath: string; error: string }
  | { kind: 'not_callable'; name: string; importPath: string; actualType: string }
  | { kind: 'mount_threw'; name: string; importPath: string; error: string };

export interface EcosystemMountReport {
  readonly mounted: readonly string[];
  /**
   * Packages skipped because the tools they register are already claimed by an
   * earlier extension. Pi's resource loader fails the *whole* extension when
   * two extensions register the same tool name, so skipping is the only way to
   * keep the rest of the ecosystem loaded.
   */
  readonly skippedToolConflict: readonly { name: string; importPath: string; conflicts: readonly string[] }[];
  /**
   * Packages Pi's own package manager already loaded from
   * `<agentDir>/settings.json#packages`. Mounting them again would register a
   * duplicate `subagent` / `mcp` / `ask_user_question`, which Pi turns into a
   * fatal `Failed to load extension` diagnostic.
   */
  readonly skippedAlreadyLoaded: readonly { name: string; importPath: string; reason: string }[];
  readonly verifiedDirty: readonly string[];
  readonly importFailed: readonly { name: string; importPath: string; error: string }[];
  readonly notCallable: readonly { name: string; importPath: string; actualType: string }[];
  readonly mountThrew: readonly { name: string; importPath: string; error: string }[];
  /**
   * Package name → the specifier (or `pi.extensions` file path) that actually
   * supplied the mounted factory. Recorded so `report:pi7` and `upup doctor`
   * can show *what resolved*, which is the only way to debug "the registry
   * lists it but nothing registered".
   */
  readonly resolvedSpecifiers: Readonly<Record<string, string>>;
  readonly outcomes: readonly EcosystemMountOutcome[];
  /**
   * Result of the proper-lockfile + Bun Proxy invariant shim. `applied: false`
   * is non-fatal — it means proper-lockfile is not installed (e.g. on a
   * clean run without `@llmgates_api/pi-llmgates-provider`).
   * See `./proper-lockfile-bun-shim.ts` for the full diagnosis.
   */
  readonly properLockfileShim: { applied: boolean; reason: string };
  readonly at: number;
}

/**
 * Pluggable dynamic importer. Default: real `import()`. Tests inject a stub
 * that returns a fake default export without touching node_modules.
 */
export type EcosystemImporter = (specifier: string) => Promise<unknown>;

/** Pi settings directory name under the UpUp agent home. */
const UPUP_PI_SETTINGS_RELATIVE = '.upup/agent';

// Re-exported from `./ecosystem-loaded-packages` so that callers from the rest
// of `@upup/pi-runtime` (notably `research-dag.ts`) can import these helpers
// statically without dragging in `ecosystem-extension.ts`, which itself
// dynamically imports `research-dag.ts`. Keeping both helpers in this file
// produced a 2-node cycle in `lint:scc`.
export { piAgentDir, piLoadedPackageNames } from './ecosystem-loaded-packages';

/**
 * Static tool names known to conflict across Pi ecosystem packages.
 *
 * These are reserved because at least two commonly-installed Pi packages
 * (one autoloaded from `<agentDir>/settings.json`, one mounted by UpUp) each
 * register a tool with this id, and Pi escalates duplicate tool names to a
 * fatal extension-load error.
 */
export const UPUP_PI_ECOSYSTEM_RESERVED_TOOL_NAMES: readonly string[] = [
  'subagent', 'bg_wait', 'mcp', 'mcpScript', 'ask_user_question', 'workflow',
];

/**
 * Walk up from a file path until a `package.json` is found, returning that
 * directory. Falls back to the input when no marker exists (test stubs pass
 * synthetic paths that have no package.json on disk). Re-exported so the
 * conflict pre-check can recover the package root from a subpath like
 * `<root>/node_modules/pi-goal-x/extensions/goal.ts`.
 */
function packageRootFromFile(filePath: string): string | undefined {
  let cursor = filePath;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = dirname(cursor);
    if (candidate === cursor) return undefined;
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    cursor = candidate;
  }
  return undefined;
}

/**
 * Resolve a `UpUpEcosystemPackage` to the package directory on disk so
 * `declaredToolNames` can grep its source for `pi.registerTool({ name: … })`.
 *
 * Handles four cases:
 *   1. `pi.extensions` present — the package dir itself, which is the
 *      authoritative source location (`pi-brainstorm` ships no resolvable
 *      `.` export at all, so a specifier-only lookup would miss it).
 *   2. Bare specifier (`pi-web-access`) — resolves to the package root.
 *   3. Subpath (`pi-goal-x/extensions/goal.ts`) — walks up to `package.json`.
 *   4. Unresolvable (test stub importer) — `undefined`; callers treat that as
 *      "no source declared" and fall back to the static `registersTools` list.
 *
 * Why case 1 exists: the conflict pre-check used to depend solely on
 * `importPath`. For a package whose `importPath` does not resolve, it
 * silently returned "declares no tools" and let a package registering
 * `web_search` / `subagent` mount on top of UpUp's own tool of the same name
 * — exactly the duplicate Pi escalates to a fatal `Failed to load extension`.
 */
export function resolvePackageSourceDir(
  pkg: { readonly importPath: string; readonly name: string },
  _importer?: EcosystemImporter,
): string | undefined {
  const declaredGroup = resolvePiExtensionEntriesByRoot(pkg.name)[0];
  if (declaredGroup !== undefined) return declaredGroup.dir;
  const resolved = resolveEcosystemSpecifier(pkg.importPath);
  if (resolved === undefined) return undefined;
  // Resolve the *package* root, not the directory of the entry file. A
  // subpath like `pi-goal-x/extensions/goal.ts` would otherwise report the
  // `extensions/` folder and miss the tools declared in `index.ts`.
  const rootFromMarker = packageRootFromFile(resolved);
  if (rootFromMarker !== undefined) return rootFromMarker;
  // No `package.json` along the path (test stub) — fall back to the
  // directory of the resolved file so `declaredToolNames` still has a
  // target to walk.
  return dirname(resolved);
}

/**
 * Sniff a Pi ecosystem package's source on disk for `name: '<tool>'` strings.
 *
 * Walks the package root looking at `*.ts` / `*.js` files (skipping test files),
 * greps for `name:\s*'([a-z_]+)'` literals, and returns the unique set. The
 * result feeds `mountUpUpEcosystemPackages`'s conflict pre-check so a package
 * that declares a tool already owned by the host is skipped without ever
 * calling its default export — Pi otherwise turns the duplicate into a fatal
 * `Failed to load extension` diagnostic and aborts the entire ecosystem
 * extension.
 */
export function declaredToolNames(packageRoot: string | undefined): ReadonlySet<string> {
  if (packageRoot === undefined || !existsSync(packageRoot)) return new Set();
  const tools = new Set<string>();
  // Only the `name:` field that lives inside a `pi.registerTool(...)` or
  // `pi.registerCommand(...)` call counts. The two-step match (find the
  // call, then grab its inline object literal's `name`) is far more reliable
  // than a global `name: '<id>'` grep, which otherwise scoops up HTML form
  // attributes, i18n locale keys, and unrelated `name:` strings that a Pi
  // package's compiled bundle happens to contain.
  // Form A — `pi.registerTool<...>({ name: 'foo', ... })` (most Pi ecosystem
  // packages — the generic params are optional, so the regex is non-greedy
  // and tolerates their absence).
  const typedNameRe = /register(?:Tool|Command|Shortcut)(?:<[^>]*>)?\s*\(\s*\{[^}]*?name:\s*['"]([a-z][a-z0-9_-]{1,40})['"]/g;
  // Form B — `pi.registerCommand('foo', { ... })` / `registerTool` shorthand
  // where the id is the first argument and the object comes second.
  const callRe = /(?:pi|this)\s*\.\s*register(?:Tool|Command|Shortcut)\s*\(\s*(['"])([a-z][a-z0-9_-]{1,40})\1/g;
  // Form C — `registerTool('foo', { ... name: 'bar' ... })` (rare; mostly
  // `registerCommand` with both positional name and inline object).
  const inlineNameRe = /register(?:Tool|Command|Shortcut)\s*\(\s*['"][^'"]+['"]\s*,\s*\{[^}]*?name:\s*['"]([a-z][a-z0-9_-]{1,40})['"]/g;
  // Form D — `defineTool({ name: '...' })` followed later by
  // `registerTool({ ...<ident> })`. Many Pi ecosystem packages
  // (`@narumitw/pi-lsp`, `pi-subagents`, `pi-mcp-adapter`, …) build the
  // tool spec via `defineTool` and spread it into `pi.registerTool`; the
  // `name` literal lives in the `defineTool` block, not the call site, so
  // Forms A–C cannot see it. We resolve the spread by pre-scanning the
  // file for `const <ident> = defineTool({ name: '...' })` bindings.
  const defineNameRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*defineTool\s*\(\s*\{[^}]*?name:\s*['"]([a-z][a-z0-9_-]{1,40})['"]/g;
  const spreadRe = /register(?:Tool|Command|Shortcut)\s*\(\s*\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)\b/g;
  const skipDir = new Set(['node_modules', 'dist', '.git', 'test', 'tests', '__tests__']);
  const collect = (body: string): void => {
    for (const m of body.matchAll(typedNameRe)) if (m[1]) tools.add(m[1]);
    for (const m of body.matchAll(callRe)) if (m[2]) tools.add(m[2]);
    for (const m of body.matchAll(inlineNameRe)) if (m[1]) tools.add(m[1]);
    // Resolve Form D: collect every `const <ident> = defineTool({ name: '...' })`
    // binding in the file, then walk each `registerTool({ ...<ident> })` call
    // and add the bound name to the set.
    const definedNames = new Map<string, string>();
    for (const m of body.matchAll(defineNameRe)) {
      if (m[1] && m[2]) definedNames.set(m[1], m[2]);
    }
    for (const m of body.matchAll(spreadRe)) {
      const ident = m[1];
      if (!ident) continue;
      const name = definedNames.get(ident);
      if (name !== undefined) tools.add(name);
    }
  };
  const walk = (dir: string): void => {
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      // SAFETY: `withFileTypes: true` returns `Dirent[]` which is a structural
      // superset of the narrowed local type; the cast pins the local shape so
      // downstream `entry.isDirectory()` calls type-check.
      entries = readdirSync(dir, { withFileTypes: true }) as unknown as typeof entries;
    }
    catch { return; }
    for (const entry of entries) {
      if (skipDir.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        let body: string;
        try { body = readFileSync(full, 'utf8'); } catch { continue; }
        collect(body);
      }
    }
  };
  walk(packageRoot);
  return tools;
}

/**
 * Tool names already registered on this `pi`.
 *
 * `getAllTools()` is part of Pi's `ExtensionAPI`; hosts that only implement the
 * registration half (test doubles, minimal embedded hosts) fall back to an
 * empty set so the conflict pre-check degrades to "mount everything".
 */
function registeredToolNames(pi: ExtensionAPI): ReadonlySet<string> {
  const names = new Set<string>(UPUP_HOST_RESERVED_TOOL_NAMES);
  // SAFETY: `ExtensionAPI` does not declare `getAllTools` in its public type;
  // Pi exposes it at runtime. The double `as unknown as` narrows to the
  // minimal structural shape we actually read.
  const candidate = (pi as unknown as { getAllTools?: () => unknown }).getAllTools;
  if (typeof candidate === 'function') {
    try {
      const tools = candidate.call(pi);
      if (tools instanceof Map) for (const key of tools.keys()) names.add(String(key));
      else if (Array.isArray(tools)) {
        for (const tool of tools) {
          const name = (tool as { name?: unknown })?.name;
          if (typeof name === 'string') names.add(name);
        }
      } else if (tools && typeof tools === 'object') {
        for (const key of Object.keys(tools)) names.add(key);
      }
    } catch {
      /* Loading-phase hosts throw here; the static list still applies. */
    }
  }
  return names;
}

const defaultImporter: EcosystemImporter = createEcosystemImporter();

export interface MountEcosystemOptions {
  readonly now?: () => number;
  readonly importer?: EcosystemImporter;
  readonly enabled?: ReadonlySet<string>;
  /**
   * If true, packages with `verifiedClean: false` are still mounted (default).
   * Set to false for tests / minimal hosts that want only verified-clean ones.
   */
  readonly mountUnverified?: boolean;
  /**
   * Override for the set of packages Pi's package manager already loaded.
   * Defaults to reading `<agentDir>/settings.json#packages`.
   */
  readonly piLoadedPackages?: ReadonlySet<string>;
  /**
   * Pre-computed proper-lockfile shim result to embed in the report.
   * When absent, the report's `properLockfileShim` is `{ applied: false, reason: 'not-applied' }`.
   */
  readonly precomputedShim?: { applied: boolean; reason: string };
}

/**
 * Pure function. Imports every enabled ecosystem package, calls its default
 * export on `pi`, and returns a structured report. Never throws.
 */
export async function mountUpUpEcosystemPackages(
  pi: ExtensionAPI,
  options: MountEcosystemOptions = {},
): Promise<EcosystemMountReport> {
  // Shim status is computed in the runner that owns lifecycle; tests can
  // pre-apply via `applyProperLockfileBunShim()` and pass the result through
  // here so the report reflects what really happened.
  const properLockfileShim = options.precomputedShim ?? { applied: false, reason: 'not-applied' };
  const importer = options.importer ?? defaultImporter;
  const enabled = options.enabled;
  const mountUnverified = options.mountUnverified ?? true;
  const now = options.now ?? (() => Date.now());

  const mounted: string[] = [];
  const skippedToolConflict: { name: string; importPath: string; conflicts: readonly string[] }[] = [];
  const skippedAlreadyLoaded: { name: string; importPath: string; reason: string }[] = [];
  const piLoadedPackages = options.piLoadedPackages ?? readPiLoadedPackageNames();
  const verifiedDirty: string[] = [];
  const importFailed: { name: string; importPath: string; error: string }[] = [];
  const notCallable: { name: string; importPath: string; actualType: string }[] = [];
  const mountThrew: { name: string; importPath: string; error: string }[] = [];
  const outcomes: EcosystemMountOutcome[] = [];
  const resolvedSpecifiers: Record<string, string> = {};

  for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
    if (enabled && !enabled.has(pkg.name)) continue;
    if (!pkg.verifiedClean && !mountUnverified) {
      outcomes.push({ kind: 'verified_dirty', name: pkg.name, importPath: pkg.importPath });
      verifiedDirty.push(pkg.name);
      continue;
    }

    // Pi's package manager may already have loaded this package from
    // `<agentDir>/settings.json#packages`; mounting it a second time produces
    // duplicate tools, which Pi escalates to a fatal extension-load error.
    if (piLoadedPackages.has(pkg.name)) {
      const reason = `already declared in ${UPUP_PI_SETTINGS_RELATIVE}/settings.json#packages`;
      outcomes.push({ kind: 'skipped_already_loaded', name: pkg.name, importPath: pkg.importPath, reason });
      skippedAlreadyLoaded.push({ name: pkg.name, importPath: pkg.importPath, reason });
      continue;
    }

    // Pi rejects the whole extension on a duplicate tool name, which would
    // take down every other ecosystem package mounted through this entry
    // point. Detect the collision here against the tools already registered
    // on `pi` and skip just this package instead.
    // Combine the package's declared tools from the static `registersTools`
    // claim with a fresh grep of its source on disk. The static claim is
    // authoritative for tools the package exposes via a custom hook or a
    // pre-built bundle; the grep catches everything else. A package whose
    // declared set is empty (e.g. `rolebox`, which registers its tools from
    // `<agentDir>/rolebox/roles/*.json`) skips the conflict check entirely.
    const staticDeclared = pkg.registersTools ?? [];
    const sourceDir = resolvePackageSourceDir(pkg, importer);
    const sourceDeclared = declaredToolNames(sourceDir);
    const declaredTools = staticDeclared.length > 0 ? staticDeclared : [...sourceDeclared];
    if (declaredTools.length > 0) {
      const owned = registeredToolNames(pi);
      const conflicts = declaredTools.filter((tool) => owned.has(tool));
      if (conflicts.length > 0) {
        outcomes.push({ kind: 'skipped_tool_conflict', name: pkg.name, importPath: pkg.importPath, conflicts });
        skippedToolConflict.push({ name: pkg.name, importPath: pkg.importPath, conflicts });
        continue;
      }
    }

    // Pi's authoritative entry point is `pi.extensions`, not the npm main
    // entry. Two shapes this has to handle:
    //   1. A package whose npm entry is a plain library (`pi-esr`: 22 named
    //      exports, no default) while the factory lives elsewhere.
    //   2. A package that declares a *directory* (`pi-brainstorm`:
    //      `pi.extensions: ["./extensions"]`), which Pi expands into every
    //      extension inside it, not one.
    //
    // Entries are resolved per root so a package mounts from exactly one
    // scope: a `~/.upup/agent/npm` copy shadows the bundled one, and mounting
    // both would register every tool twice.
    const groups = resolvePiExtensionEntriesByRoot(pkg.name);
    const attemptGroups: readonly (readonly string[])[] = groups.length > 0
      ? groups.map((group) => (group.entries.length > 0 ? group.entries : [pkg.importPath]))
      : [[pkg.importPath]];

    let resolvedSpecifier: string | undefined;
    let importError: unknown;
    let lastActedType: unknown;

    for (const specifiers of attemptGroups) {
      // Per-root isolation: Pi treats each file in a declared extensions
      // directory as an independent extension, so one broken entry must not
      // prevent its 21 siblings from mounting. Entry-level failures are
      // collected and reported, then the package still counts as mounted when
      // at least one factory ran.
      const mountedEntries: string[] = [];
      const entryFailures: { specifier: string; error: string }[] = [];
      let factoriesSeen = false;

      for (const specifier of specifiers) {
        let mod: unknown;
        try {
          mod = await importer(specifier);
        } catch (error) {
          if (importError === undefined) importError = error;
          entryFailures.push({ specifier, error: error instanceof Error ? error.message : String(error) });
          continue;
        }
        const maybeDefault = (mod as { default?: unknown })?.default;
        if (typeof maybeDefault !== 'function') {
          // Loaded but not a factory: Pi extensions are `export default (pi) => …`.
          if (lastActedType === undefined) lastActedType = maybeDefault;
          entryFailures.push({ specifier, error: `default export is ${maybeDefault === undefined ? 'undefined' : typeof maybeDefault}` });
          continue;
        }
        factoriesSeen = true;
        try {
          (maybeDefault as (pi: ExtensionAPI) => void)(pi);
          mountedEntries.push(specifier);
        } catch (error) {
          entryFailures.push({ specifier, error: error instanceof Error ? error.message : String(error) });
        }
      }

      if (mountedEntries.length > 0) {
        // This root supplied the entry set; stop before the shadowed copy.
        resolvedSpecifier = mountedEntries[0]!;
        mounted.push(pkg.name);
        resolvedSpecifiers[pkg.name] = mountedEntries.join(',');
        outcomes.push({ kind: 'mounted', name: pkg.name, importPath: pkg.importPath, resolvedSpecifier: resolvedSpecifier });
        for (const failure of entryFailures) {
          const msg = `${failure.specifier}: ${failure.error}`;
          outcomes.push({ kind: 'mount_threw', name: pkg.name, importPath: pkg.importPath, error: msg });
          mountThrew.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
        }
        break;
      }

      if (factoriesSeen) {
        // A factory imported but every one threw; report and keep this root's
        // verdict rather than silently trying the next scope.
        resolvedSpecifier = specifiers[0];
        for (const failure of entryFailures) {
          const msg = `${failure.specifier}: ${failure.error}`;
          outcomes.push({ kind: 'mount_threw', name: pkg.name, importPath: pkg.importPath, error: msg });
          mountThrew.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
        }
        break;
      }

      // Nothing importable from this root — remember why and try the next one.
      if (entryFailures.length > 0) importError = new Error(entryFailures[0]!.error);
    }

    if (resolvedSpecifier === undefined) {
      // Distinguish "could not even import" from "imported but not a Pi
      // extension factory" — the two need different operator responses.
      if (lastActedType !== undefined) {
        const actualType = lastActedType === undefined ? 'undefined' : typeof lastActedType;
        outcomes.push({ kind: 'not_callable', name: pkg.name, importPath: pkg.importPath, actualType });
        notCallable.push({ name: pkg.name, importPath: pkg.importPath, actualType });
      } else {
        const msg = importError instanceof Error ? importError.message : String(importError ?? 'no importable extension entry');
        outcomes.push({ kind: 'import_failed', name: pkg.name, importPath: pkg.importPath, error: msg });
        importFailed.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
      }
    }
  }

  return {
    mounted,
    skippedToolConflict,
    skippedAlreadyLoaded,
    verifiedDirty,
    importFailed,
    notCallable,
    mountThrew,
    resolvedSpecifiers,
    outcomes,
    properLockfileShim,
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
export function createUpUpEcosystemExtension(options: MountEcosystemOptions = {}): (pi: ExtensionAPI) => Promise<void> {
  return async (pi: ExtensionAPI): Promise<void> => {
    const runner = async (): Promise<EcosystemMountReport> => {
      // Bun runtime guard: proper-lockfile@4.1.2 caches mtime precision on
      // the `fs` object via `Object.defineProperty(fs, cacheSymbol, { value })`
      // (non-configurable + non-writable), and Bun's `internal/shared#guarded`
      // Proxy on native fs bindings rejects the second read with a
      // "Proxy handler's 'get' result ..." invariant violation. The first
      // interactive prompt succeeds, every subsequent one — including the
      // second conversation's `/goal`, any `/invest`, any tool call routed
      // through pi-llmgates-provider's input-history writer — crashes pi with
      // an uncaughtException. Apply the shim BEFORE any ecosystem package is
      // imported, so the cached `probe` reference pi-llmgates-provider
      // captures at import time is already the patched one. See
      // `./proper-lockfile-bun-shim.ts` for the full diagnosis.
      const shimResult = await applyProperLockfileBunShim();
      const fallback = (message: string): EcosystemMountReport => ({
        mounted: [],
        skippedToolConflict: [],
        skippedAlreadyLoaded: [],
        verifiedDirty: [],
        importFailed: [],
        notCallable: [],
        mountThrew: [{ name: '<runner>', importPath: '<runner>', error: message }],
        resolvedSpecifiers: {},
        outcomes: [{ kind: 'mount_threw', name: '<runner>', importPath: '<runner>', error: message }],
        properLockfileShim: shimResult,
        at: Date.now(),
      });
      const report = await mountUpUpEcosystemPackages(pi, { ...options, precomputedShim: shimResult }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return fallback(message);
      });
      try {          const mod = await import('./finance-subagents');          const { registerUpUpFinanceSubagents } = mod;          await registerUpUpFinanceSubagents(pi);        } catch { /* intentional: failure isolation per ecosystem-extension rules; failures are aggregated into the surrounding report. */ }
      try {
          const { registerUpUpResearchDag } = await import('./research-dag');          await registerUpUpResearchDag(pi);        } catch { /* intentional: failure isolation per ecosystem-extension rules; failures are aggregated into the surrounding report. */ }
      try {
          const { mountUpUpTuiWidgets } = await import('./tui-widgets-mount');          mountUpUpTuiWidgets(pi);        } catch { /* intentional: failure isolation per ecosystem-extension rules; failures are aggregated into the surrounding report. */ }
      // SOP → Pi workflow-resource bridge is wired by @upup/pi-app at boot
      // (it owns the import of @upup/pi-investment-workflow). We do not
      // import it here to keep the runtime -> workflow dependency edge one-way
      // and avoid a workspace cycle (pi-investment-workflow -> pi-runtime).
      
      return report;
    };
    // Pi's `ExtensionFactory` is `(pi) => void | Promise<void>`, and its
    // loader `await`s the returned value before emitting `session_start`.
    // The mount used to be fire-and-forget (`void runner()`), which meant
    // every async-mounted ecosystem package (pi-subagents in particular)
    // registered its `session_start` handler *after* the event had already
    // fired. pi-subagents then kept `state.currentSessionId === null` for the
    // whole run and threw on `agent_end`
    // ("Cannot auto-drain background work without an active session identity").
    // Returning the promise makes Pi wait, so the handlers exist in time.
    await runner();
  };
}

/** Convenience: summarise a mount report as a one-line string for `report:pi7`. */
export function summariseEcosystemReport(report: EcosystemMountReport): string {
  const parts: string[] = [];
  parts.push(`mounted=${report.mounted.length}`);
  if (report.skippedToolConflict.length > 0) parts.push(`skippedToolConflict=${report.skippedToolConflict.length}`);
  if (report.skippedAlreadyLoaded.length > 0) parts.push(`skippedAlreadyLoaded=${report.skippedAlreadyLoaded.length}`);
  if (report.verifiedDirty.length > 0) parts.push(`verifiedDirty=${report.verifiedDirty.length}`);
  if (report.importFailed.length > 0) parts.push(`importFailed=${report.importFailed.length}`);
  if (report.notCallable.length > 0) parts.push(`notCallable=${report.notCallable.length}`);
  if (report.mountThrew.length > 0) parts.push(`mountThrew=${report.mountThrew.length}`);
  // Surface proper-lockfile Bun shim status so `report:pi7` / `upup doctor`
  // can show whether the second-conversation crash guard is armed.
  if (report.properLockfileShim.applied) {
    parts.push(`bunLockfileShim=${report.properLockfileShim.reason}`);
  } else if (report.properLockfileShim.reason !== 'not-applied') {
    parts.push(`bunLockfileShim=skipped:${report.properLockfileShim.reason}`);
  }
  return parts.join(' ');
}

/** Re-export for downstream packages that want to enumerate categories. */
export type { UpUpEcosystemPackage };

/**
 * Tool names UpUp's own Pi extensions register.
 *
 * Kept as a literal rather than a runtime scan because the ecosystem mount runs
 * inside Pi's extension-loading pass, where neither `pi.getAllTools()` nor a
 * filesystem walk of `packages/&#42;/extensions` is available. Gate:
 * `ecosystem-extension.test.ts` cross-checks this list against the
 * `name: '…'` literals in every workspace `extensions/` directory, so a new
 * UpUp tool without a matching entry fails the suite instead of silently
 * producing a duplicate at runtime.
 */
export const UPUP_HOST_RESERVED_TOOL_NAMES: readonly string[] = [
  'add_plan_step', 'add_position', 'add_position_multi', 'add_to_watchlist',
  'add_watchlist_alert', 'agent', 'agent_memory', 'analyze_sentiment',
  'ask_confirm', 'ask_input', 'ask_multi_select', 'ask_response',
  'ask_select', 'backtest_dca', 'backtest_evaluate_trade', 'backtest_lumpsum',
  'backtest_run', 'backtest_threshold', 'backtest_win_rate', 'calculate_alpha',
  'calculate_correlation', 'calculate_correlation_matrix', 'calculate_kelly', 'calculate_max_drawdown',
  'calculate_mean_variance', 'calculate_risk_parity', 'calculate_sharpe', 'calculate_short_interest_ratio',
  'calculate_sortino', 'calculate_var', 'calculate_win_rate', 'check_trading_day',
  'check_watchlist_alerts', 'clear_watchlist_alert', 'compare_data_sources', 'compare_to_benchmark',
  'convert_currency', 'create_portfolio', 'create_todo', 'create_worktree',
  'cron', 'delete_portfolio', 'delete_todo', 'detect_events',
  'detect_short_squeeze', 'earnings_preview', 'edit_file', 'enter_plan_mode',
  'evaluate_trade', 'execute_skill', 'exit_plan_mode', 'export_data',
  'export_portfolio', 'export_watchlist', 'extract_entities', 'fork_subagent',
  'get_astock_price', 'get_backtest_summary', 'get_exchange_rate', 'get_market_data',
  'get_market_structure', 'get_next_trading_day', 'get_portfolio', 'get_portfolio_multi',
  'get_sector_data', 'get_short_interest', 'get_skill', 'get_technical_data',
  'get_trading_days', 'get_upcoming_holidays', 'get_watchlist', 'glob',
  'grep', 'heartbeat', 'invest_workflow', 'invest_workflow_phase',
  'kairos_summary', 'list_agents', 'list_benchmarks', 'list_currencies',
  'list_mcp_resources', 'list_plan_steps', 'list_portfolios', 'list_skills',
  'list_todos', 'list_worktree', 'lsp_complete', 'lsp_definition',
  'lsp_diagnostics', 'lsp_hover', 'lsp_references', 'market_data_history',
  'market_data_provider_health', 'market_data_provider_sla', 'market_data_provider_trend', 'market_data_quote',
  'market_trading_day', 'mcp_auth_clear', 'mcp_auth_get', 'mcp_auth_set',
  'memory_get', 'memory_search', 'memory_update', 'monitor',
  'notebook_create', 'notebook_delete_cell', 'notebook_edit_cell', 'notebook_insert_cell',
  'notebook_read', 'portfolio_attribution', 'portfolio_brinson_attribution', 'portfolio_sector_attribution',
  'portfolio_style_attribution', 'read_file', 'read_mcp_resource', 'realtime_list_subscriptions',
  'realtime_subscribe', 'realtime_unsubscribe', 'remove_from_watchlist', 'remove_position',
  'remove_position_multi', 'remove_worktree', 'research_deep_search', 'resume_agent',
  'run_backtest', 'run_builtin_agent', 'run_workflow', 'score_data_source',
  'screen_astocks', 'search_skills', 'send_message', 'send_user_file',
  'skill', 'skill_info', 'sleep', 'snip_tool',
  'stock_screener', 'swarm_agent_message', 'swarm_agent_results', 'swarm_agent_spawn',
  'swarm_team_create', 'swarm_team_list', 'switch_portfolio', 'task_create',
  'task_get', 'task_list', 'task_result', 'task_stop',
  'task_update', 'tool_get', 'tool_list', 'tool_search',
  'track_risk', 'update_plan_step', 'update_position', 'update_todo',
  'web_fetch', 'web_search', 'write_file', 'x_search',
  'ask_user_question', 'bg_wait', 'mcp', 'mcpScript',
  // `subagent` is owned by `pi-subagents` (loaded via `<agentDir>/settings.json#packages`
  // before UpUp's ecosystem extension runs). Declaring it here makes the conflict pre-check
  // skip `@arhen/pi-core-subagent` (which also registers `subagent`) without us having to
  // query `pi.getAllTools()`, which Pi refuses to answer during extension loading.
  'subagent',
];

/** Historical alias for `UPUP_HOST_RESERVED_TOOL_NAMES`. */
export const UPUP_OWNED_TOOL_NAMES: readonly string[] = UPUP_HOST_RESERVED_TOOL_NAMES;
