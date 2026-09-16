/**
 * First-launch bootstrap for `~/.upup/agent/`.
 *
 * Pi Native migration: UpUp owns its own global Pi home (`~/.upup/agent`)
 * instead of sharing `~/.pi/agent`. Pi resolves that path through the
 * `PI_CODING_AGENT_DIR` env var, so pointing Pi at UpUp's home is a
 * configuration change, not a fork — see
 * `@upup/pi-resource-composition/agent-dir`.
 *
 * Bootstrap has two jobs, both idempotent:
 *
 *   1. **Seed** — on a fresh `~/.upup/agent`, carry over the user's existing
 *      Pi configuration (`~/.pi/agent`: settings, models, auth, themes,
 *      prompts, skills, extensions) so switching to UpUp never loses a
 *      working setup. Existing files are never overwritten.
 *   2. **Brand** — make sure the UpUp dark theme is installed and selected.
 *      An explicit custom theme choice is respected; only built-in Pi themes
 *      (`dark` / `light` / `auto` / absent) are replaced with `upup-dark`.
 *
 * Nothing here touches `@earendil-works/pi-coding-agent`; it only writes
 * files into the agent dir Pi already reads.
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAgentDir, upupAgentDirFor } from '@upup/pi-resource-composition';

const UPUP_DARK_THEME_FILENAME = 'upup-dark.json';
const UPUP_DEFAULT_THEME = 'upup-dark';

/** Pi built-in themes that a branded install is allowed to replace. */
const REPLACEABLE_THEMES = new Set(['dark', 'light', 'auto']);

/**
 * Files carried over from a previous Pi home. Deliberately an allowlist:
 * sessions, caches, logs, managed binaries and npm state are regenerated
 * and would only bloat the new home.
 */
const SEED_FILES = ['settings.json', 'models.json', 'auth.json'] as const;
const SEED_DIRS = ['themes', 'prompts', 'skills', 'extensions'] as const;

/** Seeded files that may carry API keys / tokens; written owner-only (0600). */
const SECRET_FILES = new Set(['auth.json', 'models.json']);

export interface BootstrapAgentOptions {
  /** Override the resolved home dir (defaults to `os.homedir()`). */
  readonly home?: string;
  /** Force a specific agent dir, bypassing `resolveAgentDir` precedence. */
  readonly agentDir?: string;
  /** Force a specific source for the theme file. Tests use this. */
  readonly themeSourcePath?: string;
  /** Source directory to seed from. Defaults to `UPUP_MIGRATE_FROM` or `~/.pi/agent`. */
  readonly seedFrom?: string;
  /** Disable seeding entirely (tests, read-only homes). */
  readonly skipSeed?: boolean;
}

export interface BootstrapAgentResult {
  readonly agentDir: string;
  readonly themeWritten: boolean;
  readonly settingsWritten: boolean;
  readonly skipped: boolean;
  /** Absolute source dir the agent dir was seeded from, when seeding ran. */
  readonly seededFrom?: string;
  /** Relative paths copied during seeding. */
  readonly seededPaths: readonly string[];
}

function defaultThemeSourcePath(): string {
  // The theme ships alongside this module. Under Bun `import.meta.url` points
  // at the source file `packages/pi-app/src/bootstrap-agent.ts`, so one `..`
  // reaches `packages/pi-app/themes/upup-dark.json`.
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), '..', 'themes', UPUP_DARK_THEME_FILENAME);
}

