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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

function tryResolveWithRequire(anchor: string, specifier: string): string | undefined {
  try {
    return createRequire(anchor).resolve(specifier);
  } catch {
    return undefined;
  }
}

/**
 * `Bun.resolveSync` honors every `exports` condition (including `"import"`),
 * which CJS's `createRequire` skips. Some Pi ecosystem packages — currently
 * `@quintinshaw/pi-dynamic-workflows` — ship `"import"` only and would be
 * invisible to a pure CJS lookup. The resolver is Bun-only by design (the
 * rest of the runtime is too) so the fallback is always safe to call.
 */
function tryResolveWithBun(root: string, specifier: string): string | undefined {
  const bun = (globalThis as { Bun?: { resolveSync(specifier: string, root: string): string } }).Bun;
  if (!bun) return undefined;
  try {
    return bun.resolveSync(specifier, root);
  } catch {
    return undefined;
  }
}

/**
 * Split a bare specifier into its package name and subpath.
 *
 * `@scope/pkg/sub/deep` → `{ name: '@scope/pkg', subpath: 'sub/deep' }`;
 * `pkg` → `{ name: 'pkg', subpath: '' }`. A scoped name always consumes the
 * first two segments, which is what makes `@scope/pkg` itself distinguishable
 * from a subpath.
 */
