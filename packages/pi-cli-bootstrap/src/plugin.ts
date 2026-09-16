/**
 * Plugin Command — `upup plugin`
 *
 * Thin wrapper around Pi's `DefaultPackageManager` so UpUp can install / list
 * / uninstall / update the same Pi packages that the Pi CLI handles, without
 * forcing the user to switch tools.
 *
 * Source strings follow Pi's format:
 *   - npm:pkg[@version]
 *   - git:https://github.com/<owner>/<repo>[#ref]
 *   - ./relative/local/path
 *   - /absolute/local/path
 *
 * The package manager writes its package list into SettingsManager, which is
 * persisted into `<agentDir>/settings.json`. We resolve the agentDir via
 * `@upup/pi-resource-composition.resolveAgentDir` so this command lines up
 * with whatever UpUp's runtime will use on the next startup.
 */

import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveAgentDir } from '@upup/pi-resource-composition';
import { DefaultPackageManager, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { startAgentDirWatcher, type SettingsWatcherEvent } from '@upup/pi-resource-composition';
import { UPUP_RECOMMENDED_PLUGINS, UPUP_KNOWN_PROBLEMATIC_PLUGINS, groupRecommendedByCategory } from './recommended-plugins';

// ConfiguredPackage is declared in pi-coding-agent's package-manager.d.ts but
// not re-exported from its main index. Use a structural mirror to avoid pulling
// a deep path (which would couple us to internal layout).
interface ConfiguredPackage {
  source: string;
  scope: 'user' | 'project';
  filtered: boolean;
  installedPath?: string;
}

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

export interface PluginCommandOptions {
  command: 'install' | 'list' | 'uninstall' | 'update' | 'reload' | 'watch' | 'recommend' | 'enable' | 'disable' | 'help';
  args: string[];
  env?: NodeJS.ProcessEnv;
  home?: string;
  cwd?: string;
}

export interface PluginRunResult {
  exitCode: number;
  message: string;
}

export interface PluginProgress {
  readonly action: 'install' | 'remove' | 'update' | 'clone' | 'pull';
  readonly phase: 'start' | 'progress' | 'complete' | 'error';
  readonly source: string;
  readonly detail?: string;
}

function ensureAgentDir(agentDir: string): void {
  if (!existsSync(agentDir)) {
    mkdirSync(agentDir, { recursive: true });
  }
}

function buildManager(opts: { env: NodeJS.ProcessEnv; home: string; cwd: string }): {
  manager: DefaultPackageManager;
  agentDir: string;
  agentDirSource: string;
} {
  const resolved = resolveAgentDir(opts.cwd, { env: opts.env, home: opts.home });
  ensureAgentDir(resolved.agentDir);
  const settingsManager = SettingsManager.create(opts.cwd, resolved.agentDir);
  const manager = new DefaultPackageManager({
    cwd: opts.cwd,
    agentDir: resolved.agentDir,
    settingsManager,
  });
  return { manager, agentDir: resolved.agentDir, agentDirSource: resolved.source };
}

function formatPackageList(packages: ReadonlyArray<ConfiguredPackage>): string {
  if (packages.length === 0) return `${DIM}  (none)${RESET}`;
  const sorted = [...packages].sort((a, b) => a.source.localeCompare(b.source));
  return sorted
    .map((pkg) => {
      const isBuiltin = pkg.source.startsWith('builtin:');
      const scopeLabel = isBuiltin ? 'builtin' : pkg.scope;
      let installed: string;
      if (isBuiltin) {
        // builtin: sources ship with the binary — they live in node_modules.
        // Pi's DefaultPackageManager reports installedPath=undefined for them
        // (it only knows npm/git/local), so we rephrase the status to avoid
        // misleading "not installed" output for packages that ARE on disk.
        installed = pkg.installedPath
          ? `${DIM}${pkg.installedPath}${RESET}`
          : `${GREEN}bundled${RESET}`;
      } else {
        installed = pkg.installedPath ? `${DIM}${pkg.installedPath}${RESET}` : `${YELLOW}not installed${RESET}`;
      }
      return `  ${BOLD}${pkg.source}${RESET} [${scopeLabel}] ${installed}`;
    })
    .join('\n');
}

function parseSource(source: string): { kind: 'npm' | 'git' | 'local'; raw: string } {
  if (source.startsWith('npm:') || source.startsWith('git:')) {
    return { kind: source.startsWith('npm:') ? 'npm' : 'git', raw: source };
  }
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../') || source.startsWith('~/')) {
    return { kind: 'local', raw: source };
  }
  // Bare spec → treat as npm package (Pi convention: npm:<pkg> is the canonical form).
  return { kind: 'npm', raw: `npm:${source}` };
}

