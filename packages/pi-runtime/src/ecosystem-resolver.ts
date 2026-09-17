/**
 * Dual-scope Pi ecosystem package resolver.
 *
 * Why this exists:
 *   `upup plugin install npm:<pkg>` writes the package into the UpUp home
 *   (`~/.upup/agent/npm/node_modules/<pkg>`) because that is where Pi's own
 *   `DefaultPackageManager` installs user-scope packages. The runtime, however,
 *   loaded ecosystem packages with a bare `import(specifier)`, which resolves
 *   from *this repository's* `node_modules`. The two never met: a plugin the
 *   user downloaded was physically on disk yet invisible to the session.
 *
 *   This module is the single resolution point. It walks a fixed precedence
 *   list — user agent dir first, then the bundled workspace — and returns the
 *   first hit, so "download to `~/.upup`" is what actually takes effect and an
 *   override in the user home wins over the version UpUp shipped with.
 *
 * Precedence (highest first):
 *   1. `options.roots`        — explicit caller override (tests, embedding)
 *   2. `$UPUP_HOME/agent/npm` — where `upup plugin install` lands
 *      (relocated by `$UPUP_HOME`, `$UPUP_AGENT_DIR`, `$PI_CODING_AGENT_DIR`)
 *   3. bundled workspace      — this repo's `node_modules`, for the shipped set
 *
 * Every resolution is total: a miss returns `undefined` rather than throwing,
 * so a half-installed plugin degrades to the bundled copy instead of aborting
 * the session.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Environment variable that relocates the UpUp home root. */
const UPUP_HOME_ENV = 'UPUP_HOME';

/** Subdirectory of the agent dir where Pi's package manager installs npm packages. */
const AGENT_NPM_DIRNAME = 'npm';

export interface EcosystemResolveOptions {
  /** Caller-supplied environment (defaults to `process.env`). */
  readonly env?: NodeJS.ProcessEnv;
  /** Caller-supplied home directory (defaults to `os.homedir()`). */
  readonly home?: string;
  /** Explicit resolution roots; wins over every derived root. */
  readonly roots?: readonly string[];
  /** Repository / workspace root that holds the bundled `node_modules`. */
  readonly bundledRoot?: string;
}

/**
 * Resolve the directory holding user-installed Pi npm packages.
 *
 * Mirrors Pi's own precedence so the resolver and `upup plugin install`
 * always agree on one location: `UPUP_AGENT_DIR` → `UPUP_CODING_AGENT_DIR` →
 * `PI_CODING_AGENT_DIR` → `<home>/.upup/agent`. `$UPUP_HOME` relocates the
 * whole home when the more specific overrides are absent.
 */
export function resolveEcosystemNpmRoot(options: EcosystemResolveOptions = {}): string {
  const env = options.env ?? process.env;
  const home = options.home ?? env.HOME ?? homedir();
  const explicit =
    env.UPUP_AGENT_DIR?.trim() ||
    env.UPUP_CODING_AGENT_DIR?.trim() ||
    env.PI_CODING_AGENT_DIR?.trim();
  const agentDir = explicit
    ? resolve(explicit.replace(/^~(?=\/|$)/, home))
    : join(resolve(env[UPUP_HOME_ENV]?.trim() || join(home, '.upup')), 'agent');
  return join(agentDir, AGENT_NPM_DIRNAME);
}

/**
 * The ordered list of roots a specifier is resolved against.
 * User-installed packages shadow the bundled ones, which is what lets a user
 * pin a newer `pi-web-access` without touching the workspace.
 */
export function ecosystemResolveRoots(options: EcosystemResolveOptions = {}): readonly string[] {
  if (options.roots) return options.roots;
  const bundled = options.bundledRoot ?? process.cwd();
  return [resolveEcosystemNpmRoot(options), bundled];
}

/**
 * Resolve a bare specifier (or a package subpath) to an absolute file path.
 * Returns `undefined` when no root carries the package, and never throws.
 */
export function resolveEcosystemSpecifier(
  specifier: string,
  options: EcosystemResolveOptions = {},
): string | undefined {
  for (const root of ecosystemResolveRoots(options)) {
    // Anchoring on `<root>/<sentinel>` makes Node's `node_modules` lookup
    // start at `<root>/node_modules`, which is exactly the install layout
    // Pi produces. The sentinel never has to exist on disk.
    const anchor = join(root, '__upup_ecosystem_resolver__.js');
    try {
      return createRequire(anchor).resolve(specifier);
    } catch {
      // Try the next root; a miss in the user home is the common case for
      // every package UpUp ships with.
    }
  }
  return undefined;
}

/** True when `specifier` resolves from any root, i.e. the package is loadable. */
export function ecosystemSpecifierExists(
  specifier: string,
  options: EcosystemResolveOptions = {},
): boolean {
  return resolveEcosystemSpecifier(specifier, options) !== undefined;
}

/**
 * Build an importer that resolves every specifier through the dual-scope
 * roots and then hands the absolute path to the platform loader.
 *
 * `load` is injected so tests can observe the resolution without touching
 * `node_modules`; production passes Bun's `import`.
 */
export function createEcosystemImporter(
  load: (href: string) => Promise<unknown> = defaultLoad,
  options: EcosystemResolveOptions = {},
): (specifier: string) => Promise<unknown> {
  return async (specifier: string): Promise<unknown> => {
    const resolved = resolveEcosystemSpecifier(specifier, options);
    // Falling back to the bare specifier preserves the pre-existing behaviour
    // (and its error message) for a package that is genuinely absent.
    return load(resolved ?? specifier);
  };
}

async function defaultLoad(specifier: string): Promise<unknown> {
  // A resolved path is absolute and may carry a Windows drive letter, so the
  // `file:` URL form is the only portable input for the loader.
  if (specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier)) {
    const { pathToFileURL } = await import('node:url');
    return import(pathToFileURL(specifier).href);
  }
  return import(specifier);
}

/**
 * Describe where a specifier would load from, for `upup doctor` / `report:pi7`
 * diagnostics. `scope` distinguishes a user-downloaded override from the
 * bundled copy — the single fact needed to debug "I installed it but it did
 * not load".
 */
export function describeEcosystemResolution(
  specifier: string,
  options: EcosystemResolveOptions = {},
): { readonly resolved: string | undefined; readonly scope: 'user' | 'bundled' | 'missing'; readonly root: string | undefined } {
  const roots = ecosystemResolveRoots(options);
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const anchor = join(root, '__upup_ecosystem_resolver__.js');
    try {
      const resolved = createRequire(anchor).resolve(specifier);
      return { resolved, scope: index === 0 ? 'user' : 'bundled', root };
    } catch {
      // next root
    }
  }
  return { resolved: undefined, scope: 'missing', root: undefined };
}

/** True when a path exists on disk; exported so callers share one probe. */
export function ecosystemPathExists(path: string): boolean {
  return existsSync(path);
}
