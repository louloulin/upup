/**
 * Model id validation against the Pi catalog.
 *
 * The model picker lets users either choose from a curated list or type a
 * freeform model id (e.g. `MiniMax-M3`, `kimi-k2.6`). Before persisting that
 * id into `.upup/settings.json`, validate it against the Pi catalog so stale
 * or mistyped ids surface immediately instead of silently falling back to a
 * provider default at request time.
 *
 * Provider ids are canonicalised through `canonicalPiProviderId`, so legacy
 * aliases (`moonshot`, `kimi`, `gemini`, `grok`) work transparently.
 */

import {
  canonicalPiProviderId,
  getPiModelInfo,
  isPiProvider,
  listPiModels,
} from '@upup/pi-runtime/model-registry';
import { OLLAMA_PROVIDER_ID } from '@upup/pi-runtime/custom-providers';

export interface ModelValidationOk {
  readonly ok: true;
  readonly providerId: string;
  readonly modelId: string;
}

export interface ModelValidationError {
  readonly ok: false;
  readonly providerId: string;
  readonly requestedModelId: string;
  readonly reason: 'unknown-provider' | 'unknown-model' | 'empty';
  readonly availableModels: readonly string[];
}

export type ModelValidationResult = ModelValidationOk | ModelValidationError;

const OLLAMA_MODEL_PREFIX = 'ollama:';

function stripProviderPrefix(modelId: string): string {
  const separator = modelId.indexOf(':');
  return separator > 0 ? modelId.slice(separator + 1) : modelId;
}

function splitProviderAndModel(spec: string): { providerId: string; modelId: string } {
  const separator = spec.indexOf(':');
  if (separator > 0) {
    return { providerId: spec.slice(0, separator), modelId: spec.slice(separator + 1) };
  }
  return { providerId: '', modelId: spec };
}

/**
 * Validate a model id for a given provider against the Pi catalog.
 *
 * - Empty model ids return `{ok: false, reason: 'empty'}`.
 * - Unknown provider ids return `{ok: false, reason: 'unknown-provider'}`
 *   with no available-models list (Pi would have rejected the provider too).
 * - Provider is custom-managed (Ollama) — accept any non-empty id since
 *   UpUp registers Ollama models dynamically and cannot enumerate them.
 * - Unknown model id on a known provider returns
 *   `{ok: false, reason: 'unknown-model'}` with the catalog's full model
 *   list so the caller can render an actionable error message.
 */
export function validateModelForProvider(
  providerId: string,
  modelSpec: string,
): ModelValidationResult {
  const trimmed = modelSpec.trim();
  if (!trimmed) {
    return {
      ok: false,
      providerId,
      requestedModelId: modelSpec,
      reason: 'empty',
      availableModels: [],
    };
  }
  const canonical = canonicalPiProviderId(providerId);
  if (canonical === OLLAMA_PROVIDER_ID) {
    return { ok: true, providerId: canonical, modelId: trimmed };
  }
  if (!isPiProvider(canonical)) {
    return {
      ok: false,
      providerId: canonical,
      requestedModelId: trimmed,
      reason: 'unknown-provider',
      availableModels: [],
    };
  }
  // The function accepts either a bare model id ("gpt-5.4") or a fully
  // qualified "provider:model" spec. Only strip the provider prefix when the
  // leading segment matches the providerId we are validating against; model
  // ids containing colons (e.g. "amazon.nova-2-lite-v1:0") must survive
  // untouched, otherwise the catalog lookup fails spuriously.
  const candidate = trimmed.startsWith(`${canonical}:`)
    ? trimmed.slice(canonical.length + 1)
    : trimmed;
  const info = getPiModelInfo(canonical, candidate);
  if (info) {
    return { ok: true, providerId: canonical, modelId: info.id };
  }
  return {
    ok: false,
    providerId: canonical,
    requestedModelId: candidate,
    reason: 'unknown-model',
    availableModels: listPiModels(canonical).map((model) => model.id),
  };
}

/**
 * Validate a `provider:model` spec against the Pi catalog.
 *
 * If the spec does not include an explicit provider prefix, `defaultProviderId`
 * is used. The result mirrors {@link validateModelForProvider} so the caller
 * can render one error shape regardless of which entry point the user took.
 */
export function validateModelSpec(
  modelSpec: string,
  defaultProviderId: string,
): ModelValidationResult {
  const trimmed = modelSpec.trim();
  if (!trimmed) {
    return {
      ok: false,
      providerId: defaultProviderId,
      requestedModelId: modelSpec,
      reason: 'empty',
      availableModels: [],
    };
  }
  // Only treat the first `:` as a provider/model separator when the left
  // side names a real Pi provider. Otherwise (no colon, or model id that
  // happens to contain a colon like `amazon.nova-2-lite-v1:0`) the whole
  // string is a bare model id and the caller-supplied default applies.
  const firstColon = trimmed.indexOf(':');
  const candidateProvider = firstColon > 0 ? trimmed.slice(0, firstColon) : '';
  if (candidateProvider && isPiProvider(canonicalPiProviderId(candidateProvider))) {
    return validateModelForProvider(candidateProvider, trimmed.slice(firstColon + 1));
  }
  return validateModelForProvider(defaultProviderId, trimmed);
}

/**
 * Convenience wrapper that accepts either `modelId` or `provider:modelId` and
 * falls back to a default provider when the spec is bare. Returns `null`
 * when the spec is invalid (caller should surface the `validateModelSpec`
 * result for an actionable error message).
 */
export function coerceModelSpec(
  modelSpec: string | undefined,
  defaultProviderId: string,
): string | null {
  if (!modelSpec) return null;
  const result = validateModelSpec(modelSpec, defaultProviderId);
  return result.ok ? result.modelId : null;
}

export const __testing = {
  OLLAMA_MODEL_PREFIX,
  stripProviderPrefix,
  splitProviderAndModel,
};
