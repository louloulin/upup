/**
 * Pi model resolution sub-module.
 *
 * Lives separately from the main `@upup/pi-event-adapter` entry so that
 * consumers that only need the lightweight event helpers do not pull in
 * the full `@earendil-works/pi-ai` model catalog.
 *
 * Catalog lookups go through `@upup/pi-runtime/model-registry`, which reads the
 * Pi catalog. Providers that UpUp contributes to Pi itself (currently the local
 * Ollama server) are served by `@upup/pi-runtime/custom-providers`, so the model
 * object handed to Pi always matches the provider Pi has registered. A model id
 * that neither source knows is reported as unresolved instead of silently
 * resolving to an unrelated catalog entry.
 */

import type { Model } from '@earendil-works/pi-ai';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import {
  canonicalPiProviderId,
  detectPiProvider as detectPiProviderImpl,
  isPiProvider,
  listPiModels,
} from '@upup/pi-runtime/model-registry';
import {
  OLLAMA_PROVIDER_ID,
  createOllamaModel,
  isOllamaModelSpec,
} from '@upup/pi-runtime/custom-providers';

const DEFAULT_MODEL = 'deepseek-v4-flash';

export interface PiModelResolutionDiagnostic {
  readonly requested: string;
  readonly provider: string;
  readonly model: string;
  readonly resolved: boolean;
  readonly reason: 'resolved' | 'custom-provider' | 'unknown-provider' | 'unknown-model';
  /** Model ids the resolved provider does publish, for actionable errors. */
  readonly availableModels: readonly string[];
}

/**
 * Detect the provider prefix from a model id.
 *
 * Re-exported from `@upup/pi-runtime/model-registry` so existing call sites
 * (e.g. legacy callers that imported from this module before the move) keep
 * working. The canonical implementation lives next to the catalog metadata.
 */
export const detectPiProvider = detectPiProviderImpl;

/**
 * Structural view of Pi's `ModelRuntime#getModel`. Avoids pulling the full
 * `@earendil-works/pi-coding-agent` into `@upup/pi-event-adapter`, which only
 * wants the catalog lookup surface. The real `ModelRuntime` is structurally
 * compatible so callers can pass it directly.
 */
export interface ModelRuntimeLike {
  getModel(providerId: string, modelId: string): unknown;
}

export interface ResolvePiModelOptions {
  /** Caller-provided model id (overrides `DEFAULT_MODEL` env). */
  modelName?: string;
  /** Optional override for the default model when nothing is configured. */
  fallback?: string;
  /**
   * Optional Pi `ModelRuntime` whose registered providers (`pi.registerProvider`
   * contributions + `~/.pi/agent/models.json` entries) are queried after the
   * built-in catalog misses. Without this, user-defined provider/model pairs
   * such as `minimax:MiniMax-M3` silently fall back to the Pi default.
   */
  modelRuntime?: ModelRuntimeLike;
}

interface ParsedModelSpec {
  readonly requested: string;
  readonly provider: string;
  readonly model: string;
}

function parseModelSpec(options: ResolvePiModelOptions): ParsedModelSpec {
  const requested =
    options.modelName ?? process.env.DEFAULT_MODEL ?? options.fallback ?? DEFAULT_MODEL;
  const separator = requested.indexOf(':');
  const explicitProvider = separator > 0 ? requested.slice(0, separator) : undefined;
  const model = explicitProvider ? requested.slice(separator + 1) : requested;
  const provider = canonicalPiProviderId(explicitProvider ?? detectPiProvider(model));
  return { requested, provider, model };
}

/**
 * Model ids to try, in order. `openrouter:<vendor>/<model>` specs are also
 * probed without the redundant prefix, matching Pi's own aliasing.
 */
function modelCandidates(model: string): string[] {
  const stripped = model.replace(/^openrouter:/, '');
  return stripped === model ? [model] : [model, stripped];
}

function lookupPiModel(
  provider: string,
  model: string,
  modelRuntime?: ModelRuntimeLike,
): Model<never> | undefined {
  // Ollama is contributed to Pi by an UpUp inline extension rather than by the
  // catalog, so it is resolved from the same module that registers it.
  if (provider === OLLAMA_PROVIDER_ID) {
    // SAFETY: `createOllamaModel` builds a full Pi-shaped Model; the helper's
    // return type is intentionally structural so this module need not import Pi.
    return createOllamaModel(model) as unknown as Model<never>;
  }
  // User configuration wins over the static catalog. The caller's
  // `ModelRuntime` is the merged view Pi actually serves from: the built-in
  // catalog **plus** the on-disk `~/.upup/agent/models.json` overrides and every
  // `pi.registerProvider` contribution. Consulting it first keeps a user's
  // explicit `baseUrl` / context window authoritative; querying the static
  // catalog first silently discarded those overrides, so a configured provider
  // endpoint was replaced by the catalog's default host (observed: the catalog
  // `minimax` host was unreachable while the user's own endpoint answered).
  if (modelRuntime) {
    for (const candidate of modelCandidates(model)) {
      try {
        const fromRuntime = modelRuntime.getModel(provider, candidate);
        if (fromRuntime) return fromRuntime as Model<never>;
      } catch {
        /* ignore malformed runtime; fall through to the static catalog */
      }
    }
  }
  // Fallback: the static catalog. Reached when no runtime is supplied, when the
  // runtime genuinely has no entry, or when only the catalog knows the pair.
  if (isPiProvider(provider)) {
    for (const candidate of modelCandidates(model)) {
      const direct = getBuiltinModel(provider as never, candidate as never) as Model<never> | undefined;
      if (direct) return direct;
    }
  }
  return undefined;
}

/**
 * Resolve a Pi `Model` object from an optional model id.
 *
 * Returns `undefined` when the id is not part of the Pi catalog for its
 * provider, so Pi can apply its own configured default. Use
 * {@link describePiModelResolution} to explain the outcome to a user.
 */
export function resolvePiModel(options: ResolvePiModelOptions = {}): Model<any> | undefined {
  const { provider, model } = parseModelSpec(options);
  return lookupPiModel(provider, model, options.modelRuntime) as Model<any> | undefined;
}

/** Whether a model spec targets a provider UpUp registers into Pi itself. */
export function isPiCustomProviderSpec(modelSpec: string | undefined): boolean {
  return typeof modelSpec === 'string' && isOllamaModelSpec(modelSpec);
}

/** Explain how a model id resolves against the Pi catalog. */
export function describePiModelResolution(
  options: ResolvePiModelOptions = {},
): PiModelResolutionDiagnostic {
  const { requested, provider, model } = parseModelSpec(options);
  if (provider === OLLAMA_PROVIDER_ID) {
    return {
      requested,
      provider,
      model,
      resolved: Boolean(lookupPiModel(provider, model, options.modelRuntime)),
      reason: 'custom-provider',
      availableModels: [],
    };
  }
  if (!isPiProvider(provider)) {
    const resolved = Boolean(lookupPiModel(provider, model, options.modelRuntime));
    return { requested, provider, model, resolved, reason: resolved ? 'resolved' : 'unknown-provider', availableModels: [] };
  }
  const availableModels = listPiModels(provider).map((candidate) => candidate.id);
  const resolved = Boolean(lookupPiModel(provider, model, options.modelRuntime));
  return {
    requested,
    provider,
    model,
    resolved,
    reason: resolved ? 'resolved' : 'unknown-model',
    availableModels,
  };
}