async function runInstall(args: string[], opts: { env: NodeJS.ProcessEnv; home: string; cwd: string }): Promise<PluginRunResult> {
  if (args.length === 0) {
    fail('install requires at least one source argument');
    return { exitCode: 1, message: 'missing source' };
  }
  const local = args.includes('--local') || args.includes('--project');
  const noReload = args.includes('--no-reload');
  const noNotifyBridge = args.includes('--no-notify-bridge');
  const sources = args.filter((arg) => !arg.startsWith('--'));
  const { manager, agentDir, agentDirSource } = buildManager(opts);
  head('Plugin install');
  info(`agentDir (${agentDirSource}): ${agentDir}`);
  for (const source of sources) {
    const { raw } = parseSource(source);
    try {
      await manager.installAndPersist(raw, { local });
      ok(`installed ${raw}${local ? ' (project)' : ''}`);
    } catch (err) {
      fail(`install failed: ${raw}`);
      info(err instanceof Error ? err.message : String(err));
      return { exitCode: 1, message: 'install failed' };
    }
  }
  if (!noReload) await reloadAndReport(opts, { source: 'install', noNotifyBridge });
  return { exitCode: 0, message: 'install ok' };
}

function runList(opts: { env: NodeJS.ProcessEnv; home: string; cwd: string }): PluginRunResult {
  const { manager, agentDir, agentDirSource } = buildManager(opts);
  head('Plugin list');
  info(`agentDir (${agentDirSource}): ${agentDir}`);
  const packages = manager.listConfiguredPackages();
  log(formatPackageList(packages));
  return { exitCode: 0, message: 'list printed' };
}

async function runUninstall(args: string[], opts: { env: NodeJS.ProcessEnv; home: string; cwd: string }): Promise<PluginRunResult> {
  if (args.length === 0) {
    fail('uninstall requires at least one source argument');
    return { exitCode: 1, message: 'missing source' };
  }
  const local = args.includes('--local') || args.includes('--project');
  const noReload = args.includes('--no-reload');
  const noNotifyBridge = args.includes('--no-notify-bridge');
  const sources = args.filter((arg) => !arg.startsWith('--'));
  const { manager, agentDir, agentDirSource } = buildManager(opts);
  head('Plugin uninstall');
  info(`agentDir (${agentDirSource}): ${agentDir}`);
  for (const source of sources) {
    const { raw } = parseSource(source);
    try {
      const removed = await manager.removeAndPersist(raw, { local });
      if (removed) ok(`uninstalled ${raw}`);
      else warn(`${raw} was not configured`);
    } catch (err) {
      fail(`uninstall failed: ${raw}`);
      info(err instanceof Error ? err.message : String(err));
      return { exitCode: 1, message: 'uninstall failed' };
    }
  }
  if (!noReload) await reloadAndReport(opts, { source: 'uninstall', noNotifyBridge });
  return { exitCode: 0, message: 'uninstall ok' };
}

async function runRecommend(): Promise<PluginRunResult> {
  head('UpUp 推荐 Pi extension 插件清单');
  info('每个插件独立安装；不在推荐清单内的 npm 包默认 autoload=false，避免污染 system prompt。');
  info('安装：upup plugin install <source>');
  log('');
  const grouped = groupRecommendedByCategory();
  const order: Array<keyof typeof grouped> = ['web', 'mcp', 'subagent', 'memory', 'background', 'workflow', 'interaction', 'provider'];
  for (const cat of order) {
    const plugins = grouped[cat];
    if (plugins.length === 0) continue;
    log(`${BOLD}${cat.toUpperCase()}${RESET}`);
    for (const p of plugins) {
      log(`  ${GREEN}${p.source}${RESET}`);
      log(`    ${p.description}`);
      if (p.caveats.length > 0) {
        for (const c of p.caveats) log(`    ${YELLOW}!${RESET} ${DIM}${c}${RESET}`);
      }
    }
    log('');
  }
  if (UPUP_KNOWN_PROBLEMATIC_PLUGINS.length > 0) {
    log(`${YELLOW}${BOLD}已知与 UpUp 不兼容${RESET}`);
    for (const p of UPUP_KNOWN_PROBLEMATIC_PLUGINS) {
      log(`  ${RED}${p.source}${RESET}`);
      for (const c of p.caveats) log(`    ${DIM}- ${c}${RESET}`);
    }
    log('');
  }
  return { exitCode: 0, message: 'recommend printed' };
}