function readJsonIfExists(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function isFreshAgentDir(agentDir: string): boolean {
  if (existsSync(join(agentDir, 'settings.json'))) return false;
  const themesDir = join(agentDir, 'themes');
  if (existsSync(themesDir)) {
    try {
      if (readdirSync(themesDir).length > 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Copy the allowlisted Pi configuration into a fresh UpUp agent dir.
 * Never overwrites an existing target file.
 */
function seedAgentDir(sourceDir: string, agentDir: string): string[] {
  const copied: string[] = [];
  for (const name of SEED_FILES) {
    const source = join(sourceDir, name);
    const target = join(agentDir, name);
    if (!existsSync(source) || existsSync(target)) continue;
    try {
      copyFileSync(source, target);
      // The source may be world-readable; credentials never are.
      if (SECRET_FILES.has(name)) chmodSync(target, 0o600);
      copied.push(name);
    } catch {
      /* unreadable source — skip */
    }
  }
  for (const name of SEED_DIRS) {
    const source = join(sourceDir, name);
    if (!existsSync(source)) continue;
    let entries: string[];
    try {
      entries = readdirSync(source);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === UPUP_DARK_THEME_FILENAME && name === 'themes') continue;
      const from = join(source, entry);
      const to = join(agentDir, name, entry);
      if (existsSync(to)) continue;
      try {
        if (!statSync(from).isFile()) continue;
        ensureDir(dirname(to));
        copyFileSync(from, to);
        copied.push(join(name, entry));
      } catch {
        /* skip unreadable entry */
      }
    }
  }
  return copied;
}

interface BootstrapContext {
  readonly agentDir: string;
  readonly themeSource: string;
  readonly seedSource: string | undefined;
}

function resolveContext(options: BootstrapAgentOptions): BootstrapContext {
  const home = options.home ?? process.env.HOME ?? homedir();
  const agentDir = options.agentDir
    ? resolve(options.agentDir)
    : resolveAgentDir(process.cwd(), { env: process.env, home }).agentDir;
  const seedSource = options.skipSeed
    ? undefined
    : options.seedFrom ?? process.env.UPUP_MIGRATE_FROM?.trim() ?? join(home, '.pi', 'agent');
  const themeSource = options.themeSourcePath ?? defaultThemeSourcePath();
  return {
    agentDir,
    themeSource,
    seedSource: seedSource && seedSource !== agentDir ? seedSource : undefined,
  };
}

function prepareAgentDir(context: BootstrapContext): void {
  ensureDir(join(context.agentDir, 'themes'));
  ensureDir(join(context.agentDir, 'sessions'));
}

function runSeed(context: BootstrapContext): { seededFrom?: string; seededPaths: string[] } {
  const { seedSource, agentDir } = context;
  if (!seedSource || !existsSync(seedSource)) return { seededPaths: [] };
  if (basename(seedSource) === UPUP_DARK_THEME_FILENAME) return { seededPaths: [] };
  if (!isFreshAgentDir(agentDir)) return { seededPaths: [] };
  return { seededFrom: seedSource, seededPaths: seedAgentDir(seedSource, agentDir) };
}

function syncBundledTheme(themeSource: string, themePath: string): boolean {
  if (!themeSource || !existsSync(themeSource)) return false;
  const bundled = readFileSync(themeSource, 'utf8');
  if (!existsSync(themePath)) {
    writeFileSync(themePath, bundled, 'utf8');
    return true;
  }
  try {
    if (statSync(themeSource).mtimeMs > statSync(themePath).mtimeMs) {
      writeFileSync(themePath, bundled, 'utf8');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function ensureUpupThemeSelected(settingsPath: string): boolean {
  const existing = readJsonIfExists(settingsPath);
  if (!existing) {
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          theme: UPUP_DEFAULT_THEME,
          $schema:
            'https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/settings-schema.json',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    return true;
  }
  const current = existing.theme;
  const isReplaceable = current === undefined || (typeof current === 'string' && REPLACEABLE_THEMES.has(current));
  if (!isReplaceable) return false;
  writeFileSync(settingsPath, `${JSON.stringify({ ...existing, theme: UPUP_DEFAULT_THEME }, null, 2)}\n`, 'utf8');
  return true;
}

const EMPTY_RESULT = (agentDir: string): BootstrapAgentResult => ({
  agentDir,
  themeWritten: false,
  settingsWritten: false,
  skipped: true,
  seededPaths: [],
});

/**
 * Bootstrap `~/.upup/agent/`. Safe to call on every process start: all steps
 * are idempotent and any I/O failure degrades to `skipped: true` so the CLI
 * still starts on a read-only `$HOME`.
 */
export function bootstrapUpupAgentSync(options: BootstrapAgentOptions = {}): BootstrapAgentResult {
  const context = resolveContext(options);
  try {
    prepareAgentDir(context);
  } catch {
    return EMPTY_RESULT(context.agentDir);
  }

  let seed: { seededFrom?: string; seededPaths: string[] };
  try {
    seed = runSeed(context);
  } catch {
    seed = { seededPaths: [] };
  }

  const themeWritten = syncBundledTheme(context.themeSource, join(context.agentDir, 'themes', UPUP_DARK_THEME_FILENAME));

  let settingsWritten = false;
  try {
    settingsWritten = ensureUpupThemeSelected(join(context.agentDir, 'settings.json'));
  } catch {
    return { ...EMPTY_RESULT(context.agentDir), seededPaths: seed.seededPaths, ...(seed.seededFrom ? { seededFrom: seed.seededFrom } : {}) };
  }

  return {
    agentDir: context.agentDir,
    themeWritten,
    settingsWritten,
    skipped: false,
    ...(seed.seededFrom ? { seededFrom: seed.seededFrom } : {}),
    seededPaths: seed.seededPaths,
  };
}

/** Async alias kept for callers that prefer `await`; the work is synchronous. */
export async function bootstrapUpupAgent(options: BootstrapAgentOptions = {}): Promise<BootstrapAgentResult> {
  return bootstrapUpupAgentSync(options);
}

/** Canonical UpUp agent dir for a given home; re-exported for callers/tests. */
export { upupAgentDirFor };

/**
 * Single entry point used by every UpUp process start (interactive TUI, print,
 * stdio/RPC, gateway, cron, daemon):
 *
 *   1. resolve the canonical `~/.upup/agent` (or an explicit env override),
 *   2. publish it as `PI_CODING_AGENT_DIR` so Pi's `getAgentDir()` agrees, and
 *   3. bootstrap the directory (seed from a previous Pi home + UpUp theme).
 *
 * Must run before any `@earendil-works/pi-*` module is imported: Pi reads
 * `PI_CODING_AGENT_DIR` at module init. Returns the resolved agent dir.
 */
export function ensureUpupAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const preset = env.PI_CODING_AGENT_DIR?.trim();
  if (preset) return preset;
  const resolved = resolveAgentDir(process.cwd(), { env, home: env.HOME ?? homedir() }).agentDir;
  env.PI_CODING_AGENT_DIR = resolved;
  bootstrapUpupAgentSync({ agentDir: resolved });
  return resolved;
}
