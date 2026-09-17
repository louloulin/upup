#!/usr/bin/env bun
/**
 * check:workspace-exports — every declared `exports` target must actually be built.
 *
 * Why this gate exists
 * --------------------
 * Bun resolves the `"bun"` export condition, so `bun run src/index.tsx`,
 * `bun test` and the whole dev loop keep working even when the `"default"`
 * (dist) targets of a package's `exports` map are never emitted. Pi does not
 * have that luxury: its extension loader imports extension files through jiti,
 * which uses Node resolution and therefore lands on the `"default"` condition
 * (`dist/*.js`). A declared-but-never-built subpath is invisible in dev and
 * fatal in the shipped artifact:
 *
 *     Failed to load extension ".../pi-investment-workflow/extensions/index.ts":
 *     Cannot find module '@upup/pi-resource-composition/agent-dir'
 *
 * `dist/` is gitignored and CI never builds it, so this gate cannot simply stat
 * the artifacts. Instead it models the build itself and asserts every declared
 * target is reachable from a source file the package's own build commands emit:
 *
 *   - `.js` targets are produced by `bun build <entries> --outdir=<dir> [--root=<r>]`,
 *     which writes `<dir>/<entry relative to root>`.
 *   - `.d.ts` targets are produced by `tsc --emitDeclarationOnly`, which writes
 *     `<outDir>/<source path relative to rootDir>`. A `rootDir` that is wider than
 *     the program silently pushes declarations into `dist/src/…` — the target then
 *     exists in neither place the `exports` map promises.
 *
 * Both root causes this gate caught were exactly that: 7 subpaths listed in a
 * build script that never named them, and 5 packages whose `rootDir: "."`
 * relocated every declaration file by one directory.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const PACKAGES = join(ROOT, 'packages');

interface Failure {
  readonly pkg: string;
  readonly target: string;
  readonly reason: string;
}

const failures: Failure[] = [];
const checked: string[] = [];

/** Normalize a path to forward slashes so globs compare against POSIX spellings. */
function toPosix(value: string): string {
  return value.split(sep).join('/');
}

/** Split a `&&`-joined npm script into the individual shell commands. */
function commandsOf(script: string): string[] {
  return script.split('&&').map((part) => part.trim()).filter(Boolean);
}

/** Very small shell tokenizer: enough for `bun build a.ts b.ts --outdir=d`. */
function tokenize(command: string): string[] {
  return command.split(/\s+/).filter(Boolean).map((token) => token.replace(/^['"]|['"]$/g, ''));
}

interface BunBuildCommand {
  readonly entries: readonly string[];
  readonly outdir: string;
  readonly root?: string;
}

interface TscCommand {
  readonly project: string;
  readonly outdir?: string;
}

/** `bun build` flags whose value is a separate argv token. */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--external', '--target', '--format', '--define', '--loader', '--naming',
  '--public-path', '--banner', '--footer', '--drop', '--env', '--feature',
  '--jsx-import-source', '--main-fields', '--metafile-md', '--packages',
  '--production', '--sourcemap', '--splitting', '--minify', '--compile',
]);

/** Parse the `bun build` invocations out of a package's build script. */
function parseBunBuilds(script: string): BunBuildCommand[] {
  const builds: BunBuildCommand[] = [];
  for (const command of commandsOf(script)) {
    const tokens = tokenize(command);
    // Accept both `bun build` and a bare `bun build` reached via `bun run build`.
    const buildIndex = tokens.findIndex((token, index) => token === 'build' && index > 0 && tokens[index - 1] === 'bun');
    if (buildIndex < 0) continue;
    const entries: string[] = [];
    let outdir = 'dist';
    let root: string | undefined;
    for (let index = buildIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      if (token === '--outdir' || token === '-o') {
        outdir = tokens[index + 1] ?? outdir;
        index += 1;
        continue;
      }
      if (token.startsWith('--outdir=')) {
        outdir = token.slice('--outdir='.length);
        continue;
      }
      if (token === '--root') {
        root = tokens[index + 1];
        index += 1;
        continue;
      }
      if (token.startsWith('--root=')) {
        root = token.slice('--root='.length);
        continue;
      }
      // Flags that take a separate argument. Without consuming the value it
      // would be read as an entrypoint (`--external @upup/pi-runtime`).
      if (VALUE_FLAGS.has(token)) {
        index += 1;
        continue;
      }
      if (token.startsWith('-')) continue;
      entries.push(token);
    }
    if (entries.length > 0) builds.push({ entries, outdir, ...(root !== undefined ? { root } : {}) });
  }
  return builds;
}

/** Parse the `tsc` invocations out of a package's build script. */
function parseTscCommands(script: string): TscCommand[] {
  const commands: TscCommand[] = [];
  for (const command of commandsOf(script)) {
    const tokens = tokenize(command);
    if (!tokens.some((token) => token === 'tsc' || token.endsWith('/tsc') || token === 'npx' && tokens.includes('tsc'))) continue;
    let project = 'tsconfig.json';
    let outdir: string | undefined;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      if (token === '--project' || token === '-p') {
        project = tokens[index + 1] ?? project;
        index += 1;
        continue;
      }
      if (token.startsWith('--project=')) {
        project = token.slice('--project='.length);
        continue;
      }
      if (token === '--outDir') {
        outdir = tokens[index + 1];
        index += 1;
        continue;
      }
      if (token.startsWith('--outDir=')) {
        outdir = token.slice('--outDir='.length);
        continue;
      }
    }
    commands.push({ project, ...(outdir !== undefined ? { outdir } : {}) });
  }
  return commands;
}

