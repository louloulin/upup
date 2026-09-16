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
 *   5. `~/.upup/agent`          — UpUp canonical home (always, no existence gate)
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

  return { agentDir: upupAgentDirFor(home), source: 'home-upup-agent' };
}