async function runToggleAutoload(
  source: string,
  enable: boolean,
  ctx: { env: NodeJS.ProcessEnv; home: string; cwd: string },
): Promise<PluginRunResult> {
  const { agentDir } = buildManager(ctx);
  const settingsPath = join(agentDir, 'settings.json');
  if (!existsSync(settingsPath)) {
    fail(`settings.json not found at ${settingsPath}`);
    return { exitCode: 1, message: 'settings not found' };
  }
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { packages?: unknown[] };
  const packages = Array.isArray(settings.packages) ? settings.packages : [];
  // 模糊匹配：用户输入可能是 `npm:@pi/foo` 或 `builtin:@upup/pi-foo` 或
  // `pi-foo` —— 我们匹配 packages 数组里的 source 包含用户的 query 即可。
  const needle = source.replace(/^npm:/, '').replace(/^builtin:/, '').toLowerCase();
  let mutated = false;
  let matchedDisplay = '';
  const next = packages.map((entry) => {
    const entrySource = typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).source === 'string'
        ? (entry as Record<string, unknown>).source as string
        : '';
    if (!entrySource) return entry;
    const haystack = entrySource.toLowerCase();
    if (!haystack.includes(needle)) return entry;
    matchedDisplay = entrySource;
    if (typeof entry === 'string') {
      mutated = true;
      return { source: entry, autoload: enable };
    }
    const obj = entry as Record<string, unknown>;
    if (obj.autoload === enable) return entry;
    mutated = true;
    return { ...obj, autoload: enable };
  });
  if (!mutated) {
    warn(`${source} 不在 settings.json 的 packages 数组中`);
    info('先 `upup plugin install <source>` 安装');
    info('列出已装：`upup plugin list`');
    info('推荐安装：`upup plugin recommend`');
    return { exitCode: 1, message: 'source not installed' };
  }
  writeFileSync(settingsPath, JSON.stringify({ ...settings, packages: next }, null, 2) + '\n', 'utf8');
  ok(`${matchedDisplay} ${enable ? '已启用（autoload=true）' : '已禁用（autoload=false）'}`);
  return { exitCode: 0, message: enable ? 'enabled' : 'disabled' };
}

async function runUpdate(args: string[], opts: { env: NodeJS.ProcessEnv; home: string; cwd: string }): Promise<PluginRunResult> {
  const noReload = args.includes('--no-reload');
  const noNotifyBridge = args.includes('--no-notify-bridge');
  const sources = args.filter((arg) => !arg.startsWith('--'));
  const { manager, agentDir, agentDirSource } = buildManager(opts);
  head('Plugin update');
  info(`agentDir (${agentDirSource}): ${agentDir}`);
  if (sources.length === 0) {
    try {
      await manager.update();
      ok('updated all configured packages');
      return { exitCode: 0, message: 'update all ok' };
    } catch (err) {
      fail('update failed');
      info(err instanceof Error ? err.message : String(err));
      return { exitCode: 1, message: 'update failed' };
    }
  }
  for (const source of sources) {
    const { raw } = parseSource(source);
    try {
      await manager.update(raw);
      ok(`updated ${raw}`);
    } catch (err) {
      fail(`update failed: ${raw}`);
      info(err instanceof Error ? err.message : String(err));
      return { exitCode: 1, message: 'update failed' };
    }
  }
  if (!noReload) await reloadAndReport(opts, { source: 'update', noNotifyBridge });
  return { exitCode: 0, message: 'update ok' };
}

/**
 * Re-discover resources after a settings.json change. Mirrors `runReload` but
 * runs silently (no header) so install/uninstall/update can report counts
 * inline. Failures are surfaced but never block the lifecycle operation.
 */