/**
 * Strip line and block comments from a JSON document without touching string
 * literals. A regex is not enough here: tsconfig path aliases such as the
 * "@/*" alias in the root tsconfig contain a literal block-comment opening and
 * closing pair, and a naive block-comment regex swallows it, leaving invalid
 * JSON behind.
 */
function stripJsonComments(source: string): string {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (inLineComment) {
      if (char === '\n') { inLineComment = false; out += char; }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') { inBlockComment = false; index += 1; }
      continue;
    }
    if (inString) {
      out += char;
      if (char === '\\') { out += next ?? ''; index += 1; continue; }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; out += char; continue; }
    if (char === '/' && next === '/') { inLineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { inBlockComment = true; index += 1; continue; }
    out += char;
  }
  return out;
}

/** Recursively list candidate source files under a package directory. */
function listSourceFiles(packageDir: string, directory = '.', depth = 0): string[] {
  if (depth > 6) return [];
  const absolute = join(packageDir, directory);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const relativeEntry = directory === '.' ? entry : `${directory}/${entry}`;
    const absoluteEntry = join(packageDir, relativeEntry);
    let stats;
    try {
      stats = statSync(absoluteEntry);
    } catch {
      continue;
    }
    if (stats.isDirectory()) out.push(...listSourceFiles(packageDir, relativeEntry, depth + 1));
    else if (/\.(?:ts|tsx|mts|cts)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(relativeEntry);
  }
  return out;
}

/** tsc's default rootDir: the longest common directory of the program inputs. */
function defaultRootDir(packageDir: string, include: readonly string[]): string {
  const files = listSourceFiles(packageDir).filter((file) => matchesInclude(packageDir, file, include));
  return commonRoot(files);
}

/** Read a tsconfig, following one level of `extends` so inherited include/rootDir is visible. */
function readTsconfig(packageDir: string, project: string): { include?: string[]; rootDir?: string; outDir?: string } | undefined {
  const projectPath = resolve(packageDir, project.endsWith('.json') ? project : `${project}.json`);
  if (!existsSync(projectPath)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(projectPath, 'utf8');
  } catch {
    return undefined;
  }
  const parsed = JSON.parse(stripJsonComments(raw)) as {
    extends?: string;
    compilerOptions?: { rootDir?: string; outDir?: string };
    include?: string[];
  };
  let base: { include?: string[]; rootDir?: string; outDir?: string } = {};
  if (typeof parsed.extends === 'string') {
    base = readTsconfig(dirname(projectPath), parsed.extends) ?? {};
  }
  return {
    include: parsed.include ?? base.include,
    rootDir: parsed.compilerOptions?.rootDir ?? base.rootDir,
    outDir: parsed.compilerOptions?.outDir ?? base.outDir,
  };
}

