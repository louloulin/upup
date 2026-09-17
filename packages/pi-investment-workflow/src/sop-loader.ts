/**
 * UpUp SOP Loader.
 *
 * Discovers SopSpec files from:
 *   1. `<cwd>/.upup/sops/*.yaml`           (project-level, highest priority)
 *   2. `$UPUP_HOME/sops/*.yaml` (`~/.upup/sops/*.yaml`)  (user-level)
 *   3. Built-in `sops/<id>.yaml` shipped with `@upup/pi-investment-workflow` (lowest priority)
 *
 * Each file is parsed via `Bun.YAML.parse`. Built-in + user + project are merged
 * with earlier (higher-priority) layers winning per SOP id, so a project SOP can
 * shadow the built-in `graham.yaml` for the project, and a user SOP can shadow a
 * built-in globally.
 *
 * The same module also loads user-defined agent specs from
 * `<cwd>/.upup/agents/*.json` and `$UPUP_HOME/agents/*.json` (see
 * `loadUserAgentSpecs`), which is what makes investor-authored methodologies
 * expressible without touching TypeScript.
 *
 * Every write/read of the user-scope root honours `$UPUP_HOME` so installs can
 * be relocated (`UPUP_HOME=/tmp/x bun run dev`) instead of mutating `~/.upup`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UpUpAgentSpec, UpUpPermissionProfile, UpUpDataPolicy, UpUpOutputContract } from '@upup/pi-runtime';
import { validateAgentSpec } from './agent-spec';
import { type SopSpec, validateSopSpec, validateAgentCatalogForSop } from './sop-spec';

export interface SopLoadResult {
  readonly sops: readonly SopSpec[];
  /** Map from SOP id → source path (or 'builtin'). */
  readonly sources: ReadonlyMap<string, string>;
  readonly warnings: readonly string[];
}

export interface SopLoaderOptions {
  /** Override cwd (defaults to `process.cwd()`). */
  readonly cwd?: string;
  /** Override user home (defaults to `os.homedir()`). */
  readonly home?: string;
  /** Override the UpUp home root (defaults to `$UPUP_HOME` or `<home>/.upup`). */
  readonly upupHome?: string;
  /** Disable built-in SOPs (for testing). */
  readonly disableBuiltins?: boolean;
}

/** Directory name of the UpUp home root. */
const UPUP_DIR_NAME = '.upup';
/** Environment variable that relocates the UpUp home root (`~/.upup`). */
export const UPUP_HOME_ENV = 'UPUP_HOME';

/**
 * Resolve the UpUp home root: `$UPUP_HOME` when set, else `<home>/.upup`.
 * User-scope SOPs and agents always live under this root so a sandboxed or
 * CI install never writes into the developer's real `~/.upup`.
 */
export function resolveUpUpHomeRoot(options: SopLoaderOptions = {}): string {
  const override = options.upupHome ?? process.env[UPUP_HOME_ENV]?.trim();
  if (override) return resolve(override);
  return join(options.home ?? process.env.HOME ?? homedir(), UPUP_DIR_NAME);
}

/** Built-in SOPs ship from `<package>/sops/*.yaml` and are loaded relative to this module. */
// `import.meta.dir` is a Bun-only global and is `undefined` under Node, which
// made `join(undefined, ...)` throw `ERR_INVALID_ARG_TYPE` at module load in the
// esbuild Node bundle. `import.meta.url` exists in both runtimes.
//
// Resolution differs by runtime layout, so several candidates are probed:
//   - Bun / Node source:  <package>/src/..   → <package>/sops
//   - built package:      <package>/dist/..  → <package>/sops
//   - esbuild Node bundle: this module is inlined into `<repo>/dist/index.js`, and
//     `build:node` copies the SOP payload to `<repo>/dist/sops` next to the bundle.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const BUILTIN_SOPS_DIR_CANDIDATES = [
  join(MODULE_DIR, '..', 'sops'),
  join(MODULE_DIR, '..', 'dist', 'sops'),
  join(MODULE_DIR, 'sops'),
];

function listYaml(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .map((name) => join(dir, name));
}

function listJson(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dir, name));
}