async function reloadAndReport(
  opts: { env: NodeJS.ProcessEnv; home: string; cwd: string },
  reloadOpts: { source: 'install' | 'uninstall' | 'update'; noNotifyBridge: boolean } = {
    source: 'install',
    noNotifyBridge: false,
  },
): Promise<void> {
  const resolved = resolveAgentDir(opts.cwd, { env: opts.env, home: opts.home });
  try {
    ensureAgentDir(resolved.agentDir);
  } catch {
    return;
  }
  const settingsManager = SettingsManager.create(opts.cwd, resolved.agentDir);
  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: resolved.agentDir,
    settingsManager,
  });
  let reloadOk = false;
  try {
    await loader.reload();
    const themesApi = (loader as unknown as { getThemes?(): { themes: unknown[] } }).getThemes;
    const counts = {
      extensions: loader.getExtensions().extensions.length,
      skills: loader.getSkills().skills.length,
      prompts: loader.getPrompts().prompts.length,
      themes: typeof themesApi === 'function' ? themesApi.call(loader).themes.length : 0,
    };
    info(`extensions: ${counts.extensions}`);
    info(`skills:     ${counts.skills}`);
    info(`prompts:    ${counts.prompts}`);
    info(`themes:     ${counts.themes}`);
    reloadOk = true;
  } catch (err) {
    warn(`reload after lifecycle op failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (reloadOk && !reloadOpts.noNotifyBridge) {
    await notifyBridgeAfterReload(opts.env ?? process.env, reloadOpts.source);
  }
}

/**
 * Best-effort POST to `/bridge/notify-reload` after a successful reload, so a
 * long-running TUI / CLI session can re-discover the new resources without
 * restart. Returns silently when:
 *   - `UPBRIDGE_TOKEN` is not configured (no bridge to wake);
 *   - the bridge is unreachable (network error / non-2xx / timeout).
 *
 * The lifecycle op has already succeeded, so this never throws.
 */
async function notifyBridgeAfterReload(
  env: NodeJS.ProcessEnv,
  source: 'install' | 'uninstall' | 'update',
): Promise<void> {
  const token = env.UPBRIDGE_TOKEN;
  if (!token) return;
  const portRaw = env.UPBRIDGE_PORT;
  const port =
    typeof portRaw === 'string' && /^\d+$/.test(portRaw) ? Number.parseInt(portRaw, 10) : 9090;
  const baseUrl = env.UPBRIDGE_BASE_URL ?? `http://127.0.0.1:${port}`;
  const url = `${baseUrl.replace(/\/+$/, '')}/bridge/notify-reload?token=${encodeURIComponent(token)}`;
  const body = JSON.stringify({ triggeredBy: `upup-plugin-${source}` });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    });
    if (response.ok) {
      info('bridge notified (notify-reload)');
    } else {
      warn(`bridge notify-reload returned ${response.status}`);
    }
  } catch (err) {
    warn(`bridge notify-reload failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build chord facet records for every configured package so `reload` can report
 * facet-level composition, not just resource counts.
 *
 * Failures here are non-fatal: a package whose manifest cannot be read (e.g. a
 * git source that was never materialised) is reported and skipped, because the
 * resource reload above is the authoritative outcome.
 */
interface InstalledPackageFacts {
  readonly path: string;
  readonly name: string;
  readonly version: string;
  readonly source: string;
}

function readInstalledFacts(installedPath: string): Pick<InstalledPackageFacts, 'name' | 'version' | 'source'> | undefined {
  const manifestPath = join(installedPath, 'package.json');
  if (!existsSync(manifestPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: unknown;
      version?: unknown;
      pi?: { source?: unknown };
    };
    if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string') return undefined;
    const source = typeof parsed.pi?.source === 'string' ? parsed.pi.source : 'builtin:upup';
    return { name: parsed.name, version: parsed.version, source };
  } catch {
    return undefined;
  }
}

async function buildFacetRecords(
  manager: DefaultPackageManager,
  agentDir: string,
  cwd: string,
): Promise<{
  records: Awaited<ReturnType<typeof import('@upup/pi-resource-composition').PiPackageCatalog.prototype.listEnabled>>;
  skipped: readonly string[];
}> {
  const { PiPackageCatalog } = await import('@upup/pi-resource-composition');
  const catalog = new PiPackageCatalog();
  const skipped: string[] = [];

  // Collect the on-disk identity of every installed package first: the catalog
  // requires the trust policy to pin exactly the version it finds, and the
  // authoritative version is the one on disk (that IS the installed pin).
  const facts: InstalledPackageFacts[] = [];
  for (const entry of manager.listConfiguredPackages()) {
    if (!entry.installedPath) {
      skipped.push(`${entry.source} (not installed)`);
      continue;
    }
    const identity = readInstalledFacts(entry.installedPath);
    if (!identity) {
      skipped.push(`${entry.source} (no readable package.json)`);
      continue;
    }
    facts.push({ path: entry.installedPath, ...identity });
  }

  const pinnedPackages: Record<string, string> = {};
  const allowedSources: Record<string, string[]> = {};
  for (const fact of facts) {
    pinnedPackages[fact.name] = fact.version;
    allowedSources[fact.name] = [...(allowedSources[fact.name] ?? []), fact.source];
  }

  for (const fact of facts) {
    try {
      catalog.register(
        fact.path,
        { trustedPaths: [fact.path], pinnedPackages, allowedSources },
        cwd,
        { deferCommandValidation: true },
      );
    } catch (err) {
      skipped.push(`${fact.name} (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  void agentDir;
  return { records: catalog.listEnabled(), skipped };
}

async function runReload(opts: { env: NodeJS.ProcessEnv; home: string; cwd: string }): Promise<PluginRunResult> {
  const resolved = resolveAgentDir(opts.cwd, { env: opts.env, home: opts.home });
  ensureAgentDir(resolved.agentDir);
  const settingsManager = SettingsManager.create(opts.cwd, resolved.agentDir);
  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: resolved.agentDir,
    settingsManager,
  });
  head('Plugin reload');
  info(`agentDir (${resolved.source}): ${resolved.agentDir}`);
  try {
    await loader.reload();
    const themesApi = (loader as unknown as { getThemes?(): { themes: unknown[] } }).getThemes;
    const counts = {
      extensions: loader.getExtensions().extensions.length,
      skills: loader.getSkills().skills.length,
      prompts: loader.getPrompts().prompts.length,
      themes: typeof themesApi === 'function' ? themesApi.call(loader).themes.length : 0,
    };
    ok('reload complete');
    info(`extensions: ${counts.extensions}`);
    info(`skills:     ${counts.skills}`);
    info(`prompts:    ${counts.prompts}`);
    info(`themes:     ${counts.themes}`);

    // Facet-level composition: proves the chord bridge is live, not just tested.
    const manager = new DefaultPackageManager({ cwd: opts.cwd, agentDir: resolved.agentDir, settingsManager });
    const built = await buildFacetRecords(manager, resolved.agentDir, opts.cwd);
    for (const reason of built.skipped) warn(`facet skipped: ${reason}`);
    if (built.records.length > 0) {
      const { createUpUpFacetHost } = await import('@upup/pi-resource-composition');
      const host = await createUpUpFacetHost(built.records);
      try {
        const inventory = host.inventory();
        ok(`chord facets mounted: ${inventory.length}`);
        for (const plugin of inventory) {
          info(`facet ${plugin.id} v${plugin.version} [${plugin.lifecycleScope}]`);
        }
      } finally {
        await host.dispose();
      }
    } else {
      info('chord facets mounted: 0 (no configured packages)');
    }
    return { exitCode: 0, message: 'reload ok' };
  } catch (err) {
    fail('reload failed');
    info(err instanceof Error ? err.message : String(err));
    return { exitCode: 1, message: 'reload failed' };
  }
}


