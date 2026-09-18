/**
 * proper-lockfile + Bun Proxy invariant shim.
 *
 * Root cause of the crash (second conversation with `/goal`):
 *
 *   proper-lockfile@4.1.2/lib/mtime-precision.js caches the filesystem's
 *   mtime precision on the `fs` object itself via
 *
 *     Object.defineProperty(fs, cacheSymbol, { value: precision });
 *
 *   The `cacheSymbol` is a fresh `Symbol()` declared at module scope, and
 *   the descriptor is non-configurable + non-writable. Bun wraps each
 *   native `node:fs` binding with a Proxy in `internal/shared.ts#guarded`
 *   so that fs access inside Bun's sandboxed context goes through a
 *   runtime layer. The Proxy `get` trap cannot preserve an arbitrary
 *   Symbol-keyed property it never knew about — the JS engine enforces
 *   the invariant
 *
 *     "Proxy handler's 'get' result of a non-configurable and non-writable
 *      property should be the same value as the target's property"
 *
 *   so the *second* call to `mtimePrecision.probe()` throws and takes the
 *   whole pi process down with `uncaughtException`.
 *
 * Why the second conversation breaks but the first one works:
 *
 *   pi-llmgates-provider's `input-history.js` subscribes to
 *   `pi.on('input')`. Every interactive prompt — including the second
 *   conversation's `/goal`, every `/invest`, every tool call — schedules
 *   `withFileLock → lockfile.lock → mtimePrecision.probe`. The first
 *   prompt of the run writes the cached precision to graceful-fs without
 *   issue (target's property is freshly defined); every subsequent prompt
 *   reads it back and trips the Proxy invariant.
 *
 * Fix:
 *
 *   Replace `mtime-precision.probe` with a wrapper that hands the original
 *   probe a *fresh* per-call fs shim (`Object.create(null)` carrying
 *   graceful-fs's methods bound to graceful-fs). The cacheSymbol lands on
 *   the shim, which is a plain object with no Proxy invariant surface,
 *   so subsequent probes start from undefined and re-probe — a tiny
 *   `utimes`+`stat` per lock acquisition, negligible against the cross-
 *   process file lock we are actually paying for.
 *
 * Two subtleties that made the previous patch a no-op:
 *
 *   1. *Which instance of proper-lockfile.* Bun keeps two independent
 *      copies of proper-lockfile on disk: a global install cache at
 *      `~/.bun/install/cache/proper-lockfile@<v>/` and the user-managed
 *      `npm install` tree at `~/.upup/agent/npm/node_modules/proper-lockfile/`.
 *      pi-llmgates-provider's `import * as lockfile from "proper-lockfile"`
 *      is resolved relative to its own location and lands on the second
 *      one. `createRequire(import.meta.url)` from this file's path lands
 *      on the first one. We anchor the require at pi-llmgates-provider's
 *      own directory so resolution hits the same module instance it does.
 *
 *   2. *Timing.* Pi's `DefaultResourceLoader.reload()` reads
 *      `<agentDir>/settings.json#packages` and dynamically imports each
 *      one *before* any `extensionFactories` entry runs. By the time
 *      `createUpUpEcosystemExtension` mounts, pi-llmgates-provider has
 *      already captured the original `probe` reference at module top-level
 *      and our wrapper would never be reached. The shim must therefore be
 *      applied by `@upup/pi-app`'s entry, *before* the first dynamic
 *      `import('@earendil-works/pi-coding-agent')` triggers Pi's loader.
 *      See `@upup/pi-app/src/entry.ts#ensureUpupAgentDir` for the call site.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface ProbeFn {
  (
    file: string,
    fs: unknown,
    callback: (err: Error | null, mtime?: Date, precision?: 'ms' | 's') => void,
  ): void;
  [SHIM_MARK]?: true;
}

interface MtimePrecisionExports {
  probe: ProbeFn;
  getMtime: (precision: 'ms' | 's') => Date;
}

interface RequireCacheEntry {
  exports: unknown;
}

interface RequireLike {
  (id: string): unknown;
  resolve: (id: string) => string;
  cache: Record<string, RequireCacheEntry>;
}

const SHIM_MARK = Symbol.for('upup.proper-lockfile.bun-shim');

export interface ApplyShimResult {
  applied: boolean;
  reason: string;
  /** Absolute path of the proper-lockfile mtime-precision module that was patched. */
  resolvedPath?: string;
}

