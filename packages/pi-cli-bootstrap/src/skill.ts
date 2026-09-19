/**
 * Skill scope CLI — `upup skill`
 *
 * Visualises the split between UpUp-owned skills (kept by default) and the
 * ambient skill library loaded by Pi from `~/.agents/skills` (filtered by
 * default since Sprint F1). Exposes the per-session override that
 * `UPUP_USER_SKILLS` env and `~/.upup/settings.json#userSkills` already
 * consume, so the user can audit and adjust the policy without editing
 * JSON by hand.
 *
 * Subcommands:
 *   list [--scope=upup|user|ambient|all]   show skills, annotated by source
 *   scope                                  show current policy + effective scope
 *   set-policy <include|exclude|whitelist-only>
 *                                          persist `userSkills` in ~/.upup/settings.json
 *   enable-all | disable-all                convenience aliases around set-policy
 *   help                                   print usage
 *
 * Source paths mirror Pi's resource loader + UpUp's `packages/pi-*` layout,
 * so what users see here is exactly what `brand-extension#applyAmbientSkillFilter`
 * sees at every `before_agent_start`. No new discovery rules — pure read.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { resolveAgentDir } from '@upup/pi-resource-composition';
import {
  USER_SKILLS_ENV_VAR,
  USER_SKILLS_SETTING_KEY,
  type UpUpSkillScopePolicy,
} from '@upup/pi-session';
import { getSetting, setSetting } from '@upup/utils';

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

export type SkillSubCommand = 'list' | 'scope' | 'set-policy' | 'enable-all' | 'disable-all' | 'help';

export interface SkillCommandOptions {
  command: SkillSubCommand;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
}

export interface SkillRunResult {
  readonly exitCode: number;
  readonly message: string;
}

const VALID_POLICIES: readonly UpUpSkillScopePolicy[] = ['include', 'exclude', 'whitelist-only'];

function isValidPolicy(value: string): value is UpUpSkillScopePolicy {
  return (VALID_POLICIES as readonly string[]).includes(value);
}

interface SkillEntry {
  readonly name: string;
  readonly source: 'upup-pkg' | 'upup-agent' | 'user-home';
  readonly path: string;
}

interface SkillScanResult {
  readonly upup: readonly SkillEntry[];
  readonly ambient: readonly SkillEntry[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
}

const SKILL_NAME_RE = /^SKILL\.md$/i;

function listSkillDirs(rootDir: string): readonly string[] {
  if (!existsSync(rootDir)) return [];
  let stat;
  try {
    stat = statSync(rootDir);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];
  let entries;
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name);
}

function readSkillsFromDir(rootDir: string, source: SkillEntry['source']): readonly SkillEntry[] {
  const out: SkillEntry[] = [];
  for (const name of listSkillDirs(rootDir)) {
    const skillPath = join(rootDir, name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    out.push({ name, source, path: skillPath });
  }
  return out;
}

function scanRepoSkills(repoRoot: string): readonly SkillEntry[] {
  if (!existsSync(repoRoot)) return [];
  const packagesDir = join(repoRoot, 'packages');
  if (!existsSync(packagesDir)) return [];
  let entries;
  try {
    entries = readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SkillEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('pi-')) continue;
    const skillsRoot = join(packagesDir, entry.name, 'skills');
    out.push(...readSkillsFromDir(skillsRoot, 'upup-pkg'));
  }
  return out;
}

/**
 * Walk upward from `cwd` looking for a `packages/` directory that holds
 * `pi-*` workspaces. Returns the directory containing the `packages/`
 * folder, or `null` when none is found within 6 levels. Used to find the
 * repo root even when the user invokes the CLI from a subdirectory.
 */
function findRepoRoot(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'packages')) && existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function effectivePolicy(env: NodeJS.ProcessEnv = process.env): {
  policy: UpUpSkillScopePolicy;
  source: 'env' | 'settings' | 'default';
} {
  const fromEnv = env[USER_SKILLS_ENV_VAR]?.trim();
  if (fromEnv && isValidPolicy(fromEnv)) {
    return { policy: fromEnv, source: 'env' };
  }
  let configured: string | undefined;
  try {
    configured = getSetting<string>(USER_SKILLS_SETTING_KEY, '') || undefined;
  } catch {
    configured = undefined;
  }
  if (configured && isValidPolicy(configured)) {
    return { policy: configured, source: 'settings' };
  }
  return { policy: 'exclude', source: 'default' };
}

