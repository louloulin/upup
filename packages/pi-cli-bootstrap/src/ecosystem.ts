/**
 * Ecosystem Command — `upup ecosystem`
 *
 * Companion to `upup plugin`. Where `upup plugin` is the general-purpose
 * wrapper around Pi's `DefaultPackageManager`, `upup ecosystem` is the
 * UpUp-curated view: it operates on the `UPUP_ECOSYSTEM_PACKAGES` registry
 * from `@upup/pi-runtime/ecosystem-packages` and reports the resolution
 * scope (user / bundled / missing) for each entry through the dual-scope
 * resolver.
 *
 * Why this exists:
 *   The runtime now imports every Pi ecosystem package through
 *   `createEcosystemImporter` (see `@upup/pi-runtime/ecosystem-resolver`).
 *   That resolver walks `~/.upup/agent/npm` first, then falls back to the
 *   bundled workspace. The CLI needs a single command that tells the user
 *   (a) which ecosystem packages are wired in, (b) where each one would
 *   actually load from, and (c) how to promote a bundled copy into
 *   `~/.upup/agent/npm` so a user-pinned override takes effect.
 *
 *   Without this command, the only way to see "I installed pi-web-access
 *   but the session still uses the bundled one" was to read the resolver
 *   trace by hand. `upup ecosystem status` is the diagnostic surface.
 */