/**
 * Idempotent. First call locates the proper-lockfile instance that
 * `pi-llmgates-provider` resolves, then swaps its `mtime-precision.probe`
 * for the per-call-fs wrapper. Subsequent calls detect `SHIM_MARK` on the
 * cached probe and return `{ applied: true, reason: 'already-patched' }`.
 *
 * Accepts an optional `requireFn` for tests; production callers omit it
 * and we derive a CJS require rooted at pi-llmgates-provider's dist entry
 * so `require.resolve('proper-lockfile/lib/mtime-precision')` lands on
 * the same module instance pi-llmgates-provider imports.
 *
 * Returns `{ applied: false, reason: '<x>' }` rather than throwing when
 * proper-lockfile is missing or pi-llmgates-provider is not installed —
 * this keeps `entry.ts` boot resilient to optional packages.
 */
export async function applyProperLockfileBunShim(
  requireFn?: RequireLike,
  options: { agentDir?: string } = {},
): Promise<ApplyShimResult> {
  return doApply(requireFn, options);
}

async function doApply(
  passedRequire: RequireLike | undefined,
  options: { agentDir?: string },
): Promise<ApplyShimResult> {
  let req: RequireLike;
  try {
    req = passedRequire ?? resolveRootedRequire(options.agentDir);
  } catch (error) {
    return { applied: false, reason: `require-unavailable: ${describe(error)}` };
  }

  if (typeof req.resolve !== 'function') {
    return { applied: false, reason: 'require.resolve-not-available' };
  }

  let mtimePath: string;
  try {
    mtimePath = req.resolve('proper-lockfile/lib/mtime-precision');
  } catch (error) {
    return { applied: false, reason: `proper-lockfile-not-installed: ${describe(error)}` };
  }

  // Eager load — populates require.cache so we can mutate the cached
  // `probe` reference. Failures here mean the package is broken or
  // missing, and we want to surface that rather than swallow it.
  try {
    req('proper-lockfile');
  } catch (error) {
    return { applied: false, reason: `proper-lockfile-load-failed: ${describe(error)}` };
  }

  const cache = req.cache;
  if (!cache) {
    return { applied: false, reason: 'require-cache-unavailable' };
  }

  const entry = cache[mtimePath];
  if (!entry || !entry.exports || typeof (entry.exports as { probe?: unknown }).probe !== 'function') {
    return { applied: false, reason: 'mtime-precision-not-in-cache' };
  }

  const exports = entry.exports as MtimePrecisionExports & { probe: ProbeFn };
  if (exports.probe?.[SHIM_MARK]) {
    return { applied: true, reason: 'already-patched', resolvedPath: mtimePath };
  }

  const originalProbe = exports.probe;
  const wrappedProbe: ProbeFn = function patchedProbe(this: unknown, file, fs, callback) {
    return originalProbe.call(this, file, buildFreshFsShim(fs), callback);
  };
  wrappedProbe[SHIM_MARK] = true;
  exports.probe = wrappedProbe;

  return { applied: true, reason: 'patched', resolvedPath: mtimePath };
}

/**
 * Build a CJS require rooted at pi-llmgates-provider's dist file. This is
 * the location pi-llmgates-provider itself is loaded from under
 * `~/.upup/agent/npm/`, so `require.resolve('proper-lockfile')` from here
 * follows the same module-resolution walk pi-llmgates-provider does and
 * lands on the user-managed copy of proper-lockfile, not Bun's global
 * install cache.
 */
function resolveRootedRequire(agentDirOverride?: string): RequireLike {
  const agentDir =
    agentDirOverride ??
    process.env.UPUP_CODING_AGENT_DIR ??
    process.env.PI_CODING_AGENT_DIR ??
    join(process.env.UPUP_HOME?.trim() || join(process.env.HOME ?? '', '.upup'), 'agent');
  const pkgEntry = join(agentDir, 'npm', 'node_modules', '@llmgates_api', 'pi-llmgates-provider', 'dist', 'index.js');
  if (!existsSync(pkgEntry)) {
    throw new Error(`pi-llmgates-provider entry not found at ${pkgEntry}`);
  }
  // createRequire expects a URL-or-path. We feed it the absolute path so
  // Node-style resolution walks up from pi-llmgates-provider's own location
  // (and finds proper-lockfile as a sibling under npm/node_modules/...).
  return createRequire(pkgEntry) as RequireLike;
}

function buildFreshFsShim(fs: unknown): Record<string, unknown> {
  const source = fs as Record<string, unknown> | undefined;
  if (!source || typeof source !== 'object') {
    return {};
  }
  const shim: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (typeof value === 'function') {
      // Bind to the original `fs` so methods that close over internal
      // helpers (`graceful-fs`'s retry layer) keep working.
      shim[key] = (value as (...args: unknown[]) => unknown).bind(source);
    } else {
      shim[key] = value;
    }
  }
  return shim;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
