/**
 * UpUp web launcher — spawns the npm-installed @agegr/pi-web dev server
 * and an UpUp HTTP proxy in front of it.
 *
 * Architecture:
 *   - The web UI itself (Next.js app, React tree, theme, hot reload) is
 *     consumed verbatim from the npm dependency `@agegr/pi-web@0.9.1`.
 *     We do not vendor, fork, or rebuild it.
 *   - A thin Node HTTP proxy sits on the public port. It owns every
 *     `/api/upup/*` request and forwards everything else upstream.
 *   - For `text/html` responses, the proxy injects one <script> tag that
 *     loads our vanilla JS sidecar (web/upup-sidecar.js). No React
 *     bundle, route, or component is touched.
 *
 * This file is the only entry point for `upup web`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishPiAgentDirEnv } from '@upup/pi-resource-composition/agent-dir';
import { startProxyServer, type ProxyOptions } from './proxy-server';

export interface LaunchOptions {
  readonly upupHome?: string;
  readonly publicPort: number;
  readonly upstreamPort: number;
  readonly cwd: string;
  readonly noBrowser?: boolean;
  readonly envOverrides?: Record<string, string>;
}

/**
 * Resolve `@agegr/pi-web` for both dev (`bun run`) and published
 * (`npx upup` / `npm i -g upup`) workflows.
 *
 * Resolution order — checked first match wins:
 *
 *  1. `import.meta.url` chain — `launch.ts` lives in `@upup/upup-web` /
 *     `node_modules/@agegr/pi-web`. When the CLI is published as an npm
 *     package, `@agegr/pi-web` is a runtime dependency and lives at
 *     `<upup>/node_modules/@agegr/pi-web`. Walking up from
 *     `import.meta.url` (or `process.argv[1]` for the bundled CLI) finds
 *     it without any caller cooperation.
 *
 *  2. cwd walk — `bun run src/index.tsx` in the workspace puts
 *     `@agegr/pi-web` at `<repo>/node_modules/@agegr/pi-web`. Walking
 *     up from `process.cwd()` finds it the same way as before.
 *
 *  3. `process.argv[1]`-relative — covers the dist/index.js bundle
 *     sitting next to `node_modules/`, where step 1 already handles it,
 *     but acts as a safety net for unusual layouts.
 *
 * Why the cwd-first approach was wrong: it assumed the user launched
 * `upup web` from inside the same project that installed the CLI, which
 * is the inverse of `npx upup` / global-install workflows where the
 * cwd is the user's own project and `@agegr/pi-web` is in the CLI's
 * own `node_modules/`.
 */
/**
 * Pure resolution logic, separated from the launcher's own module location.
 * Walks each `startDir` upward looking for `node_modules/@agegr/pi-web`;
 * first hit wins. Exported so the test suite can pin the diagnostic
 * without depending on `import.meta.url`.
 */
export function resolvePiWebFrom(startDirs: readonly string[]): string {
  for (const start of startDirs) {
    const found = findNodeModulesAncestor(start);
    if (found) return found;
  }
  throw new Error(
    '@agegr/pi-web not installed. Install it with `npm install -g @agegr/pi-web` ' +
      'or alongside the launching CLI (`upup` depends on it as a peer).',
  );
}

/**
 * Resolve `@agegr/pi-web` for both dev (`bun run`) and published
 * (`npx upup` / `npm i -g upup`) workflows.
 *
 * Resolution order — checked first match wins:
 *
 *  1. `import.meta.url` chain — `launch.ts` lives in `@upup/upup-web` /
 *     `node_modules/@agegr/pi-web`. When the CLI is published as an npm
 *     package, `@agegr/pi-web` is a runtime dependency and lives at
 *     `<upup>/node_modules/@agegr/pi-web`. Walking up from
 *     `import.meta.url` (or `process.argv[1]` for the bundled CLI) finds
 *     it without any caller cooperation.
 *
 *  2. cwd walk — `bun run src/index.tsx` in the workspace puts
 *     `@agegr/pi-web` at `<repo>/node_modules/@agegr/pi-web`. Walking
 *     up from `process.cwd()` finds it the same way as before.
 *
 * Why the cwd-first approach was wrong: it assumed the user launched
 * `upup web` from inside the same project that installed the CLI, which
 * is the inverse of `npx upup` / global-install workflows where the
 * cwd is the user's own project and `@agegr/pi-web` is in the CLI's
 * own `node_modules/`.
 */