async function runWatch(
  ctx: { env: NodeJS.ProcessEnv; home: string; cwd: string },
  args: readonly string[],
): Promise<PluginRunResult> {
  const maxEvents = parseIntFlag(args, '--exit-after');
  const pollMsRaw = parseIntFlag(args, '--poll');
  const resolved = resolveAgentDir(ctx.cwd, { env: ctx.env, home: ctx.home });
  ensureAgentDir(resolved.agentDir);
  if (!existsSync(resolved.agentDir)) {
    fail(`agentDir does not exist: ${resolved.agentDir}`);
    return { exitCode: 1, message: 'agentDir missing' };
  }
  head('Plugin watch');
  info(`agentDir (${resolved.source}): ${resolved.agentDir}`);
  info('Watching settings.json — Ctrl+C to stop.');
  let triggered = 0;
  let resolveWait: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => { resolveWait = resolve; });
  const stop = (): void => {
    handle.close();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    resolveWait?.();
  };
  const onSignal = (): void => stop();
  const handle = startAgentDirWatcher(
    {
      agentDir: resolved.agentDir,
      ...(maxEvents !== undefined ? { maxEvents } : {}),
      ...(pollMsRaw !== undefined ? { pollMs: pollMsRaw } : {}),
    },
    async (event: SettingsWatcherEvent) => {
      triggered += 1;
      const result = await runReload(ctx);
      void event.settingsPath;
      if (result.exitCode !== 0) {
        warn(`reload after mutation ${triggered} failed`);
      } else {
        ok(`reload #${triggered} complete after settings.json mutation`);
      }
      if (maxEvents !== undefined && triggered >= maxEvents) {
        // Drain the reload, then close.
        setImmediate(stop);
      }
    },
  );
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  await wait;
  ok(`watch stopped after ${triggered} reload${triggered === 1 ? '' : 's'}`);
  return { exitCode: 0, message: 'watch stopped' };
}

