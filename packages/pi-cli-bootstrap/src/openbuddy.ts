/**
 * OpenBuddy migration command — `upup openbuddy`
 *
 * Migrates Pi-related agent state (settings, themes, packages config) from a
 * Pi-default agent directory into UpUp's canonical `~/.upup/agent` location.
 * Pi's `DefaultResourceLoader` and `SettingsManager` both honour UpUp's
 * `~/.upup/agent` once it exists, so a successful migration makes UpUp pick
 * up Pi-installed packages and settings on next startup.
 *
 * Subcommands:
 *   - `status`   — show what is in source vs. target, what would migrate
 *   - `migrate`  — copy settings.json + theme/.json files + package list from source to target
 *   - `verify`   — re-check after migration; fail-closed if target missing
 *
 * Source resolution (mirrors `resolveAgentDir` in @upup/pi-resource-composition):
 *   source = $UPUP_MIGRATE_FROM || ~/.pi/agent (if exists) || ~/.openbuddy/agent (if exists) || resolveAgentDir()
 *   target = ~/.upup/agent (always created if missing)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { resolveAgentDir } from '@upup/pi-resource-composition';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

const log = (msg: string): void => { console.log(msg); };
const ok = (msg: string): void => log(`${GREEN}✓${RESET} ${msg}`);
const warn = (msg: string): void => log(`${YELLOW}!${RESET} ${msg}`);
const fail = (msg: string): void => log(`${RED}✗${RESET} ${msg}`);
const info = (msg: string): void => log(`${DIM}  ${msg}${RESET}`);
const head = (msg: string): void => log(`${CYAN}${BOLD}${msg}${RESET}`);

const SETTINGS_FILE = 'settings.json';
const THEMES_DIR = 'themes';
const RESOURCE_TYPES = ['themes'] as const;
type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface OpenBuddyCommandOptions {
  command: 'status' | 'migrate' | 'verify' | 'help';
  args: string[];
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
}

export interface OpenBuddyRunResult {
  exitCode: number;
  message: string;
}

interface MigrationPlanEntry {
  readonly relPath: string;
  readonly source: string;
  readonly target: string;
  readonly kind: 'settings' | 'theme' | 'package-source';
  readonly existsInTarget: boolean;
}

interface MigrationPlan {
  readonly source: string;
  readonly target: string;
  readonly entries: ReadonlyArray<MigrationPlanEntry>;
  readonly packageSources: ReadonlyArray<string>;
}

function normalizePath(value: string): string {
  return resolve(value);
}

function defaultUpupAgentDir(home: string): string {
  return join(home, '.upup', 'agent');
}

function defaultPiAgentDir(home: string): string {
  return join(home, '.pi', 'agent');
}

/**
 * Legacy OpenBuddy agent dir. The `upup openbuddy` command is named after
 * this predecessor layout; users with a `~/.openbuddy/agent` state should be
 * able to migrate it into `~/.upup/agent` without a manual copy.
 */
function defaultOpenBuddyAgentDir(home: string): string {
  return join(home, '.openbuddy', 'agent');
}

function pickSourceDir(env: NodeJS.ProcessEnv, home: string): string | undefined {
  const override = env.UPUP_MIGRATE_FROM?.trim();
  if (override) return normalizePath(override);
  const piHome = defaultPiAgentDir(home);
  if (existsSync(piHome)) return piHome;
  const openBuddyHome = defaultOpenBuddyAgentDir(home);
  if (existsSync(openBuddyHome)) return openBuddyHome;
  const resolved = resolveAgentDir(process.cwd(), { env, home });
  // Skip the cwd-fallback (always resolves to process.cwd()) and home-upup-agent
  // (which IS the migration target). Only honour concrete agent dirs.
  if (
    resolved.source !== 'home-upup-agent' &&
    resolved.source !== 'cwd-fallback' &&
    existsSync(resolved.agentDir)
  ) {
    return resolved.agentDir;
  }
  return undefined;
}