export function resolvePiWebDir(cwd: string = process.cwd()): string {
  const launcherFile = (typeof import.meta.url === 'string' ? fileURLToPath(import.meta.url) : null)
    ?? process.argv[1]
    ?? '';
  const launchers: string[] = [];
  if (launcherFile) launchers.push(dirname(launcherFile));
  return resolvePiWebFrom([...launchers, cwd]);
}

/** Walk upward from `start` until a `node_modules/@agegr/pi-web` is found. */
export function findNodeModulesAncestor(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'node_modules', '@agegr', 'pi-web');
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export interface LaunchHandle {
  readonly publicPort: number;
  readonly upstreamPort: number;
  readonly dataDir: string;
  readonly piWebPid: number;
  readonly proxyPid: number;
  stop(): Promise<void>;
}

export function resolveDataDir(opts: { upupHome?: string }): string {
  const env = process.env;
  const fromEnv = env.PI_WEB_DATA_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  const home = resolve(opts.upupHome ?? env.UPUP_HOME?.trim() ?? join(homedir(), '.upup'));
  return join(home, 'web');
}

export async function startUpUpWeb(opts: LaunchOptions): Promise<LaunchHandle> {
  const dataDir = resolveDataDir({ upupHome: opts.upupHome });
  mkdirSync(dataDir, { recursive: true });

  const piWebDir = resolvePiWebDir();
  const upstream = await startUpstream({ ...opts, piWebDir });

  const proxy = await startProxyServer({
    publicPort: opts.publicPort,
    upstreamPort: opts.upstreamPort,
    cwd: opts.cwd,
    dataDir,
  });

  return {
    publicPort: opts.publicPort,
    upstreamPort: opts.upstreamPort,
    dataDir,
    piWebPid: upstream.pid ?? -1,
    proxyPid: proxy.pid,
    async stop() {
      await proxy.close();
      if (!upstream.killed) upstream.kill('SIGTERM');
    },
  };
}

async function startUpstream(opts: LaunchOptions & { readonly piWebDir: string }): Promise<ChildProcess> {
  const piWebDir = opts.piWebDir;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_WEB_PORT: String(opts.upstreamPort),
    PI_WEB_HOSTNAME: '127.0.0.1',
    PI_WEB_NO_OPEN: '1',
    PI_WEB_CWD: opts.cwd,
    PI_WEB_DATA_DIR: resolveDataDir({ upupHome: opts.upupHome }),
    NEXT_TELEMETRY_DISABLED: '1',
    ...opts.envOverrides,
  };
  // Publish the agent dir under **every** env var name the installed Pi build
  // may read (`UPUP_CODING_AGENT_DIR` for the rebranded package), so the web
  // upstream resolves the same home as the launching CLI.
  publishPiAgentDirEnv({
    env,
    agentDir:
      process.env.UPUP_CODING_AGENT_DIR ??
      process.env.PI_CODING_AGENT_DIR ??
      join(resolveDataDir({ upupHome: opts.upupHome }), '..', 'agent'),
  });

  const proc = spawn(
    process.execPath,
    [join(piWebDir, 'bin/pi-web.js')],
    { env, stdio: 'inherit', cwd: piWebDir },
  );
  proc.on('error', (err) => console.error('[upup-web] upstream error', err));
  return proc;
}

if (import.meta.main) {
  const publicPort = Number(process.env.UPUP_WEB_PORT ?? process.argv[2] ?? '9000');
  const upstreamPort = Number(process.env.PI_WEB_PORT ?? '30141');
  const cwd = process.env.UPUP_CWD ?? process.cwd();
  startUpUpWeb({
    publicPort: Number.isFinite(publicPort) ? publicPort : 9000,
    upstreamPort: Number.isFinite(upstreamPort) ? upstreamPort : 30141,
    cwd,
    noBrowser: true,
  })
    .then((handle) => {
      process.stderr.write(`upup-web: public http://127.0.0.1:${handle.publicPort}/ → upstream 127.0.0.1:${handle.upstreamPort} (data ${handle.dataDir})\n`);
    })
    .catch((err) => {
      process.stderr.write(`upup-web: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
