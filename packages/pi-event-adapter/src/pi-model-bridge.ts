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

export interface ResolvePiModelOptions {
  /** Caller-provided model id (overrides `DEFAULT_MODEL` env). */
  modelName?: string;
  /** Optional override for the default model when nothing is configured. */
  fallback?: string;
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

function lookupPiModel(provider: string, model: string): Model<never> | undefined {
  // Ollama is contributed to Pi by an UpUp inline extension rather than by the
  // catalog, so it is resolved from the same module that registers it.
  if (provider === OLLAMA_PROVIDER_ID) {
    return createOllamaModel(model) as unknown as Model<never>;
  }
  if (!isPiProvider(provider)) return undefined;
  const direct = getBuiltinModel(provider as never, model as never) as Model<never> | undefined;
  if (direct) return direct;
  const stripped = model.replace(/^openrouter:/, '');
  if (stripped !== model) {
    return getBuiltinModel(provider as never, stripped as never) as Model<never> | undefined;
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
  return lookupPiModel(provider, model) as Model<any> | undefined;
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
      resolved: Boolean(lookupPiModel(provider, model)),
      reason: 'custom-provider',
      availableModels: [],
    };
  }
  if (!isPiProvider(provider)) {
    return { requested, provider, model, resolved: false, reason: 'unknown-provider', availableModels: [] };
  }
  const availableModels = listPiModels(provider).map((candidate) => candidate.id);
  const resolved = Boolean(lookupPiModel(provider, model));
  return {
    requested,
    provider,
    model,
    resolved,
    reason: resolved ? 'resolved' : 'unknown-model',
    availableModels,
  };
}
