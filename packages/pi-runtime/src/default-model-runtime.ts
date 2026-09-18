/**
 * Default `ModelRuntime` for UpUp.
 *
 * Pi's `ModelRuntime` honours `models.json` from the canonical agent dir
 * (resolved by Pi's `getAgentDir()`). UpUp publishes that path to
 * `~/.upup/agent` via `bootstrap-agent` before any `pi-coding-agent` import
 * resolves, so once this runtime is created it transparently loads the
 * user's custom provider/model configuration.
 *
 * This module exists to make that runtime available everywhere UpUp
 * boots a session, so that `resolvePiModel` and any other ModelRuntime
 * consumer in the factory path picks up custom models instead of
 * silently falling back to the Pi default.
 *
 * The runtime is created lazily and cached at process scope. Creating it
 * triggers `ModelConfig.load` (which reads `models.json`) and a refresh of
 * registered providers, so we do not want to pay that cost on every test
 * or CLI flag that does not actually need model resolution. The cache is
 * keyed on the create-time `refreshOnCreate` choice because tests need
 * to opt out of the network refresh Pi performs by default.
 */
import { ModelRuntime, type CreateModelRuntimeOptions } from '@earendil-works/pi-coding-agent';
import { resolveAgentDir } from '@upup/pi-resource-composition/agent-dir';

export type { CreateModelRuntimeOptions };

/**
 * Lazily construct (and cache) a singleton `ModelRuntime` rooted at the
 * canonical UpUp agent dir. The runtime auto-loads `models.json` from that
 * location; entries defined there become resolvable through `getModel` /
 * `find` so UpUp's `resolvePiModel` stops falling back to defaults for
 * user-configured providers like `minimax:MiniMax-M3`.
 *
 * @param options.forwarded  forwarded to `ModelRuntime.create`. The
 *   default (`{ refreshOnCreate: false }`) keeps UpUp snappy on first
 *   boot — the bundled catalog already covers every UpUp-default
 *   provider, and the on-disk `models.json` is loaded synchronously by
 *   `ModelConfig.load` regardless of the refresh flag.
 */
let cached: { options: CreateModelRuntimeOptions; runtime: ModelRuntime } | undefined;

export async function getUpupModelRuntime(
  options: CreateModelRuntimeOptions = {},
): Promise<ModelRuntime> {
  const normalised: CreateModelRuntimeOptions = {
    refreshOnCreate: false,
    ...options,
  };
  if (cached && cached.options.refreshOnCreate === normalised.refreshOnCreate) {
    return cached.runtime;
  }
  // `resolveAgentDir` returns `{ agentDir, source }`, not a plain string —
  // pulling `.agentDir` out of it avoids a `[object Object]/models.json`
  // path that silently disables `models.json` loading.
  const resolved = resolveAgentDir(process.cwd());
  const runtime = await ModelRuntime.create({
    ...normalised,
    modelsPath: `${resolved.agentDir}/models.json`,
  });
  cached = { options: normalised, runtime };
  return runtime;
}

/** Test-only reset hook. Production code should never need this. */
export function _resetUpupModelRuntimeCache(): void {
  cached = undefined;
}

/** Best-effort sync accessor. Returns undefined if the runtime was never
 *  created in this process. Use `getUpupModelRuntime` from async paths. */
export function tryGetUpupModelRuntime(): ModelRuntime | undefined {
  return cached?.runtime;
}