function scanSkills(opts: { cwd: string; home: string; agentDir: string }): SkillScanResult {
  const home = opts.home;
  const repoRoot = findRepoRoot(opts.cwd);
  const userSkillsDir = join(home, '.agents', 'skills');
  const upupAgentSkillsDir = join(opts.agentDir, 'skills');
  const skipped: { path: string; reason: string }[] = [];

  let upupFromRepo: readonly SkillEntry[] = [];
  if (repoRoot) {
    try {
      upupFromRepo = scanRepoSkills(repoRoot);
    } catch (err) {
      skipped.push({ path: join(repoRoot, 'packages'), reason: `scan failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  } else {
    skipped.push({ path: '<repo>/packages', reason: 'no UpUp workspace found above cwd (walked 6 levels)' });
  }

  const upupFromAgent = readSkillsFromDir(upupAgentSkillsDir, 'upup-agent');
  const ambient = readSkillsFromDir(userSkillsDir, 'user-home');

  return {
    upup: [...upupFromRepo, ...upupFromAgent].sort((a, b) => a.name.localeCompare(b.name)),
    ambient: ambient.slice().sort((a, b) => a.name.localeCompare(b.name)),
    skipped,
  };
}

function parseScope(value: string | undefined): 'upup' | 'user' | 'ambient' | 'all' {
  if (value === undefined || value === '') return 'all';
  const v = value.toLowerCase();
  if (v === 'upup' || v === 'ours' || v === 'internal') return 'upup';
  if (v === 'user' || v === 'ambient' || v === 'home') return 'user';
  if (v === 'all') return 'all';
  fail(`unknown --scope value: ${value} (expected: upup | user | ambient | all)`);
  return 'all';
}

function runList(opts: { cwd: string; home: string; agentDir: string; args: readonly string[] }): SkillRunResult {
  let scopeFilter: 'upup' | 'user' | 'ambient' | 'all' = 'all';
  for (let i = 0; i < opts.args.length; i += 1) {
    const arg = opts.args[i];
    if (arg === '--scope' && opts.args[i + 1] !== undefined) {
      scopeFilter = parseScope(opts.args[i + 1]);
      i += 1;
    } else if (arg?.startsWith('--scope=')) {
      scopeFilter = parseScope(arg.slice('--scope='.length));
    }
  }
  const scan = scanSkills(opts);
  const policy = effectivePolicy(opts.cwd ? { ...process.env } : process.env);
  head('UpUp skill catalog');
  info(`agent dir: ${opts.agentDir}`);
  info(`policy:    ${policy.policy} (${policy.source})${policy.source === 'env' ? ` — ${USER_SKILLS_ENV_VAR} overrides settings.json` : ''}`);
  info(`filter drops every skill whose path is not under <repo>/packages/pi-* or <agentDir>/skills/`);

  if (scopeFilter === 'all' || scopeFilter === 'upup') {
    head('UpUp-owned skills (kept by the ambient filter)');
    if (scan.upup.length === 0) {
      info('(none)');
    } else {
      log(`  ${BOLD}count${RESET}: ${scan.upup.length}`);
      for (const entry of scan.upup) {
        const tag = entry.source === 'upup-pkg' ? '<repo>' : '<agent>';
        log(`  ${GREEN}${entry.name}${RESET} ${DIM}${tag} ${relative(opts.cwd, entry.path)}${RESET}`);
      }
    }
  }
  if (scopeFilter === 'all' || scopeFilter === 'user' || scopeFilter === 'ambient') {
    head('Ambient skills from ~/.agents/skills (filtered by default)');
    if (scan.ambient.length === 0) {
      info('(none — no ~/.agents/skills directory)');
    } else {
      log(`  ${BOLD}count${RESET}: ${scan.ambient.length}`);
      for (const entry of scan.ambient) {
        log(`  ${YELLOW}${entry.name}${RESET} ${DIM}${relative(opts.home, entry.path)}${RESET}`);
      }
      const hint = policy.policy === 'exclude'
        ? `${USER_SKILLS_ENV_VAR}=include 或 upup skill set-policy include`
        : policy.policy === 'whitelist-only'
          ? `unset ${USER_SKILLS_ENV_VAR} 或 upup skill set-policy include`
          : `upup skill set-policy exclude`;
      info(`重新打开 ambient 库：${hint}`);
    }
  }
  if (scan.skipped.length > 0) {
    head('Scan warnings');
    for (const item of scan.skipped) log(`  ${YELLOW}!${RESET} ${item.path}: ${item.reason}`);
  }
  return { exitCode: 0, message: 'listed skills' };
}

function runScope(opts: { env: NodeJS.ProcessEnv }): SkillRunResult {
  const { policy, source } = effectivePolicy(opts.env);
  head('Current skill-scope policy');
  log(`  policy:  ${BOLD}${policy}${RESET}`);
  log(`  source:  ${source === 'env' ? `${USER_SKILLS_ENV_VAR} env var` : source === 'settings' ? '~/.upup/settings.json#' + USER_SKILLS_SETTING_KEY : 'compile-time default'}`);
  const meaning: Record<UpUpSkillScopePolicy, string> = {
    include: 'Pi 默认：~/.agents/skills 全部进入 system prompt（UpUp 仍过滤；此选项关闭 ambient 过滤）',
    exclude: '默认：~/.agents/skills 被 AmbientSkillFilter 屏蔽，仅 UpUp-owned skill 进入 system prompt',
    'whitelist-only': 'exclude + 进一步按 spec.skills 白名单收敛',
  };
  info(meaning[policy]);
  if (source === 'env') {
    info(`${USER_SKILLS_ENV_VAR} 在下次启动时被读取；persist 用 'upup skill set-policy <value>'`);
  }
  return { exitCode: 0, message: 'scope reported' };
}

function runSetPolicy(opts: { args: readonly string[]; policy: string | undefined }): SkillRunResult {
  if (opts.policy === undefined) {
    fail(`set-policy requires one of: ${VALID_POLICIES.join(', ')}`);
    return { exitCode: 1, message: 'missing policy argument' };
  }
  if (!isValidPolicy(opts.policy)) {
    fail(`unknown policy: ${opts.policy} (expected one of ${VALID_POLICIES.join(', ')})`);
    return { exitCode: 1, message: 'invalid policy' };
  }
  const wrote = setSetting(USER_SKILLS_SETTING_KEY, opts.policy);
  if (!wrote) {
    fail('failed to persist ~/.upup/settings.json (see error log above)');
    return { exitCode: 1, message: 'write failed' };
  }
  ok(`persisted userSkills=${opts.policy} in ~/.upup/settings.json`);
  info(`takes effect on the next session start; ${USER_SKILLS_ENV_VAR} still wins if set`);
  return { exitCode: 0, message: `policy=${opts.policy} persisted` };
}

function printHelp(): void {
  head('upup skill — visualise and adjust skill-scope policy');
  log('  Usage:');
  log('    upup skill list [--scope=upup|user|ambient|all]   list skills (default --scope=all)');
  log('    upup skill scope                                  show current policy');
  log('    upup skill set-policy <include|exclude|whitelist-only>');
  log('                                                     persist userSkills in ~/.upup/settings.json');
  log('    upup skill enable-all                             alias for set-policy include');
  log('    upup skill disable-all                            alias for set-policy exclude');
  log('    upup skill help                                   show this message');
  log('');
  log('  Default policy: exclude — ~/.agents/skills is filtered out by AmbientSkillFilter.');
  log('  Ambient entries are still discoverable via `upup skill list --scope=user`.');
}

export async function runSkillCommand(opts: SkillCommandOptions): Promise<SkillRunResult> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const agentDir = resolveAgentDir(cwd, { env, home }).agentDir;

  switch (opts.command) {
    case 'list':
      return runList({ cwd, home, agentDir, args: opts.args });
    case 'scope':
      return runScope({ env });
    case 'set-policy':
      return runSetPolicy({ args: opts.args, policy: opts.args[0] });
    case 'enable-all':
      return runSetPolicy({ args: ['include'], policy: 'include' });
    case 'disable-all':
      return runSetPolicy({ args: ['exclude'], policy: 'exclude' });
    case 'help':
      printHelp();
      return { exitCode: 0, message: 'help printed' };
    default: {
      const exhaustive: never = opts.command;
      void exhaustive;
      printHelp();
      return { exitCode: 1, message: `unknown subcommand` };
    }
  }
}

// Stash relativeTo helpers for testing access without re-exporting the
// whole node:fs surface.
export const __skillTestHooks = {
  isAbsolute,
  join,
  relative,
  existsSync,
  readdirSync,
  statSync,
  SKILL_NAME_RE,
  scanRepoSkills,
  findRepoRoot,
  scanSkills,
  effectivePolicy,
  listSkillDirs,
  readSkillsFromDir,
};