import { homedir } from 'node:os';
import { DefaultPackageManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { resolveAgentDir } from '@upup/pi-resource-composition';
import {
  UPUP_ECOSYSTEM_PACKAGES,
  type UpUpEcosystemPackage,
} from '@upup/pi-runtime';
import { describeEcosystemResolution } from '@upup/pi-runtime';

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
const head = (msg: string): void => log(`\n${BOLD}${msg}${RESET}`);

export type EcosystemSubCommand =
  | 'list'
  | 'status'
  | 'install'
  | 'doctor'
  | 'help';

export interface EcosystemCommandOptions {
  readonly command: EcosystemSubCommand | string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly cwd?: string;
}

export interface EcosystemRunResult {
  readonly exitCode: number;
  readonly message: string;
}

interface ResolvedEcosystemEntry {
  readonly pkg: UpUpEcosystemPackage;
  readonly scope: 'user' | 'bundled' | 'missing';
  readonly resolvedPath: string | undefined;
  readonly root: string | undefined;
}

function resolveContext(opts: EcosystemCommandOptions): {
  env: NodeJS.ProcessEnv;
  home: string;
  cwd: string;
  agentDir: string;
} {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const resolved = resolveAgentDir(cwd, { env, home });
  return { env, home, cwd, agentDir: resolved.agentDir };
}

function resolveAll(): readonly ResolvedEcosystemEntry[] {
  return UPUP_ECOSYSTEM_PACKAGES.map((pkg) => {
    const described = describeEcosystemResolution(pkg.importPath);
    return {
      pkg,
      scope: described.scope,
      resolvedPath: described.resolved,
      root: described.root,
    };
  });
}

function scopeBadge(scope: ResolvedEcosystemEntry['scope']): string {
  if (scope === 'user') return `${GREEN}user${RESET}`;
  if (scope === 'bundled') return `${CYAN}bundled${RESET}`;
  return `${RED}missing${RESET}`;
}

function formatEntry(entry: ResolvedEcosystemEntry, verbose: boolean): string {
  const name = `${BOLD}${entry.pkg.name}${RESET}@${entry.pkg.version}`;
  const scope = scopeBadge(entry.scope);
  const where = entry.resolvedPath ? `${DIM}${entry.resolvedPath}${RESET}` : '';
  const base = `  ${name.padEnd(48)} ${scope.padEnd(20)} ${where}`;
  if (!verbose) return base;
  const lines = [base];
  if (entry.pkg.description) lines.push(`    ${DIM}${entry.pkg.description}${RESET}`);
  if (entry.pkg.caveats && entry.pkg.caveats.length > 0) {
    for (const c of entry.pkg.caveats) lines.push(`    ${YELLOW}!${RESET} ${c}`);
  }
  return lines.join('\n');
}

function runList(verbose: boolean, filterScope?: 'user' | 'bundled' | 'missing'): EcosystemRunResult {
  const all = resolveAll();
  const filtered = filterScope ? all.filter((e) => e.scope === filterScope) : all;
  head(`Ecosystem packages (${filtered.length}/${all.length})`);
  if (filtered.length === 0) {
    info('(no matches)');
  } else {
    for (const entry of filtered) log(formatEntry(entry, verbose));
  }
  head('Scope summary');
  const counts = { user: 0, bundled: 0, missing: 0 };
  for (const e of all) counts[e.scope] += 1;
  log(`  user     ${counts.user}`);
  log(`  bundled  ${counts.bundled}`);
  log(`  missing  ${counts.missing}`);
  return { exitCode: 0, message: 'listed' };
}

function runStatus(): EcosystemRunResult {
  return runList(true);
}

function runDoctor(): EcosystemRunResult {
  return runList(false, 'missing');
}

async function runInstall(
  args: readonly string[],
  ctx: { env: NodeJS.ProcessEnv; home: string; cwd: string },
): Promise<EcosystemRunResult> {
  const wanted: readonly UpUpEcosystemPackage[] = args.length > 0
    ? args
        .map((arg) => UPUP_ECOSYSTEM_PACKAGES.find((p) => p.name === arg))
        .filter((p): p is UpUpEcosystemPackage => p !== undefined)
    : UPUP_ECOSYSTEM_PACKAGES.filter((p) => p.verifiedClean);

  if (args.length > 0 && wanted.length === 0) {
    fail(`no matching ecosystem package: ${args.join(', ')}`);
    return { exitCode: 1, message: 'no match' };
  }
  if (args.length === 0) {
    info(`installing all ${wanted.length} verified-clean ecosystem packages`);
  } else {
    info(`installing ${wanted.length} requested ecosystem package(s)`);
  }
  const resolved = resolveAgentDir(ctx.cwd, { env: ctx.env, home: ctx.home });
  info(`target: ${resolved.agentDir}/npm/node_modules`);
  const settingsManager = SettingsManager.create(ctx.cwd, resolved.agentDir);
  const manager = new DefaultPackageManager({
    cwd: ctx.cwd,
    agentDir: resolved.agentDir,
    settingsManager,
  });
  let installed = 0;
  for (const pkg of wanted) {
    const source = `npm:${pkg.name}@${pkg.version}`;
    try {
      await manager.installAndPersist(source);
      ok(`installed ${source}`);
      installed += 1;
    } catch (err) {
      fail(`install failed: ${source} — ${(err as Error).message}`);
    }
  }
  return { exitCode: installed === wanted.length ? 0 : 1, message: `installed ${installed}/${wanted.length}` };
}

function printHelp(): void {
  log(`
${BOLD}Usage${RESET}
  upup ecosystem list                 Show every ecosystem package + its scope
  upup ecosystem status                Verbose list with descriptions and caveats
  upup ecosystem doctor                Show only packages that failed to resolve
  upup ecosystem install [<name>...]   Install ecosystem packages into ~/.upup/agent/npm
  upup ecosystem help                  Show this help

${BOLD}Scope${RESET}
  ${GREEN}user${RESET}      Resolved from ${DIM}~/.upup/agent/npm/node_modules${RESET} (user-installed)
  ${CYAN}bundled${RESET}   Resolved from this repository's ${DIM}node_modules${RESET} (shipped)
  ${RED}missing${RESET}   No root carries the package; session will fail to import it

${BOLD}Examples${RESET}
  upup ecosystem list
  upup ecosystem install pi-web-access
  upup ecosystem install           # install all verified-clean packages
  upup ecosystem doctor
`);
}

export async function runEcosystemCommand(opts: EcosystemCommandOptions): Promise<EcosystemRunResult> {
  const ctx = resolveContext(opts);
  switch (opts.command) {
    case 'list':
      return runList(false);
    case 'status':
      return runStatus();
    case 'doctor':
      return runDoctor();
    case 'install':
      return runInstall(opts.args, ctx);
    case 'help':
      printHelp();
      return { exitCode: 0, message: 'help printed' };
    default:
      fail(`unknown subcommand: ${opts.command}`);
      printHelp();
      return { exitCode: 1, message: 'unknown subcommand' };
  }
}