/**
 * Directory holding the SOPs shipped with this package, or `null` when the
 * package is consumed without its `sops/` payload (e.g. a partial dist).
 */
export function resolveBuiltinSopsDir(): string | null {
  for (const candidate of BUILTIN_SOPS_DIR_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** List the built-in SOP YAML files, empty when the payload is absent. */
export function listBuiltinSopFiles(): readonly string[] {
  const dir = resolveBuiltinSopsDir();
  return dir ? listYaml(dir) : [];
}

/**
 * Parse YAML text.
 *
 * `Bun.YAML.parse` is the Bun-native parser this module was written against.
 * The esbuild Node bundle has no `Bun` global, so fall back to `js-yaml`
 * (already present transitively via `gray-matter`, which the Node bundle also
 * requires at runtime). Both parsers accept the same YAML 1.2 subset the SOP
 * files use, so the result is identical across runtimes.
 */
function parseYaml(content: string): unknown {
  const bun = (globalThis as { Bun?: { YAML?: { parse?: (input: string) => unknown } } }).Bun;
  if (bun?.YAML?.parse) return bun.YAML.parse(content);
  // Lazy require keeps `js-yaml` out of the Bun execution path entirely.
  const { load } = createRequire(import.meta.url)('js-yaml') as { load: (input: string) => unknown };
  return load(content);
}

/**
 * Load and parse a YAML file into a SopSpec. Throws on schema violation.
 * Returns `null` if the file is missing or unreadable.
 */
export function parseSopYaml(content: string, source: string): SopSpec {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw new Error(`Failed to parse SOP YAML ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return coerceSopSpec(parsed, source);
}

function coerceSopSpec(input: unknown, source: string): SopSpec {
  if (!input || typeof input !== 'object') throw new Error(`SOP ${source}: top-level must be an object`);
  const obj = input as Record<string, unknown>;
  if (typeof obj.id !== 'string') throw new Error(`SOP ${source}: id must be a string`);
  if (typeof obj.name !== 'string') throw new Error(`SOP ${source}: name must be a string`);
  if (typeof obj.description !== 'string') throw new Error(`SOP ${source}: description must be a string`);
  if (typeof obj.version !== 'string') throw new Error(`SOP ${source}: version must be a string`);
  if (!Array.isArray(obj.phases)) throw new Error(`SOP ${source}: phases must be an array`);
  return obj as unknown as SopSpec;
}

/**
 * Load all SOPs from disk, project + user + built-in (in that priority order).
 */
export function loadSops(options: SopLoaderOptions = {}): SopLoadResult {
  const cwd = options.cwd ?? process.cwd();
  const warnings: string[] = [];
  const sops: SopSpec[] = [];
  const sources = new Map<string, string>();

  // Highest-priority layer first: the first SOP seen for an id wins, so
  // project-level overrides user-level overrides built-in.
  const layers: ReadonlyArray<{ dir: string | null; tag: 'builtin' | 'user' | 'project' }> = [
    { dir: join(cwd, UPUP_DIR_NAME, 'sops'), tag: 'project' },
    { dir: join(resolveUpUpHomeRoot(options), 'sops'), tag: 'user' },
    { dir: options.disableBuiltins ? null : resolveBuiltinSopsDir(), tag: 'builtin' },
  ];

  for (const layer of layers) {
    if (!layer.dir) continue;
    for (const file of listYaml(layer.dir)) {
      try {
        const content = readFileSync(file, 'utf-8');
        const sop = parseSopYaml(content, file);
        if (sources.has(sop.id)) continue; // higher-priority layer already won
        sources.set(sop.id, layer.tag === 'builtin' ? 'builtin' : file);
        sops.push(sop);
      } catch (error) {
        warnings.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { sops, sources, warnings };
}

/**
 * Load and validate all SOPs against the available agent catalog.
 * Throws if any SOP references an unknown agent.
 */
export function loadAndValidateSops(
  agents: readonly UpUpAgentSpec[],
  options: SopLoaderOptions = {},
): SopLoadResult {
  const result = loadSops(options);
  const knownIds = validateAgentCatalogForSop(agents);
  for (const sop of result.sops) {
    try {
      validateSopSpec(sop, knownIds);
    } catch (error) {
      throw new Error(`SOP ${sop.id} (${result.sources.get(sop.id) ?? 'unknown'}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// User-defined agent specs (rolebox-compatible JSON in `.upup/agents/*.json`)
// ---------------------------------------------------------------------------

export interface UserAgentFile {
  id: string;
  name: string;
  description: string;
  version: string;
  systemPrompt?: string;
  skills?: readonly string[];
  tools: readonly string[] | '*';
  packages?: readonly string[];
  capabilities?: readonly string[];
  taskTypes?: readonly string[];
  workflow?: string;
  permissions: UpUpPermissionProfile;
  dataPolicy?: UpUpDataPolicy;
  outputContract?: UpUpOutputContract;
  maxConcurrency?: number;
  timeoutMs?: number;
}

export interface UserAgentLoadResult {
  readonly agents: readonly UpUpAgentSpec[];
  readonly sources: ReadonlyMap<string, string>;
  readonly warnings: readonly string[];
}

function coerceUserAgent(input: unknown, source: string): UpUpAgentSpec {
  if (!input || typeof input !== 'object') throw new Error(`Agent ${source}: top-level must be an object`);
  const obj = input as Record<string, unknown>;
  for (const required of ['id', 'name', 'description', 'version']) {
    if (typeof obj[required] !== 'string') throw new Error(`Agent ${source}: ${required} must be a string`);
  }
  if (!Array.isArray(obj.tools) && obj.tools !== '*') throw new Error(`Agent ${source}: tools must be array or "*"`);
  if (!obj.permissions || typeof obj.permissions !== 'object') throw new Error(`Agent ${source}: permissions is required`);

  const spec = {
    id: obj.id as string,
    version: obj.version as string,
    name: obj.name as string,
    description: obj.description as string,
    packages: (obj.packages as readonly string[] | undefined) ?? [],
    skills: (obj.skills as readonly string[] | undefined) ?? [],
    tools: obj.tools as readonly string[] | '*',
    mode: 'subagent' as const,
    capabilities: (obj.capabilities as readonly string[] | undefined) ?? [],
    taskTypes: (obj.taskTypes as readonly string[] | undefined) ?? [],
    permissions: obj.permissions as UpUpPermissionProfile,
    dataPolicy: obj.dataPolicy as UpUpDataPolicy | undefined,
    outputContract: (obj.outputContract as UpUpOutputContract | undefined) ?? 'report',
  };
  validateAgentSpec(spec);
  return spec;
}

/**
 * Load user agent specs from `<cwd>/.upup/agents/*.json` and `~/.upup/agents/*.json`.
 * Project-level wins on conflict (same id). Built-in INVESTMENT_PROFILES are
 * merged in by the caller — this loader only handles user-defined JSON.
 */
export function loadUserAgentSpecs(options: SopLoaderOptions = {}): UserAgentLoadResult {
  const cwd = options.cwd ?? process.cwd();
  const warnings: string[] = [];
  const agents: UpUpAgentSpec[] = [];
  const sources = new Map<string, string>();

  // Highest-priority layer first (project overrides user on id collision).
  const layers = [
    { dir: join(cwd, UPUP_DIR_NAME, 'agents'), tag: 'project' },
    { dir: join(resolveUpUpHomeRoot(options), 'agents'), tag: 'user' },
  ] as const;

  for (const layer of layers) {
    if (!existsSync(layer.dir)) continue;
    for (const file of listJson(layer.dir)) {
      try {
        const content = readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content) as unknown;
        const spec = coerceUserAgent(parsed, file);
        if (sources.has(spec.id)) continue;
        sources.set(spec.id, file);
        agents.push(spec);
      } catch (error) {
        warnings.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { agents, sources, warnings };
}

/**
 * Merge user-defined agent specs with the built-in INVESTMENT_PROFILES catalog.
 * User specs override built-ins on id collision.
 */
export function mergeAgentCatalog(
  builtins: readonly UpUpAgentSpec[],
  users: readonly UpUpAgentSpec[],
): readonly UpUpAgentSpec[] {
  const out = new Map<string, UpUpAgentSpec>();
  for (const b of builtins) out.set(b.id, b);
  for (const u of users) out.set(u.id, u);
  return [...out.values()];
}
