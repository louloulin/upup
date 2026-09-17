/**
 * Resolve the UpUp agent directory used for Pi global resources and settings.
 *
 * Pi's `DefaultResourceLoader` separates two scopes:
 *   - `agentDir` → global resources (`<agentDir>/{extensions,skills,prompts,themes}/`)
 *                  and `<agentDir>/settings.json`
 *   - `cwd`      → project resources and `.pi/settings.json`
 *
 * UpUp is the product and Pi is the embedded runtime, so UpUp owns its own
 * global home: **`~/.upup/agent`**. Pi resolves that same path through the
 * `PI_CODING_AGENT_DIR` env var (`getAgentDir()` in `config.js`), which the
 * UpUp entry points set from this helper before importing any Pi module.
 *
 * Precedence (highest first):
 *   1. `override` option        — explicit caller override (tests, embedding)
 *   2. `UPUP_AGENT_DIR`         — canonical UpUp override
 *   3. `UPUP_CODING_AGENT_DIR`  — Pi-style name (`${APP_NAME}_CODING_AGENT_DIR`)
 *   4. `PI_CODING_AGENT_DIR`    — a user who already points Pi somewhere wins
 *   5. `UPUP_HOME`              — relocates the whole home → `<UPUP_HOME>/agent`
 *   6. `~/.upup/agent`          — UpUp canonical home (always, no existence gate)
 *
 * `~/.pi/agent` is deliberately **not** in the fallback chain: UpUp's home is
 * deterministic rather than dependent on which directories happen to exist.
 * Existing Pi configuration is carried over once, on first launch, by
 * `bootstrapUpupAgent()` (see `@upup/pi-app/bootstrap-agent`) and can be
 * re-run any time with `upup openbuddy migrate`.
 */

import { homedir as osHomedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export interface ResolveAgentDirOptions {
  /** Explicit override; wins over every env-var path. */
  readonly override?: string;
  /** Caller-supplied environment (defaults to `process.env` for tests). */
  readonly env?: NodeJS.ProcessEnv;
  /** Caller-supplied home directory (defaults to `os.homedir()`). Tests use this. */
  readonly home?: string;
}

export interface ResolveAgentDirResult {
  /** Absolute path to use as `agentDir` for the Pi resource loader. */
  readonly agentDir: string;
  /** Which source won the precedence order; surfaces the choice in logs. */
  readonly source:
    | 'override'
    | 'upup-env'
    | 'pi-canonical-env'
    | 'pi-agent-dir-env'
    | 'upup-home-env'
    | 'home-upup-agent';
}

function normalizePath(value: string): string {
  return resolve(isAbsolute(value) ? value : `~/${value.replace(/^~/, '')}`);
}

/** The canonical UpUp global agent home: `<home>/.upup/agent`. */
export function upupAgentDirFor(home: string = osHomedir()): string {
  return join(home, '.upup', 'agent');
}

export function resolveAgentDir(
  _cwd: string = process.cwd(),
  options: ResolveAgentDirOptions = {},
): ResolveAgentDirResult {
  const env = options.env ?? process.env;
  const home = options.home ?? osHomedir();

  if (options.override) {
    return { agentDir: normalizePath(options.override), source: 'override' };
  }

  const upupEnv = env.UPUP_AGENT_DIR?.trim();
  if (upupEnv) {
    return { agentDir: normalizePath(upupEnv), source: 'upup-env' };
  }

  const piStyleEnv = env.UPUP_CODING_AGENT_DIR?.trim();
  if (piStyleEnv) {
    return { agentDir: normalizePath(piStyleEnv), source: 'pi-canonical-env' };
  }

  const piEnv = env.PI_CODING_AGENT_DIR?.trim();
  if (piEnv) {
    return { agentDir: normalizePath(piEnv), source: 'pi-agent-dir-env' };
  }

  // `UPUP_HOME` relocates the entire UpUp home, so the agent dir follows it.
  // Without this the test preload and every sandboxed `$UPUP_HOME` run would
  // resolve back to the developer's real `~/.upup/agent`.
  const upupHome = env.UPUP_HOME?.trim();
  if (upupHome) {
    return { agentDir: join(normalizePath(upupHome), 'agent'), source: 'upup-home-env' };
  }

  return { agentDir: upupAgentDirFor(home), source: 'home-upup-agent' };
}

/**
 * Env var names Pi resolves `getAgentDir()` from.
 *
 * Pi derives this from its own package.json (`ENV_AGENT_DIR =
 * `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR``), and `APP_NAME` comes from
 * `piConfig.name`. UpUp ships as `piConfig.name = "upup"` (see
 * `patches/@earendil-works%2Fpi-coding-agent@0.85.1.patch`), so **the name Pi
 * actually reads is `UPUP_CODING_AGENT_DIR`, not `PI_CODING_AGENT_DIR`**.
 *
 * Getting this wrong is not cosmetic: publishing only the legacy
 * `PI_CODING_AGENT_DIR` makes Pi fall through to `~/.upup/agent`, so every
 * `$UPUP_HOME`-isolated process (tests, sandboxes, embedded runs) silently
 * writes to the developer's real home. Publish **both** names so UpUp works
 * with the rebranded package and with a stock Pi install.
 */
export const PI_AGENT_DIR_ENV_NAMES = ['UPUP_CODING_AGENT_DIR', 'PI_CODING_AGENT_DIR'] as const;

/** Env var names Pi resolves its session dir from (same `APP_NAME` prefix). */
export const PI_SESSION_DIR_ENV_NAMES = ['UPUP_CODING_AGENT_SESSION_DIR', 'PI_CODING_AGENT_SESSION_DIR'] as const;

export interface PublishPiAgentDirOptions {
  /** Target environment; defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Directory to publish; defaults to `resolveAgentDir(cwd, { env }).agentDir`. */
  readonly agentDir?: string;
  /** Working directory used when `agentDir` is not supplied. */
  readonly cwd?: string;
  /** Home directory used when `agentDir` is not supplied (tests use this). */
  readonly home?: string;
  /**
   * Also publish `<agentDir>/sessions` as the Pi session dir. Off by default:
   * Pi derives it from the agent dir anyway, and an explicit value would
   * override a user's own session-dir choice.
   */
  readonly sessionDir?: string;
}

/**
 * Publish `agentDir` to every env var name Pi may read for `getAgentDir()`.
 *
 * Idempotent, and never clobbers a value the caller already set explicitly —
 * a user who exports `PI_CODING_AGENT_DIR` keeps that directory. Returns the
 * directory that was published (resolved when omitted).
 *
 * Must be called **before any `@earendil-works/pi-*` module is imported**;
 * Pi reads the env var at module-init time.
 */
export function publishPiAgentDirEnv(options: PublishPiAgentDirOptions = {}): string {
  const env = options.env ?? process.env;
  const agentDir =
    options.agentDir ??
    resolveAgentDir(options.cwd ?? process.cwd(), {
      env,
      ...(options.home ? { home: options.home } : {}),
    }).agentDir;

  for (const name of PI_AGENT_DIR_ENV_NAMES) {
    if (!env[name]?.trim()) env[name] = agentDir;
  }
  if (options.sessionDir) {
    for (const name of PI_SESSION_DIR_ENV_NAMES) {
      if (!env[name]?.trim()) env[name] = options.sessionDir;
    }
  }
  return agentDir;
}