function readJsonSafe<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function extractPackageSources(settings: unknown): string[] {
  if (!settings || typeof settings !== 'object') return [];
  const candidate = settings as { packages?: unknown };
  if (!Array.isArray(candidate.packages)) return [];
  return candidate.packages
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'source' in entry) {
        const source = (entry as { source?: unknown }).source;
        return typeof source === 'string' ? source : null;
      }
      return null;
    })
    .filter((value): value is string => typeof value === 'string');
}

function buildPlan(sourceDir: string, targetDir: string): MigrationPlan {
  const entries: MigrationPlanEntry[] = [];
  const settingsPath = join(sourceDir, SETTINGS_FILE);
  if (existsSync(settingsPath)) {
    entries.push({
      relPath: SETTINGS_FILE,
      source: settingsPath,
      target: join(targetDir, SETTINGS_FILE),
      kind: 'settings',
      existsInTarget: existsSync(join(targetDir, SETTINGS_FILE)),
    });
  }
  for (const type of RESOURCE_TYPES) {
    const srcDir = join(sourceDir, type);
    if (!existsSync(srcDir)) continue;
    for (const entry of readdirSync(srcDir)) {
      const srcFile = join(srcDir, entry);
      try {
        if (!statSync(srcFile).isFile()) continue;
      } catch {
        continue;
      }
      const dstFile = join(targetDir, type, entry);
      entries.push({
        relPath: `${type}/${entry}`,
        source: srcFile,
        target: dstFile,
        kind: type === 'themes' ? 'theme' : 'settings',
        existsInTarget: existsSync(dstFile),
      });
    }
  }
  const settings = readJsonSafe<unknown>(settingsPath);
  return { source: sourceDir, target: targetDir, entries, packageSources: extractPackageSources(settings) };
}

function formatPlan(plan: MigrationPlan): string {
  const lines: string[] = [];
  lines.push(`source: ${plan.source}`);
  lines.push(`target: ${plan.target}`);
  lines.push(`settings file: ${plan.entries.some((e) => e.kind === 'settings') ? 'present' : 'missing'}`);
  lines.push(`theme files:   ${plan.entries.filter((e) => e.kind === 'theme').length}`);
  lines.push(`packages:      ${plan.packageSources.length} (recorded in source settings.json)`);
  if (plan.packageSources.length > 0) {
    for (const src of plan.packageSources) lines.push(`  - ${src}`);
  }
  return lines.join('\n');
}

function copyIfMissing(entry: MigrationPlanEntry, dryRun: boolean): 'copied' | 'skipped' | 'conflict' {
  if (entry.existsInTarget) return 'skipped';
  if (dryRun) return 'copied';
  mkdirSync(dirname(entry.target), { recursive: true });
  copyFileSync(entry.source, entry.target);
  return 'copied';
}

function runStatus(opts: { env: NodeJS.ProcessEnv; home: string }): OpenBuddyRunResult {
  head('OpenBuddy migration status');
  const source = pickSourceDir(opts.env, opts.home);
  const target = defaultUpupAgentDir(opts.home);
  if (!source) {
    fail('no source agent directory found');
    info(`tried: $UPUP_MIGRATE_FROM, ~/.pi/agent, ~/.openbuddy/agent, and current resolveAgentDir()`);
    return { exitCode: 1, message: 'no source' };
  }
  ok(`source = ${source}`);
  info(`target = ${target} (will be created if missing)`);
  const plan = buildPlan(source, target);
  log('');
  log(formatPlan(plan));
  return { exitCode: 0, message: 'status printed' };
}