/**
 * Convert one tsconfig `include` pattern into a RegExp.
 *
 * Written as an explicit scanner rather than chained string replacements: an
 * escaped star still contains a star, so a later replacement would partially
 * match its own escaping and produce a broken pattern. Scanning left to right
 * removes that hazard and lets a double star followed by a slash mean "zero or
 * more directories", which is what tsconfig means by it.
 */
/** Characters that must be escaped when emitted into a RegExp source string. */
// Written without a trailing backslash so the literal needs no escaping.
const GLOB_SPECIALS = new Set([...'.*+?^${}()|[]', String.fromCharCode(92)]);

function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
          out += '(?:.*/)?';
          index += 2;
        } else {
          out += '.*';
          index += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      continue;
    }
    out += GLOB_SPECIALS.has(char) ? String.fromCharCode(92) + char : char;
  }
  return new RegExp(`^${out}$`);
}

/** True when `source` is part of a tsc program described by `include`. */
function matchesInclude(packageDir: string, source: string, include: readonly string[]): boolean {
  const target = toPosix(source);
  return include.some((entry) => {
    let pattern = toPosix(entry);
    // tsconfig treats a bare directory as "everything under it".
    if (!pattern.includes('*') && !pattern.includes('?') && existsSync(join(packageDir, pattern))) {
      try {
        if (statSync(join(packageDir, pattern)).isDirectory()) pattern = `${pattern.replace(/\/$/, '')}/**/*`;
      } catch {
        /* fall through with the literal pattern */
      }
    }
    return globToRegExp(pattern).test(target);
  });
}

