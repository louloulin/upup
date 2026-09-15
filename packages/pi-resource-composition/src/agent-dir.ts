/**
 * Resolve the UpUp agent directory used for Pi global resources and settings.
 *
 * Pi's `DefaultResourceLoader` separates two scopes:
 *   - `agentDir` → global resources (`~/.pi/agent/{extensions,skills,prompts,themes}/`)
 *                  and `~/.pi/agent/settings.json`
 *   - `cwd`      → project resources (`.pi/{extensions,skills,prompts,themes}/`)
 *                  and `.pi/settings.json`
 *
 * Previously UpUp passed `agentDir: cwd`, which collapsed global into project
 * and made the user's `~/.pi/agent/*` invisible. This helper restores the Pi
 * default by checking the explicit env override first, then UpUp's home-level
 * `~/.upup/agent` (the canonical UpUp location), then Pi's `~/.pi/agent`, then
 * the legacy per-cwd `.upup/agent`, and finally falling back to `cwd` so
 * existing behaviour still works in self-contained runs.
 *
 * Env precedence (highest first):
 *   1. `UPUP_AGENT_DIR`        — explicit UpUp override (preferred)
 *   2. `UPUP_CODING_AGENT_DIR` — Pi-style name (matches `${APP_NAME}_CODING_AGENT_DIR`)
 *   3. `~/.upup/agent`         — UpUp canonical home (when it exists)
 *   4. `~/.pi/agent`           — Pi canonical default (when it exists)
 *   5. `<cwd>/.upup/agent`     — legacy UpUp per-cwd location (when it exists)
 *   6. `<cwd>`                 — last-resort fallback (current behaviour)
 *
 * UpUp's home agent dir takes precedence over Pi's because UpUp is the primary
 * application; Pi is the embedded runtime. Users who want Pi-default behaviour
 * can set `UPUP_CODING_AGENT_DIR=~/.pi/agent` explicitly.
 */

import { existsSync } from 'node:fs';
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
    | 'home-upup-agent'
    | 'home-pi-agent'
    | 'cwd-upup-agent'
    | 'cwd-fallback';
}

function normalizePath(value: string): string {
  return resolve(isAbsolute(value) ? value : `~/${value.replace(/^~/, '')}`);
}

export function resolveAgentDir(
  cwd: string = process.cwd(),
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

  const piEnv = env.UPUP_CODING_AGENT_DIR?.trim();
  if (piEnv) {
    return { agentDir: normalizePath(piEnv), source: 'pi-canonical-env' };
  }

  const homeUpupAgent = join(home, '.upup', 'agent');
  if (existsSync(homeUpupAgent)) {
    return { agentDir: homeUpupAgent, source: 'home-upup-agent' };
  }

  const homePiAgent = join(home, '.pi', 'agent');
  if (existsSync(homePiAgent)) {
    return { agentDir: homePiAgent, source: 'home-pi-agent' };
  }

  const cwdUpupAgent = join(cwd, '.upup', 'agent');
  if (existsSync(cwdUpupAgent)) {
    return { agentDir: cwdUpupAgent, source: 'cwd-upup-agent' };
  }

  return { agentDir: resolve(cwd), source: 'cwd-fallback' };
}