function runMigrate(args: string[], opts: { env: NodeJS.ProcessEnv; home: string }): OpenBuddyRunResult {
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const source = pickSourceDir(opts.env, opts.home);
  const target = defaultUpupAgentDir(opts.home);
  if (!source) {
    fail('no source agent directory found');
    return { exitCode: 1, message: 'no source' };
  }
  if (source === target) {
    fail(`source and target resolve to the same directory: ${source}`);
    info('nothing to migrate');
    return { exitCode: 1, message: 'same dir' };
  }
  head(dryRun ? 'OpenBuddy migration (DRY RUN)' : 'OpenBuddy migration');
  ok(`source = ${source}`);
  ok(`target = ${target}`);
  const plan = buildPlan(source, target);
  if (plan.entries.length === 0) {
    warn('no settings.json or themes found in source — nothing to migrate');
    return { exitCode: 0, message: 'nothing to migrate' };
  }
  mkdirSync(target, { recursive: true });
  let copied = 0;
  let skipped = 0;
  for (const entry of plan.entries) {
    if (entry.existsInTarget && !force) {
      info(`skip (exists): ${entry.relPath}`);
      skipped += 1;
      continue;
    }
    if (entry.existsInTarget && force) {
      info(`overwrite (force): ${entry.relPath}`);
    }
    if (!dryRun) {
      mkdirSync(dirname(entry.target), { recursive: true });
      copyFileSync(entry.source, entry.target);
    }
    ok(`${dryRun ? '[dry-run] would copy' : 'copied'}: ${entry.relPath}`);
    copied += 1;
  }
  if (plan.packageSources.length > 0) {
    log('');
    head(`${plan.packageSources.length} package source(s) recorded in settings.json`);
    info('run `upup plugin install <source>` to (re)install via Pi DefaultPackageManager');
    info('or use `pi-cmd` against the migrated agentDir to reconcile with Pi');
  }
  log('');
  ok(`${dryRun ? '[dry-run] ' : ''}migrated ${copied} file(s), skipped ${skipped}`);
  info(`next: UpUp will pick up ~/.upup/agent on next startup (resolveAgentDir precedence #3)`);
  return { exitCode: 0, message: 'migrated' };
}

function runVerify(opts: { env: NodeJS.ProcessEnv; home: string }): OpenBuddyRunResult {
  head('OpenBuddy migration verify');
  const target = defaultUpupAgentDir(opts.home);
  if (!existsSync(target)) {
    fail(`target missing: ${target}`);
    return { exitCode: 1, message: 'target missing' };
  }
  ok(`target present: ${target}`);
  const settingsPath = join(target, SETTINGS_FILE);
  if (!existsSync(settingsPath)) {
    warn('settings.json missing in target');
    return { exitCode: 1, message: 'settings missing' };
  }
  const settings = readJsonSafe<unknown>(settingsPath);
  if (!settings || typeof settings !== 'object') {
    fail('settings.json is not a JSON object');
    return { exitCode: 1, message: 'settings invalid' };
  }
  ok('settings.json parses');
  const sources = extractPackageSources(settings);
  info(`packages declared: ${sources.length}`);
  for (const type of RESOURCE_TYPES) {
    const dir = join(target, type);
    if (!existsSync(dir)) continue;
    const count = readdirSync(dir).length;
    info(`${type}: ${count} file(s)`);
  }
  return { exitCode: 0, message: 'verified' };
}

function printHelp(): void {
  log(`
${BOLD}upup openbuddy${RESET} — migrate Pi agent state into ~/.upup/agent

${BOLD}Usage${RESET}
  upup openbuddy status                 Show source/target preview
  upup openbuddy migrate [--dry-run] [--force]
                                         Copy settings.json + themes from Pi into ~/.upup/agent
  upup openbuddy verify                  Re-check ~/.upup/agent integrity

${BOLD}Source resolution${RESET}
  1. $UPUP_MIGRATE_FROM (explicit override)
  2. ~/.pi/agent (when it exists)
  3. ~/.openbuddy/agent (when it exists; legacy OpenBuddy layout)
  4. resolveAgentDir() result (excluding home-upup-agent)

${BOLD}Target${RESET}
  Always ~/.upup/agent (created if missing).

${BOLD}Examples${RESET}
  upup openbuddy status
  upup openbuddy migrate --dry-run
  upup openbuddy migrate --force
  UPUP_MIGRATE_FROM=/path/to/legacy upup openbuddy migrate
`);
}

export function runOpenBuddyCommand(opts: OpenBuddyCommandOptions): OpenBuddyRunResult {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const ctx = { env, home };
  switch (opts.command) {
    case 'status':
      return runStatus(ctx);
    case 'migrate':
      return runMigrate(opts.args, ctx);
    case 'verify':
      return runVerify(ctx);
    case 'help':
      printHelp();
      return { exitCode: 0, message: 'help printed' };
    default:
      fail(`unknown subcommand: ${opts.command}`);
      printHelp();
      return { exitCode: 1, message: 'unknown subcommand' };
  }
}