/** Join with POSIX separators, normalizing `.` and `..` segments. */
function joinPosix(...parts: string[]): string {
  return posix.normalize(parts.filter((part) => part.length > 0).join('/')).replace(/^\.\//, '');
}

/**
 * Bun's default `root` when `--root` is absent: the longest common directory of
 * the entrypoints. Computed over `dirname(entry)` rather than over the raw paths,
 * because subtracting one segment from a path-based common prefix is wrong
 * whenever the common prefix already ends on a directory boundary
 * (`src/index.ts` + `src/types.ts` must yield `src`, not ``).
 */
function commonRoot(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  const directories = paths.map((path) => {
    const parts = toPosix(path).split('/');
    return parts.slice(0, -1);
  });
  const first = directories[0]!;
  let end = first.length;
  for (const parts of directories.slice(1)) {
    let index = 0;
    while (index < end && index < parts.length && parts[index] === first[index]) index += 1;
    end = index;
  }
  return first.slice(0, end).join('/');
}

/** Candidate source files a dist target could have been compiled from. */
function sourceCandidates(target: string): string[] {
  const withoutDist = target.replace(/^dist\//, '');
  const stem = withoutDist
    .replace(/\.d\.ts$/, '')
    .replace(/\.js$/, '');
  const candidates = new Set<string>();
  for (const base of [stem]) {
    candidates.add(`src/${base}.ts`);
    candidates.add(`src/${base}/index.ts`);
    candidates.add(`${base}.ts`);
    candidates.add(`${base}/index.ts`);
  }
  return [...candidates];
}

interface ExportEntry {
  readonly subpath: string;
  readonly condition: 'types' | 'default';
  readonly target: string;
  readonly bunTarget?: string;
}

function collectEntries(pkg: string, exportsMap: unknown): ExportEntry[] {
  if (typeof exportsMap !== 'object' || exportsMap === null) return [];
  const entries: ExportEntry[] = [];
  for (const [subpath, value] of Object.entries(exportsMap as Record<string, unknown>)) {
    if (typeof value === 'string') continue;
    if (typeof value !== 'object' || value === null) continue;
    const conditions = value as Record<string, unknown>;
    // `bun` is the documented source condition, but some packages point
    // `default` straight at `src/**` with no `bun` key at all. Both mean
    // "resolve to source", so both provide the source anchor.
    const bunTarget = typeof conditions.bun === 'string'
      ? conditions.bun
      : typeof conditions.default === 'string' && !conditions.default.startsWith('./dist/')
        ? conditions.default
        : undefined;
    for (const condition of ['types', 'default'] as const) {
      const target = conditions[condition];
      if (typeof target !== 'string') continue;
      if (!target.startsWith('./dist/')) continue; // non-dist targets are checked directly on disk
      entries.push({ subpath, condition, target: target.slice(2), ...(bunTarget !== undefined ? { bunTarget } : {}) });
    }
  }
  return entries;
}

const packageNames = readdirSync(PACKAGES)
  .filter((entry) => statSync(join(PACKAGES, entry)).isDirectory())
  .filter((entry) => existsSync(join(PACKAGES, entry, 'package.json')));

for (const name of packageNames) {
  const packageDir = join(PACKAGES, name);
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name?: string;
    exports?: unknown;
    scripts?: Record<string, string>;
  };
  const label = manifest.name ?? name;
  const entries = collectEntries(label, manifest.exports);
  if (entries.length === 0) continue;

  const buildScript = manifest.scripts?.build ?? '';
  const builds = parseBunBuilds(buildScript);
  const tscCommands = parseTscCommands(buildScript);

  for (const entry of entries) {
    // A `bun` condition means the source file itself is the dev-time entrypoint;
    // it must exist because `src/` is committed.
    if (entry.bunTarget !== undefined) {
      const bunPath = entry.bunTarget.replace(/^\.\//, '');
      if (!existsSync(join(packageDir, bunPath))) {
        failures.push({ pkg: label, target: `${entry.subpath} (bun)`, reason: `${entry.bunTarget} does not exist` });
        continue;
      }
    }

    const candidates = entry.bunTarget !== undefined
      ? [entry.bunTarget.replace(/^\.\//, '')]
      : sourceCandidates(entry.target);

    if (entry.condition === 'default') {
      const emitted = builds.some((build) => {
        const root = build.root ?? commonRoot(build.entries);
        return build.entries.some((candidate) => {
          if (!candidates.includes(toPosix(candidate))) return false;
          const relativeEntry = root.length > 0 && candidate.startsWith(`${root}/`)
            ? candidate.slice(root.length + 1)
            : candidate;
          return joinPosix(build.outdir, relativeEntry).replace(/\.ts$/, '.js') === entry.target;
        });
      });
      if (!emitted) {
        failures.push({
          pkg: label,
          target: `${entry.subpath} (${entry.condition})`,
          reason: `${entry.target} is declared but no \`bun build\` emits it (source: ${candidates.join(' or ')})`,
        });
      } else {
        checked.push(`${label}${entry.subpath === '.' ? '' : entry.subpath} -> ${entry.target}`);
      }
      continue;
    }

    // `types`: a declaration target is satisfied when *any* file in a tsc
    // program emits a `.d.ts` at that path — not only the file the `bun`
    // condition points at. `@upup/utils` declares `./logging` types as
    // `dist/logging/logger.d.ts` while its source entry is `src/logging/index.ts`;
    // both declarations are real and both are emitted by the same program.
    // Requiring the entry's own declaration would reject that legitimate shape.
    const emittingProjects = tscCommands
      .map((command) => {
        const config = readTsconfig(packageDir, command.project);
        if (config === undefined) return undefined;
        const include = config.include ?? [];
        const programFiles = include.length > 0
          ? listSourceFiles(packageDir).filter((file) => matchesInclude(packageDir, file, include))
          : listSourceFiles(packageDir);
        if (programFiles.length === 0) return undefined;
        const rootDir = config.rootDir ?? defaultRootDir(packageDir, include) ?? '.';
        const outDir = command.outdir ?? config.outDir ?? 'dist';
        const decls = new Set(
          programFiles.map((file) => {
            const relativeSource = toPosix(relative(resolve(packageDir, rootDir), resolve(packageDir, file)));
            return relativeSource.startsWith('..') ? '' : joinPosix(outDir, relativeSource).replace(/\.tsx?$/, '.d.ts');
          }),
        );
        return { decls, count: decls.size };
      })
      .filter((value): value is { decls: Set<string>; count: number } => value !== undefined);

    if (emittingProjects.length === 0) {
      failures.push({
        pkg: label,
        target: `${entry.subpath} (${entry.condition})`,
        reason: `${entry.target} is declared but no \`tsc\` project covers this package's sources`,
      });
    } else if (!emittingProjects.some((project) => project.decls.has(entry.target))) {
      failures.push({
        pkg: label,
        target: `${entry.subpath} (${entry.condition})`,
        reason: `${entry.target} is declared but no \`tsc\` project emits a declaration at that path`,
      });
    } else {
      checked.push(`${label}${entry.subpath === '.' ? '' : entry.subpath} -> ${entry.target}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Payload check: every Pi resource directory a package declares in `files`
// must also be copied by the release script. `@upup/pi-investment-workflow`
// declared `sops` in `files` but the copy list never named it, so the shipped
// binary lost the built-in SOP catalog while the dev path (reading the
// workspace tree directly) stayed green.
// ---------------------------------------------------------------------------
const copyScriptPath = join(ROOT, 'scripts', 'copy-pi-package-resources.ts');
if (existsSync(copyScriptPath)) {
  const copySource = readFileSync(copyScriptPath, 'utf8');
  const copiedDirs = new Set(
    (/(?:for \(const resource of |COPIED_RESOURCES = )\[([^\]]*)\]/.exec(copySource)?.[1] ?? '')
      .split(',')
      .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean),
  );
  for (const name of packageNames) {
    const packageDir = join(PACKAGES, name);
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
      name?: string;
      files?: unknown;
    };
    const label = manifest.name ?? name;
    if (!Array.isArray(manifest.files)) continue;
    const buildScript = (manifest as { scripts?: Record<string, string> }).scripts?.build ?? '';
    for (const entry of manifest.files) {
      if (typeof entry !== 'string') continue;
      // Only source-tree directories need copying; `dist` and `package.json`
      // are handled explicitly by the script.
      if (entry === 'dist' || entry === 'package.json') continue;
      if (!existsSync(join(packageDir, entry))) continue;
      if (copiedDirs.has(entry)) continue;
      // Some packages ship a payload by copying it into `dist/` themselves
      // (`@upup/pi-evals` does this for `src/dataset`). Those are covered by
      // the package's own build rather than by the shared release script.
      if (buildScript.includes(entry)) continue;
      failures.push({
        pkg: label,
        target: `files: ${entry}`,
        reason: `"${entry}" is declared in package.json#files but scripts/copy-pi-package-resources.ts never copies it into the release payload`,
      });
    }
  }
}

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

if (failures.length === 0) {
  console.log(`${GREEN}✓${RESET} workspace exports audit passed: ${checked.length} declared dist target(s) are all emitted by their package build.`);
  process.exit(0);
}

console.error(`${RED}✗${RESET} workspace exports audit failed: ${failures.length} declared target(s) are never built.`);
console.error('Each `exports` dist target must be reachable from the package\'s own `bun build` / `tsc` commands.');
for (const failure of failures) {
  console.error(`  ${failure.pkg}${failure.target.startsWith('.') ? failure.target : ` ${failure.target}`}`);
  console.error(`      ${failure.reason}`);
}
process.exit(1);