function parseIntFlag(args: readonly string[], flag: string): number | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag) {
      const next = args[i + 1];
      if (next && /^\d+$/.test(next)) return Number.parseInt(next, 10);
      return 1;
    }
    if (arg.startsWith(`${flag}=`)) {
      const value = arg.slice(flag.length + 1);
      if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
    }
  }
  return undefined;
}

function printHelp(): void {
  log(`
${BOLD}upup plugin${RESET} — manage Pi packages (extensions/skills/prompts/themes)

${BOLD}Usage${RESET}
  upup plugin install <source> [...] [--local]
  upup plugin uninstall <source> [...] [--local]
  upup plugin list
  upup plugin update [<source> ...]
  upup plugin help

${BOLD}Source formats${RESET}
  npm:pkg[@version]              e.g. npm:@acme/invest-plugin
  git:<url>[#ref]                e.g. git:https://github.com/acme/invest.git
  /abs/path | ./rel/path | ~/…   e.g. ./plugins/local-skill

${BOLD}Flags${RESET}
  --local / --project            Persist into project settings (defaults to user ~/.upup/agent)
  --no-reload                    Skip auto-reload after install/uninstall/update
  --no-notify-bridge             Skip POST /bridge/notify-reload after reload (default: notify when UPBRIDGE_TOKEN is set)

${BOLD}Examples${RESET}
  upup plugin install npm:@pi-community/finance-extensions
  upup plugin install ./plugins/my-skill --local
  upup plugin list
  upup plugin update
  upup plugin reload                Re-discover installed packages without restart
  upup plugin watch [--exit-after=N]  Auto-reload on settings.json mutations
  upup plugin uninstall npm:@pi-community/finance-extensions
`);
}

export async function runPluginCommand(opts: PluginCommandOptions): Promise<PluginRunResult> {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const ctx = { env, home, cwd };
  switch (opts.command) {
    case 'install':
      return runInstall(opts.args, ctx);
    case 'list':
      return runList(ctx);
    case 'uninstall':
      return runUninstall(opts.args, ctx);
    case 'update':
      return runUpdate(opts.args, ctx);
    case 'reload':
      return runReload(ctx);
    case 'watch':
      return runWatch(ctx, opts.args);
    case 'recommend':
      return runRecommend();
    case 'enable':
      if (opts.args.length === 0) {
        fail('enable requires a source argument');
        return { exitCode: 1, message: 'missing source' };
      }
      return runToggleAutoload(opts.args[0], true, ctx);
    case 'disable':
      if (opts.args.length === 0) {
        fail('disable requires a source argument');
        return { exitCode: 1, message: 'missing source' };
      }
      return runToggleAutoload(opts.args[0], false, ctx);
    case 'help':
      printHelp();
      return { exitCode: 0, message: 'help printed' };
    default:
      fail(`unknown subcommand: ${opts.command}`);
      printHelp();
      return { exitCode: 1, message: 'unknown subcommand' };
  }
}