export function splitEcosystemSpecifier(specifier: string): { name: string; subpath: string } {
  const segments = specifier.split('/');
  const name = specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? specifier);
  return { name, subpath: specifier.slice(name.length).replace(/^\//, '') };
}

/**
 * Pick the first usable target out of an `exports` entry.
 *
 * Node evaluates `exports` conditions in *object key order* and stops at the
 * first key the environment understands. UpUp walks a fixed preference list
 * instead, because the loader here is always Bun's: `bun` is authoritative
 * where a package declares it (several Pi ecosystem packages point it at
 * TypeScript source), then the ESM `import`/`node`/`default` chain. A
 * `types` target is skipped outright — it names a `.d.ts`, which loads fine
 * but exports nothing at runtime.
 */
function pickExportsTarget(node: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    // An array is a fallback list; a target that turns out unusable falls
    // through to the next entry, which is why misses return `undefined`
    // rather than throwing.
    for (const candidate of node) {
      const picked = pickExportsTarget(candidate, depth + 1);
      if (picked !== undefined) return picked;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  for (const condition of ['bun', 'import', 'node', 'default', 'require']) {
    if (!Object.prototype.hasOwnProperty.call(record, condition)) continue;
    const picked = pickExportsTarget(record[condition], depth + 1);
    if (picked !== undefined) return picked;
  }
  return undefined;
}

/**
 * Resolve `<pkgDir>` + subpath through the package's own `exports` map.
 *
 * Why this exists alongside `createRequire` / `Bun.resolveSync`:
 *   A `bun --compile` standalone binary resolves *subpath* specifiers from
 *   `/$bunfs/root/<binary>` and fails outright — the manifest is on disk but
 *   the embedded resolver refuses to open it, so `pi-subagents/agents`,
 *   `pi-subagents/workflow-resources` and `rolebox/pi` all report
 *   "Cannot find package". The bare package name still resolves, which is
 *   exactly the asymmetry that made this fail in the shipped binary while
 *   `bun run` stayed green. Reading the manifest directly sidesteps the
 *   embedded resolver: the target is an ordinary file path, and importing it
 *   by absolute URL works in both modes.
 *
 * `main` covers subpath-less lookups for a package with no `exports` field.
 */
export function resolveEcosystemSubpathInDir(pkgDir: string, subpath: string): string | undefined {
  const manifestPath = join(pkgDir, 'package.json');
  if (!existsSync(manifestPath)) return undefined;
  let manifest: { exports?: unknown; main?: string };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as typeof manifest;
  } catch {
    return undefined;
  }

  const key = subpath === '' ? '.' : `./${subpath}`;
  const exportsField = manifest.exports;
  let target: string | undefined;

  if (typeof exportsField === 'string') {
    // `"exports": "./index.js"` only ever describes the package root.
    target = key === '.' ? exportsField : undefined;
  } else if (exportsField && typeof exportsField === 'object') {
    const map = exportsField as Record<string, unknown>;
    const isSubpathMap = Object.keys(map).some((entry) => entry === '.' || entry.startsWith('./'));
    if (isSubpathMap) {
      target = pickExportsTarget(map[key]);
    } else if (key === '.') {
      // A bare conditions object (`{ "import": "./dist/index.js" }`) is
      // shorthand for the `.` entry.
      target = pickExportsTarget(map);
    }
  }

  // No `exports` map (or no matching key) — fall back to `main` so a legacy
  // CommonJS-style package still resolves from the manifest.
  if (target === undefined && key === '.' && typeof manifest.main === 'string') {
    target = manifest.main;
  }
  if (target === undefined) return undefined;

  const absolute = resolve(pkgDir, target);
  return existsSync(absolute) ? absolute : undefined;
}

/**
 * Resolve a specifier through each root's `node_modules` on disk, reading the
 * package manifest directly. Returns `undefined` when no root carries it.
 *
 * This is the fallback path for environments where the platform resolver is
 * unavailable or unreliable — most importantly a compiled Bun binary.
 */
export function resolveEcosystemSpecifierFromManifests(
  specifier: string,
  options: EcosystemResolveOptions = {},
): string | undefined {
  for (const root of ecosystemResolveRoots(options)) {
    const resolved = resolveSpecifierInRootFromManifest(root, specifier);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
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
    const resolved = resolveSpecifierInRoot(root, specifier);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/**
 * One root's resolution chain, shared by `resolveEcosystemSpecifier` and
 * `describeEcosystemResolution` so a diagnostic can never disagree with what
 * the importer would actually load.
 *
 * Order:
 *   1. CJS `createRequire`  — honors `require`/`default` conditions.
 *   2. `Bun.resolveSync`    — the only path that honors `bun`/`import`-only
 *      `exports` blocks (`@quintinshaw/pi-dynamic-workflows`).
 *   3. Manifest walk        — the fallback that keeps *subpath* specifiers
 *      resolvable inside a compiled Bun binary, where steps 1 and 2 both
 *      refuse to open an `exports` map for a subpath.
 */
function resolveSpecifierInRoot(root: string, specifier: string): string | undefined {
  // Anchoring on `<root>/<sentinel>` makes Node's `node_modules` lookup
  // start at `<root>/node_modules`, which is exactly the install layout
  // Pi produces. The sentinel never has to exist on disk.
  const anchor = join(root, '__upup_ecosystem_resolver__.js');
  const cjs = tryResolveWithRequire(anchor, specifier);
  if (cjs !== undefined) return cjs;
  const esm = tryResolveWithBun(root, specifier);
  if (esm !== undefined) return esm;
  return resolveSpecifierInRootFromManifest(root, specifier);
}

/** Step 3 of {@link resolveSpecifierInRoot}: read `<root>`'s manifest directly. */
function resolveSpecifierInRootFromManifest(root: string, specifier: string): string | undefined {
  const { name, subpath } = splitEcosystemSpecifier(specifier);
  const pkgDir = join(root, 'node_modules', name);
  if (!existsSync(join(pkgDir, 'package.json'))) return undefined;
  return resolveEcosystemSubpathInDir(pkgDir, subpath);
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
 *
 * Scope fallback on evaluation failure:
 *   `upup plugin install` writes a package into the UpUp home without its
 *   peer dependencies; only the bundled copy sits next to
 *   `@earendil-works/pi-coding-agent`. A user-scope copy therefore resolves
 *   *and then dies on import* with `Cannot find package
 *   '@earendil-works/pi-coding-agent'`. Picking the first root that merely
 *   *resolves* would silently disable the package for that user, so we walk
 *   the remaining roots and keep the first copy that actually loads. The
 *   last error is rethrown when no root loads, so the diagnostic still names
 *   the package that failed.
 */
export function createEcosystemImporter(
  load: (href: string) => Promise<unknown> = defaultLoad,
  options: EcosystemResolveOptions = {},
): (specifier: string) => Promise<unknown> {
  return async (specifier: string): Promise<unknown> => {
    const roots = ecosystemResolveRoots(options);
    let lastError: unknown;
    let attempted = false;
    for (const root of roots) {
      const resolved = resolveEcosystemSpecifier(specifier, { ...options, roots: [root] });
      if (resolved === undefined) continue;
      attempted = true;
      try {
        return await load(resolved);
      } catch (error) {
        lastError = error;
      }
    }
    if (attempted) throw lastError;
    // Falling back to the bare specifier preserves the pre-existing behaviour
    // (and its error message) for a package that is genuinely absent.
    return load(specifier);
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
    const resolved = resolveSpecifierInRoot(root, specifier);
    if (resolved !== undefined) {
      return { resolved, scope: index === 0 ? 'user' : 'bundled', root };
    }
  }
  return { resolved: undefined, scope: 'missing', root: undefined };
}

/**
 * Candidate file names tried when a `pi.extensions` entry (or a nested
 * folder inside one) points at a directory rather than a file.
 */
const EXTENSION_ENTRY_INDEX_NAMES = ['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'index.cjs'] as const;

/**
 * Mirrors Pi's `resolveExtensionEntries`: an explicit `pi.extensions`
 * declaration in `<dir>/package.json`, else `<dir>/index.ts`, else
 * `<dir>/index.js`. Returns `null` when the directory declares nothing, which
 * is Pi's signal to fall through to content discovery.
 */
function resolveExtensionEntriesInDir(dir: string): string[] | null {
  const manifestPath = join(dir, 'package.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi?: { extensions?: unknown } };
      const declared = manifest.pi?.extensions;
      if (Array.isArray(declared) && declared.length > 0) {
        const entries = declared
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => resolve(dir, entry))
          .filter((entry) => existsSync(entry));
        if (entries.length > 0) return entries;
      }
    } catch {
      /* A malformed manifest falls through to the index probe, as Pi does. */
    }
  }
  const indexTs = join(dir, 'index.ts');
  if (existsSync(indexTs)) return [indexTs];
  const indexJs = join(dir, 'index.js');
  if (existsSync(indexJs)) return [indexJs];
  return null;
}

/**
 * Mirrors Pi's `collectAutoExtensionEntries`: a declared directory expands to
 * *every* extension it contains, not to a single entry.
 *
 * Why this matters: `@plannotator/pi-extension` declares
 * `pi.extensions: ["./"]`, i.e. the package root itself; `pi-brainstorm`,
 * `pi-web-ui` and `pi-conductor` declare a small `./extensions` folder. Pi
 * expands every one of them into each `.ts` it contains. Treating the
 * declaration as a single entry would mount only the first file and silently
 * drop the rest.
 *
 * Rule (identical to Pi's):
 *   - a `.ts` / `.js` file is an entry;
 *   - a subdirectory contributes its own explicit entries, or its `index.ts`
 *     / `index.js`, and is otherwise skipped;
 *   - dotted names and `node_modules` are ignored.
 */
function collectExtensionEntriesInDir(dir: string): readonly string[] {
  const rootEntries = resolveExtensionEntriesInDir(dir);
  if (rootEntries !== null) return rootEntries;
  const entries: string[] = [];
  let dirEntries: import('node:fs').Dirent[];
  try {
    dirEntries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const entry of dirEntries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = join(dir, entry.name);
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const stats = statSync(fullPath);
        isDirectory = stats.isDirectory();
        isFile = stats.isFile();
      } catch {
        continue;
      }
    }
    if (isFile && /\.(ts|js)$/.test(entry.name)) {
      entries.push(fullPath);
    } else if (isDirectory) {
      const nested = resolveExtensionEntriesInDir(fullPath);
      if (nested !== null) entries.push(...nested);
    }
  }
  return entries;
}

/**
 * Locate every `<root>/node_modules/<name>` on disk, highest precedence first.
 *
 * Why not `resolveEcosystemSpecifier`: a package such as `pi-crew` ships
 * `pi.extensions: ["./index.ts"]` but no `.`-export at all, so its *root*
 * specifier is unresolvable even though the package is fully installed and its
 * declared extension entry loads fine. Walking the documented npm install
 * layout finds the manifest the resolver cannot.
 *
 * Every root is returned — not just the first hit — because a user-scope copy
 * installed by `upup plugin install` is written without peer dependencies and
 * can therefore resolve yet fail to evaluate. Callers walk the list and keep
 * the first copy that actually imports.
 */
export function findEcosystemPackageDirs(
  name: string,
  options: EcosystemResolveOptions = {},
): readonly { readonly dir: string; readonly root: string; readonly scope: 'user' | 'bundled' }[] {
  const roots = ecosystemResolveRoots(options);
  const found: { dir: string; root: string; scope: 'user' | 'bundled' }[] = [];
  for (let index = 0; index < roots.length; index += 1) {
    const dir = join(roots[index], 'node_modules', name);
    if (existsSync(join(dir, 'package.json'))) {
      found.push({ dir, root: roots[index], scope: index === 0 ? 'user' : 'bundled' });
    }
  }
  return found;
}

/** First root that carries the package, or `undefined` when none does. */
export function findEcosystemPackageDir(
  name: string,
  options: EcosystemResolveOptions = {},
): { readonly dir: string; readonly root: string; readonly scope: 'user' | 'bundled' } | undefined {
  return findEcosystemPackageDirs(name, options)[0];
}

/**
 * Resolve a package's `pi.extensions` declarations to importable file paths.
 *
 * Pi's extension contract is `default(pi)` living at the path a package
 * declares under `pi.extensions` — *not* necessarily at its npm main entry.
 * Two shapes UpUp has to support:
 *
 *   1. Extension-only packages (`pi-esr`) whose npm entry is a plain library
 *      with named exports and no default; only `pi.extensions` carries the
 *      factory.
 *   2. Packages with no `.`-export at all (`pi-crew`).
 *
 * Returns `[]` for a package that declares no extensions, so callers can treat
 * "no entries" and "no manifest" identically.
 */
export function resolvePiExtensionEntries(
  name: string,
  options: EcosystemResolveOptions = {},
): readonly string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const group of resolvePiExtensionEntriesByRoot(name, options)) {
    for (const entry of group.entries) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * One package's declared extension entries, grouped by the root they came from.
 *
 * Grouping matters because a package is loaded from exactly one root — a copy
 * in `~/.upup/agent/npm` shadows the bundled one. Flattening every root's
 * entries would mount both copies of a shadowed package and register its tools
 * twice, which Pi escalates to a fatal duplicate-tool error. Callers walk the
 * groups in precedence order and stop at the first root that loads.
 *
 * A group's `entries` is empty when the package is present but declares no
 * `pi.extensions` (e.g. `pi-web-access`, whose factory is its npm main entry);
 * callers then fall back to `importPath`.
 */
export function resolvePiExtensionEntriesByRoot(
  name: string,
  options: EcosystemResolveOptions = {},
): readonly {
  readonly dir: string;
  readonly root: string;
  readonly scope: 'user' | 'bundled';
  readonly entries: readonly string[];
}[] {
  const groups: { dir: string; root: string; scope: 'user' | 'bundled'; entries: string[] }[] = [];
  for (const found of findEcosystemPackageDirs(name, options)) {
    let manifest: { pi?: { extensions?: unknown } };
    try {
      manifest = JSON.parse(readFileSync(join(found.dir, 'package.json'), 'utf8')) as typeof manifest;
    } catch {
      groups.push({ ...found, entries: [] });
      continue;
    }
    const declared = manifest.pi?.extensions;
    const entries: string[] = [];
    if (Array.isArray(declared)) {
      const seen = new Set<string>();
      for (const raw of declared) {
        if (typeof raw !== 'string') continue;
        const candidate = resolve(found.dir, raw);
        if (!existsSync(candidate)) continue;
        // A declared directory expands to every extension inside it (Pi's
        // `collectAutoExtensionEntries`); a declared file is a single entry.
        const files = statSync(candidate).isDirectory()
          ? collectExtensionEntriesInDir(candidate)
          : [candidate];
        for (const file of files) {
          if (seen.has(file)) continue;
          seen.add(file);
          entries.push(file);
        }
      }
    }
    groups.push({ ...found, entries });
  }
  return groups;
}

/** True when a path exists on disk; exported so callers share one probe. */
export function ecosystemPathExists(path: string): boolean {
  return existsSync(path);
}
